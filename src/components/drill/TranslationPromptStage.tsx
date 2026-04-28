"use client";

import type { MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, RefreshCw, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TranslationPromptThemeUi {
    audioLockedClass: string;
    audioUnlockedClass: string;
    iconButtonClass: string;
    keywordChipClass: string;
    speedActiveClass: string;
    speedIdleClass: string;
    speedShellClass: string;
    vocabButtonClass: string;
    wordBadgeActiveClass: string;
    toolbarClass: string;
}

export interface TranslationPromptStageProps {
    activeCosmeticUi: TranslationPromptThemeUi;
    chinese: string;
    hasTranslationKeywords: boolean;
    isAudioLoading: boolean;
    isGeneratingDrill: boolean;
    isHintShake: boolean;
    isPlaying: boolean;
    isTranslationAudioUnlocked: boolean;
    isVocabHintRevealed: boolean;
    playbackSpeed: number;
    refreshTicketCount: number;
    translationKeywords: string[];
    onPlaybackSpeedChange: (speed: number) => void;
    onRefresh: () => void;
    onRevealVocabHint: () => void;
    onTranslationReferencePlayback: () => void;
    onWordClick: (event: MouseEvent<HTMLSpanElement>, word: string) => void;
}

export function TranslationPromptStage({
    activeCosmeticUi,
    chinese,
    hasTranslationKeywords,
    isAudioLoading,
    isGeneratingDrill,
    isHintShake,
    isPlaying,
    isTranslationAudioUnlocked,
    isVocabHintRevealed,
    playbackSpeed,
    refreshTicketCount,
    translationKeywords,
    onPlaybackSpeedChange,
    onRefresh,
    onRevealVocabHint,
    onTranslationReferencePlayback,
    onWordClick,
}: TranslationPromptStageProps) {
    return (
        <div className="w-full py-5 md:py-6 flex flex-col items-center justify-center gap-4 md:gap-5">
            <h3 className="max-w-4xl px-4 text-center font-newsreader text-xl font-medium leading-[1.4] text-stone-900 md:text-3xl">
                {chinese}
            </h3>

            <div className="relative w-full max-w-3xl px-4">
                <div
                    className={cn(
                        "flex flex-wrap items-center justify-center gap-2 rounded-full border px-2.5 py-2 backdrop-blur-xl",
                        activeCosmeticUi.toolbarClass
                    )}
                >
                    <button
                        onClick={onTranslationReferencePlayback}
                        disabled={isAudioLoading}
                        className={cn(
                            "flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:cursor-wait disabled:opacity-70",
                            isTranslationAudioUnlocked
                                ? activeCosmeticUi.audioUnlockedClass
                                : activeCosmeticUi.audioLockedClass
                        )}
                        title={isTranslationAudioUnlocked ? "重播参考句" : "解锁本题参考句播放"}
                    >
                        {isAudioLoading ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : isTranslationAudioUnlocked ? (
                            <Volume2 className="h-4 w-4" />
                        ) : (
                            <Lock className="h-4 w-4" />
                        )}
                        <span>
                            {isAudioLoading
                                ? "正在生成音频..."
                                : isTranslationAudioUnlocked
                                    ? (isPlaying ? "播放中..." : "重播参考句")
                                    : "播放参考句 · 1 朗读券"}
                        </span>
                    </button>

                    <div className={cn("flex items-center gap-1 rounded-full border p-1", activeCosmeticUi.speedShellClass)}>
                        {[1, 0.85, 0.7, 0.5].map((speed) => (
                            <button
                                key={`translation-speed-${speed}`}
                                onClick={() => onPlaybackSpeedChange(speed)}
                                className={cn(
                                    "min-h-8 min-w-[52px] rounded-full px-3 text-[11px] font-bold transition-all duration-200",
                                    playbackSpeed === speed
                                        ? activeCosmeticUi.speedActiveClass
                                        : activeCosmeticUi.speedIdleClass
                                )}
                                aria-label={`设置播放速度 ${speed}x`}
                            >
                                {speed}x
                            </button>
                        ))}
                    </div>

                    {hasTranslationKeywords && !isVocabHintRevealed ? (
                        <button
                            onClick={onRevealVocabHint}
                            className={cn(
                                "flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-all hover:-translate-y-0.5",
                                activeCosmeticUi.vocabButtonClass,
                                isHintShake && "animate-shake"
                            )}
                        >
                            <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-black text-emerald-600">
                                {translationKeywords.length}
                            </span>
                            <span>显示关键词</span>
                            <span className="text-emerald-500">1 🧩</span>
                        </button>
                    ) : null}

                    <button
                        onClick={onRefresh}
                        disabled={isGeneratingDrill}
                        className={cn(
                            "relative flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60",
                            activeCosmeticUi.iconButtonClass
                        )}
                        title="刷新当前题目 · 消耗 1 张刷新卡"
                        aria-label="刷新当前题目"
                    >
                        <RefreshCw className={cn("h-4 w-4", isGeneratingDrill && "animate-spin")} />
                        <span
                            className={cn(
                                "absolute -right-1 -bottom-1 min-w-[15px] h-[15px] rounded-full px-1 text-[9px] font-black leading-[15px] shadow-sm",
                                activeCosmeticUi.wordBadgeActiveClass
                            )}
                        >
                            {refreshTicketCount}
                        </span>
                    </button>
                </div>

                {hasTranslationKeywords && (
                    <div className="pointer-events-none absolute inset-x-4 top-full z-10 mt-4 flex justify-center">
                        <AnimatePresence initial={false}>
                            {isVocabHintRevealed && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10, scale: 0.985 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.985 }}
                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                    className="pointer-events-auto flex max-w-3xl flex-wrap justify-center gap-3"
                                >
                                    {translationKeywords.map((vocab, index) => (
                                        <span
                                            key={`${vocab}-${index}`}
                                            onClick={(event) => onWordClick(event, vocab)}
                                            className={cn(
                                                "px-5 py-2 rounded-full border font-newsreader italic text-lg cursor-pointer transition-all",
                                                activeCosmeticUi.keywordChipClass
                                            )}
                                        >
                                            {vocab}
                                        </span>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
}
