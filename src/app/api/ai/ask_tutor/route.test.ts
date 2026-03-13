import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletionMock } = vi.hoisted(() => ({
    createCompletionMock: vi.fn(),
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

import { POST } from "./route";

function createCompletion(content: string) {
    return {
        choices: [
            {
                message: {
                    content,
                },
            },
        ],
    };
}

function createBrokenStreamCompletion(chunks: string[]) {
    async function* iterator() {
        for (const chunk of chunks) {
            yield {
                choices: [
                    {
                        delta: {
                            content: chunk,
                        },
                    },
                ],
            };
        }

        throw new Error("stream interrupted");
    }

    return iterator();
}

function buildRequest(
    overrides: Partial<{
        query: string;
        questionType: string;
        action: string;
        uiSurface: string;
        intent: string;
        focusSpan: string;
        userAttempt: string;
        improvedVersion: string;
        score: number;
        recentTurns: Array<{ question: string; answer: string }>;
        recentMastery: string[];
        teachingPoint: string;
        stream: boolean;
        revealAnswer: boolean;
    }> = {},
) {
    return {
        json: async () => ({
            query: "为什么这里用 ignite？",
            questionType: "follow_up",
            action: "ask",
            uiSurface: "battle",
            intent: "lexical",
            focusSpan: "ignite",
            userAttempt: "When I won the lottery, love started.",
            improvedVersion: "When I won the lottery, a romantic spark ignited between us.",
            score: 78,
            teachingPoint: "词汇搭配与语气",
            recentTurns: [],
            recentMastery: [],
            stream: false,
            revealAnswer: false,
            drillContext: {
                chinese: "中彩票后我们之间擦出了爱情火花。",
                reference_english: "When I won the lottery, a romantic spark ignited between us.",
                key_vocab: ["ignite", "spark"],
            },
            articleTitle: "Emotion topic",
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("ask_tutor route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns battle responses without cards", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "word_meaning",
                    coach_markdown: "1. **ignite** 在这里更像“点燃、激起”。\n2. 你前面已经会 spark，这次只补 ignite 的动作感。",
                    answer_revealed: false,
                    teaching_point: "词汇搭配与语气",
                    error_tags: ["word_choice", "collocation"],
                    quality_flags: [],
                }),
            ),
        );

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.cards).toBeUndefined();
        expect(data.coach_markdown).toContain("你前面已经");
    });

    it("does not reveal full answer on ordinary battle follow-ups", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "full_sentence",
                    coach_markdown: "1. 你已经知道 intention 这个词。\n2. 这次只补“搞不懂”这个状态表达，不直接展开整句。",
                    answer_revealed: true,
                    full_answer: "SHOULD_NOT_LEAK",
                    teaching_point: "语序与自然表达",
                    error_tags: ["grammar"],
                    quality_flags: [],
                }),
            ),
        );

        const response = await POST(buildRequest({
            query: "搞不懂怎么翻译呢",
            focusSpan: "搞不懂",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.response_intent).toBe("partial_phrase");
        expect(data.answer_revealed).toBe(false);
        expect(data.full_answer).toBeUndefined();
    });

    it("reveals full answer only when unlock is explicitly requested", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "unlock_answer",
                    coach_markdown: "**这里先这样说：** `When I won the lottery, a romantic spark ignited between us.`",
                    answer_revealed: true,
                    full_answer: "When I won the lottery, a romantic spark ignited between us.",
                    answer_reason_cn: "这里直接用 spark ignited between us 会更自然。",
                    teaching_point: "语序与自然表达",
                    error_tags: ["word_order"],
                    quality_flags: [],
                }),
            ),
        );

        const response = await POST(buildRequest({ questionType: "unlock_answer", revealAnswer: true }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.answer_revealed).toBe(true);
        expect(data.full_answer).toBe("When I won the lottery, a romantic spark ignited between us.");
    });

    it("repairs collapsed english inside markdown", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "collocation",
                    coach_markdown: "1. **break** 更自然，比如 `coffeebreak`。\n2. 在这个语境里，`anintensecompetitionbreak` 也会被修开。",
                    answer_revealed: false,
                    teaching_point: "搭配辨析",
                    error_tags: ["collocation"],
                    quality_flags: [],
                }),
            ),
        );

        const response = await POST(buildRequest({
            query: "间隙怎么搭配更自然",
            focusSpan: "间隙",
        }));
        const data = await response.json();

        expect(data.coach_markdown).toContain("coffee break");
        expect(data.coach_markdown).toContain("an intense competition break");
        expect(data.cards).toBeUndefined();
    });

    it("uses the battle prompt without gradual hint wording or cards schema", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "word_meaning",
                    coach_markdown: "1. **spare key** 就是备用钥匙。",
                    answer_revealed: false,
                    teaching_point: "词汇搭配与语气",
                    error_tags: ["word_choice"],
                    quality_flags: [],
                }),
            ),
        );

        await POST(buildRequest({
            query: "备用钥匙什么意思",
            focusSpan: "备用钥匙",
        }));

        const prompt = createCompletionMock.mock.calls[0]?.[0]?.messages?.[1]?.content ?? "";
        expect(prompt).not.toContain("渐进引导");
        expect(prompt).not.toContain("\"cards\"");
        expect(prompt).toContain("Known knowledge to connect from");
    });

    it("recovers with a final payload when battle stream is interrupted", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createBrokenStreamCompletion([
                '{"coach_markdown":"1. **先别逐词翻。**\\n2. 这次只补当前这个词块',
            ]),
        );

        const response = await POST(buildRequest({ stream: true }));
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain("event: final");
        expect(body).not.toContain("event: error");
    });
});
