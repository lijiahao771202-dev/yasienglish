"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { resolveBattleScenarioContext } from "@/lib/battle-quickmatch-topics";
import { queryRebuildSystemVocabulary } from "@/lib/rebuild-rag";
import { calculateRebuildBattleElo } from "@/lib/rebuild-battle-elo";
import type { AiProvider } from "@/lib/profile-settings";
import {
    buildDrillGenerationRequestBody,
    type DrillGenerationMode,
} from "@/lib/drill-generation-plan";
import {
    clampRebuildDifficultyDelta,
    getRebuildSelfEvaluationDelta,
    type RebuildSelfEvaluation,
} from "@/lib/rebuild-mode";
import {
    aggregateRebuildPassageScores,
    getRebuildPassageSelfScore,
} from "@/lib/rebuild-passage";
import {
    calculatePassageRebuildRewards,
    calculateSentenceRebuildRewards,
    rollRebuildDropReward,
    shouldTriggerPassageRebuildGacha,
    shouldTriggerSentenceRebuildGacha,
    type RebuildRewardDropLoot,
    type RebuildRewardFx,
} from "@/lib/rebuild-rewards";
import type {
    RebuildFeedbackState,
    RebuildPassageSegmentResultState,
    RebuildPassageSegmentScore,
    RebuildPassageSummaryState,
} from "@/lib/drill-rebuild-types";
import { loadLocalProfile, settleBattle } from "@/lib/user-repository";

type DrillMode = "translation" | "listening" | "dictation" | "rebuild" | "imitation";

type PrefetchedRebuildChoice = {
    _sourceMeta?: {
        bankItemId?: string;
        sourceMode?: "ai" | "bank";
    };
    mode?: string;
    reference_english?: string;
    sourceMode?: "ai" | "bank";
};

type RebuildContextShape = {
    articleContent?: string;
    articleTitle?: string;
    topic?: string;
    topicPrompt?: string;
};

type RebuildPassageSessionShape = {
    segmentCount?: number;
    segments?: unknown[];
};

type EconomyItemDelta = Record<string, number>;

type EconomyPatchResult = {
    coins: number;
};

type EconomyFxPayload = RebuildRewardFx;

type UseDrillRebuildSettlementArgs<TPrefetchedDrill extends PrefetchedRebuildChoice> = {
    activeDrillSourceMode: "ai" | "bank";
    aiProvider: AiProvider;
    applyEconomyPatch: (patch: { coinsDelta?: number; itemDelta?: EconomyItemDelta }) => EconomyPatchResult;
    clearRebuildChoicePrefetch: () => void;
    consumeNextDrill: (drill: TPrefetchedDrill) => void;
    context: RebuildContextShape;
    cosmeticTheme: string;
    defaultBaseElo: number;
    ensureAudioCached: (text: string) => Promise<unknown>;
    generationMode: DrillGenerationMode;
    getDifficultyLevel: (elo: number, mode: DrillMode) => string;
    handleGenerateDrill: (targetDifficulty?: string, overrideBossType?: string, skipPrefetched?: boolean, forcedElo?: number) => void | Promise<void>;
    inventoryRef: MutableRefObject<Record<string, number>>;
    isGeneratingDrill: boolean;
    isPlaying: boolean;
    isRebuildMode: boolean;
    isRebuildPassage: boolean;
    learningSessionActive: boolean;
    listeningBankExcludeIdsKey: string;
    launchRebuildSuccessCelebration: () => void;
    mode: DrillMode;
    openGachaPack: () => void;
    ownedThemes: string[];
    passageSession: RebuildPassageSessionShape | null;
    pendingRebuildAdvanceElo: number | null;
    prefetchNextDrill: (nextElo: number) => void;
    playAudio: (explicitText?: string) => void | Promise<unknown>;
    prefetchedRebuildChoicesRef: MutableRefObject<Partial<Record<RebuildSelfEvaluation, TPrefetchedDrill>>>;
    rebuildBattleElo: number;
    rebuildBattleStreak: number;
    persistRebuildHiddenElo: (nextElo: number) => Promise<void>;
    pushEconomyFx: (event: EconomyFxPayload) => void;
    rebuildChoicePrefetchAbortRef: MutableRefObject<AbortController | null>;
    rebuildFeedback: RebuildFeedbackState | null;
    rebuildHiddenElo: number;
    rebuildPassageResults: RebuildPassageSegmentResultState[];
    rebuildPassageSummary: RebuildPassageSummaryState | null;
    setEloBreakdown: (value: ReturnType<typeof calculateRebuildBattleElo>["breakdown"]) => void;
    setEloChange: (value: number) => void;
    setLootDrop: (value: RebuildRewardDropLoot | null) => void;
    setPendingRebuildAdvanceElo: Dispatch<SetStateAction<number | null>>;
    setRebuildBattleElo: (value: number) => void;
    setRebuildBattleStreak: (value: number) => void;
    setRebuildFeedback: Dispatch<SetStateAction<RebuildFeedbackState | null>>;
    setRebuildHiddenElo: (value: number) => void;
    setRebuildPassageResults: (value: RebuildPassageSegmentResultState[]) => void;
    setRebuildPassageScores: (value: RebuildPassageSegmentScore[]) => void;
    setRebuildPassageSummary: (value: RebuildPassageSummaryState | null) => void;
    nvidiaModel?: string;
};

