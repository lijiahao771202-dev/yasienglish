"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpenText, BrainCircuit, Sparkles, Swords } from "lucide-react";

import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { HomeDashboardPanels } from "@/components/home/HomeDashboardPanels";
import { buildHomeDashboardModel } from "@/components/home/home-data";
import { GlassCard } from "@/components/ui/GlassCard";
import { BACKGROUND_CHANGED_EVENT, getBackgroundThemeSpec, getSavedBackgroundTheme } from "@/lib/background-preferences";
import { db } from "@/lib/db";

interface HomeConsoleProps {
    passwordUpdated?: boolean;
}

export function HomeConsole({ passwordUpdated = false }: HomeConsoleProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const sessionUser = useAuthSessionUser();
    const activityCutoff = useMemo(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }, []);
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const readCount = useLiveQuery(() => db.read_articles.count(), []);
    const vocabularyCount = useLiveQuery(() => db.vocabulary.count(), []);
    const writingCount = useLiveQuery(() => db.writing_history.count(), []);
    const recentReadArticles = useLiveQuery(
        () => db.read_articles.where("timestamp").aboveOrEqual(activityCutoff).toArray(),
        [activityCutoff],
    );
    const recentVocabulary = useLiveQuery(
        () => db.vocabulary.where("timestamp").aboveOrEqual(activityCutoff).toArray(),
        [activityCutoff],
    );
    const recentWritingEntries = useLiveQuery(
        () => db.writing_history.where("timestamp").aboveOrEqual(activityCutoff).toArray(),
        [activityCutoff],
    );
    const eloHistory = useLiveQuery(
        () => db.elo_history.orderBy("timestamp").reverse().limit(36).toArray(),
        [],
    );
    const resolvedPasswordUpdated = passwordUpdated || searchParams.get("password") === "updated";
    const fromBattle = searchParams.get("from") === "battle";
    const [routeTransitionTarget, setRouteTransitionTarget] = useState<"read" | "battle" | "vocab" | null>(null);
    const [, forceBackgroundRefresh] = useState(0);
    const backgroundTheme = getSavedBackgroundTheme(sessionUser?.id);
    const backgroundSpec = getBackgroundThemeSpec(backgroundTheme);

    useEffect(() => {
        const onBackgroundChange = (event: Event) => {
            const detail = (event as CustomEvent<{ themeId?: string }>).detail;
            if (typeof detail?.themeId === "string") {
                forceBackgroundRefresh((value) => value + 1);
                return;
            }
            forceBackgroundRefresh((value) => value + 1);
        };

        window.addEventListener(BACKGROUND_CHANGED_EVENT, onBackgroundChange);
        return () => window.removeEventListener(BACKGROUND_CHANGED_EVENT, onBackgroundChange);
    }, [sessionUser?.id]);

    const model = useMemo(() => buildHomeDashboardModel({
        email: sessionUser?.email,
        profile: profile ?? null,
        readCount: readCount ?? 0,
        vocabularyCount: vocabularyCount ?? 0,
        writingCount: writingCount ?? 0,
        readArticles: recentReadArticles ?? [],
        vocabulary: recentVocabulary ?? [],
        writingEntries: recentWritingEntries ?? [],
        eloHistory: eloHistory ?? [],
    }), [
        eloHistory,
        profile,
        readCount,
        recentReadArticles,
        recentVocabulary,
        recentWritingEntries,
        sessionUser?.email,
        vocabularyCount,
        writingCount,
    ]);

    const handleNavigateFromHome = (target: "read" | "battle" | "vocab") => {
        if (routeTransitionTarget) return;
        setRouteTransitionTarget(target);
        window.setTimeout(() => {
            if (target === "read") {
                router.push("/read?from=home");
                return;
            }
            if (target === "battle") {
                router.push("/battle?from=home");
                return;
            }
            router.push("/vocab?from=home");
        }, 560);
    };

    return (
        <main className="font-welcome-ui relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <AnimatePresence>
                {routeTransitionTarget && (
                    <motion.div
                        className="pointer-events-none fixed inset-0 z-[70]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <motion.div
                            className={`absolute inset-0 backdrop-blur-[8px] ${backgroundSpec.transitionFilm}`}
                            initial={{ scale: 1.08, filter: "blur(22px)" }}
                            animate={{ scale: 1, filter: "blur(0px)" }}
                            transition={{ duration: 0.76, ease: [0.18, 1, 0.3, 1] }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
            <div className={`pointer-events-none absolute inset-0 ${backgroundSpec.baseLayer}`} />
            <div className={`pointer-events-none absolute inset-0 ${backgroundSpec.glassLayer}`} />
            <div className={`pointer-events-none absolute inset-0 ${backgroundSpec.glowLayer}`} />
            <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-[34%] ${backgroundSpec.bottomLayer}`} />
            <div className={`pointer-events-none absolute inset-0 ${backgroundSpec.vignetteLayer}`} />

            <motion.div
                className="mx-auto flex max-w-[1600px] flex-col gap-4"
                animate={routeTransitionTarget
                    ? { opacity: 0, y: 16, scale: 0.985, filter: "blur(8px)" }
                    : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
            >
                <motion.div
                    initial={fromBattle ? { opacity: 0, y: 28, scale: 0.98, filter: "blur(12px)" } : { opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    transition={{ duration: fromBattle ? 0.92 : 0.72, ease: [0.22, 1, 0.36, 1] }}
                >
                    <GlassCard
                        breathe
                        className="liquid-glass-hero liquid-glass-apple-radius p-5 sm:p-6 lg:p-8"
                    >
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                        <div className="space-y-4">
                            <p className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/22 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#6f294f]">
                                <Sparkles className="h-3.5 w-3.5" />
                                WELCOME
                            </p>
                            <h1 className="font-welcome-display text-[2.1rem] leading-[0.95] tracking-[-0.03em] text-[#2c1321] sm:text-[2.8rem]">
                                欢迎回来
                            </h1>
                            <p className="max-w-2xl text-sm leading-6 text-[#754f62] sm:text-[15px]">
                                今天练一点，就很好。
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <button
                                type="button"
                                onClick={() => handleNavigateFromHome("read")}
                                className="liquid-glass-hover liquid-glass-tap flex min-w-[172px] items-center justify-between gap-3 rounded-[1.3rem] border border-[#f7b9d8] bg-[linear-gradient(145deg,rgba(255,233,244,0.82),rgba(255,211,230,0.64))] px-4 py-3 text-[#8d2e5e] shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]"
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    <BookOpenText className="h-4 w-4" />
                                    阅读
                                </span>
                                <ArrowRight className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleNavigateFromHome("battle")}
                                className="liquid-glass-hover liquid-glass-tap flex min-w-[172px] items-center justify-between gap-3 rounded-[1.3rem] border border-[#f59cc6] bg-[linear-gradient(145deg,rgba(255,219,237,0.84),rgba(255,190,221,0.66))] px-4 py-3 text-[#892656] shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]"
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    <Swords className="h-4 w-4" />
                                    对战
                                </span>
                                <ArrowRight className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleNavigateFromHome("vocab")}
                                className="liquid-glass-hover liquid-glass-tap flex min-w-[172px] items-center justify-between gap-3 rounded-[1.3rem] border border-[#f6c0da] bg-[linear-gradient(145deg,rgba(255,238,247,0.84),rgba(255,218,234,0.66))] px-4 py-3 text-[#9c3468] shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]"
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    <BrainCircuit className="h-4 w-4" />
                                    生词本
                                </span>
                                <ArrowRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    </GlassCard>
                </motion.div>

                <motion.div
                    initial={fromBattle ? { opacity: 0, y: 34, scale: 0.985, filter: "blur(14px)" } : { opacity: 0, y: 22 }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    transition={{ delay: fromBattle ? 0.1 : 0.08, duration: fromBattle ? 1.02 : 0.78, ease: [0.22, 1, 0.36, 1] }}
                >
                    <GlassCard className="liquid-glass-no-frame liquid-glass-apple-radius p-0 bg-transparent">
                        <HomeDashboardPanels
                            model={model}
                            eloHistory={eloHistory ?? []}
                            accountEmail={sessionUser?.email}
                            passwordUpdated={resolvedPasswordUpdated}
                        />
                    </GlassCard>
                </motion.div>
            </motion.div>
        </main>
    );
}
