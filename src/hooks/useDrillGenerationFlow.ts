"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { queryRebuildSystemVocabulary } from "@/lib/rebuild-rag";
import { resolveNextDrillEffectiveElo } from "@/lib/drill-elo";
import { fetchNextDrillWithRetry } from "@/lib/drill-generation-client";
import type { AiProvider } from "@/lib/profile-settings";
import {
    buildDrillGenerationRequestBody,
    canConsumePrefetchedDrill,
    isQuickMatchTopicResetBoundary,
    resolveDrillScenarioPlan,
    resolveListeningGenerationEvent,
    rollListeningPrefetchBossType,
    type DrillBossStateSnapshot,
    type DrillGambleStateSnapshot,
    type DrillScenarioContext,
    type DrillSourceMode,
    type DrillVariant,
    type PendingBossState,
    type PendingGambleState,
} from "@/lib/drill-generation-plan";

type DrillMode = "translation" | "listening" | "dictation" | "rebuild" | "imitation";
type DrillGenerationMode = "translation" | "listening" | "rebuild";
type RebuildRagLoadingState = {
    hitCount: number;
    status: "idle" | "querying" | "hit" | "empty" | "unavailable";
};

type PendingGenerateArgs = {
    targetDifficulty?: string;
    overrideBossType?: string;
    skipPrefetched?: boolean;
    forcedElo?: number;
} | null;

interface DrillGenerationContext {
    articleTitle?: string;
    articleContent?: string;
    topic?: string;
    segmentCount?: 2 | 3 | 5;
    isQuickMatch?: boolean;
}

interface DrillTopicCarrier {
    _topicMeta?: {
        topic?: string;
    };
}

interface PrefetchedDrillLike {
    mode?: string;
    sourceMode?: DrillSourceMode;
    reference_english?: string;
}

interface UseDrillGenerationFlowParams<TDrill extends PrefetchedDrillLike, TTopic extends DrillScenarioContext> {
    aiProvider: AiProvider;
    activeDrillSourceMode: DrillSourceMode;
    activeTopicPromptRef: MutableRefObject<string | undefined>;
    abortControllerRef: MutableRefObject<AbortController | null>;
    abortPrefetchRef: MutableRefObject<AbortController | null>;
    bossState: DrillBossStateSnapshot;
    clearRebuildChoicePrefetch: () => void;
    consumeResolvedDrill: (nextDrill: TDrill) => void;
    context: DrillGenerationContext;
    currentElo: number;
    currentStreak: number;
    difficulty: string;
    drillData: DrillTopicCarrier | null;
    drillGenerationsCountRef: MutableRefObject<number>;
    ensureAudioCached: (text: string) => Promise<unknown>;
    finishGenerationRequest: () => void;
    generationMode: DrillGenerationMode;
    gambleState: DrillGambleStateSnapshot;
    getDifficultyLevel: (elo: number, drillMode: DrillMode) => string;
    handleResolvedGeneratedDrill: (data: unknown, effectiveElo: number, signal: AbortSignal) => Promise<void>;
    hasRecordedDailyDrillRef: MutableRefObject<boolean>;
    isListeningFamilyMode: boolean;
    isListeningMode: boolean;
    isRebuildMode: boolean;
    isRebuildPassage: boolean;
    isTranslationPassage: boolean;
    listeningBankExcludeIds?: string[];
    localEloChangeRef: MutableRefObject<number>;
    mode: DrillMode;
    pendingGenerateArgsRef: MutableRefObject<PendingGenerateArgs>;
    prefetchedDrillData: TDrill | null;
    prefetchedDrillTopic: TTopic | null;
    rebuildVariant: DrillVariant;
    resetGenerationUiState: () => void;
    setPendingSlotMachineTrigger: Dispatch<SetStateAction<boolean>>;
    setPrefetchedDrillData: Dispatch<SetStateAction<TDrill | null>>;
    setPrefetchedDrillTopic: Dispatch<SetStateAction<TTopic | null>>;
    setRebuildRagLoadingState: Dispatch<SetStateAction<RebuildRagLoadingState>>;
    showGacha: boolean;
    slotMachineResolvedRef: MutableRefObject<boolean>;
    topicResetInterval: number;
    translationVariant: DrillVariant;
    triggerSurpriseDrop: () => void;
    updatePendingEventState: (args: {
        pendingBossState: PendingBossState | null;
        pendingGambleState: PendingGambleState | null;
    }) => void;
    nvidiaModel?: string;
}

