"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface RebuildSelfEvalOption {
    className: string;
    label: string;
    value: "easy" | "just_right" | "hard";
}

export interface DrillBottomActionsProps {
    activeCosmeticUi: {
        nextButtonGlow: string;
        nextButtonGradient: string;
        nextButtonShadow: string;
    };
    bossActive: boolean;
    gambleActive: boolean;
    isFinalTranslationSegment: boolean;
    isGeneratingAnalysis: boolean;
    isRebuildMode: boolean;
    isRebuildPassage: boolean;
    isTranslationPassage: boolean;
    onNextQuestion: () => void;
    onPrevSegment: () => void;
    onRebuildPassageNext: () => void;
    onRebuildPassageRedo: () => void;
    onRebuildSelfEvaluate: (value: "easy" | "just_right" | "hard") => void;
    onTranslationSelfEvaluate: (value: "easy" | "just_right" | "hard") => void;
    onTranslationPassageNext: () => void;
    rebuildFeedbackPresent: boolean;
    rebuildPassageSummaryPresent: boolean;
    rebuildSelfEvaluationLocked: boolean;
    rebuildSentenceShadowingIdle: boolean;
    showFeedbackCta: boolean;
    showPrevSegment: boolean;
    showTranslationSelfEvaluation: boolean;
    streakTier: number;
    streakVisual: {
        badgeGlow: string;
        nextGradient: string;
        nextShadow: string;
    };
    translationSelfEvaluationLocked: boolean;
}

const REBUILD_OPTIONS: RebuildSelfEvalOption[] = [
    {
        value: "easy",
        label: "简单",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800 shadow-[0_3px_0_theme(colors.emerald.200)] hover:bg-emerald-100 hover:shadow-[0_4px_0_theme(colors.emerald.300)] active:translate-y-[3px] active:shadow-[0_0px_0_theme(colors.emerald.300)]",
    },
    {
        value: "just_right",
        label: "刚好",
        className: "border-sky-200 bg-sky-50 text-sky-800 shadow-[0_3px_0_theme(colors.sky.200)] hover:bg-sky-100 hover:shadow-[0_4px_0_theme(colors.sky.300)] active:translate-y-[3px] active:shadow-[0_0px_0_theme(colors.sky.300)]",
    },
    {
        value: "hard",
        label: "难",
        className: "border-amber-200 bg-amber-50 text-amber-800 shadow-[0_3px_0_theme(colors.amber.200)] hover:bg-amber-100 hover:shadow-[0_4px_0_theme(colors.amber.300)] active:translate-y-[3px] active:shadow-[0_0px_0_theme(colors.amber.300)]",
    },
];

