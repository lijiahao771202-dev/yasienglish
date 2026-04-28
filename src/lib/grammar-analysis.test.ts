import { describe, expect, it } from "vitest";

import {
    buildGrammarBasicPrompt,
    buildGrammarDeepPrompt,
    buildGrammarCacheKey,
    sanitizeGrammarBasicPayload,
    sanitizeGrammarDeepSentencePayload,
    splitGrammarSentences,
} from "./grammar-analysis";

describe("grammar analysis helpers", () => {
    it("builds stable cache key from normalized text and request dimensions", () => {
        const first = buildGrammarCacheKey({
            text: "Hello   world.",
            mode: "basic",
            promptVersion: "v1",
            model: "m1",
        });
        const second = buildGrammarCacheKey({
            text: "Hello world.",
            mode: "basic",
            promptVersion: "v1",
            model: "m1",
        });
        const third = buildGrammarCacheKey({
            text: "Hello world.",
            mode: "deep",
            promptVersion: "v1",
            model: "m1",
        });

        expect(first).toBe(second);
        expect(third).not.toBe(first);
    });

    it("sanitizes partial basic payload with sentence-level fallback", () => {
        const text = "First sentence. Second sentence!";
        const sanitized = sanitizeGrammarBasicPayload({
            tags: ["主语"],
            sentences: [
                {
                    sentence: "First sentence.",
                    translation: "第一句。",
                    highlights: [
                        {
                            substring: "First",
                            type: "主语",
                            explanation: "句首成分",
                        },
                    ],
                },
            ],
        }, text);

        expect(splitGrammarSentences(text)).toHaveLength(2);
        expect(sanitized.data.difficult_sentences).toHaveLength(2);
        expect(sanitized.data.difficult_sentences[0].highlights.length).toBeGreaterThan(0);
        expect(sanitized.data.difficult_sentences[1].sentence).toBe("Second sentence!");
        expect(sanitized.retryRecommended).toBe(true);
        expect(sanitized.qualityScore).toBeGreaterThan(0);
    });

    it("returns fallback deep payload when tree is missing", () => {
        const sentence = "Scientists noticed the trend.";
        const sanitized = sanitizeGrammarDeepSentencePayload({}, sentence);
        expect(sanitized.retryRecommended).toBe(true);
        expect(sanitized.data.sentence).toBe(sentence);
        expect(sanitized.data.sentence_tree?.label).toBe("主句");
        expect(sanitized.qualityScore).toBe(0.4);
    });

    it("upgrades weak highlight explanations and contextual segment meaning", () => {
        const sentence = "That piece of paper was the main signal to employers.";
        const sanitized = sanitizeGrammarBasicPayload({
            tags: ["语法"],
            overview: "句子分析",
            difficult_sentences: [
                {
                    sentence,
                    translation: "那张纸曾是给雇主的主要信号。",
                    highlights: [
                        {
                            substring: "That piece of paper",
                            type: "subject",
                            explanation: "语法功能",
                        },
                    ],
                },
            ],
        }, sentence);

        const first = sanitized.data.difficult_sentences[0].highlights[0];
        expect(first.type).toBe("主语");
        expect(first.explanation).toContain("结构判断");
        expect(first.explanation).toContain("句中作用");
        expect(first.segment_translation).toContain("本句");
    });

    it("contains stronger generation constraints in prompts", () => {
        const basicPrompt = buildGrammarBasicPrompt("Sample sentence.");
        const deepPrompt = buildGrammarDeepPrompt("Sample sentence.");

        expect(basicPrompt).toContain("Every highlight.explanation MUST use very plain Chinese for learners with weak grammar.");
        expect(basicPrompt).toContain("If a grammar term is hard, immediately explain it in simpler words.");
        expect(basicPrompt).toContain("segment_translation MUST be contextual");
        expect(basicPrompt).toContain("FEW-SHOT EXAMPLE 1");
        expect(basicPrompt).toContain("clause-first workflow");
        expect(basicPrompt).toContain('"sentences": [');
        expect(basicPrompt).toContain("Do not skip short, simple, or summary-like sentences.");
        expect(deepPrompt).toContain("avoid vague generic text");
        expect(deepPrompt).toContain("FEW-SHOT EXAMPLE");
        expect(deepPrompt).toContain("Identify the main clause first");
    });
});
