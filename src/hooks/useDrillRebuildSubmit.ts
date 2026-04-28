"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
    evaluateRebuildSelection,
    getRebuildSoftTimeLimitMs,
    getRebuildSystemAssessment,
    getRebuildSystemAssessmentLabel,
    getRebuildSystemDelta,
} from "@/lib/rebuild-mode";
import { calculateRebuildPassageObjectiveScore } from "@/lib/rebuild-passage";
import type {
    RebuildFeedbackState,
    RebuildPassageSegmentResultState,
    RebuildPassageSegmentUiState,
} from "@/lib/drill-rebuild-types";

type RebuildDrillDataShape = {
    _rebuildMeta?: {
        answerTokens: string[];
    };
};

type PassageSessionShape = {
    segmentCount?: number;
    segments?: unknown[];
};

type RebuildTokenLike = {
    text: string;
};

type RebuildSentenceShadowingFlow = "idle" | "prompt" | "shadowing" | "feedback";

type UseDrillRebuildSubmitArgs = {
    activePassageResult: RebuildPassageSegmentResultState | null;
    activePassageSegmentIndex: number;
    clearRebuildPassageShadowingPromptTimer: () => void;
    clearRebuildSentenceShadowingPromptTimer: () => void;
    currentElo: number;
    drillData: RebuildDrillDataShape | null;
    isRebuildMode: boolean;
    isRebuildPassage: boolean;
    launchRebuildSuccessCelebration: () => void;
    passageSession: PassageSessionShape | null;
    playRebuildSfx: (variant: "submit" | "error") => void;
    rebuildAnswerTokens: RebuildTokenLike[];
    rebuildEditCount: number;
    rebuildFeedback: RebuildFeedbackState | null;
    rebuildPassageResults: RebuildPassageSegmentResultState[];
    rebuildReplayCount: number;
    rebuildShadowingAutoOpen: boolean;
    rebuildStartedAt: number | null;
    rebuildPassageShadowingPromptTimerRef: MutableRefObject<number | null>;
    rebuildSentenceShadowingPromptTimerRef: MutableRefObject<number | null>;
    recordCompletedDrill: () => void;
    setAnalysisDetailsOpen: (value: boolean) => void;
    setAnalysisRequested: (value: boolean) => void;
    setPendingRebuildSentenceFeedback: (value: RebuildFeedbackState | null) => void;
    setRebuildFeedback: (value: RebuildFeedbackState | null) => void;
    setRebuildPassageResults: (value: RebuildPassageSegmentResultState[]) => void;
    setRebuildPassageShadowingFlow: (value: RebuildSentenceShadowingFlow) => void;
    setRebuildPassageShadowingSegmentIndex: (value: number | null) => void;
    setRebuildPassageUiState: Dispatch<SetStateAction<RebuildPassageSegmentUiState[]>>;
    setRebuildSentenceShadowingFlow: (value: RebuildSentenceShadowingFlow) => void;
};

const REBUILD_PASSAGE_SHADOWING_PROMPT_DELAY_MS = 2000;

