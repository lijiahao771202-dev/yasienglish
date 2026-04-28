import { describe, expect, it } from "vitest";

import {
    getTranslationSelfEvaluationEloDelta,
    resolveTranslationSelfEvaluationEloChange,
} from "./translation-self-eval";

describe("translation self evaluation", () => {
    it("maps self evaluation to direct elo deltas", () => {
        expect(getTranslationSelfEvaluationEloDelta("easy")).toBe(22);
        expect(getTranslationSelfEvaluationEloDelta("just_right")).toBe(10);
        expect(getTranslationSelfEvaluationEloDelta("hard")).toBe(-22);
    });

    it("ignores system elo and uses self evaluation only for translation difficulty", () => {
        expect(
            resolveTranslationSelfEvaluationEloChange({
                systemEloChange: 999,
                selfEvaluation: "easy",
            }),
        ).toBe(22);

        expect(
            resolveTranslationSelfEvaluationEloChange({
                systemEloChange: -40,
                selfEvaluation: "just_right",
            }),
        ).toBe(10);

        expect(
            resolveTranslationSelfEvaluationEloChange({
                systemEloChange: 18,
                selfEvaluation: "hard",
            }),
        ).toBe(-22);
    });
});
