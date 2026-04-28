/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RebuildQuestionPanel } from "./RebuildQuestionPanel";

const mountedRoots: Root[] = [];

async function renderPanel() {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    const renderRebuildComposer = vi.fn((submitLabel?: string, _compact?: boolean, _readOnlyAfterSubmit?: boolean, nextPendingSegmentIndex?: number) => (
        <div data-next-index={String(nextPendingSegmentIndex ?? -1)}>
            {submitLabel}:{nextPendingSegmentIndex ?? -1}
        </div>
    ));

    await act(async () => {
        root.render(
            <RebuildQuestionPanel
                activeCosmeticTheme={{
                    textClass: "text-stone-900",
                    mutedClass: "text-stone-500",
                }}
                activeCosmeticUi={{
                    ledgerClass: "border bg-white",
                    inputShellClass: "border bg-white",
                    audioLockedClass: "border bg-stone-100 text-stone-500",
                    audioUnlockedClass: "border bg-emerald-100 text-emerald-800",
                    checkButtonClass: "border bg-sky-100 text-sky-800",
                    wordBadgeActiveClass: "border bg-sky-50 text-sky-700",
                    iconButtonClass: "border bg-white text-stone-700",
                    nextButtonGradient: "linear-gradient(90deg, #111, #333)",
                    nextButtonShadow: "0 0 0 1px rgba(0,0,0,0.15)",
                    nextButtonGlow: "rgba(0,0,0,0.1)",
                }}
                activePassageSegmentIndex={0}
                audioSourceText={null}
                buildSentenceIpa={() => ""}
                drillData={{
                    chinese: "第一段中文",
                    reference_english: "First segment.",
                    _rebuildMeta: {
                        variant: "passage",
                        passageSession: {
                            currentIndex: 0,
                            segmentCount: 3,
                            segments: [
                                { id: "s1", chinese: "第一段中文", referenceEnglish: "First segment." },
                                { id: "s2", chinese: "第二段中文", referenceEnglish: "Second segment." },
                                { id: "s3", chinese: "第三段中文", referenceEnglish: "Third segment." },
                            ],
                        },
                    },
                }}
                hasSentenceFeedback={false}
                isAudioLoading={false}
                isIpaReady={false}
                isPlaying={false}
                isVerdantRebuild={false}
                loadingAudioKeys={new Set<string>()}
                onCyclePlaybackSpeed={vi.fn()}
                onPlayAudio={vi.fn()}
                onRebuildSelfEvaluate={vi.fn()}
                onTogglePassageChinese={vi.fn()}
                playbackSpeed={1}
                prefersReducedMotion={true}
                rebuildPassageResults={[
                    {
                        segmentIndex: 0,
                        objectiveScore100: 78,
                        selfScore100: null,
                        finalScore100: null,
                        selfEvaluation: null,
                        feedback: {
                            evaluation: {
                                isCorrect: true,
                                correctCount: 2,
                                misplacedCount: 0,
                                distractorCount: 0,
                                missingCount: 0,
                                totalCount: 2,
                                accuracyRatio: 1,
                                completionRatio: 1,
                                misplacementRatio: 1,
                                distractorPickRatio: 1,
                                contentWordHitRate: 1,
                                tailCoverage: 1,
                                userSentence: "First segment.",
                                tokenFeedback: [],
                            },
                            systemDelta: 0,
                            systemAssessment: "matched",
                            systemAssessmentLabel: "刚好",
                            selfEvaluation: null,
                            effectiveElo: 200,
                            replayCount: 0,
                            editCount: 0,
                            resolvedAt: 1,
                            skipped: false,
                            exceededSoftLimit: false,
                        },
                    },
                ]}
                rebuildPassageSummary={null}
                rebuildPassageUiState={[{ chineseExpanded: false }, { chineseExpanded: false }, { chineseExpanded: false }]}
                renderInteractiveText={(text) => text}
                renderRebuildComposer={renderRebuildComposer}
                showChinese={false}
            />,
        );
    });

    return { container, renderRebuildComposer };
}

afterEach(async () => {
    await act(async () => {
        while (mountedRoots.length > 0) {
            mountedRoots.pop()?.unmount();
        }
    });
    document.body.innerHTML = "";
});

describe("RebuildQuestionPanel", () => {
    it("passes the next pending segment index to the composer after a passage segment is submitted", async () => {
        const { container, renderRebuildComposer } = await renderPanel();

        expect(renderRebuildComposer).toHaveBeenCalled();
        expect(container.textContent).toContain("提交第 1 段:1");
    });
});
