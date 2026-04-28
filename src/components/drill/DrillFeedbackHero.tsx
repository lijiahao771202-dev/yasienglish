"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRank } from "@/lib/rankUtils";

interface DrillFeedbackHeroFeedback {
    eloAdjustment?: number | null;
    _error?: boolean;
    _isLocalEvaluation?: boolean;
    _literalScore?: number;
    _nlpScore?: number;
    _vectorScore?: number;
    objectiveScore?: number;
    selfEvaluation?: "easy" | "just_right" | "hard" | null;
    judge_reasoning?: string;
    score: number;
}

export interface DrillFeedbackHeroProps {
    currentElo: number;
    defaultBaseElo: number;
    eloChange: number | null;
    feedback: DrillFeedbackHeroFeedback;
    isSubmitting: boolean;
    mode: string;
    onAppeal: () => void;
    onRetryScore: () => void;
    prefersReducedMotion: boolean;
    recapNode: ReactNode;
    streakTier: number;
    streakVisualScoreGlow?: string;
}

export function DrillFeedbackHero({
    currentElo,
    defaultBaseElo,
    eloChange,
    feedback,
    isSubmitting,
    mode,
    onAppeal,
    onRetryScore,
    prefersReducedMotion,
    recapNode,
    streakTier,
    streakVisualScoreGlow,
}: DrillFeedbackHeroProps) {
    const selfEvaluationLabel = feedback.selfEvaluation === "easy"
        ? "简单"
        : feedback.selfEvaluation === "hard"
            ? "难"
            : "刚好";

    if (feedback._error) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
                <div className="text-4xl">⚠️</div>
                <p className="text-stone-600 font-medium text-center">评分服务暂时不可用</p>
                <p className="text-stone-400 text-sm text-center">
                    {typeof feedback.judge_reasoning === "string" && feedback.judge_reasoning.trim().length > 0
                        ? feedback.judge_reasoning
                        : "请重试。"}
                </p>
                <button
                    onClick={onRetryScore}
                    className="mt-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-lg transition-all"
                >
                    重新评分
                </button>
            </div>
        );
    }

    return (
        <div className={cn("max-w-4xl mx-auto w-full space-y-4 transition-transform duration-100", feedback.score <= 4 && "animate-[shake_0.5s_ease-in-out]")}>
            <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 5, y: "25vh", filter: "blur(10px)" }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                transition={{ type: "spring" as const, damping: 15, stiffness: 100, mass: 0.8 }}
                className="flex flex-col md:flex-row items-center justify-between gap-4 px-4 py-2 relative z-50 pointer-events-none"
            >
                <div className="flex items-center gap-4 pointer-events-auto">
                    <div
                        className={cn(
                            "text-4xl font-bold font-newsreader drop-shadow-sm",
                            feedback.score >= 8 ? "text-emerald-600" : feedback.score >= 6 ? "text-amber-500" : "text-rose-500"
                        )}
                        style={streakTier > 0 && feedback.score >= 8 && streakVisualScoreGlow ? { textShadow: streakVisualScoreGlow } : undefined}
                    >
                        {feedback.score}
                        <span className="text-xl text-stone-300 font-normal">/10</span>
                    </div>

                    {mode !== "listening" && feedback._vectorScore !== undefined ? (
                        <div className="flex items-center gap-3 text-sm font-bold font-newsreader bg-white/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-stone-200/50 shadow-sm">
                            <span className="text-emerald-600" title="向量语义">V: {feedback._vectorScore}</span>
                            <span className="text-stone-300">|</span>
                            <span className="text-purple-600" title="NLP核心">N: {feedback._nlpScore}</span>
                            <span className="text-stone-300">|</span>
                            <span className="text-sky-600" title="字面结构">L: {feedback._literalScore}</span>
                        </div>
                    ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pointer-events-auto">
                    {feedback._isLocalEvaluation && feedback.score < 9.5 && !feedback.selfEvaluation ? (
                        <button
                            onClick={onAppeal}
                            disabled={isSubmitting}
                            className="flex items-center gap-1.5 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-full text-xs font-bold transition-all border border-indigo-100 shadow-sm"
                        >
                            <Wand2 className={cn("w-3.5 h-3.5", isSubmitting && "animate-spin")} />
                            {isSubmitting ? "AI..." : "AI 裁判重判"}
                        </button>
                    ) : null}

                    {typeof feedback.objectiveScore === "number" && typeof feedback.eloAdjustment === "number" && feedback.selfEvaluation ? (
                        <div className="flex items-center gap-2 rounded-full border border-stone-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-bold text-stone-600 shadow-sm">
                            <span>AI {feedback.objectiveScore.toFixed(1)}</span>
                            <span className="text-stone-300">/</span>
                            <span>自评 {selfEvaluationLabel}</span>
                            <span className="text-stone-300">/</span>
                            <span className="text-indigo-600">Elo {feedback.eloAdjustment > 0 ? "+" : ""}{feedback.eloAdjustment}</span>
                        </div>
                    ) : null}

                    {eloChange !== null ? (
                        <div className="flex items-center gap-2">
                            {(() => {
                                const rank = getRank(currentElo ?? defaultBaseElo);
                                return (
                                    <span className={cn("text-[10px] font-bold uppercase tracking-widest", rank.color.replace("bg-", "text-"))}>
                                        {rank.title}
                                    </span>
                                );
                            })()}

                            <div
                                className={cn(
                                    "px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1 shadow-sm border",
                                    eloChange > 0
                                        ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                        : eloChange < 0
                                            ? "bg-rose-50 text-rose-600 border-rose-100"
                                            : "bg-stone-50 text-stone-600 border-stone-200"
                                )}
                            >
                                <TrendingUp className={cn("w-3.5 h-3.5", eloChange < 0 && "rotate-180", eloChange === 0 && "rotate-90 opacity-40")} />
                                <span>{eloChange > 0 ? "+" : ""}{eloChange} Elo</span>
                            </div>
                        </div>
                    ) : null}
                </div>
            </motion.div>

            {recapNode}
        </div>
    );
}
