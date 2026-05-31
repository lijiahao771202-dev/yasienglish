import { describe, expect, it } from "vitest";
import {
    buildAIGenerationRequestBody,
    DEFAULT_AI_GENERATION_RAG_SELECTION,
    formatLongformHistoryDescriptor,
    getStrictRagLimit,
    getLongformLengthTierMeta,
    getLongformStyleMeta,
    isAIGenerationArticleCompleted,
    isQuizEligibleArticle,
    normalizeAIGenerationMode,
    normalizeAIGenerationRagMode,
    normalizeAIGenerationRagSource,
    normalizeLongformLengthTierId,
    normalizeLongformTrack,
    normalizeLongformStyleId,
    resolveAIGenerationArticleCompletedAt,
    shouldAutoCompleteNoQuizAIGenerationArticle,
} from "./ai-reading-generation";

describe("ai reading generation helpers", () => {
    it("normalizes longform mode and its selectors", () => {
        expect(normalizeAIGenerationMode("longform")).toBe("longform");
        expect(normalizeAIGenerationMode("anything")).toBe("standard");
        expect(normalizeLongformTrack("native")).toBe("native");
        expect(normalizeLongformTrack("exam")).toBe("exam");
        expect(normalizeLongformTrack("anything")).toBe("exam");
        expect(normalizeLongformStyleId("science")).toBe("science");
        expect(normalizeLongformStyleId("custom")).toBe("custom");
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
        expect(getLongformStyleMeta("custom")).toEqual({
            id: "custom",
            name: "自定义风格",
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
            longformStyleId: "custom",
            lengthTierId: "w1200",
            customStylePrompt: "Explain the theory clearly in simple language.",
            injectedVocabulary: [],
        })).toEqual({
            topic: "science habits",
            topicSeed: { topicLine: "公众科学 · Science habits" },
            difficulty: "cet6",
            generationMode: "longform",
            longformTrack: "exam",
            ragMode: "reference",
            ragSource: "hybrid",
            longformStyleId: "custom",
            lengthTierId: "w1200",
            customStylePrompt: "Explain the theory clearly in simple language.",
            injectedVocabulary: undefined,
        });

        expect(buildAIGenerationRequestBody({
            topic: "city notebooks",
            generationMode: "longform",
            longformTrack: "native",
            longformStyleId: "reportage",
            lengthTierId: "w2200",
            customStylePrompt: "Natural, magazine-like, scene-rich prose.",
            injectedVocabulary: ["texture", "street-level"],
        })).toEqual({
            topic: "city notebooks",
            topicSeed: undefined,
            difficulty: undefined,
            generationMode: "longform",
            longformTrack: "native",
            ragMode: "reference",
            ragSource: "hybrid",
            longformStyleId: "reportage",
            lengthTierId: "w2200",
            customStylePrompt: "Natural, magazine-like, scene-rich prose.",
            injectedVocabulary: ["texture", "street-level"],
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

    it("treats quiz submissions and reading completion timestamps as valid AI completion signals", () => {
        expect(isAIGenerationArticleCompleted({
            quizCompleted: true,
        })).toBe(true);

        expect(isAIGenerationArticleCompleted({
            quizCompleted: false,
            readingCompletedAt: 1710000000000,
        })).toBe(true);

        expect(isAIGenerationArticleCompleted({
            quizCompleted: false,
        })).toBe(false);

        expect(resolveAIGenerationArticleCompletedAt({
            quizCompleted: false,
            readingCompletedAt: 1710000000000,
        })).toBe(1710000000000);

        expect(resolveAIGenerationArticleCompletedAt({
            quizCompleted: true,
        }, 1711000000000)).toBe(1711000000000);
    });

    it("requires both near-bottom scroll and minimum reading time before auto-completing no-quiz AI articles", () => {
        const article = {
            isAIGenerated: true,
            difficulty: "ielts" as const,
            quizEligible: false,
        };

        expect(shouldAutoCompleteNoQuizAIGenerationArticle({
            article,
            scrollProgress: 0.95,
            articleStartedAt: 1_000,
            now: 25_000,
            scrollThreshold: 0.92,
            minReadingMs: 30_000,
        })).toBe(false);

        expect(shouldAutoCompleteNoQuizAIGenerationArticle({
            article,
            scrollProgress: 0.78,
            articleStartedAt: 1_000,
            now: 35_000,
            scrollThreshold: 0.92,
            minReadingMs: 30_000,
        })).toBe(false);

        expect(shouldAutoCompleteNoQuizAIGenerationArticle({
            article,
            scrollProgress: 0.95,
            articleStartedAt: 1_000,
            now: 35_000,
            scrollThreshold: 0.92,
            minReadingMs: 30_000,
        })).toBe(true);
    });

    it("does not auto-complete quiz articles, completed articles, or articles without a reading start time", () => {
        expect(shouldAutoCompleteNoQuizAIGenerationArticle({
            article: {
                isAIGenerated: true,
                difficulty: "cet6",
                quizEligible: true,
            },
            scrollProgress: 0.95,
            articleStartedAt: 1_000,
            now: 35_000,
            scrollThreshold: 0.92,
            minReadingMs: 30_000,
        })).toBe(false);

        expect(shouldAutoCompleteNoQuizAIGenerationArticle({
            article: {
                isAIGenerated: true,
                difficulty: "cet6",
                quizEligible: false,
                readingCompletedAt: 1710000000000,
            },
            scrollProgress: 0.95,
            articleStartedAt: 1_000,
            now: 35_000,
            scrollThreshold: 0.92,
            minReadingMs: 30_000,
        })).toBe(false);

        expect(shouldAutoCompleteNoQuizAIGenerationArticle({
            article: {
                isAIGenerated: true,
                difficulty: "cet6",
                quizEligible: false,
            },
            scrollProgress: 0.95,
            articleStartedAt: null,
            now: 35_000,
            scrollThreshold: 0.92,
            minReadingMs: 30_000,
        })).toBe(false);
    });

    it("formats longform history descriptors with difficulty, mode, style, and target length", () => {
        expect(formatLongformHistoryDescriptor({
            difficulty: "cet6",
            generationMode: "longform",
            longformTrack: "exam",
            longformStyle: { name: "科普" },
            lengthTier: { targetWordCount: 1200 },
        })).toBe("六级 · 长文 · 科普 · 1200词");

        expect(formatLongformHistoryDescriptor({
            generationMode: "longform",
            longformTrack: "native",
            longformStyle: { name: "现场报道" },
            lengthTier: { targetWordCount: 2200 },
        })).toBe("母语者 · 长文 · 现场报道 · 2200词");

        expect(formatLongformHistoryDescriptor({
            difficulty: "cet4",
            generationMode: "standard",
        })).toBeNull();
    });
});
