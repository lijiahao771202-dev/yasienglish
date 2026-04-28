"use client";

import { HelpCircle, Send, Sparkles } from "lucide-react";

import { GhostTextarea } from "../vocab/GhostTextarea";
import { SyntaxBlocksInput } from "./SyntaxBlocksInput";
import { cn } from "@/lib/utils";

interface TranslationInputPanelProps {
    drillKey: string;
    value: string;
    sourceText?: string;
    referenceAnswer?: string;
    predictionMode: "deterministic";
    fullReferenceGhostText: string;
    fullReferenceGhostVersion: number;
    isHintLoading?: boolean;
    disabled: boolean;
    isSubmitting: boolean;
    inputShellClass: string;
    textareaClass: string;
    wordBadgeActiveClass: string;
    wordBadgeIdleClass: string;
    checkButtonClass: string;
    mutedTextClass: string;
    onChange: (value: string) => void;
    onPredictionRequest: () => boolean;
    onPredictionShown: () => void;
    onManualHintRequest?: (currentText?: string) => void | Promise<void>;
    onViewHistory: () => void;
    onOpenGhostSettings: () => void;
    onSubmit: () => void | Promise<void>;
    onApplyFix: (errorWord: string, fixWord: string) => void;
    syntaxChunks?: Array<{ role: string; english: string; chinese?: string; keywords?: string[] }>;
    syntaxKeywords?: string[];
}



