import { deepseek } from "@/lib/deepseek";
import type { AskRetrievedVocabItem } from "@/lib/ask-vocab-memory";
import {
    chargeReadingCoins,
    insufficientReadingCoinsPayload,
    isReadEconomyContext,
    type ReadingEconomyContext,
} from "@/lib/reading-economy-server";
import {
    buildAiProviderRateLimitPayload,
    getAiProviderRetryAfterSeconds,
    isAiProviderRateLimitError,
} from "@/lib/ai-provider-errors";

type AskAnswerMode = "default" | "short" | "detailed";
type AskQuestionComplexity = "simple" | "complex";
type AskResponseProfile = "adaptive_simple" | "adaptive_complex" | "forced_short" | "forced_detailed";
type AskTeachingGoal = "general" | "sentence_coach";

const ASK_SHORT_MAX_TOKENS = 1600;
const ASK_DETAILED_MAX_TOKENS = 3600;

function normalizeInlineText(value: unknown, maxLength: number) {
    return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeRetrievedVocab(raw: unknown): AskRetrievedVocabItem[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    const normalized: AskRetrievedVocabItem[] = [];

    for (const item of raw) {
        const typed = (item ?? {}) as Partial<AskRetrievedVocabItem>;
        const word = normalizeInlineText(typed.word, 64);
        const translation = normalizeInlineText(typed.translation, 140);
        if (!word || !translation) {
            continue;
        }

        normalized.push({
            word,
            translation,
            definition: normalizeInlineText(typed.definition, 160) || undefined,
            example: normalizeInlineText(typed.example, 180) || undefined,
            sourceSentence: normalizeInlineText(typed.sourceSentence, 180) || undefined,
            phonetic: normalizeInlineText(typed.phonetic, 48) || undefined,
            meaningHints: Array.isArray(typed.meaningHints)
                ? typed.meaningHints.map((value) => normalizeInlineText(value, 80)).filter(Boolean).slice(0, 3)
                : [],
            highlightedMeanings: Array.isArray(typed.highlightedMeanings)
                ? typed.highlightedMeanings.map((value) => normalizeInlineText(value, 32)).filter(Boolean).slice(0, 3)
                : [],
            morphologyNotes: Array.isArray(typed.morphologyNotes)
                ? typed.morphologyNotes.map((value) => normalizeInlineText(value, 90)).filter(Boolean).slice(0, 2)
                : [],
            score: typeof typed.score === "number" ? typed.score : 0,
        });
    }

    return normalized.slice(0, 4);
}

function buildRetrievedVocabContext(items: AskRetrievedVocabItem[]) {
    if (items.length === 0) {
        return "";
    }

    const lines = items.map((item, index) => {
        const detailLines = [
            `- word: ${item.word}`,
            `- translation: ${item.translation}`,
            item.phonetic ? `- phonetic: ${item.phonetic}` : "",
            item.meaningHints.length > 0 ? `- meaning hints: ${item.meaningHints.join(" | ")}` : "",
            item.highlightedMeanings.length > 0 ? `- highlighted meanings: ${item.highlightedMeanings.join(" / ")}` : "",
            item.example ? `- example: ${item.example}` : "",
            item.sourceSentence ? `- source sentence: ${item.sourceSentence}` : "",
            item.morphologyNotes.length > 0 ? `- notes: ${item.morphologyNotes.join(" | ")}` : "",
        ].filter(Boolean);
        return `[${index + 1}]\n${detailLines.join("\n")}`;
    });

    return `Learner Personal Vocab Memory:
Use this memory only when it is directly relevant to the highlighted text or the user's question. Do not force unrelated saved words into the answer.
If one of these words clearly matches the current sentence, you may briefly connect your explanation to the learner's saved translation or example.

${lines.join("\n\n")}`;
}

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

function resolveAskTeachingGoal(question: string, selection: string): AskTeachingGoal {
    const normalizedQuestion = question.trim();
    const lowerQuestion = normalizedQuestion.toLowerCase();
    const normalizedSelection = selection.replace(/\s+/g, " ").trim();
    const selectionWordCount = normalizedSelection ? normalizedSelection.split(/\s+/).length : 0;
    const looksLikeSentenceSelection = (
        /[.!?。！？]["'”’)]?$/.test(normalizedSelection)
        || selectionWordCount >= 8
    );

    const hasSentenceCoachSignal = (
        /(这句话|这个句子|整句|句子|翻译这句|翻译这句话|语法结构|词汇搭配|拆解|拆开|揉碎|逐词|逐句|主干)/u.test(normalizedQuestion)
        || /(translate|break down|grammar|structure|collocation|sentence|clause|parse|main clause)/i.test(lowerQuestion)
    );

    const hasMeaningSignal = (
        /(什么意思|啥意思|怎么理解|这句啥意思|这句话啥意思)/u.test(normalizedQuestion)
        || /(what does .* mean|what is the meaning|how should i understand)/i.test(lowerQuestion)
    );

    if (!normalizedSelection || !looksLikeSentenceSelection) {
        return "general";
    }

    if (hasSentenceCoachSignal || hasMeaningSignal) {
        return "sentence_coach";
    }

    return "general";
}

function looksLikeTruncatedTeachingAnswer(content: string) {
    const normalized = content.replace(/\s+/g, " ").trim();
    if (normalized.length < 40) {
        return false;
    }

    if (/[。！？.!?）)\]】"”’]$/.test(normalized)) {
        return false;
    }

    return /[\p{Script=Han}A-Za-z0-9，,、：:]$/u.test(normalized);
}

function buildAskPrompt(params: {
    text: string;
    selection: string;
    responseProfile: AskResponseProfile;
    answerMode: AskAnswerMode;
    complexity: AskQuestionComplexity;
    teachingGoal: AskTeachingGoal;
    retrievedVocab: AskRetrievedVocabItem[];
}) {
    const { text, selection, responseProfile, answerMode, complexity, teachingGoal, retrievedVocab } = params;
    const focusContext = selection
        ? `The user highlighted this string: "${selection}". Focus this selection first, then explain within paragraph context.`
        : "No explicit selection. Focus on the user's question against the paragraph.";
    const retrievedVocabContext = buildRetrievedVocabContext(retrievedVocab);

    const commonInstructions = `
General instructions:
1. Ensure correctness first, then readability. Use both contextual Chinese and English as appropriate.
2. Use Markdown and clear line breaks (avoid giant paragraphs).
4. If the answer is not supported by the paragraph, say so politely.
5. If explaining grammar, clearly label structures (e.g., 主语, 谓语, 定语从句).
6. If explaining vocabulary, mention practical collocation/usage when helpful.

Visual rendering capabilities:
1. Do not use tables as the default way to break down a sentence. Use prose, bullets, and numbered chunks for the main teaching flow.
2. Use tables only for compact side-by-side comparison or an optional final summary. Keep table cells short.
3. Do not output mindmap, Mermaid, flowchart, graph, or diagram fences.
4. Optional final summary: add ## 总结 only when it genuinely helps the learner review the answer. Do not add ## 总结 by default.
5. Use a compact Markdown table for the summary only when it genuinely improves scanning; otherwise summarize with 1-3 bullets.
6. IMPORTANT: if you use a table, output a real Markdown table with one row per line and a blank line before and after it.
7. Section separators: do not put a separator directly under a heading. If you use "---", place it after a section's content and before the next section heading.

Visual emphasis policy:
1. Use **bold** for section-local titles, numbered mini-block titles, structure names, and ordinary emphasis.
2. Use <mark>...</mark> for true teaching takeaways: key logic, definitions, conclusions, contrast, cause-effect links, and points the learner should remember.
3. Use inline code with backticks for English phrases, fixed collocations, grammar formulas, inserted clauses, and example fragments, for example \`is known as\`, \`be used to do\`, or \`(that) some cities are trying\`.
4. Do not use <mark> in section headings, numbered mini-block titles, or the first line of a numbered block; those titles should use **bold** only.
5. Do not use <mark> just because a phrase is English. If it is only a phrase/example/formula, prefer inline code.
6. In sentence teaching mode, every substantive section after 直译 should contain 2-4 well-chosen marks when there is enough content.
7. Choose marks by teaching value, not by position: prioritize cause-effect logic, contrast, definitions, predicate/action meaning, modifier scope, and the sentence's main claim.
8. In 中文解释, mark the core logic or conclusion in Chinese, not only English terms.
9. In 句子主干, mark the actual backbone relationship or the meaning of the predicate/object, not the label words.
10. In 结构拆解 and 词汇与搭配, each important bullet should usually include one mark in its explanation line.
11. When showing English copied from the selected sentence, keep the exact surface form. For example, use \`manually reviewed\` instead of \`manually review\` if the original sentence says "manually reviewed".
12. Prefer meaningful grammar or collocation units over isolated helper words: predicate phrases, objects, participial phrases, prepositional phrases, and high-value collocations.
13. For clauses, include the full clause when a connector opens a short important clause, for example \`(that) some cities are trying\` instead of only \`that\`.
14. For noun phrases, include determiners, possessives, modifiers, and the head noun, for example \`its initial learning phase\` or \`careful guidance and well-defined parameters\`.
15. For verbs, show the exact predicate form from the sentence, not a dictionary form.
16. Do not mark or bold Chinese labels such as 语法功能, 语境意思, 搭配解析, 关联记忆, 主语, 谓语, 宾语.
17. Do not mark a pronoun or generic subject by itself unless it is the actual point being taught.
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
4. Since this answer is shown in a side panel, you may give a fuller explanation when it improves learning value.
5. Keep the answer substantial for complex questions, but still well-structured and easy to scan.
`;

    const sentenceCoachShortInstructions = `
Sentence teaching mode (SHORT):
1. Teach the sentence like a patient teacher, not like a generic chatbot.
2. MUST use exactly these sections in this order:
   - ## 直译
   - ## 中文解释
   - ## 句子主干
   - ## 关键点
3. In 中文解释, restate the sentence in natural, plain Chinese so the learner really understands the idea, not just the literal translation.
4. Do not extend the explanation into study advice, exam tips, or life lessons unless the user explicitly asks.
5. In 句子主干, point out the main backbone in very plain Chinese (for example: 主语 / 谓语 / 宾语 / 表语).
6. In 关键点, use MAX 3 bullets to explain the most important structures or collocations from left to right.
7. For each key chunk, include its local Chinese meaning in context, not only its grammar label.
8. Avoid advanced grammar jargon unless you immediately explain it in learner-friendly Chinese.
9. Do not use a table for sentence breakdown. Use short bullets or numbered mini blocks.
10. In 中文解释, 句子主干, and 关键点, use <mark>...</mark> to mark the learner's highest-value takeaway in the explanation content.
11. Each mini block should follow this exact shape when possible:
   1. **English chunk**
      - 语法功能：...
      - 语境意思：...
`;

    const sentenceCoachDetailedInstructions = `
Sentence teaching mode (DETAILED):
1. Teach the sentence as if you were breaking it apart in class for a Chinese learner.
2. MUST use exactly these sections in this order:
   - ## 直译
   - ## 中文解释
   - ## 句子主干
   - ## 结构拆解
   - ## 词汇与搭配
3. In 中文解释, explain the sentence again in plain, natural Chinese. Make the idea easy to grasp, and if needed clarify the implied logic or tone.
4. Do not extend the explanation into study advice, exam tips, or life lessons unless the user explicitly asks.
5. In 句子主干, identify the real backbone first: 主语 / 谓语 / 宾语 or 表语 / 核心从句.
6. In 结构拆解, quote the exact English chunks from left to right and explain what each chunk is doing in simple Chinese.
7. In 结构拆解, for each key chunk, include its local Chinese meaning in context, not only its grammar label.
8. In 结构拆解, do not use a table. Use numbered mini blocks: each block starts with the exact English chunk, then 1-2 short Chinese lines explaining role and local meaning.
9. In 中文解释, 句子主干, 结构拆解, and 词汇与搭配, use <mark>...</mark> to mark the learner's highest-value takeaway in the explanation content.
10. Each mini block should follow this exact shape. Do not put blank lines inside a mini block:
   1. **English chunk**
      - 语法功能：...
      - 语境意思：...
11. In 词汇与搭配, focus on the top 1-2 highest-value words or collocations in THIS sentence by default. Do not dump a full dictionary entry list.
12. Do not stay abstract. Make the learner feel that the sentence has been broken into understandable pieces.
13. If a final recap would help, you may add ## 总结 after the required sections. Do not add it by default. The summary may be 1-3 bullets or a compact Markdown table if that is easier to scan.
`;

    const defaultProfileInstructions = responseProfile === "adaptive_simple" || responseProfile === "forced_short"
        ? shortInstructions
        : detailedInstructions;
    const sentenceCoachInstructions = responseProfile === "adaptive_simple" || responseProfile === "forced_short"
        ? sentenceCoachShortInstructions
        : sentenceCoachDetailedInstructions;
    const profileInstructions = teachingGoal === "sentence_coach"
        ? sentenceCoachInstructions
        : defaultProfileInstructions;

    return `You are an expert English tutor and linguist helping Chinese learners.

Context Paragraph:
"""
${text}
"""

${focusContext}
${retrievedVocabContext ? `\n\n${retrievedVocabContext}` : ""}

Answer Mode: "${answerMode}"
Detected Complexity: "${complexity}"
Response Profile: "${responseProfile}"
Teaching Goal: "${teachingGoal}"

${commonInstructions}
${profileInstructions}`;
}

export async function POST(req: Request) {
    try {
        const { text, question, messages, selection, answerMode, economyContext, retrievedVocab } = await req.json() as {
            text?: string;
            question?: string;
            messages?: { role: "user" | "assistant", content: string }[];
            selection?: string;
            answerMode?: AskAnswerMode;
            economyContext?: ReadingEconomyContext;
            retrievedVocab?: AskRetrievedVocabItem[];
        };

        const normalizedText = typeof text === "string" ? text.trim() : "";
        const normalizedQuestion = typeof question === "string" ? question.trim() : "";
        const normalizedSelection = typeof selection === "string" ? selection.trim() : "";
        const normalizedAnswerMode = normalizeAskAnswerMode(answerMode);
        const normalizedRetrievedVocab = normalizeRetrievedVocab(retrievedVocab);

        if (!normalizedText || !normalizedQuestion) {
            return new Response(JSON.stringify({ error: "Text and question are required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const complexity = detectAskQuestionComplexity(normalizedQuestion);
        const responseProfile = resolveAskResponseProfile(normalizedAnswerMode, complexity);
        const teachingGoal = resolveAskTeachingGoal(normalizedQuestion, normalizedSelection);
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

        const systemPrompt = buildAskPrompt({
            text: normalizedText,
            selection: normalizedSelection,
            responseProfile,
            answerMode: normalizedAnswerMode,
            complexity,
            teachingGoal,
            retrievedVocab: normalizedRetrievedVocab,
        });

        const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
            { role: "system", content: systemPrompt },
        ];
        
        if (Array.isArray(messages) && messages.length > 0) {
            messages.forEach((msg) => {
                if (msg.role === "user" || msg.role === "assistant") {
                    chatMessages.push({ role: msg.role, content: msg.content });
                }
            });
        } else {
            chatMessages.push({ role: "user", content: normalizedQuestion });
        }

        const stream = await deepseek.chat.completions.create({
            messages: chatMessages,
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
                    let streamedContent = "";
                    let streamedReasoningContent = "";
                    const pumpStreamToClient = async (
                        activeStream: AsyncIterable<{
                            choices?: Array<{
                                delta?: {
                                    content?: unknown;
                                    reasoning_content?: unknown;
                                    reasoningContent?: unknown;
                                    thinking?: unknown;
                                };
                                finish_reason?: unknown;
                            }>;
                        }>,
                        phase: "initial" | "continuation",
                    ) => {
                        let finishReason = "";

                        for await (const chunk of activeStream) {
                            const choice = chunk.choices?.[0];
                            if (typeof choice?.finish_reason === "string") {
                                finishReason = choice.finish_reason;
                            }
                            const delta = choice?.delta;
                            const reasoningContent = typeof delta?.reasoning_content === "string"
                                ? delta.reasoning_content
                                : typeof delta?.reasoningContent === "string"
                                    ? delta.reasoningContent
                                    : typeof delta?.thinking === "string"
                                        ? delta.thinking
                                        : "";
                            const content = typeof delta?.content === "string" ? delta.content : "";
                            if (reasoningContent) {
                                streamedReasoningContent += reasoningContent;
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reasoningContent })}\n\n`));
                            }
                            if (content) {
                                streamedContent += content;
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                            }
                        }

                        console.info("[AskAI] stream complete", {
                            phase,
                            finishReason: finishReason || "unknown",
                            contentLength: streamedContent.length,
                            reasoningLength: streamedReasoningContent.length,
                        });

                        return finishReason;
                    };

                    const finishReason = await pumpStreamToClient(stream, "initial");
                    const visibleAnswer = (streamedContent || streamedReasoningContent).trim();
                    const shouldContinue = finishReason === "length"
                        || (
                            teachingGoal === "sentence_coach"
                            && (!finishReason || finishReason === "stop" || finishReason === "unknown")
                            && looksLikeTruncatedTeachingAnswer(visibleAnswer)
                        );
                    if (shouldContinue) {
                        const visibleSoFar = (streamedContent || streamedReasoningContent).trim();
                        const continuationInstruction = streamedContent.trim()
                            ? "继续刚才被截断的回答，从中断处接着写。不要重复已经写过的内容，只输出续写内容。"
                            : "把刚才已经形成的思路整理成正式回答。不要重复题目，不要解释你在续写，只输出可直接展示给学生的回答。";
                        console.info("[AskAI] requesting continuation", {
                            reason: finishReason === "length" ? "length" : "truncated_sentence_coach",
                            visibleLength: visibleSoFar.length,
                        });

                        const continuationMessages: typeof chatMessages = [
                            ...chatMessages,
                            { role: "assistant", content: visibleSoFar.slice(-5000) },
                            { role: "user", content: continuationInstruction },
                        ];
                        const continuationStream = await deepseek.chat.completions.create({
                            messages: continuationMessages,
                            model: "deepseek-chat",
                            temperature: 0.25,
                            max_tokens: ASK_DETAILED_MAX_TOKENS,
                            stream: true,
                        });
                        await pumpStreamToClient(continuationStream, "continuation");
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
        if (isAiProviderRateLimitError(error)) {
            console.warn("Ask AI provider rate limited:", error);
            const retryAfterSeconds = getAiProviderRetryAfterSeconds(error);
            return new Response(
                JSON.stringify(buildAiProviderRateLimitPayload("当前 AI 模型正在处理上一个请求，请稍等几秒再试。")),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
                    },
                },
            );
        }

        console.error("Ask AI Error:", error);
        return new Response(JSON.stringify({ error: "Failed to get answer" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
