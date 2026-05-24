export type ReadingDifficulty = "cet4" | "cet6" | "ielts";
export type AIGenerationMode = "standard" | "longform";
export type LongformStyleId =
    | "story"
    | "science"
    | "commentary"
    | "case"
    | "history"
    | "society"
    | "business"
    | "campus";
export type LongformLengthTierId = "w600" | "w900" | "w1200" | "w1600" | "w2200";

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
    longformStyleId?: LongformStyleId;
    lengthTierId?: LongformLengthTierId;
    injectedVocabulary?: string[];
}

export const AI_GENERATION_MODE_OPTIONS: readonly AIGenerationModeOption[] = [
    { id: "standard", label: "标准模式" },
    { id: "longform", label: "长文模式" },
] as const;

export const LONGFORM_LENGTH_TIERS: readonly LongformLengthTierOption[] = [
    { id: "w600", label: "超短篇", targetWordCount: 600, toleranceRatio: 0.15 },
    { id: "w900", label: "短篇", targetWordCount: 900, toleranceRatio: 0.15 },
    { id: "w1200", label: "中篇", targetWordCount: 1200, toleranceRatio: 0.15 },
    { id: "w1600", label: "长篇", targetWordCount: 1600, toleranceRatio: 0.15 },
    { id: "w2200", label: "超长篇", targetWordCount: 2200, toleranceRatio: 0.15 },
] as const;

export const LONGFORM_STYLE_OPTIONS: readonly LongformStyleOption[] = [
    {
        id: "story",
        name: "故事",
        promptLabel: "Story",
        lens: "Write as a continuous story-driven reading passage with concrete scenes, character motion, and clear narrative progression.",
        constraint: "Keep the prose exam-friendly, readable, and grounded; avoid fantasy, melodrama, and chapter-like breaks.",
    },
    {
        id: "science",
        name: "科普",
        promptLabel: "Science Explainer",
        lens: "Write as a popular science explainer that makes complex mechanisms understandable through examples and clean logic.",
        constraint: "Keep facts plausible and precise; avoid textbook bulleting and over-dense jargon.",
    },
    {
        id: "commentary",
        name: "观点评论",
        promptLabel: "Commentary",
        lens: "Write as a reasoned commentary that presents a clear thesis, competing views, and a measured conclusion.",
        constraint: "Do not turn the article into debate notes or a question set; keep it as flowing prose.",
    },
    {
        id: "case",
        name: "人物案例",
        promptLabel: "Case Profile",
        lens: "Write around a person, group, or compact real-world case, then expand outward into broader lessons.",
        constraint: "Case details must stay realistic and concise; avoid fictional biography excess.",
    },
    {
        id: "history",
        name: "历史文化",
        promptLabel: "History & Culture",
        lens: "Write as a historical or cultural explainer that traces how a practice, idea, or object changed over time.",
        constraint: "Avoid date dumping; keep the timeline readable and tied to interpretation.",
    },
    {
        id: "society",
        name: "社会现象",
        promptLabel: "Social Observation",
        lens: "Write as a social observation piece that links everyday behavior to wider institutional or cultural patterns.",
        constraint: "Use concrete observations, not empty slogans or broad moralizing.",
    },
    {
        id: "business",
        name: "商业经济",
        promptLabel: "Business & Economy",
        lens: "Write as a business/economy explainer focused on incentives, tradeoffs, and practical consequences.",
        constraint: "Keep economic reasoning clear and grounded; avoid MBA buzzword overload.",
    },
    {
        id: "campus",
        name: "校园成长",
        promptLabel: "Campus & Growth",
        lens: "Write around learning, growth, study choices, or campus-to-work transitions in a reflective but concrete way.",
        constraint: "Keep it mature and realistic; avoid childish diary tone or hollow encouragement.",
    },
] as const;

export function normalizeAIGenerationMode(value: unknown): AIGenerationMode {
    return value === "longform" ? "longform" : "standard";
}

export function normalizeLongformStyleId(value: unknown): LongformStyleId | null {
    return LONGFORM_STYLE_OPTIONS.some((item) => item.id === value)
        ? (value as LongformStyleId)
        : null;
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
    longformStyleId?: LongformStyleId | null;
    lengthTierId?: LongformLengthTierId | null;
    injectedVocabulary?: string[] | null;
}): AIGenerationRequestBody {
    const normalizedTopic = params.topic?.trim() || undefined;
    const generationMode = normalizeAIGenerationMode(params.generationMode);
    const injectedVocabulary = Array.isArray(params.injectedVocabulary)
        ? params.injectedVocabulary.filter((item) => typeof item === "string" && item.trim().length > 0)
        : [];

    return {
        topic: normalizedTopic,
        topicSeed: params.topicSeed,
        difficulty: params.difficulty,
        generationMode,
        longformStyleId: generationMode === "longform" ? params.longformStyleId ?? undefined : undefined,
        lengthTierId: generationMode === "longform" ? params.lengthTierId ?? undefined : undefined,
        injectedVocabulary: injectedVocabulary.length > 0 ? injectedVocabulary : undefined,
    };
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
