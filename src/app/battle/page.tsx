"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DrillCore } from "@/components/drill/DrillCore";
import { Zap, Flame, ChevronRight, Lock, House, Sword } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRank } from "@/lib/rankUtils";
import { db } from "@/lib/db";
import { EloChart } from "@/components/battle/EloChart";
import { BattleDrillSelection, shouldRefreshBattleChart } from "@/lib/battleUiState";
import { TOPICS } from "@/lib/battle-topics";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { applyBackgroundThemeToDocument, BACKGROUND_CHANGED_EVENT, getBackgroundThemeSpec, getSavedBackgroundTheme } from "@/lib/background-preferences";

export default function BattlePage() {
    const router = useRouter();
    const sessionUser = useAuthSessionUser();
    const [activeDrill, setActiveDrill] = useState<BattleDrillSelection | null>(null);
    const [eloRating, setEloRating] = useState(600); // Translation
    const [listeningElo, setListeningElo] = useState(600); // Listening
    const [streak, setStreak] = useState(0);
    const [battleMode, setBattleMode] = useState<'listening' | 'translation'>('listening');
    const [refreshCount, setRefreshCount] = useState(0);
    const [navTransition, setNavTransition] = useState<"home" | "read" | null>(null);
    const [, forceBackgroundRefresh] = useState(0);

    const loadProfile = useCallback(() => {
        db.user_profile.orderBy('id').first().then(profile => {
            if (profile) {
                setEloRating(profile.elo_rating || 600);
                setListeningElo(profile.listening_elo || 600);
                setStreak(profile.streak_count);
            }
        });
    }, []);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    const handleCloseDrill = () => {
        if (shouldRefreshBattleChart(activeDrill, null)) {
            setRefreshCount(prev => prev + 1);
        }

        setActiveDrill(null);
        loadProfile();
    };
    const handleNavigateWithCard = (target: "home" | "read") => {
        if (navTransition) return;
        setNavTransition(target);
        setTimeout(() => {
            router.push(target === "home" ? "/?from=battle" : "/read?from=battle");
        }, target === "home" ? 760 : 560);
    };

    const transRank = getRank(eloRating);
    const listenRank = getRank(listeningElo);
    const isTranslation = battleMode === "translation";
    const backgroundTheme = getSavedBackgroundTheme(sessionUser?.id);
    const backgroundSpec = getBackgroundThemeSpec(backgroundTheme);
    const glassBlendTransition = { duration: 1.85, ease: [0.22, 1, 0.36, 1] as const };
    const glassBlueLayer = "bg-[linear-gradient(140deg,rgba(228,242,255,0.56),rgba(172,210,255,0.26))]";
    const glassOrangeLayer = "bg-[linear-gradient(140deg,rgba(255,239,217,0.58),rgba(255,192,120,0.28))]";
    const glassBlueHeroLayer = "bg-[linear-gradient(138deg,rgba(226,241,255,0.58),rgba(167,205,255,0.24))]";
    const glassOrangeHeroLayer = "bg-[linear-gradient(138deg,rgba(255,240,220,0.58),rgba(255,194,132,0.24))]";
    const glassTone = isTranslation
        ? {
            soft: "border-white/45 shadow-[0_20px_42px_-28px_rgba(234,120,24,0.78),inset_0_1px_0_rgba(255,255,255,0.72)] hover:shadow-[0_24px_48px_-26px_rgba(234,120,24,0.95),inset_0_1px_0_rgba(255,255,255,0.8)]",
            pill: "border-white/45 shadow-[0_16px_38px_-24px_rgba(234,120,24,0.72),inset_0_1px_0_rgba(255,255,255,0.74)]",
            active: "bg-[linear-gradient(135deg,rgba(255,249,240,0.84),rgba(255,213,163,0.5))] shadow-[0_14px_28px_-20px_rgba(234,120,24,0.88),inset_0_1px_0_rgba(255,255,255,0.78)]",
            hero: "shadow-[0_28px_55px_-32px_rgba(234,120,24,0.86),inset_0_1px_0_rgba(255,255,255,0.78)] hover:shadow-[0_34px_70px_-30px_rgba(234,120,24,0.98),inset_0_1px_0_rgba(255,255,255,0.86)]",
            badge: "bg-amber-100/65 text-amber-700",
            icon: "bg-[linear-gradient(140deg,rgba(255,252,247,0.9),rgba(255,219,175,0.55))] text-amber-700 shadow-[0_12px_26px_-16px_rgba(234,120,24,0.9)]",
            marker: "bg-amber-500",
            chevron: "text-amber-600",
            textTag: "text-amber-700 bg-amber-50/80 border-amber-200/70"
        }
        : {
            soft: "border-white/45 shadow-[0_20px_42px_-28px_rgba(32,103,229,0.8),inset_0_1px_0_rgba(255,255,255,0.72)] hover:shadow-[0_24px_48px_-26px_rgba(37,99,235,0.95),inset_0_1px_0_rgba(255,255,255,0.78)]",
            pill: "border-white/45 shadow-[0_16px_38px_-24px_rgba(30,108,235,0.72),inset_0_1px_0_rgba(255,255,255,0.74)]",
            active: "bg-[linear-gradient(135deg,rgba(240,248,255,0.8),rgba(190,221,255,0.46))] shadow-[0_14px_28px_-20px_rgba(37,99,235,0.9),inset_0_1px_0_rgba(255,255,255,0.75)]",
            hero: "shadow-[0_28px_55px_-32px_rgba(37,99,235,0.85),inset_0_1px_0_rgba(255,255,255,0.78)] hover:shadow-[0_34px_70px_-30px_rgba(37,99,235,0.98),inset_0_1px_0_rgba(255,255,255,0.85)]",
            badge: "bg-blue-100/65 text-blue-700",
            icon: "bg-[linear-gradient(140deg,rgba(248,252,255,0.9),rgba(197,225,255,0.55))] text-blue-700 shadow-[0_12px_26px_-16px_rgba(37,99,235,0.9)]",
            marker: "bg-blue-500",
            chevron: "text-blue-600",
            textTag: "text-blue-700 bg-blue-50/80 border-blue-200/70"
        };

    useEffect(() => {
        applyBackgroundThemeToDocument(backgroundTheme);
    }, [backgroundTheme]);

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

    return (
        <div className="min-h-screen bg-stone-50 font-sans selection:bg-indigo-100 selection:text-indigo-900 pb-20">
            <div className={`fixed inset-0 z-0 pointer-events-none ${backgroundSpec.baseLayer}`} />
            {/* Background Decoration */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className={`absolute inset-0 ${backgroundSpec.glassLayer}`} />
                <div className={`absolute inset-0 ${backgroundSpec.glowLayer}`} />
                <div className={`absolute inset-x-0 bottom-0 h-[34%] ${backgroundSpec.bottomLayer}`} />
                <div className={`absolute inset-0 ${backgroundSpec.vignetteLayer}`} />
                <motion.div
                    className="absolute inset-0 bg-[radial-gradient(90%_70%_at_15%_0%,rgba(126,181,255,0.22),rgba(64,139,255,0.08)_42%,transparent_72%)]"
                    animate={{ opacity: isTranslation ? 0 : 1 }}
                    transition={{ duration: 1.25, ease: [0.19, 1, 0.22, 1] }}
                />
                <motion.div
                    className="absolute inset-0 bg-[radial-gradient(90%_70%_at_85%_0%,rgba(255,190,116,0.22),rgba(255,138,37,0.08)_42%,transparent_72%)]"
                    animate={{ opacity: isTranslation ? 1 : 0 }}
                    transition={{ duration: 1.25, ease: [0.19, 1, 0.22, 1] }}
                />
            </div>

            <AnimatePresence>
                {navTransition && (
                    <motion.div
                        className="fixed inset-0 z-[70] pointer-events-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <motion.div
                            className={cn("absolute inset-0 backdrop-blur-[8px]", backgroundSpec.transitionFilm)}
                            initial={{ scale: 1.08, filter: "blur(22px)" }}
                            animate={{ scale: 1, filter: "blur(0px)" }}
                            transition={{ duration: 0.76, ease: [0.18, 1, 0.3, 1] }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                className="relative z-10 max-w-6xl mx-auto px-6 py-12 md:py-20"
                animate={navTransition
                    ? { opacity: 0, y: 16, scale: 0.985, filter: "blur(8px)" }
                    : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
            >
                {/* Header Section */}
                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mb-16">
                    <div>
                        <div className="mb-6 flex flex-wrap gap-3">
                            <motion.button
                                initial={{ opacity: 0, y: 22, scale: 0.92, filter: "blur(6px)" }}
                                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                                transition={{ delay: 0.02, duration: 0.86, ease: [0.16, 1, 0.3, 1] }}
                                onClick={() => handleNavigateWithCard("home")}
                                className="group inline-flex items-center gap-2 rounded-2xl border border-white/45 bg-[linear-gradient(135deg,rgba(232,244,255,0.64),rgba(188,220,255,0.34))] px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_14px_32px_-24px_rgba(18,88,203,0.8),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-2xl saturate-[1.45] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:text-slate-900 hover:shadow-[0_22px_42px_-24px_rgba(37,99,235,0.95),inset_0_1px_0_rgba(255,255,255,0.82)]"
                                whileTap={{ scale: 0.965 }}
                            >
                                <motion.span animate={{ x: navTransition === "home" ? -4 : 0 }} transition={{ duration: 0.26, ease: [0.34, 1.56, 0.64, 1] }}>
                                    <House className="h-4 w-4" />
                                </motion.span>
                                返回欢迎页
                            </motion.button>
                            <motion.button
                                initial={{ opacity: 0, y: 22, scale: 0.92, filter: "blur(6px)" }}
                                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                                transition={{ delay: 0.1, duration: 0.88, ease: [0.16, 1, 0.3, 1] }}
                                onClick={() => handleNavigateWithCard("read")}
                                className="group inline-flex items-center gap-2 rounded-2xl border border-white/45 bg-[linear-gradient(135deg,rgba(239,247,255,0.62),rgba(203,226,255,0.34))] px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_14px_32px_-24px_rgba(18,88,203,0.8),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-2xl saturate-[1.45] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:text-slate-900 hover:shadow-[0_22px_42px_-24px_rgba(37,99,235,0.95),inset_0_1px_0_rgba(255,255,255,0.82)]"
                                whileTap={{ scale: 0.965 }}
                            >
                                <motion.span animate={{ x: navTransition === "read" ? 4 : 0 }} transition={{ duration: 0.26, ease: [0.34, 1.56, 0.64, 1] }}>
                                    <ChevronRight className="h-4 w-4" />
                                </motion.span>
                                打开阅读页面
                            </motion.button>
                        </div>
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-5xl md:text-7xl font-bold text-stone-900 mb-4 tracking-tight"
                        >
                            Battle Arena
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-xl text-stone-500 max-w-lg leading-relaxed font-newsreader italic"
                        >
                            &quot;The only way to learn a language is to fight with it.&quot;
                        </motion.p>
                    </div>

                    {/* Stats Cards Row */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        {/* 1. Listening Stats */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                            className={cn("relative overflow-hidden flex items-center gap-5 p-3 pr-6 rounded-[1.55rem] border backdrop-blur-2xl saturate-[1.42] transition duration-300 hover:-translate-y-0.5", glassTone.soft)}
                        >
                            <motion.div className={cn("absolute inset-0", glassBlueLayer)} animate={{ opacity: isTranslation ? 0 : 1 }} transition={glassBlendTransition} />
                            <motion.div className={cn("absolute inset-0", glassOrangeLayer)} animate={{ opacity: isTranslation ? 1 : 0 }} transition={glassBlendTransition} />
                            <div className={cn("relative z-10 w-16 h-16 rounded-xl flex items-center justify-center shadow-md text-white bg-gradient-to-br border-2 border-white/20 overflow-hidden", listenRank.gradient)}>
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />
                                <listenRank.icon className="w-8 h-8 relative z-10" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={cn("text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border", glassTone.textTag)}>Listening</span>
                                    <div className={cn("w-2 h-2 rounded-full", listenRank.bg.replace('bg-', 'bg-'))} />
                                    <span className="text-xs font-bold text-slate-500">{listenRank.title}</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">{listeningElo}</span>
                                    {streak > 1 && (
                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center text-amber-500 text-xs font-bold">
                                            <Flame className="w-3 h-3 mr-0.5 fill-amber-500" />
                                            Streak
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        </motion.div>

                        {/* 2. Translation Stats */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            className={cn("relative overflow-hidden flex items-center gap-5 p-3 pr-6 rounded-[1.55rem] border backdrop-blur-2xl saturate-[1.42] transition duration-300 hover:-translate-y-0.5", glassTone.soft)}
                        >
                            <motion.div className={cn("absolute inset-0", glassBlueLayer)} animate={{ opacity: isTranslation ? 0 : 1 }} transition={glassBlendTransition} />
                            <motion.div className={cn("absolute inset-0", glassOrangeLayer)} animate={{ opacity: isTranslation ? 1 : 0 }} transition={glassBlendTransition} />
                            <div className={cn("relative z-10 w-16 h-16 rounded-xl flex items-center justify-center shadow-md text-white bg-gradient-to-br border-2 border-white/20 overflow-hidden", transRank.gradient)}>
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />
                                <transRank.icon className="w-8 h-8 relative z-10" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={cn("text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border", glassTone.textTag)}>Translation</span>
                                    <div className={cn("w-2 h-2 rounded-full", transRank.bg.replace('bg-', 'bg-'))} />
                                    <span className="text-xs font-bold text-slate-500">{transRank.title}</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">{eloRating}</span>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* Elo Chart */}
                <div className="mb-12">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={`${battleMode}-${refreshCount}`}
                            initial={{ opacity: 0, y: 14, scale: 0.985, filter: "blur(8px)" }}
                            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, y: -10, scale: 0.99, filter: "blur(6px)" }}
                            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <EloChart mode={battleMode} />
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Mode Switcher */}
                <div className="flex justify-center mb-12">
                    <div className={cn("relative flex items-center gap-2 backdrop-blur-2xl saturate-[1.45] p-1.5 rounded-full border", glassTone.pill)}>
                        <motion.div className={cn("absolute inset-0 rounded-full", glassBlueLayer)} animate={{ opacity: isTranslation ? 0 : 1 }} transition={glassBlendTransition} />
                        <motion.div className={cn("absolute inset-0 rounded-full", glassOrangeLayer)} animate={{ opacity: isTranslation ? 1 : 0 }} transition={glassBlendTransition} />
                        <motion.div
                            className={cn("absolute h-[calc(100%-12px)] top-[6px] rounded-full border border-white/50", glassTone.active)}
                            initial={false}
                            animate={{ left: battleMode === "listening" ? 6 : "50%", width: "calc(50% - 9px)" }}
                            transition={{ type: "spring", stiffness: 210, damping: 24, mass: 0.84 }}
                        />
                        <button
                            onClick={() => setBattleMode('listening')}
                            className={cn(
                                "relative z-10 flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                battleMode === 'listening'
                                    ? "text-slate-900 scale-105"
                                    : "text-slate-600 hover:text-slate-800 hover:bg-white/35"
                            )}
                        >
                            <div className={cn("w-2 h-2 rounded-full", battleMode === 'listening' ? "bg-emerald-500 animate-pulse" : "bg-stone-300")} />
                            Listening
                        </button>
                        <button
                            onClick={() => setBattleMode('translation')}
                            className={cn(
                                "relative z-10 flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                battleMode === 'translation'
                                    ? "text-slate-900 scale-105"
                                    : "text-slate-600 hover:text-slate-800 hover:bg-white/35"
                            )}
                        >
                            <div className={cn("w-2 h-2 rounded-full", battleMode === 'translation' ? "bg-indigo-500 animate-pulse" : "bg-stone-300")} />
                            Translation
                        </button>
                    </div>
                </div>

                {/* Quick Start Hero */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mb-20"
                >
                    <button
                        onClick={() => setActiveDrill({ type: 'scenario', topic: 'Random Scenario' })}
                        className={cn("group relative w-full overflow-hidden rounded-[2.1rem] border border-white/45 text-slate-900 backdrop-blur-[22px] saturate-[1.5] transition-all hover:scale-[1.01]", glassTone.hero)}
                    >
                        <motion.div className={cn("absolute inset-0 z-0", glassBlueHeroLayer)} animate={{ opacity: isTranslation ? 0 : 1 }} transition={glassBlendTransition} />
                        <motion.div className={cn("absolute inset-0 z-0", glassOrangeHeroLayer)} animate={{ opacity: isTranslation ? 1 : 0 }} transition={glassBlendTransition} />
                        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_8%_0%,rgba(255,255,255,0.6),rgba(255,255,255,0.12)_44%,transparent_70%)] z-0" />

                        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between p-8 md:p-12 gap-8">
                            <div className="text-left">
                                <div className={cn("inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-white/45", glassTone.badge)}>
                                    <Zap className="w-3 h-3" /> Quick Match
                                </div>
                                <h2 className="text-3xl md:text-5xl font-bold mb-2">Instant Combat</h2>
                                <p className="text-slate-600 text-lg max-w-md">Enter a random real-world scenario tailored to your current Elo level.</p>
                            </div>
                            <div className={cn("w-16 h-16 rounded-full border border-white/55 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-45", glassTone.icon)}>
                                <Sword className="w-8 h-8" />
                            </div>
                        </div>
                    </button>
                </motion.div>

                {/* Topic Grid */}
                <div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-8 flex items-center gap-3">
                        <span className={cn("w-2 h-8 rounded-full", glassTone.marker)} />
                        Theme Academy
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {TOPICS.map((topic, i) => {
                            const isLocked = eloRating < topic.minElo;
                            return (
                                <motion.div
                                    key={topic.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 + (i * 0.1) }}
                                >
                                    <button
                                        onClick={() => !isLocked && setActiveDrill({ type: 'scenario', topic: topic.title })}
                                        disabled={isLocked}
                                        className={cn(
                                            "w-full h-full text-left p-6 rounded-[1.8rem] border transition-all duration-300 relative overflow-hidden group",
                                            isLocked
                                                ? "bg-[linear-gradient(135deg,rgba(235,244,255,0.45),rgba(206,228,255,0.2))] border-white/35 opacity-75 cursor-not-allowed backdrop-blur-xl"
                                                : cn("border-white/45 backdrop-blur-2xl saturate-[1.45] hover:-translate-y-1", glassTone.soft)
                                        )}
                                    >
                                        {!isLocked && (
                                            <>
                                                <motion.div className={cn("absolute inset-0 z-0", glassBlueLayer)} animate={{ opacity: isTranslation ? 0 : 1 }} transition={glassBlendTransition} />
                                                <motion.div className={cn("absolute inset-0 z-0", glassOrangeLayer)} animate={{ opacity: isTranslation ? 1 : 0 }} transition={glassBlendTransition} />
                                            </>
                                        )}
                                        <div className={cn("inline-flex p-3 rounded-2xl mb-4 transition-transform group-hover:scale-110", topic.color)}>
                                            <topic.icon className="w-6 h-6" />
                                        </div>

                                        <h4 className="relative z-10 text-xl font-bold text-slate-800 mb-1">{topic.title}</h4>
                                        <p className="relative z-10 text-sm text-slate-600 font-medium mb-4">{topic.description}</p>

                                        {isLocked ? (
                                            <div className="relative z-10 inline-flex items-center gap-2 text-xs font-bold text-slate-500 bg-white/45 px-3 py-1.5 rounded-full border border-white/45">
                                                <Lock className="w-3 h-3" /> Requires {topic.minElo} Elo
                                            </div>
                                        ) : (
                                            <div className={cn("absolute bottom-6 right-6 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all", glassTone.chevron)}>
                                                <ChevronRight className="w-6 h-6" />
                                            </div>
                                        )}
                                    </button>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </motion.div>

            {/* Drill Modal */}
            <AnimatePresence>
                {activeDrill && (
                    <DrillCore
                        context={activeDrill}
                        onClose={handleCloseDrill}
                        initialMode={battleMode}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