export function useDrillGenerationFlow<TDrill extends PrefetchedDrillLike, TTopic extends DrillScenarioContext>({
    aiProvider,
    activeDrillSourceMode,
    activeTopicPromptRef,
    abortControllerRef,
    abortPrefetchRef,
    bossState,
    clearRebuildChoicePrefetch,
    consumeResolvedDrill,
    context,
    currentElo,
    currentStreak,
    difficulty,
    drillData,
    drillGenerationsCountRef,
    ensureAudioCached,
    finishGenerationRequest,
    generationMode,
    gambleState,
    getDifficultyLevel,
    handleResolvedGeneratedDrill,
    hasRecordedDailyDrillRef,
    isListeningFamilyMode,
    isListeningMode,
    isRebuildMode,
    isRebuildPassage,
    isTranslationPassage,
    listeningBankExcludeIds,
    localEloChangeRef,
    mode,
    pendingGenerateArgsRef,
    prefetchedDrillData,
    prefetchedDrillTopic,
    rebuildVariant,
    resetGenerationUiState,
    setPendingSlotMachineTrigger,
    setPrefetchedDrillData,
    setPrefetchedDrillTopic,
    setRebuildRagLoadingState,
    showGacha,
    slotMachineResolvedRef,
    topicResetInterval,
    translationVariant,
    triggerSurpriseDrop,
    updatePendingEventState,
    nvidiaModel,
}: UseDrillGenerationFlowParams<TDrill, TTopic>) {
    const scenarioMode = mode === "dictation" ? "dictation" : generationMode;

    const resolveRebuildInjectedVocabulary = useCallback(async (args: {
        effectiveElo: number;
        reportStatus?: boolean;
        topicLine: string;
        topicPrompt?: string;
    }) => {
        if (!isRebuildMode) {
            return undefined;
        }

        if (args.reportStatus) {
            setRebuildRagLoadingState({
                hitCount: 0,
                status: "querying",
            });
        }

        const query = [args.topicLine, args.topicPrompt]
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .join("\n");
        const result = await queryRebuildSystemVocabulary({
            effectiveElo: args.effectiveElo,
            query,
            variant: rebuildVariant,
        });

        if (args.reportStatus) {
            setRebuildRagLoadingState({
                hitCount: result.vocabulary.length,
                status: result.status,
            });
        }

        return result.vocabulary.length > 0 ? result.vocabulary : undefined;
    }, [
        isRebuildMode,
        rebuildVariant,
        setRebuildRagLoadingState,
    ]);

    const consumeNextDrill = useCallback((nextDrill: TDrill) => {
        hasRecordedDailyDrillRef.current = false;
        drillGenerationsCountRef.current += 1;
        localEloChangeRef.current = 0;
        if (prefetchedDrillTopic?.topicPrompt) {
            activeTopicPromptRef.current = prefetchedDrillTopic.topicPrompt;
        }
        consumeResolvedDrill(nextDrill);
    }, [
        activeTopicPromptRef,
        consumeResolvedDrill,
        drillGenerationsCountRef,
        hasRecordedDailyDrillRef,
        localEloChangeRef,
        prefetchedDrillTopic,
    ]);

    const prefetchNextDrill = useCallback((nextElo: number) => {
        console.log("[Prefetch] Starting background prefetch for next drill...");
        abortPrefetchRef.current?.abort();
        abortPrefetchRef.current = new AbortController();
        const signal = abortPrefetchRef.current.signal;

        const nextBossType = rollListeningPrefetchBossType({
            isListeningFamilyMode,
        });
        const { targetScenario, nextTopicPrompt } = resolveDrillScenarioPlan({
            articleTitle: context.articleTitle,
            currentTopic: drillData?._topicMeta?.topic,
            currentTopicPrompt: activeTopicPromptRef.current,
            elo: nextElo,
            generatedDrillCount: drillGenerationsCountRef.current,
            isContinuous: true,
            isQuickMatch: context.isQuickMatch,
            mode: scenarioMode,
            topic: context.topic,
            topicResetInterval,
            translationVariant,
        });
        setPrefetchedDrillTopic(targetScenario as TTopic);
        void (async () => {
            try {
                const injectedVocabulary = await resolveRebuildInjectedVocabulary({
                    effectiveElo: nextElo,
                    reportStatus: false,
                    topicLine: targetScenario.topicLine,
                    topicPrompt: nextTopicPrompt,
                });

                if (signal.aborted) {
                    return;
                }

                const requestBody = buildDrillGenerationRequestBody({
                    articleContent: context.articleContent,
                    bossType: nextBossType,
                    difficulty: getDifficultyLevel(nextElo, mode),
                    eloRating: nextElo,
                    excludeBankIds: activeDrillSourceMode === "bank" ? listeningBankExcludeIds : undefined,
                    injectedVocabulary,
                    mode: generationMode,
                    rebuildVariant: isRebuildMode ? rebuildVariant : undefined,
                    segmentCount: isRebuildPassage || isTranslationPassage ? (context.segmentCount ?? 3) : undefined,
                    sourceMode: activeDrillSourceMode,
                    timestamp: Date.now(),
                    topicLine: targetScenario.topicLine,
                    topicPrompt: nextTopicPrompt,
                    translationVariant: mode === "translation" ? translationVariant : undefined,
                    provider: aiProvider,
                    nvidiaModel,
                });

                const res = await fetch("/api/drill/next", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody),
                    signal,
                });
                const data = await res.json();
                if (!res.ok || data?.error) {
                    throw new Error(data?.error || "Failed to prefetch drill");
                }
                if (!signal.aborted) {
                    console.log("[Prefetch] Background prefetch completed and stored!");
                    setPrefetchedDrillData({ ...data, mode, sourceMode: activeDrillSourceMode } as TDrill);
                    if ((isListeningMode || isRebuildMode) && typeof data?.reference_english === "string" && data.reference_english.trim()) {
                        ensureAudioCached(data.reference_english).catch((error) => {
                            console.error("[Prefetch] Audio prewarm failed:", error);
                        });
                    }
                }
            } catch (error) {
                if ((error as Error).name !== "AbortError") {
                    console.error("[Prefetch] Error:", error);
                }
            }
        })();
    }, [
        abortPrefetchRef,
        activeDrillSourceMode,
        activeTopicPromptRef,
        aiProvider,
        context.articleContent,
        context.articleTitle,
        context.isQuickMatch,
        context.segmentCount,
        context.topic,
        drillData?._topicMeta?.topic,
        drillGenerationsCountRef,
        ensureAudioCached,
        generationMode,
        getDifficultyLevel,
        isListeningFamilyMode,
        isListeningMode,
        isRebuildMode,
        isRebuildPassage,
        isTranslationPassage,
        listeningBankExcludeIds,
        mode,
        nvidiaModel,
        rebuildVariant,
        resolveRebuildInjectedVocabulary,
        scenarioMode,
        setPrefetchedDrillData,
        setPrefetchedDrillTopic,
        topicResetInterval,
        translationVariant,
    ]);

    const handleGenerateDrill = useCallback(async (
        targetDifficulty = difficulty,
        overrideBossType?: string,
        skipPrefetched = false,
        forcedElo?: number,
    ) => {
        if (showGacha) return;
        hasRecordedDailyDrillRef.current = false;

        const generatedDrillCount = drillGenerationsCountRef.current;
        const isTopicReset = isQuickMatchTopicResetBoundary({
            generatedDrillCount,
            isQuickMatch: context.isQuickMatch,
            topicResetInterval,
        });

        if (isTopicReset && !slotMachineResolvedRef.current && !overrideBossType) {
            console.log("[DrillCore] Topic Reset Boundary Reached. Triggering Slot Machine...");
            setPendingSlotMachineTrigger(true);
            pendingGenerateArgsRef.current = { targetDifficulty, overrideBossType, skipPrefetched, forcedElo };
            return;
        }

        slotMachineResolvedRef.current = false;
        localEloChangeRef.current = 0;

        abortControllerRef.current?.abort();
        abortPrefetchRef.current?.abort();
        clearRebuildChoicePrefetch();

        if (prefetchedDrillData && canConsumePrefetchedDrill({
            mode,
            overrideBossType,
            prefetchedDrillData,
            skipPrefetched,
            sourceMode: activeDrillSourceMode,
        })) {
            console.log("[Prefetch] Consuming prefetched drill data! Zero ms latency.");
            consumeNextDrill(prefetchedDrillData);
            return;
        }

        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        resetGenerationUiState();

        const {
            nextBossType,
            pendingBossState,
            pendingGambleState,
        } = resolveListeningGenerationEvent({
            bossState,
            gambleState,
            isListeningFamilyMode,
            overrideBossType,
        });
        updatePendingEventState({ pendingBossState, pendingGambleState });

        try {
            const effectiveElo = resolveNextDrillEffectiveElo({
                currentElo,
                forcedElo,
            });
            console.log(`[DEBUG] Sending to API: bossType=${nextBossType}, eloRating=${effectiveElo}`);
            const isContinuous = drillGenerationsCountRef.current > 0;
            drillGenerationsCountRef.current += 1;
            const { targetScenario, nextTopicPrompt } = resolveDrillScenarioPlan({
                articleTitle: context.articleTitle,
                currentTopic: drillData?._topicMeta?.topic,
                currentTopicPrompt: activeTopicPromptRef.current,
                elo: effectiveElo,
                generatedDrillCount,
                isContinuous,
                isQuickMatch: context.isQuickMatch,
                mode: scenarioMode,
                topic: context.topic,
                topicResetInterval,
                translationVariant,
            });

            if (currentStreak > 0 && Math.random() < 0.05) {
                triggerSurpriseDrop();
            }

            activeTopicPromptRef.current = nextTopicPrompt;
            const injectedVocabulary = await resolveRebuildInjectedVocabulary({
                effectiveElo,
                reportStatus: true,
                topicLine: targetScenario.topicLine,
                topicPrompt: nextTopicPrompt,
            });

            const requestBody = buildDrillGenerationRequestBody({
                articleContent: context.articleContent,
                bossType: nextBossType,
                difficulty: getDifficultyLevel(effectiveElo, mode),
                eloRating: effectiveElo,
                excludeBankIds: activeDrillSourceMode === "bank" ? listeningBankExcludeIds : undefined,
                injectedVocabulary,
                mode: generationMode,
                rebuildVariant: isRebuildMode ? rebuildVariant : undefined,
                segmentCount: isRebuildPassage || isTranslationPassage ? (context.segmentCount ?? 3) : undefined,
                sourceMode: activeDrillSourceMode,
                timestamp: Date.now(),
                topicLine: targetScenario.topicLine,
                topicPrompt: nextTopicPrompt,
                translationVariant: mode === "translation" ? translationVariant : undefined,
                provider: aiProvider,
                nvidiaModel,
            });
            const data = await fetchNextDrillWithRetry(requestBody, {
                signal,
                maxAttempts: 3,
            });

            if (signal.aborted) return;

            await handleResolvedGeneratedDrill(data, effectiveElo, signal);
        } catch (error) {
            if ((error as Error).name === "AbortError") {
                console.log("[Drill] Request aborted - switching to new question");
                return;
            }
            console.error(error);
        } finally {
            if (!signal.aborted) {
                finishGenerationRequest();
            }
        }
    }, [
        abortControllerRef,
        abortPrefetchRef,
        activeDrillSourceMode,
        aiProvider,
        activeTopicPromptRef,
        bossState,
        clearRebuildChoicePrefetch,
        consumeNextDrill,
        context.articleContent,
        context.articleTitle,
        context.isQuickMatch,
        context.segmentCount,
        context.topic,
        currentElo,
        currentStreak,
        difficulty,
        drillData?._topicMeta?.topic,
        drillGenerationsCountRef,
        finishGenerationRequest,
        gambleState,
        generationMode,
        getDifficultyLevel,
        handleResolvedGeneratedDrill,
        hasRecordedDailyDrillRef,
        isListeningFamilyMode,
        isRebuildMode,
        isRebuildPassage,
        isTranslationPassage,
        listeningBankExcludeIds,
        localEloChangeRef,
        mode,
        pendingGenerateArgsRef,
        prefetchedDrillData,
        rebuildVariant,
        resetGenerationUiState,
        resolveRebuildInjectedVocabulary,
        scenarioMode,
        setRebuildRagLoadingState,
        setPendingSlotMachineTrigger,
        showGacha,
        slotMachineResolvedRef,
        topicResetInterval,
        translationVariant,
        triggerSurpriseDrop,
        updatePendingEventState,
        nvidiaModel,
    ]);

    return {
        consumeNextDrill,
        handleGenerateDrill,
        prefetchNextDrill,
    };
}
