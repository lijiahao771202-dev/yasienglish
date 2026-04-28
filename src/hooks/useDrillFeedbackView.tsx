"use client";

import { useMemo, type MouseEventHandler, type ReactNode } from "react";

import { DrillDiffPanel } from "@/components/drill/DrillDiffPanel";
import { ListeningMetricCards } from "@/components/drill/ListeningMetricCards";
import { ListeningReplayPanel } from "@/components/drill/ListeningReplayPanel";
import { TranslationAnalysisDetails } from "@/components/drill/TranslationAnalysisDetails";
import { TranslationFeedbackRecap } from "@/components/drill/TranslationFeedbackRecap";
import { InlineGrammarHighlights } from "@/components/shared/InlineGrammarHighlights";
import type { GrammarDisplayMode, GrammarSentenceAnalysis } from "@/lib/grammarHighlights";
import type { PronunciationWordResult } from "@/lib/pronunciation-scoring";
import { buildTranslationHighlights } from "@/lib/translation-diff";

interface FeedbackHighlight {
    after: string;
    before: string;
    kind: string;
    note: string;
    tip?: string;
}

interface DrillFeedbackViewDrillData {
    chinese: string;
    reference_english: string;
    reference_english_alternatives?: string[];
}

interface DrillFeedbackViewFeedback {
    error_analysis?: Array<{
        correction: string;
        error: string;
        rule: string;
        tip?: string;
    }>;
    feedback?: {
        dictation_tips?: string[];
        encouragement?: string;
        listening_tips?: string[];
    } | string[];
    improved_version?: string;
    judge_reasoning?: string;
    segments?: unknown;
    similar_patterns?: Array<{
        chinese: string;
        english: string;
        point: string;
    }>;
    summary_cn?: string;
    tips_cn?: string[];
    transcript?: string;
    user_translation?: string;
    utterance_scores?: {
        accuracy: number;
        fluency: number;
        total: number;
    };
    word_results?: PronunciationWordResult[];
}

interface TranslationAnalysisDetailsPayload {
    chinglish_vs_natural?: {
        chinglish: string;
        natural: string;
        reason_cn: string;
    };
    common_pitfall?: {
        pitfall_cn: string;
        right_example: string;
        why_cn: string;
        wrong_example: string;
    };
    diagnosis_summary_cn?: string;
    error_analysis?: Array<{
        correction: string;
        error: string;
        rule: string;
        tip: string;
    }>;
    feedback?: unknown;
    memory_hook_cn?: string;
    phrase_synonyms?: Array<{
        alternatives: string[];
        nuance_cn: string;
        source_phrase: string;
    }>;
    similar_patterns?: Array<{
        chinese: string;
        english: string;
        point: string;
    }>;
    transfer_pattern?: {
        example_cn: string;
        example_en: string;
        template: string;
        tip_cn: string;
    };
}

interface UseDrillFeedbackViewParams {
    analysisRequested: boolean;
    drillData: DrillFeedbackViewDrillData | null;
    drillFeedback: DrillFeedbackViewFeedback | null;
    fullAnalysisData: TranslationAnalysisDetailsPayload | null;
    grammarError: string | null;
    isDictationMode: boolean;
    isGeneratingAnalysis: boolean;
    isGeneratingGrammar: boolean;
    mode: "translation" | "listening" | "dictation" | "rebuild" | "imitation";
    onGenerateAnalysis: () => void;
    onOpenScoreTutor: MouseEventHandler<HTMLButtonElement>;
    onPlayAudio: () => Promise<boolean> | void;
    onPlayRecording: () => void;
    referenceGrammarAnalysis: GrammarSentenceAnalysis[] | null;
    referenceGrammarDisplayMode: GrammarDisplayMode;
    renderInteractiveCoachText: (text: string) => ReactNode;
    renderInteractiveText: (text: string) => ReactNode;
    setReferenceGrammarDisplayMode: (mode: GrammarDisplayMode) => void;
    teachingMode: boolean;
    userTranslation: string;
    wavBlob: Blob | null;
}

