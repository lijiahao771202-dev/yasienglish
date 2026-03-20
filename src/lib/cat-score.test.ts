import { describe, expect, it } from "vitest";

import {
    CAT_RANK_TIERS,
    getTierLexicalProfile,
    validateArticleDifficulty,
    validateLexicalAudit,
    getCatQuizBlueprint,
    getCatRankTier,
    getCatScoreToNextRank,
} from "./cat-score";

const longDifficultyPassage = Array.from(
    { length: 12 },
    () =>
        "This article explains how a team plans a project, checks each milestone, and adjusts the work as new information appears. The tone stays measured, the logic stays clear, and the writing leaves enough room for careful reflection. Because the draft moves step by step, it creates a stable pattern for readers and reviewers.",
).join(" ");

describe("cat score model", () => {
    it("keeps exactly 17 rank tiers", () => {
        expect(CAT_RANK_TIERS).toHaveLength(17);
    });

    it("keeps exactly 17 lexical tiers", () => {
        expect(getTierLexicalProfile(0)).toMatchObject({
            tierId: "a0",
            coreDomain: expect.any(String),
            stretchDomain: expect.any(String),
            targetWordCountRange: expect.any(Array),
        });
        expect(getTierLexicalProfile(3200).tierId).toBe("master");
        expect(getTierLexicalProfile(199).tierId).toBe("a0");
        expect(getTierLexicalProfile(200).tierId).toBe("a1");
        expect(getTierLexicalProfile(3199).tierId).toBe("s2");
        expect(getTierLexicalProfile(3200).tierId).toBe("master");
    });

    it("maps boundary scores to expected ranks", () => {
        expect(getCatRankTier(199).index).toBe(1);
        expect(getCatRankTier(200).index).toBe(2);
        expect(getCatRankTier(3199).index).toBe(16);
        expect(getCatRankTier(3200).index).toBe(17);
    });

    it("maps score to lexical profile by tier boundary", () => {
        const lower = getTierLexicalProfile(799);
        const upper = getTierLexicalProfile(800);

        expect(lower.tierId).toBe("b1");
        expect(upper.tierId).toBe("b1_plus");
        expect(lower.targetWordCountRange[0]).toBeLessThanOrEqual(lower.targetWordCountRange[1]);
    });

    it("returns score distance to next rank", () => {
        expect(getCatScoreToNextRank(199)).toBe(1);
        expect(getCatScoreToNextRank(200)).toBe(200);
        expect(getCatScoreToNextRank(3200)).toBe(0);
    });

    it("uses score bands for CAT question count", () => {
        expect(getCatQuizBlueprint(100).questionCount).toBe(5);
        expect(getCatQuizBlueprint(900).questionCount).toBe(6);
        expect(getCatQuizBlueprint(2000).questionCount).toBe(7);
        expect(getCatQuizBlueprint(2600).questionCount).toBe(8);
    });

    it("always allocates at least one multiple_select and balanced total", () => {
        for (const score of [0, 799, 800, 1599, 1600, 2399, 2400, 5000]) {
            const blueprint = getCatQuizBlueprint(score);
            const total = Object.values(blueprint.distribution).reduce((sum, value) => sum + value, 0);
            expect(total).toBe(blueprint.questionCount);
            expect(blueprint.distribution.multiple_select).toBeGreaterThanOrEqual(1);
        }
    });

    it("validates lexical audit independently", () => {
        const result = validateLexicalAudit(
            {
                coreCoverage: 0.82,
                stretchCoverage: 0.16,
                overlevelPenalty: 0.08,
                confidence: 0.9,
            },
            getTierLexicalProfile(2000),
        );

        expect(result.isValid).toBe(true);
        expect(result.reasons).toHaveLength(0);
    });

    it("validates article difficulty with structure failure", () => {
        const result = validateArticleDifficulty({
            text: "Short. Tiny.",
            score: 2000,
            lexicalAuditResult: {
                coreCoverage: 0.9,
                stretchCoverage: 0.2,
                overlevelPenalty: 0.05,
                confidence: 0.9,
            },
        });

        expect(result.structure.isValid).toBe(false);
        expect(result.lexical.isValid).toBe(true);
        expect(result.isValid).toBe(false);
        expect(result.reasons.length).toBeGreaterThan(0);
    });

    it("validates article difficulty with lexical failure", () => {
        const result = validateArticleDifficulty({
            text: longDifficultyPassage,
            score: 2000,
            lexicalAuditResult: {
                coreCoverage: 0.4,
                stretchCoverage: 0.03,
                overlevelPenalty: 0.4,
                confidence: 0.3,
            },
        });

        expect(result.structure.isValid).toBe(true);
        expect(result.lexical.isValid).toBe(false);
        expect(result.isValid).toBe(false);
        expect(result.reasons.some((reason) => reason.includes("coverage"))).toBe(true);
    });

    it("validates article difficulty when both stages pass", () => {
        const result = validateArticleDifficulty({
            text: longDifficultyPassage,
            score: 2400,
            lexicalAuditResult: {
                coreCoverage: 0.86,
                stretchCoverage: 0.22,
                overlevelPenalty: 0.08,
                confidence: 0.95,
            },
        });

        expect(result.structure.isValid).toBe(true);
        expect(result.lexical.isValid).toBe(true);
        expect(result.isValid).toBe(true);
        expect(result.reasons).toHaveLength(0);
    });
});
