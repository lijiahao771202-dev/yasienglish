import { describe, expect, it } from "vitest";
import { normalizePhraseTranslationItems } from "./translation-phrases";

describe("normalizePhraseTranslationItems", () => {
    it("prefers compact meaningful spans over bloated clause fragments", () => {
        const sentence = "Marcus introduced Elena to the concept of metacognitive awareness in management.";

        expect(normalizePhraseTranslationItems([
            {
                source: "the concept of metacognitive awareness in management",
                translation: "管理中的元认知意识这一概念",
            },
            {
                source: "metacognitive awareness",
                translation: "元认知意识",
            },
            {
                source: "the",
                translation: "这个",
            },
        ], sentence)).toEqual([
            {
                source: "metacognitive awareness",
                translation: "元认知意识",
            },
        ]);
    });

    it("keeps a difficult single content word when the alternative spans are weak", () => {
        const sentence = "The committee tried to consolidate scattered evidence.";

        expect(normalizePhraseTranslationItems([
            {
                source: "the committee tried to consolidate",
                translation: "委员会试图去整合",
            },
            {
                source: "consolidate",
                translation: "整合；巩固",
            },
            {
                source: "the",
                translation: "这个",
            },
        ], sentence)).toEqual([
            {
                source: "consolidate",
                translation: "整合；巩固",
            },
        ]);
    });
});
