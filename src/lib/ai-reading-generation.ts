export type ReadingDifficulty = "cet4" | "cet6" | "ielts";
export type AIGenerationMode = "standard" | "longform";
export type AIGenerationRagMode = "off" | "reference" | "strict";
export type AIGenerationRagSource = "vocab" | "dictionary" | "hybrid";
export type LongformStyleId =
    | "story"
    | "science"
    | "commentary"
    | "profile"
    | "reportage"
    | "explainer"
    | "detailed"
    | "comparative"
    | "reflective";
export type LongformLengthTierId = "w600" | "w900" | "w1200" | "w1600" | "w2200" | "w3000" | "w4200";

export interface LongformStyleOption {
    id: LongformStyleId;
    name: string;
    promptLabel: string;
    lens: string;
    constraint: string;
}

export interface LongformLengthTierOption {
    id: LongformLengthTierId;
    label: string;
    targetWordCount: number;
    toleranceRatio: number;
}

export interface AIGenerationModeOption {
    id: AIGenerationMode;
    label: string;
}

export interface LongformStyleMeta {
    id: LongformStyleId;
    name: string;
}

export interface LongformLengthTierMeta {
    id: LongformLengthTierId;
    label: string;
    targetWordCount: number;
}

export interface AIGenerationRequestBody {
    topic?: string;
    topicSeed?: unknown;
    difficulty: ReadingDifficulty;
    generationMode: AIGenerationMode;
    ragMode?: AIGenerationRagMode;
    ragSource?: AIGenerationRagSource;
    longformStyleId?: LongformStyleId;
    lengthTierId?: LongformLengthTierId;
    injectedVocabulary?: string[];
}

export interface AIGenerationRagConfig {
    mode: AIGenerationRagMode;
    source: AIGenerationRagSource;
}

export interface AIGenerationRagSelection {
    standard: AIGenerationRagConfig;
    longform: AIGenerationRagConfig;
}

export const AI_GENERATION_MODE_OPTIONS: readonly AIGenerationModeOption[] = [
    { id: "standard", label: "标准模式" },
    { id: "longform", label: "长文模式" },
] as const;

export const AI_GENERATION_RAG_MODE_OPTIONS: ReadonlyArray<{ id: AIGenerationRagMode; label: string }> = [
    { id: "off", label: "关闭 RAG" },
    { id: "reference", label: "参考模式" },
    { id: "strict", label: "严格模式" },
] as const;

export const AI_GENERATION_RAG_SOURCE_OPTIONS: ReadonlyArray<{ id: AIGenerationRagSource; label: string }> = [
    { id: "vocab", label: "只注入生词本" },
    { id: "dictionary", label: "只注入词典" },
    { id: "hybrid", label: "混合注入" },
] as const;

export const DEFAULT_AI_GENERATION_RAG_CONFIG: AIGenerationRagConfig = {
    mode: "reference",
    source: "hybrid",
};

export const DEFAULT_AI_GENERATION_RAG_SELECTION: AIGenerationRagSelection = {
    standard: { ...DEFAULT_AI_GENERATION_RAG_CONFIG },
    longform: { ...DEFAULT_AI_GENERATION_RAG_CONFIG },
};

export const LONGFORM_LENGTH_TIERS: readonly LongformLengthTierOption[] = [
    { id: "w600", label: "超短篇", targetWordCount: 600, toleranceRatio: 0.15 },
    { id: "w900", label: "短篇", targetWordCount: 900, toleranceRatio: 0.15 },
    { id: "w1200", label: "中篇", targetWordCount: 1200, toleranceRatio: 0.15 },
    { id: "w1600", label: "长篇", targetWordCount: 1600, toleranceRatio: 0.15 },
    { id: "w2200", label: "超长篇", targetWordCount: 2200, toleranceRatio: 0.15 },
    { id: "w3000", label: "巨长篇", targetWordCount: 3000, toleranceRatio: 0.15 },
    { id: "w4200", label: "马拉松", targetWordCount: 4200, toleranceRatio: 0.15 },
] as const;

