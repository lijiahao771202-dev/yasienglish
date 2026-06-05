import { resolveAIGenerationArticleCompletedAt } from "@/lib/ai-reading-generation";

export const AI_GEN_TRACKER_WINDOW_DAYS = 30;

export interface AIGenLearningArticleRecord {
    link: string;
    pubDate: string;
    fetchedAt?: number;
    wordCount?: number;
    quizCompleted?: boolean;
    readingCompletedAt?: number;
}

export interface AIGenLearningReadEvent {
    url: string;
    timestamp: number;
    readAt: number;
    isAIGenerated?: boolean;
    isCatMode?: boolean;
}

export interface AIGenLearningDayPoint {
    dateKey: string;
    shortLabel: string;
    fullLabel: string;
    generatedCount: number;
    completedCount: number;
    generatedWords: number;
    totalActivity: number;
}

export interface AIGenLearningTrackerModel {
    hasHistory: boolean;
    totalGenerated: number;
    totalCompleted: number;
    wordsLastWindow: number;
    streakDays: number;
    windowLabel: string;
    chartData: AIGenLearningDayPoint[];
    mostActiveDayKey: string | null;
    mostActiveDayLabel: string | null;
    mostActiveDayActivity: number;
    lastCompletedAt: number | null;
    lastCompletedLabel: string | null;
}

function pad(value: number) {
    return String(value).padStart(2, "0");
}

function getLocalDayKey(timestamp: number) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) {
        return null;
    }

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function createDateFromDayKey(dayKey: string) {
    const [year, month, day] = dayKey.split("-").map((value) => Number(value));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
    }
    return new Date(year, month - 1, day);
}

function formatShortDayLabel(dayKey: string) {
    const date = createDateFromDayKey(dayKey);
    if (!date || !Number.isFinite(date.getTime())) {
        return "--";
    }
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatFullDayLabel(dayKey: string) {
    const date = createDateFromDayKey(dayKey);
    if (!date || !Number.isFinite(date.getTime())) {
        return dayKey;
    }
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDateTime(timestamp: number) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) {
        return null;
    }
    return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function buildWindowDayKeys(now: number, windowDays: number) {
    const today = new Date(now);
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (windowDays - 1));
    return Array.from({ length: windowDays }, (_, index) => {
        const current = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        return `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`;
    });
}

function buildMonthDayKeys(yearMonth: string) {
    const [yearStr, monthStr] = yearMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
        return [];
    }
    const lastDay = new Date(year, month, 0).getDate();
    return Array.from({ length: lastDay }, (_, index) => {
        const day = index + 1;
        return `${year}-${pad(month)}-${pad(day)}`;
    });
}

export function extractAvailableMonths(
    articles: AIGenLearningArticleRecord[],
    readEvents: AIGenLearningReadEvent[],
    now: number = Date.now()
): string[] {
    const months = new Set<string>();
    const today = new Date(now);
    months.add(`${today.getFullYear()}-${pad(today.getMonth() + 1)}`);

    for (const article of articles) {
        const articleTimestamp = resolveArticleTimestamp(article);
        const dayKey = getLocalDayKey(articleTimestamp);
        if (dayKey) {
            months.add(dayKey.substring(0, 7));
        }
    }

    for (const event of readEvents) {
        const readAt = Number.isFinite(event.readAt) ? event.readAt : event.timestamp;
        const dayKey = getLocalDayKey(readAt);
        if (dayKey) {
            months.add(dayKey.substring(0, 7));
        }
    }

    return Array.from(months).sort().reverse();
}

function shiftDayKey(dayKey: string, offsetDays: number) {
    const date = createDateFromDayKey(dayKey);
    if (!date) {
        return null;
    }
    const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays);
    return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

function resolveArticleTimestamp(article: AIGenLearningArticleRecord) {
    const parsedPubDate = Date.parse(article.pubDate || "");
    if (Number.isFinite(parsedPubDate)) {
        return parsedPubDate;
    }
    return article.fetchedAt ?? 0;
}

export interface AIGenLearningTrackerOptions {
    now?: number;
    windowDays?: number;
    targetMonth?: string;
}

