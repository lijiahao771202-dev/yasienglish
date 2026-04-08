"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
    inferSmartPlanExamTrack,
    normalizeSmartPlanExamTrack,
    normalizeSmartPlanTaskType,
    type DailyPlanItem,
    type SmartPlanExamTrack,
    type SmartPlanTaskType,
} from "@/lib/db";
import { readDailyDrillProgress, setStoredDailyDrillGoal } from "@/lib/daily-drill-progress";
import { saveProfilePatch } from "@/lib/user-repository";

const MAX_DAILY_PLAN_SNAPSHOT_COUNT = 90;

function getDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function resolveSupportedExamTrack(examType?: string | null): SmartPlanExamTrack | undefined {
    return normalizeSmartPlanExamTrack(examType);
}

function normalizeDailyPlanItemShape(item: DailyPlanItem, fallbackExamTrack?: SmartPlanExamTrack): DailyPlanItem {
    const normalizedType = normalizeSmartPlanTaskType(item.type);
    const examTrack = normalizeSmartPlanExamTrack(item.exam_track)
        ?? inferSmartPlanExamTrack(item.text)
        ?? ((normalizedType === "reading_ai" || normalizedType === "cat") ? fallbackExamTrack : undefined);

    let defaultChunk = item.chunk_size;
    if (defaultChunk === undefined && normalizedType) {
        defaultChunk = normalizedType === 'rebuild' ? 15 : 1;
    }

    return {
        ...item,
        type: normalizedType,
        exam_track: examTrack,
        chunk_size: defaultChunk,
    };
}

