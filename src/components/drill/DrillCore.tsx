"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { Sparkles, RefreshCw, Send, ArrowRight, Wand2, Play, Volume2, Globe, Headphones, Eye, EyeOff, X, Trophy, TrendingUp, TrendingDown, Zap, Gift, Crown, Gem, Dices, AlertTriangle, Skull, Heart, ChevronRight, Flame, Lock, Shuffle, SkipForward, CheckCircle2, Target, Compass, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import confetti from 'canvas-confetti';
import { launchCelebration, clearAllCelebrations } from '@/lib/celebration-engine';
import { useSpeechInput } from "@/hooks/useSpeechInput";
import { useIPA } from "@/hooks/useIPA";
import { useDrillAiCoach } from "@/hooks/useDrillAiCoach";
import { useDrillAnalysis } from "@/hooks/useDrillAnalysis";
import { useDrillAudioPlayback } from "@/hooks/useDrillAudioPlayback";
import { useDrillBattleEvents } from "@/hooks/useDrillBattleEvents";
import { useDrillRebuildComposer } from "@/hooks/useDrillRebuildComposer";
import { useDrillEconomyActions } from "@/hooks/useDrillEconomyActions";
import { useDrillSubmissionScoring } from "@/hooks/useDrillSubmissionScoring";
import { useDrillFeedbackView } from "@/hooks/useDrillFeedbackView";
import { useDrillGenerationFlow } from "@/hooks/useDrillGenerationFlow";
import { useDrillInteractiveWordLayer } from "@/hooks/useDrillInteractiveWordLayer";
import { useDrillRebuildView } from "@/hooks/useDrillRebuildView";
import { useDrillRebuildShadowing } from "@/hooks/useDrillRebuildShadowing";
import { useDrillRebuildSubmit } from "@/hooks/useDrillRebuildSubmit";
import { useDrillRebuildSettlement } from "@/hooks/useDrillRebuildSettlement";
import { useDrillBattleSettlement } from "@/hooks/useDrillBattleSettlement";
import { DRILL_BOSS_CONFIG, useDrillSurfaceLoader } from "@/hooks/useDrillSurfaceLoader";
import {
    useDrillTutorLayer,
} from "@/hooks/useDrillTutorLayer";
import { useDrillTutorAudio } from "@/hooks/useDrillTutorAudio";
import { useDrillTutorRequest } from "@/hooks/useDrillTutorRequest";
import { db } from "@/lib/db";
import { getRank } from "@/lib/rankUtils";
import { DeathFX } from "./DeathFX";
import { ScoringFlipCard } from "./ScoringFlipCard";
import { DrillBattleEventOverlays } from "./DrillBattleEventOverlays";
import { PlaybackWaveBars } from "./PlaybackWaveBars";
import { TranslationInputPanel } from "./TranslationInputPanel";
import { DrillFeedbackContent } from "./DrillFeedbackContent";
import { DrillBottomActions } from "./DrillBottomActions";
import { DrillOverlayLayer } from "./DrillOverlayLayer";
import { DrillFeedbackStage } from "./DrillFeedbackStage";
import { DictationInputStage } from "./DictationInputStage";
import { DrillHeaderActions } from "./DrillHeaderActions";
import { DrillHeaderInfo } from "./DrillHeaderInfo";
import { DrillLoadingOverlay } from "./DrillLoadingOverlay";
import { DrillQuestionStage } from "./DrillQuestionStage";
import { DrillReadySurface } from "./DrillReadySurface";
import { DrillSupportOverlays } from "./DrillSupportOverlays";
import { DrillThemeBackdrop } from "./DrillThemeBackdrop";
import { ListeningPromptStage } from "./ListeningPromptStage";
import { TranslationPromptStage } from "./TranslationPromptStage";
import { DrillRebuildFeedbackOverlays } from "./DrillRebuildFeedbackOverlays";
import { ShadowingInputStage } from "./ShadowingInputStage";
import { AiTeacherConversation } from "./AiTeacherConversation";
import { type TourStep } from "@/components/ui/SpotlightTour";
import { LottieJsonPlayer } from "../shared/LottieJsonPlayer";
import { ListeningShadowingControls } from "@/components/reading/ListeningShadowingControls";
import { type DrillScenarioContext } from "@/lib/drill-generation-plan";
import {
    consumePrefetchedDrillTransition,
    hydrateDrillForTransition,
    resetDrillUiForGeneration,
} from "@/lib/drill-question-transition";
import {
    clampRebuildDifficultyDelta,
    getRebuildSelfEvaluationDelta,
    getRebuildSystemDelta,
    type RebuildSelfEvaluation,
} from "@/lib/rebuild-mode";
import {
    alignRebuildShadowingTokens,
    normalizeRebuildShadowingText,
    scoreRebuildShadowingRecognition,
} from "@/lib/rebuild-shadowing";
import { playRebuildSfx } from "@/lib/rebuild-sfx";
import { getTranslationSelfEvaluationEloDelta } from "@/lib/translation-self-eval";
import { DEFAULT_TRANSLATION_ELO } from "@/lib/translation-elo-reset";
import { normalizeLearningPreferences, type AiProvider } from "@/lib/profile-settings";
import { getTranslationDifficultyTier } from "@/lib/translationDifficulty";
import {
    shouldExpandShopInventoryDock,
} from "@/lib/battleUiState";
import {
    createDailyDrillProgress,
    incrementStoredDailyDrillProgress,
    setStoredDailyDrillGoal,
    syncDailyDrillProgress as syncStoredDailyDrillProgress,
    type DailyDrillProgress,
} from "@/lib/daily-drill-progress";
import {
    areRebuildTokenOrdersEqual,
    buildConnectedSentenceIpa,
    buildGeneratedRebuildBankContentKey,
    buildRebuildTokenInstances,
    createRebuildPassageDraftState,
    type RebuildPassageSegmentDraftState,
    type RebuildTokenInstance,
} from "@/lib/drill-rebuild-helpers";
import type {
    RebuildFeedbackState,
    RebuildPassageSegmentResultState,
    RebuildPassageSegmentScore,
    RebuildPassageSegmentUiState,
    RebuildPassageSummaryState,
} from "@/lib/drill-rebuild-types";
import { type GrammarDisplayMode, type GrammarSentenceAnalysis } from "@/lib/grammarHighlights";

import { loadLocalProfile, saveProfilePatch, settleBattle } from "@/lib/user-repository";
import type { PronunciationWordResult } from "@/lib/pronunciation-scoring";

// --- Interfaces ---

export type DrillMode = "translation" | "listening" | "dictation" | "rebuild" | "imitation";

const DAILY_DRILL_GOAL_OPTIONS = [10, 20, 30, 50] as const;

export interface DrillCoreProps {
    // Context for generation
    context: {
        type: "article" | "scenario";
        articleTitle?: string;
        articleContent?: string;
        topic?: string; // For scenario mode
        rebuildVariant?: "sentence" | "passage";
        translationVariant?: "sentence" | "passage";
        segmentCount?: 2 | 3 | 5;
        isQuickMatch?: boolean;
    };
    initialMode?: DrillMode;
    listeningSourceMode?: "ai" | "bank";
    onClose?: () => void;
    aiProvider?: AiProvider;
    nvidiaModel?: string;
}

interface DrillData {
    chinese: string;
    target_english_vocab?: string[];
    key_vocab?: string[];
    reference_english: string;
    syntax_chunks?: Array<{ role: string; english: string; chinese?: string }>;
    _difficultyMeta?: {
        requestedElo: number;
        tier: string;
        cefr: string;
        expectedWordRange: { min: number; max: number };
        actualWordCount: number;
        isValid: boolean | null;
        status: 'TOO_EASY' | 'TOO_HARD' | 'MATCHED' | 'UNVALIDATED';
        aiSelfReport?: {
            tier: string;
            cefr: string;
            wordCount: number;
            targetRange: string;
            wordCountAccurate: boolean;
        } | null;
        listeningFeatures?: {
            memoryLoad: string | null;
            spokenNaturalness: string | null;
            reducedFormsPresence: string | null;
            clauseMax: number | null;
            trainingFocus: string | null;
            downgraded: boolean;
        } | null;
    };
    _topicMeta?: {
        topic: string;
        subTopic?: string | null;
        isScenario: boolean;
    };
    _sourceMeta?: {
        sourceMode: "ai" | "bank";
        bankItemId?: string;
        candidateId?: string;
        bandPosition?: "entry" | "mid" | "exit" | null;
        reviewStatus?: "curated" | "draft";
    };
    _rebuildMeta?: {
        variant?: "sentence" | "passage";
        effectiveElo: number;
        bandPosition: "entry" | "mid" | "exit" | null;
        answerTokens: string[];
        tokenBank: string[];
        distractorTokens: string[];
        theme: string;
        scene: string;
        feedbackStyle: "strong";
        candidateId?: string;
        candidateSource?: "ai";
        passageSession?: {
            sessionId: string;
            segmentCount: 2 | 3 | 5;
            currentIndex: number;
            difficultyProfile: {
                effectiveElo: number;
                segmentCount: 2 | 3 | 5;
                practiceTier: {
                    cefr: "A1" | "A2-" | "A2+" | "B1" | "B2" | "C1" | "C2" | "C2+";
                    bandPosition: "entry" | "mid" | "exit";
                    label: string;
                };
                bandPosition: "entry" | "mid" | "exit";
                syntaxComplexity: {
                    clauseMax: number;
                    memoryLoad: string;
                    spokenNaturalness: string;
                    reducedFormsPresence: string;
                    trainingFocus: string;
                };
                perSegmentWordWindow: {
                    min: number;
                    max: number;
                    mean: number;
                    sigma: number;
                    softMin: number;
                    softMax: number;
                    hardMin: number;
                    hardMax: number;
                };
                totalWordWindow: {
                    min: number;
                    max: number;
                    mean: number;
                    sigma: number;
                    softMin: number;
                    softMax: number;
                    hardMin: number;
                    hardMax: number;
                };
            };
            segments: Array<{
                id: string;
                chinese: string;
                referenceEnglish: string;
                answerTokens: string[];
                distractorTokens: string[];
                tokenBank: string[];
                wordCount: number;
            }>;
        };
    };
    _translationMeta?: {
        variant?: "sentence" | "passage";
        effectiveElo: number;
        passageSession?: {
            sessionId: string;
            segmentCount: 2 | 3 | 5;
            currentIndex: number;
            segments: Array<{
                id: string;
                chinese: string;
                referenceEnglish: string;
                alternatives: string[];
                syntaxChunks?: Array<{ role: string; english: string; chinese?: string }>;
                wordCount: number;
            }>;
        };
    };
}

type PrefetchedDrillData = DrillData & { mode?: string; sourceMode?: "ai" | "bank" };

