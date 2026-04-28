"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { GrammarDisplayMode, GrammarSentenceAnalysis } from "@/lib/grammarHighlights";
import {
    buildScoringErrorFeedback,
    evaluateLocalTranslationScore,
    normalizeDictationFeedback,
    type DrillFeedbackLike as LocalDrillFeedbackLike,
} from "@/lib/drill-scoring";
import { DEFAULT_BASE_ELO } from "@/lib/user-sync";

type SubmissionMode = "translation" | "dictation";

interface DrillDataShape {
    chinese: string;
    reference_english: string;
}

interface UseDrillSubmissionScoringArgs<TDrillFeedback extends LocalDrillFeedbackLike> {
    dictationElo: number;
    drillData: DrillDataShape | null;
    eloRating: number;
    isDictationMode: boolean;
    isListeningFamilyMode: boolean;
    isListeningMode: boolean;
    setAnalysisDetailsOpen: Dispatch<SetStateAction<boolean>>;
    setAnalysisError: Dispatch<SetStateAction<string | null>>;
    setAnalysisRequested: Dispatch<SetStateAction<boolean>>;
    setDrillFeedback: Dispatch<SetStateAction<TDrillFeedback | null>>;
    setFullAnalysisData: Dispatch<SetStateAction<TDrillFeedback | null>>;
    setFullAnalysisError: Dispatch<SetStateAction<string | null>>;
    setFullAnalysisOpen: Dispatch<SetStateAction<boolean>>;
    setFullAnalysisRequested: Dispatch<SetStateAction<boolean>>;
    setGrammarError: Dispatch<SetStateAction<string | null>>;
    setIsGeneratingFullAnalysis: Dispatch<SetStateAction<boolean>>;
    setIsGeneratingGrammar: Dispatch<SetStateAction<boolean>>;
    setReferenceGrammarAnalysis: Dispatch<SetStateAction<GrammarSentenceAnalysis[] | null>>;
    setReferenceGrammarDisplayMode: Dispatch<SetStateAction<GrammarDisplayMode>>;
    teachingMode: boolean;
}

interface ScoreSubmissionArgs {
    forceAI: boolean;
    translationToScore: string;
}

export function useDrillSubmissionScoring<TDrillFeedback extends LocalDrillFeedbackLike>({
    dictationElo,
    drillData,
    eloRating,
    isDictationMode,
    isListeningFamilyMode,
    isListeningMode,
    setAnalysisDetailsOpen,
    setAnalysisError,
    setAnalysisRequested,
    setDrillFeedback,
    setFullAnalysisData,
    setFullAnalysisError,
    setFullAnalysisOpen,
    setFullAnalysisRequested,
    setGrammarError,
    setIsGeneratingFullAnalysis,
    setIsGeneratingGrammar,
    setReferenceGrammarAnalysis,
    setReferenceGrammarDisplayMode,
    teachingMode,
}: UseDrillSubmissionScoringArgs<TDrillFeedback>) {
    const scoreSubmission = useCallback(async ({
        forceAI,
        translationToScore,
    }: ScoreSubmissionArgs): Promise<TDrillFeedback | null> => {
        if (!drillData) return null;

        const activeElo = isDictationMode ? dictationElo : eloRating;
        const scoreMode: SubmissionMode = isDictationMode ? "dictation" : "translation";
        const scoringInputSource = isListeningFamilyMode && !isDictationMode ? "voice" : "keyboard";

        let data: TDrillFeedback | null = null;
        let responseOk = true;

        if (scoreMode === "translation" && !forceAI) {
            data = await evaluateLocalTranslationScore(
                translationToScore,
                drillData.reference_english,
            ) as TDrillFeedback | null;
        }

        if (!data) {
            const response = await fetch("/api/ai/score_translation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: translationToScore,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    current_elo: activeElo ?? DEFAULT_BASE_ELO,
                    mode: scoreMode,
                    input_source: scoringInputSource,
                    teaching_mode: teachingMode,
                }),
            });
            responseOk = response.ok;
            data = await response.json() as TDrillFeedback;
        }

        if (!responseOk || (data as { error?: string; details?: string } | null)?.error || !data || data.score === undefined || data.score === null) {
            const errorDetails = (data as { details?: string } | null)?.details;
            setDrillFeedback(buildScoringErrorFeedback(errorDetails, isListeningMode) as TDrillFeedback);
            return null;
        }

        const resolvedFeedback = isDictationMode
            ? normalizeDictationFeedback(data)
            : data;

        if (isListeningMode) {
            setDrillFeedback(resolvedFeedback);
            setAnalysisRequested(true);
            setAnalysisDetailsOpen(true);
        } else {
            setDrillFeedback(resolvedFeedback);
            setAnalysisRequested(false);
            setAnalysisDetailsOpen(false);
        }

        setAnalysisError(null);
        setFullAnalysisRequested(false);
        setIsGeneratingFullAnalysis(false);
        setFullAnalysisError(null);
        setFullAnalysisOpen(false);
        setFullAnalysisData(null);
        setIsGeneratingGrammar(false);
        setGrammarError(null);
        setReferenceGrammarAnalysis(null);
        setReferenceGrammarDisplayMode("core");

        return resolvedFeedback;
    }, [
        dictationElo,
        drillData,
        eloRating,
        isDictationMode,
        isListeningFamilyMode,
        isListeningMode,
        setAnalysisDetailsOpen,
        setAnalysisError,
        setAnalysisRequested,
        setDrillFeedback,
        setFullAnalysisData,
        setFullAnalysisError,
        setFullAnalysisOpen,
        setFullAnalysisRequested,
        setGrammarError,
        setIsGeneratingFullAnalysis,
        setIsGeneratingGrammar,
        setReferenceGrammarAnalysis,
        setReferenceGrammarDisplayMode,
        teachingMode,
    ]);

    return {
        scoreSubmission,
    };
}
