"use client";

import { motion } from "framer-motion";
import { Flame, Layers, RefreshCw, Skull, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRank } from "@/lib/rankUtils";
import type { DrillShellEffectsVisual } from "./DrillShellEffects";

interface DrillHeaderInfoDifficultyMeta {
    actualWordCount: number;
    listeningFeatures?: {
        trainingFocus?: string | null;
    } | null;
    status: "MATCHED" | "TOO_EASY" | "TOO_HARD" | "UNVALIDATED" | string;
}

interface DrillHeaderInfoTopicMeta {
    topic: string;
}

interface DrillHeaderInfoDrillData {
    _difficultyMeta?: DrillHeaderInfoDifficultyMeta | null;
    _topicMeta?: DrillHeaderInfoTopicMeta | null;
}

export interface DrillHeaderInfoProps {
    activeStreakTier: number;
    cooldownStreak: number;
    currentElo: number;
    currentStreak: number;
    defaultBaseElo: number;
    drillData: DrillHeaderInfoDrillData | null;
    isQuickMatch: boolean;
    isRebuildMode: boolean;
    isTranslationPassage: boolean;
    mode: string;
    onTopicResetIntervalChange: (value: number) => void;
    prefersReducedMotion: boolean;
    rouletteMultiplier: number | null;
    rouletteResult: "safe" | "dead" | null;
    streakTier: number;
    streakTransition: "surge" | "cooldown" | null;
    streakVisual: Pick<DrillShellEffectsVisual, "accent" | "badgeGlow"> & {
        badgeBorder: string;
        badgeGradient: string;
        badgeShadow: string;
    };
    topicResetInterval: number;
    translationPassageSegmentIndex: number;
    translationPassageTotalSegments: number;
    bossType?: string | null;
}

