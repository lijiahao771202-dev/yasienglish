/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DrillBottomActions } from "./DrillBottomActions";

const mountedRoots: Root[] = [];

async function renderBottomActions(props: Partial<React.ComponentProps<typeof DrillBottomActions>> = {}) {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
        root.render(
            <DrillBottomActions
                activeCosmeticUi={{
                    nextButtonGlow: "rgba(0,0,0,0.2)",
                    nextButtonGradient: "linear-gradient(90deg, #111, #333)",
                    nextButtonShadow: "0 0 0 1px rgba(0,0,0,0.2)",
                }}
                bossActive={false}
                gambleActive={false}
                isFinalTranslationSegment={true}
                isGeneratingAnalysis={false}
                isRebuildMode={false}
                isRebuildPassage={false}
                isTranslationPassage={false}
                onNextQuestion={vi.fn()}
                onPrevSegment={vi.fn()}
                onRebuildPassageNext={vi.fn()}
                onRebuildPassageRedo={vi.fn()}
                onRebuildSelfEvaluate={vi.fn()}
                onTranslationPassageNext={vi.fn()}
                onTranslationSelfEvaluate={vi.fn()}
                rebuildFeedbackPresent={false}
                rebuildPassageSummaryPresent={false}
                rebuildSelfEvaluationLocked={false}
                rebuildSentenceShadowingIdle={true}
                showFeedbackCta={true}
                showPrevSegment={false}
                showTranslationSelfEvaluation
                streakTier={0}
                streakVisual={{
                    badgeGlow: "rgba(0,0,0,0.15)",
                    nextGradient: "linear-gradient(90deg, #222, #444)",
                    nextShadow: "0 0 0 1px rgba(0,0,0,0.2)",
                }}
                translationSelfEvaluationLocked={false}
                {...props}
            />,
        );
    });

    return { container };
}

afterEach(async () => {
    await act(async () => {
        while (mountedRoots.length > 0) {
            mountedRoots.pop()?.unmount();
        }
    });
    document.body.innerHTML = "";
});

describe("DrillBottomActions", () => {
    it("requires translation self evaluation before next question", async () => {
        const onTranslationSelfEvaluate = vi.fn();
        const { container } = await renderBottomActions({ onTranslationSelfEvaluate });

        expect(container.textContent).toContain("简单");
        expect(container.textContent).toContain("刚好");
        expect(container.textContent).toContain("难");

        const nextButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("Next Question"));
        expect(nextButton).toBeTruthy();
        expect(nextButton?.hasAttribute("disabled")).toBe(true);

        const hardButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("难"));
        expect(hardButton).toBeTruthy();

        await act(async () => {
            hardButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onTranslationSelfEvaluate).toHaveBeenCalledWith("hard");
    });
});
