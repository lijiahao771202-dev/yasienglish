"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useSpring, useTransform } from "framer-motion";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    Pause,
    Play,
    X,
    Zap,
    Trophy,
    Home,
    ArrowRight,
    CheckCircle2,
    Flame,
    Sparkles,
} from "lucide-react";
import { useForgeHaptics } from "@/hooks/useForgeHaptics";

import { useListeningCabinPlayer } from "@/hooks/useListeningCabinPlayer";
import { WordPopup, type PopupState } from "@/components/reading/WordPopup";
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
    { name: "Serif: Merriweather", value: "'Merriweather', serif" },
    { name: "Serif: Newsreader", value: "'Newsreader', serif" },
    { name: "Serif: Baskerville", value: "'Libre Baskerville', serif" },
    { name: "Serif: Lora", value: "'Lora', serif" },
    { name: "Serif: Cormorant", value: "'Cormorant Garamond', serif" },
    { name: "Sans: Montserrat", value: "'Montserrat', sans-serif" },
    { name: "Mono: JetBrains", value: "'JetBrains Mono', monospace" },
];

const FONT_OPTIONS_ZH = [
    { name: "艺术设计 (黄油)", value: "var(--font-zh-artistic)" },
    { name: "经典楷体 (华文)", value: "var(--font-zh-kaiti)" },
    { name: "高质感黑 (冬青)", value: "var(--font-welcome-display)" },
    { name: "系统黑体 (雅黑)", value: "sans-serif" },
];

const SUBTITLE_ADVANCE_OPTIONS = [
    { label: "0.0s", value: 0 },
    { label: "0.3s", value: 300 },
    { label: "0.6s", value: 600 },
    { label: "1.0s", value: 1000 },
    { label: "1.2s", value: 1200 },
] as const;

type TransitionStyle = "radiant" | "mist" | "glide" | "classic" | "typewriter" | "blur" | "stagger" | "elastic" | "neon";
type TypographyStyle = "crystal" | "aurora" | "hollow" | "honey" | "neon_pulse" | "pearl_glow" | "deep_sea_void";

function isTransitionStyle(value: string): value is TransitionStyle {
    return ["radiant", "mist", "glide", "classic", "typewriter", "blur", "stagger", "elastic", "neon"].includes(value);
}

function isTypographyStyle(value: string): value is TypographyStyle {
    return ["crystal", "aurora", "hollow", "honey", "neon_pulse", "pearl_glow", "deep_sea_void"].includes(value);
}

function renderSubtitleBlock(
    sentences: ListeningCabinSentence[], 
    activeIndex: number, 
    themeColor: string, 
    fontFamily: string,
    transitionStyle: string,
    typographyStyle: string,
    fontSizeEn: number,
    onWordClick: (word: string, context: string, anchorElement: HTMLElement) => void
) {
    if (!sentences) return null;
    return sentences.map((sentence, sIdx) => {
        if (!sentence) return null;
        const isActive = sentence.index === activeIndex;
        const rawContent = renderSentence(sentence.english) || "";
        const words = rawContent.split(" ");
        
        // Define Typography Styles with Ambient Shadow Support
        const getStyleConfig = () => {
            const baseStyle = {
                color: "#1e293b",
                fontWeight: 700,
                fontSize: `${fontSizeEn}em`,
                // Soft Ambient Light Bleed:
                textShadow: isActive && themeColor ? `0 0 15px ${themeColor.replace('0.6', '0.12').replace('0.65', '0.12')}` : "none",
                transition: "all 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
            } as any;

            switch (typographyStyle) {
                case "aurora":
                    return { 
                        ...baseStyle,
                        textShadow: isActive && themeColor 
                            ? `0 0 4px ${themeColor.replace('0.6', '0.35')}, 0 0 12px ${themeColor.replace('0.6', '0.15')}` 
                            : `0 0 4px #00000010`,
                    };
                case "hollow":
                    return { 
                        ...baseStyle,
                        color: "transparent", 
                        WebkitTextStroke: "1px #1e293b",
                        fontWeight: 900,
                        textShadow: "none"
                    };
                case "honey":
                    return { 
                        ...baseStyle,
                        color: "#713f12", 
                        textShadow: isActive && themeColor ? `0 2px 10px ${themeColor.replace('0.6', '0.2')}` : "0.5px 0.5px 1px rgba(0,0,0,0.05)",
                    };
                case "neon_pulse":
                    return {
                        ...baseStyle,
                        color: "#fff",
                        textShadow: isActive && themeColor 
                            ? `0 0 8px ${themeColor}, 0 0 16px ${themeColor}, 0 0 24px ${themeColor}` 
                            : "0 0 4px rgba(0,0,0,0.1)",
                        animation: isActive ? "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" : "none"
                    };
                case "pearl_glow":
                    return {
                        ...baseStyle,
                        color: "#f8fafc",
                        textShadow: isActive ? "0 0 20px rgba(255,255,255,0.8), 0 0 40px rgba(255,255,255,0.4)" : "none",
                        fontWeight: 600,
                    };
                case "deep_sea_void":
                    return {
                        ...baseStyle,
                        color: "rgba(30, 41, 59, 0.85)",
                        textShadow: "none",
                        fontWeight: 500,
                    };
                default: // crystal
                    return baseStyle;
            }
        };

        const styleConfig = getStyleConfig();

        // Block-Level Container Variants
        const containerVariants = {
            hidden: { opacity: 0 },
            visible: { 
                opacity: 1,
                transition: {
                    staggerChildren: transitionStyle === "radiant" ? 0.045 : 
                                     transitionStyle === "typewriter" ? 0.08 : 
                                     transitionStyle === "glide" ? 0.06 : 
                                     transitionStyle === "stagger" ? 0.1 : 0,
                    delayChildren: 0.05
                }
            },
            exit: { 
                opacity: 0,
                transition: { 
                    staggerChildren: 0.015, 
                    staggerDirection: -1 
                }
            }
        };

        // Subtitle Style Logic
        const renderWords = () => {
            if (transitionStyle === "radiant") {
                return words.map((word, wIdx) => (
                    <motion.span
                        key={`${sIdx}-${wIdx}`}
                        data-word-popup-segment={word}
                        variants={{
                            hidden: { opacity: 0 },
                            visible: { opacity: 1, transition: { staggerChildren: 0.008 } },
                            exit: { opacity: 0, transition: { duration: 0.2 } }
                        }}
                        className="inline-block mr-[0.24em] whitespace-nowrap cursor-pointer selection:bg-blue-500/10 active:text-blue-600 transition-colors duration-400"
                        onClick={(event) => onWordClick(word, rawContent, event.currentTarget)}
                        style={styleConfig}
                    >
                        {word.split("").map((char, cIdx) => (
                            <motion.span
                                key={cIdx}
                                variants={{
                                    hidden: { opacity: 0, y: 12 },
                                    visible: { 
                                        opacity: 1, y: 0,
                                        transition: { type: "spring", stiffness: 120, damping: 28, mass: 1 }
                                    },
                                    exit: { opacity: 0, y: -10, transition: { duration: 0.2 } }
                                }}
                                className="inline-block"
                            >
                                {char}
                            </motion.span>
                        ))}
                    </motion.span>
                ));
            }

            return words.map((word, wIdx) => {
                const wordVar = {
                    hidden: transitionStyle === "glide" ? { opacity: 0, y: 25, scale: 0.9 } :
                             transitionStyle === "typewriter" ? { opacity: 0, y: 4, filter: "blur(4px)" } :
                             transitionStyle === "blur" ? { opacity: 0, filter: "blur(12px)", scale: 1.1 } :
                             transitionStyle === "stagger" ? { opacity: 0, x: -20, rotate: -5 } :
                             transitionStyle === "elastic" ? { opacity: 0, scale: 0.5, y: 20 } :
                             transitionStyle === "neon" ? { opacity: 0, textShadow: "0 0 0px transparent" } :
                             { opacity: 0 },
                    visible: { 
                        opacity: 1, y: 0, x: 0, scale: 1, rotate: 0, filter: "blur(0px)",
                        textShadow: (transitionStyle === "neon" ? `0 0 20px ${themeColor}` : styleConfig.textShadow) as any,
                        transition: { 
                            type: "spring" as const, 
                            stiffness: transitionStyle === "elastic" ? 260 : 100, 
                            damping: transitionStyle === "elastic" ? 15 : 22,
                            duration: 0.6
                        }
                    },
                    exit: { 
                        opacity: 0, 
                        y: transitionStyle === "glide" ? -20 : -8, 
                        filter: transitionStyle === "blur" ? "blur(10px)" : "none",
                        transition: { duration: 0.25 } 
                    }
                };

                return (
                    <motion.span
                        key={`${sIdx}-${wIdx}`}
                        data-word-popup-segment={word}
                        variants={wordVar}
                        className="inline-block mr-[0.24em] whitespace-nowrap cursor-pointer hover:opacity-70 transition-opacity"
                        onClick={(event) => onWordClick(word, rawContent, event.currentTarget)}
                        style={styleConfig}
                    >
                        {word}
                    </motion.span>
                );
            });
        };

        const blockVariants = {
            hidden: transitionStyle === "mist" ? { opacity: 0, filter: "blur(20px) scale(0.98)" } :
                    transitionStyle === "classic" ? { opacity: 0 } : {},
            visible: transitionStyle === "mist" ? { 
                        opacity: 1, scale: 1,
                        transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } 
                    } :
                    transitionStyle === "classic" ? { 
                        opacity: 1, transition: { duration: 0.5 } 
                    } : {},
            exit: { opacity: 0, transition: { duration: 0.3 } }
        };

        return (
            <motion.div 
                key={sentence.index}
                variants={transitionStyle === "mist" || transitionStyle === "classic" ? blockVariants : containerVariants}
                className="mb-8 last:mb-0 relative"
                style={{ 
                    fontFamily, 
                    pointerEvents: isActive ? "auto" : "none",
                    opacity: isActive ? 1 : 0.22,
                    WebkitFontSmoothing: "antialiased",
                }}
            >
                {renderWords()}
            </motion.div>
        );
    });
}

