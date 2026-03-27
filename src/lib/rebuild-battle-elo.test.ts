import { describe, expect, it } from "vitest";

import { calculateRebuildBattleElo } from "./rebuild-battle-elo";

describe("rebuild battle elo", () => {
    it("follows sentence-style rebuild delta: systemDelta + selfDelta", () => {
        const result = calculateRebuildBattleElo({
            playerElo: 600,
            sessionSystemDelta: -18,
            selfEvaluation: "hard",
            streak: 0,
        });

        expect(result.total).toBe(-40);
        expect(result.breakdown.systemDelta).toBe(-18);
        expect(result.breakdown.selfDelta).toBe(-22);
        expect(result.breakdown.clampedDelta).toBe(-40);
    });

    it("applies rebuild clamp limits (-65 ~ +48)", () => {
        const tooLow = calculateRebuildBattleElo({
            playerElo: 1200,
            sessionSystemDelta: -60,
            selfEvaluation: "hard",
            streak: 0,
        });
        const tooHigh = calculateRebuildBattleElo({
            playerElo: 1200,
            sessionSystemDelta: 40,
            selfEvaluation: "easy",
            streak: 0,
        });

        expect(tooLow.total).toBe(-65);
        expect(tooHigh.total).toBe(48);
    });

    it("does not reuse listening streak bonus", () => {
        const withoutStreak = calculateRebuildBattleElo({
            playerElo: 900,
            sessionSystemDelta: 10,
            selfEvaluation: "just_right",
            streak: 0,
        });
        const withStreak = calculateRebuildBattleElo({
            playerElo: 900,
            sessionSystemDelta: 10,
            selfEvaluation: "just_right",
            streak: 7,
        });

        expect(withStreak.total).toBe(withoutStreak.total);
        expect(withStreak.breakdown.streakBonus).toBe(false);
    });
});
