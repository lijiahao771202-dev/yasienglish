"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowRight, RefreshCw, Zap, Skull, Crown, Ghost } from "lucide-react";

interface BossScoreRevealProps {
    score: number;
    drift: number; // For diff/comparison (e.g. difference from 9.0)
    type: 'reaper' | 'lightning' | 'gamble' | 'other';
    onNext: () => void;
    onRetry?: () => void;
}

export function BossScoreReveal({ score, drift, type, onNext, onRetry }: BossScoreRevealProps) {
    const [showControls, setShowControls] = useState(false);

    useEffect(() => {
        // Auto-show controls after animation
        const timer = setTimeout(() => setShowControls(true), 2500);
        return () => clearTimeout(timer);
    }, []);

    const isPass = score >= 9.0;

    // Style Config
    const config = {
        reaper: {
            color: "text-red-500",
            bg: "bg-red-600",
            text: "JUDGEMENT",
            icon: Skull,
            shadow: "shadow-red-500/50"
        },
        lightning: {
            color: "text-amber-400",
            bg: "bg-amber-500",
            text: "VOLTAGE",
            icon: Zap,
            shadow: "shadow-amber-500/50"
        },
        gamble: {
            color: "text-rose-500",
            bg: "bg-rose-600",
            text: "PAYOUT",
            icon: Crown,
            shadow: "shadow-rose-500/50"
        },
        other: {
            color: "text-white",
            bg: "bg-white",
            text: "SCORE",
            icon: Ghost,
            shadow: "shadow-white/50"
        }
    }[type] || { color: "text-white", bg: "bg-white", text: "SCORE", icon: Ghost, shadow: "shadow-white/50" };

    const Icon = config.icon;

    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none overflow-hidden">

            {/* Liquid Background Burst */}
            <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.5, 1], opacity: [0, 0.4, 0] }}
                transition={{ duration: 1, ease: "circOut" }}
                className={cn("absolute inset-0 bg-gradient-radial from-current to-transparent opacity-20 blur-3xl", config.color.replace('text-', 'text-'))}
            />

            {/* Impact Text */}
            <motion.div
                initial={{ opacity: 0, y: -50, letterSpacing: "2em" }}
                animate={{ opacity: 1, y: 0, letterSpacing: "1em" }}
                transition={{ duration: 0.8, ease: "circOut" }}
                className={cn("text-xl font-bold uppercase mb-8 flex items-center gap-4", config.color)}
            >
                <Icon className="w-6 h-6 animate-pulse" />
                {config.text}
                <Icon className="w-6 h-6 animate-pulse" />
            </motion.div>

            {/* THE SCORE - LIQUID GLASS CARD */}
            <motion.div
                className="relative p-12 rounded-3xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl flex flex-col items-center justify-center overflow-hidden"
                initial={{ scale: 0.8, opacity: 0, rotateX: 20 }}
                animate={{ scale: 1, opacity: 1, rotateX: 0 }}
                transition={{ type: "spring" as const, bounce: 0.4, delay: 0.2 }}
                style={{
                    boxShadow: `0 0 60px -20px var(--tw-shadow-color)`
                }}
            >
                {/* Internal Reflection */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />

                <div className={cn("text-[10rem] font-black leading-none tracking-tighter tabular-nums z-10 drop-shadow-2xl", config.color)}>
                    {score.toFixed(1)}
                </div>

                {/* Grading Seal */}
                <motion.div
                    initial={{ scale: 5, opacity: 0, rotate: 45 }}
                    animate={{ scale: 1, opacity: 1, rotate: -15 }}
                    transition={{ delay: 1.0, type: "spring" as const, stiffness: 200, damping: 15 }}
                    className={cn(
                        "absolute top-6 -right-6 px-6 py-2 border-4 rounded-xl text-3xl font-black uppercase tracking-widest bg-black/80 backdrop-blur-md shadow-xl z-20",
                        isPass ? "border-emerald-500 text-emerald-500 shadow-emerald-500/20" : "border-stone-500 text-stone-500"
                    )}
                >
                    {isPass ? "S-RANK" : "FAIL"}
                </motion.div>
            </motion.div>

            {/* Controls (Pointer Events Auto) */}
            <AnimatePresence>
                {showControls && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, filter: "blur(10px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ delay: 0.2 }}
                        className="mt-16 flex gap-6 pointer-events-auto"
                    >
                        {onRetry && !isPass && (
                            <button
                                onClick={onRetry}
                                className="group relative px-8 py-4 rounded-full bg-white/5 hover:bg-white/10 text-white font-bold backdrop-blur-md transition-all flex items-center gap-3 border border-white/10 hover:border-white/30 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                                <span className="relative z-10">RETRY</span>
                            </button>
                        )}
                        <button
                            onClick={onNext}
                            className={cn(
                                "group relative px-12 py-5 rounded-full font-black text-xl transition-all flex items-center gap-3 shadow-2xl hover:scale-105 active:scale-95 overflow-hidden",
                                isPass
                                    ? "bg-white text-black hover:shadow-[0_0_40px_rgba(255,255,255,0.4)]"
                                    : "bg-stone-800 text-stone-400 hover:text-white hover:bg-stone-700"
                            )}
                        >
                            {/* Shine Effect */}
                            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />

                            <span className="relative z-10">CONTINUE</span>
                            <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform relative z-10" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
