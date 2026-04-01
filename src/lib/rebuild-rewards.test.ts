import { describe, expect, it } from "vitest";

import {
    calculatePassageRebuildRewards,
    calculateSentenceRebuildRewards,
    rollRebuildDropReward,
    shouldTriggerPassageRebuildGacha,
    shouldTriggerSentenceRebuildGacha,
} from "./rebuild-rewards";

describe("rebuild rewards", () => {
    it("gives sentence rebuild a 5-coin floor even for weak attempts", () => {
        expect(
            calculateSentenceRebuildRewards({
                evaluation: {
                    isCorrect: false,
                    correctCount: 2,
                    misplacedCount: 2,
                    distractorCount: 1,
                    missingCount: 3,
                    totalCount: 8,
                    accuracyRatio: 0.25,
                    completionRatio: 0.5,
                    misplacementRatio: 0.5,
                    distractorPickRatio: 0.2,
                    contentWordHitRate: 0.3,
                    tailCoverage: 0,
                    userSentence: "rough answer",
                    tokenFeedback: [],
                },
                replayCount: 4,
                tokenEditCount: 5,
                exceededSoftLimit: true,
                skipped: false,
            }).earnedCoins,
        ).toBe(5);
    });

    it("rewards sentence rebuild correctness and clean execution without using a >8 threshold", () => {
        expect(
            calculateSentenceRebuildRewards({
                evaluation: {
                    isCorrect: true,
                    correctCount: 8,
                    misplacedCount: 0,
                    distractorCount: 0,
                    missingCount: 0,
                    totalCount: 8,
                    accuracyRatio: 1,
                    completionRatio: 1,
                    misplacementRatio: 0,
                    distractorPickRatio: 0,
                    contentWordHitRate: 1,
                    tailCoverage: 1,
                    userSentence: "perfect answer",
                    tokenFeedback: [],
                },
                replayCount: 1,
                tokenEditCount: 1,
                exceededSoftLimit: false,
                skipped: false,
            }),
        ).toMatchObject({
            earnedCoins: 21,
            dropEligible: true,
        });
    });

    it("gives passage rebuild a 5-coin floor and uses objective score bands plus streak", () => {
        expect(
            calculatePassageRebuildRewards({
                sessionObjectiveScore100: 52,
                skippedSegments: 1,
                totalSegments: 3,
                streak: 5,
            }),
        ).toMatchObject({
            earnedCoins: 16,
            dropEligible: false,
        });
    });

    it("rewards a strong no-skip passage session from objective score only", () => {
        expect(
            calculatePassageRebuildRewards({
                sessionObjectiveScore100: 87,
                skippedSegments: 0,
                totalSegments: 3,
                streak: 3,
            }),
        ).toMatchObject({
            earnedCoins: 25,
            dropEligible: true,
        });
    });

    it("triggers sentence rebuild gacha only for clean correct answers", () => {
        expect(
            shouldTriggerSentenceRebuildGacha({
                learningSession: false,
                roll: 0.19,
                evaluation: {
                    isCorrect: true,
                    correctCount: 8,
                    misplacedCount: 0,
                    distractorCount: 0,
                    missingCount: 0,
                    totalCount: 8,
                    accuracyRatio: 1,
                    completionRatio: 1,
                    misplacementRatio: 0,
                    distractorPickRatio: 0,
                    contentWordHitRate: 1,
                    tailCoverage: 1,
                    userSentence: "perfect answer",
                    tokenFeedback: [],
                },
                replayCount: 1,
                tokenEditCount: 1,
                exceededSoftLimit: false,
                skipped: false,
            }),
        ).toBe(true);
        expect(
            shouldTriggerSentenceRebuildGacha({
                learningSession: false,
                roll: 0.19,
                evaluation: {
                    isCorrect: false,
                    correctCount: 7,
                    misplacedCount: 1,
                    distractorCount: 0,
                    missingCount: 0,
                    totalCount: 8,
                    accuracyRatio: 0.875,
                    completionRatio: 1,
                    misplacementRatio: 0.125,
                    distractorPickRatio: 0,
                    contentWordHitRate: 0.8,
                    tailCoverage: 1,
                    userSentence: "almost there",
                    tokenFeedback: [],
                },
                replayCount: 1,
                tokenEditCount: 1,
                exceededSoftLimit: false,
                skipped: false,
            }),
        ).toBe(false);
    });

    it("triggers passage rebuild gacha only for strong no-skip sessions", () => {
        expect(
            shouldTriggerPassageRebuildGacha({
                learningSession: false,
                roll: 0.18,
                sessionObjectiveScore100: 86,
                skippedSegments: 0,
            }),
        ).toBe(true);
        expect(
            shouldTriggerPassageRebuildGacha({
                learningSession: false,
                roll: 0.18,
                sessionObjectiveScore100: 79,
                skippedSegments: 0,
            }),
        ).toBe(false);
    });

    it("rolls rebuild drop rewards as capsule or coins", () => {
        expect(
            rollRebuildDropReward({
                eligible: true,
                variant: "sentence",
                dropRoll: 0.05,
                capsuleRoll: 0.1,
                coinRoll: 0.2,
            }),
        ).toEqual({
            itemDelta: { capsule: 1 },
            coinsDelta: 0,
            loot: { type: "gem", amount: 1, rarity: "rare", message: "🎁 重构掉落！获得灵感胶囊！" },
            fx: null,
        });

        expect(
            rollRebuildDropReward({
                eligible: true,
                variant: "passage",
                dropRoll: 0.05,
                capsuleRoll: 0.8,
                coinRoll: 0,
            }),
        ).toEqual({
            itemDelta: {},
            coinsDelta: 12,
            loot: null,
            fx: { kind: "coin_gain", amount: 12, message: "+12 星光币", source: "reward" },
        });
    });

    it("does not roll a drop reward when the rebuild attempt is not eligible", () => {
        expect(
            rollRebuildDropReward({
                eligible: false,
                variant: "sentence",
                dropRoll: 0,
                capsuleRoll: 0,
                coinRoll: 0,
            }),
        ).toBeNull();
    });
});
