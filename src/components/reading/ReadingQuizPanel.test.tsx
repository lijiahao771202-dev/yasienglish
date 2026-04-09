/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadingQuizPanel, type QuizQuestion } from "./ReadingQuizPanel";

const mountedRoots: Root[] = [];

async function renderQuizPanel(
    overrides: Partial<React.ComponentProps<typeof ReadingQuizPanel>> = {},
) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    const cachedQuestions: QuizQuestion[] = [
        {
            id: 1,
            itemId: "q-1",
            type: "multiple_choice",
            question: "What is the main idea?",
            options: ["A. Memory grows with review", "B. Sleep is optional", "C. Exams should be removed", "D. Notes are useless"],
            answer: "A",
            explanation: "The passage focuses on review and memory.",
        },
    ];

    await act(async () => {
        root.render(
            <ReadingQuizPanel
                articleContent="Students review notes every evening."
                articleTitle="Memory Routine"
                difficulty="cet4"
                onClose={vi.fn()}
                cachedQuestions={cachedQuestions}
                initialSubmitted
                lockAfterCompletion
                initialScore={{ correct: 1, total: 1 }}
                initialAnswers={{ 1: "A. Memory grows with review" }}
                initialResponses={[
                    {
                        itemId: "q-1",
                        order: 1,
                        answer: "A. Memory grows with review",
                        correct: true,
                        latencyMs: 8000,
                        itemDifficulty: -0.1,
                        itemType: "multiple_choice",
                    },
                ]}
                {...overrides}
            />,
        );
    });

    return { container, root };
}

afterEach(async () => {
    await act(async () => {
        while (mountedRoots.length > 0) {
            mountedRoots.pop()?.unmount();
        }
    });
    document.body.innerHTML = "";
});

describe("ReadingQuizPanel", () => {
    it("locks completed quizzes and keeps review mode without reset", async () => {
        const { container } = await renderQuizPanel();

        expect(container.textContent).toContain("正确率 100%");
        expect(container.textContent).toContain("✓ 正确");
        expect(container.textContent).not.toContain("重做");
        expect(container.textContent).toContain("完成");
    });
});
