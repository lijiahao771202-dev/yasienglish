"use client";

import type { ReactNode } from "react";

import type { GrammarDisplayMode } from "@/lib/grammarHighlights";

import { DrillAnalysisPanel } from "./DrillAnalysisPanel";
import { DrillFeedbackHero, type DrillFeedbackHeroProps } from "./DrillFeedbackHero";
import { DrillFeedbackSummaryCard, type DrillFeedbackHighlight } from "./DrillFeedbackSummaryCard";
import { TranslationAnalysisJourney } from "./TranslationAnalysisJourney";

type DrillFeedbackContentFeedback = DrillFeedbackHeroProps["feedback"] & {
    _isLocalEvaluation?: boolean;
    improved_version?: string;
    judge_reasoning?: string;
    score: number;
};

export interface DrillFeedbackContentProps {
    analysisError: string | null;
    analysisHighlights: DrillFeedbackHighlight[];
    analysisLead: string;
    analysisRequested: boolean;
    currentElo: number;
    defaultBaseElo: number;
    eloChange: number | null;
    feedback: DrillFeedbackContentFeedback;
    fullAnalysisContent: ReactNode;
    fullAnalysisError: string | null;
    fullAnalysisOpen: boolean;
    fullAnalysisRequested: boolean;
    grammarDisplayMode: GrammarDisplayMode;
    grammarError: string | null;
    hasDetailedAnalysis: boolean;
    isDictationMode: boolean;
    isGeneratingAnalysis: boolean;
    isGeneratingFullAnalysis: boolean;
    isGeneratingGrammar: boolean;
    isListeningMode: boolean;
    isShadowingMode: boolean;
    isSubmitting: boolean;
    listeningNode: ReactNode;
    metricCardsNode?: ReactNode | null;
    mode: string;
    onAppeal: () => void;
    onGenerateFullAnalysis: () => void;
    onGenerateGrammar: () => void;
    onGrammarDisplayModeChange: (mode: GrammarDisplayMode) => void;
    onPlayReferenceAudio: () => void;
    onPlayRecording?: () => void;
    onRetryAnalysis: () => void;
    onRetryScore: () => void;
    onToggleFullAnalysis: () => void;
    prefersReducedMotion: boolean;
    primaryAdvice?: string;
    recapNode: ReactNode;
    referenceGrammarAnalysis: unknown;
    referenceSentenceNode: ReactNode;
    streakTier: number;
    streakVisualScoreGlow?: string;
    translationCorrectionTargetText: string;
    translationImprovedVersionNode?: ReactNode | null;
    userTranslation: string;
}

export function DrillFeedbackContent({
    analysisError,
    analysisHighlights,
    analysisLead,
    analysisRequested,
    currentElo,
    defaultBaseElo,
    eloChange,
    feedback,
    fullAnalysisContent,
    fullAnalysisError,
    fullAnalysisOpen,
    fullAnalysisRequested,
    grammarDisplayMode,
    grammarError,
    hasDetailedAnalysis,
    isDictationMode,
    isGeneratingAnalysis,
    isGeneratingFullAnalysis,
    isGeneratingGrammar,
    isListeningMode,
    isShadowingMode,
    isSubmitting,
    listeningNode,
    metricCardsNode,
    mode,
    onAppeal,
    onGenerateFullAnalysis,
    onGenerateGrammar,
    onGrammarDisplayModeChange,
    onPlayReferenceAudio,
    onPlayRecording,
    onRetryAnalysis,
    onRetryScore,
    onToggleFullAnalysis,
    prefersReducedMotion,
    primaryAdvice,
    recapNode,
    referenceGrammarAnalysis,
    referenceSentenceNode,
    streakTier,
    streakVisualScoreGlow,
    translationCorrectionTargetText,
    translationImprovedVersionNode,
    userTranslation,
}: DrillFeedbackContentProps) {
    return (
        <>
            <DrillFeedbackHero
                currentElo={currentElo}
                defaultBaseElo={defaultBaseElo}
                eloChange={eloChange}
                feedback={feedback}
                isSubmitting={isSubmitting}
                mode={mode}
                onAppeal={onAppeal}
                onRetryScore={onRetryScore}
                prefersReducedMotion={prefersReducedMotion}
                recapNode={recapNode}
                streakTier={streakTier}
                streakVisualScoreGlow={streakVisualScoreGlow}
            />

            <DrillAnalysisPanel
                analysisError={analysisError}
                analysisRequested={analysisRequested}
                defaultNode={(
                    <DrillFeedbackSummaryCard
                        analysisHighlights={analysisHighlights}
                        analysisLead={analysisLead}
                        improvedVersionNode={translationImprovedVersionNode}
                        isDictationMode={isDictationMode}
                        isLocalEvaluation={feedback._isLocalEvaluation}
                        isShadowingMode={isShadowingMode}
                        judgeReasoning={!isListeningMode ? feedback.judge_reasoning : undefined}
                        metricCardsNode={metricCardsNode}
                        onPlayRecording={onPlayRecording}
                        onPlayReferenceAudio={onPlayReferenceAudio}
                        primaryAdvice={primaryAdvice}
                        userTranslation={userTranslation}
                    />
                )}
                hasDetailedAnalysis={hasDetailedAnalysis}
                isGeneratingAnalysis={isGeneratingAnalysis}
                listeningNode={listeningNode}
                mode={mode}
                onRetry={onRetryAnalysis}
                translationNode={(
                    <TranslationAnalysisJourney
                        analysisLead={analysisLead}
                        analysisHighlights={analysisHighlights}
                        userTranslation={userTranslation}
                        correctionTargetText={translationCorrectionTargetText}
                        improvedVersionNode={translationImprovedVersionNode ?? null}
                        referenceSentenceNode={referenceSentenceNode}
                        isGeneratingGrammar={isGeneratingGrammar}
                        grammarError={grammarError}
                        grammarButtonLabel={referenceGrammarAnalysis ? "重新生成语法分析" : "生成语法分析"}
                        hasGrammarAnalysis={Boolean(referenceGrammarAnalysis)}
                        grammarDisplayMode={grammarDisplayMode}
                        onGenerateGrammar={onGenerateGrammar}
                        onGrammarDisplayModeChange={onGrammarDisplayModeChange}
                        onPlayReferenceAudio={onPlayReferenceAudio}
                        hasFullAnalysis={fullAnalysisRequested && Boolean(fullAnalysisContent)}
                        isGeneratingFullAnalysis={isGeneratingFullAnalysis}
                        fullAnalysisError={fullAnalysisError}
                        fullAnalysisOpen={fullAnalysisOpen}
                        onGenerateFullAnalysis={onGenerateFullAnalysis}
                        onToggleFullAnalysis={onToggleFullAnalysis}
                        fullAnalysisContent={fullAnalysisContent}
                    />
                )}
            />
        </>
    );
}
