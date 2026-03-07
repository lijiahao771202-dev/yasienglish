"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState, useEffect } from "react";

interface ScoringFlipCardProps {
    isScoring: boolean;
    userAnswer: string;
    mode: 'listening' | 'translation';
}

const SCORING_PHASES: Record<ScoringFlipCardProps["mode"], Array<{ label: string; detail: string }>> = {
    translation: [
        { label: "Meaning", detail: "对齐原句含义" },
        { label: "Expression", detail: "检查表达自然度" },
        { label: "Score", detail: "封存最终评分" },
    ],
    listening: [
        { label: "Pronunciation", detail: "比对发音准确度" },
        { label: "Fluency", detail: "检查复述流畅度" },
        { label: "Score", detail: "封存最终评分" },
    ],
};

export function ScoringFlipCard({ isScoring, userAnswer, mode }: ScoringFlipCardProps) {
    const [phaseIndex, setPhaseIndex] = useState(0);
    const prefersReducedMotion = useReducedMotion();
    const phases = SCORING_PHASES[mode];

    useEffect(() => {
        if (!isScoring) return;
        const interval = setInterval(() => {
            setPhaseIndex(prev => (prev + 1) % phases.length);
        }, 1400);
        return () => clearInterval(interval);
    }, [isScoring, phases.length]);

    return (
        <AnimatePresence>
            {isScoring && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-[linear-gradient(180deg,rgba(250,248,244,0.86),rgba(247,244,238,0.95))] backdrop-blur-[10px]"
                >
                    <motion.div
                        className="absolute inset-x-[18%] top-[18%] h-40 rounded-full bg-amber-100/55 blur-3xl"
                        animate={prefersReducedMotion ? { opacity: 0.65 } : { opacity: [0.45, 0.75, 0.45], scale: [0.98, 1.04, 0.98] }}
                        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className="absolute bottom-[14%] left-[16%] h-32 w-32 rounded-full bg-rose-100/35 blur-3xl"
                        animate={prefersReducedMotion ? { opacity: 0.4 } : { x: [0, 18, 0], y: [0, -8, 0], opacity: [0.25, 0.45, 0.25] }}
                        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
                    />

                    <motion.div
                        initial={{ y: 18, opacity: 0, scale: 0.985 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        transition={{ delay: 0.06, duration: 0.35, ease: "easeOut" }}
                        className="relative z-10 w-full max-w-[34rem] px-6"
                    >
                        <div className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(252,250,247,0.9))] shadow-[0_24px_70px_rgba(28,25,23,0.08)]">
                            <div className="border-b border-stone-200/70 bg-white/60 px-6 py-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <motion.div
                                            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-amber-200/90 bg-[linear-gradient(135deg,#fffaf0,#fff7ed)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                                            animate={prefersReducedMotion ? {} : { scale: [1, 1.04, 1] }}
                                            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                                        >
                                            <motion.div
                                                className="absolute inset-0 rounded-full border border-amber-300/70"
                                                animate={prefersReducedMotion ? { opacity: 0.45 } : { scale: [1, 1.45], opacity: [0.45, 0] }}
                                                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                                            />
                                            <div className="h-3.5 w-3.5 rounded-full bg-[radial-gradient(circle,#fbbf24_0%,#f59e0b_65%,#fb923c_100%)]" />
                                        </motion.div>
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400">AI Judge</p>
                                            <p className="mt-0.5 text-base font-semibold text-stone-700">Scoring in progress</p>
                                        </div>
                                    </div>
                                    <div className="hidden items-center gap-2 rounded-full border border-stone-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-stone-500 md:flex">
                                        <span className="tabular-nums">{phaseIndex + 1}</span>
                                        <span>/</span>
                                        <span className="tabular-nums">{phases.length}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="px-6 py-6 md:px-7 md:py-7">
                                <div className="relative mb-6 overflow-hidden rounded-full bg-stone-100/90 p-[3px]">
                                    <div className="h-2 rounded-full bg-[linear-gradient(90deg,rgba(245,158,11,0.12),rgba(251,191,36,0.22),rgba(245,158,11,0.12))]" />
                                    <motion.div
                                        className="absolute inset-y-[3px] left-0 w-1/3 rounded-full bg-[linear-gradient(90deg,transparent,rgba(245,158,11,0.92),rgba(251,191,36,0.55),transparent)] blur-[1px]"
                                        animate={prefersReducedMotion ? { x: "130%" } : { x: ["-40%", "240%"] }}
                                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                    />
                                </div>
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={phaseIndex}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.24 }}
                                        className="min-h-[5.5rem]"
                                    >
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600/80">
                                            {phases[phaseIndex].label}
                                        </p>
                                        <p className="mt-2 text-[1.9rem] leading-none text-stone-800 md:text-[2.1rem] font-newsreader">
                                            {phases[phaseIndex].detail}
                                        </p>
                                        <p className="mt-3 max-w-md text-sm leading-6 text-stone-500">
                                            正在快速完成本题评分。详细解析不再自动生成，只有手动请求时才会额外调用 AI。
                                        </p>
                                    </motion.div>
                                </AnimatePresence>

                                <div className="mt-5 flex flex-wrap gap-2">
                                    {phases.map((phase, index) => {
                                        const isActive = index === phaseIndex;
                                        const isPast = index < phaseIndex;
                                        return (
                                            <motion.div
                                                key={phase.label}
                                                className={[
                                                    "rounded-full border px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase transition-colors",
                                                    isActive
                                                        ? "border-amber-300 bg-amber-50 text-amber-700 shadow-[0_8px_18px_rgba(245,158,11,0.12)]"
                                                        : isPast
                                                            ? "border-stone-200 bg-white text-stone-600"
                                                            : "border-stone-200/80 bg-stone-50/80 text-stone-400"
                                                ].join(" ")}
                                                animate={isActive && !prefersReducedMotion ? { y: [0, -2, 0] } : {}}
                                                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                                            >
                                                {phase.label}
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>

                            {userAnswer && (
                                <div className="border-t border-stone-200/70 bg-stone-50/80 px-6 py-4 md:px-7">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">Current Answer</p>
                                    <p className="mt-2 line-clamp-2 text-base leading-7 text-stone-600 font-newsreader italic">
                                        &ldquo;{userAnswer.length > 120 ? userAnswer.slice(0, 120) + "..." : userAnswer}&rdquo;
                                    </p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
