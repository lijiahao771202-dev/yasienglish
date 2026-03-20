import { describe, expect, it } from "vitest";

import {
    getQuestionCorrectTokens,
    isObjectiveQuestionCorrect,
    normalizeObjectiveToken,
    scoreObjectiveQuiz,
} from "./quiz-scoring";

describe("quiz scoring", () => {
    it("normalizes letter and text answers", () => {
        expect(normalizeObjectiveToken("A. option")).toBe("A");
        expect(normalizeObjectiveToken("not given")).toBe("NOT GIVEN");
    });

    it("extracts multi-select answers from array and text fallback", () => {
        expect(getQuestionCorrectTokens({ id: 1, type: "multiple_select", answers: ["A", "C"] })).toEqual(["A", "C"]);
        expect(getQuestionCorrectTokens({ id: 2, type: "multiple_select", answer: "A, C" })).toEqual(["A", "C"]);
    });

    it("applies all-or-nothing for multiple_select", () => {
        const question = { id: 1, type: "multiple_select" as const, answers: ["A", "C"] };
        expect(isObjectiveQuestionCorrect(question, ["A", "C"])).toBe(true);
        expect(isObjectiveQuestionCorrect(question, ["A"])).toBe(false);
        expect(isObjectiveQuestionCorrect(question, ["A", "B", "C"])).toBe(false);
        expect(isObjectiveQuestionCorrect(question, ["A", "D"])).toBe(false);
    });

    it("scores mixed objective quiz", () => {
        const result = scoreObjectiveQuiz(
            [
                { id: 1, type: "multiple_choice", answer: "B" },
                { id: 2, type: "true_false_ng", answer: "Not Given" },
                { id: 3, type: "multiple_select", answers: ["A", "D"] },
            ],
            {
                1: "B",
                2: "Not Given",
                3: ["A", "D"],
            },
        );

        expect(result).toEqual({ correct: 3, total: 3 });
    });
});
