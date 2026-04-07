"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { DailyPlanRecord, DailyPlanItem, SmartPlanTaskType } from "@/lib/db";
import { readDailyDrillProgress, setStoredDailyDrillGoal } from "@/lib/daily-drill-progress";

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

    const addSmartPlanItem = async (type: SmartPlanTaskType, target: number, text: string) => {
        if (!text.trim() || target <= 0) return;

        let defaultChunk: number | undefined = undefined;
        if (target >= 20 && type === 'rebuild') defaultChunk = 15;
        if (target >= 30 && type === 'vocab') defaultChunk = 20;

        const newItem: DailyPlanItem = {
            id: crypto.randomUUID(),
            text: text.trim(),
            completed: false,
            type,
            target,
            current: 0,
            chunk_size: defaultChunk
        };

        try {
            await db.transaction('rw', db.daily_plans, async () => {
                const existing = await db.daily_plans.get(targetDateKey);
                if (existing) {
                    const filteredItems = existing.items.filter(item => item.type !== type);
                    await db.daily_plans.put({
                        ...existing,
                        items: [...filteredItems, newItem],
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

            // Downward Binding: Update local settings for the specific modules if they have internal goals
            if (type === 'rebuild') {
                setStoredDailyDrillGoal(target);
            }

            await syncSmartGoals();
        } catch (err) {
            console.error("Failed to add smart plan item:", err);
        }
    };

    const batchAddSmartPlanItems = async (tasks: {type: SmartPlanTaskType, target: number, text: string}[]) => {
        try {
            await db.transaction('rw', db.daily_plans, async () => {
                const existing = await db.daily_plans.get(targetDateKey);
                let currentItems = existing ? [...existing.items] : [];

                for (const t of tasks) {
                    if (!t.text.trim() || t.target <= 0) continue;
                    
                    let defaultChunk: number | undefined = undefined;
                    if (t.target >= 20 && t.type === 'rebuild') defaultChunk = 15;
                    if (t.target >= 30 && t.type === 'vocab') defaultChunk = 20;

                    // Remove existing of same type to override
                    currentItems = currentItems.filter(item => item.type !== t.type);
                    
                    currentItems.push({
                        id: crypto.randomUUID(),
                        text: t.text.trim(),
                        completed: false,
                        type: t.type,
                        target: t.target,
                        current: 0,
                        chunk_size: defaultChunk
                    });
                }

                if (existing) {
                    await db.daily_plans.put({
                        ...existing,
                        items: currentItems,
                        updated_at: Date.now()
                    });
                } else {
                    await db.daily_plans.put({
                        date: targetDateKey,
                        items: currentItems,
                        updated_at: Date.now()
                    });
                }
            });
            await syncSmartGoals();
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent('yasi:sync_smart_goals'));
            }
        } catch (error) {
            console.error("Failed to batch add smart plans:", error);
        }
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

    const syncSmartGoals = async () => {
        try {
            await db.transaction('rw', db.daily_plans, db.cat_sessions, db.listening_cabin_sessions, db.articles, async () => {
                const existing = await db.daily_plans.get(targetDateKey);
                if (!existing) return;

                let modified = false;
                const newItems = [...existing.items];
                const startOfDay = new Date(date);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(startOfDay);
                endOfDay.setDate(endOfDay.getDate() + 1);

                for (let i = 0; i < newItems.length; i++) {
                    const item = { ...newItems[i] };
                    if (!item.type || item.type === 'custom') continue;

                    let actualCount = item.current || 0;

                    if (item.type === 'rebuild') {
                        const progress = readDailyDrillProgress(undefined, startOfDay);
                        actualCount = progress.completed;
                    } else if (item.type === 'cat') {
                        const catCount = await db.cat_sessions
                            .where('created_at')
                            .between(startOfDay.toISOString(), endOfDay.toISOString())
                            .and(session => session.status === 'completed')
                            .count();
                        actualCount = catCount;
                    } else if (item.type === 'reading') {
                        // Count AI-generated articles where the quiz was fully completed today
                        const readCount = await db.articles
                            .where('timestamp')
                            .between(startOfDay.getTime(), endOfDay.getTime())
                            .and(article => article.quizCompleted === true)
                            .count();
                        actualCount = readCount;
                    } else if (item.type === 'listening') {
                        const listenCount = await db.listening_cabin_sessions
                            .where('created_at')
                            .between(startOfDay.getTime(), endOfDay.getTime())
                            .and(session => (session.lastSentenceIndex ?? 0) > 0 || (session.lastPlayedAt ?? 0) > 0)
                            .count();
                        actualCount = listenCount;
                    }

                    if (actualCount !== item.current) {
                        item.current = actualCount;
                        modified = true;
                        if (item.target && actualCount >= item.target) {
                            item.completed = true;
                        }
                    }
                    newItems[i] = item;
                }

                if (modified) {
                    await db.daily_plans.put({
                        ...existing,
                        items: newItems,
                        updated_at: Date.now()
                    });
                }
            });
        } catch (err) {
            // Silently fail sync if DB locked or other transient issues occur
            console.error("Failed to sync smart goals:", err);
        }
    };

    const initializeDailyMilestones = async () => {
        try {
            await db.transaction('rw', [db.daily_plans, db.user_profile], async () => {
                const existing = await db.daily_plans.get(targetDateKey);
                if (existing) return;

                const profile = await db.user_profile.toCollection().first();
                if (!profile?.exam_date || !profile?.exam_type) return;

                const examDate = new Date(profile.exam_date);
                const today = new Date(targetDateKey);
                examDate.setHours(0, 0, 0, 0);
                today.setHours(0, 0, 0, 0);
                
                const remainingDays = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (remainingDays < 0) return;

                const examType = profile.exam_type;
                const EXAM_LABELS: Record<string, string> = { cet4: '四级', cet6: '六级', postgrad: '考研', ielts: '雅思' };
                const label = EXAM_LABELS[examType] || '备考';

                // Intensity scales up as exam approaches
                const intensity = remainingDays <= 7 ? 'cram' : remainingDays <= 30 ? 'high' : 'normal';
                const rebuildTarget = intensity === 'cram' ? 80 : intensity === 'high' ? 60 : 40;
                const readingTarget = intensity === 'cram' ? 3 : intensity === 'high' ? 2 : 1;
                const listeningTarget = intensity === 'cram' ? 3 : 2;

                const newItems: DailyPlanItem[] = [];

                // All exams get rebuild (core vocab/grammar drills)
                newItems.push({
                    id: crypto.randomUUID(), type: 'rebuild',
                    target: rebuildTarget, chunk_size: 15, current: 0,
                    text: `${label}核心重组`,
                    completed: false,
                });

                // Reading for all except pure listening-focused exams
                newItems.push({
                    id: crypto.randomUUID(), type: 'reading',
                    target: readingTarget, chunk_size: 1, current: 0,
                    text: `${label}阅读精练`,
                    completed: false,
                });

                // Listening for IELTS and CET
                if (examType !== 'postgrad') {
                    newItems.push({
                        id: crypto.randomUUID(), type: 'listening',
                        target: listeningTarget, chunk_size: 1, current: 0,
                        text: `${label}听力精听`,
                        completed: false,
                    });
                }

                // Postgrad gets extra rebuild since it's vocab-heavy
                if (examType === 'postgrad') {
                    newItems.push({
                        id: crypto.randomUUID(), type: 'rebuild',
                        target: 30, chunk_size: 10, current: 0,
                        text: `考研长难句攻坚`,
                        completed: false,
                    });
                }

                await db.daily_plans.put({
                    date: targetDateKey,
                    items: newItems,
                    updated_at: Date.now()
                });
            });
        } catch (error) {
            console.error("Scheduler init failed:", error);
        }
    };

    useEffect(() => {
        let mounted = true;
        const check = async () => {
            if (!mounted) return;
            await syncSmartGoals();
        };

        const init = async () => {
             if (!mounted) return;
             await initializeDailyMilestones();
             await check();
        };

        init();
        const intervalId = setInterval(check, 10000);
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                check();
            }
        };
        
        if (typeof window !== "undefined") {
            window.addEventListener('visibilitychange', onVisibilityChange);
            window.addEventListener('yasi:sync_smart_goals', check);
        }

        return () => {
            mounted = false;
            clearInterval(intervalId);
            if (typeof window !== "undefined") {
                window.removeEventListener('visibilitychange', onVisibilityChange);
                window.removeEventListener('yasi:sync_smart_goals', check);
            }
        };
    }, [targetDateKey]);

    return {
        planRecord,
        addPlanItem,
        addSmartPlanItem,
        batchAddSmartPlanItems,
        togglePlanItem,
        removePlanItem,
        targetDateKey,
    };
}
