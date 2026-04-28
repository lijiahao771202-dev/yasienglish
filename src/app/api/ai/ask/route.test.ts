import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    createCompletionMock,
    chargeReadingCoinsMock,
    insufficientReadingCoinsPayloadMock,
    isReadEconomyContextMock,
} = vi.hoisted(() => ({
    createCompletionMock: vi.fn(),
    chargeReadingCoinsMock: vi.fn(),
    insufficientReadingCoinsPayloadMock: vi.fn(),
    isReadEconomyContextMock: vi.fn(),
}));

vi.mock("@/lib/deepseek", () => ({
    deepseek: {
        chat: {
            completions: {
                create: createCompletionMock,
            },
        },
    },
}));

vi.mock("@/lib/reading-economy-server", () => ({
    chargeReadingCoins: chargeReadingCoinsMock,
    insufficientReadingCoinsPayload: insufficientReadingCoinsPayloadMock,
    isReadEconomyContext: isReadEconomyContextMock,
}));

import { POST } from "./route";

function createStreamCompletion(chunks: Array<string | { content?: string; reasoning_content?: string; finish_reason?: string }>) {
    async function* iterator() {
        for (const chunk of chunks) {
            const delta = typeof chunk === "string" ? { content: chunk } : chunk;
            yield {
                choices: [
                    {
                        delta,
                        finish_reason: typeof chunk === "string" ? undefined : chunk.finish_reason,
                    },
                ],
            };
        }
    }

    return iterator();
}