export function DrillBottomActions({
    activeCosmeticUi,
    bossActive,
    gambleActive,
    isFinalTranslationSegment,
    isGeneratingAnalysis,
    isRebuildMode,
    isRebuildPassage,
    isTranslationPassage,
    onNextQuestion,
    onPrevSegment,
    onRebuildPassageNext,
    onRebuildPassageRedo,
    onRebuildSelfEvaluate,
    onTranslationSelfEvaluate,
    onTranslationPassageNext,
    rebuildFeedbackPresent,
    rebuildPassageSummaryPresent,
    rebuildSelfEvaluationLocked,
    rebuildSentenceShadowingIdle,
    showFeedbackCta,
    showPrevSegment,
    showTranslationSelfEvaluation,
    streakTier,
    streakVisual,
    translationSelfEvaluationLocked,
}: DrillBottomActionsProps) {
    return (
        <AnimatePresence>
            {showTranslationSelfEvaluation && !bossActive && !gambleActive ? (
                <motion.div
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 40, opacity: 0 }}
                    className="absolute bottom-6 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 pointer-events-none md:bottom-8"
                >
                    <div className="pointer-events-auto rounded-[1.4rem] border border-stone-200/80 bg-white/95 p-2 shadow-[0_12px_40px_rgba(20,20,20,0.06)] backdrop-blur-xl">
                        <div className="grid grid-cols-3 gap-2">
                            {REBUILD_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => onTranslationSelfEvaluate(option.value)}
                                    disabled={translationSelfEvaluationLocked}
                                    className={cn(
                                        "inline-flex h-12 items-center justify-center rounded-[1rem] border px-4 text-[15px] font-bold tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0",
                                        option.className,
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.div>
            ) : null}

            {isRebuildMode && rebuildFeedbackPresent && !isRebuildPassage && rebuildSentenceShadowingIdle && !rebuildPassageSummaryPresent && !bossActive && !gambleActive ? (
                <motion.div
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 40, opacity: 0 }}
                    className="absolute bottom-6 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 pointer-events-none md:bottom-8"
                >
                    <div className="pointer-events-auto rounded-[1.4rem] border border-stone-200/80 bg-white/95 p-2 shadow-[0_12px_40px_rgba(20,20,20,0.06)] backdrop-blur-xl">
                        <div className="grid grid-cols-3 gap-2">
                            {REBUILD_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => onRebuildSelfEvaluate(option.value)}
                                    disabled={rebuildSelfEvaluationLocked}
                                    className={cn(
                                        "inline-flex h-12 items-center justify-center rounded-[1rem] border px-4 text-[15px] font-bold tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0",
                                        option.className,
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.div>
            ) : null}

            {isRebuildMode && rebuildPassageSummaryPresent && !bossActive && !gambleActive ? (
                <motion.div
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 40, opacity: 0 }}
                    className="absolute bottom-6 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 pointer-events-none md:bottom-8"
                >
                    <div className="pointer-events-auto filter drop-shadow-2xl flex items-center gap-3">
                        <button
                            onClick={onRebuildPassageRedo}
                            className="group relative flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/60 bg-white/30 backdrop-blur-xl px-5 py-3.5 text-sm font-bold tracking-wide text-stone-700 transition-all hover:scale-105 hover:bg-white/50 active:scale-95 md:text-base shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
                        >
                            <RotateCcw className="relative z-10 h-4 w-4 transition-transform group-hover:-rotate-45" />
                            <span className="relative z-10 font-bold">重做</span>
                        </button>
                        <button
                            onClick={onRebuildPassageNext}
                            className="group relative flex flex-1 items-center justify-center gap-3 rounded-full px-8 py-3.5 text-sm font-bold tracking-wide text-white transition-all hover:scale-105 active:scale-95 md:text-base"
                            style={{
                                background: activeCosmeticUi.nextButtonGradient,
                                boxShadow: activeCosmeticUi.nextButtonShadow,
                            }}
                        >
                            <span className="relative z-10 font-bold">{isRebuildPassage ? "Next Passage" : "Next Question"}</span>
                            <ArrowRight className="relative z-10 h-5 w-5 transition-transform group-hover:translate-x-1" />
                            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent group-hover:animate-[shimmer_1.5s_infinite] z-0" />
                        </button>
                    </div>
                </motion.div>
            ) : null}

            {showFeedbackCta && !bossActive && !gambleActive ? (
                <motion.div
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 50, opacity: 0 }}
                    className="absolute bottom-8 right-6 z-[70] pointer-events-none md:right-10"
                >
                    <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-3 filter drop-shadow-2xl">
                        {showPrevSegment ? (
                            <button
                                onClick={onPrevSegment}
                                className="group relative flex items-center gap-2 rounded-full border border-stone-200 bg-white px-6 py-3.5 text-sm font-bold tracking-wide text-stone-700 shadow-sm transition-all hover:bg-stone-50 active:scale-95 md:text-base"
                            >
                                <ArrowLeft className="w-5 h-5 text-stone-500 transition-transform group-hover:-translate-x-1" />
                                <span className="relative z-10 font-bold">Prev Segment</span>
                            </button>
                        ) : null}

                        {!showTranslationSelfEvaluation && !(isRebuildMode && !isRebuildPassage) && (
                            <button
                                onClick={isTranslationPassage && !isFinalTranslationSegment ? onTranslationPassageNext : onNextQuestion}
                                disabled={isGeneratingAnalysis}
                                className="group relative flex shrink-0 items-center gap-3 overflow-hidden rounded-full px-8 py-3.5 text-sm font-bold tracking-wide text-white transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:scale-100 md:text-base"
                                style={{
                                    background: streakTier > 0 ? streakVisual.nextGradient : activeCosmeticUi.nextButtonGradient,
                                    boxShadow: streakTier > 0 ? streakVisual.nextShadow : activeCosmeticUi.nextButtonShadow,
                                }}
                            >
                                <span className="relative z-10 font-bold">
                                    {isTranslationPassage
                                        ? (isFinalTranslationSegment ? "Settle Translation" : "Next Segment")
                                        : "Next Question"}
                                </span>
                                <ArrowRight className="w-5 h-5 relative z-10 transition-transform group-hover:translate-x-1" />
                                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent group-hover:animate-[shimmer_1.5s_infinite] z-0" />
                                <div
                                    className="absolute inset-0 rounded-full blur-xl opacity-0 transition-opacity group-hover:opacity-100"
                                    style={{ background: `radial-gradient(circle at center, ${streakTier > 0 ? streakVisual.badgeGlow : activeCosmeticUi.nextButtonGlow}, transparent 70%)` }}
                                />
                            </button>
                        )}
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
