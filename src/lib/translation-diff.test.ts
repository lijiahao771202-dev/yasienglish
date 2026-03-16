import { describe, expect, it } from "vitest";

import { buildTranslationHighlights } from "./translation-diff";

describe("buildTranslationHighlights", () => {
    it("ignores punctuation-only and capitalization-only differences", () => {
        expect(buildTranslationHighlights("i found the wallet at the cinema", "I found the wallet at the cinema.")).toEqual([]);
    });

    it("keeps real wording differences", () => {
        expect(buildTranslationHighlights("I found the wallet at the cinema", "I found my lost wallet at the cinema.")).toEqual([
            {
                kind: "关键改错",
                before: "the",
                after: "my lost",
                note: "这里需要替换成更准确的表达。",
            },
        ]);
    });

    it("reports missing content after normalization", () => {
        expect(buildTranslationHighlights("I found the wallet", "I found the wallet at the cinema.")).toEqual([
            {
                kind: "缺失内容",
                before: "未写出",
                after: "at the cinema",
                note: "这部分补上后意思才完整。",
            },
        ]);
    });
});
