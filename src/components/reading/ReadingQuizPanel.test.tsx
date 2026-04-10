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
        {
            id: 2,
            itemId: "q-2",
            type: "true_false_ng",
            question: "The students reviewed notes only once a month.",
            options: ["A. True", "B. False", "C. Not Given"],
            answer: "B",
            explanation: "The passage says they reviewed every evening, not once a month.",
        },
    ];

    await act(async () => {
        root.render(
            <ReadingQuizPanel
                articleContent="Students review notes every evening."
                articleTitle="Memory Routine"
                difficulty="cet4"
                quizMode="cat"
                onClose={vi.fn()}
                cachedQuestions={cachedQuestions}
                initialSubmitted
                lockAfterCompletion
                initialScore={{ correct: 1, total: 2 }}
                initialAnswers={{ 1: "A. Memory grows with review", 2: "A. True" }}
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
                    {
                        itemId: "q-2",
                        order: 2,
                        answer: "A. True",
                        correct: false,
                        latencyMs: 6000,
                        itemDifficulty: 0.2,
                        itemType: "true_false_ng",
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
    it("uses previous and next controls to review submitted answers after reopening", async () => {
        const { container } = await renderQuizPanel();
        const getButtons = () => Array.from(container.querySelectorAll("button"));

        expect(container.textContent).toContain("正确率 50%");
        expect(container.textContent).toContain("✓ 正确");
        expect(container.textContent).not.toContain("重做");
        expect(container.textContent).toContain("上一题");
        expect(container.textContent).toContain("下一题");
        expect(container.textContent).not.toContain("完成");
        expect(container.textContent).toContain("What is the main idea?");

        const nextButton = getButtons().find((button) => button.textContent?.includes("下一题"));
        expect(nextButton).toBeTruthy();

        await act(async () => {
            nextButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.textContent).toContain("The students reviewed notes only once a month.");
    });
});
