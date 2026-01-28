"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, RefreshCw, Send, CheckCircle2, ArrowRight, HelpCircle, MessageCircle, Wand2, Mic, Play, Volume2, Globe, Headphones, Eye, EyeOff, BookOpen, BrainCircuit, X, Trophy, TrendingUp, Zap, Gift, Crown, Gem } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import * as Diff from 'diff';
import confetti from 'canvas-confetti';
import { WordPopup, PopupState } from "../reading/WordPopup";
import { useWhisper } from "@/hooks/useWhisper";
import { db } from "@/lib/db";
import { getRank } from "@/lib/rankUtils";

// --- Interfaces ---

export type DrillMode = "translation" | "listening";

export interface DrillCoreProps {
    // Context for generation
    context: {
        type: "article" | "scenario";
        articleTitle?: string;
        articleContent?: string;
        topic?: string; // For scenario mode
    };
    initialMode?: DrillMode;
    onClose?: () => void;
}

interface DrillData {
    chinese: string;
    target_english_vocab?: string[];
    key_vocab?: string[];
    reference_english: string;
}

interface DrillFeedback {
    score: number;
    feedback: any; // Can be string[] or object with listening_tips
    judge_reasoning?: string;
    improved_version: string;
    segments?: {
        word: string;
        status: "correct" | "phonetic_error" | "missing" | "typo" | "user_extra" | "variation";
        user_input?: string;
        feedback?: string;
    }[];
}

interface DictionaryData {
    word: string;
    phonetic?: string;
    audio?: string;
    translation?: string;
    definition?: string;
}

interface LootDrop {
    type: 'exp' | 'gem' | 'theme';
    amount: number;
    rarity: 'common' | 'rare' | 'legendary';
    message: string;
}

