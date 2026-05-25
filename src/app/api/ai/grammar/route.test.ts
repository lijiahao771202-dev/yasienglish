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
    createDeepSeekClientForCurrentUser: async () => ({
        chat: {
            completions: {
                create: createCompletionMock,
            },
        },
    }),
    getCurrentAiExecutionFingerprintForCurrentUser: async () => ({
        provider: "deepseek",
        providerLabel: "DeepSeek",
        model: "deepseek-v4-flash",
        deepseekThinkingMode: "off",
        deepseekReasoningEffort: undefined,
        cacheSignature: "deepseek:deepseek-v4-flash:thinking=off:reasoning=off",
    }),
}));

vi.mock("@/lib/reading-economy-server", () => ({
    chargeReadingCoins: chargeReadingCoinsMock,
    rewardReadingCoins: rewardReadingCoinsMock,
    insufficientReadingCoinsPayload: insufficientReadingCoinsPayloadMock,
    isReadEconomyContext: isReadEconomyContextMock,
}));

import { POST } from "./route";
import { clearServerGrammarCache } from "@/lib/server-grammar-cache";

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
            sentences: ["Scientists compared old records and noticed an unusual warming trend."],
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
            balance: 38,
            delta: -2,
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
        clearServerGrammarCache();
        vi.restoreAllMocks();
    });

    it("runs sentence-batch analysis through compatibility route", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                tags: ["主语", "谓语"],
                overview: "句子结构清晰，含有并列信息。",
                sentences: [
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
        expect(data.results).toHaveLength(1);
        expect(data.results[0].sentence).toBe("Scientists compared old records and noticed an unusual warming trend.");
        expect(data.results[0].data.mode).toBe("basic");
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
        expect(completionParams.messages[0].content).not.toContain("Split the paragraph into individual sentences");
    });

    it("surfaces partial-but-usable basic analysis without server auto-retry", async () => {
        createCompletionMock.mockResolvedValueOnce(createCompletionPayload({
            tags: ["结构"],
            overview: "首句有主干，部分句子仍可继续完善。",
            difficult_sentences: [
                {
                    sentence: "Scientists compared old records and noticed an unusual warming trend.",
                    translation: "科学家对比了旧记录，并注意到一个异常升温趋势。",
                    highlights: [
                        {
                            substring: "Scientists",
                            type: "主语",
                            explanation: "结构判断：Scientists 作主语；句中作用：发出 compared 和 noticed 两个动作。",
                            segment_translation: "科学家",
                        },
                    ],
                },
            ],
        }));

        const response = await POST(buildRequest({ mode: "basic" }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.mode).toBe("basic");
        expect(data.results).toHaveLength(1);
        expect(createCompletionMock).toHaveBeenCalledTimes(1);
        expect(rewardReadingCoinsMock).not.toHaveBeenCalled();
    });

    it("returns a retryable error and refunds coins when grammar quality stays unusable", async () => {
        createCompletionMock
            .mockResolvedValueOnce(createCompletionPayload({}))
            .mockResolvedValueOnce(createCompletionPayload({}))
            .mockResolvedValueOnce(createCompletionPayload({}));

        const response = await POST(buildRequest({ mode: "basic" }));
        const data = await response.json();

        expect(response.status).toBe(502);
        expect(data.errorCode).toBe("LOW_QUALITY_GRAMMAR_ANALYSIS");
        expect(createCompletionMock).toHaveBeenCalledTimes(2);
        expect(rewardReadingCoinsMock).toHaveBeenCalledWith(expect.objectContaining({
            action: "grammar_basic",
            delta: 2,
        }));
    });

    it("retries once with repair hints and returns the repaired grammar result", async () => {
        createCompletionMock
            .mockResolvedValueOnce(createCompletionPayload({}))
            .mockResolvedValueOnce(createCompletionPayload({
                tags: ["主语", "谓语"],
                overview: "修复后已补齐主干和译文。",
                difficult_sentences: [
                    {
                        sentence: "Scientists compared old records and noticed an unusual warming trend.",
                        translation: "科学家对比了旧记录，并注意到一个异常升温趋势。",
                        highlights: [
                            {
                                substring: "Scientists",
                                type: "主语",
                                explanation: "动作发出者。",
                                segment_translation: "科学家",
                            },
                            {
                                substring: "compared old records and noticed an unusual warming trend",
                                type: "谓语",
                                explanation: "核心动作链。",
                                segment_translation: "对比旧记录并注意到异常升温趋势",
                            },
                        ],
                    },
                ],
            }));

        const response = await POST(buildRequest({ mode: "basic" }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(createCompletionMock).toHaveBeenCalledTimes(2);
        expect(createCompletionMock.mock.calls[1]?.[0]?.messages?.[0]?.content).toContain("REPAIR REQUIREMENTS:");
        expect(createCompletionMock.mock.calls[1]?.[0]?.messages?.[0]?.content).toContain("missing_translation");
        expect(createCompletionMock.mock.calls[1]?.[0]?.messages?.[0]?.content).toContain("missing_highlights");
        expect(data.repairAttempted).toBe(true);
        expect(data.results?.[0]?.data?.difficult_sentences?.[0]?.highlights?.length).toBeGreaterThan(0);
        expect(rewardReadingCoinsMock).not.toHaveBeenCalled();
    });

    it("analyzes sentence batches in smaller micro-batches and returns ordered per-sentence results", async () => {
        const sentences = [
            "Scientists compared old records and noticed an unusual warming trend.",
            "Experts say the pattern may reshape future climate planning.",
            "Local officials are already adjusting flood maps.",
        ];

        createCompletionMock
            .mockResolvedValueOnce(createCompletionPayload({
                tags: ["主语", "谓语"],
                overview: "前两句已完成分批分析。",
                sentences: [
                    {
                        sentence: "Scientists compared old records and noticed an unusual warming trend.",
                        translation: "科学家对比了旧记录，并注意到一个异常升温趋势。",
                        highlights: [
                            {
                                substring: "Scientists",
                                type: "主语",
                                explanation: "动作发出者。",
                                segment_translation: "科学家",
                            },
                        ],
                    },
                    {
                        sentence: "Experts say the pattern may reshape future climate planning.",
                        translation: "专家表示，这种模式可能会重塑未来的气候规划。",
                        highlights: [
                            {
                                substring: "Experts",
                                type: "主语",
                                explanation: "动作发出者。",
                                segment_translation: "专家",
                            },
                        ],
                    },
                ],
            }))
            .mockResolvedValueOnce(createCompletionPayload({
                tags: ["主语", "谓语"],
                overview: "第三句已完成分批分析。",
                sentences: [
                    {
                        sentence: "Local officials are already adjusting flood maps.",
                        translation: "地方官员已经在调整洪水地图。",
                        highlights: [
                            {
                                substring: "Local officials",
                                type: "主语",
                                explanation: "动作发出者。",
                                segment_translation: "地方官员",
                            },
                        ],
                    },
                ],
            }));

        const response = await POST(buildRequest({ sentences, mode: "basic" }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(createCompletionMock).toHaveBeenCalledTimes(2);
        expect(createCompletionMock.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain("Experts say the pattern may reshape future climate planning.");
        expect(createCompletionMock.mock.calls[0]?.[0]?.messages?.[0]?.content).not.toContain("Local officials are already adjusting flood maps.");
        expect(createCompletionMock.mock.calls[1]?.[0]?.messages?.[0]?.content).toContain("Local officials are already adjusting flood maps.");
        expect(data.results.map((item: { sentence: string }) => item.sentence)).toEqual([
            "Scientists compared old records and noticed an unusual warming trend.",
            "Experts say the pattern may reshape future climate planning.",
            "Local officials are already adjusting flood maps.",
        ]);
    });

    it("repairs only failed sentences inside the weak batch instead of regenerating the whole request", async () => {
        const sentences = [
            "Scientists compared old records and noticed an unusual warming trend.",
            "Experts say the pattern may reshape future climate planning.",
            "Local officials are already adjusting flood maps.",
        ];

        createCompletionMock
            .mockResolvedValueOnce(createCompletionPayload({
                tags: ["主语", "谓语"],
                overview: "前两句首轮分析。",
                sentences: [
                    {
                        sentence: "Scientists compared old records and noticed an unusual warming trend.",
                        translation: "科学家对比了旧记录，并注意到一个异常升温趋势。",
                        highlights: [
                            {
                                substring: "Scientists",
                                type: "主语",
                                explanation: "动作发出者。",
                                segment_translation: "科学家",
                            },
                        ],
                    },
                    {
                        sentence: "Experts say the pattern may reshape future climate planning.",
                        translation: "",
                        highlights: [],
                    },
                ],
            }))
            .mockResolvedValueOnce(createCompletionPayload({
                tags: ["主语", "谓语"],
                overview: "前两句已局部修复。",
                sentences: [
                    {
                        sentence: "Scientists compared old records and noticed an unusual warming trend.",
                        translation: "科学家对比了旧记录，并注意到一个异常升温趋势。",
                        highlights: [
                            {
                                substring: "Scientists",
                                type: "主语",
                                explanation: "动作发出者。",
                                segment_translation: "科学家",
                            },
                        ],
                    },
                    {
                        sentence: "Experts say the pattern may reshape future climate planning.",
                        translation: "专家表示，这种模式可能会重塑未来的气候规划。",
                        highlights: [
                            {
                                substring: "Experts",
                                type: "主语",
                                explanation: "动作发出者。",
                                segment_translation: "专家",
                            },
                        ],
                    },
                ],
            }))
            .mockResolvedValueOnce(createCompletionPayload({
                tags: ["主语", "谓语"],
                overview: "第三句首轮分析。",
                sentences: [
                    {
                        sentence: "Local officials are already adjusting flood maps.",
                        translation: "地方官员已经在调整洪水地图。",
                        highlights: [
                            {
                                substring: "Local officials",
                                type: "主语",
                                explanation: "动作发出者。",
                                segment_translation: "地方官员",
                            },
                        ],
                    },
                ],
            }));

        const response = await POST(buildRequest({ sentences, mode: "basic" }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(createCompletionMock).toHaveBeenCalledTimes(3);
        expect(createCompletionMock.mock.calls[1]?.[0]?.messages?.[0]?.content).toContain("REPAIR REQUIREMENTS:");
        expect(createCompletionMock.mock.calls[1]?.[0]?.messages?.[0]?.content).toContain("missing_translation");
        expect(createCompletionMock.mock.calls[1]?.[0]?.messages?.[0]?.content).toContain("missing_highlights");
        expect(createCompletionMock.mock.calls[1]?.[0]?.messages?.[0]?.content).toContain("PATCH MODE");
        expect(createCompletionMock.mock.calls[1]?.[0]?.messages?.[0]?.content).toContain("Experts say the pattern may reshape future climate planning.");
        expect(createCompletionMock.mock.calls[1]?.[0]?.messages?.[0]?.content).not.toContain("Local officials are already adjusting flood maps.");
        expect(createCompletionMock.mock.calls[1]?.[0]?.messages?.[0]?.content).not.toContain("Scientists compared old records and noticed an unusual warming trend.");
        expect(createCompletionMock.mock.calls[2]?.[0]?.messages?.[0]?.content).toContain("Local officials are already adjusting flood maps.");
        expect(data.repairAttempted).toBe(true);
        expect(data.results[1]?.data?.difficult_sentences?.[0]?.translation).toBe("专家表示，这种模式可能会重塑未来的气候规划。");
        expect(data.results[2]?.data?.difficult_sentences?.[0]?.translation).toBe("地方官员已经在调整洪水地图。");
    });

    it("caps grammar repair attempts at one automatic repair generation", async () => {
        createCompletionMock
            .mockResolvedValueOnce(createCompletionPayload({}))
            .mockResolvedValueOnce(createCompletionPayload({}));

        const response = await POST(buildRequest({ mode: "basic" }));
        const data = await response.json();

        expect(response.status).toBe(502);
        expect(createCompletionMock).toHaveBeenCalledTimes(2);
        expect(data.errorCode).toBe("LOW_QUALITY_GRAMMAR_ANALYSIS");
    });

    it("reuses alias cache for lightly normalized sentence variants", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                tags: ["主语", "谓语"],
                overview: "句子结构清晰。",
                sentences: [
                    {
                        sentence: "Scientists compared old records, and noticed an unusual warming trend.",
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

        const firstResponse = await POST(buildRequest({
            sentences: ["Scientists compared old records, and noticed an unusual warming trend."],
            forceRegenerate: false,
        }));
        const firstData = await firstResponse.json();

        expect(firstResponse.status).toBe(200);
        expect(createCompletionMock).toHaveBeenCalledTimes(1);
        expect(firstData.cache.hit).toBe(false);

        const secondResponse = await POST(buildRequest({
            sentences: ["Scientists compared old records , and noticed an unusual warming trend."],
            forceRegenerate: false,
        }));
        const secondData = await secondResponse.json();

        expect(secondResponse.status).toBe(200);
        expect(createCompletionMock).toHaveBeenCalledTimes(1);
        expect(secondData.cache.hit).toBe(true);
    });

    it("returns usable partial sentence results instead of failing the whole request", async () => {
        createCompletionMock.mockResolvedValue(
            createCompletionPayload({
                tags: ["主语", "谓语"],
                overview: "首句结构清晰，第二句只补出了译文。",
                sentences: [
                    {
                        sentence: "Scientists compared old records and noticed an unusual warming trend.",
                        translation: "科学家对比了旧记录，并注意到一个异常升温趋势。",
                        highlights: [
                            {
                                substring: "Scientists",
                                type: "主语",
                                explanation: "动作发出者。",
                                segment_translation: "科学家",
                            },
                            {
                                substring: "compared old records and noticed an unusual warming trend",
                                type: "谓语",
                                explanation: "核心动作链。",
                                segment_translation: "对比旧记录并注意到异常升温趋势",
                            },
                        ],
                    },
                    {
                        sentence: "Experts say the pattern may reshape future climate planning.",
                        translation: "专家表示，这种模式可能会重塑未来的气候规划。",
                        highlights: [],
                    },
                ],
            }),
        );

        const response = await POST(buildRequest({
            sentences: [
                "Scientists compared old records and noticed an unusual warming trend.",
                "Experts say the pattern may reshape future climate planning.",
            ],
            mode: "basic",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.mode).toBe("basic");
        expect(data.readingCoins.action).toBe("grammar_basic");
        expect(data.results).toHaveLength(2);
        expect(data.results[0].data.difficult_sentences[0].highlights.length).toBeGreaterThan(0);
        expect(data.results[1].sentence).toBe("Experts say the pattern may reshape future climate planning.");
        expect(data.results[1].issues).toEqual(expect.arrayContaining([
            expect.stringContaining("has no valid highlights"),
        ]));
        expect(rewardReadingCoinsMock).not.toHaveBeenCalled();
    });

    it("surfaces provider rate limits instead of collapsing them into a 500", async () => {
        const rateLimitHeaders = new Headers({ "retry-after": "60" });
        createCompletionMock.mockRejectedValue(Object.assign(
            new Error("429 Too many requests"),
            { status: 429, headers: rateLimitHeaders },
        ));

        const response = await POST(buildRequest({ mode: "basic" }));
        const data = await response.json();

        expect(response.status).toBe(429);
        expect(data.errorCode).toBe("AI_PROVIDER_RATE_LIMITED");
        expect(data.retryAfter).toBe(60);
        expect(rewardReadingCoinsMock).toHaveBeenCalledWith(expect.objectContaining({
            action: "grammar_basic",
            delta: 2,
        }));
    });

    it("returns 400 when text is missing", async () => {
        const response = await POST(buildRequest({ sentences: [] }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("At least one sentence is required");
        expect(createCompletionMock).not.toHaveBeenCalled();
    });
});
