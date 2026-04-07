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

function buildRequest(
    overrides: Partial<{
        articleTitle: string;
        articleContent: string;
        difficulty: string;
        eloRating: number;
        mode: "translation" | "listening" | "rebuild";
        sourceMode: "ai" | "bank";
        rebuildVariant: "sentence" | "passage";
        segmentCount: 2 | 3 | 5;
    }> = {},
) {
    return {
        json: async () => ({
            articleTitle: "Battle Test Topic",
            articleContent: "",
            difficulty: "Level 3",
            eloRating: 820,
            mode: "listening",
            sourceMode: "bank",
            rebuildVariant: "sentence",
            segmentCount: 3,
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("drill next route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns a listening bank item when bank mode is requested", async () => {
        const response = await POST(buildRequest({ eloRating: 830, sourceMode: "bank" }));
        const data = await response.json();

        expect(data._sourceMeta.sourceMode).toBe("bank");
        expect(data._difficultyMeta.cefr).toBe("A2+");
        expect(data._difficultyMeta.status).toBe("MATCHED");
    });

    it("skips excluded bank ids when an alternative exists", async () => {
        const firstResponse = await POST(buildRequest({ eloRating: 830, sourceMode: "bank" }));
        const firstData = await firstResponse.json();

        const secondResponse = await POST({
            json: async () => ({
                articleTitle: "Battle Test Topic",
                articleContent: "",
                difficulty: "Level 3",
                eloRating: 830,
                mode: "listening",
                sourceMode: "bank",
                excludeBankIds: [firstData._sourceMeta.bankItemId],
            }),
        } as Parameters<typeof POST>[0]);
        const secondData = await secondResponse.json();

        expect(secondData._sourceMeta.bankItemId).not.toBe(firstData._sourceMeta.bankItemId);
        expect(secondData._difficultyMeta.status).toBe("MATCHED");
    });

    it("forces rebuild requests onto ai generation even when bank mode is requested", async () => {
        createCompletionMock.mockResolvedValue(
            createCompletionPayload({
                chinese: "下课后在前门等我。",
                reference_english: "Meet me by the front gate after class.",
                _scenario_topic: "课后碰面",
            }),
        );

        const response = await POST(buildRequest({ eloRating: 830, mode: "rebuild", sourceMode: "bank" }));
        const data = await response.json();

        expect(createCompletionMock.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(data._sourceMeta.sourceMode).toBe("ai");
        expect(data._rebuildMeta.effectiveElo).toBe(830);
        expect(data._rebuildMeta.answerTokens.length).toBeGreaterThan(0);
        expect(data._rebuildMeta.tokenBank.length).toBeGreaterThan(data._rebuildMeta.answerTokens.length);
    });

    it("returns rebuild ai payload using the requested topic", async () => {
        createCompletionMock.mockResolvedValue(
            createCompletionPayload({
                chinese: "下课后在前门等我。",
                reference_english: "Meet me by the front gate after class.",
                _scenario_topic: "课后碰面",
            }),
        );

        const response = await POST(buildRequest({ sourceMode: "ai", mode: "rebuild", eloRating: 830 }));
        const data = await response.json();

        expect(createCompletionMock.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(data._sourceMeta.sourceMode).toBe("ai");
        expect(data._topicMeta.topic).toBe("Battle Test Topic");
        expect(data._topicMeta.subTopic).toBe("课后碰面");
        expect(data._rebuildMeta.effectiveElo).toBe(830);
        expect(data._rebuildMeta.answerTokens).toEqual(["Meet", "me", "by", "the", "front", "gate", "after", "class."]);
        expect(data._rebuildMeta.distractorTokens.length).toBeGreaterThan(0);
        expect(data._rebuildMeta.theme).toBe("Battle Test Topic");
    });

    it("retries sentence rebuild generation after a transient upstream socket failure", async () => {
        createCompletionMock
            .mockRejectedValueOnce(Object.assign(new TypeError("terminated"), {
                cause: { code: "UND_ERR_SOCKET" },
            }))
            .mockResolvedValueOnce(
                createCompletionPayload({
                    chinese: "下课后在前门等我。",
                    reference_english: "Meet me by the front gate after class.",
                    _scenario_topic: "课后碰面",
                }),
            );

        const response = await POST(buildRequest({ sourceMode: "ai", mode: "rebuild", eloRating: 830 }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(createCompletionMock).toHaveBeenCalledTimes(2);
        expect(data.reference_english).toBe("Meet me by the front gate after class.");
    });

    it("returns a passage rebuild session with natural segment metadata", async () => {
        createCompletionMock.mockResolvedValue(
            createCompletionPayload({
                _scenario_topic: "机场接人",
                segments: [
                    {
                        chinese: "先在到达口旁边等我。",
                        reference_english: "Wait for me near the arrivals gate first.",
                    },
                    {
                        chinese: "如果行李出来晚了，就给司机发消息。",
                        reference_english: "If the bags are late, text the driver right away.",
                    },
                    {
                        chinese: "确认车牌以后，再带大家去短停区。",
                        reference_english: "After you confirm the plate, lead everyone to short stay parking.",
                    },
                ],
            }),
        );

        const response = await POST(buildRequest({
            sourceMode: "ai",
            mode: "rebuild",
            rebuildVariant: "passage",
            segmentCount: 3,
            eloRating: 830,
        }));
        const data = await response.json();

        expect(data._rebuildMeta.variant).toBe("passage");
        expect(data._rebuildMeta.passageSession.segmentCount).toBe(3);
        expect(data._rebuildMeta.passageSession.currentIndex).toBe(0);
        expect(data._rebuildMeta.passageSession.segments).toHaveLength(3);
        expect(data._rebuildMeta.passageSession.segments[0].tokenBank.length)
            .toBeGreaterThan(data._rebuildMeta.passageSession.segments[0].answerTokens.length);
        expect(data.reference_english).toBe("Wait for me near the arrivals gate first.");
        expect(data._topicMeta.subTopic).toBe("机场接人");
    });

    it("retries passage rebuild generation after a transient upstream socket failure", async () => {
        createCompletionMock
            .mockRejectedValueOnce(Object.assign(new TypeError("terminated"), {
                cause: { code: "UND_ERR_SOCKET" },
            }))
            .mockResolvedValueOnce(
                createCompletionPayload({
                    _scenario_topic: "机场接人",
                    segments: [
                        {
                            chinese: "先在到达口旁边等我。",
                            reference_english: "Wait for me near the arrivals gate first.",
                        },
                        {
                            chinese: "如果行李出来晚了，就给司机发消息。",
                            reference_english: "If the bags are late, text the driver right away.",
                        },
                        {
                            chinese: "确认车牌以后，再带大家去短停区。",
                            reference_english: "After you confirm the plate, lead everyone to short stay parking.",
                        },
                    ],
                }),
            );

        const response = await POST(buildRequest({
            sourceMode: "ai",
            mode: "rebuild",
            rebuildVariant: "passage",
            segmentCount: 3,
            eloRating: 830,
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(createCompletionMock).toHaveBeenCalledTimes(2);
        expect(data._rebuildMeta.variant).toBe("passage");
    });

    it("delegates to ai generation when ai mode is requested", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                chinese: "第一题",
                    target_english_vocab: ["engine"],
                    reference_english: "I checked the car engine quite carefully today",
                    _scenario_topic: "修车",
                    _ai_difficulty_report: {
                    tier: "青铜",
                    cefr: "A2-",
                        word_count: "8",
                        target_range: "8-10",
                    },
                _listening_features: {
                    word_count: 8,
                    clause_count: 0,
                    memory_load: "low",
                    spoken_naturalness: "medium",
                    reduced_forms_presence: "minimal",
                },
            }),
        );

        const response = await POST(buildRequest({ sourceMode: "ai", mode: "listening", eloRating: 600 }));
        const data = await response.json();

        expect(createCompletionMock).toHaveBeenCalledTimes(1);
        expect(data._topicMeta.topic).toBe("Battle Test Topic");
        expect(data._difficultyMeta.status).toBe("MATCHED");
    });
});
