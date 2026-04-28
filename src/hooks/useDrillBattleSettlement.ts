"use client";

import { useCallback, type MutableRefObject } from "react";

import { getRank } from "@/lib/rankUtils";
import { calculateListeningElo } from "@/lib/listening-elo";
import type { PendingBossState, PendingGambleState } from "@/lib/drill-generation-plan";
import type { RebuildSelfEvaluation } from "@/lib/rebuild-mode";
import { resolveTranslationSelfEvaluationEloChange } from "@/lib/translation-self-eval";
import { DEFAULT_BASE_ELO } from "@/lib/user-sync";
import { loadLocalProfile, saveWritingHistory, settleBattle } from "@/lib/user-repository";
import { shouldTriggerGacha } from "@/components/drill/gacha";

type DrillMode = "translation" | "listening" | "dictation" | "rebuild" | "imitation";

type BattleTheme = "default" | "fever" | "boss" | "crimson";

type ShopItemId = "capsule" | "hint_ticket" | "vocab_ticket" | "audio_ticket" | "refresh_ticket";
type InventoryState = Record<ShopItemId, number>;

type LootDrop = {
    type: "gem" | "exp" | "theme";
    amount: number;
    message: string;
    rarity: "common" | "rare" | "legendary";
    name?: string;
};

type DrillDataShape = {
    chinese: string;
    reference_english: string;
    _difficultyMeta?: {
        requestedElo?: number;
    };
    _topicMeta?: {
        topic?: string;
    };
};

type DrillFeedbackShape = {
    eloAdjustment?: number | null;
    score: number;
    _isLocalEvaluation?: boolean;
    selfEvaluation?: RebuildSelfEvaluation | null;
};

type RouletteSession = {
    active: boolean;
    bullets: number;
    multiplier: number;
    result: "safe" | "dead";
} | null;

type EconomyFxEvent = {
    amount?: number;
    kind: "item_consume" | "coin_gain" | "item_purchase";
    message: string;
    source?: "tab" | "hint" | "vocab" | "audio" | "refresh" | "reward" | "shop" | "gacha";
};

type BattleEloBreakdown = ReturnType<typeof calculateListeningElo>["breakdown"] | {
    actualScore: number;
    baseChange: number;
    bonusChange: number;
    difficultyElo: number;
    expectedScore: number;
    kFactor: number;
    smurfMultiplier: number;
    streakBonus: boolean;
};

type PersistDictationBattle = (payload: {
    activeTheme?: string | null;
    change: number;
    coins?: number;
    eloAfter: number;
    inventory?: InventoryState;
    ownedThemes?: string[];
    source?: string;
    streak: number;
}) => Promise<number | null>;

type UseDrillBattleSettlementArgs = {
    applyEconomyPatch: (args: { coinsDelta?: number }) => { coins: number };
    bossState: PendingBossState;
    coinsRef: MutableRefObject<number>;
    comboCount: number;
    context: {
        articleTitle?: string;
        topic?: string;
        type: "article" | "scenario";
    };
    cosmeticTheme: string;
    dictationElo: number;
    dictationStreak: number;
    drillData: DrillDataShape | null;
    eloRating: number;
    feverMode: boolean;
    gambleState: PendingGambleState;
    inventoryRef: MutableRefObject<InventoryState>;
    isListeningFamilyMode: boolean;
    isListeningMode: boolean;
    learningSessionActive: boolean;
    listeningElo: number;
    listeningStreak: number;
    localEloChangeRef: MutableRefObject<number>;
    mode: DrillMode;
    openGachaPack: () => void;
    ownedThemes: string[];
    persistDictationBattle: PersistDictationBattle;
    pushEconomyFx: (event: EconomyFxEvent) => void;
    recentScores: number[];
    rouletteSession: RouletteSession;
    setBossState: (value: ((prev: PendingBossState) => PendingBossState) | PendingBossState) => void;
    setComboCount: (value: number) => void;
    setDeathAnim: (value: "slash" | "glitch" | "shatter" | null) => void;
    setDictationElo: (value: number) => void;
    setDictationStreak: (value: number) => void;
    setEloBreakdown: (value: BattleEloBreakdown) => void;
    setEloChange: (value: number) => void;
    setEloRating: (value: number) => void;
    setFeverMode: (value: boolean) => void;
    setGambleState: (value: ((prev: PendingGambleState) => PendingGambleState) | PendingGambleState) => void;
    setListeningElo: (value: number) => void;
    setListeningStreak: (value: number) => void;
    setLootDrop: (value: LootDrop | null) => void;
    setRankDown: (value: { newRank: ReturnType<typeof getRank>; oldRank: ReturnType<typeof getRank> } | null) => void;
    setRankUp: (value: { newRank: ReturnType<typeof getRank>; oldRank: ReturnType<typeof getRank> } | null) => void;
    setRecentScores: (updater: (prev: number[]) => number[]) => void;
    setRouletteSession: (value: RouletteSession) => void;
    setShake: (value: boolean) => void;
    setShowDoubleDown: (value: boolean) => void;
    setStreakCount: (value: number) => void;
    setTheme: (value: BattleTheme) => void;
    streakCount: number;
    userTranslation: string;
};