function joinChineseSubtitle(sentences: ListeningCabinSentence[]) {
    return sentences.map((sentence) => sentence.chinese).join(" ");
}

// v12: Analogous Thermal Continuity - Harmonious Tonal Duos
const SPEAKER_MIST_THEMES: [string, string][] = [
    ["rgba(99, 102, 241, 0.45)", "rgba(129, 140, 248, 0.35)"], // 0: Indigo -> Light Indigo
    ["rgba(16, 185, 129, 0.45)", "rgba(52, 211, 153, 0.35)"],  // 1: Emerald -> Mint
    ["rgba(244, 63, 94, 0.45)", "rgba(251, 113, 133, 0.35)"],   // 2: Rose -> Pink
    ["rgba(245, 158, 11, 0.45)", "rgba(251, 191, 36, 0.35)"],   // 3: Amber -> Yellow
    ["rgba(6, 182, 212, 0.45)", "rgba(34, 211, 238, 0.35)"],    // 4: Cyan -> Sky
    ["rgba(139, 92, 246, 0.45)", "rgba(167, 139, 250, 0.35)"],  // 5: Violet -> Lavender
    ["rgba(59, 130, 246, 0.45)", "rgba(96, 165, 250, 0.35)"],   // 6: Blue -> Azure
    ["rgba(236, 72, 153, 0.45)", "rgba(244, 114, 182, 0.35)"],  // 7: Pink -> Fuchsia
    ["rgba(168, 85, 247, 0.45)", "rgba(192, 132, 252, 0.35)"],  // 8: Purple -> Orchid
    ["rgba(20, 184, 166, 0.45)", "rgba(45, 212, 191, 0.35)"],   // 9: Teal -> Aquamarine
    ["rgba(101, 163, 13, 0.45)", "rgba(132, 204, 22, 0.35)"],   // 10: Lime -> Green
    ["rgba(234, 88, 12, 0.45)", "rgba(249, 115, 22, 0.35)"],    // 11: Orange -> Coral
    ["rgba(220, 38, 38, 0.45)", "rgba(239, 68, 68, 0.35)"],     // 12: Red -> Scarlet
    ["rgba(79, 70, 229, 0.45)", "rgba(99, 102, 241, 0.35)"],    // 13: Royal -> Indigo
    ["rgba(8, 145, 178, 0.45)", "rgba(6, 182, 212, 0.35)"],     // 14: Cyan Dark -> Cyan
    ["rgba(219, 39, 119, 0.45)", "rgba(236, 72, 153, 0.35)"],   // 15: Pink Deep -> Pink
    ["rgba(124, 58, 237, 0.45)", "rgba(139, 92, 246, 0.35)"],   // 16: Violet Deep -> Violet
    ["rgba(13, 148, 136, 0.45)", "rgba(20, 184, 166, 0.35)"],   // 17: Teal Deep -> Teal
    ["rgba(37, 99, 235, 0.45)", "rgba(59, 130, 246, 0.35)"],    // 18: Blue Deep -> Blue
    ["rgba(185, 28, 28, 0.45)", "rgba(220, 38, 38, 0.35)"],     // 19: Red Deep -> Red
    ["rgba(67, 56, 202, 0.45)", "rgba(79, 70, 229, 0.35)"],     // 20: Indigo Intense
    ["rgba(4, 120, 87, 0.45)", "rgba(5, 150, 105, 0.35)"],      // 21: Emerald Deep
    ["rgba(190, 18, 60, 0.45)", "rgba(225, 29, 72, 0.35)"],     // 22: Rose Intense
    ["rgba(180, 83, 9, 0.45)", "rgba(217, 119, 6, 0.35)"],      // 23: Amber Deep
    ["rgba(14, 116, 144, 0.45)", "rgba(8, 145, 178, 0.35)"],    // 24: Cyan Intense
    ["rgba(109, 40, 217, 0.45)", "rgba(124, 58, 237, 0.35)"],   // 25: Violet Intense
    ["rgba(29, 78, 216, 0.45)", "rgba(37, 99, 235, 0.35)"],     // 26: Blue Intense
    ["rgba(157, 23, 77, 0.45)", "rgba(190, 24, 93, 0.35)"],     // 27: Pink Intense
    ["rgba(126, 34, 206, 0.45)", "rgba(147, 51, 234, 0.35)"],   // 28: Purple Intense
    ["rgba(15, 118, 110, 0.45)", "rgba(13, 148, 136, 0.35)"],   // 29: Teal Intense
    ["rgba(77, 124, 15, 0.45)", "rgba(101, 163, 13, 0.35)"],    // 30: Lime Intense
    ["rgba(194, 65, 12, 0.45)", "rgba(234, 88, 12, 0.35)"],     // 31: Orange Intense
];

