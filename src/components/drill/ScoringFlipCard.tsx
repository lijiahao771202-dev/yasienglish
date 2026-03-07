"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

interface ScoringFlipCardProps {
    isScoring: boolean;
    userAnswer: string;
    mode: 'listening' | 'translation';
}

const SCORING_PHASES = [
    "Reviewing your answer",
    "Checking expression",
    "Finalizing score",
];

export function ScoringFlipCard({ isScoring, userAnswer, mode }: ScoringFlipCardProps) {
    const [phaseIndex, setPhaseIndex] = useState(0);

    useEffect(() => {
        if (!isScoring) {
            setPhaseIndex(0);
            return;
        }
        const interval = setInterval(() => {
            setPhaseIndex(prev => (prev + 1) % SCORING_PHASES.length);
        }, 1800);
        return () => clearInterval(interval);
    }, [isScoring]);

    return (
        <AnimatePresence>
            {isScoring && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="absolute inset-0 z-50 flex items-center justify-center"
                    style={{
                        background: 'linear-gradient(135deg, rgba(255,251,235,0.92) 0%, rgba(255,247,237,0.95) 50%, rgba(254,243,199,0.9) 100%)',
                        backdropFilter: 'blur(20px)',
                    }}
                >
                    {/* Warm ambient light spots */}
                    <div className="absolute top-[20%] right-[15%] w-64 h-64 rounded-full bg-amber-200/30 blur-[80px]" />
                    <div className="absolute bottom-[25%] left-[10%] w-48 h-48 rounded-full bg-rose-200/20 blur-[60px]" />

                    {/* Main Content */}
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }}
                        className="relative z-10 flex flex-col items-center gap-8"
                    >
                        {/* Warm Glass Card */}
                        <div
                            className="rounded-3xl px-10 py-10 flex flex-col items-center gap-6"
                            style={{
                                background: 'rgba(255, 255, 255, 0.65)',
                                backdropFilter: 'blur(24px)',
                                border: '1px solid rgba(255, 255, 255, 0.7)',
                                boxShadow: `
                                    0 20px 50px -12px rgba(245, 158, 11, 0.12),
                                    0 8px 20px -4px rgba(0, 0, 0, 0.04),
                                    inset 0 1px 2px rgba(255, 255, 255, 0.8)
                                `,
                            }}
                        >
                            {/* Warm Animated Orb */}
                            <div className="relative w-20 h-20">
                                {/* Outer ring - gentle rotation */}
                                <motion.div
                                    className="absolute inset-0 rounded-full"
                                    style={{
                                        background: 'conic-gradient(from 0deg, transparent 0%, #fbbf24 25%, #fb923c 50%, transparent 75%)',
                                        opacity: 0.6,
                                    }}
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                />
                                {/* Inner warm circle */}
                                <div
                                    className="absolute inset-[3px] rounded-full flex items-center justify-center"
                                    style={{
                                        background: 'linear-gradient(135deg, #fffbeb, #fff7ed)',
                                        boxShadow: 'inset 0 2px 8px rgba(245, 158, 11, 0.15), 0 2px 4px rgba(0,0,0,0.03)',
                                    }}
                                >
                                    {/* Warm pulsing core */}
                                    <motion.div
                                        className="w-6 h-6 rounded-full"
                                        style={{
                                            background: 'radial-gradient(circle, #fbbf24 0%, #f59e0b 60%, #fb923c 100%)',
                                        }}
                                        animate={{
                                            scale: [1, 1.3, 1],
                                            opacity: [0.7, 1, 0.7],
                                        }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                    />
                                </div>
                            </div>

                            {/* Phase Text */}
                            <div className="h-7 flex items-center">
                                <AnimatePresence mode="wait">
                                    <motion.p
                                        key={phaseIndex}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -6 }}
                                        transition={{ duration: 0.3 }}
                                        className="text-base font-medium text-stone-500 tracking-wide"
                                    >
                                        {SCORING_PHASES[phaseIndex]}
                                    </motion.p>
                                </AnimatePresence>
                            </div>

                            {/* Bouncing dots */}
                            <div className="flex gap-1.5">
                                {[0, 1, 2].map((i) => (
                                    <motion.div
                                        key={i}
                                        className="w-2 h-2 rounded-full bg-amber-400"
                                        animate={{ y: [0, -6, 0] }}
                                        transition={{
                                            duration: 0.6,
                                            repeat: Infinity,
                                            delay: i * 0.15,
                                            ease: "easeInOut",
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* User Answer Preview */}
                        {userAnswer && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4, duration: 0.5 }}
                                className="rounded-2xl px-6 py-3 max-w-xs text-center"
                                style={{
                                    background: 'rgba(255, 255, 255, 0.5)',
                                    backdropFilter: 'blur(12px)',
                                    border: '1px solid rgba(255, 255, 255, 0.5)',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.03), inset 0 1px 1px rgba(255,255,255,0.6)',
                                }}
                            >
                                <p className="text-sm text-stone-400 mb-1">Your answer</p>
                                <p className="text-base font-newsreader italic text-stone-600 leading-relaxed">
                                    "{userAnswer.length > 70 ? userAnswer.slice(0, 70) + "..." : userAnswer}"
                                </p>
                            </motion.div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
