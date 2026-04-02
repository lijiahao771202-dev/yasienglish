"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpenText, BrainCircuit, Sparkles, Swords } from "lucide-react";

import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { HomeDashboardPanels_v2 } from "@/components/home/HomeDashboardPanels_v2";
import { buildHomeDashboardModel } from "@/components/home/home-data";
import { db } from "@/lib/db";

interface HomeConsoleProps {
    passwordUpdated?: boolean;
}

export function HomeConsole_v2({ passwordUpdated = false }: HomeConsoleProps) {
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

    const springTransition = { type: "spring" as const, stiffness: 400, damping: 25 };

    return (
        <main className="font-welcome-ui relative h-screen w-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8 flex flex-col items-center justify-center bg-[#fefce8]">
            {/* Global cute background (no liquid glass) */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#fffbeb,#fefce8)]" />
            
            <AnimatePresence>
                {routeTransitionTarget && (
                    <motion.div
                        className="pointer-events-none fixed inset-0 z-[70] bg-[#fefce8]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                    />
                )}
            </AnimatePresence>

            <motion.div
                className="relative z-10 w-full max-w-[1200px] flex flex-col gap-5 h-full max-h-[800px]"
                animate={routeTransitionTarget
                    ? { opacity: 0, y: 16, scale: 0.985, filter: "blur(8px)" }
                    : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
            >
                {/* Hero / Entry Buttons Row */}
                <motion.div
                    initial={fromBattle ? { opacity: 0, y: 28, scale: 0.98, filter: "blur(12px)" } : { opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    transition={{ duration: fromBattle ? 0.92 : 0.72, ease: [0.22, 1, 0.36, 1] }}
                    className="flex-shrink-0"
                >
                    <div className="bg-white rounded-[2.5rem] p-6 lg:p-8 flex flex-col justify-between border-4 border-[#e5e7eb] shadow-[0_12px_0_0_#e5e7eb]">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-4">
                                <p className="inline-flex items-center gap-2 rounded-full border-2 border-[#1f2937] bg-white px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-[#1f2937] shadow-[0_4px_0_0_#1f2937]">
                                    <Sparkles className="h-4 w-4" />
                                    WELCOME
                                </p>
                                <h1 className="font-welcome-display text-[2.8rem] leading-[1] tracking-tight text-[#111827] sm:text-[3.5rem]">
                                    欢迎回来
                                </h1>
                            </div>
                            <div className="flex flex-wrap md:flex-nowrap gap-4">
                                <motion.button
                                    whileHover={{ scale: 1.04, y: -2 }}
                                    whileTap={{ scale: 0.96 }}
                                    transition={springTransition}
                                    type="button"
                                    onClick={() => handleNavigateFromHome("read")}
                                    className="flex w-full md:w-auto min-w-[150px] items-center justify-between gap-3 rounded-[2rem] bg-white border-4 border-[#3b82f6] px-6 py-4 shadow-[0_8px_0_0_#3b82f6] text-[#1f2937] group active:shadow-[0_0px_0_0_#3b82f6] active:translate-y-2 transition-all duration-75"
                                >
                                    <span className="flex items-center gap-2 text-[16px] font-black">
                                        <BookOpenText className="h-6 w-6 text-[#3b82f6]" />阅读
                                    </span>
                                    <ArrowRight className="h-5 w-5 text-[#9ca3af] group-hover:translate-x-1 transition-transform" />
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.04, y: -2 }}
                                    whileTap={{ scale: 0.96 }}
                                    transition={springTransition}
                                    type="button"
                                    onClick={() => handleNavigateFromHome("battle")}
                                    className="flex w-full md:w-auto min-w-[150px] items-center justify-between gap-3 rounded-[2rem] bg-white border-4 border-[#f59e0b] px-6 py-4 shadow-[0_8px_0_0_#f59e0b] text-[#1f2937] group active:shadow-[0_0px_0_0_#f59e0b] active:translate-y-2 transition-all duration-75"
                                >
                                    <span className="flex items-center gap-2 text-[16px] font-black">
                                        <Swords className="h-6 w-6 text-[#f59e0b]" />对战
                                    </span>
                                    <ArrowRight className="h-5 w-5 text-[#9ca3af] group-hover:translate-x-1 transition-transform" />
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.04, y: -2 }}
                                    whileTap={{ scale: 0.96 }}
                                    transition={springTransition}
                                    type="button"
                                    onClick={() => handleNavigateFromHome("vocab")}
                                    className="flex w-full md:w-auto min-w-[150px] items-center justify-between gap-3 rounded-[2rem] bg-white border-4 border-[#8b5cf6] px-6 py-4 shadow-[0_8px_0_0_#8b5cf6] text-[#1f2937] group active:shadow-[0_0px_0_0_#8b5cf6] active:translate-y-2 transition-all duration-75"
                                >
                                    <span className="flex items-center gap-2 text-[16px] font-black">
                                        <BrainCircuit className="h-6 w-6 text-[#8b5cf6]" />生词本
                                    </span>
                                    <ArrowRight className="h-5 w-5 text-[#9ca3af] group-hover:translate-x-1 transition-transform" />
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Dashboard Panels */}
                <motion.div
                    className="flex-1 min-h-0"
                    initial={fromBattle ? { opacity: 0, y: 34, scale: 0.985, filter: "blur(14px)" } : { opacity: 0, y: 22 }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    transition={{ delay: fromBattle ? 0.1 : 0.08, duration: fromBattle ? 1.02 : 0.78, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="h-full w-full rounded-[2.75rem] p-5 lg:p-7 bg-white border-4 border-[#e5e7eb] shadow-[0_12px_0_0_#e5e7eb] overflow-y-auto overflow-x-hidden __hide-scrollbars">
                        <HomeDashboardPanels_v2
                            model={model}
                            eloHistory={eloHistory ?? []}
                            accountEmail={sessionUser?.email}
                            passwordUpdated={resolvedPasswordUpdated}
                        />
                    </div>
                </motion.div>
            </motion.div>
            
            <style dangerouslySetInnerHTML={{ __html: `
                .__hide-scrollbars::-webkit-scrollbar { display: none; }
                .__hide-scrollbars { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </main>
    );
}
