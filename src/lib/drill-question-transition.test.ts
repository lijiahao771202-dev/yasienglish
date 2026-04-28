import { describe, expect, it, vi } from "vitest";

import {
    consumePrefetchedDrillTransition,
    hydrateDrillForTransition,
    resetDrillUiForGeneration,
} from "./drill-question-transition";

function createCommonArgs() {
    return {
        audioRef: { current: { pause: vi.fn() } as unknown as HTMLAudioElement },
        hasPlayedEchoRef: { current: true },
        isDictationMode: true,
        resetGuidedLearningState: vi.fn(),
        resetRebuildShadowingState: vi.fn(),
        resetResult: vi.fn(),
        setActivePassageSegmentIndex: vi.fn(),
        setAnalysisDetailsOpen: vi.fn(),
        setAnalysisError: vi.fn(),
        setAnalysisRequested: vi.fn(),
        setBlindVisibleUnlockConsumed: vi.fn(),
        setDrillFeedback: vi.fn(),
        setEloChange: vi.fn(),
        setFullAnalysisData: vi.fn(),
        setFullAnalysisError: vi.fn(),
        setFullAnalysisOpen: vi.fn(),
        setFullAnalysisRequested: vi.fn(),
        setFullReferenceHint: vi.fn(),
        setGrammarError: vi.fn(),
        setHasRatedDrill: vi.fn(),
        setIsBlindMode: vi.fn(),
        setIsGeneratingAnalysis: vi.fn(),
        setIsGeneratingFullAnalysis: vi.fn(),
        setIsGeneratingGrammar: vi.fn(),
        setIsHintLoading: vi.fn(),
        setIsPlaying: vi.fn(),
        setIsTranslationAudioUnlocked: vi.fn(),
        setIsTutorOpen: vi.fn(),
        setIsVocabHintRevealed: vi.fn(),
        setLightningStarted: vi.fn(),
        setRebuildFeedback: vi.fn(),
        setRebuildPassageDrafts: vi.fn(),
        setRebuildPassageResults: vi.fn(),
        setRebuildPassageScores: vi.fn(),
        setRebuildPassageSummary: vi.fn(),
        setRebuildPassageUiState: vi.fn(),
        setRebuildTutorSession: vi.fn(),
        setRebuildTypingBuffer: vi.fn(),
        setReferenceGrammarAnalysis: vi.fn(),
        setReferenceGrammarDisplayMode: vi.fn(),
        setScoreTutorSession: vi.fn(),
        setShowChinese: vi.fn(),
        setTutorAnswer: vi.fn(),
        setTutorPendingQuestion: vi.fn(),
        setTutorQuery: vi.fn(),
        setTutorResponse: vi.fn(),
        setTutorThinkingMode: vi.fn(),
        setTutorThread: vi.fn(),
        setUserTranslation: vi.fn(),
        setWordPopup: vi.fn(),
        translationAudioUnlockRef: { current: true },
        vocabHintRevealRef: { current: true },
    };
}

describe("drill-question-transition", () => {
    it("hydrates passage drills while preserving mode metadata", () => {
        const drill = {
            chinese: "中文",
            reference_english: "ref",
            mode: "translation",
            sourceMode: "ai" as const,
            _translationMeta: {
                variant: "passage" as const,
                passageSession: {
                    currentIndex: 2,
                },
            },
        };
        const hydratePassageSegmentDrill = vi.fn().mockReturnValue({
            ...drill,
            chinese: "hydrated",
        });

        const result = hydrateDrillForTransition(drill, hydratePassageSegmentDrill);

        expect(hydratePassageSegmentDrill).toHaveBeenCalledWith(drill, 2);
        expect(result.mode).toBe("translation");
        expect(result.sourceMode).toBe("ai");
        expect(result.chinese).toBe("hydrated");
    });

    it("resets generation ui before requesting a fresh drill", () => {
        const common = createCommonArgs();
        const setDrillData = vi.fn();
        const setIsGeneratingDrill = vi.fn();
        const setActiveTranslationPassageSegmentIndex = vi.fn();
        const setTranslationPassageResults = vi.fn();

        resetDrillUiForGeneration({
            ...common,
            setActiveTranslationPassageSegmentIndex,
            setDrillData,
            setIsGeneratingDrill,
            setTranslationPassageResults,
        });

        expect(setIsGeneratingDrill).toHaveBeenCalledWith(true);
        expect(setDrillData).toHaveBeenCalledWith(null);
        expect(setActiveTranslationPassageSegmentIndex).toHaveBeenCalledWith(0);
        expect(setTranslationPassageResults).toHaveBeenCalledWith([]);
        expect(common.setUserTranslation).toHaveBeenCalledWith("");
        expect(common.translationAudioUnlockRef.current).toBe(false);
        expect(common.vocabHintRevealRef.current).toBe(false);
    });

    it("consumes a prefetched drill and clears stale question state", () => {
        const common = createCommonArgs();
        const nextDrill = {
            chinese: "下一题",
            reference_english: "next",
            mode: "translation",
            sourceMode: "ai" as const,
        };
        const setDrillData = vi.fn();
        const setIsGeneratingDrill = vi.fn();
        const setPendingRebuildAdvanceElo = vi.fn();
        const setPrefetchedDrillData = vi.fn();
        const clearRebuildChoicePrefetch = vi.fn();

        const result = consumePrefetchedDrillTransition({
            ...common,
            clearRebuildChoicePrefetch,
            hydratePassageSegmentDrill: vi.fn((drill) => drill),
            nextDrill,
            setDrillData,
            setIsGeneratingDrill,
            setPendingRebuildAdvanceElo,
            setPrefetchedDrillData,
        });

        expect(result).toEqual(nextDrill);
        expect(setDrillData).toHaveBeenCalledWith(nextDrill);
        expect(setPrefetchedDrillData).toHaveBeenCalledWith(null);
        expect(setPendingRebuildAdvanceElo).toHaveBeenCalledWith(null);
        expect(setIsGeneratingDrill).toHaveBeenCalledWith(false);
        expect(clearRebuildChoicePrefetch).toHaveBeenCalledOnce();
    });
});
