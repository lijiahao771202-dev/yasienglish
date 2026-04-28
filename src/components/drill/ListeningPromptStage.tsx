"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Dices, Eye, EyeOff, Headphones, Heart, Play, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlaybackWaveBars } from "./PlaybackWaveBars";

export interface ListeningPromptStageProps {
    activePlaybackAudio: HTMLAudioElement | null;
    blindVisibleUnlockConsumed: boolean;
    boss: {
        active: boolean;
        hp?: number;
        maxHp?: number;
        playerHp?: number;
        playerMaxHp?: number;
        type: string;
    };
    fuseTime: number;
    gamble: {
        active: boolean;
        wager?: string | null;
    };
    hasPlayedEcho: boolean;
    isAudioLoading: boolean;
    isDictationMode: boolean;
    isGeneratingDrill: boolean;
    isListeningFamilyMode: boolean;
    isPlaying: boolean;
    isPrefetching: boolean;
    isRebuildMode: boolean;
    isRebuildPassage: boolean;
    isSubmittingDrill: boolean;
    isBlindMode: boolean;
    onBlindVisibilityToggle: () => void;
    onPlaybackSpeedChange: (speed: number) => void;
    onPlayAudio: () => void;
    onRefresh: () => void;
    onToggleChinese: () => void;
    playbackSpeed: number;
    refreshTicketCount: number;
    referenceContent: ReactNode;
    showChinese: boolean;
    sourceChinese: string;
    theme: "default" | "fever" | "boss" | "crimson";
}

