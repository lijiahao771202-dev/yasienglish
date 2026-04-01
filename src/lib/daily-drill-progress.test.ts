import { describe, expect, it } from "vitest";

import {
    createDailyDrillProgress,
    getDailyDrillDateKey,
    incrementDailyDrillProgress,
    incrementStoredDailyDrillProgress,
    normalizeDailyDrillProgress,
    setDailyDrillProgressGoal,
    setStoredDailyDrillGoal,
    syncDailyDrillProgress,
    type DailyDrillProgress,
} from "./daily-drill-progress";

const NOW = new Date("2026-03-30T11:22:33+08:00");

class MemoryStorage {
    private store = new Map<string, string>();

    getItem(key: string): string | null {
        return this.store.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }
}

describe("daily drill progress", () => {
    it("creates a local date key", () => {
        expect(getDailyDrillDateKey(NOW)).toBe("2026-03-30");
        expect(createDailyDrillProgress(NOW)).toEqual<DailyDrillProgress>({
            dateKey: "2026-03-30",
            completed: 0,
            goal: null,
        });
    });

    it("resets stale day data", () => {
        expect(
            normalizeDailyDrillProgress(
                {
                    dateKey: "2026-03-29",
                    completed: 18,
                    goal: 30,
                },
                NOW,
            ),
        ).toEqual({
            dateKey: "2026-03-30",
            completed: 0,
            goal: null,
        });
    });

    it("increments completed count on the active day", () => {
        expect(
            incrementDailyDrillProgress(
                {
                    dateKey: "2026-03-30",
                    completed: 7,
                    goal: 20,
                },
                NOW,
            ),
        ).toEqual({
            dateKey: "2026-03-30",
            completed: 8,
            goal: 20,
        });
    });

    it("sanitizes invalid counts and goals", () => {
        expect(
            normalizeDailyDrillProgress(
                {
                    dateKey: "2026-03-30",
                    completed: -5,
                    goal: 0,
                },
                NOW,
            ),
        ).toEqual({
            dateKey: "2026-03-30",
            completed: 0,
            goal: null,
        });

        expect(
            setDailyDrillProgressGoal(
                {
                    dateKey: "2026-03-30",
                    completed: 3,
                    goal: 10,
                },
                1200,
                NOW,
            ),
        ).toEqual({
            dateKey: "2026-03-30",
            completed: 3,
            goal: 999,
        });
    });

    it("persists sync, increment, and goal changes in storage", () => {
        const storage = new MemoryStorage();

        expect(syncDailyDrillProgress(storage, NOW)).toEqual({
            dateKey: "2026-03-30",
            completed: 0,
            goal: null,
        });

        expect(setStoredDailyDrillGoal(25, storage, NOW)).toEqual({
            dateKey: "2026-03-30",
            completed: 0,
            goal: 25,
        });

        expect(incrementStoredDailyDrillProgress(storage, NOW)).toEqual({
            dateKey: "2026-03-30",
            completed: 1,
            goal: 25,
        });
    });
});
