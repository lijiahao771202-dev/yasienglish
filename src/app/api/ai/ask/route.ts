import { deepseek } from "@/lib/deepseek";
import {
    chargeReadingCoins,
    insufficientReadingCoinsPayload,
    isReadEconomyContext,
    type ReadingEconomyContext,
} from "@/lib/reading-economy-server";

type AskAnswerMode = "default" | "short" | "detailed";
type AskQuestionComplexity = "simple" | "complex";
type AskResponseProfile = "adaptive_simple" | "adaptive_complex" | "forced_short" | "forced_detailed";

const ASK_SHORT_MAX_TOKENS = 520;
const ASK_DETAILED_MAX_TOKENS = 1200;

function normalizeAskAnswerMode(rawMode: unknown): AskAnswerMode {
    if (rawMode === "short" || rawMode === "detailed") return rawMode;
    return "default";
}

export function detectAskQuestionComplexity(question: string): AskQuestionComplexity {
    const normalized = question.trim();
    const lower = normalized.toLowerCase();
    const punctuationCount = (normalized.match(/[，,。；;、]/g) ?? []).length;

    const hasComplexSignal = (
        /(为什么|原因|区别|对比|详细|深入|全面|系统|完整|逐句|逐词|展开|步骤|推导|多角度|并且|同时|分别|结构分析|语法结构|对照)/u.test(normalized)
        || /(why|reason|difference|compare|detailed|in[- ]depth|step by step|comprehensive|analy[sz]e|grammar structure|break down)/i.test(lower)
    );
    if (hasComplexSignal) return "complex";

    const hasSimpleSignal = (
        /(什么意思|啥意思|怎么翻译|怎么说|这句啥意思|一句话总结|总结一下|大意|主旨|词义|短语|翻译一下|怎么理解|这个词)/u.test(normalized)
        || /(what does .* mean|meaning of|translate|translation|summarize|summary|in one sentence)/i.test(lower)
    );
    if (hasSimpleSignal && normalized.length <= 42 && punctuationCount <= 1) return "simple";

    if (normalized.length <= 24 && punctuationCount === 0) return "simple";
    return "complex";
}

function resolveAskResponseProfile(mode: AskAnswerMode, complexity: AskQuestionComplexity): AskResponseProfile {
    if (mode === "short") return "forced_short";
    if (mode === "detailed") return "forced_detailed";
    return complexity === "simple" ? "adaptive_simple" : "adaptive_complex";
}

function buildAskPrompt(params: {
    text: string;
    question: string;
    selection: string;
    responseProfile: AskResponseProfile;
    answerMode: AskAnswerMode;
    complexity: AskQuestionComplexity;
}) {
    const { text, question, selection, responseProfile, answerMode, complexity } = params;
    const focusContext = selection
        ? `User highlighted this part: "${selection}". Focus this selection first, then explain within paragraph context.`
        : "No explicit selection. Focus on the user's question against the paragraph.";

    const commonInstructions = `
General instructions:
1. Answer in **Simplified Chinese (简体中文)**.
2. Ensure correctness first, then readability.
3. Use Markdown and clear line breaks (avoid giant paragraphs).
4. If the answer is not supported by the paragraph, say so politely.
5. If explaining grammar, clearly label structures (e.g., 主语, 谓语, 定语从句).
6. If explaining vocabulary, mention practical collocation/usage when helpful.
`;

    const shortInstructions = `
Response style (SHORT):
1. MUST use exactly two sections:
   - ## 结论
   - ## 解析
2. 结论: 1-2 sentences, give direct answer first.
3. 解析: bullet list with MAX 2 bullets, each bullet should be one concise sentence.
4. Do NOT add ## 例句 unless user explicitly asks for examples.
5. Avoid repeating the paragraph verbatim.
`;

    const detailedInstructions = `
Response style (DETAILED):
1. Keep high quality structure with:
   - ## 结论
   - ## 解析
2. Use bullet points for key analysis.
3. Add ## 例句 only when it helps comprehension (1-2 examples is enough).
4. Keep concise but sufficiently thorough for complex questions.
`;

    const profileInstructions = responseProfile === "adaptive_simple" || responseProfile === "forced_short"
        ? shortInstructions
        : detailedInstructions;

    return `
You are an expert English tutor and linguist helping Chinese learners.

Context Paragraph:
"""
${text}
"""

${focusContext}

User Question: "${question}"
Answer Mode: "${answerMode}"
Detected Complexity: "${complexity}"
Response Profile: "${responseProfile}"

${commonInstructions}
${profileInstructions}
`;
}

