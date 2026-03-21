import type { EloHistoryItem, LocalUserProfile, ReadArticleItem, VocabItem, WritingEntry } from "@/lib/db";
import { DEFAULT_LEARNING_PREFERENCES, DEFAULT_PROFILE_USERNAME } from "@/lib/profile-settings";

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "long" });

export const HOME_WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export interface HomeCalendarDay {
    dateKey: string;
    label: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    isActive: boolean;
    isStreak: boolean;
}

export interface HomeGlowMetric {
    id: "streak" | "words" | "reads";
    label: string;
    value: string;
}

export interface HomeGoalSummary {
    dailyGoalMinutes: number;
    targetModeLabel: string;
    englishLevelLabel: string;
    dialRatio: number;
}

export interface HomeGrowthSummary {
    eloRating: number;
    maxElo: number;
    progressRatio: number;
}

export interface HomeLearningLane {
    id: "read" | "battle" | "vocab" | "writing";
    href: string;
    title: string;
    subtitle: string;
    valueLabel: string;
    progressRatio: number;
}

export interface HomeDashboardViewModel {
    displayName: string;
    headline: string;
    subline: string;
    monthLabel: string;
    glowMetrics: HomeGlowMetric[];
    calendarDays: HomeCalendarDay[];
    goal: HomeGoalSummary;
    growth: HomeGrowthSummary;
    learningLanes: HomeLearningLane[];
}

interface BuildHomeDashboardModelArgs {
    email?: string | null;
    profile?: LocalUserProfile | null;
    readCount?: number;
    vocabularyCount?: number;
    writingCount?: number;
    readArticles?: ReadArticleItem[];
    vocabulary?: VocabItem[];
    writingEntries?: WritingEntry[];
    eloHistory?: EloHistoryItem[];
    now?: Date;
}

function formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function daysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}

function buildDateFromTimestamp(timestamp?: number | null) {
    if (!timestamp || !Number.isFinite(timestamp)) return null;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
}

function collectActivityDateKeys({
    readArticles,
    vocabulary,
    writingEntries,
    eloHistory,
}: Pick<BuildHomeDashboardModelArgs, "readArticles" | "vocabulary" | "writingEntries" | "eloHistory">) {
    const keys = new Set<string>();

    for (const item of readArticles ?? []) {
        const date = buildDateFromTimestamp(item.read_at ?? item.timestamp);
        if (date) keys.add(formatDateKey(date));
    }

    for (const item of writingEntries ?? []) {
        const date = buildDateFromTimestamp(item.timestamp);
        if (date) keys.add(formatDateKey(date));
    }

    for (const item of eloHistory ?? []) {
        const date = buildDateFromTimestamp(item.timestamp);
        if (date) keys.add(formatDateKey(date));
    }

    for (const item of vocabulary ?? []) {
        const date = buildDateFromTimestamp(item.last_review || item.timestamp);
        if (date) keys.add(formatDateKey(date));
    }

    return keys;
}

function buildRecentStreakDateKeys(activityDateKeys: Set<string>) {
    const sortedDays = Array.from(activityDateKeys)
        .map((dateKey) => startOfDay(parseDateKey(dateKey)).getTime())
        .sort((left, right) => left - right);

    if (sortedDays.length < 2) {
        return new Set<string>();
    }

    const streakDays = [sortedDays[sortedDays.length - 1]];

    for (let index = sortedDays.length - 2; index >= 0; index -= 1) {
        const current = sortedDays[index];
        const next = streakDays[streakDays.length - 1];

        if (next - current === 24 * 60 * 60 * 1000) {
            streakDays.push(current);
            continue;
        }

        break;
    }

    if (streakDays.length < 2) {
        return new Set<string>();
    }

    return new Set(streakDays.map((day) => formatDateKey(new Date(day))));
}

