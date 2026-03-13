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
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("retries translation generation when the first sentence is too short", async () => {
        createCompletionMock
            .mockResolvedValueOnce(
                createCompletionPayload({
                    chinese: "第一题",
                    target_english_vocab: ["engine"],
                    reference_english: "I checked the engine today",
                    _scenario_topic: "修车",
                    _ai_difficulty_report: {
                        tier: "白银",
                        cefr: "A2+",
                        word_count: "5",
                        target_range: "8-10",
                    },
                }),
            )
            .mockResolvedValueOnce(
                createCompletionPayload({
                    chinese: "第二题",
                    target_english_vocab: ["engine"],
                    reference_english: "I checked the car engine quite carefully today",
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

        expect(createCompletionMock).toHaveBeenCalledTimes(2);
        expect(
            createCompletionMock.mock.calls[1][0].messages[1].content,
        ).toContain("RETRY FEEDBACK (1/3):");
        expect(
            createCompletionMock.mock.calls[1][0].messages[1].content,
        ).toContain("Previous word count: 5");
        expect(data._difficultyMeta.status).toBe("MATCHED");
        expect(data._difficultyMeta.expectedWordRange).toEqual({ min: 8, max: 10 });
        expect(data._difficultyMeta.actualWordCount).toBe(8);
    });

    it("stops translation retries after three failed difficulty attempts", async () => {
        createCompletionMock.mockResolvedValue(
            createCompletionPayload({
                chinese: "超长题目",
                target_english_vocab: ["policy"],
                reference_english: "I carefully inspected the old family car engine before leaving for work today",
                _scenario_topic: "修车",
                _ai_difficulty_report: {
                    tier: "白银",
                    cefr: "A2+",
                    word_count: "13",
                    target_range: "8-10",
                },
            }),
        );

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(createCompletionMock).toHaveBeenCalledTimes(3);
        expect(
            createCompletionMock.mock.calls[1][0].messages[1].content,
        ).toContain("Next attempt MUST stay within 7-11 words.");
        expect(
            createCompletionMock.mock.calls[1][0].messages[1].content,
        ).toContain("remove any passive voice, relative clause, or extra modifier");
        expect(data._difficultyMeta.status).toBe("TOO_HARD");
        expect(data._difficultyMeta.isValid).toBe(false);
        expect(data._difficultyMeta.actualWordCount).toBe(13);
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

    it("does not run translation difficulty retries in listening mode", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                chinese: "打电话给我",
                target_english_vocab: ["call"],
                reference_english: "Call me",
                _scenario_topic: "打电话",
                _ai_difficulty_report: {
                    tier: "青铜",
                    cefr: "A2-",
                    word_count: "2",
                    target_range: "8-12",
                },
            }),
        );

        const response = await POST(
            buildRequest({ mode: "listening", eloRating: 600 }),
        );
        const data = await response.json();

        expect(createCompletionMock).toHaveBeenCalledTimes(1);
        expect(data._difficultyMeta.expectedWordRange).toEqual({ min: 8, max: 12 });
        expect(data._difficultyMeta.actualWordCount).toBe(2);
        expect(data._difficultyMeta.status).toBe("TOO_EASY");
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
