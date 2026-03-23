import { describe, expect, it } from "vitest";

import {
    buildRebuildDisplaySentence,
    buildRebuildTokenBank,
    clampRebuildDifficultyDelta,
    collectRebuildDistractors,
    evaluateRebuildSelection,
    getRebuildPracticeTier,
    getRebuildSoftTimeLimitMs,
    getRebuildSystemAssessment,
    getRebuildSystemDelta,
    getRebuildSystemAssessmentLabel,
    getRebuildSelfEvaluationDelta,
    tokenizeRebuildSentence,
} from "@/lib/rebuild-mode";

describe("rebuild mode helpers", () => {
    it("tokenizes listening sentences with punctuation attached", () => {
        expect(tokenizeRebuildSentence("Please leave the keys on the desk.")).toEqual([
            "Please",
            "leave",
            "the",
            "keys",
            "on",
            "the",
            "desk.",
        ]);
    });

    it("builds distractors without duplicating answer tokens", () => {
        const answerTokens = tokenizeRebuildSentence("Please bring the menu to the counter after practice today.");
        const distractors = collectRebuildDistractors({
            answerTokens,
            effectiveElo: 1200,
            relatedBankTokens: ["desk", "review", "manager", "manual", "station"],
            random: () => 0.4,
        });

        expect(distractors.length).toBeGreaterThanOrEqual(3);
        expect(distractors.length).toBeLessThanOrEqual(4);
        expect(distractors.every((token) => token.trim().length > 0)).toBe(true);
        expect(distractors.some((token) => answerTokens.includes(token))).toBe(false);
    });

    it("creates a token bank with answer and distractor tokens", () => {
        const answerTokens = ["Please", "send", "the", "photo"];
        const distractors = ["manual", "team"];
        const tokenBank = buildRebuildTokenBank({ answerTokens, distractorTokens: distractors, random: () => 0.5 });

        expect(tokenBank).toHaveLength(6);
        expect(tokenBank.filter((token) => answerTokens.includes(token))).toHaveLength(4);
    });

    it("evaluates correct rebuild answers exactly", () => {
        const answerTokens = ["Please", "send", "the", "photo"];
        const result = evaluateRebuildSelection({
            answerTokens,
            selectedTokens: ["Please", "send", "the", "photo"],
        });

        expect(result.isCorrect).toBe(true);
        expect(result.correctCount).toBe(4);
        expect(result.contentWordHitRate).toBe(1);
        expect(result.tailCoverage).toBe(1);
        expect(result.tokenFeedback.every((token) => token.status === "correct")).toBe(true);
    });

    it("marks distractors and missing words on incorrect rebuild answers", () => {
        const answerTokens = ["Please", "send", "the", "photo"];
        const result = evaluateRebuildSelection({
            answerTokens,
            selectedTokens: ["Please", "manual", "the", "send"],
        });

        expect(result.isCorrect).toBe(false);
        expect(result.distractorCount).toBe(1);
        expect(result.missingCount).toBe(1);
        expect(result.tokenFeedback.some((token) => token.status === "distractor")).toBe(true);
        expect(result.tokenFeedback.some((token) => token.status === "missing")).toBe(true);
    });

    it("tracks content words and tail coverage separately", () => {
        const answerTokens = tokenizeRebuildSentence("Please bring the menu to the counter after practice today.");
        const result = evaluateRebuildSelection({
            answerTokens,
            selectedTokens: ["Please", "bring", "the", "menu", "to", "the", "window", "later"],
        });

        expect(result.accuracyRatio).toBeCloseTo(0.6, 5);
        expect(result.contentWordHitRate).toBeCloseTo(0.5, 5);
        expect(result.tailCoverage).toBeCloseTo(0, 5);
        expect(result.distractorPickRatio).toBeCloseTo(0.25, 5);
    });

    it("builds an inline repaired display sentence for incorrect answers", () => {
        const answerTokens = tokenizeRebuildSentence("Meet me by the front gate after class.");
        const evaluation = evaluateRebuildSelection({
            answerTokens,
            selectedTokens: ["Meet", "gate", "by", "the", "front", "before", "class.", "after"],
        });
        const display = buildRebuildDisplaySentence({ answerTokens, evaluation });

        expect(display.tokens.map((token) => token.kind)).toEqual([
            "correct",
            "misplaced",
            "correct",
            "correct",
            "correct",
            "replacement",
            "misplaced",
            "misplaced",
        ]);
        expect(display.tokens[1]).toMatchObject({ text: "me", originalText: "gate" });
        expect(display.tokens[5]).toMatchObject({ text: "gate", originalText: "before" });
        expect(display.tokens[6]).toMatchObject({ text: "after", originalText: "class." });
        expect(display.tokens[7]).toMatchObject({ text: "class.", originalText: "after" });
    });

    it("computes hidden difficulty deltas from self-eval and rich system signals", () => {
        const delta = clampRebuildDifficultyDelta(
            getRebuildSelfEvaluationDelta("easy")
            + getRebuildSystemDelta({
                accuracyRatio: 1,
                completionRatio: 1,
                misplacementRatio: 0,
                distractorPickRatio: 0,
                contentWordHitRate: 1,
                tailCoverage: 1,
                replayCount: 1,
                tokenEditCount: 1,
                exceededSoftLimit: false,
                skipped: false,
            }),
        );

        expect(delta).toBe(44);
        expect(getRebuildSystemAssessment(delta)).toBe("too_easy");
        expect(getRebuildSystemAssessmentLabel("too_easy")).toBe("偏简单");
    });

    it("penalizes hard, incomplete, slow, skipped attempts", () => {
        const delta = clampRebuildDifficultyDelta(
            getRebuildSelfEvaluationDelta("hard")
            + getRebuildSystemDelta({
                accuracyRatio: 0.2,
                completionRatio: 0.25,
                misplacementRatio: 0.5,
                distractorPickRatio: 0.5,
                contentWordHitRate: 0.2,
                tailCoverage: 0,
                replayCount: 5,
                tokenEditCount: 6,
                exceededSoftLimit: true,
                skipped: true,
            }),
        );

        expect(delta).toBe(-65);
        expect(getRebuildSystemAssessment(delta)).toBe("too_hard");
    });

    it("treats partial, low-quality submissions as harder even without skip", () => {
        const delta = getRebuildSystemDelta({
            accuracyRatio: 0.5,
            completionRatio: 0.4,
            misplacementRatio: 0.3,
            distractorPickRatio: 0.25,
            contentWordHitRate: 0.4,
            tailCoverage: 0.25,
            replayCount: 2,
            tokenEditCount: 5,
            exceededSoftLimit: false,
            skipped: false,
        });

        expect(delta).toBe(-65);
        expect(getRebuildSystemAssessment(delta)).toBe("too_hard");
    });

    it("keeps medium-quality attempts roughly matched", () => {
        const delta = getRebuildSystemDelta({
            accuracyRatio: 0.72,
            completionRatio: 0.88,
            misplacementRatio: 0.12,
            distractorPickRatio: 0.1,
            contentWordHitRate: 0.78,
            tailCoverage: 0.7,
            replayCount: 3,
            tokenEditCount: 2,
            exceededSoftLimit: false,
            skipped: false,
        });

        expect(delta).toBe(0);
        expect(getRebuildSystemAssessment(delta)).toBe("matched");
    });

    it("maps practice tiers by hidden elo", () => {
        expect(getRebuildPracticeTier(610)).toEqual({
            cefr: "A2-",
            bandPosition: "mid",
            label: "A2- · mid",
        });
        expect(getRebuildPracticeTier(1810)).toEqual({
            cefr: "B2",
            bandPosition: "mid",
            label: "B2 · mid",
        });
    });

    it("uses more generous soft time limits by elo band", () => {
        expect(getRebuildSoftTimeLimitMs(7, 300)).toBe(52000);
        expect(getRebuildSoftTimeLimitMs(10, 1200)).toBe(75000);
        expect(getRebuildSoftTimeLimitMs(12, 2200)).toBe(98000);
    });
});
