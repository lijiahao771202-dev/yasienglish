import { describe, expect, it } from "vitest";

import {
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
            difficult_sentences: [
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
    });

    it("returns fallback deep payload when tree is missing", () => {
        const sentence = "Scientists noticed the trend.";
        const sanitized = sanitizeGrammarDeepSentencePayload({}, sentence);
        expect(sanitized.retryRecommended).toBe(true);
        expect(sanitized.data.sentence).toBe(sentence);
        expect(sanitized.data.sentence_tree?.label).toBe("主句");
    });
});
