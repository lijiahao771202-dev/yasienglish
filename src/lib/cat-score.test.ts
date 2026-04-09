import { describe, expect, it } from "vitest";

import {
    CAT_RANK_TIERS,
    getCatArticleTargets,
    getTierLexicalProfile,
    validateArticleDifficulty,
    validateCatArticleAgainstTargets,
    validateLexicalAudit,
    getCatQuizBlueprint,
    getCatSessionPolicy,
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

    it("maps score to three-axis article targets by boundary", () => {
        expect(getCatArticleTargets(599).lexicalTarget.coreTier).toBe("high_school");
        expect(getCatArticleTargets(600).lexicalTarget.coreTier).toBe("cet4");
        expect(getCatArticleTargets(1199).lexicalTarget.coreTier).toBe("cet4");
        expect(getCatArticleTargets(1200).lexicalTarget.coreTier).toBe("cet6");
        expect(getCatArticleTargets(1799).lexicalTarget.coreTier).toBe("cet6");
        expect(getCatArticleTargets(1800).lexicalTarget.coreTier).toBe("tem4_ielts6");
        expect(getCatArticleTargets(2599).lexicalTarget.coreTier).toBe("tem4_ielts6");
        expect(getCatArticleTargets(2600).lexicalTarget.coreTier).toBe("tem8_ielts7");
        expect(getCatArticleTargets(3199).lexicalTarget.coreTier).toBe("tem8_ielts7");
        expect(getCatArticleTargets(3200).lexicalTarget.coreTier).toBe("tem8plus_ielts8");

        expect(getCatArticleTargets(100).lengthTarget).toEqual({ wordCountMin: 180, wordCountMax: 240 });
        expect(getCatArticleTargets(500).lengthTarget).toEqual({ wordCountMin: 220, wordCountMax: 300 });
        expect(getCatArticleTargets(700).lengthTarget).toEqual({ wordCountMin: 280, wordCountMax: 360 });
        expect(getCatArticleTargets(900).lengthTarget).toEqual({ wordCountMin: 360, wordCountMax: 440 });
        expect(getCatArticleTargets(1100).lengthTarget).toEqual({ wordCountMin: 420, wordCountMax: 520 });
        expect(getCatArticleTargets(1300).lengthTarget).toEqual({ wordCountMin: 460, wordCountMax: 560 });
        expect(getCatArticleTargets(1500).lengthTarget).toEqual({ wordCountMin: 520, wordCountMax: 620 });
        expect(getCatArticleTargets(1700).lengthTarget).toEqual({ wordCountMin: 560, wordCountMax: 680 });
        expect(getCatArticleTargets(1900).lengthTarget).toEqual({ wordCountMin: 600, wordCountMax: 720 });
        expect(getCatArticleTargets(2100).lengthTarget).toEqual({ wordCountMin: 640, wordCountMax: 780 });
        expect(getCatArticleTargets(2300).lengthTarget).toEqual({ wordCountMin: 700, wordCountMax: 850 });
        expect(getCatArticleTargets(2500).lengthTarget).toEqual({ wordCountMin: 760, wordCountMax: 900 });
        expect(getCatArticleTargets(2700).lengthTarget).toEqual({ wordCountMin: 820, wordCountMax: 980 });
        expect(getCatArticleTargets(2900).lengthTarget).toEqual({ wordCountMin: 880, wordCountMax: 1040 });
        expect(getCatArticleTargets(3100).lengthTarget).toEqual({ wordCountMin: 920, wordCountMax: 1100 });
        expect(getCatArticleTargets(3400).lengthTarget).toEqual({ wordCountMin: 980, wordCountMax: 1200 });
    });

    it("returns score distance to next rank", () => {
        expect(getCatScoreToNextRank(199)).toBe(1);
        expect(getCatScoreToNextRank(200)).toBe(200);
        expect(getCatScoreToNextRank(3200)).toBe(0);
    });

    it("maps dynamic CAT session policy by score bands", () => {
        expect(getCatSessionPolicy(100)).toMatchObject({ minItems: 2, maxItems: 4, targetSe: 0.62 });
        expect(getCatSessionPolicy(1000)).toMatchObject({ minItems: 3, maxItems: 5, targetSe: 0.56 });
        expect(getCatSessionPolicy(1800)).toMatchObject({ minItems: 4, maxItems: 6, targetSe: 0.5 });
        expect(getCatSessionPolicy(2300)).toMatchObject({ minItems: 5, maxItems: 7, targetSe: 0.46 });
        expect(getCatSessionPolicy(2800)).toMatchObject({ minItems: 6, maxItems: 8, targetSe: 0.42 });
        expect(getCatSessionPolicy(3300)).toMatchObject({ minItems: 6, maxItems: 8, targetSe: 0.38 });
    });

    it("uses max items as CAT quiz pool size", () => {
        expect(getCatQuizBlueprint(100).questionCount).toBe(4);
        expect(getCatQuizBlueprint(900).questionCount).toBe(5);
        expect(getCatQuizBlueprint(1800).questionCount).toBe(6);
        expect(getCatQuizBlueprint(2300).questionCount).toBe(7);
        expect(getCatQuizBlueprint(2600).questionCount).toBe(8);
    });

    it("removes multiple_select in low score segments and enables it in high segments", () => {
        for (const score of [0, 799, 800, 1399]) {
            const blueprint = getCatQuizBlueprint(score);
            expect(blueprint.allowedTypes.includes("multiple_select")).toBe(false);
            expect(blueprint.distribution.multiple_select).toBe(0);
        }

        for (const score of [2000, 2600, 5000]) {
            const blueprint = getCatQuizBlueprint(score);
            const total = Object.values(blueprint.distribution).reduce((sum, value) => sum + value, 0);
            expect(total).toBe(blueprint.questionCount);
            expect(blueprint.allowedTypes.includes("multiple_select")).toBe(true);
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

    it("validates three-axis targets with detailed pass/fail reasons", () => {
        const targets = getCatArticleTargets(1000);
        const simpleSentence = "Students read detailed practice passages and record concise notes in a structured learning journal.";
        const complexSentence = "Learners improve steadily because daily review builds reliable memory for core language patterns.";
        const multiClauseSentence =
            "Progress remains stable because the class tracks errors while each member keeps consistent study notes every day.";
        const passText = [
            ...Array.from({ length: 26 }, () => simpleSentence),
            ...Array.from({ length: 8 }, () => complexSentence),
            ...Array.from({ length: 2 }, () => multiClauseSentence),
        ].join(" ");

        const pass = validateCatArticleAgainstTargets({
            text: passText,
            score: 1000,
            targets,
            lexicalMix: {
                lower: 0.18,
                core: 0.66,
                stretch: 0.13,
                overlevel: 0.03,
            },
            lexicalEvidence: {
                lower: ["students", "class"],
                core: ["practice", "memory", "review"],
                stretch: ["journal", "context"],
                overlevel: ["outcomes"],
            },
        });

        expect(pass.passed).toBe(true);
        expect(pass.reasons).toHaveLength(0);
        expect(pass.dimensions.syntax.complexSentenceRatio).toBeGreaterThan(0);

        const fail = validateCatArticleAgainstTargets({
            text: "Short text. Very easy sentence.",
            score: 1000,
            targets,
            lexicalMix: {
                lower: 0.01,
                core: 0.2,
                stretch: 0.2,
                overlevel: 0.59,
            },
            lexicalEvidence: {
                lower: [],
                core: [],
                stretch: [],
                overlevel: [],
            },
        });

        expect(fail.passed).toBe(false);
        expect(fail.dimensions.length.passed).toBe(false);
        expect(fail.dimensions.lexical.passed).toBe(false);
        expect(fail.reasons.some((reason) => reason.includes("overlevel"))).toBe(true);
    });
});
