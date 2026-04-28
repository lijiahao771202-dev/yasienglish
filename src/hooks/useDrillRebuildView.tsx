"use client";

import { useCallback, useMemo, type ComponentProps, type MouseEvent, type ReactNode } from "react";

import { RebuildComposer } from "@/components/drill/RebuildComposer";
import { RebuildQuestionPanel } from "@/components/drill/RebuildQuestionPanel";
import { RebuildShadowingPanel } from "@/components/drill/RebuildShadowingPanel";
import { RebuildShadowingPrompt } from "@/components/drill/RebuildShadowingPrompt";
import type { RebuildFeedbackStageProps } from "@/components/drill/RebuildFeedbackStage";
import type { CachedDrillAudio } from "@/hooks/useDrillAudioPlayback";
import type {
    RebuildFeedbackState,
    RebuildPassageSegmentResultState,
    RebuildPassageSegmentUiState,
    RebuildPassageSummaryState,
} from "@/lib/drill-rebuild-types";
import type { RebuildSelfEvaluation } from "@/lib/rebuild-mode";
import type { RebuildShadowingScope } from "@/lib/rebuild-shadowing-state";

interface RebuildDrillData {
    chinese: string;
    reference_english: string;
    _rebuildMeta?: {
        answerTokens: string[];
        passageSession?: {
            currentIndex: number;
            segmentCount: 2 | 3 | 5;
            segments: Array<{
                chinese: string;
                id: string;
                referenceEnglish: string;
            }>;
        };
        variant?: "sentence" | "passage";
    };
}

type RebuildComposerTheme = ComponentProps<typeof RebuildQuestionPanel>["activeCosmeticTheme"];
type RebuildQuestionUi =
    ComponentProps<typeof RebuildQuestionPanel>["activeCosmeticUi"]
    & ComponentProps<typeof RebuildComposer>["activeCosmeticUi"];
type RebuildShadowingPanelEntry = ComponentProps<typeof RebuildShadowingPanel>["activeEntry"];
type RebuildShadowingPanelScoreFx = ComponentProps<typeof RebuildShadowingPanel>["scoreFx"];
type RebuildShadowingPanelState = ComponentProps<typeof RebuildShadowingPanel>["shadowingState"];
type RebuildShadowingPanelTokenAlign = ComponentProps<typeof RebuildShadowingPanel>["alignTokens"];
type RebuildShadowingPanelScoreRecognition = ComponentProps<typeof RebuildShadowingPanel>["scoreRecognition"];

