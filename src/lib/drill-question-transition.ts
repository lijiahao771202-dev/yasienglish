import type { MutableRefObject } from "react";

type PassageVariant = "sentence" | "passage";
type SourceMode = "ai" | "bank";
type LooseSetter<T> = { bivarianceHack(value: T): void }["bivarianceHack"];

interface PassageAwareDrill {
    chinese: string;
    reference_english: string;
    mode?: string;
    sourceMode?: SourceMode;
    _rebuildMeta?: {
        variant?: PassageVariant;
        passageSession?: {
            currentIndex: number;
        };
    };
    _translationMeta?: {
        variant?: PassageVariant;
        passageSession?: {
            currentIndex: number;
        };
    };
}

interface FullReferenceHintState {
    version: number;
    text: string;
}

interface DrillQuestionTransitionCommonArgs {
    audioRef: MutableRefObject<HTMLAudioElement | null>;
    hasPlayedEchoRef: MutableRefObject<boolean>;
    isDictationMode: boolean;
    resetGuidedLearningState: (active: boolean) => void;
    resetRebuildShadowingState: () => void;
    resetResult: () => void;
    setActivePassageSegmentIndex: LooseSetter<number>;
    setAnalysisDetailsOpen: LooseSetter<boolean>;
    setAnalysisError: LooseSetter<string | null>;
    setAnalysisRequested: LooseSetter<boolean>;
    setBlindVisibleUnlockConsumed: LooseSetter<boolean>;
    setDrillFeedback: LooseSetter<unknown | null>;
    setEloChange: LooseSetter<number | null>;
    setFullAnalysisData: LooseSetter<unknown | null>;
    setFullAnalysisError: LooseSetter<string | null>;
    setFullAnalysisOpen: LooseSetter<boolean>;
    setFullAnalysisRequested: LooseSetter<boolean>;
    setFullReferenceHint: (updater: (prev: FullReferenceHintState) => FullReferenceHintState) => void;
    setGrammarError: LooseSetter<string | null>;
    setHasRatedDrill: LooseSetter<boolean>;
    setIsBlindMode: LooseSetter<boolean>;
    setIsGeneratingAnalysis: LooseSetter<boolean>;
    setIsGeneratingFullAnalysis: LooseSetter<boolean>;
    setIsGeneratingGrammar: LooseSetter<boolean>;
    setIsHintLoading: LooseSetter<boolean>;
    setIsPlaying: LooseSetter<boolean>;
    setIsTranslationAudioUnlocked: LooseSetter<boolean>;
    setIsTutorOpen: LooseSetter<boolean>;
    setIsVocabHintRevealed: LooseSetter<boolean>;
    setLightningStarted: LooseSetter<boolean>;
    setRebuildFeedback: LooseSetter<unknown | null>;
    setRebuildPassageDrafts: LooseSetter<unknown[]>;
    setRebuildPassageResults: LooseSetter<unknown[]>;
    setRebuildPassageScores: LooseSetter<unknown[]>;
    setRebuildPassageSummary: LooseSetter<unknown | null>;
    setRebuildPassageUiState: LooseSetter<unknown[]>;
    setRebuildTutorSession: LooseSetter<unknown | null>;
    setRebuildTypingBuffer: LooseSetter<string>;
    setReferenceGrammarAnalysis: LooseSetter<unknown | null>;
    setReferenceGrammarDisplayMode: LooseSetter<string>;
    setScoreTutorSession: LooseSetter<unknown | null>;
    setShowChinese: LooseSetter<boolean>;
    setTutorAnswer: LooseSetter<unknown | null>;
    setTutorPendingQuestion: LooseSetter<unknown | null>;
    setTutorQuery: LooseSetter<string>;
    setTutorResponse: LooseSetter<unknown | null>;
    setTutorThinkingMode: LooseSetter<string>;
    setTutorThread: LooseSetter<unknown[]>;
    setUserTranslation: LooseSetter<string>;
    setWordPopup: LooseSetter<unknown | null>;
    translationAudioUnlockRef: MutableRefObject<boolean>;
    vocabHintRevealRef: MutableRefObject<boolean>;
}

interface ResetDrillUiForGenerationArgs extends DrillQuestionTransitionCommonArgs {
    setActiveTranslationPassageSegmentIndex: LooseSetter<number>;
    setDrillData: LooseSetter<null>;
    setIsGeneratingDrill: LooseSetter<boolean>;
    setTranslationPassageResults: LooseSetter<unknown[]>;
}

interface ConsumePrefetchedDrillArgs<TDrill extends PassageAwareDrill> extends DrillQuestionTransitionCommonArgs {
    clearRebuildChoicePrefetch: () => void;
    hydratePassageSegmentDrill: (drill: TDrill, index: number) => TDrill;
    nextDrill: TDrill;
    setDrillData: LooseSetter<TDrill>;
    setIsGeneratingDrill: LooseSetter<boolean>;
    setPendingRebuildAdvanceElo: LooseSetter<number | null>;
    setPrefetchedDrillData: LooseSetter<null>;
}

