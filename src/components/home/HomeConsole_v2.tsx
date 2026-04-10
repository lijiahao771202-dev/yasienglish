"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookAudio, BookOpenText, BrainCircuit, Clock3, Sparkles, Stars, Swords, X, Compass } from "lucide-react";

import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { HomeDashboardPanels_v2 } from "@/components/home/HomeDashboardPanels_v2";
import { buildHomeDashboardModel } from "@/components/home/home-data";
import { db } from "@/lib/db";
import { saveProfilePatch } from "@/lib/user-repository";
import { RANDOM_ENGLISH_TTS_VOICE } from "@/lib/profile-settings";
import { SpotlightTour, type TourStep } from "@/components/ui/SpotlightTour";
import { Volume2, CloudUpload, Loader2, Check } from "lucide-react";

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
    const recentListeningSessions = useLiveQuery(
        () => db.listening_cabin_sessions.where("created_at").aboveOrEqual(activityCutoff).toArray(),
        [activityCutoff],
    );
    const resolvedPasswordUpdated = passwordUpdated || searchParams.get("password") === "updated";
    const fromBattle = searchParams.get("from") === "battle";
    const [routeTransitionTarget, setRouteTransitionTarget] = useState<"read" | "battle" | "vocab" | "review" | "cabin" | null>(null);
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
        listeningSessions: recentListeningSessions ?? [],
        fadingVocabCount: dueVocabularyCount ?? 0,
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
        recentListeningSessions,
        dueVocabularyCount,
    ]);

    const handleNavigateFromHome = (target: "read" | "battle" | "vocab" | "review" | "cabin") => {
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
            if (target === "cabin") {
                router.push("/listening-cabin?from=home");
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

    const [showHomeTour, setShowHomeTour] = useState(false);
    const [settingVoice, setSettingVoice] = useState(false);
    const [voiceSet, setVoiceSet] = useState(false);

    useEffect(() => {
        const hasCompleted = localStorage.getItem("v2-onboarded");
        if (!hasCompleted) {
            // Slight delay so the page can render and animate in first
            const timer = setTimeout(() => setShowHomeTour(true), 1200);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleTourComplete = useCallback(() => {
        setShowHomeTour(false);
        try {
            localStorage.setItem("v2-onboarded", "true");
        } catch (e) {
            console.error(e);
        }
        
        // Dispatch the event so UserAvatarMenu picks it up, opens itself, and starts its own nested tour
        window.dispatchEvent(new Event("start-avatar-tour"));
    }, []);

    const handleSetRandomVoice = async () => {
        setSettingVoice(true);
        try {
            await saveProfilePatch({
                learning_preferences: {
                    ...(profile?.learning_preferences || {}),
                    tts_voice: RANDOM_ENGLISH_TTS_VOICE,
                },
            });
            setVoiceSet(true);
        } catch (e) {
            window.alert("配置失败，请检查网络后重试。");
        } finally {
            setSettingVoice(false);
        }
    };

    const homeTourSteps: TourStep[] = [
        {
            targetId: "core-modules",
            title: "核心训练区",
            content: "四大核心模组，在这里全景呈现。您可以根据每一天的心情，选择听力精听、阅读精读、对战比拼或单纯背单词。",
            placement: "bottom"
        },
        {
            targetId: "daily-plan",
            title: "每日计划指南针",
            content: "为您量身定制的备考日程表。智能切分大考任务，今天该做什么、还差多少，随时了然于胸。",
            placement: "right"
        },
        {
            targetId: "immersion-echo",
            title: "沉浸回声",
            content: "一分耕耘，一分收获。在这里追踪您每日有效的专注时长，积水成渊。",
            placement: "bottom"
        },
        {
            targetId: "habit-pulse",
            title: "本周脉搏",
            content: "火种代表您的每一次坚持。只要有付诸行动，这一天专属于您的光团就会亮起。",
            placement: "top"
        },
        {
            targetId: "header-avatar-btn",
            title: "系统神经中枢",
            content: "向导的最后一环：这里藏着 Yasi 系统的总控制台。请在此结束主向导后，点击右上角您的头像展开设置面板，为您配置全局动态发音规则吧！",
            placement: "bottom"
        }
    ];

    return (
        <main className="font-welcome-ui relative min-h-screen w-full overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8 flex flex-col items-center justify-center bg-transparent transition-colors">
            <SpotlightTour 
                isOpen={showHomeTour} 
                onClose={handleTourComplete} 
                onComplete={handleTourComplete}
                steps={homeTourSteps} 
            />
            <AnimatePresence>
                {routeTransitionTarget && (
                    <motion.div
                        className="pointer-events-none fixed inset-0 z-[70] bg-theme-base-bg"
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
                    <div className="bg-theme-card-bg backdrop-blur-xl rounded-[2.5rem] p-6 lg:p-8 flex flex-col justify-between border-4 border-theme-border shadow-[0_12px_0_0_var(--theme-shadow)]">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-4">
                                <p className="inline-flex items-center gap-2 rounded-full border-2 border-theme-border bg-theme-base-bg px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-theme-text shadow-[0_4px_0_0_var(--theme-shadow)]">
                                    <Sparkles className="h-4 w-4" />
                                    WELCOME
                                </p>
                                <h1 className="font-welcome-display text-[2.8rem] leading-[1] tracking-tight text-theme-text sm:text-[3.5rem]">
                                    欢迎回来
                                </h1>
                            </div>
                            <div data-tour-target="core-modules" className="flex flex-wrap md:flex-nowrap gap-4">
                                <motion.button
                                    whileHover={{ scale: 1.04, y: -2 }}
                                    whileTap={{ scale: 0.96 }}
                                    transition={springTransition}
                                    type="button"
                                    onClick={() => handleNavigateFromHome("cabin")}
                                    className="flex w-full md:w-auto min-w-[170px] items-center justify-between gap-3 rounded-[2rem] bg-[color:var(--module-listen-bg)] border-4 border-[color:var(--module-listen-bd)] px-6 py-4 shadow-[0_8px_0_0_var(--module-listen-bd)] text-theme-text group active:shadow-[0_0px_0_0_var(--module-listen-bd)] active:translate-y-2 transition-all duration-75"
                                >
                                    <span className="flex items-center gap-2 text-[16px] font-black">
                                        <BookAudio className="h-6 w-6 text-[color:var(--module-listen-bd)]" />听力舱
                                    </span>
                                    <ArrowRight className="h-5 w-5 text-theme-text-muted group-hover:translate-x-1 transition-transform" />
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.04, y: -2 }}
                                    whileTap={{ scale: 0.96 }}
                                    transition={springTransition}
                                    type="button"
                                    onClick={() => handleNavigateFromHome("read")}
                                    className="flex w-full md:w-auto min-w-[150px] items-center justify-between gap-3 rounded-[2rem] bg-[color:var(--module-read-bg)] border-4 border-[color:var(--module-read-bd)] px-6 py-4 shadow-[0_8px_0_0_var(--module-read-bd)] text-theme-text group active:shadow-[0_0px_0_0_var(--module-read-bd)] active:translate-y-2 transition-all duration-75"
                                >
                                    <span className="flex items-center gap-2 text-[16px] font-black">
                                        <BookOpenText className="h-6 w-6 text-[color:var(--module-read-bd)]" />阅读
                                    </span>
                                    <ArrowRight className="h-5 w-5 text-theme-text-muted group-hover:translate-x-1 transition-transform" />
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.04, y: -2 }}
                                    whileTap={{ scale: 0.96 }}
                                    transition={springTransition}
                                    type="button"
                                    onClick={() => handleNavigateFromHome("battle")}
                                    className="flex w-full md:w-auto min-w-[150px] items-center justify-between gap-3 rounded-[2rem] bg-[color:var(--module-battle-bg)] border-4 border-[color:var(--module-battle-bd)] px-6 py-4 shadow-[0_8px_0_0_var(--module-battle-bd)] text-theme-text group active:shadow-[0_0px_0_0_var(--module-battle-bd)] active:translate-y-2 transition-all duration-75"
                                >
                                    <span className="flex items-center gap-2 text-[16px] font-black">
                                        <Swords className="h-6 w-6 text-[color:var(--module-battle-bd)]" />对战
                                    </span>
                                    <ArrowRight className="h-5 w-5 text-theme-text-muted group-hover:translate-x-1 transition-transform" />
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.04, y: -2 }}
                                    whileTap={{ scale: 0.96 }}
                                    transition={springTransition}
                                    type="button"
                                    onClick={() => handleNavigateFromHome("vocab")}
                                    className="flex w-full md:w-auto min-w-[150px] items-center justify-between gap-3 rounded-[2rem] bg-[color:var(--module-vocab-bg)] border-4 border-[color:var(--module-vocab-bd)] px-6 py-4 shadow-[0_8px_0_0_var(--module-vocab-bd)] text-theme-text group active:shadow-[0_0px_0_0_var(--module-vocab-bd)] active:translate-y-2 transition-all duration-75"
                                >
                                    <span className="flex items-center gap-2 text-[16px] font-black">
                                        <BrainCircuit className="h-6 w-6 text-[color:var(--module-vocab-bd)]" />生词本
                                    </span>
                                    <ArrowRight className="h-5 w-5 text-theme-text-muted group-hover:translate-x-1 transition-transform" />
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
                    <div className="h-full w-full rounded-[2.75rem] p-5 lg:p-7 bg-theme-card-bg backdrop-blur-xl border-4 border-theme-border shadow-[0_12px_0_0_var(--theme-shadow)] overflow-y-auto overflow-x-hidden __hide-scrollbars">
                        <HomeDashboardPanels_v2
                            model={model}
                            eloHistory={eloHistory ?? []}
                            accountEmail={sessionUser?.email}
                            passwordUpdated={resolvedPasswordUpdated}
                        />
                    </div>
                </motion.div>
            </motion.div>
            
            {/* Tour Trigger Button */}
            <motion.button
                initial={{ opacity: 0, scale: 0.8, rotate: -20 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 1, type: "spring", stiffness: 300, damping: 20 }}
                whileHover={{ scale: 1.1, rotate: 15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowHomeTour(true)}
                className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border-4 border-[#1e1b4b] bg-indigo-200 text-[#1e1b4b] shadow-[0_6px_0_0_#1e1b4b] active:translate-y-1 active:shadow-[0_2px_0_0_#1e1b4b]"
                title="开启功能向导"
            >
                <Compass className="h-6 w-6 stroke-[2.5]" />
            </motion.button>

            <style dangerouslySetInnerHTML={{ __html: `
                .__hide-scrollbars::-webkit-scrollbar { display: none; }
                .__hide-scrollbars { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
        </main>
    );
}
