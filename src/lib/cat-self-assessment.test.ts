import { describe, expect, it } from "vitest";
import {
    getCatDifficultySignal,
    getCatDifficultyScoreOffset,
    getCatSelfAssessmentScoreCorrection,
    getCatSystemAssessment,
} from "./cat-self-assessment";

describe("cat self assessment", () => {
    it("classifies strong positive objective sessions as too easy", () => {
        expect(getCatSystemAssessment({
            delta: 26,
            accuracy: 0.8,
            challengeRatio: 0.36,
            qualityTier: "ok",
        })).toBe("too_easy");
    });

    it("classifies strong negative objective sessions as too hard", () => {
        expect(getCatSystemAssessment({
            delta: -24,
            accuracy: 0.36,
            challengeRatio: 0.24,
            qualityTier: "ok",
        })).toBe("too_hard");
    });

    it("classifies mid-range sessions as matched", () => {
        expect(getCatSystemAssessment({
            delta: 8,
            accuracy: 0.66,
            challengeRatio: 0.34,
            qualityTier: "ok",
        })).toBe("matched");
    });

    it("uses the agreed score-correction table", () => {
        expect(getCatSelfAssessmentScoreCorrection("too_easy", "easy")).toBe(12);
        expect(getCatSelfAssessmentScoreCorrection("too_easy", "just_right")).toBe(6);
        expect(getCatSelfAssessmentScoreCorrection("matched", "hard")).toBe(-6);
        expect(getCatSelfAssessmentScoreCorrection("too_hard", "hard")).toBe(-12);
        expect(getCatSelfAssessmentScoreCorrection("too_hard", "easy")).toBe(0);
    });

    it("weights self 60 and system 40 for next-session difficulty signal", () => {
        expect(getCatDifficultySignal("matched", "hard")).toBe(-0.6);
        expect(getCatDifficultySignal("too_easy", "just_right")).toBe(0.4);
        expect(getCatDifficultySignal("too_hard", "hard")).toBe(-1);
    });

    it("turns difficulty signal into a one-shot score offset for the next CAT passage", () => {
        expect(getCatDifficultyScoreOffset(1)).toBe(160);
        expect(getCatDifficultyScoreOffset(-0.6)).toBe(-96);
        expect(getCatDifficultyScoreOffset(0)).toBe(0);
    });
});
