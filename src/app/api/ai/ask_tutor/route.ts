import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

interface TutorTurn {
    question?: string;
    answer?: string;
}

type TutorQuestionType = "pattern" | "word_choice" | "example" | "unlock_answer" | "follow_up";

interface TutorResponsePayload {
    coach_cn: string;
    pattern_en: string[];
    contrast: string;
    next_task: string;
    answer_revealed: boolean;
    full_answer?: string;
    answer_reason_cn?: string;
    teaching_point: string;
}

interface StreamChunk {
    choices?: Array<{
        delta?: {
            content?: string | null;
        };
    }>;
}

function clampHintLevel(value: unknown): number {
    if (typeof value !== "number" || Number.isNaN(value)) return 1;
    return Math.max(1, Math.min(4, Math.floor(value)));
}

function safeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeTurns(value: unknown): TutorTurn[] {
    if (!Array.isArray(value)) return [];
    return value
        .slice(-6)
        .map((item) => ({
            question: safeString((item as TutorTurn)?.question),
            answer: safeString((item as TutorTurn)?.answer),
        }))
        .filter((item) => item.question || item.answer);
}

function parseJsonFromModel(content: string): Partial<TutorResponsePayload> | null {
    const trimmed = content.trim();
    const candidates: string[] = [];

    candidates.push(trimmed);

    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        candidates.push(fencedMatch[1].trim());
    }

    const jsonBlockMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonBlockMatch?.[0]) {
        candidates.push(jsonBlockMatch[0].trim());
    }

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object") {
                return parsed as Partial<TutorResponsePayload>;
            }
        } catch {
            continue;
        }
    }

    return null;
}

