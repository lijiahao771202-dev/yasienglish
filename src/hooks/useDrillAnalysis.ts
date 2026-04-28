"use client";

import { useCallback, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { DEFAULT_BASE_ELO } from "@/lib/user-sync";
import type { GrammarDisplayMode, GrammarSentenceAnalysis } from "@/lib/grammarHighlights";

type DrillMode = "translation" | "listening" | "dictation" | "rebuild" | "imitation";

interface DrillAnalysisDrillData {
    chinese: string;
    reference_english: string;
}

interface DrillFeedbackLike {
    score: number;
}

interface UseDrillAnalysisParams<TDrillFeedback extends DrillFeedbackLike> {
    dictationEloRef: MutableRefObject<number>;
    drillData: DrillAnalysisDrillData | null;
    drillFeedback: TDrillFeedback | null;
    eloRatingRef: MutableRefObject<number>;
    isDictationMode: boolean;
    isListeningFamilyMode: boolean;
    isListeningMode: boolean;
    listeningEloRef: MutableRefObject<number>;
    mode: DrillMode;
    setDrillFeedback: Dispatch<SetStateAction<TDrillFeedback | null>>;
    teachingMode: boolean;
    userTranslation: string;
}

export function useDrillAnalysis<TDrillFeedback extends DrillFeedbackLike>({
    dictationEloRef,
    drillData,
    drillFeedback,
    eloRatingRef,
    isDictationMode,
    isListeningFamilyMode,
    isListeningMode,
    listeningEloRef,
    mode,
    setDrillFeedback,
    teachingMode,
    userTranslation,
}: UseDrillAnalysisParams<TDrillFeedback>) {
    const [analysisRequested, setAnalysisRequested] = useState(false);
    const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [analysisDetailsOpen, setAnalysisDetailsOpen] = useState(false);
    const [fullAnalysisRequested, setFullAnalysisRequested] = useState(false);
    const [isGeneratingFullAnalysis, setIsGeneratingFullAnalysis] = useState(false);
    const [fullAnalysisError, setFullAnalysisError] = useState<string | null>(null);
    const [fullAnalysisOpen, setFullAnalysisOpen] = useState(false);
    const [fullAnalysisData, setFullAnalysisData] = useState<TDrillFeedback | null>(null);
    const [isGeneratingGrammar, setIsGeneratingGrammar] = useState(false);
    const [grammarError, setGrammarError] = useState<string | null>(null);
    const [referenceGrammarAnalysis, setReferenceGrammarAnalysis] = useState<GrammarSentenceAnalysis[] | null>(null);
    const [referenceGrammarDisplayMode, setReferenceGrammarDisplayMode] = useState<GrammarDisplayMode>("core");

    const handleGenerateAnalysis = useCallback(async () => {
        if (!drillData || !drillFeedback || isGeneratingAnalysis) return;

        setAnalysisRequested(true);
        if (mode === "listening") {
            setAnalysisError(null);
            setAnalysisDetailsOpen(true);
            return;
        }
        setIsGeneratingAnalysis(true);
        setAnalysisError(null);
        setAnalysisDetailsOpen(false);
        setFullAnalysisRequested(false);
        setIsGeneratingFullAnalysis(false);
        setFullAnalysisError(null);
        setFullAnalysisOpen(false);
        setFullAnalysisData(null);

        try {
            const activeElo = isDictationMode ? dictationEloRef.current : isListeningMode ? listeningEloRef.current : eloRatingRef.current;
            const analysisMode: "translation" | "listening" | "dictation" = isDictationMode
                ? "dictation"
                : isListeningMode
                    ? "listening"
                    : "translation";
            const analysisResponse = await fetch("/api/ai/analyze_drill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: userTranslation,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    current_elo: activeElo ?? DEFAULT_BASE_ELO,
                    score: drillFeedback.score,
                    mode: analysisMode,
                    input_source: isListeningFamilyMode && !isDictationMode ? "voice" : "keyboard",
                    teaching_mode: teachingMode,
                    detail_level: "basic",
                }),
            });
            const data = await analysisResponse.json();

            if (!analysisResponse.ok || data.error) {
                throw new Error(data.error || "解析生成失败");
            }

            setDrillFeedback((current) => current ? { ...current, ...data } : current);
        } catch (error) {
            const message = error instanceof Error ? error.message : "解析生成失败";
            setAnalysisError(message);
        } finally {
            setIsGeneratingAnalysis(false);
        }
    }, [
        dictationEloRef,
        drillData,
        drillFeedback,
        eloRatingRef,
        isDictationMode,
        isGeneratingAnalysis,
        isListeningFamilyMode,
        isListeningMode,
        listeningEloRef,
        mode,
        setDrillFeedback,
        teachingMode,
        userTranslation,
    ]);

    const handleGenerateFullAnalysis = useCallback(async () => {
        if (!drillData || !drillFeedback || mode !== "translation" || isGeneratingFullAnalysis) return;

        setFullAnalysisRequested(true);
        setIsGeneratingFullAnalysis(true);
        setFullAnalysisError(null);

        try {
            const analysisResponse = await fetch("/api/ai/analyze_drill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: userTranslation,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    current_elo: eloRatingRef.current ?? DEFAULT_BASE_ELO,
                    score: drillFeedback.score,
                    mode,
                    teaching_mode: teachingMode,
                    detail_level: "full",
                }),
            });
            const data = await analysisResponse.json();

            if (!analysisResponse.ok || data.error) {
                throw new Error(data.error || "完整解析生成失败");
            }

            setFullAnalysisData(data);
            setFullAnalysisOpen(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : "完整解析生成失败";
            setFullAnalysisError(message);
        } finally {
            setIsGeneratingFullAnalysis(false);
        }
    }, [drillData, drillFeedback, eloRatingRef, isGeneratingFullAnalysis, mode, teachingMode, userTranslation]);

    const handleGenerateReferenceGrammar = useCallback(async () => {
        if (!drillData || mode !== "translation" || !drillData.reference_english.trim() || isGeneratingGrammar) {
            return;
        }

        setIsGeneratingGrammar(true);
        setGrammarError(null);
        setReferenceGrammarDisplayMode("core");

        try {
            const response = await fetch("/api/ai/grammar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: drillData.reference_english,
                    mode: "basic",
                }),
            });
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "语法分析生成失败");
            }

            const sentences = Array.isArray(data?.difficult_sentences)
                ? data.difficult_sentences as GrammarSentenceAnalysis[]
                : [];

            setReferenceGrammarAnalysis(sentences);
        } catch (error) {
            const message = error instanceof Error ? error.message : "语法分析生成失败";
            setGrammarError(message);
            setReferenceGrammarAnalysis(null);
            setReferenceGrammarDisplayMode("core");
        } finally {
            setIsGeneratingGrammar(false);
        }
    }, [drillData, isGeneratingGrammar, mode]);

    return {
        analysisDetailsOpen,
        analysisError,
        analysisRequested,
        fullAnalysisData,
        fullAnalysisError,
        fullAnalysisOpen,
        fullAnalysisRequested,
        grammarError,
        handleGenerateAnalysis,
        handleGenerateFullAnalysis,
        handleGenerateReferenceGrammar,
        isGeneratingAnalysis,
        isGeneratingFullAnalysis,
        isGeneratingGrammar,
        referenceGrammarAnalysis,
        referenceGrammarDisplayMode,
        setAnalysisDetailsOpen,
        setAnalysisError,
        setAnalysisRequested,
        setFullAnalysisData,
        setFullAnalysisError,
        setFullAnalysisOpen,
        setFullAnalysisRequested,
        setGrammarError,
        setIsGeneratingAnalysis,
        setIsGeneratingFullAnalysis,
        setIsGeneratingGrammar,
        setReferenceGrammarAnalysis,
        setReferenceGrammarDisplayMode,
    };
}
