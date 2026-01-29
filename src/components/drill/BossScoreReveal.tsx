"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowRight, RefreshCw } from "lucide-react";

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
        reaper: { color: "text-red-600", bg: "bg-red-500", text: "JUDGEMENT" },
        lightning: { color: "text-amber-400", bg: "bg-amber-500", text: "VOLTAGE" },
        gamble: { color: "text-rose-500", bg: "bg-rose-600", text: "PAYOUT" },
        other: { color: "text-white", bg: "bg-white", text: "SCORE" }
    }[type] || { color: "text-white", bg: "bg-white", text: "SCORE" };

    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none">
            {/* Impact Text */}
            <motion.div
                initial={{ opacity: 0, scale: 2 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: "circOut" }}
                className={cn("text-xl font-bold tracking-[1em] uppercase mb-4", config.color)}
            >
                {config.text}
            </motion.div>

            {/* THE SCORE */}
            <motion.div
                className="relative"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
            >
                <div className={cn("text-[12rem] font-black leading-none tracking-tighter tabular-nums stroke-text", config.color)} style={{ textShadow: `0 0 100px currentColor` }}>
                    {score.toFixed(1)}
                </div>

                {/* Grading Seal */}
                <motion.div
                    initial={{ scale: 3, opacity: 0, rotate: 45 }}
                    animate={{ scale: 1, opacity: 1, rotate: -15 }}
                    transition={{ delay: 0.8, type: "spring" }}
                    className={cn(
                        "absolute -top-10 -right-10 px-4 py-2 border-4 rounded-xl text-4xl font-black uppercase tracking-widest bg-black/50 backdrop-blur-md",
                        isPass ? "border-emerald-500 text-emerald-500" : "border-stone-500 text-stone-500"
                    )}
                >
                    {isPass ? "S-RANK" : "FAIL"}
                </motion.div>
            </motion.div>

            {/* Controls (Pointer Events Auto) */}
            <AnimatePresence>
                {showControls && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-16 flex gap-4 pointer-events-auto"
                    >
                        {onRetry && !isPass && (
                            <button
                                onClick={onRetry}
                                className="px-8 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold backdrop-blur-md transition-all flex items-center gap-2 border border-white/20"
                            >
                                <RefreshCw className="w-5 h-5" /> Retry
                            </button>
                        )}
                        <button
                            onClick={onNext}
                            className={cn(
                                "px-10 py-4 rounded-full font-black text-lg transition-all flex items-center gap-2 shadow-[0_0_50px_rgba(0,0,0,0.5)] hover:scale-105 active:scale-95",
                                isPass ? "bg-white text-black" : "bg-stone-800 text-stone-400 hover:text-white"
                            )}
                        >
                            <span>CONTINUE</span> <ArrowRight className="w-5 h-5" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
