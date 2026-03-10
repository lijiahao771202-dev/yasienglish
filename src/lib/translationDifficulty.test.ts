import { describe, expect, it } from "vitest";

import {
    getTranslationDifficultyTarget,
    validateTranslationDifficulty,
} from "./translationDifficulty";

describe("translation difficulty targets", () => {
    it("matches the new lower targets at representative Elo breakpoints", () => {
        const cases = [
            { elo: 400, range: { min: 6, max: 7 }, tier: "青铜" },
            { elo: 799, range: { min: 8, max: 10 }, tier: "青铜" },
            { elo: 800, range: { min: 8, max: 10 }, tier: "白银" },
            { elo: 1040, range: { min: 10, max: 12 }, tier: "白银" },
            { elo: 1199, range: { min: 11, max: 13 }, tier: "白银" },
            { elo: 1200, range: { min: 11, max: 13 }, tier: "黄金" },
            { elo: 1599, range: { min: 15, max: 18 }, tier: "黄金" },
            { elo: 1600, range: { min: 15, max: 18 }, tier: "铂金" },
        ];

        for (const testCase of cases) {
            const target = getTranslationDifficultyTarget(testCase.elo);
            expect(target.tier.tier).toBe(testCase.tier);
            expect(target.wordRange).toEqual(testCase.range);
        }
    });

    it("increases target ranges monotonically inside a tier", () => {
        const sampleElos = [800, 860, 920, 980, 1040, 1100, 1160, 1199];
        let previousMin = 0;
        let previousMax = 0;

        for (const elo of sampleElos) {
            const target = getTranslationDifficultyTarget(elo);
            expect(target.wordRange.min).toBeGreaterThanOrEqual(previousMin);
            expect(target.wordRange.max).toBeGreaterThanOrEqual(previousMax);
            previousMin = target.wordRange.min;
            previousMax = target.wordRange.max;
        }
    });

    it("keeps the 1199 to 1200 handoff smooth", () => {
        const beforePromotion = getTranslationDifficultyTarget(1199);
        const afterPromotion = getTranslationDifficultyTarget(1200);

        expect(Math.abs(afterPromotion.wordRange.min - beforePromotion.wordRange.min)).toBeLessThanOrEqual(2);
        expect(Math.abs(afterPromotion.wordRange.max - beforePromotion.wordRange.max)).toBeLessThanOrEqual(2);
    });
});

describe("translation difficulty validation", () => {
    it("uses ±1 tolerance for lower tiers", () => {
        const validation = validateTranslationDifficulty("I checked the car engine carefully today", 820);

        expect(validation.wordRange).toEqual({ min: 8, max: 10 });
        expect(validation.validationRange).toEqual({ min: 7, max: 11 });
        expect(validation.status).toBe("MATCHED");
    });

    it("uses ±2 tolerance for higher tiers", () => {
        const validation = validateTranslationDifficulty(
            "Had I known the policy would change so abruptly, I would have postponed the entire proposal until every stakeholder had reviewed the revised terms.",
            2000,
        );

        expect(validation.wordRange).toEqual({ min: 20, max: 24 });
        expect(validation.validationRange).toEqual({ min: 18, max: 26 });
        expect(validation.status).toBe("MATCHED");
    });
});