interface UseDrillRebuildViewParams {
    activatePassageSegment: (segmentIndex: number) => void;
    activeCosmeticTheme: RebuildComposerTheme;
    activeCosmeticUi: RebuildQuestionUi;
    activePassageResult: RebuildPassageSegmentResultState | null;
    activePassageSegmentForShadowing: {
        chinese: string;
        referenceEnglish: string;
    } | null;
    activePassageSegmentIndex: number;
    activeRebuildShadowingEntry: RebuildShadowingPanelEntry | null;
    activeRebuildShadowingScope: RebuildShadowingScope | null;
    audioSourceText: string | null;
    buildSentenceIpa: (sentence: string) => string;
    currentAudioTime: number;
    drillData: RebuildDrillData | null;
    getCachedAudio: (text: string) => CachedDrillAudio | undefined;
    handleInteractiveTextMouseUp: (text?: string) => void;
    handlePlayRebuildShadowingRecording: () => void;
    handleRebuildPoolTokenClick: (tokenId: string) => void;
    handleRebuildRemoveToken: (tokenId: string) => void;
    handleRebuildSelfEvaluate: (evaluation: RebuildSelfEvaluation) => void;
    handleSkipRebuild: () => void;
    handleStartRebuildShadowingRecording: () => void | Promise<unknown>;
    handleStopRebuildShadowingRecording: () => void;
    handleSubmitDrill: () => void | Promise<unknown>;
    handleSubmitRebuildShadowing: () => void | Promise<unknown> | boolean;
    handleWordClick: (event: MouseEvent<HTMLElement>, word: string, sentence?: string) => void;
    isAudioLoading: boolean;
    isIpaReady: boolean;
    isPlaying: boolean;
    isRebuildMode: boolean;
    isRebuildPassage: boolean;
    isRebuildSpeechRecognitionRunning: boolean;
    isRebuildSpeechRecognitionSupported: boolean;
    isVerdantRebuild: boolean;
    loadingAudioKeys: Set<string>;
    onCyclePlaybackSpeed: () => void;
    onOpenTour: () => void;
    onPlayAudio: (text?: string) => void | Promise<unknown>;
    onTogglePassageChinese: (segmentIndex: number) => void;
    onToggleRebuildAutocorrect: () => void;
    onToggleRebuildHideTokens: () => void;
    onToggleSentenceChinese: () => void;
    passageShadowingFlow: "idle" | "prompt" | "shadowing" | "feedback";
    pendingRebuildSentenceFeedback: RebuildFeedbackState | null;
    playbackSpeed: number;
    prefersReducedMotion: boolean | null;
    rebuildAnswerTokens: ComponentProps<typeof RebuildComposer>["rebuildAnswerTokens"];
    rebuildAutocompleteSuggestion: string | null;
    rebuildAvailableTokens: ComponentProps<typeof RebuildComposer>["rebuildAvailableTokens"];
    rebuildAutocorrect: boolean;
    rebuildCombo: number;
    rebuildFeedback: RebuildFeedbackState | null;
    rebuildHideTokens: boolean;
    rebuildListeningProgressCursor: number;
    rebuildListeningScoreFx: RebuildShadowingPanelScoreFx;
    rebuildPassageResults: RebuildPassageSegmentResultState[];
    rebuildPassageShadowingSegmentIndex: number | null;
    rebuildPassageSummary: RebuildPassageSummaryState | null;
    rebuildPassageUiState: RebuildPassageSegmentUiState[];
    rebuildShadowingLiveRecognitionTranscript: string;
    rebuildShadowingState: RebuildShadowingPanelState;
    rebuildTypingBuffer: string;
    renderInteractiveCoachText: (text: string) => ReactNode;
    renderInteractiveText: (text: string) => ReactNode;
    scoreRebuildShadowingRecognition: RebuildShadowingPanelScoreRecognition;
    sentenceShadowingFlow: "idle" | "prompt" | "shadowing" | "feedback";
    setRebuildPassageShadowingFlow: (flow: "idle" | "prompt" | "shadowing" | "feedback") => void;
    setRebuildSentenceShadowingFlow: (flow: "idle" | "prompt" | "shadowing" | "feedback") => void;
    shouldShowRebuildShadowingCorrection: boolean;
    showChinese: boolean;
    normalizeRebuildShadowingText: (text: string) => string;
    alignRebuildShadowingTokens: RebuildShadowingPanelTokenAlign;
}

