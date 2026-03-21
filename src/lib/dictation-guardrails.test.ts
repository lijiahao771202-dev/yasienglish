import { describe, expect, it } from "vitest";

import {
    filterSemanticDictationErrorItems,
    isDictationPunctuationOnlyDifference,
    normalizeDictationScore,
} from "./dictation-guardrails";

describe("dictation guardrails", () => {
    it("rounds dictation scores to integers and clamps them", () => {
        expect(normalizeDictationScore(8.6)).toBe(9);
        expect(normalizeDictationScore("9.5")).toBe(10);
        expect(normalizeDictationScore(15)).toBe(10);
        expect(normalizeDictationScore(-2)).toBe(0);
    });

    it("forces punctuation-only differences to the top score", () => {
        expect(normalizeDictationScore(6.2, { punctuationOnly: true })).toBe(10);
        expect(isDictationPunctuationOnlyDifference("我昨天去了超市", "我昨天去了超市。")).toBe(true);
    });

    it("filters punctuation-only dictation errors while keeping semantic ones", () => {
        expect(
            filterSemanticDictationErrorItems([
                {
                    error: "少了句号",
                    correction: "补上句号",
                    rule: "标点",
                    tip: "断句清楚。",
                },
                {
                    error: "漏了否定",
                    correction: "补上不",
                    rule: "否定信息缺失",
                    tip: "注意语义反转。",
                },
            ]),
        ).toEqual([
            {
                error: "漏了否定",
                correction: "补上不",
                rule: "否定信息缺失",
                tip: "注意语义反转。",
            },
        ]);
    });
});