export function ListeningPromptStage({
    activePlaybackAudio,
    blindVisibleUnlockConsumed,
    boss,
    fuseTime,
    gamble,
    hasPlayedEcho,
    isAudioLoading,
    isBlindMode,
    isDictationMode,
    isGeneratingDrill,
    isListeningFamilyMode,
    isPlaying,
    isPrefetching,
    isRebuildMode,
    isRebuildPassage,
    isSubmittingDrill,
    onBlindVisibilityToggle,
    onPlaybackSpeedChange,
    onPlayAudio,
    onRefresh,
    onToggleChinese,
    playbackSpeed,
    refreshTicketCount,
    referenceContent,
    showChinese,
    sourceChinese,
    theme,
}: ListeningPromptStageProps) {
    const blindActive = boss.active && boss.type === "blind" && isBlindMode;

    return (
        <div
            className={cn("w-full flex flex-col items-center justify-center relative", isRebuildPassage && "hidden")}
            aria-hidden={isRebuildPassage}
        >
            <button
                onClick={onPlayAudio}
                disabled={isPlaying || isAudioLoading || (boss.active && boss.type === "echo" && hasPlayedEcho)}
                className={cn(
                    "group relative flex items-center justify-center transition-all duration-500 shrink-0",
                    isRebuildMode ? "w-[3.75rem] h-[3.75rem] mb-1 sm:mb-2 mt-0" : isDictationMode ? "w-20 h-20 mb-4 mt-2" : "w-24 h-24 mb-8 mt-4",
                    (boss.active && boss.type === "echo" && hasPlayedEcho)
                        ? "grayscale opacity-50 cursor-not-allowed scale-95"
                        : "hover:scale-105 active:scale-95 disabled:opacity-80 disabled:scale-100"
                )}
            >
                <div
                    className={cn(
                        "absolute inset-0 rounded-full bg-gradient-to-br blur-2xl transition-all duration-500",
                        "from-theme-primary-bg/25 to-theme-primary-bg/10",
                        isPlaying ? "scale-125 opacity-100" : "scale-100 opacity-0 group-hover:opacity-100"
                    )}
                />
                <div
                    className={cn(
                        "absolute inset-0 rounded-full bg-white/60 dark:bg-white/10 backdrop-blur-2xl border border-white/50 dark:border-white/20 shadow-2xl transition-all duration-300 group-hover:bg-white/80 group-hover:border-white",
                        "shadow-theme-primary-bg/15",
                        isRebuildMode ? "border-[3px] border-theme-border/5" : ""
                    )}
                />
                <div className={cn("relative z-10 drop-shadow-sm flex items-center justify-center text-theme-primary-bg")}>
                    {isPrefetching || isAudioLoading ? (
                        <div
                            className={cn(
                                "w-10 h-10 border-4 rounded-full animate-spin",
                                "border-theme-primary-bg/20 border-t-theme-primary-bg"
                            )}
                        />
                    ) : isPlaying ? (
                        <PlaybackWaveBars audioElement={activePlaybackAudio} isPlaying={isPlaying} />
                    ) : (
                        <Play className={cn("ml-1.5 fill-theme-primary-bg text-theme-primary-bg", isRebuildMode ? "w-6 h-6" : "w-10 h-10")} />
                    )}
                </div>
            </button>

            <div
                className={cn(
                    "flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150",
                    isRebuildMode ? "mb-2 sm:mb-4 mt-[-0.25rem]" : isDictationMode ? "mb-4" : "mb-8"
                )}
            >
                <div className="flex items-center bg-stone-200/50 backdrop-blur-md p-1.5 rounded-full shadow-inner border border-stone-100/20">
                    {!isRebuildMode && (
                        <>
                            <button
                                onClick={onBlindVisibilityToggle}
                                className={cn(
                                    "px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2",
                                    isBlindMode
                                        ? "text-stone-500 hover:text-stone-700"
                                        : isDictationMode
                                            ? "bg-purple-50 text-purple-700 shadow-sm"
                                            : "bg-white text-stone-800 shadow-sm"
                                )}
                                title={isListeningFamilyMode && isBlindMode && !blindVisibleUnlockConsumed ? "开启 VISIBLE 将消耗 1 个 Hint 道具" : undefined}
                            >
                                {isBlindMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                {isBlindMode ? "BLIND TEXT" : "VISIBLE"}
                            </button>

                            {!isDictationMode && (
                                <>
                                    <div className="w-px h-4 bg-stone-300 mx-2" />
                                    <button
                                        onClick={onToggleChinese}
                                        className={cn(
                                            "w-8 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center",
                                            showChinese ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600"
                                        )}
                                        title="Toggle Chinese Translation"
                                    >
                                        中
                                    </button>
                                    <div className="w-px h-4 bg-stone-300 mx-2" />
                                </>
                            )}
                        </>
                    )}

                    <div className="flex items-center gap-1">
                        {[0.5, 0.75, 1.0, 1.25, 1.5].map((speed) => (
                            <button
                                key={speed}
                                onClick={() => onPlaybackSpeedChange(speed)}
                                className={cn(
                                    "text-[10px] px-3 py-1.5 rounded-full font-bold transition-all",
                                    playbackSpeed === speed
                                        ? isDictationMode
                                            ? "bg-purple-50 text-purple-700 shadow-sm"
                                            : "bg-white text-indigo-600 shadow-sm"
                                        : "text-stone-500 hover:text-stone-700"
                                )}
                            >
                                {speed}x
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-5 bg-stone-300 mx-2" />

                    <button
                        onClick={onRefresh}
                        disabled={isGeneratingDrill}
                        className={cn(
                            "relative w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-50",
                            isDictationMode
                                ? "text-purple-500 hover:text-purple-700 hover:bg-purple-50"
                                : "text-cyan-500 hover:text-cyan-700 hover:bg-cyan-50"
                        )}
                        title="刷新当前题目 · 消耗 1 张刷新卡"
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5", isGeneratingDrill && "animate-spin")} />
                        <span
                            className={cn(
                                "absolute -right-1 -bottom-1 min-w-[14px] h-[14px] rounded-full px-1 text-[9px] font-black leading-[14px] text-white",
                                isDictationMode
                                    ? "bg-purple-500 shadow-[0_4px_10px_rgba(168,85,247,0.35)]"
                                    : "bg-cyan-500 shadow-[0_4px_10px_rgba(6,182,212,0.35)]"
                            )}
                        >
                            {refreshTicketCount}
                        </span>
                    </button>
                </div>
            </div>

            {(boss.active || gamble.active) && (
                <div className="flex justify-center mb-0">
                    {boss.type === "reaper" ? (
                        <div className="flex gap-8 items-center animate-in fade-in slide-in-from-top-4">
                            <div className="flex gap-2 items-center bg-stone-900/40 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                                <span className="text-xs font-bold text-stone-400 mr-2">YOU</span>
                                {[...Array(boss.playerMaxHp || 3)].map((_, index) => (
                                    <motion.div
                                        key={`p-${index}`}
                                        initial={{ scale: 0 }}
                                        animate={{
                                            scale: index < (boss.playerHp || 0) ? 1 : 0.8,
                                            opacity: index < (boss.playerHp || 0) ? 1 : 0.2,
                                            filter: index < (boss.playerHp || 0) ? "grayscale(0%)" : "grayscale(100%)",
                                        }}
                                    >
                                        <Heart
                                            className={cn(
                                                "w-6 h-6",
                                                index < (boss.playerHp || 0)
                                                    ? "fill-emerald-500 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                                                    : "text-stone-700"
                                            )}
                                        />
                                    </motion.div>
                                ))}
                            </div>

                            <div className="text-xl font-black text-white/20 italic">VS</div>

                            <div className="flex gap-2 items-center bg-black/60 px-4 py-2 rounded-full border border-red-900/60 backdrop-blur-md shadow-[0_0_30px_rgba(220,38,38,0.2)]">
                                {[...Array(boss.maxHp || 3)].map((_, index) => (
                                    <motion.div
                                        key={`b-${index}`}
                                        initial={{ scale: 0 }}
                                        animate={{
                                            scale: index < (boss.hp || 0) ? 1 : 0.8,
                                            opacity: index < (boss.hp || 0) ? 1 : 0.2,
                                            filter: index < (boss.hp || 0) ? "grayscale(0%)" : "grayscale(100%)",
                                        }}
                                    >
                                        <Heart
                                            className={cn(
                                                "w-6 h-6",
                                                index < (boss.hp || 0)
                                                    ? "fill-red-600 text-red-500 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]"
                                                    : "text-stone-800"
                                            )}
                                        />
                                    </motion.div>
                                ))}
                                <span className="text-xs font-bold text-red-500 ml-2">REAPER</span>
                            </div>
                        </div>
                    ) : (boss.type === "lightning" || gamble.active) ? (
                        <div className="flex items-center gap-3 bg-stone-900/80 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                            <div className={cn("text-xs font-bold uppercase tracking-widest", theme === "boss" ? "text-amber-400" : "text-red-400")}>
                                {theme === "boss" ? "BOSS FUSE" : "DEATH FUSE"}
                            </div>
                            <div className="w-32 h-2 bg-stone-800 rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        "h-full transition-all duration-100 ease-linear",
                                        theme === "boss" ? "bg-amber-500" : "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]"
                                    )}
                                    style={{ width: `${Math.min(100, fuseTime)}%` }}
                                />
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            {!blindActive ? (
                <div
                    className={cn(
                        "relative w-full max-w-4xl mx-auto px-4 animate-in fade-in zoom-in-95 duration-500",
                        isRebuildMode ? "pt-2 pb-2" : isDictationMode ? "pt-6 pb-4" : "pt-12 pb-8"
                    )}
                >
                    <div className="text-center font-newsreader italic text-2xl md:text-3xl leading-relaxed text-stone-800 tracking-wide selection:bg-indigo-100">
                        {gamble.active && gamble.wager !== "safe" && !isSubmittingDrill ? (
                            <div
                                className={cn(
                                    "flex flex-col items-center gap-4 py-8 animate-pulse",
                                    theme === "boss" ? "text-amber-500/50" : "text-red-500/50"
                                )}
                            >
                                {theme === "boss" ? <Headphones className="w-8 h-8 opacity-50" /> : <Dices className="w-8 h-8 opacity-50" />}
                                <span className="text-sm font-mono tracking-[0.2em] uppercase">
                                    {theme === "boss" ? "Audio Stream Encryption Active" : "HIGH STAKES // BLIND BET"}
                                </span>
                                <div className="flex gap-1 mt-2">
                                    {[...Array(3)].map((_, index) => (
                                        <div
                                            key={index}
                                            className={cn("w-2 h-2 rounded-full animate-bounce", theme === "boss" ? "bg-amber-500/30" : "bg-red-500/30")}
                                            style={{ animationDelay: `${index * 0.1}s` }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : isRebuildMode ? (
                            <div className="h-1" />
                        ) : (
                            referenceContent
                        )}
                    </div>
                    {showChinese && !isRebuildMode ? (
                        <p className="mt-4 text-stone-500 text-lg text-center font-medium animate-in fade-in slide-in-from-top-2">
                            {sourceChinese}
                        </p>
                    ) : null}
                </div>
            ) : (
                <div className="relative w-full max-w-2xl mx-auto px-4 py-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {showChinese ? (
                        <div className="flex flex-col items-center gap-3 bg-amber-50/50 border border-amber-100/50 rounded-2xl p-6 backdrop-blur-sm animate-in fade-in zoom-in-95">
                            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest">
                                <Sparkles className="w-3 h-3" />
                                Hint / Translation
                            </div>
                            <p className="text-stone-600 text-lg font-medium text-center leading-relaxed opacity-80">{sourceChinese}</p>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
