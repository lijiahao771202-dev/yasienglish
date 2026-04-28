"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

interface DrillDataShape {
    chinese: string;
    reference_english: string;
}

interface DrillFeedbackShape {
    judge_reasoning?: string;
    score: number;
}

interface TranslationPassageSessionShape {
    segmentCount?: number;
    segments?: unknown[];
}

interface TranslationPassageResult<TDrillFeedback extends DrillFeedbackShape> {
    feedback: TDrillFeedback;
    segmentIndex: number;
    userTranslation: string;
}

interface UseDrillSubmissionOutcomeArgs<TDrillFeedback extends DrillFeedbackShape> {
    activeTranslationPassageSegmentIndex: number;
    drillData: DrillDataShape | null;
    hasRatedDrill: boolean;
    isRebuildMode: boolean;
    isTranslationPassage: boolean;
    recordCompletedDrill: () => void;
    setEloChange: Dispatch<SetStateAction<number | null>>;
    setHasRatedDrill: Dispatch<SetStateAction<boolean>>;
    setTranslationPassageResults: Dispatch<SetStateAction<Array<TranslationPassageResult<TDrillFeedback>>>>;
    translationPassageResults: Array<TranslationPassageResult<TDrillFeedback>>;
    translationPassageSession: TranslationPassageSessionShape | null;
}

interface ProcessScoredSubmissionArgs<TDrillFeedback extends DrillFeedbackShape> {
    feedback: TDrillFeedback;
    forceAI: boolean;
    translationToScore: string;
}

export function useDrillSubmissionOutcome<TDrillFeedback extends DrillFeedbackShape>({
    activeTranslationPassageSegmentIndex,
    hasRatedDrill,
    isTranslationPassage,
    recordCompletedDrill,
    setEloChange,
    setHasRatedDrill,
    setTranslationPassageResults,
    translationPassageResults,
    translationPassageSession,
}: UseDrillSubmissionOutcomeArgs<TDrillFeedback>) {
    const processScoredSubmission = useCallback(({
        feedback,
        forceAI,
        translationToScore,
    }: ProcessScoredSubmissionArgs<TDrillFeedback>): TDrillFeedback | null => {
        if (hasRatedDrill && !forceAI) {
            setEloChange(0);
            return null;
        }
        setHasRatedDrill(true);

        if (isTranslationPassage) {
            const nextResults = [...translationPassageResults];
            const existingIndex = nextResults.findIndex((entry) => entry.segmentIndex === activeTranslationPassageSegmentIndex);

            if (existingIndex >= 0) {
                nextResults[existingIndex] = {
                    segmentIndex: activeTranslationPassageSegmentIndex,
                    feedback,
                    userTranslation: translationToScore,
                };
            } else {
                nextResults.push({
                    segmentIndex: activeTranslationPassageSegmentIndex,
                    feedback,
                    userTranslation: translationToScore,
                });
            }

            nextResults.sort((left, right) => left.segmentIndex - right.segmentIndex);
            setTranslationPassageResults(nextResults);

            const totalSegments = translationPassageSession?.segmentCount ?? translationPassageSession?.segments?.length ?? 0;
            if (totalSegments > 0 && nextResults.length >= totalSegments) {
                recordCompletedDrill();
                feedback.score = nextResults.reduce((sum, entry) => sum + (entry.feedback.score ?? 0), 0) / nextResults.length;
                return feedback;
            }

            setEloChange(0);
            return null;
        }

        recordCompletedDrill();
        return feedback;
    }, [
        activeTranslationPassageSegmentIndex,
        hasRatedDrill,
        isTranslationPassage,
        recordCompletedDrill,
        setEloChange,
        setHasRatedDrill,
        setTranslationPassageResults,
        translationPassageResults,
        translationPassageSession,
    ]);

    return {
        processScoredSubmission,
    };
}