function ListeningCabinPlayerView({
    restart,
    session,
}: {
    restart: boolean;
    session: ListeningCabinSession;
}) {
    const router = useRouter();
    const [isExiting, setIsExiting] = useState(false);
    const handleExit = () => {
        if (isExiting) return;
        setIsExiting(true);
        setTimeout(() => {
            router.push("/listening-cabin");
        }, 400); // Allow time for exit animation
    };
    const [subtitleAdvanceMs, setSubtitleAdvanceMs] = useState(1000);
    const player = useListeningCabinPlayer({ session, restart, subtitleAdvanceMs });
    const { playerState, currentSubtitleSentences, audioEnergy, vocalHeat, audioRef } = player;

    const [hasInteractedWithPlay, setHasInteractedWithPlay] = useState(false);

    // Use a local map for instant UI feedback without re-triggering the player hook
    const [localMasteryMap, setLocalMasteryMap] = useState<Record<number, boolean>>({});

    // Mastery-Based Progress
    const masteredCount = useMemo(() => {
        // Count mastered sentences by checking local map first, then session
        return session.sentences.filter((_, idx) => localMasteryMap[idx] ?? session.sentences[idx].isMastered).length;
    }, [session.sentences, localMasteryMap]);

    const masteryRatio = useMemo(() => {
        return session.sentenceCount > 0 ? masteredCount / session.sentenceCount : 0;
    }, [masteredCount, session.sentenceCount]);

    // Mercury Physics for playback progress
    const springProgress = useSpring(playerState.progressRatio, {
        stiffness: 45,
        damping: 15,
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
    const [transitionStyle, setTransitionStyle] = useState<TransitionStyle>("radiant");
    const [typographyStyle, setTypographyStyle] = useState<TypographyStyle>("crystal");
    const [fontSizeEn, setFontSizeEn] = useState(1.1); // 1.1x default
    const [fontSizeZh, setFontSizeZh] = useState(1.0); // 1.0x default
    const [preferencesHydrated, setPreferencesHydrated] = useState(false);
    const [showMasteryFlash, setShowMasteryFlash] = useState(false);
    const [showEpicMasteryFlash, setShowEpicMasteryFlash] = useState(false);
    const [isSettlementOpen, setIsSettlementOpen] = useState(false);
    const isTogglingRef = useRef(false);

    const { playForgeSound, playSuccessSound, playGrandSuccessSound } = useForgeHaptics();
    
    const [wordPopup, setWordPopup] = useState<PopupState | null>(null);
    const [lastLookupTrigger, setLastLookupTrigger] = useState<{ key: string; at: number }>({ key: "", at: 0 });

    const hideControlsTimerRef = useRef<number | null>(null);
    const subtitleLookupRootRef = useRef<HTMLDivElement | null>(null);

    // Persistence: Load
    useEffect(() => {
        const savedEn = localStorage.getItem("listening_cabin_font_en");
        const savedZh = localStorage.getItem("listening_cabin_font_zh");
        const savedStyle = localStorage.getItem("listening_cabin_transition_style");
        const savedTypo = localStorage.getItem("listening_cabin_typography_style");
        const savedAdvance =
            localStorage.getItem("listening_cabin_subtitle_advance")
            ?? localStorage.getItem("listening_cabin_subtitle_advance_ms");
        const savedSizeEn = localStorage.getItem("listening_cabin_font_size_en");
        const savedSizeZh = localStorage.getItem("listening_cabin_font_size_zh");

        if (savedEn) setFontEn(savedEn);
        if (savedZh) setFontZh(savedZh);
        if (savedStyle && isTransitionStyle(savedStyle)) setTransitionStyle(savedStyle);
        if (savedTypo && isTypographyStyle(savedTypo)) setTypographyStyle(savedTypo);
        if (savedAdvance) {
            const val = parseInt(savedAdvance);
            if (!isNaN(val)) setSubtitleAdvanceMs(val);
        }
        if (savedSizeEn) {
            const val = parseFloat(savedSizeEn);
            if (!isNaN(val)) setFontSizeEn(val);
        }
        if (savedSizeZh) {
            const val = parseFloat(savedSizeZh);
            if (!isNaN(val)) setFontSizeZh(val);
        }

        setPreferencesHydrated(true);
    }, []);

    // Persistence: Save
    useEffect(() => {
        if (!preferencesHydrated) {
            return;
        }

        localStorage.setItem("listening_cabin_font_en", fontEn);
        localStorage.setItem("listening_cabin_font_zh", fontZh);
        localStorage.setItem("listening_cabin_transition_style", transitionStyle);
        localStorage.setItem("listening_cabin_typography_style", typographyStyle);
        localStorage.setItem("listening_cabin_subtitle_advance", subtitleAdvanceMs.toString());
        localStorage.setItem("listening_cabin_font_size_en", fontSizeEn.toString());
        localStorage.setItem("listening_cabin_font_size_zh", fontSizeZh.toString());
    }, [fontEn, fontZh, transitionStyle, typographyStyle, subtitleAdvanceMs, fontSizeEn, fontSizeZh, preferencesHydrated]);

    const completionLabel = useMemo(() => {
        const current = String(playerState.currentSentenceIndex + 1).padStart(2, "0");
        const total = String(session.sentences.length).padStart(2, "0");
        return `${current} / ${total}`;
    }, [playerState.currentSentenceIndex, session.sentences.length]);
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
        const base = "mx-auto text-balance-editorial font-sans selection:bg-[#3b82f6]/20";
        
        // Fluid Typography: clamp(min, preferred, max)
        const fluidFontSize = "text-[clamp(1.8rem,4vw+1rem,3.8rem)]";
        
        return `${base} ${fluidFontSize} leading-[1.18] tracking-[-0.028em] text-[#1e293b]`;
    }, []);
    const activeSpeaker = useMemo(() => {
        const sentence = session.sentences[playerState.currentSentenceIndex];
        return sentence?.speaker?.trim() ?? null;
    }, [playerState.currentSentenceIndex, session.sentences]);

    // [v10] Deterministic Color Artist Mapping (Spectral Identity Hashing)
    const speakerThemeMapping = useMemo(() => {
        const uniqueSpeakers = Array.from(new Set(session.sentences.map(s => s.speaker?.trim()).filter(Boolean)));
        const mapping: Record<string, number> = {};
        
        uniqueSpeakers.forEach((speaker) => {
            // High-Performance Deterministic Hash for color stability
            let hash = 0;
            for (let i = 0; i < speaker!.length; i++) {
                hash = speaker!.charCodeAt(i) + ((hash << 5) - hash);
            }
            mapping[speaker!] = Math.abs(hash) % SPEAKER_MIST_THEMES.length;
        });
        return mapping;
    }, [session.sentences]);

    const currentSpeakerIndex = useMemo(() => {
        if (!activeSpeaker) return 0;
        return speakerThemeMapping[activeSpeaker] ?? 0;
    }, [activeSpeaker, speakerThemeMapping]);

    const activeMistTheme = useMemo(
        () => SPEAKER_MIST_THEMES[currentSpeakerIndex],
        [currentSpeakerIndex],
    );

    const activeSubtitleKey = currentSubtitleSentences.map((sentence) => sentence.index).join("-");

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

    const handleToggleMastery = useCallback(async () => {
        if (!session || playerState.currentSentenceIndex < 0 || isTogglingRef.current) return;
        
        // Lock the action to prevent rapid-fire clicks
        isTogglingRef.current = true;
        
        // Determine current status (check local map first, then session)
        const isCurrentlyMastered = localMasteryMap[playerState.currentSentenceIndex] ?? session.sentences[playerState.currentSentenceIndex]?.isMastered;
        const nextMasteredStatus = !isCurrentlyMastered;
        
        // Impact Visuals & Feedback
        setShowMasteryFlash(true);
        playSuccessSound();
        
        if (nextMasteredStatus === true) {
            const btn = document.getElementById("mastery-zap-btn");
            if (btn) {
                const rect = btn.getBoundingClientRect();
                const x = (rect.left + rect.width / 2) / window.innerWidth;
                const y = (rect.top + rect.height / 2) / window.innerHeight;
                confetti({
                    particleCount: 150,
                    spread: 80,
                    startVelocity: 35,
                    origin: { x, y },
                    colors: ['#f59e0b', '#fbbf24', '#fcd34d', '#ffffff', '#eab308'],
                    disableForReducedMotion: true,
                    zIndex: 300,
                    ticks: 200,
                    gravity: 1.2,
                    scalar: 1.2
                });
            }
        }
        
        // Immediate UI Update (Local map only, doesn't touch session object)
        setLocalMasteryMap(prev => ({
            ...prev,
            [playerState.currentSentenceIndex]: nextMasteredStatus
        }));
        
        // Sync to DB (Background)
        const currentSession = await db.listening_cabin_sessions.get(session.id);
        if (currentSession) {
            const updatedSentences = currentSession.sentences.map((s, idx) => 
                idx === playerState.currentSentenceIndex ? { ...s, isMastered: nextMasteredStatus } : s
            );
            await db.listening_cabin_sessions.update(session.id, {
                sentences: updatedSentences
            });
        }
        
        // Dynamic Auto-Advance & Settlement Detection
        setTimeout(() => {
            setShowMasteryFlash(false);
            
            // Trigger Settlement if 100% Mastered
            const totalMastered = session.sentences.filter((_, idx) => 
                idx === playerState.currentSentenceIndex ? nextMasteredStatus : (localMasteryMap[idx] ?? session.sentences[idx].isMastered)
            ).length;

            if (totalMastered === session.sentenceCount && nextMasteredStatus === true) {
                // EPIC Celebration!
                playGrandSuccessSound();
                setShowEpicMasteryFlash(true);
                
                // Double confetti!
                confetti({
                    particleCount: 300,
                    spread: 120,
                    origin: { y: 0.6 },
                    colors: ['#fbbf24', '#f59e0b', '#fffbeb', '#ffffff']
                });
                
                // Keep the celebration going for ~3s before transitioning to the settlement screen
                setTimeout(() => {
                    setShowEpicMasteryFlash(false);
                    setIsSettlementOpen(true);
                }, 3000);
                
                // Note: isTogglingRef stays true while settlement is open to prevent background clicks
                return;
            }

            // Only auto-advance if we just marked it as mastered (nextMasteredStatus is true)
            if (nextMasteredStatus === true && playerState.currentSentenceIndex < session.sentences.length - 1) {
                nextSentenceAction();
            }

            // Small extra buffer for the transition animation to complete
            setTimeout(() => {
                isTogglingRef.current = false;
            }, 150);
        }, 450);
    }, [session, playerState.currentSentenceIndex, playerState.playbackMode, localMasteryMap, playSuccessSound, nextSentenceAction]);

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

    const subtitleLookupContext = useMemo(() => (
        currentSubtitleSentences
            .map((sentence) => renderSentence(sentence.english) ?? "")
            .join(" ")
            .trim()
    ), [currentSubtitleSentences]);

    const normalizeLookupText = useCallback((text: string) => (
        text
            .replace(/[‘’]/g, "'")
            .replace(/[^a-zA-Z\s'-]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80)
    ), []);

    const extractSelectionPopupText = useCallback((selection: Selection | null) => {
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            return "";
        }

        const range = selection.getRangeAt(0);
        const directText = normalizeLookupText(selection.toString());
        if (directText.includes(" ")) {
            return directText.slice(0, 80);
        }

        const anchorElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? range.commonAncestorContainer as Element
            : range.commonAncestorContainer.parentElement;
        const root = anchorElement?.closest("[data-word-popup-root='true']");
        if (!root) {
            return directText.slice(0, 80);
        }

        const selectedSegments = Array.from(root.querySelectorAll<HTMLElement>("[data-word-popup-segment]"))
            .filter((node) => {
                try {
                    return range.intersectsNode(node);
                } catch {
                    return false;
                }
            })
            .map((node) => node.dataset.wordPopupSegment?.trim() ?? "")
            .filter(Boolean);

        if (selectedSegments.length < 2) {
            return directText.slice(0, 80);
        }

        return normalizeLookupText(selectedSegments.join(" ")).slice(0, 80);
    }, [normalizeLookupText]);

    const openWordPopupAtPosition = useCallback((lookupText: string, x: number, y: number, contextText?: string) => {
        const normalizedLookup = normalizeLookupText(lookupText);
        const alphaLength = normalizedLookup.replace(/[\s'-]/g, "").length;
        if (!normalizedLookup || alphaLength < 2) {
            return false;
        }

        const context = (contextText || subtitleLookupContext || "").trim();
        const dedupeKey = `${normalizedLookup.toLowerCase()}::${context.slice(0, 120).toLowerCase()}`;
        const now = Date.now();
        if (lastLookupTrigger.key === dedupeKey && now - lastLookupTrigger.at < 500) {
            return true;
        }
        setLastLookupTrigger({ key: dedupeKey, at: now });

        player.pausePlayback();
        revealControls();
        setWordPopup({
            word: normalizedLookup,
            context,
            x,
            y,
            articleUrl: `listening-cabin://${session.id}`,
            sourceKind: "listening",
            sourceLabel: "来自听力舱",
            sourceSentence: context,
            sourceNote: session.title,
        });
        return true;
    }, [lastLookupTrigger, normalizeLookupText, player, revealControls, session.id, session.title, subtitleLookupContext]);

    const openWordPopupFromSelection = useCallback((selection: Selection | null, contextText?: string) => {
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            return false;
        }

        const range = selection.getRangeAt(0);
        const root = subtitleLookupRootRef.current;
        if (root && !root.contains(range.commonAncestorContainer)) {
            return false;
        }

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            return false;
        }

        const opened = openWordPopupAtPosition(
            extractSelectionPopupText(selection),
            rect.left + rect.width / 2,
            rect.bottom + 10,
            contextText || selection.anchorNode?.textContent || subtitleLookupContext,
        );
        return opened;
    }, [extractSelectionPopupText, openWordPopupAtPosition, subtitleLookupContext]);

    const handleSubtitleTokenClick = useCallback((word: string, context: string, anchorElement: HTMLElement) => {
        if (!word) {
            return;
        }

        if (typeof window !== "undefined") {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
                return;
            }
        }
        const rect = anchorElement.getBoundingClientRect();
        openWordPopupAtPosition(word, rect.left + rect.width / 2, rect.bottom + 10, context || subtitleLookupContext);
    }, [openWordPopupAtPosition, subtitleLookupContext]);

    const handleSubtitleSelectionLookup = useCallback(() => {
        if (typeof window === "undefined") {
            return;
        }
        openWordPopupFromSelection(window.getSelection(), subtitleLookupContext);
    }, [openWordPopupFromSelection, subtitleLookupContext]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setWordPopup(null);
                setShowSettings(false);
                return;
            }

            if (event.key === " " || event.code === "Space") {
                event.preventDefault();
                void replayCurrentSentence();
                return;
            }

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                void previousSentenceAction();
                return;
            }

            if (event.key === "ArrowRight") {
                event.preventDefault();
                void nextSentenceAction();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [nextSentenceAction, previousSentenceAction, replayCurrentSentence, revealControls]);

    return (
        <motion.main
            initial={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
            animate={isExiting ? { opacity: 0, scale: 0.98, filter: "blur(10px)" } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative min-h-screen overflow-hidden bg-[#f8f9fa] text-[#202325]"
            onMouseMove={(event) => {
                const viewportHeight = window.innerHeight || 0;
                const viewportWidth = window.innerWidth || 0;
                
                const isBottomArea = event.clientY >= viewportHeight - 180;
                const isTopRightArea = event.clientY <= 120 && event.clientX >= viewportWidth - 180;

                if (isBottomArea || isTopRightArea) {
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
                    {/* Mastery Flash Feedback Layer */}
                    <AnimatePresence>
                        {showMasteryFlash && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.35 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-[50] bg-amber-50 pointer-events-none"
                                transition={{ duration: 0.15 }}
                            />
                        )}
                    </AnimatePresence>
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
                        onClick={handleExit}
                        className="ui-pressable inline-flex h-9 w-9 items-center justify-center rounded-full text-[#4c555b] bg-white/40 backdrop-blur-sm shadow-sm"
                        style={getPressableStyle("rgba(67,83,99,0.08)", 2)}
                        aria-label="关闭播放器"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {/* Settings Popover (The Typographic Atelier v2.0) */}
                    <AnimatePresence>
                        {showSettings && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute top-20 right-10 w-80 z-[300] glass-panel p-6 rounded-[3rem] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.3)] border-white/80 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-white/40 pointer-events-none" />
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                                <span className="text-xs">📐</span>
                                            </div>
                                            <h3 className="text-[11px] font-black tracking-[0.2em] text-slate-900 uppercase opacity-80">文字工坊 V2.0</h3>
                                        </div>
                                        <button onClick={() => setShowSettings(false)} className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100/50 text-slate-400 hover:text-slate-600 hover:bg-white transition-all">
                                            <X size={12} strokeWidth={3} />
                                        </button>
                                    </div>

                                    {/* Typography Section */}
                                    <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-3 custom-scrollbar -mr-3">
                                        {/* English Config */}
                                        <section className="space-y-3">
                                            <div className="flex items-center justify-between px-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">English Typography</label>
                                                <div className="flex items-center gap-2 bg-slate-100/50 rounded-full px-2 py-1">
                                                    <button onClick={() => setFontSizeEn(Math.max(0.8, fontSizeEn - 0.05))} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white text-slate-400 active:scale-90 transition-all">-</button>
                                                    <span className="text-[10px] font-black text-slate-600 min-w-[32px] text-center">{Math.round(fontSizeEn * 100)}%</span>
                                                    <button onClick={() => setFontSizeEn(Math.min(1.6, fontSizeEn + 0.05))} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white text-slate-400 active:scale-90 transition-all">+</button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-1.5 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar">
                                                {FONT_OPTIONS_EN.map((opt) => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => setFontEn(opt.value)}
                                                        className={cn(
                                                            "w-full text-left px-4 py-2.5 rounded-2xl text-[13px] transition-all duration-300 border border-transparent",
                                                            fontEn === opt.value 
                                                                ? "bg-amber-100/80 text-amber-900 font-black border-amber-200/50 shadow-sm" 
                                                                : "hover:bg-white/60 text-slate-500"
                                                        )}
                                                        style={{ fontFamily: opt.value }}
                                                    >
                                                        {opt.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </section>

                                        {/* Chinese Config */}
                                        <section className="space-y-3">
                                            <div className="flex items-center justify-between px-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Chinese Typography</label>
                                                <div className="flex items-center gap-2 bg-slate-100/50 rounded-full px-2 py-1">
                                                    <button onClick={() => setFontSizeZh(Math.max(0.8, fontSizeZh - 0.05))} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white text-slate-400 active:scale-90 transition-all">-</button>
                                                    <span className="text-[10px] font-black text-slate-600 min-w-[32px] text-center">{Math.round(fontSizeZh * 100)}%</span>
                                                    <button onClick={() => setFontSizeZh(Math.min(1.6, fontSizeZh + 0.05))} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white text-slate-400 active:scale-90 transition-all">+</button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-1.5 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar">
                                                {FONT_OPTIONS_ZH.map((opt) => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => setFontZh(opt.value)}
                                                        className={cn(
                                                            "w-full text-left px-4 py-2.5 rounded-2xl text-[13px] transition-all duration-300 border border-transparent",
                                                            fontZh === opt.value 
                                                                ? "bg-rose-100/80 text-rose-900 font-black border-rose-200/50 shadow-sm" 
                                                                : "hover:bg-white/60 text-slate-500"
                                                        )}
                                                        style={{ fontFamily: opt.value }}
                                                    >
                                                        {opt.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </section>

                                        {/* Motion System */}
                                        <section className="space-y-3">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Cinematic Motion</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {[
                                                    { id: "radiant", label: "✨ 流光溢彩" },
                                                    { id: "mist", label: "🌫️ 空灵迷雾" },
                                                    { id: "glide", label: "🕊️ 垂直滑翔" },
                                                    { id: "blur", label: "🌀 模糊浮现" },
                                                    { id: "stagger", label: "🌊 级联入场" },
                                                    { id: "elastic", label: "🎾 回弹跳动" },
                                                    { id: "neon", label: "🏮 霓虹穿梭" },
                                                    { id: "classic", label: "🎞️ 经典淡入" },
                                                    { id: "typewriter", label: "⌨️ 逐词律动" }
                                                ].map((style) => (
                                                    <button
                                                        key={style.id}
                                                        onClick={() => setTransitionStyle(style.id as TransitionStyle)}
                                                        className={cn(
                                                            "px-3 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider text-left transition-all duration-300 border",
                                                            transitionStyle === style.id 
                                                                ? "bg-blue-600 text-white border-blue-600 shadow-[0_8px_20px_-4px_rgba(37,99,235,0.4)]" 
                                                                : "bg-white/50 text-slate-500 border-slate-100 hover:bg-white hover:shadow-sm"
                                                        )}
                                                    >
                                                        {style.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </section>

                                        {/* Visual Atmosphere */}
                                        <section className="space-y-3">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Visual Atelier</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {[
                                                    { id: "crystal", label: "💎 晶莹剔透" },
                                                    { id: "aurora", label: "✨ 极光溢彩" },
                                                    { id: "hollow", label: "💠 剔透冰晶" },
                                                    { id: "honey", label: "🍯 琥珀流金" },
                                                    { id: "neon_pulse", label: "🔮 霓虹脉冲" },
                                                    { id: "pearl_glow", label: "🐚 珍珠温润" },
                                                    { id: "deep_sea_void", label: "🌊 深海虚空" }
                                                ].map((style) => (
                                                    <button
                                                        key={style.id}
                                                        onClick={() => setTypographyStyle(style.id as TypographyStyle)}
                                                        className={cn(
                                                            "px-3 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider text-left transition-all duration-300 border",
                                                            typographyStyle === style.id 
                                                                ? "bg-amber-600 text-white border-amber-600 shadow-[0_8px_20px_-4px_rgba(217,119,6,0.4)]" 
                                                                : "bg-white/50 text-slate-500 border-slate-100 hover:bg-white hover:shadow-sm"
                                                        )}
                                                    >
                                                        {style.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </section>

                                        {/* Timing Calibration */}
                                        <section className="space-y-3 pb-2">
                                            <div className="flex items-center justify-between px-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Subtitle Timing</label>
                                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                                    {(subtitleAdvanceMs / 1000).toFixed(1)}s Early
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-5 gap-1.5">
                                                {SUBTITLE_ADVANCE_OPTIONS.map((option) => (
                                                    <button
                                                        key={option.value}
                                                        onClick={() => setSubtitleAdvanceMs(option.value)}
                                                        className={cn(
                                                            "py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-center transition-all duration-300 border",
                                                            subtitleAdvanceMs === option.value
                                                                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                                                : "bg-white/50 text-slate-400 border-slate-100 hover:bg-white"
                                                        )}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </header>

                <div className="relative flex flex-1 flex-col items-center justify-center py-6 text-center">
                    <div className="flex w-full max-w-[76rem] flex-col items-center justify-center gap-7">
                        <AnimatePresence mode="popLayout">
                            <motion.div
                                key={activeSubtitleKey}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                className="w-full origin-center relative z-20"
                                style={{ perspective: "1000px" }}
                            >
                                {currentSpeakerTags.length > 0 ? (
                                    <motion.div 
                                        className="mb-10 flex flex-wrap items-center justify-center gap-8"
                                        variants={{
                                            hidden: { opacity: 0, y: 10 },
                                            visible: { opacity: 1, y: 0, transition: { delay: 0.1 } },
                                            exit: { opacity: 0, y: -10 }
                                        }}
                                    >
                                        {currentSpeakerTags.map((speaker) => {
                                            const isActive = speaker === activeSpeaker;
                                            const themeIndex = speakerThemeMapping[speaker] ?? 0;
                                            const theme = SPEAKER_MIST_THEMES[themeIndex];
                                            
                                            // Living Crystal v13: Ethereal Transparency - Softened Thermal Weights
                                            return (
                                                <motion.div
                                                    key={speaker}
                                                    initial={false}
                                                    animate={{
                                                        scale: isActive ? 1.02 : 0.96,
                                                        backgroundColor: isActive ? "rgba(255, 255, 255, 1)" : "rgba(255, 255, 255, 0.4)",
                                                        // [v10] Spectral Gradient Border (Fainter v13)
                                                        borderColor: isActive 
                                                            ? theme[0].replace('0.45', '0.2')
                                                            : "rgba(0, 0, 0, 0.06)",
                                                        // [v11] Layered Dual-Glow Shadow (Softened v13)
                                                        boxShadow: isActive 
                                                            ? `0 8px 30px -12px rgba(0,0,0,0.04), 0 0 ${15 + (audioEnergy * 20) + (vocalHeat * 15)}px ${theme[0].replace('0.45', (0.08 + (audioEnergy * 0.12) + (vocalHeat * 0.1)).toString())}, 10px 0 ${20 + (audioEnergy * 15) + (vocalHeat * 15)}px ${theme[1].replace('0.35', (0.05 + (audioEnergy * 0.08) + (vocalHeat * 0.08)).toString())}` 
                                                            : "0 2px 5px rgba(0,0,0,0.01)",
                                                        opacity: isActive ? 1 : [0.25, 0.4, 0.25],
                                                        // [v13] Muted Thermal Saturation Filter
                                                        filter: isActive ? `saturate(${1 + (vocalHeat * 0.25)}) brightness(${1 + (vocalHeat * 0.08)})` : "none"
                                                    }}
                                                    transition={{ 
                                                        type: "spring", 
                                                        stiffness: isActive ? 90 : 120, 
                                                        damping: 30, 
                                                        mass: 1.2,
                                                        borderColor: { stiffness: 150, damping: 25 },
                                                        boxShadow: { stiffness: 60, damping: 40, mass: 1.5 },
                                                        opacity: isActive ? { duration: 0.3 } : { duration: 5, repeat: Infinity, ease: "easeInOut" }
                                                    } as any}
                                                    className="px-5 py-2 rounded-full backdrop-blur-[12px] border-[1px] relative overflow-hidden flex items-center gap-3.5 group"
                                                >
                                                    {/* [v9] Crystalline Micro-Texture Shimmer */}
                                                    {isActive && (
                                                        <motion.div 
                                                            animate={{ 
                                                                backgroundPosition: ["0% 0%", "100% 100%"]
                                                            }}
                                                            transition={{ duration: 15 / (1 + vocalHeat), repeat: Infinity, ease: "linear" }}
                                                            className="absolute inset-0 z-0 opacity-[0.025] pointer-events-none bg-[radial-gradient(circle,rgba(0,0,0,0.2)_1px,transparent_1px)] bg-[length:4px_4px]"
                                                        />
                                                    )}

                                                    {/* [v10] Prismatic Recognition Ripple & Periodic Glass Swipe (Fainter v13) */}
                                                    <motion.div 
                                                        key={`swipe-${speaker}-${isActive}`}
                                                        initial={{ x: "-150%" }}
                                                        animate={{ x: "250%" }}
                                                        transition={isActive 
                                                            ? { duration: 1.5, ease: "circOut" } 
                                                            : { duration: 15, repeat: Infinity, ease: "linear", delay: 2 }
                                                        }
                                                        style={{ 
                                                            background: isActive 
                                                                ? `linear-gradient(90deg, transparent, ${theme[0].replace('0.45', '0.1')}, white, ${theme[1].replace('0.35', '0.1')}, transparent)`
                                                                : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)'
                                                        }}
                                                        className="absolute inset-0 skew-x-[-30deg] z-10 pointer-events-none"
                                                    />

                                                    {/* Internal Atmospheric Bloom (Softened v13) */}
                                                    {isActive && (
                                                        <motion.div 
                                                            animate={{ 
                                                                opacity: 0.04 + (audioEnergy * 0.08) + (vocalHeat * 0.05),
                                                                scale: 1 + (audioEnergy * 0.15) + (vocalHeat * 0.08)
                                                            }}
                                                            style={{ backgroundColor: theme[0] }}
                                                            className="absolute inset-0 z-0 blur-3xl opacity-10 pointer-events-none"
                                                        />
                                                    )}
                                                    
                                                    <div className="relative z-20 flex items-center gap-3.5">
                                                        {/* [v10] Gemstone Orb Indicator (Softened v13) */}
                                                        <motion.div 
                                                            animate={{ 
                                                                scale: 1 + (audioEnergy * 0.6) + (vocalHeat * 0.2),
                                                                background: `linear-gradient(135deg, ${theme[0]}, ${theme[1]})`,
                                                                boxShadow: `0 0 ${10 + (audioEnergy * 20) + (vocalHeat * 10)}px ${theme[0].replace('0.45', '0.6')}, 6px 0 ${15 + (audioEnergy * 15) + (vocalHeat * 10)}px ${theme[1].replace('0.35', '0.4')}`
                                                            }}
                                                            transition={{ type: "spring", stiffness: 100, damping: 22 }}
                                                            className={cn(
                                                                "w-1.5 h-1.5 rounded-full ring-2 ring-white transition-opacity duration-300",
                                                                isActive ? "opacity-100" : "opacity-25"
                                                            )}
                                                        />
                                                        <span className={cn(
                                                            "text-[10px] font-black tracking-[0.45em] uppercase transition-colors duration-700",
                                                            isActive ? "text-slate-800" : "text-slate-400"
                                                        )}>
                                                            {speaker}
                                                        </span>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </motion.div>
                                ) : null}
                                
                                <div
                                    ref={subtitleLookupRootRef}
                                    data-word-popup-root="true"
                                    className="relative"
                                    onMouseUp={handleSubtitleSelectionLookup}
                                    onTouchEnd={handleSubtitleSelectionLookup}
                                >
                                    <h1 
                                        className={subtitleTypographyClass}
                                        style={{
                                            transition: "text-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                                            textShadow: `0 0 ${12 + (audioEnergy * 40)}px ${activeMistTheme[0].replace('0.6', (0.2 + (audioEnergy * 0.2)).toString())}`,
                                            fontFamily: fontEn
                                        }}
                                    >
                                        {renderSubtitleBlock(currentSubtitleSentences, playerState.currentSentenceIndex, activeMistTheme[0], fontEn, transitionStyle, typographyStyle, fontSizeEn, handleSubtitleTokenClick)}
                                    </h1>
                                    
                                    <motion.div
                                        variants={{
                                            hidden: { opacity: 0, y: 15, filter: "blur(12px)" },
                                            visible: { 
                                                opacity: 1, 
                                                y: 0, 
                                                filter: "blur(0px)",
                                                transition: { delay: 0.35, duration: 0.8, ease: [0.22, 1, 0.36, 1] as any } 
                                            },
                                            exit: { opacity: 0, y: -10, transition: { duration: 0.2 } }
                                        }}
                                        className={cn(
                                            "font-sans mx-auto mt-10 max-w-[56rem] text-[clamp(1.1rem,2vw,1.35rem)] font-medium leading-relaxed tracking-wide antialiased",
                                            playerState.showChineseSubtitle ? "visible" : "hidden pointer-events-none"
                                        )}
                                        style={{ color: "#1e293b", textRendering: "optimizeLegibility" }}
                                    >
                                        <span style={{ fontFamily: fontZh, fontSize: `${fontSizeZh}em` }}>
                                            {joinChineseSubtitle(currentSubtitleSentences)}
                                        </span>
                                    </motion.div>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                        {/* v14: Ethereal Glass Ribbon - Acoustic Progress Tracking */}
                        <div className="w-full max-w-[36rem] px-12 group/progress">
                            <div className="relative h-[6px] w-full rounded-full bg-white/12 border border-white/8 backdrop-blur-xl shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)] overflow-visible transition-all duration-500 group-hover/progress:h-[8px]">
                                
                                {/* Micro-Milestone Markers (Sentence Boundaries) */}
                                <div className="absolute inset-0 pointer-events-none z-10">
                                    {session.sentences.map((s, idx) => {
                                        const totalDuration = audioRef.current?.duration || 1;
                                        const pos = (s.startTime / 1000) / totalDuration;
                                        if (pos <= 0 || pos >= 1) return null;
                                        return (
                                            <div 
                                                key={idx}
                                                style={{ left: `${pos * 100}%` }}
                                                className={cn(
                                                    "absolute top-1/2 -translate-y-1/2 w-[1.5px] h-[3px] rounded-full transition-all duration-700",
                                                    playerState.currentSentenceIndex >= idx 
                                                        ? "bg-white/40 scale-y-150" 
                                                        : "bg-black/10 opacity-20"
                                                )}
                                            />
                                        );
                                    })}
                                </div>

                                {/* Flowing Light Column (Thematic Fill) */}
                                <div className="absolute inset-x-0 inset-y-0 overflow-hidden rounded-full mask-image-linear">
                                    <motion.div
                                        className="absolute inset-y-0 left-0 transition-colors duration-700"
                                        style={{ 
                                            width: useTransform(springProgress, p => `${p * 100}%`),
                                            background: `linear-gradient(90deg, transparent, ${activeMistTheme[0].replace('0.45', '0.2')}, ${activeMistTheme[0]})`,
                                            boxShadow: `0 0 15px ${activeMistTheme[0].replace('0.45', '0.3')}`
                                        }}
                                    />
                                    {/* Internal Refraction Swipe */}
                                    <motion.div
                                        animate={{ x: ["-100%", "400%"] }}
                                        transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-y-0 w-32 bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-[-30deg] pointer-events-none"
                                    />
                                </div>

                                {/* Floating Satellite Orb (Playhead) */}
                                <motion.div
                                    style={{ left: useTransform(springProgress, p => `${p * 100}%`) }}
                                    className="absolute top-1/2 -translate-y-1/2 -ml-2.5 z-20 pointer-events-none"
                                >
                                    {/* Outer Aura */}
                                    <motion.div 
                                        animate={{ 
                                            scale: 1 + (audioEnergy * 0.45) + (vocalHeat * 0.15),
                                            opacity: 0.4 + (audioEnergy * 0.3)
                                        }}
                                        style={{ backgroundColor: activeMistTheme[0] }}
                                        className="absolute inset-0 rounded-full blur-[10px]"
                                    />
                                    
                                    {/* The Core Satellite */}
                                    <motion.div 
                                        animate={{ 
                                            scale: 1 + (audioEnergy * 0.2),
                                            backgroundColor: "#ffffff",
                                            boxShadow: `0 4px 12px rgba(0,0,0,0.08), 0 0 12px ${activeMistTheme[0].replace('0.45', '0.8')}`
                                        }}
                                        className="relative w-4 h-4 rounded-full border border-white/50 flex items-center justify-center overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-slate-100" />
                                        <motion.div 
                                            animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.8, 1.2, 0.8] }}
                                            transition={{ duration: 2.5, repeat: Infinity }}
                                            style={{ backgroundColor: activeMistTheme[1] }}
                                            className="w-1.5 h-1.5 rounded-full blur-[0.5px] relative z-10"
                                        />
                                    </motion.div>
                                </motion.div>
                            </div>

                            <div className="mt-5 flex items-center justify-between px-1">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <motion.div 
                                            animate={{ opacity: [0.3, 0.6, 0.3] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                            className="w-1 h-1 rounded-full bg-slate-400"
                                        />
                                        <span className="text-[9px] font-black tracking-[0.3em] text-slate-400/70 uppercase">
                                            {activeSpeaker ? `Acoustic Trace: ${activeSpeaker}` : "Passive Monitor"}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black tracking-[0.2em] text-slate-500 tabular-nums bg-white/40 px-2.5 py-0.5 rounded-full border border-white/20">
                                        {completionLabel}
                                    </span>
                                </div>
                            </div>

                            {/* Phase 30: The Grand Mastery Settlement Ceremony */}
                            <AnimatePresence>
                                {isSettlementOpen && (
                                    <motion.div 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-3xl"
                                    >
                                        <motion.div
                                            initial={{ scale: 0.8, y: 40, opacity: 0 }}
                                            animate={{ scale: 1, y: 0, opacity: 1 }}
                                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                                            className="relative w-full max-w-lg p-12 rounded-[4rem] bg-white border border-white shadow-[0_64px_128px_-32px_rgba(0,0,0,0.4)] flex flex-col items-center text-center gap-10 overflow-hidden"
                                        >
                                            {/* Decorative Background Elements */}
                                            <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-amber-50 to-transparent pointer-events-none" />
                                            <motion.div 
                                                animate={{ 
                                                    scale: [1, 1.2, 1],
                                                    opacity: [0.3, 0.6, 0.3]
                                                }}
                                                transition={{ duration: 4, repeat: Infinity }}
                                                className="absolute top-20 w-48 h-48 bg-amber-200 blur-[80px] rounded-full pointer-events-none"
                                            />

                                            <div className="relative z-10 space-y-6">
                                                <motion.div 
                                                    initial={{ rotate: -20, scale: 0.5 }}
                                                    animate={{ rotate: 0, scale: 1 }}
                                                    transition={{ delay: 0.2, type: "spring" }}
                                                    className="w-28 h-28 bg-gradient-to-br from-amber-400 to-orange-500 rounded-[2.5rem] shadow-[0_20px_40px_rgba(245,158,11,0.4)] flex items-center justify-center mx-auto mb-8"
                                                >
                                                    <Trophy size={56} className="text-white" strokeWidth={2.5} />
                                                </motion.div>

                                                <div className="space-y-3">
                                                    <h2 className="text-4xl font-black text-slate-800 tracking-tighter">金晶熔炼成功!</h2>
                                                    <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px]">Grand Mastery Attained</p>
                                                </div>

                                                <div className="flex items-center justify-center gap-8 py-8 border-y border-slate-50">
                                                    <div className="text-center">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Score</p>
                                                        <p className="text-3xl font-black text-slate-800">100%</p>
                                                    </div>
                                                    <div className="w-[1px] h-10 bg-slate-100" />
                                                    <div className="text-center">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Proficiency</p>
                                                        <p className="text-3xl font-black text-amber-500">{session.cefrLevel}</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-4 pt-4">
                                                    <motion.button
                                                        whileHover={{ scale: 1.05, y: -4 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={handleExit}
                                                        className="w-full h-18 bg-slate-900 text-white rounded-[2rem] text-[15px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-[0_20px_40px_rgba(15,23,42,0.3)] group/home"
                                                    >
                                                        <Home size={18} className="group-hover/home:rotate-12 transition-transform" />
                                                        返回主页
                                                    </motion.button>
                                                    
                                                    <button 
                                                        onClick={() => {
                                                            setIsSettlementOpen(false);
                                                            isTogglingRef.current = false;
                                                        }}
                                                        className="text-[11px] font-black text-slate-300 hover:text-slate-500 transition-colors uppercase tracking-[0.2em]"
                                                    >
                                                        留在当前页查看
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Micro-sparkles decoration */}
                                            <div className="absolute bottom-10 right-10 opacity-20">
                                                <Sparkles size={40} className="text-amber-300" />
                                            </div>
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
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
                            <div className="relative">
                                {/* First Time Play Hint */}
                                <AnimatePresence>
                                    {!hasInteractedWithPlay && !playerState.isPlaying && playerState.currentSentenceIndex === 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            transition={{ duration: 0.4 }}
                                            className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-full bg-slate-800 text-white text-xs font-medium tracking-wide shadow-lg pointer-events-none after:content-[''] after:absolute after:-bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-2 after:h-2 after:bg-slate-800 after:rotate-45"
                                        >
                                            点击开始沉浸
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <motion.button
                                    type="button"
                                    onClick={() => {
                                        setHasInteractedWithPlay(true);
                                        if (playerState.isPlaying) {
                                            player.pausePlayback();
                                            return;
                                        }
                                        void player.resumeOrPlay();
                                    }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.88, y: 3 }}
                                    transition={{ type: "spring", stiffness: 450, damping: 20 }}
                                    className="group relative flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-br from-white/90 to-slate-200/50 shadow-[0_12px_28px_rgba(0,0,0,0.06),inset_0_2px_8px_rgba(255,255,255,0.8),inset_0_-4px_12px_rgba(0,0,0,0.02)] transition-shadow duration-300 overflow-hidden outline-none hover:shadow-[0_20px_40px_rgba(0,0,0,0.1),inset_0_2px_8px_rgba(255,255,255,1),inset_0_-4px_12px_rgba(0,0,0,0.02)]"
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
                                </motion.button>
                            </div>

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

                {wordPopup && (
                    <WordPopup
                        popup={wordPopup}
                        onClose={() => setWordPopup(null)}
                        mode="battle"
                        appearance="minimal"
                        showAiDefinitionButton
                        battleLookupCostHint="听力舱查词不消耗阅读币。"
                    />
                )}

                {/* Floating Crystal Zap - The Mastery FAB */}
                <motion.div
                    key={`mastery-icon-${playerState.currentSentenceIndex}`}
                    className="fixed bottom-12 right-12 z-[200]"
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ 
                        opacity: 1, 
                        scale: 1,
                        y: [0, -10, 0]
                    }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{
                        y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
                        opacity: { duration: 0.3 },
                        scale: { type: "spring", stiffness: 300, damping: 25 }
                    }}
                >
                    <motion.button
                        id="mastery-zap-btn"
                        onClick={handleToggleMastery}
                        whileHover={{ scale: 1.15, rotate: 15 }}
                        whileTap={{ scale: 0.85, rotate: -15 }}
                        className="group relative w-16 h-16 rounded-full flex items-center justify-center bg-white/40 backdrop-blur-3xl border border-white/60 shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden"
                        style={getPressableStyle("rgba(255,255,255,0.2)", 3)}
                    >
                        {/* Inner Glowing Core */}
                        <motion.div 
                            animate={{ 
                                opacity: [0.3, 0.6, 0.3],
                                scale: [1, 1.2, 1]
                            }}
                            transition={{ duration: 3, repeat: Infinity }}
                            style={{ backgroundColor: activeMistTheme[0] }}
                            className="absolute inset-0 blur-xl z-0"
                        />
                        
                        <Zap 
                            className={cn(
                                "relative z-10 w-7 h-7 transition-colors duration-500",
                                (localMasteryMap[playerState.currentSentenceIndex] ?? session.sentences[playerState.currentSentenceIndex]?.isMastered)
                                    ? "fill-amber-400 text-amber-500" 
                                    : "text-slate-600/80 group-hover:text-amber-500"
                            )} 
                            strokeWidth={3} 
                        />
                    </motion.button>
                </motion.div>

                <AnimatePresence>
                    {showEpicMasteryFlash && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: { duration: 1 } }}
                            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none overflow-hidden"
                        >
                            {/* Gold flash background */}
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0, 0.8, 0] }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                className="absolute inset-0 bg-gradient-to-tr from-amber-400 via-yellow-100 to-amber-200 mix-blend-overlay"
                            />
                            
                            {/* Radiant center blast */}
                            <motion.div
                                initial={{ scale: 0, opacity: 1 }}
                                animate={{ scale: [0, 5, 10], opacity: [1, 0.5, 0] }}
                                transition={{ duration: 2, ease: "easeOut" }}
                                className="absolute w-64 h-64 rounded-full bg-white blur-[100px]"
                            />

                            {/* Text */}
                            <motion.div 
                                initial={{ scale: 0.5, opacity: 0, y: 50 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
                                transition={{ 
                                    type: "spring", stiffness: 100, damping: 15, mass: 1.5,
                                    opacity: { duration: 0.5 }
                                }}
                                className="relative z-10 flex flex-col items-center"
                            >
                                <span className="text-[120px]">👑</span>
                                <h1 
                                    className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 mt-4 text-center leading-tight tracking-[0.05em]"
                                    style={{
                                        textShadow: "0 10px 40px rgba(251, 191, 36, 0.5)",
                                        WebkitTextStroke: "2px rgba(255,255,255,0.8)"
                                    }}
                                >
                                    PERFECT
                                    <br />
                                    MASTERY
                                </h1>
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: "100%" }}
                                    transition={{ delay: 0.5, duration: 1, ease: "easeInOut" }}
                                    className="h-1 mt-6 bg-gradient-to-r from-transparent via-amber-200 to-transparent shadow-[0_0_15px_rgba(251,191,36,1)]"
                                />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.main>
    );
}

export function ListeningCabinPlayer() {
    const router = useRouter();
    const params = useParams<{ sessionId: string }>();
    const searchParams = useSearchParams();
    const restartParam = searchParams.get("restart");
    const restart = restartParam === "1" || restartParam === "true";
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
