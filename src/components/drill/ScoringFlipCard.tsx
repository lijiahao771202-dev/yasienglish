"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState, useEffect } from "react";

interface ScoringFlipCardProps {
    isScoring: boolean;
    userAnswer: string;
    mode: 'listening' | 'translation' | 'dictation';
    streakTier: 0 | 1 | 2 | 3 | 4;
    glassVariant?: "default" | "verdant";
}

const SCORING_PHASES: Record<ScoringFlipCardProps["mode"], Array<{ label: string; detail: string }>> = {
    translation: [
        { label: "Meaning", detail: "对齐原句含义" },
        { label: "Expression", detail: "检查表达自然度" },
        { label: "Score", detail: "封存最终评分" },
    ],
    listening: [
        { label: "Pronunciation", detail: "比对发音准确度" },
        { label: "Coverage", detail: "核对句子覆盖率" },
        { label: "Score", detail: "封存最终评分" },
    ],
    dictation: [
        { label: "Semantics", detail: "对齐中文语义准确度" },
        { label: "Coverage", detail: "核对关键信息完整度" },
        { label: "Score", detail: "封存最终评分" },
    ],
};

const SCORING_STREAK_PALETTES: Record<ScoringFlipCardProps["streakTier"], {
    backdrop: string;
    primaryOrb: string;
    secondaryOrb: string;
    cardBorder: string;
    cardShadow: string;
    iconBorder: string;
    iconBg: string;
    pulseBorder: string;
    dotFill: string;
    railBg: string;
    railSweep: string;
    labelColor: string;
    activePillBg: string;
    activePillBorder: string;
    activePillText: string;
    detailGlow: string;
}> = {
    0: {
        backdrop: "linear-gradient(180deg, rgba(250,248,244,0.86), rgba(247,244,238,0.95))",
        primaryOrb: "rgba(254,243,199,0.55)",
        secondaryOrb: "rgba(254,205,211,0.35)",
        cardBorder: "rgba(231,229,228,0.9)",
        cardShadow: "0 24px 70px rgba(28,25,23,0.08)",
        iconBorder: "rgba(253,230,138,0.9)",
        iconBg: "linear-gradient(135deg, #fffaf0, #fff7ed)",
        pulseBorder: "rgba(252,211,77,0.7)",
        dotFill: "radial-gradient(circle,#fbbf24 0%,#f59e0b 65%,#fb923c 100%)",
        railBg: "linear-gradient(90deg, rgba(245,158,11,0.12), rgba(251,191,36,0.22), rgba(245,158,11,0.12))",
        railSweep: "linear-gradient(90deg, transparent, rgba(245,158,11,0.92), rgba(251,191,36,0.55), transparent)",
        labelColor: "rgba(217,119,6,0.82)",
        activePillBg: "rgba(255,251,235,1)",
        activePillBorder: "rgba(252,211,77,0.92)",
        activePillText: "#b45309",
        detailGlow: "none",
    },
    1: {
        backdrop: "linear-gradient(180deg, rgba(255,248,237,0.9), rgba(255,244,232,0.96))",
        primaryOrb: "rgba(251,191,36,0.6)",
        secondaryOrb: "rgba(251,146,60,0.22)",
        cardBorder: "rgba(251,191,36,0.34)",
        cardShadow: "0 28px 78px rgba(249,115,22,0.12)",
        iconBorder: "rgba(251,146,60,0.46)",
        iconBg: "linear-gradient(135deg, #fff7ed, #ffedd5)",
        pulseBorder: "rgba(251,146,60,0.72)",
        dotFill: "radial-gradient(circle,#fbbf24 0%,#f97316 70%,#fb923c 100%)",
        railBg: "linear-gradient(90deg, rgba(249,115,22,0.16), rgba(251,191,36,0.26), rgba(249,115,22,0.16))",
        railSweep: "linear-gradient(90deg, transparent, rgba(249,115,22,0.96), rgba(251,191,36,0.7), transparent)",
        labelColor: "rgba(194,65,12,0.88)",
        activePillBg: "linear-gradient(135deg, rgba(255,247,237,1), rgba(255,237,213,0.95))",
        activePillBorder: "rgba(251,146,60,0.58)",
        activePillText: "#c2410c",
        detailGlow: "0 0 24px rgba(249,115,22,0.12)",
    },
    2: {
        backdrop: "linear-gradient(180deg, rgba(255,246,232,0.92), rgba(255,238,217,0.98))",
        primaryOrb: "rgba(249,115,22,0.26)",
        secondaryOrb: "rgba(250,204,21,0.24)",
        cardBorder: "rgba(249,115,22,0.34)",
        cardShadow: "0 30px 84px rgba(249,115,22,0.16)",
        iconBorder: "rgba(249,115,22,0.58)",
        iconBg: "linear-gradient(135deg, #fff7ed, #fed7aa)",
        pulseBorder: "rgba(251,146,60,0.78)",
        dotFill: "radial-gradient(circle,#fde68a 0%,#f97316 64%,#ea580c 100%)",
        railBg: "linear-gradient(90deg, rgba(249,115,22,0.18), rgba(251,191,36,0.3), rgba(249,115,22,0.18))",
        railSweep: "linear-gradient(90deg, transparent, rgba(249,115,22,0.98), rgba(250,204,21,0.82), transparent)",
        labelColor: "rgba(234,88,12,0.9)",
        activePillBg: "linear-gradient(135deg, rgba(255,245,230,1), rgba(254,215,170,0.95))",
        activePillBorder: "rgba(249,115,22,0.62)",
        activePillText: "#ea580c",
        detailGlow: "0 0 28px rgba(249,115,22,0.16)",
    },
    3: {
        backdrop: "linear-gradient(180deg, rgba(255,242,226,0.94), rgba(255,231,204,0.98))",
        primaryOrb: "rgba(249,115,22,0.3)",
        secondaryOrb: "rgba(250,204,21,0.28)",
        cardBorder: "rgba(251,146,60,0.4)",
        cardShadow: "0 34px 96px rgba(249,115,22,0.2)",
        iconBorder: "rgba(251,146,60,0.68)",
        iconBg: "linear-gradient(135deg, #fff4db, #fed7aa)",
        pulseBorder: "rgba(250,204,21,0.82)",
        dotFill: "radial-gradient(circle,#fff7cc 0%,#f59e0b 55%,#f97316 82%,#ea580c 100%)",
        railBg: "linear-gradient(90deg, rgba(249,115,22,0.22), rgba(250,204,21,0.34), rgba(249,115,22,0.22))",
        railSweep: "linear-gradient(90deg, transparent, rgba(251,146,60,1), rgba(255,247,205,0.88), rgba(249,115,22,0.92), transparent)",
        labelColor: "rgba(249,115,22,0.95)",
        activePillBg: "linear-gradient(135deg, rgba(255,240,222,1), rgba(254,178,84,0.9))",
        activePillBorder: "rgba(251,146,60,0.72)",
        activePillText: "#c2410c",
        detailGlow: "0 0 34px rgba(249,115,22,0.22)",
    },
    4: {
        backdrop: "linear-gradient(180deg, rgba(255,245,218,0.95), rgba(255,232,190,0.99))",
        primaryOrb: "rgba(250,204,21,0.34)",
        secondaryOrb: "rgba(249,115,22,0.26)",
        cardBorder: "rgba(250,204,21,0.44)",
        cardShadow: "0 38px 108px rgba(250,204,21,0.18)",
        iconBorder: "rgba(250,204,21,0.84)",
        iconBg: "linear-gradient(135deg, #fff7cc, #fcd34d)",
        pulseBorder: "rgba(255,247,205,0.86)",
        dotFill: "radial-gradient(circle,#fff7cc 0%,#facc15 45%,#f59e0b 72%,#f97316 100%)",
        railBg: "linear-gradient(90deg, rgba(250,204,21,0.24), rgba(255,247,205,0.36), rgba(249,115,22,0.24))",
        railSweep: "linear-gradient(90deg, transparent, rgba(255,247,205,1), rgba(250,204,21,1), rgba(249,115,22,0.94), transparent)",
        labelColor: "rgba(217,119,6,0.96)",
        activePillBg: "linear-gradient(135deg, rgba(255,247,205,1), rgba(250,204,21,0.94), rgba(251,146,60,0.88))",
        activePillBorder: "rgba(250,204,21,0.82)",
        activePillText: "#92400e",
        detailGlow: "0 0 42px rgba(250,204,21,0.24)",
    },
};

