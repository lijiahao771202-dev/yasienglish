"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useSpring, useTransform } from "framer-motion";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    Pause,
    Play,
    X,
} from "lucide-react";

import { useListeningCabinPlayer } from "@/hooks/useListeningCabinPlayer";
import { db } from "@/lib/db";
import type {
    ListeningCabinPlaybackMode,
    ListeningCabinSentence,
    ListeningCabinSession,
} from "@/lib/listening-cabin";
import { getPressableStyle } from "@/lib/pressable";
import { cn } from "@/lib/utils";

function renderSentence(sentence: string | undefined) {
    if (!sentence) {
        return null;
    }

    return sentence.replace(/^\s*[A-Za-z][A-Za-z0-9 .,'()\-&]{0,40}:\s*/u, "");
}

function getPlaybackModeLabel(mode: ListeningCabinPlaybackMode) {
    switch (mode) {
        case "single_pause":
            return "单句";
        case "repeat_current":
            return "循环";
        case "auto_all":
        default:
            return "连续";
    }
}

const FONT_OPTIONS_EN = [
    { name: "Modern Sans (Inter)", value: "var(--font-inter)" },
    { name: "Elegant Serif (Playfair)", value: "var(--font-en-serif-elegant)" },
    { name: "Classic Serif (Lora)", value: "var(--font-en-serif-classic)" },
    { name: "Geometric Sans (Montserrat)", value: "var(--font-en-sans-geometric)" },
    { name: "Soft Sans (Outfit)", value: "var(--font-en-sans-soft)" },
    { name: "Luxury Serif (Cormorant)", value: "var(--font-en-serif-luxury)" },
    { name: "Editorial Serif (Newsreader)", value: "var(--font-en-serif-editorial)" },
    { name: "Traditional Serif (Baskerville)", value: "var(--font-en-serif-trad)" },
    { name: "Clean Mono (Roboto)", value: "var(--font-roboto-mono)" },
    { name: "System Serif (Classic)", value: "serif" },
];

const FONT_OPTIONS_ZH = [
    { name: "现代黑体 (苹方)", value: "var(--font-zh-sans-modern)" },
    { name: "优雅宋体 (思源)", value: "var(--font-zh-serif-elegant)" },
    { name: "灵动手写 (马善政)", value: "var(--font-zh-handwriting)" },
    { name: "行云隶书 (芷芒星)", value: "var(--font-zh-calligraphy)" },
    { name: "如风草书 (龙藏)", value: "var(--font-zh-cursive)" },
    { name: "苍劲狂草 (刘建)", value: "var(--font-zh-bold-calligraphy)" },
    { name: "艺术设计 (黄油)", value: "var(--font-zh-artistic)" },
    { name: "经典楷体 (华文)", value: "var(--font-zh-kaiti)" },
    { name: "高质感黑 (冬青)", value: "var(--font-welcome-display)" },
    { name: "系统黑体 (雅黑)", value: "sans-serif" },
];

function renderSubtitleBlock(sentences: ListeningCabinSentence[], activeIndex: number, themeColor: string, fontFamily: string) {
    if (!sentences) return null;
    return sentences.map((sentence, sIdx) => {
        if (!sentence) return null;
        const isActive = sentence.index === activeIndex;
        const words = (renderSentence(sentence.english) || "").split(" ");
        
        return (
            <motion.div 
                key={sentence.index}
                initial={false}
                animate={{ 
                    opacity: isActive ? 1 : 0.35,
                    y: isActive ? 0 : 4
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="mb-8 last:mb-0 relative"
                style={{ fontFamily }}
            >
                {words.map((word, wIdx) => (
                    <motion.span
                        key={`${sIdx}-${wIdx}`}
                        whileHover={{ 
                            scale: 1.04,
                            color: themeColor,
                        }}
                        variants={{
                            hidden: { opacity: 0, scale: 0.98, y: 10 },
                            visible: { opacity: 1, scale: 1, y: 0 },
                        }}
                        transition={{
                            type: "spring",
                            stiffness: 140,
                            damping: 24
                        }}
                        className="inline-block mr-[0.24em] cursor-pointer transition-colors duration-300 select-none"
                        style={{ color: "#000000", fontWeight: 800 }}
                    >
                        {word}
                    </motion.span>
                ))}
            </motion.div>
        );
    });
}

function joinChineseSubtitle(sentences: ListeningCabinSentence[]) {
    return sentences.map((sentence) => sentence.chinese).join(" ");
}

const SPEAKER_MIST_THEMES = [
    ["rgba(99,102,241,0.65)", "rgba(168,85,247,0.50)", "rgba(59,130,246,0.30)"], // 0: Vivid Indigo (Cold Blue)
    ["rgba(245,158,11,0.60)", "rgba(251,146,60,0.50)", "rgba(254,240,138,0.30)"], // 1: Vivid Amber (Warm Gold)
    ["rgba(34,197,94,0.60)", "rgba(21,128,61,0.50)", "rgba(20,83,45,0.30)"],     // 2: Forest Mist (Deep Green)
    ["rgba(225,29,72,0.60)", "rgba(159,18,57,0.50)", "rgba(76,5,25,0.30)"],     // 3: Midnight Cherry (Crimson)
    ["rgba(14,165,233,0.65)", "rgba(2,132,199,0.50)", "rgba(31,41,55,0.30)"],    // 4: Ocean Depth (Vivid Cyan)
    ["rgba(202,138,4,0.60)", "rgba(161,98,7,0.50)", "rgba(113,63,18,0.30)"],     // 5: Desert Sand (Tobacco Brown)
    ["rgba(16,185,129,0.55)", "rgba(45,212,191,0.45)", "rgba(52,114,211,0.30)"], // 6: Vivid Emerald (Bright Green)
    ["rgba(244,63,94,0.60)", "rgba(251,191,36,0.50)", "rgba(251,113,133,0.30)"], // 7: Vivid Rose (Pinkish Red)
    ["rgba(139,92,246,0.60)", "rgba(236,72,153,0.50)", "rgba(244,114,182,0.30)"], // 8: Vivid Violet (Purple)
    ["rgba(100,116,139,0.60)", "rgba(71,85,105,0.50)", "rgba(31,41,55,0.35)"],    // 9: Cloudy Slate (Neutral Grey)
];

function ListeningCabinPlayerView({
    restart,
    session,
}: {
    restart: boolean;
    session: ListeningCabinSession;
}) {
    const router = useRouter();
    const player = useListeningCabinPlayer({ session, restart });
    const { playerState, currentSubtitleSentences, audioEnergy } = player;
    
    // Mercury Physics for Progress
    const springProgress = useSpring(playerState.progressRatio, {
        stiffness: 60,
        damping: 20,
        restDelta: 0.001
    });

    useEffect(() => {
        springProgress.set(playerState.progressRatio);
    }, [playerState.progressRatio, springProgress]);

    const {
        nextSentenceAction,
        previousSentenceAction,
        replayCurrentSentence,
        cyclePlaybackRate,
    } = player;

    const [showControls, setShowControls] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [fontEn, setFontEn] = useState("var(--font-inter)");
    const [fontZh, setFontZh] = useState("var(--font-zh-sans-modern)");

    const hideControlsTimerRef = useRef<number | null>(null);

    // Persistence: Load
    useEffect(() => {
        const savedEn = localStorage.getItem("listening_cabin_font_en");
        const savedZh = localStorage.getItem("listening_cabin_font_zh");
        if (savedEn) setFontEn(savedEn);
        if (savedZh) setFontZh(savedZh);
    }, []);

    // Persistence: Save
    useEffect(() => {
        localStorage.setItem("listening_cabin_font_en", fontEn);
        localStorage.setItem("listening_cabin_font_zh", fontZh);
    }, [fontEn, fontZh]);

    const completionLabel = useMemo(() => {
        const current = String(playerState.currentSentenceIndex + 1).padStart(2, "0");
        const total = String(session.sentences.length).padStart(2, "0");
        return `${current} / ${total}`;
    }, [playerState.currentSentenceIndex, session.sentences.length]);
    const currentEnglishText = useMemo(
        () => currentSubtitleSentences.map((sentence) => sentence.english).join(" "),
        [currentSubtitleSentences],
    );
    const currentSpeakerTags = useMemo(() => {
        const ordered: string[] = [];
        const seen = new Set<string>();
        currentSubtitleSentences.forEach((sentence) => {
            const speaker = sentence.speaker?.trim();
            if (!speaker || seen.has(speaker)) {
                return;
            }
            seen.add(speaker);
            ordered.push(speaker);
        });
        return ordered;
    }, [currentSubtitleSentences]);
    const subtitleTypographyClass = useMemo(() => {
        const base = "mx-auto text-balance-editorial font-sans transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] selection:bg-[#3b82f6]/20";
        
        // Fluid Typography: clamp(min, preferred, max)
        const fluidFontSize = "text-[clamp(1.8rem,4vw+1rem,3.8rem)]";
        
        return `${base} ${fluidFontSize} leading-[1.18] tracking-[-0.028em] text-[#000000]`;
    }, []);
    const currentSpeakerIndex = useMemo(() => {
        if (currentSpeakerTags.length === 0) return 0;
        // Use the first speaker currently shown
        const speaker = currentSpeakerTags[0];
        // Find their total index in the session's overall speaker plan if possible, 
        // fallback to a simple hash of the name
        let hash = 0;
        for (let i = 0; i < (speaker?.length ?? 0); i++) {
            hash = (speaker?.charCodeAt(i) ?? 0) + ((hash << 5) - hash);
        }
        return Math.abs(hash % SPEAKER_MIST_THEMES.length);
    }, [currentSpeakerTags]);

    const activeMistTheme = useMemo(
        () => SPEAKER_MIST_THEMES[currentSpeakerIndex % SPEAKER_MIST_THEMES.length],
        [currentSpeakerIndex],
    );

    // Phase 16: The Eternal Ethereal (Breathing & Cross-Fade Architecture)
    // We remove the manual auroraDuration/isBlooming for background as it's now handled by AnimatePresence

    const activeSubtitleKey = currentSubtitleSentences.map((sentence) => sentence.index).join("-");
    const activeSpeaker = useMemo(() => {
        const sentence = session.sentences[playerState.currentSentenceIndex];
        return sentence?.speaker?.trim() ?? null;
    }, [playerState.currentSentenceIndex, session.sentences]);

    const cyclePlaybackMode = useCallback(() => {
        if (playerState.playbackMode === "single_pause") {
            player.setAutoAllMode();
            return;
        }

        if (playerState.playbackMode === "auto_all") {
            player.setRepeatCurrentMode();
            return;
        }

        player.setSinglePauseMode();
    }, [player, playerState.playbackMode]);

    useEffect(() => {
        return () => {
            if (hideControlsTimerRef.current !== null) {
                window.clearTimeout(hideControlsTimerRef.current);
            }
        };
    }, []);

    const scheduleHideControls = useCallback(() => {
        if (hideControlsTimerRef.current !== null) {
            window.clearTimeout(hideControlsTimerRef.current);
        }

        hideControlsTimerRef.current = window.setTimeout(() => {
            setShowControls(false);
        }, 1600);
    }, []);

    const revealControls = useCallback(() => {
        setShowControls(true);
        scheduleHideControls();
    }, [scheduleHideControls]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === " " || event.code === "Space") {
                event.preventDefault();
                void replayCurrentSentence();
                revealControls();
                return;
            }

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                void previousSentenceAction();
                revealControls();
                return;
            }

            if (event.key === "ArrowRight") {
                event.preventDefault();
                void nextSentenceAction();
                revealControls();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [nextSentenceAction, previousSentenceAction, replayCurrentSentence, revealControls]);

    return (
        <main
            className="relative min-h-screen overflow-hidden bg-[#f8f9fa] text-[#202325]"
            onMouseMove={(event) => {
                const viewportHeight = window.innerHeight || 0;
                if (event.clientY >= viewportHeight - 180) {
                    revealControls();
                }
            }}
            onMouseLeave={scheduleHideControls}
        >
            {/* Phase 4: Prism & Fluid - Masterpiece Background */}
            <div className="pointer-events-none absolute inset-0 bg-[#ffffff] overflow-hidden">
                {/* Secondary Background Pass for Materiality */}
                <div className="premium-grain-overlay" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.9)_0%,transparent_80%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.5)_0%,transparent_80%)] opacity-70" />
                
                {/* Phase 22: Unified Continuous Atmosphere (Persistent & Morphing) */}
                <div 
                    className="absolute inset-0 opacity-[0.98] contrast-[1.15] overflow-hidden mix-blend-multiply"
                    style={{ filter: 'url(#prism-grain)' }}
                >
                    {/* 
                        UNIFIED ATMOSPHERE: 
                        No AnimatePresence here. Light volumes are permanent and morph in-place.
                    */}
                    
                    {/* Top-Left Marginal Flux (Primary) */}
                    <motion.div 
                        animate={{ 
                            top: "0%", left: "0%",
                            opacity: 1
                        }}
                        transition={{ duration: 3.5, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute top-0 left-0 w-[45vw] h-[45vh] -translate-x-[20%] -translate-y-[20%]"
                    >
                        <motion.div
                            animate={{ 
                                background: `radial-gradient(circle at center, ${activeMistTheme[0]} 0%, transparent 75%)`,
                                opacity: [0.55, 0.9, 0.55],
                                scale: [1, 1.05, 1],
                                x: ["0%", "8%", "-5%", "0%"],
                                y: ["0%", "-5%", "7%", "0%"]
                            }}
                            transition={{ 
                                background: { duration: 2.5, ease: "easeInOut" },
                                duration: 22, 
                                repeat: Infinity, 
                                ease: "linear",
                                opacity: { duration: 6.5, repeat: Infinity, ease: "easeInOut" }
                            }}
                            className="absolute inset-0 blur-[100px]"
                        />
                    </motion.div>

                    {/* Bottom-Right Marginal Flux (Accent) */}
                    <motion.div 
                        animate={{ 
                            bottom: "0%", right: "0%",
                            opacity: 1
                        }}
                        transition={{ duration: 3.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                        className="absolute bottom-0 right-0 w-[40vw] h-[40vh] translate-x-[20%] translate-y-[20%]"
                    >
                        <motion.div
                            animate={{ 
                                background: `radial-gradient(circle at center, ${activeMistTheme[1]} 0%, transparent 75%)`,
                                opacity: [0.4, 0.8, 0.4],
                                scale: [1, 1.08, 1],
                                x: ["0%", "-10%", "5%", "0%"],
                                y: ["0%", "8%", "-6%", "0%"]
                            }}
                            transition={{ 
                                background: { duration: 2.5, ease: "easeInOut" },
                                duration: 25, 
                                repeat: Infinity, 
                                ease: "linear",
                                opacity: { duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }
                            }}
                            className="absolute inset-0 blur-[90px]"
                        />
                    </motion.div>

                    {/* Mid-Right Marginal Flux (Ghost) */}
                    <motion.div 
                        animate={{ 
                            top: "50%", right: "0%",
                            opacity: 0.75
                        }}
                        transition={{ duration: 4.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                        className="absolute top-1/2 right-0 w-[35vw] h-[55vh] translate-x-[30%] -translate-y-1/2"
                    >
                        <motion.div
                            animate={{ 
                                background: `radial-gradient(circle at center, ${activeMistTheme[2]} 0%, transparent 75%)`,
                                opacity: [0.3, 0.7, 0.3],
                                x: ["0%", "-12%", "4%", "0%"],
                                y: ["-5%", "10%", "-5%"]
                            }}
                            transition={{ 
                                background: { duration: 2.5, ease: "easeInOut" },
                                duration: 28, 
                                repeat: Infinity, 
                                ease: "linear",
                                opacity: { duration: 7, repeat: Infinity, ease: "easeInOut", delay: 2 }
                            }}
                            className="absolute inset-0 blur-[110px]"
                        />
                    </motion.div>
                </div>
                
                {/* Content-Driven Parallax Orbs (Floating Foreground Depth) */}
                <motion.div
                    animate={{
                        x: [0 + (playerState.currentSentenceIndex * 5), 30 + (playerState.currentSentenceIndex * 5), 0 + (playerState.currentSentenceIndex * 5)],
                        y: [0 - (playerState.currentSentenceIndex * 3), -20 - (playerState.currentSentenceIndex * 3), 0 - (playerState.currentSentenceIndex * 3)],
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute left-[10%] top-[20%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.4)_0%,transparent_70%)] blur-[90px]"
                />
            </div>

            <button
                type="button"
                onClick={() => {
                    void previousSentenceAction();
                    revealControls();
                }}
                className="absolute inset-y-0 left-0 z-10 hidden w-[20%] min-w-[120px] cursor-w-resize bg-transparent md:block"
                aria-label="上一句"
            />
            <button
                type="button"
                onClick={() => {
                    void nextSentenceAction();
                    revealControls();
                }}
                className="absolute inset-y-0 right-0 z-10 hidden w-[20%] min-w-[120px] cursor-e-resize bg-transparent md:block"
                aria-label="下一句"
            />

            <div className="relative z-[100] flex min-h-screen flex-col px-5 py-5 sm:px-8 lg:px-10">
                <header
                    className={cn(
                        "flex items-center justify-end gap-4 transition-all duration-300",
                        showControls || showSettings ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                >
                    {/* Phase 24: Typographic Atelier Toggle */}
                    <motion.button
                        type="button"
                        onClick={() => setShowSettings(!showSettings)}
                        whileHover={{ scale: 1.1, rotate: 15 }}
                        whileTap={{ scale: 0.9 }}
                        className="ui-pressable inline-flex h-9 w-9 items-center justify-center rounded-full text-[#4c555b] bg-white/40 backdrop-blur-sm shadow-sm"
                        style={getPressableStyle("rgba(67,83,99,0.08)", 2)}
                    >
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                        </svg>
                    </motion.button>

                    <button
                        type="button"
                        onClick={() => router.push("/listening-cabin")}
                        className="ui-pressable inline-flex h-9 w-9 items-center justify-center rounded-full text-[#4c555b] bg-white/40 backdrop-blur-sm shadow-sm"
                        style={getPressableStyle("rgba(67,83,99,0.08)", 2)}
                        aria-label="关闭播放器"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {/* Settings Popover (The Typographic Atelier) */}
                    <AnimatePresence>
                        {showSettings && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute top-20 right-10 w-72 z-[300] glass-panel p-5 rounded-[2.5rem] shadow-2xl border-white/80 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-white/30 pointer-events-none" />
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-5">
                                        <h3 className="text-[10px] font-black tracking-[0.25em] text-slate-900 uppercase opacity-60">文字工坊</h3>
                                        <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                            <X size={14} />
                                        </button>
                                    </div>

                                    {/* English Section */}
                                    <div className="mb-5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2.5 block px-1">English Font</label>
                                        <div className="grid grid-cols-1 gap-1.5 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar">
                                            {FONT_OPTIONS_EN.map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setFontEn(opt.value)}
                                                    className={cn(
                                                        "w-full text-left px-4 py-2 rounded-xl text-xs transition-all duration-200 border border-transparent",
                                                        fontEn === opt.value 
                                                            ? "bg-amber-100/60 text-amber-900 font-bold border-amber-200/50 shadow-[0_2px_8px_rgba(245,158,11,0.1)]" 
                                                            : "hover:bg-black/5 text-slate-600"
                                                    )}
                                                    style={{ fontFamily: opt.value }}
                                                >
                                                    {opt.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Chinese Section */}
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2.5 block px-1">Chinese Font</label>
                                        <div className="grid grid-cols-1 gap-1.5 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar">
                                            {FONT_OPTIONS_ZH.map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setFontZh(opt.value)}
                                                    className={cn(
                                                        "w-full text-left px-4 py-2 rounded-xl text-xs transition-all duration-200 border border-transparent",
                                                        fontZh === opt.value 
                                                            ? "bg-rose-100/60 text-rose-900 font-bold border-rose-200/50 shadow-[0_2px_8px_rgba(244,63,94,0.1)]" 
                                                            : "hover:bg-black/5 text-slate-600"
                                                    )}
                                                    style={{ fontFamily: opt.value }}
                                                >
                                                    {opt.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </header>

                <div className="relative flex flex-1 flex-col items-center justify-center py-6 text-center">
                    <div className="flex w-full max-w-[76rem] flex-col items-center justify-center gap-7">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeSubtitleKey}
                                initial={{ opacity: 0, y: 18 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -14 }}
                                transition={{
                                    duration: 0.34,
                                    ease: [0.22, 1, 0.36, 1],
                                }}
                                className="w-full"
                            >
                                {currentSpeakerTags.length > 0 ? (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.96 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="mb-10 flex flex-wrap items-center justify-center gap-8"
                                    >
                                        {currentSpeakerTags.map((speaker) => {
                                            const isActive = speaker === activeSpeaker;
                                            return (
                                                <motion.div
                                                    key={speaker}
                                                    initial={false}
                                                    animate={{
                                                        scale: isActive ? 1.05 : 1,
                                                        backgroundColor: isActive ? "rgba(255, 255, 255, 0.98)" : "rgba(255, 255, 255, 0.3)",
                                                        boxShadow: isActive 
                                                            ? `0 12px 32px rgba(0, 0, 0, 0.08), 0 0 0 0.5px rgba(255, 255, 255, 0.8), 0 0 15px ${activeMistTheme[0].replace('0.35', '0.2')}` 
                                                            : "0 4px 12px rgba(0, 0, 0, 0.02), 0 0 0 0.5px rgba(255, 255, 255, 0.4)",
                                                    }}
                                                    className="px-5 py-2 rounded-full backdrop-blur-md transition-all duration-700 border-[0.5px] border-white/20"
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        {isActive && (
                                                            <motion.div 
                                                                animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                                                                transition={{ duration: 2, repeat: Infinity }}
                                                                style={{ backgroundColor: activeMistTheme[0] }}
                                                                className="w-1.5 h-1.5 rounded-full"
                                                            />
                                                        )}
                                                        <span className={cn(
                                                            "text-[10px] font-black tracking-[0.25em] uppercase",
                                                            isActive ? "text-[#1a1f24]" : "text-[#64748b]/40"
                                                        )}>
                                                            {speaker}
                                                        </span>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </motion.div>
                                ) : null}
                                <motion.div
                                    initial="hidden"
                                    animate="visible"
                                    variants={{
                                        visible: {
                                            transition: {
                                                staggerChildren: 0.08,
                                            },
                                        },
                                    }}
                                    className="relative"
                                >
                                    <motion.h1
                                        className={subtitleTypographyClass}
                                        variants={{
                                            hidden: { opacity: 0, y: 16 },
                                            visible: { opacity: 1, y: 0 },
                                        }}
                                        transition={{
                                            duration: 1.0,
                                            ease: [0.22, 1, 0.36, 1],
                                        }}
                                    >
                                        {renderSubtitleBlock(currentSubtitleSentences, playerState.currentSentenceIndex, activeMistTheme[0], fontEn)}
                                    </motion.h1>
                                    
                                    <motion.p
                                        className={cn(
                                            "font-sans mx-auto mt-10 max-w-[56rem] text-[clamp(1.1rem,2vw,1.35rem)] font-medium leading-relaxed tracking-wide transition-all duration-700",
                                            playerState.showChineseSubtitle ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
                                        )}
                                        style={{ color: "#000000" }}
                                        variants={{
                                            hidden: { opacity: 0, y: 16 },
                                            visible: { opacity: 1, y: 0 },
                                        }}
                                        transition={{
                                            duration: 0.6,
                                            ease: [0.22, 1, 0.36, 1],
                                            delay: 0.12,
                                        }}
                                    >
                                        <span style={{ fontFamily: fontZh }}>
                                            {joinChineseSubtitle(currentSubtitleSentences)}
                                        </span>
                                    </motion.p>
                                </motion.div>
                            </motion.div>
                        </AnimatePresence>
                        <div className="w-full max-w-[36rem] px-12">
                            <div className="relative h-[10px] w-full rounded-full bg-black/[0.03] border border-black/[0.03] shadow-[inset_0_1px_3px_rgba(0,0,0,0.05)] overflow-visible">
                                {/* Mercury Physics Container */}
                                <div className="absolute inset-0 overflow-visible" style={{ filter: 'url(#mercury-gooey)' }}>
                                    {/* Liquid Fill */}
                                    <motion.div
                                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                                        style={{ width: useTransform(springProgress, p => `${p * 100}%`) }}
                                    />
                                    {/* Mercury Bead */}
                                    <motion.div
                                        style={{ left: useTransform(springProgress, p => `${p * 100}%`) }}
                                        className="absolute top-1/2 -translate-y-1/2 -ml-2.5 w-5 h-5 rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.05)] flex items-center justify-center overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-[#cbd5e1] opacity-40" />
                                        <motion.div 
                                            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                                            transition={{ duration: 3, repeat: Infinity }}
                                            className="w-2 h-2 rounded-full bg-blue-500 blur-[2px]" 
                                        />
                                    </motion.div>
                                </div>
                                {/* Internal Speculars */}
                                <motion.div
                                    animate={{ x: ["-100%", "300%"] }}
                                    transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                                    className="absolute inset-y-0 w-32 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-25deg] pointer-events-none"
                                />
                            </div>
                            <div className="mt-4 flex items-center justify-between px-2">
                                <div className="flex items-center gap-4">
                                    <span className="text-[10px] font-bold tracking-[0.2em] text-[#94a3b8]/60 uppercase">Vocal Responsive</span>
                                </div>
                                <span className="text-[10px] font-bold tracking-widest text-[#64748b]/90 tabular-nums">
                                    {completionLabel}
                                </span>
                            </div>
                        </div>
                    </div>

                    {playerState.errorMessage ? (
                        <div className="mt-8 rounded-full border border-[#ecc8cf] bg-white/78 px-4 py-2 text-sm text-[#b4233c] shadow-sm">
                            {playerState.errorMessage}
                        </div>
                    ) : null}
                </div>

                <div className="pb-8 text-center px-6">
                    <motion.div
                        className="mx-auto flex w-fit items-center gap-10 rounded-[32px] bg-white/45 px-10 py-5 border border-white/20"
                        initial={false}
                        animate={
                            showControls
                                ? { 
                                    opacity: 1, 
                                    y: 0, 
                                    pointerEvents: "auto",
                                    boxShadow: `0 30px 70px rgba(0,0,0,0.1), inset 0 2px 14px rgba(255,255,255,0.6), 0 0 25px ${activeMistTheme[0].replace('0.35', '0.1')}`
                                  }
                                : { opacity: 0, y: 32, pointerEvents: "none" }
                        }
                        style={{ backdropFilter: "blur(40px) saturate(1.2)" }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        onMouseMove={revealControls}
                        onMouseEnter={revealControls}
                        onMouseLeave={scheduleHideControls}
                    >
                        {/* Playback Mode: Monospace Precision */}
                        <div className="flex flex-col items-center gap-1.5 min-w-[4.5rem]">
                            <span className="text-[8px] font-black tracking-[0.25em] text-[#94a3b8]/60 uppercase ml-0.5">Mode</span>
                            <button
                                type="button"
                                onClick={() => {
                                    cyclePlaybackMode();
                                    revealControls();
                                }}
                                className="ui-pressable inline-flex items-center justify-center text-[11px] font-bold tracking-[0.12em] text-[#121417] transition hover:text-blue-600"
                                style={getPressableStyle("rgba(0,0,0,0.03)", 2)}
                                aria-label={`播放模式：${getPlaybackModeLabel(playerState.playbackMode)}`}
                            >
                                {getPlaybackModeLabel(playerState.playbackMode)}
                            </button>
                        </div>

                        {/* Symbolic Controls */}
                        <div className="flex items-center gap-8">
                            <button
                                type="button"
                                onClick={() => {
                                    void previousSentenceAction();
                                    revealControls();
                                }}
                                disabled={playerState.currentSentenceIndex === 0}
                                className="ui-pressable text-[#121417] transition hover:opacity-60 disabled:opacity-20"
                                style={getPressableStyle("rgba(0,0,0,0.03)", 2)}
                                aria-label="上一句"
                            >
                                <ChevronLeft className="h-6 w-6 stroke-[2.5]" />
                            </button>

                            {/* The Jewel Play Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    if (playerState.isPlaying) {
                                        player.pausePlayback();
                                        return;
                                    }
                                    void player.resumeOrPlay();
                                }}
                                className="group relative flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-br from-white/90 to-[#cbd5e1]/40 shadow-[0_15px_35px_rgba(0,0,0,0.08),inset_0_2px_8px_rgba(255,255,255,0.8)] transition-all duration-500 overflow-hidden"
                                style={getPressableStyle("rgba(0,0,0,0.05)", 4)}
                                aria-label={playerState.isPlaying ? "暂停播放" : "开始播放"}
                            >
                                {/* Jewel Core: Audio Reactive Glow */}
                                <motion.div 
                                    animate={{ 
                                        scale: playerState.isPlaying ? [1, 1.05, 1] : 1,
                                        opacity: playerState.isPlaying ? [0.4, 0.7, 0.4] : 0.2
                                    }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    style={{ backgroundColor: activeMistTheme[0] }}
                                    className="absolute inset-0 blur-[12px]"
                                />
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.6)_0%,transparent_70%)]" />

                                {playerState.isLoading ? (
                                    <Loader2 className="relative z-10 h-6 w-6 animate-spin text-[#121417]" />
                                ) : playerState.isPlaying ? (
                                    <Pause className="relative z-10 h-7 w-7 fill-[#121417] text-[#121417]" />
                                ) : (
                                    <Play className="relative z-10 h-8 w-8 fill-[#121417] text-[#121417] ml-1" />
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    void nextSentenceAction();
                                    revealControls();
                                }}
                                disabled={playerState.currentSentenceIndex >= session.sentences.length - 1}
                                className="ui-pressable text-[#121417] transition hover:opacity-60 disabled:opacity-20"
                                style={getPressableStyle("rgba(0,0,0,0.03)", 2)}
                                aria-label="下一句"
                            >
                                <ChevronRight className="h-6 w-6 stroke-[2.5]" />
                            </button>
                        </div>

                        {/* Speed: Monospace Precision */}
                        <div className="flex flex-col items-center gap-1.5 min-w-[4.5rem]">
                            <span className="text-[8px] font-black tracking-[0.25em] text-[#94a3b8]/60 uppercase ml-0.5">Speed</span>
                            <button
                                type="button"
                                onClick={() => {
                                    cyclePlaybackRate();
                                    revealControls();
                                }}
                                className="ui-pressable inline-flex items-center justify-center text-[11px] font-bold tracking-[0.08em] text-[#121417] transition hover:text-blue-600"
                                style={getPressableStyle("rgba(0,0,0,0.03)", 2)}
                                aria-label={`播放速度 ${playerState.playbackRate.toFixed(2)}x`}
                            >
                                {playerState.playbackRate.toFixed(2)}x
                            </button>
                        </div>
                    </motion.div>
                </div>
            </div>
        </main>
    );
}

export function ListeningCabinPlayer() {
    const router = useRouter();
    const params = useParams<{ sessionId: string }>();
    const searchParams = useSearchParams();
    const restart = searchParams.get("restart") === "1";
    const sessionId = params.sessionId;
    const [session, setSession] = useState<ListeningCabinSession | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            const nextSession = await db.listening_cabin_sessions.get(sessionId);
            if (!cancelled) {
                setSession(nextSession ?? null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [sessionId]);

    if (session === undefined) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#f5f0e9] text-[#17120f]">
                <div className="rounded-full bg-white/80 px-5 py-3 text-sm text-[#62584e] shadow-sm">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    正在载入听力舱...
                </div>
            </main>
        );
    }

    if (!session) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#f5f0e9] px-4 text-[#17120f]">
                <div className="max-w-md rounded-[30px] border border-[#e6ddd2] bg-white px-8 py-10 text-center shadow-[0_20px_46px_rgba(24,20,17,0.08)]">
                    <p className="font-newsreader text-[2.2rem] leading-none tracking-[-0.05em]">
                        这份脚本不在听力舱里了。
                    </p>
                    <button
                        type="button"
                        onClick={() => router.push("/listening-cabin")}
                        className="ui-pressable mt-6 inline-flex items-center gap-2 rounded-full border border-[#17120f] bg-white px-4 py-2 text-sm font-medium text-[#17120f]"
                        style={getPressableStyle("rgba(23,18,15,0.08)", 3)}
                    >
                        返回听力舱
                    </button>
                </div>
            </main>
        );
    }

    return (
        <>
            <ListeningCabinPlayerView restart={restart} session={session} />
            {/* Phase 6: SVG Filters Definition - Root Level */}
            <svg className="absolute h-0 w-0 pointer-events-none appearance-none font-sans">
                <defs>
                    {/* Gooey Filter for Mercury Effect */}
                    <filter id="mercury-gooey" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                        <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="gooey" />
                        <feComposite in="SourceGraphic" in2="gooey" operator="atop"/>
                    </filter>
                    {/* Prismatic Grain for Depth Texture */}
                    <filter id="prism-grain" x="0%" y="0%" width="100%" height="100%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch" />
                        <feColorMatrix type="saturate" values="0" />
                        <feComponentTransfer>
                            <feFuncA type="linear" slope="0.03" />
                        </feComponentTransfer>
                        <feBlend in="SourceGraphic" mode="soft-light" />
                    </filter>
                </defs>
            </svg>
        </>
    );
}