export const LONGFORM_STYLE_OPTIONS: readonly LongformStyleOption[] = [
    {
        id: "story",
        name: "故事叙事",
        promptLabel: "Story Narrative",
        lens: "Write as a continuous narrative with concrete scenes, character choices, emotional momentum, and a visible arc from opening situation to resolution.",
        constraint: "Keep the prose grounded, plausible, and exam-friendly; avoid fantasy, melodrama, thriller twists, and chapter-like breaks.",
    },
    {
        id: "science",
        name: "科普解说",
        promptLabel: "Science Explainer",
        lens: "Write as a popular-science explainer that clarifies mechanisms, processes, or systems through examples, analogies, and clean causal logic.",
        constraint: "Keep facts plausible and precise; avoid textbook bulleting, pseudo-science, and over-dense jargon.",
    },
    {
        id: "commentary",
        name: "观点评论",
        promptLabel: "Commentary",
        lens: "Write as a reasoned commentary with a clear thesis, competing viewpoints, explicit tradeoffs, and a measured conclusion.",
        constraint: "Do not turn the article into debate notes or a question set; keep it as flowing prose.",
    },
    {
        id: "profile",
        name: "人物特写",
        promptLabel: "Profile",
        lens: "Write as a profile of a person, team, or community, using close observation and concrete detail before widening into broader meaning.",
        constraint: "Keep subjects realistic and proportionate; avoid full fictional biography sprawl or sentimental hero worship.",
    },
    {
        id: "reportage",
        name: "现场报道",
        promptLabel: "Reportage",
        lens: "Write as an on-the-ground report that moves through places, events, or observations while preserving journalistic clarity.",
        constraint: "Use scene details with restraint; avoid breathless live-report theatrics or fragmentary note style.",
    },
    {
        id: "explainer",
        name: "机制拆解",
        promptLabel: "Mechanism Explainer",
        lens: "Write as a mechanism explainer that breaks down how a process works step by step, showing interacting causes, feedback loops, and constraints.",
        constraint: "Keep the logic sequential and readable; avoid empty abstraction or vague system talk with no mechanism.",
    },
    {
        id: "detailed",
        name: "详细讲解",
        promptLabel: "Detailed Guided Explainer",
        lens: "Write as a patient, highly explicit guided explainer that introduces the topic clearly, unpacks each idea step by step, anticipates reader confusion, and uses concrete mini-examples or restatements to make difficult parts easier to follow.",
        constraint: "Keep it as polished continuous prose rather than bullet-point notes or textbook fragments; avoid patronizing repetition, filler recap, and empty over-explaining with no new information.",
    },
    {
        id: "comparative",
        name: "对比评述",
        promptLabel: "Comparative Analysis",
        lens: "Write by comparing two models, approaches, periods, or viewpoints, using contrast to sharpen explanation and judgment.",
        constraint: "Comparisons must stay substantive and evidence-oriented; avoid list-like point matching or shallow pros-and-cons templates.",
    },
    {
        id: "reflective",
        name: "观察随笔",
        promptLabel: "Reflective Essay",
        lens: "Write as a reflective essay that starts from concrete observation and develops toward interpretation, tension, or a broader human insight.",
        constraint: "Keep it disciplined and mature; avoid diary looseness, empty inspiration, or poetic fog.",
    },
] as const;

const LONGFORM_STYLE_ALIASES: Partial<Record<string, LongformStyleId>> = {
    case: "profile",
    history: "explainer",
    detailed_explainer: "detailed",
    "detailed-explainer": "detailed",
    society: "reportage",
    business: "comparative",
    campus: "reflective",
};

export function normalizeAIGenerationMode(value: unknown): AIGenerationMode {
    return value === "longform" ? "longform" : "standard";
}

export function normalizeAIGenerationRagMode(value: unknown): AIGenerationRagMode {
    return value === "off" || value === "strict" ? value : "reference";
}

export function normalizeAIGenerationRagSource(value: unknown): AIGenerationRagSource {
    return value === "vocab" || value === "dictionary" ? value : "hybrid";
}

