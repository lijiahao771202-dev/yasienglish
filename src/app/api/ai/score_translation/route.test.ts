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
    user_translation: string;
    reference_english: string;
    original_chinese: string;
    current_elo: number;
    mode: "translation" | "listening" | "dictation";
    input_source: "keyboard" | "voice";
    is_reverse: boolean;
}> = {}) {
    return {
        json: async () => ({
            user_translation: "我昨天去了超市",
            reference_english: "I went to the supermarket yesterday.",
            original_chinese: "我昨天去了超市。",
            current_elo: 860,
            mode: "dictation",
            input_source: "keyboard",
            is_reverse: false,
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("score_translation route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("rounds dictation scores to integers", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                score: 8.6,
                judge_reasoning: "语义基本完整，个别措辞可再自然些。",
                feedback: {
                    dictation_tips: ["注意补全细节。", "表达可以更自然。"],
                    encouragement: "继续保持。",
                },
            }),
        );

        const response = await POST(buildRequest({
            original_chinese: "我昨天去了超市并买了牛奶。",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(Number.isInteger(data.score)).toBe(true);
        expect(data.score).toBe(9);
    });

    it("forces punctuation-only dictation differences to score 10", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                score: 7.2,
                judge_reasoning: "核心语义完整，主要是标点问题。",
                feedback: {
                    dictation_tips: ["这里主要是标点问题。"],
                    encouragement: "继续保持。",
                },
                error_analysis: [
                    {
                        error: "标点",
                        correction: "补上句号",
                        rule: "标点",
                        tip: "断句要清楚。",
                    },
                ],
            }),
        );

        const response = await POST(buildRequest({
            user_translation: "我昨天去了超市",
            original_chinese: "我昨天去了超市。",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(Number.isInteger(data.score)).toBe(true);
        expect(data.score).toBe(10);
        expect(data.feedback.dictation_tips[0]).toContain("标点");
        expect(data.error_analysis ?? []).toEqual([]);
    });

    it("normalizes translation score to 0-10 when model returns 100", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                score: 100,
                judge_reasoning: "语义基本正确。",
            }),
        );

        const response = await POST(buildRequest({
            mode: "translation",
            is_reverse: true,
            user_translation: "我昨天去了超市",
            original_chinese: "我昨天去了超市。",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.score).toBe(10);
    });

    it("caps reverse translation score when answer is not Chinese", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                score: 10,
                judge_reasoning: "perfect",
            }),
        );

        const response = await POST(buildRequest({
            mode: "translation",
            is_reverse: true,
            user_translation: "asdf qwer random text",
            original_chinese: "我昨天去了超市。",
            reference_english: "I went to the supermarket yesterday.",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.score).toBeLessThanOrEqual(2);
        expect(String(data.judge_reasoning)).toContain("需中文翻译");
    });
});