function buildRequest(overrides: Record<string, unknown> = {}) {
    return {
        json: async () => ({
            text: "That piece of paper was the main signal to employers.",
            question: "这个词什么意思？",
            answerMode: "default",
            selection: "main signal",
            economyContext: {
                scene: "read",
                action: "ask_ai",
                articleUrl: "https://example.com/read",
            },
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("ai ask route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        chargeReadingCoinsMock.mockReset();
        insufficientReadingCoinsPayloadMock.mockReset();
        isReadEconomyContextMock.mockReset();

        chargeReadingCoinsMock.mockResolvedValue({
            ok: true,
            insufficient: false,
            balance: 38,
            delta: -2,
            applied: true,
            action: "ask_ai",
        });

        insufficientReadingCoinsPayloadMock.mockImplementation((action: string, required: number, balance: number) => ({
            errorCode: "INSUFFICIENT_READING_COINS",
            action,
            required,
            balance,
        }));

        isReadEconomyContextMock.mockImplementation(
            (context: { scene?: string; action?: string } | null | undefined) =>
                context?.scene === "read" && Boolean(context?.action),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("uses short profile when answerMode is short", async () => {
        createCompletionMock.mockResolvedValueOnce(createStreamCompletion(["短答"]));

        const response = await POST(buildRequest({ answerMode: "short" }));
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain("data:");
        expect(body).toContain("[DONE]");

        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.max_tokens).toBe(1600);
        expect(completionParams.messages[0].content).toContain('Response Profile: "forced_short"');
        expect(completionParams.messages[0].content).toContain("MAX 2 bullets");
    });

    it("uses detailed profile when answerMode is detailed", async () => {
        createCompletionMock.mockResolvedValueOnce(createStreamCompletion(["长答"]));

        const response = await POST(buildRequest({ answerMode: "detailed" }));
        await response.text();

        expect(response.status).toBe(200);
        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.max_tokens).toBe(3600);
        expect(completionParams.messages[0].content).toContain('Response Profile: "forced_detailed"');
        expect(completionParams.messages[0].content).toContain("Response style (DETAILED)");
        expect(completionParams.messages[0].content).toContain("side panel");
    });

    it("routes default mode to adaptive simple for simple questions", async () => {
        createCompletionMock.mockResolvedValueOnce(createStreamCompletion(["简洁回答"]));

        const response = await POST(buildRequest({
            answerMode: "default",
            question: "这句啥意思？",
        }));
        await response.text();

        expect(response.status).toBe(200);
        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.max_tokens).toBe(1600);
        expect(completionParams.messages[0].content).toContain('Response Profile: "adaptive_simple"');
    });

    it("routes default mode to adaptive complex for complex questions", async () => {
        createCompletionMock.mockResolvedValueOnce(createStreamCompletion(["复杂回答"]));

        const response = await POST(buildRequest({
            answerMode: "default",
            question: "请详细对比这句和上一句的语法结构，并解释原因。",
        }));
        await response.text();

        expect(response.status).toBe(200);
        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.max_tokens).toBe(3600);
        expect(completionParams.messages[0].content).toContain('Response Profile: "adaptive_complex"');
    });

    it("streams model reasoning content as a separate SSE field when available", async () => {
        createCompletionMock.mockResolvedValueOnce(createStreamCompletion([
            { reasoning_content: "先找主干。" },
            { content: "正式解释。" },
        ]));

        const response = await POST(buildRequest({ answerMode: "detailed" }));
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain(JSON.stringify({ reasoningContent: "先找主干。" }));
        expect(body).toContain(JSON.stringify({ content: "正式解释。" }));
    });

    it("continues the answer when the first stream stops because of token length", async () => {
        createCompletionMock
            .mockResolvedValueOnce(createStreamCompletion([
                { content: "中文解释：它说明通过提高开车进入繁忙区域的", finish_reason: "length" },
            ]))
            .mockResolvedValueOnce(createStreamCompletion([
                { content: "成本，可以减少开车人数并改善拥堵。", finish_reason: "stop" },
            ]));

        const response = await POST(buildRequest({ answerMode: "detailed" }));
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(createCompletionMock).toHaveBeenCalledTimes(2);
        expect(createCompletionMock.mock.calls[1][0].messages.at(-1)?.content).toContain("继续刚才被截断的回答");
        expect(body).toContain(JSON.stringify({ content: "中文解释：它说明通过提高开车进入繁忙区域的" }));
        expect(body).toContain(JSON.stringify({ content: "成本，可以减少开车人数并改善拥堵。" }));
        expect(body).toContain("[DONE]");
    });

    it("continues sentence teaching answers that end mid-sentence even without a length finish reason", async () => {
        createCompletionMock
            .mockResolvedValueOnce(createStreamCompletion([
                { content: "直译：这个想法很简单：如果开车成本更高，更少的人会选择开车。中文解释：这句话是在说明拥堵收费的核心逻辑：通过提高进入繁忙区域的", finish_reason: "stop" },
            ]))
            .mockResolvedValueOnce(createStreamCompletion([
                { content: "开车成本，减少车辆进入，从而改善交通拥堵。", finish_reason: "stop" },
            ]));

        const response = await POST(buildRequest({
            answerMode: "default",
            question: "请翻译这句话，并解析它的核心语法结构与词汇搭配。",
            selection: "The idea is simple: if driving costs more, fewer people will choose to drive.",
        }));
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(createCompletionMock).toHaveBeenCalledTimes(2);
        expect(body).toContain(JSON.stringify({ content: "开车成本，减少车辆进入，从而改善交通拥堵。" }));
    });

    it("uses sentence teaching instructions when the user asks to break down a full sentence", async () => {
        createCompletionMock.mockResolvedValueOnce(createStreamCompletion(["拆句讲解"]));

        const response = await POST(buildRequest({
            answerMode: "detailed",
            question: "请翻译这句话，并解析它的核心语法结构与词汇搭配。",
            selection: "That piece of paper was the main signal to employers.",
        }));
        await response.text();

        expect(response.status).toBe(200);
        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.messages[0].content).toContain('Teaching Goal: "sentence_coach"');
        expect(completionParams.messages[0].content).toContain("## 直译");
        expect(completionParams.messages[0].content).toContain("## 中文解释");
        expect(completionParams.messages[0].content).toContain("## 句子主干");
        expect(completionParams.messages[0].content).toContain("## 结构拆解");
        expect(completionParams.messages[0].content).toContain("## 词汇与搭配");
        expect(completionParams.messages[0].content).not.toContain("## 写作迁移");
        expect(completionParams.messages[0].content).toContain("Do not extend the explanation into study advice, exam tips, or life lessons unless the user explicitly asks.");
        expect(completionParams.messages[0].content).toContain("for each key chunk, include its local Chinese meaning in context");
        expect(completionParams.messages[0].content).toContain("focus on the top 1-2 highest-value words or collocations in THIS sentence by default");
        expect(completionParams.messages[0].content).toContain("In 结构拆解, do not use a table");
        expect(completionParams.messages[0].content).toContain("Use numbered mini blocks");
        expect(completionParams.messages[0].content).toContain("Each mini block should follow this exact shape");
        expect(completionParams.messages[0].content).toContain("语法功能");
        expect(completionParams.messages[0].content).toContain("语境意思");
        expect(completionParams.messages[0].content).toContain("Visual emphasis policy");
        expect(completionParams.messages[0].content).toContain("Use **bold** for section-local titles");
        expect(completionParams.messages[0].content).toContain("Use <mark>...</mark> for true teaching takeaways");
        expect(completionParams.messages[0].content).toContain("Use inline code with backticks for English phrases");
        expect(completionParams.messages[0].content).toContain("fixed collocations, grammar formulas, inserted clauses");
        expect(completionParams.messages[0].content).toContain("2-4 well-chosen marks");
        expect(completionParams.messages[0].content).toContain("Do not use <mark> in section headings, numbered mini-block titles");
        expect(completionParams.messages[0].content).toContain("If it is only a phrase/example/formula, prefer inline code");
        expect(completionParams.messages[0].content).toContain("Choose marks by teaching value");
        expect(completionParams.messages[0].content).toContain("cause-effect logic, contrast, definitions");
        expect(completionParams.messages[0].content).toContain("mark the core logic or conclusion in Chinese");
        expect(completionParams.messages[0].content).toContain("highest-value takeaway");
        expect(completionParams.messages[0].content).toContain("When showing English copied from the selected sentence, keep the exact surface form");
        expect(completionParams.messages[0].content).toContain("Do not mark or bold Chinese labels");
        expect(completionParams.messages[0].content).toContain("include the full clause when a connector opens a short important clause");
        expect(completionParams.messages[0].content).toContain("include determiners, possessives, modifiers, and the head noun");
        expect(completionParams.messages[0].content).toContain("Visual rendering capabilities");
        expect(completionParams.messages[0].content).toContain("Do not use tables as the default way to break down a sentence");
        expect(completionParams.messages[0].content).toContain("Do not output mindmap, Mermaid, flowchart, graph, or diagram fences");
        expect(completionParams.messages[0].content).toContain("Optional final summary");
        expect(completionParams.messages[0].content).toContain("Use a compact Markdown table for the summary only when it genuinely improves scanning");
        expect(completionParams.messages[0].content).toContain("Do not add ## 总结 by default");
        expect(completionParams.messages[0].content).not.toContain("总结脑图");
        expect(completionParams.messages[0].content).not.toContain("fenced mindmap block");
    });

    it("injects retrieved learner vocab memory into the ask prompt when available", async () => {
        createCompletionMock.mockResolvedValueOnce(createStreamCompletion(["带入生词本上下文"]));

        const response = await POST(buildRequest({
            answerMode: "detailed",
            question: "这里的 solidify 怎么理解？",
            selection: "solidifies new memories",
            retrievedVocab: [
                {
                    word: "solidify",
                    translation: "巩固；使稳固",
                    definition: "to make stronger",
                    example: "Sleep helps solidify what you learned today.",
                    sourceSentence: "The brain solidifies new memories during sleep.",
                    phonetic: "/səˈlɪdɪfaɪ/",
                    meaningHints: ["v. 巩固 / 使稳固"],
                    highlightedMeanings: ["巩固"],
                    morphologyNotes: ["常与 memory、habit、plan 搭配"],
                    score: 0.91,
                },
            ],
        }));
        await response.text();

        expect(response.status).toBe(200);
        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.messages[0].content).toContain("Learner Personal Vocab Memory");
        expect(completionParams.messages[0].content).toContain("Use this memory only when it is directly relevant");
        expect(completionParams.messages[0].content).toContain("solidify");
        expect(completionParams.messages[0].content).toContain("巩固；使稳固");
        expect(completionParams.messages[0].content).toContain("Sleep helps solidify what you learned today.");
        expect(completionParams.messages[0].content).toContain("常与 memory、habit、plan 搭配");
    });

    it("returns 400 when text or question is empty", async () => {
        const response = await POST(buildRequest({ text: "   ", question: "" }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Text and question are required");
        expect(createCompletionMock).not.toHaveBeenCalled();
    });

    it("returns a retryable 429 payload when the AI provider is concurrency limited", async () => {
        createCompletionMock.mockRejectedValueOnce(Object.assign(
            new Error("429 Too many requests: UserConcurrentRequests"),
            {
                status: 429,
                headers: new Headers({ "retry-after": "2" }),
            },
        ));

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("2");
        expect(data).toEqual({
            errorCode: "AI_PROVIDER_RATE_LIMIT",
            error: "当前 AI 模型正在处理上一个请求，请稍等几秒再试。",
            retryable: true,
        });
    });
});