interface DrillFeedback {
    score: number;
    objectiveScore?: number;
    selfEvaluation?: RebuildSelfEvaluation | null;
    eloAdjustment?: number | null;
    pronunciation_score?: number;
    content_score?: number;
    fluency_score?: number;
    coverage_ratio?: number;
    utterance_scores?: {
        accuracy: number;
        completeness: number;
        fluency: number;
        prosody: number;
        total: number;
        content_reproduction?: number;
        rhythm_fluency?: number;
        pronunciation_clarity?: number;
    };
    transcript?: string;
    summary_cn?: string;
    tips_cn?: string[];
    _isLocalEvaluation?: boolean;
    _vectorScore?: number;
    _literalScore?: number;
    _nlpScore?: number;
    engine?: string;
    engine_version?: string;
    word_results?: PronunciationWordResult[];
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

interface DictionaryData {
    word: string;
    phonetic?: string;
    audio?: string;
    translation?: string;
    definition?: string;
}

type RebuildSentenceShadowingFlow = "idle" | "prompt" | "shadowing" | "feedback";

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

const LISTENING_BANK_RECENT_STORAGE_KEY = "battle-listening-bank-recent-ids";
const LISTENING_BANK_RECENT_LIMIT = 20;

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
type CosmeticThemeId = 'morning_coffee' | 'verdant_atelier' | 'cute_cream' | 'sakura' | 'golden_hour' | 'holo_pearl' | 'cloud_nine' | 'lilac_dream';

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
    verdant_atelier: {
        id: 'verdant_atelier',
        name: '🌿 翡绿雅境',
        icon: '🌿',
        price: 0,
        description: '高端祖母绿与玉石质感，护眼而克制',
        preview: '祖母绿 + 雾面玻璃 + 雅致高光',
        bgClass: 'bg-gradient-to-br from-[#ecf9f1] via-[#e0f4e8] to-[#f6fbf7]',
        cardClass: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(236,253,245,0.22))] backdrop-blur-[24px] border border-emerald-100/45 shadow-[0_20px_52px_rgba(2,44,34,0.34),inset_0_1px_0_rgba(255,255,255,0.56)] ring-1 ring-emerald-100/28 saturate-[1.08]',
        textClass: 'text-emerald-950',
        mutedClass: 'text-emerald-700/60',
        headerBg: 'bg-white/82',
        isDark: false,
    },
    cute_cream: {
        id: 'cute_cream',
        name: '🧁 可爱奶油风',
        icon: '🧁',
        price: 0,
        description: '奶油书桌灵感的可爱主题，免费领取直接切换',
        preview: '奶油纸面 + 薄荷按钮 + 杏桃点缀',
        bgClass: 'bg-[linear-gradient(135deg,#fff8ef_0%,#fffdf8_42%,#eef9f1_72%,#fff2e4_100%)]',
        cardClass: 'bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(255,249,239,0.96),rgba(247,255,249,0.94))] border border-[#eadfc9] shadow-[0_24px_56px_rgba(198,172,132,0.22),inset_0_1px_0_rgba(255,255,255,0.98)] ring-1 ring-[#fffaf1]',
        textClass: 'text-[#54453a]',
        mutedClass: 'text-[#9d8b7c]',
        headerBg: 'bg-[#fff7eb]',
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
    verdant_atelier: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.32),rgba(220,252,231,0.2))] backdrop-blur-[20px] border-emerald-100/45 ring-emerald-100/20 shadow-[0_14px_34px_rgba(2,44,34,0.2),inset_0_1px_0_rgba(255,255,255,0.42)]",
        toolbarClass: "border-emerald-100/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(220,252,231,0.24))] backdrop-blur-[16px] shadow-[0_12px_34px_rgba(2,44,34,0.18),inset_0_1px_0_rgba(255,255,255,0.46)]",
        inputShellClass: "border-emerald-100/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.4),rgba(236,253,245,0.24))] backdrop-blur-[14px] shadow-[0_14px_40px_rgba(2,44,34,0.18),inset_0_1px_0_rgba(255,255,255,0.5)] hover:shadow-[0_20px_48px_rgba(2,44,34,0.24),inset_0_1px_0_rgba(255,255,255,0.56)] focus-within:border-emerald-200/80 focus-within:ring-[4px] focus-within:ring-emerald-300/12",
        textareaClass: "text-emerald-950 placeholder:text-emerald-500/60",
        audioLockedClass: "border-emerald-300/90 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(187,247,208,0.9))] text-emerald-800 shadow-[0_10px_24px_rgba(5,150,105,0.14)] hover:border-emerald-400 hover:text-emerald-900",
        audioUnlockedClass: "border-teal-200/90 bg-[linear-gradient(180deg,rgba(240,253,250,0.98),rgba(204,251,241,0.92))] text-teal-700 shadow-[0_10px_24px_rgba(13,148,136,0.12)] hover:border-teal-300 hover:text-teal-800",
        speedShellClass: "border-emerald-100/60 bg-white/34 backdrop-blur-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.56)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(16,185,129,0.96),rgba(4,120,87,0.98))] text-white shadow-[0_10px_18px_rgba(5,150,105,0.22)]",
        speedIdleClass: "text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900",
        vocabButtonClass: "border-emerald-200/85 bg-[linear-gradient(180deg,rgba(240,253,244,0.96),rgba(220,252,231,0.88))] text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(236,253,245,0.44))] border-emerald-100/75 text-emerald-800 hover:bg-emerald-50/76 hover:border-emerald-200 hover:text-emerald-950 shadow-[0_10px_24px_rgba(2,44,34,0.14)] backdrop-blur-[8px]",
        wordBadgeActiveClass: "border-emerald-200/85 bg-white/94 text-emerald-700 shadow-[0_8px_18px_rgba(5,150,105,0.08)]",
        wordBadgeIdleClass: "bg-transparent text-emerald-500/70",
        hintButtonClass: "border-emerald-100/70 bg-[linear-gradient(180deg,rgba(240,253,244,0.56),rgba(220,252,231,0.36))] text-emerald-700 shadow-[0_8px_18px_rgba(2,44,34,0.14)] hover:border-emerald-200 hover:text-emerald-900 hover:shadow-[0_12px_24px_rgba(2,44,34,0.2)] backdrop-blur-[10px]",
        iconButtonClass: "border-emerald-100/70 bg-white/38 text-emerald-700 shadow-[0_8px_18px_rgba(2,44,34,0.12)] hover:border-emerald-200 hover:bg-emerald-50/46 hover:text-emerald-900 backdrop-blur-[10px]",
        checkButtonClass: "border-emerald-400/85 bg-[linear-gradient(180deg,rgba(16,185,129,0.96),rgba(5,150,105,0.98),rgba(6,95,70,0.98))] text-white shadow-[0_14px_30px_rgba(5,150,105,0.32)] hover:shadow-[0_18px_36px_rgba(5,150,105,0.4)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.44),rgba(236,253,245,0.3))] border-emerald-100/55 backdrop-blur-[18px] shadow-[0_20px_50px_rgba(2,44,34,0.24)]",
        tutorAnswerClass: "bg-emerald-50/62 text-emerald-950",
        tutorInputClass: "bg-white/48 border-emerald-100 text-emerald-900 focus:ring-emerald-300 backdrop-blur-[8px]",
        tutorSendClass: "text-emerald-700",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(16,185,129,0.96),rgba(4,120,87,0.98))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #10b981 0%, #059669 54%, #047857 100%)",
        nextButtonShadow: "0 20px 38px -12px rgba(5,150,105,0.46)",
        nextButtonGlow: "rgba(16,185,129,0.24)",
    },
    cute_cream: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,247,234,0.94),rgba(241,251,244,0.92))] border-[#eadfc9] ring-[#fff3dc] shadow-[0_16px_34px_rgba(199,170,128,0.14)]",
        toolbarClass: "border-[#e6d7bf] bg-[linear-gradient(180deg,rgba(255,251,243,0.98),rgba(255,245,230,0.95),rgba(240,251,244,0.92))] shadow-[0_12px_28px_rgba(206,177,136,0.14)]",
        inputShellClass: "border-[#e6d7bf] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,247,235,0.95))] shadow-[0_14px_34px_rgba(206,177,136,0.14),inset_0_1px_0_rgba(255,255,255,1)] hover:shadow-[0_18px_40px_rgba(206,177,136,0.18),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-[#d8c3a5] focus-within:ring-[4px] focus-within:ring-[#f3c89f]/18",
        textareaClass: "text-[#5a4638] placeholder:text-[#b59b85]",
        audioLockedClass: "border-[#f0cba7] bg-[linear-gradient(180deg,rgba(255,248,239,0.98),rgba(255,233,207,0.92))] text-[#b86d2c] shadow-[0_10px_22px_rgba(240,168,91,0.16)] hover:border-[#ebb784] hover:text-[#9d5920]",
        audioUnlockedClass: "border-[#bfe5d0] bg-[linear-gradient(180deg,rgba(248,255,250,0.98),rgba(228,249,237,0.92))] text-[#2f8a67] shadow-[0_10px_22px_rgba(91,183,141,0.14)] hover:border-[#9ed7bb] hover:text-[#206a4f]",
        speedShellClass: "border-[#e3d6c3] bg-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,1)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(255,205,146,0.98),rgba(244,155,103,0.96))] text-[#6b3d13] shadow-[0_10px_18px_rgba(244,155,103,0.2)]",
        speedIdleClass: "text-[#9d8b7c] hover:bg-[#fff8ef] hover:text-[#5a4638]",
        vocabButtonClass: "border-[#bfe5d0] bg-[linear-gradient(180deg,rgba(247,255,250,0.98),rgba(228,249,237,0.92))] text-[#2f8a67] hover:border-[#9ed7bb] hover:bg-[#dff6e8]",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,239,0.95))] border-[#eadfc9] text-[#6f5a4a] hover:bg-[#fffaf3] hover:border-[#d9c7b1] hover:text-[#4b3a30] shadow-[0_8px_18px_rgba(206,177,136,0.12)]",
        wordBadgeActiveClass: "border-[#bfe5d0] bg-[#f1fbf4] text-[#2f8a67] shadow-[0_6px_16px_rgba(91,183,141,0.08)]",
        wordBadgeIdleClass: "bg-transparent text-[#c4b4a4]",
        hintButtonClass: "border-[#f0cba7] bg-[linear-gradient(180deg,rgba(255,249,242,0.98),rgba(255,237,216,0.92))] text-[#b86d2c] shadow-[0_8px_18px_rgba(244,155,103,0.12)] hover:border-[#ebb784] hover:text-[#9d5920] hover:shadow-[0_12px_24px_rgba(244,155,103,0.16)]",
        iconButtonClass: "border-[#e6d7bf] bg-white/94 text-[#8d7666] shadow-[0_6px_16px_rgba(206,177,136,0.08)] hover:border-[#d9c7b1] hover:bg-[#fff8ef] hover:text-[#5a4638]",
        checkButtonClass: "border-[#f0b77f] bg-[linear-gradient(180deg,rgba(255,214,155,0.98),rgba(246,158,106,0.96))] text-[#5c3514] shadow-[0_14px_28px_rgba(244,155,103,0.24)] hover:shadow-[0_18px_34px_rgba(244,155,103,0.3)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,253,248,0.99),rgba(255,246,233,0.96),rgba(244,252,246,0.93))] border-[#eadfc9] shadow-[0_20px_42px_rgba(206,177,136,0.16)]",
        tutorAnswerClass: "bg-[linear-gradient(90deg,rgba(255,241,223,0.8),rgba(242,251,245,0.78))] text-[#5a4638]",
        tutorInputClass: "bg-white/92 border-[#e6d7bf] text-[#5a4638] focus:ring-[#f0cba7]",
        tutorSendClass: "text-[#c96f57]",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(191,229,208,0.98),rgba(117,194,158,0.96))] text-[#184f3b] hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #bfe5d0 0%, #ffd5ad 55%, #f4a76f 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(233,167,112,0.36)",
        nextButtonGlow: "rgba(255,213,173,0.32)",
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
const FREE_THEME_IDS = ALL_THEME_IDS.filter((themeId) => COSMETIC_THEMES[themeId].price === 0);
const DEFAULT_BASE_ELO = 400;
const DEFAULT_STARTING_COINS = 500;
const DEFAULT_FREE_THEME: CosmeticThemeId = "morning_coffee";

const normalizeOwnedThemes = (ownedThemes?: string[] | null): CosmeticThemeId[] => {
    const validThemes = (ownedThemes ?? []).filter((themeId): themeId is CosmeticThemeId => themeId in COSMETIC_THEMES);
    return validThemes.length
        ? Array.from(new Set([...validThemes, ...FREE_THEME_IDS]))
        : [...FREE_THEME_IDS];
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

export function DrillCore({
    context,
    initialMode = "translation",
    listeningSourceMode = "ai",
    onClose,
    aiProvider = "deepseek",
    nvidiaModel,
}: DrillCoreProps) {
    // Mode State
    const [mode, setMode] = useState<DrillMode>(initialMode);
    const [isGhostSettingsModalOpen, setIsGhostSettingsModalOpen] = useState(false);
    const isListeningMode = mode === "listening";
    const isRebuildMode = mode === "rebuild";
    const isDictationMode = mode === "dictation";
    const isListeningFamilyMode = isListeningMode || isDictationMode;
    const isAudioPracticeMode = isListeningFamilyMode || isRebuildMode;
    const canUseModeShop = mode === "translation" || isListeningFamilyMode || isRebuildMode;
    const generationMode: "translation" | "listening" | "rebuild" = isDictationMode
        ? "listening"
        : isRebuildMode
            ? "rebuild"
            : isListeningMode
                ? "listening"
                : "translation";

    // Drill State
    const [drillData, setDrillData] = useState<DrillData | null>(null);
    const [userTranslation, setUserTranslation] = useState("");
    const [isGeneratingDrill, setIsGeneratingDrill] = useState(false);
    const [rebuildRagLoadingState, setRebuildRagLoadingState] = useState<{
        hitCount: number;
        status: "idle" | "querying" | "hit" | "empty" | "unavailable";
    }>({
        hitCount: 0,
        status: "idle",
    });
    const [isSubmittingDrill, setIsSubmittingDrill] = useState(false);
    const [drillFeedback, setDrillFeedback] = useState<DrillFeedback | null>(null);
    const [rebuildFeedback, setRebuildFeedback] = useState<RebuildFeedbackState | null>(null);
    const [eloSplash, setEloSplash] = useState<{ uid: string, delta: number } | null>(null);
    const localEloChangeRef = useRef<number>(0);
    const drillGenerationsCountRef = useRef<number>(0);
    const activeTopicPromptRef = useRef<string | undefined>((context as any).topicPrompt);
    const [topicResetInterval, setTopicResetInterval] = useState<number>(3);

    const [showRebuildTour, setShowRebuildTour] = useState(false);

    useEffect(() => {
        if (drillData?._rebuildMeta) {
            const isPassage = drillData._rebuildMeta.variant === "passage";
            const storageKey = isPassage ? "rebuild-drill-passage-tour-onboarded" : "rebuild-drill-sentence-tour-onboarded";
            const hasAppeared = localStorage.getItem(storageKey);
            if (!hasAppeared) {
                const timer = setTimeout(() => {
                    setShowRebuildTour(true);
                    localStorage.setItem(storageKey, "true");
                }, 900);
                return () => clearTimeout(timer);
            }
        }
    }, [drillData?._rebuildMeta]);

    const rebuildTourSteps: TourStep[] = drillData?._rebuildMeta?.variant === "passage" ? [
        {
            targetId: "rebuild-drill-passage-tracker",
            title: "短文主线进度",
            content: "在排位最高难度的「短文模式」下，不考生单词，考的是整段整段的长句工作记忆！右上角的刻度就是你的攻坚据点坐标。",
            placement: "bottom"
        },
        {
            targetId: "rebuild-drill-atelier",
            title: "全封闭盲听车间",
            content: "只给原声音频，剥夺一切字幕。不要尝试翻译成中文，你要做的是死背英语残影，然后把脑海里的残影立刻拼出来！",
            placement: "top"
        },
        {
            targetId: "rebuild-drill-controls",
            title: "决不妥协的排位参数",
            content: "我们在排位中强制禁用了「中文」大意。但你仍可在此处开启「纠正」来自动容错大小写片段，或者开启终极硬核的「隐藏词」：彻底关闭所有残影供词，凭空默写！",
            placement: "bottom"
        },
        {
            targetId: "rebuild-drill-tokens",
            title: "全键盘极速流",
            content: "听完马上还原原句！支持全键盘盲打：敲首字母极速定位，空格确认，Backspace无缝回退。用最暴爽的手速把残影固化！",
            placement: "top"
        },
        {
            targetId: "rebuild-drill-submit",
            title: "战损无悔",
            content: "如果确实卡壳了千万别死磕，果断「跳过」止损！记住，你在这里的每一次试错或跳过，最后都会被无情地汇编入你的主干排位战损！",
            placement: "top"
        }
    ] : [
        {
            targetId: "rebuild-drill-atelier",
            title: "无下限热身车间",
            content: "单句热身模式。你可以无限次、无脑地反复听。它完全不影响你的主干排位分，AI 仅仅在暗中调校你下一题的手感和分层。",
            placement: "bottom"
        },
        {
            targetId: "rebuild-drill-controls",
            title: "辅助火力系统",
            content: "完全听不出卡死？别慌，你可以开启「中文」偷看句意大纲。或者开启「纠正」来防小拼写手误。对自己的听力极度自信？直接开启「隐藏词」强行盲拼！",
            placement: "bottom"
        },
        {
            targetId: "rebuild-drill-tokens",
            title: "极速词块重建",
            content: "听取残影后，用键盘敲首字母抢位，空格录入，Backspace 抹除。纯靠键盘盲打流重构语块，不用碰鼠标！",
            placement: "top"
        },
        {
            targetId: "rebuild-drill-submit",
            title: "无痛探底",
            content: "热身模式的容错率拉满，听不出就毫不犹豫地点「跳过」！在这个模式下「发送」的报错数据，只会作为养料暗中去喂给 AI，用来摸透你的底细！",
            placement: "top"
        }
    ];
    const lastEloSplashObjRef = useRef<any>(null);
    const { isReady: isIpaReady, getIPA } = useIPA(isRebuildMode);
    const [hasRatedDrill, setHasRatedDrill] = useState(false);

    // Audio & Dictionary State
    const [prefetchedDrillData, setPrefetchedDrillData] = useState<PrefetchedDrillData | null>(null);
    const [prefetchedDrillTopic, setPrefetchedDrillTopic] = useState<DrillScenarioContext | null>(null);
    const [pendingSlotMachineTrigger, setPendingSlotMachineTrigger] = useState<boolean>(false);
    const pendingGenerateArgsRef = useRef<any>(null);
    const slotMachineResolvedRef = useRef<boolean>(false);
    const abortPrefetchRef = useRef<AbortController | null>(null);
    const rebuildChoicePrefetchAbortRef = useRef<AbortController | null>(null);
    const prefetchedRebuildChoicesRef = useRef<Partial<Record<RebuildSelfEvaluation, PrefetchedDrillData>>>({});
    const recentListeningBankIdsRef = useRef<string[]>([]);
    const rebuildMetaNamespaceRef = useRef("local");

    // Speech Input Integration
    const {
        isAvailable: speechInputAvailable,
        canRecord: speechInputReady,
        isRecording: whisperRecording,
        isProcessing: whisperProcessing,
        result: whisperResult,
        audioLevel: speechInputLevel,
        error: speechInputError,
        wavBlob,
        setContext,
        startRecognition,
        stopRecognition,
        playRecording,
        resetResult,
    } = useSpeechInput();

    const teachingMode = false;

    // UI State
    const [isBlindMode, setIsBlindMode] = useState(true);
    const [showChinese, setShowChinese] = useState(false);
    const [blindVisibleUnlockConsumed, setBlindVisibleUnlockConsumed] = useState(false);
    const [difficulty, setDifficulty] = useState<string>('Level 3');
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

    // Elo State
    const [eloRating, setEloRating] = useState(DEFAULT_TRANSLATION_ELO); // Translation Elo
    const [streakCount, setStreakCount] = useState(0);

    const [listeningElo, setListeningElo] = useState(DEFAULT_BASE_ELO);
    const [listeningStreak, setListeningStreak] = useState(0);
    const [dictationElo, setDictationElo] = useState(DEFAULT_BASE_ELO);
    const [dictationStreak, setDictationStreak] = useState(0);
    const [rebuildHiddenElo, setRebuildHiddenElo] = useState(DEFAULT_BASE_ELO);
    const [rebuildBattleElo, setRebuildBattleElo] = useState(DEFAULT_BASE_ELO);
    const [rebuildBattleStreak, setRebuildBattleStreak] = useState(0);
    const [dailyDrillProgress, setDailyDrillProgress] = useState<DailyDrillProgress>(() => createDailyDrillProgress());
    const [isDailyDrillProgressOpen, setIsDailyDrillProgressOpen] = useState(false);
    const [dailyDrillGoalDraft, setDailyDrillGoalDraft] = useState("");
    const [rebuildTypingBuffer, setRebuildTypingBuffer] = useState("");
    const [rebuildAutocorrect, setRebuildAutocorrect] = useState(true);
    const [rebuildHideTokens, setRebuildHideTokens] = useState(false);
    const [rebuildShadowingAutoOpen, setRebuildShadowingAutoOpen] = useState(true);
    const [isEloLoaded, setIsEloLoaded] = useState(false); // Track if Elo has been loaded from DB
    const eloRatingRef = useRef(DEFAULT_TRANSLATION_ELO);
    const listeningEloRef = useRef(DEFAULT_BASE_ELO);
    const dictationEloRef = useRef(DEFAULT_BASE_ELO);
    const coinsRef = useRef(DEFAULT_STARTING_COINS);
    const inventoryRef = useRef<InventoryState>({ ...DEFAULT_INVENTORY });
    const learningSessionActive = false;
    const resetGuidedLearningState = useCallback((_keepLearningSession = false) => undefined, []);

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
    const hasRecordedDailyDrillRef = useRef(false);
    const dailyDrillProgressRef = useRef<HTMLDivElement | null>(null);

    // Cosmetic Theme State
    const [cosmeticTheme, setCosmeticTheme] = useState<CosmeticThemeId>('morning_coffee');
    const [ownedThemes, setOwnedThemes] = useState<CosmeticThemeId[]>([...FREE_THEME_IDS]);
    const [rebuildAvailableTokens, setRebuildAvailableTokens] = useState<RebuildTokenInstance[]>([]);
    const [rebuildAnswerTokens, setRebuildAnswerTokens] = useState<RebuildTokenInstance[]>([]);
    const [rebuildReplayCount, setRebuildReplayCount] = useState(0);
    const [rebuildEditCount, setRebuildEditCount] = useState(0);
    const [rebuildStartedAt, setRebuildStartedAt] = useState<number | null>(null);
    const [activePassageSegmentIndex, setActivePassageSegmentIndex] = useState(0);
    const [activeTranslationPassageSegmentIndex, setActiveTranslationPassageSegmentIndex] = useState(0);
    const [translationPassageResults, setTranslationPassageResults] = useState<Array<{
        segmentIndex: number;
        feedback: DrillFeedback;
        userTranslation: string;
    }>>([]);
    const [rebuildPassageDrafts, setRebuildPassageDrafts] = useState<RebuildPassageSegmentDraftState[]>([]);
    const [rebuildPassageResults, setRebuildPassageResults] = useState<RebuildPassageSegmentResultState[]>([]);
    const [rebuildPassageUiState, setRebuildPassageUiState] = useState<RebuildPassageSegmentUiState[]>([]);
    const [rebuildPassageScores, setRebuildPassageScores] = useState<RebuildPassageSegmentScore[]>([]);
    const [rebuildPassageSummary, setRebuildPassageSummary] = useState<RebuildPassageSummaryState | null>(null);
    const [rebuildSentenceShadowingFlow, setRebuildSentenceShadowingFlow] = useState<RebuildSentenceShadowingFlow>("idle");
    const [pendingRebuildSentenceFeedback, setPendingRebuildSentenceFeedback] = useState<RebuildFeedbackState | null>(null);
    const [rebuildPassageShadowingFlow, setRebuildPassageShadowingFlow] = useState<RebuildSentenceShadowingFlow>("idle");
    const [rebuildPassageShadowingSegmentIndex, setRebuildPassageShadowingSegmentIndex] = useState<number | null>(null);
    const [pendingRebuildAdvanceElo, setPendingRebuildAdvanceElo] = useState<number | null>(null);
    // Ref removed -> now inline
    const [perfectComboAt, setPerfectComboAt] = useState<number | null>(null);
    const [rebuildCombo, setRebuildCombo] = useState(0);
    const [rebuildComboFxAt, setRebuildComboFxAt] = useState<number | null>(null);
    const rebuildComboLastAtRef = useRef<number>(0);
    const [rebuildAutocompleteSuggestion, setRebuildAutocompleteSuggestion] = useState<string | null>(null);
    const lastScoreCelebrationRef = useRef<string>("");
    const rebuildTokenOrderRef = useRef<Map<string, number>>(new Map());
    const prefersReducedMotion = useReducedMotion();
    const activeCosmeticTheme = {
        bgClass: 'bg-theme-base-bg font-sans',
        cardClass: 'bg-theme-card-bg border-[4px] border-theme-border shadow-[0_8px_0_0_var(--theme-shadow)] ring-1 ring-theme-border/10',
        textClass: 'text-theme-text',
        mutedClass: 'text-theme-text-muted',
        headerBg: 'bg-theme-base-bg',
        isDark: false,
    };
    const activeCosmeticUi = {
        ledgerClass: "bg-theme-card-bg border-[3px] border-theme-border shadow-[0_4px_0_var(--theme-shadow)]",
        toolbarClass: "border-[3px] border-theme-border bg-theme-primary-bg shadow-[0_4px_0_var(--theme-shadow)]",
        inputShellClass: "bg-black/[0.04] shadow-[inset_0_4px_12px_rgba(0,0,0,0.06),inset_0_1px_3px_rgba(0,0,0,0.04)] focus-within:ring-[3px] focus-within:ring-theme-border/20 text-theme-text transition-all",
        textareaClass: "bg-transparent text-theme-text placeholder:text-theme-text-muted",
        audioLockedClass: "border-[3px] border-theme-border bg-theme-card-bg text-theme-text shadow-[0_4px_0_var(--theme-shadow)] hover:bg-theme-active-bg hover:text-theme-active-text hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all",
        audioUnlockedClass: "border-[3px] border-theme-border bg-theme-active-bg text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all",
        speedShellClass: "border-[3px] border-theme-border bg-theme-base-bg",
        speedActiveClass: "bg-theme-text text-theme-base-bg shadow-[inset_0_2px_0_rgba(0,0,0,0.2)]",
        speedIdleClass: "text-theme-text-muted hover:bg-theme-active-bg hover:text-theme-active-text transition-colors",
        vocabButtonClass: "border-[3px] border-theme-border bg-theme-card-bg text-theme-text hover:bg-theme-active-bg hover:text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all",
        keywordChipClass: "bg-theme-base-bg border-[3px] border-theme-border text-theme-text hover:bg-theme-active-bg hover:text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all font-bold cursor-pointer",
        wordBadgeActiveClass: "border-[3px] border-theme-border bg-theme-active-bg text-theme-active-text shadow-[0_3px_0_var(--theme-shadow)] font-bold",
        wordBadgeIdleClass: "bg-transparent text-theme-text-muted font-medium",
        hintButtonClass: "border-[3px] border-theme-border bg-theme-card-bg text-theme-text shadow-[0_4px_0_var(--theme-shadow)] hover:bg-theme-active-bg hover:text-theme-active-text hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all",
        iconButtonClass: "border-[3px] border-theme-border bg-theme-card-bg text-theme-text shadow-[0_4px_0_var(--theme-shadow)] hover:bg-theme-active-bg hover:text-theme-active-text hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all",
        checkButtonClass: "bg-theme-primary-bg text-theme-primary-text border-[4px] border-theme-border shadow-[0_6px_0_var(--theme-shadow)] hover:-translate-y-1 hover:shadow-[0_10px_0_var(--theme-shadow)] active:translate-y-1.5 active:shadow-[0_0_0_var(--theme-shadow)] transition-all text-xl md:text-2xl font-black rounded-2xl md:rounded-[1.25rem]",
        tutorPanelClass: "bg-theme-card-bg border-[3px] border-theme-border shadow-[0_8px_0_0_var(--theme-shadow)] rounded-[1.5rem]",
        tutorAnswerClass: "bg-theme-base-bg text-theme-text border-[3px] border-theme-border font-bold shadow-[0_4px_0_0_var(--theme-shadow)]",
        tutorInputClass: "bg-theme-base-bg border-[3px] border-theme-border text-theme-text font-bold focus:ring-[4px] focus:ring-theme-active-bg/50 shadow-[inset_0_4px_0_rgba(0,0,0,0.04)]",
        tutorSendClass: "text-theme-text hover:bg-theme-active-bg border-[3px] border-transparent hover:border-theme-border rounded-[1rem] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_0_0_var(--theme-shadow)] active:translate-y-0.5 active:shadow-[0_0_0_rgba(0,0,0,0)] cursor-pointer",
        analysisButtonClass: "bg-theme-text text-theme-base-bg hover:opacity-90 shadow-[0_4px_0_var(--theme-shadow)] font-black border-[3px] border-theme-border text-lg hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all cursor-pointer",
        nextButtonGradient: "var(--theme-active-bg)",
        nextButtonShadow: "0 8px 0 var(--theme-shadow)",
        nextButtonGlow: "rgba(0,0,0,0)",
    };
    const isShopInventoryExpanded = shouldExpandShopInventoryDock({
        hasHoverSupport: shopDockHasHoverSupport,
        isShopHovered: isShopDockHovered,
    });

    const buildRebuildMetaKey = useCallback((suffix: "hidden_elo" | "last_session") => {
        return `rebuild_${suffix}::${rebuildMetaNamespaceRef.current}`;
    }, []);
    const rebuildVariant = context.rebuildVariant ?? "sentence";
    const rebuildSegmentCount = context.segmentCount ?? 3;
    const isRebuildPassage = isRebuildMode && rebuildVariant === "passage";
    const translationVariant = context.translationVariant ?? "sentence";
    const isTranslationPassage = mode === "translation" && translationVariant === "passage";
    const translationPassageSession = isTranslationPassage ? (drillData?._translationMeta?.passageSession ?? null) : null;
    const translationPassageTotalSegments = translationPassageSession?.segments?.length ?? 1;
    const isFinalTranslationSegment = isTranslationPassage ? (activeTranslationPassageSegmentIndex >= translationPassageTotalSegments - 1) : false;
    const isVerdantRebuild = false;
    const passageSession = isRebuildPassage ? (drillData?._rebuildMeta?.passageSession ?? null) : null;
    const activePassageResult = isRebuildPassage
        ? (rebuildPassageResults.find((item) => item.segmentIndex === activePassageSegmentIndex) ?? null)
        : null;
    const activePassageSegmentForShadowing = isRebuildPassage
        ? (passageSession?.segments?.[activePassageSegmentIndex] ?? null)
        : null;
    const rebuildSentenceShadowingPromptTimerRef = useRef<number | null>(null);
    const rebuildPassageShadowingPromptTimerRef = useRef<number | null>(null);
    const clearRebuildSentenceShadowingPromptTimer = useCallback(() => {
        if (rebuildSentenceShadowingPromptTimerRef.current !== null) {
            window.clearTimeout(rebuildSentenceShadowingPromptTimerRef.current);
            rebuildSentenceShadowingPromptTimerRef.current = null;
        }
    }, []);
    const clearRebuildPassageShadowingPromptTimer = useCallback(() => {
        if (rebuildPassageShadowingPromptTimerRef.current !== null) {
            window.clearTimeout(rebuildPassageShadowingPromptTimerRef.current);
            rebuildPassageShadowingPromptTimerRef.current = null;
        }
    }, []);
    const persistRebuildHiddenElo = useCallback(async (nextElo: number) => {
        const updatedAt = Date.now();
        await db.sync_meta.put({
            key: buildRebuildMetaKey("hidden_elo"),
            value: nextElo,
            updated_at: updatedAt,
        });
        await saveProfilePatch({
            rebuild_hidden_elo: nextElo,
            last_practice_at: updatedAt,
        });
    }, [buildRebuildMetaKey]);

    const hydratePassageSegmentDrill = useCallback((sourceDrill: DrillData, segmentIndex: number): DrillData => {
        if (sourceDrill._translationMeta?.variant === "passage" && sourceDrill._translationMeta.passageSession) {
            const session = sourceDrill._translationMeta.passageSession;
            const segment = session.segments[segmentIndex] ?? session.segments[0];
            if (!segment) return sourceDrill;
            return {
                ...sourceDrill,
                chinese: segment.chinese,
                reference_english: segment.referenceEnglish,
                ...({ reference_english_alternatives: (segment as any).alternatives } as any),
                _translationMeta: {
                    ...sourceDrill._translationMeta,
                    passageSession: {
                        ...session,
                        currentIndex: segmentIndex,
                    },
                },
            };
        }

        if (sourceDrill._rebuildMeta?.variant !== "passage" || !sourceDrill._rebuildMeta.passageSession) {
            return sourceDrill;
        }

        const session = sourceDrill._rebuildMeta.passageSession;
        const segment = session.segments[segmentIndex] ?? session.segments[0];
        if (!segment) return sourceDrill;

        return {
            ...sourceDrill,
            chinese: segment.chinese,
            reference_english: segment.referenceEnglish,
            ...({ reference_english_alternatives: (segment as any).alternatives } as any),
            _rebuildMeta: {
                ...sourceDrill._rebuildMeta,
                answerTokens: segment.answerTokens,
                tokenBank: segment.tokenBank,
                distractorTokens: segment.distractorTokens,
                passageSession: {
                    ...session,
                    currentIndex: segmentIndex,
                },
            },
        };
    }, []);

    const handleNextTranslationPassageSegment = useCallback(() => {
        setActiveTranslationPassageSegmentIndex(prev => {
            const nextIdx = prev + 1;
            setDrillData(current => current ? hydratePassageSegmentDrill(current, nextIdx) : current);
            
            // Check if we already have results for this next segment (e.g., user went back then forward)
            const existingResult = translationPassageResults.find(r => r.segmentIndex === nextIdx);
            if (existingResult) {
                setUserTranslation(existingResult.userTranslation);
                setDrillFeedback(existingResult.feedback);
                setHasRatedDrill(true);
            } else {
                setUserTranslation("");
                setDrillFeedback(null);
                setHasRatedDrill(false);
            }
            return nextIdx;
        });
        
        setIsSubmittingDrill(false);
        setAnalysisRequested(false);
        setAnalysisDetailsOpen(false);
        setFullAnalysisData(null);
        setReferenceGrammarAnalysis(null);
        setTutorQuery("");
        setTutorAnswer(null);
        setTutorThread([]);
        setTutorResponse(null);
        setWordPopup(null);
    }, [hydratePassageSegmentDrill, translationPassageResults]);

    const handlePrevTranslationPassageSegment = useCallback(() => {
        setActiveTranslationPassageSegmentIndex(prev => {
            if (prev <= 0) return prev;
            const nextIdx = prev - 1;
            setDrillData(current => current ? hydratePassageSegmentDrill(current, nextIdx) : current);
            
            const existingResult = translationPassageResults.find(r => r.segmentIndex === nextIdx);
            if (existingResult) {
                setUserTranslation(existingResult.userTranslation);
                setDrillFeedback(existingResult.feedback);
                setHasRatedDrill(true);
            } else {
                setUserTranslation("");
                setDrillFeedback(null);
                setHasRatedDrill(false);
            }
            return nextIdx;
        });
        
        setIsSubmittingDrill(false);
        setAnalysisRequested(false);
        setAnalysisDetailsOpen(false);
        setFullAnalysisData(null);
        setReferenceGrammarAnalysis(null);
        setTutorQuery("");
        setTutorAnswer(null);
        setTutorThread([]);
        setTutorResponse(null);
        setWordPopup(null);
    }, [hydratePassageSegmentDrill, translationPassageResults]);

    const initializeRebuildTokens = useCallback((nextDrillData: DrillData | null) => {
        const tokenBank = nextDrillData?._rebuildMeta?.tokenBank ?? [];
        const { tokenInstances, tokenOrder } = buildRebuildTokenInstances({
            tokenBank,
            distractorTokens: nextDrillData?._rebuildMeta?.distractorTokens ?? [],
            prefix: "active",
        });
        rebuildTokenOrderRef.current = new Map(Object.entries(tokenOrder));
        setRebuildAvailableTokens(tokenInstances);
        setRebuildAnswerTokens([]);
        setRebuildReplayCount(0);
        setRebuildEditCount(0);
        setRebuildStartedAt(nextDrillData?._rebuildMeta ? Date.now() : null);
        setRebuildTypingBuffer("");
        setRebuildAutocompleteSuggestion(null);
        setRebuildCombo(0);
        rebuildComboLastAtRef.current = 0;
    }, []);

    const applyPassageDraftToActiveState = useCallback((draft: RebuildPassageSegmentDraftState) => {
        rebuildTokenOrderRef.current = new Map(Object.entries(draft.tokenOrder));
        setRebuildAvailableTokens(draft.availableTokens);
        setRebuildAnswerTokens(draft.answerTokens);
        setRebuildReplayCount(draft.replayCount);
        setRebuildEditCount(draft.editCount);
        setRebuildStartedAt(draft.startedAt);
        setRebuildTypingBuffer(draft.typingBuffer);
        rebuildTypingBufferRef.current = draft.typingBuffer;
    }, []);

    const buildActivePassageDraftSnapshot = useCallback((baseDraft: RebuildPassageSegmentDraftState): RebuildPassageSegmentDraftState => ({
        ...baseDraft,
        availableTokens: rebuildAvailableTokens,
        answerTokens: rebuildAnswerTokens,
        typingBuffer: rebuildTypingBufferRef.current,
        replayCount: rebuildReplayCount,
        editCount: rebuildEditCount,
        startedAt: rebuildStartedAt,
        tokenOrder: Object.fromEntries(rebuildTokenOrderRef.current.entries()),
    }), [
        rebuildAnswerTokens,
        rebuildAvailableTokens,
        rebuildEditCount,
        rebuildReplayCount,
        rebuildStartedAt,
    ]);

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

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = window.localStorage.getItem(LISTENING_BANK_RECENT_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            recentListeningBankIdsRef.current = Array.isArray(parsed)
                ? parsed.filter((item): item is string => typeof item === "string").slice(0, LISTENING_BANK_RECENT_LIMIT)
                : [];
        } catch (error) {
            console.error("Failed to load recent listening bank ids", error);
            recentListeningBankIdsRef.current = [];
        }
    }, []);

    useEffect(() => {
        const bankItemId = drillData?._sourceMeta?.sourceMode === "bank" ? drillData._sourceMeta.bankItemId : undefined;
        if (!bankItemId) return;

        const nextIds = [bankItemId, ...recentListeningBankIdsRef.current.filter((id) => id !== bankItemId)]
            .slice(0, LISTENING_BANK_RECENT_LIMIT);
        recentListeningBankIdsRef.current = nextIds;

        if (typeof window !== "undefined") {
            window.localStorage.setItem(LISTENING_BANK_RECENT_STORAGE_KEY, JSON.stringify(nextIds));
        }
    }, [drillData?._sourceMeta?.bankItemId, drillData?._sourceMeta?.sourceMode]);

    useEffect(() => {
        if (!isRebuildMode) return;
        if (isRebuildPassage) return;
        initializeRebuildTokens(drillData);
    }, [drillData, initializeRebuildTokens, isRebuildMode, isRebuildPassage]);

    useEffect(() => {
        if (!isRebuildPassage || !passageSession) return;
        clearRebuildPassageShadowingPromptTimer();

        const initialSegmentIndex = Math.min(
            Math.max(passageSession.currentIndex ?? 0, 0),
            Math.max(0, passageSession.segments.length - 1),
        );
        const nextDrafts = passageSession.segments.map((segment, index) => (
            createRebuildPassageDraftState(segment, index)
        ));
        if (nextDrafts[initialSegmentIndex]) {
            nextDrafts[initialSegmentIndex] = {
                ...nextDrafts[initialSegmentIndex],
                startedAt: Date.now(),
            };
        }

        setActivePassageSegmentIndex(initialSegmentIndex);
        setRebuildPassageDrafts(nextDrafts);
        setRebuildPassageResults([]);
        setRebuildPassageUiState(passageSession.segments.map(() => ({ chineseExpanded: true })));
        setRebuildPassageScores([]);
        setRebuildPassageSummary(null);
        setRebuildFeedback(null);
        setRebuildSentenceShadowingFlow("idle");
        setPendingRebuildSentenceFeedback(null);
        setRebuildPassageShadowingFlow("idle");
        setRebuildPassageShadowingSegmentIndex(null);

        const activeDraft = nextDrafts[initialSegmentIndex];
        if (activeDraft) {
            applyPassageDraftToActiveState(activeDraft);
        }
    }, [applyPassageDraftToActiveState, clearRebuildPassageShadowingPromptTimer, isRebuildPassage, passageSession?.sessionId]);

    useEffect(() => {
        if (!isRebuildPassage || rebuildPassageDrafts.length === 0) return;

        setRebuildPassageDrafts((currentDrafts) => {
            const currentDraft = currentDrafts[activePassageSegmentIndex];
            if (!currentDraft) return currentDrafts;

            const nextTokenOrder = Object.fromEntries(rebuildTokenOrderRef.current.entries());
            if (
                currentDraft.availableTokens === rebuildAvailableTokens
                && currentDraft.answerTokens === rebuildAnswerTokens
                && currentDraft.typingBuffer === rebuildTypingBuffer
                && currentDraft.replayCount === rebuildReplayCount
                && currentDraft.editCount === rebuildEditCount
                && currentDraft.startedAt === rebuildStartedAt
                && areRebuildTokenOrdersEqual(currentDraft.tokenOrder, nextTokenOrder)
            ) {
                return currentDrafts;
            }

            const nextDrafts = [...currentDrafts];
            nextDrafts[activePassageSegmentIndex] = {
                ...currentDraft,
                availableTokens: rebuildAvailableTokens,
                answerTokens: rebuildAnswerTokens,
                typingBuffer: rebuildTypingBuffer,
                replayCount: rebuildReplayCount,
                editCount: rebuildEditCount,
                startedAt: rebuildStartedAt,
                tokenOrder: nextTokenOrder,
            };
            return nextDrafts;
        });
    }, [
        activePassageSegmentIndex,
        isRebuildPassage,
        rebuildAnswerTokens,
        rebuildAvailableTokens,
        rebuildEditCount,
        rebuildPassageDrafts.length,
        rebuildReplayCount,
        rebuildStartedAt,
        rebuildTypingBuffer,
    ]);

    useEffect(() => {
        return () => {
            clearRebuildSentenceShadowingPromptTimer();
            clearRebuildPassageShadowingPromptTimer();
        };
    }, [clearRebuildPassageShadowingPromptTimer, clearRebuildSentenceShadowingPromptTimer]);

    useEffect(() => {
        if (!isRebuildMode) return;
        if (drillData?._sourceMeta?.sourceMode !== "ai") return;
        if (drillData?._rebuildMeta?.variant === "passage") return;
        const candidateId = drillData?._rebuildMeta?.candidateId ?? drillData?._sourceMeta?.candidateId;
        if (!candidateId || !drillData?._rebuildMeta) return;
        const topic = drillData._topicMeta?.topic ?? context.articleTitle ?? context.topic ?? "随机场景";
        const contentKey = buildGeneratedRebuildBankContentKey(topic, drillData.reference_english);
        const now = Date.now();

        void db.rebuild_bank_generated.put({
            content_key: contentKey,
            candidate_id: candidateId,
            topic,
            scene: drillData._rebuildMeta.scene,
            effective_elo: drillData._rebuildMeta.effectiveElo,
            band_position: drillData._rebuildMeta.bandPosition,
            reference_english: drillData.reference_english,
            chinese: drillData.chinese,
            answer_tokens: drillData._rebuildMeta.answerTokens,
            distractor_tokens: drillData._rebuildMeta.distractorTokens,
            source: "ai",
            review_status: "draft",
            created_at: now,
            updated_at: now,
        }).catch((error) => {
            console.error("Failed to persist rebuild ai drill into local bank", error);
        });
    }, [
        context.articleTitle,
        context.topic,
        drillData?._rebuildMeta,
        drillData?._sourceMeta?.candidateId,
        drillData?._sourceMeta?.sourceMode,
        drillData?._topicMeta?.topic,
        drillData?.chinese,
        drillData?.reference_english,
        isRebuildMode,
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

    const setEconomyTargetRef = useCallback(
        (targetId: EconomyTargetId) => (node: HTMLDivElement | null) => {
            resourceTargetRefs.current[targetId] = node;
        },
        []
    );

    const handleOpenShopModal = useCallback(() => {
        setShopFocusedItem(null);
        setShowShopModal(true);
    }, []);

    const handleToggleChinese = useCallback(() => {
        setShowChinese((prev) => !prev);
    }, []);

    const handleDictationChange = useCallback((nextValue: string) => {
        setUserTranslation(nextValue);
    }, []);

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



    const hasPlayedEchoRef = useRef(false); // For Echo Beast (One-time audio)
    const vocabHintRevealRef = useRef(false);
    const translationAudioUnlockRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null); // For cancelling pending API requests
    const {
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
    } = useDrillBattleEvents({
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
    });
    const {
        activePlaybackAudio,
        audioDuration,
        audioRef,
        audioSourceText,
        currentAudioTime,
        cyclePlaybackSpeed,
        ensureAudioCached,
        getCachedAudio,
        handlePlaybackSpeedChange,
        isAudioLoading,
        isPlaying,
        isPrefetching,
        loadingAudioKeys,
        playAudio,
        resetAudioPlayback,
        setIsPlaying,
    } = useDrillAudioPlayback({
        bossActive: bossState.active,
        bossType: bossState.type,
        drillReferenceEnglish: drillData?.reference_english,
        hasPlayedEchoRef,
        mode,
        onBeforePlay: () => setWordPopup(null),
        onEchoBlocked: () => {
            new Audio("https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3").play().catch(() => { });
            setShake(true);
        },
        onLightningStart: () => setLightningStarted(true),
        onReplayCount: () => setRebuildReplayCount((prev) => prev + 1),
        passageReferenceTexts: isRebuildPassage
            ? (passageSession?.segments ?? []).map((segment) => segment.referenceEnglish ?? "")
            : [],
        playbackSpeed,
        setPlaybackSpeed,
        shouldCountReplay: isRebuildMode && (isRebuildPassage ? !activePassageResult : !rebuildFeedback),
        shouldPrefetchSentenceAudio: (mode === "translation" || isListeningMode || isRebuildMode) && !isRebuildPassage,
    });
    const {
        activeRebuildShadowingEntry,
        activeRebuildShadowingScope,
        handlePlayRebuildShadowingRecording,
        handleStartRebuildShadowingRecording,
        handleStopRebuildShadowingRecording,
        handleSubmitRebuildShadowing,
        isRebuildSpeechRecognitionRunning,
        isRebuildSpeechRecognitionSupported,
        rebuildListeningProgressCursor,
        rebuildListeningScoreFx,
        rebuildShadowingLiveRecognitionTranscript,
        rebuildShadowingState,
        resetRebuildShadowingState,
        showRebuildShadowingCorrection,
    } = useDrillRebuildShadowing({
        activePassageSegmentIndex,
        clearRebuildPassageShadowingPromptTimer,
        clearRebuildSentenceShadowingPromptTimer,
        drillData,
        hasActivePassageResult: Boolean(activePassageResult),
        isRebuildMode,
        isRebuildPassage,
        pendingRebuildSentenceFeedback,
        rebuildFeedback,
        resetAudioPlayback,
        setPendingRebuildSentenceFeedback,
        setRebuildPassageShadowingFlow,
        setRebuildPassageShadowingSegmentIndex,
        setRebuildSentenceShadowingFlow,
    });
    const {
        getCurrentSelectionFocusSpan,
        handleInteractiveTextMouseUp,
        handleWordClick,
        renderInteractiveCoachText,
        renderInteractiveText,
        setWordPopup,
        wordPopup,
    } = useDrillInteractiveWordLayer({
        audioRef,
        currentAudioTime,
        drillReferenceEnglish: drillData?.reference_english,
        getCachedAudio,
        isDictationMode,
        isListeningFamilyMode,
        isListeningMode,
        isPlaying,
        isRebuildMode,
    });
    const {
        analysisDetailsOpen,
        analysisError,
        analysisRequested,
        fullAnalysisData,
        fullAnalysisError,
        fullAnalysisOpen,
        fullAnalysisRequested,
        grammarError,
        handleGenerateAnalysis,
        handleGenerateFullAnalysis,
        handleGenerateReferenceGrammar,
        isGeneratingAnalysis,
        isGeneratingFullAnalysis,
        isGeneratingGrammar,
        referenceGrammarAnalysis,
        referenceGrammarDisplayMode,
        setAnalysisDetailsOpen,
        setAnalysisError,
        setAnalysisRequested,
        setFullAnalysisData,
        setFullAnalysisError,
        setFullAnalysisOpen,
        setFullAnalysisRequested,
        setGrammarError,
        setIsGeneratingAnalysis,
        setIsGeneratingFullAnalysis,
        setIsGeneratingGrammar,
        setReferenceGrammarAnalysis,
        setReferenceGrammarDisplayMode,
    } = useDrillAnalysis<DrillFeedback>({
        dictationEloRef,
        drillData,
        drillFeedback,
        eloRatingRef,
        isDictationMode,
        isListeningFamilyMode,
        isListeningMode,
        listeningEloRef,
        mode,
        setDrillFeedback,
        teachingMode,
        userTranslation,
    });
    const { scoreSubmission } = useDrillSubmissionScoring<DrillFeedback>({
        dictationElo,
        drillData,
        eloRating,
        isDictationMode,
        isListeningFamilyMode,
        isListeningMode,
        setAnalysisDetailsOpen,
        setAnalysisError,
        setAnalysisRequested,
        setDrillFeedback,
        setFullAnalysisData,
        setFullAnalysisError,
        setFullAnalysisOpen,
        setFullAnalysisRequested,
        setGrammarError,
        setIsGeneratingFullAnalysis,
        setIsGeneratingGrammar,
        setReferenceGrammarAnalysis,
        setReferenceGrammarDisplayMode,
        teachingMode,
    });

    useEffect(() => {
        eloRatingRef.current = eloRating;
        listeningEloRef.current = listeningElo;
        dictationEloRef.current = dictationElo;
    }, [dictationElo, eloRating, listeningElo]);

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

    useEffect(() => {
        if (isDictationMode) {
            setShowChinese(false);
        }
    }, [isDictationMode]);

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
    const isShadowingMode = isListeningMode;
    const currentElo = isRebuildMode
        ? (isRebuildPassage ? rebuildBattleElo : rebuildHiddenElo)
        : isDictationMode
            ? dictationElo
            : isListeningMode
                ? listeningElo
                : eloRating;
    const currentStreak = isRebuildMode
        ? (isRebuildPassage ? rebuildBattleStreak : 0)
        : isDictationMode
            ? dictationStreak
            : isListeningMode
                ? listeningStreak
                : streakCount;
    const activeDrillSourceMode: "ai" | "bank" = isListeningMode ? listeningSourceMode : "ai";
    const currentListeningBankId = isListeningMode && drillData?._sourceMeta?.sourceMode === "bank"
        ? drillData._sourceMeta.bankItemId
        : undefined;
    const prefetchedListeningBankId = isListeningMode && prefetchedDrillData?._sourceMeta?.sourceMode === "bank"
        ? prefetchedDrillData._sourceMeta.bankItemId
        : undefined;
    const listeningBankExcludeIds = activeDrillSourceMode === "bank"
        ? Array.from(new Set([
            ...recentListeningBankIdsRef.current,
            ...(currentListeningBankId ? [currentListeningBankId] : []),
            ...(prefetchedListeningBankId ? [prefetchedListeningBankId] : []),
        ]))
        : [];
    const listeningBankExcludeIdsKey = listeningBankExcludeIds.join("|");
    const capsuleCount = inventory.capsule;
    const hintTicketCount = inventory.hint_ticket;
    const vocabTicketCount = inventory.vocab_ticket;
    const audioTicketCount = inventory.audio_ticket;
    const refreshTicketCount = inventory.refresh_ticket;
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
    const dailyDrillGoalReached = dailyDrillProgress.goal !== null && dailyDrillProgress.completed >= dailyDrillProgress.goal;
    const dailyDrillProgressLabel = dailyDrillProgress.goal === null
        ? `今日 ${dailyDrillProgress.completed} 题`
        : `今日 ${dailyDrillProgress.completed} / ${dailyDrillProgress.goal} 题`;
    const activeEconomyChipLabel = activeEconomyFx?.kind === 'coin_gain'
        ? `+${activeEconomyFx.amount ?? 0}`
        : activeEconomyFx?.itemId
            ? (isGachaEconomyFx ? 'Lucky Draw' : ITEM_CATALOG[activeEconomyFx.itemId].name)
            : '提示';
    const translationKeywords = mode === 'translation' && drillData
        ? ((drillData.target_english_vocab || drillData.key_vocab || []) as string[])
        : [];
    const hasTranslationKeywords = translationKeywords.length > 0;
    
    // Ghost Autocomplete Mode
    const [predictionMode, setPredictionMode] = useState<'deterministic'>('deterministic');
    const {
        isCoachHistoryOpen,
        setIsCoachHistoryOpen,
        drawerInputValue,
        setDrawerInputValue,
        isDrawerChatPending,
        drawerStreamingText,
        submitDrawerChat,
        history: aiCoachHistory,
    } = useDrillAiCoach({
        mode,
        drillData: drillData ? {
            id: (drillData as any)?.id,
            chinese: drillData.chinese,
            reference_english: drillData.reference_english,
        } : null,
        hasDrillFeedback: Boolean(drillFeedback),
        userTranslation,
        setUserTranslation,
    });

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

        if (elo < 400) return { level: 'Level 1', label: 'A1 新手', cefr: 'A1', color: 'text-stone-500', desc: '短句复现' };
        if (elo < 800) return { level: 'Level 2', label: 'A2- 青铜', cefr: 'A2-', color: 'text-amber-600', desc: '基础口语' };
        if (elo < 1200) return { level: 'Level 3', label: 'A2+ 白银', cefr: 'A2+', color: 'text-slate-500', desc: '基础连贯表达' };
        if (elo < 1600) return { level: 'Level 4', label: 'B1 黄金', cefr: 'B1', color: 'text-yellow-600', desc: '自然语流' };
        if (elo < 2000) return { level: 'Level 5', label: 'B2 铂金', cefr: 'B2', color: 'text-cyan-600', desc: '高信息密度' };
        if (elo < 2400) return { level: 'Level 6', label: 'C1 钻石', cefr: 'C1', color: 'text-blue-500', desc: '高自然度口语' };
        if (elo < 2800) return { level: 'Level 7', label: 'C2 大师', cefr: 'C2', color: 'text-fuchsia-600', desc: '复杂口语复现' };
        if (elo < 3200) return { level: 'Level 8', label: 'C2+ 王者', cefr: 'C2+', color: 'text-purple-600', desc: '高压自然口语' };
        return { level: 'Level 9', label: '☠️ 处决', cefr: '∞', color: 'text-red-500', desc: '极限挑战' };
    };
    const eloDifficulty = getEloDifficulty(currentElo ?? DEFAULT_BASE_ELO, mode);

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
            const activeUserMeta = await db.sync_meta.get("active_user_id");
            rebuildMetaNamespaceRef.current = typeof activeUserMeta?.value === "string" ? activeUserMeta.value : "local";
            if (profile) {
                const learningPreferences = normalizeLearningPreferences(profile.learning_preferences);
                setEloRating(profile.elo_rating);
                setStreakCount(profile.streak_count);

                // Load Listening Stats (Fallback if undefined post-migration in memory before reload)
                setListeningElo(profile.listening_elo ?? DEFAULT_BASE_ELO);
                setListeningStreak(profile.listening_streak ?? 0);
                setDictationElo(profile.dictation_elo ?? profile.listening_elo ?? DEFAULT_BASE_ELO);
                setDictationStreak(profile.dictation_streak ?? 0);
                setRebuildBattleElo(profile.rebuild_elo ?? profile.rebuild_hidden_elo ?? profile.listening_elo ?? DEFAULT_BASE_ELO);
                setRebuildBattleStreak(profile.rebuild_streak ?? 0);
                eloRatingRef.current = profile.elo_rating;
                listeningEloRef.current = profile.listening_elo ?? DEFAULT_BASE_ELO;
                dictationEloRef.current = profile.dictation_elo ?? profile.listening_elo ?? DEFAULT_BASE_ELO;

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
                setRebuildShadowingAutoOpen(learningPreferences.rebuild_auto_open_shadowing_prompt ?? true);
                const hiddenMeta = await db.sync_meta.get(buildRebuildMetaKey("hidden_elo"));
                const syncedRebuildElo = typeof profile.rebuild_hidden_elo === "number"
                    ? profile.rebuild_hidden_elo
                    : undefined;
                const legacyRebuildElo = typeof hiddenMeta?.value === "number"
                    ? hiddenMeta.value
                    : undefined;
                const nextRebuildHiddenElo = syncedRebuildElo ?? legacyRebuildElo ?? (profile.listening_elo ?? DEFAULT_BASE_ELO);
                setRebuildHiddenElo(nextRebuildHiddenElo);

                setIsEloLoaded(true); // Mark Elo as loaded
            } else {
                const initialInventory = { ...DEFAULT_INVENTORY };
                setEloRating(DEFAULT_TRANSLATION_ELO);
                setStreakCount(0);
                setListeningElo(DEFAULT_BASE_ELO);
                setListeningStreak(0);
                setDictationElo(DEFAULT_BASE_ELO);
                setDictationStreak(0);
                setRebuildBattleElo(DEFAULT_BASE_ELO);
                setRebuildBattleStreak(0);
                setRebuildShadowingAutoOpen(true);
                eloRatingRef.current = DEFAULT_TRANSLATION_ELO;
                listeningEloRef.current = DEFAULT_BASE_ELO;
                dictationEloRef.current = DEFAULT_BASE_ELO;
                coinsRef.current = DEFAULT_STARTING_COINS;
                inventoryRef.current = initialInventory;
                setCoins(DEFAULT_STARTING_COINS);
                setInventory(initialInventory);
                setOwnedThemes([...FREE_THEME_IDS]);
                setCosmeticTheme(DEFAULT_FREE_THEME);
                setRebuildHiddenElo(DEFAULT_BASE_ELO);
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

    const refreshDailyDrillProgress = useCallback(() => {
        const next = syncStoredDailyDrillProgress();
        setDailyDrillProgress(next);
        return next;
    }, []);

    const applyDailyDrillGoal = useCallback((goal: number | null) => {
        const next = setStoredDailyDrillGoal(goal);
        setDailyDrillProgress(next);
        setDailyDrillGoalDraft(next.goal ? String(next.goal) : "");
        return next;
    }, []);

    const recordCompletedDrill = useCallback(() => {
        if (hasRecordedDailyDrillRef.current) return;
        hasRecordedDailyDrillRef.current = true;
        const next = incrementStoredDailyDrillProgress();
        setDailyDrillProgress(next);
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('yasi:sync_smart_goals'));
        }
    }, []);

    useEffect(() => {
        refreshDailyDrillProgress();

        const handleFocus = () => {
            refreshDailyDrillProgress();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                refreshDailyDrillProgress();
            }
        };

        window.addEventListener("focus", handleFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            window.removeEventListener("focus", handleFocus);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [refreshDailyDrillProgress]);

    useEffect(() => {
        if (!isDailyDrillProgressOpen) return;

        const handlePointerDown = (event: MouseEvent | TouchEvent) => {
            if (!dailyDrillProgressRef.current?.contains(event.target as Node)) {
                setIsDailyDrillProgressOpen(false);
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsDailyDrillProgressOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("touchstart", handlePointerDown);
        window.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("touchstart", handlePointerDown);
            window.removeEventListener("keydown", handleEscape);
        };
    }, [isDailyDrillProgressOpen]);

    const clearRebuildChoicePrefetch = useCallback(() => {
        if (rebuildChoicePrefetchAbortRef.current) {
            rebuildChoicePrefetchAbortRef.current.abort();
            rebuildChoicePrefetchAbortRef.current = null;
        }
        prefetchedRebuildChoicesRef.current = {};
    }, []);
    useEffect(() => {
        if (drillData?.reference_english && setContext) {
            const keywords = drillData.target_english_vocab?.join(" ") || "";
            const effectiveTopic = drillData._topicMeta?.topic || context.articleTitle || context.topic || 'General';
            // Simplified prompt for context
            const prompt = `Topic: ${effectiveTopic}. Keywords: ${keywords}. Sentence: ${drillData.reference_english}`;
            setContext(prompt);
        }
    }, [drillData, context, setContext]);

    const launchRebuildSuccessCelebration = useCallback(() => {
        playRebuildSfx("perfect");
        setPerfectComboAt(Date.now());
        
        let buttonRect: DOMRect | undefined;
        try {
            const submitBtn = document.querySelector('[data-tour-target="rebuild-drill-submit"]');
            if (submitBtn) {
                buttonRect = submitBtn.getBoundingClientRect();
            }
        } catch (e) {}

        launchCelebration(Boolean(prefersReducedMotion), buttonRect);
    }, [prefersReducedMotion, playRebuildSfx]);

    useEffect(() => {
        return () => {
            clearAllCelebrations();
        };
    }, []);

    useEffect(() => {
        if (!perfectComboAt) return;
        const timer = setTimeout(() => setPerfectComboAt(null), 2500);
        return () => clearTimeout(timer);
    }, [perfectComboAt]);

    useEffect(() => {
        if (!rebuildComboFxAt) return;
        const timer = setTimeout(() => setRebuildComboFxAt(null), 1500);
        return () => clearTimeout(timer);
    }, [rebuildComboFxAt]);

    useEffect(() => {
        if (!eloSplash) return;
        const timer = setTimeout(() => setEloSplash(null), 2200);
        return () => clearTimeout(timer);
    }, [eloSplash?.uid]);

    useEffect(() => {
        if (!isRebuildMode) return;

        let identifier: any = null;
        let delta = 0;

        if (isRebuildPassage && rebuildPassageSummary) {
            identifier = rebuildPassageSummary;
            delta = rebuildPassageSummary.change;
        } else if (!isRebuildPassage && rebuildFeedback?.selfEvaluation) {
            identifier = `${rebuildFeedback.resolvedAt}:${rebuildFeedback.selfEvaluation}`;
            delta = clampRebuildDifficultyDelta(
                rebuildFeedback.systemDelta + getRebuildSelfEvaluationDelta(rebuildFeedback.selfEvaluation),
            );
        }

        if (identifier && identifier !== lastEloSplashObjRef.current) {
            lastEloSplashObjRef.current = identifier;
            if (typeof delta === 'number') {
                setEloSplash({ uid: Math.random().toString(), delta });
                
                try {
                    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                    if (AudioContext) {
                        const ctx = new AudioContext();
                        const now = ctx.currentTime;
                        
                        if (delta > 0) {
                            // Premium Chime for +Elo
                            const playNote = (freq: number, startTime: number) => {
                                const osc = ctx.createOscillator();
                                const gain = ctx.createGain();
                                osc.connect(gain);
                                gain.connect(ctx.destination);
                                
                                osc.type = 'sine';
                                osc.frequency.value = freq;
                                
                                gain.gain.setValueAtTime(0, startTime);
                                gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
                                gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
                                
                                osc.start(startTime);
                                osc.stop(startTime + 0.5);
                            };
                            
                            playNote(523.25, now);       // C5
                            playNote(659.25, now + 0.08); // E5
                            playNote(783.99, now + 0.16); // G5
                            playNote(1046.50, now + 0.24); // C6
                        } else {
                            // Heavy Glitch Dive for -Elo
                            const osc = ctx.createOscillator();
                            const osc2 = ctx.createOscillator();
                            const gain = ctx.createGain();
                            const filter = ctx.createBiquadFilter();
                            
                            osc.connect(gain);
                            osc2.connect(gain);
                            gain.connect(filter);
                            filter.connect(ctx.destination);
                            
                            osc.type = 'sawtooth';
                            osc2.type = 'square';
                            
                            osc.frequency.setValueAtTime(150, now);
                            osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
                            osc2.frequency.setValueAtTime(140, now);
                            osc2.frequency.exponentialRampToValueAtTime(35, now + 0.3);
                            
                            filter.type = 'lowpass';
                            filter.frequency.setValueAtTime(2000, now);
                            filter.frequency.exponentialRampToValueAtTime(100, now + 0.4);
                            
                            gain.gain.setValueAtTime(0.4, now);
                            gain.gain.linearRampToValueAtTime(0.4, now + 0.1);
                            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
                            
                            osc.start(now);
                            osc2.start(now);
                            osc.stop(now + 0.6);
                            osc2.stop(now + 0.6);
                        }
                    }
                } catch(e) {}
            }
        }
    }, [isRebuildMode, isRebuildPassage, rebuildPassageSummary, rebuildFeedback]);

    // Effect removed. Triggered inline now.


    // --- Spacebar Logic ---
    // Feedback Effects
    useEffect(() => {
        if (!drillFeedback || drillFeedback._error) return;

        const celebrationKey = `${mode}:${drillData?.reference_english ?? ""}:${drillFeedback.score}:${drillFeedback.improved_version ?? ""}`;
        if (lastScoreCelebrationRef.current === celebrationKey) return;
        lastScoreCelebrationRef.current = celebrationKey;

        const timeoutIds: number[] = [];

        if (drillFeedback.score >= 8) {
            if (!prefersReducedMotion) {
                const strongHit = drillFeedback.score >= 9;
                confetti({
                    particleCount: strongHit ? 190 : 120,
                    spread: strongHit ? 92 : 74,
                    startVelocity: strongHit ? 46 : 32,
                    scalar: strongHit ? 1.08 : 0.96,
                    origin: { y: 0.62, x: 0.5 },
                    colors: ['#10b981', '#34d399', '#6ee7b7', '#fcd34d', '#ffffff'],
                });
                if (strongHit) {
                    timeoutIds.push(window.setTimeout(() => {
                        confetti({
                            particleCount: 150,
                            spread: 72,
                            startVelocity: 40,
                            scalar: 1,
                            origin: { y: 0.56, x: 0.18 },
                            angle: 58,
                            colors: ['#34d399', '#a7f3d0', '#fcd34d', '#ffffff'],
                        });
                    }, 140));
                    timeoutIds.push(window.setTimeout(() => {
                        confetti({
                            particleCount: 150,
                            spread: 72,
                            startVelocity: 40,
                            scalar: 1,
                            origin: { y: 0.56, x: 0.82 },
                            angle: 122,
                            colors: ['#10b981', '#6ee7b7', '#fde68a', '#ffffff'],
                        });
                    }, 220));
                    timeoutIds.push(window.setTimeout(() => {
                        confetti({
                            particleCount: 110,
                            spread: 120,
                            startVelocity: 28,
                            scalar: 0.88,
                            origin: { y: 0.48, x: 0.5 },
                            colors: ['#10b981', '#34d399', '#fcd34d', '#ffffff'],
                        });
                    }, 320));
                }
            }
            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-achievement-bell-600.mp3').play().catch(() => { });
            return () => {
                timeoutIds.forEach((id) => window.clearTimeout(id));
            };
        }

        if (drillFeedback.score <= 4) {
            const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-wrong-answer-fail-notification-946.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => { });
            return () => {
                timeoutIds.forEach((id) => window.clearTimeout(id));
            };
        }

        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-message-pop-alert-2354.mp3').play().catch(() => { });
        return () => {
            timeoutIds.forEach((id) => window.clearTimeout(id));
        };
    }, [drillData?.reference_english, drillFeedback, mode, prefersReducedMotion]);

    // --- Keyboard listeners removed - now using click-to-record UI ---
    // Space key no longer triggers recording

    // --- Intro BGM Manager ---
    useEffect(() => {
        let audio: HTMLAudioElement | null = null;

        if (bossState.active) {
            // Play Boss BGM
            const config = DRILL_BOSS_CONFIG[bossState.type as keyof typeof DRILL_BOSS_CONFIG];
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
        openGachaPack();
    }, [openGachaPack]);

    const debugTriggerRoulette = () => {
        // Show the interactive overlay instead of immediate generation
        openRoulette();
    };

    const handleRouletteComplete = (result: 'safe' | 'dead', bulletCount: number) => {
        closeRoulette();
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
            const isDictation = mode === 'dictation';
            const activeElo = isDictation ? dictationElo : isListening ? listeningElo : eloRating;
            const newElo = Math.max(0, (activeElo ?? DEFAULT_BASE_ELO) - penalty);

            setEloChange(-penalty);
            setLootDrop({
                type: 'exp',
                amount: -penalty,
                rarity: 'common',
                message: '💀 你中弹了！扣除 50 Elo 并开启处决局'
            });
            setShake(true);

            // Update local state
            if (isListening) {
                setListeningElo(newElo);
                setListeningStreak(0);
            } else if (isDictation) {
                setDictationElo(newElo);
                setDictationStreak(0);
            } else {
                setEloRating(newElo);
                setStreakCount(0);
            }

            void loadLocalProfile().then(async (profile) => {
                if (!profile) return;
                if (isDictation) {
                    await persistDictationBattle({
                        eloAfter: newElo,
                        change: -penalty,
                        streak: 0,
                        source: 'roulette_penalty',
                    });
                    return;
                }

                const isRebuild = mode === "rebuild";
                const maxElo = isListening
                    ? Math.max(profile.listening_max_elo ?? DEFAULT_BASE_ELO, newElo)
                    : isRebuild
                        ? Math.max(profile.rebuild_max_elo ?? profile.rebuild_elo ?? DEFAULT_BASE_ELO, newElo)
                        : Math.max(profile.max_elo, newElo);

                await settleBattle({
                    mode: isListening ? 'listening' : isRebuild ? 'rebuild' : 'translation',
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

    const consumeResolvedDrill = useCallback((nextDrill: PrefetchedDrillData) => {
        consumePrefetchedDrillTransition({
            audioRef,
            clearRebuildChoicePrefetch,
            hasPlayedEchoRef,
            hydratePassageSegmentDrill,
            isDictationMode,
            nextDrill,
            resetGuidedLearningState,
            resetRebuildShadowingState,
            resetResult,
            setActivePassageSegmentIndex,
            setAnalysisDetailsOpen,
            setAnalysisError,
            setAnalysisRequested,
            setBlindVisibleUnlockConsumed,
            setDrillData,
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
            setIsGeneratingDrill,
            setIsGeneratingFullAnalysis,
            setIsGeneratingGrammar,
            setIsHintLoading,
            setIsPlaying,
            setIsTranslationAudioUnlocked,
            setIsTutorOpen,
            setIsVocabHintRevealed,
            setLightningStarted,
            setPendingRebuildAdvanceElo,
            setPrefetchedDrillData,
            setRebuildFeedback,
            setRebuildPassageDrafts: () => setRebuildPassageDrafts([]),
            setRebuildPassageResults: () => setRebuildPassageResults([]),
            setRebuildPassageScores: () => setRebuildPassageScores([]),
            setRebuildPassageSummary,
            setRebuildPassageUiState: () => setRebuildPassageUiState([]),
            setRebuildTutorSession,
            setRebuildTypingBuffer,
            setReferenceGrammarAnalysis,
            setReferenceGrammarDisplayMode: () => setReferenceGrammarDisplayMode("core"),
            setScoreTutorSession,
            setShowChinese,
            setTutorAnswer,
            setTutorPendingQuestion,
            setTutorQuery,
            setTutorResponse,
            setTutorThinkingMode: () => setTutorThinkingMode("chat"),
            setTutorThread: () => setTutorThread([]),
            setUserTranslation,
            setWordPopup,
            translationAudioUnlockRef,
            vocabHintRevealRef,
        });

    }, [clearRebuildChoicePrefetch, currentElo, hydratePassageSegmentDrill, isDictationMode, resetGuidedLearningState, resetRebuildShadowingState, resetResult]);

    const resetGenerationUiState = useCallback(() => {
        resetDrillUiForGeneration({
            audioRef,
            hasPlayedEchoRef,
            isDictationMode,
            resetGuidedLearningState,
            resetRebuildShadowingState,
            resetResult,
            setActivePassageSegmentIndex,
            setActiveTranslationPassageSegmentIndex,
            setAnalysisDetailsOpen,
            setAnalysisError,
            setAnalysisRequested,
            setBlindVisibleUnlockConsumed,
            setDrillData,
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
            setIsGeneratingDrill,
            setIsGeneratingFullAnalysis,
            setIsGeneratingGrammar,
            setIsHintLoading,
            setIsPlaying,
            setIsTranslationAudioUnlocked,
            setIsTutorOpen,
            setIsVocabHintRevealed,
            setLightningStarted,
            setRebuildFeedback,
            setRebuildPassageDrafts: () => setRebuildPassageDrafts([]),
            setRebuildPassageResults: () => setRebuildPassageResults([]),
            setRebuildPassageScores: () => setRebuildPassageScores([]),
            setRebuildPassageSummary,
            setRebuildPassageUiState: () => setRebuildPassageUiState([]),
            setRebuildTutorSession,
            setRebuildTypingBuffer,
            setReferenceGrammarAnalysis,
            setReferenceGrammarDisplayMode: () => setReferenceGrammarDisplayMode("core"),
            setScoreTutorSession,
            setShowChinese,
            setTranslationPassageResults: () => setTranslationPassageResults([]),
            setTutorAnswer,
            setTutorPendingQuestion,
            setTutorQuery,
            setTutorResponse,
            setTutorThinkingMode: () => setTutorThinkingMode("chat"),
            setTutorThread: () => setTutorThread([]),
            setUserTranslation,
            setWordPopup,
            translationAudioUnlockRef,
            vocabHintRevealRef,
        });
    }, [isDictationMode, resetGuidedLearningState, resetRebuildShadowingState, resetResult]);

    const finishGenerationRequest = useCallback(() => {
        setIsGeneratingDrill(false);
    }, []);

    const handleResolvedGeneratedDrill = useCallback(async (data: unknown, _effectiveElo: number, _signal: AbortSignal) => {
        const typedData = data as any;
        setDrillData(hydrateDrillForTransition(typedData, hydratePassageSegmentDrill) as any);
    }, [hydratePassageSegmentDrill]);

    const { consumeNextDrill, prefetchNextDrill, handleGenerateDrill } = useDrillGenerationFlow<PrefetchedDrillData, DrillScenarioContext>({
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
        getDifficultyLevel: (elo, drillMode) => getEloDifficulty(elo, drillMode).level,
        handleResolvedGeneratedDrill,
        hasRecordedDailyDrillRef,
        isListeningFamilyMode,
        isListeningMode,
        isRebuildMode,
        isRebuildPassage,
        isTranslationPassage,
        listeningBankExcludeIds: activeDrillSourceMode === "bank" ? listeningBankExcludeIds : undefined,
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
    });

    const { handleRebuildSelfEvaluate } = useDrillRebuildSettlement({
        activeDrillSourceMode,
        aiProvider,
        applyEconomyPatch,
        clearRebuildChoicePrefetch,
        consumeNextDrill,
        context,
        cosmeticTheme,
        defaultBaseElo: DEFAULT_BASE_ELO,
        ensureAudioCached,
        generationMode,
        getDifficultyLevel: (elo, drillMode) => getEloDifficulty(elo, drillMode).level,
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
        persistRebuildHiddenElo,
        playAudio,
        prefetchedRebuildChoicesRef,
        rebuildBattleElo,
        rebuildBattleStreak,
        rebuildChoicePrefetchAbortRef,
        rebuildFeedback,
        rebuildHiddenElo,
        rebuildPassageResults,
        rebuildPassageSummary,
        pushEconomyFx,
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
    });

    const handleRebuildPassageRedo = useCallback(() => {
        if (!passageSession) return;
        clearRebuildPassageShadowingPromptTimer();

        const initialSegmentIndex = 0;
        const nextDrafts = passageSession.segments.map((segment, index) =>
            createRebuildPassageDraftState(segment, index)
        );
        if (nextDrafts[initialSegmentIndex]) {
            nextDrafts[initialSegmentIndex] = {
                ...nextDrafts[initialSegmentIndex],
                startedAt: Date.now(),
            };
        }

        setActivePassageSegmentIndex(initialSegmentIndex);
        setRebuildPassageDrafts(nextDrafts);
        setRebuildPassageResults([]);
        setRebuildPassageUiState(passageSession.segments.map(() => ({ chineseExpanded: true })));
        setRebuildPassageScores([]);
        setRebuildPassageSummary(null);
        setRebuildFeedback(null);
        setRebuildSentenceShadowingFlow("idle");
        setPendingRebuildSentenceFeedback(null);
        setRebuildPassageShadowingFlow("idle");
        setRebuildPassageShadowingSegmentIndex(null);

        // Re-hydrate the drill data to segment 0
        setDrillData(current => current ? hydratePassageSegmentDrill(current, initialSegmentIndex) : current);

        const activeDraft = nextDrafts[initialSegmentIndex];
        if (activeDraft) {
            applyPassageDraftToActiveState(activeDraft);
        }
    }, [passageSession, clearRebuildPassageShadowingPromptTimer, hydratePassageSegmentDrill, applyPassageDraftToActiveState]);

    const { settleScoredBattle } = useDrillBattleSettlement({
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
    });

    const handleSubmitDrill = async (submittedTranslation?: string, forceAI: boolean = false) => {
        if (!forceAI) localEloChangeRef.current = 0;
        if (showGacha) return;
        const translationToScore = (submittedTranslation ?? userTranslation).trim();
        if (!drillData) return;
        if (isRebuildMode) {
            handleSubmitRebuild(false);
            return;
        }
        if (!isListeningMode && !translationToScore) return;
        if (isListeningMode && !wavBlob) {
            setDrillFeedback({
                score: -1,
                judge_reasoning: "还没有可评分的录音，请先完整跟读一遍。",
                feedback: {
                    listening_tips: ["先录一遍完整音频，再提交发音评分。"],
                    encouragement: "录音成功后会自动显示跟读评分。",
                },
                summary_cn: "还没有可评分的录音，请先完整跟读一遍。",
                tips_cn: ["先录一遍完整音频，再提交发音评分。"],
                word_results: [],
                _error: true,
            });
            return;
        }
        if (isListeningMode) {
            setDrillFeedback({
                score: -1,
                judge_reasoning: "Shadowing battle 已下线，本地发音评分链也已移除。",
                feedback: {
                    listening_tips: ["改用 Rebuild 或 Dictation 继续训练。"],
                    encouragement: "当前版本不再提供 battle Shadowing 发音评分。",
                },
                summary_cn: "Shadowing battle 已下线，本地发音评分链也已移除。",
                tips_cn: ["改用 Rebuild 或 Dictation 继续训练。"],
                word_results: [],
                _error: true,
            });
            return;
        }
        setIsSubmittingDrill(true);
        let prefetchNextElo: number | null = null;

        try {
            const data = await scoreSubmission({
                forceAI,
                translationToScore,
            });
            if (!data) {
                return;
            }

            if (data.score !== undefined) {
                if (hasRatedDrill && !forceAI) {
                    setEloChange(0);
                    return;
                }
                setHasRatedDrill(true);

                const buildPendingTranslationFeedback = (feedback: DrillFeedback, objectiveScore: number): DrillFeedback => ({
                    ...feedback,
                    objectiveScore: Number(Math.max(0, Math.min(10, objectiveScore)).toFixed(1)),
                    score: Number(Math.max(0, Math.min(10, objectiveScore)).toFixed(1)),
                    selfEvaluation: null,
                    eloAdjustment: null,
                });
                
                // Intercept for Translation Passage Mode!
                if (isTranslationPassage) {
                    const nextResults = [...translationPassageResults];
                    const pendingSegmentFeedback = buildPendingTranslationFeedback(data, data.score);
                    const existingIndex = nextResults.findIndex(r => r.segmentIndex === activeTranslationPassageSegmentIndex);
                    if (existingIndex >= 0) {
                        nextResults[existingIndex] = {
                            segmentIndex: activeTranslationPassageSegmentIndex,
                            feedback: pendingSegmentFeedback,
                            userTranslation: translationToScore
                        };
                    } else {
                        nextResults.push({
                            segmentIndex: activeTranslationPassageSegmentIndex,
                            feedback: pendingSegmentFeedback,
                            userTranslation: translationToScore
                        });
                    }
                    nextResults.sort((a,b) => a.segmentIndex - b.segmentIndex);
                    setTranslationPassageResults(nextResults);
                    
                    const totalSegments = translationPassageSession?.segmentCount ?? translationPassageSession?.segments?.length ?? 0;
                    
                    if (totalSegments > 0 && nextResults.length >= totalSegments) {
                        const avgScore = nextResults.reduce(
                            (acc, curr) => acc + (curr.feedback.objectiveScore ?? curr.feedback.score ?? 0),
                            0,
                        ) / nextResults.length;
                        setDrillFeedback(buildPendingTranslationFeedback(data, avgScore));
                        setEloChange(null);
                        return;
                    } else {
                        setDrillFeedback(pendingSegmentFeedback);
                        setEloChange(null);
                        return;
                    }
                }

                if (!isListeningMode && !isDictationMode) {
                    setDrillFeedback(buildPendingTranslationFeedback(data, data.score));
                    setEloChange(null);
                    return;
                }

                recordCompletedDrill();

                prefetchNextElo = await settleScoredBattle({
                    feedback: data,
                    forceAI,
                });
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmittingDrill(false);

            // --- BACKGROUND PREFETCH LOGIC (Evaluation-time) ---
            // Only prefetch after a successful score produced a fresh Elo for the next question.
            if (drillData && (isListeningMode ? Boolean(wavBlob) : userTranslation.trim()) && prefetchNextElo !== null) {
                prefetchNextDrill(prefetchNextElo);
            }
        }
    };

    const handleTranslationSelfEvaluate = useCallback(async (evaluation: RebuildSelfEvaluation) => {
        if (isRebuildMode || isListeningMode || isDictationMode) return;
        if (!drillFeedback || drillFeedback._error || drillFeedback.selfEvaluation) return;

        const settledFeedback: DrillFeedback = {
            ...drillFeedback,
            objectiveScore: drillFeedback.objectiveScore ?? drillFeedback.score,
            selfEvaluation: evaluation,
            eloAdjustment: getTranslationSelfEvaluationEloDelta(evaluation),
        };

        setDrillFeedback(settledFeedback);
        setIsSubmittingDrill(true);

        let prefetchNextElo: number | null = null;
        try {
            recordCompletedDrill();
            prefetchNextElo = await settleScoredBattle({
                feedback: settledFeedback,
                forceAI: false,
            });
            // Auto-advance to the next question after giving the user time (1.5s) to see their Elo animation
            setTimeout(() => {
                void handleGenerateDrill();
            }, 1500);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmittingDrill(false);
            if (drillData && userTranslation.trim() && prefetchNextElo !== null) {
                prefetchNextDrill(prefetchNextElo);
            }
        }
    }, [
        drillData,
        drillFeedback,
        isDictationMode,
        isListeningMode,
        isRebuildMode,
        prefetchNextDrill,
        recordCompletedDrill,
        settleScoredBattle,
        userTranslation,
    ]);

    const handleRetryScoring = useCallback(() => {
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
        void handleSubmitDrill();
    }, [handleSubmitDrill]);

    useEffect(() => {
        if (isRebuildMode || isListeningMode || isDictationMode) return;
        if (!drillFeedback || drillFeedback._error || drillFeedback.selfEvaluation) return;

        const handleFeedbackKey = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (event.altKey || event.ctrlKey || event.metaKey) return;

            if (event.key === "1") {
                event.preventDefault();
                void handleTranslationSelfEvaluate("easy");
            } else if (event.key === "2") {
                event.preventDefault();
                void handleTranslationSelfEvaluate("just_right");
            } else if (event.key === "3") {
                event.preventDefault();
                void handleTranslationSelfEvaluate("hard");
            }
        };

        window.addEventListener("keydown", handleFeedbackKey);
        return () => window.removeEventListener("keydown", handleFeedbackKey);
    }, [
        drillFeedback,
        handleTranslationSelfEvaluate,
        isDictationMode,
        isListeningMode,
        isRebuildMode,
    ]);

    const handleBossFeedbackNext = useCallback(() => {
        if (gambleState.active && drillFeedback && (drillFeedback.score < 9.0 || gambleState.doubleDownCount >= 2)) {
            setGambleState({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
            setTheme("default");
        }
        handleGenerateDrill();
    }, [drillFeedback, gambleState, handleGenerateDrill]);

    const handleBossFeedbackRetry = useCallback(() => {
        setDrillFeedback(null);
        setUserTranslation("");
        setTutorQuery("");
        setTutorAnswer(null);
        setTutorThread([]);
        setTutorResponse(null);
        setTutorPendingQuestion(null);
        setIsTutorOpen(false);
        setRebuildTutorSession(null);
        setScoreTutorSession(null);
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
    }, []);

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

    const inferRebuildTeachingPoint = () => {
        if (!rebuildFeedback) return "词序与标准表达";
        if (rebuildFeedback.evaluation.distractorPickRatio < 1) return "词义辨认与干扰词区分";
        if (rebuildFeedback.evaluation.misplacementRatio < 1) return "词序与句子骨架";
        if (rebuildFeedback.evaluation.contentWordHitRate < 1) return "内容词定位与短语搭配";
        return "标准表达与短语搭配";
    };

    const inferActiveTeachingPoint = () => {
        if (isRebuildMode && drillData?._rebuildMeta) return inferRebuildTeachingPoint();
        return inferTeachingPoint();
    };
    const {
        activeTutorTeachingPoint,
        closeRebuildTutorPopup,
        closeScoreTutorPopup,
        inferFocusSpan,
        inferTutorIntent,
        isAskingTutor,
        isRebuildFloatingTutorSurface,
        isRebuildTutorSurface,
        isScoreTutorPopupSurface,
        isTutorOpen,
        normalizeTutorResponse,
        openRebuildTutorPopup,
        openScoreTutorPopup,
        rebuildTutorSession,
        rememberTutorMastery,
        scoreTutorSession,
        setIsAskingTutor,
        setIsTutorOpen,
        setRebuildTutorSession,
        setScoreTutorSession,
        setTutorAnswer,
        setTutorAnswerMode,
        setTutorPendingQuestion,
        setTutorQuery,
        setTutorResponse,
        setTutorThinkingMode,
        setTutorThread,
        tutorAnswer,
        tutorAnswerMode,
        tutorConversationRef,
        tutorPendingQuestion,
        tutorQuery,
        tutorRecentMastery,
        tutorResponse,
        tutorThinkingMode,
        tutorThread,
    } = useDrillTutorLayer({
        canOpenScoreTutor: mode === "translation",
        clearWordPopup: () => setWordPopup(null),
        getCurrentSelectionFocusSpan,
        hasRebuildMeta: Boolean(drillData?._rebuildMeta),
        hasScoreFeedback: Boolean(drillData && drillFeedback),
        isRebuildMode,
        resolveTeachingPoint: inferActiveTeachingPoint,
    });

    const { handleAskTutor } = useDrillTutorRequest({
        activeTutorTeachingPoint,
        applyEconomyPatch,
        coinsRef,
        context: {
            articleTitle: context.articleTitle,
            topic: context.topic,
        },
        drillData,
        drillFeedback,
        effectivePersona: "teacher",
        getCurrentSelectionFocusSpan,
        inferFocusSpan,
        inferTutorIntent,
        isRebuildFloatingTutorSurface,
        isRebuildTutorSurface,
        isScoreTutorPopupSurface,
        normalizeTutorResponse,
        rebuildAnswerTokens,
        rebuildFeedback,
        rebuildTutorSession,
        rememberTutorMastery,
        setIsAskingTutor,
        setLootDrop,
        setRebuildTutorSession,
        setTutorAnswer,
        setTutorPendingQuestion,
        setTutorQuery,
        setTutorResponse,
        setTutorThread,
        tutorAnswerMode,
        tutorQuery,
        tutorRecentMastery,
        tutorThinkingMode,
        tutorThread,
        userTranslation,
    });
    const { handlePlayTutorCardAudio } = useDrillTutorAudio({
        audioRef,
    });

    const openShopForItem = useCallback((itemId: ShopItemId, message?: string) => {
        setShopFocusedItem(itemId);
        setShowShopModal(true);

        if (message) {
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message });
        }
    }, []);

    const togglePassageChinese = useCallback((segmentIndex: number) => {
        setRebuildPassageUiState((currentState) => {
            const nextState = [...currentState];
            const existing = nextState[segmentIndex] ?? { chineseExpanded: true };
            nextState[segmentIndex] = {
                ...existing,
                chineseExpanded: !existing.chineseExpanded,
            };
            return nextState;
        });
    }, []);

    const activatePassageSegment = useCallback((segmentIndex: number) => {
        if (!isRebuildPassage || !passageSession) return;
        const targetSegment = passageSession.segments[segmentIndex];
        if (!targetSegment) return;
        clearRebuildPassageShadowingPromptTimer();

        const nextDrafts = [...rebuildPassageDrafts];
        const currentDraft = nextDrafts[activePassageSegmentIndex];
        if (currentDraft) {
            nextDrafts[activePassageSegmentIndex] = buildActivePassageDraftSnapshot(currentDraft);
        }

        const targetResult = rebuildPassageResults.find((item) => item.segmentIndex === segmentIndex) ?? null;
        const nextTargetDraftBase = nextDrafts[segmentIndex] ?? createRebuildPassageDraftState(targetSegment, segmentIndex);
        const nextTargetDraft = (nextTargetDraftBase.startedAt === null && !targetResult)
            ? { ...nextTargetDraftBase, startedAt: Date.now() }
            : nextTargetDraftBase;
        nextDrafts[segmentIndex] = nextTargetDraft;

        setRebuildPassageDrafts(nextDrafts);
        setActivePassageSegmentIndex(segmentIndex);
        applyPassageDraftToActiveState(nextTargetDraft);
        setDrillData((current) => current ? hydratePassageSegmentDrill(current, segmentIndex) : current);
        setRebuildFeedback(null);
        setRebuildSentenceShadowingFlow("idle");
        setRebuildPassageShadowingSegmentIndex(targetResult ? segmentIndex : null);
        setRebuildPassageShadowingFlow("idle");
        setAnalysisRequested(false);
        setAnalysisDetailsOpen(false);
        setWordPopup(null);
    }, [
        activePassageSegmentIndex,
        applyPassageDraftToActiveState,
        buildActivePassageDraftSnapshot,
        clearRebuildPassageShadowingPromptTimer,
        hydratePassageSegmentDrill,
        isRebuildPassage,
        passageSession,
        rebuildPassageDrafts,
        rebuildPassageResults,
    ]);

    const { handleSkipRebuild, handleSubmitRebuild } = useDrillRebuildSubmit({
        activePassageResult,
        activePassageSegmentIndex,
        clearRebuildPassageShadowingPromptTimer,
        clearRebuildSentenceShadowingPromptTimer,
        currentElo,
        drillData,
        isRebuildMode,
        isRebuildPassage,
        launchRebuildSuccessCelebration,
        passageSession,
        playRebuildSfx,
        rebuildAnswerTokens,
        rebuildEditCount,
        rebuildFeedback,
        rebuildPassageResults,
        rebuildPassageShadowingPromptTimerRef,
        rebuildReplayCount,
        rebuildSentenceShadowingPromptTimerRef,
        rebuildShadowingAutoOpen,
        rebuildStartedAt,
        recordCompletedDrill,
        setAnalysisDetailsOpen,
        setAnalysisRequested,
        setPendingRebuildSentenceFeedback,
        setRebuildFeedback,
        setRebuildPassageResults,
        setRebuildPassageShadowingFlow,
        setRebuildPassageShadowingSegmentIndex,
        setRebuildPassageUiState,
        setRebuildSentenceShadowingFlow,
    });

    const rebuildTypingBufferRef = useRef("");
    const {
        handleRebuildPoolTokenClick,
        handleRebuildRemoveToken,
        handleRebuildSelectToken,
    } = useDrillRebuildComposer({
        activePassageResult,
        drillData,
        handleSubmitRebuild,
        isPlaying,
        isRebuildMode,
        isRebuildPassage,
        onPlayAudio: playAudio,
        rebuildAnswerTokens,
        rebuildAutocorrect,
        rebuildAvailableTokens,
        rebuildComboLastAtRef,
        rebuildFeedback,
        rebuildTokenOrderRef,
        rebuildTypingBuffer,
        rebuildTypingBufferRef,
        setRebuildAnswerTokens,
        setRebuildAutocompleteSuggestion,
        setRebuildAvailableTokens,
        setRebuildCombo,
        setRebuildComboFxAt,
        setRebuildEditCount,
        setRebuildTypingBuffer,
    });

    const {
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
    } = useDrillEconomyActions({
        applyEconomyPatch,
        blindVisibleUnlockConsumed,
        coinsRef,
        cosmeticThemes: COSMETIC_THEMES,
        drillData,
        drillFeedbackExists: Boolean(drillFeedback),
        getItemCount,
        handleGenerateDrill,
        isAudioLoading,
        isBlindMode,
        isDictationMode,
        isGeneratingDrill,
        isHintLoading,
        isListeningFamilyMode,
        itemCatalog: ITEM_CATALOG,
        learningSessionActive,
        mode,
        onOpenShopForItem: openShopForItem,
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
    });

    const {
        passageStageProps,
        rebuildQuestionNode,
        sentenceStageProps,
    } = useDrillRebuildView({
        activatePassageSegment,
        activeCosmeticTheme,
        activeCosmeticUi,
        activePassageResult,
        activePassageSegmentForShadowing,
        activePassageSegmentIndex,
        activeRebuildShadowingEntry,
        activeRebuildShadowingScope,
        audioSourceText,
        buildSentenceIpa: (sentence) => buildConnectedSentenceIpa(sentence, getIPA),
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
        onCyclePlaybackSpeed: cyclePlaybackSpeed,
        onOpenTour: () => setShowRebuildTour(true),
        onPlayAudio: playAudio,
        onTogglePassageChinese: togglePassageChinese,
        onToggleRebuildAutocorrect: () => setRebuildAutocorrect((value) => !value),
        onToggleRebuildHideTokens: () => setRebuildHideTokens((value) => !value),
        onToggleSentenceChinese: () => setShowChinese((value) => !value),
        passageShadowingFlow: rebuildPassageShadowingFlow,
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
        sentenceShadowingFlow: rebuildSentenceShadowingFlow,
        setRebuildPassageShadowingFlow,
        setRebuildSentenceShadowingFlow,
        shouldShowRebuildShadowingCorrection: showRebuildShadowingCorrection,
        showChinese,
        normalizeRebuildShadowingText,
        alignRebuildShadowingTokens,
    });

    const {
        analysisHighlights,
        analysisLead,
        diffNode,
        fullAnalysisContent,
        hasDetailedAnalysis,
        listeningMetricCardsNode,
        listeningReplayNode,
        recapNode,
        referenceSentenceNode,
    } = useDrillFeedbackView({
        analysisRequested,
        drillData,
        drillFeedback,
        fullAnalysisData,
        grammarError,
        isDictationMode,
        isGeneratingAnalysis,
        isGeneratingGrammar,
        mode,
        onGenerateAnalysis: handleGenerateAnalysis,
        onOpenScoreTutor: openScoreTutorPopup,
        onPlayAudio: playAudio,
        onPlayRecording: playRecording,
        referenceGrammarAnalysis,
        referenceGrammarDisplayMode,
        renderInteractiveCoachText,
        renderInteractiveText,
        setReferenceGrammarDisplayMode,
        teachingMode,
        userTranslation,
        wavBlob,
    });
    const primaryAdvice = mode === "listening"
        ? ""
        : Array.isArray(drillFeedback?.feedback)
        ? drillFeedback?.feedback?.[0]
        : drillFeedback?.feedback?.dictation_tips?.[0]
            || drillFeedback?.feedback?.listening_tips?.[0]
            || drillFeedback?.tips_cn?.[0]
            || drillFeedback?.feedback?.encouragement
            || "";
    // Auto-Mount Generate (WAIT for Elo to be loaded first!)
    useEffect(() => {
        // Only generate when Elo is loaded to ensure correct difficulty
        if (!isEloLoaded) return;

        if (!drillData && !isGeneratingDrill) {
            handleGenerateDrill();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, isEloLoaded]);

    const {
        currentBoss,
        drillSurfacePhase,
        finalDrillSurfacePhase,
        loaderTick,
    } = useDrillSurfaceLoader({
        bossType: bossState.type,
        hasDrillData: Boolean(drillData),
        isEloLoaded,
        isGeneratingDrill,
    });

    return (
        <>
            <div
                className={cn(
                "fixed inset-0 z-50 transition-colors duration-1000 bg-theme-base-bg",
                    isRebuildPassage
                        ? "flex items-start justify-center p-0 md:px-6 md:pb-6 md:pt-2"
                        : "flex items-center justify-center p-4 md:p-8",
                    shake && "animate-shake"
                )}
            >
                <DrillThemeBackdrop
                    activeCosmeticTheme={{
                        bgClass: activeCosmeticTheme.bgClass,
                        isDark: activeCosmeticTheme.isDark,
                    }}
                    cosmeticTheme={cosmeticTheme}
                    theme={theme}
                />

                <AnimatePresence>
                    {finalDrillSurfacePhase !== "ready" && (
                        <DrillLoadingOverlay
                            loaderTick={loaderTick}
                            prefersReducedMotion={prefersReducedMotion ?? false}
                            rebuildRagState={rebuildRagLoadingState}
                            variant={mode === "imitation" ? "translation" : mode}
                        />
                    )}
                </AnimatePresence>

                <DrillReadySurface
                    ref={battleShellRef}
                    isReady={finalDrillSurfacePhase === "ready"}
                    className={cn(
                        "relative w-full overflow-hidden flex flex-col transition-all duration-700",
                        isRebuildPassage
                            ? "h-full md:h-[calc(100vh-3rem)] max-w-none md:max-w-[980px] rounded-none md:rounded-[2.15rem] shadow-[0_28px_80px_rgba(15,23,42,0.12)]"
                            : "max-w-5xl h-[85vh] rounded-[2.5rem] shadow-2xl",
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
                    isRebuildPassage={isRebuildPassage}
                    shellEffectsProps={{
                        activeParticleCount,
                        canShowStreakParticles,
                        canUseStreakAura,
                        currentStreak,
                        fuseTime,
                        prefersReducedMotion: prefersReducedMotion ?? false,
                        streakTransition,
                        streakVisual: {
                            accent: streakVisual.accent,
                            auraGradient: streakVisual.auraGradient,
                            beamGradient: streakVisual.beamGradient,
                            beamShadow: streakVisual.beamShadow,
                            surfaceBorder: streakVisual.surfaceBorder,
                            badgeGlow: streakVisual.badgeGlow,
                            progressGradient: streakVisual.progressGradient,
                            particleGradient: streakVisual.particleGradient,
                        },
                        theme,
                        whisperRecording,
                    }}
                    headerNode={
                        <>
                            <DrillHeaderInfo
                            activeStreakTier={activeStreakTier}
                            bossType={bossState.type}
                            cooldownStreak={cooldownStreak}
                            currentElo={currentElo ?? DEFAULT_BASE_ELO}
                            currentStreak={currentStreak}
                            defaultBaseElo={DEFAULT_BASE_ELO}
                            drillData={drillData}
                            isQuickMatch={!!context.isQuickMatch}
                            isRebuildMode={isRebuildMode}
                            isTranslationPassage={isTranslationPassage && !!translationPassageSession}
                            mode={mode}
                            onTopicResetIntervalChange={setTopicResetInterval}
                            prefersReducedMotion={prefersReducedMotion ?? false}
                            rouletteMultiplier={rouletteSession?.multiplier ?? null}
                            rouletteResult={rouletteSession?.result ?? null}
                            streakTier={streakTier}
                            streakTransition={streakTransition}
                            streakVisual={{
                                accent: streakVisual.accent,
                                badgeGlow: streakVisual.badgeGlow,
                                badgeBorder: streakVisual.badgeBorder,
                                badgeGradient: streakVisual.badgeGradient,
                                badgeShadow: streakVisual.badgeShadow,
                            }}
                            topicResetInterval={topicResetInterval}
                            translationPassageSegmentIndex={activeTranslationPassageSegmentIndex}
                            translationPassageTotalSegments={translationPassageTotalSegments}
                        />

                            <DrillHeaderActions
                                activeCosmeticUi={{
                                    audioUnlockedClass: activeCosmeticUi.audioUnlockedClass,
                                    checkButtonClass: activeCosmeticUi.checkButtonClass,
                                    iconButtonClass: activeCosmeticUi.iconButtonClass,
                                    ledgerClass: activeCosmeticUi.ledgerClass,
                                }}
                                audioTicketCount={audioTicketCount}
                                canUseModeShop={canUseModeShop}
                                capsuleCount={capsuleCount}
                                coins={coins}
                                getEconomyPulseClass={getEconomyPulseClass}
                                hintTicketCount={hintTicketCount}
                                isHintShake={isHintShake}
                                isShopInventoryExpanded={isShopInventoryExpanded}
                                onClose={onClose}
                                onOpenShop={handleOpenShopModal}
                                onShopDockHoveredChange={setIsShopDockHovered}
                                refreshTicketCount={refreshTicketCount}
                                setEconomyTargetRef={setEconomyTargetRef}
                                shopDockHasHoverSupport={shopDockHasHoverSupport}
                                vocabTicketCount={vocabTicketCount}
                            />
                        </>
                    }
                    bodyNode={
                        <>
                            {!isRebuildMode && (
                                <ScoringFlipCard
                                    isScoring={isSubmittingDrill && !drillFeedback}
                                    userAnswer={userTranslation}
                                    mode={mode === "imitation" ? "translation" : mode}
                                    streakTier={streakTier}
                                />
                            )}

                            {drillSurfacePhase === "ready" && drillData ? (
                                <AnimatePresence mode="popLayout" initial={false}>
                                    {(!drillFeedback || isRebuildMode) ? (
                                    <DrillQuestionStage
                                        bodyClassName={cn(
                                            isRebuildMode
                                                ? (isRebuildPassage ? "p-4 md:px-6 md:py-4 pb-6 md:pb-8" : "p-4 md:p-5 pb-5 md:pb-6")
                                                : isDictationMode
                                                    ? "p-4 md:p-5 pb-6 md:pb-8"
                                                    : "p-6 md:p-8 pb-10 md:pb-12",
                                        )}
                                        blurActive={Boolean(
                                            isRebuildMode
                                            && !isRebuildPassage
                                            && (rebuildSentenceShadowingFlow === "prompt" || rebuildSentenceShadowingFlow === "shadowing")
                                        )}
                                        contentClassName={cn("mx-auto w-full", isRebuildMode ? (isRebuildPassage ? "max-w-[820px] space-y-3" : "max-w-4xl space-y-2") : isDictationMode ? "max-w-2xl space-y-3" : "max-w-3xl space-y-4")}
                                        interactiveAreaClassName={cn("w-full", isRebuildMode ? "space-y-0" : "space-y-4")}
                                        isAudioPracticeMode={isAudioPracticeMode}
                                        isGeneratingDrill={isGeneratingDrill}
                                        isRebuildMode={isRebuildMode}
                                        listeningPromptProps={isAudioPracticeMode ? {
                                            activePlaybackAudio,
                                            blindVisibleUnlockConsumed,
                                            boss: {
                                                active: bossState.active,
                                                hp: bossState.hp,
                                                maxHp: bossState.maxHp,
                                                playerHp: bossState.playerHp,
                                                playerMaxHp: bossState.playerMaxHp,
                                                type: bossState.type,
                                            },
                                            fuseTime,
                                            gamble: {
                                                active: gambleState.active,
                                                wager: gambleState.wager,
                                            },
                                            hasPlayedEcho: hasPlayedEchoRef.current,
                                            isAudioLoading,
                                            isBlindMode,
                                            isDictationMode,
                                            isGeneratingDrill,
                                            isListeningFamilyMode,
                                            isPlaying,
                                            isPrefetching,
                                            isRebuildMode,
                                            isRebuildPassage,
                                            isSubmittingDrill,
                                            onBlindVisibilityToggle: handleBlindVisibilityToggle,
                                            onPlaybackSpeedChange: handlePlaybackSpeedChange,
                                            onPlayAudio: () => { void playAudio(); },
                                            onRefresh: handleRefreshDrill,
                                            onToggleChinese: handleToggleChinese,
                                            playbackSpeed,
                                            refreshTicketCount,
                                            referenceContent: renderInteractiveText(drillData.reference_english),
                                            showChinese,
                                            sourceChinese: drillData.chinese,
                                            theme,
                                        } : null}
                                        onRefresh={handleRefreshDrill}
                                        rebuildQuestionNode={rebuildQuestionNode}
                                        shadowingInputProps={!isRebuildMode && isShadowingMode ? {
                                            hasRecordingResult: Boolean(wavBlob),
                                            isProcessing: whisperProcessing,
                                            isRecording: whisperRecording,
                                            isSpeechInputAvailable: speechInputAvailable,
                                            isSpeechInputReady: speechInputReady,
                                            isSubmitting: isSubmittingDrill,
                                            onStartRecording: () => { void startRecognition(); },
                                            onStopRecording: stopRecognition,
                                            onSubmit: () => { void handleSubmitDrill(); },
                                            speechInputError,
                                            speechInputLevel,
                                        } : null}
                                        showDivider={!isRebuildMode}
                                        sourceAreaClassName={cn("text-center w-full", isRebuildMode ? "space-y-2" : isDictationMode ? "space-y-4" : "space-y-6")}
                                        sourceMotionClassName={cn("relative flex flex-col items-center w-full", isRebuildMode ? "gap-2" : isDictationMode ? "gap-4" : "gap-6")}
                                        dictationInputProps={!isRebuildMode && !isShadowingMode && isDictationMode ? {
                                            disabled: isSubmittingDrill,
                                            isSubmitting: isSubmittingDrill,
                                            onChange: handleDictationChange,
                                            onSubmit: () => { void handleSubmitDrill(); },
                                            value: userTranslation,
                                        } : null}
                                        translationInputProps={!isRebuildMode && !isShadowingMode && !isDictationMode ? {
                                            drillKey: drillData?.reference_english || drillData?.chinese || "drill-input",
                                            value: userTranslation,
                                            onChange: setUserTranslation,
                                            sourceText: drillData?.chinese,
                                            referenceAnswer: drillData?.reference_english,
                                            syntaxChunks: drillData?.syntax_chunks || drillData?._translationMeta?.passageSession?.segments?.find(s => s.referenceEnglish === drillData.reference_english)?.syntaxChunks,
                                            syntaxKeywords: translationKeywords,
                                            predictionMode,
                                            onPredictionRequest: handlePredictionRequest,
                                            onPredictionShown: handlePredictionShown,
                                            fullReferenceGhostText: fullReferenceHint.text,
                                            fullReferenceGhostVersion: fullReferenceHint.version,
                                            onViewHistory: () => setIsCoachHistoryOpen(true),
                                            disabled: isSubmittingDrill,
                                            inputShellClass: activeCosmeticUi.inputShellClass,
                                            textareaClass: activeCosmeticUi.textareaClass,
                                            wordBadgeActiveClass: activeCosmeticUi.wordBadgeActiveClass,
                                            wordBadgeIdleClass: activeCosmeticUi.wordBadgeIdleClass,
                                            checkButtonClass: activeCosmeticUi.checkButtonClass,
                                            mutedTextClass: activeCosmeticTheme.mutedClass,
                                            isSubmitting: isSubmittingDrill,
                                            onOpenGhostSettings: () => setIsGhostSettingsModalOpen(true),
                                            onSubmit: handleSubmitDrill,
                                            onApplyFix: (_errorWord, _fixWord) => {
                                                if (navigator.vibrate) navigator.vibrate(15);
                                            },
                                        } : null}
                                        translationPromptProps={!isAudioPracticeMode ? {
                                            activeCosmeticUi: {
                                                audioLockedClass: activeCosmeticUi.audioLockedClass,
                                                audioUnlockedClass: activeCosmeticUi.audioUnlockedClass,
                                                iconButtonClass: activeCosmeticUi.iconButtonClass,
                                                keywordChipClass: activeCosmeticUi.keywordChipClass,
                                                speedActiveClass: activeCosmeticUi.speedActiveClass,
                                                speedIdleClass: activeCosmeticUi.speedIdleClass,
                                                speedShellClass: activeCosmeticUi.speedShellClass,
                                                toolbarClass: activeCosmeticUi.toolbarClass,
                                                vocabButtonClass: activeCosmeticUi.vocabButtonClass,
                                                wordBadgeActiveClass: activeCosmeticUi.wordBadgeActiveClass,
                                            },
                                            chinese: drillData.chinese,
                                            hasTranslationKeywords,
                                            isAudioLoading,
                                            isGeneratingDrill,
                                            isHintShake,
                                            isPlaying,
                                            isTranslationAudioUnlocked,
                                            isVocabHintRevealed,
                                            playbackSpeed,
                                            refreshTicketCount,
                                            translationKeywords,
                                            onPlaybackSpeedChange: handlePlaybackSpeedChange,
                                            onRefresh: handleRefreshDrill,
                                            onRevealVocabHint: handleRevealVocabHint,
                                            onTranslationReferencePlayback: handleTranslationReferencePlayback,
                                            onWordClick: handleWordClick,
                                        } : null}
                                    />
                                    ) : (
                                        <DrillFeedbackStage
                                            bossRevealType={gambleState.active ? "gamble" : (bossState.type as "reaper" | "lightning" | "other")}
                                            feedbackNode={drillFeedback ? (
                                                <DrillFeedbackContent
                                                    analysisError={analysisError}
                                                    analysisHighlights={analysisHighlights}
                                                    analysisLead={analysisLead}
                                                    analysisRequested={analysisRequested}
                                                    currentElo={currentElo ?? DEFAULT_BASE_ELO}
                                                    defaultBaseElo={DEFAULT_BASE_ELO}
                                                    eloChange={eloChange}
                                                    feedback={drillFeedback}
                                                    fullAnalysisContent={fullAnalysisContent}
                                                    fullAnalysisError={fullAnalysisError}
                                                    fullAnalysisOpen={fullAnalysisOpen}
                                                    fullAnalysisRequested={fullAnalysisRequested}
                                                    grammarDisplayMode={referenceGrammarDisplayMode}
                                                    grammarError={grammarError}
                                                    hasDetailedAnalysis={hasDetailedAnalysis}
                                                    isDictationMode={isDictationMode}
                                                    isGeneratingAnalysis={isGeneratingAnalysis}
                                                    isGeneratingFullAnalysis={isGeneratingFullAnalysis}
                                                    isGeneratingGrammar={isGeneratingGrammar}
                                                    isListeningMode={isListeningMode}
                                                    isShadowingMode={isShadowingMode}
                                                    isSubmitting={isSubmittingDrill}
                                                    listeningNode={(
                                                        <div className="space-y-4">
                                                            {listeningReplayNode}
                                                            {diffNode}
                                                            {listeningMetricCardsNode}
                                                        </div>
                                                    )}
                                                    metricCardsNode={isShadowingMode ? listeningMetricCardsNode : null}
                                                    mode={mode}
                                                    onAppeal={() => { void handleSubmitDrill(undefined, true); }}
                                                    onGenerateFullAnalysis={handleGenerateFullAnalysis}
                                                    onGenerateGrammar={handleGenerateReferenceGrammar}
                                                    onGrammarDisplayModeChange={setReferenceGrammarDisplayMode}
                                                    onPlayReferenceAudio={playAudio}
                                                    onPlayRecording={isShadowingMode ? playRecording : undefined}
                                                    onRetryAnalysis={handleGenerateAnalysis}
                                                    onRetryScore={handleRetryScoring}
                                                    onToggleFullAnalysis={() => setFullAnalysisOpen(prev => !prev)}
                                                    prefersReducedMotion={prefersReducedMotion ?? false}
                                                    primaryAdvice={primaryAdvice}
                                                    recapNode={recapNode}
                                                    referenceGrammarAnalysis={referenceGrammarAnalysis}
                                                    referenceSentenceNode={referenceSentenceNode}
                                                    streakTier={streakTier}
                                                    streakVisualScoreGlow={streakVisual.scoreGlow}
                                                    translationCorrectionTargetText={drillFeedback.improved_version || drillData.reference_english}
                                                    translationImprovedVersionNode={drillFeedback.improved_version ? renderInteractiveCoachText(drillFeedback.improved_version) : null}
                                                    userTranslation={userTranslation}
                                                />
                                            ) : null}
                                            onBossNext={handleBossFeedbackNext}
                                            onBossRetry={gambleState.active ? undefined : handleBossFeedbackRetry}
                                            score={drillFeedback?.score ?? 0}
                                            showBossReveal={Boolean(drillFeedback && (bossState.active || (gambleState.active && gambleState.introAck)))}
                                        />
                                    )}
                                </AnimatePresence>
                            ) : null}

                            <DrillRebuildFeedbackOverlays
                                sentenceStageProps={sentenceStageProps}
                                passageStageProps={passageStageProps}
                            />

                            <DrillBottomActions
                                activeCosmeticUi={activeCosmeticUi}
                                bossActive={bossState.active}
                                gambleActive={gambleState.active}
                                isFinalTranslationSegment={isFinalTranslationSegment}
                                isGeneratingAnalysis={isGeneratingAnalysis}
                                isRebuildMode={isRebuildMode}
                                isRebuildPassage={isRebuildPassage}
                                isTranslationPassage={isTranslationPassage}
                                onNextQuestion={() => { void handleGenerateDrill(); }}
                                onPrevSegment={handlePrevTranslationPassageSegment}
                                onRebuildPassageNext={() => { void handleGenerateDrill(); }}
                                onRebuildPassageRedo={handleRebuildPassageRedo}
                                onRebuildSelfEvaluate={handleRebuildSelfEvaluate}
                                onTranslationSelfEvaluate={(value) => { void handleTranslationSelfEvaluate(value); }}
                                onTranslationPassageNext={handleNextTranslationPassageSegment}
                                rebuildFeedbackPresent={Boolean(rebuildFeedback)}
                                rebuildPassageSummaryPresent={Boolean(rebuildPassageSummary)}
                                rebuildSelfEvaluationLocked={Boolean(rebuildFeedback?.selfEvaluation)}
                                rebuildSentenceShadowingIdle={rebuildSentenceShadowingFlow === "idle"}
                                showFeedbackCta={Boolean((isRebuildMode ? false : drillFeedback))}
                                showPrevSegment={isTranslationPassage && activeTranslationPassageSegmentIndex > 0}
                                showTranslationSelfEvaluation={Boolean(
                                    mode === "translation"
                                    && drillFeedback
                                    && !drillFeedback._error
                                    && (!isTranslationPassage || isFinalTranslationSegment)
                                )}
                                streakTier={streakTier}
                                streakVisual={streakVisual}
                                translationSelfEvaluationLocked={Boolean(drillFeedback?.selfEvaluation)}
                            />
                        </>
                    }
                    overlayNode={
                        <DrillOverlayLayer
                            slotMachineKey={[
                                mode,
                                eloRating,
                                prefetchedDrillTopic?.topicLine ?? "random-topic",
                                prefetchedDrillTopic?.topicPrompt ?? "random-prompt",
                            ].join("::")}
                            slotMachineProps={pendingSlotMachineTrigger ? {
                                elo: eloRating,
                                mode: mode === "translation" ? "translation" : "battle",
                                forcedTopic: prefetchedDrillTopic ? {
                                    topicLine: prefetchedDrillTopic.topicLine,
                                    topicPrompt: prefetchedDrillTopic.topicPrompt,
                                    domainLabel: prefetchedDrillTopic.domainLabel,
                                    scenarioLabel: prefetchedDrillTopic.scenarioLabel || "通用",
                                    genreLabel: ("genreLabel" in prefetchedDrillTopic
                                        ? prefetchedDrillTopic.genreLabel
                                        : prefetchedDrillTopic.roleFrameLabel) || "通用",
                                } : undefined,
                                onComplete: () => {
                                    setPendingSlotMachineTrigger(false);
                                    slotMachineResolvedRef.current = true;
                                    const args = pendingGenerateArgsRef.current || {};
                                    handleGenerateDrill(args.targetDifficulty, args.overrideBossType, args.skipPrefetched, args.forcedElo);
                                },
                                onCancel: () => {
                                    setPendingSlotMachineTrigger(false);
                                    slotMachineResolvedRef.current = true;
                                    const args = pendingGenerateArgsRef.current || {};
                                    handleGenerateDrill(args.targetDifficulty, args.overrideBossType, args.skipPrefetched, args.forcedElo);
                                },
                            } : null}
                            tutorOverlaysProps={{
                                coachDrawer: {
                                    history: aiCoachHistory,
                                    inputValue: drawerInputValue,
                                    isOpen: isCoachHistoryOpen,
                                    isPending: isDrawerChatPending,
                                    onClose: () => setIsCoachHistoryOpen(false),
                                    onInputChange: setDrawerInputValue,
                                    onSubmit: submitDrawerChat,
                                    streamingText: drawerStreamingText,
                                },
                                conversationRef: tutorConversationRef,
                                popupConfig: {
                                    answerMode: tutorAnswerMode,
                                    inputClass: activeCosmeticUi.tutorInputClass,
                                    isAsking: isAskingTutor,
                                    mutedTextClass: activeCosmeticTheme.mutedClass,
                                    panelClass: activeCosmeticUi.tutorPanelClass,
                                    query: tutorQuery,
                                    sendButtonClass: activeCosmeticUi.analysisButtonClass,
                                    thinkingMode: tutorThinkingMode,
                                    turns: tutorThread,
                                },
                                popupState: {
                                    fallbackAnswer: tutorAnswer,
                                    pendingAnswer: tutorAnswer,
                                    pendingQuestion: tutorPendingQuestion,
                                    rebuildSession: drillData ? rebuildTutorSession : null,
                                    scoreSession: drillData && drillFeedback && mode === "translation" ? scoreTutorSession : null,
                                    showLauncher: Boolean(isRebuildMode && drillData && !isGeneratingDrill && !bossState.active && !gambleState.active && !rebuildTutorSession?.isOpen),
                                },
                                popupCallbacks: {
                                    launcherOpen: (anchorPoint) => openRebuildTutorPopup(anchorPoint),
                                    rebuild: {
                                        onAnswerModeChange: setTutorAnswerMode,
                                        onClose: closeRebuildTutorPopup,
                                        onPlayCardAudio: handlePlayTutorCardAudio,
                                        onQueryChange: setTutorQuery,
                                        onSubmit: () => { void handleAskTutor({ questionType: "follow_up" }); },
                                        onThinkingModeChange: setTutorThinkingMode,
                                    },
                                    score: {
                                        onAnswerModeChange: setTutorAnswerMode,
                                        onClose: closeScoreTutorPopup,
                                        onPlayCardAudio: handlePlayTutorCardAudio,
                                        onQueryChange: setTutorQuery,
                                        onSubmit: () => { void handleAskTutor({ questionType: "follow_up" }); },
                                        onThinkingModeChange: setTutorThinkingMode,
                                    },
                                },
                            }}
                            wordPopupProps={wordPopup ? {
                                popup: wordPopup,
                                onClose: () => setWordPopup(null),
                                mode: "battle",
                                battleConsumeLookupTicket: isDictationMode ? () => handleDictationWordLookupTicketConsume("lookup") : undefined,
                                battleConsumeDeepAnalyzeTicket: isDictationMode ? () => handleDictationWordLookupTicketConsume("deepAnalyze") : undefined,
                                battleLookupCostHint: isDictationMode ? "查词 -1 关键词券，Deep Analyze -1 关键词券。" : "Battle 查词不消耗阅读币。",
                                battleInsufficientHint: "关键词券不足，请先去商场购买。",
                            } : null}
                        />
                    }
                />

                <DrillBattleEventOverlays
                    bossState={bossState}
                    currentBoss={currentBoss}
                    currentWinnings={gambleState.wager === 'risky' ? 60 * Math.pow(2.5, gambleState.doubleDownCount) : 150 * Math.pow(2.5, gambleState.doubleDownCount)}
                    economyFxOverlay={economyFxOverlay}
                    eloSplash={eloSplash}
                    gachaOverlayProps={showGacha ? {
                        cards: gachaCards,
                        selectedCardId: selectedGachaCardId,
                        claimTarget: gachaClaimTarget,
                        onSelect: handleGachaSelect,
                        onComplete: handleGachaComplete,
                    } : null}
                    gambleState={gambleState}
                    isShopEconomyFx={isShopEconomyFx}
                    lootDrop={lootDrop}
                    onAcknowledgeBossIntro={() => setBossState(prev => ({ ...prev, introAck: true }))}
                    onAcknowledgeGambleIntro={() => setGambleState(prev => ({ ...prev, introAck: true }))}
                    onCloseDoubleDown={() => {
                        setShowDoubleDown(false);
                        setGambleState(prev => ({ ...prev, active: false, introAck: false, wager: null, doubleDownCount: 0 }));
                        setTheme('default');
                    }}
                    onCloseLootDrop={() => setLootDrop(null)}
                    onCloseRankDown={() => setRankDown(null)}
                    onCloseRankUp={() => setRankUp(null)}
                    onDoubleDown={() => {
                        setShowDoubleDown(false);
                        setGambleState(prev => ({ ...prev, doubleDownCount: prev.doubleDownCount + 1 }));
                        handleGenerateDrill();
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-sword-slash-swoosh-1476.mp3').play().catch(() => { });
                    }}
                    onSelectMadnessWager={() => {
                        setGambleState(prev => ({ ...prev, wager: 'madness' }));
                        setTheme('crimson');
                        setShake(true);
                        if (navigator.vibrate) navigator.vibrate(200);
                    }}
                    onSelectRiskyWager={() => {
                        setGambleState(prev => ({ ...prev, wager: 'risky' }));
                        setTheme('crimson');
                        setShake(true);
                    }}
                    onSelectSafeWager={() => {
                        setGambleState(prev => ({ ...prev, wager: 'safe' }));
                        setTheme('default');
                    }}
                    rankDown={rankDown}
                    rankUp={rankUp}
                    rouletteOverlayProps={showRoulette ? {
                        onComplete: handleRouletteComplete,
                        onCancel: closeRoulette,
                    } : null}
                    showDoubleDown={showDoubleDown}
                />

            </div>

            <DrillSupportOverlays

                ghostSettingsModalProps={{
                    open: isGhostSettingsModalOpen,
                    onClose: () => setIsGhostSettingsModalOpen(false),
                }}
                shopModalProps={{
                    canUseModeShop,
                    checkButtonClass: activeCosmeticUi.checkButtonClass,
                    coins,
                    iconButtonClass: activeCosmeticUi.iconButtonClass,
                    itemClass: activeCosmeticUi.tutorPanelClass,
                    isOpen: showShopModal,
                    items: (Object.keys(ITEM_CATALOG) as ShopItemId[]).map((itemId) => {
                        const item = ITEM_CATALOG[itemId];
                        return {
                            id: item.id,
                            name: item.name,
                            price: item.price,
                            icon: item.icon,
                            consumeAction: item.consumeAction,
                            description: item.description,
                            count: getItemCount(itemId),
                            canBuy: coins >= item.price,
                            isFocused: shopFocusedItem === itemId,
                        };
                    }),
                    mutedClass: activeCosmeticTheme.mutedClass,
                    onBuy: (itemId) => {
                        handleBuyItem(itemId as ShopItemId);
                    },
                    onClose: () => {
                        setShowShopModal(false);
                        setShopFocusedItem(null);
                    },
                    shellClass: activeCosmeticTheme.cardClass,
                    textClass: activeCosmeticTheme.textClass,
                    wordBadgeActiveClass: activeCosmeticUi.wordBadgeActiveClass,
                }}
                spotlightTourProps={{
                    isOpen: showRebuildTour,
                    onClose: () => setShowRebuildTour(false),
                    steps: rebuildTourSteps,
                }}
            />
            {false && process.env.NODE_ENV === "development" && (
                <div className="fixed bottom-20 right-4 z-[99999] bg-black/80 backdrop-blur-md p-3 rounded-xl max-h-80 overflow-y-auto flex flex-wrap gap-1 w-[320px] border border-white/20 shadow-2xl">
                    <div className="w-full text-xs text-white/50 mb-2 font-mono flex items-center justify-between">
                        <span>Gacha Debug (1-100)</span>
                    </div>
                    {Array.from({ length: 100 }).map((_, i) => {
                        const id = i + 1;
                        let colorClass = "bg-white/10 text-white hover:bg-white/30";
                        if (id <= 50) colorClass = "bg-gray-500/20 text-gray-300 hover:bg-gray-400/50";
                        else if (id <= 80) colorClass = "bg-blue-500/20 text-blue-300 hover:bg-blue-400/50";
                        else if (id <= 95) colorClass = "bg-purple-500/20 text-purple-300 hover:bg-purple-400/50";
                        else colorClass = "bg-yellow-500/20 text-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.5)] hover:bg-yellow-400/50";

                        return (
                            <button
                                key={i}
                                onClick={() => {
                                    const btn = document.querySelector('[data-tour-target="rebuild-drill-submit"]');
                                    const rect = btn ? btn.getBoundingClientRect() : null;
                                    launchCelebration(Boolean(prefersReducedMotion), rect, id);
                                }}
                                className={cn("w-[2.2rem] h-[2.2rem] rounded text-[10px] flex items-center justify-center font-mono transition-colors", colorClass)}
                            >
                                {id}
                            </button>
                        );
                    })}
                </div>
            )}
        </>
    );
}
