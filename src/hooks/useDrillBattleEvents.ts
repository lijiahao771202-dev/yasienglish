"use client";

import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { getRank } from "@/lib/rankUtils";
import { DEFAULT_BASE_ELO, DEFAULT_STARTING_COINS } from "@/lib/user-sync";
import { loadLocalProfile, settleBattle } from "@/lib/user-repository";
import { buildGachaPack, getGachaRewardEconomy, type GachaCard } from "@/components/drill/gacha";
import type { PendingBossState, PendingGambleState } from "@/lib/drill-generation-plan";

type DrillMode = "translation" | "listening" | "dictation" | "rebuild" | "imitation";
type ShopItemId = "capsule" | "hint_ticket" | "vocab_ticket" | "audio_ticket" | "refresh_ticket";
type InventoryState = Record<ShopItemId, number>;
type EconomyTargetId = "coins" | ShopItemId;
type EconomyFxKind = "item_consume" | "coin_gain" | "item_purchase";
type EconomyFxSource = "tab" | "hint" | "vocab" | "audio" | "refresh" | "reward" | "shop" | "gacha";
type BattleTheme = "default" | "fever" | "boss" | "crimson";

interface LootDrop {
    type: "gem" | "exp" | "theme";
    amount: number;
    message: string;
    rarity: "common" | "rare" | "legendary";
    name?: string;
}

interface EconomyFxEvent {
    kind: EconomyFxKind;
    itemId?: ShopItemId;
    amount?: number;
    message: string;
    source?: EconomyFxSource;
}

interface UseDrillBattleEventsParams {
    applyEconomyPatch: (args: {
        coinsDelta?: number;
        itemDelta?: Partial<Record<ShopItemId, number>>;
    }) => { coins: number; inventory: InventoryState };
    cosmeticTheme: string;
    dictationEloRef: MutableRefObject<number>;
    eloRatingRef: MutableRefObject<number>;
    inventoryRef: MutableRefObject<InventoryState>;
    isSubmittingDrill: boolean;
    listeningEloRef: MutableRefObject<number>;
    mode: DrillMode;
    ownedThemes: string[];
    pushEconomyFx: (event: EconomyFxEvent) => void;
    resourceTargetRefs: MutableRefObject<Record<EconomyTargetId, HTMLDivElement | null>>;
    setDictationElo: Dispatch<SetStateAction<number>>;
    setDictationStreak: Dispatch<SetStateAction<number>>;
    setEloRating: Dispatch<SetStateAction<number>>;
    setListeningElo: Dispatch<SetStateAction<number>>;
    setListeningStreak: Dispatch<SetStateAction<number>>;
    setPlaybackSpeed: Dispatch<SetStateAction<number>>;
    setStreakCount: Dispatch<SetStateAction<number>>;
}

interface PersistDictationBattlePayload {
    eloAfter: number;
    change: number;
    streak: number;
    coins?: number;
    inventory?: InventoryState;
    ownedThemes?: string[];
    activeTheme?: string | null;
    source?: string;
}