export function TranslationInputPanel({
    drillKey,
    value,
    sourceText,
    referenceAnswer,
    predictionMode,
    fullReferenceGhostText,
    fullReferenceGhostVersion,
    isHintLoading,
    disabled,
    isSubmitting,
    inputShellClass,
    textareaClass,
    wordBadgeActiveClass,
    wordBadgeIdleClass,
    checkButtonClass,
    mutedTextClass,
    onChange,
    onPredictionRequest,
    onPredictionShown,
    onManualHintRequest,
    onViewHistory,
    onOpenGhostSettings,
    onSubmit,
    syntaxChunks,
    syntaxKeywords,
    onApplyFix,
}: TranslationInputPanelProps) {
    const hasSyntaxChunks = syntaxChunks && syntaxChunks.length > 0;

    return (
        <>
            <div className={cn(
                "relative group transition-all duration-500 rounded-[2rem]",
                !hasSyntaxChunks && ["border border-black/[0.04] backdrop-blur-3xl bg-white/30 focus-within:ring-[3px] focus-within:ring-indigo-500/15 focus-within:shadow-[0_8px_30px_rgba(30,27,75,0.06)] focus-within:-translate-y-0.5", inputShellClass]
            )}>
                {!hasSyntaxChunks && (
                    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[2rem]">
                        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/90 via-white/50 to-transparent" />
                        <div className="absolute inset-0 opacity-[0.025] bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.85%27 numOctaves=%274%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E')] mix-blend-overlay" />
                    </div>
                )}
                <div className={cn(
                    "relative z-20 flex flex-col justify-center",
                    hasSyntaxChunks ? "pt-2 pb-8" : "min-h-[128px] md:min-h-[160px] px-6 pb-20 pt-6 md:px-8 md:pb-20 md:pt-8"
                )}>
                    {hasSyntaxChunks ? (
                        <SyntaxBlocksInput
                            chunks={syntaxChunks}
                            chineseContext={sourceText}
                            value={value}
                            onChange={onChange}
                            disabled={disabled || isSubmitting}
                            keywords={syntaxKeywords}
                        />
                    ) : (
                        <GhostTextarea
                            key={drillKey}
                            value={value}
                        onChange={onChange}
                        placeholder="在此搭建你的英文主谓宾..."
                        predictionWordCount={3}
                        sourceText={sourceText}
                        referenceAnswer={referenceAnswer}
                        onPredictionRequest={onPredictionRequest}
                        onPredictionShown={onPredictionShown}
                        predictionCostText="Edge AI (0 胶囊)"
                        fullReferenceGhostText={fullReferenceGhostText}
                        fullReferenceGhostVersion={fullReferenceGhostVersion}
                        predictionMode={predictionMode}
                        onManualHintRequest={onManualHintRequest}
                        isHintLoading={isHintLoading}
                        disabled={disabled}
                            className={cn(
                                "bg-transparent font-work-sans text-[1.12rem] font-medium leading-[1.8] tracking-[0.015em] placeholder:font-newsreader placeholder:italic placeholder:text-stone-400/80 md:text-[1.25rem]",
                                textareaClass,
                            )}
                        />
                    )}
                </div>



                <div className={cn(
                    "relative z-10 flex flex-wrap items-center justify-between gap-y-3 px-3 pb-3 pt-3 md:px-5 md:pb-4 transition-all duration-500",
                    !hasSyntaxChunks 
                        ? "border-t border-white/70 bg-white/40 backdrop-blur-xl rounded-b-[2rem]"
                        : "mt-4 mx-1 border border-stone-200/60 bg-white shadow-[0_4px_20px_-8px_rgba(0,0,0,0.06)] rounded-2xl p-3 md:p-4 backdrop-blur-md"
                )}>
                    <div className="flex flex-wrap items-center gap-2 md:gap-3">
                        <div
                            className={cn(
                                "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-bold font-sans tracking-[0.14em] transition-all duration-300 md:px-3 md:text-[11px] md:tracking-[0.18em]",
                                value.trim() ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "bg-stone-50 text-stone-400 border border-stone-100",
                            )}
                        >
                            <span className="tabular-nums">{value.trim() ? value.trim().split(/\s+/).length : 0}</span>
                            <span>WORDS</span>
                        </div>

                        <button
                            onClick={onOpenGhostSettings}
                            className={cn(
                                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-all sm:text-[12px]",
                                "border border-stone-200/60 bg-white text-stone-500 shadow-sm",
                                "hover:-translate-y-[1px] hover:shadow-md hover:border-stone-300 active:scale-95 disabled:opacity-50"
                            )}
                            title="智能补全预测设置"
                        >
                            <span className="text-stone-400">预测:</span>
                            <span className="text-stone-700 font-semibold">设置</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={onViewHistory}
                            className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95",
                                "border border-stone-200/60 bg-white text-stone-400 shadow-sm",
                                "hover:-translate-y-[1px] hover:shadow-md hover:border-indigo-200 hover:text-indigo-500 hover:bg-indigo-50/30",
                                mutedTextClass,
                            )}
                            title="求助 AI 教材导师"
                        >
                            <HelpCircle className="h-[18px] w-[18px] stroke-2" />
                        </button>
                        <button
                            onClick={() => {
                                void onSubmit();
                            }}
                            disabled={!value.trim() || isSubmitting}
                            className={cn(
                                "group relative overflow-hidden flex h-10 items-center justify-center gap-1.5 rounded-full px-6 text-[12px] font-bold tracking-[0.15em] transition-all duration-300 md:px-8 md:text-[13px]",
                                "disabled:cursor-not-allowed disabled:scale-100",
                                (!value.trim() || isSubmitting)
                                    ? "border border-stone-200/50 bg-stone-100/50 text-stone-400"
                                    : "cursor-pointer border border-black/5 bg-stone-900 text-white shadow-[0_8px_20px_rgba(28,25,23,0.15)] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(28,25,23,0.25)] active:scale-95 active:shadow-md",
                            )}
                        >
                            {value.trim() && !isSubmitting && (
                                <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[150%] skew-x-[-20deg] group-hover:animate-shimmer" />
                            )}
                            <div className="relative z-10 flex items-center gap-1.5">
                                {isSubmitting ? <Sparkles className="h-4 w-4 animate-spin text-white/80" /> : <Send className="h-4 w-4" />}
                                {isSubmitting ? "..." : "CHECK"}
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
