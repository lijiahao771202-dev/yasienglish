import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import type { SmartPlanTaskType } from "@/lib/db";

export async function POST(req: Request) {
    try {
        const { prompt, currentItems, examType, remainingDays } = await req.json() as {
            prompt: string;
            currentItems: any[];
            examType?: string;
            remainingDays?: number;
        };

        if (!prompt) {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        const EXAM_LABELS: Record<string, string> = { cet4: '大学英语四级', cet6: '大学英语六级', postgrad: '考研英语', ielts: '雅思IELTS' };
        const examLabel = examType ? (EXAM_LABELS[examType] || examType) : '英语考试';
        const countdownHint = typeof remainingDays === 'number' && remainingDays >= 0
            ? `距离考试还有 ${remainingDays} 天。${remainingDays <= 7 ? '极度紧迫，优先冲刺高频考点！' : remainingDays <= 30 ? '时间偏紧，加大训练量。' : '时间充裕，均衡训练。'}`
            : '';

        const systemPrompt = `You are an expert ${examLabel} adaptive learning core algorithm.
Your job is to read the user's natural language input and output a JSON array of daily learning tasks.
${countdownHint}
The user is preparing for: ${examLabel}.
The available task types are:
- 'rebuild': Sentence reconstruction/fill-in-the-blanks. E.g. good for grammar, spoken sense. Target typically 10 to 50 items.
- 'cat': Computer adaptive testing (Mock Exam). Good for stamina and overall reading. Target typically 1 to 3 items.
- 'reading': Extensive and intensive reading of articles. Target typically 1 to 5 items.
- 'listening': Intensive listening to syllables and dictation. Target typically 1 to 5 items.

Input:
User's natural language request: "${prompt}"
Current tracking items (optional context): ${JSON.stringify(currentItems)}

Instructions:
1. Parse the user's intent. Do they want to learn vocabulary? Focus on listening? Are they tired and want a light load?
2. Distribute the workload into the available task types, tailored to ${examLabel} requirements.
3. Determine a reasonable integer 'target' for each.
4. Provide a 'text' label for the user to read (e.g. "核心重组", "阅读突破", "听力精听", "模考测试").
   CRITICAL: The 'text' must be EXTREMELY short and punchy, exactly like an app feature title (maximum 6-8 Chinese characters).
   DO NOT use punctuation like commas or periods. DO NOT describe the task in a sentence.
5. Return ONLY a valid JSON object with the property 'tasks' containing an array of objects.
Do not use markdown blocks outside the JSON.

Expected Output Format:
{
    "tasks": [
        { "type": "listening", "target": 2, "text": "魔鬼精听" },
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
        
        if (!Array.isArray(result.tasks)) {
           throw new Error("Invalid output format: 'tasks' must be an array");
        }

        return NextResponse.json({ tasks: result.tasks });
    } catch (error) {
        console.error("Task Split AI Error:", error);
        return NextResponse.json({ error: "Failed to generate plan" }, { status: 500 });
    }
}
