"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { DailyPlanRecord, DailyPlanItem } from "@/lib/db";

function getDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function useDailyPlans(date: Date) {
    const targetDateKey = getDateKey(date);

    const planRecord = useLiveQuery(
        () => db.daily_plans.get(targetDateKey),
        [targetDateKey]
    );

    const addPlanItem = async (text: string) => {
        if (!text.trim()) return;

        const newItem: DailyPlanItem = {
            id: crypto.randomUUID(),
            text: text.trim(),
            completed: false,
        };

        await db.transaction('rw', db.daily_plans, async () => {
            const existing = await db.daily_plans.get(targetDateKey);
            if (existing) {
                await db.daily_plans.put({
                    ...existing,
                    items: [...existing.items, newItem],
                    updated_at: Date.now()
                });
            } else {
                await db.daily_plans.put({
                    date: targetDateKey,
                    items: [newItem],
                    updated_at: Date.now()
                });
            }
        });
    };

    const togglePlanItem = async (id: string) => {
        await db.transaction('rw', db.daily_plans, async () => {
            const existing = await db.daily_plans.get(targetDateKey);
            if (!existing) return;

            const newItems = existing.items.map(item =>
                item.id === id ? { ...item, completed: !item.completed } : item
            );

            await db.daily_plans.put({
                ...existing,
                items: newItems,
                updated_at: Date.now()
            });
        });
    };

    const removePlanItem = async (id: string) => {
        await db.transaction('rw', db.daily_plans, async () => {
            const existing = await db.daily_plans.get(targetDateKey);
            if (!existing) return;

            const newItems = existing.items.filter(item => item.id !== id);

            if (newItems.length === 0) {
                await db.daily_plans.delete(targetDateKey);
            } else {
                await db.daily_plans.put({
                    ...existing,
                    items: newItems,
                    updated_at: Date.now()
                });
            }
        });
    };

    return {
        planRecord,
        addPlanItem,
        togglePlanItem,
        removePlanItem,
        targetDateKey,
    };
}
