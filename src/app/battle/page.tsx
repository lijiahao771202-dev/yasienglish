"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DrillCore } from "@/components/drill/DrillCore";
import { Zap, Flame, ChevronRight, Lock, Headphones, Feather, House, Sword } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRank } from "@/lib/rankUtils";
import { db } from "@/lib/db";
import { EloChart } from "@/components/battle/EloChart";
import { BattleDrillSelection, shouldRefreshBattleChart } from "@/lib/battleUiState";
import { TOPICS } from "@/lib/battle-topics";

export default function BattlePage() {
    const [activeDrill, setActiveDrill] = useState<BattleDrillSelection | null>(null);
    const [eloRating, setEloRating] = useState(600); // Translation
    const [listeningElo, setListeningElo] = useState(600); // Listening
    const [streak, setStreak] = useState(0);
    const [battleMode, setBattleMode] = useState<'listening' | 'translation'>('listening');
    const [refreshCount, setRefreshCount] = useState(0);

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

    const transRank = getRank(eloRating);
    const listenRank = getRank(listeningElo);

    return (
        <div className="min-h-screen bg-stone-50 font-sans selection:bg-indigo-100 selection:text-indigo-900 pb-20">
            {/* Background Decoration */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-indigo-100/40 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-sky-100/40 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 md:py-20">
                {/* Header Section */}
                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mb-16">
                    <div>
                        <Link
                            href="/"
                            className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/72 px-4 py-2 text-sm font-semibold text-stone-600 shadow-lg shadow-stone-200/50 backdrop-blur-xl transition hover:-translate-y-0.5 hover:text-stone-900"
                        >
                            <House className="h-4 w-4" />
                            返回欢迎页
                        </Link>
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
                            "The only way to learn a language is to fight with it."
                        </motion.p>
                    </div>

                    {/* Stats Cards Row */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        {/* 1. Listening Stats */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                            className="flex items-center gap-5 bg-white/60 backdrop-blur-xl p-3 pr-6 rounded-2xl border border-white/60 shadow-lg shadow-sky-100/50"
                        >
                            <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center shadow-md text-white bg-gradient-to-br border-2 border-white/20 relative overflow-hidden", listenRank.gradient)}>
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />
                                <listenRank.icon className="w-8 h-8 relative z-10" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold tracking-wider text-sky-600 uppercase bg-sky-50 px-2 py-0.5 rounded-full border border-sky-100">Listening</span>
                                    <div className={cn("w-2 h-2 rounded-full", listenRank.bg.replace('bg-', 'bg-'))} />
                                    <span className="text-xs font-bold text-stone-400">{listenRank.title}</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-stone-800 tabular-nums tracking-tight">{listeningElo}</span>
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
                            className="flex items-center gap-5 bg-white/60 backdrop-blur-xl p-3 pr-6 rounded-2xl border border-white/60 shadow-lg shadow-indigo-100/50"
                        >
                            <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center shadow-md text-white bg-gradient-to-br border-2 border-white/20 relative overflow-hidden", transRank.gradient)}>
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />
                                <transRank.icon className="w-8 h-8 relative z-10" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold tracking-wider text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">Translation</span>
                                    <div className={cn("w-2 h-2 rounded-full", transRank.bg.replace('bg-', 'bg-'))} />
                                    <span className="text-xs font-bold text-stone-400">{transRank.title}</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-stone-800 tabular-nums tracking-tight">{eloRating}</span>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* Elo Chart */}
                <div className="mb-12">
                    <EloChart key={`${battleMode}-${refreshCount}`} mode={battleMode} />
                </div>

                {/* Mode Switcher */}
                <div className="flex justify-center mb-12">
                    <div className="flex items-center gap-2 bg-stone-200/40 backdrop-blur-lg p-1.5 rounded-full border border-stone-200/50 shadow-inner">
                        <button
                            onClick={() => setBattleMode('listening')}
                            className={cn(
                                "flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all duration-300",
                                battleMode === 'listening'
                                    ? "bg-white text-stone-900 shadow-lg shadow-stone-200/50 scale-105"
                                    : "text-stone-500 hover:text-stone-700 hover:bg-stone-100/50"
                            )}
                        >
                            <div className={cn("w-2 h-2 rounded-full", battleMode === 'listening' ? "bg-emerald-500 animate-pulse" : "bg-stone-300")} />
                            Listening
                        </button>
                        <button
                            onClick={() => setBattleMode('translation')}
                            className={cn(
                                "flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all duration-300",
                                battleMode === 'translation'
                                    ? "bg-white text-stone-900 shadow-lg shadow-stone-200/50 scale-105"
                                    : "text-stone-500 hover:text-stone-700 hover:bg-stone-100/50"
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
                        className="group relative w-full overflow-hidden rounded-[2.5rem] bg-stone-900 text-white shadow-2xl shadow-stone-900/40 transition-all hover:shadow-stone-900/60 hover:scale-[1.01]"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-stone-900 to-indigo-900/50 z-0" />
                        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] z-0" />

                        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between p-8 md:p-12 gap-8">
                            <div className="text-left">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-4 border border-indigo-500/30">
                                    <Zap className="w-3 h-3" /> Quick Match
                                </div>
                                <h2 className="text-3xl md:text-5xl font-bold mb-2">Instant Combat</h2>
                                <p className="text-stone-400 text-lg max-w-md">Enter a random real-world scenario tailored to your current Elo level.</p>
                            </div>
                            <div className="w-16 h-16 rounded-full bg-white text-stone-900 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-45">
                                <Sword className="w-8 h-8" />
                            </div>
                        </div>
                    </button>
                </motion.div>

                {/* Topic Grid */}
                <div>
                    <h3 className="text-2xl font-bold text-stone-900 mb-8 flex items-center gap-3">
                        <span className="w-2 h-8 rounded-full bg-indigo-500" />
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
                                            "w-full h-full text-left p-6 rounded-[2rem] border transition-all duration-300 relative overflow-hidden group hover:shadow-xl",
                                            isLocked
                                                ? "bg-stone-50 border-stone-200 opacity-80 cursor-not-allowed"
                                                : "bg-white border-white hover:border-indigo-100 shadow-sm"
                                        )}
                                    >
                                        <div className={cn("inline-flex p-3 rounded-2xl mb-4 transition-transform group-hover:scale-110", topic.color)}>
                                            <topic.icon className="w-6 h-6" />
                                        </div>

                                        <h4 className="text-xl font-bold text-stone-800 mb-1">{topic.title}</h4>
                                        <p className="text-sm text-stone-500 font-medium mb-4">{topic.description}</p>

                                        {isLocked ? (
                                            <div className="inline-flex items-center gap-2 text-xs font-bold text-stone-400 bg-stone-200/50 px-3 py-1.5 rounded-full">
                                                <Lock className="w-3 h-3" /> Requires {topic.minElo} Elo
                                            </div>
                                        ) : (
                                            <div className="absolute bottom-6 right-6 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-indigo-500">
                                                <ChevronRight className="w-6 h-6" />
                                            </div>
                                        )}
                                    </button>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </div>

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
