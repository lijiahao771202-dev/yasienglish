"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DrillCore } from "@/components/drill/DrillCore";
import { Zap, Briefcase, Plane, GraduationCap, Coffee, Sword, Trophy, Flame, ChevronRight, Lock, Cpu, Heart, Utensils, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRank } from "@/lib/rankUtils";
import { db } from "@/lib/db";

const TOPICS = [
    {
        id: "business",
        title: "Business Elite",
        description: "Negotiations, Emails, Interviews",
        icon: Briefcase,
        color: "bg-blue-50 text-blue-600 border-blue-200",
        gradient: "from-blue-500 to-indigo-600",
        minElo: 0
    },
    {
        id: "travel",
        title: "Global Traveler",
        description: "Airports, Hotels, Emergencies",
        icon: Plane,
        color: "bg-sky-50 text-sky-600 border-sky-200",
        gradient: "from-sky-400 to-cyan-500",
        minElo: 0
    },
    {
        id: "academic",
        title: "Academic Force",
        description: "IELTS Speaking, Debate, Logic",
        icon: GraduationCap,
        color: "bg-indigo-50 text-indigo-600 border-indigo-200",
        gradient: "from-indigo-500 to-purple-600",
        minElo: 1400
    },
    {
        id: "daily",
        title: "Daily Flow",
        description: "Small Talk, Ice Breakers, Dating",
        icon: Coffee,
        color: "bg-amber-50 text-amber-600 border-amber-200",
        gradient: "from-amber-400 to-orange-500",
        minElo: 0
    },
    {
        id: "tech",
        title: "Tech Frontier",
        description: "AI, Startups, Coding",
        icon: Cpu,
        color: "bg-violet-50 text-violet-600 border-violet-200",
        gradient: "from-violet-500 to-fuchsia-600",
        minElo: 1300
    },
    {
        id: "romance",
        title: "Romantic Spark",
        description: "Dates, Chemistry, Emotions",
        icon: Heart,
        color: "bg-pink-50 text-pink-600 border-pink-200",
        gradient: "from-pink-500 to-rose-500",
        minElo: 0
    },
    {
        id: "food",
        title: "Culinary Arts",
        description: "Fine Dining, Recipes, Reviews",
        icon: Utensils,
        color: "bg-orange-50 text-orange-600 border-orange-200",
        gradient: "from-orange-500 to-amber-600",
        minElo: 0
    },
    {
        id: "medical",
        title: "Emergency Room",
        description: "Symptoms, Accidents, 911",
        icon: Stethoscope,
        color: "bg-red-50 text-red-600 border-red-200",
        gradient: "from-red-500 to-rose-700",
        minElo: 1500
    },
    {
        id: "debate",
        title: "Deep Debate",
        description: "Philosophy, Ethics, Complexity",
        icon: Sword,
        color: "bg-rose-50 text-rose-600 border-rose-200",
        gradient: "from-rose-500 to-red-600",
        minElo: 1600
    }
];

export default function BattlePage() {
    const [activeDrill, setActiveDrill] = useState<{ type: "scenario"; topic: string } | null>(null);
    const [eloRating, setEloRating] = useState(1200);
    const [streak, setStreak] = useState(0);
    const [battleMode, setBattleMode] = useState<'listening' | 'translation'>('listening');

    useEffect(() => {
        db.user_profile.orderBy('id').first().then(profile => {
            if (profile) {
                setEloRating(profile.elo_rating);
                setStreak(profile.streak_count);
            }
        });
    }, [activeDrill]); // Refresh when drill closes

    const rank = getRank(eloRating);

    return (
        <div className="min-h-screen bg-stone-50 font-sans selection:bg-indigo-100 selection:text-indigo-900 pb-20">
            {/* Background Decoration */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-indigo-100/40 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-sky-100/40 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 md:py-20">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
                    <div>
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

                    {/* Stats Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="flex items-center gap-6 bg-white/60 backdrop-blur-xl p-4 pr-8 rounded-3xl border border-white/60 shadow-xl shadow-stone-200/50"
                    >
                        <div className="relative">
                            <div className={cn("w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg text-white bg-gradient-to-br", rank.gradient || "from-stone-500 to-stone-700")}>
                                <Trophy className="w-10 h-10" />
                            </div>
                            <div className="absolute -bottom-3 -right-3 w-8 h-8 bg-stone-900 rounded-full flex items-center justify-center border-4 border-white text-xs font-bold text-white shadow-md">
                                {getRank(eloRating).title.substring(0, 1)}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Current Rating</div>
                            <div className="text-3xl font-bold text-stone-800 font-mono">{eloRating}</div>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500 mt-1">
                                <Flame className="w-3 h-3 fill-amber-500" />
                                {streak} Day Streak
                            </div>
                        </div>
                    </motion.div>
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
                        onClose={() => setActiveDrill(null)}
                        initialMode={battleMode}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
