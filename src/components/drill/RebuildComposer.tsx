"use client";

import { useState, useEffect, type CSSProperties, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    BrainCircuit,
    CheckCircle2,
    Compass,
    Eye,
    EyeOff,
    Globe,
    SkipForward,
    Sparkles,
    Wand2,
    Music,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildRebuildDisplaySentence } from "@/lib/rebuild-mode";
import { normalizeRebuildTokenForMatch, type RebuildTokenInstance } from "@/lib/drill-rebuild-helpers";
import { TYPING_SOUND_THEMES, playPopSound } from "@/lib/feedback-engine";
import type {
    RebuildFeedbackState,
    RebuildPassageSegmentResultState,
    RebuildPassageSummaryState,
} from "@/lib/drill-rebuild-types";

interface RebuildComposerDrillData {
    reference_english: string;
    _rebuildMeta?: {
        answerTokens: string[];
    };
}

interface RebuildComposerTheme {
    textClass: string;
    mutedClass: string;
}

interface RebuildComposerUi {
    ledgerClass: string;
    inputShellClass: string;
    audioLockedClass: string;
    audioUnlockedClass: string;
    keywordChipClass: string;
    wordBadgeActiveClass: string;
    wordBadgeIdleClass: string;
    hintButtonClass: string;
    iconButtonClass: string;
    checkButtonClass: string;
}

export interface RebuildComposerProps {
    activeCosmeticTheme: RebuildComposerTheme;
    activeCosmeticUi: RebuildComposerUi;
    activePassageResult: RebuildPassageSegmentResultState | null;
    compact?: boolean;
    drillData: RebuildComposerDrillData;
    handleInteractiveTextMouseUp: (text: string) => void;
    handleWordClick: (event: MouseEvent<HTMLElement>, word: string, sentence: string) => void;
    isRebuildPassage: boolean;
    isVerdantRebuild: boolean;
    nextButtonStyle: CSSProperties;
    nextPendingSegmentIndex: number;
    onActivatePassageSegment: (segmentIndex: number) => void;
    onOpenTour: () => void;
    onPlayAudio?: () => void;
    onPoolTokenClick: (tokenId: string) => void;
    onRemoveToken: (tokenId: string) => void;
    onSkip: () => void;
    onSubmit: () => void;
    onToggleAutocorrect: () => void;
    onToggleHideTokens: () => void;
    onToggleSentenceChinese: () => void;
    prefersReducedMotion: boolean | null;
    readOnlyAfterSubmit?: boolean;
    rebuildAnswerTokens: RebuildTokenInstance[];
    rebuildAutocompleteSuggestion: string | null;
    rebuildAvailableTokens: RebuildTokenInstance[];
    rebuildAutocorrect: boolean;
    rebuildCombo: number;
    rebuildFeedback: RebuildFeedbackState | null;
    rebuildHideTokens: boolean;
    rebuildPassageSummary: RebuildPassageSummaryState | null;
    rebuildTypingBuffer: string;
    showSentenceChinese: boolean;
    submitLabel?: string;
}

