import { describe, expect, it } from "vitest";
import {
    buildAIGenerationRequestBody,
    formatLongformHistoryDescriptor,
    getLongformLengthTierMeta,
    getLongformStyleMeta,
    isQuizEligibleArticle,
    normalizeAIGenerationMode,
    normalizeLongformLengthTierId,
    normalizeLongformStyleId,
} from "./ai-reading-generation";

describe("ai reading generation helpers", () => {
    it("normalizes longform mode and its selectors", () => {
        expect(normalizeAIGenerationMode("longform")).toBe("longform");
        expect(normalizeAIGenerationMode("anything")).toBe("standard");
        expect(normalizeLongformStyleId("science")).toBe("science");
        expect(normalizeLongformStyleId("unknown")).toBeNull();
        expect(normalizeLongformLengthTierId("w1200")).toBe("w1200");
        expect(normalizeLongformLengthTierId("w42")).toBeNull();
    });

    it("returns style and length metadata for longform selections", () => {
        expect(getLongformStyleMeta("campus")).toEqual({
            id: "campus",
            name: "校园成长",
        });
        expect(getLongformLengthTierMeta("w1600")).toEqual({
            id: "w1600",
            label: "长篇",
            targetWordCount: 1600,
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
            longformStyleId: "science",
            lengthTierId: "w1200",
            injectedVocabulary: undefined,
        });
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
