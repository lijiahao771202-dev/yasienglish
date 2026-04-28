import {
    RANDOM_SCENARIO_TOPIC,
    resolveBattleScenarioContext,
    type BattleQuickMatchScenarioContext,
} from "@/lib/battle-quickmatch-topics";
import { shouldResetQuickMatchTopic } from "@/lib/battleUiState";
import type { DrillGenerationRequestBody } from "@/lib/drill-generation-client";
import {
    RANDOM_TRANSLATION_SCENARIO_TOPIC,
    resolveTranslationScenarioContext,
} from "@/lib/translation-quickmatch-topics";
import type { AiProvider } from "@/lib/profile-settings";

export type DrillGenerationMode = "translation" | "listening" | "rebuild";
export type DrillScenarioMode = DrillGenerationMode | "dictation";
export type DrillSourceMode = "ai" | "bank";
export type DrillVariant = "sentence" | "passage";
export type DrillBossType =
    | "blind"
    | "lightning"
    | "echo"
    | "reaper"
    | "roulette"
    | "roulette_execution";

type TranslationScenarioContext = ReturnType<typeof resolveTranslationScenarioContext>;

export type DrillScenarioContext = TranslationScenarioContext | BattleQuickMatchScenarioContext;

export interface DrillQuickMatchContext {
    articleTitle?: string;
    articleContent?: string;
    topic?: string;
    segmentCount?: 2 | 3 | 5;
    isQuickMatch?: boolean;
}

export interface DrillBossStateSnapshot {
    active: boolean;
    introAck: boolean;
    type: DrillBossType;
}

export interface DrillGambleStateSnapshot {
    active: boolean;
    introAck: boolean;
    wager: "safe" | "risky" | "madness" | null;
    doubleDownCount: number;
}

export interface PendingBossState {
    active: boolean;
    introAck: boolean;
    type: DrillBossType;
    hp?: number;
    maxHp?: number;
    playerHp?: number;
    playerMaxHp?: number;
}

export interface PendingGambleState {
    active: boolean;
    introAck: boolean;
    wager: "safe" | "risky" | "madness" | null;
    doubleDownCount: number;
}

interface ResolveDrillScenarioPlanArgs {
    articleTitle?: string;
    topic?: string;
    currentTopic?: string;
    currentTopicPrompt?: string;
    elo: number;
    generatedDrillCount: number;
    isContinuous: boolean;
    isQuickMatch?: boolean;
    mode: DrillScenarioMode;
    topicResetInterval: number;
    translationVariant?: DrillVariant;
}

interface ResolveDrillScenarioPlanResult {
    nextTopicPrompt?: string;
    shouldRotateTopic: boolean;
    targetScenario: DrillScenarioContext;
    targetTopic: string | undefined;
}

export function isQuickMatchTopicResetBoundary(args: {
    generatedDrillCount: number;
    isQuickMatch?: boolean;
    topicResetInterval: number;
}) {
    return Boolean(
        args.isQuickMatch
        && shouldResetQuickMatchTopic(args.generatedDrillCount, args.topicResetInterval),
    );
}

export function resolveDrillScenarioPlan({
    articleTitle,
    topic,
    currentTopic,
    currentTopicPrompt,
    elo,
    generatedDrillCount,
    isContinuous,
    isQuickMatch,
    mode,
    topicResetInterval,
    translationVariant = "sentence",
}: ResolveDrillScenarioPlanArgs): ResolveDrillScenarioPlanResult {
    const shouldRotateTopic = isContinuous
        && isQuickMatchTopicResetBoundary({
            generatedDrillCount,
            isQuickMatch,
            topicResetInterval,
        });

    let targetTopic = articleTitle || topic;
    if (isContinuous && isQuickMatch) {
        targetTopic = shouldRotateTopic
            ? (mode === "translation" ? RANDOM_TRANSLATION_SCENARIO_TOPIC : RANDOM_SCENARIO_TOPIC)
            : (currentTopic || articleTitle || topic);
    }

    const targetScenario = mode === "translation"
        ? resolveTranslationScenarioContext(targetTopic, elo, translationVariant)
        : resolveBattleScenarioContext(targetTopic, elo);

    return {
        targetTopic,
        targetScenario,
        shouldRotateTopic,
        nextTopicPrompt: shouldRotateTopic ? targetScenario.topicPrompt : currentTopicPrompt,
    };
}