export function useDrillRebuildSubmit({
    activePassageResult,
    activePassageSegmentIndex,
    clearRebuildPassageShadowingPromptTimer,
    clearRebuildSentenceShadowingPromptTimer,
    currentElo,
    drillData,
    isRebuildMode,
    isRebuildPassage,
    launchRebuildSuccessCelebration,
    passageSession,
    playRebuildSfx,
    rebuildAnswerTokens,
    rebuildEditCount,
    rebuildFeedback,
    rebuildPassageResults,
    rebuildReplayCount,
    rebuildShadowingAutoOpen,
    rebuildStartedAt,
    rebuildPassageShadowingPromptTimerRef,
    rebuildSentenceShadowingPromptTimerRef,
    recordCompletedDrill,
    setAnalysisDetailsOpen,
    setAnalysisRequested,
    setPendingRebuildSentenceFeedback,
    setRebuildFeedback,
    setRebuildPassageResults,
    setRebuildPassageShadowingFlow,
    setRebuildPassageShadowingSegmentIndex,
    setRebuildPassageUiState,
    setRebuildSentenceShadowingFlow,
}: UseDrillRebuildSubmitArgs) {
    const handleSubmitRebuild = useCallback((skipped = false) => {
        if (!isRebuildMode || !drillData?._rebuildMeta) return false;
        if (isRebuildPassage && activePassageResult) return false;
        if (!isRebuildPassage && rebuildFeedback) return false;
        if (!skipped && rebuildAnswerTokens.length === 0) return false;
        clearRebuildSentenceShadowingPromptTimer();
        playRebuildSfx("submit");

        const selectedTokens = skipped ? [] : rebuildAnswerTokens.map((token) => token.text);
        const evaluation = evaluateRebuildSelection({
            answerTokens: drillData._rebuildMeta.answerTokens,
            selectedTokens,
        });
        const exceededSoftLimit = rebuildStartedAt !== null
            ? (Date.now() - rebuildStartedAt) > getRebuildSoftTimeLimitMs(drillData._rebuildMeta.answerTokens.length, currentElo)
            : false;
        const systemDelta = getRebuildSystemDelta({
            accuracyRatio: evaluation.accuracyRatio,
            completionRatio: evaluation.completionRatio,
            misplacementRatio: evaluation.misplacementRatio,
            distractorPickRatio: evaluation.distractorPickRatio,
            contentWordHitRate: evaluation.contentWordHitRate,
            tailCoverage: evaluation.tailCoverage,
            replayCount: rebuildReplayCount,
            tokenEditCount: rebuildEditCount,
            exceededSoftLimit,
            skipped,
        });
        const systemAssessment = getRebuildSystemAssessment(systemDelta);
        const nextFeedback: RebuildFeedbackState = {
            evaluation,
            systemDelta,
            systemAssessment,
            systemAssessmentLabel: getRebuildSystemAssessmentLabel(systemAssessment),
            selfEvaluation: null,
            effectiveElo: currentElo,
            replayCount: rebuildReplayCount,
            editCount: rebuildEditCount,
            skipped,
            exceededSoftLimit,
            resolvedAt: Date.now(),
        };

        if (isRebuildPassage) {
            const objectiveScore100 = calculateRebuildPassageObjectiveScore({
                accuracyRatio: evaluation.accuracyRatio,
                completionRatio: evaluation.completionRatio,
                misplacementRatio: evaluation.misplacementRatio,
                distractorPickRatio: evaluation.distractorPickRatio,
                contentWordHitRate: evaluation.contentWordHitRate,
                tailCoverage: evaluation.tailCoverage,
                replayCount: rebuildReplayCount,
                tokenEditCount: rebuildEditCount,
                exceededSoftLimit,
                skipped,
            });
            const nextResults = rebuildPassageResults
                .filter((item) => item.segmentIndex !== activePassageSegmentIndex);
            nextResults.push({
                segmentIndex: activePassageSegmentIndex,
                feedback: nextFeedback,
                objectiveScore100,
                selfScore100: null,
                finalScore100: null,
                selfEvaluation: null,
            });
            nextResults.sort((left, right) => left.segmentIndex - right.segmentIndex);
            setRebuildPassageResults(nextResults);
            setRebuildPassageUiState((currentState) => {
                const nextState = [...currentState];
                const existing = nextState[activePassageSegmentIndex] ?? { chineseExpanded: true };
                nextState[activePassageSegmentIndex] = {
                    ...existing,
                    chineseExpanded: false,
                };
                return nextState;
            });

            const totalSegments = passageSession?.segmentCount ?? passageSession?.segments?.length ?? 0;
            if (totalSegments > 0 && nextResults.length >= totalSegments) {
                recordCompletedDrill();
            }

            if (evaluation.isCorrect && !skipped) {
                launchRebuildSuccessCelebration();
            } else {
                playRebuildSfx("error");
            }
            const submittedSegmentIndex = activePassageSegmentIndex;
            clearRebuildPassageShadowingPromptTimer();
            setRebuildPassageShadowingSegmentIndex(submittedSegmentIndex);
            setRebuildPassageShadowingFlow("idle");
            if (rebuildShadowingAutoOpen) {
                rebuildPassageShadowingPromptTimerRef.current = window.setTimeout(() => {
                    setRebuildPassageShadowingSegmentIndex(submittedSegmentIndex);
                    setRebuildPassageShadowingFlow("prompt");
                    rebuildPassageShadowingPromptTimerRef.current = null;
                }, REBUILD_PASSAGE_SHADOWING_PROMPT_DELAY_MS);
            }
        } else {
            recordCompletedDrill();

            if (evaluation.isCorrect && !skipped) {
                launchRebuildSuccessCelebration();
            } else {
                playRebuildSfx("error");
            }
            clearRebuildSentenceShadowingPromptTimer();
            setPendingRebuildSentenceFeedback(null);
            setRebuildFeedback(nextFeedback);
            setRebuildSentenceShadowingFlow("idle");
            if (rebuildShadowingAutoOpen) {
                rebuildSentenceShadowingPromptTimerRef.current = window.setTimeout(() => {
                    setRebuildSentenceShadowingFlow("prompt");
                    rebuildSentenceShadowingPromptTimerRef.current = null;
                }, REBUILD_PASSAGE_SHADOWING_PROMPT_DELAY_MS);
            }
        }
        setAnalysisRequested(false);
        setAnalysisDetailsOpen(false);
        return true;
    }, [
        activePassageResult,
        activePassageSegmentIndex,
        clearRebuildPassageShadowingPromptTimer,
        clearRebuildSentenceShadowingPromptTimer,
        currentElo,
        drillData,
        isRebuildMode,
        isRebuildPassage,
        launchRebuildSuccessCelebration,
        passageSession,
        playRebuildSfx,
        rebuildAnswerTokens,
        rebuildEditCount,
        rebuildFeedback,
        rebuildPassageResults,
        rebuildReplayCount,
        rebuildShadowingAutoOpen,
        rebuildStartedAt,
        rebuildPassageShadowingPromptTimerRef,
        rebuildSentenceShadowingPromptTimerRef,
        recordCompletedDrill,
        setAnalysisDetailsOpen,
        setAnalysisRequested,
        setPendingRebuildSentenceFeedback,
        setRebuildFeedback,
        setRebuildPassageResults,
        setRebuildPassageShadowingFlow,
        setRebuildPassageShadowingSegmentIndex,
        setRebuildPassageUiState,
        setRebuildSentenceShadowingFlow,
    ]);

    const handleSkipRebuild = useCallback(() => {
        return handleSubmitRebuild(true);
    }, [handleSubmitRebuild]);

    return {
        handleSkipRebuild,
        handleSubmitRebuild,
    };
}