export function DrillCore({ context, initialMode = "translation", onClose }: DrillCoreProps) {
    // Mode State
    const [mode, setMode] = useState<DrillMode>(initialMode);

    // Drill State
    const [drillData, setDrillData] = useState<DrillData | null>(null);
    const [userTranslation, setUserTranslation] = useState("");
    const [isGeneratingDrill, setIsGeneratingDrill] = useState(false);
    const [isSubmittingDrill, setIsSubmittingDrill] = useState(false);
    const [drillFeedback, setDrillFeedback] = useState<DrillFeedback | null>(null);
    const [hasRatedDrill, setHasRatedDrill] = useState(false);

    // Audio & Dictionary State
    const [isPlaying, setIsPlaying] = useState(false);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioCache = useRef<Map<string, { url: string; marks?: any[] }>>(new Map());
    const [currentAudioTime, setCurrentAudioTime] = useState(0);

    // Active Word Card
    const [wordPopup, setWordPopup] = useState<PopupState | null>(null);

    // Whisper Integration
    const {
        isRecording: whisperRecording,
        isProcessing: whisperProcessing,
        result: whisperResult,
        audioLevel,
        setContext,
        startRecognition,
        stopRecognition,
        playRecording,
        engineMode,
        setEngineMode
    } = useWhisper();

    // Ask Tutor State
    const [isTutorOpen, setIsTutorOpen] = useState(false);
    const [tutorQuery, setTutorQuery] = useState("");
    const [tutorAnswer, setTutorAnswer] = useState<string | null>(null);
    const [isAskingTutor, setIsAskingTutor] = useState(false);

    // UI State
    const [isBlindMode, setIsBlindMode] = useState(true);
    const [showChinese, setShowChinese] = useState(false);
    const [difficulty, setDifficulty] = useState<string>('Level 3');
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

    // Elo State
    const [eloRating, setEloRating] = useState(1200); // Translation Elo
    const [streakCount, setStreakCount] = useState(0);

    const [listeningElo, setListeningElo] = useState(1200);
    const [listeningStreak, setListeningStreak] = useState(0);



    // Gamification State (Fever / Themes)
    const [comboCount, setComboCount] = useState(0);
    const [feverMode, setFeverMode] = useState(false);
    const [theme, setTheme] = useState<'default' | 'fever' | 'boss'>('default');
    const [lootDrop, setLootDrop] = useState<LootDrop | null>(null);


    // Computed Elo based on Mode
    const currentElo = mode === 'listening' ? listeningElo : eloRating;
    const currentStreak = mode === 'listening' ? listeningStreak : streakCount;

    const [eloChange, setEloChange] = useState<number | null>(null);
    const [eloBreakdown, setEloBreakdown] = useState<{
        difficultyElo: number;
        expectedScore: number;
        actualScore: number;
        kFactor: number;
        streakBonus: boolean;
        baseChange: number;
        bonusChange: number;
    } | null>(null);

    const [audioDuration, setAudioDuration] = useState(0);

    // --- Loading & Persistance ---

    useEffect(() => {
        const loadProfile = async () => {
            const profile = await db.user_profile.orderBy('id').first();
            if (profile) {
                setEloRating(profile.elo_rating);
                setStreakCount(profile.streak_count);

                // Load Listening Stats (Fallback if undefined post-migration in memory before reload)
                setListeningElo(profile.listening_elo ?? 1200);
                setListeningStreak(profile.listening_streak ?? 0);
            } else {
                await db.user_profile.add({
                    elo_rating: 1200,
                    streak_count: 0,
                    max_elo: 1200,
                    last_practice: Date.now()
                });
            }
        };
        loadProfile();

        const savedDiff = localStorage.getItem('yasi_drill_difficulty');
        if (savedDiff) setDifficulty(savedDiff);
    }, []);

    useEffect(() => {
        localStorage.setItem('yasi_drill_difficulty', difficulty);
    }, [difficulty]);

    // --- Audio Logic ---

    useEffect(() => {
        if (mode === "listening" && drillData?.reference_english && !drillFeedback) {
            playAudio();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drillData, mode]); // removed drillFeedback to prevent auto-replay on score

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        setCurrentAudioTime(time);
        if (audioRef.current) audioRef.current.currentTime = time / 1000;
    };

    const playAudio = async () => {
        if (!drillData?.reference_english) return;

        const textKey = "SENTENCE_" + drillData.reference_english;
        // setIsPlaying(true); // <--- REMOVED: This was causing the effect to run too early
        setWordPopup(null);

        try {
            let cached = audioCache.current.get(textKey);

            if (!cached) {
                setIsAudioLoading(true);
                setIsPlaying(false);
                const response = await fetch("/api/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: drillData.reference_english,
                        voice: "en-US-JennyNeural",
                        rate: "+0%"
                    }),
                });
                if (!response.ok) throw new Error("TTS failed");
                const data = await response.json();
                cached = { url: data.audio, marks: data.marks };
                audioCache.current.set(textKey, cached!);
                setIsAudioLoading(false);
            }

            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }

            const audio = new Audio(cached.url);
            audioRef.current = audio;

            audio.onloadedmetadata = () => setAudioDuration(audio.duration * 1000);
            if (audio.duration && !isNaN(audio.duration)) setAudioDuration(audio.duration * 1000);

            audio.ontimeupdate = () => {
                if (!audio.paused) {
                    setCurrentAudioTime(audio.currentTime * 1000);
                }
            };

            audio.onended = () => {
                setIsPlaying(false);
                setCurrentAudioTime(0);
                audio.ontimeupdate = null; // Cleanup
            };

            audio.playbackRate = playbackSpeed;
            await audio.play();
            setIsPlaying(true);
        } catch (error) {
            console.error("Audio chain failed", error);
            setIsPlaying(false);
            setIsAudioLoading(false);
        }
    };

    // --- Whisper Auto-Submit Logic ---
    const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false);

    useEffect(() => {
        if (mode === "listening" && whisperResult.isFinal && whisperResult.text) {
            setUserTranslation(whisperResult.text);
            setShouldAutoSubmit(true);
        }
    }, [whisperResult, mode]);

    useEffect(() => {
        if (shouldAutoSubmit && userTranslation) {
            handleSubmitDrill();
            setShouldAutoSubmit(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userTranslation, shouldAutoSubmit]);

    useEffect(() => {
        if (drillData?.reference_english && setContext) {
            const keywords = drillData.target_english_vocab?.join(" ") || "";
            // Simplified prompt for context
            const prompt = `Topic: ${context.articleTitle || context.topic || 'General'}. Keywords: ${keywords}. Sentence: ${drillData.reference_english}`;
            setContext(prompt);
        }
    }, [drillData, context, setContext]);


    // --- Spacebar Logic ---
    // Feedback Effects
    useEffect(() => {
        if (drillFeedback) {
            if (drillFeedback.score >= 8) {
                // Success: Confetti & Sound
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#10b981', '#34d399', '#fcd34d'] // Emerald & Amber
                });
                new Audio('https://assets.mixkit.co/sfx/preview/mixkit-achievement-bell-600.mp3').play().catch(() => { });
            } else if (drillFeedback.score <= 4) {
                // Fail: Shake & Sound
                const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-wrong-answer-fail-notification-946.mp3');
                audio.volume = 0.5;
                audio.play().catch(() => { });
            } else {
                // Neutral
                new Audio('https://assets.mixkit.co/sfx/preview/mixkit-message-pop-alert-2354.mp3').play().catch(() => { });
            }
        }
    }, [drillFeedback]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && mode === 'listening' && !drillFeedback && !isSubmittingDrill) {
                // Only hijack space if we are NOT typing in a textarea/input
                if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                    e.preventDefault(); // ALWAYS prevent scroll
                    if (!whisperRecording) {
                        startRecognition();
                    }
                }
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space' && mode === 'listening' && whisperRecording) {
                e.preventDefault();
                stopRecognition();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [mode, drillFeedback, whisperRecording, isSubmittingDrill, startRecognition, stopRecognition]);


    // --- Core Actions ---

    const handleGenerateDrill = async (targetDifficulty = difficulty) => {
        setIsGeneratingDrill(true);
        setDrillData(null);
        setDrillFeedback(null);
        setUserTranslation("");
        setTutorAnswer(null);
        setIsTutorOpen(false);
        setWordPopup(null);
        setIsPlaying(false);
        setHasRatedDrill(false);
        setEloChange(null);
        if (audioRef.current) audioRef.current.pause();

        try {
            const response = await fetch("/api/ai/generate_drill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    articleTitle: context.articleTitle || context.topic,
                    articleContent: context.articleContent || "",
                    difficulty,
                    eloRating,
                    mode,
                    // New fields for Scenario Mode could be passed here if API supports it
                    // For now relying on existing API which uses articleTitle/Content
                }),
            });
            const data = await response.json();
            setDrillData(data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsGeneratingDrill(false);
        }
    };

    const handleSubmitDrill = async () => {
        if (!userTranslation.trim() || !drillData) return;
        setIsSubmittingDrill(true);

        try {
            const response = await fetch("/api/ai/score_translation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: userTranslation,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    current_elo: eloRating || 1200,
                    mode
                }),
            });
            const data = await response.json();
            setDrillFeedback(data);

            if (data.score !== undefined) {
                if (hasRatedDrill) {
                    setEloChange(0);
                    return;
                }
                setHasRatedDrill(true);

                // --- Elo Calculation with Mode Separation ---
                const isListening = mode === 'listening';
                const activeElo = isListening ? listeningElo : eloRating;
                const activeStreak = isListening ? listeningStreak : streakCount;

                // --- Advanced Elo Logic (UIUXProMax) ---
                const getDifficultyElo = (level: string) => {
                    switch (level) {
                        case 'Level 1': return 800;
                        case 'Level 2': return 1200;
                        case 'Level 3': return 1600;
                        case 'Level 4': return 2000;
                        case 'Level 5': return 2400;
                        default: return 1200;
                    }
                };

                const calculateAdvancedElo = (playerElo: number, diffLevel: string, actualScore: number, streak: number) => {
                    const difficultyElo = getDifficultyElo(diffLevel);
                    const expectedScore = 1 / (1 + Math.pow(10, (difficultyElo - playerElo) / 400));
                    const normalizedScore = Math.max(0, Math.min(1, (actualScore - 3) / 7));

                    let kFactor = 40;
                    const isStreak = streak >= 2;
                    const effectiveK = isStreak ? kFactor * 1.25 : kFactor;

                    const rawChange = effectiveK * (normalizedScore - expectedScore);
                    const totalChange = Math.round(rawChange);

                    return {
                        total: totalChange,
                        breakdown: {
                            difficultyElo,
                            expectedScore,
                            actualScore: normalizedScore,
                            kFactor,
                            streakBonus: isStreak,
                            baseChange: Math.round(kFactor * (normalizedScore - expectedScore)),
                            bonusChange: Math.round((effectiveK - kFactor) * (normalizedScore - expectedScore))
                        }
                    };
                };

                const result = calculateAdvancedElo(activeElo || 1200, difficulty, data.score, activeStreak);
                let change = result.total;
                setEloBreakdown(result.breakdown);

                let newStreak = activeStreak;

                if (data.score >= 9) {
                    newStreak += 1;
                    if (newStreak >= 3) change += 2;

                    // Fever Logic
                    const newCombo = comboCount + 1;
                    setComboCount(newCombo);
                    if (newCombo >= 3 && !feverMode) {
                        setFeverMode(true);
                        setTheme('fever');
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-futuristic-robotic-blip-hit-695.mp3').play().catch(() => { });
                        setTheme('fever');
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-futuristic-robotic-blip-hit-695.mp3').play().catch(() => { });
                    }

                    // Loot Logic
                    const baseChance = feverMode ? 0.5 : 0.2;
                    if (Math.random() < baseChance) {
                        const roll = Math.random();
                        let drop: LootDrop;
                        if (roll > 0.95) {
                            drop = { type: 'theme', amount: 1, rarity: 'legendary', message: 'Legendary Theme Fragment!' };
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-201.mp3').play().catch(() => { });
                        } else if (roll > 0.70) {
                            drop = { type: 'gem', amount: Math.floor(Math.random() * 5) + 1, rarity: 'rare', message: 'Rare Gems Found!' };
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-coins-sound-2003.mp3').play().catch(() => { });
                        } else {
                            drop = { type: 'exp', amount: Math.floor(Math.random() * 50) + 10, rarity: 'common', message: 'Bonus EXP' };
                        }
                        // Delay loot slightly for effect
                        setTimeout(() => setLootDrop(drop), 1000);
                    }
                } else {
                    newStreak = 0;
                    setComboCount(0);
                    if (feverMode) {
                        setFeverMode(false);
                        setTheme('default');
                        // Fever Break Sound
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-game-over-dark-orchestra-633.mp3').play().catch(() => { });
                    }
                }

                const newElo = Math.max(0, (activeElo || 1200) + change);

                // Update Local State
                if (isListening) {
                    setListeningElo(newElo);
                    setListeningStreak(newStreak);
                } else {
                    setEloRating(newElo);
                    setStreakCount(newStreak);
                }
                setEloChange(change);

                // Persist to DB
                const profile = await db.user_profile.orderBy('id').first();
                if (profile && profile.id) {
                    const updateData: any = { last_practice: Date.now() };

                    if (isListening) {
                        updateData.listening_elo = newElo;
                        updateData.listening_streak = newStreak;
                        updateData.listening_max_elo = Math.max(profile.listening_max_elo || 0, newElo);
                    } else {
                        updateData.elo_rating = newElo;
                        updateData.streak_count = newStreak;
                        updateData.max_elo = Math.max(profile.max_elo, newElo);
                    }

                    await db.user_profile.update(profile.id, updateData);
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmittingDrill(false);
        }
    };

    const handleAskTutor = async () => {
        if (!tutorQuery.trim() || !drillData) return;
        setIsAskingTutor(true);

        try {
            const response = await fetch("/api/ai/ask_tutor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: tutorQuery,
                    drillContext: drillData,
                    articleTitle: context.articleTitle || context.topic
                }),
            });
            const data = await response.json();
            setTutorAnswer(data.answer);
        } catch (error) {
            console.error(error);
        } finally {
            setIsAskingTutor(false);
        }
    };

    const handleMagicHint = () => {
        if (!drillData) return;
        const target = drillData.reference_english;
        const currentLength = userTranslation.length;
        const remaining = target.slice(currentLength);
        if (!remaining) return;

        let nextChunk = "";
        const words = remaining.split(" ");
        if (words.length > 0) {
            nextChunk = words.slice(0, 2).join(" ") + " ";
        } else {
            nextChunk = remaining;
        }
        setUserTranslation(prev => prev + (prev.endsWith(" ") ? "" : " ") + nextChunk);
    };

    // --- Interactive Renderers (Ported) ---

    const handleWordClick = (e: React.MouseEvent, word: string) => {
        e.stopPropagation();
        const cleanWord = word.replace(/[^a-zA-Z]/g, "").trim();
        if (!cleanWord) return;

        if (mode === "listening" && drillData?.reference_english) {
            const textKey = "SENTENCE_" + drillData.reference_english;
            const cached = audioCache.current.get(textKey);

            if (cached && cached.marks && audioRef.current) {
                const targetMark = cached.marks.find((m: any) => {
                    const mClean = m.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
                    return mClean === cleanWord.toLowerCase();
                });
                if (targetMark && isPlaying) {
                    audioRef.current.currentTime = targetMark.time / 1000;
                    return;
                }
            }
        }

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setWordPopup({
            word: cleanWord,
            context: drillData?.reference_english || "",
            x: rect.left + rect.width / 2,
            y: rect.bottom + 10
        });
    };

    const renderInteractiveText = (text: string) => {
        // Find existing marks for this text
        const textKey = "SENTENCE_" + (drillData?.reference_english || "");
        const cached = audioCache.current.get(textKey);
        const marks = cached?.marks || [];

        return text.split(" ").map((word, i) => {
            const clean = word.replace(/[^a-zA-Z]/g, "").trim();
            const isActive = wordPopup?.word === clean;

            // Karaoke Highlight Check (Index-based to prevent duplicates)
            const mark = marks[i];
            const isKaraokeActive = isPlaying && !isActive && mark && (() => {
                const mClean = mark.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
                const wordMatch = mClean === clean.toLowerCase();
                const timeMatch = currentAudioTime >= mark.start && currentAudioTime <= (mark.end + 200);
                return wordMatch && timeMatch;
            })();

            return (
                <span key={i} className="relative inline-block">
                    <span
                        onClick={(e) => handleWordClick(e, word)}
                        className={cn(
                            "cursor-pointer px-1.5 py-0.5 transition-all duration-300 rounded-lg mx-[1px] relative",
                            "hover:text-rose-600 hover:bg-rose-50/60 hover:scale-105",
                            isActive ? "text-rose-700 bg-rose-100 ring-2 ring-rose-200 shadow-sm scale-110 z-10 font-bold" : "",
                            isKaraokeActive
                                ? "text-rose-600 bg-rose-50/80 backdrop-blur-sm font-bold shadow-[0_0_15px_rgba(244,63,94,0.15)] ring-1 ring-rose-100/50 scale-110 z-10"
                                : "text-stone-700"
                        )}
                    >
                        {word}
                    </span>
                    {" "}
                </span>
            );
        });
    };

    const renderDiff = () => {
        if (!drillData || !drillFeedback) return null;

        if (mode === "listening" && drillFeedback.segments) {
            const pronounceWord = (word: string) => {
                const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${word}&type=2`);
                audio.play().catch(() => { });
            };

            return (
                <div className="space-y-4">
                    <div className="p-4 bg-stone-50 rounded-xl border border-stone-100">
                        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Mic className="w-3 h-3" /> 你的原文
                        </div>
                        <p className="font-newsreader text-xl text-stone-600 leading-relaxed">"{userTranslation}"</p>
                    </div>

                    <div className="p-5 bg-white/60 rounded-2xl border border-stone-100 shadow-sm">
                        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <BookOpen className="w-3 h-3" />
                            对照修订 <span className="text-stone-300 font-normal ml-2">点击单词可发音</span>
                        </div>
                        <div className="font-newsreader text-2xl leading-loose text-stone-800 flex flex-wrap gap-x-1 gap-y-2">
                            {drillFeedback.segments.map((seg, i) => {
                                if (seg.status === "correct" || seg.status === "variation") {
                                    return <span key={i} className="text-emerald-700 cursor-pointer hover:bg-emerald-50 px-0.5 rounded transition-colors" onClick={() => pronounceWord(seg.word)}>{seg.word}</span>;
                                }
                                if (seg.status === "missing") {
                                    return (
                                        <span key={i} className="relative group cursor-pointer" onClick={() => pronounceWord(seg.word)}>
                                            <span className="text-rose-500 font-semibold underline decoration-wavy decoration-rose-300 hover:bg-rose-50 px-0.5 rounded transition-colors">{seg.word}</span>
                                            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] bg-rose-500 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">漏读</span>
                                        </span>
                                    );
                                }
                                if (seg.status === "phonetic_error") {
                                    return (
                                        <span key={i} className="relative group cursor-pointer" onClick={() => pronounceWord(seg.word)}>
                                            <span className="text-amber-600 font-semibold hover:bg-amber-50 px-0.5 rounded transition-colors">{seg.word}</span>
                                            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-amber-500 bg-amber-50 px-1 rounded border border-amber-200 opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">你说: {seg.user_input}</span>
                                        </span>
                                    );
                                }
                                return (
                                    <span key={i} className="relative group cursor-pointer" onClick={() => pronounceWord(seg.word)}>
                                        <span className="text-rose-600 font-semibold underline decoration-rose-300 decoration-2 hover:bg-rose-50 px-0.5 rounded transition-colors">{seg.word}</span>
                                        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-rose-400 line-through opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">{seg.user_input || "???"}</span>
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }

        const normalize = (str: string) => str.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").replace(/\s{2,}/g, " ").trim();
        const cleanUser = mode === "listening" ? normalize(userTranslation) : userTranslation;
        const cleanTarget = mode === "listening" ? normalize(drillData.reference_english) : drillData.reference_english;
        const diffs = Diff.diffWords(cleanUser, cleanTarget);

        const elements = [];
        for (let i = 0; i < diffs.length; i++) {
            const part = diffs[i];
            if (!part.added && !part.removed) {
                elements.push(<span key={i} className="text-stone-800">{part.value}</span>);
            } else if (part.removed) {
                let correction = null;
                if (i + 1 < diffs.length && diffs[i + 1].added) {
                    correction = diffs[i + 1].value;
                    i++;
                }
                elements.push(
                    <span key={i} className="group relative inline-block cursor-help mx-1">
                        <span className="text-rose-600 decoration-2 underline decoration-wavy decoration-rose-300 bg-rose-50/50 rounded px-0.5">{part.value}</span>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] px-3 py-2 bg-stone-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                            <div className="font-bold text-rose-200 mb-0.5">Incorrect</div>
                            {correction ? <><span className="text-emerald-300 font-mono text-sm">{correction}</span></> : <span>Unnecessary word</span>}
                        </div>
                    </span>
                );
            } else if (part.added) {
                elements.push(
                    <span key={i} className="group relative inline-block cursor-help mx-0.5 align-text-bottom">
                        <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-bold border border-emerald-200 hover:scale-110 transition-transform">+</div>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] px-3 py-2 bg-stone-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                            <div className="font-bold text-emerald-300 mb-0.5">Missing Word</div>
                            <span className="font-mono text-sm">{part.value}</span>
                        </div>
                    </span>
                );
            }
        }
        return <div className="font-newsreader text-2xl leading-relaxed text-stone-800">{elements}</div>;
    };


    // Auto-Mount Generate
    useEffect(() => {
        if (!drillData && !isGeneratingDrill) {
            handleGenerateDrill();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // --- Render ---

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key="drill-core"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/40 backdrop-blur-sm transition-colors duration-1000"
            >
                {/* Dynamic Background Engine */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
                    <AnimatePresence mode="popLayout">
                        {theme === 'fever' && (
                            <motion.div
                                key="theme-fever"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1 }}
                                className="absolute inset-0 bg-slate-900"
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(76,29,149,0.3),transparent_70%)] animate-pulse" />
                                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-fuchsia-500 to-transparent shadow-[0_0_20px_rgba(217,70,239,0.5)]" />
                                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500 to-transparent shadow-[0_0_20px_rgba(139,92,246,0.5)]" />
                            </motion.div>
                        )}
                        {theme === 'boss' && (
                            <motion.div
                                key="theme-boss"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1 }}
                                className="absolute inset-0 bg-black"
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(217,119,6,0.2),transparent_60%)]" />
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 animate-[spin_100s_linear_infinite]" />
                                <div className="absolute inset-0 border-[20px] border-amber-900/10" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <motion.div
                    layout
                    className={cn(
                        "relative w-full max-w-5xl h-[85vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-700",
                        theme === 'fever' ? "bg-slate-900/90 border border-fuchsia-500/30 shadow-fuchsia-900/20 text-white" :
                            theme === 'boss' ? "bg-black/95 border border-amber-500/30 shadow-amber-900/20 text-amber-50" :
                                "bg-white/80 backdrop-blur-xl border border-white/40 shadow-stone-200/50"
                    )}
                >
                    {/* Fever Overlay Particles */}
                    {theme === 'fever' && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                            {[...Array(5)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute w-1 h-20 bg-gradient-to-b from-transparent via-fuchsia-500/20 to-transparent"
                                    initial={{ top: -100, left: `${Math.random() * 100}%`, opacity: 0 }}
                                    animate={{ top: '100%', opacity: [0, 1, 0] }}
                                    transition={{ duration: 2 + Math.random(), repeat: Infinity, delay: Math.random() * 2, ease: "linear" }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Immersive Recording Overlay (Global Card Level) - Moved here to cover EVERYTHING including header */}
                    <AnimatePresence>
                        {whisperRecording && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="absolute inset-0 z-[100] pointer-events-none flex flex-col items-center justify-end pb-12 p-8 overflow-hidden"
                            >
                                {/* Silky Liquid Edge Visualizer */}
                                <div
                                    className="absolute inset-0 pointer-events-none transition-all duration-200 ease-out will-change-[box-shadow,opacity]"
                                    style={{
                                        // Multi-layered internal glow
                                        // Layer 1: Soft broad pink wash (Background ambience)
                                        // Layer 2: Sharp edge definition (The "Liquid" rim)
                                        boxShadow: `
                                            inset 0 0 ${60 + audioLevel}px ${20 + audioLevel * 0.5}px rgba(244, 63, 94, ${0.1 + audioLevel / 500}),
                                            inset 0 0 ${20 + audioLevel * 0.5}px rgba(244, 63, 94, ${0.2 + audioLevel / 300})
                                        `,
                                    }}
                                >
                                    {/* Corner Accents - Smoother Opacity */}
                                    <div className="absolute top-0 left-0 w-full h-full opacity-50 mix-blend-overlay"
                                        style={{
                                            background: `radial-gradient(circle at center, transparent ${50 - (audioLevel / 10)}%, rgba(244, 63, 94, ${0.05 + (audioLevel / 1000)}) 100%)`
                                        }}
                                    />
                                </div>

                                {/* Tech Frame Markers */}
                                <div className="absolute inset-4 opacity-30 pointer-events-none transition-all duration-300" style={{ transform: `scale(${1 + audioLevel / 1000})` }}>
                                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-rose-400 rounded-tl-xl" />
                                    <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-rose-400 rounded-tr-xl" />
                                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-rose-400 rounded-bl-xl" />
                                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-rose-400 rounded-br-xl" />
                                </div>

                                {/* Floating Glass Subtitle Container (Bottom anchored) */}
                                <motion.div
                                    initial={{ y: 20, opacity: 0, scale: 0.95 }}
                                    animate={{ y: 0, opacity: 1, scale: 1 }}
                                    className="relative z-10 max-w-2xl w-full flex flex-col items-center gap-4"
                                >
                                    {/* Organic Waveform - Now above/integrated */}
                                    <div className="flex items-center justify-center gap-1.5 h-8">
                                        {[...Array(16)].map((_, i) => (
                                            <div
                                                key={i}
                                                className="w-1 rounded-full bg-gradient-to-t from-rose-400 to-rose-300 shadow-sm transition-all duration-75 ease-[cubic-bezier(0.4,0,0.2,1)]"
                                                style={{
                                                    height: `${4 + Math.random() * (audioLevel * 0.8 || 8)}px`,
                                                    opacity: 0.6 + (audioLevel / 200)
                                                }}
                                            />
                                        ))}
                                    </div>

                                    <div className="bg-white/30 backdrop-blur-md border border-white/40 shadow-xl shadow-rose-900/5 rounded-2xl px-6 py-4 flex items-center justify-center transition-all bg-gradient-to-b from-white/50 to-white/20">
                                        <p className="text-lg md:text-xl font-sans font-medium text-stone-800 leading-snug text-center drop-shadow-sm">
                                            {whisperResult.text || (
                                                <span className="text-stone-500/80 animate-pulse italic">Listening...</span>
                                            )}
                                        </p>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 md:p-6 border-b border-stone-100/50 shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="flex bg-stone-100 p-1 rounded-full border border-stone-200">
                                <button
                                    onClick={() => setMode("translation")}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-sm font-bold transition-all",
                                        mode === "translation" ? "bg-white shadow-md text-stone-900" : "text-stone-400 hover:text-stone-600"
                                    )}
                                >
                                    <Globe className="w-3 h-3 inline-block mr-2" /> Translate
                                </button>
                                <button
                                    onClick={() => setMode("listening")}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-sm font-bold transition-all",
                                        mode === "listening" ? "bg-white shadow-md text-stone-900" : "text-stone-400 hover:text-stone-600"
                                    )}
                                >
                                    <Headphones className="w-3 h-3 inline-block mr-2" /> Listening
                                </button>
                            </div>
                        </div>
                        {onClose && (
                            <button onClick={onClose} className="w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition-all group">
                                <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                            </button>
                        )}
                    </div>

                    {/* Progress Bar */}
                    <AnimatePresence>
                        {isSubmittingDrill && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 4 }} exit={{ opacity: 0, height: 0 }} className="w-full bg-stone-100/50 overflow-hidden relative shrink-0">
                                <motion.div
                                    className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-80"
                                    animate={{ left: ["-100%", "200%"] }}
                                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Content Body */}
                    <div className="flex-1 relative overflow-hidden flex flex-col">


                        {isGeneratingDrill && !drillData ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-6 animate-pulse mt-32">
                                <div className="w-16 h-16 rounded-full border-4 border-stone-200 border-t-stone-800 animate-spin" />
                                <p className="text-stone-400 font-newsreader italic text-xl">
                                    {mode === "translation" ? "Crafting phrase..." : "Encoding audio stream..."}
                                </p>
                            </div>
                        ) : drillData ? (
                            <AnimatePresence mode="popLayout" initial={false}>
                                {!drillFeedback ? (
                                    <motion.div key="question" initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="absolute inset-0 overflow-y-auto custom-scrollbar p-6 md:p-8 pb-32">
                                        <div className="max-w-3xl mx-auto w-full space-y-4">
                                            {/* Elo Badge & Difficulty Header */}
                                            <div className="flex justify-center items-center gap-4 mb-4 animate-in fade-in slide-in-from-top-4">
                                                <div className="flex flex-col items-center group cursor-help relative animate-in fade-in slide-in-from-top-4 duration-700 delay-300">
                                                    {(() => {
                                                        const rank = getRank(currentElo || 1200);
                                                        return (
                                                            <>
                                                                <div className={cn("flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-sm transition-all bg-white/50 backdrop-blur-md", rank.border, rank.color)}>
                                                                    <Trophy className="w-4 h-4" />
                                                                    <span className="font-bold text-xs tracking-wider uppercase">{rank.title}</span>
                                                                    <div className="w-px h-3 bg-current opacity-20 mx-1" />
                                                                    <span className="font-newsreader font-medium italic text-lg">{currentElo || 1200}</span>
                                                                </div>
                                                                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-48 bg-white rounded-xl shadow-xl border border-stone-100 p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                    <div className="text-xs font-bold text-stone-500 mb-1 flex justify-between">
                                                                        <span>To {rank.nextRank?.title || "Max"}</span>
                                                                        <span>{Math.round(rank.progress)}%</span>
                                                                    </div>
                                                                    <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                                                                        <div className={cn("h-full rounded-full transition-all duration-500", rank.bg.replace('bg-', 'bg-slate-400 '))} style={{ width: `${rank.progress}%`, backgroundColor: 'currentColor' }} />
                                                                    </div>
                                                                    <div className="text-[10px] text-stone-400 mt-1 text-center font-medium">{rank.distToNext > 0 ? `${rank.distToNext} pts to promote` : "Max Level Reached"}</div>
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="h-4 w-[1px] bg-stone-200" />
                                                <span className="text-stone-400 font-bold text-xs tracking-wider uppercase">{mode} Drill</span>
                                            </div>


                                            {/* Source / Listening Area */}
                                            <div className="space-y-6 text-center w-full">
                                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative flex flex-col items-center gap-6 w-full">
                                                    {mode === "listening" ? (
                                                        <div className="w-full flex flex-col items-center justify-center relative">
                                                            {/* Big Play Button */}
                                                            <button onClick={playAudio} disabled={isPlaying} className="group relative w-24 h-24 flex items-center justify-center transition-all duration-500 hover:scale-105 active:scale-95 disabled:opacity-80 disabled:scale-100 mb-8 mt-4">
                                                                <div className={cn("absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-2xl transition-all duration-500", isPlaying ? "scale-125 opacity-100" : "scale-100 opacity-0 group-hover:opacity-100")} />
                                                                <div className="absolute inset-0 rounded-full bg-white/60 dark:bg-white/10 backdrop-blur-2xl border border-white/50 dark:border-white/20 shadow-2xl shadow-indigo-500/10 transition-all duration-300 group-hover:bg-white/80 group-hover:border-white" />
                                                                <div className="relative z-10 text-indigo-600 dark:text-indigo-300 drop-shadow-sm flex items-center justify-center">
                                                                    {isPlaying ? (
                                                                        <div className="flex items-center gap-1.5 h-10">
                                                                            {[0.4, 1, 0.6, 0.8, 0.5].map((h, i) => (
                                                                                <motion.div key={i} animate={{ height: [10 * h, 30 * h, 10 * h] }} transition={{ duration: 0.6 + (i * 0.1), repeat: Infinity, ease: "easeInOut", repeatType: "mirror" }} className="w-1.5 bg-indigo-500 rounded-full" />
                                                                            ))}
                                                                        </div>
                                                                    ) : <Play className="w-10 h-10 ml-1.5 fill-indigo-600 text-indigo-600" />}
                                                                </div>
                                                            </button>

                                                            {/* Minimal Controls */}
                                                            {/* Composite Control Bar */}
                                                            <div className="flex items-center justify-center gap-2 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
                                                                <div className="flex items-center bg-stone-200/50 backdrop-blur-md p-1.5 rounded-full shadow-inner border border-stone-100/20">
                                                                    {/* Blind Toggle */}
                                                                    <button
                                                                        onClick={() => setIsBlindMode(!isBlindMode)}
                                                                        className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2", isBlindMode ? "text-stone-500 hover:text-stone-700" : "bg-white text-stone-800 shadow-sm")}
                                                                    >
                                                                        {isBlindMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                                        {isBlindMode ? "BLIND TEXT" : "VISIBLE"}
                                                                    </button>

                                                                    <div className="w-px h-4 bg-stone-300 mx-2" />

                                                                    {/* Chinese Toggle */}
                                                                    <button
                                                                        onClick={() => setShowChinese(!showChinese)}
                                                                        className={cn("w-8 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center", showChinese ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600")}
                                                                        title="Toggle Chinese Translation"
                                                                    >
                                                                        中
                                                                    </button>

                                                                    <div className="w-px h-4 bg-stone-300 mx-2" />

                                                                    {/* Speed Controls */}
                                                                    <div className="flex items-center gap-1">
                                                                        {[0.75, 1.0, 1.25, 1.5].map((speed) => (
                                                                            <button
                                                                                key={speed}
                                                                                onClick={() => { setPlaybackSpeed(speed); if (audioRef.current) audioRef.current.playbackRate = speed; }}
                                                                                className={cn("text-[10px] px-3 py-1.5 rounded-full font-bold transition-all", playbackSpeed === speed ? "bg-white text-indigo-600 shadow-sm" : "text-stone-500 hover:text-stone-700")}
                                                                            >
                                                                                {speed}x
                                                                            </button>
                                                                        ))}
                                                                    </div>

                                                                    {mode === 'listening' && (
                                                                        <>
                                                                            <div className="w-px h-4 bg-stone-300 mx-2" />
                                                                            {/* Engine Mode */}
                                                                            <button
                                                                                onClick={() => setEngineMode(engineMode === 'fast' ? 'precise' : 'fast')}
                                                                                className={cn("px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all text-nowrap", engineMode === 'fast' ? "text-amber-600 bg-amber-100/50 hover:bg-amber-100" : "text-emerald-600 bg-emerald-100/50 hover:bg-emerald-100")}
                                                                            >
                                                                                {engineMode === 'fast' ? <Zap className="w-3 h-3" /> : <BrainCircuit className="w-3 h-3" />}
                                                                                {engineMode === 'fast' ? "FAST" : "PRO"}
                                                                            </button>

                                                                            <div className="w-px h-4 bg-stone-300 mx-2" />
                                                                            {/* Refresh Button */}
                                                                            <button
                                                                                onClick={() => handleGenerateDrill()}
                                                                                disabled={isGeneratingDrill}
                                                                                className="w-8 h-8 rounded-full text-stone-400 hover:text-stone-600 hover:bg-white flex items-center justify-center transition-all disabled:opacity-50"
                                                                                title="New Question"
                                                                            >
                                                                                <RefreshCw className={cn("w-3.5 h-3.5", isGeneratingDrill && "animate-spin")} />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Sleek Slider */}
                                                            <div className="w-full max-w-md flex items-center gap-4 px-4 mb-8 group/slider">
                                                                <span className="text-[10px] font-mono text-stone-300 w-8 text-right font-medium">{(currentAudioTime / 1000).toFixed(1)}</span>
                                                                <div className="flex-1 relative h-6 flex items-center">
                                                                    <input
                                                                        type="range"
                                                                        min={0}
                                                                        max={audioDuration || 100}
                                                                        value={currentAudioTime}
                                                                        onChange={handleSeek}
                                                                        className="absolute w-full h-1.5 bg-stone-100 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-600 transition-all z-10 opacity-0 group-hover/slider:opacity-100"
                                                                    />
                                                                    <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden absolute pointer-events-none">
                                                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (currentAudioTime / (audioDuration || 1)) * 100)}%` }} />
                                                                    </div>
                                                                    <div className="w-3 h-3 bg-indigo-600 rounded-full absolute pointer-events-none shadow-md transition-all duration-100 ease-linear scale-0 group-hover/slider:scale-100" style={{ left: `${(currentAudioTime / (audioDuration || 1)) * 100}%`, transform: 'translateX(-50%)' }} />
                                                                </div>
                                                                <span className="text-[10px] font-mono text-stone-300 w-8 text-left font-medium">{(audioDuration / 1000).toFixed(1)}</span>
                                                            </div>

                                                            {/* Text Reveal / Hint Area */}
                                                            {!isBlindMode ? (
                                                                <div className="relative w-full max-w-4xl mx-auto px-4 py-8 animate-in fade-in zoom-in-95 duration-500">
                                                                    <div className="text-center font-newsreader italic text-2xl md:text-3xl leading-relaxed text-stone-800 tracking-wide selection:bg-indigo-100">
                                                                        {renderInteractiveText(drillData.reference_english)}
                                                                    </div>
                                                                    <p className="mt-8 text-stone-400 text-sm font-medium tracking-wide uppercase text-center border-t border-stone-100 pt-6 max-w-xs mx-auto">Translation</p>
                                                                    {showChinese && <p className="mt-2 text-stone-500 text-lg text-center font-medium animate-in fade-in slide-in-from-top-2">{drillData.chinese}</p>}
                                                                </div>
                                                            ) : (
                                                                <div className="relative w-full max-w-2xl mx-auto px-4 py-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                                                    {showChinese && (
                                                                        <div className="flex flex-col items-center gap-3 bg-amber-50/50 border border-amber-100/50 rounded-2xl p-6 backdrop-blur-sm animate-in fade-in zoom-in-95">
                                                                            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest"><Sparkles className="w-3 h-3" /> Hint / Translation</div>
                                                                            <p className="text-stone-600 text-lg font-medium text-center leading-relaxed opacity-80">{drillData.chinese}</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="w-full py-12 flex flex-col items-center justify-center gap-8">
                                                            <h3 className="text-2xl md:text-4xl font-newsreader font-medium text-stone-900 leading-normal text-center max-w-4xl">{drillData.chinese}</h3>

                                                            {/* Keywords */}
                                                            <div className="flex flex-wrap justify-center gap-3">
                                                                {(drillData.target_english_vocab || drillData.key_vocab || []).map((vocab, i) => (
                                                                    <span key={i} onClick={(e) => handleWordClick(e, vocab)} className="px-5 py-2 rounded-full bg-white border border-stone-200 text-stone-600 font-newsreader italic text-lg hover:bg-stone-50 hover:border-stone-300 hover:text-stone-900 cursor-pointer transition-all shadow-sm">{vocab}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Action Button - Only show if not waiting for user */}
                                                    <div className="flex justify-center mt-4 opacity-0 pointer-events-none h-0 overflow-hidden">
                                                        <button onClick={() => handleGenerateDrill()} disabled={isGeneratingDrill} className="flex items-center gap-2 px-4 py-2 text-sm text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-full transition-all disabled:opacity-50">
                                                            <RefreshCw className={cn("w-4 h-4", isGeneratingDrill && "animate-spin")} /> 换一题
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            </div>

                                            <div className="w-full max-w-xs mx-auto h-px bg-gradient-to-r from-transparent via-stone-200 to-transparent my-8" />

                                            {/* Interactive Area */}

                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="w-full space-y-6">
                                                <div className="relative group">
                                                    {mode === "listening" ? (
                                                        <div className="flex flex-col items-center justify-center gap-4 py-4 min-h-[160px]">
                                                            {whisperProcessing ? (
                                                                <div className="flex flex-col items-center animate-pulse gap-4">
                                                                    <div className="w-24 h-24 rounded-full bg-indigo-50 border-4 border-indigo-100 flex items-center justify-center"><RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" /></div>
                                                                    <p className="text-indigo-400 font-bold tracking-wide text-sm uppercase">Transcribing...</p>
                                                                </div>
                                                            ) : (
                                                                <div className="relative">

                                                                    {/* Passive Text Display (When not recording) */}
                                                                    {/* Passive Text Display (Stable Layout) */}
                                                                    {/* Passive Text Removed per user request */}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <textarea value={userTranslation} onChange={(e) => setUserTranslation(e.target.value)} placeholder="Enter your English translation..." className="w-full min-h-[160px] p-6 text-xl font-newsreader bg-white/50 border border-stone-200 rounded-3xl focus:ring-4 ring-stone-100 focus:border-stone-400 transition-all resize-none placeholder:text-stone-300 text-stone-800 shadow-sm group-hover:shadow-md outline-none" spellCheck={false} autoFocus />
                                                            <div className="absolute bottom-4 right-4 flex items-center gap-3">
                                                                <button onClick={handleMagicHint} className="h-10 px-4 rounded-xl bg-amber-100/50 text-amber-700 hover:bg-amber-100 flex items-center gap-2 transition-all font-bold text-sm" title="Auto-Complete Hint"><Wand2 className="w-4 h-4" /> Hint</button>
                                                                <button onClick={() => setIsTutorOpen(!isTutorOpen)} className="w-10 h-10 rounded-full bg-stone-100 text-stone-500 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center transition-all shadow-sm" title="Ask AI Tutor"><HelpCircle className="w-5 h-5" /></button>
                                                                <button onClick={handleSubmitDrill} disabled={!userTranslation.trim() || isSubmittingDrill} className="bg-stone-900 hover:bg-black text-white px-6 py-2.5 rounded-xl font-bold shadow-xl shadow-stone-900/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0">
                                                                    {isSubmittingDrill ? <Sparkles className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {isSubmittingDrill ? "Checking..." : "Check"}
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                    {/* AI Tutor Cloud */}
                                                    <AnimatePresence>
                                                        {isTutorOpen && (
                                                            <motion.div initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 10 }} className="absolute bottom-20 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-stone-100 p-4 z-20 flex flex-col gap-3">
                                                                <div className="flex items-center justify-between pb-2 border-b border-stone-50">
                                                                    <span className="text-xs font-bold text-indigo-500 flex items-center gap-1"><MessageCircle className="w-3 h-3" /> AI Tutor</span>
                                                                    <button onClick={() => setIsTutorOpen(false)} className="text-stone-400 hover:text-stone-600"><X className="w-3 h-3" /></button>
                                                                </div>
                                                                {tutorAnswer ? <div className="bg-indigo-50/50 p-3 rounded-lg text-sm text-stone-700 animate-in fade-in">{tutorAnswer}</div> : <p className="text-xs text-stone-400">Ask for a hint about vocab or grammar...</p>}
                                                                <div className="relative">
                                                                    <input type="text" value={tutorQuery} onChange={(e) => setTutorQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAskTutor()} placeholder="e.g. 'How do I start?'" className="w-full bg-stone-50 border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-200" />
                                                                    <button onClick={handleAskTutor} disabled={isAskingTutor || !tutorQuery.trim()} className="absolute right-2 top-1.5 text-indigo-500 disabled:opacity-30">{isAskingTutor ? <Sparkles className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}</button>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </motion.div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div key="feedback" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-48">
                                        <div className={cn("max-w-4xl mx-auto w-full space-y-4 transition-transform duration-100", drillFeedback.score <= 4 && "animate-[shake_0.5s_ease-in-out]")}>
                                            <div className="flex flex-col items-center gap-1">
                                                <div className={cn("text-5xl font-bold font-newsreader", drillFeedback.score >= 8 ? "text-emerald-600" : drillFeedback.score >= 6 ? "text-amber-500" : "text-rose-500")}>
                                                    {drillFeedback.score}<span className="text-xl text-stone-300 font-normal">/10</span>
                                                </div>
                                                <p className="text-stone-500 font-medium text-xs uppercase tracking-wider">Accuracy Score</p>
                                                {eloChange !== null && eloChange !== 0 ? (
                                                    <div className="flex flex-col items-center animate-in slide-in-from-bottom-2 fade-in duration-500 delay-150 mt-4 w-full max-w-sm">
                                                        {/* Rank Progress Bar */}
                                                        {(() => {
                                                            const rank = getRank(currentElo || 1200);
                                                            return (
                                                                <div className="w-full mb-4">
                                                                    <div className="flex justify-between text-xs font-bold text-stone-400 mb-1.5 uppercase tracking-wider">
                                                                        <span className={rank.color.replace('bg-', 'text-')}>{rank.title}</span>
                                                                        <span>{rank.nextRank?.title || "Max"}</span>
                                                                    </div>
                                                                    <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden shadow-inner">
                                                                        <div
                                                                            className={cn("h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden", rank.bg.replace('bg-', 'bg-gradient-to-r from-transparent to-'))}
                                                                            style={{ width: `${Math.max(5, rank.progress)}%`, backgroundColor: 'currentColor' }}
                                                                        >
                                                                            <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-[10px] text-right text-stone-300 mt-1 font-mono">{Math.round(rank.progress)}% to promote</div>
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Elo Change Badge & Breakdown */}
                                                        <div className="relative group/breakdown cursor-help">
                                                            <div className={cn("px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm border transition-all hover:scale-105", eloChange > 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100")}>
                                                                <TrendingUp className={cn("w-4 h-4", eloChange < 0 && "rotate-180")} />
                                                                <span>{eloChange > 0 ? "+" : ""}{eloChange} Elo</span>
                                                                {eloBreakdown?.streakBonus && <span className="flex items-center text-orange-500 ml-1 animate-pulse"><Zap className="w-3 h-3 fill-current" /></span>}
                                                            </div>

                                                            {/* Hover Breakdown */}
                                                            {eloBreakdown && (
                                                                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 bg-white rounded-xl shadow-xl border border-stone-100 p-3 opacity-0 group-hover/breakdown:opacity-100 transition-opacity pointer-events-none z-50 text-xs">
                                                                    <div className="space-y-1.5 ">
                                                                        <div className="flex justify-between text-stone-500">
                                                                            <span>Base Performance</span>
                                                                            <span className="font-mono font-bold">{eloBreakdown.baseChange > 0 ? "+" : ""}{eloBreakdown.baseChange}</span>
                                                                        </div>
                                                                        {eloBreakdown.streakBonus && (
                                                                            <div className="flex justify-between text-orange-500 font-bold">
                                                                                <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Streak Bonus</span>
                                                                                <span className="font-mono">+{eloBreakdown.bonusChange}</span>
                                                                            </div>
                                                                        )}
                                                                        <div className="w-full h-px bg-stone-100 my-1" />
                                                                        <div className="flex justify-between text-stone-400 text-[10px] uppercase tracking-wider">
                                                                            <span>Difficulty</span>
                                                                            <span>{Math.round(eloBreakdown.difficultyElo)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {drillFeedback.judge_reasoning && <p className="text-[10px] text-stone-400 mt-3 max-w-lg text-center leading-relaxed"><span className="font-bold text-stone-500 mr-1">AI Judge:</span>{drillFeedback.judge_reasoning}</p>}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center animate-in slide-in-from-bottom-2 fade-in duration-500 delay-150 mt-1">
                                                        <div className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm border bg-stone-50 text-stone-500 border-stone-200"><RefreshCw className="w-3 h-3" /> Practice Mode</div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="bg-white/90 p-6 rounded-[2rem] shadow-xl shadow-stone-200/50 border border-stone-100 backdrop-blur-sm">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-2 text-stone-400 text-xs font-bold uppercase tracking-wider"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Smart Revision</div>
                                                    <div className="flex gap-2">
                                                        {mode === 'listening' && (
                                                            <button onClick={playRecording} className="px-3 py-1.5 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center gap-1.5 transition-all text-[10px] font-bold" title="Play My Recording"><Mic className="w-3 h-3" /> Play Mine</button>
                                                        )}
                                                        <button onClick={playAudio} className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center transition-all" title="Listen to Correct Version"><Volume2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                                {mode !== "listening" && (
                                                    <div className="mb-4 p-3 bg-stone-50 rounded-xl border border-stone-100">
                                                        <p className="text-[10px] text-stone-400 font-bold uppercase mb-1">Your Answer:</p>
                                                        <p className="text-base font-newsreader text-stone-700 italic">"{userTranslation}"</p>
                                                    </div>
                                                )}
                                                {renderDiff()}
                                                {drillFeedback.feedback && (
                                                    <div className="mt-4 pt-4 border-t border-stone-100">
                                                        <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-2"><Sparkles className="w-3 h-3" /> Coach's Analysis</h4>
                                                        <div className="space-y-2">
                                                            {Array.isArray(drillFeedback.feedback) ? drillFeedback.feedback.map((point: string, i: number) => (
                                                                <div key={i} className="flex gap-2 text-stone-600 leading-snug font-medium text-sm"><div className="w-1 h-1 rounded-full bg-indigo-400 mt-2 shrink-0" /><p>{point}</p></div>
                                                            )) : (
                                                                <div className="grid gap-3">
                                                                    {drillFeedback.feedback.listening_tips && <div className="bg-amber-50 p-3 rounded-xl text-amber-800 text-xs"><strong className="block mb-0.5 text-amber-600">👂 Listening Tips</strong>{drillFeedback.feedback.listening_tips}</div>}
                                                                    {drillFeedback.feedback.encouragement && <div className="italic text-stone-500 text-sm">"{drillFeedback.feedback.encouragement}"</div>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        ) : null}
                    </div>

                    {/* Floating Action Bar - Redesigned */}
                    <AnimatePresence>
                        {drillFeedback && (
                            <motion.div
                                initial={{ y: 100, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 100, opacity: 0 }}
                                className="absolute bottom-10 left-0 right-0 flex justify-center z-50 pointer-events-none"
                            >
                                <div className="bg-stone-900/95 backdrop-blur-2xl text-white p-2 rounded-full flex gap-2 pointer-events-auto border border-white/10 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.4)] scale-110 items-center pl-3">
                                    <button
                                        onClick={() => { setDrillFeedback(null); setUserTranslation(""); setIsSubmittingDrill(false); setWordPopup(null); }}
                                        className="px-5 py-2.5 rounded-full text-stone-400 font-bold hover:text-white hover:bg-white/10 transition-all text-sm flex items-center gap-2 group"
                                    >
                                        <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                                        <span>Try Again</span>
                                    </button>

                                    <div className="w-px h-5 bg-white/10" />

                                    <button
                                        onClick={() => handleGenerateDrill()}
                                        className="px-8 py-3 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white rounded-full font-bold shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 text-sm relative overflow-hidden group"
                                    >
                                        <span className="relative z-10 flex items-center gap-2 text-nowrap">
                                            Next Question <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </span>
                                        {/* Shimmer Effect */}
                                        <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent z-0" />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {wordPopup && <WordPopup key="word-popup" popup={wordPopup} onClose={() => setWordPopup(null)} />}
                </motion.div>

                {/* Loot Overlay */}
                <AnimatePresence>
                    {lootDrop && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.5, y: 50 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.5, y: -50 }}
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] flex flex-col items-center gap-4 pointer-events-none"
                        >
                            <div className={cn(
                                "flex flex-col items-center gap-2 p-6 rounded-3xl border-2 shadow-2xl backdrop-blur-xl min-w-[200px]",
                                lootDrop.rarity === 'legendary' ? "bg-amber-900/90 border-amber-400 shadow-amber-500/50" :
                                    lootDrop.rarity === 'rare' ? "bg-indigo-900/90 border-indigo-400 shadow-indigo-500/50" :
                                        "bg-stone-800/90 border-stone-500 shadow-xl"
                            )}>
                                <div className="text-6xl animate-bounce">
                                    {lootDrop.type === 'theme' ? '👑' : lootDrop.type === 'gem' ? '💎' : '🎁'}
                                </div>
                                <div className={cn("text-lg font-bold uppercase tracking-wider",
                                    lootDrop.rarity === 'legendary' ? "text-amber-300" :
                                        lootDrop.rarity === 'rare' ? "text-indigo-300" :
                                            "text-stone-300"
                                )}>
                                    {lootDrop.message}
                                </div>
                                <div className="text-3xl font-black text-white font-mono">
                                    +{lootDrop.amount}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
}
