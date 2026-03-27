import { describe, expect, it } from "vitest";

import { applyTranslationTooHardPenalty, TRANSLATION_TOO_HARD_PENALTY } from "./translation-elo";

describe("translation too-hard penalty", () => {
    it("applies the fixed -25 elo penalty by default", () => {
        expect(applyTranslationTooHardPenalty(500)).toBe(500 - TRANSLATION_TOO_HARD_PENALTY);
    });

    it("floors elo at 0", () => {
        expect(applyTranslationTooHardPenalty(10)).toBe(0);
    });
});