export function buildHomeCalendar(activityDateKeys: Set<string>, now = new Date()): HomeCalendarDay[] {
    const today = startOfDay(now);
    const todayKey = formatDateKey(today);
    const streakDateKeys = buildRecentStreakDateKeys(activityDateKeys);
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInCurrentMonth = daysInMonth(now.getFullYear(), now.getMonth());
    const monthOffset = (firstOfMonth.getDay() + 6) % 7;
    const totalCells = monthOffset + daysInCurrentMonth > 35 ? 42 : 35;
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1 - monthOffset);

    return Array.from({ length: totalCells }, (_, index) => {
        const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index);
        const dateKey = formatDateKey(current);

        return {
            dateKey,
            label: current.getDate(),
            isCurrentMonth: current.getMonth() === now.getMonth(),
            isToday: dateKey === todayKey,
            isActive: activityDateKeys.has(dateKey),
            isStreak: streakDateKeys.has(dateKey),
        };
    });
}

function getTargetModeLabel(targetMode: string) {
    switch (targetMode) {
        case "battle":
            return "Battle flow";
        case "vocab":
            return "Vocabulary flow";
        default:
            return "Reading flow";
    }
}

function getEnglishLevelLabel(level: string) {
    return `${level} learner`;
}

function clampRatio(value: number) {
    return Math.min(1, Math.max(0, value));
}

export function buildHomeDashboardModel({
    email,
    profile,
    readCount,
    vocabularyCount,
    writingCount,
    readArticles = [],
    vocabulary = [],
    writingEntries = [],
    eloHistory = [],
    now = new Date(),
}: BuildHomeDashboardModelArgs): HomeDashboardViewModel {
    const displayName = profile?.username || email?.split("@")[0] || DEFAULT_PROFILE_USERNAME;
    const preferences = profile?.learning_preferences || DEFAULT_LEARNING_PREFERENCES;
    const activityDateKeys = collectActivityDateKeys({
        readArticles,
        vocabulary,
        writingEntries,
        eloHistory,
    });
    const resolvedReadCount = typeof readCount === "number" ? readCount : readArticles.length;
    const resolvedVocabularyCount = typeof vocabularyCount === "number" ? vocabularyCount : vocabulary.length;
    const resolvedWritingCount = typeof writingCount === "number" ? writingCount : writingEntries.length;
    const eloRating = profile?.elo_rating ?? 400;
    const maxElo = Math.max(profile?.max_elo ?? 400, eloRating, 400);
    const recentBattleCount = eloHistory.length;

    return {
        displayName,
        headline: `${displayName}`,
        subline: "今天轻练习。",
        monthLabel: MONTH_FORMATTER.format(now),
        glowMetrics: [
            { id: "streak", label: "day streak", value: String(profile?.streak_count ?? 0) },
            { id: "words", label: "words saved", value: String(resolvedVocabularyCount) },
            { id: "reads", label: "articles read", value: String(resolvedReadCount) },
        ],
        calendarDays: buildHomeCalendar(activityDateKeys, now),
        goal: {
            dailyGoalMinutes: preferences.daily_goal_minutes,
            targetModeLabel: getTargetModeLabel(preferences.target_mode),
            englishLevelLabel: getEnglishLevelLabel(preferences.english_level),
            dialRatio: clampRatio(preferences.daily_goal_minutes / 90),
        },
        growth: {
            eloRating,
            maxElo,
            progressRatio: clampRatio(eloRating / maxElo),
        },
        learningLanes: [
            {
                id: "read",
                href: "/read",
                title: "阅读",
                subtitle: "读一篇",
                valueLabel: `${resolvedReadCount} pieces`,
                progressRatio: clampRatio(resolvedReadCount / 12),
            },
            {
                id: "battle",
                href: "/battle",
                title: "对战",
                subtitle: "打一局",
                valueLabel: `Elo ${eloRating}`,
                progressRatio: clampRatio(eloRating / 1000),
            },
            {
                id: "vocab",
                href: "/vocab",
                title: "生词本",
                subtitle: "复习词",
                valueLabel: `${resolvedVocabularyCount} saved`,
                progressRatio: clampRatio(resolvedVocabularyCount / 120),
            },
            {
                id: "writing",
                href: "/dashboard",
                title: "写作",
                subtitle: "写一点",
                valueLabel: `${resolvedWritingCount} drafts`,
                progressRatio: clampRatio((resolvedWritingCount + recentBattleCount) / 16),
            },
        ],
    };
}
