import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalConsoleError = console.error;

beforeEach(() => {
    console.error = vi.fn((...args) => {
        if (typeof args[0] === "string" && args[0].includes("Generate Drill Error")) {
            return;
        }
        originalConsoleError(...args);
    });
});

afterEach(() => {
    console.error = originalConsoleError;
});

const { createCompletionMock, createClientOverrideMock } = vi.hoisted(() => ({
    createCompletionMock: vi.fn(),
    createClientOverrideMock: vi.fn(),
}));

vi.mock("@/lib/deepseek", () => ({
    deepseek: {
        chat: {
            completions: {
                create: createCompletionMock,
            },
        },
    },
    createDeepSeekClientForCurrentUserWithOverride: async (overrides: unknown) => {
        createClientOverrideMock(overrides);
        return {
            chat: {
                completions: {
                    create: createCompletionMock,
                },
            },
        };
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

function buildRequest(overrides: Partial<{
    articleTitle: string;
    articleContent: string;
    difficulty: string;
    eloRating: number;
    mode: "translation" | "listening";
    bossType: string;
}> = {}) {
    return {
        json: async () => ({
            articleTitle: "Battle Test Topic",
            articleContent: "",
            difficulty: "Level 3",
            eloRating: 820,
            mode: "translation",
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("generate_drill route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        createClientOverrideMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("accepts translation drill on the first generation when word count is in range", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                chinese: "第一题",
                target_english_vocab: ["engine"],
                reference_english: "I checked the car engine quite carefully today",
                _scenario_topic: "修车",
                _ai_difficulty_report: {
                    tier: "白银",
                    cefr: "A2+",
                    word_count: "8",
                    target_range: "6-9",
                },
            }),
        );

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(createCompletionMock).toHaveBeenCalledTimes(1);
        expect(
            createCompletionMock.mock.calls[0][0].messages[1].content,
        ).not.toContain("RETRY FEEDBACK");
        expect(data._difficultyMeta.status).toBe("MATCHED");
        expect(data._difficultyMeta.expectedWordRange).toEqual({ min: 6, max: 9 });
        expect(data._difficultyMeta.actualWordCount).toBe(8);
        expect(data._difficultyMeta.isValid).toBe(true);
        expect(data._difficultyMeta.translationValidation).toMatchObject({
            validationRange: { min: 5, max: 10 },
            tolerance: 1,
        });
        expect(createClientOverrideMock).toHaveBeenCalledWith({});
    });

    it("flags inaccurate AI self-reported word counts", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                chinese: "正常题目",
                target_english_vocab: ["engine"],
                reference_english: "I checked the car engine quite carefully today",
                _scenario_topic: "修车",
                _ai_difficulty_report: {
                    tier: "白银",
                    cefr: "A2+",
                    word_count: "99",
                    target_range: "8-10",
                },
            }),
        );

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(createCompletionMock).toHaveBeenCalledTimes(1);
        expect(data._difficultyMeta.aiSelfReport).toMatchObject({
            wordCount: 99,
            wordCountAccurate: false,
        });
    });

    it("caps translation alternatives at two even if the model returns more", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                chinese: "正常题目",
                target_english_vocab: ["engine"],
                reference_english: "I checked the car engine quite carefully today",
                reference_english_alternatives: [
                    "Alternative one.",
                    "Alternative two.",
                    "Alternative three.",
                ],
                _scenario_topic: "修车",
                _ai_difficulty_report: {
                    tier: "白银",
                    cefr: "A2+",
                    word_count: "8",
                    target_range: "8-10",
                },
            }),
        );

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(data.reference_english_alternatives).toEqual([
            "Alternative one.",
            "Alternative two.",
        ]);
    });

    it("accepts slight translation length drift within tolerance without retrying", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                chinese: "正常题目",
                target_english_vocab: ["engine"],
                reference_english: "I checked the car engine very carefully before work today",
                _scenario_topic: "修车",
                _ai_difficulty_report: {
                    tier: "白银",
                    cefr: "A2+",
                    word_count: "11",
                    target_range: "8-10",
                },
            }),
        );

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(createCompletionMock).toHaveBeenCalledTimes(1);
        expect(data._difficultyMeta.status).toBe("MATCHED");
        expect(data._difficultyMeta.isValid).toBe(true);
        expect(data._difficultyMeta.translationValidation).toMatchObject({
            validationRange: { min: 5, max: 10 },
        });
    });

    it("treats the topic as background direction instead of forcing explicit topic words", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                chinese: "我差点错过最后一班车。",
                target_english_vocab: ["missed", "last"],
                reference_english: "I almost missed the last train home.",
                _scenario_topic: "深夜回家路上",
                _ai_difficulty_report: {
                    tier: "白银",
                    cefr: "A2+",
                    word_count: "7",
                    target_range: "7-11",
                },
            }),
        );

        await POST(buildRequest({ articleTitle: "环球旅行", articleContent: "" }));

        const prompt = createCompletionMock.mock.calls[0][0].messages[1].content as string;
        expect(prompt).toContain("Treat the topic as background direction");
        expect(prompt).toContain("Do NOT explicitly repeat the topic label");
        expect(prompt).toContain("Avoid the most obvious keywords");
    });
});