type SettleScoredBattleArgs = {
    feedback: DrillFeedbackShape;
    forceAI: boolean;
};

const COIN_CRIT_SFX = "https://assets.mixkit.co/sfx/preview/mixkit-coins-handling-735.mp3";
const FAIRY_WIN_SFX = "https://assets.mixkit.co/sfx/preview/mixkit-ethereal-fairy-win-sound-2019.mp3";
const FUTURISTIC_BLIP_SFX = "https://assets.mixkit.co/sfx/preview/mixkit-futuristic-robotic-blip-hit-695.mp3";
const GAME_OVER_SFX = "https://assets.mixkit.co/sfx/preview/mixkit-game-over-dark-orchestra-633.mp3";
const GLASS_BREAK_SFX = "https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3";
const RANK_UP_SFX = "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3";
const SWORD_SLASH_SFX = "https://assets.mixkit.co/sfx/preview/mixkit-sword-slash-swoosh-1476.mp3";
const WINNING_CHIMES_SFX = "https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-201.mp3";
const WOOSH_SFX = "https://assets.mixkit.co/sfx/preview/mixkit-dagger-woosh-1487.mp3";

const playAudioFx = (src: string) => {
    new Audio(src).play().catch(() => { });
};

export function useDrillBattleSettlement({
    applyEconomyPatch,
    bossState,
    coinsRef,
    comboCount,
    context,
    cosmeticTheme,
    dictationElo,
    dictationStreak,
    drillData,
    eloRating,
    feverMode,
    gambleState,
    inventoryRef,
    isListeningFamilyMode,
    isListeningMode,
    learningSessionActive,
    listeningElo,
    listeningStreak,
    localEloChangeRef,
    mode,
    openGachaPack,
    ownedThemes,
    persistDictationBattle,
    pushEconomyFx,
    recentScores,
    rouletteSession,
    setBossState,
    setComboCount,
    setDeathAnim,
    setDictationElo,
    setDictationStreak,
    setEloBreakdown,
    setEloChange,
    setEloRating,
    setFeverMode,
    setGambleState,
    setListeningElo,
    setListeningStreak,
    setLootDrop,
    setRankDown,
    setRankUp,
    setRecentScores,
    setRouletteSession,
    setShake,
    setShowDoubleDown,
    setStreakCount,
    setTheme,
    streakCount,
    userTranslation,
}: UseDrillBattleSettlementArgs) {
    const settleScoredBattle = useCallback(async ({ feedback, forceAI }: SettleScoredBattleArgs) => {
        const isListening = mode === "listening";
        const isDictation = mode === "dictation";
        const activeElo = isDictation ? dictationElo : isListening ? listeningElo : eloRating;
        const activeStreak = isDictation ? dictationStreak : isListening ? listeningStreak : streakCount;

        const calculateAdvancedElo = (playerElo: number, difficultyElo: number, actualScore: number, streak: number) => {
            if (isListening) {
                return calculateListeningElo(playerElo, difficultyElo, actualScore, streak);
            }

            const expectedScore = 1 / (1 + Math.pow(10, (difficultyElo - playerElo) / 400));
            const normalizedScore = Math.max(0, Math.min(1, (actualScore - 3) / 7));

            const kFactor = 40;
            const isStreak = streak >= 2;
            let effectiveK = isStreak ? kFactor * 1.25 : kFactor;
            let smurfMultiplier = 1;

            if (actualScore >= 9 && expectedScore > 0.6) {
                smurfMultiplier = 1 + ((expectedScore - 0.6) * 6);
                effectiveK *= smurfMultiplier;
            }

            const rawChange = effectiveK * (normalizedScore - expectedScore);
            let totalChange = Math.round(rawChange);

            if (actualScore >= 9.5 && totalChange < 10) {
                totalChange = 10;
            } else if (actualScore >= 9.0 && actualScore < 9.5 && totalChange < 5) {
                totalChange = 5;
            }

            return {
                total: totalChange,
                breakdown: {
                    difficultyElo,
                    expectedScore,
                    actualScore: normalizedScore,
                    kFactor,
                    streakBonus: isStreak,
                    smurfMultiplier: parseFloat(smurfMultiplier.toFixed(2)),
                    baseChange: Math.round(kFactor * (normalizedScore - expectedScore)),
                    bonusChange: totalChange - Math.round(kFactor * (normalizedScore - expectedScore)),
                },
            };
        };

        const challengeElo = drillData?._difficultyMeta?.requestedElo ?? activeElo ?? DEFAULT_BASE_ELO;
        const result = calculateAdvancedElo(activeElo ?? DEFAULT_BASE_ELO, challengeElo, feedback.score, activeStreak);
        let change = result.total;

        if (forceAI && localEloChangeRef.current !== 0) {
            change = change - localEloChangeRef.current;
            localEloChangeRef.current = 0;
        } else if (feedback._isLocalEvaluation && feedback.score < 9.5) {
            localEloChangeRef.current = change;
        }

        if (mode === "translation" && feedback.selfEvaluation) {
            change = typeof feedback.eloAdjustment === "number"
                ? feedback.eloAdjustment
                : resolveTranslationSelfEvaluationEloChange({
                    systemEloChange: change,
                    selfEvaluation: feedback.selfEvaluation,
                });
        }

        let newStreak = activeStreak;

        if (gambleState.active && gambleState.wager && gambleState.wager !== "safe") {
            const isWin = feedback.score >= 9.0;

            if (isWin) {
                const baseWin = gambleState.wager === "risky" ? 60 : 150;
                const multiplier = Math.pow(2.5, gambleState.doubleDownCount);
                change = Math.round(baseWin * multiplier);

                playAudioFx(WINNING_CHIMES_SFX);
                setLootDrop({ type: "gem", amount: change, rarity: "legendary", message: `CRIMSON JACKPOT! x${multiplier}` });

                if (gambleState.doubleDownCount < 2) {
                    window.setTimeout(() => setShowDoubleDown(true), 1500);
                } else {
                    window.setTimeout(() => {
                        setGambleState({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
                        setTheme("default");
                    }, 3000);
                }
            } else {
                const baseLoss = gambleState.wager === "risky" ? -20 : -50;
                change = baseLoss * Math.pow(2, gambleState.doubleDownCount);
                playAudioFx(GLASS_BREAK_SFX);
                newStreak = 0;
            }
        } else if (bossState.active && bossState.type === "reaper") {
            change = 0;

            if (feedback.score >= 9.0) {
                const newHp = (bossState.hp || 3) - 1;
                setBossState((prev) => ({ ...prev, hp: newHp }));

                if (newHp <= 0) {
                    playAudioFx(WINNING_CHIMES_SFX);
                    setLootDrop({ type: "gem", amount: 50, rarity: "legendary", message: "REAPER DEFEATED!" });
                    change = 50;
                    setBossState((prev) => ({ ...prev, active: false }));
                    setTheme("default");
                } else {
                    playAudioFx(WOOSH_SFX);
                    setLootDrop({ type: "exp", amount: 0, rarity: "rare", message: "BOSS HIT! Keep going!" });
                }
            } else {
                const newPlayerHp = (bossState.playerHp || 3) - 1;
                setBossState((prev) => ({ ...prev, playerHp: newPlayerHp }));

                if (newPlayerHp <= 0) {
                    setDeathAnim("slash");
                    playAudioFx(SWORD_SLASH_SFX);
                    window.setTimeout(() => {
                        setBossState((prev) => ({ ...prev, active: false }));
                        setTheme("default");
                        setDeathAnim(null);
                    }, 3000);
                    change = -50;
                } else {
                    playAudioFx(GLASS_BREAK_SFX);
                    setShake(true);
                }
            }
        }

        if (rouletteSession) {
            if (rouletteSession.result === "safe") {
                change = Math.round(change * rouletteSession.multiplier);
                if (feedback.score >= 9.0) {
                    setLootDrop({ type: "gem", amount: change, rarity: "legendary", message: `🎰 SURVIVOR JACKPOT x${rouletteSession.multiplier}!` });
                } else {
                    setLootDrop({ type: "exp", amount: change, rarity: "common", message: `🎰 GAMBLE FAILED! x${rouletteSession.multiplier} LOSS` });
                }
            } else if (rouletteSession.result === "dead") {
                if (feedback.score >= 9.0) {
                    change = 25;
                    setLootDrop({ type: "gem", amount: 25, rarity: "rare", message: "⚖️ REDEMPTION GRANTED!" });
                } else {
                    change = -50;
                    setLootDrop({ type: "exp", amount: -50, rarity: "common", message: "💀 TOTAL ANNIHILATION!" });
                }
            }
            setRouletteSession(null);
        }

        setEloBreakdown(result.breakdown);

        const streakThreshold = isListening ? 8.8 : 9.0;
        if (feedback.score >= streakThreshold) {
            newStreak += 1;
            if (!isListening && newStreak >= 3) change += 2;

            const newCombo = comboCount + 1;
            setComboCount(newCombo);
            if (newCombo >= 3 && !feverMode && isListeningFamilyMode) {
                setFeverMode(true);
                setTheme("fever");
                playAudioFx(FUTURISTIC_BLIP_SFX);
            }
        } else {
            newStreak = 0;
            setComboCount(0);
            if (feverMode) {
                setFeverMode(false);
                setTheme("default");
                playAudioFx(GAME_OVER_SFX);
            }
        }

        const newElo = Math.max(0, (activeElo ?? DEFAULT_BASE_ELO) + change);
        const oldRank = getRank(activeElo ?? DEFAULT_BASE_ELO);
        const newRank = getRank(newElo);
        if (newRank.title !== oldRank.title && change > 0) {
            setRankUp({ oldRank, newRank });
            playAudioFx(RANK_UP_SFX);
        } else if (newRank.title !== oldRank.title && change < 0) {
            setRankDown({ oldRank, newRank });
            playAudioFx(GLASS_BREAK_SFX);
        }

        if (isListening) {
            setListeningElo(newElo);
            setListeningStreak(newStreak);
        } else if (isDictation) {
            setDictationElo(newElo);
            setDictationStreak(newStreak);
        } else {
            setEloRating(newElo);
            setStreakCount(newStreak);
        }
        setEloChange(change);

        let earnedCoins = 0;
        if (feedback.score < 6) earnedCoins += 2;
        else if (feedback.score <= 8) earnedCoins += 5;
        else earnedCoins += 10;

        if (newStreak >= 10) earnedCoins += 20;
        else if (newStreak >= 5) earnedCoins += 10;
        else if (newStreak >= 3) earnedCoins += 5;

        let isCritical = false;
        if (Math.random() < 0.1) {
            earnedCoins *= 5;
            isCritical = true;
            playAudioFx(COIN_CRIT_SFX);
        }

        let finalCoins = coinsRef.current + earnedCoins;
        let bountyCoins = 0;
        let bountyMessage = "";
        let bountyRarity: "rare" | "legendary" = "rare";

        if (result.breakdown.expectedScore <= 0.3 && feedback.score >= 9.0) {
            bountyCoins = 88;
            bountyMessage = "🏆 破壁者！越级挑战无伤通关！+88 ✨";
            bountyRarity = "legendary";
        } else if (recentScores.length >= 2 && recentScores[recentScores.length - 1] < 6 && recentScores[recentScores.length - 2] < 6 && feedback.score >= 9.0) {
            bountyCoins = 100;
            bountyMessage = "🔥 涅槃重生！触底绝地反击！+100 ✨";
            bountyRarity = "legendary";
        } else if (feedback.score === 10 && Math.random() < 0.2) {
            bountyCoins = 50;
            bountyMessage = "🥷 词汇刺客！母语级精准表达！+50 ✨";
            bountyRarity = "legendary";
        }

        if (bountyCoins > 0) {
            earnedCoins += bountyCoins;
            finalCoins += bountyCoins;
            setLootDrop({ type: "gem", amount: bountyCoins, rarity: bountyRarity, message: bountyMessage });
            playAudioFx(FAIRY_WIN_SFX);
        }

        const hasExistingLoot = bossState.type === "reaper" && bossState.hp === 1 && feedback.score >= 9.0;
        let gachaTriggered = false;
        const gachaMode: "translation" | "listening" = isListeningMode ? "listening" : "translation";
        if (!hasExistingLoot && shouldTriggerGacha({
            mode: gachaMode,
            score: feedback.score,
            learningSession: learningSessionActive,
            roll: Math.random(),
        })) {
            gachaTriggered = true;
            window.setTimeout(() => {
                openGachaPack();
                playAudioFx(FAIRY_WIN_SFX);
            }, bountyCoins > 0 ? 2500 : 1000);
        }

        if (!hasExistingLoot && !gachaTriggered && earnedCoins > 0 && bountyCoins === 0) {
            if (isCritical) {
                setLootDrop({ type: "gem", amount: earnedCoins, rarity: "legendary", message: "✨ 绝佳！打工薪水超级暴击！" });
            } else {
                pushEconomyFx({ kind: "coin_gain", amount: earnedCoins, message: `+${earnedCoins} 星光币`, source: "reward" });
            }
        }

        finalCoins = applyEconomyPatch({
            coinsDelta: earnedCoins,
        }).coins;
        setRecentScores((prev) => [...prev.slice(-4), feedback.score]);

        const profile = await loadLocalProfile();
        if (profile) {
            if (isDictation) {
                await persistDictationBattle({
                    eloAfter: newElo,
                    change,
                    streak: newStreak,
                    coins: finalCoins,
                    inventory: inventoryRef.current,
                    ownedThemes,
                    activeTheme: cosmeticTheme,
                    source: learningSessionActive ? "guided_session" : "battle",
                });
            } else {
                const maxElo = isListening
                    ? Math.max(profile.listening_max_elo ?? DEFAULT_BASE_ELO, newElo)
                    : Math.max(profile.max_elo, newElo);

                await settleBattle({
                    mode: isListening ? "listening" : "translation",
                    eloAfter: newElo,
                    change,
                    streak: newStreak,
                    maxElo,
                    coins: finalCoins,
                    inventory: inventoryRef.current,
                    ownedThemes,
                    activeTheme: cosmeticTheme,
                    source: learningSessionActive ? "guided_session" : "battle",
                });
            }
        }

        if (context.type === "article" && mode === "translation" && userTranslation.trim()) {
            await saveWritingHistory({
                articleTitle: drillData?._topicMeta?.topic || context.articleTitle || context.topic || "General",
                content: userTranslation.trim(),
                score: feedback.score,
                timestamp: Date.now(),
            });
        }

        return newElo;
    }, [
        applyEconomyPatch,
        bossState,
        coinsRef,
        comboCount,
        context,
        cosmeticTheme,
        dictationElo,
        dictationStreak,
        drillData,
        eloRating,
        feverMode,
        gambleState,
        inventoryRef,
        isListeningFamilyMode,
        isListeningMode,
        learningSessionActive,
        listeningElo,
        listeningStreak,
        localEloChangeRef,
        mode,
        openGachaPack,
        ownedThemes,
        persistDictationBattle,
        pushEconomyFx,
        recentScores,
        rouletteSession,
        setBossState,
        setComboCount,
        setDeathAnim,
        setDictationElo,
        setDictationStreak,
        setEloBreakdown,
        setEloChange,
        setEloRating,
        setFeverMode,
        setGambleState,
        setListeningElo,
        setListeningStreak,
        setLootDrop,
        setRankDown,
        setRankUp,
        setRecentScores,
        setRouletteSession,
        setShake,
        setShowDoubleDown,
        setStreakCount,
        setTheme,
        streakCount,
        userTranslation,
    ]);

    return {
        settleScoredBattle,
    };
}
