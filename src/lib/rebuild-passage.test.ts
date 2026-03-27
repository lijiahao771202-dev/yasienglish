import { describe, expect, it } from "vitest";

import {
    aggregateRebuildPassageScores,
    buildRebuildPassageDifficultyProfile,
    calculateRebuildPassageObjectiveScore,
    getRebuildPassageSelfScore,
    validateRebuildPassageSegments,
} from "./rebuild-passage";

describe("rebuild passage helpers", () => {
    it("derives soft and hard word-count windows from the existing segment range", () => {
        const profile = buildRebuildPassageDifficultyProfile(1200, 3);

        expect(profile.segmentCount).toBe(3);
        expect(profile.practiceTier.cefr).toBe("B1");
        expect(profile.perSegmentWordWindow).toMatchObject({
            min: 14,
            max: 22,
            mean: 18,
            sigma: 2,
            softMin: 16,
            softMax: 20,
            hardMin: 14,
            hardMax: 22,
        });
        expect(profile.totalWordWindow.mean).toBe(54);
        expect(profile.totalWordWindow.sigma).toBeCloseTo(3.5, 1);
    });

    it("scores objective segment performance from rebuild attempt signals", () => {
        const score = calculateRebuildPassageObjectiveScore({
            accuracyRatio: 0.9,
            completionRatio: 1,
            misplacementRatio: 0.1,
            distractorPickRatio: 0,
            contentWordHitRate: 0.8,
            tailCoverage: 0.75,
            replayCount: 1,
            tokenEditCount: 2,
            exceededSoftLimit: false,
            skipped: false,
        });

        expect(score).toBe(87);
    });

    it("uses a single session-level self score and punishes broad skipping much more aggressively", () => {
        expect(getRebuildPassageSelfScore("easy", { objectiveScore100: 82, skippedSegments: 0, totalSegments: 3 })).toBe(100);
        expect(getRebuildPassageSelfScore("hard", { objectiveScore100: 82, skippedSegments: 0, totalSegments: 3 })).toBe(60);
        expect(getRebuildPassageSelfScore("easy", { objectiveScore100: 0, skippedSegments: 3, totalSegments: 3 })).toBe(20);
        expect(getRebuildPassageSelfScore("hard", { objectiveScore100: 0, skippedSegments: 3, totalSegments: 3 })).toBe(0);
        expect(getRebuildPassageSelfScore("just_right", { objectiveScore100: 18, skippedSegments: 1, totalSegments: 3 })).toBe(20);
    });

    it("aggregates objective and subjective scores evenly across a full session", () => {
        const session = aggregateRebuildPassageScores([
            { objectiveScore100: 88, selfScore100: 100 },
            { objectiveScore100: 82, selfScore100: 80 },
            { objectiveScore100: 74, selfScore100: 60 },
        ]);

        expect(session.sessionObjectiveScore100).toBe(81);
        expect(session.sessionSelfScore100).toBe(80);
        expect(session.sessionScore100).toBe(81);
        expect(session.sessionBattleScore10).toBe(8.1);
    });

    it("accepts natural segment variance inside the hard 2σ window while rejecting larger drift", () => {
        const profile = buildRebuildPassageDifficultyProfile(1200, 3);

        const accepted = validateRebuildPassageSegments({
            profile,
            segments: [
                "Please keep the updated guest list near the front desk before the visitors arrive.",
                "After the briefing, send the revised schedule to the whole team before lunch today.",
                "If the driver arrives early, call me first so we can adjust the pickup order.",
            ],
        });
        expect(accepted.isValid).toBe(true);
        expect(accepted.segmentResults.every((result) => result.withinHardBand)).toBe(true);

        const rejected = validateRebuildPassageSegments({
            profile,
            segments: [
                "Please keep the updated guest list near the front desk before lunch because the coordinator might need it again after the venue check.",
                "After the briefing, send the revised schedule to the whole team together with the backup seating chart and the final call sheet for tomorrow morning.",
                "If the driver arrives early, call me before everyone leaves and ask whether the spare passes should stay with the support desk overnight.",
            ],
        });
        expect(rejected.isValid).toBe(false);
        expect(rejected.segmentResults.some((result) => !result.withinHardBand)).toBe(true);
    });
});
