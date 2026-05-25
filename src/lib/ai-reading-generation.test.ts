import { describe, expect, it } from "vitest";
import {
    buildAIGenerationRequestBody,
    DEFAULT_AI_GENERATION_RAG_SELECTION,
    formatLongformHistoryDescriptor,
    getStrictRagLimit,
    getLongformLengthTierMeta,
    getLongformStyleMeta,
    isQuizEligibleArticle,
    normalizeAIGenerationMode,
    normalizeAIGenerationRagMode,
    normalizeAIGenerationRagSource,
    normalizeLongformLengthTierId,
    normalizeLongformStyleId,
} from "./ai-reading-generation";

describe("ai reading generation helpers", () => {
    it("normalizes longform mode and its selectors", () => {
        expect(normalizeAIGenerationMode("longform")).toBe("longform");
        expect(normalizeAIGenerationMode("anything")).toBe("standard");
        expect(normalizeLongformStyleId("science")).toBe("science");
        expect(normalizeLongformStyleId("explainer")).toBe("explainer");
        expect(normalizeLongformStyleId("detailed")).toBe("detailed");
        expect(normalizeLongformStyleId("detailed_explainer")).toBe("detailed");
        expect(normalizeLongformStyleId("case")).toBe("profile");
        expect(normalizeLongformStyleId("unknown")).toBeNull();
        expect(normalizeLongformLengthTierId("w1200")).toBe("w1200");
        expect(normalizeLongformLengthTierId("w4200")).toBe("w4200");
        expect(normalizeLongformLengthTierId("w7200")).toBe("w7200");
        expect(normalizeLongformLengthTierId("w42")).toBeNull();
    });

    it("returns style and length metadata for longform selections", () => {
        expect(getLongformStyleMeta("profile")).toEqual({
            id: "profile",
            name: "人物特写",
        });
        expect(getLongformStyleMeta("detailed")).toEqual({
            id: "detailed",
            name: "详细讲解",
        });
        expect(getLongformLengthTierMeta("w1600")).toEqual({
            id: "w1600",
            label: "长篇",
            targetWordCount: 1600,
        });
        expect(getLongformLengthTierMeta("w4200")).toEqual({
            id: "w4200",
            label: "马拉松",
            targetWordCount: 4200,
        });
        expect(getLongformLengthTierMeta("w7200")).toEqual({
            id: "w7200",
            label: "巨著",
            targetWordCount: 7200,
        });
    });

    it("builds standard and longform generation payloads with the right fields", () => {
        expect(buildAIGenerationRequestBody({
            topic: "  urban policy  ",
            topicSeed: { topicLine: "城市治理 · Urban policy tradeoffs" },
            difficulty: "ielts",
            generationMode: "standard",
            longformStyleId: "science",
            lengthTierId: "w1200",
            injectedVocabulary: ["equity", "", "allocation"],
        })).toEqual({
            topic: "urban policy",
            topicSeed: { topicLine: "城市治理 · Urban policy tradeoffs" },
            difficulty: "ielts",
            generationMode: "standard",
            ragMode: "reference",
            ragSource: "hybrid",
            longformStyleId: undefined,
            lengthTierId: undefined,
            injectedVocabulary: ["equity", "allocation"],
        });

        expect(buildAIGenerationRequestBody({
            topic: "science habits",
            topicSeed: { topicLine: "公众科学 · Science habits" },
            difficulty: "cet6",
            generationMode: "longform",
            longformStyleId: "science",
            lengthTierId: "w1200",
            injectedVocabulary: [],
        })).toEqual({
            topic: "science habits",
            topicSeed: { topicLine: "公众科学 · Science habits" },
            difficulty: "cet6",
            generationMode: "longform",
            ragMode: "reference",
            ragSource: "hybrid",
            longformStyleId: "science",
            lengthTierId: "w1200",
            injectedVocabulary: undefined,
        });
    });

    it("normalizes RAG settings and strict limits", () => {
        expect(DEFAULT_AI_GENERATION_RAG_SELECTION).toEqual({
            standard: { mode: "reference", source: "hybrid" },
            longform: { mode: "reference", source: "hybrid" },
        });
        expect(normalizeAIGenerationRagMode("off")).toBe("off");
        expect(normalizeAIGenerationRagMode("strict")).toBe("strict");
        expect(normalizeAIGenerationRagMode("weird")).toBe("reference");
        expect(normalizeAIGenerationRagSource("vocab")).toBe("vocab");
        expect(normalizeAIGenerationRagSource("dictionary")).toBe("dictionary");
        expect(normalizeAIGenerationRagSource("else")).toBe("hybrid");
        expect(getStrictRagLimit("standard")).toBe(20);
        expect(getStrictRagLimit("longform")).toBe(40);
    });

    it("treats longform generated articles as quiz-ineligible when flagged false", () => {
        expect(isQuizEligibleArticle({
            isAIGenerated: true,
            difficulty: "ielts",
            quizEligible: false,
        })).toBe(false);

        expect(isQuizEligibleArticle({
            isAIGenerated: true,
            difficulty: "cet6",
            quizEligible: true,
        })).toBe(true);

        expect(isQuizEligibleArticle({
            difficulty: "cet6",
            quizEligible: true,
        })).toBe(false);
    });

    it("formats longform history descriptors with difficulty, mode, style, and target length", () => {
        expect(formatLongformHistoryDescriptor({
            difficulty: "cet6",
            generationMode: "longform",
            longformStyle: { name: "科普" },
            lengthTier: { targetWordCount: 1200 },
        })).toBe("六级 · 长文 · 科普 · 1200词");

        expect(formatLongformHistoryDescriptor({
            difficulty: "cet4",
            generationMode: "standard",
        })).toBeNull();
    });
});