export function rollListeningPrefetchBossType(args: {
    isListeningFamilyMode: boolean;
    randomFn?: () => number;
}): Extract<DrillBossType, "blind" | "lightning" | "echo" | "reaper"> | undefined {
    if (!args.isListeningFamilyMode) return undefined;

    const randomFn = args.randomFn ?? Math.random;
    const roll = randomFn();
    if (roll >= 0.02) return undefined;

    return resolveListeningBossType(randomFn());
}

export function resolveListeningGenerationEvent(args: {
    bossState: DrillBossStateSnapshot;
    gambleState: DrillGambleStateSnapshot;
    isListeningFamilyMode: boolean;
    overrideBossType?: string;
    randomFn?: () => number;
}): {
    nextBossType: DrillBossType | undefined;
    pendingBossState: PendingBossState | null;
    pendingGambleState: PendingGambleState | null;
} {
    if (!args.isListeningFamilyMode) {
        return {
            nextBossType: undefined,
            pendingBossState: null,
            pendingGambleState: null,
        };
    }

    const randomFn = args.randomFn ?? Math.random;
    let nextBossType = args.overrideBossType as DrillBossType | undefined
        || (args.bossState.active ? args.bossState.type : undefined);
    let pendingBossState: PendingBossState | null = null;
    let pendingGambleState: PendingGambleState | null = null;

    if (!args.bossState.active && !args.gambleState.active && !args.overrideBossType) {
        const roll = randomFn();
        if (roll < 0.02) {
            const type = resolveListeningBossType(randomFn());
            nextBossType = type;
            pendingBossState = {
                active: true,
                introAck: false,
                type,
                hp: type === "reaper" ? 3 : undefined,
                maxHp: type === "reaper" ? 3 : undefined,
                playerHp: type === "reaper" ? 3 : undefined,
                playerMaxHp: type === "reaper" ? 3 : undefined,
            };
        } else if (roll < 0.07) {
            pendingGambleState = {
                active: true,
                introAck: false,
                wager: null,
                doubleDownCount: 0,
            };
        }
    }

    if (args.overrideBossType) {
        nextBossType = args.overrideBossType as DrillBossType;
        pendingBossState = {
            active: true,
            introAck: args.overrideBossType.includes("roulette"),
            type: args.overrideBossType as DrillBossType,
            hp: undefined,
            maxHp: undefined,
            playerHp: undefined,
            playerMaxHp: undefined,
        };
        pendingGambleState = null;
    }

    return {
        nextBossType,
        pendingBossState,
        pendingGambleState,
    };
}

export function canConsumePrefetchedDrill(args: {
    mode: string;
    overrideBossType?: string;
    prefetchedDrillData: { mode?: string; sourceMode?: DrillSourceMode } | null;
    skipPrefetched?: boolean;
    sourceMode: DrillSourceMode;
}) {
    return Boolean(
        args.prefetchedDrillData
        && args.prefetchedDrillData.mode === args.mode
        && args.prefetchedDrillData.sourceMode === args.sourceMode
        && !args.overrideBossType
        && !args.skipPrefetched,
    );
}

export function buildDrillGenerationRequestBody(args: {
    articleContent?: string;
    bossType?: string;
    difficulty: string;
    eloRating: number;
    excludeBankIds?: string[];
    injectedVocabulary?: string[];
    mode: DrillGenerationMode;
    rebuildVariant?: DrillVariant;
    segmentCount?: 2 | 3 | 5;
    sourceMode: DrillSourceMode;
    timestamp: number;
    topicLine: string;
    topicPrompt?: string;
    translationVariant?: DrillVariant;
    provider?: AiProvider;
    nvidiaModel?: string;
}): DrillGenerationRequestBody {
    return {
        articleTitle: args.topicLine,
        topicPrompt: args.topicPrompt,
        articleContent: args.articleContent || "",
        difficulty: args.difficulty,
        injectedVocabulary: args.injectedVocabulary,
        eloRating: Math.max(0, args.eloRating),
        mode: args.mode,
        sourceMode: args.sourceMode,
        excludeBankIds: args.excludeBankIds,
        rebuildVariant: args.rebuildVariant,
        translationVariant: args.translationVariant,
        segmentCount: args.segmentCount,
        provider: args.provider,
        nvidiaModel: args.nvidiaModel,
        bossType: args.bossType,
        _t: args.timestamp,
    };
}

function resolveListeningBossType(bossRoll: number): Extract<DrillBossType, "blind" | "lightning" | "echo" | "reaper"> {
    if (bossRoll < 0.35) return "blind";
    if (bossRoll < 0.65) return "echo";
    if (bossRoll < 0.85) return "lightning";
    return "reaper";
}