export function useDrillRebuildView({
    activatePassageSegment,
    activeCosmeticTheme,
    activeCosmeticUi,
    activePassageResult,
    activePassageSegmentForShadowing,
    activePassageSegmentIndex,
    activeRebuildShadowingEntry,
    activeRebuildShadowingScope,
    audioSourceText,
    buildSentenceIpa,
    currentAudioTime,
    drillData,
    getCachedAudio,
    handleInteractiveTextMouseUp,
    handlePlayRebuildShadowingRecording,
    handleRebuildPoolTokenClick,
    handleRebuildRemoveToken,
    handleRebuildSelfEvaluate,
    handleSkipRebuild,
    handleStartRebuildShadowingRecording,
    handleStopRebuildShadowingRecording,
    handleSubmitDrill,
    handleSubmitRebuildShadowing,
    handleWordClick,
    isAudioLoading,
    isIpaReady,
    isPlaying,
    isRebuildMode,
    isRebuildPassage,
    isRebuildSpeechRecognitionRunning,
    isRebuildSpeechRecognitionSupported,
    isVerdantRebuild,
    loadingAudioKeys,
    onCyclePlaybackSpeed,
    onOpenTour,
    onPlayAudio,
    onTogglePassageChinese,
    onToggleRebuildAutocorrect,
    onToggleRebuildHideTokens,
    onToggleSentenceChinese,
    passageShadowingFlow,
    pendingRebuildSentenceFeedback,
    playbackSpeed,
    prefersReducedMotion,
    rebuildAnswerTokens,
    rebuildAutocompleteSuggestion,
    rebuildAvailableTokens,
    rebuildAutocorrect,
    rebuildCombo,
    rebuildFeedback,
    rebuildHideTokens,
    rebuildListeningProgressCursor,
    rebuildListeningScoreFx,
    rebuildPassageResults,
    rebuildPassageShadowingSegmentIndex,
    rebuildPassageSummary,
    rebuildPassageUiState,
    rebuildShadowingLiveRecognitionTranscript,
    rebuildShadowingState,
    rebuildTypingBuffer,
    renderInteractiveCoachText,
    renderInteractiveText,
    scoreRebuildShadowingRecognition,
    sentenceShadowingFlow,
    setRebuildPassageShadowingFlow,
    setRebuildSentenceShadowingFlow,
    shouldShowRebuildShadowingCorrection,
    showChinese,
    normalizeRebuildShadowingText,
    alignRebuildShadowingTokens,
}: UseDrillRebuildViewParams) {
    const buildRebuildShadowingNode = useCallback((params: { chinese: string; referenceEnglish: string }) => {
        if (!isRebuildMode || !activeRebuildShadowingScope || !activeRebuildShadowingEntry) return null;

        const { chinese, referenceEnglish } = params;
        const isReferenceAudioLoading = audioSourceText === referenceEnglish && isAudioLoading;
        const isReferenceAudioPlaying = audioSourceText === referenceEnglish && isPlaying;
        const referenceMarks = getCachedAudio(referenceEnglish)?.marks;

        return (
            <RebuildShadowingPanel
                activeEntry={activeRebuildShadowingEntry}
                chinese={chinese}
                currentAudioTime={currentAudioTime}
                isReferenceAudioLoading={isReferenceAudioLoading}
                isReferenceAudioPlaying={isReferenceAudioPlaying}
                isSpeechRecognitionRunning={isRebuildSpeechRecognitionRunning}
                isSpeechRecognitionSupported={isRebuildSpeechRecognitionSupported}
                liveRecognitionTranscript={rebuildShadowingLiveRecognitionTranscript}
                normalizeTranscript={normalizeRebuildShadowingText}
                onInteractiveTextMouseUp={handleInteractiveTextMouseUp}
                onPlayReference={onPlayAudio}
                onPlaySelfRecording={handlePlayRebuildShadowingRecording}
                onStartRecording={handleStartRebuildShadowingRecording}
                onStopRecording={handleStopRebuildShadowingRecording}
                onSubmit={handleSubmitRebuildShadowing}
                onWordClick={handleWordClick}
                prefersReducedMotion={prefersReducedMotion}
                rebuildListeningProgressCursor={rebuildListeningProgressCursor}
                referenceEnglish={referenceEnglish}
                referenceMarks={referenceMarks}
                renderInteractiveCoachText={renderInteractiveCoachText}
                scoreFx={rebuildListeningScoreFx}
                scoreRecognition={scoreRebuildShadowingRecognition}
                shadowingState={rebuildShadowingState}
                shouldShowCorrection={shouldShowRebuildShadowingCorrection}
                alignTokens={alignRebuildShadowingTokens}
            />
        );
    }, [
        activeRebuildShadowingEntry,
        activeRebuildShadowingScope,
        alignRebuildShadowingTokens,
        audioSourceText,
        getCachedAudio,
        handleInteractiveTextMouseUp,
        handlePlayRebuildShadowingRecording,
        handleStartRebuildShadowingRecording,
        handleStopRebuildShadowingRecording,
        handleSubmitRebuildShadowing,
        handleWordClick,
        isAudioLoading,
        isPlaying,
        isRebuildMode,
        isRebuildSpeechRecognitionRunning,
        isRebuildSpeechRecognitionSupported,
        normalizeRebuildShadowingText,
        onPlayAudio,
        prefersReducedMotion,
        currentAudioTime,
        rebuildListeningProgressCursor,
        rebuildListeningScoreFx,
        rebuildShadowingLiveRecognitionTranscript,
        rebuildShadowingState,
        renderInteractiveCoachText,
        scoreRebuildShadowingRecognition,
        shouldShowRebuildShadowingCorrection,
    ]);

    const rebuildSentenceShadowingPromptNode = useMemo(() => {
        const sentenceFeedback = rebuildFeedback ?? pendingRebuildSentenceFeedback;
        if (!drillData || !sentenceFeedback || isRebuildPassage) return null;

        return (
            <RebuildShadowingPrompt
                variant="sentence"
                chinese={drillData.chinese}
                onContinue={() => setRebuildSentenceShadowingFlow("idle")}
                onStart={() => setRebuildSentenceShadowingFlow("shadowing")}
                prefersReducedMotion={prefersReducedMotion}
                referenceEnglish={drillData.reference_english}
                renderInteractiveCoachText={renderInteractiveCoachText}
                resolvedAt={sentenceFeedback.resolvedAt}
            />
        );
    }, [
        drillData,
        isRebuildPassage,
        pendingRebuildSentenceFeedback,
        prefersReducedMotion,
        rebuildFeedback,
        renderInteractiveCoachText,
        setRebuildSentenceShadowingFlow,
    ]);

    const rebuildPassageShadowingPromptNode = useMemo(() => {
        if (!isRebuildPassage || !activePassageSegmentForShadowing || !activePassageResult) return null;

        return (
            <RebuildShadowingPrompt
                variant="passage"
                activePassageSegmentIndex={activePassageSegmentIndex}
                chinese={activePassageSegmentForShadowing.chinese}
                onContinue={() => setRebuildPassageShadowingFlow("idle")}
                onStart={() => setRebuildPassageShadowingFlow("shadowing")}
                prefersReducedMotion={prefersReducedMotion}
                referenceEnglish={activePassageSegmentForShadowing.referenceEnglish}
                renderInteractiveCoachText={renderInteractiveCoachText}
                resolvedAt={activePassageResult.feedback.resolvedAt}
            />
        );
    }, [
        activePassageResult,
        activePassageSegmentForShadowing,
        activePassageSegmentIndex,
        isRebuildPassage,
        prefersReducedMotion,
        renderInteractiveCoachText,
        setRebuildPassageShadowingFlow,
    ]);

    const rebuildQuestionNode = useMemo(() => {
        if (!drillData?._rebuildMeta) return null;

        const renderRebuildComposer = (
            submitLabel = "发送",
            compact = false,
            readOnlyAfterSubmit = false,
            nextPendingSegmentIndex = -1,
            audioTextToPlay?: string,
        ) => (
            <RebuildComposer
                activeCosmeticTheme={activeCosmeticTheme}
                activeCosmeticUi={activeCosmeticUi}
                activePassageResult={activePassageResult}
                compact={compact}
                drillData={drillData}
                handleInteractiveTextMouseUp={handleInteractiveTextMouseUp}
                handleWordClick={handleWordClick}
                isRebuildPassage={isRebuildPassage}
                isVerdantRebuild={isVerdantRebuild}
                nextButtonStyle={{
                    background: activeCosmeticUi.nextButtonGradient,
                    boxShadow: activeCosmeticUi.nextButtonShadow,
                }}
                nextPendingSegmentIndex={nextPendingSegmentIndex}
                onActivatePassageSegment={activatePassageSegment}
                onOpenTour={onOpenTour}
                onPlayAudio={() => onPlayAudio(audioTextToPlay ?? audioSourceText ?? drillData?.reference_english)}
                onPoolTokenClick={handleRebuildPoolTokenClick}
                onRemoveToken={handleRebuildRemoveToken}
                onSkip={handleSkipRebuild}
                onSubmit={() => {
                    void handleSubmitDrill();
                }}
                onToggleAutocorrect={onToggleRebuildAutocorrect}
                onToggleHideTokens={onToggleRebuildHideTokens}
                onToggleSentenceChinese={onToggleSentenceChinese}
                prefersReducedMotion={prefersReducedMotion}
                readOnlyAfterSubmit={readOnlyAfterSubmit}
                rebuildAnswerTokens={rebuildAnswerTokens}
                rebuildAutocompleteSuggestion={rebuildAutocompleteSuggestion}
                rebuildAvailableTokens={rebuildAvailableTokens}
                rebuildAutocorrect={rebuildAutocorrect}
                rebuildCombo={rebuildCombo}
                rebuildFeedback={rebuildFeedback}
                rebuildHideTokens={rebuildHideTokens}
                rebuildPassageSummary={rebuildPassageSummary}
                rebuildTypingBuffer={rebuildTypingBuffer}
                showSentenceChinese={showChinese}
                submitLabel={submitLabel}
            />
        );

        return (
            <RebuildQuestionPanel
                activeCosmeticTheme={activeCosmeticTheme}
                activeCosmeticUi={activeCosmeticUi}
                activePassageSegmentIndex={activePassageSegmentIndex}
                audioSourceText={audioSourceText}
                buildSentenceIpa={buildSentenceIpa}
                drillData={drillData}
                hasSentenceFeedback={Boolean(rebuildFeedback || pendingRebuildSentenceFeedback)}
                isAudioLoading={isAudioLoading}
                isIpaReady={isIpaReady}
                isPlaying={isPlaying}
                isVerdantRebuild={isVerdantRebuild}
                loadingAudioKeys={loadingAudioKeys}
                onCyclePlaybackSpeed={onCyclePlaybackSpeed}
                onPlayAudio={onPlayAudio}
                onRebuildSelfEvaluate={handleRebuildSelfEvaluate}
                onTogglePassageChinese={onTogglePassageChinese}
                playbackSpeed={playbackSpeed}
                prefersReducedMotion={prefersReducedMotion}
                rebuildPassageResults={rebuildPassageResults}
                rebuildPassageSummary={rebuildPassageSummary}
                rebuildPassageUiState={rebuildPassageUiState}
                renderInteractiveText={renderInteractiveText}
                renderRebuildComposer={renderRebuildComposer}
                showChinese={showChinese}
            />
        );
    }, [
        activatePassageSegment,
        activeCosmeticTheme,
        activeCosmeticUi,
        activePassageResult,
        activePassageSegmentIndex,
        audioSourceText,
        buildSentenceIpa,
        drillData,
        handleInteractiveTextMouseUp,
        handleRebuildPoolTokenClick,
        handleRebuildRemoveToken,
        handleRebuildSelfEvaluate,
        handleSkipRebuild,
        handleSubmitDrill,
        handleWordClick,
        isAudioLoading,
        isIpaReady,
        isPlaying,
        isRebuildPassage,
        isVerdantRebuild,
        loadingAudioKeys,
        onCyclePlaybackSpeed,
        onOpenTour,
        onPlayAudio,
        onTogglePassageChinese,
        onToggleRebuildAutocorrect,
        onToggleRebuildHideTokens,
        onToggleSentenceChinese,
        playbackSpeed,
        prefersReducedMotion,
        rebuildAnswerTokens,
        rebuildAutocompleteSuggestion,
        rebuildAvailableTokens,
        rebuildAutocorrect,
        rebuildCombo,
        rebuildFeedback,
        rebuildHideTokens,
        rebuildPassageResults,
        rebuildPassageSummary,
        rebuildPassageUiState,
        rebuildTypingBuffer,
        renderInteractiveText,
        showChinese,
    ]);

    const sentenceStageProps = useMemo<RebuildFeedbackStageProps | null>(() => {
        if (
            !isRebuildMode
            || isRebuildPassage
            || !(rebuildFeedback || pendingRebuildSentenceFeedback)
            || !(sentenceShadowingFlow === "prompt" || sentenceShadowingFlow === "shadowing")
        ) {
            return null;
        }

        return {
            backgroundClassName: "bg-[rgba(248,250,252,0.78)] backdrop-blur-[10px]",
            continueLabel: "查看重组评分",
            isOpen: true,
            modalKey: `rebuild-feedback-modal-${(rebuildFeedback ?? pendingRebuildSentenceFeedback)?.resolvedAt ?? "pending"}`,
            onContinue: () => setRebuildSentenceShadowingFlow("idle"),
            prefersReducedMotion: Boolean(prefersReducedMotion),
            promptNode: rebuildSentenceShadowingPromptNode,
            shadowingNode: drillData
                ? buildRebuildShadowingNode({
                    referenceEnglish: drillData.reference_english,
                    chinese: drillData.chinese,
                })
                : null,
            showPrompt: sentenceShadowingFlow === "prompt",
        };
    }, [
        buildRebuildShadowingNode,
        drillData,
        isRebuildMode,
        isRebuildPassage,
        pendingRebuildSentenceFeedback,
        prefersReducedMotion,
        rebuildFeedback,
        rebuildSentenceShadowingPromptNode,
        sentenceShadowingFlow,
        setRebuildSentenceShadowingFlow,
    ]);

    const passageStageProps = useMemo<RebuildFeedbackStageProps | null>(() => {
        if (
            !isRebuildMode
            || !isRebuildPassage
            || rebuildPassageSummary
            || !activePassageResult
            || !activePassageSegmentForShadowing
            || rebuildPassageShadowingSegmentIndex !== activePassageSegmentIndex
            || !(passageShadowingFlow === "prompt" || passageShadowingFlow === "shadowing")
        ) {
            return null;
        }

        return {
            backgroundClassName: "bg-[radial-gradient(circle_at_top,rgba(255,245,251,0.88),rgba(240,249,255,0.82),rgba(248,250,252,0.88))] backdrop-blur-[12px]",
            continueLabel: "返回短文继续",
            isOpen: true,
            modalKey: `rebuild-passage-shadowing-modal-${activePassageSegmentIndex}-${activePassageResult.feedback.resolvedAt ?? "pending"}`,
            onContinue: () => setRebuildPassageShadowingFlow("idle"),
            prefersReducedMotion: Boolean(prefersReducedMotion),
            promptNode: rebuildPassageShadowingPromptNode,
            shadowingNode: buildRebuildShadowingNode({
                referenceEnglish: activePassageSegmentForShadowing.referenceEnglish,
                chinese: activePassageSegmentForShadowing.chinese,
            }),
            showPrompt: passageShadowingFlow === "prompt",
        };
    }, [
        activePassageResult,
        activePassageSegmentForShadowing,
        activePassageSegmentIndex,
        buildRebuildShadowingNode,
        isRebuildMode,
        isRebuildPassage,
        passageShadowingFlow,
        prefersReducedMotion,
        rebuildPassageShadowingSegmentIndex,
        rebuildPassageSummary,
        rebuildPassageShadowingPromptNode,
        setRebuildPassageShadowingFlow,
    ]);

    return {
        passageStageProps,
        rebuildQuestionNode,
        sentenceStageProps,
    };
}
