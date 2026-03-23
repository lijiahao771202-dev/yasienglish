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

    it("returns rebuild payload from the listening bank", async () => {
        const response = await POST(buildRequest({ eloRating: 830, mode: "rebuild", sourceMode: "ai" }));
        const data = await response.json();

        expect(data._sourceMeta.sourceMode).toBe("bank");
        expect(data._rebuildMeta.effectiveElo).toBe(830);
        expect(data._rebuildMeta.answerTokens.length).toBeGreaterThan(0);
        expect(data._rebuildMeta.tokenBank.length).toBeGreaterThan(data._rebuildMeta.answerTokens.length);
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