export function ScoringFlipCard({ isScoring, userAnswer, mode, streakTier, glassVariant = "default" }: ScoringFlipCardProps) {
    const [phaseIndex, setPhaseIndex] = useState(0);
    const prefersReducedMotion = useReducedMotion();
    const phases = SCORING_PHASES[mode];
    const streakPalette = SCORING_STREAK_PALETTES[streakTier];
    const isVerdantGlass = glassVariant === "verdant";
    const overlayBackdrop = isVerdantGlass
        ? "linear-gradient(180deg, rgba(2,44,34,0.28), rgba(2,44,34,0.36))"
        : streakPalette.backdrop;

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
                    className={[
                        "absolute inset-0 z-50 flex items-center justify-center overflow-hidden",
                        isVerdantGlass ? "backdrop-blur-[16px]" : "backdrop-blur-[10px]",
                    ].join(" ")}
                    style={{ backgroundImage: overlayBackdrop }}
                >
                    <motion.div
                        className="absolute inset-x-[18%] top-[18%] h-40 rounded-full blur-3xl"
                        style={{ backgroundColor: streakPalette.primaryOrb }}
                        animate={prefersReducedMotion ? { opacity: 0.65 } : { opacity: [0.45, 0.75, 0.45], scale: [0.98, 1.04, 0.98] }}
                        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className="absolute bottom-[14%] left-[16%] h-32 w-32 rounded-full blur-3xl"
                        style={{ backgroundColor: streakPalette.secondaryOrb }}
                        animate={prefersReducedMotion ? { opacity: 0.4 } : { x: [0, 18, 0], y: [0, -8, 0], opacity: [0.25, 0.45, 0.25] }}
                        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
                    />

                    <motion.div
                        initial={{ y: 18, opacity: 0, scale: 0.985 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        transition={{ delay: 0.06, duration: 0.35, ease: "easeOut" }}
                        className="relative z-10 w-full max-w-[34rem] px-6"
                    >
                        <div
                            className={[
                                "overflow-hidden rounded-[2rem] border",
                                isVerdantGlass
                                    ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(220,252,231,0.24))] backdrop-blur-[18px]"
                                    : "bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(252,250,247,0.9))]",
                            ].join(" ")}
                            style={{
                                borderColor: isVerdantGlass ? "rgba(209,250,229,0.52)" : streakPalette.cardBorder,
                                boxShadow: isVerdantGlass
                                    ? "0 28px 70px rgba(2,44,34,0.26), inset 0 1px 0 rgba(255,255,255,0.44)"
                                    : streakPalette.cardShadow,
                            }}
                        >
                            {streakTier >= 3 && (
                                <motion.div
                                    className="h-[2px] w-full"
                                    style={{ backgroundImage: streakPalette.railSweep }}
                                    animate={prefersReducedMotion ? { opacity: 0.72 } : { opacity: [0.55, 1, 0.65] }}
                                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                                />
                            )}
                            <div className={isVerdantGlass ? "border-b border-emerald-100/40 bg-white/30 px-6 py-4" : "border-b border-stone-200/70 bg-white/60 px-6 py-4"}>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <motion.div
                                            className="relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                                            style={{ borderColor: streakPalette.iconBorder, backgroundImage: streakPalette.iconBg }}
                                            animate={prefersReducedMotion ? {} : { scale: [1, 1.04, 1] }}
                                            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                                        >
                                            <motion.div
                                                className="absolute inset-0 rounded-full border"
                                                style={{ borderColor: streakPalette.pulseBorder }}
                                                animate={prefersReducedMotion ? { opacity: 0.45 } : { scale: [1, 1.45], opacity: [0.45, 0] }}
                                                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                                            />
                                            <div className="h-3.5 w-3.5 rounded-full" style={{ backgroundImage: streakPalette.dotFill }} />
                                        </motion.div>
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400">AI Judge</p>
                                            <p className={isVerdantGlass ? "mt-0.5 text-base font-semibold text-emerald-900" : "mt-0.5 text-base font-semibold text-stone-700"}>Scoring in progress</p>
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
                                <div className={isVerdantGlass ? "relative mb-6 overflow-hidden rounded-full bg-emerald-50/55 p-[3px]" : "relative mb-6 overflow-hidden rounded-full bg-stone-100/90 p-[3px]"}>
                                    <div className="h-2 rounded-full" style={{ backgroundImage: streakPalette.railBg }} />
                                    <motion.div
                                        className="absolute inset-y-[3px] left-0 w-1/3 rounded-full blur-[1px]"
                                        style={{ backgroundImage: streakPalette.railSweep }}
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
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: streakPalette.labelColor }}>
                                            {phases[phaseIndex].label}
                                        </p>
                                        <p className="mt-2 text-[1.9rem] leading-none text-stone-800 md:text-[2.1rem] font-newsreader" style={{ textShadow: streakPalette.detailGlow }}>
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
                                                        ? ""
                                                        : isPast
                                                            ? "border-stone-200 bg-white text-stone-600"
                                                            : "border-stone-200/80 bg-stone-50/80 text-stone-400"
                                                ].join(" ")}
                                                style={isActive ? {
                                                    backgroundImage: streakPalette.activePillBg,
                                                    borderColor: streakPalette.activePillBorder,
                                                    color: streakPalette.activePillText,
                                                    boxShadow: streakTier >= 2 ? `0 10px 22px ${streakPalette.activePillBorder.replace(/0\.[0-9]+\)$/, "0.18)")}` : undefined,
                                                } : undefined}
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
                                <div className={isVerdantGlass ? "border-t border-emerald-100/45 bg-emerald-50/36 px-6 py-4 md:px-7" : "border-t border-stone-200/70 bg-stone-50/80 px-6 py-4 md:px-7"}>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">Current Answer</p>
                                    <p className={isVerdantGlass ? "mt-2 line-clamp-2 text-base leading-7 text-emerald-800/85 font-newsreader italic" : "mt-2 line-clamp-2 text-base leading-7 text-stone-600 font-newsreader italic"}>
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