export function RebuildComposer({
    activeCosmeticTheme,
    activeCosmeticUi,
    activePassageResult,
    compact = false,
    drillData,
    handleInteractiveTextMouseUp,
    handleWordClick,
    isRebuildPassage,
    isVerdantRebuild,
    nextButtonStyle,
    nextPendingSegmentIndex,
    onActivatePassageSegment,
    onOpenTour,
    onPlayAudio,
    onPoolTokenClick,
    onRemoveToken,
    onSkip,
    onSubmit,
    onToggleAutocorrect,
    onToggleHideTokens,
    onToggleSentenceChinese,
    prefersReducedMotion,
    readOnlyAfterSubmit = false,
    rebuildAnswerTokens,
    rebuildAutocompleteSuggestion,
    rebuildAvailableTokens,
    rebuildAutocorrect,
    rebuildCombo,
    rebuildFeedback,
    rebuildHideTokens,
    rebuildPassageSummary,
    rebuildTypingBuffer,
    showSentenceChinese,
    submitLabel = "发送",
}: RebuildComposerProps) {
    const [activeSoundTheme, setActiveSoundTheme] = useState("classic");
    const [debugStats, setDebugStats] = useState({ combo: 0, prob: 0 });

    useEffect(() => {
        const handler = (e: any) => setDebugStats(e.detail);
        window.addEventListener('rebuild-debug-stats', handler);
        return () => window.removeEventListener('rebuild-debug-stats', handler);
    }, []);

    useEffect(() => {
        if (!readOnlyAfterSubmit || !isRebuildPassage || rebuildPassageSummary) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (event.altKey || event.ctrlKey || event.metaKey) return;

            if (event.key === " " || event.key === "Spacebar") {
                event.preventDefault();
                onPlayAudio?.();
                return;
            }

            if (event.key === "Enter") {
                event.preventDefault();
                if (nextPendingSegmentIndex >= 0) {
                    onActivatePassageSegment(nextPendingSegmentIndex);
                }
                return;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [readOnlyAfterSubmit, isRebuildPassage, rebuildPassageSummary, nextPendingSegmentIndex, onActivatePassageSegment, onPlayAudio]);

    useEffect(() => {
        const saved = window.localStorage.getItem('yasi_typing_sound_theme') || 'classic';
        setActiveSoundTheme(saved);
    }, []);

    const handleSoundChange = (val: string) => {
        setActiveSoundTheme(val);
        window.localStorage.setItem('yasi_typing_sound_theme', val);
        playPopSound(0);
    };

    const utilityBtnClass = isVerdantRebuild
        ? "flex items-center justify-center gap-1.5 h-8 px-3 rounded-full text-emerald-600/70 hover:text-emerald-800 hover:bg-emerald-50 transition-colors text-[12px] font-bold"
        : "flex items-center justify-center gap-1.5 h-8 px-3 rounded-full text-theme-text-muted hover:text-theme-text hover:bg-theme-active-bg/20 transition-colors text-[12px] font-bold";

    const rebuildKeywordChipClass = isVerdantRebuild
        ? "inline-flex min-h-[42px] min-w-0 max-w-full items-center gap-1.5 rounded-[1.25rem] border border-emerald-200/50 bg-emerald-100/40 backdrop-blur-md px-4 py-2 text-[15px] font-bold text-emerald-800 shadow-[0_4px_12px_rgba(2,44,34,0.04),inset_0_1px_1px_rgba(255,255,255,0.9)] active:shadow-[0_1px_2px_rgba(2,44,34,0.05),inset_0_2px_6px_rgba(2,44,34,0.12)] active:bg-emerald-200/40 transition-all duration-150 active:duration-75 hover:-translate-y-0.5 hover:bg-emerald-100/60 whitespace-normal break-all ring-1 ring-black/[0.02]"
        : "inline-flex min-h-[42px] min-w-0 max-w-full items-center gap-1.5 rounded-[1.25rem] border border-white/40 bg-white/40 dark:bg-white/5 backdrop-blur-md px-4 py-2 text-[15px] font-bold text-theme-text shadow-[0_4px_12px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.6)] active:shadow-[0_1px_2px_rgba(0,0,0,0.05),inset_0_2px_6px_rgba(0,0,0,0.08)] active:bg-black/5 dark:active:bg-white/10 dark:active:shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_2px_6px_rgba(0,0,0,0.3)] transition-all duration-150 active:duration-75 hover:-translate-y-0.5 hover:bg-white/60 dark:hover:bg-white/10 whitespace-normal break-all ring-1 ring-black/[0.02] dark:ring-white/[0.05]";

    const answerTotal = drillData._rebuildMeta?.answerTokens.length ?? 0;
    const answerFilled = rebuildAnswerTokens.length;
    const isReadyToSubmit = answerTotal > 0 && answerFilled === answerTotal;
    const activeSentenceCorrection = !isRebuildPassage && rebuildFeedback
        ? buildRebuildDisplaySentence({
            answerTokens: drillData._rebuildMeta?.answerTokens ?? [],
            evaluation: rebuildFeedback.evaluation,
        })
        : null;
    const isCurrentSegmentSolved = Boolean(
        isRebuildPassage
        && activePassageResult
        && activePassageResult.feedback.evaluation.isCorrect
        && !activePassageResult.feedback.skipped
    );
    const activePassageCorrection = isRebuildPassage && activePassageResult
        ? buildRebuildDisplaySentence({
            answerTokens: drillData._rebuildMeta?.answerTokens ?? [],
            evaluation: activePassageResult.feedback.evaluation,
        })
        : null;
    const shouldShowPassageCorrection = Boolean(
        readOnlyAfterSubmit
        && isRebuildPassage
        && activePassageResult
        && !activePassageResult.feedback.evaluation.isCorrect
    );
    const shouldShowSentenceCorrection = Boolean(
        readOnlyAfterSubmit
        && !isRebuildPassage
        && rebuildFeedback
    );
    const showInlinePassageCorrection = Boolean(shouldShowPassageCorrection && activePassageCorrection);
    const showInlineSentenceCorrection = Boolean(shouldShowSentenceCorrection && activeSentenceCorrection);
    const activePassageSystemAssessmentClass = activePassageResult
        ? activePassageResult.feedback.systemAssessment === "too_hard"
            ? activeCosmeticUi.audioLockedClass
            : activePassageResult.feedback.systemAssessment === "too_easy"
                ? activeCosmeticUi.audioUnlockedClass
                : activeCosmeticUi.wordBadgeActiveClass
        : activeCosmeticUi.wordBadgeActiveClass;

    const renderCorrectionTokens = (
        prefix: "sentence" | "passage",
        correction: NonNullable<typeof activeSentenceCorrection>,
    ) => (
        <div
            className="space-y-3"
            data-word-popup-root="true"
            onMouseUp={() => handleInteractiveTextMouseUp(drillData.reference_english)}
        >
            <div className="flex flex-wrap gap-2.5">
                {correction.tokens.map((token, index) => (
                    <motion.button
                        key={`${prefix}-inline-correction-${index}-${token.text}`}
                        type="button"
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.16, ease: "easeOut", delay: prefersReducedMotion ? 0 : index * 0.02 }}
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.94, y: 3 }}
                        onClick={(event) => handleWordClick(event, token.text, drillData.reference_english)}
                        onMouseUp={() => handleInteractiveTextMouseUp(drillData.reference_english)}
                        className={cn(
                            "inline-flex min-h-[42px] cursor-pointer touch-manipulation items-center gap-1.5 rounded-full border px-4 py-2 text-[14px] font-semibold text-left transition-all duration-200 active:duration-75 hover:-translate-y-0.5 active:shadow-inner",
                            token.kind === "correct"
                                ? activeCosmeticUi.wordBadgeActiveClass
                                : token.kind === "inserted"
                                    ? activeCosmeticUi.hintButtonClass
                                    : activeCosmeticUi.audioLockedClass,
                        )}
                        style={{
                            boxShadow: token.kind === "correct"
                                ? "0 5px 0 rgba(16,185,129,0.18)"
                                : token.kind === "inserted"
                                    ? "0 5px 0 rgba(14,165,233,0.16)"
                                    : "0 5px 0 rgba(120,113,108,0.14)",
                        }}
                    >
                        <span className="select-text">{token.text}</span>
                        {token.kind !== "correct" && token.originalText ? (
                            <span className={cn("select-text text-[11px] line-through", activeCosmeticTheme.mutedClass)}>
                                {token.originalText}
                            </span>
                        ) : null}
                    </motion.button>
                ))}
            </div>
            {correction.extraTokens.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-[11px] font-semibold", activeCosmeticTheme.mutedClass)}>多余词：</span>
                    {correction.extraTokens.map((token, index) => (
                        <motion.button
                            key={`${prefix}-inline-extra-${index}-${token.text}`}
                            type="button"
                            initial={prefersReducedMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.16, ease: "easeOut", delay: prefersReducedMotion ? 0 : index * 0.02 }}
                            whileTap={prefersReducedMotion ? undefined : { scale: 0.94, y: 3 }}
                            onClick={(event) => handleWordClick(event, token.text, drillData.reference_english)}
                            onMouseUp={() => handleInteractiveTextMouseUp(drillData.reference_english)}
                            className={cn(
                                "inline-flex min-h-[34px] cursor-pointer touch-manipulation items-center rounded-full border px-3 py-1.5 text-[12px] font-semibold line-through transition-all duration-200 active:duration-75 hover:-translate-y-0.5 active:shadow-inner",
                                activeCosmeticUi.audioLockedClass,
                            )}
                            style={{ boxShadow: "0 4px 0 rgba(120,113,108,0.12)" }}
                        >
                            <span className="select-text">{token.text}</span>
                        </motion.button>
                    ))}
                </div>
            ) : null}
        </div>
    );

    return (
        <div
            data-tour-target="rebuild-drill-atelier"
            className="w-full mt-2 flex flex-col transition-all duration-500"
        >
            {/* Unified Glass Sandbox */}
            <div className={cn(
                "relative w-full rounded-[2.5rem] overflow-hidden flex flex-col transition-all duration-300 backdrop-blur-2xl",
                isVerdantRebuild
                    ? "bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 border-[1.5px] border-white/90 shadow-[0_16px_40px_-12px_rgba(2,44,34,0.15),inset_0_4px_24px_rgba(255,255,255,1),inset_0_-2px_8px_rgba(2,44,34,0.02)] ring-1 ring-emerald-900/5"
                    : "bg-gradient-to-br from-white/60 to-white/30 dark:from-white/10 dark:to-white/5 border-[1.5px] border-white/80 dark:border-white/10 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1),inset_0_4px_24px_rgba(255,255,255,0.7),inset_0_-2px_8px_rgba(0,0,0,0.02)] ring-1 ring-black/5 dark:ring-white/[0.02]"
            )}>
                {/* Embedded Toolbar / Window Header */}
                <div data-tour-target="rebuild-drill-controls" className={cn(
                    "flex flex-col gap-3 py-3 px-4 sm:px-6 md:flex-row md:items-center md:justify-between border-b transition-colors",
                    isVerdantRebuild 
                        ? "border-emerald-200/40 bg-white/40" 
                        : "border-black/[0.05] dark:border-white/[0.05] bg-white/30 dark:bg-black/10"
                )}>
                    {isReadyToSubmit && !readOnlyAfterSubmit ? (
                        <button
                            type="button"
                            onClick={onSubmit}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1 -ml-1.5 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-[0.1em] transition-all active:scale-95",
                                isVerdantRebuild
                                    ? "bg-emerald-500 text-white hover:bg-emerald-400 shadow-[0_2px_8px_rgba(16,185,129,0.3)]"
                                    : "bg-yellow-400 text-amber-950 hover:bg-yellow-300 shadow-[0_2px_8px_rgba(250,204,21,0.3)]"
                            )}
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>提交 {answerFilled}/{answerTotal}</span>
                        </button>
                    ) : (
                        <span className={cn("text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] opacity-70 flex items-center gap-2", activeCosmeticTheme.mutedClass)}>
                            WORKSPACE
                            {answerTotal > 0 && (
                                <span className="font-mono text-[9px] sm:text-[10px] opacity-80 tracking-widest bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                    {answerFilled}/{answerTotal}
                                </span>
                            )}
                        </span>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <div className="relative inline-block">
                            <button type="button" className={utilityBtnClass} title="打字音效设置">
                                <Music className="h-[13px] w-[13px]" />
                                <span>音效</span>
                                <select
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    value={activeSoundTheme}
                                    onChange={(e) => handleSoundChange(e.target.value)}
                                >
                                    {TYPING_SOUND_THEMES.map(theme => (
                                        <option key={theme.id} value={theme.id} className="text-black">{theme.name}</option>
                                    ))}
                                </select>
                            </button>
                        </div>
                        <button type="button" onClick={onOpenTour} className={utilityBtnClass} title="操作向导">
                            <Compass className="h-[13px] w-[13px]" />
                            <span>向导</span>
                        </button>
                        {!isRebuildPassage ? (
                            <button type="button" onClick={onToggleSentenceChinese} className={cn(utilityBtnClass, showSentenceChinese && (isVerdantRebuild ? "bg-emerald-100/50 text-emerald-800" : "bg-theme-active-bg text-theme-active-text shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]"))}>
                                <Globe className="h-[13px] w-[13px]" />
                                <span>中文</span>
                            </button>
                        ) : null}
                        <button type="button" onClick={onToggleAutocorrect} className={cn(utilityBtnClass, rebuildAutocorrect && (isVerdantRebuild ? "bg-emerald-100/50 text-emerald-800" : "bg-theme-active-bg text-theme-active-text shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]"))}>
                            <Wand2 className="h-[13px] w-[13px]" />
                            <span>纠正</span>
                        </button>
                        <button type="button" onClick={onToggleHideTokens} className={cn(utilityBtnClass, rebuildHideTokens && (isVerdantRebuild ? "bg-emerald-100/50 text-emerald-800" : "bg-theme-active-bg text-theme-active-text shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]"))}>
                            {rebuildHideTokens ? <EyeOff className="h-[13px] w-[13px]" /> : <Eye className="h-[13px] w-[13px]" />}
                            <span>隐藏词</span>
                        </button>
                    </div>
                </div>

                {/* 1. Input Pad / Canvas */}
                <motion.div 
                    layout={true}
                    transition={{ layout: { type: "spring" as const, bounce: 0, duration: 0.35 } }}
                    className={cn(
                    "relative min-h-[68px] p-4 sm:p-5 pb-5 sm:pb-6 border-b transition-colors duration-300 flex items-start content-start overflow-hidden",
                    isVerdantRebuild ? "border-emerald-200/40 bg-transparent" : "border-black/[0.05] dark:border-white/[0.05] bg-transparent"
                )}>
                    {showInlinePassageCorrection && activePassageCorrection ? (
                        renderCorrectionTokens("passage", activePassageCorrection)
                    ) : showInlineSentenceCorrection && activeSentenceCorrection ? (
                        renderCorrectionTokens("sentence", activeSentenceCorrection)
                    ) : rebuildAnswerTokens.length > 0 || rebuildTypingBuffer ? (
                        <motion.div layout="position" className="w-full min-w-0 flex flex-wrap items-center gap-2.5 relative">
                            <AnimatePresence mode="popLayout" initial={false}>
                                {rebuildAnswerTokens.map((token, idx) => {
                                    // A simple hash function to generate stable pseudo-randomness from token ID string
                                    const hashString = (str: string) => {
                                        let hash = 0;
                                        for (let i = 0; i < str.length; i++) {
                                            hash = (hash << 5) - hash + str.charCodeAt(i);
                                            hash |= 0;
                                        }
                                        return Math.abs(hash);
                                    };

                                    const TOKEN_ANIMATIONS = [
                                        "animate-jelly-pop",
                                        "animate-slide-flip",
                                        "animate-rubber-squeeze",
                                        "animate-pop-spin",
                                        "animate-cyber-glitch",
                                        "animate-float-drop",
                                        "animate-fold-out",
                                        "animate-swing-in"
                                    ];
                                    
                                    // Use the token ID to deterministically select a random animation
                                    // This guarantees randomness but prevents jumping/re-animating on React re-renders.
                                    const activeAnimation = TOKEN_ANIMATIONS[hashString(token.id) % TOKEN_ANIMATIONS.length];
                                    
                                    return (
                                        <motion.div 
                                            layout={true} 
                                            key={`ans-${token.id}`} 
                                            className="min-w-0 max-w-full"
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.5, filter: "blur(12px)", transition: { duration: 0.2, ease: "easeOut" } }}
                                            transition={{ layout: { type: "spring" as const, bounce: 0, duration: 0.35 } }}
                                        >
                                            <motion.button
                                                type="button"
                                                whileTap={{ scale: 0.92, y: 4, rotate: (idx % 2 === 0 ? 2 : -2) }}
                                                onClick={() => onRemoveToken(token.id)}
                                                className={cn(
                                                    activeAnimation,
                                                    "inline-flex min-h-[38px] min-w-0 max-w-full items-center gap-1.5 px-4 py-1.5 text-left text-[15px] font-bold whitespace-normal break-all transition-colors cursor-pointer rounded-[1rem]",
                                                isVerdantRebuild
                                                    ? "bg-emerald-500/80 backdrop-blur-md text-white border border-emerald-400/50 shadow-[0_4px_12px_rgba(16,185,129,0.2),inset_0_1px_1px_rgba(255,255,255,0.4)]"
                                                    : "bg-theme-active-bg/85 backdrop-blur-md text-theme-active-text border border-white/20 shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.3)] ring-1 ring-black/5",
                                                "active:shadow-none hover:opacity-90",
                                            )}
                                        >
                                            <span className="block min-w-0 max-w-full break-all relative z-10">{token.text}</span>
                                            {(token.repeatTotal ?? 1) > 1 ? (
                                                <span
                                                    className={cn(
                                                        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 pt-[1px] text-[10px] font-black",
                                                        isVerdantRebuild ? "bg-white text-emerald-800" : "bg-white text-black",
                                                    )}
                                                >
                                                    {token.repeatIndex}
                                                </span>
                                            ) : null}
                                            </motion.button>
                                        </motion.div>
                                    );
                                })}
                                {rebuildTypingBuffer ? (
                                    <motion.div layout="position" key="typing-ghost" className="min-w-0 max-w-full">
                                        <motion.div
                                            id="rebuild-typing-cursor"
                                            initial={{ opacity: 0, filter: "blur(4px)", scale: 0.95 }}
                                            animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                                            exit={{ opacity: 0, filter: "blur(4px)", scale: 0.9, transition: { duration: 0.1 } }}
                                            transition={{ duration: 0.2, ease: "easeOut" }}
                                            className={cn(
                                                "inline-flex min-h-[38px] min-w-0 max-w-full items-center gap-[2px] rounded-[1rem] px-4 py-1.5 text-left text-[15px] font-bold whitespace-normal break-all transition-colors",
                                                isVerdantRebuild
                                                    ? "border border-emerald-400/40 bg-emerald-100/40 backdrop-blur-md text-emerald-800 shadow-[0_4px_16px_-4px_rgba(16,185,129,0.15)] ring-4 ring-emerald-500/10"
                                                    : "border border-theme-active-bg/40 bg-white/40 dark:bg-white/10 backdrop-blur-md text-theme-text shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] ring-4 ring-[color:var(--theme-active-bg)]/15",
                                            )}
                                        >
                                            <span className="block min-w-0 max-w-full break-all tracking-wide">
                                                {rebuildTypingBuffer.split('').map((char, i) => {
                                                    const TYPING_ANIMATIONS = [
                                                        "animate-letter-pop",
                                                        "animate-letter-strike",
                                                        "animate-letter-bounce",
                                                        "animate-letter-glitch",
                                                        "animate-letter-flip"
                                                    ];
                                                    // Hash based on index + character to keep it 100% stable but seemingly random
                                                    const activeTypeAnimation = TYPING_ANIMATIONS[(i + char.charCodeAt(0)) % TYPING_ANIMATIONS.length];
                                                    
                                                    return (
                                                        <span 
                                                            key={`${i}-${char}`} 
                                                            className={cn(activeTypeAnimation, "will-change-transform")}
                                                        >
                                                            {char}
                                                        </span>
                                                    );
                                                })}
                                            </span>
                                            {rebuildAutocompleteSuggestion
                                                && rebuildAutocompleteSuggestion.toLowerCase().startsWith(rebuildTypingBuffer.toLowerCase())
                                                && rebuildAutocompleteSuggestion.length > rebuildTypingBuffer.length ? (
                                                <span className="block min-w-0 max-w-full break-all opacity-40 tracking-wide">
                                                    {rebuildAutocompleteSuggestion.slice(rebuildTypingBuffer.length)}
                                                </span>
                                            ) : null}
                                            <span className="h-[18px] w-[2.5px] ml-[3px] animate-pulse rounded-full bg-[color:var(--theme-active-bg)]" />
                                        </motion.div>
                                    </motion.div>
                                ) : null}
                                {rebuildCombo >= 5 ? (
                                    <motion.div
                                        key={`combo-${rebuildCombo}`}
                                        initial={{ opacity: 0, scale: 0.5, y: -10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-[11px] font-black uppercase tracking-wider transition-all",
                                            rebuildCombo >= 10
                                                ? "bg-[linear-gradient(135deg,#f59e0b,#ea580c)] text-white shadow-[0_4px_16px_rgba(234,88,12,0.35)]"
                                                : "bg-[linear-gradient(135deg,#38bdf8,#6366f1)] text-white shadow-[0_4px_16px_rgba(99,102,241,0.3)]",
                                        )}
                                    >
                                        <motion.span
                                            animate={{ scale: [1, 1.2, 1], rotate: [0, -10, 10, 0] }}
                                            transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1.5 }}
                                        >
                                            🔥
                                        </motion.span>
                                        {rebuildCombo}x COMBO
                                    </motion.div>
                                ) : null}
                                
                                <motion.div
                                    key="debug-stats"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-stone-200/50 bg-stone-100/50 backdrop-blur-sm px-2 py-0.5 text-[10px] font-mono font-medium text-stone-500 transition-all dark:border-white/10 dark:bg-black/20 dark:text-stone-400"
                                >
                                    <span>Rate: {(debugStats.prob * 100).toFixed(0)}%</span>
                                    <span className="w-[1px] h-3 bg-stone-300 dark:bg-stone-700/50" />
                                    <span>Keys: {debugStats.combo}</span>
                                </motion.div>
                            </AnimatePresence>
                        </motion.div>
                    ) : (
                        <span className={cn("select-none text-[14px] font-semibold leading-relaxed tracking-wide", activeCosmeticTheme.mutedClass)}>
                            点击词块或直接输入（支持大小写智能匹配）
                        </span>
                    )}
                </motion.div>

                {/* 2. Tokens Tray (Bottom section of Sandbox) */}
                {!readOnlyAfterSubmit ? (
                    <motion.div
                        layout={true}
                        transition={{ layout: { type: "spring" as const, bounce: 0, duration: 0.35 } }}
                        data-tour-target="rebuild-drill-tokens"
                        className={cn(
                            "w-full transition-colors duration-300 ease-in-out relative",
                            isVerdantRebuild ? "bg-emerald-50/20" : "bg-black/[0.02] dark:bg-black/20",
                            rebuildHideTokens ? "pointer-events-none mt-0 max-h-0 opacity-0 overflow-hidden" : "max-h-[220px] min-h-[80px] opacity-100",
                        )}
                    >
                        <div className="w-full h-full min-w-0 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                            <motion.div layout="position" className="w-full min-w-0 flex flex-wrap content-start gap-2.5 relative">
                                <AnimatePresence mode="popLayout" initial={false}>
                                    {rebuildAvailableTokens.map((token) => {
                                        const typingClean = rebuildTypingBuffer ? normalizeRebuildTokenForMatch(rebuildTypingBuffer) : "";
                                        const tokenClean = normalizeRebuildTokenForMatch(token.text);
                                        const isMatch = typingClean.length > 0 && tokenClean.startsWith(typingClean);
                                        const isExact = typingClean.length > 0 && tokenClean === typingClean;

                                        return (
                                            <motion.button
                                                layout={true}
                                                key={`avail-${token.id}`}
                                                type="button"
                                                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.8, y: 10 }}
                                                animate={{
                                                    opacity: typingClean.length > 0 ? (isMatch ? 1 : 0.35) : 1,
                                                    scale: isExact ? 1.05 : 1,
                                                    y: 0,
                                                }}
                                                exit={{ opacity: 0, scale: 0.5, filter: "blur(12px)", transition: { duration: 0.2, ease: "easeOut" } }}
                                                transition={{
                                                    default: prefersReducedMotion ? { duration: 0.15 } : { type: "spring" as const, bounce: 0, duration: 0.35 },
                                                    layout: { type: "spring" as const, bounce: 0, duration: 0.35 },
                                                }}
                                                whileTap={prefersReducedMotion ? undefined : { scale: 0.92, y: 4, rotate: (token.text.length % 2 === 0 ? 2 : -2) }}
                                                onClick={() => onPoolTokenClick(token.id)}
                                                className={cn(
                                                    "min-w-0 max-w-full text-left whitespace-normal break-all",
                                                    rebuildKeywordChipClass,
                                                    isExact && "ring-[4px] ring-emerald-400/80",
                                                    isMatch && !isExact && "ring-[3px] ring-sky-300/80",
                                                )}
                                            >
                                                <span className="block min-w-0 max-w-full break-all relative z-10">{token.text}</span>
                                                {(token.repeatTotal ?? 1) > 1 ? (
                                                    <span
                                                        className={cn(
                                                            "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 pt-[1px] text-[10px] font-black",
                                                            isVerdantRebuild ? "bg-emerald-200/50 text-emerald-800" : "bg-black/10 dark:bg-white/20 text-theme-text",
                                                        )}
                                                    >
                                                        {token.repeatIndex}
                                                    </span>
                                                ) : null}
                                            </motion.button>
                                        );
                                    })}
                                </AnimatePresence>
                            </motion.div>
                        </div>
                    </motion.div>
                ) : null}
            </div>

            {readOnlyAfterSubmit ? (
                <div className="mt-4 flex flex-col items-center gap-3">

                    {isRebuildPassage ? (
                        nextPendingSegmentIndex >= 0 ? (
                                <button
                                    type="button"
                                    onClick={() => onActivatePassageSegment(nextPendingSegmentIndex)}
                                    className={cn(
                                        "inline-flex h-[56px] sm:h-[60px] w-full max-w-sm items-center justify-center rounded-[1.5rem] text-[18px] font-black tracking-wide transition-all duration-300 backdrop-blur-xl outline-none active:scale-[0.96]",
                                        isVerdantRebuild
                                            ? "bg-gradient-to-br from-emerald-400/90 to-emerald-500/90 border-[1.5px] border-emerald-300/80 shadow-[0_8px_32px_-8px_rgba(16,185,129,0.4),inset_0_4px_20px_rgba(255,255,255,0.6),inset_0_-4px_12px_rgba(4,120,87,0.4)] text-white ring-1 ring-emerald-900/10 hover:shadow-[0_12px_40px_-8px_rgba(16,185,129,0.5),inset_0_4px_24px_rgba(255,255,255,0.8),inset_0_-4px_12px_rgba(4,120,87,0.4)]"
                                            : "bg-gradient-to-br from-pink-400/90 to-pink-500/90 border-[1.5px] border-pink-300/80 shadow-[0_8px_32px_-8px_rgba(244,114,182,0.4),inset_0_4px_20px_rgba(255,255,255,0.6),inset_0_-4px_12px_rgba(219,39,119,0.4)] text-white ring-1 ring-pink-900/10 hover:shadow-[0_12px_40px_-8px_rgba(244,114,182,0.5),inset_0_4px_24px_rgba(255,255,255,0.8),inset_0_-4px_12px_rgba(219,39,119,0.4)]"
                                    )}
                                >
                                    下一段
                                </button>
                        ) : (
                            !rebuildPassageSummary ? (
                                <span className={cn("text-[12px] font-semibold mt-2", activeCosmeticTheme.mutedClass)}>
                                    先看完反馈再总自评
                                </span>
                            ) : null
                        )
                    ) : null}
                </div>
            ) : (
                <div data-tour-target="rebuild-drill-submit" className="mt-3 md:mt-4 flex flex-col sm:flex-row items-stretch gap-3 md:gap-4 px-1 md:px-2">
                    <button
                        type="button"
                        onClick={onSkip}
                        className={cn(
                            "group inline-flex h-[56px] sm:h-[60px] flex-[1] items-center justify-center gap-2 rounded-[1.5rem] text-[16px] font-bold transition-all duration-300 outline-none active:scale-[0.96] active:shadow-inner",
                            "backdrop-blur-xl border-[1.5px] border-white/80 dark:border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.04),inset_0_2px_12px_rgba(255,255,255,0.8)]",
                            isVerdantRebuild 
                                ? "bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100/60 ring-1 ring-emerald-900/5" 
                                : "bg-white/50 dark:bg-black/20 text-theme-text hover:bg-white/80 dark:hover:bg-white/10 ring-1 ring-black/5 dark:ring-white/[0.02]"
                        )}
                    >
                        <SkipForward className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        跳过
                    </button>
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={rebuildAnswerTokens.length === 0}
                        className={cn(
                            "group inline-flex h-[56px] sm:h-[60px] flex-[2.5] items-center justify-center gap-2 rounded-[1.5rem] text-[18px] font-black tracking-wide transition-all duration-300 backdrop-blur-xl outline-none active:scale-[0.96]",
                            rebuildAnswerTokens.length === 0
                                ? "opacity-50 grayscale cursor-not-allowed pointer-events-none bg-black/5 dark:bg-white/5 border-[1.5px] border-white/40 dark:border-white/10 text-theme-text/50 shadow-none ring-1 ring-black/5"
                                : isVerdantRebuild
                                    ? "bg-gradient-to-br from-emerald-400/90 to-emerald-500/90 border-[1.5px] border-emerald-300/80 shadow-[0_8px_32px_-8px_rgba(16,185,129,0.4),inset_0_4px_20px_rgba(255,255,255,0.6),inset_0_-4px_12px_rgba(4,120,87,0.4)] text-white ring-1 ring-emerald-900/10 hover:shadow-[0_12px_40px_-8px_rgba(16,185,129,0.5),inset_0_4px_24px_rgba(255,255,255,0.8),inset_0_-4px_12px_rgba(4,120,87,0.4)]"
                                    : "bg-gradient-to-br from-yellow-300/90 to-yellow-400/90 border-[1.5px] border-yellow-200/80 shadow-[0_8px_32px_-8px_rgba(250,204,21,0.5),inset_0_4px_20px_rgba(255,255,255,0.7),inset_0_-4px_12px_rgba(202,138,4,0.3)] text-amber-950 ring-1 ring-yellow-900/10 hover:shadow-[0_12px_40px_-8px_rgba(250,204,21,0.6),inset_0_4px_24px_rgba(255,255,255,0.9),inset_0_-4px_12px_rgba(202,138,4,0.3)]",
                        )}
                    >
                        <CheckCircle2 className={cn("h-[18px] w-[18px]", rebuildAnswerTokens.length > 0 && "transition-transform group-hover:scale-110")} />
                        {submitLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
