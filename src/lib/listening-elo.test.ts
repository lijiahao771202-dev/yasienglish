import { describe, expect, it } from "vitest";

import {
    calculateListeningElo,
    getListeningEloBand,
    getListeningKFactor,
    normalizeListeningScore,
} from "./listening-elo";

describe("listening elo", () => {
    it("uses band-specific normalization thresholds", () => {
        expect(normalizeListeningScore(6.0, 600)).toBeCloseTo(0.5, 5);
        expect(normalizeListeningScore(6.3, 1200)).toBeCloseTo(0.5, 5);
        expect(normalizeListeningScore(6.6, 2200)).toBeCloseTo(0.5, 5);
    });

    it("maps elo ranges to the intended bands and k-factors", () => {
        expect(getListeningEloBand(600)).toBe("low");
        expect(getListeningEloBand(1200)).toBe("mid");
        expect(getListeningEloBand(2200)).toBe("high");
        expect(getListeningKFactor(600)).toBe(28);
        expect(getListeningKFactor(1200)).toBe(20);
        expect(getListeningKFactor(2200)).toBe(14);
    });

    it("makes same-difficulty low-band scores around 6.0 roughly break even", () => {
        expect(calculateListeningElo(600, 600, 5.0, 0).total).toBeLessThan(0);
        expect(calculateListeningElo(600, 600, 6.0, 0).total).toBe(0);
        expect(calculateListeningElo(600, 600, 7.0, 0).total).toBeGreaterThan(0);
    });

    it("makes same-difficulty mid and high bands stricter", () => {
        expect(calculateListeningElo(1200, 1200, 6.0, 0).total).toBeLessThan(0);
        expect(calculateListeningElo(1200, 1200, 6.3, 0).total).toBe(0);
        expect(calculateListeningElo(2200, 2200, 6.3, 0).total).toBeLessThan(0);
        expect(calculateListeningElo(2200, 2200, 6.6, 0).total).toBe(0);
    });

    it("does not let mid/high bands spike too hard on higher-difficulty 6.x scores", () => {
        expect(calculateListeningElo(1200, 1400, 6.3, 0).total).toBeLessThanOrEqual(5);
        expect(calculateListeningElo(2200, 2400, 6.6, 0).total).toBeLessThanOrEqual(4);
    });

    it("applies only a +1 streak bonus on positive results", () => {
        const withoutStreak = calculateListeningElo(1200, 1200, 7.5, 0);
        const withStreak = calculateListeningElo(1200, 1200, 7.5, 3);

        expect(withStreak.total - withoutStreak.total).toBe(1);
        expect(calculateListeningElo(1200, 1200, 5.5, 3).breakdown.streakBonus).toBe(false);
    });
});