const REBUILD_GACHA_SFX = "https://assets.mixkit.co/sfx/preview/mixkit-ethereal-fairy-win-sound-2019.mp3";

const playRebuildGachaSfx = () => {
    new Audio(REBUILD_GACHA_SFX).play().catch(() => { });
};

export function useDrillRebuildSettlement<TPrefetchedDrill extends PrefetchedRebuildChoice>({
    activeDrillSourceMode,
    aiProvider,
    applyEconomyPatch,
    clearRebuildChoicePrefetch,
    consumeNextDrill,
    context,
    cosmeticTheme,
    defaultBaseElo,
    ensureAudioCached,
    generationMode,
    getDifficultyLevel,
    handleGenerateDrill,
    inventoryRef,
    isGeneratingDrill,
    isPlaying,
    isRebuildMode,
    isRebuildPassage,
    learningSessionActive,
    listeningBankExcludeIdsKey,
    launchRebuildSuccessCelebration,
    mode,
    openGachaPack,
    ownedThemes,
    passageSession,
    pendingRebuildAdvanceElo,
    prefetchNextDrill,
    playAudio,
    prefetchedRebuildChoicesRef,
    rebuildBattleElo,
    rebuildBattleStreak,
    persistRebuildHiddenElo,
    pushEconomyFx,
    rebuildChoicePrefetchAbortRef,
    rebuildFeedback,
    rebuildHiddenElo,
    rebuildPassageResults,
    rebuildPassageSummary,
    setEloBreakdown,
    setEloChange,
    setLootDrop,
    setPendingRebuildAdvanceElo,
    setRebuildBattleElo,
    setRebuildBattleStreak,
    setRebuildFeedback,
    setRebuildHiddenElo,
    setRebuildPassageResults,
    setRebuildPassageScores,
    setRebuildPassageSummary,
    nvidiaModel,
}: UseDrillRebuildSettlementArgs<TPrefetchedDrill>) {
    const handleRebuildSelfEvaluate = useCallback((evaluation: RebuildSelfEvaluation) => {
        if (!isRebuildPassage) {
            if (!rebuildFeedback) return;
            const delta = clampRebuildDifficultyDelta(rebuildFeedback.systemDelta + getRebuildSelfEvaluationDelta(evaluation));
            const nextElo = Math.max(0, Math.min(3200, rebuildHiddenElo + delta));
            const rewardResult = calculateSentenceRebuildRewards({
                evaluation: rebuildFeedback.evaluation,
                replayCount: rebuildFeedback.replayCount,
                tokenEditCount: rebuildFeedback.editCount,
                exceededSoftLimit: rebuildFeedback.exceededSoftLimit,
                skipped: rebuildFeedback.skipped,
            });
            const dropResult = rollRebuildDropReward({
                eligible: rewardResult.dropEligible,
                variant: "sentence",
                dropRoll: Math.random(),
                capsuleRoll: Math.random(),
                coinRoll: Math.random(),
            });

            pushEconomyFx({ kind: "coin_gain", amount: rewardResult.earnedCoins, message: `+${rewardResult.earnedCoins} 星光币`, source: "reward" });
            if (dropResult?.fx) {
                pushEconomyFx(dropResult.fx);
            }
            if (dropResult?.loot) {
                setLootDrop(dropResult.loot);
            }

            if (shouldTriggerSentenceRebuildGacha({
                learningSession: learningSessionActive,
                roll: Math.random(),
                evaluation: rebuildFeedback.evaluation,
                replayCount: rebuildFeedback.replayCount,
                tokenEditCount: rebuildFeedback.editCount,
                exceededSoftLimit: rebuildFeedback.exceededSoftLimit,
                skipped: rebuildFeedback.skipped,
            })) {
                window.setTimeout(() => {
                    openGachaPack();
                    playRebuildGachaSfx();
                }, dropResult?.loot ? 1800 : 900);
            }

            applyEconomyPatch({
                coinsDelta: rewardResult.earnedCoins + (dropResult?.coinsDelta ?? 0),
                itemDelta: dropResult?.itemDelta ?? {},
            });

            setRebuildHiddenElo(nextElo);
            void persistRebuildHiddenElo(nextElo);
            setRebuildFeedback((currentFeedback) => (
                currentFeedback ? { ...currentFeedback, selfEvaluation: evaluation } : currentFeedback
            ));
            setPendingRebuildAdvanceElo(nextElo);
            return;
        }

        const segmentCount = passageSession?.segments?.length ?? passageSession?.segmentCount ?? 0;
        if (segmentCount === 0 || rebuildPassageResults.length !== segmentCount || rebuildPassageSummary) return;

        const sessionObjectiveScore100 = Math.round(
            rebuildPassageResults.reduce((total, item) => total + item.objectiveScore100, 0) / segmentCount
        );
        const skippedSegments = rebuildPassageResults.filter((item) => item.feedback.skipped).length;
        const selfScore100 = getRebuildPassageSelfScore(evaluation, {
            objectiveScore100: sessionObjectiveScore100,
            skippedSegments,
            totalSegments: segmentCount,
        });
        const nextResults = rebuildPassageResults
            .map((item) => ({
                ...item,
                feedback: { ...item.feedback, selfEvaluation: evaluation },
                selfEvaluation: evaluation,
                selfScore100,
                finalScore100: Math.round((item.objectiveScore100 * 0.5) + (selfScore100 * 0.5)),
            }))
            .sort((left, right) => left.segmentIndex - right.segmentIndex);
        const finalizedScores = nextResults
            .filter((item) => item.selfScore100 !== null && item.finalScore100 !== null)
            .map((item) => ({
                segmentIndex: item.segmentIndex,
                objectiveScore100: item.objectiveScore100,
                selfScore100: item.selfScore100 as number,
                finalScore100: item.finalScore100 as number,
            }));

        setRebuildPassageResults(nextResults);
        setRebuildPassageScores(finalizedScores);

        const aggregate = aggregateRebuildPassageScores(finalizedScores.map((item) => ({
            objectiveScore100: item.objectiveScore100,
            selfScore100: item.selfScore100,
        })));
        const sessionSystemDelta = Math.round(
            rebuildPassageResults.reduce((total, item) => total + item.feedback.systemDelta, 0) / segmentCount
        );
        const eloResult = calculateRebuildBattleElo({
            playerElo: rebuildBattleElo ?? defaultBaseElo,
            sessionSystemDelta,
            selfEvaluation: evaluation,
            streak: rebuildBattleStreak,
        });
        const change = eloResult.total;
        const nextElo = Math.max(0, Math.min(3200, (rebuildBattleElo ?? defaultBaseElo) + change));
        const nextStreak = change > 0 ? rebuildBattleStreak + 1 : 0;
        const rewardResult = calculatePassageRebuildRewards({
            sessionObjectiveScore100: aggregate.sessionObjectiveScore100,
            skippedSegments,
            totalSegments: segmentCount,
            streak: nextStreak,
        });
        const dropResult = rollRebuildDropReward({
            eligible: rewardResult.dropEligible,
            variant: "passage",
            dropRoll: Math.random(),
            capsuleRoll: Math.random(),
            coinRoll: Math.random(),
        });

        const finalCoins = applyEconomyPatch({
            coinsDelta: rewardResult.earnedCoins + (dropResult?.coinsDelta ?? 0),
            itemDelta: dropResult?.itemDelta ?? {},
        }).coins;

        pushEconomyFx({ kind: "coin_gain", amount: rewardResult.earnedCoins, message: `+${rewardResult.earnedCoins} 星光币`, source: "reward" });
        if (dropResult?.fx) {
            pushEconomyFx(dropResult.fx);
        }
        if (dropResult?.loot) {
            setLootDrop(dropResult.loot);
        }

        if (shouldTriggerPassageRebuildGacha({
            learningSession: learningSessionActive,
            roll: Math.random(),
            sessionObjectiveScore100: aggregate.sessionObjectiveScore100,
            skippedSegments,
        })) {
            window.setTimeout(() => {
                openGachaPack();
                playRebuildGachaSfx();
            }, dropResult?.loot ? 1800 : 900);
        }

        setRebuildBattleElo(nextElo);
        setRebuildBattleStreak(nextStreak);
        setEloChange(change);
        setEloBreakdown(eloResult.breakdown);
        prefetchNextDrill(nextElo);

        void loadLocalProfile().then(async (profile) => {
            const nextMaxElo = Math.max(profile?.rebuild_max_elo ?? rebuildBattleElo ?? defaultBaseElo, nextElo);
            if (profile) {
                await settleBattle({
                    mode: "rebuild",
                    eloAfter: nextElo,
                    change,
                    streak: nextStreak,
                    maxElo: nextMaxElo,
                    coins: finalCoins,
                    inventory: inventoryRef.current,
                    ownedThemes,
                    activeTheme: cosmeticTheme,
                    source: "battle",
                });
            }
            if (aggregate.sessionScore100 === 100) {
                launchRebuildSuccessCelebration();
            }
            setRebuildPassageSummary({
                sessionObjectiveScore100: aggregate.sessionObjectiveScore100,
                sessionSelfScore100: aggregate.sessionSelfScore100,
                sessionScore100: aggregate.sessionScore100,
                sessionBattleScore10: aggregate.sessionBattleScore10,
                segmentCount,
                eloAfter: nextElo,
                change,
                streak: nextStreak,
                maxElo: nextMaxElo,
                coinsEarned: rewardResult.earnedCoins + (dropResult?.coinsDelta ?? 0),
                settledAt: Date.now(),
            });
        }).catch((error) => {
            console.error("Failed to settle rebuild passage battle", error);
        });
    }, [
        applyEconomyPatch,
        cosmeticTheme,
        defaultBaseElo,
        inventoryRef,
        isRebuildPassage,
        learningSessionActive,
        openGachaPack,
        ownedThemes,
        passageSession,
        persistRebuildHiddenElo,
        pushEconomyFx,
        rebuildBattleElo,
        rebuildBattleStreak,
        rebuildFeedback,
        rebuildHiddenElo,
        rebuildPassageResults,
        rebuildPassageSummary,
        launchRebuildSuccessCelebration,
        setEloBreakdown,
        setEloChange,
        setLootDrop,
        setPendingRebuildAdvanceElo,
        setRebuildBattleElo,
        setRebuildBattleStreak,
        setRebuildFeedback,
        setRebuildHiddenElo,
        setRebuildPassageResults,
        setRebuildPassageScores,
        setRebuildPassageSummary,
        prefetchNextDrill,
    ]);

    useEffect(() => {
        if (!isRebuildMode || !rebuildFeedback || isRebuildPassage) return;

        const handleFeedbackKey = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (event.altKey || event.ctrlKey || event.metaKey) return;

            if (event.key === " " || event.key === "Spacebar") {
                event.preventDefault();
                if (!isPlaying) {
                    void playAudio();
                }
                return;
            }

            if (!rebuildFeedback.selfEvaluation) {
                if (event.key === "1") {
                    event.preventDefault();
                    handleRebuildSelfEvaluate("easy");
                } else if (event.key === "2") {
                    event.preventDefault();
                    handleRebuildSelfEvaluate("just_right");
                } else if (event.key === "3") {
                    event.preventDefault();
                    handleRebuildSelfEvaluate("hard");
                }
            }
        };

        window.addEventListener("keydown", handleFeedbackKey);
        return () => window.removeEventListener("keydown", handleFeedbackKey);
    }, [handleRebuildSelfEvaluate, isPlaying, isRebuildMode, isRebuildPassage, playAudio, rebuildFeedback]);

    useEffect(() => {
        if (!isRebuildMode || isRebuildPassage || !rebuildFeedback || rebuildFeedback.selfEvaluation || isGeneratingDrill) {
            clearRebuildChoicePrefetch();
            return;
        }

        clearRebuildChoicePrefetch();
        const controller = new AbortController();
        rebuildChoicePrefetchAbortRef.current = controller;

        const baseExcludeIds = listeningBankExcludeIdsKey
            ? listeningBankExcludeIdsKey.split("|").filter(Boolean)
            : [];

        const prefetchChoices = async () => {
            const nextChoices: Partial<Record<RebuildSelfEvaluation, TPrefetchedDrill>> = {};
            const usedExcludeIds = new Set(baseExcludeIds);
            const options: RebuildSelfEvaluation[] = ["easy", "just_right", "hard"];

            for (const evaluation of options) {
                const delta = clampRebuildDifficultyDelta(rebuildFeedback.systemDelta + getRebuildSelfEvaluationDelta(evaluation));
                const nextElo = Math.max(0, Math.min(3200, rebuildHiddenElo + delta));
                const targetScenario = resolveBattleScenarioContext(context.articleTitle || context.topic, nextElo);
                const topicPrompt = context.topicPrompt || targetScenario.topicPrompt;
                const ragResult = await queryRebuildSystemVocabulary({
                    effectiveElo: nextElo,
                    query: [targetScenario.topicLine, topicPrompt].filter(Boolean).join("\n"),
                    variant: "sentence",
                });
                const requestBody = buildDrillGenerationRequestBody({
                    articleContent: context.articleContent,
                    difficulty: getDifficultyLevel(nextElo, mode),
                    eloRating: nextElo,
                    excludeBankIds: Array.from(usedExcludeIds),
                    injectedVocabulary: ragResult.vocabulary.length > 0 ? ragResult.vocabulary : undefined,
                    mode: generationMode,
                    sourceMode: activeDrillSourceMode,
                    timestamp: Date.now() + Math.random(),
                    topicLine: targetScenario.topicLine,
                    topicPrompt,
                    provider: aiProvider,
                    nvidiaModel,
                });

                const response = await fetch("/api/drill/next", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal,
                });

                if (controller.signal.aborted) return;

                const data = await response.json();
                if (controller.signal.aborted) return;
                if (!response.ok || data?.error) {
                    throw new Error(data?.error || `Failed to prefetch rebuild drill for ${evaluation}`);
                }

                const nextChoice = { ...data, mode, sourceMode: activeDrillSourceMode } as TPrefetchedDrill;
                nextChoices[evaluation] = nextChoice;

                const bankId = nextChoice._sourceMeta?.sourceMode === "bank"
                    ? nextChoice._sourceMeta.bankItemId
                    : undefined;
                if (bankId) {
                    usedExcludeIds.add(bankId);
                }

                if (typeof nextChoice.reference_english === "string" && nextChoice.reference_english.trim()) {
                    try {
                        await ensureAudioCached(nextChoice.reference_english);
                    } catch (error) {
                        console.error(`[Rebuild Prefetch] Audio prewarm failed for ${evaluation}:`, error);
                    }
                }
            }

            if (!controller.signal.aborted) {
                prefetchedRebuildChoicesRef.current = nextChoices;
            }
        };

        prefetchChoices().catch((error) => {
            if ((error as { name?: string })?.name !== "AbortError") {
                console.error("[Rebuild Prefetch] Failed to prefetch difficulty branches:", error);
            }
        });

        return () => {
            controller.abort();
            if (rebuildChoicePrefetchAbortRef.current === controller) {
                rebuildChoicePrefetchAbortRef.current = null;
            }
            prefetchedRebuildChoicesRef.current = {};
        };
    }, [
        activeDrillSourceMode,
        aiProvider,
        clearRebuildChoicePrefetch,
        context.articleContent,
        context.articleTitle,
        context.topic,
        context.topicPrompt,
        ensureAudioCached,
        generationMode,
        getDifficultyLevel,
        isGeneratingDrill,
        isRebuildMode,
        isRebuildPassage,
        listeningBankExcludeIdsKey,
        mode,
        nvidiaModel,
        prefetchedRebuildChoicesRef,
        rebuildChoicePrefetchAbortRef,
        rebuildFeedback,
        rebuildHiddenElo,
    ]);

    useEffect(() => {
        if (!isRebuildMode || isRebuildPassage || pendingRebuildAdvanceElo === null || isGeneratingDrill) return;
        const timeoutId = window.setTimeout(() => {
            const selectedEvaluation = rebuildFeedback?.selfEvaluation;
            const prefetchedChoice = selectedEvaluation
                ? prefetchedRebuildChoicesRef.current[selectedEvaluation]
                : null;
            setPendingRebuildAdvanceElo(null);
            if (prefetchedChoice) {
                consumeNextDrill(prefetchedChoice);
                return;
            }
            void handleGenerateDrill(undefined, undefined, true, pendingRebuildAdvanceElo);
        }, 120);

        return () => window.clearTimeout(timeoutId);
    }, [
        consumeNextDrill,
        handleGenerateDrill,
        isGeneratingDrill,
        isRebuildMode,
        isRebuildPassage,
        pendingRebuildAdvanceElo,
        prefetchedRebuildChoicesRef,
        rebuildFeedback,
        setPendingRebuildAdvanceElo,
    ]);

    return {
        handleRebuildSelfEvaluate,
    };
}
