export const DAILY_DRILL_PROGRESS_STORAGE_KEY = "yasi_daily_drill_progress";

export interface DailyDrillProgress {
    dateKey: string;
    completed: number;
    goal: number | null;
}

interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const MIN_GOAL = 1;
const MAX_GOAL = 999;

const pad2 = (value: number): string => value.toString().padStart(2, "0");

const sanitizeCompleted = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
};

const sanitizeGoal = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const normalized = Math.round(value);
    if (normalized < MIN_GOAL) return null;
    return Math.min(MAX_GOAL, normalized);
};

export const getDailyDrillDateKey = (date: Date = new Date()): string => {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const createDailyDrillProgress = (date: Date = new Date()): DailyDrillProgress => ({
    dateKey: getDailyDrillDateKey(date),
    completed: 0,
    goal: null,
});

export const normalizeDailyDrillProgress = (
    raw: unknown,
    now: Date = new Date(),
): DailyDrillProgress => {
    const fallback = createDailyDrillProgress(now);
    if (!raw || typeof raw !== "object") return fallback;

    const candidate = raw as Partial<DailyDrillProgress>;
    if (candidate.dateKey !== fallback.dateKey) {
        return fallback;
    }

    return {
        dateKey: fallback.dateKey,
        completed: sanitizeCompleted(candidate.completed),
        goal: sanitizeGoal(candidate.goal),
    };
};

export const incrementDailyDrillProgress = (
    current: DailyDrillProgress | unknown,
    now: Date = new Date(),
): DailyDrillProgress => {
    const normalized = normalizeDailyDrillProgress(current, now);
    return {
        ...normalized,
        completed: normalized.completed + 1,
    };
};

export const setDailyDrillProgressGoal = (
    current: DailyDrillProgress | unknown,
    goal: number | null,
    now: Date = new Date(),
): DailyDrillProgress => {
    const normalized = normalizeDailyDrillProgress(current, now);
    return {
        ...normalized,
        goal: goal === null ? null : sanitizeGoal(goal),
    };
};

const resolveStorage = (storage?: StorageLike): StorageLike | null => {
    if (storage) return storage;
    if (typeof window === "undefined") return null;
    return window.localStorage;
};

export const readDailyDrillProgress = (
    storage?: StorageLike,
    now: Date = new Date(),
): DailyDrillProgress => {
    const targetStorage = resolveStorage(storage);
    if (!targetStorage) return createDailyDrillProgress(now);

    try {
        const raw = targetStorage.getItem(DAILY_DRILL_PROGRESS_STORAGE_KEY);
        if (!raw) return createDailyDrillProgress(now);
        return normalizeDailyDrillProgress(JSON.parse(raw), now);
    } catch {
        return createDailyDrillProgress(now);
    }
};

export const writeDailyDrillProgress = (
    progress: DailyDrillProgress,
    storage?: StorageLike,
): DailyDrillProgress => {
    const targetStorage = resolveStorage(storage);
    if (!targetStorage) return progress;

    targetStorage.setItem(DAILY_DRILL_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    return progress;
};

export const syncDailyDrillProgress = (
    storage?: StorageLike,
    now: Date = new Date(),
): DailyDrillProgress => {
    const next = readDailyDrillProgress(storage, now);
    return writeDailyDrillProgress(next, storage);
};

export const incrementStoredDailyDrillProgress = (
    storage?: StorageLike,
    now: Date = new Date(),
): DailyDrillProgress => {
    const next = incrementDailyDrillProgress(readDailyDrillProgress(storage, now), now);
    return writeDailyDrillProgress(next, storage);
};

export const setStoredDailyDrillGoal = (
    goal: number | null,
    storage?: StorageLike,
    now: Date = new Date(),
): DailyDrillProgress => {
    const next = setDailyDrillProgressGoal(readDailyDrillProgress(storage, now), goal, now);
    return writeDailyDrillProgress(next, storage);
};
