import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryAskRelevantVocabulary } from "./ask-vocab-memory";

const { ensureBGEReady, requestRagQuery, getVocabularyMock } = vi.hoisted(() => ({
    ensureBGEReady: vi.fn(),
    requestRagQuery: vi.fn(),
    getVocabularyMock: vi.fn(),
}));

vi.mock("@/lib/bge-client", () => ({
    ensureBGEReady,
    requestRagQuery,
}));

vi.mock("@/lib/db", () => ({
    db: {
        vocabulary: {
            get: getVocabularyMock,
        },
    },
}));

describe("ask-vocab-memory", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("queries learner vocab vectors, dedupes hits, and hydrates notebook details", async () => {
        ensureBGEReady.mockResolvedValue(true);
        requestRagQuery
            .mockResolvedValueOnce([
                {
                    text: "solidify - 巩固",
                    score: 0.91,
                    source: "vocab",
                    metadata: { vocabId: "solidify" },
                },
                {
                    text: "memory - 记忆",
                    score: 0.76,
                    source: "vocab",
                    metadata: { vocabId: "memory" },
                },
            ])
            .mockResolvedValueOnce([
                {
                    text: "solidify - 巩固",
                    score: 0.84,
                    source: "vocab",
                    metadata: { vocabId: "solidify" },
                },
            ]);
        getVocabularyMock.mockImplementation(async (word: string) => {
            if (word === "solidify") {
                return {
                    word: "solidify",
                    translation: "巩固；使稳固",
                    definition: "to make something stronger",
                    example: "Sleep helps solidify new memories.",
                    source_sentence: "The brain solidifies new memories during sleep.",
                    phonetic: "/səˈlɪdɪfaɪ/",
                    meaning_groups: [{ pos: "v.", meanings: ["巩固", "使稳固"] }],
                    highlighted_meanings: ["巩固"],
                    word_breakdown: ["solid + -ify"],
                    morphology_notes: ["常用于记忆、关系、计划等逐渐稳固的语境"],
                };
            }
            if (word === "memory") {
                return {
                    word: "memory",
                    translation: "记忆；回忆",
                    definition: "the ability to remember things",
                    example: "",
                    source_sentence: "",
                    phonetic: "/ˈmeməri/",
                    meaning_groups: [{ pos: "n.", meanings: ["记忆", "回忆"] }],
                    highlighted_meanings: [],
                    word_breakdown: [],
                    morphology_notes: [],
                };
            }
            return null;
        });

        const result = await queryAskRelevantVocabulary({
            paragraph: "Research shows that sleep, especially deep sleep, is when the brain solidifies new memories.",
            selection: "the brain solidifies new memories",
            question: "请翻译这句话，并解析它的核心语法结构与词汇搭配。",
        });

        expect(result.status).toBe("hit");
        expect(result.vocabulary).toEqual([
            expect.objectContaining({
                word: "solidify",
                translation: "巩固；使稳固",
                phonetic: "/səˈlɪdɪfaɪ/",
                score: 0.91,
                meaningHints: ["v. 巩固 / 使稳固"],
                highlightedMeanings: ["巩固"],
                morphologyNotes: ["常用于记忆、关系、计划等逐渐稳固的语境"],
            }),
            expect.objectContaining({
                word: "memory",
                translation: "记忆；回忆",
                score: 0.76,
                meaningHints: ["n. 记忆 / 回忆"],
            }),
        ]);
        expect(requestRagQuery).toHaveBeenNthCalledWith(
            1,
            "the brain solidifies new memories",
            6,
            0.18,
            "vocab",
        );
        expect(requestRagQuery).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining("请翻译这句话"),
            6,
            0.18,
            "vocab",
        );
    });

    it("returns unavailable when the vector engine is not ready", async () => {
        ensureBGEReady.mockResolvedValue(false);

        await expect(queryAskRelevantVocabulary({
            paragraph: "Short paragraph.",
            selection: "Short paragraph.",
            question: "这句什么意思？",
        })).resolves.toEqual({
            status: "unavailable",
            vocabulary: [],
        });
        expect(requestRagQuery).not.toHaveBeenCalled();
    });
});
