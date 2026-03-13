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
    score: number;
    mode: "translation" | "listening";
    teaching_mode: boolean;
    detail_level: "basic" | "full";
}> = {}) {
    return {
        json: async () => ({
            user_translation: "It depend of your mood.",
            reference_english: "It depends on your mood.",
            original_chinese: "这取决于你的心情。",
            current_elo: 860,
            score: 7.5,
            mode: "translation",
            teaching_mode: false,
            detail_level: "full",
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("analyze_drill route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("asks translation analysis for concrete phrase-level coaching instead of generic praise", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                feedback: ["把 depend of 改成 depends on，固定搭配才自然。"],
                improved_version: "It depends on your mood.",
                diagnosis_summary_cn: "核心问题不在句意，而在 depend of 这个搭配不自然。",
                chinglish_vs_natural: {
                    chinglish: "depend of",
                    natural: "depends on",
                    reason_cn: "英语里 depend 要和 on 连用，这里还要补三单 s。",
                },
                common_pitfall: {
                    pitfall_cn: "最容易漏掉 on，也容易忘记三单 s。",
                    wrong_example: "It depend of your mood.",
                    right_example: "It depends on your mood.",
                    why_cn: "depend on 是固定搭配；主语是 it 时动词要用 depends。",
                },
                phrase_synonyms: [
                    {
                        source_phrase: "depends on",
                        alternatives: ["hinges on", "is determined by"],
                        nuance_cn: "hinges on 语气更强调关键条件，is determined by 更正式。",
                    },
                ],
                transfer_pattern: {
                    template: "It depends on + noun / wh-clause.",
                    example_cn: "这要看你的预算。",
                    example_en: "It depends on your budget.",
                    tip_cn: "先说 depends on，再补决定因素。",
                },
                memory_hook_cn: "depend 先想 on，不要想 of。",
            }),
        );

        const response = await POST(buildRequest());
        const data = await response.json();
        const prompt = createCompletionMock.mock.calls[0][0].messages[1].content as string;

        expect(response.status).toBe(200);
        expect(prompt).toContain("diagnosis_summary_cn");
        expect(prompt).toContain("chinglish_vs_natural");
        expect(prompt).toContain("common_pitfall");
        expect(prompt).toContain("phrase_synonyms");
        expect(prompt).toContain("transfer_pattern");
        expect(prompt).toContain("memory_hook_cn");
        expect(prompt).toContain("Avoid generic praise");
        expect(prompt).toContain("must quote or reference a concrete phrase");
        expect(data.diagnosis_summary_cn).toContain("depend of");
        expect(data.chinglish_vs_natural.natural).toBe("depends on");
        expect(data.common_pitfall.right_example).toContain("depends on");
        expect(data.phrase_synonyms[0].alternatives[0]).toBe("hinges on");
        expect(data.transfer_pattern.example_en).toBe("It depends on your budget.");
        expect(data.memory_hook_cn).toContain("depend");
    });

    it("keeps basic analysis lightweight when detail_level is basic", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                feedback: ["把 depend of 改成 depends on，固定搭配才自然。"],
                improved_version: "It depends on your mood.",
            }),
        );

        const response = await POST(buildRequest({ detail_level: "basic" }));
        const data = await response.json();
        const prompt = createCompletionMock.mock.calls[0][0].messages[1].content as string;

        expect(response.status).toBe(200);
        expect(prompt).not.toContain("chinglish_vs_natural");
        expect(prompt).not.toContain("common_pitfall");
        expect(prompt).not.toContain("phrase_synonyms");
        expect(prompt).not.toContain("transfer_pattern");
        expect(prompt).not.toContain("memory_hook_cn");
        expect(data.feedback).toHaveLength(1);
        expect(data.improved_version).toBe("It depends on your mood.");
    });

    it("keeps teaching-mode extras while adding the richer translation fields", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                feedback: ["把 depend of 改成 depends on。"],
                improved_version: "It depends on your mood.",
                diagnosis_summary_cn: "主要问题是搭配 depend of。",
                chinglish_vs_natural: {
                    chinglish: "depend of",
                    natural: "depends on",
                    reason_cn: "固定搭配必须用 on。",
                },
                common_pitfall: {
                    pitfall_cn: "最常见的错是把 depend on 误写成 depend of。",
                    wrong_example: "It depend of the schedule.",
                    right_example: "It depends on the schedule.",
                    why_cn: "固定搭配和三单变化要一起注意。",
                },
                phrase_synonyms: [
                    {
                        source_phrase: "depends on",
                        alternatives: ["hinges on", "is determined by"],
                        nuance_cn: "考试里 depends on 最稳，hinges on 更书面。",
                    },
                ],
                transfer_pattern: {
                    template: "It depends on + noun.",
                    example_cn: "这要看你的预算。",
                    example_en: "It depends on your budget.",
                    tip_cn: "套 depend on 模板时先放决定因素。",
                },
                memory_hook_cn: "depend on 是固定组合。",
                error_analysis: [
                    {
                        error: "depend of",
                        correction: "depends on",
                        rule: "depend 与 on 搭配",
                        tip: "把 depend on 当成固定短语记。",
                    },
                ],
                similar_patterns: [
                    {
                        chinese: "这要看你的预算。",
                        english: "It depends on your budget.",
                        point: "同样套 depend on 模板。",
                    },
                ],
            }),
        );

        const response = await POST(buildRequest({ teaching_mode: true }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.error_analysis).toHaveLength(1);
        expect(data.similar_patterns).toHaveLength(1);
        expect(data.phrase_synonyms[0].source_phrase).toBe("depends on");
        expect(data.transfer_pattern.template).toContain("depends on");
        expect(data.memory_hook_cn).toContain("depend on");
    });
});
