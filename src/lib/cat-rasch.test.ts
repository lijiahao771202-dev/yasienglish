import { describe, expect, it } from "vitest";
import { normalizeThetaFromScore, runCatRaschSession } from "./cat-rasch";

describe("cat rasch", () => {
    it("normalizes score to theta across 0-3200 and beyond", () => {
        expect(normalizeThetaFromScore(0)).toBeCloseTo(-3, 3);
        expect(normalizeThetaFromScore(1600)).toBeCloseTo(0, 3);
        expect(normalizeThetaFromScore(3200)).toBeCloseTo(3, 3);
        expect(normalizeThetaFromScore(3600)).toBeGreaterThan(3);
    });

    it("increases theta and score on strong responses with challenge items", () => {
        const result = runCatRaschSession({
            scoreBefore: 1200,
            thetaBefore: -0.4,
            minItems: 5,
            maxItems: 8,
            targetSe: 0.46,
            responses: [
                { itemId: "1", order: 1, correct: true, latencyMs: 8000, itemDifficulty: -0.3 },
                { itemId: "2", order: 2, correct: true, latencyMs: 9000, itemDifficulty: -0.1 },
                { itemId: "3", order: 3, correct: true, latencyMs: 9000, itemDifficulty: 0.1 },
                { itemId: "4", order: 4, correct: true, latencyMs: 10000, itemDifficulty: 0.2 },
                { itemId: "5", order: 5, correct: true, latencyMs: 11000, itemDifficulty: 0.35 },
                { itemId: "6", order: 6, correct: true, latencyMs: 12000, itemDifficulty: 0.45 },
            ],
        });

        expect(result.delta).toBeGreaterThan(0);
        expect(result.scoreAfter).toBeGreaterThan(1200);
        expect(result.thetaAfter).toBeGreaterThan(-0.4);
        expect(result.usedItemCount).toBeGreaterThanOrEqual(5);
    });

    it("drops score on weak responses against easy items", () => {
        const result = runCatRaschSession({
            scoreBefore: 1800,
            thetaBefore: 0.4,
            minItems: 5,
            maxItems: 8,
            targetSe: 0.46,
            responses: [
                { itemId: "1", order: 1, correct: false, latencyMs: 9000, itemDifficulty: -0.5 },
                { itemId: "2", order: 2, correct: false, latencyMs: 9000, itemDifficulty: -0.3 },
                { itemId: "3", order: 3, correct: false, latencyMs: 9000, itemDifficulty: -0.2 },
                { itemId: "4", order: 4, correct: false, latencyMs: 9000, itemDifficulty: -0.1 },
                { itemId: "5", order: 5, correct: false, latencyMs: 9000, itemDifficulty: 0 },
            ],
        });

        expect(result.delta).toBeLessThanOrEqual(0);
        expect(result.scoreAfter).toBeLessThanOrEqual(1800);
        expect(result.thetaAfter).toBeLessThanOrEqual(0.4);
    });

    it("applies low-confidence quality scaling", () => {
        const normal = runCatRaschSession({
            scoreBefore: 1400,
            thetaBefore: -0.1,
            qualityTier: "ok",
            minItems: 5,
            maxItems: 8,
            targetSe: 0.46,
            responses: [
                { itemId: "1", order: 1, correct: true, latencyMs: 9000, itemDifficulty: 0 },
                { itemId: "2", order: 2, correct: true, latencyMs: 9000, itemDifficulty: 0.1 },
                { itemId: "3", order: 3, correct: true, latencyMs: 9000, itemDifficulty: 0.2 },
                { itemId: "4", order: 4, correct: true, latencyMs: 9000, itemDifficulty: 0.3 },
                { itemId: "5", order: 5, correct: true, latencyMs: 9000, itemDifficulty: 0.4 },
            ],
        });
        const degraded = runCatRaschSession({
            scoreBefore: 1400,
            thetaBefore: -0.1,
            qualityTier: "low_confidence",
            minItems: 5,
            maxItems: 8,
            targetSe: 0.46,
            responses: [
                { itemId: "1", order: 1, correct: true, latencyMs: 9000, itemDifficulty: 0 },
                { itemId: "2", order: 2, correct: true, latencyMs: 9000, itemDifficulty: 0.1 },
                { itemId: "3", order: 3, correct: true, latencyMs: 9000, itemDifficulty: 0.2 },
                { itemId: "4", order: 4, correct: true, latencyMs: 9000, itemDifficulty: 0.3 },
                { itemId: "5", order: 5, correct: true, latencyMs: 9000, itemDifficulty: 0.4 },
            ],
        });

        expect(degraded.delta).toBeLessThanOrEqual(normal.delta);
    });

    it("does not stop before minItems=2 and can stop at second item when precision reached", () => {
        const result = runCatRaschSession({
            scoreBefore: 200,
            thetaBefore: -2.6,
            seBefore: 0.4,
            minItems: 2,
            maxItems: 4,
            targetSe: 0.62,
            responses: [
                { itemId: "1", order: 1, correct: true, latencyMs: 7000, itemDifficulty: -2.7 },
                { itemId: "2", order: 2, correct: true, latencyMs: 7000, itemDifficulty: -2.5 },
                { itemId: "3", order: 3, correct: true, latencyMs: 7000, itemDifficulty: -2.4 },
            ],
        });

        expect(result.usedItemCount).toBeGreaterThanOrEqual(2);
        expect(result.usedItemCount).toBeLessThanOrEqual(4);
        expect(result.stopReason).not.toBe("insufficient_items");
    });
});
