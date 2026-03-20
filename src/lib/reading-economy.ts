export const INSUFFICIENT_READING_COINS = "INSUFFICIENT_READING_COINS" as const;

export type ReadingEconomyAction =
    | "translate"
    | "grammar_basic"
    | "grammar_deep"
    | "ask_ai"
    | "analyze_phrase"
    | "word_lookup"
    | "word_deep_analyze"
    | "daily_login"
    | "read_complete"
    | "quiz_complete"
    | "reading_streak";

export const READING_COIN_COSTS: Record<
    Extract<ReadingEconomyAction, "translate" | "grammar_basic" | "grammar_deep" | "ask_ai" | "analyze_phrase" | "word_lookup" | "word_deep_analyze">,
    number
> = {
    translate: 1,
    grammar_basic: 2,
    grammar_deep: 3,
    ask_ai: 2,
    analyze_phrase: 2,
    word_lookup: 1,
    word_deep_analyze: 2,
};

export const READING_COIN_REWARDS: Record<
    Extract<ReadingEconomyAction, "daily_login" | "read_complete" | "quiz_complete" | "reading_streak">,
    number
> = {
    daily_login: 8,
    read_complete: 4,
    quiz_complete: 6,
    reading_streak: 3,
};

export const READING_COIN_DAILY_GAIN_CAP = 32;

export function getReadingCoinCost(action?: ReadingEconomyAction | null): number {
    if (!action) return 0;
    return READING_COIN_COSTS[action as keyof typeof READING_COIN_COSTS] ?? 0;
}

export function getReadingCoinReward(action?: ReadingEconomyAction | null): number {
    if (!action) return 0;
    return READING_COIN_REWARDS[action as keyof typeof READING_COIN_REWARDS] ?? 0;
}

export function buildWordLookupDedupeKey(params: {
    userId?: string | null;
    articleUrl?: string | null;
    word: string;
}) {
    const article = (params.articleUrl || "unknown_article").trim().toLowerCase();
    const word = params.word.trim().toLowerCase();
    return `word_lookup:${params.userId || "anon"}:${article}:${word}`;
}

export function buildReadCompleteDedupeKey(params: {
    userId?: string | null;
    articleUrl?: string | null;
}) {
    return `read_complete:${params.userId || "anon"}:${(params.articleUrl || "unknown_article").trim().toLowerCase()}`;
}

export function buildQuizCompleteDedupeKey(params: {
    userId?: string | null;
    articleUrl?: string | null;
}) {
    return `quiz_complete:${params.userId || "anon"}:${(params.articleUrl || "unknown_article").trim().toLowerCase()}`;
}

export function buildDailyLoginDedupeKey(params: {
    userId?: string | null;
    dateKey: string;
}) {
    return `daily_login:${params.userId || "anon"}:${params.dateKey}`;
}