export function normalizeLongformStyleId(value: unknown): LongformStyleId | null {
    if (typeof value !== "string") return null;
    if (LONGFORM_STYLE_OPTIONS.some((item) => item.id === value)) {
        return value as LongformStyleId;
    }
    return LONGFORM_STYLE_ALIASES[value] ?? null;
}

export function normalizeLongformLengthTierId(value: unknown): LongformLengthTierId | null {
    return LONGFORM_LENGTH_TIERS.some((item) => item.id === value)
        ? (value as LongformLengthTierId)
        : null;
}

export function getLongformStyleMeta(id: LongformStyleId | null | undefined): LongformStyleMeta | null {
    const matched = LONGFORM_STYLE_OPTIONS.find((item) => item.id === id);
    if (!matched) return null;
    return {
        id: matched.id,
        name: matched.name,
    };
}

export function getLongformLengthTierMeta(id: LongformLengthTierId | null | undefined): LongformLengthTierMeta | null {
    const matched = LONGFORM_LENGTH_TIERS.find((item) => item.id === id);
    if (!matched) return null;
    return {
        id: matched.id,
        label: matched.label,
        targetWordCount: matched.targetWordCount,
    };
}

export function buildAIGenerationRequestBody(params: {
    topic?: string | null;
    topicSeed?: unknown;
    difficulty: ReadingDifficulty;
    generationMode?: AIGenerationMode | null;
    ragMode?: AIGenerationRagMode | null;
    ragSource?: AIGenerationRagSource | null;
    longformStyleId?: LongformStyleId | null;
    lengthTierId?: LongformLengthTierId | null;
    injectedVocabulary?: string[] | null;
}): AIGenerationRequestBody {
    const normalizedTopic = params.topic?.trim() || undefined;
    const generationMode = normalizeAIGenerationMode(params.generationMode);
    const ragMode = normalizeAIGenerationRagMode(params.ragMode);
    const ragSource = normalizeAIGenerationRagSource(params.ragSource);
    const injectedVocabulary = Array.isArray(params.injectedVocabulary)
        ? params.injectedVocabulary.filter((item) => typeof item === "string" && item.trim().length > 0)
        : [];

    return {
        topic: normalizedTopic,
        topicSeed: params.topicSeed,
        difficulty: params.difficulty,
        generationMode,
        ragMode,
        ragSource,
        longformStyleId: generationMode === "longform" ? params.longformStyleId ?? undefined : undefined,
        lengthTierId: generationMode === "longform" ? params.lengthTierId ?? undefined : undefined,
        injectedVocabulary: injectedVocabulary.length > 0 ? injectedVocabulary : undefined,
    };
}

export function getStrictRagLimit(generationMode: AIGenerationMode) {
    return generationMode === "longform" ? 40 : 20;
}

export function isQuizEligibleArticle(article: {
    isAIGenerated?: boolean | null;
    difficulty?: ReadingDifficulty | null;
    quizEligible?: boolean | null;
} | null | undefined) {
    if (!article?.isAIGenerated || !article?.difficulty) return false;
    return article.quizEligible !== false;
}

export function formatLongformHistoryDescriptor(article: {
    difficulty?: ReadingDifficulty | null;
    generationMode?: AIGenerationMode | null;
    longformStyle?: { name?: string | null } | null;
    lengthTier?: { targetWordCount?: number | null } | null;
}) {
    if (article?.generationMode !== "longform") return null;

    const difficultyLabel = article.difficulty === "cet4"
        ? "四级"
        : article.difficulty === "cet6"
            ? "六级"
            : article.difficulty === "ielts"
                ? "雅思"
                : null;
    const styleLabel = article.longformStyle?.name?.trim() || null;
    const targetWordCount = article.lengthTier?.targetWordCount;
    const lengthLabel = typeof targetWordCount === "number" ? `${targetWordCount}词` : null;

    return [difficultyLabel, "长文", styleLabel, lengthLabel].filter(Boolean).join(" · ");
}
