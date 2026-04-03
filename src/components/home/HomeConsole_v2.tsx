"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpenText, BrainCircuit, Clock3, Sparkles, Stars, Swords, X } from "lucide-react";

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
    const [reviewReminderNow] = useState(() => Date.now());
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
    const dueVocabularyCount = useLiveQuery(
        () => db.vocabulary.where("due").belowOrEqual(reviewReminderNow).count(),
        [reviewReminderNow],
    );
    const dueVocabularyPreview = useLiveQuery(
        () => db.vocabulary.where("due").belowOrEqual(reviewReminderNow).limit(3).toArray(),
        [reviewReminderNow],
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
    const [routeTransitionTarget, setRouteTransitionTarget] = useState<"read" | "battle" | "vocab" | "review" | null>(null);
    const [showReviewReminder, setShowReviewReminder] = useState(false);
    const [reviewReminderDismissed, setReviewReminderDismissed] = useState(false);

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

    const handleNavigateFromHome = (target: "read" | "battle" | "vocab" | "review") => {
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
            if (target === "review") {
                router.push("/vocab/review?from=home");
                return;
            }
            router.push("/vocab?from=home");
        }, 560);
    };

    const springTransition = { type: "spring" as const, stiffness: 400, damping: 25 };
    const dueWordCount = dueVocabularyCount ?? 0;
    const dueWords = useMemo(
        () => (dueVocabularyPreview ?? []).map((item) => item.word.trim()).filter(Boolean),
        [dueVocabularyPreview],
    );

    useEffect(() => {
        if (reviewReminderDismissed || routeTransitionTarget || dueWordCount <= 0 || showReviewReminder) {
            return;
        }

        const timer = window.setTimeout(() => {
            setShowReviewReminder(true);
        }, 3200);

        return () => {
            window.clearTimeout(timer);
        };
    }, [dueWordCount, reviewReminderDismissed, routeTransitionTarget, showReviewReminder]);

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

            <AnimatePresence>
                {showReviewReminder && !routeTransitionTarget && dueWordCount > 0 && (
                    <motion.div
                        className="fixed inset-0 z-[85] flex items-center justify-center bg-[#111827]/18 px-4 backdrop-blur-[2px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22 }}
                    >
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-label="生词复习提醒"
                            initial={{ opacity: 0, y: 26, scale: 0.92, rotate: -1.5 }}
                            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                            exit={{ opacity: 0, y: 16, scale: 0.94, rotate: 1 }}
                            transition={{ type: "spring", stiffness: 320, damping: 24 }}
                            className="relative w-full max-w-[440px] rounded-[2.4rem] border-4 border-[#111827] bg-[#fffaf0] p-5 shadow-[0_14px_0_0_#111827]"
                        >
                            <button
                                type="button"
                                aria-label="关闭复习提醒"
                                onClick={() => {
                                    setShowReviewReminder(false);
                                    setReviewReminderDismissed(true);
                                }}
                                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border-4 border-[#111827] bg-white text-[#6b7280] shadow-[0_4px_0_0_#111827] transition-transform hover:-translate-y-0.5"
                            >
                                <X className="h-4 w-4" />
                            </button>

                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-2 pr-12">
                                    <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#111827] bg-[#fde68a] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#92400e] shadow-[0_3px_0_0_#111827]">
                                        <Stars className="h-3.5 w-3.5" />
                                        review ping
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#111827] bg-[#dcfce7] px-3 py-1 text-[11px] font-black text-[#166534] shadow-[0_3px_0_0_#111827]">
                                        <Clock3 className="h-3.5 w-3.5" />
                                        待复习 {dueWordCount}
                                    </span>
                                </div>

                                <div>
                                    <p className="font-welcome-display text-[2.2rem] leading-[0.92] tracking-[-0.05em] text-[#111827]">
                                        生词本在等你翻牌
                                    </p>
                                    <p className="mt-2 text-[15px] font-bold leading-6 text-[#6b7280]">
                                        你现在有 {dueWordCount} 个单词到了复习时间。趁热刷一轮，记忆会更稳。
                                    </p>
                                </div>

                                {dueWords.length > 0 && (
                                    <div className="rounded-[1.8rem] border-4 border-[#111827] bg-white p-4 shadow-[0_6px_0_0_#111827]">
                                        <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#9ca3af]">
                                            first up
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {dueWords.map((word) => (
                                                <span
                                                    key={word}
                                                    className="inline-flex items-center rounded-full border-2 border-[#111827] bg-[#f5f3ff] px-3 py-1.5 text-sm font-black text-[#6d28d9] shadow-[0_3px_0_0_#111827]"
                                                >
                                                    {word}
                                                </span>
                                            ))}
                                            {dueWordCount > dueWords.length && (
                                                <span className="inline-flex items-center rounded-full border-2 border-[#111827] bg-[#ffedd5] px-3 py-1.5 text-sm font-black text-[#c2410c] shadow-[0_3px_0_0_#111827]">
                                                    +{dueWordCount - dueWords.length}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <motion.button
                                        whileHover={{ scale: 1.03, y: -2 }}
                                        whileTap={{ scale: 0.97 }}
                                        transition={springTransition}
                                        type="button"
                                        onClick={() => {
                                            setShowReviewReminder(false);
                                            setReviewReminderDismissed(true);
                                        }}
                                        className="flex-1 rounded-[1.7rem] border-4 border-[#111827] bg-white px-5 py-3 text-[15px] font-black text-[#6b7280] shadow-[0_6px_0_0_#111827] active:translate-y-1 active:shadow-[0_2px_0_0_#111827]"
                                    >
                                        稍后再说
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.03, y: -2 }}
                                        whileTap={{ scale: 0.97 }}
                                        transition={springTransition}
                                        type="button"
                                        onClick={() => {
                                            setShowReviewReminder(false);
                                            setReviewReminderDismissed(true);
                                            handleNavigateFromHome("review");
                                        }}
                                        className="flex-1 rounded-[1.7rem] border-4 border-[#111827] bg-[#facc15] px-5 py-3 text-[15px] font-black text-[#111827] shadow-[0_6px_0_0_#111827] active:translate-y-1 active:shadow-[0_2px_0_0_#111827]"
                                    >
                                        立即复习
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
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