export function hydrateDrillForTransition<TDrill extends PassageAwareDrill>(
    nextDrill: TDrill,
    hydratePassageSegmentDrill: (drill: TDrill, index: number) => TDrill,
): TDrill {
    const isNextPassage = nextDrill._rebuildMeta?.variant === "passage"
        || nextDrill._translationMeta?.variant === "passage";
    const nextTargetIndex = nextDrill._rebuildMeta?.passageSession?.currentIndex
        ?? nextDrill._translationMeta?.passageSession?.currentIndex
        ?? 0;

    if (!isNextPassage) {
        return nextDrill;
    }

    return {
        ...hydratePassageSegmentDrill(nextDrill, nextTargetIndex),
        mode: nextDrill.mode,
        sourceMode: nextDrill.sourceMode,
    };
}

export function consumePrefetchedDrillTransition<TDrill extends PassageAwareDrill>({
    clearRebuildChoicePrefetch,
    hydratePassageSegmentDrill,
    nextDrill,
    setDrillData,
    setIsGeneratingDrill,
    setPendingRebuildAdvanceElo,
    setPrefetchedDrillData,
    ...common
}: ConsumePrefetchedDrillArgs<TDrill>) {
    const hydratedDrill = hydrateDrillForTransition(nextDrill, hydratePassageSegmentDrill);
    setDrillData(hydratedDrill);
    setPrefetchedDrillData(null);
    clearRebuildChoicePrefetch();
    setPendingRebuildAdvanceElo(null);
    applyCommonQuestionReset(common);
    setIsGeneratingDrill(false);
    return hydratedDrill;
}

export function resetDrillUiForGeneration({
    setActiveTranslationPassageSegmentIndex,
    setDrillData,
    setIsGeneratingDrill,
    setTranslationPassageResults,
    ...common
}: ResetDrillUiForGenerationArgs) {
    setIsGeneratingDrill(true);
    setDrillData(null);
    applyCommonQuestionReset(common);
    setActiveTranslationPassageSegmentIndex(0);
    setTranslationPassageResults([]);
}

function applyCommonQuestionReset({
    audioRef,
    hasPlayedEchoRef,
    isDictationMode,
    resetGuidedLearningState,
    resetRebuildShadowingState,
    resetResult,
    setActivePassageSegmentIndex,
    setAnalysisDetailsOpen,
    setAnalysisError,
    setAnalysisRequested,
    setBlindVisibleUnlockConsumed,
    setDrillFeedback,
    setEloChange,
    setFullAnalysisData,
    setFullAnalysisError,
    setFullAnalysisOpen,
    setFullAnalysisRequested,
    setFullReferenceHint,
    setGrammarError,
    setHasRatedDrill,
    setIsBlindMode,
    setIsGeneratingAnalysis,
    setIsGeneratingFullAnalysis,
    setIsGeneratingGrammar,
    setIsHintLoading,
    setIsPlaying,
    setIsTranslationAudioUnlocked,
    setIsTutorOpen,
    setIsVocabHintRevealed,
    setLightningStarted,
    setRebuildFeedback,
    setRebuildPassageDrafts,
    setRebuildPassageResults,
    setRebuildPassageScores,
    setRebuildPassageSummary,
    setRebuildPassageUiState,
    setRebuildTutorSession,
    setRebuildTypingBuffer,
    setReferenceGrammarAnalysis,
    setReferenceGrammarDisplayMode,
    setScoreTutorSession,
    setShowChinese,
    setTutorAnswer,
    setTutorPendingQuestion,
    setTutorQuery,
    setTutorResponse,
    setTutorThinkingMode,
    setTutorThread,
    setUserTranslation,
    setWordPopup,
    translationAudioUnlockRef,
    vocabHintRevealRef,
}: DrillQuestionTransitionCommonArgs) {
    resetGuidedLearningState(false);
    setDrillFeedback(null);
    setRebuildFeedback(null);
    setActivePassageSegmentIndex(0);
    setRebuildPassageDrafts([]);
    setRebuildPassageResults([]);
    setRebuildPassageUiState([]);
    setRebuildTypingBuffer("");
    setRebuildPassageScores([]);
    setRebuildPassageSummary(null);
    resetRebuildShadowingState();
    setUserTranslation("");
    setFullReferenceHint((prev) => ({ version: prev.version + 1, text: "" }));
    setTutorAnswer(null);
    setTutorThread([]);
    setTutorResponse(null);
    setTutorPendingQuestion(null);
    setTutorQuery("");
    setTutorThinkingMode("chat");
    setIsTutorOpen(false);
    setRebuildTutorSession(null);
    setScoreTutorSession(null);
    setWordPopup(null);
    setIsPlaying(false);
    setHasRatedDrill(false);
    setAnalysisRequested(false);
    setIsGeneratingAnalysis(false);
    setAnalysisError(null);
    setAnalysisDetailsOpen(false);
    setFullAnalysisRequested(false);
    setIsGeneratingFullAnalysis(false);
    setFullAnalysisError(null);
    setFullAnalysisOpen(false);
    setFullAnalysisData(null);
    setIsGeneratingGrammar(false);
    setGrammarError(null);
    setReferenceGrammarAnalysis(null);
    setReferenceGrammarDisplayMode("core");
    setEloChange(null);
    setIsHintLoading(false);
    setIsVocabHintRevealed(false);
    setIsTranslationAudioUnlocked(false);
    setBlindVisibleUnlockConsumed(false);
    if (isDictationMode) {
        setIsBlindMode(true);
        setShowChinese(false);
    }
    vocabHintRevealRef.current = false;
    translationAudioUnlockRef.current = false;
    resetResult();
    audioRef.current?.pause();
    hasPlayedEchoRef.current = false;
    setLightningStarted(false);
}