export function DrillHeaderInfo({
    activeStreakTier,
    bossType,
    cooldownStreak,
    currentElo,
    currentStreak,
    defaultBaseElo,
    drillData,
    isQuickMatch,
    isRebuildMode,
    isTranslationPassage,
    mode,
    onTopicResetIntervalChange,
    prefersReducedMotion,
    rouletteMultiplier,
    rouletteResult,
    streakTier,
    streakTransition,
    streakVisual,
    topicResetInterval,
    translationPassageSegmentIndex,
    translationPassageTotalSegments,
}: DrillHeaderInfoProps) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            {drillData && (
                <div className="flex items-center h-[38px] px-0.5 bg-white/60 backdrop-blur-xl rounded-full border border-white/60 shadow-[0_8px_24px_rgba(0,0,0,0.03)] ring-1 ring-stone-200/30 overflow-hidden transition-all shrink-0">
                    {(() => {
                        const rank = getRank(currentElo ?? defaultBaseElo);
                        return bossType === "roulette_execution" ? (
                            <div className="flex items-center gap-1.5 px-3 h-full rounded-full bg-red-900/10 text-red-700/90">
                                <Skull className="w-[14px] h-[14px] text-red-500" />
                                <span className="font-bold text-[11px] tracking-wider uppercase drop-shadow-sm">处决模式</span>
                            </div>
                        ) : rouletteResult === "safe" ? (
                            <div className="flex items-center gap-1.5 px-3 h-full rounded-full bg-amber-500/10 text-amber-700/90">
                                <Zap className="w-[14px] h-[14px] text-amber-500 fill-amber-500" />
                                <span className="font-bold text-[11px] tracking-wider uppercase drop-shadow-sm">x{rouletteMultiplier}</span>
                            </div>
                        ) : (
                            <div className={cn("flex items-center gap-1.5 px-2.5 h-full rounded-full", rank.color)}>
                                <rank.icon className="w-[14px] h-[14px]" />
                                <span className="font-bold text-[11px] tracking-wider uppercase drop-shadow-sm">{rank.title}</span>
                                <div className="w-[1px] h-3 bg-current opacity-20 mx-0.5" />
                                <span className="font-newsreader font-medium italic text-[13px]">{currentElo ?? defaultBaseElo}</span>
                            </div>
                        );
                    })()}

                    {drillData._difficultyMeta && !isRebuildMode && (
                        <>
                            <div className="w-[1px] h-3 bg-stone-300/40 rounded-full mx-0.5" />
                            <div
                                className={cn(
                                    "flex items-center px-2 h-full rounded-full text-[11px] font-bold transition-colors",
                                    drillData._difficultyMeta.status === "MATCHED"
                                        ? "text-emerald-700/80 hover:bg-emerald-50"
                                        : drillData._difficultyMeta.status === "TOO_EASY"
                                            ? "text-amber-700/80 hover:bg-amber-50"
                                            : drillData._difficultyMeta.status === "TOO_HARD"
                                                ? "text-rose-700/80 hover:bg-rose-50"
                                                : "text-slate-600/80 hover:bg-slate-100/70"
                                )}
                            >
                                <span>{drillData._difficultyMeta.actualWordCount}词</span>
                            </div>
                            {mode === "listening" && drillData._difficultyMeta.listeningFeatures?.trainingFocus ? (
                                <>
                                    <div className="w-[1px] h-3 bg-stone-300/40 rounded-full mx-0.5" />
                                    <div className="flex items-center px-2.5 h-full rounded-full text-[11px] font-bold text-sky-700/80 transition-colors hover:bg-sky-50">
                                        <span>{drillData._difficultyMeta.listeningFeatures.trainingFocus}</span>
                                    </div>
                                </>
                            ) : null}
                        </>
                    )}

                    {drillData._topicMeta && (
                        <>
                            <div className="w-[1px] h-3 bg-stone-300/40 rounded-full mx-0.5" />
                            <div
                                className="flex items-center gap-1 px-2.5 h-full rounded-full text-[11px] font-bold text-blue-700/80 transition-colors hover:bg-blue-50 cursor-pointer"
                                title={drillData._topicMeta.topic}
                            >
                                <span className="text-[12px] leading-none mb-[1px]">📌</span>
                                <span className="max-w-[108px] sm:max-w-[144px] truncate opacity-95">
                                    {drillData._topicMeta.topic}
                                </span>
                            </div>
                            {isQuickMatch && (
                                <div className="relative flex items-center h-full group">
                                    <div className="w-[1px] h-3 bg-stone-300/40 rounded-full mx-0.5" />
                                    <select
                                        value={topicResetInterval}
                                        onChange={(event) => onTopicResetIntervalChange(Number(event.target.value))}
                                        className="appearance-none bg-transparent outline-none cursor-pointer h-[24px] px-2 pr-5 text-[11px] font-bold text-indigo-600/80 hover:bg-indigo-50/80 focus:bg-indigo-50/80 rounded-full transition-colors z-10"
                                    >
                                        <option value={1}>每题一换</option>
                                        <option value={3}>3题连发</option>
                                        <option value={5}>5题连发</option>
                                        <option value={10}>10题连发</option>
                                        <option value={9999}>锁定主题</option>
                                    </select>
                                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400 group-hover:text-indigo-600 transition-colors z-0">
                                        <RefreshCw className="w-3 h-3" />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {isTranslationPassage && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center h-[38px] px-3 bg-white/60 backdrop-blur-xl rounded-full border border-violet-200/60 shadow-[0_8px_24px_rgba(139,92,246,0.08)] ring-1 ring-violet-200/30 overflow-hidden shrink-0 text-violet-700"
                >
                    <Layers className="w-[14px] h-[14px] mr-1.5" />
                    <span className="font-bold text-[11px] tracking-widest uppercase">
                        段落 {translationPassageSegmentIndex + 1} / {translationPassageTotalSegments}
                    </span>
                </motion.div>
            )}

            {(currentStreak >= 2 || streakTransition === "cooldown") && (
                <motion.div
                    initial={false}
                    animate={
                        streakTransition === "cooldown"
                            ? { scale: 0.96, y: 0, opacity: 0.72 }
                            : streakTransition === "surge"
                                ? { scale: [1, 1.08, 1.02], y: [0, -2, 0], opacity: [0.88, 1, 1] }
                                : activeStreakTier >= 3 && !prefersReducedMotion
                                    ? { scale: [1, 1.018, 1], y: [0, -0.5, 0], opacity: [0.98, 1, 0.98] }
                                    : { scale: 1, y: 0, opacity: 1 }
                    }
                    transition={{
                        duration: streakTransition ? 0.45 : activeStreakTier >= 3 ? 2.6 : 1.5,
                        repeat: !streakTransition && activeStreakTier >= 3 && !prefersReducedMotion ? Infinity : 0,
                        ease: streakTransition ? "easeOut" : "easeInOut",
                    }}
                    className="relative overflow-hidden rounded-full border px-3 py-1.5"
                    style={{
                        backgroundImage: streakVisual.badgeGradient,
                        borderColor: streakVisual.badgeBorder,
                        boxShadow: `0 0 0 1px ${streakVisual.badgeBorder}, ${streakVisual.badgeShadow}`,
                        color: streakVisual.accent,
                    }}
                >
                    <div
                        className="pointer-events-none absolute inset-0 rounded-full blur-xl"
                        style={{
                            background: `radial-gradient(circle at center, ${streakVisual.badgeGlow}, transparent 70%)`,
                            opacity: streakTier >= 2 ? 0.9 : 0.55,
                        }}
                    />
                    {activeStreakTier >= 3 && !prefersReducedMotion && (
                        <motion.div
                            className="pointer-events-none absolute inset-y-0 -inset-x-6 rounded-full"
                            style={{
                                background: "linear-gradient(112deg, transparent 6%, rgba(255,255,255,0.06) 28%, rgba(255,255,255,0.52) 50%, rgba(255,255,255,0.08) 72%, transparent 94%)",
                                filter: "blur(10px)",
                                mixBlendMode: "screen",
                            }}
                            animate={{
                                x: [-14, 14, -14],
                                opacity: [0.34, 0.72, 0.34],
                                scaleX: [0.985, 1.02, 0.985],
                            }}
                            transition={{
                                duration: activeStreakTier === 4 ? 3.1 : 4,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                        />
                    )}
                    <div className="relative z-10 flex items-center gap-1.5 font-bold text-[10px] tracking-[0.18em] uppercase">
                        <div
                            className="flex h-5 w-5 items-center justify-center rounded-full"
                            style={{
                                background: `radial-gradient(circle, rgba(255,255,255,0.7) 0%, ${streakVisual.badgeGlow} 45%, transparent 100%)`,
                            }}
                        >
                            <Flame className="h-3.5 w-3.5 fill-current" />
                        </div>
                        <span className="font-mono tabular-nums">{streakTransition === "cooldown" ? cooldownStreak : currentStreak}连</span>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
