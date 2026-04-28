"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, RefreshCw, TrendingDown, TrendingUp, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSentenceAudioCacheKey } from "@/lib/drill-rebuild-helpers";
import type {
    RebuildPassageSegmentResultState,
    RebuildPassageSegmentUiState,
    RebuildPassageSummaryState,
} from "@/lib/drill-rebuild-types";
import type { RebuildSelfEvaluation } from "@/lib/rebuild-mode";

interface RebuildQuestionPassageSegment {
    id: string;
    chinese: string;
    referenceEnglish: string;
}

interface RebuildQuestionPassageSession {
    segmentCount: 2 | 3 | 5;
    currentIndex: number;
    segments: RebuildQuestionPassageSegment[];
}

interface RebuildQuestionDrillData {
    chinese: string;
    reference_english: string;
    _rebuildMeta?: {
        variant?: "sentence" | "passage";
        passageSession?: RebuildQuestionPassageSession;
    };
}

interface RebuildQuestionTheme {
    textClass: string;
    mutedClass: string;
}

interface RebuildQuestionUi {
    ledgerClass: string;
    inputShellClass: string;
    audioLockedClass: string;
    audioUnlockedClass: string;
    checkButtonClass: string;
    wordBadgeActiveClass: string;
    iconButtonClass: string;
    nextButtonGradient: string;
    nextButtonShadow: string;
    nextButtonGlow: string;
}

export interface RebuildQuestionPanelProps {
    activeCosmeticTheme: RebuildQuestionTheme;
    activeCosmeticUi: RebuildQuestionUi;
    activePassageSegmentIndex: number;
    audioSourceText: string | null;
    buildSentenceIpa: (sentence: string) => string;
    drillData: RebuildQuestionDrillData | null;
    isAudioLoading: boolean;
    isIpaReady: boolean;
    isPlaying: boolean;
    isVerdantRebuild: boolean;
    loadingAudioKeys: Set<string>;
    onCyclePlaybackSpeed: () => void;
    onPlayAudio: (text?: string) => void | Promise<unknown>;
    onRebuildSelfEvaluate: (evaluation: RebuildSelfEvaluation) => void;
    onTogglePassageChinese: (segmentIndex: number) => void;
    playbackSpeed: number;
    prefersReducedMotion: boolean | null;
    rebuildPassageResults: RebuildPassageSegmentResultState[];
    rebuildPassageSummary: RebuildPassageSummaryState | null;
    rebuildPassageUiState: RebuildPassageSegmentUiState[];
    renderInteractiveText: (text: string) => ReactNode;
    renderRebuildComposer: (
        submitLabel?: string,
        compact?: boolean,
        readOnlyAfterSubmit?: boolean,
        nextPendingSegmentIndex?: number,
        audioTextToPlay?: string
    ) => ReactNode;
    showChinese: boolean;
    hasSentenceFeedback?: boolean;
}