export async function POST(req: Request) {
    try {
        const { text, question, selection, answerMode, economyContext } = await req.json() as {
            text?: string;
            question?: string;
            selection?: string;
            answerMode?: AskAnswerMode;
            economyContext?: ReadingEconomyContext;
        };

        const normalizedText = typeof text === "string" ? text.trim() : "";
        const normalizedQuestion = typeof question === "string" ? question.trim() : "";
        const normalizedSelection = typeof selection === "string" ? selection.trim() : "";
        const normalizedAnswerMode = normalizeAskAnswerMode(answerMode);

        if (!normalizedText || !normalizedQuestion) {
            return new Response(JSON.stringify({ error: "Text and question are required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const complexity = detectAskQuestionComplexity(normalizedQuestion);
        const responseProfile = resolveAskResponseProfile(normalizedAnswerMode, complexity);
        const maxTokens = responseProfile === "adaptive_simple" || responseProfile === "forced_short"
            ? ASK_SHORT_MAX_TOKENS
            : ASK_DETAILED_MAX_TOKENS;

        let readingCoinMutation: {
            balance: number;
            delta: number;
            applied: boolean;
            action: string;
        } | null = null;
        const readContext = isReadEconomyContext(economyContext)
            ? {
                ...economyContext,
                action: economyContext?.action ?? "ask_ai",
            }
            : null;

        if (readContext?.action) {
            const charge = await chargeReadingCoins({
                action: readContext.action,
                dedupeKey: readContext.dedupeKey,
                meta: {
                    articleUrl: readContext.articleUrl ?? null,
                    from: "api/ai/ask",
                    answerMode: normalizedAnswerMode,
                    responseProfile,
                },
            });
            if (!charge.ok && charge.insufficient) {
                return new Response(
                    JSON.stringify(
                        insufficientReadingCoinsPayload(readContext.action, charge.required ?? 2, charge.balance),
                    ),
                    {
                        status: 402,
                        headers: { "Content-Type": "application/json" },
                    },
                );
            }
            readingCoinMutation = {
                balance: charge.balance,
                delta: charge.delta,
                applied: charge.applied,
                action: charge.action,
            };
        }

        const prompt = buildAskPrompt({
            text: normalizedText,
            question: normalizedQuestion,
            selection: normalizedSelection,
            responseProfile,
            answerMode: normalizedAnswerMode,
            complexity,
        });

        const stream = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
            temperature: 0.4,
            max_tokens: maxTokens,
            stream: true, // Enable streaming
        });

        // Create a ReadableStream for SSE
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content;
                        if (content) {
                            // SSE format: data: <content>\n\n
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                        }
                    }
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                } catch (err) {
                    controller.error(err);
                }
            },
        });

        return new Response(readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                ...(readingCoinMutation
                    ? {
                        "x-reading-coins-balance": String(readingCoinMutation.balance),
                        "x-reading-coins-delta": String(readingCoinMutation.delta),
                        "x-reading-coins-applied": readingCoinMutation.applied ? "1" : "0",
                        "x-reading-coins-action": readingCoinMutation.action,
                    }
                    : {}),
            },
        });
    } catch (error) {
        console.error("Ask AI Error:", error);
        return new Response(JSON.stringify({ error: "Failed to get answer" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