export function useDrillFeedbackView({
    analysisRequested,
    drillData,
    drillFeedback,
    fullAnalysisData,
    grammarError,
    isDictationMode,
    isGeneratingAnalysis,
    isGeneratingGrammar,
    mode,
    onGenerateAnalysis,
    onOpenScoreTutor,
    onPlayAudio,
    onPlayRecording,
    referenceGrammarAnalysis,
    referenceGrammarDisplayMode,
    renderInteractiveCoachText,
    renderInteractiveText,
    setReferenceGrammarDisplayMode,
    teachingMode,
    userTranslation,
    wavBlob,
}: UseDrillFeedbackViewParams) {
    const feedbackObject = useMemo(() => {
        if (!drillFeedback || Array.isArray(drillFeedback.feedback)) return null;
        return drillFeedback.feedback;
    }, [drillFeedback]);

    const analysisHighlights = useMemo<FeedbackHighlight[]>(() => {
        if (!drillData || !drillFeedback) return [];

        const comparisonTarget =
            drillFeedback.improved_version || (isDictationMode ? drillData.chinese : drillData.reference_english);

        if (mode === "listening" && drillFeedback.word_results?.length) {
            return drillFeedback.word_results
                .filter((row) => row.status !== "correct")
                .sort((left, right) => left.score - right.score)
                .slice(0, 3)
                .map((row) => ({
                    kind: row.status === "weak" ? "待加强" : "低分词",
                    before: `${row.score.toFixed(1)}/10`,
                    after: row.word.toUpperCase(),
                    note: [
                        typeof row.accuracy_score === "number" ? `Accuracy ${row.accuracy_score.toFixed(1)}` : null,
                        typeof row.stress_score === "number" ? `Stress ${row.stress_score.toFixed(1)}` : null,
                    ].filter(Boolean).join(" · ") || "该词当前词级评分偏低。",
                }));
        }

        if (drillFeedback.error_analysis && drillFeedback.error_analysis.length > 0) {
            return drillFeedback.error_analysis.slice(0, 3).map((err) => ({
                kind: "关键改错",
                before: err.error,
                after: err.correction,
                note: err.rule || "这里做了表达优化。",
                tip: err.tip || "",
            }));
        }

        return buildTranslationHighlights(userTranslation, comparisonTarget);
    }, [drillData, drillFeedback, isDictationMode, mode, userTranslation]);

    const analysisLead = useMemo(() => {
        if (!drillFeedback) return "";
        if (mode === "listening") {
            const utteranceScores = drillFeedback.utterance_scores;
            if (utteranceScores) {
                return `句级评分：总分 ${utteranceScores.total.toFixed(1)} / 准确度 ${utteranceScores.accuracy.toFixed(1)} / 流利度 ${utteranceScores.fluency.toFixed(1)}`;
            }
            return "发音评分结果";
        }
        if (drillFeedback.summary_cn) return drillFeedback.summary_cn;
        if (drillFeedback.judge_reasoning) return drillFeedback.judge_reasoning;
        if (Array.isArray(drillFeedback.feedback) && drillFeedback.feedback.length > 0) return drillFeedback.feedback[0];
        if (feedbackObject?.dictation_tips?.length) return feedbackObject.dictation_tips[0];
        if (feedbackObject?.listening_tips?.length) return feedbackObject.listening_tips[0];
        if (drillFeedback.tips_cn?.length) return drillFeedback.tips_cn[0];
        if (feedbackObject?.encouragement) return feedbackObject.encouragement;
        return "本题解析已生成。";
    }, [drillFeedback, feedbackObject, mode]);

    const referenceSentenceNode = useMemo(() => {
        if (!drillData) return null;

        if (referenceGrammarAnalysis) {
            return (
                <>
                    &ldquo;
                    <InlineGrammarHighlights
                        text={drillData.reference_english}
                        sentences={referenceGrammarAnalysis}
                        displayMode={referenceGrammarDisplayMode}
                        showSegmentTranslation
                        textClassName="leading-relaxed"
                    />
                    &rdquo;
                </>
            );
        }

        return <>&ldquo;{drillData.reference_english}&rdquo;</>;
    }, [drillData, referenceGrammarAnalysis, referenceGrammarDisplayMode]);

    const recapNode = useMemo(() => {
        if (!drillData) return null;

        const chineseText = drillData.chinese?.trim();
        const englishText = drillData.reference_english?.trim();
        const feedbackUserTranslation = drillFeedback?.user_translation;
        const learnerText = (
            typeof feedbackUserTranslation === "string"
                ? feedbackUserTranslation
                : userTranslation
        )?.trim();

        if (!chineseText && !englishText && !learnerText) return null;

        return (
            <TranslationFeedbackRecap
                chineseText={chineseText}
                englishText={englishText}
                learnerText={learnerText}
                alternatives={!isDictationMode ? (drillData.reference_english_alternatives?.slice(0, 4) ?? []) : []}
                showScoreTutorButton={mode === "translation" && Boolean(drillFeedback)}
                showGenerateAnalysisButton={!analysisRequested && mode !== "listening"}
                isGeneratingAnalysis={isGeneratingAnalysis}
                onOpenScoreTutor={onOpenScoreTutor}
                onGenerateAnalysis={onGenerateAnalysis}
                onReplayReference={() => { void onPlayAudio(); }}
                renderInteractiveText={renderInteractiveText}
            />
        );
    }, [
        analysisRequested,
        drillData,
        drillFeedback,
        isDictationMode,
        isGeneratingAnalysis,
        mode,
        onGenerateAnalysis,
        onOpenScoreTutor,
        onPlayAudio,
        renderInteractiveText,
        userTranslation,
    ]);

    const fullAnalysisContent = useMemo(() => (
        <TranslationAnalysisDetails
            details={fullAnalysisData}
            teachingMode={teachingMode}
        />
    ), [fullAnalysisData, teachingMode]);

    const hasDetailedAnalysis = Boolean(
        drillFeedback && (
            (drillFeedback.word_results && drillFeedback.word_results.length > 0) ||
            drillFeedback.segments ||
            drillFeedback.feedback ||
            drillFeedback.improved_version ||
            (drillFeedback.tips_cn && drillFeedback.tips_cn.length > 0) ||
            (drillFeedback.error_analysis && drillFeedback.error_analysis.length > 0) ||
            (drillFeedback.similar_patterns && drillFeedback.similar_patterns.length > 0)
        )
    );

    const listeningMetricCardsNode = useMemo(() => {
        if (mode !== "listening" || !drillFeedback) return null;
        return <ListeningMetricCards feedback={drillFeedback} />;
    }, [drillFeedback, mode]);

    const listeningReplayNode = useMemo(() => {
        if (mode !== "listening" || !drillFeedback) return null;
        return (
            <ListeningReplayPanel
                hasRecording={Boolean(wavBlob)}
                onPlayRecording={onPlayRecording}
                transcriptText={drillFeedback.transcript?.trim()}
            />
        );
    }, [drillFeedback, mode, onPlayRecording, wavBlob]);

    const diffNode = useMemo(() => {
        if (!drillData || !drillFeedback) return null;
        return (
            <DrillDiffPanel
                drillData={{
                    chinese: drillData.chinese,
                    reference_english: drillData.reference_english,
                    reference_english_alternatives: drillData.reference_english_alternatives,
                }}
                drillFeedback={drillFeedback}
                grammarError={grammarError}
                isDictationMode={isDictationMode}
                isGeneratingGrammar={isGeneratingGrammar}
                mode={mode}
                onGrammarDisplayModeChange={setReferenceGrammarDisplayMode}
                recapNode={recapNode}
                referenceGrammarAnalysis={referenceGrammarAnalysis}
                referenceGrammarDisplayMode={referenceGrammarDisplayMode}
                renderInteractiveCoachText={renderInteractiveCoachText}
                userTranslation={userTranslation}
            />
        );
    }, [
        drillData,
        drillFeedback,
        grammarError,
        isDictationMode,
        isGeneratingGrammar,
        mode,
        recapNode,
        referenceGrammarAnalysis,
        referenceGrammarDisplayMode,
        renderInteractiveCoachText,
        setReferenceGrammarDisplayMode,
        userTranslation,
    ]);

    return {
        analysisHighlights,
        analysisLead,
        diffNode,
        fullAnalysisContent,
        hasDetailedAnalysis,
        listeningMetricCardsNode,
        listeningReplayNode,
        recapNode,
        referenceSentenceNode,
    };
}