export function RebuildQuestionPanel({
    activeCosmeticTheme,
    activeCosmeticUi,
    activePassageSegmentIndex,
    audioSourceText,
    buildSentenceIpa,
    drillData,
    hasSentenceFeedback,
    isAudioLoading,
    isIpaReady,
    isPlaying,
    isVerdantRebuild,
    loadingAudioKeys,
    onCyclePlaybackSpeed,
    onPlayAudio,
    onRebuildSelfEvaluate,
    onTogglePassageChinese,
    playbackSpeed,
    prefersReducedMotion,
    rebuildPassageResults,
    rebuildPassageSummary,
    rebuildPassageUiState,
    renderInteractiveText,
    renderRebuildComposer,
    showChinese,
}: RebuildQuestionPanelProps) {
    if (!drillData?._rebuildMeta) return null;

    const localPassageSession = drillData._rebuildMeta.variant === "passage" ? drillData._rebuildMeta.passageSession : null;
    const rebuildLedgerClass = isVerdantRebuild
        ? "bg-[#eef6f1]/94 border-emerald-200/80 shadow-[0_10px_24px_rgba(2,44,34,0.12)]"
        : activeCosmeticUi.ledgerClass;
    const rebuildSummaryMetricCardClass = isVerdantRebuild
        ? "rounded-[1.25rem] border border-emerald-200/75 bg-[#f7fcf8] p-4 shadow-[0_5px_14px_rgba(2,44,34,0.08)]"
        : cn("rounded-[1.25rem] border p-4", activeCosmeticUi.inputShellClass);
    const rebuildSummarySegmentCardClass = isVerdantRebuild
        ? "rounded-[1.35rem] border border-emerald-200/75 bg-[#f8fcf9] px-4 py-4 shadow-[0_6px_16px_rgba(2,44,34,0.08)]"
        : cn("rounded-[1.35rem] border px-4 py-4", activeCosmeticUi.inputShellClass);
    const rebuildSummaryPillClass = isVerdantRebuild
        ? "border border-emerald-200/50 bg-white/60 backdrop-blur-md text-emerald-700 shadow-[0_3px_10px_rgba(2,44,34,0.05),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-1 ring-black/[0.02]"
        : "border border-white/40 bg-white/40 dark:bg-white/5 backdrop-blur-md text-theme-text shadow-[0_3px_10px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.6)] ring-1 ring-black/[0.02] dark:ring-white/[0.05]";
    const rebuildSummaryAccentPillClass = isVerdantRebuild
        ? "border border-emerald-300/60 bg-emerald-100/60 backdrop-blur-md text-emerald-800 shadow-[0_3px_10px_rgba(2,44,34,0.06),inset_0_1px_1px_rgba(255,255,255,0.9)] ring-1 ring-black/[0.02]"
        : "border border-[color:var(--theme-active-bg)]/30 bg-[color:var(--theme-active-bg)]/20 backdrop-blur-md text-[color:var(--theme-active-bg)] shadow-[0_3px_10px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.5)] ring-1 ring-black/[0.02]";
    const rebuildControlButtonClass = isVerdantRebuild
        ? "border border-emerald-200/50 bg-emerald-50/60 backdrop-blur-md text-emerald-800 shadow-[0_4px_12px_rgba(2,44,34,0.05),inset_0_1px_1px_rgba(255,255,255,0.8)] hover:-translate-y-0.5 hover:bg-emerald-100/80 ring-1 ring-black/[0.02]"
        : "border border-white/40 bg-white/40 dark:bg-white/5 backdrop-blur-md text-theme-text shadow-[0_4px_12px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.6)] hover:-translate-y-0.5 hover:bg-white/60 dark:hover:bg-white/10 ring-1 ring-black/[0.02] dark:ring-white/[0.05]";
    const rebuildControlActiveButtonClass = isVerdantRebuild
        ? "border border-emerald-300/80 bg-emerald-100/90 backdrop-blur-md text-emerald-800 shadow-[0_2px_8px_rgba(2,44,34,0.06),inset_0_1px_1px_rgba(255,255,255,0.9)] ring-1 ring-black/[0.02]"
        : "border border-[color:var(--theme-active-bg)]/40 bg-[color:var(--theme-active-bg)]/25 backdrop-blur-md text-[color:var(--theme-active-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.5)] ring-1 ring-black/[0.02]";
    if (!localPassageSession) {
        return (
            <div className="w-full max-w-4xl relative">
                <AnimatePresence>
                    {showChinese ? (
                        <motion.div
                            key="rebuild-chinese-hint"
                            initial={prefersReducedMotion ? false : { opacity: 0, y: 8, filter: "blur(4px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            exit={{ opacity: 0, y: 4, filter: "blur(4px)" }}
                            transition={prefersReducedMotion ? { duration: 0.12 } : { duration: 0.25, ease: "easeOut" }}
                            className="absolute left-0 right-0 bottom-full mb-2 z-10 pointer-events-none"
                        >
                            <p className={cn("text-center text-sm font-medium leading-relaxed px-4 py-1.5 md:text-base", activeCosmeticTheme.mutedClass)}>
                                {drillData.chinese}
                            </p>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
                <motion.div
                    className="w-full"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 20, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={prefersReducedMotion ? { duration: 0.15 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }}
                >
                    {renderRebuildComposer("发送", false, hasSentenceFeedback)}
                </motion.div>
            </div>
        );
    }

    const resultMap = new Map(rebuildPassageResults.map((item) => [item.segmentIndex, item]));
    const submittedCount = rebuildPassageResults.length;
    const sessionObjectivePreview = submittedCount > 0
        ? Math.round(rebuildPassageResults.reduce((total, item) => total + item.objectiveScore100, 0) / submittedCount)
        : 0;
    const totalSegments = localPassageSession.segmentCount;
    const activeSegment = localPassageSession.segments[activePassageSegmentIndex] ?? localPassageSession.segments[0];
    const activeSegmentAudioKey = getSentenceAudioCacheKey(activeSegment?.referenceEnglish ?? "");
    const isActivePassageAudioLoading = loadingAudioKeys.has(activeSegmentAudioKey);
    const activeSegmentResult = resultMap.get(activePassageSegmentIndex) ?? null;
    const nextPendingSegmentIndex = localPassageSession.segments.findIndex((_, index) =>
        index > activePassageSegmentIndex && !resultMap.has(index),
    );
    const fallbackPendingSegmentIndex = localPassageSession.segments.findIndex((_, index) => !resultMap.has(index));
    const resolvedNextPendingSegmentIndex = nextPendingSegmentIndex >= 0
        ? nextPendingSegmentIndex
        : fallbackPendingSegmentIndex;
    const activeSegmentSentenceIpa = activeSegmentResult
        ? buildSentenceIpa(activeSegment.referenceEnglish)
        : "";
    const currentStageNumber = activePassageSegmentIndex + 1;
    const stageProgressDisplayCount = Math.min(totalSegments, Math.max(submittedCount, currentStageNumber));
    const stageProgressPercent = totalSegments > 0
        ? Math.round((stageProgressDisplayCount / totalSegments) * 100)
        : 0;
    const completedSegments = localPassageSession.segments
        .map((segment, index) => ({
            segment,
            index,
            result: resultMap.get(index) ?? null,
        }))
        .filter((item) => Boolean(item.result));

    if (!activeSegment) return null;

    const renderPassageSentence = (segment: RebuildQuestionPassageSegment, revealed: boolean) => {
        if (revealed) {
            return (
                <p className={cn(
                    "mx-auto max-w-[35rem] font-sans text-[1.12rem] font-medium leading-[2rem] tracking-[0.01em] md:max-w-[39rem] md:text-[1.22rem] md:leading-[2.18rem]",
                    activeCosmeticTheme.textClass,
                )}>
                    {renderInteractiveText(segment.referenceEnglish)}
                </p>
            );
        }

        return (
            <p className={cn(
                "mx-auto max-w-[35rem] select-none font-sans text-[1.12rem] font-medium leading-[2rem] tracking-[0.01em] blur-[7px] md:max-w-[39rem] md:text-[1.22rem] md:leading-[2.18rem]",
                activeCosmeticTheme.mutedClass,
            )}>
                {segment.referenceEnglish}
            </p>
        );
    };

    return (
        <motion.div
            className="mx-auto w-full max-w-[820px] space-y-3"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={prefersReducedMotion ? { duration: 0.15 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
        >
            {!rebuildPassageSummary ? (
                <>
                <section className={cn(
                    "w-full rounded-[2rem] overflow-hidden transition-all duration-500 mb-4",
                    isVerdantRebuild 
                        ? "bg-emerald-50/30 backdrop-blur-xl border border-emerald-100/50 shadow-sm" 
                        : "bg-white/30 dark:bg-black/20 backdrop-blur-xl border border-white/20 dark:border-white/5 shadow-sm"
                )}>
                    <div data-tour-target="rebuild-drill-passage-tracker" className="flex flex-col gap-4 px-6 md:px-8 py-4 md:flex-row md:items-center md:justify-between border-b border-black/[0.03] dark:border-white/[0.03]">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span className={cn("shrink-0 text-[11px] font-semibold tracking-[0.06em]", activeCosmeticTheme.mutedClass)}>
                                第 {currentStageNumber} / {totalSegments} 段
                            </span>
                            <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: activeCosmeticUi.nextButtonGlow }}>
                                <motion.div
                                    className="h-full rounded-full"
                                    style={{ background: activeCosmeticUi.nextButtonGradient }}
                                    initial={false}
                                    animate={{ width: `${stageProgressPercent}%` }}
                                    transition={{ duration: prefersReducedMotion ? 0.12 : 0.32, ease: "easeOut" }}
                                />
                            </div>
                            <span className={cn("shrink-0 text-[11px] font-semibold tracking-[0.06em]", activeCosmeticTheme.mutedClass)}>
                                {stageProgressDisplayCount} / {totalSegments}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => { void onPlayAudio(activeSegment.referenceEnglish); }}
                                className={cn(
                                    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[1rem] transition-all",
                                    audioSourceText === activeSegment.referenceEnglish && (isPlaying || isActivePassageAudioLoading || isAudioLoading)
                                        ? rebuildControlActiveButtonClass
                                        : rebuildControlButtonClass,
                                )}
                                title="播放当前段"
                            >
                                {isActivePassageAudioLoading ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Volume2 className={cn("h-4 w-4", audioSourceText === activeSegment.referenceEnglish && isPlaying && "animate-pulse")} />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => onTogglePassageChinese(activePassageSegmentIndex)}
                                className={cn(
                                    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[1rem] px-4 text-xs font-bold transition-all",
                                    rebuildPassageUiState[activePassageSegmentIndex]?.chineseExpanded
                                        ? rebuildControlActiveButtonClass
                                        : rebuildControlButtonClass,
                                )}
                            >
                                {rebuildPassageUiState[activePassageSegmentIndex]?.chineseExpanded ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                中文
                            </button>
                            <button
                                type="button"
                                onClick={onCyclePlaybackSpeed}
                                className={cn("inline-flex min-h-11 items-center justify-center rounded-[1rem] px-4 text-[12px] font-bold transition", rebuildControlButtonClass)}
                            >
                                {playbackSpeed}x
                            </button>
                        </div>
                    </div>

                    <div className="relative overflow-hidden">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`segment-${activePassageSegmentIndex}-${Boolean(activeSegmentResult)}`}
                                initial={prefersReducedMotion ? undefined : { opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={prefersReducedMotion ? undefined : { opacity: 0, x: -20 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                className="pt-2"
                            >
                                <div className="relative flex flex-col items-center justify-center space-y-4 px-6 md:px-8 py-8 md:py-10 text-center w-full transition-all overflow-hidden z-0">
                                    {activeSegmentResult && activeSegmentResult.feedback.systemAssessment ? (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10">
                                            <span className={cn(
                                                "text-[6rem] md:text-[8rem] whitespace-nowrap font-black leading-none rotate-[-6deg] select-none tracking-widest",
                                                activeSegmentResult.feedback.systemAssessment === "too_hard" ? "text-rose-500/5 dark:text-rose-400/5" :
                                                activeSegmentResult.feedback.systemAssessment === "too_easy" ? "text-emerald-500/5 dark:text-emerald-400/5" :
                                                "text-black/5 dark:text-white/5"
                                            )}>
                                                {activeSegmentResult.feedback.systemAssessmentLabel}
                                            </span>
                                        </div>
                                    ) : null}
                                    <div className="relative z-10 space-y-4 w-full">
                                    {renderPassageSentence(activeSegment, Boolean(activeSegmentResult))}
                                    {activeSegmentResult ? (
                                        <p className={cn(
                                            "mx-auto max-w-[42rem] font-mono text-[13px] leading-7 md:text-[14px]",
                                            isVerdantRebuild ? "text-emerald-700/85" : activeCosmeticTheme.mutedClass,
                                        )}>
                                            {activeSegmentSentenceIpa || (isIpaReady ? "暂未命中完整音标词典，可先对照原句和音频。" : "正在加载音标词典...")}
                                        </p>
                                    ) : null}
                                        {rebuildPassageUiState[activePassageSegmentIndex]?.chineseExpanded ? (
                                            <p className={cn(
                                                "mx-auto max-w-[42rem] font-sans text-[15px] leading-8 md:text-base",
                                                activeCosmeticTheme.mutedClass,
                                            )}>
                                                {activeSegment.chinese}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </section>

                <motion.div className="mt-2 pb-1" layout="position">
                    {renderRebuildComposer(
                        `提交第 ${activePassageSegmentIndex + 1} 段`,
                        true,
                        Boolean(activeSegmentResult),
                        resolvedNextPendingSegmentIndex,
                        activeSegment.referenceEnglish
                    )}
                </motion.div>
                </>
            ) : null}

            {!rebuildPassageSummary && submittedCount === totalSegments ? (
                <motion.section
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: prefersReducedMotion ? 0.16 : 0.28, delay: prefersReducedMotion ? 0 : 0.05 }}
                    className={cn("rounded-[1.8rem] border p-5", rebuildLedgerClass)}
                >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className={cn("text-[11px] font-black uppercase tracking-[0.18em]", activeCosmeticTheme.mutedClass)}>Session Review</p>
                            <h4 className={cn("mt-2 text-2xl font-bold tracking-tight", activeCosmeticTheme.textClass)}>整篇做一次总自评</h4>
                            <p className={cn("mt-2 max-w-2xl text-sm leading-7", activeCosmeticTheme.mutedClass)}>
                                所有段落都完成了。现在只用对整篇短文给一次整体难度判断。
                            </p>
                        </div>
                        <div className={cn("rounded-full border px-4 py-2 text-sm font-bold", rebuildSummaryAccentPillClass)}>
                            当前客观总分 {sessionObjectivePreview}
                        </div>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        {([
                            { value: "easy", label: "简单", className: activeCosmeticUi.audioUnlockedClass },
                            { value: "just_right", label: "刚好", className: activeCosmeticUi.checkButtonClass },
                            { value: "hard", label: "难", className: activeCosmeticUi.audioLockedClass },
                        ] as const).map((option, index) => (
                            <motion.button
                                key={option.value}
                                type="button"
                                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.8, y: 15 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ duration: 0.6, delay: prefersReducedMotion ? 0 : 1.2 + index * 0.15, type: "spring" as const, stiffness: 180, damping: 16 }}
                                whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                                onClick={() => onRebuildSelfEvaluate(option.value)}
                                className={cn(
                                    "inline-flex min-h-14 items-center justify-center rounded-[1.2rem] border px-4 text-sm font-bold transition hover:-translate-y-0.5",
                                    option.className,
                                )}
                            >
                                {option.label}
                            </motion.button>
                        ))}
                    </div>
                </motion.section>
            ) : null}

            {rebuildPassageSummary ? (
                <motion.section
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: prefersReducedMotion ? 0.16 : 0.32, delay: prefersReducedMotion ? 0 : 0.08 }}
                    className={cn("rounded-[1.85rem] border p-5", rebuildLedgerClass)}
                >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className={cn("text-[11px] font-black uppercase tracking-[0.18em]", activeCosmeticTheme.mutedClass)}>Passage Summary</p>
                            <h4 className={cn("mt-2 text-2xl font-bold tracking-tight", activeCosmeticTheme.textClass)}>短文分段综合结算</h4>
                        </div>
                        <div className={cn("rounded-full border px-4 py-2 text-sm font-bold", rebuildSummaryAccentPillClass)}>
                            {rebuildPassageSummary.segmentCount} 段 · Shadowing {rebuildPassageSummary.sessionBattleScore10.toFixed(1)}
                        </div>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {[
                            { label: "客观总分", value: `${rebuildPassageSummary.sessionObjectiveScore100}` },
                            { label: "总自评", value: `${rebuildPassageSummary.sessionSelfScore100}` },
                            { label: "综合分", value: `${rebuildPassageSummary.sessionScore100}` },
                            { label: "Elo 变化", value: `${rebuildPassageSummary.change >= 0 ? "+" : ""}${rebuildPassageSummary.change}` },
                        ].map((metric) => (
                            <div key={metric.label} className={rebuildSummaryMetricCardClass}>
                                <div className={cn("text-[10px] font-bold uppercase tracking-[0.18em]", activeCosmeticTheme.mutedClass)}>{metric.label}</div>
                                <div className={cn("mt-2 text-xl font-bold", activeCosmeticTheme.textClass)}>
                                    {metric.label === "Elo 变化" ? (
                                        <div className="flex items-center gap-1.5">
                                            <motion.span
                                                initial={{ opacity: 0, y: 15, scale: 0.5 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                transition={{ duration: 0.8, type: "spring" as const, stiffness: 300, delay: 0.2 }}
                                                className={rebuildPassageSummary.change > 0 ? "text-emerald-500 font-extrabold drop-shadow-sm" : rebuildPassageSummary.change < 0 ? "text-rose-500 font-extrabold drop-shadow-sm" : ""}
                                            >
                                                {metric.value}
                                            </motion.span>
                                            {rebuildPassageSummary.change > 0 ? (
                                                <motion.div initial={{ opacity: 0, scale: 0, rotate: -45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.5, delay: 0.5, type: "spring" as const }}>
                                                    <TrendingUp className="w-5 h-5 text-emerald-500 drop-shadow-sm" />
                                                </motion.div>
                                            ) : null}
                                            {rebuildPassageSummary.change < 0 ? (
                                                <motion.div initial={{ opacity: 0, scale: 0, rotate: 45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.5, delay: 0.5, type: "spring" as const }}>
                                                    <TrendingDown className="w-5 h-5 text-rose-500 drop-shadow-sm" />
                                                </motion.div>
                                            ) : null}
                                        </div>
                                    ) : metric.value}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-5 space-y-3">
                        {completedSegments.map(({ segment, index, result }) => (
                            <div key={`summary-segment-${segment.id}`} className={rebuildSummarySegmentCardClass}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", rebuildSummaryPillClass)}>
                                            第 {index + 1} 段
                                        </span>
                                        <span className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", rebuildSummaryAccentPillClass)}>
                                            Shadowing {result?.objectiveScore100 ?? 0}
                                        </span>
                                    </div>
                                    <span className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", rebuildSummaryPillClass)}>
                                        {result?.feedback.skipped ? "已跳过" : `综合 ${result?.finalScore100 ?? 0}`}
                                    </span>
                                </div>
                                <p className={cn("mt-3 font-source-serif text-[1.1rem] leading-8 tracking-[-0.01em]", activeCosmeticTheme.textClass)}>
                                    {segment.referenceEnglish}
                                </p>
                                <p className={cn("mt-2 text-sm leading-7", activeCosmeticTheme.mutedClass)}>
                                    {segment.chinese}
                                </p>
                            </div>
                        ))}
                    </div>
                    <p className={cn("mt-5 text-sm leading-7", activeCosmeticTheme.mutedClass)}>
                        结算后 Elo 为 <span className={cn("font-bold", activeCosmeticTheme.textClass)}>{rebuildPassageSummary.eloAfter}</span>，
                        本场获得 <span className={cn("font-bold", activeCosmeticTheme.textClass)}>{rebuildPassageSummary.coinsEarned}</span> 星光币。
                    </p>
                </motion.section>
            ) : null}
        </motion.div>
    );
}
