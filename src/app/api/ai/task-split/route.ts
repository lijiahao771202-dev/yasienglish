import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import {
    inferSmartPlanExamTrack,
    normalizeSmartPlanExamTrack,
    normalizeSmartPlanTaskType,
    type SmartPlanExamTrack,
    type SmartPlanTaskType,
} from "@/lib/db";

type SmartPlanTaskDraft = {
    type: SmartPlanTaskType;
    target: number;
    text: string;
    exam_track?: SmartPlanExamTrack;
};

function sanitizeTasks(
    input: unknown,
    fallbackExamTrack?: SmartPlanExamTrack
): SmartPlanTaskDraft[] {
    if (!Array.isArray(input)) {
        return [];
    }

    const tasks: SmartPlanTaskDraft[] = [];

    for (const rawTask of input) {
        if (!rawTask || typeof rawTask !== "object") {
            continue;
        }

        const task = rawTask as Record<string, unknown>;
        const type = normalizeSmartPlanTaskType(task.type);
        const target = Number(task.target);
        const text = typeof task.text === "string" ? task.text.trim() : "";

        if (!type || !Number.isFinite(target) || target <= 0 || !text) {
            continue;
        }

        const examTrack = normalizeSmartPlanExamTrack(task.exam_track)
            ?? inferSmartPlanExamTrack(text)
            ?? ((type === "cat" || type === "reading_ai") ? fallbackExamTrack : undefined);

        if (type === "reading_ai" && !examTrack) {
            continue;
        }

        tasks.push({
            type,
            target: Math.max(1, Math.round(target)),
            text,
            exam_track: examTrack,
        });
    }

    return tasks;
}

export async function POST(req: Request) {
    try {
        const { prompt, currentItems, examType, remainingDays } = await req.json() as {
            prompt: string;
            currentItems: unknown[];
            examType?: string;
            remainingDays?: number;
        };

        if (!prompt) {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        const EXAM_LABELS: Record<string, string> = { cet4: '大学英语四级', cet6: '大学英语六级', postgrad: '考研英语', ielts: '雅思IELTS' };
        const examLabel = examType ? (EXAM_LABELS[examType] || examType) : '英语考试';
        const examTrack = normalizeSmartPlanExamTrack(examType);
        const countdownHint = typeof remainingDays === 'number' && remainingDays >= 0
            ? `距离考试还有 ${remainingDays} 天。${remainingDays <= 7 ? '极度紧迫，优先冲刺高频考点！' : remainingDays <= 30 ? '时间偏紧，加大训练量。' : '时间充裕，均衡训练。'}`
            : '';

        const systemPrompt = `You are an expert ${examLabel} adaptive learning core algorithm.
Your job is to read the user's natural language input and output a JSON array of daily learning tasks.
${countdownHint}
The user is preparing for: ${examLabel}.
The available task types are:
- 'rebuild': Sentence reconstruction/fill-in-the-blanks. E.g. good for grammar, spoken sense. Target typically 10 to 50 items.
- 'cat': Reading Flow CAT growth training. Good for stamina and adaptive reading. Target typically 1 to 3 items.
- 'reading_ai': Reading Flow AI-generated articles. Target typically 1 to 5 items.
- 'listening_cabin': Listening Cabin sessions. Target typically 1 to 5 items.
${examTrack ? `For 'cat' and 'reading_ai', set "exam_track" to "${examTrack}".` : `Do not emit 'reading_ai' unless the exam is CET-4, CET-6, or IELTS.`}

Input:
User's natural language request: "${prompt}"
Current tracking items (optional context): ${JSON.stringify(currentItems)}

Instructions:
1. Parse the user's intent. Do they want to learn vocabulary? Focus on listening? Are they tired and want a light load?
2. Distribute the workload into the available task types, tailored to ${examLabel} requirements.
3. Determine a reasonable integer 'target' for each.
4. Provide a 'text' label for the user to read (e.g. "核心重组", "AI阅读", "听力仓", "CAT成长").
   CRITICAL: The 'text' must be EXTREMELY short and punchy, exactly like an app feature title (maximum 6-8 Chinese characters).
   DO NOT use punctuation like commas or periods. DO NOT describe the task in a sentence.
5. Return ONLY a valid JSON object with the property 'tasks' containing an array of objects.
6. Only use these task types: 'rebuild', 'cat', 'reading_ai', 'listening_cabin'. Never output 'reading' or 'listening'.
Do not use markdown blocks outside the JSON.

Expected Output Format:
{
    "tasks": [
        { "type": "listening_cabin", "target": 2, "text": "听力仓" },
        { "type": "reading_ai", "exam_track": "${examTrack ?? "cet4"}", "target": 2, "text": "AI阅读" },
        { "type": "rebuild", "target": 20, "text": "语感找回" }
    ]
}`;

        const completion = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt },
            ],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            temperature: 0.2, // Low temperature for consistent task shaping
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content received");

        const result = JSON.parse(content);
        const tasks = sanitizeTasks(result.tasks, examTrack);

        if (!Array.isArray(result.tasks)) {
           throw new Error("Invalid output format: 'tasks' must be an array");
        }

        if (tasks.length === 0) {
            throw new Error("Invalid output format: no valid tasks after normalization");
        }

        return NextResponse.json({ tasks });
    } catch (error) {
        console.error("Task Split AI Error:", error);
        return NextResponse.json({ error: "Failed to generate plan" }, { status: 500 });
    }
}
