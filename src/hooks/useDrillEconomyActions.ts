"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type ShopItemId = "capsule" | "hint_ticket" | "vocab_ticket" | "audio_ticket" | "refresh_ticket";
type CosmeticThemeId =
    | "morning_coffee"
    | "verdant_atelier"
    | "cute_cream"
    | "sakura"
    | "golden_hour"
    | "holo_pearl"
    | "cloud_nine"
    | "lilac_dream";

interface LootDropState {
    amount: number;
    message: string;
    rarity: "common" | "rare" | "legendary";
    type: "exp" | "gem" | "theme";
}

interface FullReferenceHintState {
    text: string;
    version: number;
}

interface ThemePricingEntry {
    price: number;
}

interface ShopItemPricingEntry {
    name: string;
    price: number;
}

function triggerHintShake(setIsHintShake: Dispatch<SetStateAction<boolean>>) {
    setIsHintShake(true);
    window.setTimeout(() => setIsHintShake(false), 500);
}

export function useDrillEconomyActions({
    applyEconomyPatch,
    blindVisibleUnlockConsumed,
    coinsRef,
    cosmeticThemes,
    drillData,
    drillFeedbackExists,
    getItemCount,
    handleGenerateDrill,
    isAudioLoading,
    isBlindMode,
    isDictationMode,
    isGeneratingDrill,
    isHintLoading,
    isListeningFamilyMode,
    itemCatalog,
    learningSessionActive,
    mode,
    onOpenShopForItem,
    ownedThemes,
    persistProfilePatch,
    playAudio,
    pushEconomyFx,
    setBlindVisibleUnlockConsumed,
    setCosmeticTheme,
    setFullReferenceHint,
    setIsBlindMode,
    setIsHintLoading,
    setIsHintShake,
    setIsTranslationAudioUnlocked,
    setIsVocabHintRevealed,
    setLootDrop,
    setOwnedThemes,
    setPrefetchedDrillData,
    translationAudioUnlockRef,
    vocabHintRevealRef,
}: {
    applyEconomyPatch: (patch: {
        coinsDelta?: number;
        itemDelta?: Partial<Record<ShopItemId, number>>;
    }) => unknown;
    blindVisibleUnlockConsumed: boolean;
    coinsRef: MutableRefObject<number>;
    cosmeticThemes: Record<CosmeticThemeId, ThemePricingEntry>;
    drillData: {
        key_vocab?: string[];
        reference_english?: string;
        target_english_vocab?: string[];
    } | null;
    drillFeedbackExists: boolean;
    getItemCount: (itemId: ShopItemId) => number;
    handleGenerateDrill: (targetDifficulty?: string, overrideBossType?: string, skipPrefetched?: boolean, forcedElo?: number) => void | Promise<unknown>;
    isAudioLoading: boolean;
    isBlindMode: boolean;
    isDictationMode: boolean;
    isGeneratingDrill: boolean;
    isHintLoading: boolean;
    isListeningFamilyMode: boolean;
    itemCatalog: Record<ShopItemId, ShopItemPricingEntry>;
    learningSessionActive: boolean;
    mode: string;
    onOpenShopForItem: (itemId: ShopItemId, message?: string) => void;
    ownedThemes: CosmeticThemeId[];
    persistProfilePatch: (patch: Partial<{ active_theme: string; owned_themes: string[] }>) => void;
    playAudio: () => Promise<boolean | void> | boolean | void;
    pushEconomyFx: (event: {
        amount?: number;
        itemId?: ShopItemId;
        kind: "coin_gain" | "item_consume" | "item_purchase";
        message: string;
        source?: "tab" | "hint" | "vocab" | "audio" | "refresh" | "reward" | "shop" | "gacha";
    }) => void;
    setBlindVisibleUnlockConsumed: Dispatch<SetStateAction<boolean>>;
    setCosmeticTheme: Dispatch<SetStateAction<CosmeticThemeId>>;
    setFullReferenceHint: Dispatch<SetStateAction<FullReferenceHintState>>;
    setIsBlindMode: Dispatch<SetStateAction<boolean>>;
    setIsHintLoading: Dispatch<SetStateAction<boolean>>;
    setIsHintShake: Dispatch<SetStateAction<boolean>>;
    setIsTranslationAudioUnlocked: Dispatch<SetStateAction<boolean>>;
    setIsVocabHintRevealed: Dispatch<SetStateAction<boolean>>;
    setLootDrop: Dispatch<SetStateAction<LootDropState | null>>;
    setOwnedThemes: Dispatch<SetStateAction<CosmeticThemeId[]>>;
    setPrefetchedDrillData: (value: null) => void;
    translationAudioUnlockRef: MutableRefObject<boolean>;
    vocabHintRevealRef: MutableRefObject<boolean>;
}) {
    const handleMagicHint = useCallback(async () => {
        if (learningSessionActive) return;
        if (!drillData?.reference_english) return;
        if (isHintLoading) return;
        if (getItemCount("hint_ticket") <= 0) {
            triggerHintShake(setIsHintShake);
            setLootDrop({ type: "exp", amount: 0, rarity: "common", message: "Hint 道具不足，请先去商场购买" });
            return;
        }

        setIsHintLoading(true);
        try {
            applyEconomyPatch({ itemDelta: { hint_ticket: -1 } });
            const fullReference = drillData.reference_english.trim();
            setFullReferenceHint((prev) => ({ version: prev.version + 1, text: fullReference }));
            pushEconomyFx({ kind: "item_consume", itemId: "hint_ticket", amount: 1, message: "已消耗 1 Hint 道具", source: "hint" });
        } catch (error) {
            console.error("[Hint] Failed to generate hint:", error);
            setLootDrop({ type: "exp", amount: 0, rarity: "common", message: "提示生成失败，请重试" });
        } finally {
            setIsHintLoading(false);
        }
    }, [
        applyEconomyPatch,
        drillData,
        getItemCount,
        isHintLoading,
        learningSessionActive,
        pushEconomyFx,
        setFullReferenceHint,
        setIsHintLoading,
        setIsHintShake,
        setLootDrop,
    ]);

    const handleRevealVocabHint = useCallback(() => {
        if (learningSessionActive) return false;
        if (!drillData) return false;

        const keywords = drillData.target_english_vocab || drillData.key_vocab || [];
        if (keywords.length === 0) return false;
        if (vocabHintRevealRef.current) return true;

        if (getItemCount("vocab_ticket") <= 0) {
            triggerHintShake(setIsHintShake);
            setLootDrop({ type: "exp", amount: 0, rarity: "common", message: "关键词提示券不足，请先去商场购买" });
            return false;
        }

        vocabHintRevealRef.current = true;
        applyEconomyPatch({ itemDelta: { vocab_ticket: -1 } });
        setIsVocabHintRevealed(true);
        pushEconomyFx({ kind: "item_consume", itemId: "vocab_ticket", amount: 1, message: "已消耗 1 关键词券", source: "vocab" });
        return true;
    }, [
        applyEconomyPatch,
        drillData,
        getItemCount,
        learningSessionActive,
        pushEconomyFx,
        setIsHintShake,
        setIsVocabHintRevealed,
        setLootDrop,
        vocabHintRevealRef,
    ]);

    const handlePredictionRequest = useCallback(() => !learningSessionActive, [learningSessionActive]);
    const handlePredictionShown = useCallback(() => undefined, []);

    const handleTranslationReferencePlayback = useCallback(async () => {
        if (learningSessionActive) return false;
        if (mode !== "translation" || !drillData?.reference_english || drillFeedbackExists) {
            await playAudio();
            return;
        }
        if (isAudioLoading) return;

        if (translationAudioUnlockRef.current) {
            await playAudio();
            return;
        }

        if (getItemCount("audio_ticket") <= 0) {
            triggerHintShake(setIsHintShake);
            onOpenShopForItem("audio_ticket", "朗读券不足，请先去商场购买");
            return;
        }

        translationAudioUnlockRef.current = true;
        setIsTranslationAudioUnlocked(true);
        applyEconomyPatch({ itemDelta: { audio_ticket: -1 } });

        const played = await playAudio();
        if (!played) {
            translationAudioUnlockRef.current = false;
            setIsTranslationAudioUnlocked(false);
            applyEconomyPatch({ itemDelta: { audio_ticket: 1 } });
            setLootDrop({ type: "exp", amount: 0, rarity: "common", message: "参考句播放失败，已退还 1 张朗读券" });
            return;
        }

        pushEconomyFx({ kind: "item_consume", itemId: "audio_ticket", amount: 1, message: "已消耗 1 朗读券", source: "audio" });
    }, [
        applyEconomyPatch,
        drillData,
        drillFeedbackExists,
        getItemCount,
        isAudioLoading,
        learningSessionActive,
        mode,
        onOpenShopForItem,
        playAudio,
        pushEconomyFx,
        setIsHintShake,
        setIsTranslationAudioUnlocked,
        setLootDrop,
        translationAudioUnlockRef,
    ]);

    const handleRefreshDrill = useCallback(() => {
        if (learningSessionActive) return false;
        if (isGeneratingDrill || !drillData || drillFeedbackExists) return false;
        if (getItemCount("refresh_ticket") <= 0) {
            triggerHintShake(setIsHintShake);
            onOpenShopForItem("refresh_ticket", "刷新卡不足，请先去商场购买");
            return false;
        }

        applyEconomyPatch({ itemDelta: { refresh_ticket: -1 } });
        pushEconomyFx({ kind: "item_consume", itemId: "refresh_ticket", amount: 1, message: "已消耗 1 刷新卡", source: "refresh" });
        setPrefetchedDrillData(null);
        void handleGenerateDrill(undefined, undefined, true);
        return true;
    }, [
        applyEconomyPatch,
        drillData,
        drillFeedbackExists,
        getItemCount,
        handleGenerateDrill,
        isGeneratingDrill,
        learningSessionActive,
        onOpenShopForItem,
        pushEconomyFx,
        setIsHintShake,
        setPrefetchedDrillData,
    ]);

    const handleBuyItem = useCallback((itemId: ShopItemId) => {
        const item = itemCatalog[itemId];
        if (coinsRef.current < item.price) return false;

        applyEconomyPatch({
            coinsDelta: -item.price,
            itemDelta: { [itemId]: 1 },
        });
        pushEconomyFx({ kind: "item_purchase", itemId, amount: 1, message: `已购买 ${item.name}`, source: "shop" });
        return true;
    }, [applyEconomyPatch, coinsRef, itemCatalog, pushEconomyFx]);

    const handleBuyTheme = useCallback((themeId: CosmeticThemeId) => {
        const themeDef = cosmeticThemes[themeId];
        if (!themeDef || ownedThemes.includes(themeId)) return false;
        if (coinsRef.current < themeDef.price) return false;

        applyEconomyPatch({ coinsDelta: -themeDef.price });
        const nextOwned = [...ownedThemes, themeId];
        setOwnedThemes(nextOwned);
        setCosmeticTheme(themeId);
        persistProfilePatch({ owned_themes: nextOwned, active_theme: themeId });
        return true;
    }, [applyEconomyPatch, coinsRef, cosmeticThemes, ownedThemes, persistProfilePatch, setCosmeticTheme, setOwnedThemes]);

    const handleSwitchTheme = useCallback((themeId: CosmeticThemeId) => {
        if (!ownedThemes.includes(themeId)) return;
        setCosmeticTheme(themeId);
        persistProfilePatch({ active_theme: themeId });
    }, [ownedThemes, persistProfilePatch, setCosmeticTheme]);

    const handleDictationWordLookupTicketConsume = useCallback((action: "lookup" | "deepAnalyze") => {
        if (!isDictationMode) return true;

        if (getItemCount("vocab_ticket") <= 0) {
            triggerHintShake(setIsHintShake);
            onOpenShopForItem("vocab_ticket", "关键词券不足，请先去商场购买");
            return false;
        }

        applyEconomyPatch({ itemDelta: { vocab_ticket: -1 } });
        pushEconomyFx({
            kind: "item_consume",
            itemId: "vocab_ticket",
            amount: 1,
            message: action === "deepAnalyze" ? "已消耗 1 关键词券（Deep Analyze）" : "已消耗 1 关键词券（查词）",
            source: "vocab",
        });
        return true;
    }, [applyEconomyPatch, getItemCount, isDictationMode, onOpenShopForItem, pushEconomyFx, setIsHintShake]);

    const handleBlindVisibilityToggle = useCallback(() => {
        if (!isListeningFamilyMode) {
            setIsBlindMode((prev) => !prev);
            return;
        }
        if (!isBlindMode) {
            setIsBlindMode(true);
            return;
        }
        if (blindVisibleUnlockConsumed) {
            setIsBlindMode(false);
            return;
        }
        if (getItemCount("hint_ticket") <= 0) {
            triggerHintShake(setIsHintShake);
            onOpenShopForItem("hint_ticket", "Hint 道具不足，请先去商场购买");
            return;
        }

        applyEconomyPatch({ itemDelta: { hint_ticket: -1 } });
        pushEconomyFx({ kind: "item_consume", itemId: "hint_ticket", amount: 1, message: "已消耗 1 Hint 道具", source: "hint" });
        setBlindVisibleUnlockConsumed(true);
        setIsBlindMode(false);
    }, [
        applyEconomyPatch,
        blindVisibleUnlockConsumed,
        getItemCount,
        isBlindMode,
        isListeningFamilyMode,
        onOpenShopForItem,
        pushEconomyFx,
        setBlindVisibleUnlockConsumed,
        setIsBlindMode,
        setIsHintShake,
    ]);

    return {
        handleBlindVisibilityToggle,
        handleBuyItem,
        handleBuyTheme,
        handleDictationWordLookupTicketConsume,
        handleMagicHint,
        handlePredictionRequest,
        handlePredictionShown,
        handleRefreshDrill,
        handleRevealVocabHint,
        handleSwitchTheme,
        handleTranslationReferencePlayback,
    };
}