export function buildAIGenLearningTrackerModel(
    articles: AIGenLearningArticleRecord[],
    readEvents: AIGenLearningReadEvent[],
    options?: AIGenLearningTrackerOptions,
): AIGenLearningTrackerModel {
    const now = options?.now ?? Date.now();
    const targetMonth = options?.targetMonth;

    let windowDayKeys: string[];
    let windowLabel = "";

    if (targetMonth) {
        windowDayKeys = buildMonthDayKeys(targetMonth);
        const [y, m] = targetMonth.split("-");
        windowLabel = `${y}年${Number(m)}月`;
    } else {
        const windowDays = options?.windowDays ?? AI_GEN_TRACKER_WINDOW_DAYS;
        windowDayKeys = buildWindowDayKeys(now, windowDays);
        windowLabel = `近 ${windowDays} 天`;
    }

    const windowDayKeySet = new Set(windowDayKeys);
    const chartPointMap = new Map<string, AIGenLearningDayPoint>(
        windowDayKeys.map((dayKey) => [
            dayKey,
            {
                dateKey: dayKey,
                shortLabel: formatShortDayLabel(dayKey),
                fullLabel: formatFullDayLabel(dayKey),
                generatedCount: 0,
                completedCount: 0,
                generatedWords: 0,
                totalActivity: 0,
            },
        ]),
    );

    const allActivityDayKeys = new Set<string>();
    const readAtByUrl = new Map<string, number>();
    let totalGenerated = 0;

    for (const readEvent of readEvents) {
        const readAt = Number.isFinite(readEvent.readAt) ? readEvent.readAt : readEvent.timestamp;
        if (!Number.isFinite(readAt) || readAt <= 0) {
            continue;
        }
        const existing = readAtByUrl.get(readEvent.url);
        if (existing === undefined || readAt > existing) {
            readAtByUrl.set(readEvent.url, readAt);
        }
    }

    for (const article of articles) {
        totalGenerated += 1;

        const articleTimestamp = resolveArticleTimestamp(article);
        const dayKey = getLocalDayKey(articleTimestamp);
        if (!dayKey) {
            continue;
        }

        allActivityDayKeys.add(dayKey);

        const completedAt = resolveAIGenerationArticleCompletedAt(article, readAtByUrl.get(article.link) ?? null);
        if (completedAt) {
            const completedDayKey = getLocalDayKey(completedAt);
            if (completedDayKey) {
                allActivityDayKeys.add(completedDayKey);
            }
        }

        if (!windowDayKeySet.has(dayKey)) {
            continue;
        }

        const point = chartPointMap.get(dayKey);
        if (!point) {
            continue;
        }

        point.generatedCount += 1;
        point.generatedWords += Math.max(0, article.wordCount ?? 0);
        point.totalActivity += 1;

        if (completedAt) {
            point.completedCount += 1;
            point.totalActivity += 1;
        }
    }

    let totalCompleted = 0;
    let lastCompletedAt: number | null = null;

    for (const article of articles) {
        const completedAt = resolveAIGenerationArticleCompletedAt(article, readAtByUrl.get(article.link) ?? null);
        if (!completedAt) {
            continue;
        }
        totalCompleted += 1;
        if (lastCompletedAt === null || completedAt > lastCompletedAt) {
            lastCompletedAt = completedAt;
        }
    }

    const chartData = windowDayKeys.map((dayKey) => {
        const point = chartPointMap.get(dayKey);
        if (!point) {
            return {
                dateKey: dayKey,
                shortLabel: formatShortDayLabel(dayKey),
                fullLabel: formatFullDayLabel(dayKey),
                generatedCount: 0,
                completedCount: 0,
                generatedWords: 0,
                totalActivity: 0,
            };
        }
        return point;
    });

    let streakDays = 0;
    let streakCursor = getLocalDayKey(now);
    while (streakCursor) {
        if (!allActivityDayKeys.has(streakCursor)) {
            break;
        }
        streakDays += 1;
        streakCursor = shiftDayKey(streakCursor, -1);
    }

    const mostActiveDay = [...chartData].reverse().reduce<AIGenLearningDayPoint | null>((best, current) => {
        if (current.totalActivity === 0) {
            return best;
        }
        if (!best || current.totalActivity > best.totalActivity) {
            return current;
        }
        return best;
    }, null);

    return {
        hasHistory: totalGenerated > 0,
        totalGenerated,
        totalCompleted,
        wordsLastWindow: chartData.reduce((sum, point) => sum + point.generatedWords, 0),
        streakDays,
        windowLabel,
        chartData,
        mostActiveDayKey: mostActiveDay?.dateKey ?? null,
        mostActiveDayLabel: mostActiveDay?.fullLabel ?? null,
        mostActiveDayActivity: mostActiveDay?.totalActivity ?? 0,
        lastCompletedAt,
        lastCompletedLabel: lastCompletedAt ? formatDateTime(lastCompletedAt) : null,
    };
}