export function useDrillBattleEvents({
    applyEconomyPatch,
    cosmeticTheme,
    dictationEloRef,
    eloRatingRef,
    inventoryRef,
    isSubmittingDrill,
    listeningEloRef,
    mode,
    ownedThemes,
    pushEconomyFx,
    resourceTargetRefs,
    setDictationElo,
    setDictationStreak,
    setEloRating,
    setListeningElo,
    setListeningStreak,
    setPlaybackSpeed,
    setStreakCount,
}: UseDrillBattleEventsParams) {
    const [comboCount, setComboCount] = useState(0);
    const [feverMode, setFeverMode] = useState(false);
    const [theme, setTheme] = useState<BattleTheme>("default");
    const [bossState, setBossState] = useState<PendingBossState>({ active: false, introAck: false, type: "blind" });
    const [deathAnim, setDeathAnim] = useState<"slash" | "glitch" | "shatter" | null>(null);
    const [lootDrop, setLootDrop] = useState<LootDrop | null>(null);
    const [gambleState, setGambleState] = useState<PendingGambleState>({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
    const [showRoulette, setShowRoulette] = useState(false);
    const [rouletteSession, setRouletteSession] = useState<{
        active: boolean;
        result: "safe" | "dead";
        multiplier: number;
        bullets: number;
    } | null>(null);
    const [shake, setShake] = useState(false);
    const [showDoubleDown, setShowDoubleDown] = useState(false);
    const [recentScores, setRecentScores] = useState<number[]>([]);
    const [showGacha, setShowGacha] = useState(false);
    const [gachaCards, setGachaCards] = useState<GachaCard[]>([]);
    const [selectedGachaCardId, setSelectedGachaCardId] = useState<string | null>(null);
    const [gachaClaimTarget, setGachaClaimTarget] = useState<{ x: number; y: number; target: EconomyTargetId } | null>(null);
    const [lightningStarted, setLightningStarted] = useState(false);
    const [fuseTime, setFuseTime] = useState(100);
    const [rankUp, setRankUp] = useState<{ oldRank: ReturnType<typeof getRank>; newRank: ReturnType<typeof getRank> } | null>(null);
    const [rankDown, setRankDown] = useState<{ oldRank: ReturnType<typeof getRank>; newRank: ReturnType<typeof getRank> } | null>(null);

    const persistDictationBattle = useCallback(async (payload: PersistDictationBattlePayload) => {
        const profile = await loadLocalProfile();
        if (!profile?.id) return null;

        const nextMaxElo = Math.max(
            profile.dictation_max_elo ?? profile.dictation_elo ?? DEFAULT_BASE_ELO,
            payload.eloAfter,
        );

        await settleBattle({
            mode: "dictation",
            eloAfter: payload.eloAfter,
            change: payload.change,
            streak: payload.streak,
            maxElo: nextMaxElo,
            coins: payload.coins ?? profile.coins ?? DEFAULT_STARTING_COINS,
            inventory: (payload.inventory ?? profile.inventory) as Record<string, number> | undefined,
            ownedThemes: payload.ownedThemes ?? profile.owned_themes,
            activeTheme: payload.activeTheme ?? profile.active_theme,
            source: payload.source || "battle",
        });

        return nextMaxElo;
    }, []);

    useEffect(() => {
        let interval: NodeJS.Timeout | undefined;
        const isLightning = theme === "boss" && bossState.active && bossState.type === "lightning" && bossState.introAck && lightningStarted;
        const isGamble = theme === "crimson" && gambleState.active && gambleState.introAck;

        if ((isLightning || isGamble) && !isSubmittingDrill) {
            interval = setInterval(() => {
                const durationTicks = isLightning ? 300 : 450;
                const decrement = 100 / durationTicks;

                setFuseTime((prev) => {
                    if (prev <= 0) {
                        if (interval) clearInterval(interval);
                        new Audio("https://commondatastorage.googleapis.com/codeskulptor-assets/sounddogs/explosion.mp3").play().catch(() => {});
                        if (navigator.vibrate) navigator.vibrate(500);
                        setShake(true);

                        const penalty = isGamble ? (gambleState.wager === "risky" ? 20 : 50) : 20;
                        setDeathAnim(isGamble ? "shatter" : "glitch");

                        const isActiveListeningMode = mode === "listening";
                        const isActiveDictationMode = mode === "dictation";
                        const activeElo = isActiveDictationMode
                            ? dictationEloRef.current
                            : isActiveListeningMode
                                ? listeningEloRef.current
                                : eloRatingRef.current;
                        const newElo = Math.max(0, activeElo - penalty);

                        if (isActiveListeningMode) {
                            setListeningElo(newElo);
                            setListeningStreak(0);
                        } else if (isActiveDictationMode) {
                            setDictationElo(newElo);
                            setDictationStreak(0);
                        } else {
                            setEloRating(newElo);
                            setStreakCount(0);
                        }

                        void loadLocalProfile().then(async (profile) => {
                            if (!profile) return;
                            if (isActiveDictationMode) {
                                await persistDictationBattle({
                                    eloAfter: newElo,
                                    change: -penalty,
                                    streak: 0,
                                    coins: profile.coins ?? DEFAULT_STARTING_COINS,
                                    inventory: inventoryRef.current,
                                    ownedThemes,
                                    activeTheme: cosmeticTheme,
                                    source: "timeout_penalty",
                                });
                                return;
                            }

                            const isActiveRebuildMode = mode === "rebuild";
                            const maxElo = isActiveListeningMode
                                ? Math.max(profile.listening_max_elo ?? DEFAULT_BASE_ELO, newElo)
                                : isActiveRebuildMode
                                    ? Math.max(profile.rebuild_max_elo ?? profile.rebuild_elo ?? DEFAULT_BASE_ELO, newElo)
                                    : Math.max(profile.max_elo, newElo);

                            await settleBattle({
                                mode: isActiveListeningMode ? "listening" : isActiveRebuildMode ? "rebuild" : "translation",
                                eloAfter: newElo,
                                change: -penalty,
                                streak: 0,
                                maxElo,
                                coins: profile.coins ?? DEFAULT_STARTING_COINS,
                                source: "timeout_penalty",
                            });
                        }).catch((error) => {
                            console.error("Failed to sync timeout penalty", error);
                        });

                        setLootDrop({
                            type: "exp",
                            amount: -penalty,
                            rarity: "common",
                            message: "TIME UP! DEFEAT",
                        });

                        setTimeout(() => {
                            setTheme("default");
                            setBossState((current) => ({ ...current, active: false }));
                            setGambleState((current) => ({ ...current, active: false, introAck: false, wager: null, doubleDownCount: 0 }));
                            if (mode === "listening") {
                                setListeningStreak(0);
                            } else if (mode === "dictation") {
                                setDictationStreak(0);
                            } else {
                                setStreakCount(0);
                            }
                            setDeathAnim(null);
                        }, 3000);

                        return 0;
                    }
                    return Math.max(0, prev - decrement);
                });
            }, 100);
        } else if (!isLightning && !isGamble) {
            const rafId = window.requestAnimationFrame(() => {
                setFuseTime(100);
            });
            return () => {
                window.cancelAnimationFrame(rafId);
            };
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [
        bossState.active,
        bossState.introAck,
        bossState.type,
        cosmeticTheme,
        dictationEloRef,
        gambleState.active,
        gambleState.introAck,
        gambleState.wager,
        inventoryRef,
        isSubmittingDrill,
        lightningStarted,
        listeningEloRef,
        mode,
        ownedThemes,
        persistDictationBattle,
        setDictationElo,
        setDictationStreak,
        setEloRating,
        setListeningElo,
        setListeningStreak,
        setStreakCount,
        theme,
        eloRatingRef,
    ]);

    useEffect(() => {
        if (!shake) return undefined;
        const timeout = window.setTimeout(() => setShake(false), 500);
        return () => window.clearTimeout(timeout);
    }, [shake]);

    useEffect(() => {
        if (!lootDrop) return undefined;
        const timeout = window.setTimeout(() => {
            setLootDrop(null);
        }, 4000);
        return () => window.clearTimeout(timeout);
    }, [lootDrop]);

    const updatePendingEventState = useCallback((args: {
        pendingBossState: PendingBossState | null;
        pendingGambleState: PendingGambleState | null;
    }) => {
        if (args.pendingBossState) {
            setBossState(args.pendingBossState);
            setTheme("boss");
            setPlaybackSpeed(args.pendingBossState.type === "lightning" ? 1.5 : 1.0);
        }
        if (args.pendingGambleState) {
            setGambleState(args.pendingGambleState);
            setTheme("crimson");
        }
    }, [setPlaybackSpeed]);

    const triggerSurpriseDrop = useCallback(() => {
        setTimeout(() => {
            const isCapsule = Math.random() < 0.2;
            if (isCapsule) {
                applyEconomyPatch({ itemDelta: { capsule: 1 } });
                setLootDrop({ type: "gem", amount: 1, rarity: "rare", message: "🎁 天降幸运！获得灵感胶囊！" });
            } else {
                const randomCoins = Math.floor(Math.random() * 20) + 5;
                applyEconomyPatch({ coinsDelta: randomCoins });
                pushEconomyFx({ kind: "coin_gain", amount: randomCoins, message: `+${randomCoins} 星光币`, source: "reward" });
            }
        }, 1000);
    }, [applyEconomyPatch, pushEconomyFx]);

    const openGachaPack = useCallback(() => {
        setGachaCards(buildGachaPack());
        setSelectedGachaCardId(null);
        setGachaClaimTarget(null);
        setShowGacha(true);
    }, []);

    const getGachaClaimTarget = useCallback((card: GachaCard) => {
        const targetId: EconomyTargetId = card.rewardType === "coins" ? "coins" : card.rewardType;
        const targetRect = resourceTargetRefs.current[targetId]?.getBoundingClientRect();

        if (!targetRect) return null;

        return {
            target: targetId,
            x: targetRect.left + targetRect.width / 2,
            y: targetRect.top + targetRect.height / 2,
        };
    }, [resourceTargetRefs]);

    const handleGachaSelect = useCallback((cardId: string) => {
        if (selectedGachaCardId !== null) return;

        const reward = gachaCards.find((card) => card.id === cardId);
        if (!reward) return;

        setSelectedGachaCardId(cardId);
        setGachaCards((current) => current.map((card) => ({
            ...card,
            selected: card.id === cardId,
            revealed: card.id === cardId,
        })));
        setGachaClaimTarget(getGachaClaimTarget(reward));
        new Audio("https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3").play().catch(() => {});

        const economyReward = getGachaRewardEconomy(reward);
        applyEconomyPatch({
            coinsDelta: economyReward.coinsDelta,
            itemDelta: economyReward.itemDelta,
        });
        pushEconomyFx({
            ...economyReward.fx,
            source: "gacha",
        });
    }, [applyEconomyPatch, gachaCards, getGachaClaimTarget, pushEconomyFx, selectedGachaCardId]);

    const handleGachaComplete = useCallback(() => {
        setShowGacha(false);
        setGachaCards([]);
        setSelectedGachaCardId(null);
        setGachaClaimTarget(null);
    }, []);

    const openRoulette = useCallback(() => {
        setShowRoulette(true);
    }, []);

    const closeRoulette = useCallback(() => {
        setShowRoulette(false);
    }, []);

    return {
        bossState,
        closeRoulette,
        comboCount,
        deathAnim,
        feverMode,
        fuseTime,
        gambleState,
        gachaCards,
        gachaClaimTarget,
        handleGachaComplete,
        handleGachaSelect,
        lightningStarted,
        lootDrop,
        openGachaPack,
        openRoulette,
        persistDictationBattle,
        rankDown,
        rankUp,
        recentScores,
        rouletteSession,
        selectedGachaCardId,
        setBossState,
        setComboCount,
        setDeathAnim,
        setFeverMode,
        setGambleState,
        setLightningStarted,
        setLootDrop,
        setRankDown,
        setRankUp,
        setRecentScores,
        setRouletteSession,
        setShake,
        setShowDoubleDown,
        setTheme,
        shake,
        showDoubleDown,
        showGacha,
        showRoulette,
        theme,
        triggerSurpriseDrop,
        updatePendingEventState,
    };
}
