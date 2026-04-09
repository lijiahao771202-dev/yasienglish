import { describe, expect, it } from "vitest";

import {
    buildCatInstruction,
    buildStandardInstruction,
    normalizeGeneratedQuestions,
} from "./route";

describe("generate quiz route helpers", () => {
    it("builds CET-4 instructions with exam-specific guidance", () => {
        const result = buildStandardInstruction("cet4");

        expect(result.questionCount).toBe(5);
        expect(result.instruction).toContain("Target exam feel: CET-4 reading.");
        expect(result.instruction).toContain("main idea");
        expect(result.instruction).toContain("Distractors must be plausible");
    });

    it("builds CAT instructions with learner-band guidance", () => {
        const instruction = buildCatInstruction({
            score: 1800,
            questionCount: 6,
            distribution: {
                multiple_choice: 2,
                multiple_select: 0,
                true_false_ng: 2,
                matching: 1,
                fill_blank_choice: 1,
            },
            allowedTypes: ["multiple_choice", "true_false_ng", "matching", "fill_blank_choice"],
        });

        expect(instruction).toContain("Learner CAT score: 1800");
        expect(instruction).toContain("CET-6 to TEM-4-prep practice");
        expect(instruction).toContain("Order questions from easier to harder.");
    });

    it("normalizes valid generated questions and backfills difficulty", () => {
        const questions = normalizeGeneratedQuestions(
            [
                {
                    type: "multiple_choice",
                    question: "What is the main idea of paragraph 2?",
                    options: ["The team delayed the launch", "The team revised the plan", "The team changed jobs", "The team ignored feedback"],
                    answer: "The team revised the plan",
                    sourceParagraph: "2",
                    evidence: "In paragraph 2, the author says the team revised the plan after the review.",
                    explanation: {
                        summary: "主旨是团队根据评审结果调整计划。",
                        reasoning: "B 对应 revise the plan，其余选项与原文不符。",
                    },
                },
                {
                    type: "true_false_ng",
                    question: "The writer says every student liked the new schedule.",
                    answer: "C",
                    sourceParagraph: "4",
                    evidence: "The passage only says some students adapted quickly, but gives no full-group claim.",
                    explanation: "原文没有说所有学生都喜欢，所以应选 Not Given。",
                },
                {
                    type: "multiple_choice",
                    question: "This item should be discarded",
                    options: ["A", "B", "C", "D"],
                    answer: "A",
                    sourceParagraph: "5",
                    explanation: "缺少 evidence。",
                },
            ],
            {
                quizMode: "cat",
                difficulty: "cet6",
                score: 1800,
                expectedCount: 6,
                allowedTypes: ["multiple_choice", "true_false_ng", "matching", "fill_blank_choice"],
            },
        );

        expect(questions).toHaveLength(2);
        expect(questions[0]).toMatchObject({
            id: 1,
            itemId: "quiz-item-1",
            type: "multiple_choice",
            answer: "B",
            sourceParagraph: "2",
        });
        expect(questions[0].options).toEqual([
            "A. The team delayed the launch",
            "B. The team revised the plan",
            "C. The team changed jobs",
            "D. The team ignored feedback",
        ]);
        expect(questions[0].itemDifficulty).toBeTypeOf("number");
        expect(questions[1]).toMatchObject({
            id: 2,
            type: "true_false_ng",
            answer: "Not Given",
            options: ["True", "False", "Not Given"],
        });
        expect(questions[1].itemDifficulty).toBeGreaterThan(questions[0].itemDifficulty);
    });

    it("keeps provided difficulty but clamps out-of-range values", () => {
        const [question] = normalizeGeneratedQuestions(
            [
                {
                    type: "multiple_select",
                    question: "Which two actions improved the project?",
                    options: ["More review meetings", "Clearer deadlines", "Less documentation", "Ignoring feedback"],
                    answers: ["Clearer deadlines", "A"],
                    sourceParagraph: "3",
                    evidence: "The author links more review meetings and clearer deadlines to better delivery.",
                    explanation: {
                        summary: "A 和 B 是促进项目改进的两个动作。",
                    },
                    itemDifficulty: 9.2,
                },
            ],
            {
                quizMode: "standard",
                difficulty: "ielts",
                score: 2600,
                expectedCount: 5,
                allowedTypes: ["multiple_select"],
            },
        );

        expect(question.answers).toEqual(["B", "A"]);
        expect(question.itemDifficulty).toBe(4.5);
    });
});
