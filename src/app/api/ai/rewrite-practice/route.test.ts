import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletionMock, createClientMock } = vi.hoisted(() => ({
    createCompletionMock: vi.fn(),
    createClientMock: vi.fn(),
}));

vi.mock("@/lib/deepseek", () => ({
    createDeepSeekClientForCurrentUser: createClientMock,
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

function buildRequest(body: Record<string, unknown>) {
    return {
        json: async () => body,
    } as Parameters<typeof POST>[0];
}

describe("rewrite-practice route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        createClientMock.mockReset();
        createClientMock.mockResolvedValue({
            chat: {
                completions: {
                    create: createCompletionMock,
                },
            },
        });
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns 400 when paragraphText is missing for generate", async () => {
        const res = await POST(buildRequest({ action: "generate", paragraphText: "" }));
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toBe("paragraphText is required");
        expect(createCompletionMock).not.toHaveBeenCalled();
    });

    it("respects excludedSentences when generating rewrite prompt", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                source_sentence_en: "This is the second candidate sentence.",
                imitation_prompt_cn: "这是第二句的中文提示。",
                rewrite_tips_cn: ["替换动词表达。", "调整句式顺序。"],
                pattern_focus_cn: "模仿并列结构。",
            }),
        );

        const paragraphText = "This is the first candidate sentence. This is the second candidate sentence.";
        const res = await POST(buildRequest({
            action: "generate",
            paragraphText,
            excludedSentences: ["This is the first candidate sentence."],
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.source_sentence_en).toBe("This is the second candidate sentence.");
        expect(data.imitation_prompt_cn).toBe("这是第二句的中文提示。");
        expect(Array.isArray(data.rewrite_tips_cn)).toBe(true);
        expect(data.pattern_focus_cn).toBe("模仿并列结构。");
    });

    it("falls back to candidate pool sentence when model returns non-candidate", async () => {
        createCompletionMock
            .mockResolvedValueOnce(
                createCompletionPayload({
                    source_sentence_en: "A sentence outside candidate pool.",
                    imitation_prompt_cn: "",
                    rewrite_tips_cn: [],
                    pattern_focus_cn: "",
                }),
            )
            .mockResolvedValueOnce(
                createCompletionPayload({
                    source_sentence_en: "A sentence outside candidate pool.",
                    imitation_prompt_cn: "想象你在准备一场辩论赛。",
                    rewrite_tips_cn: ["保持原句主干。"],
                    pattern_focus_cn: "模仿句式骨架。",
                    literal_translation: false,
                    scene_shifted: true,
                }),
            );

        const paragraphText = "Writers should revise their drafts before submission. Readers can then understand ideas more clearly.";
        const res = await POST(buildRequest({
            action: "generate",
            paragraphText,
            excludedSentences: [
                "Writers should revise their drafts before submission.",
                "Readers can then understand ideas more clearly.",
            ],
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect([
            "Writers should revise their drafts before submission.",
            "Readers can then understand ideas more clearly.",
        ]).toContain(data.source_sentence_en);
        expect(data.imitation_prompt_cn).toBeTruthy();
        expect(data.pattern_focus_cn).toBeTruthy();
    });

    it("retries generate when inspiration prompt looks like literal translation", async () => {
        createCompletionMock
            .mockResolvedValueOnce(
                createCompletionPayload({
                    source_sentence_en: "Imagine you are looking for a job.",
                    imitation_prompt_cn: "这句英文对应中文：想象你正在找工作。",
                    rewrite_tips_cn: ["保留句式。"],
                    pattern_focus_cn: "Imagine you are ... 结构。",
                    literal_translation: true,
                    scene_shifted: false,
                }),
            )
            .mockResolvedValueOnce(
                createCompletionPayload({
                    source_sentence_en: "Imagine you are looking for a job.",
                    imitation_prompt_cn: "想象你正在准备一场重要面试。",
                    rewrite_tips_cn: ["替换场景词。", "保留主干结构。"],
                    pattern_focus_cn: "模仿 Imagine you are ... 的引导结构。",
                    literal_translation: false,
                    scene_shifted: true,
                }),
            );

        const res = await POST(buildRequest({
            action: "generate",
            paragraphText: "Imagine you are looking for a job. People need to update their skills quickly.",
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(createCompletionMock).toHaveBeenCalledTimes(2);
        expect(data.source_sentence_en).toBe("Imagine you are looking for a job.");
        expect(data.imitation_prompt_cn).toBe("想象你正在准备一场重要面试。");
    });

    it("returns 400 when required score fields are missing", async () => {
        const res = await POST(buildRequest({
            action: "score",
            source_sentence_en: "",
            imitation_prompt_cn: "",
            user_rewrite_en: "",
        }));
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toContain("required");
        expect(createCompletionMock).not.toHaveBeenCalled();
    });

    it("applies copy penalty on highly similar rewrite", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                dimension_scores: {
                    grammar: 94,
                    vocabulary: 92,
                    semantics: 95,
                    imitation: 93,
                },
                feedback_cn: "语法和语义都不错。",
                better_version_en: "People should keep improving skills as careers change quickly.",
                improvement_points_cn: ["替换部分高频词。", "尝试不同从句结构。"],
                corrections: [
                    {
                        segment: "need to keep updating",
                        correction: "have to keep updating",
                        reason: "固定搭配更自然。",
                        category: "collocation",
                    },
                ],
            }),
        );

        const sentence = "People need to keep updating their skills throughout their lives.";
        const res = await POST(buildRequest({
            action: "score",
            source_sentence_en: sentence,
            imitation_prompt_cn: "人们需要终身持续更新技能。",
            user_rewrite_en: sentence,
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.copy_penalty_applied).toBe(true);
        expect(data.copy_similarity).toBeGreaterThanOrEqual(0.88);
        expect(data.dimension_scores.imitation).toBeLessThan(93);
        expect(data.total_score).toBeLessThan(94);
        expect(Array.isArray(data.improvement_points_cn)).toBe(true);
        expect(Array.isArray(data.corrections)).toBe(true);
        expect(data.corrections[0].correction).toBe("have to keep updating");
    });

    it("does not over-penalize semantics in non-strict mode when sentence quality is good", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                dimension_scores: {
                    grammar: 95,
                    vocabulary: 90,
                    semantics: 50,
                    imitation: 82,
                },
                feedback_cn: "表达通顺，但和提示场景不一致。",
                better_version_en: "Imagine she is starting a business.",
                improvement_points_cn: ["可继续丰富细节。"],
            }),
        );

        const res = await POST(buildRequest({
            action: "score",
            source_sentence_en: "Imagine you are looking for a job.",
            imitation_prompt_cn: "想象你正在找工作。",
            user_rewrite_en: "Imagine she is starting a business.",
            strict_semantic_match: false,
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.dimension_scores.grammar).toBe(95);
        expect(data.dimension_scores.vocabulary).toBe(90);
        expect(data.dimension_scores.semantics).toBeGreaterThanOrEqual(80);
        expect(data.corrections).toEqual([]);
    });

    it("filters out unlocatable or non-error corrections", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                dimension_scores: {
                    grammar: 72,
                    vocabulary: 74,
                    semantics: 78,
                    imitation: 79,
                },
                feedback_cn: "有少量可改进点。",
                better_version_en: "In the past, students only needed a university degree.",
                improvement_points_cn: ["注意时态一致。"],
                corrections: [
                    {
                        segment: "totally missing text",
                        correction: "something else",
                        reason: "语法错误。",
                        category: "grammar",
                    },
                    {
                        segment: "needed",
                        correction: "only needed",
                        reason: "这样更高级。",
                        category: "expression",
                    },
                    {
                        segment: "in the past",
                        correction: "in the past",
                        reason: "拼写错误。",
                        category: "spelling",
                    },
                    {
                        segment: "people only needed",
                        correction: "people only needed to",
                        reason: "缺少不定式 to。",
                        category: "grammar",
                    },
                ],
            }),
        );

        const res = await POST(buildRequest({
            action: "score",
            source_sentence_en: "In the past, people only needed a university degree.",
            imitation_prompt_cn: "过去，很多人只需要一张学历证书。",
            user_rewrite_en: "In the past, people only needed a university degree.",
            strict_semantic_match: false,
        }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.corrections).toEqual([
            {
                segment: "people only needed",
                correction: "people only needed to",
                reason: "缺少不定式 to。",
                category: "grammar",
            },
        ]);
    });
});
