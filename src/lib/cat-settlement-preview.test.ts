import { describe, expect, it } from "vitest";
import { buildPreparedCatSettlementPreview } from "./cat-settlement-preview";

describe("cat settlement preview", () => {
    it("applies self-assessment correction immediately on top of the prepared objective delta", () => {
        const preview = buildPreparedCatSettlementPreview({
            prepared: {
                sessionId: "session-1",
                objectiveDelta: -48,
                systemAssessment: "too_hard",
                stopReason: "target_se_reached",
                itemCount: 3,
                minItems: 3,
                maxItems: 5,
                scoreBefore: 808,
                scoreAfter: 760,
                delta: -48,
                rankBefore: {
                    id: "b1_plus",
                    name: "B1+ 强化",
                    primaryLabel: "四级强化",
                    secondaryLabel: "CET-4",
                    index: 4,
                },
                rankAfter: {
                    id: "b1",
                    name: "B1 预备",
                    primaryLabel: "四级预备",
                    secondaryLabel: "CET-4 Prep",
                    index: 3,
                },
                isRankUp: false,
                isRankDown: true,
            },
            selfAssessment: "easy",
        });

        expect(preview.objectiveDelta).toBe(-48);
        expect(preview.scoreCorrection).toBe(6);
        expect(preview.delta).toBe(-42);
        expect(preview.scoreAfter).toBe(766);
        expect(preview.rankAfter.primaryLabel).toBe("四级预备");
        expect(preview.isPendingFinalization).toBe(true);
    });
});