function extractCoachCnPartial(content: string): string {
    const keyMatch = content.match(/"coach_cn"\s*:\s*"/i);
    if (!keyMatch || keyMatch.index === undefined) {
        return "";
    }

    let index = keyMatch.index + keyMatch[0].length;
    let value = "";

    while (index < content.length) {
        const character = content[index];

        if (character === "\\") {
            const nextCharacter = content[index + 1];
            if (!nextCharacter) break;
            if (nextCharacter === "n") value += "\n";
            else value += nextCharacter;
            index += 2;
            continue;
        }

        if (character === '"') break;

        value += character;
        index += 1;
    }

    return value.trim();
}

function buildFallbackPayload(teachingPoint: string): TutorResponsePayload {
    return {
        coach_cn: "你已经抓住了核心意思。先保留**主干结构**，再只修 1-2 个最关键的**表达点**。",
        pattern_en: ["When ..., ...", "It was only after ... that ..."],
        contrast: "中式常逐词直译，地道表达更强调主干先行与信息重心。",
        next_task: "请按一个模板重写一句，只改一个关键点再发我。",
        answer_revealed: false,
        teaching_point: teachingPoint,
    };
}

function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function autoMarkCoachText(text: string, patterns: string[]): string {
    if (!text) return text;
    if (text.includes("**")) return text;

    const chinesePriority = [
        "主干结构",
        "时间从句",
        "条件句",
        "词汇搭配",
        "语序",
        "时态",
        "介词",
        "表达重心",
        "自然表达",
    ];

    const englishTerms = patterns
        .flatMap((pattern) => pattern.match(/[A-Za-z][A-Za-z'-]{2,}/g) || [])
        .map((term) => term.trim())
        .filter(Boolean);

    const candidates = [...chinesePriority, ...englishTerms];
    let marked = text;
    let count = 0;

    for (const term of candidates) {
        if (count >= 3) break;
        const regex = new RegExp(escapeRegExp(term));
        if (regex.test(marked)) {
            marked = marked.replace(regex, `**${term}**`);
            count += 1;
        }
    }

    return marked;
}

function normalizeCollapsedEnglish(text: string): string {
    if (!text) return text;

    let normalized = text;
    const replacements: Array<[RegExp, string]> = [
        [/\bgathercouragetodosomething\b/gi, "gather courage to do something"],
        [/\basksomeoneabout\b/gi, "ask someone about"],
        [/\bspilledthebeans\b/gi, "spill the beans"],
        [/\bearlyrevelation\b/gi, "early revelation"],
        [/\bmessedup\b/gi, "messed up"],
        [/\btechpioneer\b/gi, "tech pioneer"],
        [/\bacademicpioneer\b/gi, "academic pioneer"],
        [/\bconcerthall\b/gi, "concert hall"],
        [/\bticketcounter\b/gi, "ticket counter"],
    ];

    for (const [pattern, replacement] of replacements) {
        normalized = normalized.replace(pattern, replacement);
    }

    normalized = normalized
        .replace(/\b([a-z]{2,})someone([a-z]{2,})\b/gi, "$1 someone $2")
        .replace(/\b([a-z]{2,})something([a-z]{2,})\b/gi, "$1 something $2")
        .replace(/\b([a-z]{2,})tosomeone\b/gi, "$1 to someone")
        .replace(/\b([a-z]{2,})tosomething\b/gi, "$1 to something");

    return normalized;
}

function buildResponsePayload(params: {
    parsed: Partial<TutorResponsePayload> | null;
    normalizedTeachingPoint: string;
    normalizedImprovedVersion: string;
    referenceEnglish: string;
    allowRevealAnswer: boolean;
}): TutorResponsePayload {
    const { parsed, normalizedTeachingPoint, normalizedImprovedVersion, referenceEnglish, allowRevealAnswer } = params;
    const fallback = buildFallbackPayload(normalizedTeachingPoint);

    const responsePayload: TutorResponsePayload = {
        coach_cn: normalizeCollapsedEnglish(safeString(parsed?.coach_cn) || fallback.coach_cn),
        pattern_en: Array.isArray(parsed?.pattern_en)
            ? parsed.pattern_en
                .map((item) => normalizeCollapsedEnglish(safeString(item)))
                .filter(Boolean)
                .slice(0, 2)
            : fallback.pattern_en,
        contrast: normalizeCollapsedEnglish(safeString(parsed?.contrast) || fallback.contrast),
        next_task: normalizeCollapsedEnglish(safeString(parsed?.next_task) || fallback.next_task),
        answer_revealed: allowRevealAnswer,
        teaching_point: safeString(parsed?.teaching_point) || normalizedTeachingPoint,
    };

    responsePayload.coach_cn = autoMarkCoachText(responsePayload.coach_cn, responsePayload.pattern_en);

    if (allowRevealAnswer) {
        responsePayload.full_answer =
            normalizeCollapsedEnglish(safeString(parsed?.full_answer)) ||
            normalizedImprovedVersion ||
            referenceEnglish;
        responsePayload.answer_reason_cn =
            normalizeCollapsedEnglish(safeString(parsed?.answer_reason_cn)) ||
            "先保证主干自然，再把时间/语气信息放在英语更常见的位置，这样更地道也更稳定。";
    }

    return responsePayload;
}

function sseChunk(event: string, payload: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export const runtime = "edge";

export async function POST(req: NextRequest) {
    try {
        const {
            query,
            drillContext,
            articleTitle,
            hintLevel,
            questionType,
            userAttempt,
            userTranslation,
            improvedVersion,
            score,
            recentTurns,
            conversation,
            teachingPoint,
            revealAnswer,
            stream,
        } = await req.json();

        if (!query || !drillContext) {
            return NextResponse.json(
                { error: "Query and drill context are required" },
                { status: 400 }
            );
        }

        const normalizedQuestion = safeString(query);
        const normalizedAttempt = safeString(userAttempt) || safeString(userTranslation);
        const normalizedImprovedVersion = safeString(improvedVersion);
        const normalizedTeachingPoint = safeString(teachingPoint) || "语序与自然表达";
        const normalizedHintLevel = clampHintLevel(hintLevel);
        const normalizedQuestionType: TutorQuestionType = (
            safeString(questionType) || "follow_up"
        ) as TutorQuestionType;
        const turns = normalizeTurns(recentTurns ?? conversation);
        const allowRevealAnswer =
            normalizedQuestionType === "unlock_answer" ||
            revealAnswer === true ||
            normalizedHintLevel >= 3;
        const isStreaming = stream === true;

        const safeConversation = turns.length > 0
            ? turns
                .slice(-4)
                .map((item, idx) => `Q${idx + 1}: ${item.question || ""}\nA${idx + 1}: ${item.answer || ""}`)
                .join("\n")
            : "N/A";

        const prompt = `
You are an IELTS translation tutor for Chinese native speakers.
Teaching style must be: progressive guidance + Chinese explanation + gentle correction.

Context:
- Article topic: "${safeString(articleTitle)}"
- Chinese sentence: "${safeString(drillContext.chinese)}"
- Golden reference: "${safeString(drillContext.reference_english)}"
- User attempt: "${normalizedAttempt}"
- Improved version: "${normalizedImprovedVersion}"
- Score: ${typeof score === "number" ? score : "N/A"}
- Teaching point: "${normalizedTeachingPoint}"
- Hint level: ${normalizedHintLevel}
- Question type: "${normalizedQuestionType}"
- Allow full answer now: ${allowRevealAnswer ? "YES" : "NO"}
- Recent turns:
${safeConversation}
- User question: "${normalizedQuestion}"

Output STRICT JSON ONLY with this exact schema:
{
  "coach_cn": "中文教学讲解，不超过3句，先肯定后纠错，最多指出1-2个关键问题",
  "pattern_en": ["英文模板1","英文模板2(可选)"],
  "contrast": "中式表达 vs 地道表达（聚焦搭配/语序）",
  "next_task": "让用户马上做一个迁移练习",
  "answer_revealed": false,
  "full_answer": "仅当允许公开答案时提供",
  "answer_reason_cn": "仅当公开答案时提供，解释为什么这样说",
  "teaching_point": "和本题一致的教学点"
}

Rules:
1) If Allow full answer now is NO, set answer_revealed to false and DO NOT provide full_answer.
2) If Allow full answer now is YES, you may provide full_answer + answer_reason_cn.
3) pattern_en must contain 1-2 short reusable patterns.
4) Keep concise and practical for immediate reuse.
5) In coach_cn, automatically mark 2-3 key learning points using markdown bold: **key point**.
6) Markdown is fully allowed in coach_cn/contrast/next_task: headings, blockquotes, lists, inline code, code fences, tables.
7) Use 0-2 relevant emojis when helpful (e.g., ✨🧠📌), avoid overuse.
8) Answer the user's current question directly in the FIRST sentence; avoid generic opening.
9) Must anchor explanation to this exact drill: reference at least one phrase from Chinese sentence or user attempt.
10) If Recent turns is not N/A, connect to prior turn briefly so the user feels continuity.
11) If user asks "怎么翻译/英文怎么说", first sentence MUST give one direct translation in backticks, then explain.
12) English phrases must use normal spaces. Never output collapsed tokens like "asksomeoneabout" or "gathercouragetodosomething".
        `;

        if (!isStreaming) {
            const completion = await deepseek.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a structured IELTS tutor. Output strict JSON only." },
                    { role: "user", content: prompt }
                ],
                model: "deepseek-chat",
                temperature: 0.5,
            });

            const content = safeString(completion.choices[0].message.content);
            const parsed = parseJsonFromModel(content);
            const responsePayload = buildResponsePayload({
                parsed,
                normalizedTeachingPoint,
                normalizedImprovedVersion,
                referenceEnglish: safeString(drillContext.reference_english),
                allowRevealAnswer,
            });

            return NextResponse.json(responsePayload);
        }

        const completionStream = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: "You are a structured IELTS tutor. Output strict JSON only." },
                { role: "user", content: prompt }
            ],
            model: "deepseek-chat",
            temperature: 0.5,
            stream: true,
        }) as unknown as AsyncIterable<StreamChunk>;

        const encoder = new TextEncoder();
        const streamResponse = new ReadableStream({
            async start(controller) {
                let fullContent = "";
                let lastPartialCoach = "";

                try {
                    for await (const chunk of completionStream) {
                        const delta = safeString(chunk.choices?.[0]?.delta?.content ?? "");
                        if (!delta) continue;

                        fullContent += delta;
                        const partialCoach = extractCoachCnPartial(fullContent);
                        if (partialCoach && partialCoach !== lastPartialCoach) {
                            lastPartialCoach = partialCoach;
                            controller.enqueue(encoder.encode(sseChunk("chunk", { coach_cn: partialCoach })));
                        }
                    }

                    const parsed = parseJsonFromModel(fullContent);
                    const responsePayload = buildResponsePayload({
                        parsed,
                        normalizedTeachingPoint,
                        normalizedImprovedVersion,
                        referenceEnglish: safeString(drillContext.reference_english),
                        allowRevealAnswer,
                    });

                    if (!parsed && lastPartialCoach) {
                        responsePayload.coach_cn = autoMarkCoachText(lastPartialCoach, responsePayload.pattern_en);
                    }

                    controller.enqueue(encoder.encode(sseChunk("final", responsePayload)));
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                } catch (error) {
                    console.error("Ask Tutor Stream Error:", error);
                    controller.enqueue(encoder.encode(sseChunk("error", { error: "Tutor stream failed" })));
                    controller.close();
                }
            },
        });

        return new Response(streamResponse, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });

    } catch (error) {
        console.error("Ask Tutor Error:", error);
        return NextResponse.json(
            { error: "Failed to get help" },
            { status: 500 }
        );
    }
}
