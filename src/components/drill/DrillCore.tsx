"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Sparkles, RefreshCw, Send, ArrowRight, HelpCircle, MessageCircle, Wand2, Mic, Play, Volume2, Globe, Headphones, Eye, EyeOff, BookOpen, BrainCircuit, X, Trophy, TrendingUp, Zap, Gift, Crown, Gem, Dices, AlertTriangle, Skull, Heart, ChevronRight, Flame, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import * as Diff from 'diff';
import confetti from 'canvas-confetti';
import { WordPopup, PopupState } from "../reading/WordPopup";
import { useWhisper } from "@/hooks/useWhisper";
import { db } from "@/lib/db";
import { getRank } from "@/lib/rankUtils";
import { DeathFX } from "./DeathFX";
import { BossScoreReveal } from "./BossScoreReveal";
import { RouletteOverlay } from "./RouletteOverlay";
import { GachaOverlay } from "./GachaOverlay";
import { ScoringFlipCard } from "./ScoringFlipCard";
import { TeachingCard } from "./TeachingCard";
import { TranslationAnalysisJourney } from "./TranslationAnalysisJourney";
import { GuidedLearningOverlay } from "./GuidedLearningOverlay";
import {
    AiTeacherConversation,
    type TutorHistoryTurn,
    type TutorStructuredResponse,
} from "./AiTeacherConversation";
import { GhostTextarea } from "../vocab/GhostTextarea";
import { InlineGrammarHighlights } from "../shared/InlineGrammarHighlights";
import { LottieJsonPlayer } from "../shared/LottieJsonPlayer";
import { TOPICS } from "../../app/battle/page";
import { getTranslationDifficultyTier } from "@/lib/translationDifficulty";
import { getDrillSurfacePhase, shouldExpandShopInventoryDock } from "@/lib/battleUiState";
import { buildGuidedHintCacheKey, fetchGuidedHintWithRetry } from "@/lib/guidedHintClient";
import { type GrammarDisplayMode, type GrammarSentenceAnalysis } from "@/lib/grammarHighlights";
import {
    buildFallbackGuidedScript,
    buildGuidedClozeHint,
    buildGuidedHintLines,
    createGuidedClozeState,
    createGuidedSessionState,
    isGuidedAnswerCorrect,
    revealGuidedClozeCurrentSlot,
    revealGuidedCurrentSlot,
    submitGuidedClozeInput,
    submitGuidedChoiceSelection,
    shouldBypassBattleRewards,
    submitGuidedStepInput,
    shouldAutoOpenGuidedChoices,
    type GuidedAiHint,
    type GuidedClozeState,
    type GuidedModeStatus,
    type GuidedScript,
    type GuidedSessionState,
} from "@/lib/guidedLearning";
import {
    buildGachaPack,
    getGachaRewardEconomy,
    shouldTriggerGacha,
    type GachaCard,
} from "./gacha";
import sphereSplitterAnimation from "@/assets/lottie/sphere-splitter.json";
import { loadLocalProfile, saveProfilePatch, saveWritingHistory, settleBattle } from "@/lib/user-repository";

// --- Interfaces ---

export type DrillMode = "translation" | "listening";
type GuidedInnerMode = "teacher_guided" | "gestalt_cloze";

export interface DrillCoreProps {
    // Context for generation
    context: {
        type: "article" | "scenario";
        articleTitle?: string;
        articleContent?: string;
        topic?: string; // For scenario mode
    };
    initialMode?: DrillMode;
    onClose?: () => void;
}

interface DrillData {
    chinese: string;
    target_english_vocab?: string[];
    key_vocab?: string[];
    reference_english: string;
    _difficultyMeta?: {
        requestedElo: number;
        tier: string;
        cefr: string;
        expectedWordRange: { min: number; max: number };
        actualWordCount: number;
        isValid: boolean;
        status: 'TOO_EASY' | 'TOO_HARD' | 'MATCHED';
        aiSelfReport?: {
            tier: string;
            cefr: string;
            wordCount: number;
            targetRange: string;
            wordCountAccurate: boolean;
        } | null;
    };
    _topicMeta?: {
        topic: string;
        subTopic?: string | null;
        isScenario: boolean;
    };
}

function getGuidedScriptKey(
    drillData: Pick<DrillData, "chinese" | "reference_english" | "_topicMeta">,
    elo: number,
    contextTopic?: string,
) {
    return JSON.stringify({
        chinese: drillData.chinese,
        referenceEnglish: drillData.reference_english,
        topic: drillData._topicMeta?.topic || contextTopic || "",
        elo,
    });
}

interface DrillFeedback {
    score: number;
    feedback?: any; // Can be string[] or object with listening_tips
    judge_reasoning?: string;
    improved_version?: string;
    diagnosis_summary_cn?: string;
    chinglish_vs_natural?: {
        chinglish: string;
        natural: string;
        reason_cn: string;
    };
    common_pitfall?: {
        pitfall_cn: string;
        wrong_example: string;
        right_example: string;
        why_cn: string;
    };
    phrase_synonyms?: Array<{
        source_phrase: string;
        alternatives: string[];
        nuance_cn: string;
    }>;
    transfer_pattern?: {
        template: string;
        example_cn: string;
        example_en: string;
        tip_cn: string;
    };
    memory_hook_cn?: string;
    segments?: {
        word: string;
        status: "correct" | "phonetic_error" | "missing" | "typo" | "user_extra" | "variation";
        user_input?: string;
        feedback?: string;
    }[];
    // Teaching mode enhanced fields
    error_analysis?: Array<{ error: string; correction: string; rule: string; tip: string }>;
    similar_patterns?: Array<{ chinese: string; english: string; point: string }>;
    _error?: boolean;
}

type TutorQuestionType = "pattern" | "word_choice" | "example" | "unlock_answer" | "follow_up";
type TutorIntent = "translate" | "grammar" | "lexical";
type TutorAction = "ask";

interface DictionaryData {
    word: string;
    phonetic?: string;
    audio?: string;
    translation?: string;
    definition?: string;
}

// --- State --- 

interface LootDrop {
    type: 'gem' | 'exp' | 'theme';
    amount: number;
    message: string;
    rarity: 'common' | 'rare' | 'legendary';
    name?: string; // Optional for compatibility
}

type EconomyTargetId = 'coins' | ShopItemId;
type EconomyFxKind = 'item_consume' | 'coin_gain' | 'item_purchase';
type EconomyFxSource = 'tab' | 'hint' | 'vocab' | 'audio' | 'refresh' | 'reward' | 'shop' | 'gacha';

interface EconomyFxEvent {
    id: number;
    kind: EconomyFxKind;
    itemId?: ShopItemId;
    amount?: number;
    message: string;
    source?: EconomyFxSource;
}

type StreakTier = 0 | 1 | 2 | 3 | 4;

interface StreakTierVisual {
    accent: string;
    badgeGradient: string;
    badgeBorder: string;
    badgeShadow: string;
    badgeGlow: string;
    auraGradient: string;
    beamGradient: string;
    beamShadow: string;
    surfaceBorder: string;
    surfaceShadow: string;
    checkGradient: string;
    checkBorder: string;
    checkShadow: string;
    nextGradient: string;
    nextShadow: string;
    eloGradient: string;
    eloBorder: string;
    eloShadow: string;
    progressGradient: string;
    scoreGlow: string;
    particleGradient: string;
    particleDensity: number;
}

const STREAK_PARTICLE_POSITIONS = [12, 26, 39, 54, 68, 82, 90, 18, 47, 76];
type ShopItemId = 'capsule' | 'hint_ticket' | 'vocab_ticket' | 'audio_ticket' | 'refresh_ticket';

type InventoryState = Record<ShopItemId, number>;

const ECONOMY_OVERLAY_ORIGIN_TOP = 38;
const ECONOMY_COIN_RAIN = [
    { x: -126, y: 72, delay: 0.02, rotate: -16, scale: 0.82 },
    { x: -92, y: 92, delay: 0.05, rotate: -10, scale: 0.92 },
    { x: -64, y: 112, delay: 0.08, rotate: -6, scale: 1 },
    { x: -28, y: 82, delay: 0.03, rotate: 8, scale: 0.88 },
    { x: 0, y: 104, delay: 0.1, rotate: -2, scale: 0.98 },
    { x: 32, y: 86, delay: 0.06, rotate: 12, scale: 0.9 },
    { x: 68, y: 116, delay: 0.12, rotate: 16, scale: 1.02 },
    { x: 102, y: 74, delay: 0.04, rotate: 9, scale: 0.86 },
    { x: 132, y: 98, delay: 0.09, rotate: 14, scale: 0.94 },
    { x: -148, y: 116, delay: 0.14, rotate: -18, scale: 0.84 },
    { x: -6, y: 136, delay: 0.16, rotate: -4, scale: 1.05 },
    { x: 118, y: 128, delay: 0.18, rotate: 18, scale: 0.9 },
    { x: -86, y: 136, delay: 0.2, rotate: -14, scale: 0.88 },
    { x: 84, y: 146, delay: 0.22, rotate: 14, scale: 0.95 },
] as const;

const ECONOMY_COIN_ABSORB = [
    { x: -44, y: 36, delay: 0.54 },
    { x: -18, y: 54, delay: 0.62 },
    { x: 0, y: 44, delay: 0.7 },
    { x: 22, y: 58, delay: 0.78 },
    { x: 46, y: 42, delay: 0.86 },
] as const;

const DEFAULT_INVENTORY: InventoryState = {
    capsule: 10,
    hint_ticket: 10,
    vocab_ticket: 10,
    audio_ticket: 10,
    refresh_ticket: 10,
};

const ITEM_CATALOG: Record<ShopItemId, { id: ShopItemId; name: string; price: number; icon: string; consumeAction: string; description: string; }> = {
    capsule: {
        id: 'capsule',
        name: '灵感胶囊',
        price: 30,
        icon: '💊',
        consumeAction: 'Tab 预测提示',
        description: '用于 Tab 智能续写提示',
    },
    hint_ticket: {
        id: 'hint_ticket',
        name: 'Hint 道具',
        price: 50,
        icon: '🪄',
        consumeAction: 'Hint 全句参考',
        description: '用于显示完整参考句幽灵层',
    },
    vocab_ticket: {
        id: 'vocab_ticket',
        name: '关键词提示券',
        price: 20,
        icon: '🧩',
        consumeAction: '解锁底部关键词',
        description: '用于显示本题关键词提示',
    },
    audio_ticket: {
        id: 'audio_ticket',
        name: '朗读券',
        price: 30,
        icon: '🔊',
        consumeAction: '播放参考句',
        description: '用于解锁本题参考句播放，支持重播和倍速',
    },
    refresh_ticket: {
        id: 'refresh_ticket',
        name: '刷新卡',
        price: 40,
        icon: '🔄',
        consumeAction: '重刷当前题目',
        description: '用于丢弃当前题并立即刷新一题，不影响 Elo 和连胜',
    },
};

const RANDOM_SCENARIO_TOPIC = "Random Scenario";

const resolveScenarioTopic = (context: DrillCoreProps["context"]) => {
    const targetTopic = context.articleTitle || context.topic;
    if (context.type !== "scenario") return targetTopic;
    if (!targetTopic || targetTopic.trim().length === 0 || targetTopic === RANDOM_SCENARIO_TOPIC) {
        const randomTopicObj = TOPICS[Math.floor(Math.random() * TOPICS.length)];
        return randomTopicObj.title;
    }
    return targetTopic;
};

const normalizeInventory = (inventory: unknown, legacyCapsule?: number): InventoryState => {
    const rawInventory = (inventory && typeof inventory === 'object') ? inventory as Partial<Record<ShopItemId, number>> : {};
    const capsuleValue = typeof rawInventory.capsule === 'number'
        ? rawInventory.capsule
        : (typeof legacyCapsule === 'number' ? legacyCapsule : DEFAULT_INVENTORY.capsule);
    const hintTicketValue = typeof rawInventory.hint_ticket === 'number'
        ? rawInventory.hint_ticket
        : DEFAULT_INVENTORY.hint_ticket;
    const vocabTicketValue = typeof rawInventory.vocab_ticket === 'number'
        ? rawInventory.vocab_ticket
        : DEFAULT_INVENTORY.vocab_ticket;
    const audioTicketValue = typeof rawInventory.audio_ticket === 'number'
        ? rawInventory.audio_ticket
        : DEFAULT_INVENTORY.audio_ticket;
    const refreshTicketValue = typeof rawInventory.refresh_ticket === 'number'
        ? rawInventory.refresh_ticket
        : DEFAULT_INVENTORY.refresh_ticket;

    return {
        capsule: Math.max(0, capsuleValue),
        hint_ticket: Math.max(0, hintTicketValue),
        vocab_ticket: Math.max(0, vocabTicketValue),
        audio_ticket: Math.max(0, audioTicketValue),
        refresh_ticket: Math.max(0, refreshTicketValue),
    };
};

// ===== COSMETIC THEMES =====
type CosmeticThemeId = 'morning_coffee' | 'sakura' | 'golden_hour' | 'holo_pearl' | 'cloud_nine' | 'lilac_dream';

interface CosmeticTheme {
    id: CosmeticThemeId;
    name: string;
    icon: string;
    price: number; // 0 = free
    description: string;
    preview: string; // short tagline for shop
    // Visual tokens
    bgClass: string;       // Background gradient CSS class
    cardClass: string;     // Main card container class
    textClass: string;     // Primary text color
    mutedClass: string;    // Muted text color
    headerBg: string;      // Header pill background
    isDark: boolean;       // Dark mode flag for contrast adjustments
}

interface CosmeticThemeUi {
    ledgerClass: string;
    toolbarClass: string;
    inputShellClass: string;
    textareaClass: string;
    audioLockedClass: string;
    audioUnlockedClass: string;
    speedShellClass: string;
    speedActiveClass: string;
    speedIdleClass: string;
    vocabButtonClass: string;
    keywordChipClass: string;
    wordBadgeActiveClass: string;
    wordBadgeIdleClass: string;
    hintButtonClass: string;
    iconButtonClass: string;
    checkButtonClass: string;
    tutorPanelClass: string;
    tutorAnswerClass: string;
    tutorInputClass: string;
    tutorSendClass: string;
    analysisButtonClass: string;
    nextButtonGradient: string;
    nextButtonShadow: string;
    nextButtonGlow: string;
}

const COSMETIC_THEMES: Record<CosmeticThemeId, CosmeticTheme> = {
    morning_coffee: {
        id: 'morning_coffee',
        name: '☕ Morning Coffee',
        icon: '☕',
        price: 0,
        description: '温暖的咖啡色调，默认主题',
        preview: '经典暖色玻璃拟态',
        bgClass: 'bg-gradient-to-br from-slate-100 via-stone-50 to-blue-50',
        cardClass: 'bg-white/70 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-white/30',
        textClass: 'text-stone-900',
        mutedClass: 'text-stone-500',
        headerBg: 'bg-white/80',
        isDark: false,
    },
    sakura: {
        id: 'sakura',
        name: '🌸 樱花漫步',
        icon: '🌸',
        price: 300,
        description: '粉色日系温柔，飘落樱花瓣',
        preview: '樱粉 + 花瓣粒子',
        bgClass: 'bg-gradient-to-br from-[#fdf2f8] via-[#fce7f3] to-[#fff1f2]',
        cardClass: 'bg-white/75 backdrop-blur-2xl border border-pink-200/60 shadow-[0_8px_32px_rgba(236,72,153,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-pink-100/40',
        textClass: 'text-pink-950',
        mutedClass: 'text-pink-400',
        headerBg: 'bg-white/80',
        isDark: false,
    },
    golden_hour: {
        id: 'golden_hour',
        name: '🌅 黄金时刻',
        icon: '🌅',
        price: 300,
        description: '日落暖光，液态玻璃流动',
        preview: '琥珀暖金 + 流光溢彩',
        bgClass: 'bg-gradient-to-br from-[#fff7ed] via-[#fef3c7] to-[#fff1f2]',
        cardClass: 'bg-white/72 backdrop-blur-2xl border border-amber-200/50 shadow-[0_8px_32px_rgba(245,158,11,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-amber-100/40',
        textClass: 'text-amber-950',
        mutedClass: 'text-amber-600/60',
        headerBg: 'bg-white/80',
        isDark: false,
    },
    holo_pearl: {
        id: 'holo_pearl',
        name: '✨ 全息珍珠',
        icon: '✨',
        price: 500,
        description: '纯净洁白，泛起超现实全息光晕',
        preview: '珍珠白板 + 全息流光',
        bgClass: 'bg-[#fcfdfd]',
        cardClass: 'bg-white/60 backdrop-blur-3xl border border-white/80 shadow-[0_15px_50px_rgba(0,0,0,0.04),inset_0_2px_4px_rgba(255,255,255,1)] ring-1 ring-white/50',
        textClass: 'text-slate-800',
        mutedClass: 'text-slate-400',
        headerBg: 'bg-white/70',
        isDark: false,
    },
    cloud_nine: {
        id: 'cloud_nine',
        name: '☁️ 云端漫步',
        icon: '☁️',
        price: 500,
        description: '清透呼吸感，极简白蓝天空',
        preview: '天青色 + 通透云朵呼吸',
        bgClass: 'bg-gradient-to-br from-[#f0f9ff] via-[#e0f2fe] to-[#f8fafc]',
        cardClass: 'bg-white/75 backdrop-blur-3xl border border-sky-200/50 shadow-[0_8px_32px_rgba(14,165,233,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-sky-100/60',
        textClass: 'text-cyan-950',
        mutedClass: 'text-cyan-600/60',
        headerBg: 'bg-white/80',
        isDark: false,
    },
    lilac_dream: {
        id: 'lilac_dream',
        name: '🦄 丁香幻梦',
        icon: '🦄',
        price: 500,
        description: '梦幻马卡龙紫粉，治愈流光',
        preview: '淡紫色 + 柔和光谱交织',
        bgClass: 'bg-gradient-to-br from-[#faf5ff] via-[#f3e8ff] to-[#fdf2f8]',
        cardClass: 'bg-white/70 backdrop-blur-3xl border border-purple-200/50 shadow-[0_8px_32px_rgba(168,85,247,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-purple-100/50',
        textClass: 'text-purple-950',
        mutedClass: 'text-purple-500/60',
        headerBg: 'bg-white/80',
        isDark: false,
    },
};

const COSMETIC_THEME_UI: Record<CosmeticThemeId, CosmeticThemeUi> = {
    morning_coffee: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(245,244,240,0.68))] border-stone-200/55 ring-stone-200/35 shadow-[0_10px_28px_rgba(120,113,108,0.08)]",
        toolbarClass: "border-stone-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(245,244,240,0.74))] shadow-[0_10px_30px_rgba(120,113,108,0.08)]",
        inputShellClass: "border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(248,246,242,0.68))] shadow-[0_10px_36px_rgba(120,113,108,0.08),inset_0_1px_0_rgba(255,255,255,0.98)] hover:shadow-[0_18px_46px_rgba(120,113,108,0.1),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-stone-300/80 focus-within:ring-[4px] focus-within:ring-stone-400/10",
        textareaClass: "text-stone-900 placeholder:text-stone-400/55",
        audioLockedClass: "border-amber-200/90 bg-[linear-gradient(180deg,rgba(255,250,238,0.98),rgba(252,236,214,0.9))] text-amber-800 shadow-[0_8px_22px_rgba(180,83,9,0.12)] hover:border-amber-300 hover:text-amber-900",
        audioUnlockedClass: "border-stone-200/85 bg-[linear-gradient(180deg,rgba(247,244,238,0.98),rgba(231,229,228,0.92))] text-stone-700 shadow-[0_8px_22px_rgba(120,113,108,0.1)] hover:border-stone-300 hover:text-stone-900",
        speedShellClass: "border-stone-200/85 bg-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]",
        speedActiveClass: "bg-stone-900 text-white shadow-[0_8px_16px_rgba(68,64,60,0.18)]",
        speedIdleClass: "text-stone-500 hover:bg-stone-100 hover:text-stone-700",
        vocabButtonClass: "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(245,255,250,0.96),rgba(220,252,231,0.88))] text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,244,240,0.95))] border-stone-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300 hover:text-stone-900 shadow-[0_8px_20px_rgba(120,113,108,0.08)]",
        wordBadgeActiveClass: "border-stone-200/80 bg-white/92 text-stone-500 shadow-[0_6px_16px_rgba(120,113,108,0.05)]",
        wordBadgeIdleClass: "bg-transparent text-stone-400/60",
        hintButtonClass: "border-stone-200/80 bg-[linear-gradient(180deg,rgba(247,244,238,0.96),rgba(231,229,228,0.88))] text-stone-700 shadow-[0_6px_16px_rgba(120,113,108,0.08)] hover:border-stone-300 hover:text-stone-900 hover:shadow-[0_10px_20px_rgba(120,113,108,0.12)]",
        iconButtonClass: "border-stone-200/80 bg-white/90 text-stone-500 shadow-[0_6px_16px_rgba(120,113,108,0.06)] hover:border-stone-300 hover:bg-stone-50 hover:text-stone-700",
        checkButtonClass: "border-stone-500/80 bg-[linear-gradient(180deg,rgba(120,113,108,0.95),rgba(68,64,60,0.98))] text-white shadow-[0_10px_24px_rgba(68,64,60,0.28)] hover:shadow-[0_14px_30px_rgba(68,64,60,0.34)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,244,238,0.95))] border-stone-200/80 shadow-[0_18px_46px_rgba(120,113,108,0.14)]",
        tutorAnswerClass: "bg-stone-50/85 text-stone-700",
        tutorInputClass: "bg-white/88 border-stone-200 text-stone-700 focus:ring-stone-300",
        tutorSendClass: "text-stone-600",
        analysisButtonClass: "bg-stone-900 text-white hover:bg-stone-800",
        nextButtonGradient: "linear-gradient(90deg, #78716c 0%, #57534e 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(87,83,78,0.42)",
        nextButtonGlow: "rgba(120,113,108,0.18)",
    },
    sakura: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(252,231,243,0.66))] border-pink-200/60 ring-pink-100/40 shadow-[0_12px_30px_rgba(236,72,153,0.08)]",
        toolbarClass: "border-pink-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(252,231,243,0.74))] shadow-[0_10px_30px_rgba(236,72,153,0.08)]",
        inputShellClass: "border-pink-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(253,242,248,0.68))] shadow-[0_10px_36px_rgba(236,72,153,0.08),inset_0_1px_0_rgba(255,255,255,0.98)] hover:shadow-[0_18px_46px_rgba(236,72,153,0.1),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-pink-300/80 focus-within:ring-[4px] focus-within:ring-pink-400/12",
        textareaClass: "text-pink-950 placeholder:text-pink-300/70",
        audioLockedClass: "border-rose-200/90 bg-[linear-gradient(180deg,rgba(255,247,250,0.98),rgba(252,231,243,0.92))] text-rose-700 shadow-[0_8px_22px_rgba(236,72,153,0.12)] hover:border-rose-300 hover:text-rose-800",
        audioUnlockedClass: "border-pink-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(253,242,248,0.92))] text-pink-700 shadow-[0_8px_22px_rgba(236,72,153,0.1)] hover:border-pink-300 hover:text-pink-800",
        speedShellClass: "border-pink-200/80 bg-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.94)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(244,114,182,0.95),rgba(219,39,119,0.95))] text-white shadow-[0_8px_16px_rgba(236,72,153,0.18)]",
        speedIdleClass: "text-pink-500 hover:bg-pink-50 hover:text-pink-700",
        vocabButtonClass: "border-pink-200/80 bg-[linear-gradient(180deg,rgba(255,250,252,0.96),rgba(252,231,243,0.88))] text-pink-700 hover:border-pink-300 hover:bg-pink-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(253,242,248,0.95))] border-pink-200 text-pink-700 hover:bg-pink-50 hover:border-pink-300 hover:text-pink-900 shadow-[0_8px_22px_rgba(236,72,153,0.08)]",
        wordBadgeActiveClass: "border-pink-200/80 bg-white/92 text-pink-500 shadow-[0_6px_16px_rgba(236,72,153,0.05)]",
        wordBadgeIdleClass: "bg-transparent text-pink-300/75",
        hintButtonClass: "border-pink-200/80 bg-[linear-gradient(180deg,rgba(255,247,250,0.96),rgba(252,231,243,0.88))] text-pink-700 shadow-[0_6px_16px_rgba(236,72,153,0.08)] hover:border-pink-300 hover:text-pink-800 hover:shadow-[0_10px_20px_rgba(236,72,153,0.12)]",
        iconButtonClass: "border-pink-200/80 bg-white/90 text-pink-500 shadow-[0_6px_16px_rgba(236,72,153,0.06)] hover:border-pink-300 hover:bg-pink-50/90 hover:text-pink-700",
        checkButtonClass: "border-pink-400/80 bg-[linear-gradient(180deg,rgba(244,114,182,0.92),rgba(219,39,119,0.98))] text-white shadow-[0_10px_24px_rgba(236,72,153,0.26)] hover:shadow-[0_14px_30px_rgba(236,72,153,0.34)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(253,242,248,0.95))] border-pink-200/80 shadow-[0_18px_46px_rgba(236,72,153,0.14)]",
        tutorAnswerClass: "bg-pink-50/85 text-pink-900",
        tutorInputClass: "bg-white/88 border-pink-200 text-pink-800 focus:ring-pink-300",
        tutorSendClass: "text-pink-500",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(244,114,182,0.95),rgba(219,39,119,0.98))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #f472b6 0%, #db2777 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(236,72,153,0.42)",
        nextButtonGlow: "rgba(244,114,182,0.22)",
    },
    golden_hour: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(254,243,199,0.68))] border-amber-200/60 ring-amber-100/40 shadow-[0_12px_30px_rgba(245,158,11,0.09)]",
        toolbarClass: "border-amber-200/70 bg-[linear-gradient(180deg,rgba(255,252,243,0.84),rgba(254,243,199,0.76))] shadow-[0_12px_32px_rgba(245,158,11,0.1)]",
        inputShellClass: "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,247,237,0.68))] shadow-[0_12px_38px_rgba(245,158,11,0.1),inset_0_1px_0_rgba(255,255,255,0.98)] hover:shadow-[0_20px_48px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-amber-300/85 focus-within:ring-[4px] focus-within:ring-amber-400/14",
        textareaClass: "text-amber-950 placeholder:text-amber-400/65",
        audioLockedClass: "border-amber-300/90 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.92))] text-amber-700 shadow-[0_10px_24px_rgba(245,158,11,0.14)] hover:border-amber-400 hover:text-amber-800",
        audioUnlockedClass: "border-orange-200/85 bg-[linear-gradient(180deg,rgba(255,247,237,0.98),rgba(254,215,170,0.9))] text-orange-700 shadow-[0_10px_24px_rgba(249,115,22,0.12)] hover:border-orange-300 hover:text-orange-800",
        speedShellClass: "border-amber-200/80 bg-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.94)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(217,119,6,0.95),rgba(146,64,14,0.98))] text-white shadow-[0_8px_16px_rgba(180,83,9,0.2)]",
        speedIdleClass: "text-amber-600 hover:bg-amber-50 hover:text-amber-800",
        vocabButtonClass: "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(245,255,250,0.96),rgba(220,252,231,0.88))] text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.95))] border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900 shadow-[0_8px_24px_rgba(245,158,11,0.09)]",
        wordBadgeActiveClass: "border-amber-200/80 bg-white/92 text-amber-600 shadow-[0_6px_16px_rgba(245,158,11,0.06)]",
        wordBadgeIdleClass: "bg-transparent text-amber-400/70",
        hintButtonClass: "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(254,243,199,0.88))] text-amber-700 shadow-[0_6px_16px_rgba(245,158,11,0.08)] hover:border-amber-300 hover:text-amber-800 hover:shadow-[0_10px_20px_rgba(245,158,11,0.14)]",
        iconButtonClass: "border-amber-200/80 bg-white/90 text-amber-600 shadow-[0_6px_16px_rgba(245,158,11,0.06)] hover:border-amber-300 hover:bg-amber-50/90 hover:text-amber-800",
        checkButtonClass: "border-amber-400/80 bg-[linear-gradient(180deg,rgba(251,191,36,0.95),rgba(217,119,6,0.98))] text-white shadow-[0_12px_26px_rgba(245,158,11,0.28)] hover:shadow-[0_16px_32px_rgba(245,158,11,0.36)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.95))] border-amber-200/80 shadow-[0_18px_46px_rgba(245,158,11,0.14)]",
        tutorAnswerClass: "bg-amber-50/85 text-amber-950",
        tutorInputClass: "bg-white/88 border-amber-200 text-amber-900 focus:ring-amber-300",
        tutorSendClass: "text-amber-600",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(251,191,36,0.95),rgba(217,119,6,0.98))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(245,158,11,0.46)",
        nextButtonGlow: "rgba(251,191,36,0.24)",
    },
    holo_pearl: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(243,232,255,0.48),rgba(224,231,255,0.52))] border-white/80 ring-fuchsia-100/30 shadow-[0_14px_36px_rgba(147,51,234,0.08)]",
        toolbarClass: "border-white/80 bg-[linear-gradient(90deg,rgba(255,255,255,0.82),rgba(250,232,255,0.68),rgba(224,231,255,0.72),rgba(255,255,255,0.82))] shadow-[0_12px_34px_rgba(147,51,234,0.08)]",
        inputShellClass: "border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(248,250,252,0.68))] shadow-[0_12px_42px_rgba(147,51,234,0.08),inset_0_1px_0_rgba(255,255,255,1)] hover:shadow-[0_20px_52px_rgba(147,51,234,0.1),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-fuchsia-200/90 focus-within:ring-[4px] focus-within:ring-fuchsia-400/12",
        textareaClass: "text-slate-800 placeholder:text-slate-400/65",
        audioLockedClass: "border-fuchsia-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,232,255,0.9),rgba(224,231,255,0.92))] text-fuchsia-700 shadow-[0_10px_24px_rgba(192,38,211,0.12)] hover:border-fuchsia-300 hover:text-fuchsia-800",
        audioUnlockedClass: "border-indigo-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(238,242,255,0.92),rgba(250,232,255,0.9))] text-indigo-700 shadow-[0_10px_24px_rgba(99,102,241,0.1)] hover:border-indigo-300 hover:text-indigo-800",
        speedShellClass: "border-fuchsia-100/80 bg-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.96)]",
        speedActiveClass: "bg-[linear-gradient(135deg,rgba(236,72,153,0.95),rgba(99,102,241,0.95),rgba(192,38,211,0.96))] text-white shadow-[0_10px_18px_rgba(168,85,247,0.2)]",
        speedIdleClass: "text-slate-500 hover:bg-fuchsia-50/80 hover:text-fuchsia-700",
        vocabButtonClass: "border-teal-200/80 bg-[linear-gradient(180deg,rgba(240,253,250,0.96),rgba(204,251,241,0.88))] text-teal-700 hover:border-teal-300 hover:bg-teal-100/90",
        keywordChipClass: "bg-[linear-gradient(90deg,rgba(255,255,255,0.98),rgba(250,232,255,0.9),rgba(224,231,255,0.92))] border-white/90 text-slate-700 hover:border-fuchsia-200 hover:text-fuchsia-800 shadow-[0_10px_26px_rgba(168,85,247,0.1)]",
        wordBadgeActiveClass: "border-fuchsia-100/80 bg-white/92 text-fuchsia-600 shadow-[0_6px_16px_rgba(168,85,247,0.05)]",
        wordBadgeIdleClass: "bg-transparent text-slate-400/70",
        hintButtonClass: "border-fuchsia-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,232,255,0.88),rgba(224,231,255,0.88))] text-fuchsia-700 shadow-[0_6px_18px_rgba(168,85,247,0.08)] hover:border-fuchsia-300 hover:text-fuchsia-800 hover:shadow-[0_10px_22px_rgba(168,85,247,0.14)]",
        iconButtonClass: "border-fuchsia-100/80 bg-white/92 text-fuchsia-600 shadow-[0_6px_16px_rgba(168,85,247,0.06)] hover:border-fuchsia-200 hover:bg-fuchsia-50/90 hover:text-fuchsia-700",
        checkButtonClass: "border-fuchsia-300/80 bg-[linear-gradient(135deg,rgba(236,72,153,0.94),rgba(99,102,241,0.94),rgba(192,38,211,0.96))] text-white shadow-[0_12px_28px_rgba(168,85,247,0.26)] hover:shadow-[0_16px_34px_rgba(168,85,247,0.34)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96),rgba(250,232,255,0.94))] border-fuchsia-100/80 shadow-[0_20px_50px_rgba(168,85,247,0.14)]",
        tutorAnswerClass: "bg-[linear-gradient(90deg,rgba(250,232,255,0.72),rgba(224,231,255,0.6))] text-slate-700",
        tutorInputClass: "bg-white/88 border-fuchsia-100 text-slate-700 focus:ring-fuchsia-200",
        tutorSendClass: "text-fuchsia-500",
        analysisButtonClass: "bg-[linear-gradient(135deg,rgba(236,72,153,0.95),rgba(99,102,241,0.94),rgba(192,38,211,0.96))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #ec4899 0%, #6366f1 52%, #c026d3 100%)",
        nextButtonShadow: "0 20px 36px -12px rgba(168,85,247,0.42)",
        nextButtonGlow: "rgba(192,38,211,0.22)",
    },
    cloud_nine: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(224,242,254,0.64))] border-sky-200/60 ring-sky-100/40 shadow-[0_12px_32px_rgba(14,165,233,0.07)]",
        toolbarClass: "border-sky-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(224,242,254,0.74))] shadow-[0_10px_30px_rgba(14,165,233,0.08)]",
        inputShellClass: "border-sky-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(240,249,255,0.7))] shadow-[0_12px_38px_rgba(14,165,233,0.08),inset_0_1px_0_rgba(255,255,255,1)] hover:shadow-[0_20px_48px_rgba(14,165,233,0.1),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-cyan-300/85 focus-within:ring-[4px] focus-within:ring-cyan-300/12",
        textareaClass: "text-cyan-950 placeholder:text-cyan-400/65",
        audioLockedClass: "border-cyan-200/90 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(224,242,254,0.92))] text-cyan-700 shadow-[0_8px_22px_rgba(6,182,212,0.1)] hover:border-cyan-300 hover:text-cyan-800",
        audioUnlockedClass: "border-sky-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(224,242,254,0.9))] text-sky-700 shadow-[0_8px_22px_rgba(14,165,233,0.1)] hover:border-sky-300 hover:text-sky-800",
        speedShellClass: "border-sky-200/80 bg-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(6,182,212,0.95),rgba(8,145,178,0.98))] text-white shadow-[0_8px_16px_rgba(6,182,212,0.18)]",
        speedIdleClass: "text-cyan-600 hover:bg-cyan-50 hover:text-cyan-800",
        vocabButtonClass: "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(245,255,250,0.96),rgba(220,252,231,0.88))] text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,249,255,0.94))] border-sky-200 text-cyan-700 hover:bg-cyan-50 hover:border-cyan-300 hover:text-cyan-900 shadow-[0_8px_22px_rgba(14,165,233,0.08)]",
        wordBadgeActiveClass: "border-sky-200/80 bg-white/92 text-cyan-600 shadow-[0_6px_16px_rgba(14,165,233,0.05)]",
        wordBadgeIdleClass: "bg-transparent text-cyan-400/65",
        hintButtonClass: "border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.96),rgba(224,242,254,0.88))] text-cyan-700 shadow-[0_6px_16px_rgba(14,165,233,0.07)] hover:border-cyan-300 hover:text-cyan-800 hover:shadow-[0_10px_20px_rgba(14,165,233,0.12)]",
        iconButtonClass: "border-sky-200/80 bg-white/92 text-cyan-600 shadow-[0_6px_16px_rgba(14,165,233,0.05)] hover:border-cyan-300 hover:bg-cyan-50/90 hover:text-cyan-800",
        checkButtonClass: "border-cyan-400/80 bg-[linear-gradient(180deg,rgba(34,211,238,0.95),rgba(8,145,178,0.98))] text-white shadow-[0_12px_26px_rgba(6,182,212,0.24)] hover:shadow-[0_16px_32px_rgba(6,182,212,0.32)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,249,255,0.95))] border-sky-200/80 shadow-[0_18px_46px_rgba(14,165,233,0.12)]",
        tutorAnswerClass: "bg-cyan-50/80 text-cyan-950",
        tutorInputClass: "bg-white/88 border-sky-200 text-cyan-900 focus:ring-cyan-200",
        tutorSendClass: "text-cyan-600",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(34,211,238,0.95),rgba(8,145,178,0.98))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #22d3ee 0%, #0891b2 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(6,182,212,0.42)",
        nextButtonGlow: "rgba(34,211,238,0.2)",
    },
    lilac_dream: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(243,232,255,0.66))] border-purple-200/60 ring-purple-100/40 shadow-[0_12px_30px_rgba(168,85,247,0.08)]",
        toolbarClass: "border-purple-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(243,232,255,0.74))] shadow-[0_10px_30px_rgba(168,85,247,0.08)]",
        inputShellClass: "border-purple-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(250,245,255,0.68))] shadow-[0_12px_38px_rgba(168,85,247,0.08),inset_0_1px_0_rgba(255,255,255,1)] hover:shadow-[0_20px_48px_rgba(168,85,247,0.1),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-purple-300/85 focus-within:ring-[4px] focus-within:ring-purple-300/12",
        textareaClass: "text-purple-950 placeholder:text-purple-400/65",
        audioLockedClass: "border-purple-200/90 bg-[linear-gradient(180deg,rgba(250,245,255,0.98),rgba(243,232,255,0.92))] text-purple-700 shadow-[0_8px_22px_rgba(168,85,247,0.1)] hover:border-purple-300 hover:text-purple-800",
        audioUnlockedClass: "border-fuchsia-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,232,255,0.92))] text-fuchsia-700 shadow-[0_8px_22px_rgba(217,70,239,0.1)] hover:border-fuchsia-300 hover:text-fuchsia-800",
        speedShellClass: "border-purple-200/80 bg-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(168,85,247,0.95),rgba(147,51,234,0.98))] text-white shadow-[0_8px_16px_rgba(168,85,247,0.18)]",
        speedIdleClass: "text-purple-500 hover:bg-purple-50 hover:text-purple-700",
        vocabButtonClass: "border-violet-200/80 bg-[linear-gradient(180deg,rgba(245,243,255,0.96),rgba(237,233,254,0.88))] text-violet-700 hover:border-violet-300 hover:bg-violet-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,245,255,0.94))] border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-900 shadow-[0_8px_22px_rgba(168,85,247,0.08)]",
        wordBadgeActiveClass: "border-purple-200/80 bg-white/92 text-purple-600 shadow-[0_6px_16px_rgba(168,85,247,0.05)]",
        wordBadgeIdleClass: "bg-transparent text-purple-400/65",
        hintButtonClass: "border-purple-200/80 bg-[linear-gradient(180deg,rgba(250,245,255,0.96),rgba(243,232,255,0.88))] text-purple-700 shadow-[0_6px_16px_rgba(168,85,247,0.08)] hover:border-purple-300 hover:text-purple-800 hover:shadow-[0_10px_20px_rgba(168,85,247,0.12)]",
        iconButtonClass: "border-purple-200/80 bg-white/92 text-purple-600 shadow-[0_6px_16px_rgba(168,85,247,0.05)] hover:border-purple-300 hover:bg-purple-50/90 hover:text-purple-800",
        checkButtonClass: "border-purple-400/80 bg-[linear-gradient(180deg,rgba(192,132,252,0.95),rgba(147,51,234,0.98))] text-white shadow-[0_12px_26px_rgba(168,85,247,0.24)] hover:shadow-[0_16px_32px_rgba(168,85,247,0.32)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,245,255,0.95))] border-purple-200/80 shadow-[0_18px_46px_rgba(168,85,247,0.14)]",
        tutorAnswerClass: "bg-purple-50/82 text-purple-950",
        tutorInputClass: "bg-white/88 border-purple-200 text-purple-900 focus:ring-purple-200",
        tutorSendClass: "text-purple-600",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(192,132,252,0.95),rgba(147,51,234,0.98))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #c084fc 0%, #9333ea 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(168,85,247,0.42)",
        nextButtonGlow: "rgba(192,132,252,0.22)",
    },
};

const ALL_THEME_IDS = Object.keys(COSMETIC_THEMES) as CosmeticThemeId[];
const DEFAULT_BASE_ELO = 400;
const DEFAULT_STARTING_COINS = 500;
const DEFAULT_FREE_THEME: CosmeticThemeId = "morning_coffee";

const normalizeOwnedThemes = (ownedThemes?: string[] | null): CosmeticThemeId[] => {
    const validThemes = (ownedThemes ?? []).filter((themeId): themeId is CosmeticThemeId => themeId in COSMETIC_THEMES);
    return validThemes.length ? Array.from(new Set(validThemes)) : [DEFAULT_FREE_THEME];
};

const getStreakTier = (streak: number): StreakTier => {
    if (streak >= 10) return 4;
    if (streak >= 7) return 3;
    if (streak >= 4) return 2;
    if (streak >= 2) return 1;
    return 0;
};

const STREAK_TIER_VISUALS: Record<StreakTier, StreakTierVisual> = {
    0: {
        accent: "#78716c",
        badgeGradient: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(245,245,244,0.92))",
        badgeBorder: "rgba(214,211,209,0.9)",
        badgeShadow: "0 10px 24px rgba(120,113,108,0.08)",
        badgeGlow: "transparent",
        auraGradient: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0), transparent 58%)",
        beamGradient: "linear-gradient(90deg, transparent, transparent)",
        beamShadow: "none",
        surfaceBorder: "rgba(255,255,255,0.55)",
        surfaceShadow: "0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
        checkGradient: "linear-gradient(135deg, #292524 0%, #44403c 40%, #1c1917 100%)",
        checkBorder: "rgba(68,64,60,0.5)",
        checkShadow: "0 12px 24px rgba(28,25,23,0.24)",
        nextGradient: "linear-gradient(90deg, #f97316 0%, #d97706 100%)",
        nextShadow: "0 10px 30px -10px rgba(249,115,22,0.5)",
        eloGradient: "linear-gradient(90deg, rgba(16,185,129,0.08), rgba(16,185,129,0.02))",
        eloBorder: "rgba(209,250,229,0.9)",
        eloShadow: "0 8px 20px rgba(16,185,129,0.08)",
        progressGradient: "linear-gradient(90deg, #a8a29e 0%, #78716c 100%)",
        scoreGlow: "none",
        particleGradient: "radial-gradient(circle, rgba(255,255,255,0.6), transparent 70%)",
        particleDensity: 0,
    },
    1: {
        accent: "#c2410c",
        badgeGradient: "linear-gradient(135deg, rgba(255,247,237,0.98), rgba(255,237,213,0.92))",
        badgeBorder: "rgba(251,146,60,0.36)",
        badgeShadow: "0 14px 30px rgba(251,146,60,0.18)",
        badgeGlow: "rgba(251,146,60,0.18)",
        auraGradient: "radial-gradient(circle at 50% 0%, rgba(251,191,36,0.16), transparent 56%)",
        beamGradient: "linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.78) 50%, transparent 100%)",
        beamShadow: "0 0 28px rgba(251,191,36,0.34)",
        surfaceBorder: "rgba(251,191,36,0.3)",
        surfaceShadow: "0 24px 72px rgba(251,146,60,0.12), inset 0 1px 0 rgba(255,255,255,0.88)",
        checkGradient: "linear-gradient(135deg, #d97706 0%, #f59e0b 52%, #f97316 100%)",
        checkBorder: "rgba(251,146,60,0.45)",
        checkShadow: "0 16px 30px rgba(245,158,11,0.28)",
        nextGradient: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)",
        nextShadow: "0 16px 34px -12px rgba(249,115,22,0.48)",
        eloGradient: "linear-gradient(90deg, rgba(245,158,11,0.96), rgba(249,115,22,0.92))",
        eloBorder: "rgba(251,191,36,0.5)",
        eloShadow: "0 18px 40px rgba(249,115,22,0.28)",
        progressGradient: "linear-gradient(90deg, #f59e0b 0%, #fb923c 100%)",
        scoreGlow: "0 0 26px rgba(249,115,22,0.2)",
        particleGradient: "radial-gradient(circle, rgba(251,191,36,0.92), rgba(249,115,22,0.18) 55%, transparent 72%)",
        particleDensity: 0,
    },
    2: {
        accent: "#ea580c",
        badgeGradient: "linear-gradient(135deg, rgba(255,245,230,0.98), rgba(254,215,170,0.9))",
        badgeBorder: "rgba(249,115,22,0.42)",
        badgeShadow: "0 18px 38px rgba(249,115,22,0.22)",
        badgeGlow: "rgba(249,115,22,0.24)",
        auraGradient: "radial-gradient(circle at 50% 0%, rgba(251,146,60,0.18), transparent 56%)",
        beamGradient: "linear-gradient(90deg, transparent 0%, rgba(249,115,22,0.88) 24%, rgba(251,191,36,0.95) 52%, rgba(249,115,22,0.88) 76%, transparent 100%)",
        beamShadow: "0 0 40px rgba(249,115,22,0.44)",
        surfaceBorder: "rgba(249,115,22,0.32)",
        surfaceShadow: "0 28px 84px rgba(249,115,22,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
        checkGradient: "linear-gradient(135deg, #c2410c 0%, #f97316 48%, #fbbf24 100%)",
        checkBorder: "rgba(249,115,22,0.55)",
        checkShadow: "0 18px 36px rgba(249,115,22,0.32)",
        nextGradient: "linear-gradient(90deg, #ea580c 0%, #f59e0b 100%)",
        nextShadow: "0 20px 40px -12px rgba(249,115,22,0.54)",
        eloGradient: "linear-gradient(90deg, rgba(249,115,22,0.97), rgba(251,191,36,0.96))",
        eloBorder: "rgba(251,146,60,0.58)",
        eloShadow: "0 22px 44px rgba(249,115,22,0.32)",
        progressGradient: "linear-gradient(90deg, #f97316 0%, #f59e0b 55%, #fbbf24 100%)",
        scoreGlow: "0 0 34px rgba(249,115,22,0.24)",
        particleGradient: "radial-gradient(circle, rgba(251,191,36,1), rgba(249,115,22,0.22) 58%, transparent 72%)",
        particleDensity: 0,
    },
    3: {
        accent: "#fb923c",
        badgeGradient: "linear-gradient(135deg, rgba(255,240,222,0.98), rgba(254,178,84,0.88))",
        badgeBorder: "rgba(251,146,60,0.55)",
        badgeShadow: "0 20px 44px rgba(249,115,22,0.28)",
        badgeGlow: "rgba(251,146,60,0.32)",
        auraGradient: "radial-gradient(circle at 50% 0%, rgba(249,115,22,0.24), transparent 54%)",
        beamGradient: "linear-gradient(90deg, transparent 0%, rgba(251,146,60,0.95) 16%, rgba(250,204,21,0.98) 50%, rgba(251,146,60,0.95) 84%, transparent 100%)",
        beamShadow: "0 0 48px rgba(249,115,22,0.52)",
        surfaceBorder: "rgba(251,146,60,0.34)",
        surfaceShadow: "0 34px 92px rgba(249,115,22,0.2), inset 0 1px 0 rgba(255,255,255,0.92)",
        checkGradient: "linear-gradient(135deg, #c2410c 0%, #f97316 38%, #fb923c 68%, #facc15 100%)",
        checkBorder: "rgba(251,146,60,0.6)",
        checkShadow: "0 22px 42px rgba(249,115,22,0.36)",
        nextGradient: "linear-gradient(90deg, #ea580c 0%, #f97316 36%, #fbbf24 100%)",
        nextShadow: "0 24px 46px -14px rgba(249,115,22,0.6)",
        eloGradient: "linear-gradient(90deg, rgba(234,88,12,0.98), rgba(249,115,22,0.97) 42%, rgba(250,204,21,0.96) 100%)",
        eloBorder: "rgba(251,146,60,0.64)",
        eloShadow: "0 24px 48px rgba(249,115,22,0.38)",
        progressGradient: "linear-gradient(90deg, #ea580c 0%, #f97316 45%, #fbbf24 100%)",
        scoreGlow: "0 0 42px rgba(249,115,22,0.32)",
        particleGradient: "radial-gradient(circle, rgba(250,204,21,1), rgba(249,115,22,0.26) 52%, transparent 70%)",
        particleDensity: 6,
    },
    4: {
        accent: "#facc15",
        badgeGradient: "linear-gradient(135deg, rgba(255,248,220,0.99), rgba(250,204,21,0.9) 52%, rgba(251,146,60,0.88) 100%)",
        badgeBorder: "rgba(250,204,21,0.66)",
        badgeShadow: "0 24px 52px rgba(250,204,21,0.28)",
        badgeGlow: "rgba(250,204,21,0.36)",
        auraGradient: "radial-gradient(circle at 50% 0%, rgba(250,204,21,0.26), transparent 52%)",
        beamGradient: "linear-gradient(90deg, transparent 0%, rgba(255,247,205,0.96) 12%, rgba(250,204,21,1) 50%, rgba(251,146,60,0.96) 88%, transparent 100%)",
        beamShadow: "0 0 56px rgba(250,204,21,0.58)",
        surfaceBorder: "rgba(250,204,21,0.38)",
        surfaceShadow: "0 40px 100px rgba(250,204,21,0.18), inset 0 1px 0 rgba(255,255,255,0.94)",
        checkGradient: "linear-gradient(135deg, #9a3412 0%, #f97316 24%, #f59e0b 48%, #facc15 78%, #fff7cc 100%)",
        checkBorder: "rgba(250,204,21,0.72)",
        checkShadow: "0 26px 48px rgba(250,204,21,0.34)",
        nextGradient: "linear-gradient(90deg, #c2410c 0%, #f97316 28%, #f59e0b 58%, #facc15 100%)",
        nextShadow: "0 28px 56px -14px rgba(250,204,21,0.4)",
        eloGradient: "linear-gradient(90deg, rgba(217,119,6,0.98), rgba(249,115,22,0.98) 35%, rgba(250,204,21,1) 72%, rgba(255,247,205,0.98) 100%)",
        eloBorder: "rgba(250,204,21,0.78)",
        eloShadow: "0 28px 56px rgba(250,204,21,0.34)",
        progressGradient: "linear-gradient(90deg, #d97706 0%, #f97316 34%, #facc15 78%, #fff7cc 100%)",
        scoreGlow: "0 0 56px rgba(250,204,21,0.34)",
        particleGradient: "radial-gradient(circle, rgba(255,247,205,1), rgba(250,204,21,0.28) 50%, transparent 70%)",
        particleDensity: 10,
    },
};

export function DrillCore({ context, initialMode = "translation", onClose }: DrillCoreProps) {
    // Mode State
    const [mode, setMode] = useState<DrillMode>(initialMode);

    // Drill State
    const [drillData, setDrillData] = useState<DrillData | null>(null);
    const [userTranslation, setUserTranslation] = useState("");
    const [isGeneratingDrill, setIsGeneratingDrill] = useState(false);
    const [isSubmittingDrill, setIsSubmittingDrill] = useState(false);
    const [drillFeedback, setDrillFeedback] = useState<DrillFeedback | null>(null);
    const [hasRatedDrill, setHasRatedDrill] = useState(false);
    const [analysisRequested, setAnalysisRequested] = useState(false);
    const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [analysisDetailsOpen, setAnalysisDetailsOpen] = useState(false);
    const [fullAnalysisRequested, setFullAnalysisRequested] = useState(false);
    const [isGeneratingFullAnalysis, setIsGeneratingFullAnalysis] = useState(false);
    const [fullAnalysisError, setFullAnalysisError] = useState<string | null>(null);
    const [fullAnalysisOpen, setFullAnalysisOpen] = useState(false);
    const [fullAnalysisData, setFullAnalysisData] = useState<DrillFeedback | null>(null);
    const [isGeneratingGrammar, setIsGeneratingGrammar] = useState(false);
    const [grammarError, setGrammarError] = useState<string | null>(null);
    const [referenceGrammarAnalysis, setReferenceGrammarAnalysis] = useState<GrammarSentenceAnalysis[] | null>(null);
    const [referenceGrammarDisplayMode, setReferenceGrammarDisplayMode] = useState<GrammarDisplayMode>("core");

    // Audio & Dictionary State
    const [isPlaying, setIsPlaying] = useState(false);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [isPrefetching, setIsPrefetching] = useState(false); // Track background audio prefetch
    const [prefetchedDrillData, setPrefetchedDrillData] = useState<(DrillData & { mode?: string }) | null>(null);
    const abortPrefetchRef = useRef<AbortController | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioCache = useRef<Map<string, { url?: string; blob?: Blob; marks?: any[] }>>(new Map());
    const [currentAudioTime, setCurrentAudioTime] = useState(0);

    // Active Word Card
    const [wordPopup, setWordPopup] = useState<PopupState | null>(null);

    // Whisper Integration
    const {
        isRecording: whisperRecording,
        isProcessing: whisperProcessing,
        result: whisperResult,
        audioLevel,
        setContext,
        startRecognition,
        stopRecognition,
        playRecording,
        resetResult,
        engineMode,
        setEngineMode
    } = useWhisper();

    // Ask Tutor State
    const [isTutorOpen, setIsTutorOpen] = useState(false);
    const [tutorQuery, setTutorQuery] = useState("");
    const [tutorAnswer, setTutorAnswer] = useState<string | null>(null);
    const [tutorThread, setTutorThread] = useState<TutorHistoryTurn[]>([]);
    const [tutorResponse, setTutorResponse] = useState<TutorStructuredResponse | null>(null);
    const [tutorPendingQuestion, setTutorPendingQuestion] = useState<string | null>(null);
    const [isAskingTutor, setIsAskingTutor] = useState(false);
    const [tutorRecentMastery, setTutorRecentMastery] = useState<string[]>([]);
    const tutorConversationRef = useRef<HTMLDivElement | null>(null);

    // Teaching Mode State
    const [teachingMode, setTeachingMode] = useState(false);
    const [teachingData, setTeachingData] = useState<any>(null);
    const [isLoadingTeaching, setIsLoadingTeaching] = useState(false);
    const [teachingPanelOpen, setTeachingPanelOpen] = useState(false); // Floating panel visibility

    // Guided Learning State
    const [learningSession, setLearningSession] = useState(false);
    const [guidedModeStatus, setGuidedModeStatus] = useState<GuidedModeStatus>("idle");
    const [guidedScript, setGuidedScript] = useState<GuidedScript | null>(null);
    const [guidedCurrentStepIndex, setGuidedCurrentStepIndex] = useState(0);
    const [guidedCurrentAttemptCount, setGuidedCurrentAttemptCount] = useState(0);
    const [guidedChoicesVisible, setGuidedChoicesVisible] = useState(false);
    const [guidedRevealReady, setGuidedRevealReady] = useState(false);
    const [guidedFilledFragments, setGuidedFilledFragments] = useState<Record<string, string>>({});
    const [guidedLastFeedback, setGuidedLastFeedback] = useState<string | null>(null);
    const [guidedInnerMode, setGuidedInnerMode] = useState<GuidedInnerMode>("teacher_guided");
    const [guidedClozeState, setGuidedClozeState] = useState<GuidedClozeState | null>(null);
    const [guidedInput, setGuidedInput] = useState("");
    const [guidedAiHint, setGuidedAiHint] = useState<GuidedAiHint | null>(null);
    const [isGuidedAiHintLoading, setIsGuidedAiHintLoading] = useState(false);
    const [prefetchedGuidedScript, setPrefetchedGuidedScript] = useState<GuidedScript | null>(null);
    const guidedCurrentStepIndexRef = useRef(0);
    const guidedFilledFragmentsRef = useRef<Record<string, string>>({});
    const guidedPrefetchAbortRef = useRef<AbortController | null>(null);
    const guidedPrefetchKeyRef = useRef<string | null>(null);
    const guidedPrefetchPromiseRef = useRef<Promise<GuidedScript> | null>(null);
    const prefetchedGuidedScriptRef = useRef<GuidedScript | null>(null);
    const guidedHintAbortRef = useRef<AbortController | null>(null);
    const guidedHintCacheRef = useRef<Map<string, GuidedAiHint>>(new Map());
    const guidedHintPromiseRef = useRef<Map<string, Promise<GuidedAiHint>>>(new Map());
    const guidedAiHintRequestCountRef = useRef(0);

    // UI State
    const [isBlindMode, setIsBlindMode] = useState(true);
    const [showChinese, setShowChinese] = useState(false);
    const [difficulty, setDifficulty] = useState<string>('Level 3');
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

    // Elo State
    const [eloRating, setEloRating] = useState(DEFAULT_BASE_ELO); // Translation Elo
    const [streakCount, setStreakCount] = useState(0);

    const [listeningElo, setListeningElo] = useState(DEFAULT_BASE_ELO);
    const [listeningStreak, setListeningStreak] = useState(0);
    const [isEloLoaded, setIsEloLoaded] = useState(false); // Track if Elo has been loaded from DB
    const eloRatingRef = useRef(DEFAULT_BASE_ELO);
    const listeningEloRef = useRef(DEFAULT_BASE_ELO);
    const coinsRef = useRef(DEFAULT_STARTING_COINS);
    const inventoryRef = useRef<InventoryState>({ ...DEFAULT_INVENTORY });

    // Hint Economy State
    const [coins, setCoins] = useState(DEFAULT_STARTING_COINS);
    const [inventory, setInventory] = useState<InventoryState>({ ...DEFAULT_INVENTORY });
    const [isHintShake, setIsHintShake] = useState(false);
    const [isHintLoading, setIsHintLoading] = useState(false);
    const [fullReferenceHint, setFullReferenceHint] = useState<{ version: number; text: string }>({ version: 0, text: '' });
    const [isVocabHintRevealed, setIsVocabHintRevealed] = useState(false);
    const [showShopModal, setShowShopModal] = useState(false);
    const [shopFocusedItem, setShopFocusedItem] = useState<ShopItemId | null>(null);
    const [isShopDockHovered, setIsShopDockHovered] = useState(false);
    const [shopDockHasHoverSupport, setShopDockHasHoverSupport] = useState(false);
    const [isTranslationAudioUnlocked, setIsTranslationAudioUnlocked] = useState(false);
    const [economyFxQueue, setEconomyFxQueue] = useState<EconomyFxEvent[]>([]);
    const [activeEconomyFx, setActiveEconomyFx] = useState<EconomyFxEvent | null>(null);
    const [activeEconomyVector, setActiveEconomyVector] = useState<{ target: EconomyTargetId; x: number; y: number } | null>(null);
    const [resourcePulseTarget, setResourcePulseTarget] = useState<EconomyTargetId | null>(null);
    const battleShellRef = useRef<HTMLDivElement | null>(null);
    const resourceTargetRefs = useRef<Record<EconomyTargetId, HTMLDivElement | null>>({
        coins: null,
        capsule: null,
        hint_ticket: null,
        vocab_ticket: null,
        audio_ticket: null,
        refresh_ticket: null,
    });
    const economyFxIdRef = useRef(0);

    // Cosmetic Theme State
    const [cosmeticTheme, setCosmeticTheme] = useState<CosmeticThemeId>('morning_coffee');
    const [ownedThemes, setOwnedThemes] = useState<CosmeticThemeId[]>([DEFAULT_FREE_THEME]);
    const activeCosmeticTheme = COSMETIC_THEMES[cosmeticTheme] || COSMETIC_THEMES[DEFAULT_FREE_THEME];
    const activeCosmeticUi = COSMETIC_THEME_UI[cosmeticTheme] || COSMETIC_THEME_UI.morning_coffee;
    const isShopInventoryExpanded = shouldExpandShopInventoryDock({
        hasHoverSupport: shopDockHasHoverSupport,
        isShopHovered: isShopDockHovered,
    });

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

        const hoverMediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
        const syncHoverSupport = () => {
            setShopDockHasHoverSupport(hoverMediaQuery.matches);
            if (!hoverMediaQuery.matches) {
                setIsShopDockHovered(false);
            }
        };

        syncHoverSupport();
        hoverMediaQuery.addEventListener("change", syncHoverSupport);

        return () => {
            hoverMediaQuery.removeEventListener("change", syncHoverSupport);
        };
    }, []);

    const getGuidedSessionSnapshot = useCallback((): GuidedSessionState => ({
        status: guidedModeStatus,
        currentStepIndex: guidedCurrentStepIndex,
        currentAttemptCount: guidedCurrentAttemptCount,
        guidedChoicesVisible,
        revealReady: guidedRevealReady,
        filledFragments: guidedFilledFragments,
        lastFeedback: guidedLastFeedback,
    }), [
        guidedChoicesVisible,
        guidedCurrentAttemptCount,
        guidedCurrentStepIndex,
        guidedFilledFragments,
        guidedLastFeedback,
        guidedRevealReady,
        guidedModeStatus,
    ]);

    const applyGuidedSessionSnapshot = useCallback((nextState: GuidedSessionState) => {
        setGuidedModeStatus(nextState.status);
        setGuidedCurrentStepIndex(nextState.currentStepIndex);
        guidedCurrentStepIndexRef.current = nextState.currentStepIndex;
        setGuidedCurrentAttemptCount(nextState.currentAttemptCount);
        setGuidedChoicesVisible(nextState.guidedChoicesVisible);
        setGuidedRevealReady(nextState.revealReady);
        setGuidedFilledFragments(nextState.filledFragments);
        guidedFilledFragmentsRef.current = nextState.filledFragments;
        setGuidedLastFeedback(nextState.lastFeedback);
    }, []);

    const resetGuidedLearningState = useCallback((keepLearningSession = false) => {
        if (!keepLearningSession) {
            setLearningSession(false);
        }
        guidedHintAbortRef.current?.abort();
        setGuidedModeStatus("idle");
        setGuidedScript(null);
        setGuidedCurrentStepIndex(0);
        guidedCurrentStepIndexRef.current = 0;
        setGuidedCurrentAttemptCount(0);
        setGuidedChoicesVisible(false);
        setGuidedRevealReady(false);
        setGuidedFilledFragments({});
        guidedFilledFragmentsRef.current = {};
        setGuidedLastFeedback(null);
        setGuidedInnerMode("teacher_guided");
        setGuidedClozeState(null);
        setGuidedInput("");
        setGuidedAiHint(null);
        setIsGuidedAiHintLoading(false);
        guidedAiHintRequestCountRef.current = 0;
    }, []);

    const fetchGuidedScriptForDrill = useCallback(async (
        targetDrillData: Pick<DrillData, "chinese" | "reference_english" | "_topicMeta">,
        signal?: AbortSignal,
    ) => {
        const response = await fetch("/api/ai/guided_script", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chinese: targetDrillData.chinese,
                reference_english: targetDrillData.reference_english,
                elo: eloRatingRef.current || DEFAULT_BASE_ELO,
                topic: targetDrillData._topicMeta?.topic || context.articleTitle || context.topic,
            }),
            signal,
        });
        const data = await response.json();

        if (!response.ok || data?.error) {
            throw new Error(data?.error || "Failed to load guided script");
        }

        return data as GuidedScript;
    }, [context.articleTitle, context.topic]);

    const fetchGuidedHint = useCallback(async ({
        slot,
        attempt,
        innerMode: targetInnerMode,
        leftContext,
        rightContext,
        localHint,
        manualRequest,
        requestCount,
        signal,
    }: {
        slot: GuidedScript["slots"][number];
        attempt: number;
        innerMode: GuidedInnerMode;
        leftContext: string;
        rightContext: string;
        localHint?: string;
        manualRequest?: boolean;
        requestCount?: number;
        signal?: AbortSignal;
    }) => {
        if (!drillData) {
            throw new Error("Missing drill data for guided hint");
        }

        const response = await fetch("/api/ai/guided_hint", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chinese: drillData.chinese,
                reference_english: drillData.reference_english,
                answer_text: slot.answer_text,
                hint_focus_cn: slot.hint_focus_cn || "",
                left_context: leftContext,
                right_context: rightContext,
                attempt,
                slot_kind: slot.slot_kind,
                inner_mode: targetInnerMode,
                has_multiple_choice: Boolean(slot.multiple_choice?.length),
                local_hint: localHint,
                manual_request: Boolean(manualRequest),
                request_count: requestCount ?? 0,
            }),
            signal,
        });

        const data = await response.json();
        if (!response.ok || data?.error || !data?.primary) {
            throw new Error(data?.error || "Failed to load guided hint");
        }

        return data as GuidedAiHint;
    }, [drillData]);

    const loadGuidedHint = useCallback(async ({
        guidedKey,
        slot,
        attempt,
        innerMode: targetInnerMode,
        leftContext,
        rightContext,
        localHint,
        manualRequest,
        requestCount,
        signal,
    }: {
        guidedKey: string;
        slot: GuidedScript["slots"][number];
        attempt: number;
        innerMode: GuidedInnerMode;
        leftContext: string;
        rightContext: string;
        localHint?: string;
        manualRequest?: boolean;
        requestCount?: number;
        signal?: AbortSignal;
    }) => {
        const hintKey = buildGuidedHintCacheKey({
            guidedKey,
            slotId: manualRequest ? `${slot.id}:manual` : slot.id,
            innerMode: targetInnerMode,
            attempt,
            requestCount: requestCount ?? 0,
            leftContext: `${leftContext}|${localHint || ""}`,
            rightContext,
        });

        const cached = guidedHintCacheRef.current.get(hintKey);
        if (cached) {
            return cached;
        }

        const pending = guidedHintPromiseRef.current.get(hintKey);
        if (pending) {
            return pending;
        }

        const requestPromise = fetchGuidedHintWithRetry(
            () => fetchGuidedHint({
                slot,
                attempt,
                innerMode: targetInnerMode,
                leftContext,
                rightContext,
                localHint,
                manualRequest,
                requestCount,
                signal,
            }),
            3,
        ).then((hint) => {
            guidedHintCacheRef.current.set(hintKey, hint);
            return hint;
        }).finally(() => {
            guidedHintPromiseRef.current.delete(hintKey);
        });

        guidedHintPromiseRef.current.set(hintKey, requestPromise);
        return requestPromise;
    }, [fetchGuidedHint]);

    useEffect(() => {
        guidedHintAbortRef.current?.abort();
        setGuidedAiHint(null);
        setIsGuidedAiHintLoading(false);
        guidedAiHintRequestCountRef.current = 0;
    }, [guidedCurrentStepIndex, guidedInnerMode, guidedClozeState?.currentBlankIndex, guidedScript?.summary.final_sentence]);

    const isGuidedOverlayOpen = guidedModeStatus !== "idle";
    const learningSessionActive = learningSession;

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (guidedModeStatus !== "active" || guidedInnerMode !== "teacher_guided" || !guidedScript || guidedChoicesVisible || guidedRevealReady) return;

        const currentSlot = guidedScript.slots[guidedCurrentStepIndex];
        if (!currentSlot?.multiple_choice?.length) return;

        const timer = window.setTimeout(() => {
            if (!shouldAutoOpenGuidedChoices(12000)) return;
            setGuidedChoicesVisible(true);
            setGuidedRevealReady(true);
            setGuidedLastFeedback(currentSlot.idle_rescue_hint_cn ?? currentSlot.rescue_reason_cn ?? "卡住了就先用选项排除。");
        }, 12000);

        return () => {
            window.clearTimeout(timer);
        };
    }, [
        guidedChoicesVisible,
        guidedCurrentStepIndex,
        guidedInnerMode,
        guidedInput,
        guidedModeStatus,
        guidedRevealReady,
        guidedScript,
    ]);

    const persistProfilePatch = useCallback((patch: Partial<{ coins: number; hints: number; inventory: InventoryState; owned_themes: string[]; active_theme: string }>) => {
        if (Object.keys(patch).length === 0) return;
        saveProfilePatch({
            coins: patch.coins,
            inventory: patch.inventory,
            owned_themes: patch.owned_themes,
            active_theme: patch.active_theme,
        }).catch((error) => {
            console.error("Failed to sync profile patch", error);
        });
    }, []);

    const getItemCount = useCallback((itemId: ShopItemId) => {
        return inventoryRef.current[itemId] ?? 0;
    }, []);

    const applyEconomyPatch = useCallback(({
        coinsDelta = 0,
        itemDelta = {},
    }: {
        coinsDelta?: number;
        itemDelta?: Partial<Record<ShopItemId, number>>;
    }) => {
        const nextCoins = Math.max(0, coinsRef.current + coinsDelta);
        const nextInventory: InventoryState = { ...inventoryRef.current };

        (Object.keys(itemDelta) as ShopItemId[]).forEach((itemId) => {
            const delta = itemDelta[itemId] ?? 0;
            if (!delta) return;
            nextInventory[itemId] = Math.max(0, nextInventory[itemId] + delta);
        });

        coinsRef.current = nextCoins;
        inventoryRef.current = nextInventory;
        setCoins(nextCoins);
        setInventory(nextInventory);

        persistProfilePatch({
            coins: nextCoins,
            inventory: nextInventory,
            hints: nextInventory.capsule, // compatibility mirror
        });

        return {
            coins: nextCoins,
            inventory: nextInventory,
        };
    }, [persistProfilePatch]);

    const pushEconomyFx = useCallback((event: Omit<EconomyFxEvent, 'id'>) => {
        const nextEvent: EconomyFxEvent = {
            ...event,
            id: economyFxIdRef.current++,
        };
        setEconomyFxQueue(prev => [...prev, nextEvent]);
    }, []);

    const resolveEconomyTarget = useCallback((event: EconomyFxEvent): EconomyTargetId | null => {
        if (event.kind === 'coin_gain') return 'coins';
        return event.itemId ?? null;
    }, []);

    const computeEconomyVector = useCallback((targetId: EconomyTargetId | null) => {
        if (!targetId) return null;

        const shellRect = battleShellRef.current?.getBoundingClientRect();
        const targetRect = resourceTargetRefs.current[targetId]?.getBoundingClientRect();

        if (!shellRect || !targetRect) return null;

        return {
            target: targetId,
            x: targetRect.left + targetRect.width / 2 - shellRect.left - shellRect.width / 2,
            y: targetRect.top + targetRect.height / 2 - shellRect.top - ECONOMY_OVERLAY_ORIGIN_TOP,
        };
    }, []);

    const getEconomyPulseClass = useCallback((targetId: EconomyTargetId) => {
        if (resourcePulseTarget !== targetId) return "";

        switch (targetId) {
            case 'coins':
                return "scale-[1.08] bg-amber-50/95 shadow-[0_0_24px_rgba(245,158,11,0.28)] ring-1 ring-amber-200/80";
            case 'capsule':
                return "scale-[1.08] bg-sky-50/95 shadow-[0_0_24px_rgba(59,130,246,0.2)] ring-1 ring-sky-200/80";
            case 'hint_ticket':
                return "scale-[1.08] bg-amber-50/95 shadow-[0_0_24px_rgba(251,191,36,0.24)] ring-1 ring-amber-200/80";
            case 'vocab_ticket':
                return "scale-[1.08] bg-emerald-50/95 shadow-[0_0_24px_rgba(16,185,129,0.22)] ring-1 ring-emerald-200/80";
            case 'audio_ticket':
                return "scale-[1.08] bg-indigo-50/95 shadow-[0_0_24px_rgba(99,102,241,0.24)] ring-1 ring-indigo-200/80";
            case 'refresh_ticket':
                return "scale-[1.08] bg-cyan-50/95 shadow-[0_0_24px_rgba(6,182,212,0.22)] ring-1 ring-cyan-200/80";
            default:
                return "";
        }
    }, [resourcePulseTarget]);

    const getEconomyVisual = useCallback((event: EconomyFxEvent) => {
        if (event.kind === 'coin_gain') {
            return {
                icon: <Gem className="h-4 w-4" />,
                shellClass: "border-amber-300/90 bg-[linear-gradient(135deg,rgba(255,248,220,0.99),rgba(254,240,138,0.98)_48%,rgba(251,191,36,0.94)_100%)] text-amber-950 shadow-[0_24px_56px_rgba(245,158,11,0.28)] ring-1 ring-amber-200/80",
                iconClass: "border-amber-200/80 bg-white/95 text-amber-500 shadow-[0_12px_28px_rgba(245,158,11,0.22)]",
                chipClass: "border-amber-200/80 bg-white/75 text-amber-700",
                flightClass: "border-amber-300/85 bg-gradient-to-br from-yellow-100 via-amber-100 to-orange-100 text-amber-600 shadow-[0_12px_26px_rgba(245,158,11,0.24)]",
                shimmerClass: "from-transparent via-white/75 to-transparent",
                accentClass: "bg-[radial-gradient(circle,rgba(251,191,36,0.48)_0%,rgba(251,191,36,0.12)_55%,transparent_75%)]",
                pulseClass: "bg-[radial-gradient(circle,rgba(251,191,36,0.75)_0%,rgba(251,191,36,0.16)_56%,transparent_78%)]",
            };
        }

        switch (event.itemId) {
            case 'capsule':
                return {
                    icon: <span className="text-[15px] leading-none">💊</span>,
                    shellClass: "border-sky-300/90 bg-[linear-gradient(135deg,rgba(239,246,255,0.99),rgba(186,230,253,0.98)_44%,rgba(251,191,36,0.2)_100%)] text-slate-950 shadow-[0_22px_54px_rgba(59,130,246,0.24)] ring-1 ring-sky-200/80",
                    iconClass: "border-sky-200/80 bg-white/95 text-sky-500 shadow-[0_12px_28px_rgba(59,130,246,0.18)]",
                    chipClass: "border-sky-200/80 bg-white/85 text-sky-700",
                    flightClass: "border-sky-300/85 bg-gradient-to-br from-sky-100 via-blue-100 to-amber-50 text-sky-600 shadow-[0_12px_28px_rgba(59,130,246,0.22)]",
                    shimmerClass: "from-transparent via-sky-100/70 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(96,165,250,0.42)_0%,rgba(96,165,250,0.14)_54%,transparent_74%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(59,130,246,0.72)_0%,rgba(59,130,246,0.16)_56%,transparent_78%)]",
                };
            case 'hint_ticket':
                return {
                    icon: <Wand2 className="h-4 w-4" />,
                    shellClass: "border-yellow-300/90 bg-[linear-gradient(135deg,rgba(255,251,235,0.99),rgba(254,240,138,0.94)_44%,rgba(255,255,255,0.98)_100%)] text-stone-950 shadow-[0_24px_58px_rgba(245,158,11,0.24)] ring-1 ring-yellow-200/80",
                    iconClass: "border-amber-200/80 bg-white/95 text-amber-500 shadow-[0_12px_28px_rgba(245,158,11,0.18)]",
                    chipClass: "border-amber-200/85 bg-white/88 text-amber-700",
                    flightClass: "border-yellow-300/80 bg-gradient-to-br from-amber-50 via-yellow-50 to-white text-amber-500 shadow-[0_12px_28px_rgba(245,158,11,0.2)]",
                    shimmerClass: "from-transparent via-amber-100/80 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(251,191,36,0.42)_0%,rgba(251,191,36,0.14)_54%,transparent_76%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(251,191,36,0.75)_0%,rgba(251,191,36,0.16)_56%,transparent_78%)]",
                };
            case 'vocab_ticket':
                return {
                    icon: <span className="text-[15px] leading-none">🧩</span>,
                    shellClass: "border-emerald-300/90 bg-[linear-gradient(135deg,rgba(236,253,245,0.99),rgba(167,243,208,0.96)_48%,rgba(255,255,255,0.98)_100%)] text-emerald-950 shadow-[0_22px_54px_rgba(16,185,129,0.22)] ring-1 ring-emerald-200/80",
                    iconClass: "border-emerald-200/80 bg-white/95 text-emerald-500 shadow-[0_12px_26px_rgba(16,185,129,0.18)]",
                    chipClass: "border-emerald-200/85 bg-white/88 text-emerald-700",
                    flightClass: "border-emerald-300/85 bg-gradient-to-br from-emerald-50 via-green-50 to-white text-emerald-600 shadow-[0_12px_28px_rgba(16,185,129,0.2)]",
                    shimmerClass: "from-transparent via-emerald-100/80 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(52,211,153,0.42)_0%,rgba(52,211,153,0.14)_54%,transparent_76%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(16,185,129,0.7)_0%,rgba(16,185,129,0.16)_56%,transparent_78%)]",
                };
            case 'audio_ticket':
                return {
                    icon: <Volume2 className="h-4 w-4" />,
                    shellClass: "border-indigo-300/90 bg-[linear-gradient(135deg,rgba(238,242,255,0.99),rgba(199,210,254,0.97)_48%,rgba(255,255,255,0.98)_100%)] text-indigo-950 shadow-[0_24px_56px_rgba(99,102,241,0.24)] ring-1 ring-indigo-200/80",
                    iconClass: "border-indigo-200/80 bg-white/95 text-indigo-500 shadow-[0_12px_28px_rgba(99,102,241,0.2)]",
                    chipClass: "border-indigo-200/85 bg-white/88 text-indigo-700",
                    flightClass: "border-indigo-300/85 bg-gradient-to-br from-indigo-50 via-violet-50 to-white text-indigo-600 shadow-[0_12px_28px_rgba(99,102,241,0.22)]",
                    shimmerClass: "from-transparent via-indigo-100/75 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(129,140,248,0.38)_0%,rgba(129,140,248,0.12)_56%,transparent_76%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(99,102,241,0.72)_0%,rgba(99,102,241,0.16)_56%,transparent_78%)]",
                };
            case 'refresh_ticket':
                return {
                    icon: <RefreshCw className="h-4 w-4" />,
                    shellClass: "border-cyan-300/90 bg-[linear-gradient(135deg,rgba(236,254,255,0.99),rgba(165,243,252,0.96)_48%,rgba(255,255,255,0.98)_100%)] text-cyan-950 shadow-[0_24px_56px_rgba(6,182,212,0.22)] ring-1 ring-cyan-200/80",
                    iconClass: "border-cyan-200/80 bg-white/95 text-cyan-600 shadow-[0_12px_28px_rgba(6,182,212,0.18)]",
                    chipClass: "border-cyan-200/85 bg-white/88 text-cyan-700",
                    flightClass: "border-cyan-300/85 bg-gradient-to-br from-cyan-50 via-sky-50 to-white text-cyan-600 shadow-[0_12px_28px_rgba(6,182,212,0.2)]",
                    shimmerClass: "from-transparent via-cyan-100/80 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(34,211,238,0.4)_0%,rgba(34,211,238,0.13)_56%,transparent_76%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(6,182,212,0.72)_0%,rgba(6,182,212,0.16)_56%,transparent_78%)]",
                };
            default:
                return {
                    icon: <Sparkles className="h-4 w-4" />,
                    shellClass: "border-stone-200/80 bg-white/95 text-stone-900 shadow-[0_18px_42px_rgba(15,23,42,0.12)]",
                    iconClass: "border-stone-200/70 bg-white/90 text-stone-600 shadow-[0_10px_24px_rgba(15,23,42,0.08)]",
                    chipClass: "border-stone-200/80 bg-white/75 text-stone-700",
                    flightClass: "border-stone-200/80 bg-white text-stone-600 shadow-[0_8px_20px_rgba(15,23,42,0.12)]",
                    shimmerClass: "from-transparent via-white/75 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(148,163,184,0.22)_0%,rgba(148,163,184,0.08)_54%,transparent_74%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(148,163,184,0.52)_0%,rgba(148,163,184,0.14)_56%,transparent_78%)]",
                };
        }
    }, []);

    useEffect(() => {
        if (activeEconomyFx || economyFxQueue.length === 0) return;

        setActiveEconomyFx(economyFxQueue[0]);
        setEconomyFxQueue(prev => prev.slice(1));
    }, [activeEconomyFx, economyFxQueue]);

    useEffect(() => {
        if (!activeEconomyFx) {
            setActiveEconomyVector(null);
            return;
        }

        const targetId = resolveEconomyTarget(activeEconomyFx);
        const rafId = requestAnimationFrame(() => {
            setActiveEconomyVector(computeEconomyVector(targetId));
        });

        const pulseDelay = activeEconomyFx.kind === 'coin_gain' ? 1480 : activeEconomyFx.kind === 'item_purchase' ? 1180 : 1260;
        const clearDelay = activeEconomyFx.kind === 'coin_gain' ? 2760 : activeEconomyFx.kind === 'item_purchase' ? 2080 : 2180;
        const pulseTimeout = targetId
            ? setTimeout(() => setResourcePulseTarget(targetId), pulseDelay)
            : null;
        const clearTimeoutId = setTimeout(() => {
            setActiveEconomyFx(null);
            setActiveEconomyVector(null);
        }, clearDelay);

        return () => {
            cancelAnimationFrame(rafId);
            if (pulseTimeout) clearTimeout(pulseTimeout);
            clearTimeout(clearTimeoutId);
        };
    }, [activeEconomyFx, computeEconomyVector, resolveEconomyTarget]);

    useEffect(() => {
        if (!resourcePulseTarget) return;

        const timeoutId = setTimeout(() => setResourcePulseTarget(null), 420);
        return () => clearTimeout(timeoutId);
    }, [resourcePulseTarget]);



    // Gamification State (Fever / Themes)
    const [comboCount, setComboCount] = useState(0);
    const [feverMode, setFeverMode] = useState(false);
    // Gamification State (Fever / Themes)
    // Removed duplicate state declarations
    const [theme, setTheme] = useState<'default' | 'fever' | 'boss' | 'crimson'>('default');
    const [bossState, setBossState] = useState<{
        active: boolean;
        introAck: boolean;
        type: 'blind' | 'lightning' | 'echo' | 'reaper' | 'roulette' | 'roulette_execution';
        hp?: number;
        maxHp?: number;
        playerHp?: number; // New: Symmetric Duel
        playerMaxHp?: number;
    }>({ active: false, introAck: false, type: 'blind' });
    const [deathAnim, setDeathAnim] = useState<'slash' | 'glitch' | 'shatter' | null>(null);
    const [lootDrop, setLootDrop] = useState<LootDrop | null>(null);
    const [gambleState, setGambleState] = useState<{
        active: boolean;
        introAck: boolean;
        wager: 'safe' | 'risky' | 'madness' | null;
        doubleDownCount: number;
    }>({ active: false, introAck: false, wager: null, doubleDownCount: 0 });

    // Roulette State
    const [showRoulette, setShowRoulette] = useState(false);
    const [rouletteSession, setRouletteSession] = useState<{
        active: boolean;
        result: 'safe' | 'dead';
        multiplier: number;
        bullets: number;
    } | null>(null);

    // Server Status Check
    const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'checking'>('checking');
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const isLocalDesktopHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const shouldProbeLocalWhisper =
            isLocalDesktopHost
            || window.localStorage.getItem('probe_local_whisper') === '1';

        if (!shouldProbeLocalWhisper) {
            setServerStatus('offline');
            return;
        }

        let isCancelled = false;

        const checkServer = async () => {
            try {
                const res = await fetch('/api/ai/transcribe', { cache: 'no-store' });
                if (!isCancelled) {
                    const data = await res.json().catch(() => ({ ready: false }));
                    setServerStatus(res.ok && data.ready ? 'online' : 'offline');
                }
            } catch {
                if (!isCancelled) {
                    setServerStatus('offline');
                }
            }
        };

        checkServer();
        const interval = window.setInterval(checkServer, 30000);

        return () => {
            isCancelled = true;
            window.clearInterval(interval);
        };
    }, []);

    // Visceral FX State
    const [shake, setShake] = useState(false);
    const [showDoubleDown, setShowDoubleDown] = useState(false); // Modal State
    const [recentScores, setRecentScores] = useState<number[]>([]); // Track recent scores for bounties

    // Gacha State
    const [showGacha, setShowGacha] = useState(false);
    const [gachaCards, setGachaCards] = useState<GachaCard[]>([]);
    const [selectedGachaCardId, setSelectedGachaCardId] = useState<string | null>(null);
    const [gachaClaimTarget, setGachaClaimTarget] = useState<{ x: number; y: number; target: EconomyTargetId; } | null>(null);

    const hasStartedRef = useRef(false);
    const hasPlayedEchoRef = useRef(false); // For Echo Beast (One-time audio)
    const vocabHintRevealRef = useRef(false);
    const translationAudioUnlockRef = useRef(false);

    // Track if Lightning mode audio has been played (for delayed countdown)
    const [lightningStarted, setLightningStarted] = useState(false);

    // Boss Fuse Timer
    const [fuseTime, setFuseTime] = useState(100); // Boss Fuse (100%)
    const abortControllerRef = useRef<AbortController | null>(null); // For cancelling pending API requests
    const [rankUp, setRankUp] = useState<{ oldRank: ReturnType<typeof getRank>; newRank: ReturnType<typeof getRank>; } | null>(null); // Rank promotion celebration
    const [rankDown, setRankDown] = useState<{ oldRank: ReturnType<typeof getRank>; newRank: ReturnType<typeof getRank>; } | null>(null); // Rank demotion punishment

    // Theme-based Ambient Audio
    // Theme-based Ambient Audio (Legacy Removed -> Handled by modern BGM Manager at line 523)

    // Boss Fuse Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        // Lightning countdown only starts AFTER audio is played
        const isLightning = theme === 'boss' && bossState.active && bossState.type === 'lightning' && bossState.introAck && lightningStarted;
        const isGamble = theme === 'crimson' && gambleState.active && gambleState.introAck;

        if ((isLightning || isGamble) && !isSubmittingDrill) {
            interval = setInterval(() => {
                // Timer Duration based on Mode
                // Lightning: 30s (300 ticks)
                // Gamble: 45s (450 ticks) for high pressure
                const durationTicks = isLightning ? 300 : 450;
                const decrement = 100 / durationTicks;

                setFuseTime(prev => {
                    if (prev <= 0) {
                        clearInterval(interval);
                        // Trigger Defeat / Time Up
                        new Audio('https://commondatastorage.googleapis.com/codeskulptor-assets/sounddogs/explosion.mp3').play().catch(() => { });
                        if (navigator.vibrate) navigator.vibrate(500);
                        setShake(true);

                        // Calculate Penalty
                        const penalty = isGamble ? (gambleState.wager === 'risky' ? 20 : 50) : 20;


                        // Reset States (Delayed for Animation)
                        setDeathAnim(isGamble ? 'shatter' : 'glitch');

                        // Apply Penalty to the active mode pool (avoid cross-mode Elo pollution)
                        const isListeningMode = mode === 'listening';

                        const activeElo = isListeningMode ? listeningEloRef.current : eloRatingRef.current;
                        const newElo = Math.max(0, activeElo - penalty);

                        if (isListeningMode) {
                            setListeningElo(newElo);
                            setListeningStreak(0);
                        } else {
                            setEloRating(newElo);
                            setStreakCount(0);
                        }

                        loadLocalProfile().then((profile) => {
                            if (!profile) return;
                            const maxElo = isListeningMode
                                ? Math.max(profile.listening_max_elo || DEFAULT_BASE_ELO, newElo)
                                : Math.max(profile.max_elo, newElo);

                            return settleBattle({
                                mode: isListeningMode ? 'listening' : 'translation',
                                eloAfter: newElo,
                                change: -penalty,
                                streak: 0,
                                maxElo,
                                coins: profile.coins ?? DEFAULT_STARTING_COINS,
                                source: 'timeout_penalty',
                            });
                        }).catch((error) => {
                            console.error("Failed to sync timeout penalty", error);
                        });

                        // Show Notification
                        setLootDrop({
                            type: 'exp',
                            amount: -penalty,
                            rarity: 'common',
                            message: 'TIME UP! DEFEAT'
                        });

                        // Actual State Reset after Animation
                        setTimeout(() => {
                            setTheme('default');
                            setBossState(prev => ({ ...prev, active: false }));
                            setGambleState(prev => ({ ...prev, active: false, introAck: false, wager: null, doubleDownCount: 0 }));
                            if (mode === 'listening') {
                                setListeningStreak(0);
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
            setFuseTime(100); // Reset if not in a timed mode
        }
        return () => clearInterval(interval);
    }, [theme, mode, isSubmittingDrill, bossState.introAck, gambleState.introAck, bossState.active, bossState.type, gambleState.active, gambleState.wager, lightningStarted]);

    // Shake Trigger
    useEffect(() => {
        if (shake) {
            console.log('[Shake] Triggered! shake =', shake);
            const timeout = setTimeout(() => setShake(false), 500);
            return () => clearTimeout(timeout);
        }
    }, [shake]);


    // Auto-dismiss Loot Drop
    useEffect(() => {
        if (lootDrop) {
            const timer = setTimeout(() => {
                setLootDrop(null);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [lootDrop]);

    useEffect(() => {
        eloRatingRef.current = eloRating;
        listeningEloRef.current = listeningElo;
    }, [eloRating, listeningElo]);

    useEffect(() => {
        coinsRef.current = coins;
        inventoryRef.current = inventory;
    }, [coins, inventory]);

    useEffect(() => {
        vocabHintRevealRef.current = isVocabHintRevealed;
    }, [isVocabHintRevealed]);

    useEffect(() => {
        translationAudioUnlockRef.current = isTranslationAudioUnlocked;
    }, [isTranslationAudioUnlocked]);

    // Cleanup: Stop ALL audio and abort requests when component unmounts
    useEffect(() => {
        return () => {
            // Stop TTS audio
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
            // Stop ambient audio (Legacy removed)
            // Abort any pending API requests
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            console.log('[DrillCore] Cleanup: All audio stopped, requests aborted');
        };
    }, []);


    // Computed Elo based on Mode
    const currentElo = mode === 'listening' ? listeningElo : eloRating;
    const currentStreak = mode === 'listening' ? listeningStreak : streakCount;
    const capsuleCount = inventory.capsule;
    const hintTicketCount = inventory.hint_ticket;
    const vocabTicketCount = inventory.vocab_ticket;
    const audioTicketCount = inventory.audio_ticket;
    const refreshTicketCount = inventory.refresh_ticket;
    const prefersReducedMotion = useReducedMotion();
    const [streakTransition, setStreakTransition] = useState<'surge' | 'cooldown' | null>(null);
    const [cooldownTier, setCooldownTier] = useState<StreakTier>(0);
    const [cooldownStreak, setCooldownStreak] = useState(0);
    const prevStreakRef = useRef(currentStreak);
    const prevStreakModeRef = useRef(mode);
    const streakTier = getStreakTier(currentStreak);
    const activeStreakTier = streakTransition === 'cooldown' && cooldownTier > streakTier ? cooldownTier : streakTier;
    const streakVisual = STREAK_TIER_VISUALS[activeStreakTier];
    const canUseStreakAura = activeStreakTier > 0 && (theme === 'default' || theme === 'fever');
    const canShowStreakParticles = canUseStreakAura && activeStreakTier >= 3 && !prefersReducedMotion;
    const activeParticleCount = Math.min(streakVisual.particleDensity, STREAK_PARTICLE_POSITIONS.length);
    const activeEconomyVisual = activeEconomyFx ? getEconomyVisual(activeEconomyFx) : null;
    const activeCoinTier = activeEconomyFx?.kind === 'coin_gain'
        ? ((activeEconomyFx.amount ?? 0) >= 31 ? 'large' : (activeEconomyFx.amount ?? 0) >= 11 ? 'medium' : 'small')
        : null;
    const activeCoinRainCount = activeCoinTier === 'large' ? 14 : activeCoinTier === 'medium' ? 11 : 8;
    const activeCoinAbsorbCount = activeCoinTier === 'large' ? 5 : activeCoinTier === 'medium' ? 4 : 3;
    const isShopEconomyFx = activeEconomyFx?.kind === 'item_purchase' && activeEconomyFx.source === 'shop' && showShopModal;
    const isGachaEconomyFx = activeEconomyFx?.source === 'gacha';
    const activeEconomyChipLabel = activeEconomyFx?.kind === 'coin_gain'
        ? `+${activeEconomyFx.amount ?? 0}`
        : activeEconomyFx?.itemId
            ? (isGachaEconomyFx ? 'Lucky Draw' : ITEM_CATALOG[activeEconomyFx.itemId].name)
            : '提示';
    const translationKeywords = mode === 'translation' && drillData
        ? ((drillData.target_english_vocab || drillData.key_vocab || []) as string[])
        : [];
    const hasTranslationKeywords = translationKeywords.length > 0;
    const renderEconomyAccent = () => {
        if (!activeEconomyFx || !activeEconomyVisual) return null;

        if (activeEconomyFx.kind === 'coin_gain') {
            return (
                <div className="absolute inset-x-10 top-1/2 -translate-y-1/2 pointer-events-none">
                    <motion.div
                        className={cn("absolute left-0 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full blur-xl", activeEconomyVisual.accentClass)}
                        animate={{ scale: [0.92, 1.18, 0.98], opacity: [0.42, 0.82, 0.3] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className={cn("absolute right-4 top-1/2 h-12 w-20 -translate-y-1/2 rounded-full blur-xl", activeEconomyVisual.accentClass)}
                        animate={{ scale: [0.88, 1.12, 0.94], opacity: [0.32, 0.68, 0.28] }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: 0.12 }}
                    />
                </div>
            );
        }

        if (activeEconomyFx.itemId === 'capsule') {
            return (
                <motion.div
                    className="absolute left-8 top-1/2 h-2 w-24 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-sky-300/65 to-transparent"
                    animate={{ x: [-10, 18, -4], opacity: [0, 1, 0] }}
                    transition={{ duration: 1.05, repeat: Infinity, ease: "easeInOut" }}
                />
            );
        }

        if (activeEconomyFx.itemId === 'hint_ticket') {
            return (
                <div className="absolute inset-y-0 right-8 flex items-center gap-1 pointer-events-none">
                    {[0, 1, 2].map((index) => (
                        <motion.div
                            key={`hint-spark-${index}`}
                            className="flex h-4 w-4 items-center justify-center rounded-full bg-white/70 text-amber-400 shadow-[0_6px_16px_rgba(251,191,36,0.22)]"
                            animate={{ y: [0, -5, 0], scale: [0.92, 1.08, 0.94], opacity: [0.4, 1, 0.5] }}
                            transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.1, ease: "easeInOut" }}
                        >
                            <Sparkles className="h-2.5 w-2.5" />
                        </motion.div>
                    ))}
                </div>
            );
        }

        if (activeEconomyFx.itemId === 'vocab_ticket') {
            return (
                <div className="absolute inset-y-0 right-7 flex items-center gap-1.5 pointer-events-none">
                    {['词', '块', '提示'].map((label, index) => (
                        <motion.div
                            key={`vocab-chip-${label}`}
                            className="rounded-full border border-emerald-200/70 bg-white/80 px-2 py-0.5 text-[9px] font-black tracking-[0.18em] text-emerald-700 shadow-[0_6px_16px_rgba(16,185,129,0.12)]"
                            animate={{ y: [2, -3, 2], rotate: [0, index === 1 ? -4 : 4, 0], opacity: [0.55, 1, 0.72] }}
                            transition={{ duration: 1.1, repeat: Infinity, delay: index * 0.08, ease: "easeInOut" }}
                        >
                            {label}
                        </motion.div>
                    ))}
                </div>
            );
        }

        if (activeEconomyFx.itemId === 'audio_ticket') {
            return (
                <div className="absolute inset-y-0 right-8 flex items-center gap-1 pointer-events-none">
                    {[10, 16, 12].map((height, index) => (
                        <motion.div
                            key={`audio-wave-${height}-${index}`}
                            className="w-1.5 rounded-full bg-indigo-400/75"
                            style={{ height }}
                            animate={{ scaleY: [0.72, 1.18, 0.8], opacity: [0.45, 0.95, 0.52] }}
                            transition={{ duration: 0.72, repeat: Infinity, delay: index * 0.08, ease: "easeInOut" }}
                        />
                    ))}
                </div>
            );
        }

        if (activeEconomyFx.itemId === 'refresh_ticket') {
            return (
                <div className="absolute inset-y-0 right-8 flex items-center gap-1.5 pointer-events-none">
                    {[0, 1].map((index) => (
                        <motion.div
                            key={`refresh-ring-${index}`}
                            className="h-6 w-6 rounded-full border border-cyan-300/60"
                            animate={{ scale: [0.7, 1.2, 1.34], opacity: [0.5, 0.24, 0] }}
                            transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.18, ease: "easeOut" }}
                        />
                    ))}
                    <motion.div
                        className="absolute inset-y-0 right-1 flex items-center"
                        animate={{ rotate: [0, 180, 360] }}
                        transition={{ duration: 1.25, repeat: Infinity, ease: "linear" }}
                    >
                        <RefreshCw className="h-4 w-4 text-cyan-500/75" />
                    </motion.div>
                </div>
            );
        }

        return null;
    };

    const economyFxOverlay = activeEconomyFx && activeEconomyVisual ? (
        <motion.div
            key={activeEconomyFx.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
                "overflow-visible pointer-events-none",
                isShopEconomyFx
                    ? "fixed inset-0 z-[220]"
                    : "absolute inset-0 z-[120]"
            )}
        >
            <motion.div
                initial={{ opacity: 0, y: -30, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -18, scale: 0.98 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className={cn(
                    "absolute left-1/2 z-10 flex min-w-[380px] items-center gap-4 rounded-[28px] border px-4 py-3.5",
                    isShopEconomyFx
                        ? "top-6 shadow-[0_20px_60px_rgba(15,23,42,0.18)]"
                        : "top-4 backdrop-blur-2xl",
                    "-translate-x-1/2 overflow-hidden",
                    activeEconomyVisual.shellClass,
                    isShopEconomyFx && "backdrop-blur-none [backdrop-filter:none]"
                )}
            >
                <div className={cn("relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border", activeEconomyVisual.iconClass)}>
                    {activeEconomyVisual.icon}
                </div>

                <div className="relative z-10 min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-stone-500/90">
                        {activeEconomyFx.kind === 'coin_gain'
                            ? (isGachaEconomyFx ? 'Lucky Draw' : 'Coin Gain')
                            : activeEconomyFx.kind === 'item_purchase'
                                ? (isGachaEconomyFx ? 'Lucky Draw' : 'Store Update')
                                : 'Assist Used'}
                    </div>
                    <div className="truncate text-[15px] font-black tracking-[0.01em]">
                        {activeEconomyFx.message}
                    </div>
                </div>

                <div className={cn("relative z-10 rounded-full border px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.18em]", activeEconomyVisual.chipClass)}>
                    {activeEconomyChipLabel}
                </div>

                <motion.div
                    className={cn("absolute inset-y-2 left-[-22%] w-[44%] -skew-x-12 bg-gradient-to-r opacity-85 blur-sm", activeEconomyVisual.shimmerClass)}
                    animate={{ x: [0, 420] }}
                    transition={{ duration: 1.35, ease: "easeInOut" }}
                />
                {renderEconomyAccent()}
            </motion.div>

            {activeEconomyFx.kind !== 'coin_gain' && activeEconomyVector && !isShopEconomyFx && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.62, x: 0, y: 0 }}
                    animate={{ opacity: [0, 1, 1, 0], scale: [0.62, 1, 0.92, 0.82], x: [0, 0, activeEconomyVector.x], y: [0, 0, activeEconomyVector.y] }}
                    transition={{ duration: 1.14, times: [0, 0.16, 0.72, 1], ease: "easeInOut" }}
                    className="absolute left-1/2 z-20 -translate-x-1/2"
                    style={{ top: ECONOMY_OVERLAY_ORIGIN_TOP }}
                >
                    <div className={cn("relative flex h-9 w-9 items-center justify-center rounded-full border", activeEconomyVisual.flightClass)}>
                        {activeEconomyVisual.icon}
                        <motion.div
                            className={cn("absolute inset-0 rounded-full blur-xl", activeEconomyVisual.pulseClass)}
                            animate={{ opacity: [0.18, 0.5, 0], scale: [0.76, 1.15, 1.32] }}
                            transition={{ duration: 0.72, ease: "easeOut" }}
                        />
                    </div>
                </motion.div>
            )}

            {activeEconomyFx.kind === 'coin_gain' && (
                <>
                    {ECONOMY_COIN_RAIN.slice(0, activeCoinRainCount).map((particle, index) => (
                        <motion.div
                            key={`coin-rain-${activeEconomyFx.id}-${index}`}
                            initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
                            animate={{ opacity: [0, 1, 0.78, 0], x: particle.x, y: particle.y, scale: [0.6, particle.scale, particle.scale * 0.94, particle.scale * 0.86], rotate: particle.rotate }}
                            transition={{ duration: 0.95, delay: particle.delay, ease: "easeOut" }}
                            className="absolute left-1/2 z-[5] -translate-x-1/2"
                            style={{ top: ECONOMY_OVERLAY_ORIGIN_TOP + 8 }}
                        >
                            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-amber-200/80 bg-white/90 text-[11px] text-amber-500 shadow-[0_8px_18px_rgba(245,158,11,0.14)]">
                                ✨
                            </div>
                        </motion.div>
                    ))}

                    {activeEconomyVector && ECONOMY_COIN_ABSORB.slice(0, activeCoinAbsorbCount).map((particle, index) => (
                        <motion.div
                            key={`coin-absorb-${activeEconomyFx.id}-${index}`}
                            initial={{ opacity: 0, scale: 0.58, x: 0, y: 0 }}
                            animate={{ opacity: [0, 1, 1, 0], scale: [0.58, 0.96, 0.88, 0.72], x: [particle.x, particle.x, activeEconomyVector.x], y: [particle.y, particle.y + 16, activeEconomyVector.y] }}
                            transition={{ duration: 0.88, delay: particle.delay, times: [0, 0.2, 0.78, 1], ease: "easeInOut" }}
                            className="absolute left-1/2 z-[8] -translate-x-1/2"
                            style={{ top: ECONOMY_OVERLAY_ORIGIN_TOP + 2 }}
                        >
                            <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-amber-200/80 bg-white/95 text-[10px] text-amber-500 shadow-[0_8px_16px_rgba(245,158,11,0.14)]">
                                ✦
                            </div>
                        </motion.div>
                    ))}
                </>
            )}
        </motion.div>
    ) : null;

    // ELO-based auto-difficulty
    const getEloDifficulty = (elo: number, drillMode: DrillMode) => {
        if (drillMode === 'translation') {
            const tier = getTranslationDifficultyTier(elo);
            const colorMap: Record<string, string> = {
                'Level 1': 'text-stone-500',
                'Level 2': 'text-amber-600',
                'Level 3': 'text-slate-500',
                'Level 4': 'text-yellow-600',
                'Level 5': 'text-cyan-600',
                'Level 6': 'text-blue-500',
                'Level 7': 'text-fuchsia-600',
                'Level 8': 'text-purple-600',
                'Level 9': 'text-red-500',
            };

            return {
                level: tier.level,
                label: `${tier.cefr} ${tier.tier}`,
                cefr: tier.cefr,
                color: colorMap[tier.level] || 'text-stone-500',
                desc: tier.desc,
            };
        }

        if (elo < 400) return { level: 'Level 1', label: 'A1 新手', cefr: 'A1', color: 'text-stone-500', desc: '简单SVO句子' };
        if (elo < 800) return { level: 'Level 2', label: 'A2- 青铜', cefr: 'A2-', color: 'text-amber-600', desc: '日常复合句' };
        if (elo < 1200) return { level: 'Level 3', label: 'A2+ 白银', cefr: 'A2+', color: 'text-slate-500', desc: '简单从句' };
        if (elo < 1600) return { level: 'Level 4', label: 'B1 黄金', cefr: 'B1', color: 'text-yellow-600', desc: '被动+关系从句' };
        if (elo < 2000) return { level: 'Level 5', label: 'B2 铂金', cefr: 'B2', color: 'text-cyan-600', desc: '条件句+分词' };
        if (elo < 2400) return { level: 'Level 6', label: 'C1 钻石', cefr: 'C1', color: 'text-blue-500', desc: '倒装+虚拟语气' };
        if (elo < 2800) return { level: 'Level 7', label: 'C2 大师', cefr: 'C2', color: 'text-fuchsia-600', desc: '母语级表达' };
        if (elo < 3200) return { level: 'Level 8', label: 'C2+ 王者', cefr: 'C2+', color: 'text-purple-600', desc: '极限挑战' };
        return { level: 'Level 9', label: '☠️ 处决', cefr: '∞', color: 'text-red-500', desc: '惩罚级难度' };
    };
    const eloDifficulty = getEloDifficulty(currentElo || DEFAULT_BASE_ELO, mode);

    const [eloChange, setEloChange] = useState<number | null>(null);
    const [eloBreakdown, setEloBreakdown] = useState<{
        difficultyElo: number;
        expectedScore: number;
        actualScore: number;
        kFactor: number;
        streakBonus: boolean;
        baseChange: number;
        bonusChange: number;
    } | null>(null);

    const [audioDuration, setAudioDuration] = useState(0);

    useEffect(() => {
        if (prevStreakModeRef.current !== mode) {
            prevStreakModeRef.current = mode;
            prevStreakRef.current = currentStreak;
            setStreakTransition(null);
            setCooldownTier(0);
            setCooldownStreak(0);
            return;
        }

        const previousStreak = prevStreakRef.current;
        let timeoutId: NodeJS.Timeout | null = null;

        if (currentStreak > previousStreak && currentStreak >= 2) {
            setCooldownTier(0);
            setCooldownStreak(0);
            setStreakTransition('surge');
            timeoutId = setTimeout(() => setStreakTransition(null), prefersReducedMotion ? 220 : 560);
        } else if (previousStreak >= 2 && currentStreak <= 1) {
            setCooldownTier(getStreakTier(previousStreak));
            setCooldownStreak(previousStreak);
            setStreakTransition('cooldown');
            timeoutId = setTimeout(() => {
                setStreakTransition(null);
                setCooldownTier(0);
                setCooldownStreak(0);
            }, prefersReducedMotion ? 180 : 380);
        }

        prevStreakRef.current = currentStreak;

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [currentStreak, mode, prefersReducedMotion]);

    // --- Idle Coin Earning ---
    useEffect(() => {
        // Only earn coins while actively on the drill page (any mode)
        const idleInterval = setInterval(() => {
            applyEconomyPatch({ coinsDelta: 5 });
            pushEconomyFx({ kind: 'coin_gain', amount: 5, message: '+5 星光币', source: 'reward' });
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearInterval(idleInterval);
    }, [applyEconomyPatch, pushEconomyFx]);

    // --- Loading & Persistance ---

    useEffect(() => {
        const loadProfile = async () => {
            const profile = await db.user_profile.orderBy('id').first();
            if (profile) {
                setEloRating(profile.elo_rating);
                setStreakCount(profile.streak_count);

                // Load Listening Stats (Fallback if undefined post-migration in memory before reload)
                setListeningElo(profile.listening_elo ?? DEFAULT_BASE_ELO);
                setListeningStreak(profile.listening_streak ?? 0);
                eloRatingRef.current = profile.elo_rating;
                listeningEloRef.current = profile.listening_elo ?? DEFAULT_BASE_ELO;

                // Load Hint Economy Stats
                const loadedCoins = profile.coins ?? DEFAULT_STARTING_COINS;
                const loadedInventory = normalizeInventory(profile.inventory, profile.hints);
                coinsRef.current = loadedCoins;
                inventoryRef.current = loadedInventory;
                setCoins(loadedCoins);
                setInventory(loadedInventory);

                const loadedOwnedThemes = normalizeOwnedThemes(profile.owned_themes);
                setOwnedThemes(loadedOwnedThemes);
                const loadedActive = (
                    profile.active_theme
                    && loadedOwnedThemes.includes(profile.active_theme as CosmeticThemeId)
                    && profile.active_theme in COSMETIC_THEMES
                )
                    ? profile.active_theme as CosmeticThemeId
                    : DEFAULT_FREE_THEME;
                setCosmeticTheme(loadedActive);

                setIsEloLoaded(true); // Mark Elo as loaded
            } else {
                const initialInventory = { ...DEFAULT_INVENTORY };
                setEloRating(DEFAULT_BASE_ELO);
                setStreakCount(0);
                setListeningElo(DEFAULT_BASE_ELO);
                setListeningStreak(0);
                eloRatingRef.current = DEFAULT_BASE_ELO;
                listeningEloRef.current = DEFAULT_BASE_ELO;
                coinsRef.current = DEFAULT_STARTING_COINS;
                inventoryRef.current = initialInventory;
                setCoins(DEFAULT_STARTING_COINS);
                setInventory(initialInventory);
                setOwnedThemes([DEFAULT_FREE_THEME]);
                setCosmeticTheme(DEFAULT_FREE_THEME);
                setIsEloLoaded(true); // Mark Elo as loaded (new profile)
            }
        };
        loadProfile();

        const savedDiff = localStorage.getItem('yasi_drill_difficulty');
        if (savedDiff) setDifficulty(savedDiff);
    }, []);

    useEffect(() => {
        localStorage.setItem('yasi_drill_difficulty', difficulty);
    }, [difficulty]);

    // --- Audio Logic ---

    // Auto-Play Removed per User Request (Manual Only)
    /*
    useEffect(() => {
        const isIntroShowing = (gambleState.active && !gambleState.introAck) || (bossState.active && !bossState.introAck);

        if (mode === "listening" && drillData?.reference_english && !drillFeedback && !isIntroShowing) {
            playAudio();
        }
    }, [drillData, mode, gambleState.active, gambleState.introAck, bossState.active, bossState.introAck]);
    */

    const fetchTtsAudio = useCallback(async (text: string) => {
        const response = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text,
                voice: "en-US-JennyNeural",
                rate: "+0%"
            }),
        });

        if (!response.ok) throw new Error("TTS request failed");

        const data = await response.json();
        if (!data.audio) throw new Error("No audio in response");

        const base64Data = data.audio.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/mpeg' });

        if (blob.size < 100) {
            throw new Error("Generated audio blob too small");
        }

        return { blob, marks: data.marks || [] };
    }, []);

    // Pre-generate audio when listening drill loads (translation stays lazy-loaded)
    useEffect(() => {
        if (mode !== 'listening' || !drillData?.reference_english) {
            setIsPrefetching(false);
            return;
        }

        const textKey = "SENTENCE_" + drillData.reference_english;
        if (audioCache.current.has(textKey)) {
            return;
        }

        let isCancelled = false;

        const prefetchAudio = async () => {
            setIsPrefetching(true);
            try {
                const cachedAudio = await fetchTtsAudio(drillData.reference_english);
                if (isCancelled) return;
                audioCache.current.set(textKey, cachedAudio);
            } catch (error) {
                if (!isCancelled) {
                    console.error('[Audio Prefetch] Error:', error);
                }
            } finally {
                if (!isCancelled) {
                    setIsPrefetching(false);
                }
            }
        };

        prefetchAudio();

        return () => {
            isCancelled = true;
        };
    }, [drillData?.reference_english, fetchTtsAudio, mode]);

    const lastPlayTime = useRef(0);

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        setCurrentAudioTime(time);
        if (audioRef.current) audioRef.current.currentTime = time / 1000;
    };

    const playAudio = async () => {
        if (!drillData?.reference_english) return false;

        // Debounce (Prevent Double Click)
        const now = Date.now();
        if (now - lastPlayTime.current < 500) return false;
        lastPlayTime.current = now;

        // Echo Beast Constraint: One-time playback
        if (bossState.active && bossState.type === 'echo' && hasPlayedEchoRef.current) {
            // Audio "Broken" effect
            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
            setShake(true);
            return false;
        }

        const textKey = "SENTENCE_" + drillData.reference_english;
        // setIsPlaying(true); 
        setWordPopup(null);

        try {
            let cached = audioCache.current.get(textKey);

            if (!cached) {
                setIsAudioLoading(true);
                setIsPlaying(false);

                cached = await fetchTtsAudio(drillData.reference_english);
                audioCache.current.set(textKey, cached);
                setIsAudioLoading(false);
            }

            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }

            // Create fresh URL from cached blob (always use blob now)
            const audioUrl = cached.blob
                ? URL.createObjectURL(cached.blob)
                : (cached.url || '');

            console.log('[Audio Play] Creating audio from cache, blob size:', cached.blob?.size, 'url:', audioUrl.substring(0, 50));

            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            // Add error handler
            audio.onerror = (e) => {
                console.error('[Audio Play] Error loading audio:', audio.error?.message, audio.error?.code);
            };

            audio.onloadedmetadata = () => setAudioDuration(audio.duration * 1000);
            if (audio.duration && !isNaN(audio.duration)) setAudioDuration(audio.duration * 1000);

            audio.ontimeupdate = () => {
                if (!audio.paused) {
                    setCurrentAudioTime(audio.currentTime * 1000);
                }
            };

            audio.onended = () => {
                setIsPlaying(false);
                setCurrentAudioTime(0);
                audio.ontimeupdate = null; // Cleanup
            };

            audio.playbackRate = playbackSpeed;

            // Echo Beast Constraint
            if (bossState.active && bossState.type === 'echo') {
                if (hasPlayedEchoRef.current) {
                    new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
                    setShake(true);
                    setIsPlaying(false);
                    return false;
                }
                hasPlayedEchoRef.current = true;
            }

            await audio.play();
            setIsPlaying(true);

            // Start Lightning countdown when audio plays
            if (bossState.active && bossState.type === 'lightning') {
                setLightningStarted(true);
            }
            return true;
        } catch (error) {
            console.error("Audio chain failed", error);
            setIsPlaying(false);
            setIsAudioLoading(false);
            return false;
        }
    };


    // --- Whisper Result Sync (No auto-submit - user must click confirm) ---
    useEffect(() => {
        if (mode === "listening" && whisperResult.isFinal && whisperResult.text) {
            setUserTranslation(whisperResult.text);
            // Note: User must click "Submit" button to confirm
        }
    }, [whisperResult, mode]);

    useEffect(() => {
        if (drillData?.reference_english && setContext) {
            const keywords = drillData.target_english_vocab?.join(" ") || "";
            const effectiveTopic = drillData._topicMeta?.topic || context.articleTitle || context.topic || 'General';
            // Simplified prompt for context
            const prompt = `Topic: ${effectiveTopic}. Keywords: ${keywords}. Sentence: ${drillData.reference_english}`;
            setContext(prompt);
        }
    }, [drillData, context, setContext]);


    // --- Spacebar Logic ---
    // Feedback Effects
    useEffect(() => {
        if (drillFeedback) {
            if (drillFeedback.score >= 8) {
                // Success: Confetti & Sound
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#10b981', '#34d399', '#fcd34d'] // Emerald & Amber
                });
                new Audio('https://assets.mixkit.co/sfx/preview/mixkit-achievement-bell-600.mp3').play().catch(() => { });
            } else if (drillFeedback.score <= 4) {
                // Fail: Shake & Sound
                const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-wrong-answer-fail-notification-946.mp3');
                audio.volume = 0.5;
                audio.play().catch(() => { });
            } else {
                // Neutral
                new Audio('https://assets.mixkit.co/sfx/preview/mixkit-message-pop-alert-2354.mp3').play().catch(() => { });
            }
        }
    }, [drillFeedback]);

    // --- Keyboard listeners removed - now using click-to-record UI ---
    // Space key no longer triggers recording

    // --- Intro BGM Manager ---
    useEffect(() => {
        let audio: HTMLAudioElement | null = null;

        if (bossState.active) {
            // Play Boss BGM
            const config = BOSS_CONFIG[bossState.type];
            if (config && config.bgm) {
                console.log("[Audio] Playing Boss BGM:", config.bgm);
                audio = new Audio(config.bgm);
                audio.volume = bossState.introAck ? 0.15 : 0.4;
                audio.loop = false;
                audio.play().catch(err => console.log("[Audio] Boss play failed:", err));
            }
        } else if (gambleState.active) {
            // Play Gamble Audio (Intro Prompt vs Betting Loop)
            if (!gambleState.introAck) {
                // Intro: "Heartbeat/Prompt" sound
                console.log("[Audio] Playing Gamble Intro");
                audio = new Audio('/gamble_intro.mp3');
                audio.volume = 0.6;
                audio.loop = false;
            } else {
                // Betting Phase: "Background Tension" loop
                console.log("[Audio] Playing Gamble Loop");
                audio = new Audio('/gamble_loop.mp3');
                audio.volume = 0.4;
                audio.loop = true;
            }
            audio.play().catch(err => console.log("[Audio] Gamble play failed:", err));
        }

        return () => {
            if (audio) {
                audio.pause();
                audio = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bossState.active, bossState.introAck, bossState.type, gambleState.active, gambleState.introAck]);


    // --- DEBUG TRIGGER ---
    const handleDebugBossTrigger = (type: string) => {
        console.log(`[DEBUG] Triggering Boss: ${type}`);
        // Force immediate Drill Generation with Override
        handleGenerateDrill(undefined, type);
    };

    const handleDebugEconomyFx = useCallback((
        kind: EconomyFxKind,
        options: { itemId?: ShopItemId; amount?: number; message: string; }
    ) => {
        pushEconomyFx({
            kind,
            itemId: options.itemId,
            amount: options.amount,
            message: options.message,
            source: kind === 'coin_gain' ? 'reward' : kind === 'item_purchase' ? 'shop' : 'tab',
        });
    }, [pushEconomyFx]);

    const handleDebugLootDrop = useCallback((options: LootDrop) => {
        setLootDrop(options);
    }, []);

    const handleDebugGacha = useCallback(() => {
        setGachaCards(buildGachaPack());
        setSelectedGachaCardId(null);
        setGachaClaimTarget(null);
        setShowGacha(true);
    }, []);

    const debugTriggerRoulette = () => {
        // Show the interactive overlay instead of immediate generation
        setShowRoulette(true);
    };

    const getGachaClaimTarget = useCallback((card: GachaCard) => {
        const targetId: EconomyTargetId = card.rewardType === 'coins' ? 'coins' : card.rewardType;
        const targetRect = resourceTargetRefs.current[targetId]?.getBoundingClientRect();

        if (!targetRect) return null;

        return {
            target: targetId,
            x: targetRect.left + targetRect.width / 2,
            y: targetRect.top + targetRect.height / 2,
        };
    }, []);

    const handleGachaSelect = useCallback((cardId: string) => {
        if (selectedGachaCardId !== null) return;

        const reward = gachaCards.find((card) => card.id === cardId);
        if (!reward) return;

        setSelectedGachaCardId(cardId);
        setGachaCards((prev) => prev.map((card) => ({
            ...card,
            selected: card.id === cardId,
            revealed: card.id === cardId,
        })));
        setGachaClaimTarget(getGachaClaimTarget(reward));
        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3').play().catch(() => { });

        const economyReward = getGachaRewardEconomy(reward);
        applyEconomyPatch({
            coinsDelta: economyReward.coinsDelta,
            itemDelta: economyReward.itemDelta,
        });
        pushEconomyFx({
            ...economyReward.fx,
            source: 'gacha',
        });
    }, [applyEconomyPatch, gachaCards, getGachaClaimTarget, pushEconomyFx, selectedGachaCardId]);

    const handleGachaComplete = useCallback(() => {
        setShowGacha(false);
        setGachaCards([]);
        setSelectedGachaCardId(null);
        setGachaClaimTarget(null);
    }, []);

    const handleRouletteComplete = (result: 'safe' | 'dead', bulletCount: number) => {
        setShowRoulette(false);
        console.log(`[Roulette] Result: ${result}, Bullets: ${bulletCount}`);

        const GREED_TABLE = [
            { bullets: 0, mult: 1 },
            { bullets: 1, mult: 2 },
            { bullets: 2, mult: 3 },
            { bullets: 3, mult: 5 },
            { bullets: 4, mult: 8 },
            { bullets: 5, mult: 15 },
            { bullets: 6, mult: 50 },
        ];

        const multiplier = GREED_TABLE.find(t => t.bullets === bulletCount)?.mult || 1;

        if (result === 'dead') {
            // --- IMMEDIATE PENALTY ---
            const penalty = 50;
            const isListening = mode === 'listening';
            const activeElo = isListening ? listeningElo : eloRating;
            const newElo = Math.max(0, (activeElo || DEFAULT_BASE_ELO) - penalty);

            setEloChange(-penalty);
            setLootDrop({
                type: 'exp',
                amount: -penalty,
                rarity: 'common',
                message: '💀 你中弹了！扣除 50 Elo 并开启处决局'
            });
            setShake(true);

            // Update local state
            if (isListening) setListeningElo(newElo);
            else setEloRating(newElo);

            loadLocalProfile().then((profile) => {
                if (!profile) return;
                const maxElo = isListening
                    ? Math.max(profile.listening_max_elo || DEFAULT_BASE_ELO, newElo)
                    : Math.max(profile.max_elo, newElo);

                return settleBattle({
                    mode: isListening ? 'listening' : 'translation',
                    eloAfter: newElo,
                    change: -penalty,
                    streak: 0,
                    maxElo,
                    coins: profile.coins ?? DEFAULT_STARTING_COINS,
                    source: 'roulette_penalty',
                });
            }).catch((error) => {
                console.error("Failed to sync roulette penalty", error);
            });

            setRouletteSession({ active: true, result: 'dead', multiplier: 1, bullets: bulletCount });
            handleGenerateDrill(undefined, 'roulette_execution');
        } else {
            // --- DEFERRED REWARD ---
            setRouletteSession({ active: true, result: 'safe', multiplier, bullets: bulletCount });
            setLootDrop({
                type: 'gem',
                amount: 0,
                rarity: 'legendary',
                message: `🎰 活下来了！本题奖励 x${multiplier} 倍`
            });
            handleGenerateDrill(undefined, 'roulette');
        }
    };

    const prefetchNextDrill = (nextElo: number) => {
        console.log("[Prefetch] Starting background prefetch for next drill...");
        if (abortPrefetchRef.current) abortPrefetchRef.current.abort();
        abortPrefetchRef.current = new AbortController();

        let nextBossType: 'blind' | 'lightning' | 'echo' | 'reaper' | undefined = undefined;
        if (mode === 'listening') {
            const roll = Math.random();
            if (roll < 0.02) {
                const bossRoll = Math.random();
                if (bossRoll < 0.35) nextBossType = 'blind';
                else if (bossRoll < 0.65) nextBossType = 'echo';
                else if (bossRoll < 0.85) nextBossType = 'lightning';
                else nextBossType = 'reaper';
            }
        }

        const targetTopic = resolveScenarioTopic(context);

        fetch("/api/ai/generate_drill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                articleTitle: targetTopic,
                articleContent: context.articleContent || "",
                difficulty: getEloDifficulty(nextElo, mode).level,
                eloRating: Math.max(0, nextElo),
                mode,
                bossType: nextBossType,
                _t: Date.now()
            }),
            signal: abortPrefetchRef.current.signal,
        }).then(res => res.json())
            .then(data => {
                if (!abortPrefetchRef.current?.signal.aborted) {
                    console.log("[Prefetch] Background prefetch completed and stored!");
                    setPrefetchedDrillData({ ...data, mode });
                }
            }).catch(err => {
                if (err.name !== 'AbortError') console.error("[Prefetch] Error:", err);
            });
    };

    // --- Core Actions ---

    const handleGenerateDrill = async (targetDifficulty = difficulty, overrideBossType?: string, skipPrefetched = false) => {
        if (showGacha) return;
        // Abort any pending generation or prefetch requests
        if (abortControllerRef.current) abortControllerRef.current.abort();
        if (abortPrefetchRef.current) abortPrefetchRef.current.abort();

        // If we have prefetched data ready AND it matches the current mode, consume it instantly
        if (prefetchedDrillData && prefetchedDrillData.mode === mode && !overrideBossType && !skipPrefetched) {
            console.log("[Prefetch] Consuming prefetched drill data! Zero ms latency.");
            setDrillData(prefetchedDrillData);
            setPrefetchedDrillData(null); // Clear buffer
            resetGuidedLearningState(false);

            // Reset UI states quickly
            setIsGeneratingDrill(false);
            setDrillFeedback(null);
            setUserTranslation("");
            setTutorAnswer(null);
            setTutorThread([]);
            setTutorResponse(null);
            setTutorPendingQuestion(null);
            setTutorQuery("");
            setIsTutorOpen(false);
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
            vocabHintRevealRef.current = false;
            translationAudioUnlockRef.current = false;
            resetResult();
            if (audioRef.current) audioRef.current.pause();
            hasPlayedEchoRef.current = false;
            setLightningStarted(false);

            // Trigger teaching content fetch if needed
            if (teachingMode && mode === 'translation') {
                setIsLoadingTeaching(true);
                fetch("/api/ai/teach", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chinese: prefetchedDrillData.chinese,
                        reference_english: prefetchedDrillData.reference_english,
                        elo: currentElo,
                    }),
                })
                    .then(res => res.json())
                    .then(data => setTeachingData(data))
                    .catch(console.error)
                    .finally(() => setIsLoadingTeaching(false));
            }

            return; // Skip normal generation!
        }

        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        hasPlayedEchoRef.current = false; // Reset Echo Beast state
        setLightningStarted(false); // Reset Lightning countdown trigger

        setIsGeneratingDrill(true);
        setDrillData(null);
        resetGuidedLearningState(false);
        setDrillFeedback(null);
        setUserTranslation("");
        setTutorAnswer(null);
        setTutorThread([]);
        setTutorResponse(null);
        setTutorPendingQuestion(null);
        setTutorQuery("");
        setIsTutorOpen(false);
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
        vocabHintRevealRef.current = false;
        translationAudioUnlockRef.current = false;
        resetResult(); // Clear previous recording transcript
        if (audioRef.current) audioRef.current.pause();

        // --- PRE-CALCULATE BOSS/GAMBLE EVENTS ---
        let nextBossType: 'blind' | 'lightning' | 'echo' | 'reaper' | undefined = undefined;
        let nextTheme = theme;
        let pendingBossState: any = null;
        let pendingGambleState: any = null;

        // ALL Special Events (Boss, Gamble, Roulette) are EXCLUSIVELY for Listening Mode
        if (mode === 'listening') {
            nextBossType = overrideBossType as any || (bossState.active ? bossState.type : undefined);

            if (!bossState.active && !gambleState.active && !overrideBossType) {
                const roll = Math.random();
                // 2% Chance for Boss (Listening Only)
                if (roll < 0.02) {
                    const bossRoll = Math.random();
                    let type: 'blind' | 'lightning' | 'echo' | 'reaper' = 'blind';

                    // Listening Weights: Blind (35%), Echo (30%), Lightning (20%), Reaper (15%)
                    if (bossRoll < 0.35) type = 'blind';
                    else if (bossRoll < 0.65) type = 'echo';
                    else if (bossRoll < 0.85) type = 'lightning';
                    else type = 'reaper';

                    nextBossType = type;
                    nextTheme = 'boss';
                    pendingBossState = {
                        active: true,
                        introAck: false,
                        type,
                        hp: type === 'reaper' ? 3 : undefined,
                        maxHp: type === 'reaper' ? 3 : undefined,
                        playerHp: type === 'reaper' ? 3 : undefined, // Player starts with 3 HP
                        playerMaxHp: type === 'reaper' ? 3 : undefined
                    };
                }
                // 5% Chance for Gamble (Listening Mode Only)
                else if (roll < 0.07) {
                    nextTheme = 'crimson';
                    pendingGambleState = { active: true, introAck: false, wager: null, doubleDownCount: 0 };
                }
            }

            // FORCE OVERRIDE STATE (DEBUG / ROULETTE)
            if (overrideBossType) {
                nextTheme = 'boss';
                nextBossType = overrideBossType as any;
                pendingBossState = {
                    active: true,
                    introAck: overrideBossType.includes('roulette'), // Skip standard intro for roulette
                    type: overrideBossType as any,
                    hp: undefined, // Standard unless reaper
                    maxHp: undefined,
                    playerHp: undefined,
                    playerMaxHp: undefined
                };
            }
        }

        // IMMEDIATELY apply Boss/Gamble state BEFORE API call (eliminates flicker)
        if (pendingBossState) {
            setBossState(pendingBossState);
            setTheme('boss');
            setPlaybackSpeed(pendingBossState.type === 'lightning' ? 1.5 : 1.0);
        }
        if (pendingGambleState) {
            setGambleState(pendingGambleState);
            setTheme('crimson');
        }

        try {
            console.log(`[DEBUG] Sending to API: bossType=${nextBossType}, eloRating=${currentElo}`);
            // --- DETERMINE TOPIC ---
            const targetTopic = resolveScenarioTopic(context);

            // --- RANDOM SURPRISE DROP ---
            if (currentStreak > 0 && Math.random() < 0.05) { // 5% chance on new drill load (only if they aren't totally failing)
                setTimeout(() => {
                    const isCapsule = Math.random() < 0.2;
                    if (isCapsule) {
                        applyEconomyPatch({ itemDelta: { capsule: 1 } });
                        setLootDrop({ type: 'gem', amount: 1, rarity: 'rare', message: '🎁 天降幸运！获得灵感胶囊！' });
                    } else {
                        const randomCoins = Math.floor(Math.random() * 20) + 5;
                        applyEconomyPatch({ coinsDelta: randomCoins });
                        pushEconomyFx({ kind: 'coin_gain', amount: randomCoins, message: `+${randomCoins} 星光币`, source: 'reward' });
                    }
                }, 1000); // 1 second after generation starts
            }

            const response = await fetch("/api/ai/generate_drill", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    articleTitle: targetTopic,
                    articleContent: context.articleContent || "",
                    difficulty: eloDifficulty.level, // Auto-calculated from ELO
                    eloRating: currentElo,
                    mode,
                    bossType: nextBossType, // Inject Boss Context for Custom Scenarios
                    _t: Date.now() // Cache buster to prevent repeated drills
                }),
                signal, // Pass abort signal
            });

            // Check if aborted before processing response
            if (signal.aborted) return;

            const data = await response.json();

            // Check again after JSON parsing
            if (signal.aborted) return;

            setDrillData(data);

            // Fetch teaching content if teaching mode is ON and in translation mode
            if (teachingMode && mode === 'translation' && data.chinese && data.reference_english) {
                setTeachingPanelOpen(false);
                setTeachingData(null);
                setIsLoadingTeaching(true);
                try {
                    const teachRes = await fetch('/api/ai/teach', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chinese: data.chinese,
                            reference_english: data.reference_english,
                            elo: currentElo,
                        }),
                    });
                    if (!signal.aborted) {
                        const teachContent = await teachRes.json();
                        if (!signal.aborted && !teachContent.error) {
                            setTeachingData(teachContent);
                            setTeachingPanelOpen(true); // Auto-open panel when data loads
                        }
                    }
                } catch (err) {
                    console.error('[Teaching] Failed to fetch teaching data:', err);
                } finally {
                    if (!signal.aborted) setIsLoadingTeaching(false);
                }
            } else {
                setTeachingData(null);
                setTeachingPanelOpen(false);
                setIsLoadingTeaching(false);
            }

            // Boss/Gamble states already applied BEFORE API call (no flicker)
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                console.log('[Drill] Request aborted - switching to new question');
                return; // Silently exit on abort
            }
            console.error(error);
        } finally {
            if (!signal.aborted) {
                setIsGeneratingDrill(false);
            }
        }
    };

    const handleStartGuidedLearning = useCallback(() => {
        if (mode !== "translation" || !drillData?.chinese || !drillData.reference_english) return;

        const localGuidedScript = buildFallbackGuidedScript({
            chinese: drillData.chinese,
            referenceEnglish: drillData.reference_english,
        });

        setLearningSession(true);
        setGuidedModeStatus("active");
        setGuidedScript(localGuidedScript);
        setGuidedCurrentStepIndex(0);
        guidedCurrentStepIndexRef.current = 0;
        setGuidedCurrentAttemptCount(0);
        setGuidedChoicesVisible(false);
        setGuidedRevealReady(false);
        setGuidedFilledFragments({});
        guidedFilledFragmentsRef.current = {};
        setGuidedLastFeedback(null);
        setGuidedInnerMode("teacher_guided");
        setGuidedClozeState(null);
        setGuidedInput("");
        setTeachingPanelOpen(false);
        setIsTutorOpen(false);
        setGuidedAiHint(null);
        applyGuidedSessionSnapshot(createGuidedSessionState(localGuidedScript));
    }, [
        applyGuidedSessionSnapshot,
        buildFallbackGuidedScript,
        drillData,
        mode,
    ]);

    const handleRequestGuidedAiHint = useCallback(async () => {
        if (!guidedScript || !drillData) return;

        const slot = guidedInnerMode === "gestalt_cloze"
            ? guidedScript.slots.find((item) => item.id === guidedClozeState?.blankSlotIds[guidedClozeState.currentBlankIndex])
            : guidedScript.slots[guidedCurrentStepIndex];
        if (!slot) return;

        const slotIndex = guidedScript.slots.findIndex((item) => item.id === slot.id);
        const filledMap = guidedInnerMode === "gestalt_cloze"
            ? (guidedClozeState?.filledFragments ?? {})
            : guidedFilledFragments;

        let leftContext = "";
        let rightContext = "";

        for (let index = slotIndex - 1; index >= 0; index -= 1) {
            const visible = filledMap[guidedScript.slots[index]?.id ?? ""];
            if (visible) {
                leftContext = visible;
                break;
            }
        }

        for (let index = slotIndex + 1; index < guidedScript.slots.length; index += 1) {
            const visible = filledMap[guidedScript.slots[index]?.id ?? ""];
            if (visible) {
                rightContext = visible;
                break;
            }
        }

        const localHint = guidedInnerMode === "gestalt_cloze"
            ? buildGuidedClozeHint(guidedScript, guidedClozeState ?? createGuidedClozeState(guidedScript))?.primary ?? ""
            : buildGuidedHintLines(guidedScript, getGuidedSessionSnapshot())?.primary ?? "";
        const attempt = guidedInnerMode === "gestalt_cloze"
            ? Math.max(guidedClozeState?.currentAttemptCount ?? 0, guidedClozeState?.revealReady ? 3 : 0)
            : Math.max(guidedCurrentAttemptCount, (guidedChoicesVisible || guidedRevealReady) ? 3 : 0);
        const guidedKey = getGuidedScriptKey(
            drillData,
            eloRatingRef.current || DEFAULT_BASE_ELO,
            context.articleTitle || context.topic,
        );
        const requestCount = guidedAiHintRequestCountRef.current + 1;
        guidedAiHintRequestCountRef.current = requestCount;

        const controller = new AbortController();
        guidedHintAbortRef.current?.abort();
        guidedHintAbortRef.current = controller;
        setIsGuidedAiHintLoading(true);

        try {
            const hint = await loadGuidedHint({
                guidedKey,
                slot,
                attempt,
                innerMode: guidedInnerMode,
                leftContext,
                rightContext,
                localHint,
                manualRequest: true,
                requestCount,
                signal: controller.signal,
            });
            if (!controller.signal.aborted) {
                setGuidedAiHint(hint);
            }
        } catch (error) {
            if ((error as Error).name !== "AbortError") {
                console.error("[GuidedLearning] Manual AI hint failed", error);
                if (!controller.signal.aborted) {
                    setGuidedAiHint({
                        primary: "AI 老师这次没接上，你可以再点一次，我会重新换一种更具体的讲法。",
                        secondary: null,
                        rescue: null,
                    });
                }
            }
        } finally {
            if (!controller.signal.aborted) {
                setIsGuidedAiHintLoading(false);
            }
        }
    }, [
        context.articleTitle,
        context.topic,
        drillData,
        getGuidedSessionSnapshot,
        guidedChoicesVisible,
        guidedClozeState,
        guidedCurrentAttemptCount,
        guidedCurrentStepIndex,
        guidedFilledFragments,
        guidedInnerMode,
        guidedRevealReady,
        guidedScript,
        loadGuidedHint,
    ]);

    const handleSubmitGuidedInput = useCallback((inputOverride?: string) => {
        if (!guidedScript) return;
        if (guidedInnerMode === "gestalt_cloze") {
            if (!guidedClozeState) return;
            const nextClozeState = submitGuidedClozeInput(
                guidedClozeState,
                guidedScript,
                inputOverride ?? guidedInput,
            );
            setGuidedClozeState(nextClozeState);
            setGuidedInput("");
            if (nextClozeState.currentBlankIndex >= nextClozeState.blankSlotIds.length) {
                setGuidedModeStatus("complete");
            }
            return;
        }

        const nextState = submitGuidedStepInput(
            getGuidedSessionSnapshot(),
            guidedScript,
            inputOverride ?? guidedInput,
        );
        applyGuidedSessionSnapshot(nextState);
        setGuidedInput("");
    }, [applyGuidedSessionSnapshot, getGuidedSessionSnapshot, guidedClozeState, guidedCurrentStepIndex, guidedInnerMode, guidedInput, guidedScript]);

    const handleGuidedInputChange = useCallback((value: string) => {
        setGuidedInput(value);

        if (!guidedScript) return;

        if (guidedInnerMode === "gestalt_cloze") {
            const currentBlankSlotId = guidedClozeState?.blankSlotIds[guidedClozeState.currentBlankIndex];
            const currentBlankSlot = guidedScript.slots.find((slot) => slot.id === currentBlankSlotId);
            if (!currentBlankSlot) return;

            if (isGuidedAnswerCorrect({
                ...guidedScript,
                slots: [currentBlankSlot],
            } as GuidedScript, 0, value)) {
                const nextClozeState = submitGuidedClozeInput(guidedClozeState!, guidedScript, value);
                setGuidedClozeState(nextClozeState);
                setGuidedInput("");
                if (nextClozeState.currentBlankIndex >= nextClozeState.blankSlotIds.length) {
                    setGuidedModeStatus("complete");
                }
            }
            return;
        }

        if (isGuidedAnswerCorrect(guidedScript, guidedCurrentStepIndex, value)) {
            const nextState = submitGuidedStepInput(
                getGuidedSessionSnapshot(),
                guidedScript,
                value,
            );
            applyGuidedSessionSnapshot(nextState);
            setGuidedInput("");
            return;
        }
    }, [
        applyGuidedSessionSnapshot,
        guidedClozeState,
        getGuidedSessionSnapshot,
        guidedCurrentStepIndex,
        guidedInnerMode,
        guidedScript,
    ]);

    const handleReturnToBattleFromGuided = useCallback(() => {
        if (guidedScript) {
            setUserTranslation(guidedScript.summary.final_sentence);
        }
        resetGuidedLearningState(true);
    }, [guidedScript, resetGuidedLearningState]);

    const handleCloseGuidedLearning = useCallback(() => {
        resetGuidedLearningState(false);
        onClose?.();
    }, [onClose, resetGuidedLearningState]);

    const handleShowGuidedChoices = useCallback(() => {
        if (guidedInnerMode !== "teacher_guided") return;
        const currentSlot = guidedScript?.slots[guidedCurrentStepIndex];
        if (!currentSlot?.multiple_choice?.length) return;
        setGuidedChoicesVisible(true);
        setGuidedRevealReady(true);
        setGuidedLastFeedback(null);
        setGuidedAiHint(null);
    }, [guidedCurrentStepIndex, guidedInnerMode, guidedScript]);

    const handleSelectGuidedChoice = useCallback((choiceText: string) => {
        if (!guidedScript) return;
        const nextState = submitGuidedChoiceSelection(
            getGuidedSessionSnapshot(),
            guidedScript,
            choiceText,
        );
        applyGuidedSessionSnapshot(nextState);
        setGuidedInput("");
    }, [applyGuidedSessionSnapshot, getGuidedSessionSnapshot, guidedCurrentStepIndex, guidedScript]);

    const handleRevealGuidedAnswer = useCallback(() => {
        if (!guidedScript) return;

        if (guidedInnerMode === "gestalt_cloze") {
            if (!guidedClozeState) return;
            const nextClozeState = revealGuidedClozeCurrentSlot(guidedClozeState, guidedScript);
            setGuidedClozeState(nextClozeState);
            setGuidedInput("");
            if (nextClozeState.currentBlankIndex >= nextClozeState.blankSlotIds.length) {
                setGuidedModeStatus("complete");
            }
            return;
        }

        const nextState = revealGuidedCurrentSlot(getGuidedSessionSnapshot(), guidedScript);
        applyGuidedSessionSnapshot(nextState);
        setGuidedInput("");
    }, [applyGuidedSessionSnapshot, getGuidedSessionSnapshot, guidedClozeState, guidedInnerMode, guidedScript]);

    const handleActivateGuidedRandomFill = useCallback(() => {
        if (!guidedScript) return;
        setGuidedInnerMode("gestalt_cloze");
        setGuidedClozeState(createGuidedClozeState(guidedScript));
        setGuidedInput("");
        setGuidedLastFeedback(null);
        setGuidedAiHint(null);
        setGuidedChoicesVisible(false);
        setGuidedRevealReady(false);
    }, [guidedScript]);

    const handleReturnToTeacherGuided = useCallback(() => {
        setGuidedInnerMode("teacher_guided");
        setGuidedInput("");
        setGuidedChoicesVisible(false);
        setGuidedRevealReady(false);
        setGuidedLastFeedback(null);
        setGuidedAiHint(null);
    }, []);

    const handleRefreshGuidedCloze = useCallback(() => {
        if (!guidedScript) return;
        setGuidedInnerMode("gestalt_cloze");
        setGuidedClozeState(createGuidedClozeState(guidedScript));
        setGuidedInput("");
        setGuidedAiHint(null);
        setGuidedRevealReady(false);
    }, [guidedScript]);

    const handleSubmitDrill = async () => {
        if (showGacha) return;
        if (!userTranslation.trim() || !drillData) return;
        if (shouldBypassBattleRewards({ learningSession: learningSessionActive, guidedModeStatus })) {
            return;
        }
        setIsSubmittingDrill(true);
        let prefetchNextElo: number | null = null;

        try {
            // Use correct Elo based on mode
            const activeElo = mode === 'listening' ? listeningElo : eloRating;

            const response = await fetch("/api/ai/score_translation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: userTranslation,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    current_elo: activeElo || DEFAULT_BASE_ELO,
                    mode,
                    teaching_mode: teachingMode,
                }),
            });
            const data = await response.json();

            // Guard: If API returned an error (no score), show error feedback
            if (!response.ok || data.error || data.score === undefined || data.score === null) {
                console.error("[DrillCore] Scoring API failed:", data.error || "No score returned");
                setDrillFeedback({
                    score: -1,
                    judge_reasoning: "评分服务暂时不可用，请重试。",
                    feedback: ["AI 评分接口超时或出错，请再试一次。"],
                    improved_version: "",
                    _error: true,
                });
                setIsSubmittingDrill(false);
                return;
            }

            setDrillFeedback(data);
            setAnalysisRequested(false);
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

            if (data.score !== undefined) {
                if (hasRatedDrill) {
                    setEloChange(0);
                    return;
                }
                setHasRatedDrill(true);

                // --- Elo Calculation with Mode Separation ---
                const isListening = mode === 'listening';
                const activeElo = isListening ? listeningElo : eloRating;
                const activeStreak = isListening ? listeningStreak : streakCount;

                // --- Advanced Elo Logic (UIUXProMax) ---
                const calculateAdvancedElo = (playerElo: number, difficultyElo: number, actualScore: number, streak: number) => {
                    const expectedScore = 1 / (1 + Math.pow(10, (difficultyElo - playerElo) / 400));
                    const normalizedScore = Math.max(0, Math.min(1, (actualScore - 3) / 7));

                    let kFactor = 40;
                    const isStreak = streak >= 2;
                    let effectiveK = isStreak ? kFactor * 1.25 : kFactor;

                    // --- Smurf Bonus (Fast Track) ---
                    // If a high-Elo player is doing a low-Elo question (expectedScore is high, e.g., 0.8+),
                    // the standard Elo math gives them almost nothing even for a perfect score.
                    // We add a "smurf multiplier" if they actually achieve that near-perfect score (9 or 10).
                    let smurfMultiplier = 1;
                    if (actualScore >= 9 && expectedScore > 0.6) {
                        // The easier the question (higher expectedScore), the higher the multiplier needed to make the tiny gap meaningful.
                        // Max multiplier of 3.5x for perfect scores on absolute easiest questions.
                        smurfMultiplier = 1 + ((expectedScore - 0.6) * 6);
                        effectiveK *= smurfMultiplier;
                    }

                    const rawChange = effectiveK * (normalizedScore - expectedScore);
                    let totalChange = Math.round(rawChange);

                    // --- Floor Guarantee for Perfect Plays ---
                    // Guarantee at least +10 for a perfect 10/10, and +5 for a 9/10, regardless of Elo math,
                    // to ensure the user always feels appropriately rewarded for near-flawless execution.
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
                            bonusChange: totalChange - Math.round(kFactor * (normalizedScore - expectedScore))
                        }
                    };
                };

                const challengeElo = drillData?._difficultyMeta?.requestedElo ?? activeElo ?? DEFAULT_BASE_ELO;
                const result = calculateAdvancedElo(activeElo || DEFAULT_BASE_ELO, challengeElo, data.score, activeStreak);
                let change = result.total;
                let newStreak = activeStreak;

                // --- GAMBLING LOGIC (Crimson Roulette) ---
                // --- GAMBLING LOGIC (Crimson Roulette) ---
                if (gambleState.active && gambleState.wager && gambleState.wager !== 'safe') {
                    const isWin = data.score >= 9.0;

                    if (isWin) {
                        // Calculate Winnings
                        let baseWin = gambleState.wager === 'risky' ? 60 : 150;
                        let multiplier = Math.pow(2.5, gambleState.doubleDownCount); // 2.5x multiplier for every double down!
                        change = Math.round(baseWin * multiplier);

                        // Loot & Sound
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-201.mp3').play().catch(() => { });
                        setLootDrop({ type: 'gem', amount: change, rarity: 'legendary', message: `CRIMSON JACKPOT! x${multiplier}` });

                        // Trigger Double Down if eligible (Max 2 times)
                        if (gambleState.doubleDownCount < 2) {
                            // Delay showing the modal slightly so they see the score first
                            setTimeout(() => setShowDoubleDown(true), 1500);
                        } else {
                            // Max depth reached, reset
                            setTimeout(() => {
                                setGambleState({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
                                setTheme('default');
                            }, 3000);
                        }
                    } else {
                        // Loss Logic
                        let baseLoss = gambleState.wager === 'risky' ? -20 : -50;
                        change = baseLoss * Math.pow(2, gambleState.doubleDownCount);
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });

                        // Reset Deferred to BossScoreReveal Interaction
                        // setGambleState({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
                        // setTheme('default');
                        newStreak = 0;
                    }
                }

                // REAPER BOSS LOGIC
                else if (bossState.active && bossState.type === 'reaper') {
                    // Suppress standard Elo change during the duel
                    change = 0;

                    if (data.score >= 9.0) {
                        // Hit the Boss!
                        const newHp = (bossState.hp || 3) - 1;
                        setBossState(prev => ({ ...prev, hp: newHp }));

                        if (newHp <= 0) {
                            // VICTORY!
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-201.mp3').play().catch(() => { });
                            setLootDrop({ type: 'gem', amount: 50, rarity: 'legendary', message: 'REAPER DEFEATED!' });

                            // HUGE REWARD
                            change = 50;

                            setBossState(prev => ({ ...prev, active: false }));
                            setTheme('default');
                        } else {
                            // Boss damaged
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-dagger-woosh-1487.mp3').play().catch(() => { });
                            setLootDrop({ type: 'exp', amount: 0, rarity: 'rare', message: 'BOSS HIT! Keep going!' });
                        }
                    } else {
                        // PLAYER TAKES DAMAGE
                        const newPlayerHp = (bossState.playerHp || 3) - 1;
                        setBossState(prev => ({ ...prev, playerHp: newPlayerHp }));

                        if (newPlayerHp <= 0) {
                            // --- DEATH EXECUTION ---
                            setDeathAnim('slash');
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-sword-slash-swoosh-1476.mp3').play().catch(() => { });

                            // Delay reset to show animation
                            setTimeout(() => {
                                setBossState(prev => ({ ...prev, active: false }));
                                setTheme('default');
                                newStreak = 0;
                                setDeathAnim(null);
                            }, 3000);

                            // PUNISHMENT
                            change = -50;
                        } else {
                            // Warning Hit
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
                            setShake(true);
                        }
                    }
                }

                // --- POST-ROULETTE SETTLEMENT ---
                if (rouletteSession) {
                    if (rouletteSession.result === 'safe') {
                        // SURVIVOR: Symmetrical Multiplier
                        change = Math.round(change * rouletteSession.multiplier);
                        if (data.score >= 9.0) {
                            setLootDrop({ type: 'gem', amount: change, rarity: 'legendary', message: `🎰 SURVIVOR JACKPOT x${rouletteSession.multiplier}!` });
                        } else {
                            // Loss also multiplied
                            setLootDrop({ type: 'exp', amount: change, rarity: 'common', message: `🎰 GAMBLE FAILED! x${rouletteSession.multiplier} LOSS` });
                        }
                    } else if (rouletteSession.result === 'dead') {
                        // EXECUTION: Redemption or Double Death
                        if (data.score >= 9.0) {
                            change = 25; // Redemption Reward
                            setLootDrop({ type: 'gem', amount: 25, rarity: 'rare', message: '⚖️ REDEMPTION GRANTED!' });
                        } else {
                            change = -50;
                            setLootDrop({ type: 'exp', amount: -50, rarity: 'common', message: '💀 TOTAL ANNIHILATION!' });
                        }
                    }
                    setRouletteSession(null);
                }

                setEloBreakdown(result.breakdown);

                if (data.score >= 9) {
                    newStreak += 1;
                    if (newStreak >= 3) change += 2;

                    // Fever Logic
                    const newCombo = comboCount + 1;
                    setComboCount(newCombo);
                    if (newCombo >= 3 && !feverMode && mode === 'listening') {
                        setFeverMode(true);
                        setTheme('fever');
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-futuristic-robotic-blip-hit-695.mp3').play().catch(() => { });
                    }

                    // Loot Logic - DISABLED per user request
                    // (Only Boss/Gamble/Damage events trigger notifications now)
                } else {
                    newStreak = 0;
                    setComboCount(0);
                    if (feverMode) {
                        setFeverMode(false);
                        setTheme('default');
                        // Fever Break Sound
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-game-over-dark-orchestra-633.mp3').play().catch(() => { });
                    }
                }

                // === Elo Update Logic (ALWAYS EXECUTED) ===
                const newElo = Math.max(0, (activeElo || DEFAULT_BASE_ELO) + change);
                prefetchNextElo = newElo;

                // Rank Change Detection
                const oldRank = getRank(activeElo || DEFAULT_BASE_ELO);
                const newRank = getRank(newElo);
                if (newRank.title !== oldRank.title && change > 0) {
                    // Rank UP!
                    setRankUp({ oldRank: oldRank, newRank: newRank });
                    new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3').play().catch(() => { });
                } else if (newRank.title !== oldRank.title && change < 0) {
                    // Rank DOWN!
                    setRankDown({ oldRank: oldRank, newRank: newRank });
                    new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
                }

                // Update Local State
                if (isListening) {
                    setListeningElo(newElo);
                    setListeningStreak(newStreak);
                } else {
                    setEloRating(newElo);
                    setStreakCount(newStreak);
                }
                setEloChange(change);

                // --- Hint Economy Coin Accumulation ---
                let earnedCoins = 0;

                // Base salary based on score
                if (data.score < 6) earnedCoins += 2;
                else if (data.score <= 8) earnedCoins += 5;
                else earnedCoins += 10;

                // Streak bonuses
                if (newStreak >= 10) earnedCoins += 20;
                else if (newStreak >= 5) earnedCoins += 10;
                else if (newStreak >= 3) earnedCoins += 5;

                // Critical Hit (10% chance to 5x base reward)
                let isCritical = false;
                if (Math.random() < 0.1) {
                    earnedCoins *= 5;
                    isCritical = true;
                    // Critical hit sound
                    new Audio('https://assets.mixkit.co/sfx/preview/mixkit-coins-handling-735.mp3').play().catch(() => { });
                }

                // Total update
                let finalCoins = coinsRef.current + earnedCoins;

                // --- HIDDEN BOUNTIES ---
                let bountyCoins = 0;
                let bountyMessage = "";
                let bountyRarity: 'rare' | 'legendary' = 'rare';

                // 1. "破壁者" (Wallbreaker): Beat a significantly higher difficulty (expected score <= 0.3, actual >= 9.0)
                if (result.breakdown.expectedScore <= 0.3 && data.score >= 9.0) {
                    bountyCoins = 88;
                    bountyMessage = "🏆 破壁者！越级挑战无伤通关！+88 ✨";
                    bountyRarity = 'legendary';
                }
                // 2. "涅槃重生" (Phoenix): Recovering from two low scores (<6) with a perfect >9 score
                else if (recentScores.length >= 2 && recentScores[recentScores.length - 1] < 6 && recentScores[recentScores.length - 2] < 6 && data.score >= 9.0) {
                    bountyCoins = 100;
                    bountyMessage = "🔥 涅槃重生！触底绝地反击！+100 ✨";
                    bountyRarity = 'legendary';
                }
                // 3. "词汇刺客" (Vocabulary Assassin): Using advanced vocabulary perfectly (Perfect 10 with 20% flat chance)
                else if (data.score === 10 && Math.random() < 0.2) {
                    bountyCoins = 50;
                    bountyMessage = "🥷 词汇刺客！母语级精准表达！+50 ✨";
                    bountyRarity = 'legendary';
                }

                if (bountyCoins > 0) {
                    earnedCoins += bountyCoins;
                    finalCoins += bountyCoins;
                    setLootDrop({ type: 'gem', amount: bountyCoins, rarity: bountyRarity, message: bountyMessage });
                    new Audio('https://assets.mixkit.co/sfx/preview/mixkit-ethereal-fairy-win-sound-2019.mp3').play().catch(() => { });
                }

                // Show LootDrop for regular Coins (if no bounty and no boss loot)
                const hasExistingLoot = bossState.type === 'reaper' && bossState.hp === 1 && data.score >= 9.0;

                // --- GACHA TRIGGER ---
                let gachaTriggered = false;
                if (!hasExistingLoot && shouldTriggerGacha({
                    mode,
                    score: data.score,
                    learningSession: learningSessionActive,
                    roll: Math.random(),
                })) {
                    gachaTriggered = true;
                    setTimeout(() => {
                        setGachaCards(buildGachaPack());
                        setSelectedGachaCardId(null);
                        setGachaClaimTarget(null);
                        setShowGacha(true);
                        // Intro Sound
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-ethereal-fairy-win-sound-2019.mp3').play().catch(() => { });
                    }, bountyCoins > 0 ? 2500 : 1000); // delay so they see score first
                }

                if (!hasExistingLoot && !gachaTriggered && earnedCoins > 0 && bountyCoins === 0) {
                    if (isCritical) {
                        setLootDrop({ type: 'gem', amount: earnedCoins, rarity: 'legendary', message: '✨ 绝佳！打工薪水超级暴击！' });
                    } else {
                        pushEconomyFx({ kind: 'coin_gain', amount: earnedCoins, message: `+${earnedCoins} 星光币`, source: 'reward' });
                    }
                }

                finalCoins = applyEconomyPatch({
                    coinsDelta: earnedCoins,
                }).coins;
                // Update recent scores array (keep last 5)
                setRecentScores(prev => [...prev.slice(-4), data.score]);

                const profile = await loadLocalProfile();
                if (profile) {
                    const maxElo = isListening
                        ? Math.max(profile.listening_max_elo || DEFAULT_BASE_ELO, newElo)
                        : Math.max(profile.max_elo, newElo);

                    await settleBattle({
                        mode: isListening ? 'listening' : 'translation',
                        eloAfter: newElo,
                        change,
                        streak: newStreak,
                        maxElo,
                        coins: finalCoins,
                        inventory: inventoryRef.current,
                        ownedThemes: ownedThemes,
                        activeTheme: cosmeticTheme,
                        source: learningSessionActive ? 'guided_session' : 'battle',
                    });
                }

                if (context.type === 'article' && mode === 'translation' && userTranslation.trim()) {
                    await saveWritingHistory({
                        articleTitle: drillData._topicMeta?.topic || context.articleTitle || context.topic || 'General',
                        content: userTranslation.trim(),
                        score: data.score,
                        timestamp: Date.now(),
                    });
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmittingDrill(false);

            // --- BACKGROUND PREFETCH LOGIC (Evaluation-time) ---
            // Only prefetch after a successful score produced a fresh Elo for the next question.
            if (drillData && userTranslation.trim() && prefetchNextElo !== null) {
                prefetchNextDrill(prefetchNextElo);
            }
        }
    };

    const handleGenerateAnalysis = async () => {
        if (!drillData || !drillFeedback || isGeneratingAnalysis) return;

        setAnalysisRequested(true);
        setIsGeneratingAnalysis(true);
        setAnalysisError(null);
        setAnalysisDetailsOpen(false);
        setFullAnalysisRequested(false);
        setIsGeneratingFullAnalysis(false);
        setFullAnalysisError(null);
        setFullAnalysisOpen(false);
        setFullAnalysisData(null);

        try {
            const activeElo = mode === 'listening' ? listeningEloRef.current : eloRatingRef.current;
            const analysisResponse = await fetch("/api/ai/analyze_drill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: userTranslation,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    current_elo: activeElo || DEFAULT_BASE_ELO,
                    score: drillFeedback.score,
                    mode,
                    teaching_mode: teachingMode,
                    detail_level: "basic",
                }),
            });
            const data = await analysisResponse.json();

            if (!analysisResponse.ok || data.error) {
                throw new Error(data.error || "解析生成失败");
            }

            setDrillFeedback(prev => prev ? { ...prev, ...data } : prev);
        } catch (error) {
            const message = error instanceof Error ? error.message : "解析生成失败";
            setAnalysisError(message);
        } finally {
            setIsGeneratingAnalysis(false);
        }
    };

    const handleGenerateFullAnalysis = async () => {
        if (!drillData || !drillFeedback || mode !== "translation" || isGeneratingFullAnalysis) return;

        setFullAnalysisRequested(true);
        setIsGeneratingFullAnalysis(true);
        setFullAnalysisError(null);

        try {
            const activeElo = eloRatingRef.current;
            const analysisResponse = await fetch("/api/ai/analyze_drill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: userTranslation,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    current_elo: activeElo || DEFAULT_BASE_ELO,
                    score: drillFeedback.score,
                    mode,
                    teaching_mode: teachingMode,
                    detail_level: "full",
                }),
            });
            const data = await analysisResponse.json();

            if (!analysisResponse.ok || data.error) {
                throw new Error(data.error || "完整解析生成失败");
            }

            setFullAnalysisData(data);
            setFullAnalysisOpen(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : "完整解析生成失败";
            setFullAnalysisError(message);
        } finally {
            setIsGeneratingFullAnalysis(false);
        }
    };

    const handleGenerateReferenceGrammar = async () => {
        if (
            !drillData ||
            mode !== "translation" ||
            !drillData.reference_english.trim() ||
            isGeneratingGrammar
        ) {
            return;
        }

        setIsGeneratingGrammar(true);
        setGrammarError(null);
        setReferenceGrammarDisplayMode("core");

        try {
            const response = await fetch("/api/ai/grammar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: drillData.reference_english,
                    mode: "basic",
                }),
            });
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "语法分析生成失败");
            }

            const sentences = Array.isArray(data?.difficult_sentences)
                ? data.difficult_sentences as GrammarSentenceAnalysis[]
                : [];

            setReferenceGrammarAnalysis(sentences);
        } catch (error) {
            const message = error instanceof Error ? error.message : "语法分析生成失败";
            setGrammarError(message);
            setReferenceGrammarAnalysis(null);
            setReferenceGrammarDisplayMode("core");
        } finally {
            setIsGeneratingGrammar(false);
        }
    };

    const inferTeachingPoint = () => {
        const chinese = drillData?.chinese || "";
        const english = drillFeedback?.improved_version || drillData?.reference_english || "";
        const signal = `${chinese} ${english}`.toLowerCase();

        if (/(如果|假如|除非|只要)/.test(chinese) || /\bif\b|\bunless\b|\bprovided\b/.test(signal)) {
            return "条件句与逻辑关系";
        }
        if (/(当|后|之前|以后|时候|一.+就)/.test(chinese) || /\bwhen\b|\bafter\b|\bbefore\b|\bonce\b|\buntil\b/.test(signal)) {
            return "时间从句与时序表达";
        }
        if (/\bignite\b|\bspark\b|\bbetween\b|\bromantic\b/.test(signal)) {
            return "词汇搭配与语气";
        }
        return "语序与自然表达";
    };

    const inferTutorIntent = (questionType: TutorQuestionType, teachingPoint: string): TutorIntent => {
        if (questionType === "word_choice" || /词汇|搭配/.test(teachingPoint)) return "lexical";
        if (/语序|从句|时态|语法/.test(teachingPoint)) return "grammar";
        return "translate";
    };

    const inferFocusSpan = (question: string) => {
        const quoted = question.match(/[“"](.*?)[”"]/)?.[1]?.trim();
        if (quoted) return quoted.slice(0, 40);
        const englishWord = question.match(/[A-Za-z][A-Za-z'-]{2,}/)?.[0]?.trim();
        if (englishWord) return englishWord;
        const chinesePhrase = question.match(/[\u4e00-\u9fa5]{2,}/)?.[0]?.trim();
        return chinesePhrase ? chinesePhrase.slice(0, 16) : "";
    };

    const normalizeTutorResponse = (raw: unknown, fallbackTeachingPoint: string): TutorStructuredResponse => {
        const readString = (value: unknown) => typeof value === "string" ? value.trim() : "";
        const asObject = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const rawTags = Array.isArray(asObject.error_tags) ? asObject.error_tags : [];
        const errorTags = rawTags
            .map((item) => readString(item).toLowerCase())
            .filter(Boolean)
            .slice(0, 4);
        const rawQualityFlags = Array.isArray(asObject.quality_flags) ? asObject.quality_flags : [];
        const qualityFlags = rawQualityFlags
            .map((item) => readString(item))
            .filter(Boolean)
            .slice(0, 6);

        return {
            coach_markdown:
                readString(asObject.coach_markdown) ||
                readString(asObject.coach_cn) ||
                "1. **先保主干意思**。\n2. 这次只补一个关键表达点。\n3. 先把这一点说顺，再决定要不要看整句。",
            response_intent: readString(asObject.response_intent) as TutorStructuredResponse["response_intent"],
            answer_revealed: Boolean(asObject.answer_revealed),
            full_answer: readString(asObject.full_answer) || undefined,
            answer_reason_cn: readString(asObject.answer_reason_cn) || undefined,
            teaching_point: readString(asObject.teaching_point) || fallbackTeachingPoint,
            error_tags: errorTags,
            quality_flags: qualityFlags,
        };
    };

    const openTutorModal = useCallback(() => {
        setIsTutorOpen(true);
    }, []);

    useEffect(() => {
        if (!isTutorOpen) return;

        const frame = window.requestAnimationFrame(() => {
            const container = tutorConversationRef.current;
            if (!container) return;
            container.scrollTo({
                top: container.scrollHeight,
                behavior: tutorThread.length > 0 ? "smooth" : "auto",
            });
        });

        return () => window.cancelAnimationFrame(frame);
    }, [isTutorOpen, tutorPendingQuestion, tutorThread.length]);

    const handleAskTutor = async (options?: {
        question?: string;
        questionType?: TutorQuestionType;
        forceReveal?: boolean;
    }) => {
        const question = (options?.question ?? tutorQuery).trim();
        if (!question || !drillData) return;
        if (coinsRef.current < 10) {
            setTutorAnswer("AI Teacher 每次提问会消耗 10 星光币。你当前星光币不够了。");
            setTutorPendingQuestion(null);
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: 'AI Teacher 提问需要 10 星光币' });
            return;
        }
        setIsAskingTutor(true);
        setTutorPendingQuestion(question);
        setTutorQuery("");
        setTutorAnswer("");

        const teachingPoint = tutorResponse?.teaching_point || inferTeachingPoint();
        const requestedType = options?.questionType ?? "follow_up";
        const unlockRequested = requestedType === "unlock_answer" || options?.forceReveal === true;
        const shouldReveal = unlockRequested;
        const outgoingQuestionType: TutorQuestionType = shouldReveal ? "unlock_answer" : requestedType;
        const outgoingIntent = inferTutorIntent(outgoingQuestionType, teachingPoint);
        const outgoingFocusSpan = inferFocusSpan(question);

        try {
            applyEconomyPatch({ coinsDelta: -10 });
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: 'AI Teacher 提问 -10 星光币' });
            const response = await fetch("/api/ai/ask_tutor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "ask" as TutorAction,
                    query: question,
                    questionType: outgoingQuestionType,
                    uiSurface: "battle",
                    intent: outgoingIntent,
                    focusSpan: outgoingFocusSpan,
                    userAttempt: userTranslation,
                    improvedVersion: drillFeedback?.improved_version,
                    score: drillFeedback?.score,
                    recentTurns: tutorThread.slice(-4).map((item) => ({
                        question: item.question,
                        answer: item.coach_markdown,
                    })),
                    recentMastery: tutorRecentMastery,
                    teachingPoint,
                    revealAnswer: shouldReveal,
                    drillContext: drillData,
                    articleTitle: drillData._topicMeta?.topic || context.articleTitle || context.topic,
                    stream: true,
                }),
            });

            if (!response.ok) {
                throw new Error("Tutor 请求失败");
            }

            let normalized: TutorStructuredResponse | null = null;
            const contentType = response.headers.get("content-type") || "";

            if (contentType.includes("text/event-stream") && response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let streamedCoach = "";

                const applyStreamingCoach = (coach: string) => {
                    setTutorAnswer(coach);
                    setTutorResponse((prev) => ({
                        coach_markdown: coach,
                        response_intent: prev?.response_intent,
                        answer_revealed: prev?.answer_revealed ?? false,
                        full_answer: prev?.full_answer,
                        answer_reason_cn: prev?.answer_reason_cn,
                        teaching_point: prev?.teaching_point ?? teachingPoint,
                        error_tags: prev?.error_tags ?? [],
                        quality_flags: prev?.quality_flags ?? [],
                    }));
                };

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    let boundaryIndex = buffer.indexOf("\n\n");
                    while (boundaryIndex !== -1) {
                        const message = buffer.slice(0, boundaryIndex);
                        buffer = buffer.slice(boundaryIndex + 2);
                        boundaryIndex = buffer.indexOf("\n\n");

                        let eventName = "message";
                        let dataLine = "";
                        for (const line of message.split("\n")) {
                            if (line.startsWith("event:")) {
                                eventName = line.slice(6).trim();
                            } else if (line.startsWith("data:")) {
                                dataLine += line.slice(5).trim();
                            }
                        }

                        if (!dataLine || dataLine === "[DONE]") continue;

                        if (eventName === "error") {
                            if (streamedCoach) {
                                normalized = normalizeTutorResponse(
                                    { coach_markdown: streamedCoach, teaching_point: teachingPoint, answer_revealed: shouldReveal },
                                    teachingPoint
                                );
                                continue;
                            }
                            setTutorAnswer("AI Teacher 刚才的流式讲解中断了。你可以直接再问一次，或者换个更具体的卡点来问。");
                            setTutorPendingQuestion(null);
                            continue;
                        }

                        if (eventName === "chunk") {
                            try {
                                const parsedChunk = JSON.parse(dataLine) as { coach_markdown?: string };
                                if (typeof parsedChunk.coach_markdown === "string" && parsedChunk.coach_markdown.trim()) {
                                    streamedCoach = parsedChunk.coach_markdown.trim();
                                    applyStreamingCoach(streamedCoach);
                                }
                            } catch {
                                continue;
                            }
                        }

                        if (eventName === "final") {
                            try {
                                const parsedFinal = JSON.parse(dataLine);
                                normalized = normalizeTutorResponse(parsedFinal, teachingPoint);
                            } catch {
                                continue;
                            }
                        }
                    }
                }

                if (!normalized && streamedCoach) {
                    normalized = normalizeTutorResponse(
                        { coach_markdown: streamedCoach, teaching_point: teachingPoint, answer_revealed: shouldReveal },
                        teachingPoint
                    );
                }
            } else {
                const data = await response.json();
                if (data?.error) {
                    throw new Error(data.error);
                }
                normalized = normalizeTutorResponse(data, teachingPoint);
            }

            if (!normalized) {
                throw new Error("暂时没有拿到回复，请再问一次。");
            }

            setTutorResponse(normalized);
            setTutorAnswer(normalized.coach_markdown);
            rememberTutorMastery(normalized, outgoingFocusSpan);
            setTutorThread((prev) => [
                ...prev,
                {
                    question,
                    question_type: outgoingQuestionType,
                    ...normalized,
                },
            ].slice(-6));
            setTutorPendingQuestion(null);
        } catch (error) {
            console.error(error);
            setTutorAnswer("AI Teacher 暂时不可用，请稍后重试。");
            setTutorPendingQuestion(null);
            applyEconomyPatch({ coinsDelta: 10 });
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: 'AI Teacher 提问失败，已退还 10 星光币' });
        } finally {
            setIsAskingTutor(false);
        }
    };

    const handlePlayTutorCardAudio = useCallback(async (text: string) => {
        const normalizedText = text.trim();
        if (!normalizedText) return;

        try {
            const response = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: normalizedText }),
            });
            const data = await response.json();
            if (!response.ok || !data?.audio) {
                throw new Error("播放失败");
            }

            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }

            const nextAudio = new Audio(data.audio);
            audioRef.current = nextAudio;
            await nextAudio.play();
        } catch (error) {
            console.error("[AI Teacher] audio playback failed", error);
        }
    }, []);

    const rememberTutorMastery = useCallback((response: TutorStructuredResponse, focusSpan: string) => {
        const additions: string[] = [];

        if (focusSpan.trim()) additions.push(focusSpan.trim());
        if (response.teaching_point.trim()) additions.push(response.teaching_point.trim());

        setTutorRecentMastery((prev) => {
            const seen = new Set<string>();
            const merged = [...prev, ...additions]
                .map((item) => item.trim())
                .filter((item) => item && item.length <= 24)
                .filter((item) => {
                    if (seen.has(item)) return false;
                    seen.add(item);
                    return true;
                });

            return merged.slice(-8);
        });
    }, []);

    const openShopForItem = useCallback((itemId: ShopItemId, message?: string) => {
        setShopFocusedItem(itemId);
        setShowShopModal(true);

        if (message) {
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message });
        }
    }, []);

    const handleMagicHint = async () => {
        if (learningSessionActive) return;
        if (!drillData || !drillData.reference_english) return;
        if (isHintLoading) return;
        if (getItemCount('hint_ticket') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: 'Hint 道具不足，请先去商场购买' });
            return;
        }

        setIsHintLoading(true);

        try {
            applyEconomyPatch({ itemDelta: { hint_ticket: -1 } });
            const fullReference = drillData.reference_english.trim();
            setFullReferenceHint(prev => ({ version: prev.version + 1, text: fullReference }));
            pushEconomyFx({ kind: 'item_consume', itemId: 'hint_ticket', amount: 1, message: '已消耗 1 Hint 道具', source: 'hint' });
        } catch (error) {
            console.error('[Hint] Failed to generate hint:', error);
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: '提示生成失败，请重试' });
        } finally {
            setIsHintLoading(false);
        }
    };

    const handleRevealVocabHint = useCallback(() => {
        if (learningSessionActive) return false;
        if (!drillData) return false;
        const keywords = (drillData.target_english_vocab || drillData.key_vocab || []) as string[];
        if (keywords.length === 0) return false;
        if (vocabHintRevealRef.current) return true;

        if (getItemCount('vocab_ticket') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: '关键词提示券不足，请先去商场购买' });
            return false;
        }

        vocabHintRevealRef.current = true;
        applyEconomyPatch({ itemDelta: { vocab_ticket: -1 } });
        setIsVocabHintRevealed(true);
        pushEconomyFx({ kind: 'item_consume', itemId: 'vocab_ticket', amount: 1, message: '已消耗 1 关键词券', source: 'vocab' });
        return true;
    }, [applyEconomyPatch, drillData, getItemCount, learningSessionActive, pushEconomyFx]);

    const handlePredictionRequest = useCallback(() => {
        if (learningSessionActive) return false;
        if (getItemCount('capsule') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            return false;
        }

        return true;
    }, [getItemCount, learningSessionActive]);

    const handlePredictionShown = useCallback(() => {
        if (learningSessionActive) return;
        applyEconomyPatch({ itemDelta: { capsule: -1 } });
        pushEconomyFx({ kind: 'item_consume', itemId: 'capsule', amount: 1, message: '已消耗 1 胶囊', source: 'tab' });
    }, [applyEconomyPatch, learningSessionActive, pushEconomyFx]);

    const handleTranslationReferencePlayback = async () => {
        if (learningSessionActive) return false;
        if (mode !== 'translation' || !drillData?.reference_english || drillFeedback) {
            await playAudio();
            return;
        }

        if (isAudioLoading) return;

        if (translationAudioUnlockRef.current) {
            await playAudio();
            return;
        }

        if (getItemCount('audio_ticket') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            openShopForItem('audio_ticket', '朗读券不足，请先去商场购买');
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
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: '参考句播放失败，已退还 1 张朗读券' });
            return;
        }

        pushEconomyFx({ kind: 'item_consume', itemId: 'audio_ticket', amount: 1, message: '已消耗 1 朗读券', source: 'audio' });
    };

    const handleRefreshDrill = useCallback(() => {
        if (learningSessionActive) return false;
        if (isGeneratingDrill || !drillData || !!drillFeedback) return false;
        if (getItemCount('refresh_ticket') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            openShopForItem('refresh_ticket', '刷新卡不足，请先去商场购买');
            return false;
        }

        applyEconomyPatch({ itemDelta: { refresh_ticket: -1 } });
        pushEconomyFx({ kind: 'item_consume', itemId: 'refresh_ticket', amount: 1, message: '已消耗 1 刷新卡', source: 'refresh' });
        setPrefetchedDrillData(null);
        handleGenerateDrill(undefined, undefined, true);
        return true;
    }, [applyEconomyPatch, drillData, drillFeedback, getItemCount, handleGenerateDrill, isGeneratingDrill, learningSessionActive, openShopForItem, pushEconomyFx]);

    const handleBuyItem = useCallback((itemId: ShopItemId) => {
        const item = ITEM_CATALOG[itemId];
        if (coinsRef.current < item.price) return false;

        applyEconomyPatch({
            coinsDelta: -item.price,
            itemDelta: { [itemId]: 1 },
        });
        pushEconomyFx({ kind: 'item_purchase', itemId, amount: 1, message: `已购买 ${item.name}`, source: 'shop' });
        return true;
    }, [applyEconomyPatch, pushEconomyFx]);

    const handleBuyTheme = useCallback((themeId: CosmeticThemeId) => {
        const themeDef = COSMETIC_THEMES[themeId];
        if (!themeDef || ownedThemes.includes(themeId)) return false;
        if (coinsRef.current < themeDef.price) return false;

        applyEconomyPatch({ coinsDelta: -themeDef.price });
        const nextOwned = [...ownedThemes, themeId];
        setOwnedThemes(nextOwned);
        setCosmeticTheme(themeId);
        persistProfilePatch({ owned_themes: nextOwned, active_theme: themeId });
        return true;
    }, [applyEconomyPatch, ownedThemes, persistProfilePatch]);

    const handleSwitchTheme = useCallback((themeId: CosmeticThemeId) => {
        if (!ownedThemes.includes(themeId)) return;
        setCosmeticTheme(themeId);
        persistProfilePatch({ active_theme: themeId });
    }, [ownedThemes, persistProfilePatch]);

    // --- Interactive Renderers (Ported) ---

    const handleWordClick = (e: React.MouseEvent, word: string, contextText?: string) => {
        e.stopPropagation();
        const cleanWord = word.replace(/[^a-zA-Z]/g, "").trim();
        if (!cleanWord) return;

        if (mode === "listening" && drillData?.reference_english) {
            const textKey = "SENTENCE_" + drillData.reference_english;
            const cached = audioCache.current.get(textKey);

            if (cached && cached.marks && audioRef.current) {
                const targetMark = cached.marks.find((m: any) => {
                    const mClean = m.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
                    return mClean === cleanWord.toLowerCase();
                });
                if (targetMark && isPlaying) {
                    audioRef.current.currentTime = targetMark.time / 1000;
                    return;
                }
            }
        }

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setWordPopup({
            word: cleanWord,
            context: contextText || drillData?.reference_english || "",
            x: rect.left + rect.width / 2,
            y: rect.bottom + 10
        });
    };

    const renderInteractiveText = (text: string) => {
        // Safety check: return empty if text is undefined/null
        if (!text) return null;

        // Find existing marks for this text
        const textKey = "SENTENCE_" + (drillData?.reference_english || "");
        const cached = audioCache.current.get(textKey);
        const marks = cached?.marks || [];

        return text.split(" ").map((word, i) => {
            const clean = word.replace(/[^a-zA-Z]/g, "").trim();
            const isActive = wordPopup?.word === clean;

            // Karaoke Highlight Check (Index-based to prevent duplicates)
            const mark = marks[i];
            const isKaraokeActive = isPlaying && !isActive && mark && (() => {
                const mClean = mark.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
                const wordMatch = mClean === clean.toLowerCase();
                const timeMatch = currentAudioTime >= mark.start && currentAudioTime <= (mark.end + 200);
                return wordMatch && timeMatch;
            })();

            return (
                <span key={i} className="relative inline-block">
                    <span
                        onClick={(e) => handleWordClick(e, word, text)}
                        className={cn(
                            "cursor-pointer px-1.5 py-0.5 transition-all duration-300 rounded-lg mx-[1px] relative",
                            "hover:text-rose-600 hover:bg-rose-50/60 hover:scale-105",
                            isActive ? "text-rose-700 bg-rose-100 ring-2 ring-rose-200 shadow-sm scale-110 z-10 font-bold" : "",
                            isKaraokeActive
                                ? "text-rose-600 bg-rose-50/80 backdrop-blur-sm font-bold shadow-[0_0_15px_rgba(244,63,94,0.15)] ring-1 ring-rose-100/50 scale-110 z-10"
                                : "text-stone-700"
                        )}
                    >
                        {word}
                    </span>
                    {" "}
                </span>
            );
        });
    };

    const renderInteractiveCoachText = (text: string) => {
        if (!text) return null;

        return text.split(" ").map((word, i) => {
            const clean = word.replace(/[^a-zA-Z]/g, "").trim();
            const isActive = clean && wordPopup?.word?.toLowerCase() === clean.toLowerCase();

            return (
                <span key={`${word}-${i}`} className="inline-block">
                    <span
                        onClick={(e) => handleWordClick(e, word, text)}
                        className={cn(
                            "cursor-pointer rounded-lg px-1 py-0.5 transition-all duration-200",
                            "hover:bg-indigo-100/80 hover:text-indigo-800",
                            isActive ? "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200" : "text-indigo-900"
                        )}
                    >
                        {word}
                    </span>{" "}
                </span>
            );
        });
    };

    const renderDiff = () => {
        if (!drillData || !drillFeedback) return null;

        if (mode === "listening" && drillFeedback.segments) {
            const pronounceWord = (word: string) => {
                const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${word}&type=2`);
                audio.play().catch(() => { });
            };

            return (
                <div className="space-y-4">
                    <div className="p-4 bg-stone-50 rounded-xl border border-stone-100">
                        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Mic className="w-3 h-3" /> 你的原文
                        </div>
                        <p className="font-newsreader text-xl text-stone-600 leading-relaxed">"{userTranslation}"</p>
                    </div>

                    <div className="p-5 bg-white/60 rounded-2xl border border-stone-100 shadow-sm">
                        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <BookOpen className="w-3 h-3" />
                            对照修订 <span className="text-stone-300 font-normal ml-2">点击单词可发音</span>
                        </div>
                        <div className="font-newsreader text-2xl leading-loose text-stone-800 flex flex-wrap gap-x-1 gap-y-2">
                            {drillFeedback.segments.map((seg, i) => {
                                if (seg.status === "correct" || seg.status === "variation") {
                                    return <span key={i} className="text-emerald-700 cursor-pointer hover:bg-emerald-50 px-0.5 rounded transition-colors" onClick={() => pronounceWord(seg.word)}>{seg.word}</span>;
                                }
                                if (seg.status === "missing") {
                                    return (
                                        <span key={i} className="relative group cursor-pointer" onClick={() => pronounceWord(seg.word)}>
                                            <span className="text-rose-500 font-semibold underline decoration-wavy decoration-rose-300 hover:bg-rose-50 px-0.5 rounded transition-colors">{seg.word}</span>
                                            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] bg-rose-500 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">漏读</span>
                                        </span>
                                    );
                                }
                                if (seg.status === "phonetic_error") {
                                    return (
                                        <span key={i} className="relative group cursor-pointer" onClick={() => pronounceWord(seg.word)}>
                                            <span className="text-amber-600 font-semibold hover:bg-amber-50 px-0.5 rounded transition-colors">{seg.word}</span>
                                            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-amber-500 bg-amber-50 px-1 rounded border border-amber-200 opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">你说: {seg.user_input}</span>
                                        </span>
                                    );
                                }
                                return (
                                    <span key={i} className="relative group cursor-pointer" onClick={() => pronounceWord(seg.word)}>
                                        <span className="text-rose-600 font-semibold underline decoration-rose-300 decoration-2 hover:bg-rose-50 px-0.5 rounded transition-colors">{seg.word}</span>
                                        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-rose-400 line-through opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">{seg.user_input || "???"}</span>
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }

        const normalize = (str: string) => str.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").replace(/\s{2,}/g, " ").trim();
        const cleanUser = mode === "listening" ? normalize(userTranslation) : userTranslation;
        const cleanTarget = mode === "listening" ? normalize(drillData.reference_english) : drillData.reference_english;
        const diffs = Diff.diffWords(cleanUser, cleanTarget);

        const elements = [];
        for (let i = 0; i < diffs.length; i++) {
            const part = diffs[i];
            if (!part.added && !part.removed) {
                elements.push(<span key={i} className="text-stone-800">{part.value}</span>);
            } else if (part.removed) {
                let correction = null;
                if (i + 1 < diffs.length && diffs[i + 1].added) {
                    correction = diffs[i + 1].value;
                    i++;
                }
                elements.push(
                    <span key={i} className="group relative inline-block cursor-help mx-1">
                        <span className="text-rose-600 decoration-2 underline decoration-wavy decoration-rose-300 bg-rose-50/50 rounded px-0.5">{part.value}</span>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] px-3 py-2 bg-stone-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                            <div className="font-bold text-rose-200 mb-0.5">Incorrect</div>
                            {correction ? <><span className="text-emerald-300 font-mono text-sm">{correction}</span></> : <span>Unnecessary word</span>}
                        </div>
                    </span>
                );
            } else if (part.added) {
                elements.push(
                    <span key={i} className="group relative inline-block cursor-help mx-0.5 align-text-bottom">
                        <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-bold border border-emerald-200 hover:scale-110 transition-transform">+</div>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] px-3 py-2 bg-stone-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                            <div className="font-bold text-emerald-300 mb-0.5">Missing Word</div>
                            <span className="font-mono text-sm">{part.value}</span>
                        </div>
                    </span>
                );
            }
        }

        return (
            <div className="space-y-4">
                <div className="p-5 bg-white/60 rounded-2xl border border-stone-100 shadow-sm">
                    <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <BookOpen className="w-3 h-3" />
                        对照修订
                    </div>
                    <div className="font-newsreader text-xl leading-loose text-stone-800 flex flex-wrap gap-x-1 gap-y-2 mb-4">
                        {elements}
                    </div>

                    <div className="pt-4 border-t border-stone-100/80 space-y-3">
                        {drillFeedback.improved_version && (
                            <div>
                                <p className="text-[10px] text-stone-400 font-sans font-bold uppercase mb-1 flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-indigo-400" /> AI 地道改写</p>
                                <p className="text-lg font-newsreader text-indigo-900 leading-relaxed font-medium">{drillFeedback.improved_version}</p>
                            </div>
                        )}
                        <div>
                            <div className="mb-1 flex items-center justify-between gap-3">
                                <p className="text-[10px] text-stone-400 font-sans font-bold uppercase">Standard Reference (参考答案)</p>
                                {referenceGrammarAnalysis ? (
                                    <div className="flex items-center rounded-full border border-[#dfcfab] bg-white/85 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                        <button
                                            type="button"
                                            onClick={() => setReferenceGrammarDisplayMode("core")}
                                            className={cn(
                                                "rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] transition-all",
                                                referenceGrammarDisplayMode === "core"
                                                    ? "bg-[#f3e2b5] text-[#6b4c18] shadow-[0_6px_16px_rgba(160,122,42,0.18)]"
                                                    : "text-stone-500 hover:bg-[#fcf7eb] hover:text-stone-700",
                                            )}
                                        >
                                            主干
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReferenceGrammarDisplayMode("full")}
                                            className={cn(
                                                "rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] transition-all",
                                                referenceGrammarDisplayMode === "full"
                                                    ? "bg-[#f3e2b5] text-[#6b4c18] shadow-[0_6px_16px_rgba(160,122,42,0.18)]"
                                                    : "text-stone-500 hover:bg-[#fcf7eb] hover:text-stone-700",
                                            )}
                                        >
                                            完整分析
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                            {isGeneratingGrammar ? (
                                <div className="rounded-[20px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,250,241,0.96),rgba(249,243,228,0.92))] px-4 py-3 text-xs text-[#8a5d1f] shadow-[0_12px_28px_rgba(120,94,42,0.06)]">
                                    语法分析生成中...
                                </div>
                            ) : referenceGrammarAnalysis ? (
                                <div className="rounded-[24px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(249,244,231,0.94))] px-4 py-4 shadow-[0_18px_44px_rgba(120,94,42,0.08)]">
                                    <p className="text-base font-newsreader text-stone-700 italic leading-relaxed md:text-[1.075rem]">
                                        &ldquo;
                                        <InlineGrammarHighlights
                                            text={drillData.reference_english}
                                            sentences={referenceGrammarAnalysis}
                                            displayMode={referenceGrammarDisplayMode}
                                            showSegmentTranslation
                                            textClassName="leading-relaxed"
                                        />
                                        &rdquo;
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-[24px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(249,244,231,0.94))] px-4 py-4 shadow-[0_18px_44px_rgba(120,94,42,0.08)]">
                                    <p className="text-base font-newsreader text-stone-700 italic leading-relaxed md:text-[1.075rem]">&ldquo;{drillData.reference_english}&rdquo;</p>
                                </div>
                            )}
                            {grammarError ? (
                                <p className="mt-2 text-xs text-stone-400">参考句语法分析暂时不可用，已回退到普通参考句显示。</p>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const getAnalysisHighlights = () => {
        if (!drillData || !drillFeedback) return [];

        if (mode === "listening" && drillFeedback.segments) {
            return drillFeedback.segments
                .filter(seg => seg.status !== "correct" && seg.status !== "variation")
                .slice(0, 3)
                .map((seg) => {
                    if (seg.status === "missing") {
                        return {
                            kind: "漏读",
                            before: "未读出",
                            after: seg.word,
                            note: "这部分在复述里漏掉了。",
                        };
                    }

                    if (seg.status === "phonetic_error") {
                        return {
                            kind: "发音偏差",
                            before: seg.user_input || "发音不清",
                            after: seg.word,
                            note: "优先把这个词读清楚。",
                        };
                    }

                    return {
                        kind: "听写修正",
                        before: seg.user_input || "识别偏差",
                        after: seg.word,
                        note: "参考标准读法再跟读一次。",
                    };
                });
        }

        const normalize = (str: string) => str.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").replace(/\s{2,}/g, " ").trim();
        const cleanUser = mode === "listening" ? normalize(userTranslation) : userTranslation;
        const cleanTarget = mode === "listening" ? normalize(drillData.reference_english) : drillData.reference_english;
        const diffs = Diff.diffWords(cleanUser, cleanTarget);
        const highlights: Array<{ kind: string; before: string; after: string; note: string }> = [];

        for (let i = 0; i < diffs.length; i++) {
            const part = diffs[i];
            if (part.removed) {
                let correction = "";
                if (i + 1 < diffs.length && diffs[i + 1].added) {
                    correction = diffs[i + 1].value.trim();
                    i++;
                }
                highlights.push({
                    kind: correction ? "关键改错" : "多余表达",
                    before: part.value.trim(),
                    after: correction || "删除这部分",
                    note: correction ? "这里需要替换成更准确的形式。" : "这部分在标准表达里不需要。",
                });
            } else if (part.added) {
                highlights.push({
                    kind: "缺失内容",
                    before: "未写出",
                    after: part.value.trim(),
                    note: "这部分需要补上才完整。",
                });
            }

            if (highlights.length >= 3) {
                break;
            }
        }

        return highlights;
    };

    const getAnalysisLead = () => {
        if (!drillFeedback) return "";
        if (drillFeedback.judge_reasoning) return drillFeedback.judge_reasoning;
        if (Array.isArray(drillFeedback.feedback) && drillFeedback.feedback.length > 0) return drillFeedback.feedback[0];
        if (drillFeedback.feedback?.listening_tips?.length) return drillFeedback.feedback.listening_tips[0];
        if (drillFeedback.feedback?.encouragement) return drillFeedback.feedback.encouragement;
        return "本题解析已生成。";
    };

    const renderTranslationReferenceSentence = () => {
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
    };

    const renderTranslationTutorModal = () => {
        if (mode !== "translation" || !drillData || !isTutorOpen) return null;

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
                onClick={() => setIsTutorOpen(false)}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    onClick={(e) => e.stopPropagation()}
                    className={cn("w-full max-w-[680px] max-h-[min(84vh,760px)] overflow-hidden rounded-[2rem] border p-4 shadow-[0_30px_90px_rgba(15,23,42,0.22)] md:p-5", activeCosmeticUi.tutorPanelClass)}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={cn("text-sm font-semibold flex items-center gap-1.5", activeCosmeticUi.tutorSendClass)}>
                                    <MessageCircle className="w-4 h-4" />
                                    AI Teacher
                                </span>
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                                    {tutorResponse?.teaching_point || inferTeachingPoint()}
                                </span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-stone-500">
                                翻译过程中卡住时，把它当老师来问：先从你已经会的点出发，再帮你补当前词、搭配或句型。
                            </p>
                        </div>
                        <button type="button" onClick={() => setIsTutorOpen(false)} className="rounded-full border border-stone-200 bg-white/80 p-2 text-stone-500 transition-all hover:bg-white hover:text-stone-700">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="mt-4 flex flex-nowrap gap-2 overflow-x-auto pb-1 pr-1">
                        <button
                            type="button"
                            onClick={() => handleAskTutor({ question: "给我一个这题可复用的句型模板。", questionType: "pattern" })}
                            disabled={isAskingTutor}
                            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            给我模板
                        </button>
                        <button
                            type="button"
                            onClick={() => handleAskTutor({
                                question: "这里更自然的说法是什么？只告诉我这个词或搭配怎么用。",
                                questionType: "word_choice",
                            })}
                            disabled={isAskingTutor}
                            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            搭配怎么用
                        </button>
                        <button
                            type="button"
                            onClick={() => handleAskTutor({ question: "再给我一个同结构的例句让我模仿。", questionType: "example" })}
                            disabled={isAskingTutor}
                            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            同结构例句
                        </button>
                    </div>

                    <div ref={tutorConversationRef} className="mt-4 max-h-[calc(min(84vh,760px)-13rem)] overflow-y-auto pr-1">
                        {tutorThread.length || tutorPendingQuestion || tutorAnswer ? (
                            <AiTeacherConversation
                                turns={tutorThread}
                                pendingQuestion={tutorPendingQuestion}
                                pendingAnswer={tutorPendingQuestion ? tutorAnswer : null}
                                fallbackAnswer={!tutorThread.length ? tutorAnswer : null}
                                onPlayCardAudio={handlePlayTutorCardAudio}
                            />
                        ) : (
                            <p className="text-xs text-stone-500">
                                先问一个具体卡点，比如某个词、搭配或语序；老师会先接住你已经会的，再补新的。
                            </p>
                        )}
                    </div>

                    <form
                        className="mt-4 flex flex-col gap-2 sm:flex-row"
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleAskTutor({ questionType: "follow_up" });
                        }}
                    >
                        <input
                            type="text"
                            value={tutorQuery}
                            onChange={(e) => setTutorQuery(e.target.value)}
                            placeholder="继续问这个词、搭配或句型..."
                            className={cn("h-11 flex-1 rounded-xl border px-3 text-sm focus:outline-none focus:ring-1", activeCosmeticUi.tutorInputClass)}
                        />
                        <button
                            type="submit"
                            disabled={isAskingTutor || !tutorQuery.trim()}
                            className={cn("inline-flex h-11 min-w-[110px] items-center justify-center gap-1.5 rounded-xl border border-transparent px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50", activeCosmeticUi.analysisButtonClass)}
                        >
                            {isAskingTutor ? <Sparkles className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                            {isAskingTutor ? "思考中" : "继续提问"}
                        </button>
                    </form>

                    {!tutorResponse?.answer_revealed && (
                        <div className="mt-2 flex items-center justify-start gap-2">
                            <button
                                type="button"
                                onClick={() => handleAskTutor({ question: "我想看参考表达，并解释为什么这样说。", questionType: "unlock_answer", forceReveal: true })}
                                disabled={isAskingTutor}
                                className="inline-flex min-h-9 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-all hover:-translate-y-0.5 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                我想看参考表达
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        );
    };

    const renderTranslationAnalysisDetails = () => {
        const details = fullAnalysisData;
        if (!details) return null;

        return (
            <div className="space-y-4">
                {details.diagnosis_summary_cn ? (
                    <div className="rounded-[1.75rem] border border-stone-100 bg-white/90 p-5 shadow-[0_12px_30px_rgba(28,25,23,0.04)]">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            核心判断
                        </h4>
                        <p className="mt-3 text-sm leading-7 text-stone-600">{details.diagnosis_summary_cn}</p>
                    </div>
                ) : null}

                {details.chinglish_vs_natural ? (
                    <div className="rounded-[1.75rem] border border-orange-100 bg-orange-50/40 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                            <Sparkles className="w-3.5 h-3.5" />
                            中式对比
                        </h4>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-rose-100/80 bg-white/85 p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-500">Chinglish</p>
                                <p className="mt-2 font-newsreader text-lg italic text-rose-700">{details.chinglish_vs_natural.chinglish}</p>
                            </div>
                            <div className="rounded-2xl border border-emerald-100/80 bg-white/85 p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Natural</p>
                                <p className="mt-2 font-newsreader text-lg italic text-emerald-800">{details.chinglish_vs_natural.natural}</p>
                            </div>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-stone-600">{details.chinglish_vs_natural.reason_cn}</p>
                    </div>
                ) : null}

                {details.common_pitfall ? (
                    <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50/40 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            易错提醒
                        </h4>
                        <p className="mt-3 text-sm leading-7 text-stone-600">{details.common_pitfall.pitfall_cn}</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-rose-100/80 bg-white/85 p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-500">Wrong</p>
                                <p className="mt-2 font-newsreader text-lg italic text-rose-700">{details.common_pitfall.wrong_example}</p>
                            </div>
                            <div className="rounded-2xl border border-emerald-100/80 bg-white/85 p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Right</p>
                                <p className="mt-2 font-newsreader text-lg italic text-emerald-800">{details.common_pitfall.right_example}</p>
                            </div>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-stone-600">{details.common_pitfall.why_cn}</p>
                    </div>
                ) : null}

                {details.phrase_synonyms && details.phrase_synonyms.length > 0 ? (
                    <div className="rounded-[1.75rem] border border-sky-100 bg-sky-50/40 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-600">
                            <BookOpen className="w-3.5 h-3.5" />
                            短语同义替换
                        </h4>
                        <div className="mt-4 space-y-3">
                            {details.phrase_synonyms.map((item, i: number) => (
                                <div key={`${item.source_phrase}-${i}`} className="rounded-2xl border border-sky-100/80 bg-white/85 p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-500">Source Phrase</p>
                                    <p className="mt-2 font-newsreader text-lg italic text-stone-900">{item.source_phrase}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {item.alternatives.map((alternative, altIndex) => (
                                            <span key={`${alternative}-${altIndex}`} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                                                {alternative}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="mt-3 text-sm leading-6 text-stone-600">{item.nuance_cn}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {details.transfer_pattern ? (
                    <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/35 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                            <Sparkles className="w-3.5 h-3.5" />
                            可迁移句型
                        </h4>
                        <div className="mt-4 rounded-2xl border border-emerald-100/80 bg-white/85 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-500">Template</p>
                            <p className="mt-2 font-newsreader text-lg italic text-stone-900">{details.transfer_pattern.template}</p>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">中文场景</p>
                                    <p className="mt-1 text-sm text-stone-700">{details.transfer_pattern.example_cn}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">英文套用</p>
                                    <p className="mt-1 font-newsreader text-base italic text-stone-900">{details.transfer_pattern.example_en}</p>
                                </div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-stone-600">{details.transfer_pattern.tip_cn}</p>
                        </div>
                    </div>
                ) : null}

                {details.memory_hook_cn ? (
                    <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50/50 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                            <Sparkles className="w-3.5 h-3.5" />
                            一句记忆法
                        </h4>
                        <p className="mt-3 text-sm leading-7 text-stone-700">{details.memory_hook_cn}</p>
                    </div>
                ) : null}

                {teachingMode && details.error_analysis && details.error_analysis.length > 0 ? (
                    <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50/40 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            错误精讲
                        </h4>
                        <div className="mt-4 space-y-3">
                            {details.error_analysis.map((err, i: number) => (
                                <div key={i} className="rounded-2xl border border-rose-100/80 bg-white/80 p-4">
                                    <div className="flex items-start gap-2">
                                        <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">错误</span>
                                        <span className="text-sm text-stone-600 line-through">{err.error}</span>
                                    </div>
                                    <div className="mt-2 flex items-start gap-2">
                                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">正确</span>
                                        <span className="text-sm font-medium text-stone-800">{err.correction}</span>
                                    </div>
                                    <div className="mt-3 border-l-2 border-amber-300 pl-3 text-xs leading-6 text-stone-500">
                                        <strong>规则：</strong>{err.rule}
                                    </div>
                                    {err.tip ? <div className="mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-600">💡 {err.tip}</div> : null}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {teachingMode && details.similar_patterns && details.similar_patterns.length > 0 ? (
                    <div className="rounded-[1.75rem] border border-purple-100 bg-purple-50/30 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-600">
                            <BrainCircuit className="w-3.5 h-3.5" />
                            举一反三
                        </h4>
                        <div className="mt-4 space-y-3">
                            {details.similar_patterns.map((pattern, i: number) => (
                                <div key={i} className="rounded-2xl border border-purple-100/80 bg-white/80 p-4">
                                    <div className="text-sm text-stone-600">{pattern.chinese}</div>
                                    <div className="mt-1 text-lg font-newsreader italic text-stone-900">→ {pattern.english}</div>
                                    {pattern.point && <div className="mt-2 text-xs leading-5 text-purple-500">🎯 {pattern.point}</div>}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {!details.diagnosis_summary_cn && details.feedback ? (
                    <div className="rounded-[1.75rem] border border-stone-100 bg-white/90 p-5 shadow-[0_12px_30px_rgba(28,25,23,0.04)]">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            补充说明
                        </h4>
                        <div className="mt-4 space-y-3">
                            {Array.isArray(details.feedback) ? details.feedback.map((point: string, i: number) => (
                                <div key={i} className="flex gap-2 text-sm leading-7 text-stone-600"><div className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" /><p>{point}</p></div>
                            )) : null}
                        </div>
                    </div>
                ) : null}

            </div>
        );
    };

    const hasDetailedAnalysis = Boolean(
            drillFeedback && (
                drillFeedback.segments ||
                drillFeedback.feedback ||
                drillFeedback.improved_version ||
                (drillFeedback.error_analysis && drillFeedback.error_analysis.length > 0) ||
                (drillFeedback.similar_patterns && drillFeedback.similar_patterns.length > 0)
            )
    );
    const analysisHighlights = hasDetailedAnalysis ? getAnalysisHighlights() : [];
    const analysisLead = getAnalysisLead();
    const primaryAdvice = Array.isArray(drillFeedback?.feedback)
        ? drillFeedback?.feedback?.[0]
        : drillFeedback?.feedback?.listening_tips?.[0] || drillFeedback?.feedback?.encouragement || "";
    const secondaryAdvice = Array.isArray(drillFeedback?.feedback)
        ? drillFeedback?.feedback?.[1]
        : drillFeedback?.feedback?.listening_tips?.[1] || "";


    // Auto-Mount Generate (WAIT for Elo to be loaded first!)
    useEffect(() => {
        // Only generate when Elo is loaded to ensure correct difficulty
        if (!isEloLoaded) return;

        if (!drillData && !isGeneratingDrill) {
            handleGenerateDrill();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, isEloLoaded]);



    const BOSS_CONFIG = {
        'blind': {
            name: '盲眼聆听者 (BLIND)',
            desc: '原速播放 • 无文本提示',
            icon: EyeOff,
            color: 'text-stone-300',
            bg: 'bg-stone-500',
            style: "bg-[#1a1a1a] border-stone-800 shadow-[0_0_60px_rgba(0,0,0,0.8)] text-stone-300 ring-1 ring-stone-800/50 grayscale",
            introDelay: 2000,
            bgm: '/blind_intro.mp3'
        },
        'lightning': {
            name: '闪电恶魔 (LIGHTNING)',
            desc: '30秒限时 • 1.5倍速挑战',
            icon: Zap,
            color: 'text-amber-400',
            bg: 'bg-amber-500',
            style: "bg-[#2A1B00] border-amber-500/50 shadow-[0_0_80px_rgba(245,158,11,0.3)] text-amber-100 ring-1 ring-amber-500/30",
            introDelay: 2000,
            bgm: '/lightning_intro.mp3'
        },
        'echo': {
            name: '回声巨兽 (ECHO)',
            desc: '只听一次 • 瞬间记忆挑战',
            icon: Volume2,
            color: 'text-cyan-400',
            bg: 'bg-cyan-500',
            style: "bg-[#082f49] border-cyan-500/40 shadow-[0_0_80px_rgba(6,182,212,0.25)] text-cyan-100 ring-1 ring-cyan-500/20",
            introDelay: 2500,
            bgm: 'https://commondatastorage.googleapis.com/codeskulptor-demos/pyman_assets/intromusic.ogg'
        },
        'reaper': {
            name: '死神 (THE REAPER)',
            desc: '3 HP • 死亡凝视 • 错误即死',
            icon: Skull,
            color: 'text-rose-500',
            bg: 'bg-rose-600',
            style: "bg-black border-red-900/60 shadow-[0_0_120px_rgba(225,29,72,0.6)] text-rose-50 ring-2 ring-red-900",
            introDelay: 3000,
            bgm: 'https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/lose.ogg'
        },
        'roulette': {
            name: '幸运转轮 (LUCKY CHAMBER)',
            desc: '1/6 概率死亡 • +20 Elo 奖池',
            icon: Dices,
            color: 'text-emerald-400',
            bg: 'bg-emerald-600',
            style: "bg-[#022c22] border-emerald-500/50 shadow-[0_0_80px_rgba(16,185,129,0.3)] text-emerald-100 ring-1 ring-emerald-500/30",
            introDelay: 1000,
            bgm: '/gamble_intro.mp3'
        },
        'roulette_execution': {
            name: '死刑执行 (EXECUTION)',
            desc: '实弹命中 • 炼狱难度 • 胜者翻倍',
            icon: Skull,
            color: 'text-red-600',
            bg: 'bg-red-700',
            style: "bg-black border-red-600 shadow-[0_0_150px_rgba(220,38,38,0.9)] text-red-500 ring-4 ring-red-600 animate-pulse",
            introDelay: 500,
            bgm: 'https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/lose.ogg'
        }
    } as const;

    const currentBoss = BOSS_CONFIG[bossState.type] || BOSS_CONFIG['blind'];
    const drillSurfacePhase = getDrillSurfacePhase({
        isProfileLoaded: isEloLoaded,
        isGeneratingDrill,
        hasDrillData: !!drillData,
    });
    const loaderActive = drillSurfacePhase === "bootstrap" || drillSurfacePhase === "loading";
    const [loaderTick, setLoaderTick] = useState(0);

    useEffect(() => {
        if (!loaderActive) {
            setLoaderTick(0);
            return;
        }

        const intervalId = window.setInterval(() => {
            setLoaderTick((prev) => prev + 1);
        }, 760);

        return () => window.clearInterval(intervalId);
    }, [loaderActive]);

    type DrillLoadingVariant = DrillMode;

    const renderDrillLoadingState = ({
        title,
        subtitle,
        backgroundClass,
        variant,
    }: {
        title: string;
        subtitle: string;
        backgroundClass: string;
        variant: DrillLoadingVariant;
    }) => {
        const variantUi = variant === "listening"
            ? {
                mode: "Listening Mode",
                icon: Headphones,
                auraPrimary: "from-cyan-200/45 via-sky-200/35 to-transparent",
                auraSecondary: "from-blue-200/35 via-cyan-100/30 to-transparent",
                badgeClass: "border-cyan-200/80 bg-cyan-50/85 text-cyan-700",
                progressGradient: "from-cyan-400 via-sky-500 to-cyan-500",
                beamGradient: "from-transparent via-cyan-400/85 to-transparent",
                bounceGradients: [
                    "linear-gradient(180deg, rgba(239,252,255,0.99) 0%, rgba(174,239,255,0.95) 44%, rgba(86,210,255,0.92) 100%)",
                    "linear-gradient(180deg, rgba(238,252,255,0.99) 0%, rgba(150,231,255,0.95) 46%, rgba(59,130,246,0.92) 100%)",
                    "linear-gradient(180deg, rgba(241,249,255,0.99) 0%, rgba(186,230,253,0.95) 46%, rgba(14,165,233,0.92) 100%)",
                    "linear-gradient(180deg, rgba(247,254,255,0.99) 0%, rgba(125,211,252,0.95) 48%, rgba(37,99,235,0.92) 100%)",
                ],
                bounceGlow: "radial-gradient(circle, rgba(125,211,252,0.34) 0%, rgba(186,230,253,0.12) 52%, transparent 74%)",
                loaderShell: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(240,249,255,0.72) 100%)",
                loaderBase: "linear-gradient(90deg, rgba(207,250,254,0.2) 0%, rgba(125,211,252,0.48) 48%, rgba(59,130,246,0.22) 100%)",
                sparkleClass: "bg-cyan-200/90",
                attackGradient: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(125,211,252,0.92) 45%, rgba(59,130,246,0.9) 100%)",
                attackStroke: "rgba(103,232,249,0.95)",
                stages: ["声纹预热", "降噪校准", "播放就绪"],
                comfortCopy: "正在为你生成更清晰、稳定的听力挑战",
                accentText: "text-cyan-700",
            }
            : variant === "translation"
                ? {
                    mode: "Translate Mode",
                    icon: Globe,
                    auraPrimary: "from-amber-200/45 via-orange-200/35 to-transparent",
                    auraSecondary: "from-rose-200/35 via-orange-100/28 to-transparent",
                    badgeClass: "border-amber-200/80 bg-amber-50/85 text-amber-700",
                    progressGradient: "from-amber-400 via-orange-500 to-amber-500",
                    beamGradient: "from-transparent via-orange-400/85 to-transparent",
                    bounceGradients: [
                        "linear-gradient(180deg, rgba(255,251,245,0.99) 0%, rgba(255,227,210,0.95) 42%, rgba(255,179,151,0.92) 100%)",
                        "linear-gradient(180deg, rgba(255,249,243,0.99) 0%, rgba(255,220,196,0.95) 44%, rgba(255,151,138,0.92) 100%)",
                        "linear-gradient(180deg, rgba(255,252,245,0.99) 0%, rgba(255,233,204,0.95) 46%, rgba(255,188,136,0.92) 100%)",
                        "linear-gradient(180deg, rgba(255,248,242,0.99) 0%, rgba(255,214,202,0.95) 44%, rgba(251,146,60,0.92) 100%)",
                    ],
                    bounceGlow: "radial-gradient(circle, rgba(255,205,171,0.4) 0%, rgba(255,225,205,0.18) 44%, transparent 76%)",
                    loaderShell: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,247,241,0.78) 100%)",
                    loaderBase: "linear-gradient(90deg, rgba(255,220,203,0.22) 0%, rgba(255,196,162,0.5) 50%, rgba(255,210,184,0.24) 100%)",
                    sparkleClass: "bg-rose-200/90",
                    attackGradient: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(255,220,203,0.94) 38%, rgba(251,146,60,0.92) 100%)",
                    attackStroke: "rgba(255,214,188,0.95)",
                    stages: ["语义草拟", "语法校准", "句式润色"],
                    comfortCopy: "正在为你打磨更自然、地道的表达难度",
                    accentText: "text-amber-700",
                }
                : {
                    mode: "Translate Mode",
                    icon: Globe,
                    auraPrimary: "from-amber-200/45 via-orange-200/35 to-transparent",
                    auraSecondary: "from-rose-200/35 via-orange-100/28 to-transparent",
                    badgeClass: "border-amber-200/80 bg-amber-50/85 text-amber-700",
                    progressGradient: "from-amber-400 via-orange-500 to-amber-500",
                    beamGradient: "from-transparent via-orange-400/85 to-transparent",
                    bounceGradients: [
                        "linear-gradient(180deg, rgba(255,251,245,0.99) 0%, rgba(255,227,210,0.95) 42%, rgba(255,179,151,0.92) 100%)",
                        "linear-gradient(180deg, rgba(255,249,243,0.99) 0%, rgba(255,220,196,0.95) 44%, rgba(255,151,138,0.92) 100%)",
                        "linear-gradient(180deg, rgba(255,252,245,0.99) 0%, rgba(255,233,204,0.95) 46%, rgba(255,188,136,0.92) 100%)",
                        "linear-gradient(180deg, rgba(255,248,242,0.99) 0%, rgba(255,214,202,0.95) 44%, rgba(251,146,60,0.92) 100%)",
                    ],
                    bounceGlow: "radial-gradient(circle, rgba(255,205,171,0.4) 0%, rgba(255,225,205,0.18) 44%, transparent 76%)",
                    loaderShell: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,247,241,0.78) 100%)",
                    loaderBase: "linear-gradient(90deg, rgba(255,220,203,0.22) 0%, rgba(255,196,162,0.5) 50%, rgba(255,210,184,0.24) 100%)",
                    sparkleClass: "bg-rose-200/90",
                    attackGradient: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(255,220,203,0.94) 38%, rgba(251,146,60,0.92) 100%)",
                    attackStroke: "rgba(255,214,188,0.95)",
                    stages: ["语义草拟", "语法校准", "句式润色"],
                    comfortCopy: "正在为你打磨更自然、地道的表达难度",
                    accentText: "text-amber-700",
                };

        const ModeIcon = variantUi.icon;
        const stageIndex = Math.min(variantUi.stages.length - 1, Math.floor(loaderTick / 4));
        const pseudoProgress = Math.round(18 + (1 - Math.exp(-loaderTick / 6)) * 74);
        return (
            <div className="h-full flex flex-col items-center justify-center relative overflow-hidden px-4">
                <div className={cn("absolute inset-0", backgroundClass)} />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-[size:46px_46px] opacity-30" />

                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <motion.div
                        className={cn("absolute -left-16 top-10 h-64 w-64 rounded-full bg-gradient-to-br blur-3xl", variantUi.auraPrimary)}
                        animate={prefersReducedMotion ? { opacity: 0.32 } : { x: [0, 28, 0], y: [0, -16, 0], opacity: [0.28, 0.46, 0.28] }}
                        transition={{ duration: 11, repeat: prefersReducedMotion ? 0 : Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className={cn("absolute -right-14 bottom-8 h-60 w-60 rounded-full bg-gradient-to-br blur-3xl", variantUi.auraSecondary)}
                        animate={prefersReducedMotion ? { opacity: 0.3 } : { x: [0, -26, 0], y: [0, 20, 0], opacity: [0.26, 0.42, 0.26] }}
                        transition={{ duration: 12, repeat: prefersReducedMotion ? 0 : Infinity, ease: "easeInOut" }}
                    />
                </div>

                <div className="relative z-10 w-full max-w-[560px] overflow-hidden rounded-[32px] border border-white/75 bg-white/74 p-7 shadow-[0_26px_80px_rgba(15,23,42,0.11)] backdrop-blur-[22px] md:p-9">
                    <motion.div
                        className="absolute inset-y-0 -left-24 w-24 bg-gradient-to-r from-transparent via-white/55 to-transparent"
                        animate={prefersReducedMotion ? { x: 240 } : { x: [-120, 640] }}
                        transition={{ duration: 4.4, repeat: prefersReducedMotion ? 0 : Infinity, ease: "easeInOut" }}
                    />

                    <div className="relative mb-5 flex items-center justify-center">
                        <span className={cn("inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide", variantUi.badgeClass)}>
                            <ModeIcon className="h-3.5 w-3.5" />
                            {variantUi.mode}
                        </span>
                    </div>

                    <div className="relative mx-auto mb-7 flex h-44 w-full max-w-[320px] items-end justify-center">
                        <motion.div
                            className="absolute inset-x-8 bottom-1 h-24 rounded-full blur-3xl"
                            style={{ background: variantUi.bounceGlow }}
                            animate={prefersReducedMotion ? { opacity: 0.55 } : { opacity: [0.34, 0.7, 0.34], scale: [0.94, 1.08, 0.94] }}
                            transition={{ duration: 2.6, repeat: prefersReducedMotion ? 0 : Infinity, ease: "easeInOut" }}
                        />
                        <div
                            className="absolute inset-x-2 bottom-2 h-28 rounded-[34px] border border-white/80 shadow-[0_24px_60px_rgba(255,214,188,0.18),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl"
                            style={{ backgroundImage: variantUi.loaderShell }}
                        />
                        <div className="absolute inset-x-4 -top-2 -bottom-4 overflow-visible">
                            <LottieJsonPlayer
                                animationData={sphereSplitterAnimation}
                                speed={1}
                                className="h-full w-full scale-[1.12]"
                            />
                        </div>
                    </div>

                    <div className="relative text-center space-y-2">
                        <p className="font-newsreader text-[30px] leading-none font-semibold tracking-tight text-stone-800">{title}</p>
                        <p className="text-sm tracking-wide text-stone-500">{subtitle}</p>
                        <p className="text-[11px] text-stone-400">{variantUi.comfortCopy}</p>
                    </div>

                    <div className="mt-5 flex items-center justify-between text-[11px] font-medium tracking-wide text-stone-500">
                        <motion.span
                            key={variantUi.stages[stageIndex]}
                            initial={prefersReducedMotion ? false : { opacity: 0, y: 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, ease: "easeOut" }}
                            className={variantUi.accentText}
                        >
                            {variantUi.stages[stageIndex]}
                        </motion.span>
                        <span className="tabular-nums text-stone-400">{pseudoProgress}%</span>
                    </div>

                    <div className="relative mx-auto mt-6 h-2.5 w-full max-w-[430px] overflow-hidden rounded-full bg-white/70 ring-1 ring-black/5">
                        <div
                            className={cn("absolute left-0 top-0 h-2.5 rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out", variantUi.progressGradient)}
                            style={{ width: `${pseudoProgress}%` }}
                        />
                        <motion.div
                            className={cn("absolute left-0 top-0 h-2.5 w-20 bg-gradient-to-r", variantUi.beamGradient)}
                            animate={prefersReducedMotion ? { x: 210 } : { x: [-95, 470] }}
                            transition={{ duration: 2.8, repeat: prefersReducedMotion ? 0 : Infinity, ease: "easeInOut" }}
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <AnimatePresence>
            <motion.div
                key="drill-core"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                    "fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 transition-colors duration-1000",
                    theme === 'default' ? "bg-black/40 backdrop-blur-sm" : "bg-transparent",
                    shake && "animate-shake"
                )}
            >
                {/* Dynamic Background Engine */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
                    <AnimatePresence mode="popLayout">
                        {theme === 'fever' && (
                            <motion.div
                                key="theme-fever"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1 }}
                                className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0f0a1a] to-[#1a0a0a]"
                            >
                                {/* Animated gradient orbs */}
                                <motion.div
                                    className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-[120px]"
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                />
                                <motion.div
                                    className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-fuchsia-500/15 rounded-full blur-[100px]"
                                    animate={{ scale: [1.2, 1, 1.2], opacity: [0.15, 0.3, 0.15] }}
                                    transition={{ duration: 4, repeat: Infinity }}
                                />
                                <motion.div
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px]"
                                    animate={{ scale: [1, 1.3, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                />

                                {/* Grid overlay */}
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />

                                {/* Top neon line */}
                                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_30px_rgba(249,115,22,0.8),0_0_60px_rgba(249,115,22,0.4)]" />
                                {/* Bottom neon line */}
                                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent shadow-[0_0_30px_rgba(245,158,11,0.8)]" />
                                {/* Side glow */}
                                <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-orange-500/50 to-transparent" />
                                <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-amber-500/50 to-transparent" />
                            </motion.div>
                        )}
                        {theme === 'crimson' && (
                            <motion.div
                                key="theme-crimson"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1 }}
                                className="absolute inset-0 bg-[#2b0a0a]"
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(220,38,38,0.15),transparent_70%)] animate-pulse" />
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-600 to-transparent shadow-[0_0_30px_rgba(220,38,38,0.6)]" />
                            </motion.div>
                        )}
                        {theme === 'boss' && (
                            <motion.div
                                key="theme-boss"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1 }}
                                className="absolute inset-0 bg-black"
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(217,119,6,0.2),transparent_60%)]" />
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 animate-[spin_100s_linear_infinite]" />
                                <div className="absolute inset-0 border-[20px] border-amber-900/10" />
                            </motion.div>
                        )}
                        {theme === 'default' && (
                            <motion.div
                                key={`theme-cosmetic-${cosmeticTheme}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.8 }}
                                className={cn("absolute inset-0", activeCosmeticTheme.bgClass)}
                            >
                                {/* Morning Coffee orbs */}
                                {cosmeticTheme === 'morning_coffee' && (
                                    <>
                                        <motion.div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-slate-200/50 rounded-full blur-[120px]" animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, -30, 0] }} transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-100/40 rounded-full blur-[100px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -40, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-stone-100/30 rounded-full blur-[150px]" animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
                                    </>
                                )}

                                {/* Sakura petals + pink glow */}
                                {cosmeticTheme === 'sakura' && (
                                    <>
                                        <motion.div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-pink-300/25 rounded-full blur-[150px]" animate={{ scale: [1, 1.15, 1], x: [0, -20, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute bottom-1/3 left-1/3 w-[400px] h-[400px] bg-rose-200/20 rounded-full blur-[120px]" animate={{ scale: [1.1, 1, 1.1], y: [0, 15, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
                                        {/* Falling petals */}
                                        {[...Array(8)].map((_, i) => (
                                            <motion.div key={i} className="absolute text-pink-300/60 text-lg select-none pointer-events-none" style={{ left: `${8 + i * 12}%`, top: '-5%' }} animate={{ y: [0, 800], x: [0, Math.sin(i) * 60, 0], rotate: [0, 360 * (i % 2 === 0 ? 1 : -1)] }} transition={{ duration: 8 + i * 2, repeat: Infinity, delay: i * 1.5, ease: "linear" }} >🌸</motion.div>
                                        ))}
                                    </>
                                )}

                                {/* Golden Hour — warm flowing orbs */}
                                {cosmeticTheme === 'golden_hour' && (
                                    <>
                                        <motion.div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-300/25 rounded-full blur-[150px]" animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -15, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-rose-300/20 rounded-full blur-[130px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -20, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-orange-200/20 rounded-full blur-[110px]" animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.3, 0.15] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
                                        {/* Warm light rays */}
                                        <div className="absolute top-0 right-0 w-[60%] h-[60%] bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.12),transparent_60%)]" />
                                        <div className="absolute bottom-0 left-0 w-[40%] h-[40%] bg-[radial-gradient(ellipse_at_bottom_left,rgba(251,113,133,0.08),transparent_60%)]" />
                                    </>
                                )}

                                {/* Cloud Nine — Ultra-clean white background with breathable cyan/blue pastel gradients */}
                                {cosmeticTheme === 'cloud_nine' && (
                                    <div className="absolute inset-0 overflow-hidden mix-blend-multiply opacity-50">
                                        <motion.div className="absolute -top-[10%] -left-[10%] w-[70vw] h-[70vw] bg-sky-200/40 rounded-full blur-[120px]" animate={{ scale: [1, 1.1, 1], x: [0, 40, 0], y: [0, 30, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute top-[20%] -right-[20%] w-[80vw] h-[80vw] bg-cyan-100/40 rounded-full blur-[130px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -50, 0], y: [0, -30, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute -bottom-[20%] left-[10%] w-[60vw] h-[60vw] bg-blue-100/40 rounded-full blur-[140px]" animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -40, 0] }} transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} />
                                        {/* Subtle white noise overlay for physical texture */}
                                        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay" />
                                    </div>
                                )}

                                {/* Lilac Dream — Dreamy pastel lavender/pink gradients */}
                                {cosmeticTheme === 'lilac_dream' && (
                                    <div className="absolute inset-0 overflow-hidden">
                                        <motion.div className="absolute top-0 left-0 w-[60vw] h-[60vw] bg-fuchsia-300/15 rounded-full blur-[140px]" animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 20, 0] }} transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute top-[10%] right-[10%] w-[70vw] h-[70vw] bg-purple-300/15 rounded-full blur-[150px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -40, 0], y: [0, -20, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute bottom-0 left-[20%] w-[65vw] h-[65vw] bg-pink-300/15 rounded-full blur-[160px]" animate={{ scale: [1, 1.15, 1], x: [0, 30, 0], y: [0, -40, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
                                        {/* Floating soft light orbs */}
                                        {[...Array(6)].map((_, i) => (
                                            <motion.div
                                                key={i}
                                                className="absolute w-32 h-32 bg-white/20 rounded-full blur-[20px]"
                                                style={{ left: `${20 + Math.random() * 60}%`, top: `${20 + Math.random() * 60}%` }}
                                                animate={{
                                                    opacity: [0.2, 0.5, 0.2],
                                                    scale: [1, 1.5, 1],
                                                    x: [0, (Math.random() - 0.5) * 100],
                                                    y: [0, (Math.random() - 0.5) * 100],
                                                }}
                                                transition={{ duration: 8 + Math.random() * 8, repeat: Infinity, delay: Math.random() * 5, ease: "easeInOut" }}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Noise texture - universal */}
                                <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%274%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E')]" />

                                {/* Grid pattern for light themes */}
                                {!activeCosmeticTheme.isDark && (
                                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <motion.div
                    layout
                    ref={battleShellRef}
                    className={cn(
                        "relative w-full max-w-5xl h-[85vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-700",
                        theme === 'fever' ? "bg-[#0a0a12]/95 backdrop-blur-xl border border-orange-500/40 shadow-[0_0_80px_rgba(249,115,22,0.15),0_0_40px_rgba(251,146,60,0.1)] text-white ring-1 ring-orange-500/20" :
                            theme === 'boss' ? currentBoss.style :
                                theme === 'crimson' ? "bg-[#1a0505]/95 border border-red-500/30 shadow-[0_0_60px_rgba(220,38,38,0.2)] text-red-50" :
                                    activeCosmeticTheme.cardClass,
                        canUseStreakAura && "will-change-transform",
                        shake && "animate-shake"
                    )}
                    style={canUseStreakAura ? {
                        borderColor: streakVisual.surfaceBorder,
                        boxShadow: theme === 'fever'
                            ? `${streakVisual.surfaceShadow}, 0 0 80px rgba(249,115,22,0.15), 0 0 40px rgba(251,146,60,0.1)`
                            : streakVisual.surfaceShadow,
                    } : undefined}
                >
                    {canUseStreakAura && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                            <motion.div
                                className="absolute inset-0"
                                style={{ backgroundImage: streakVisual.auraGradient }}
                                initial={false}
                                animate={
                                    streakTransition === 'cooldown'
                                        ? { opacity: 0.18, scale: 0.98 }
                                        : streakTransition === 'surge'
                                            ? { opacity: [0.32, 0.7, 0.42], scale: [0.98, 1.02, 1] }
                                            : { opacity: theme === 'fever' ? 0.32 : 0.42, scale: 1 }
                                }
                                transition={{ duration: prefersReducedMotion ? 0.2 : streakTransition ? 0.55 : 1.2, ease: "easeOut" }}
                            />
                            <motion.div
                                className="absolute inset-x-8 top-0 h-[2px]"
                                style={{ backgroundImage: streakVisual.beamGradient, boxShadow: streakVisual.beamShadow }}
                                initial={false}
                                animate={
                                    streakTransition === 'cooldown'
                                        ? { opacity: 0.2, scaleX: 0.82 }
                                        : streakTransition === 'surge'
                                            ? { opacity: [0.55, 1, 0.8], scaleX: [0.72, 1.05, 1] }
                                            : { opacity: 0.78, scaleX: 1 }
                                }
                                transition={{ duration: prefersReducedMotion ? 0.2 : 0.48, ease: "easeOut" }}
                            />
                            <motion.div
                                className="absolute inset-[1px] rounded-[2.45rem]"
                                style={{
                                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.72), inset 0 0 0 1px ${streakVisual.surfaceBorder}`,
                                }}
                                initial={false}
                                animate={streakTransition === 'cooldown' ? { opacity: 0.22 } : { opacity: 0.7 }}
                            />

                            {canShowStreakParticles && (
                                <div className="absolute inset-0 hidden md:block">
                                    {STREAK_PARTICLE_POSITIONS.slice(0, activeParticleCount).map((left, index) => (
                                        <motion.div
                                            key={`streak-particle-${left}-${index}`}
                                            className="absolute top-full h-2 w-2 rounded-full blur-[1px]"
                                            style={{
                                                left: `${left}%`,
                                                backgroundImage: streakVisual.particleGradient,
                                                boxShadow: `0 0 18px ${streakVisual.badgeGlow}`,
                                            }}
                                            initial={{ opacity: 0, y: 18, scale: 0.6 }}
                                            animate={{
                                                y: [0, -140 - (index % 4) * 16],
                                                opacity: [0, 0.95, 0],
                                                scale: [0.4, 1.08, 0.6],
                                                x: [0, index % 2 === 0 ? 12 : -10, 0],
                                            }}
                                            transition={{
                                                duration: 2.4 + (index % 3) * 0.35,
                                                repeat: Infinity,
                                                delay: index * 0.18,
                                                ease: "easeOut",
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Crimson Hellfire Overlay */}
                    {theme === 'crimson' && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                            {/* Pulse Vignette */}
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(50,0,0,0.4)_100%)] animate-pulse" />
                            {/* Rising Embers */}
                            {[...Array(8)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute w-1 h-1 bg-red-500 rounded-full blur-[1px]"
                                    initial={{ top: '100%', left: `${Math.random() * 100}%`, opacity: 0, scale: 0 }}
                                    animate={{ top: '-10%', opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                                    transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2, ease: "easeOut" }}
                                />
                            ))}
                        </div>
                    )}
                    {/* Fever Overlay Particles - Fire Embers Rising */}
                    {theme === 'fever' && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                            {/* Rising embers */}
                            {[...Array(12)].map((_, i) => (
                                <motion.div
                                    key={`ember-${i}`}
                                    className="absolute w-1.5 h-1.5 rounded-full"
                                    style={{
                                        left: `${5 + Math.random() * 90}%`,
                                        background: `radial-gradient(circle, ${['#f97316', '#fb923c', '#fbbf24', '#f59e0b'][i % 4]}, transparent)`
                                    }}
                                    initial={{ bottom: -20, opacity: 0, scale: 0 }}
                                    animate={{
                                        bottom: '110%',
                                        opacity: [0, 0.8, 0.6, 0],
                                        scale: [0, 1.2, 0.8, 0],
                                        x: [0, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 60]
                                    }}
                                    transition={{
                                        duration: 3 + Math.random() * 2,
                                        repeat: Infinity,
                                        delay: Math.random() * 3,
                                        ease: "easeOut"
                                    }}
                                />
                            ))}
                            {/* Floating sparks */}
                            {[...Array(6)].map((_, i) => (
                                <motion.div
                                    key={`spark-${i}`}
                                    className="absolute w-0.5 h-0.5 bg-yellow-400 rounded-full shadow-[0_0_6px_rgba(250,204,21,0.8)]"
                                    style={{ left: `${10 + Math.random() * 80}%`, top: `${20 + Math.random() * 60}%` }}
                                    animate={{
                                        opacity: [0, 1, 0],
                                        scale: [0, 1.5, 0]
                                    }}
                                    transition={{
                                        duration: 1 + Math.random(),
                                        repeat: Infinity,
                                        delay: Math.random() * 2
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* FEVER STREAK BAR (The Fire Progress) */}
                    {theme === 'fever' && currentStreak >= 2 && (
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-stone-900/50 z-50 overflow-hidden">
                            <motion.div
                                className="h-full relative"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(currentStreak * 10, 100)}%` }}
                                transition={{ type: "spring", stiffness: 100, damping: 15 }}
                                style={{ backgroundImage: streakVisual.progressGradient }}
                            >
                                {/* Glow effect */}
                                <div className="absolute inset-0 blur-sm opacity-80" style={{ backgroundImage: streakVisual.progressGradient }} />
                                {/* Sparkle at end */}
                                <motion.div
                                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full blur-[2px]"
                                    animate={{ opacity: [0.6, 1, 0.6], scale: [0.8, 1.2, 0.8] }}
                                    transition={{ duration: 0.8, repeat: Infinity }}
                                />
                            </motion.div>
                            {/* Streak count badge */}
                            <motion.div
                                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                style={{ color: streakVisual.accent }}
                            >
                                <Flame className="w-3 h-3 fill-current" />
                                <span className="font-mono">{currentStreak}</span>
                            </motion.div>
                        </div>
                    )}

                    {/* BOSS FUSE (The Burning Wick) */}
                    {theme === 'boss' && (
                        <div className="absolute top-0 left-0 right-0 h-2 bg-stone-900 z-50">
                            <motion.div
                                className="h-full bg-gradient-to-r from-amber-600 via-orange-500 to-yellow-400 shadow-[0_0_20px_rgba(245,158,11,0.8)] relative"
                                style={{ width: `${fuseTime}%` }}
                            >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-white rounded-full blur-[2px] animate-pulse" />
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 bg-orange-500/50 rounded-full blur-xl animate-pulse" />
                            </motion.div>
                        </div>
                    )}

                    {/* Recording indicator - simplified */}
                    <AnimatePresence>
                        {whisperRecording && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-full shadow-lg"
                            >
                                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                <span className="text-sm font-bold">Recording...</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {/* Header - Compact Info Bar */}
                    <div className="flex items-center justify-between p-3 md:p-4 border-b border-stone-100/50 shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Unified Info Pill */}
                            {drillData && (
                                <div className="flex items-center h-[38px] px-0.5 bg-white/60 backdrop-blur-xl rounded-full border border-white/60 shadow-[0_8px_24px_rgba(0,0,0,0.03)] ring-1 ring-stone-200/30 overflow-hidden transition-all shrink-0">
                                    {/* Rank Section */}
                                    {(() => {
                                        const rank = getRank(currentElo || DEFAULT_BASE_ELO);
                                        return bossState.type === 'roulette_execution' ? (
                                            <div className="flex items-center gap-1.5 px-3 h-full rounded-full bg-red-900/10 text-red-700/90">
                                                <Skull className="w-[14px] h-[14px] text-red-500" />
                                                <span className="font-bold text-[11px] tracking-wider uppercase drop-shadow-sm">处决模式</span>
                                            </div>
                                        ) : rouletteSession?.result === 'safe' ? (
                                            <div className="flex items-center gap-1.5 px-3 h-full rounded-full bg-amber-500/10 text-amber-700/90">
                                                <Zap className="w-[14px] h-[14px] text-amber-500 fill-amber-500" />
                                                <span className="font-bold text-[11px] tracking-wider uppercase drop-shadow-sm">x{rouletteSession.multiplier}</span>
                                            </div>
                                        ) : (
                                            <div className={cn("flex items-center gap-1.5 px-2.5 h-full rounded-full", rank.color)}>
                                                <rank.icon className="w-[14px] h-[14px]" />
                                                <span className="font-bold text-[11px] tracking-wider uppercase drop-shadow-sm">{rank.title}</span>
                                                <div className="w-[1px] h-3 bg-current opacity-20 mx-0.5" />
                                                <span className="font-newsreader font-medium italic text-[13px]">{currentElo || DEFAULT_BASE_ELO}</span>
                                            </div>
                                        );
                                    })()}

                                    {/* Difficulty Section - Simplified to Word Count */}
                                    {drillData?._difficultyMeta && (
                                        <>
                                            <div className="w-[1px] h-3 bg-stone-300/40 rounded-full mx-0.5" />
                                            <div className={cn(
                                                "flex items-center px-2 h-full rounded-full text-[11px] font-bold transition-colors",
                                                drillData._difficultyMeta.status === 'MATCHED'
                                                    ? "text-emerald-700/80 hover:bg-emerald-50"
                                                    : drillData._difficultyMeta.status === 'TOO_EASY'
                                                        ? "text-amber-700/80 hover:bg-amber-50"
                                                        : "text-rose-700/80 hover:bg-rose-50"
                                            )}>
                                                <span>{drillData._difficultyMeta.actualWordCount}词</span>
                                            </div>
                                        </>
                                    )}

                                    {/* Topic Section - Simplified */}
                                    {drillData?._topicMeta && (
                                        <>
                                            <div className="w-[1px] h-3 bg-stone-300/40 rounded-full mx-0.5" />
                                            <div
                                                className="flex items-center gap-1 px-2.5 h-full rounded-full text-[11px] font-bold text-blue-700/80 transition-colors hover:bg-blue-50 cursor-pointer"
                                                title={drillData._topicMeta.topic}
                                            >
                                                <span className="text-[12px] leading-none mb-[1px]">📌</span>
                                                <span className="max-w-[108px] sm:max-w-[144px] truncate opacity-95">
                                                    {drillData._topicMeta.topic}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Streak Counter - Separate for emphasis */}
                            {(currentStreak >= 2 || streakTransition === 'cooldown') && (
                                <motion.div
                                    initial={false}
                                    animate={
                                        streakTransition === 'cooldown'
                                            ? { scale: 0.96, y: 0, opacity: 0.72 }
                                            : streakTransition === 'surge'
                                                ? { scale: [1, 1.08, 1.02], y: [0, -2, 0], opacity: [0.88, 1, 1] }
                                                : activeStreakTier >= 3 && !prefersReducedMotion
                                                    ? { scale: [1, 1.018, 1], y: [0, -0.5, 0], opacity: [0.98, 1, 0.98] }
                                                    : { scale: 1, y: 0, opacity: 1 }
                                    }
                                    transition={{
                                        duration: streakTransition ? 0.45 : activeStreakTier >= 3 ? 2.6 : 1.5,
                                        repeat: !streakTransition && activeStreakTier >= 3 && !prefersReducedMotion ? Infinity : 0,
                                        ease: streakTransition ? "easeOut" : "easeInOut",
                                    }}
                                    className="relative overflow-hidden rounded-full border px-3 py-1.5"
                                    style={{
                                        backgroundImage: streakVisual.badgeGradient,
                                        borderColor: streakVisual.badgeBorder,
                                        boxShadow: `0 0 0 1px ${streakVisual.badgeBorder}, ${streakVisual.badgeShadow}`,
                                        color: streakVisual.accent,
                                    }}
                                >
                                    <div
                                        className="pointer-events-none absolute inset-0 rounded-full blur-xl"
                                        style={{
                                            background: `radial-gradient(circle at center, ${streakVisual.badgeGlow}, transparent 70%)`,
                                            opacity: streakTier >= 2 ? 0.9 : 0.55,
                                        }}
                                    />
                                    {activeStreakTier >= 3 && !prefersReducedMotion && (
                                        <motion.div
                                            className="pointer-events-none absolute inset-y-0 -inset-x-6 rounded-full"
                                            style={{
                                                background: "linear-gradient(112deg, transparent 6%, rgba(255,255,255,0.06) 28%, rgba(255,255,255,0.52) 50%, rgba(255,255,255,0.08) 72%, transparent 94%)",
                                                filter: "blur(10px)",
                                                mixBlendMode: "screen",
                                            }}
                                            animate={{
                                                x: [-14, 14, -14],
                                                opacity: [0.34, 0.72, 0.34],
                                                scaleX: [0.985, 1.02, 0.985],
                                            }}
                                            transition={{
                                                duration: activeStreakTier === 4 ? 3.1 : 4,
                                                repeat: Infinity,
                                                ease: "easeInOut",
                                            }}
                                        />
                                    )}
                                    <div className="relative z-10 flex items-center gap-1.5 font-bold text-[10px] tracking-[0.18em] uppercase">
                                        <div
                                            className="flex h-5 w-5 items-center justify-center rounded-full"
                                            style={{
                                                background: `radial-gradient(circle, rgba(255,255,255,0.7) 0%, ${streakVisual.badgeGlow} 45%, transparent 100%)`,
                                            }}
                                        >
                                            <Flame className="h-3.5 w-3.5 fill-current" />
                                        </div>
                                        <span className="font-mono tabular-nums">{streakTransition === 'cooldown' ? cooldownStreak : currentStreak}连</span>
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* Right Side Actions & Ledger */}
                        <div className="flex items-center gap-2">
                            {/* Mobile/Desktop Status Bar - Unified (Collapsible) */}
                            {mode === 'translation' && (
                                <div className={cn(
                                    "hidden md:flex items-center h-[38px] gap-1 p-0.5 rounded-full backdrop-blur-xl border ring-1 shrink-0 transition-all duration-300",
                                    activeCosmeticUi.ledgerClass,
                                    isHintShake && "animate-[shake_0.4s_ease-in-out] border-red-300 shadow-[0_0_18px_rgba(220,38,38,0.2)]"
                                )}
                                    onMouseEnter={() => {
                                        if (shopDockHasHoverSupport) setIsShopDockHovered(true);
                                    }}
                                    onMouseLeave={() => {
                                        if (shopDockHasHoverSupport) setIsShopDockHovered(false);
                                    }}
                                    onFocusCapture={() => setIsShopDockHovered(true)}
                                    onBlurCapture={(event) => {
                                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                            setIsShopDockHovered(false);
                                        }
                                    }}
                                >
                                    <div
                                        className={cn(
                                            "overflow-hidden transition-all duration-300 ease-out",
                                            isShopInventoryExpanded ? "max-w-[460px] opacity-100 mr-1" : "max-w-0 opacity-0 mr-0"
                                        )}
                                        aria-hidden={!isShopInventoryExpanded}
                                    >
                                        <div className="flex items-center h-[34px] shrink-0 gap-1 px-1">
                                            <div
                                                ref={(node) => { resourceTargetRefs.current.coins = node; }}
                                                data-economy-target="coins"
                                                className={cn("flex items-center gap-1 px-2.5 h-full rounded-full transition-all duration-300 cursor-default text-stone-700 hover:bg-white/70", getEconomyPulseClass('coins'))}
                                            >
                                                <span className="text-[12px] leading-none drop-shadow-sm mb-[1px]">✨</span>
                                                <span className="font-mono font-bold text-[12px] tabular-nums">{coins}</span>
                                            </div>

                                            <div
                                                ref={(node) => { resourceTargetRefs.current.capsule = node; }}
                                                data-economy-target="capsule"
                                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-blue-700/80 hover:bg-blue-50", getEconomyPulseClass('capsule'))}
                                            >
                                                <span className="text-[11px] leading-none mb-[1px]">💊</span>
                                                <span className="font-mono font-semibold text-[11px] tabular-nums">{capsuleCount}</span>
                                            </div>

                                            <div
                                                ref={(node) => { resourceTargetRefs.current.hint_ticket = node; }}
                                                data-economy-target="hint_ticket"
                                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-amber-700/80 hover:bg-amber-50", getEconomyPulseClass('hint_ticket'))}
                                            >
                                                <span className="text-[11px] leading-none mb-[1px]">🪄</span>
                                                <span className="font-mono font-semibold text-[11px] tabular-nums">{hintTicketCount}</span>
                                            </div>

                                            <div
                                                ref={(node) => { resourceTargetRefs.current.vocab_ticket = node; }}
                                                data-economy-target="vocab_ticket"
                                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-emerald-700/80 hover:bg-emerald-50", getEconomyPulseClass('vocab_ticket'))}
                                            >
                                                <span className="text-[11px] leading-none mb-[1px]">🧩</span>
                                                <span className="font-mono font-semibold text-[11px] tabular-nums">{vocabTicketCount}</span>
                                            </div>

                                            <div
                                                ref={(node) => { resourceTargetRefs.current.audio_ticket = node; }}
                                                data-economy-target="audio_ticket"
                                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-indigo-700/80 hover:bg-indigo-50", getEconomyPulseClass('audio_ticket'))}
                                            >
                                                <span className="text-[11px] leading-none mb-[1px]">🔊</span>
                                                <span className="font-mono font-semibold text-[11px] tabular-nums">{audioTicketCount}</span>
                                            </div>

                                            <div
                                                ref={(node) => { resourceTargetRefs.current.refresh_ticket = node; }}
                                                data-economy-target="refresh_ticket"
                                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-cyan-700/80 hover:bg-cyan-50", getEconomyPulseClass('refresh_ticket'))}
                                            >
                                                <RefreshCw className="h-[11px] w-[11px]" />
                                                <span className="font-mono font-semibold text-[11px] tabular-nums">{refreshTicketCount}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Shop Button - Always Visible */}
                                    <button
                                        onClick={() => {
                                            setShopFocusedItem(null);
                                            setShowShopModal(true);
                                        }}
                                        className={cn(
                                            "relative flex items-center justify-center h-full min-w-[68px] rounded-full px-4 transition-all duration-300 shrink-0 border",
                                            activeCosmeticUi.audioUnlockedClass
                                        )}
                                        title="打开商场"
                                    >
                                        <span className="font-bold text-[11px] tracking-widest leading-none mt-[1px]">商场</span>
                                    </button>
                                </div>
                            )}

                            {mode === 'translation' && !learningSessionActive && (
                                <button
                                    onClick={handleStartGuidedLearning}
                                    disabled={!drillData || !!drillFeedback || guidedModeStatus === "loading"}
                                    className={cn(
                                        "hidden sm:flex items-center gap-1.5 h-[38px] px-4 rounded-full font-bold text-[12px] transition-all duration-300 shrink-0 border shadow-[0_8px_24px_rgba(0,0,0,0.03)] disabled:opacity-50 disabled:cursor-not-allowed",
                                        activeCosmeticUi.audioUnlockedClass
                                    )}
                                    title="打开引导学习模式"
                                >
                                    <Sparkles className={cn("w-[14px] h-[14px]", guidedModeStatus === "loading" && "animate-spin")} />
                                    <span className="tracking-wide text-[12px]">引导学习</span>
                                </button>
                            )}

                            {/* Teaching Mode Button - Only for Translation */}
                            {mode === 'translation' && !learningSessionActive && (
                                <button
                                    onClick={() => {
                                        if (!teachingMode) {
                                            // First time enabling: turn on and auto-fetch if drill exists
                                            setTeachingMode(true);
                                            if (drillData && drillData.chinese && drillData.reference_english && !teachingData && !isLoadingTeaching) {
                                                setIsLoadingTeaching(true);
                                                fetch('/api/ai/teach', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        chinese: drillData.chinese,
                                                        reference_english: drillData.reference_english,
                                                        elo: eloRating || DEFAULT_BASE_ELO,
                                                    }),
                                                })
                                                    .then(r => r.json())
                                                    .then(d => { if (!d.error) setTeachingData(d); })
                                                    .catch(() => { })
                                                    .finally(() => setIsLoadingTeaching(false));
                                            }
                                            setTeachingPanelOpen(true);
                                        } else {
                                            // Toggle panel open/close
                                            setTeachingPanelOpen(!teachingPanelOpen);
                                        }
                                    }}
                                    className={cn(
                                        "hidden sm:flex items-center gap-1.5 h-[38px] px-4 rounded-full font-bold text-[12px] transition-all duration-300 shrink-0 border shadow-[0_8px_24px_rgba(0,0,0,0.03)]",
                                        teachingMode && teachingPanelOpen
                                            ? activeCosmeticUi.checkButtonClass
                                            : teachingMode
                                                ? activeCosmeticUi.audioUnlockedClass
                                                : activeCosmeticUi.iconButtonClass
                                    )}
                                    title={teachingPanelOpen ? '收起教学面板' : '打开教学面板'}
                                >
                                    <BookOpen className={cn("w-[14px] h-[14px]", teachingMode && isLoadingTeaching && "animate-pulse")} />
                                    <span className="tracking-wide text-[12px]">教学</span>
                                    {teachingMode && (
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full ml-0.5",
                                            isLoadingTeaching ? "bg-amber-400 animate-pulse" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                                        )} />
                                    )}
                                </button>
                            )}
                            {mode === 'translation' && learningSessionActive && !isGuidedOverlayOpen && (
                                <div className="hidden sm:flex items-center gap-2 h-[38px] px-4 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-[12px] font-bold">
                                    <Sparkles className="w-[14px] h-[14px]" />
                                    <span className="tracking-wide">学习态 · 本题不计分</span>
                                </div>
                            )}
                            {onClose && (
                                <button
                                    onClick={onClose}
                                    className={cn(
                                        "w-[38px] h-[38px] rounded-full flex items-center justify-center transition-all duration-300 group shrink-0 border",
                                        activeCosmeticUi.iconButtonClass
                                    )}
                                >
                                    <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="flex-1 relative overflow-y-auto flex flex-col">

                        {/* Scoring Flip Card Animation */}
                        <ScoringFlipCard
                            isScoring={isSubmittingDrill && !drillFeedback}
                            userAnswer={userTranslation}
                            mode={mode}
                            streakTier={streakTier}
                        />


                        {drillSurfacePhase !== "ready" ? (
                            renderDrillLoadingState({
                                title: mode === "translation" ? "正在生成句子..." : "正在准备音频...",
                                subtitle: mode === "translation" ? "Crafting your phrase" : "Preparing audio stream",
                                backgroundClass: "bg-gradient-to-br from-stone-50 via-white to-slate-50/70",
                                variant: mode,
                            })
                        ) : drillData ? (
                            <AnimatePresence mode="popLayout" initial={false}>
                                {!drillFeedback ? (
                                    <motion.div key="question" initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="absolute inset-0 overflow-y-auto custom-scrollbar p-6 md:p-8 pb-10 md:pb-12 flex flex-col">
                                        <div className="max-w-3xl mx-auto w-full space-y-4">
                                            {/* Source / Listening Area */}
                                            <div className="space-y-6 text-center w-full">
                                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative flex flex-col items-center gap-6 w-full">
                                                    {mode === "listening" ? (
                                                        <div className="w-full flex flex-col items-center justify-center relative">
                                                            {/* Big Play Button */}
                                                            <button
                                                                onClick={playAudio}
                                                                disabled={isPlaying || isAudioLoading || (bossState.active && bossState.type === 'echo' && hasPlayedEchoRef.current)}
                                                                className={cn(
                                                                    "group relative w-24 h-24 flex items-center justify-center transition-all duration-500 mb-8 mt-4",
                                                                    (bossState.active && bossState.type === 'echo' && hasPlayedEchoRef.current)
                                                                        ? "grayscale opacity-50 cursor-not-allowed scale-95"
                                                                        : "hover:scale-105 active:scale-95 disabled:opacity-80 disabled:scale-100"
                                                                )}
                                                            >
                                                                <div className={cn("absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-2xl transition-all duration-500", isPlaying ? "scale-125 opacity-100" : "scale-100 opacity-0 group-hover:opacity-100")} />
                                                                <div className="absolute inset-0 rounded-full bg-white/60 dark:bg-white/10 backdrop-blur-2xl border border-white/50 dark:border-white/20 shadow-2xl shadow-indigo-500/10 transition-all duration-300 group-hover:bg-white/80 group-hover:border-white" />
                                                                <div className="relative z-10 text-indigo-600 dark:text-indigo-300 drop-shadow-sm flex items-center justify-center">
                                                                    {(isPrefetching || isAudioLoading) ? (
                                                                        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                                                    ) : isPlaying ? (
                                                                        <div className="flex items-center gap-1.5 h-10">
                                                                            {[0.4, 1, 0.6, 0.8, 0.5].map((h, i) => (
                                                                                <motion.div key={i} animate={{ height: [10 * h, 30 * h, 10 * h] }} transition={{ duration: 0.6 + (i * 0.1), repeat: Infinity, ease: "easeInOut", repeatType: "mirror" }} className="w-1.5 bg-indigo-500 rounded-full" />
                                                                            ))}
                                                                        </div>
                                                                    ) : <Play className="w-10 h-10 ml-1.5 fill-indigo-600 text-indigo-600" />}
                                                                </div>
                                                            </button>

                                                            {/* Minimal Controls */}
                                                            {/* Composite Control Bar */}
                                                            <div className="flex items-center justify-center gap-2 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
                                                                <div className="flex items-center bg-stone-200/50 backdrop-blur-md p-1.5 rounded-full shadow-inner border border-stone-100/20">
                                                                    {/* Blind Toggle */}
                                                                    <button
                                                                        onClick={() => setIsBlindMode(!isBlindMode)}
                                                                        className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2", isBlindMode ? "text-stone-500 hover:text-stone-700" : "bg-white text-stone-800 shadow-sm")}
                                                                    >
                                                                        {isBlindMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                                        {isBlindMode ? "BLIND TEXT" : "VISIBLE"}
                                                                    </button>

                                                                    <div className="w-px h-4 bg-stone-300 mx-2" />

                                                                    {/* Chinese Toggle */}
                                                                    <button
                                                                        onClick={() => setShowChinese(!showChinese)}
                                                                        className={cn("w-8 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center", showChinese ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600")}
                                                                        title="Toggle Chinese Translation"
                                                                    >
                                                                        中
                                                                    </button>

                                                                    <div className="w-px h-4 bg-stone-300 mx-2" />

                                                                    {/* Speed Controls */}
                                                                    <div className="flex items-center gap-1">
                                                                        {[0.75, 1.0, 1.25, 1.5].map((speed) => (
                                                                            <button
                                                                                key={speed}
                                                                                onClick={() => { setPlaybackSpeed(speed); if (audioRef.current) audioRef.current.playbackRate = speed; }}
                                                                                className={cn("text-[10px] px-3 py-1.5 rounded-full font-bold transition-all", playbackSpeed === speed ? "bg-white text-indigo-600 shadow-sm" : "text-stone-500 hover:text-stone-700")}
                                                                            >
                                                                                {speed}x
                                                                            </button>
                                                                        ))}
                                                                    </div>

                                                                    {mode === 'listening' && (
                                                                        <>
                                                                            <div className="w-px h-5 bg-stone-300 mx-2" />

                                                                            {/* Engine Mode with Status Indicator */}
                                                                            <button
                                                                                onClick={() => setEngineMode(engineMode === 'fast' ? 'precise' : 'fast')}
                                                                                className={cn(
                                                                                    "relative px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all text-nowrap border",
                                                                                    engineMode === 'fast'
                                                                                        ? "text-amber-600 bg-amber-100/50 hover:bg-amber-100 border-amber-200"
                                                                                        : "text-emerald-600 bg-emerald-100/50 hover:bg-emerald-100 border-emerald-200"
                                                                                )}
                                                                                title={`${engineMode === 'fast' ? 'Fast Mode' : 'Pro Mode'} • ${serverStatus === 'online' ? 'Local Whisper Ready' : 'Using Cloud'}`}
                                                                            >
                                                                                {/* Status Dot */}
                                                                                <div className={cn(
                                                                                    "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white",
                                                                                    serverStatus === 'online' ? "bg-emerald-500" : "bg-rose-500"
                                                                                )} />
                                                                                {engineMode === 'fast' ? <Zap className="w-3 h-3" /> : <BrainCircuit className="w-3 h-3" />}
                                                                                {engineMode === 'fast' ? "FAST" : "PRO"}
                                                                            </button>

                                                                            <div className="w-px h-5 bg-stone-300 mx-2" />

                                                                            {/* Refresh Button */}
                                                                            <button
                                                                                onClick={handleRefreshDrill}
                                                                                disabled={isGeneratingDrill}
                                                                                className="relative w-8 h-8 rounded-full text-cyan-500 hover:text-cyan-700 hover:bg-cyan-50 flex items-center justify-center transition-all disabled:opacity-50"
                                                                                title="刷新当前题目 · 消耗 1 张刷新卡"
                                                                            >
                                                                                <RefreshCw className={cn("w-3.5 h-3.5", isGeneratingDrill && "animate-spin")} />
                                                                                <span className="absolute -right-1 -bottom-1 min-w-[14px] h-[14px] rounded-full bg-cyan-500 px-1 text-[9px] font-black leading-[14px] text-white shadow-[0_4px_10px_rgba(6,182,212,0.35)]">
                                                                                    {refreshTicketCount}
                                                                                </span>
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Reaper HP or Fuse Timer based on Boss Type */}
                                                            {(bossState.active || gambleState.active) && (
                                                                <div className="flex justify-center mb-0"> { /* Moved down for visibility */}
                                                                    {bossState.type === 'reaper' ? (
                                                                        <div className="flex gap-8 items-center animate-in fade-in slide-in-from-top-4">
                                                                            {/* PLAYER HP (Left) */}
                                                                            <div className="flex gap-2 items-center bg-stone-900/40 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                                                                                <span className="text-xs font-bold text-stone-400 mr-2">YOU</span>
                                                                                {[...Array(bossState.playerMaxHp || 3)].map((_, i) => (
                                                                                    <motion.div
                                                                                        key={`p-${i}`}
                                                                                        initial={{ scale: 0 }}
                                                                                        animate={{
                                                                                            scale: i < (bossState.playerHp || 0) ? 1 : 0.8,
                                                                                            opacity: i < (bossState.playerHp || 0) ? 1 : 0.2,
                                                                                            filter: i < (bossState.playerHp || 0) ? 'grayscale(0%)' : 'grayscale(100%)'
                                                                                        }}
                                                                                    >
                                                                                        <Heart className={cn(
                                                                                            "w-6 h-6",
                                                                                            i < (bossState.playerHp || 0) ? "fill-emerald-500 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "text-stone-700"
                                                                                        )} />
                                                                                    </motion.div>
                                                                                ))}
                                                                            </div>

                                                                            <div className="text-xl font-black text-white/20 italic">VS</div>

                                                                            {/* BOSS HP (Right) */}
                                                                            <div className="flex gap-2 items-center bg-black/60 px-4 py-2 rounded-full border border-red-900/60 backdrop-blur-md shadow-[0_0_30px_rgba(220,38,38,0.2)]">
                                                                                {[...Array(bossState.maxHp || 3)].map((_, i) => (
                                                                                    <motion.div
                                                                                        key={`b-${i}`}
                                                                                        initial={{ scale: 0 }}
                                                                                        animate={{
                                                                                            scale: i < (bossState.hp || 0) ? 1 : 0.8,
                                                                                            opacity: i < (bossState.hp || 0) ? 1 : 0.2,
                                                                                            filter: i < (bossState.hp || 0) ? 'grayscale(0%)' : 'grayscale(100%)'
                                                                                        }}
                                                                                    >
                                                                                        <Heart className={cn(
                                                                                            "w-6 h-6",
                                                                                            i < (bossState.hp || 0) ? "fill-red-600 text-red-500 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]" : "text-stone-800"
                                                                                        )} />
                                                                                    </motion.div>
                                                                                ))}
                                                                                <span className="text-xs font-bold text-red-500 ml-2">REAPER</span>
                                                                            </div>
                                                                        </div>
                                                                    ) : (bossState.type === 'lightning' || gambleState.active) ? (
                                                                        // Standard Fuse Timer (Lightning ONLY / Gamble)
                                                                        <div className="flex items-center gap-3 bg-stone-900/80 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                                                                            <div className={cn("text-xs font-bold uppercase tracking-widest",
                                                                                theme === 'boss' ? "text-amber-400" : "text-red-400"
                                                                            )}>
                                                                                {theme === 'boss' ? "BOSS FUSE" : "DEATH FUSE"}
                                                                            </div>
                                                                            <div className="w-32 h-2 bg-stone-800 rounded-full overflow-hidden">
                                                                                <div
                                                                                    className={cn("h-full transition-all duration-100 ease-linear",
                                                                                        theme === 'boss' ? "bg-amber-500" : "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]"
                                                                                    )}
                                                                                    style={{ width: `${Math.min(100, fuseTime)}%` }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            )}


                                                            {/* Sleek Slider */}


                                                            {/* Text Reveal / Hint Area - Check Manual Toggle OR Boss Force */}
                                                            {!((bossState.active && bossState.type === 'blind') || isBlindMode) ? (
                                                                <div className="relative w-full max-w-4xl mx-auto px-4 pt-12 pb-8 animate-in fade-in zoom-in-95 duration-500">
                                                                    <div className="text-center font-newsreader italic text-2xl md:text-3xl leading-relaxed text-stone-800 tracking-wide selection:bg-indigo-100">
                                                                        {((gambleState.active && gambleState.wager !== 'safe')) && !isSubmittingDrill ? (
                                                                            <div className={cn(
                                                                                "flex flex-col items-center gap-4 py-8 animate-pulse",
                                                                                theme === 'boss' ? "text-amber-500/50" : "text-red-500/50"
                                                                            )}>
                                                                                {theme === 'boss' ? <Headphones className="w-8 h-8 opacity-50" /> : <Dices className="w-8 h-8 opacity-50" />}
                                                                                <span className="text-sm font-mono tracking-[0.2em] uppercase">
                                                                                    {theme === 'boss' ? "Audio Stream Encryption Active" : "HIGH STAKES // BLIND BET"}
                                                                                </span>
                                                                                <div className="flex gap-1 mt-2">
                                                                                    {[...Array(3)].map((_, i) => (
                                                                                        <div key={i} className={cn("w-2 h-2 rounded-full animate-bounce", theme === 'boss' ? "bg-amber-500/30" : "bg-red-500/30")} style={{ animationDelay: `${i * 0.1}s` }} />
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ) : renderInteractiveText(drillData.reference_english)}
                                                                    </div>
                                                                    {showChinese && <p className="mt-4 text-stone-500 text-lg text-center font-medium animate-in fade-in slide-in-from-top-2">{drillData.chinese}</p>}
                                                                </div>
                                                            ) : (
                                                                <div className="relative w-full max-w-2xl mx-auto px-4 py-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                                                    {showChinese && (
                                                                        <div className="flex flex-col items-center gap-3 bg-amber-50/50 border border-amber-100/50 rounded-2xl p-6 backdrop-blur-sm animate-in fade-in zoom-in-95">
                                                                            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest"><Sparkles className="w-3 h-3" /> Hint / Translation</div>
                                                                            <p className="text-stone-600 text-lg font-medium text-center leading-relaxed opacity-80">{drillData.chinese}</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="w-full py-5 md:py-6 flex flex-col items-center justify-center gap-4 md:gap-5">
                                                            <h3 className="max-w-4xl text-center font-newsreader text-2xl font-medium leading-[1.35] text-stone-900 md:text-[3rem]">
                                                                {drillData.chinese}
                                                            </h3>

                                                            <div className="relative w-full max-w-3xl px-4">
                                                                <div className={cn(
                                                                    "flex flex-wrap items-center justify-center gap-2 rounded-full border px-2.5 py-2 backdrop-blur-xl",
                                                                    activeCosmeticUi.toolbarClass
                                                                )}>
                                                                    <button
                                                                        onClick={handleTranslationReferencePlayback}
                                                                        disabled={isAudioLoading}
                                                                        className={cn(
                                                                            "flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:cursor-wait disabled:opacity-70",
                                                                            isTranslationAudioUnlocked
                                                                                ? activeCosmeticUi.audioUnlockedClass
                                                                                : activeCosmeticUi.audioLockedClass
                                                                        )}
                                                                        title={isTranslationAudioUnlocked ? "重播参考句" : "解锁本题参考句播放"}
                                                                    >
                                                                        {isAudioLoading ? (
                                                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                                                        ) : isTranslationAudioUnlocked ? (
                                                                            <Volume2 className="h-4 w-4" />
                                                                        ) : (
                                                                            <Lock className="h-4 w-4" />
                                                                        )}
                                                                        <span>
                                                                            {isAudioLoading
                                                                                ? "正在生成音频..."
                                                                                : isTranslationAudioUnlocked
                                                                                    ? (isPlaying ? "播放中..." : "重播参考句")
                                                                                    : "播放参考句 · 1 朗读券"}
                                                                        </span>
                                                                    </button>

                                                                    <div className={cn("flex items-center gap-1 rounded-full border p-1", activeCosmeticUi.speedShellClass)}>
                                                                        {[1, 0.85, 0.7].map((speed) => (
                                                                            <button
                                                                                key={`translation-speed-${speed}`}
                                                                                onClick={() => {
                                                                                    setPlaybackSpeed(speed);
                                                                                    if (audioRef.current) {
                                                                                        audioRef.current.playbackRate = speed;
                                                                                    }
                                                                                }}
                                                                                className={cn(
                                                                                    "min-h-8 min-w-[52px] rounded-full px-3 text-[11px] font-bold transition-all duration-200",
                                                                                    playbackSpeed === speed
                                                                                        ? activeCosmeticUi.speedActiveClass
                                                                                        : activeCosmeticUi.speedIdleClass
                                                                                )}
                                                                                aria-label={`设置播放速度 ${speed}x`}
                                                                            >
                                                                                {speed}x
                                                                            </button>
                                                                        ))}
                                                                    </div>

                                                                    {(() => {
                                                                        if (!hasTranslationKeywords || isVocabHintRevealed) return null;

                                                                        return (
                                                                            <button
                                                                                onClick={handleRevealVocabHint}
                                                                                className={cn(
                                                                                    "flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-all hover:-translate-y-0.5",
                                                                                    activeCosmeticUi.vocabButtonClass,
                                                                                    isHintShake && "animate-shake"
                                                                                )}
                                                                            >
                                                                                <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-black text-emerald-600">
                                                                                    {translationKeywords.length}
                                                                                </span>
                                                                                <span>显示关键词</span>
                                                                                <span className="text-emerald-500">1 🧩</span>
                                                                            </button>
                                                                        );
                                                                    })()}

                                                                    <button
                                                                        onClick={handleRefreshDrill}
                                                                        disabled={isGeneratingDrill}
                                                                        className={cn(
                                                                            "relative flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60",
                                                                            activeCosmeticUi.iconButtonClass
                                                                        )}
                                                                        title="刷新当前题目 · 消耗 1 张刷新卡"
                                                                        aria-label="刷新当前题目"
                                                                    >
                                                                        <RefreshCw className={cn("h-4 w-4", isGeneratingDrill && "animate-spin")} />
                                                                        <span className={cn(
                                                                            "absolute -right-1 -bottom-1 min-w-[15px] h-[15px] rounded-full px-1 text-[9px] font-black leading-[15px] shadow-sm",
                                                                            activeCosmeticUi.wordBadgeActiveClass
                                                                        )}>
                                                                            {refreshTicketCount}
                                                                        </span>
                                                                    </button>
                                                                </div>
                                                                {hasTranslationKeywords && (
                                                                    <div className="pointer-events-none absolute inset-x-4 top-full z-10 mt-4 flex justify-center">
                                                                        <AnimatePresence initial={false}>
                                                                            {isVocabHintRevealed && (
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, y: -10, scale: 0.985 }}
                                                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                                    exit={{ opacity: 0, y: -8, scale: 0.985 }}
                                                                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                                                                    className="pointer-events-auto flex max-w-3xl flex-wrap justify-center gap-3"
                                                                                >
                                                                                    {translationKeywords.map((vocab, i) => (
                                                                                        <span key={`${vocab}-${i}`} onClick={(e) => handleWordClick(e, vocab)} className={cn("px-5 py-2 rounded-full border font-newsreader italic text-lg cursor-pointer transition-all", activeCosmeticUi.keywordChipClass)}>{vocab}</span>
                                                                                    ))}
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Action Button - Only show if not waiting for user */}
                                                    <div className="flex justify-center mt-4 opacity-0 pointer-events-none h-0 overflow-hidden">
                                                        <button onClick={handleRefreshDrill} disabled={isGeneratingDrill} className="flex items-center gap-2 px-4 py-2 text-sm text-cyan-500 hover:text-cyan-700 hover:bg-cyan-50 rounded-full transition-all disabled:opacity-50">
                                                            <RefreshCw className={cn("w-4 h-4", isGeneratingDrill && "animate-spin")} /> 换一题
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            </div>

                                            <div className="my-3 h-px w-full max-w-xs mx-auto bg-gradient-to-r from-transparent via-stone-200 to-transparent md:my-4" />

                                            {/* Teaching Card removed - now in floating panel */}

                                            {/* Interactive Area */}

                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="w-full space-y-4">
                                                <div className="relative group">
                                                    {mode === "listening" ? (
                                                        <div className="flex flex-col items-center justify-center gap-4 py-2">
                                                            {whisperProcessing ? (
                                                                <div className="flex items-center gap-3 px-6 py-3 bg-indigo-50 rounded-full">
                                                                    <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
                                                                    <span className="text-indigo-600 font-bold text-sm">Transcribing...</span>
                                                                </div>
                                                            ) : whisperRecording ? (
                                                                /* Recording State - Compact horizontal layout */
                                                                <div className="flex items-center gap-4 px-6 py-3 bg-white/80 backdrop-blur-sm border border-stone-200 rounded-2xl shadow-sm">
                                                                    {/* Mini Waveform */}
                                                                    <div className="flex items-center gap-0.5 h-6">
                                                                        {[...Array(8)].map((_, i) => (
                                                                            <motion.div
                                                                                key={i}
                                                                                className="w-1 rounded-full bg-rose-500"
                                                                                animate={{
                                                                                    height: [4, 12 + Math.random() * 8, 4],
                                                                                }}
                                                                                transition={{
                                                                                    duration: 0.4 + Math.random() * 0.2,
                                                                                    repeat: Infinity,
                                                                                    delay: i * 0.05
                                                                                }}
                                                                            />
                                                                        ))}
                                                                    </div>

                                                                    {/* Real-time text */}
                                                                    <p className="text-base font-newsreader text-stone-700 min-w-[150px] max-w-[300px] truncate">
                                                                        {whisperResult.text || <span className="text-stone-400 italic">Listening...</span>}
                                                                    </p>

                                                                    {/* Stop Button */}
                                                                    <button
                                                                        onClick={stopRecognition}
                                                                        className="w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center shadow-md transition-all hover:scale-105 active:scale-95 shrink-0"
                                                                    >
                                                                        <div className="w-4 h-4 bg-white rounded-sm" />
                                                                    </button>
                                                                </div>
                                                            ) : whisperResult.text ? (
                                                                /* Has Result - Compact confirm/retry */
                                                                <div className="flex items-center gap-3 px-4 py-3 bg-white/80 backdrop-blur-sm border border-stone-200 rounded-2xl shadow-sm">
                                                                    {/* Result text */}
                                                                    <p className="text-base font-newsreader text-stone-800 max-w-[250px]">
                                                                        {whisperResult.text}
                                                                    </p>

                                                                    {/* Action Buttons */}
                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                        <button
                                                                            onClick={startRecognition}
                                                                            className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-all"
                                                                            title="Re-record"
                                                                        >
                                                                            <RefreshCw className="w-4 h-4 text-stone-600" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                setUserTranslation(whisperResult.text);
                                                                                handleSubmitDrill();
                                                                            }}
                                                                            disabled={isSubmittingDrill}
                                                                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold text-sm shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                                                        >
                                                                            {isSubmittingDrill ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                                                            {isSubmittingDrill ? "..." : "Submit"}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                /* Idle State - Smaller mic button */
                                                                <motion.button
                                                                    onClick={startRecognition}
                                                                    whileHover={{ scale: 1.08 }}
                                                                    whileTap={{ scale: 0.95 }}
                                                                    className="relative flex items-center gap-3 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full shadow-lg shadow-indigo-500/25 transition-all"
                                                                >
                                                                    {/* Pulse ring */}
                                                                    <motion.div
                                                                        className="absolute inset-0 rounded-full bg-indigo-500/20"
                                                                        animate={{ scale: [1, 1.15], opacity: [0.4, 0] }}
                                                                        transition={{ duration: 1.5, repeat: Infinity }}
                                                                    />
                                                                    <Mic className="w-5 h-5 text-white relative z-10" />
                                                                    <span className="text-white font-bold text-sm relative z-10">Tap to Record</span>
                                                                </motion.button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {learningSessionActive && !isGuidedOverlayOpen && (
                                                                <div className="mb-4 rounded-[1.35rem] border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-left">
                                                                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600">Learning Session</p>
                                                                    <p className="mt-2 text-sm leading-6 text-stone-600">
                                                                        这题已经进入学习态，不再参与 Elo、连胜、金币或道具结算。你现在看到的是刚才学完后的参考句界面。
                                                                    </p>
                                                                </div>
                                                            )}
                                                            <div className={cn(
                                                                "relative group overflow-hidden rounded-[2rem] border backdrop-blur-2xl transition-all duration-300",
                                                                activeCosmeticUi.inputShellClass
                                                            )}>
                                                                <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/60 to-transparent" />
                                                                <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E')] pointer-events-none mix-blend-overlay" />
                                                                <GhostTextarea
                                                                    value={userTranslation}
                                                                    onChange={setUserTranslation}
                                                                    placeholder="Type your English translation here..."
                                                                    predictionWordCount={3}
                                                                    sourceText={drillData?.chinese}
                                                                    referenceAnswer={drillData?.reference_english}
                                                                    onPredictionRequest={handlePredictionRequest}
                                                                    onPredictionShown={handlePredictionShown}
                                                                    predictionCostText="消耗 1 胶囊获取提示"
                                                                    fullReferenceGhostText={fullReferenceHint.text}
                                                                    fullReferenceGhostVersion={fullReferenceHint.version}
                                                                    disabled={isSubmittingDrill || learningSessionActive}
                                                                    className={cn("font-work-sans min-h-[128px] px-5 pb-16 pt-5 text-[1.06rem] font-medium leading-[1.9] tracking-[0.005em] placeholder:font-normal placeholder:italic md:min-h-[144px] md:px-6 md:pb-16 md:pt-6 md:text-[1.12rem] bg-transparent", activeCosmeticUi.textareaClass)}
                                                                />

                                                                {/* Bottom toolbar */}
                                                                <div className="relative z-10 flex items-center justify-between border-t border-black/[0.03] bg-white/20 px-3 pb-4 pt-3 backdrop-blur-md md:px-6 md:pb-5">
                                                                    {/* Word count badge */}
                                                                    <div className={cn(
                                                                        "flex items-center gap-1 rounded-full px-2 py-1.5 text-[9px] font-bold font-sans tracking-[0.14em] transition-all duration-300 md:gap-1.5 md:px-3 md:text-[11px] md:tracking-[0.18em]",
                                                                        userTranslation.trim()
                                                                            ? activeCosmeticUi.wordBadgeActiveClass
                                                                            : activeCosmeticUi.wordBadgeIdleClass
                                                                    )}>
                                                                        <span className="tabular-nums">{userTranslation.trim() ? userTranslation.trim().split(/\s+/).length : 0}</span>
                                                                        <span>WORDS</span>
                                                                    </div>

                                                                    {/* Action buttons */}
                                                                    <div className="flex items-center gap-1 md:gap-2">
                                                                        <button
                                                                            onClick={handleMagicHint}
                                                                            disabled={isHintLoading || learningSessionActive}
                                                                            className={cn(
                                                                                "flex h-10 items-center justify-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition-all hover:-translate-y-0.5 active:scale-95 md:px-4 md:text-xs min-w-[80px]",
                                                                                isHintLoading
                                                                                    ? "border-stone-200/80 bg-stone-100/50 text-stone-400 cursor-wait pointer-events-none"
                                                                                    : activeCosmeticUi.hintButtonClass
                                                                            )}
                                                                            title="Auto-Complete Hint"
                                                                        >
                                                                            <Wand2 className={cn("w-4 h-4 shrink-0", isHintLoading && "animate-spin")} />
                                                                            <span>{isHintLoading ? "Hint..." : "Hint"}</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                if (learningSessionActive) return;
                                                                                openTutorModal();
                                                                            }}
                                                                            className={cn(
                                                                                "flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:-translate-y-0.5 active:scale-95",
                                                                                activeCosmeticUi.iconButtonClass
                                                                            )}
                                                                            title="Ask AI Teacher"
                                                                        >
                                                                            <HelpCircle className="w-4 h-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={handleSubmitDrill}
                                                                            disabled={!userTranslation.trim() || isSubmittingDrill || learningSessionActive}
                                                                            className={cn(
                                                                                "flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[11px] font-bold transition-all md:px-5 md:text-sm",
                                                                                "disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100",
                                                                                (!userTranslation.trim() || isSubmittingDrill || learningSessionActive)
                                                                                    ? "border border-stone-300/60 bg-white/50 text-stone-400 shadow-sm"
                                                                                    : [
                                                                                        "border text-white hover:-translate-y-0.5 active:scale-95 cursor-pointer",
                                                                                        activeCosmeticUi.checkButtonClass
                                                                                    ]
                                                                            )}
                                                                        >
                                                                            {isSubmittingDrill ? <Sparkles className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                                            {learningSessionActive ? "学习态" : isSubmittingDrill ? "..." : "Check"}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </motion.div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <AnimatePresence mode="wait">
                                        {(bossState.active || (gambleState.active && gambleState.introAck)) ? (
                                            <BossScoreReveal
                                                key="boss-feedback"
                                                score={drillFeedback.score}
                                                drift={0}
                                                type={gambleState.active ? 'gamble' : bossState.type as any}
                                                onNext={() => {
                                                    // Reset Gamble State if finished (Loss or Max Win)
                                                    if (gambleState.active && (drillFeedback.score < 9.0 || gambleState.doubleDownCount >= 2)) {
                                                        setGambleState({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
                                                        setTheme('default');
                                                    }
                                                    handleGenerateDrill();
                                                }}
                                                onRetry={gambleState.active ? undefined : () => {
                                                    setDrillFeedback(null);
                                                    setUserTranslation("");
                                                    setTutorQuery("");
                                                    setTutorAnswer(null);
                                                    setTutorThread([]);
                                                    setTutorResponse(null);
                                                    setTutorPendingQuestion(null);
                                                    setIsTutorOpen(false);
                                                    setIsSubmittingDrill(false);
                                                    setWordPopup(null);
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
                                                }}
                                            />
                                        ) : (
                                            <motion.div key="feedback" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-48">
                                                {/* Error State: Show retry when API fails */}
                                                {drillFeedback._error ? (
                                                    <div className="flex flex-col items-center justify-center gap-4 py-16">
                                                        <div className="text-4xl">⚠️</div>
                                                        <p className="text-stone-600 font-medium text-center">评分服务暂时不可用</p>
                                                        <p className="text-stone-400 text-sm text-center">AI 接口超时，请重试</p>
                                                        <button
                                                            onClick={() => {
                                                                setDrillFeedback(null);
                                                                setIsSubmittingDrill(false);
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
                                                                handleSubmitDrill();
                                                            }}
                                                            className="mt-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-lg transition-all"
                                                        >
                                                            重新评分
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className={cn("max-w-4xl mx-auto w-full space-y-4 transition-transform duration-100", drillFeedback.score <= 4 && "animate-[shake_0.5s_ease-in-out]")}>
                                                        <div className="flex flex-col items-center gap-1">
                                                            <div
                                                                className={cn("text-5xl font-bold font-newsreader transition-all duration-500", drillFeedback.score >= 8 ? "text-emerald-600" : drillFeedback.score >= 6 ? "text-amber-500" : "text-rose-500")}
                                                                style={streakTier > 0 && drillFeedback.score >= 8 ? { textShadow: streakVisual.scoreGlow } : undefined}
                                                            >
                                                                {drillFeedback.score}<span className="text-xl text-stone-300 font-normal">/10</span>
                                                            </div>
                                                            <p className="text-stone-500 font-medium text-xs uppercase tracking-wider">Accuracy Score</p>
                                                            {eloChange !== null && eloChange !== 0 ? (
                                                                <div className="flex flex-col items-center animate-in slide-in-from-bottom-2 fade-in duration-500 delay-150 mt-4 w-full max-w-sm">
                                                                    {/* Rank Progress Bar */}
                                                                    {(() => {
                                                                        const rank = getRank(currentElo || DEFAULT_BASE_ELO);
                                                                        return (
                                                                            <div className="w-full mb-4">
                                                                                <div className="flex justify-between text-xs font-bold text-stone-400 mb-1.5 uppercase tracking-wider">
                                                                                    <span className={rank.color.replace('bg-', 'text-')}>{rank.title}</span>
                                                                                    <span>{rank.nextRank?.title || "Max"}</span>
                                                                                </div>
                                                                                <div
                                                                                    className="h-2 w-full rounded-full overflow-hidden shadow-inner bg-stone-100"
                                                                                    style={{
                                                                                        backgroundColor: streakTier > 0 ? 'rgba(255,247,237,0.85)' : undefined,
                                                                                        boxShadow: streakTier > 0 ? `inset 0 1px 2px rgba(255,255,255,0.72), 0 0 0 1px ${streakVisual.badgeBorder}` : undefined,
                                                                                    }}
                                                                                >
                                                                                    <div
                                                                                        className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
                                                                                        style={{
                                                                                            width: `${Math.max(5, rank.progress)}%`,
                                                                                            backgroundImage: streakTier > 0 ? streakVisual.progressGradient : 'linear-gradient(90deg, #78716c 0%, #a8a29e 100%)',
                                                                                            boxShadow: streakTier > 0 ? `0 0 18px ${streakVisual.badgeGlow}` : undefined,
                                                                                        }}
                                                                                    >
                                                                                        <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
                                                                                    </div>
                                                                                </div>
                                                                                <div className="text-[10px] text-right text-stone-300 mt-1 font-mono">{Math.round(rank.progress)}% to promote</div>
                                                                            </div>
                                                                        );
                                                                    })()}

                                                                    {/* Elo Change Badge & Breakdown */}
                                                                    <div className="relative group/breakdown cursor-help">
                                                                        <motion.div
                                                                            initial={{ scale: 0.8, opacity: 0 }}
                                                                            animate={{ scale: 1, opacity: 1 }}
                                                                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                                                            className={cn(
                                                                                "px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 shadow-md border transition-all hover:scale-105",
                                                                                (eloBreakdown?.streakBonus || (eloChange > 0 && streakTier > 0))
                                                                                    ? "text-white shadow-lg"
                                                                                    : eloChange > 0
                                                                                        ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                                                                        : "bg-rose-50 text-rose-600 border-rose-100"
                                                                            )}
                                                                            style={(eloBreakdown?.streakBonus || (eloChange > 0 && streakTier > 0))
                                                                                ? {
                                                                                    backgroundImage: streakVisual.eloGradient,
                                                                                    borderColor: streakVisual.eloBorder,
                                                                                    boxShadow: streakVisual.eloShadow,
                                                                                }
                                                                                : undefined}
                                                                        >
                                                                            <TrendingUp className={cn("w-4 h-4", eloChange < 0 && "rotate-180")} />
                                                                            <span>{eloChange > 0 ? "+" : ""}{eloChange} Elo</span>

                                                                            {/* Streak Bonus Fire Effect */}
                                                                            {eloBreakdown?.streakBonus && (
                                                                                <motion.div
                                                                                    className="flex items-center gap-1 ml-1 pl-2 border-l border-white/30"
                                                                                    animate={{ scale: [1, 1.1, 1] }}
                                                                                    transition={{ repeat: Infinity, duration: 0.8 }}
                                                                                >
                                                                                    <Flame className="w-4 h-4 fill-yellow-300 text-yellow-200" />
                                                                                    <span className="text-yellow-100 font-black">+{eloBreakdown.bonusChange}</span>
                                                                                </motion.div>
                                                                            )}
                                                                        </motion.div>

                                                                        {/* Streak Glow Effect */}
                                                                        {eloBreakdown?.streakBonus && (
                                                                            <motion.div
                                                                                className="absolute inset-0 rounded-full blur-xl -z-10"
                                                                                style={{ backgroundImage: streakVisual.eloGradient }}
                                                                                animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.1, 1] }}
                                                                                transition={{ repeat: Infinity, duration: 1.5 }}
                                                                            />
                                                                        )}

                                                                        {/* Hover Breakdown */}
                                                                        {eloBreakdown && (
                                                                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 bg-white rounded-xl shadow-xl border border-stone-100 p-3 opacity-0 group-hover/breakdown:opacity-100 transition-opacity pointer-events-none z-50 text-xs">
                                                                                <div className="space-y-1.5 ">
                                                                                    <div className="flex justify-between text-stone-500">
                                                                                        <span>Base Performance</span>
                                                                                        <span className="font-mono font-bold">{eloBreakdown.baseChange > 0 ? "+" : ""}{eloBreakdown.baseChange}</span>
                                                                                    </div>
                                                                                    {eloBreakdown.streakBonus && (
                                                                                        <div className="flex justify-between text-orange-500 font-bold bg-orange-50 px-2 py-1 rounded-lg -mx-1">
                                                                                            <span className="flex items-center gap-1"><Flame className="w-3 h-3 fill-orange-400" /> 连胜加成</span>
                                                                                            <span className="font-mono">+{eloBreakdown.bonusChange}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="w-full h-px bg-stone-100 my-1" />
                                                                                    <div className="flex justify-between text-stone-400 text-[10px] uppercase tracking-wider">
                                                                                        <span>Difficulty</span>
                                                                                        <span>{Math.round(eloBreakdown.difficultyElo)}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {drillFeedback.judge_reasoning && <p className="text-[10px] text-stone-400 mt-3 max-w-lg text-center leading-relaxed"><span className="font-bold text-stone-500 mr-1">AI Judge:</span>{drillFeedback.judge_reasoning}</p>}
                                                                </div>
                                                            ) : null}
                                                        </div>

                                                        {analysisRequested ? (
                                                            <div className="bg-white/90 p-6 rounded-[2rem] shadow-xl shadow-stone-200/50 border border-stone-100 backdrop-blur-sm">
                                                                {isGeneratingAnalysis ? (
                                                                    <div className="py-10 flex flex-col items-center gap-3 text-center">
                                                                        <div className="w-10 h-10 rounded-full border-2 border-amber-200 border-t-amber-500 animate-spin" />
                                                                        <p className="text-sm font-semibold text-stone-700">正在生成解析</p>
                                                                        <p className="text-xs text-stone-400">按需生成，避免每题都额外消耗 token。</p>
                                                                    </div>
                                                                ) : analysisError ? (
                                                                    <div className="py-6 flex flex-col items-center gap-3 text-center">
                                                                        <p className="text-sm font-semibold text-rose-600">解析生成失败</p>
                                                                        <p className="text-xs text-stone-400">{analysisError}</p>
                                                                        <button
                                                                            onClick={handleGenerateAnalysis}
                                                                            className="px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
                                                                        >
                                                                            重新生成解析
                                                                        </button>
                                                                    </div>
                                                                ) : hasDetailedAnalysis ? (
                                                                    mode === "translation" ? (
                                                                        <TranslationAnalysisJourney
                                                                            analysisLead={analysisLead}
                                                                            analysisHighlights={analysisHighlights}
                                                                            userTranslation={userTranslation}
                                                                            improvedVersionNode={drillFeedback.improved_version ? (
                                                                                <>{renderInteractiveCoachText(drillFeedback.improved_version)}</>
                                                                            ) : null}
                                                                            referenceSentenceNode={renderTranslationReferenceSentence()}
                                                                            isGeneratingGrammar={isGeneratingGrammar}
                                                                            grammarError={grammarError}
                                                                            grammarButtonLabel={referenceGrammarAnalysis ? "重新生成语法分析" : "生成语法分析"}
                                                                            hasGrammarAnalysis={Boolean(referenceGrammarAnalysis)}
                                                                            grammarDisplayMode={referenceGrammarDisplayMode}
                                                                            onGenerateGrammar={handleGenerateReferenceGrammar}
                                                                            onGrammarDisplayModeChange={setReferenceGrammarDisplayMode}
                                                                            onPlayReferenceAudio={playAudio}
                                                                            hasFullAnalysis={fullAnalysisRequested && Boolean(fullAnalysisData)}
                                                                            isGeneratingFullAnalysis={isGeneratingFullAnalysis}
                                                                            fullAnalysisError={fullAnalysisError}
                                                                            fullAnalysisOpen={fullAnalysisOpen}
                                                                            onGenerateFullAnalysis={handleGenerateFullAnalysis}
                                                                            onToggleFullAnalysis={() => setFullAnalysisOpen(prev => !prev)}
                                                                            fullAnalysisContent={renderTranslationAnalysisDetails()}
                                                                        />
                                                                    ) : (
                                                                    <div className="space-y-4">
                                                                        <div className="overflow-hidden rounded-[2rem] border border-stone-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(251,250,248,0.94))] shadow-[0_18px_40px_rgba(28,25,23,0.06)]">
                                                                            <div className="p-6 md:p-7">
                                                                                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                                                                                    <div className="max-w-2xl">
                                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                                            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                                                                                                <Sparkles className="w-3.5 h-3.5" />
                                                                                                本题解析
                                                                                            </span>
                                                                                            <span className="inline-flex items-center rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                                                                                {analysisHighlights.length} Fix{analysisHighlights.length === 1 ? "" : "es"}
                                                                                            </span>
                                                                                        </div>
                                                                                        <p className="mt-4 text-[1.8rem] leading-tight text-stone-900 font-newsreader">
                                                                                            {analysisLead}
                                                                                        </p>
                                                                                        {mode !== "listening" && (
                                                                                            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
                                                                                                你的答案：<span className="font-newsreader italic text-stone-700">&ldquo;{userTranslation.length > 140 ? userTranslation.slice(0, 140) + "..." : userTranslation}&rdquo;</span>
                                                                                            </p>
                                                                                        )}
                                                                                    </div>

                                                                                    <div className="flex gap-2">
                                                                                        {mode === 'listening' && (
                                                                                            <button onClick={playRecording} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition-all hover:-translate-y-0.5 hover:bg-rose-100" title="Play My Recording"><Mic className="w-3.5 h-3.5" /> Play Mine</button>
                                                                                        )}
                                                                                        <button onClick={playAudio} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-indigo-200/80 bg-indigo-50 text-indigo-600 transition-all hover:-translate-y-0.5 hover:bg-indigo-100" title="Listen to Correct Version"><Volume2 className="w-4 h-4" /></button>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="mt-6 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                                                                                    <div className="rounded-[1.5rem] border border-stone-200/80 bg-white/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                                                                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                                                                                            <BookOpen className="w-3.5 h-3.5 text-stone-400" />
                                                                                            关键改错
                                                                                        </div>
                                                                                        <div className="mt-4 space-y-3">
                                                                                            {analysisHighlights.length > 0 ? analysisHighlights.map((item, index) => (
                                                                                                <div key={`${item.kind}-${index}`} className="rounded-2xl border border-stone-100 bg-stone-50/70 px-4 py-3">
                                                                                                    <div className="flex items-center justify-between gap-3">
                                                                                                        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-500">{item.kind}</span>
                                                                                                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-300">#{index + 1}</span>
                                                                                                    </div>
                                                                                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                                                                                        <span className="rounded-full bg-rose-50 px-2.5 py-1 font-newsreader italic text-rose-600">{item.before}</span>
                                                                                                        <ArrowRight className="w-3.5 h-3.5 text-stone-300" />
                                                                                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-newsreader italic text-emerald-700">{item.after}</span>
                                                                                                    </div>
                                                                                                    <p className="mt-2 text-sm leading-6 text-stone-500">{item.note}</p>
                                                                                                </div>
                                                                                            )) : (
                                                                                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4 text-sm leading-6 text-emerald-800">
                                                                                                    这题没有明显结构性错误，主要是细节润色。
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>

                                                                                    <div className="rounded-[1.5rem] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,250,235,0.88),rgba(255,255,255,0.92))] p-5">
                                                                                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600">
                                                                                            {mode === "listening" ? "重点建议" : "更自然表达"}
                                                                                        </div>
                                                                                        {mode === "listening" ? (
                                                                                            <div className="mt-4 space-y-3">
                                                                                                {primaryAdvice ? <p className="text-base leading-7 text-stone-800">{primaryAdvice}</p> : <p className="text-sm text-stone-500">本题没有额外口语建议。</p>}
                                                                                                {secondaryAdvice ? <p className="text-sm leading-6 text-stone-500">{secondaryAdvice}</p> : null}
                                                                                            </div>
                                                                                        ) : drillFeedback.improved_version ? (
                                                                                            <div className="mt-4 space-y-2">
                                                                                                <p className="text-[1.6rem] leading-tight font-newsreader">
                                                                                                    {renderInteractiveCoachText(drillFeedback.improved_version)}
                                                                                                </p>
                                                                                                <p className="text-[11px] text-stone-400">点击单词可查看释义并加入生词本</p>
                                                                                            </div>
                                                                                        ) : primaryAdvice ? (
                                                                                            <p className="mt-4 text-base leading-7 text-stone-700">{primaryAdvice}</p>
                                                                                        ) : (
                                                                                            <p className="mt-4 text-sm leading-6 text-stone-500">这题主要是局部修正，原句整体已经接近标准表达。</p>
                                                                                        )}
                                                                                    </div>
                                                                                </div>

                                                                                {null}

                                                                                <div className="mt-4 rounded-[1.4rem] border border-stone-200/80 bg-stone-50/70 p-3.5">
                                                                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                                                        <div>
                                                                                            <p className="text-sm font-semibold text-stone-700">完整解析</p>
                                                                                            <p className="text-xs text-stone-400">查看对照修订、参考答案和完整说明。</p>
                                                                                        </div>
                                                                                        <button
                                                                                            onClick={() => setAnalysisDetailsOpen(prev => !prev)}
                                                                                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:bg-white"
                                                                                        >
                                                                                            {analysisDetailsOpen ? "收起详情" : "展开详情"}
                                                                                            <ChevronRight className={cn("w-4 h-4 transition-transform", analysisDetailsOpen && "rotate-90")} />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <AnimatePresence initial={false}>
                                                                            {analysisDetailsOpen && (
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, y: 16 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    exit={{ opacity: 0, y: -10 }}
                                                                                    transition={{ duration: 0.24, ease: "easeOut" }}
                                                                                    className="space-y-4"
                                                                                >
                                                                                    {renderDiff()}
                                                                                    {drillFeedback.feedback && (
                                                                                        <div className="rounded-[1.75rem] border border-stone-100 bg-white/90 p-5 shadow-[0_12px_30px_rgba(28,25,23,0.04)]">
                                                                                            <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                                                                                                <Sparkles className="w-3.5 h-3.5" />
                                                                                                完整说明
                                                                                            </h4>
                                                                                            <div className="mt-4 space-y-3">
                                                                                                {Array.isArray(drillFeedback.feedback) ? drillFeedback.feedback.map((point: string, i: number) => (
                                                                                                    <div key={i} className="flex gap-2 text-sm leading-7 text-stone-600"><div className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" /><p>{point}</p></div>
                                                                                                )) : (
                                                                                                    <div className="grid gap-3">
                                                                                                        {drillFeedback.feedback.listening_tips && <div className="rounded-2xl bg-amber-50 p-3 text-sm leading-6 text-amber-800"><strong className="mb-1 block text-xs uppercase tracking-[0.16em] text-amber-600">Listening Tips</strong>{drillFeedback.feedback.listening_tips}</div>}
                                                                                                        {drillFeedback.feedback.encouragement && <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm italic text-stone-500">&ldquo;{drillFeedback.feedback.encouragement}&rdquo;</div>}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    )}

                                                                                    {teachingMode && drillFeedback.error_analysis && drillFeedback.error_analysis.length > 0 && (
                                                                                        <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50/40 p-5">
                                                                                            <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600">
                                                                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                                                                错误精讲
                                                                                            </h4>
                                                                                            <div className="mt-4 space-y-3">
                                                                                                {drillFeedback.error_analysis.map((err: any, i: number) => (
                                                                                                    <div key={i} className="rounded-2xl border border-rose-100/80 bg-white/80 p-4">
                                                                                                        <div className="flex items-start gap-2">
                                                                                                            <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">错误</span>
                                                                                                            <span className="text-sm text-stone-600 line-through">{err.error}</span>
                                                                                                        </div>
                                                                                                        <div className="mt-2 flex items-start gap-2">
                                                                                                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">正确</span>
                                                                                                            <span className="text-sm font-medium text-stone-800">{err.correction}</span>
                                                                                                        </div>
                                                                                                        <div className="mt-3 border-l-2 border-amber-300 pl-3 text-xs leading-6 text-stone-500">
                                                                                                            <strong>规则：</strong>{err.rule}
                                                                                                        </div>
                                                                                                        {err.tip && <div className="mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-600">💡 {err.tip}</div>}
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    )}

                                                                                    {teachingMode && drillFeedback.similar_patterns && drillFeedback.similar_patterns.length > 0 && (
                                                                                        <div className="rounded-[1.75rem] border border-purple-100 bg-purple-50/30 p-5">
                                                                                            <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-600">
                                                                                                <BrainCircuit className="w-3.5 h-3.5" />
                                                                                                举一反三
                                                                                            </h4>
                                                                                            <div className="mt-4 space-y-3">
                                                                                                {drillFeedback.similar_patterns.map((pattern: any, i: number) => (
                                                                                                    <div key={i} className="rounded-2xl border border-purple-100/80 bg-white/80 p-4">
                                                                                                        <div className="text-sm text-stone-600">{pattern.chinese}</div>
                                                                                                        <div className="mt-1 text-lg font-newsreader italic text-stone-900">→ {pattern.english}</div>
                                                                                                        {pattern.point && <div className="mt-2 text-xs leading-5 text-purple-500">🎯 {pattern.point}</div>}
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                    )
                                                                ) : (
                                                                    <div className="py-6 text-center text-sm text-stone-500">暂无可展示的解析内容。</div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="bg-white/90 p-6 rounded-[2rem] shadow-xl shadow-stone-200/50 border border-stone-100 backdrop-blur-sm">
                                                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                                                    <div>
                                                                        <div className="flex items-center gap-2 text-stone-400 text-xs font-bold uppercase tracking-wider">
                                                                            <Sparkles className="w-4 h-4 text-amber-500" />
                                                                            Analysis On Demand
                                                                        </div>
                                                                        <p className="mt-2 text-sm font-medium text-stone-700">默认只出分。下面这部分解析改成按需生成。</p>
                                                                        <p className="mt-1 text-xs text-stone-400">这样评分会更快，也不会每题都额外消耗 token。</p>
                                                                    </div>
                                                                    <button
                                                                        onClick={handleGenerateAnalysis}
                                                                        disabled={isGeneratingAnalysis}
                                                                        className={cn("inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 min-h-11", activeCosmeticUi.analysisButtonClass)}
                                                                    >
                                                                        {isGeneratingAnalysis ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                                                        生成解析
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                )}
                            </AnimatePresence>
                        ) : null}
                    </div>

                    <GuidedLearningOverlay
                        open={isGuidedOverlayOpen}
                        status={guidedModeStatus}
                        script={guidedScript}
                        innerMode={guidedInnerMode}
                        currentStepIndex={guidedCurrentStepIndex}
                        currentAttemptCount={guidedCurrentAttemptCount}
                        guidedChoicesVisible={guidedChoicesVisible}
                        guidedRevealReady={guidedRevealReady}
                        filledFragments={guidedFilledFragments}
                        clozeState={guidedClozeState}
                        currentInput={guidedInput}
                        currentAiHint={guidedAiHint}
                        isAiHintLoading={isGuidedAiHintLoading}
                        onInputChange={handleGuidedInputChange}
                        onSubmit={() => handleSubmitGuidedInput()}
                        onShowChoices={handleShowGuidedChoices}
                        onSelectChoice={handleSelectGuidedChoice}
                        onRevealAnswer={handleRevealGuidedAnswer}
                        onRequestAiHint={handleRequestGuidedAiHint}
                        onActivateRandomFill={guidedInnerMode === "gestalt_cloze" ? handleRefreshGuidedCloze : handleActivateGuidedRandomFill}
                        onReturnToTeacherGuided={handleReturnToTeacherGuided}
                        onReturnToBattle={handleReturnToBattleFromGuided}
                        onCloseLearning={handleCloseGuidedLearning}
                    />

                    {/* Floating Teaching Panel */}
                    <AnimatePresence>
                        {teachingPanelOpen && teachingMode && mode === 'translation' && !learningSessionActive && (
                            <>
                                {/* Backdrop */}
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setTeachingPanelOpen(false)}
                                    className="absolute inset-0 bg-black/20 backdrop-blur-[2px] z-[100] rounded-[2.5rem]"
                                />
                                {/* Panel */}
                                <motion.div
                                    initial={{ x: '100%', opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: '100%', opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    className="absolute top-0 right-0 bottom-0 w-full max-w-md z-[101] flex flex-col bg-white/95 backdrop-blur-xl border-l border-stone-200/50 shadow-[-8px_0_40px_rgba(0,0,0,0.08)] rounded-r-[2.5rem] overflow-hidden"
                                >
                                    {/* Panel Header */}
                                    <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100/50 shrink-0">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                                                <BookOpen className="w-3.5 h-3.5 text-white" />
                                            </div>
                                            <span className="font-bold text-sm text-stone-700">📖 教学面板</span>
                                        </div>
                                        <button
                                            onClick={() => setTeachingPanelOpen(false)}
                                            className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition-all"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    {/* Panel Content */}
                                    <div className="flex-1 overflow-y-auto p-4">
                                        <TeachingCard
                                            data={teachingData}
                                            isLoading={isLoadingTeaching}
                                            onReady={() => setTeachingPanelOpen(false)}
                                        />
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>




                    {/* Floating Action Bar - Redesigned */}
                    <AnimatePresence>
                        {drillFeedback && !bossState.active && !gambleState.active && (
                            <motion.div
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 50, opacity: 0 }}
                                className="absolute bottom-8 right-6 md:right-10 z-50 pointer-events-none"
                            >
                                <div className="pointer-events-auto filter drop-shadow-2xl">
                                    <button
                                        onClick={() => handleGenerateDrill()}
                                        className="group relative flex items-center gap-3 px-8 py-3.5 text-white rounded-full font-bold hover:scale-105 active:scale-95 transition-all text-sm md:text-base tracking-wide overflow-hidden"
                                        style={{
                                            backgroundImage: streakTier > 0 ? streakVisual.nextGradient : activeCosmeticUi.nextButtonGradient,
                                            boxShadow: streakTier > 0 ? streakVisual.nextShadow : activeCosmeticUi.nextButtonShadow,
                                        }}
                                    >
                                        <span className="relative z-10 font-bold">Next Question</span>
                                        <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />

                                        {/* Shimmer Overlay */}
                                        <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/35 to-transparent z-0" />

                                        {/* Glow Effect */}
                                        <div
                                            className="absolute inset-0 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
                                            style={{ background: `radial-gradient(circle at center, ${streakTier > 0 ? streakVisual.badgeGlow : activeCosmeticUi.nextButtonGlow}, transparent 70%)` }}
                                        />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {wordPopup && <WordPopup key="word-popup" popup={wordPopup} onClose={() => setWordPopup(null)} />}
                </motion.div>

                {/* Negotiator Overlay (Crimson Roulette) - Localized */}
                <AnimatePresence>
                    {gambleState.active && gambleState.introAck && !gambleState.wager && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-8"
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                className="max-w-md w-full bg-[#1a0505] border border-red-900/50 rounded-3xl p-8 flex flex-col gap-6 shadow-[0_0_50px_rgba(220,38,38,0.2)]"
                            >
                                <div className="flex flex-col items-center text-center gap-2">
                                    <div className="w-16 h-16 rounded-full bg-red-950/50 flex items-center justify-center border border-red-900 mb-2">
                                        <Dices className="w-8 h-8 text-red-500" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-red-100">The Devil's Deal</h2>
                                    <p className="text-red-400 text-sm">A "High Value" client is challenging you. <br />Wager your skill for multiplied returns.</p>
                                </div>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => { setGambleState(prev => ({ ...prev, wager: 'safe' })); setTheme('default'); }}
                                        className="w-full p-4 rounded-xl border border-stone-800 bg-stone-900/50 hover:bg-stone-800 transition-colors flex items-center justify-between group"
                                    >
                                        <div className="text-left">
                                            <div className="text-stone-300 font-bold group-hover:text-white">放弃 (认怂)</div>
                                            <div className="text-xs text-stone-500">正常游戏. 无风险.</div>
                                        </div>
                                        <div className="text-stone-400 text-sm">1x</div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            setGambleState(prev => ({ ...prev, wager: 'risky' }));
                                            setTheme('crimson');
                                            setShake(true); // Small Shake
                                        }}
                                        className="w-full p-4 rounded-xl border border-amber-900/30 bg-amber-950/20 hover:bg-amber-900/30 transition-colors flex items-center justify-between group"
                                    >
                                        <div className="text-left">
                                            <div className="text-amber-500 font-bold group-hover:text-amber-400">加注 (玩玩)</div>
                                            <div className="text-xs text-amber-700 group-hover:text-amber-600">下注 20 Elo. 赢 60.</div>
                                        </div>
                                        <div className="text-amber-500 font-bold text-sm">3x</div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            setGambleState(prev => ({ ...prev, wager: 'madness' }));
                                            setTheme('crimson');
                                            setShake(true); // BIG SHAKE
                                            if (navigator.vibrate) navigator.vibrate(200); // Mobile Haptic
                                        }}
                                        className="w-full p-4 rounded-xl border border-red-900/50 bg-red-950/30 hover:bg-red-900/40 transition-colors flex items-center justify-between group relative overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
                                        <div className="text-left relative z-10">
                                            <div className="text-red-500 font-bold group-hover:text-red-400 flex items-center gap-2"><AlertTriangle className="w-3 h-3" /> 梭哈 (疯魔)</div>
                                            <div className="text-xs text-red-700 group-hover:text-red-600">下注 50 Elo. 赢 150.</div>
                                        </div>
                                        <div className="text-red-500 font-black text-xl relative z-10">5x</div>
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* DOUBLE DOWN MODAL (The Greed Trap) */}
                <AnimatePresence>
                    {showDoubleDown && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[80] bg-black/95 flex items-center justify-center p-8 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-10" />
                            <div className="absolute inset-0 bg-red-900/10 animate-pulse" />

                            <motion.div
                                initial={{ scale: 0.8, rotate: -5 }}
                                animate={{ scale: 1, rotate: 0 }}
                                className="relative bg-[#2a0a0a] border-4 border-red-600 p-8 rounded-3xl shadow-[0_0_100px_rgba(220,38,38,0.5)] max-w-sm w-full text-center flex flex-col gap-6"
                            >
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                                    <div className="w-24 h-24 bg-black border-4 border-red-600 rounded-full flex items-center justify-center shadow-2xl">
                                        <span className="text-4xl">😈</span>
                                    </div>
                                </div>

                                <div className="mt-8 space-y-2">
                                    <h2 className="text-3xl font-black text-red-500 uppercase tracking-tighter">Greed Check</h2>
                                    <p className="text-red-200 text-sm">You won... but is it enough?</p>
                                </div>

                                <div className="py-4 bg-black/30 rounded-xl border border-red-900/30">
                                    <div className="text-xs text-stone-500 uppercase tracking-widest mb-1">Current Winnings</div>
                                    <div className="text-4xl font-mono font-bold text-white tabular-nums">
                                        {gambleState.wager === 'risky' ? 60 * Math.pow(2.5, gambleState.doubleDownCount) : 150 * Math.pow(2.5, gambleState.doubleDownCount)}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => {
                                            setShowDoubleDown(false);
                                            setGambleState(prev => ({ ...prev, active: false, introAck: false, wager: null, doubleDownCount: 0 }));
                                            setTheme('default');
                                        }}
                                        className="py-4 rounded-xl bg-stone-800 text-stone-400 font-bold hover:bg-stone-700 hover:text-white transition-colors border border-white/5"
                                    >
                                        Take it (Weak)
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowDoubleDown(false);
                                            // Reset the drill but KEEP the gamble state and increment count
                                            setGambleState(prev => ({ ...prev, doubleDownCount: prev.doubleDownCount + 1 }));
                                            handleGenerateDrill(); // Generate NEXT question immediately
                                            // Theme stays crimson
                                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-sword-slash-swoosh-1476.mp3').play().catch(() => { });
                                        }}
                                        className="py-4 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition-all border border-red-400 shadow-[0_0_20px_rgba(220,38,38,0.4)] animate-pulse"
                                    >
                                        DOUBLE DOWN 💀
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Gamble Intro Overlay */}
                <AnimatePresence>
                    {gambleState.active && !gambleState.introAck && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[70] bg-[#1a0505] flex items-center justify-center p-8"
                            onClick={() => setGambleState(prev => ({ ...prev, introAck: true }))}
                        >
                            <div className="flex flex-col items-center gap-8 text-center pointer-events-none">
                                <motion.div
                                    initial={{ scale: 2, filter: "blur(10px)" }}
                                    animate={{ scale: 1, filter: "blur(0px)" }}
                                    transition={{ duration: 0.8, ease: "circOut" }}
                                    className="relative"
                                >
                                    <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
                                    <AlertTriangle className="w-32 h-32 text-red-600 relative z-10" />
                                </motion.div>

                                <motion.div
                                    initial={{ y: 50, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="space-y-4"
                                >
                                    <h2 className="text-5xl font-black text-red-600 tracking-tighter uppercase">猩红轮盘</h2>
                                    <div className="h-1 w-32 bg-red-600 mx-auto" />
                                    <p className="text-red-200 font-mono text-sm tracking-widest">高风险 • 高回报</p>
                                </motion.div>

                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.5, repeat: Infinity, repeatType: "reverse" }}
                                    className="text-white/30 text-xs mt-12"
                                >
                                    点击进入交易 (CLICK TO ENTER)
                                </motion.p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Boss Intro Overlay */}
                <AnimatePresence>
                    {bossState.active && !bossState.introAck && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[70] bg-black flex items-center justify-center p-8"
                            onClick={() => setBossState(prev => ({ ...prev, introAck: true }))}
                        >
                            <div className="flex flex-col items-center gap-8 text-center pointer-events-none">
                                <motion.div
                                    initial={{ scale: 2, filter: "blur(10px)" }}
                                    animate={{ scale: 1, filter: "blur(0px)" }}
                                    transition={{ duration: 0.8, ease: "circOut" }}
                                    className="relative"
                                >
                                    <div className={cn("absolute inset-0 blur-3xl rounded-full", currentBoss.bg, "opacity-20")} />
                                    <currentBoss.icon className={cn("w-32 h-32 relative z-10", currentBoss.color)} />
                                </motion.div>

                                <motion.div
                                    initial={{ y: 50, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="space-y-4"
                                >
                                    <h2 className={cn("text-5xl font-black tracking-tighter uppercase", currentBoss.color)}>{currentBoss.name}</h2>
                                    <div className={cn("h-1 w-32 mx-auto", currentBoss.bg)} />
                                    <p className={cn("font-mono text-sm tracking-widest opacity-80", currentBoss.color)}>{currentBoss.desc}</p>
                                </motion.div>

                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.5, repeat: Infinity, repeatType: "reverse" }}
                                    className="text-white/30 text-xs mt-12"
                                >
                                    CLICK TO START CHALLENGE
                                </motion.p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {!isShopEconomyFx && economyFxOverlay}
                </AnimatePresence>

                {isShopEconomyFx && typeof window !== "undefined" && economyFxOverlay
                    ? createPortal(
                        <AnimatePresence>{economyFxOverlay}</AnimatePresence>,
                        document.body
                    )
                    : null}

                <AnimatePresence>
                    {renderTranslationTutorModal()}
                </AnimatePresence>

                {/* Context-Aware Loot Overlay */}
                <AnimatePresence>
                    {lootDrop && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8, y: 50 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: -50 }}
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] flex flex-col items-center gap-4 pointer-events-auto cursor-pointer"
                            onClick={() => setLootDrop(null)}
                        >
                            <div className={cn(
                                "flex flex-col items-center gap-4 p-8 rounded-[2.5rem] border shadow-2xl backdrop-blur-3xl min-w-[280px]",
                                lootDrop.amount < 0 ? "bg-red-950/80 border-red-500/50 shadow-red-500/30" :
                                    lootDrop.rarity === 'legendary' ? "bg-amber-900/80 border-amber-400/50 shadow-amber-500/30" :
                                        lootDrop.rarity === 'rare' ? "bg-indigo-900/80 border-indigo-400/50 shadow-indigo-500/30" :
                                            "bg-stone-900/80 border-stone-500/30 shadow-2xl"
                            )}>
                                <div className={cn(
                                    "p-5 rounded-2xl mb-2",
                                    lootDrop.amount < 0 ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                                )}>
                                    {lootDrop.amount < 0 || lootDrop.message.includes('💀') ? (
                                        <Skull className="w-12 h-12 animate-pulse" />
                                    ) : lootDrop.message.includes('🎰') ? (
                                        <Zap className="w-12 h-12 animate-bounce" />
                                    ) : lootDrop.type === 'gem' ? (
                                        <Gem className="w-12 h-12" />
                                    ) : (
                                        <Gift className="w-12 h-12" />
                                    )}
                                </div>

                                <div className="text-center">
                                    <div className={cn("text-xs font-black uppercase tracking-[0.2em] mb-1 opacity-60",
                                        lootDrop.amount < 0 ? "text-red-400" : "text-amber-500"
                                    )}>
                                        {lootDrop.amount < 0 ? "System Penalty" :
                                            lootDrop.message.includes('🎰') ? "Stakes Locked" : "Reward Dropped"}
                                    </div>
                                    <div className={cn("text-xl font-bold mb-4",
                                        lootDrop.amount < 0 ? "text-red-100" : "text-amber-50"
                                    )}>
                                        {lootDrop.message}
                                    </div>
                                    <div className={cn("text-5xl font-black font-mono tracking-tighter",
                                        lootDrop.amount < 0 ? "text-red-500" : "text-white"
                                    )}>
                                        {lootDrop.amount > 0 ? `+${lootDrop.amount}` : lootDrop.amount}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* RANK UP Celebration Overlay */}
                <AnimatePresence>
                    {rankUp && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl"
                            onClick={() => setRankUp(null)}
                        >
                            {/* Epic Background Rays */}
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 z-0 opacity-30"
                            >
                                <div className={cn("w-[200vw] h-[200vw] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r transparent via-white/10 transparent", rankUp.newRank.gradient)} style={{ clipPath: "polygon(50% 50%, 0 0, 100% 0)" }} />
                            </motion.div>

                            <motion.div
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.5, opacity: 0 }}
                                transition={{ type: "spring", damping: 15, stiffness: 200 }}
                                className="relative z-10 flex flex-col items-center gap-8 p-12 max-w-lg w-full"
                            >
                                {/* Shockwave Effect */}
                                <motion.div
                                    initial={{ scale: 0, opacity: 0.8 }}
                                    animate={{ scale: 2, opacity: 0 }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    className={cn("absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border-4", rankUp.newRank.border)}
                                />

                                {/* THE ICON */}
                                <div className="relative">
                                    <motion.div
                                        initial={{ scale: 0, rotate: -180 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: "spring", damping: 12, stiffness: 100, delay: 0.2 }}
                                        className={cn("w-40 h-40 rounded-3xl flex items-center justify-center shadow-[0_0_100px_rgba(255,255,255,0.3)] bg-gradient-to-br border-4 border-white/50", rankUp.newRank.gradient)}
                                    >
                                        <rankUp.newRank.icon className="w-20 h-20 text-white drop-shadow-md" strokeWidth={1.5} />
                                    </motion.div>

                                    {/* Particles */}
                                    {[...Array(12)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                                            animate={{
                                                x: (Math.random() - 0.5) * 300,
                                                y: (Math.random() - 0.5) * 300,
                                                opacity: 0,
                                                scale: Math.random() * 1.5
                                            }}
                                            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                                            className={cn("absolute top-1/2 left-1/2 w-3 h-3 rounded-full", rankUp.newRank.bg.replace('bg-', 'bg-'))}
                                        />
                                    ))}
                                </div>

                                {/* Text Content */}
                                <div className="text-center space-y-2">
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.5 }}
                                        className="text-sm font-bold tracking-[0.3em] uppercase text-white/60"
                                    >
                                        Rank Promoted
                                    </motion.div>
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.6, type: "spring" }}
                                        className={cn("text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-white/70 filter drop-shadow-lg")}
                                    >
                                        {rankUp.newRank.title}
                                    </motion.div>
                                </div>

                                {/* Rank Comparison */}
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.8 }}
                                    className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/10"
                                >
                                    <span className="text-stone-400 line-through text-lg decoration-stone-500/50">{rankUp.oldRank.title}</span>
                                    <ChevronRight className="w-5 h-5 text-white/40" />
                                    <span className="text-white font-bold text-xl">{rankUp.newRank.title}</span>
                                </motion.div>

                                {/* CTA */}
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className={cn("px-12 py-4 rounded-xl font-bold text-lg shadow-xl transition-all hover:brightness-110 active:scale-95 text-white shadow-lg", rankUp.newRank.bg.replace('bg-', 'bg-').replace('100', '600'))}
                                >
                                    CLAIM GLORY
                                </motion.button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* RANK DOWN Demotion Overlay */}
                <AnimatePresence>
                    {rankDown && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-grayscale"
                            onClick={() => setRankDown(null)}
                        >
                            <motion.div
                                initial={{ scale: 1.1, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="flex flex-col items-center gap-8 p-12 max-w-lg w-full relative"
                            >
                                {/* Cracking Background Texture */}
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cracked-ground.png')] opacity-20 pointer-events-none" />

                                {/* THE SHATTERING ICON */}
                                <div className="relative">
                                    {/* The Old Rank Getting Destroyed */}
                                    <motion.div
                                        initial={{ scale: 1, filter: "brightness(1)", opacity: 1 }}
                                        animate={{ scale: [1, 1.1, 0.8], opacity: 0, filter: "brightness(2)" }}
                                        transition={{ duration: 0.4, delay: 0.2 }}
                                        className={cn("absolute inset-0 w-40 h-40 rounded-3xl flex items-center justify-center bg-gradient-to-br border-4 border-white/50", rankDown.oldRank.gradient)}
                                    >
                                        <rankDown.oldRank.icon className="w-20 h-20 text-white" />
                                    </motion.div>

                                    {/* The New (Lower) Rank Appearing */}
                                    <motion.div
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: "spring", damping: 12, delay: 0.6 }}
                                        className={cn("w-40 h-40 rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(255,0,0,0.2)] bg-stone-900 border-4 border-stone-700 grayscale")}
                                    >
                                        <rankDown.newRank.icon className="w-20 h-20 text-stone-500" strokeWidth={1.5} />
                                    </motion.div>
                                </div>

                                {/* Text Content */}
                                <div className="text-center space-y-2 z-10">
                                    <motion.div
                                        initial={{ opacity: 0, y: -20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 }}
                                        className="text-sm font-bold tracking-[0.5em] uppercase text-red-600 animate-pulse"
                                    >
                                        Demotion Alert
                                    </motion.div>
                                    <motion.div
                                        initial={{ opacity: 0, scale: 2 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                                        className="text-6xl font-black tracking-tighter text-stone-300"
                                    >
                                        RANK LOST
                                    </motion.div>
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.8 }}
                                        className="text-stone-500 font-mono text-sm"
                                    >
                                        {rankDown.oldRank.title} <span className="mx-2 text-stone-700">➜</span> {rankDown.newRank.title}
                                    </motion.p>
                                </div>

                                {/* CTA */}
                                <motion.button
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 1 }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="px-10 py-3 rounded-xl font-bold text-sm bg-stone-800 text-stone-400 border border-stone-700 hover:bg-stone-700 hover:text-stone-200 transition-colors"
                                >
                                    ACCEPT FATE
                                </motion.button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </motion.div>

            {/* ROULETTE OVERLAY */}
            <AnimatePresence key="roulette-overlay">
                {showRoulette && (
                    <RouletteOverlay
                        onComplete={handleRouletteComplete}
                        onCancel={() => setShowRoulette(false)}
                    />
                )}
            </AnimatePresence>

            {/* GACHA OVERLAY */}
            <AnimatePresence key="gacha-overlay">
                {showGacha && (
                    <GachaOverlay
                        cards={gachaCards}
                        selectedCardId={selectedGachaCardId}
                        claimTarget={gachaClaimTarget}
                        onSelect={handleGachaSelect}
                        onComplete={handleGachaComplete}
                    />
                )}
            </AnimatePresence>

            {/* SHOP MODAL */}
            <AnimatePresence key="shop-modal">
                {showShopModal && mode === 'translation' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm p-4 flex items-center justify-center"
                        onClick={() => {
                            setShowShopModal(false);
                            setShopFocusedItem(null);
                        }}
                    >
                        <motion.div
                            initial={{ y: 18, opacity: 0, scale: 0.98 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 12, opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className={cn(
                                "w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.24)]",
                                activeCosmeticTheme.cardClass
                            )}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-white/55">
                                <div className="space-y-1">
                                    <p className={cn("text-sm font-black tracking-[0.2em]", activeCosmeticTheme.textClass)}>商场</p>
                                    <p className={cn("text-xs", activeCosmeticTheme.mutedClass)}>金币购买道具，立即生效</p>
                                </div>
                                <div className={cn(
                                    "flex items-center gap-2 rounded-full px-3 py-1.5 border",
                                    activeCosmeticUi.audioLockedClass
                                )}>
                                    <span className="text-sm">✨</span>
                                    <span className="font-mono text-sm font-black tabular-nums">{coins}</span>
                                </div>
                            </div>

                            <div className="p-4 space-y-3">
                                {(Object.keys(ITEM_CATALOG) as ShopItemId[]).map((itemId) => {
                                    const item = ITEM_CATALOG[itemId];
                                    const itemCount = getItemCount(itemId);
                                    const canBuy = coins >= item.price;
                                    return (
                                        <div
                                            key={item.id}
                                            className={cn(
                                                "rounded-2xl p-4 flex items-center justify-between gap-4 transition-all border",
                                                activeCosmeticUi.tutorPanelClass,
                                                shopFocusedItem === itemId
                                                    ? "ring-2 ring-white/70 shadow-[0_0_0_1px_rgba(255,255,255,0.75),0_18px_36px_rgba(15,23,42,0.12)]"
                                                    : "hover:-translate-y-0.5"
                                            )}
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">{item.icon}</span>
                                                    <p className={cn("text-sm font-bold", activeCosmeticTheme.textClass)}>{item.name}</p>
                                                    <span className={cn(
                                                        "rounded-full px-2 py-0.5 text-[10px] font-mono font-bold",
                                                        activeCosmeticUi.wordBadgeActiveClass
                                                    )}>
                                                        x {itemCount}
                                                    </span>
                                                </div>
                                                <p className={cn("mt-1 text-xs", activeCosmeticTheme.mutedClass)}>{item.description}</p>
                                                <p className={cn("mt-1 text-[11px] font-medium opacity-85", activeCosmeticTheme.mutedClass)}>用途：{item.consumeAction}</p>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    handleBuyItem(itemId);
                                                }}
                                                disabled={!canBuy}
                                                className={cn(
                                                    "shrink-0 rounded-full px-4 py-2 text-xs font-bold border transition-all",
                                                    canBuy
                                                        ? cn(activeCosmeticUi.checkButtonClass, "hover:-translate-y-0.5")
                                                        : "bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed"
                                                )}
                                                title={canBuy ? `花费 ${item.price} ✨ 购买 1 个 ${item.name}` : `星光币不足 ${item.price} ✨`}
                                            >
                                                {item.price} ✨ 购买
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* THEME GALLERY */}
                            <div className="px-4 pb-2 pt-1">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className={cn("h-px flex-1 opacity-70", activeCosmeticTheme.headerBg)} />
                                    <p className={cn("text-[10px] font-black tracking-[0.25em] uppercase", activeCosmeticTheme.mutedClass)}>主题皮肤</p>
                                    <div className={cn("h-px flex-1 opacity-70", activeCosmeticTheme.headerBg)} />
                                </div>

                                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                                    {ALL_THEME_IDS.map((themeId) => {
                                        const t = COSMETIC_THEMES[themeId];
                                        const previewUi = COSMETIC_THEME_UI[themeId];
                                        const isOwned = ownedThemes.includes(themeId);
                                        const isActive = cosmeticTheme === themeId;
                                        const canAfford = coins >= t.price;

                                        return (
                                            <div
                                                key={themeId}
                                                className={cn(
                                                    "relative rounded-2xl p-3 flex flex-col gap-2 transition-all cursor-pointer overflow-hidden border",
                                                    previewUi.tutorPanelClass,
                                                    isActive
                                                        ? "ring-2 ring-white/80 shadow-[0_0_28px_rgba(255,255,255,0.4),0_18px_34px_rgba(15,23,42,0.12)]"
                                                        : isOwned
                                                            ? "hover:-translate-y-0.5 hover:shadow-xl"
                                                            : "opacity-80 saturate-75"
                                                )}
                                                onClick={() => {
                                                    if (isActive) return;
                                                    if (isOwned) handleSwitchTheme(themeId);
                                                }}
                                            >
                                                {/* Theme preview strip */}
                                                <div className={cn(
                                                    "h-14 rounded-xl overflow-hidden relative p-2.5",
                                                    t.bgClass
                                                )}>
                                                    <div className={cn(
                                                        "absolute inset-2 rounded-xl border px-2 py-1.5 flex items-center justify-between gap-2",
                                                        previewUi.toolbarClass
                                                    )}>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={cn(
                                                                "inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-1 text-[8px] font-black tracking-[0.18em] uppercase",
                                                                previewUi.wordBadgeActiveClass
                                                            )}>
                                                                {t.icon}
                                                            </span>
                                                            <div className={cn(
                                                                "hidden sm:flex h-4 w-8 items-center justify-center rounded-full text-[7px] font-bold",
                                                                previewUi.iconButtonClass
                                                            )}>
                                                                UI
                                                            </div>
                                                        </div>
                                                        <div className={cn(
                                                            "inline-flex h-5 min-w-[42px] items-center justify-center rounded-full px-2 text-[8px] font-black",
                                                            previewUi.checkButtonClass
                                                        )}>
                                                            Check
                                                        </div>
                                                    </div>
                                                    {isActive && (
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <span className={cn(
                                                                "text-[10px] font-black px-2 py-0.5 rounded-full backdrop-blur-sm border",
                                                                previewUi.wordBadgeActiveClass
                                                            )}>使用中</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-1">
                                                    <p className={cn("text-xs font-bold truncate", t.textClass)}>{t.name}</p>
                                                    <p className={cn("text-[10px] leading-tight", t.mutedClass)}>{t.preview}</p>
                                                </div>

                                                {/* Action */}
                                                {isActive ? (
                                                    <div className={cn("text-[10px] font-bold text-center", previewUi.tutorSendClass)}>✓ 当前主题</div>
                                                ) : isOwned ? (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleSwitchTheme(themeId); }}
                                                        className={cn(
                                                            "w-full rounded-lg border py-1.5 text-[10px] font-bold transition-all",
                                                            previewUi.iconButtonClass
                                                        )}
                                                    >
                                                        切换使用
                                                    </button>
                                                ) : t.price === 0 ? (
                                                    <div className={cn("text-[10px] font-bold text-center", previewUi.tutorSendClass)}>免费</div>
                                                ) : (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const success = handleBuyTheme(themeId);
                                                            if (success) {
                                                                setLootDrop({ type: 'theme', amount: 0, rarity: 'legendary', message: `🎨 解锁主题：${t.name}` });
                                                            }
                                                        }}
                                                        disabled={!canAfford}
                                                        className={cn(
                                                            "w-full rounded-lg border py-1.5 text-[10px] font-bold transition-all",
                                                            canAfford
                                                                ? previewUi.checkButtonClass
                                                                : "bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed"
                                                        )}
                                                    >
                                                        {t.price} ✨ 解锁
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="px-5 pb-4 flex justify-end">
                                <button
                                    onClick={() => {
                                        setShowShopModal(false);
                                        setShopFocusedItem(null);
                                    }}
                                    className={cn(
                                        "rounded-full border px-4 py-2 text-xs font-bold transition-all",
                                        activeCosmeticUi.iconButtonClass
                                    )}
                                >
                                    关闭
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </AnimatePresence >
    );
}
