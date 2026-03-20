import { describe, expect, it } from "vitest";

import {
    computeCatGrowth,
    difficultyFromBand,
    levelFromScore,
    recommendBadges,
} from "./cat-growth";

describe("cat growth", () => {
    it("maps band ranges to difficulty", () => {
        expect(difficultyFromBand(1)).toBe("cet4");
        expect(difficultyFromBand(4)).toBe("cet6");
        expect(difficultyFromBand(7)).toBe("ielts");
    });

    it("derives level from score baseline", () => {
        expect(levelFromScore(1000)).toBe(1);
        expect(levelFromScore(1120)).toBe(2);
        expect(levelFromScore(1240)).toBe(3);
    });

    it("increases score and next band on strong performance", () => {
        const result = computeCatGrowth({
            score: 1000,
            level: 1,
            theta: 0,
            currentBand: 3,
            accuracy: 0.92,
            speedScore: 0.9,
            stabilityScore: 0.88,
        });

        expect(result.delta).toBeGreaterThan(0);
        expect(result.scoreAfter).toBeGreaterThan(1000);
        expect(result.nextBand).toBeGreaterThanOrEqual(3);
        expect(result.pointsDelta).toBeGreaterThanOrEqual(4);
    });

    it("applies soft rollback without immediate level downgrade", () => {
        const result = computeCatGrowth({
            score: 1200,
            level: 3,
            theta: 0.4,
            currentBand: 6,
            accuracy: 0.2,
            speedScore: 0.3,
            stabilityScore: 0.25,
        });

        expect(result.delta).toBeLessThan(0);
        expect(result.levelAfter).toBe(3);
        expect(result.scoreAfter).toBeGreaterThanOrEqual(1240);
        expect(result.nextBand).toBeLessThanOrEqual(5);
    });

    it("recommends level and performance badges", () => {
        const badges = recommendBadges({
            levelBefore: 1,
            levelAfter: 5,
            accuracy: 0.93,
            delta: 35,
        });

        expect(badges).toContain("cat_level_2");
        expect(badges).toContain("cat_level_5");
        expect(badges).toContain("cat_sharp_reader");
        expect(badges).toContain("cat_fast_rise");
    });
});
