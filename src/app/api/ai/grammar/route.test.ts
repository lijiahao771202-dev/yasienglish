import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    createCompletionMock,
    chargeReadingCoinsMock,
    rewardReadingCoinsMock,
    insufficientReadingCoinsPayloadMock,
    isReadEconomyContextMock,
} = vi.hoisted(() => ({
    createCompletionMock: vi.fn(),
    chargeReadingCoinsMock: vi.fn(),
    rewardReadingCoinsMock: vi.fn(),
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
    rewardReadingCoins: rewardReadingCoinsMock,
    insufficientReadingCoinsPayload: insufficientReadingCoinsPayloadMock,
    isReadEconomyContext: isReadEconomyContextMock,
}));

import { POST } from "./route";

function createCompletionPayload(payload: Record<string, unknown>) {
    return {
        choices: [
            {
                message: {
                    content: JSON.stringify(payload),
                },
            },
        ],
    };
}

function buildRequest(overrides: Record<string, unknown> = {}) {
    return {
        json: async () => ({
            text: "Scientists compared old records and noticed an unusual warming trend.",
            mode: "basic",
            forceRegenerate: true,
            economyContext: {
                scene: "read",
                action: "grammar_basic",
                articleUrl: "https://example.com/article",
            },
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("ai grammar route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        chargeReadingCoinsMock.mockReset();
        rewardReadingCoinsMock.mockReset();
        insufficientReadingCoinsPayloadMock.mockReset();
        isReadEconomyContextMock.mockReset();

        chargeReadingCoinsMock.mockImplementation(async (params: { action: string }) => ({
            ok: true,
            insufficient: false,
            balance: params.action === "grammar_deep" ? 35 : 38,
            delta: params.action === "grammar_deep" ? -3 : -2,
            applied: true,
            action: params.action,
            ledgerId: "ledger_1",
            dedupeKey: "grammar:u1:1",
        }));

        rewardReadingCoinsMock.mockResolvedValue({
            ok: true,
            insufficient: false,
            balance: 40,
            delta: 2,
            applied: true,
            action: "grammar_basic",
            ledgerId: "ledger_refund",
            dedupeKey: "grammar:u1:refund",
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

        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("runs basic analysis through compatibility route", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                tags: ["主语", "谓语"],
                overview: "句子结构清晰，含有并列信息。",
                difficult_sentences: [
                    {
                        sentence: "Scientists compared old records and noticed an unusual warming trend.",
                        translation: "科学家对比了旧记录，并注意到一个异常升温趋势。",
                        highlights: [
                            {
                                substring: "Scientists",
                                type: "主语",
                                explanation: "动作发出者",
                                segment_translation: "科学家",
                            },
                        ],
                    },
                ],
            }),
        );

        const response = await POST(buildRequest({ mode: "basic" }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.mode).toBe("basic");
        expect(data.readingCoins.action).toBe("grammar_basic");
        expect(chargeReadingCoinsMock).toHaveBeenCalledWith(expect.objectContaining({
            action: "grammar_basic",
            meta: expect.objectContaining({
                mode: "basic",
                promptVersion: expect.any(String),
            }),
        }));

        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.model).toBe("deepseek-chat");
        expect(completionParams.messages[0].content).toContain("OUTPUT STRICT JSON ONLY");
        expect(completionParams.messages[0].content).not.toContain("\"sentence_tree\"");
    });

    it("routes deep mode to deep sentence analysis and deep billing", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                sentence: "Scientists compared old records and noticed an unusual warming trend.",
                sentence_tree: {
                    label: "主句",
                    text: "Scientists compared old records and noticed an unusual warming trend.",
                    children: [],
                },
                analysis_results: [
                    {
                        point: "并列谓语",
                        explanation: "compared 和 noticed 形成并列谓语结构。",
                    },
                ],
            }),
        );

        const response = await POST(buildRequest({
            mode: "deep",
            sentence: "Scientists compared old records and noticed an unusual warming trend.",
            economyContext: {
                scene: "read",
                action: "grammar_deep",
                articleUrl: "https://example.com/deep",
            },
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.mode).toBe("deep");
        expect(data.difficult_sentences).toHaveLength(1);
        expect(data.readingCoins.action).toBe("grammar_deep");
        expect(chargeReadingCoinsMock).toHaveBeenCalledWith(expect.objectContaining({
            action: "grammar_deep",
            meta: expect.objectContaining({
                mode: "deep",
                sentenceCount: 1,
            }),
        }));

        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.model).toBe("deepseek-chat");
        expect(completionParams.messages[0].content).toContain("\"sentence_tree\"");
    });

    it("returns 400 when text is missing", async () => {
        const response = await POST(buildRequest({ text: "" }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Text is required");
        expect(createCompletionMock).not.toHaveBeenCalled();
    });
});