export function useDailyPlans(date: Date) {
    const targetDateKey = getDateKey(date);
    const profile = useLiveQuery(() => db.user_profile.toCollection().first(), []);
    const profileExamTrack = resolveSupportedExamTrack(profile?.exam_type);

    const planRecord = useLiveQuery(
        () => db.daily_plans.get(targetDateKey),
        [targetDateKey]
    );

    const persistDailyPlanSnapshots = async () => {
        const currentProfile = await db.user_profile.toCollection().first();
        if (!currentProfile?.id) {
            return;
        }

        const snapshots = await db.daily_plans
            .orderBy("updated_at")
            .reverse()
            .limit(MAX_DAILY_PLAN_SNAPSHOT_COUNT)
            .toArray();

        await saveProfilePatch({
            daily_plan_snapshots: snapshots,
        });
    };

    const addPlanItem = async (text: string) => {
        if (!text.trim()) return;

        const newItem: DailyPlanItem = {
            id: crypto.randomUUID(),
            text: text.trim(),
            completed: false,
            source: "manual",
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
        await persistDailyPlanSnapshots();
    };

    const addSmartPlanItem = async (
        type: SmartPlanTaskType,
        target: number,
        text: string,
        examTrack?: SmartPlanExamTrack
    ) => {
        if (!text.trim() || target <= 0) return;

        let defaultChunk: number | undefined = type === 'rebuild' ? 15 : 1;
        const normalizedType = normalizeSmartPlanTaskType(type);
        if (!normalizedType) return;

        const newItem: DailyPlanItem = {
            id: crypto.randomUUID(),
            text: text.trim(),
            completed: false,
            type: normalizedType,
            exam_track: normalizeSmartPlanExamTrack(examTrack)
                ?? ((normalizedType === 'reading_ai' || normalizedType === 'cat') ? profileExamTrack : undefined),
            target,
            current: 0,
            chunk_size: defaultChunk,
            source: "manual",
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
            await persistDailyPlanSnapshots();
        } catch (err) {
            console.error("Failed to add smart plan item:", err);
        }
    };

    const batchAddSmartPlanItems = async (
        tasks: {type: SmartPlanTaskType, target: number, text: string, exam_track?: SmartPlanExamTrack}[]
    ) => {
        try {
            await db.transaction('rw', db.daily_plans, async () => {
                const existing = await db.daily_plans.get(targetDateKey);
                let currentItems = existing ? [...existing.items] : [];

                for (const t of tasks) {
                    if (!t.text.trim() || t.target <= 0) continue;
                    
                    let defaultChunk: number | undefined = t.type === 'rebuild' ? 15 : 1;
                    const normalizedType = normalizeSmartPlanTaskType(t.type);
                    if (!normalizedType) continue;
                    const normalizedExamTrack = normalizeSmartPlanExamTrack(t.exam_track)
                        ?? ((normalizedType === 'reading_ai' || normalizedType === 'cat') ? profileExamTrack : undefined);

                    // Remove existing of same type to override
                    currentItems = currentItems.filter(item => normalizeSmartPlanTaskType(item.type) !== normalizedType);
                    
                    currentItems.push({
                        id: crypto.randomUUID(),
                        text: t.text.trim(),
                        completed: false,
                        type: normalizedType,
                        exam_track: normalizedExamTrack,
                        target: t.target,
                        current: 0,
                        chunk_size: defaultChunk,
                        source: "ai",
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
            await persistDailyPlanSnapshots();
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
        await persistDailyPlanSnapshots();
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
        await persistDailyPlanSnapshots();
    };

    const syncSmartGoals = async () => {
        try {
            let didModify = false;
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
                    const item = normalizeDailyPlanItemShape({ ...newItems[i] }, profileExamTrack);
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
                    } else if (item.type === 'reading_ai') {
                        // Count AI-generated articles where the quiz was fully completed today
                        const readCount = await db.articles
                            .where('timestamp')
                            .between(startOfDay.getTime(), endOfDay.getTime())
                            .and(article =>
                                article.quizCompleted === true
                                && article.isCatMode !== true
                                && (!item.exam_track || article.difficulty === item.exam_track)
                            )
                            .count();
                        actualCount = readCount;
                    } else if (item.type === 'listening_cabin') {
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
                    didModify = true;
                }
            });
            if (didModify) {
                await persistDailyPlanSnapshots();
            }
        } catch (err) {
            // Silently fail sync if DB locked or other transient issues occur
            console.error("Failed to sync smart goals:", err);
        }
    };

    const initializeDailyMilestones = async () => {
        try {
            let didInitialize = false;
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
                const examTrack = resolveSupportedExamTrack(examType);

                // Intensity scales up as exam approaches
                const intensity = remainingDays <= 7 ? 'cram' : remainingDays <= 30 ? 'high' : 'normal';
                const rebuildTarget = intensity === 'cram' ? 80 : intensity === 'high' ? 60 : 40;
                const readingTarget = intensity === 'cram' ? 3 : intensity === 'high' ? 2 : 1;
                const listeningTarget = intensity === 'cram' ? 3 : 2;
                const catTarget = intensity === 'cram' ? 2 : 1;

                const newItems: DailyPlanItem[] = [];

                newItems.push({
                    id: crypto.randomUUID(), type: 'rebuild',
                    target: rebuildTarget, chunk_size: 15, current: 0,
                    text: `${label}核心重组`,
                    completed: false,
                    source: "system",
                });

                if (examTrack) {
                    newItems.push({
                        id: crypto.randomUUID(), type: 'reading_ai',
                        exam_track: examTrack,
                        target: readingTarget, chunk_size: 1, current: 0,
                        text: `${label}AI阅读`,
                        completed: false,
                        source: "system",
                    });
                }

                if (examType !== 'postgrad') {
                    newItems.push({
                        id: crypto.randomUUID(), type: 'listening_cabin',
                        target: listeningTarget, chunk_size: 1, current: 0,
                        text: `${label}听力仓`,
                        completed: false,
                        source: "system",
                    });
                }

                if (examTrack && remainingDays <= 30) {
                    newItems.push({
                        id: crypto.randomUUID(), type: 'cat',
                        exam_track: examTrack,
                        target: catTarget, chunk_size: 1, current: 0,
                        text: `${label}CAT成长`,
                        completed: false,
                        source: "system",
                    });
                }

                await db.daily_plans.put({
                    date: targetDateKey,
                    items: newItems,
                    updated_at: Date.now()
                });
                didInitialize = true;
            });
            if (didInitialize) {
                await persistDailyPlanSnapshots();
            }
        } catch (error) {
            console.error("Scheduler init failed:", error);
        }
    };

    // These helpers intentionally close over the current day key/profile and are recreated with the hook.
    // Re-subscribing on every render would create more noise than value here.
    useEffect(() => {
        let mounted = true;
        const refresh = async () => {
            if (!mounted) return;
            await initializeDailyMilestones();
            await syncSmartGoals();
        };

        const init = async () => {
             if (!mounted) return;
             await refresh();
        };

        init();
        const intervalId = setInterval(refresh, 10000);
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refresh();
            }
        };
        
        if (typeof window !== "undefined") {
            window.addEventListener('visibilitychange', onVisibilityChange);
            window.addEventListener('yasi:sync_smart_goals', refresh);
        }

        return () => {
            mounted = false;
            clearInterval(intervalId);
            if (typeof window !== "undefined") {
                window.removeEventListener('visibilitychange', onVisibilityChange);
                window.removeEventListener('yasi:sync_smart_goals', refresh);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.exam_date, profile?.exam_type, targetDateKey]);

    useEffect(() => {
        if (!planRecord) {
            return;
        }

        const normalizedItems = planRecord.items.map((item) => normalizeDailyPlanItemShape(item, profileExamTrack));
        const didChange = JSON.stringify(normalizedItems) !== JSON.stringify(planRecord.items);

        if (!didChange) {
            return;
        }

        void (async () => {
            await db.daily_plans.put({
                ...planRecord,
                items: normalizedItems,
                updated_at: Date.now(),
            });
            await persistDailyPlanSnapshots();
        })();
    }, [planRecord, profileExamTrack]);

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
