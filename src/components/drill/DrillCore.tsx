"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, RefreshCw, Send, CheckCircle2, ArrowRight, HelpCircle, MessageCircle, Wand2, Mic, Play, Volume2, Globe, Headphones, Eye, EyeOff, BookOpen, BrainCircuit, X, Trophy, TrendingUp, Zap, Gift, Crown, Gem, Dices, AlertTriangle, Skull, Heart, ChevronRight, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import * as Diff from 'diff';
import confetti from 'canvas-confetti';
import { WordPopup, PopupState } from "../reading/WordPopup";
import { useWhisper } from "@/hooks/useWhisper";
import { db } from "@/lib/db";
import { getRank } from "@/lib/rankUtils";
import { DeathFX } from "./DeathFX";
import { BossScoreReveal } from "./BossScoreReveal";
import { RouletteOverlay } from "./RouletteOverlay";
import { DrillDebug } from "../debug/DrillDebug";
import { ScoringFlipCard } from "./ScoringFlipCard";
import { TeachingCard } from "./TeachingCard";
import { GhostTextarea } from "../vocab/GhostTextarea";

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
    _difficultyMeta?: {
        requestedElo: number;
        tier: string;
        cefr: string;
        expectedWordRange: { min: number; max: number };
        actualWordCount: number;
        isValid: boolean;
        status: 'TOO_EASY' | 'TOO_HARD' | 'MATCHED';
        aiSelfReport?: {
            tier: string;
            cefr: string;
            wordCount: number;
            targetRange: string;
            wordCountAccurate: boolean;
        } | null;
    };
    _topicMeta?: {
        topic: string;
        isScenario: boolean;
    };
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
    // Teaching mode enhanced fields
    error_analysis?: Array<{ error: string; correction: string; rule: string; tip: string }>;
    similar_patterns?: Array<{ chinese: string; english: string; point: string }>;
    _error?: boolean;
}

interface DictionaryData {
    word: string;
    phonetic?: string;
    audio?: string;
    translation?: string;
    definition?: string;
}

// --- State --- 

interface LootDrop {
    type: 'gem' | 'exp' | 'theme';
    amount: number;
    message: string;
    rarity: 'common' | 'rare' | 'legendary';
    name?: string; // Optional for compatibility
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
    const [isPrefetching, setIsPrefetching] = useState(false); // Track background audio prefetch
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioCache = useRef<Map<string, { url?: string; blob?: Blob; marks?: any[] }>>(new Map());
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
        resetResult,
        engineMode,
        setEngineMode
    } = useWhisper();

    // Ask Tutor State
    const [isTutorOpen, setIsTutorOpen] = useState(false);
    const [tutorQuery, setTutorQuery] = useState("");
    const [tutorAnswer, setTutorAnswer] = useState<string | null>(null);
    const [isAskingTutor, setIsAskingTutor] = useState(false);

    // Teaching Mode State
    const [teachingMode, setTeachingMode] = useState(false);
    const [teachingData, setTeachingData] = useState<any>(null);
    const [isLoadingTeaching, setIsLoadingTeaching] = useState(false);
    const [teachingPanelOpen, setTeachingPanelOpen] = useState(false); // Floating panel visibility

    // UI State
    const [isBlindMode, setIsBlindMode] = useState(true);
    const [showChinese, setShowChinese] = useState(false);
    const [difficulty, setDifficulty] = useState<string>('Level 3');
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

    // Elo State
    const [eloRating, setEloRating] = useState(600); // Translation Elo
    const [streakCount, setStreakCount] = useState(0);

    const [listeningElo, setListeningElo] = useState(600);
    const [listeningStreak, setListeningStreak] = useState(0);
    const [isEloLoaded, setIsEloLoaded] = useState(false); // Track if Elo has been loaded from DB



    // Gamification State (Fever / Themes)
    const [comboCount, setComboCount] = useState(0);
    const [feverMode, setFeverMode] = useState(false);
    // Gamification State (Fever / Themes)
    // Removed duplicate state declarations
    const [theme, setTheme] = useState<'default' | 'fever' | 'boss' | 'crimson'>('default');
    const [bossState, setBossState] = useState<{
        active: boolean;
        introAck: boolean;
        type: 'blind' | 'lightning' | 'echo' | 'reaper' | 'roulette' | 'roulette_execution';
        hp?: number;
        maxHp?: number;
        playerHp?: number; // New: Symmetric Duel
        playerMaxHp?: number;
    }>({ active: false, introAck: false, type: 'blind' });
    const [deathAnim, setDeathAnim] = useState<'slash' | 'glitch' | 'shatter' | null>(null);
    const [lootDrop, setLootDrop] = useState<LootDrop | null>(null);
    const [gambleState, setGambleState] = useState<{
        active: boolean;
        introAck: boolean;
        wager: 'safe' | 'risky' | 'madness' | null;
        doubleDownCount: number;
    }>({ active: false, introAck: false, wager: null, doubleDownCount: 0 });

    // Roulette State
    const [showRoulette, setShowRoulette] = useState(false);
    const [rouletteSession, setRouletteSession] = useState<{
        active: boolean;
        result: 'safe' | 'dead';
        multiplier: number;
        bullets: number;
    } | null>(null);

    // Server Status Check
    const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'checking'>('checking');
    useEffect(() => {
        const checkServer = async () => {
            try {
                const res = await fetch('http://localhost:3002/health');
                if (res.ok) setServerStatus('online');
                else setServerStatus('offline');
            } catch (e) {
                setServerStatus('offline');
            }
        };
        checkServer();
        // Poll every 30s
        const interval = setInterval(checkServer, 30000);
        return () => clearInterval(interval);
    }, []);

    // Visceral FX State
    const [shake, setShake] = useState(false);
    const [showDoubleDown, setShowDoubleDown] = useState(false); // Modal State

    const hasStartedRef = useRef(false);
    const hasPlayedEchoRef = useRef(false); // For Echo Beast (One-time audio)

    // Track if Lightning mode audio has been played (for delayed countdown)
    const [lightningStarted, setLightningStarted] = useState(false);

    // Boss Fuse Timer
    const [fuseTime, setFuseTime] = useState(100); // Boss Fuse (100%)
    const abortControllerRef = useRef<AbortController | null>(null); // For cancelling pending API requests
    const [rankUp, setRankUp] = useState<{ oldRank: ReturnType<typeof getRank>; newRank: ReturnType<typeof getRank>; } | null>(null); // Rank promotion celebration
    const [rankDown, setRankDown] = useState<{ oldRank: ReturnType<typeof getRank>; newRank: ReturnType<typeof getRank>; } | null>(null); // Rank demotion punishment

    // Theme-based Ambient Audio
    // Theme-based Ambient Audio (Legacy Removed -> Handled by modern BGM Manager at line 523)

    // Boss Fuse Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        // Lightning countdown only starts AFTER audio is played
        const isLightning = theme === 'boss' && bossState.active && bossState.type === 'lightning' && bossState.introAck && lightningStarted;
        const isGamble = theme === 'crimson' && gambleState.active && gambleState.introAck;

        if ((isLightning || isGamble) && !isSubmittingDrill) {
            interval = setInterval(() => {
                // Timer Duration based on Mode
                // Lightning: 30s (300 ticks)
                // Gamble: 45s (450 ticks) for high pressure
                const durationTicks = isLightning ? 300 : 450;
                const decrement = 100 / durationTicks;

                setFuseTime(prev => {
                    if (prev <= 0) {
                        clearInterval(interval);
                        // Trigger Defeat / Time Up
                        new Audio('https://commondatastorage.googleapis.com/codeskulptor-assets/sounddogs/explosion.mp3').play().catch(() => { });
                        if (navigator.vibrate) navigator.vibrate(500);
                        setShake(true);

                        // Calculate Penalty
                        const penalty = isGamble ? (gambleState.wager === 'risky' ? 20 : 50) : 20;


                        // Reset States (Delayed for Animation)
                        setDeathAnim(isGamble ? 'shatter' : 'glitch');

                        // Apply Penalty (Local & DB)
                        setEloRating(current => {
                            const newElo = Math.max(0, current - penalty);
                            // Sync DB
                            db.user_profile.orderBy('id').first().then(profile => {
                                if (profile) {
                                    db.user_profile.update(profile.id, {
                                        elo_rating: newElo,
                                        streak_count: 0
                                    });
                                }
                            });
                            return newElo;
                        });

                        // Show Notification
                        setLootDrop({
                            type: 'exp',
                            amount: penalty,
                            rarity: 'common',
                            message: 'TIME UP! DEFEAT'
                        });

                        // Actual State Reset after Animation
                        setTimeout(() => {
                            setTheme('default');
                            setBossState(prev => ({ ...prev, active: false }));
                            setGambleState(prev => ({ ...prev, active: false, introAck: false, wager: null, doubleDownCount: 0 }));
                            setStreakCount(0);
                            setDeathAnim(null);
                        }, 3000);

                        return 0;
                    }
                    return Math.max(0, prev - decrement);
                });
            }, 100);
        } else if (!isLightning && !isGamble) {
            setFuseTime(100); // Reset if not in a timed mode
        }
        return () => clearInterval(interval);
    }, [theme, isSubmittingDrill, bossState.introAck, gambleState.introAck, bossState.active, bossState.type, gambleState.active, gambleState.wager, lightningStarted]);

    // Shake Trigger
    useEffect(() => {
        if (shake) {
            console.log('[Shake] Triggered! shake =', shake);
            const timeout = setTimeout(() => setShake(false), 500);
            return () => clearTimeout(timeout);
        }
    }, [shake]);


    // Auto-dismiss Loot Drop
    useEffect(() => {
        if (lootDrop) {
            const timer = setTimeout(() => {
                setLootDrop(null);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [lootDrop]);

    // Cleanup: Stop ALL audio and abort requests when component unmounts
    useEffect(() => {
        return () => {
            // Stop TTS audio
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
            // Stop ambient audio (Legacy removed)
            // Abort any pending API requests
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            console.log('[DrillCore] Cleanup: All audio stopped, requests aborted');
        };
    }, []);


    // Computed Elo based on Mode
    const currentElo = mode === 'listening' ? listeningElo : eloRating;
    const currentStreak = mode === 'listening' ? listeningStreak : streakCount;

    // ELO-based auto-difficulty (unified 400 Elo per tier)
    const getEloDifficulty = (elo: number) => {
        if (elo < 400) return { level: 'Level 1', label: 'A1 新手', cefr: 'A1', color: 'text-stone-500', desc: '简单SVO句子' };
        if (elo < 800) return { level: 'Level 2', label: 'A2- 青铜', cefr: 'A2-', color: 'text-amber-600', desc: '日常复合句' };
        if (elo < 1200) return { level: 'Level 3', label: 'A2+ 白银', cefr: 'A2+', color: 'text-slate-500', desc: '简单从句' };
        if (elo < 1600) return { level: 'Level 4', label: 'B1 黄金', cefr: 'B1', color: 'text-yellow-600', desc: '被动+关系从句' };
        if (elo < 2000) return { level: 'Level 5', label: 'B2 铂金', cefr: 'B2', color: 'text-cyan-600', desc: '条件句+分词' };
        if (elo < 2400) return { level: 'Level 6', label: 'C1 钻石', cefr: 'C1', color: 'text-blue-500', desc: '倒装+虚拟语气' };
        if (elo < 2800) return { level: 'Level 7', label: 'C2 大师', cefr: 'C2', color: 'text-fuchsia-600', desc: '母语级表达' };
        if (elo < 3200) return { level: 'Level 8', label: 'C2+ 王者', cefr: 'C2+', color: 'text-purple-600', desc: '极限挑战' };
        return { level: 'Level 9', label: '☠️ 处决', cefr: '∞', color: 'text-red-500', desc: '惩罚级难度' };
    };
    const eloDifficulty = getEloDifficulty(currentElo || 600);

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
                setListeningElo(profile.listening_elo ?? 600);
                setListeningStreak(profile.listening_streak ?? 0);
                setIsEloLoaded(true); // Mark Elo as loaded
            } else {
                await db.user_profile.add({
                    elo_rating: 1200,
                    streak_count: 0,
                    max_elo: 1200,
                    last_practice: Date.now()
                });
                setIsEloLoaded(true); // Mark Elo as loaded (new profile)
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

    // Auto-Play Removed per User Request (Manual Only)
    /*
    useEffect(() => {
        const isIntroShowing = (gambleState.active && !gambleState.introAck) || (bossState.active && !bossState.introAck);

        if (mode === "listening" && drillData?.reference_english && !drillFeedback && !isIntroShowing) {
            playAudio();
        }
    }, [drillData, mode, gambleState.active, gambleState.introAck, bossState.active, bossState.introAck]);
    */

    // Pre-generate audio when drill loads (reduces playback delay)
    useEffect(() => {
        console.log('[Audio Prefetch] useEffect triggered, drillData?.reference_english:',
            drillData?.reference_english?.substring(0, 30));

        if (!drillData?.reference_english) {
            console.log('[Audio Prefetch] Skipped - no reference_english');
            return;
        }

        const textKey = "SENTENCE_" + drillData.reference_english;

        // Skip if already cached
        if (audioCache.current.has(textKey)) {
            console.log('[Audio Prefetch] Already cached:', textKey.substring(0, 50));
            return;
        }

        // Pre-fetch audio in background using reliable /api/tts endpoint
        const prefetchAudio = async () => {
            setIsPrefetching(true); // Show loading indicator
            try {
                console.log('[Audio Prefetch] Starting for:', textKey.substring(0, 50));

                // Use the reliable non-streaming TTS endpoint
                const response = await fetch("/api/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: drillData.reference_english,
                        voice: "en-US-JennyNeural",
                        rate: "+0%"
                    }),
                });

                if (!response.ok) throw new Error("TTS prefetch failed");

                const data = await response.json();

                if (!data.audio) {
                    throw new Error("No audio in response");
                }

                // Convert base64 to blob
                const base64Data = data.audio.split(',')[1];
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'audio/mpeg' });

                console.log('[Audio Prefetch] Blob size:', blob.size, 'bytes');

                if (blob.size < 100) {
                    console.warn('[Audio Prefetch] Blob too small, skipping cache');
                    return;
                }

                // Store the blob with word marks for highlighting
                audioCache.current.set(textKey, { blob, marks: data.marks || [] });
                console.log('[Audio Prefetch] Cached:', textKey.substring(0, 50));
            } catch (error) {
                console.error('[Audio Prefetch] Error:', error);
            } finally {
                setIsPrefetching(false); // Hide loading indicator
            }
        };

        prefetchAudio();
    }, [drillData?.reference_english]);

    const lastPlayTime = useRef(0);

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        setCurrentAudioTime(time);
        if (audioRef.current) audioRef.current.currentTime = time / 1000;
    };

    const playAudio = async () => {
        if (!drillData?.reference_english) return;

        // Debounce (Prevent Double Click)
        const now = Date.now();
        if (now - lastPlayTime.current < 500) return;
        lastPlayTime.current = now;

        // Echo Beast Constraint: One-time playback
        const isBlindMode = bossState.active && bossState.type === 'blind';
        if (bossState.active && bossState.type === 'echo' && hasPlayedEchoRef.current) {
            // Audio "Broken" effect
            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
            setShake(true);
            return;
        }

        const textKey = "SENTENCE_" + drillData.reference_english;
        // setIsPlaying(true); 
        setWordPopup(null);

        try {
            let cached = audioCache.current.get(textKey);

            if (!cached) {
                setIsAudioLoading(true);
                setIsPlaying(false);

                // Use reliable /api/tts endpoint (non-streaming)
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
                if (!data.audio) throw new Error("No audio in response");

                // Convert base64 to blob
                const base64Data = data.audio.split(',')[1];
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'audio/mpeg' });

                cached = { blob, marks: data.marks || [] };
                audioCache.current.set(textKey, cached);
                setIsAudioLoading(false);
            }

            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }

            // Create fresh URL from cached blob (always use blob now)
            const audioUrl = cached.blob
                ? URL.createObjectURL(cached.blob)
                : (cached.url || '');

            console.log('[Audio Play] Creating audio from cache, blob size:', cached.blob?.size, 'url:', audioUrl.substring(0, 50));

            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            // Add error handler
            audio.onerror = (e) => {
                console.error('[Audio Play] Error loading audio:', audio.error?.message, audio.error?.code);
            };

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

            // Echo Beast Constraint
            if (bossState.active && bossState.type === 'echo') {
                if (hasPlayedEchoRef.current) {
                    new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
                    setShake(true);
                    setIsPlaying(false);
                    return;
                }
                hasPlayedEchoRef.current = true;
            }

            await audio.play();
            setIsPlaying(true);

            // Start Lightning countdown when audio plays
            if (bossState.active && bossState.type === 'lightning') {
                setLightningStarted(true);
            }
        } catch (error) {
            console.error("Audio chain failed", error);
            setIsPlaying(false);
            setIsAudioLoading(false);
        }
    };


    // --- Whisper Result Sync (No auto-submit - user must click confirm) ---
    useEffect(() => {
        if (mode === "listening" && whisperResult.isFinal && whisperResult.text) {
            setUserTranslation(whisperResult.text);
            // Note: User must click "Submit" button to confirm
        }
    }, [whisperResult, mode]);

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

    // --- Keyboard listeners removed - now using click-to-record UI ---
    // Space key no longer triggers recording

    // --- Intro BGM Manager ---
    useEffect(() => {
        let audio: HTMLAudioElement | null = null;

        if (bossState.active) {
            // Play Boss BGM
            const config = BOSS_CONFIG[bossState.type];
            if (config && config.bgm) {
                console.log("[Audio] Playing Boss BGM:", config.bgm);
                audio = new Audio(config.bgm);
                audio.volume = bossState.introAck ? 0.15 : 0.4;
                audio.loop = false;
                audio.play().catch(err => console.log("[Audio] Boss play failed:", err));
            }
        } else if (gambleState.active) {
            // Play Gamble Audio (Intro Prompt vs Betting Loop)
            if (!gambleState.introAck) {
                // Intro: "Heartbeat/Prompt" sound
                console.log("[Audio] Playing Gamble Intro");
                audio = new Audio('/gamble_intro.mp3');
                audio.volume = 0.6;
                audio.loop = false;
            } else {
                // Betting Phase: "Background Tension" loop
                console.log("[Audio] Playing Gamble Loop");
                audio = new Audio('/gamble_loop.mp3');
                audio.volume = 0.4;
                audio.loop = true;
            }
            audio.play().catch(err => console.log("[Audio] Gamble play failed:", err));
        }

        return () => {
            if (audio) {
                audio.pause();
                audio = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bossState.active, bossState.introAck, bossState.type, gambleState.active, gambleState.introAck]);


    // --- DEBUG TRIGGER ---
    const handleDebugBossTrigger = (type: string) => {
        console.log(`[DEBUG] Triggering Boss: ${type}`);
        // Force immediate Drill Generation with Override
        handleGenerateDrill(undefined, type);
    };

    const debugTriggerRoulette = () => {
        // Show the interactive overlay instead of immediate generation
        setShowRoulette(true);
    };

    const handleRouletteComplete = (result: 'safe' | 'dead', bulletCount: number) => {
        setShowRoulette(false);
        console.log(`[Roulette] Result: ${result}, Bullets: ${bulletCount}`);

        const GREED_TABLE = [
            { bullets: 0, mult: 1 },
            { bullets: 1, mult: 2 },
            { bullets: 2, mult: 3 },
            { bullets: 3, mult: 5 },
            { bullets: 4, mult: 8 },
            { bullets: 5, mult: 15 },
            { bullets: 6, mult: 50 },
        ];

        const multiplier = GREED_TABLE.find(t => t.bullets === bulletCount)?.mult || 1;

        if (result === 'dead') {
            // --- IMMEDIATE PENALTY ---
            const penalty = 50;
            const isListening = mode === 'listening';
            const activeElo = isListening ? listeningElo : eloRating;
            const newElo = Math.max(0, (activeElo || 600) - penalty);

            setEloChange(-penalty);
            setLootDrop({
                type: 'exp',
                amount: -penalty,
                rarity: 'common',
                message: '💀 你中弹了！扣除 50 Elo 并开启处决局'
            });
            setShake(true);

            // Update local state
            if (isListening) setListeningElo(newElo);
            else setEloRating(newElo);

            // DB Sync
            db.user_profile.orderBy('id').first().then(profile => {
                if (profile) {
                    db.user_profile.update(profile.id, {
                        [isListening ? 'listening_elo' : 'elo_rating']: newElo,
                        [isListening ? 'listening_streak' : 'streak_count']: 0
                    });

                    // Also record in history so the chart shows the drop
                    db.elo_history.add({
                        mode: isListening ? 'listening' : 'translation',
                        elo: newElo,
                        change: -penalty,
                        timestamp: Date.now()
                    });
                }
            });

            setRouletteSession({ active: true, result: 'dead', multiplier: 1, bullets: bulletCount });
            handleGenerateDrill(undefined, 'roulette_execution');
        } else {
            // --- DEFERRED REWARD ---
            setRouletteSession({ active: true, result: 'safe', multiplier, bullets: bulletCount });
            setLootDrop({
                type: 'gem',
                amount: 0,
                rarity: 'legendary',
                message: `🎰 活下来了！本题奖励 x${multiplier} 倍`
            });
            handleGenerateDrill(undefined, 'roulette');
        }
    };

    // --- Core Actions ---

    const handleGenerateDrill = async (targetDifficulty = difficulty, overrideBossType?: string) => {
        // Abort any pending request before starting a new one
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        hasPlayedEchoRef.current = false; // Reset Echo Beast state
        setLightningStarted(false); // Reset Lightning countdown trigger

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
        resetResult(); // Clear previous recording transcript
        if (audioRef.current) audioRef.current.pause();

        // --- PRE-CALCULATE BOSS/GAMBLE EVENTS ---
        // Determine if we are entering a new Boss/Gamble encounter or continuing one
        let nextBossType = overrideBossType || (bossState.active ? bossState.type : undefined);
        let nextTheme = theme;
        let pendingBossState = null;
        let pendingGambleState = null;

        if (!bossState.active && !gambleState.active && mode === 'listening') {
            const roll = Math.random();
            // 2% Chance for Boss (Listening Only)
            if (roll < 0.02) {
                const bossRoll = Math.random();
                let type: 'blind' | 'lightning' | 'echo' | 'reaper' = 'blind';

                if (mode === 'listening') {
                    // Listening Weights: Blind (35%), Echo (30%), Lightning (20%), Reaper (15%)
                    if (bossRoll < 0.35) type = 'blind';
                    else if (bossRoll < 0.65) type = 'echo';
                    else if (bossRoll < 0.85) type = 'lightning';
                    else type = 'reaper';
                } else {
                    // Translation Weights: Lightning (50%), Reaper (50%)
                    if (bossRoll < 0.5) type = 'lightning';
                    else type = 'reaper';
                }

                nextBossType = type;
                nextTheme = 'boss';
                pendingBossState = {
                    active: true,
                    introAck: false,
                    type,
                    hp: type === 'reaper' ? 3 : undefined,
                    maxHp: type === 'reaper' ? 3 : undefined,
                    playerHp: type === 'reaper' ? 3 : undefined, // Player starts with 3 HP
                    playerMaxHp: type === 'reaper' ? 3 : undefined
                };
            }
            // 5% Chance for Gamble (Listening Mode Only)
            else if (roll < 0.07 && mode === 'listening') {
                nextTheme = 'crimson';
                pendingGambleState = { active: true, introAck: false, wager: null, doubleDownCount: 0 };
            }
        }

        // FORCE OVERRIDE STATE (DEBUG / ROULETTE)
        if (overrideBossType) {
            nextTheme = 'boss';
            nextBossType = overrideBossType as any;
            pendingBossState = {
                active: true,
                introAck: overrideBossType.includes('roulette'), // Skip standard intro for roulette
                type: overrideBossType as any,
                hp: undefined, // Standard unless reaper
                maxHp: undefined,
                playerHp: undefined,
                playerMaxHp: undefined
            };
            // Special handling for roulette execution visuals
            if (overrideBossType === 'roulette_execution') {
                // Flash effect can be triggered here if we had a flash state
            }
        }

        // IMMEDIATELY apply Boss/Gamble state BEFORE API call (eliminates flicker)
        if (pendingBossState) {
            setBossState(pendingBossState);
            setTheme('boss');
            setPlaybackSpeed(pendingBossState.type === 'lightning' ? 1.5 : 1.0);
        }
        if (pendingGambleState) {
            setGambleState(pendingGambleState);
            setTheme('crimson');
        }

        try {
            console.log(`[DEBUG] Sending to API: bossType=${nextBossType}, eloRating=${currentElo}`);
            const response = await fetch("/api/ai/generate_drill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    articleTitle: context.articleTitle || context.topic,
                    articleContent: context.articleContent || "",
                    difficulty: eloDifficulty.level, // Auto-calculated from ELO
                    eloRating: currentElo,
                    mode,
                    bossType: nextBossType // Inject Boss Context for Custom Scenarios
                }),
                signal, // Pass abort signal
            });

            // Check if aborted before processing response
            if (signal.aborted) return;

            const data = await response.json();

            // Check again after JSON parsing
            if (signal.aborted) return;

            setDrillData(data);

            // Fetch teaching content if teaching mode is ON and in translation mode
            if (teachingMode && mode === 'translation' && data.chinese && data.reference_english) {
                setTeachingPanelOpen(false);
                setTeachingData(null);
                setIsLoadingTeaching(true);
                try {
                    const teachRes = await fetch('/api/ai/teach', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chinese: data.chinese,
                            reference_english: data.reference_english,
                            elo: currentElo,
                        }),
                    });
                    if (!signal.aborted) {
                        const teachContent = await teachRes.json();
                        if (!signal.aborted && !teachContent.error) {
                            setTeachingData(teachContent);
                            setTeachingPanelOpen(true); // Auto-open panel when data loads
                        }
                    }
                } catch (err) {
                    console.error('[Teaching] Failed to fetch teaching data:', err);
                } finally {
                    if (!signal.aborted) setIsLoadingTeaching(false);
                }
            } else {
                setTeachingData(null);
                setTeachingPanelOpen(false);
                setIsLoadingTeaching(false);
            }

            // Boss/Gamble states already applied BEFORE API call (no flicker)
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                console.log('[Drill] Request aborted - switching to new question');
                return; // Silently exit on abort
            }
            console.error(error);
        } finally {
            if (!signal.aborted) {
                setIsGeneratingDrill(false);
            }
        }
    };

    const handleSubmitDrill = async () => {
        if (!userTranslation.trim() || !drillData) return;
        setIsSubmittingDrill(true);

        try {
            // Use correct Elo based on mode
            const activeElo = mode === 'listening' ? listeningElo : eloRating;

            const response = await fetch("/api/ai/score_translation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: userTranslation,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    current_elo: activeElo || 600,
                    mode,
                    teaching_mode: teachingMode,
                }),
            });
            const data = await response.json();

            // Guard: If API returned an error (no score), show error feedback
            if (!response.ok || data.error || data.score === undefined || data.score === null) {
                console.error("[DrillCore] Scoring API failed:", data.error || "No score returned");
                setDrillFeedback({
                    score: -1,
                    judge_reasoning: "评分服务暂时不可用，请重试。",
                    feedback: ["AI 评分接口超时或出错，请再试一次。"],
                    improved_version: "",
                    _error: true,
                });
                setIsSubmittingDrill(false);
                return;
            }

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
                        case 'Level 1': return 200;   // 新手 (0-400 midpoint)
                        case 'Level 2': return 600;   // 青铜 (400-800 midpoint)
                        case 'Level 3': return 1000;  // 白银 (800-1200 midpoint)
                        case 'Level 4': return 1400;  // 黄金 (1200-1600 midpoint)
                        case 'Level 5': return 1800;  // 铂金 (1600-2000 midpoint)
                        case 'Level 6': return 2200;  // 钻石 (2000-2400 midpoint)
                        case 'Level 7': return 2600;  // 大师 (2400-2800 midpoint)
                        case 'Level 8': return 3000;  // 王者 (2800-3200 midpoint)
                        case 'Level 9': return 3400;  // 处决 (3200+ midpoint)
                        default: return 600;
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

                const result = calculateAdvancedElo(activeElo || 600, difficulty, data.score, activeStreak);
                let change = result.total;
                let newStreak = activeStreak;

                // --- GAMBLING LOGIC (Crimson Roulette) ---
                // --- GAMBLING LOGIC (Crimson Roulette) ---
                if (gambleState.active && gambleState.wager && gambleState.wager !== 'safe') {
                    const isWin = data.score >= 9.0;

                    if (isWin) {
                        // Calculate Winnings
                        let baseWin = gambleState.wager === 'risky' ? 60 : 150;
                        let multiplier = Math.pow(2.5, gambleState.doubleDownCount); // 2.5x multiplier for every double down!
                        change = Math.round(baseWin * multiplier);

                        // Loot & Sound
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-201.mp3').play().catch(() => { });
                        setLootDrop({ type: 'gem', amount: change, rarity: 'legendary', message: `CRIMSON JACKPOT! x${multiplier}` });

                        // Trigger Double Down if eligible (Max 2 times)
                        if (gambleState.doubleDownCount < 2) {
                            // Delay showing the modal slightly so they see the score first
                            setTimeout(() => setShowDoubleDown(true), 1500);
                        } else {
                            // Max depth reached, reset
                            setTimeout(() => {
                                setGambleState({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
                                setTheme('default');
                            }, 3000);
                        }
                    } else {
                        // Loss Logic
                        let baseLoss = gambleState.wager === 'risky' ? -20 : -50;
                        change = baseLoss * Math.pow(2, gambleState.doubleDownCount);
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });

                        // Reset Deferred to BossScoreReveal Interaction
                        // setGambleState({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
                        // setTheme('default');
                        newStreak = 0;
                    }
                }

                // REAPER BOSS LOGIC
                else if (bossState.active && bossState.type === 'reaper') {
                    // Suppress standard Elo change during the duel
                    change = 0;

                    if (data.score >= 9.0) {
                        // Hit the Boss!
                        const newHp = (bossState.hp || 3) - 1;
                        setBossState(prev => ({ ...prev, hp: newHp }));

                        if (newHp <= 0) {
                            // VICTORY!
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-201.mp3').play().catch(() => { });
                            setLootDrop({ type: 'gem', amount: 50, rarity: 'legendary', message: 'REAPER DEFEATED!' });

                            // HUGE REWARD
                            change = 50;

                            setBossState(prev => ({ ...prev, active: false }));
                            setTheme('default');
                        } else {
                            // Boss damaged
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-dagger-woosh-1487.mp3').play().catch(() => { });
                            setLootDrop({ type: 'exp', amount: 0, rarity: 'rare', message: 'BOSS HIT! Keep going!' });
                        }
                    } else {
                        // PLAYER TAKES DAMAGE
                        const newPlayerHp = (bossState.playerHp || 3) - 1;
                        setBossState(prev => ({ ...prev, playerHp: newPlayerHp }));

                        if (newPlayerHp <= 0) {
                            // --- DEATH EXECUTION ---
                            setDeathAnim('slash');
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-sword-slash-swoosh-1476.mp3').play().catch(() => { });

                            // Delay reset to show animation
                            setTimeout(() => {
                                setBossState(prev => ({ ...prev, active: false }));
                                setTheme('default');
                                newStreak = 0;
                                setDeathAnim(null);
                            }, 3000);

                            // PUNISHMENT
                            change = -50;
                        } else {
                            // Warning Hit
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
                            setShake(true);
                        }
                    }
                }

                // --- POST-ROULETTE SETTLEMENT ---
                if (rouletteSession) {
                    if (rouletteSession.result === 'safe') {
                        // SURVIVOR: Symmetrical Multiplier
                        change = Math.round(change * rouletteSession.multiplier);
                        if (data.score >= 9.0) {
                            setLootDrop({ type: 'gem', amount: change, rarity: 'legendary', message: `🎰 SURVIVOR JACKPOT x${rouletteSession.multiplier}!` });
                        } else {
                            // Loss also multiplied
                            setLootDrop({ type: 'exp', amount: change, rarity: 'common', message: `🎰 GAMBLE FAILED! x${rouletteSession.multiplier} LOSS` });
                        }
                    } else if (rouletteSession.result === 'dead') {
                        // EXECUTION: Redemption or Double Death
                        if (data.score >= 9.0) {
                            change = 25; // Redemption Reward
                            setLootDrop({ type: 'gem', amount: 25, rarity: 'rare', message: '⚖️ REDEMPTION GRANTED!' });
                        } else {
                            change = -50;
                            setLootDrop({ type: 'exp', amount: -50, rarity: 'common', message: '💀 TOTAL ANNIHILATION!' });
                        }
                    }
                    setRouletteSession(null);
                }

                setEloBreakdown(result.breakdown);

                if (data.score >= 9) {
                    newStreak += 1;
                    if (newStreak >= 3) change += 2;

                    // Fever Logic
                    const newCombo = comboCount + 1;
                    setComboCount(newCombo);
                    if (newCombo >= 3 && !feverMode && mode === 'listening') {
                        setFeverMode(true);
                        setTheme('fever');
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-futuristic-robotic-blip-hit-695.mp3').play().catch(() => { });
                    }

                    // Loot Logic - DISABLED per user request
                    // (Only Boss/Gamble/Damage events trigger notifications now)
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

                // === Elo Update Logic (ALWAYS EXECUTED) ===
                const newElo = Math.max(0, (activeElo || 600) + change);

                // Rank Change Detection
                const oldRank = getRank(activeElo || 600);
                const newRank = getRank(newElo);
                if (newRank.title !== oldRank.title && change > 0) {
                    // Rank UP!
                    setRankUp({ oldRank: oldRank, newRank: newRank });
                    new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3').play().catch(() => { });
                } else if (newRank.title !== oldRank.title && change < 0) {
                    // Rank DOWN!
                    setRankDown({ oldRank: oldRank, newRank: newRank });
                    new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
                }

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

                    // Record in History
                    await db.elo_history.add({
                        mode: isListening ? 'listening' : 'translation',
                        elo: newElo,
                        change: change,
                        timestamp: Date.now()
                    });
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
        if (!drillData || !drillData.reference_english) return;
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
        // Safety check: return empty if text is undefined/null
        if (!text) return null;

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
    };


    // Auto-Mount Generate (WAIT for Elo to be loaded first!)
    useEffect(() => {
        // Only generate when Elo is loaded to ensure correct difficulty
        if (!isEloLoaded) return;

        if (!drillData && !isGeneratingDrill) {
            handleGenerateDrill();

            const roll = Math.random();
            // 2% Chance for Boss (Higher Priority)
            if (roll < 0.02) {
                // Select Boss Type
                const bossRoll = Math.random();
                let type: 'blind' | 'lightning' | 'echo' | 'reaper' = 'blind';

                if (bossRoll < 0.05) type = 'reaper';      // 5%
                else if (bossRoll < 0.35) type = 'echo';     // 30%
                else if (bossRoll < 0.60) type = 'lightning';// 25%
                else type = 'blind';                         // 40%

                setBossState({
                    active: true,
                    introAck: false,
                    type,
                    hp: type === 'reaper' ? 3 : undefined,
                    maxHp: type === 'reaper' ? 3 : undefined
                });
                setTheme('boss');
                setPlaybackSpeed(type === 'blind' ? 1.25 : 1.0); // Only Blind boss needs speed up
            }
            // 5% Chance for Gamble (Exclusive)
            else if (roll < 0.07) {
                setGambleState({ active: true, introAck: false, wager: null, doubleDownCount: 0 });
                setTheme('crimson');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, isEloLoaded]);



    const BOSS_CONFIG = {
        'blind': {
            name: '盲眼聆听者 (BLIND)',
            desc: '原速播放 • 无文本提示',
            icon: EyeOff,
            color: 'text-stone-300',
            bg: 'bg-stone-500',
            style: "bg-[#1a1a1a] border-stone-800 shadow-[0_0_60px_rgba(0,0,0,0.8)] text-stone-300 ring-1 ring-stone-800/50 grayscale",
            introDelay: 2000,
            bgm: '/blind_intro.mp3'
        },
        'lightning': {
            name: '闪电恶魔 (LIGHTNING)',
            desc: '30秒限时 • 1.5倍速挑战',
            icon: Zap,
            color: 'text-amber-400',
            bg: 'bg-amber-500',
            style: "bg-[#2A1B00] border-amber-500/50 shadow-[0_0_80px_rgba(245,158,11,0.3)] text-amber-100 ring-1 ring-amber-500/30",
            introDelay: 2000,
            bgm: '/lightning_intro.mp3'
        },
        'echo': {
            name: '回声巨兽 (ECHO)',
            desc: '只听一次 • 瞬间记忆挑战',
            icon: Volume2,
            color: 'text-cyan-400',
            bg: 'bg-cyan-500',
            style: "bg-[#082f49] border-cyan-500/40 shadow-[0_0_80px_rgba(6,182,212,0.25)] text-cyan-100 ring-1 ring-cyan-500/20",
            introDelay: 2500,
            bgm: 'https://commondatastorage.googleapis.com/codeskulptor-demos/pyman_assets/intromusic.ogg'
        },
        'reaper': {
            name: '死神 (THE REAPER)',
            desc: '3 HP • 死亡凝视 • 错误即死',
            icon: Skull,
            color: 'text-rose-500',
            bg: 'bg-rose-600',
            style: "bg-black border-red-900/60 shadow-[0_0_120px_rgba(225,29,72,0.6)] text-rose-50 ring-2 ring-red-900",
            introDelay: 3000,
            bgm: 'https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/lose.ogg'
        },
        'roulette': {
            name: '幸运转轮 (LUCKY CHAMBER)',
            desc: '1/6 概率死亡 • +20 Elo 奖池',
            icon: Dices,
            color: 'text-emerald-400',
            bg: 'bg-emerald-600',
            style: "bg-[#022c22] border-emerald-500/50 shadow-[0_0_80px_rgba(16,185,129,0.3)] text-emerald-100 ring-1 ring-emerald-500/30",
            introDelay: 1000,
            bgm: '/gamble_intro.mp3'
        },
        'roulette_execution': {
            name: '死刑执行 (EXECUTION)',
            desc: '实弹命中 • 炼狱难度 • 胜者翻倍',
            icon: Skull,
            color: 'text-red-600',
            bg: 'bg-red-700',
            style: "bg-black border-red-600 shadow-[0_0_150px_rgba(220,38,38,0.9)] text-red-500 ring-4 ring-red-600 animate-pulse",
            introDelay: 500,
            bgm: 'https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/lose.ogg'
        }
    } as const;

    const currentBoss = BOSS_CONFIG[bossState.type] || BOSS_CONFIG['blind'];



    return (
        <AnimatePresence mode="wait">
            <motion.div
                key="drill-core"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                    "fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 transition-colors duration-1000",
                    theme === 'default' ? "bg-black/40 backdrop-blur-sm" : "bg-transparent",
                    shake && "animate-shake"
                )}
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
                                className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0f0a1a] to-[#1a0a0a]"
                            >
                                {/* Animated gradient orbs */}
                                <motion.div
                                    className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-[120px]"
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                />
                                <motion.div
                                    className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-fuchsia-500/15 rounded-full blur-[100px]"
                                    animate={{ scale: [1.2, 1, 1.2], opacity: [0.15, 0.3, 0.15] }}
                                    transition={{ duration: 4, repeat: Infinity }}
                                />
                                <motion.div
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px]"
                                    animate={{ scale: [1, 1.3, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                />

                                {/* Grid overlay */}
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />

                                {/* Top neon line */}
                                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_30px_rgba(249,115,22,0.8),0_0_60px_rgba(249,115,22,0.4)]" />
                                {/* Bottom neon line */}
                                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent shadow-[0_0_30px_rgba(245,158,11,0.8)]" />
                                {/* Side glow */}
                                <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-orange-500/50 to-transparent" />
                                <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-amber-500/50 to-transparent" />
                            </motion.div>
                        )}
                        {theme === 'crimson' && (
                            <motion.div
                                key="theme-crimson"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1 }}
                                className="absolute inset-0 bg-[#2b0a0a]"
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(220,38,38,0.15),transparent_70%)] animate-pulse" />
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-600 to-transparent shadow-[0_0_30px_rgba(220,38,38,0.6)]" />
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
                        {theme === 'default' && (
                            <motion.div
                                key="theme-default"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.8 }}
                                className="absolute inset-0 bg-gradient-to-br from-slate-100 via-stone-50 to-blue-50"
                            >
                                {/* Animated gradient orbs - soft pastel */}
                                <motion.div
                                    className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-300/30 rounded-full blur-[150px]"
                                    animate={{ scale: [1, 1.15, 1], x: [0, 20, 0], y: [0, -20, 0] }}
                                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                                />
                                <motion.div
                                    className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-300/25 rounded-full blur-[120px]"
                                    animate={{ scale: [1.1, 1, 1.1], x: [0, -15, 0], y: [0, 15, 0] }}
                                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                                />
                                <motion.div
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-amber-200/20 rounded-full blur-[100px]"
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                                />

                                {/* Subtle grid pattern */}
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />

                                {/* Noise texture for glass effect */}
                                <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%274%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E')]" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <motion.div
                    layout
                    className={cn(
                        "relative w-full max-w-5xl h-[85vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-700",
                        theme === 'fever' ? "bg-[#0a0a12]/95 backdrop-blur-xl border border-orange-500/40 shadow-[0_0_80px_rgba(249,115,22,0.15),0_0_40px_rgba(251,146,60,0.1)] text-white ring-1 ring-orange-500/20" :
                            theme === 'boss' ? currentBoss.style :
                                theme === 'crimson' ? "bg-[#1a0505]/95 border border-red-500/30 shadow-[0_0_60px_rgba(220,38,38,0.2)] text-red-50" :
                                    "bg-white/70 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-white/30",
                        shake && "animate-shake"
                    )}
                >
                    {/* Crimson Hellfire Overlay */}
                    {theme === 'crimson' && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                            {/* Pulse Vignette */}
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(50,0,0,0.4)_100%)] animate-pulse" />
                            {/* Rising Embers */}
                            {[...Array(8)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute w-1 h-1 bg-red-500 rounded-full blur-[1px]"
                                    initial={{ top: '100%', left: `${Math.random() * 100}%`, opacity: 0, scale: 0 }}
                                    animate={{ top: '-10%', opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                                    transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2, ease: "easeOut" }}
                                />
                            ))}
                        </div>
                    )}
                    {/* Fever Overlay Particles - Fire Embers Rising */}
                    {theme === 'fever' && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                            {/* Rising embers */}
                            {[...Array(12)].map((_, i) => (
                                <motion.div
                                    key={`ember-${i}`}
                                    className="absolute w-1.5 h-1.5 rounded-full"
                                    style={{
                                        left: `${5 + Math.random() * 90}%`,
                                        background: `radial-gradient(circle, ${['#f97316', '#fb923c', '#fbbf24', '#f59e0b'][i % 4]}, transparent)`
                                    }}
                                    initial={{ bottom: -20, opacity: 0, scale: 0 }}
                                    animate={{
                                        bottom: '110%',
                                        opacity: [0, 0.8, 0.6, 0],
                                        scale: [0, 1.2, 0.8, 0],
                                        x: [0, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 60]
                                    }}
                                    transition={{
                                        duration: 3 + Math.random() * 2,
                                        repeat: Infinity,
                                        delay: Math.random() * 3,
                                        ease: "easeOut"
                                    }}
                                />
                            ))}
                            {/* Floating sparks */}
                            {[...Array(6)].map((_, i) => (
                                <motion.div
                                    key={`spark-${i}`}
                                    className="absolute w-0.5 h-0.5 bg-yellow-400 rounded-full shadow-[0_0_6px_rgba(250,204,21,0.8)]"
                                    style={{ left: `${10 + Math.random() * 80}%`, top: `${20 + Math.random() * 60}%` }}
                                    animate={{
                                        opacity: [0, 1, 0],
                                        scale: [0, 1.5, 0]
                                    }}
                                    transition={{
                                        duration: 1 + Math.random(),
                                        repeat: Infinity,
                                        delay: Math.random() * 2
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* FEVER STREAK BAR (The Fire Progress) */}
                    {theme === 'fever' && currentStreak >= 2 && (
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-stone-900/50 z-50 overflow-hidden">
                            <motion.div
                                className="h-full bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-400 relative"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(currentStreak * 10, 100)}%` }}
                                transition={{ type: "spring", stiffness: 100, damping: 15 }}
                            >
                                {/* Glow effect */}
                                <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 blur-sm opacity-80" />
                                {/* Sparkle at end */}
                                <motion.div
                                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full blur-[2px]"
                                    animate={{ opacity: [0.6, 1, 0.6], scale: [0.8, 1.2, 0.8] }}
                                    transition={{ duration: 0.8, repeat: Infinity }}
                                />
                            </motion.div>
                            {/* Streak count badge */}
                            <motion.div
                                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold text-amber-300"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                            >
                                <Flame className="w-3 h-3 fill-amber-400 text-amber-300" />
                                <span className="font-mono">{currentStreak}</span>
                            </motion.div>
                        </div>
                    )}

                    {/* BOSS FUSE (The Burning Wick) */}
                    {theme === 'boss' && (
                        <div className="absolute top-0 left-0 right-0 h-2 bg-stone-900 z-50">
                            <motion.div
                                className="h-full bg-gradient-to-r from-amber-600 via-orange-500 to-yellow-400 shadow-[0_0_20px_rgba(245,158,11,0.8)] relative"
                                style={{ width: `${fuseTime}%` }}
                            >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-white rounded-full blur-[2px] animate-pulse" />
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 bg-orange-500/50 rounded-full blur-xl animate-pulse" />
                            </motion.div>
                        </div>
                    )}

                    {/* Recording indicator - simplified */}
                    <AnimatePresence>
                        {whisperRecording && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-full shadow-lg"
                            >
                                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                <span className="text-sm font-bold">Recording...</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {/* Header - Compact Info Bar */}
                    <div className="flex items-center justify-between p-3 md:p-4 border-b border-stone-100/50 shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Unified Info Pill */}
                            {drillData && (
                                <div className="flex items-center bg-white/80 backdrop-blur-md rounded-full border border-stone-200 shadow-sm overflow-hidden">
                                    {/* Rank Section */}
                                    {(() => {
                                        const rank = getRank(currentElo || 600);
                                        return bossState.type === 'roulette_execution' ? (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/80 text-red-200">
                                                <Skull className="w-3.5 h-3.5 text-red-400" />
                                                <span className="font-bold text-[10px] tracking-wider uppercase">处决模式</span>
                                            </div>
                                        ) : rouletteSession?.result === 'safe' ? (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/80 text-amber-200">
                                                <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                                <span className="font-bold text-[10px] tracking-wider uppercase">x{rouletteSession.multiplier}</span>
                                            </div>
                                        ) : (
                                            <div className={cn("flex items-center gap-1.5 px-3 py-1.5", rank.color)}>
                                                <rank.icon className="w-3.5 h-3.5" />
                                                <span className="font-bold text-[10px] tracking-wider uppercase">{rank.title}</span>
                                                <div className="w-px h-3 bg-current opacity-20" />
                                                <span className="font-newsreader font-medium italic text-sm">{currentElo || 600}</span>
                                            </div>
                                        );
                                    })()}

                                    {/* Difficulty Section */}
                                    {drillData?._difficultyMeta && (
                                        <>
                                            <div className="w-px h-5 bg-stone-200" />
                                            <div className={cn(
                                                "flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider",
                                                drillData._difficultyMeta.status === 'MATCHED'
                                                    ? "text-emerald-600 bg-emerald-50/50"
                                                    : drillData._difficultyMeta.status === 'TOO_EASY'
                                                        ? "text-amber-600 bg-amber-50/50"
                                                        : "text-rose-600 bg-rose-50/50"
                                            )}>
                                                <span className="font-mono">{drillData._difficultyMeta.tier}</span>
                                                <span className="opacity-40">|</span>
                                                <span>{drillData._difficultyMeta.actualWordCount}词</span>
                                            </div>
                                        </>
                                    )}

                                    {/* Topic Section */}
                                    {drillData?._topicMeta && (
                                        <>
                                            <div className="w-px h-5 bg-stone-200" />
                                            <div className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-blue-600 bg-blue-50/50">
                                                <span>📌</span>
                                                <span className="max-w-[120px] truncate">{drillData._topicMeta.topic}</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Streak Counter - Separate for emphasis */}
                            {currentStreak >= 2 && (
                                <div className={cn(
                                    "flex items-center gap-1 px-2.5 py-1 rounded-full border font-bold text-[10px] tracking-wider transition-all",
                                    currentStreak >= 10
                                        ? "bg-gradient-to-r from-orange-500/20 via-red-500/20 to-amber-500/20 border-orange-400/50 text-orange-400"
                                        : currentStreak >= 5
                                            ? "bg-amber-500/20 border-amber-400/50 text-amber-400"
                                            : "bg-orange-50/80 border-orange-200 text-orange-500"
                                )}>
                                    <Flame className={cn(
                                        "w-3 h-3",
                                        currentStreak >= 5 ? "fill-current" : "fill-orange-400"
                                    )} />
                                    <span className="font-mono tabular-nums">{currentStreak}连</span>
                                </div>
                            )}
                        </div>
                        {/* Teaching Mode Button - Only for Translation */}
                        {mode === 'translation' && (
                            <button
                                onClick={() => {
                                    if (!teachingMode) {
                                        // First time enabling: turn on and auto-fetch if drill exists
                                        setTeachingMode(true);
                                        if (drillData && drillData.chinese && drillData.reference_english && !teachingData && !isLoadingTeaching) {
                                            setIsLoadingTeaching(true);
                                            fetch('/api/ai/teach', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    chinese: drillData.chinese,
                                                    reference_english: drillData.reference_english,
                                                    elo: eloRating || 600,
                                                }),
                                            })
                                                .then(r => r.json())
                                                .then(d => { if (!d.error) setTeachingData(d); })
                                                .catch(() => { })
                                                .finally(() => setIsLoadingTeaching(false));
                                        }
                                        setTeachingPanelOpen(true);
                                    } else {
                                        // Toggle panel open/close
                                        setTeachingPanelOpen(!teachingPanelOpen);
                                    }
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all border ml-2",
                                    teachingMode && teachingPanelOpen
                                        ? "bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm"
                                        : teachingMode
                                            ? "bg-indigo-50/50 border-indigo-100 text-indigo-400 hover:text-indigo-600"
                                            : "bg-stone-50 border-stone-200 text-stone-400 hover:text-stone-600 hover:border-stone-300"
                                )}
                                title={teachingPanelOpen ? '收起教学面板' : '打开教学面板'}
                            >
                                <BookOpen className="w-3 h-3" />
                                <span>教学</span>
                                {teachingMode && (
                                    <div className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        isLoadingTeaching ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                                    )} />
                                )}
                            </button>
                        )}
                        {onClose && (
                            <button onClick={onClose} className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition-all group ml-2">
                                <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
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
                    <div className="flex-1 relative overflow-y-auto flex flex-col">

                        {/* Scoring Flip Card Animation */}
                        <ScoringFlipCard
                            isScoring={isSubmittingDrill && !drillFeedback}
                            userAnswer={userTranslation}
                            mode={mode}
                        />


                        {isGeneratingDrill && !drillData ? (
                            <div className="h-full flex flex-col items-center justify-center relative overflow-hidden">
                                {/* Gradient Background */}
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/50" />

                                {/* Floating Orbs */}
                                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                    <motion.div
                                        className="absolute w-64 h-64 rounded-full bg-gradient-to-br from-indigo-200/30 to-purple-200/30 blur-3xl"
                                        animate={{ x: [0, 50, 0], y: [0, -30, 0] }}
                                        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                                        style={{ top: '10%', left: '10%' }}
                                    />
                                    <motion.div
                                        className="absolute w-48 h-48 rounded-full bg-gradient-to-br from-purple-200/30 to-pink-200/30 blur-3xl"
                                        animate={{ x: [0, -40, 0], y: [0, 40, 0] }}
                                        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                                        style={{ bottom: '20%', right: '15%' }}
                                    />
                                </div>

                                {/* Main Content */}
                                <div className="relative z-10 flex flex-col items-center space-y-8">
                                    {/* Audio Waveform Animation */}
                                    <div className="flex items-end justify-center gap-1.5 h-20">
                                        {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6, 0.3, 0.7, 0.5, 0.8, 0.4].map((intensity, i) => (
                                            <motion.div
                                                key={i}
                                                className="w-2 rounded-full bg-gradient-to-t from-indigo-600 to-purple-500 shadow-lg shadow-indigo-500/30"
                                                animate={{
                                                    height: [8, 60 * intensity, 8],
                                                    opacity: [0.5, 1, 0.5]
                                                }}
                                                transition={{
                                                    duration: 0.8 + (i * 0.05),
                                                    repeat: Infinity,
                                                    ease: "easeInOut",
                                                    delay: i * 0.08
                                                }}
                                            />
                                        ))}
                                    </div>

                                    {/* Loading Text */}
                                    <div className="text-center space-y-2">
                                        <p className="text-stone-700 font-medium text-lg">
                                            {mode === "translation" ? "正在生成句子..." : "正在准备音频..."}
                                        </p>
                                        <p className="text-stone-400 text-sm">
                                            {mode === "translation" ? "Crafting your phrase" : "Preparing audio stream"}
                                        </p>
                                    </div>

                                    {/* Progress Dots */}
                                    <div className="flex items-center gap-2">
                                        {[0, 1, 2].map((i) => (
                                            <motion.div
                                                key={i}
                                                className="w-2 h-2 rounded-full bg-indigo-500"
                                                animate={{
                                                    scale: [1, 1.5, 1],
                                                    opacity: [0.3, 1, 0.3]
                                                }}
                                                transition={{
                                                    duration: 1.2,
                                                    repeat: Infinity,
                                                    delay: i * 0.3
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : drillData ? (
                            <AnimatePresence mode="popLayout" initial={false}>
                                {!drillFeedback ? (
                                    <motion.div key="question" initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="absolute inset-0 overflow-hidden p-6 md:p-8 flex flex-col">
                                        <div className="max-w-3xl mx-auto w-full space-y-4">
                                            {/* Source / Listening Area */}
                                            <div className="space-y-6 text-center w-full">
                                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative flex flex-col items-center gap-6 w-full">
                                                    {mode === "listening" ? (
                                                        <div className="w-full flex flex-col items-center justify-center relative">
                                                            {/* Big Play Button */}
                                                            <button
                                                                onClick={playAudio}
                                                                disabled={isPlaying || isAudioLoading || (bossState.active && bossState.type === 'echo' && hasPlayedEchoRef.current)}
                                                                className={cn(
                                                                    "group relative w-24 h-24 flex items-center justify-center transition-all duration-500 mb-8 mt-4",
                                                                    (bossState.active && bossState.type === 'echo' && hasPlayedEchoRef.current)
                                                                        ? "grayscale opacity-50 cursor-not-allowed scale-95"
                                                                        : "hover:scale-105 active:scale-95 disabled:opacity-80 disabled:scale-100"
                                                                )}
                                                            >
                                                                <div className={cn("absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-2xl transition-all duration-500", isPlaying ? "scale-125 opacity-100" : "scale-100 opacity-0 group-hover:opacity-100")} />
                                                                <div className="absolute inset-0 rounded-full bg-white/60 dark:bg-white/10 backdrop-blur-2xl border border-white/50 dark:border-white/20 shadow-2xl shadow-indigo-500/10 transition-all duration-300 group-hover:bg-white/80 group-hover:border-white" />
                                                                <div className="relative z-10 text-indigo-600 dark:text-indigo-300 drop-shadow-sm flex items-center justify-center">
                                                                    {(isPrefetching || isAudioLoading) ? (
                                                                        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                                                    ) : isPlaying ? (
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
                                                                            <div className="w-px h-5 bg-stone-300 mx-2" />

                                                                            {/* Engine Mode with Status Indicator */}
                                                                            <button
                                                                                onClick={() => setEngineMode(engineMode === 'fast' ? 'precise' : 'fast')}
                                                                                className={cn(
                                                                                    "relative px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all text-nowrap border",
                                                                                    engineMode === 'fast'
                                                                                        ? "text-amber-600 bg-amber-100/50 hover:bg-amber-100 border-amber-200"
                                                                                        : "text-emerald-600 bg-emerald-100/50 hover:bg-emerald-100 border-emerald-200"
                                                                                )}
                                                                                title={`${engineMode === 'fast' ? 'Fast Mode' : 'Pro Mode'} • ${serverStatus === 'online' ? 'Local Whisper Ready' : 'Using Cloud'}`}
                                                                            >
                                                                                {/* Status Dot */}
                                                                                <div className={cn(
                                                                                    "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white",
                                                                                    serverStatus === 'online' ? "bg-emerald-500" : "bg-rose-500"
                                                                                )} />
                                                                                {engineMode === 'fast' ? <Zap className="w-3 h-3" /> : <BrainCircuit className="w-3 h-3" />}
                                                                                {engineMode === 'fast' ? "FAST" : "PRO"}
                                                                            </button>

                                                                            <div className="w-px h-5 bg-stone-300 mx-2" />

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

                                                            {/* Reaper HP or Fuse Timer based on Boss Type */}
                                                            {(bossState.active || gambleState.active) && (
                                                                <div className="flex justify-center mb-0"> { /* Moved down for visibility */}
                                                                    {bossState.type === 'reaper' ? (
                                                                        <div className="flex gap-8 items-center animate-in fade-in slide-in-from-top-4">
                                                                            {/* PLAYER HP (Left) */}
                                                                            <div className="flex gap-2 items-center bg-stone-900/40 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                                                                                <span className="text-xs font-bold text-stone-400 mr-2">YOU</span>
                                                                                {[...Array(bossState.playerMaxHp || 3)].map((_, i) => (
                                                                                    <motion.div
                                                                                        key={`p-${i}`}
                                                                                        initial={{ scale: 0 }}
                                                                                        animate={{
                                                                                            scale: i < (bossState.playerHp || 0) ? 1 : 0.8,
                                                                                            opacity: i < (bossState.playerHp || 0) ? 1 : 0.2,
                                                                                            filter: i < (bossState.playerHp || 0) ? 'grayscale(0%)' : 'grayscale(100%)'
                                                                                        }}
                                                                                    >
                                                                                        <Heart className={cn(
                                                                                            "w-6 h-6",
                                                                                            i < (bossState.playerHp || 0) ? "fill-emerald-500 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "text-stone-700"
                                                                                        )} />
                                                                                    </motion.div>
                                                                                ))}
                                                                            </div>

                                                                            <div className="text-xl font-black text-white/20 italic">VS</div>

                                                                            {/* BOSS HP (Right) */}
                                                                            <div className="flex gap-2 items-center bg-black/60 px-4 py-2 rounded-full border border-red-900/60 backdrop-blur-md shadow-[0_0_30px_rgba(220,38,38,0.2)]">
                                                                                {[...Array(bossState.maxHp || 3)].map((_, i) => (
                                                                                    <motion.div
                                                                                        key={`b-${i}`}
                                                                                        initial={{ scale: 0 }}
                                                                                        animate={{
                                                                                            scale: i < (bossState.hp || 0) ? 1 : 0.8,
                                                                                            opacity: i < (bossState.hp || 0) ? 1 : 0.2,
                                                                                            filter: i < (bossState.hp || 0) ? 'grayscale(0%)' : 'grayscale(100%)'
                                                                                        }}
                                                                                    >
                                                                                        <Heart className={cn(
                                                                                            "w-6 h-6",
                                                                                            i < (bossState.hp || 0) ? "fill-red-600 text-red-500 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]" : "text-stone-800"
                                                                                        )} />
                                                                                    </motion.div>
                                                                                ))}
                                                                                <span className="text-xs font-bold text-red-500 ml-2">REAPER</span>
                                                                            </div>
                                                                        </div>
                                                                    ) : (bossState.type === 'lightning' || gambleState.active) ? (
                                                                        // Standard Fuse Timer (Lightning ONLY / Gamble)
                                                                        <div className="flex items-center gap-3 bg-stone-900/80 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                                                                            <div className={cn("text-xs font-bold uppercase tracking-widest",
                                                                                theme === 'boss' ? "text-amber-400" : "text-red-400"
                                                                            )}>
                                                                                {theme === 'boss' ? "BOSS FUSE" : "DEATH FUSE"}
                                                                            </div>
                                                                            <div className="w-32 h-2 bg-stone-800 rounded-full overflow-hidden">
                                                                                <div
                                                                                    className={cn("h-full transition-all duration-100 ease-linear",
                                                                                        theme === 'boss' ? "bg-amber-500" : "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]"
                                                                                    )}
                                                                                    style={{ width: `${Math.min(100, fuseTime)}%` }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            )}


                                                            {/* Sleek Slider */}


                                                            {/* Text Reveal / Hint Area - Check Manual Toggle OR Boss Force */}
                                                            {!((bossState.active && bossState.type === 'blind') || isBlindMode) ? (
                                                                <div className="relative w-full max-w-4xl mx-auto px-4 pt-12 pb-8 animate-in fade-in zoom-in-95 duration-500">
                                                                    <div className="text-center font-newsreader italic text-2xl md:text-3xl leading-relaxed text-stone-800 tracking-wide selection:bg-indigo-100">
                                                                        {((gambleState.active && gambleState.wager !== 'safe')) && !isSubmittingDrill ? (
                                                                            <div className={cn(
                                                                                "flex flex-col items-center gap-4 py-8 animate-pulse",
                                                                                theme === 'boss' ? "text-amber-500/50" : "text-red-500/50"
                                                                            )}>
                                                                                {theme === 'boss' ? <Headphones className="w-8 h-8 opacity-50" /> : <Dices className="w-8 h-8 opacity-50" />}
                                                                                <span className="text-sm font-mono tracking-[0.2em] uppercase">
                                                                                    {theme === 'boss' ? "Audio Stream Encryption Active" : "HIGH STAKES // BLIND BET"}
                                                                                </span>
                                                                                <div className="flex gap-1 mt-2">
                                                                                    {[...Array(3)].map((_, i) => (
                                                                                        <div key={i} className={cn("w-2 h-2 rounded-full animate-bounce", theme === 'boss' ? "bg-amber-500/30" : "bg-red-500/30")} style={{ animationDelay: `${i * 0.1}s` }} />
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ) : renderInteractiveText(drillData.reference_english)}
                                                                    </div>
                                                                    {showChinese && <p className="mt-4 text-stone-500 text-lg text-center font-medium animate-in fade-in slide-in-from-top-2">{drillData.chinese}</p>}
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
                                                            <h3 className="text-2xl md:text-4xl font-newsreader font-medium text-stone-900 leading-normal text-center max-w-4xl">
                                                                {drillData.chinese}
                                                            </h3>

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

                                            {/* Teaching Card removed - now in floating panel */}

                                            {/* Interactive Area */}

                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="w-full space-y-6">
                                                <div className="relative group">
                                                    {mode === "listening" ? (
                                                        <div className="flex flex-col items-center justify-center gap-4 py-2">
                                                            {whisperProcessing ? (
                                                                <div className="flex items-center gap-3 px-6 py-3 bg-indigo-50 rounded-full">
                                                                    <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
                                                                    <span className="text-indigo-600 font-bold text-sm">Transcribing...</span>
                                                                </div>
                                                            ) : whisperRecording ? (
                                                                /* Recording State - Compact horizontal layout */
                                                                <div className="flex items-center gap-4 px-6 py-3 bg-white/80 backdrop-blur-sm border border-stone-200 rounded-2xl shadow-sm">
                                                                    {/* Mini Waveform */}
                                                                    <div className="flex items-center gap-0.5 h-6">
                                                                        {[...Array(8)].map((_, i) => (
                                                                            <motion.div
                                                                                key={i}
                                                                                className="w-1 rounded-full bg-rose-500"
                                                                                animate={{
                                                                                    height: [4, 12 + Math.random() * 8, 4],
                                                                                }}
                                                                                transition={{
                                                                                    duration: 0.4 + Math.random() * 0.2,
                                                                                    repeat: Infinity,
                                                                                    delay: i * 0.05
                                                                                }}
                                                                            />
                                                                        ))}
                                                                    </div>

                                                                    {/* Real-time text */}
                                                                    <p className="text-base font-newsreader text-stone-700 min-w-[150px] max-w-[300px] truncate">
                                                                        {whisperResult.text || <span className="text-stone-400 italic">Listening...</span>}
                                                                    </p>

                                                                    {/* Stop Button */}
                                                                    <button
                                                                        onClick={stopRecognition}
                                                                        className="w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center shadow-md transition-all hover:scale-105 active:scale-95 shrink-0"
                                                                    >
                                                                        <div className="w-4 h-4 bg-white rounded-sm" />
                                                                    </button>
                                                                </div>
                                                            ) : whisperResult.text ? (
                                                                /* Has Result - Compact confirm/retry */
                                                                <div className="flex items-center gap-3 px-4 py-3 bg-white/80 backdrop-blur-sm border border-stone-200 rounded-2xl shadow-sm">
                                                                    {/* Result text */}
                                                                    <p className="text-base font-newsreader text-stone-800 max-w-[250px]">
                                                                        {whisperResult.text}
                                                                    </p>

                                                                    {/* Action Buttons */}
                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                        <button
                                                                            onClick={startRecognition}
                                                                            className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-all"
                                                                            title="Re-record"
                                                                        >
                                                                            <RefreshCw className="w-4 h-4 text-stone-600" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                setUserTranslation(whisperResult.text);
                                                                                handleSubmitDrill();
                                                                            }}
                                                                            disabled={isSubmittingDrill}
                                                                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold text-sm shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                                                        >
                                                                            {isSubmittingDrill ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                                                            {isSubmittingDrill ? "..." : "Submit"}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                /* Idle State - Smaller mic button */
                                                                <motion.button
                                                                    onClick={startRecognition}
                                                                    whileHover={{ scale: 1.08 }}
                                                                    whileTap={{ scale: 0.95 }}
                                                                    className="relative flex items-center gap-3 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full shadow-lg shadow-indigo-500/25 transition-all"
                                                                >
                                                                    {/* Pulse ring */}
                                                                    <motion.div
                                                                        className="absolute inset-0 rounded-full bg-indigo-500/20"
                                                                        animate={{ scale: [1, 1.15], opacity: [0.4, 0] }}
                                                                        transition={{ duration: 1.5, repeat: Infinity }}
                                                                    />
                                                                    <Mic className="w-5 h-5 text-white relative z-10" />
                                                                    <span className="text-white font-bold text-sm relative z-10">Tap to Record</span>
                                                                </motion.button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {/* Premium Neumorphic Input Container */}
                                                            <div className="relative group transition-all duration-500 bg-white/80 dark:bg-black/40 backdrop-blur-2xl border-2 border-white/60 dark:border-white/10 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus-within:border-indigo-200 focus-within:shadow-[0_10px_40px_rgba(99,102,241,0.1),inset_0_1px_0_rgba(255,255,255,1)] overflow-hidden">
                                                                {/* Subtle inner noise texture */}
                                                                <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E')] pointer-events-none" />
                                                                <GhostTextarea
                                                                    value={userTranslation}
                                                                    onChange={setUserTranslation}
                                                                    placeholder="Type your English translation here..."
                                                                    predictionWordCount={2}
                                                                    getPrediction={(current) => {
                                                                        // Provide predicting hint based on actual reference answer
                                                                        if (drillData?.reference_english && drillData.reference_english.toLowerCase().startsWith(current.toLowerCase())) {
                                                                            return drillData.reference_english;
                                                                        }
                                                                        return "";
                                                                    }}
                                                                    disabled={isSubmittingDrill}
                                                                />

                                                                {/* Bottom toolbar */}
                                                                <div className="relative z-10 flex items-center justify-between px-6 pb-5 pt-0">
                                                                    {/* Word count badge */}
                                                                    <div className={cn(
                                                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-sans tracking-wide transition-all duration-300",
                                                                        userTranslation.trim()
                                                                            ? "bg-stone-100/90 text-stone-500 shadow-sm border border-stone-200/50"
                                                                            : "bg-transparent text-stone-300"
                                                                    )}>
                                                                        <span className="tabular-nums">{userTranslation.trim() ? userTranslation.trim().split(/\s+/).length : 0}</span>
                                                                        <span>WORDS</span>
                                                                    </div>

                                                                    {/* Action buttons */}
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={handleMagicHint}
                                                                            className="h-10 px-4 rounded-full bg-amber-50/80 text-amber-600 hover:bg-amber-100 hover:text-amber-700 flex items-center gap-1.5 transition-all font-bold text-xs border border-amber-200/50 hover:border-amber-300/70 hover:shadow-sm active:scale-95"
                                                                            title="Auto-Complete Hint"
                                                                        >
                                                                            <Wand2 className="w-4 h-4" /> Hint
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setIsTutorOpen(!isTutorOpen)}
                                                                            className="w-10 h-10 rounded-full bg-stone-50/80 text-stone-400 hover:bg-indigo-50 hover:text-indigo-500 flex items-center justify-center transition-all border border-stone-200/50 hover:border-indigo-200/70 active:scale-95"
                                                                            title="Ask AI Tutor"
                                                                        >
                                                                            <HelpCircle className="w-4 h-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={handleSubmitDrill}
                                                                            disabled={!userTranslation.trim() || isSubmittingDrill}
                                                                            className={cn(
                                                                                "h-10 px-6 rounded-full font-bold text-xs flex items-center gap-2 transition-all active:scale-95",
                                                                                "disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100",
                                                                                userTranslation.trim() && !isSubmittingDrill
                                                                                    ? "bg-gradient-to-r from-stone-800 to-stone-900 border border-stone-600/50 text-white shadow-lg shadow-stone-900/20 hover:shadow-xl hover:shadow-stone-900/30 hover:-translate-y-0.5"
                                                                                    : "bg-stone-200 text-stone-400 border border-stone-300/50"
                                                                            )}
                                                                        >
                                                                            {isSubmittingDrill ? <Sparkles className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                                            {isSubmittingDrill ? "评分中..." : "Check"}
                                                                        </button>
                                                                    </div>
                                                                </div>
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
                                    <AnimatePresence mode="wait">
                                        {(bossState.active || (gambleState.active && gambleState.introAck)) ? (
                                            <BossScoreReveal
                                                key="boss-feedback"
                                                score={drillFeedback.score}
                                                drift={0}
                                                type={gambleState.active ? 'gamble' : bossState.type as any}
                                                onNext={() => {
                                                    // Reset Gamble State if finished (Loss or Max Win)
                                                    if (gambleState.active && (drillFeedback.score < 9.0 || gambleState.doubleDownCount >= 2)) {
                                                        setGambleState({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
                                                        setTheme('default');
                                                    }
                                                    handleGenerateDrill();
                                                }}
                                                onRetry={gambleState.active ? undefined : () => {
                                                    setDrillFeedback(null);
                                                    setUserTranslation("");
                                                    setIsSubmittingDrill(false);
                                                    setWordPopup(null);
                                                }}
                                            />
                                        ) : (
                                            <motion.div key="feedback" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-48">
                                                {/* Error State: Show retry when API fails */}
                                                {drillFeedback._error ? (
                                                    <div className="flex flex-col items-center justify-center gap-4 py-16">
                                                        <div className="text-4xl">⚠️</div>
                                                        <p className="text-stone-600 font-medium text-center">评分服务暂时不可用</p>
                                                        <p className="text-stone-400 text-sm text-center">AI 接口超时，请重试</p>
                                                        <button
                                                            onClick={() => {
                                                                setDrillFeedback(null);
                                                                setIsSubmittingDrill(false);
                                                                handleSubmitDrill();
                                                            }}
                                                            className="mt-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-lg transition-all"
                                                        >
                                                            重新评分
                                                        </button>
                                                    </div>
                                                ) : (
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
                                                                        const rank = getRank(currentElo || 600);
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
                                                                        <motion.div
                                                                            initial={{ scale: 0.8, opacity: 0 }}
                                                                            animate={{ scale: 1, opacity: 1 }}
                                                                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                                                            className={cn(
                                                                                "px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 shadow-md border transition-all hover:scale-105",
                                                                                eloBreakdown?.streakBonus
                                                                                    ? "bg-gradient-to-r from-orange-500/90 via-amber-500/90 to-orange-500/90 text-white border-orange-400/50 shadow-orange-500/40 shadow-lg"
                                                                                    : eloChange > 0
                                                                                        ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                                                                        : "bg-rose-50 text-rose-600 border-rose-100"
                                                                            )}
                                                                        >
                                                                            <TrendingUp className={cn("w-4 h-4", eloChange < 0 && "rotate-180")} />
                                                                            <span>{eloChange > 0 ? "+" : ""}{eloChange} Elo</span>

                                                                            {/* Streak Bonus Fire Effect */}
                                                                            {eloBreakdown?.streakBonus && (
                                                                                <motion.div
                                                                                    className="flex items-center gap-1 ml-1 pl-2 border-l border-white/30"
                                                                                    animate={{ scale: [1, 1.1, 1] }}
                                                                                    transition={{ repeat: Infinity, duration: 0.8 }}
                                                                                >
                                                                                    <Flame className="w-4 h-4 fill-yellow-300 text-yellow-200" />
                                                                                    <span className="text-yellow-100 font-black">+{eloBreakdown.bonusChange}</span>
                                                                                </motion.div>
                                                                            )}
                                                                        </motion.div>

                                                                        {/* Streak Glow Effect */}
                                                                        {eloBreakdown?.streakBonus && (
                                                                            <motion.div
                                                                                className="absolute inset-0 rounded-full bg-gradient-to-r from-orange-500/30 via-amber-400/30 to-orange-500/30 blur-xl -z-10"
                                                                                animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.1, 1] }}
                                                                                transition={{ repeat: Infinity, duration: 1.5 }}
                                                                            />
                                                                        )}

                                                                        {/* Hover Breakdown */}
                                                                        {eloBreakdown && (
                                                                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 bg-white rounded-xl shadow-xl border border-stone-100 p-3 opacity-0 group-hover/breakdown:opacity-100 transition-opacity pointer-events-none z-50 text-xs">
                                                                                <div className="space-y-1.5 ">
                                                                                    <div className="flex justify-between text-stone-500">
                                                                                        <span>Base Performance</span>
                                                                                        <span className="font-mono font-bold">{eloBreakdown.baseChange > 0 ? "+" : ""}{eloBreakdown.baseChange}</span>
                                                                                    </div>
                                                                                    {eloBreakdown.streakBonus && (
                                                                                        <div className="flex justify-between text-orange-500 font-bold bg-orange-50 px-2 py-1 rounded-lg -mx-1">
                                                                                            <span className="flex items-center gap-1"><Flame className="w-3 h-3 fill-orange-400" /> 连胜加成</span>
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
                                                            ) : null}
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
                                                                <div className="mt-4">
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

                                                            {/* Teaching Mode: Error Analysis */}
                                                            {teachingMode && drillFeedback.error_analysis && drillFeedback.error_analysis.length > 0 && (
                                                                <div className="mt-5">
                                                                    <h4 className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                                        <AlertTriangle className="w-3 h-3" /> 错误精讲
                                                                    </h4>
                                                                    <div className="space-y-2.5">
                                                                        {drillFeedback.error_analysis.map((err: any, i: number) => (
                                                                            <div key={i} className="bg-rose-50/60 border border-rose-100/50 rounded-xl p-3 space-y-1.5">
                                                                                <div className="flex items-start gap-2">
                                                                                    <span className="text-xs px-1.5 py-0.5 rounded bg-rose-200/60 text-rose-700 font-bold shrink-0">错误</span>
                                                                                    <span className="text-sm text-stone-600 line-through">{err.error}</span>
                                                                                </div>
                                                                                <div className="flex items-start gap-2">
                                                                                    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-200/60 text-emerald-700 font-bold shrink-0">正确</span>
                                                                                    <span className="text-sm text-stone-800 font-medium">{err.correction}</span>
                                                                                </div>
                                                                                <div className="text-xs text-stone-500 pl-1 border-l-2 border-amber-300 ml-1">
                                                                                    📘 <strong>规则：</strong>{err.rule}
                                                                                </div>
                                                                                {err.tip && (
                                                                                    <div className="text-xs text-indigo-600 bg-indigo-50/50 rounded-lg px-2 py-1">
                                                                                        💡 {err.tip}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Teaching Mode: Similar Patterns */}
                                                            {teachingMode && drillFeedback.similar_patterns && drillFeedback.similar_patterns.length > 0 && (
                                                                <div className="mt-5">
                                                                    <h4 className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                                        <BrainCircuit className="w-3 h-3" /> 举一反三
                                                                    </h4>
                                                                    <div className="space-y-2">
                                                                        {drillFeedback.similar_patterns.map((pattern: any, i: number) => (
                                                                            <div key={i} className="bg-purple-50/40 border border-purple-100/50 rounded-xl p-3">
                                                                                <div className="text-sm text-stone-600 mb-1">{pattern.chinese}</div>
                                                                                <div className="text-sm font-newsreader text-stone-900 font-medium italic">→ {pattern.english}</div>
                                                                                {pattern.point && (
                                                                                    <div className="text-[11px] text-purple-500 mt-1.5 font-medium">🎯 {pattern.point}</div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                )}
                            </AnimatePresence>
                        ) : null}
                    </div>

                    {/* Floating Teaching Panel */}
                    <AnimatePresence>
                        {teachingPanelOpen && teachingMode && mode === 'translation' && (
                            <>
                                {/* Backdrop */}
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setTeachingPanelOpen(false)}
                                    className="absolute inset-0 bg-black/20 backdrop-blur-[2px] z-[100] rounded-[2.5rem]"
                                />
                                {/* Panel */}
                                <motion.div
                                    initial={{ x: '100%', opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: '100%', opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    className="absolute top-0 right-0 bottom-0 w-full max-w-md z-[101] flex flex-col bg-white/95 backdrop-blur-xl border-l border-stone-200/50 shadow-[-8px_0_40px_rgba(0,0,0,0.08)] rounded-r-[2.5rem] overflow-hidden"
                                >
                                    {/* Panel Header */}
                                    <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100/50 shrink-0">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                                                <BookOpen className="w-3.5 h-3.5 text-white" />
                                            </div>
                                            <span className="font-bold text-sm text-stone-700">📖 教学面板</span>
                                        </div>
                                        <button
                                            onClick={() => setTeachingPanelOpen(false)}
                                            className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition-all"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    {/* Panel Content */}
                                    <div className="flex-1 overflow-y-auto p-4">
                                        <TeachingCard
                                            data={teachingData}
                                            isLoading={isLoadingTeaching}
                                            onReady={() => setTeachingPanelOpen(false)}
                                        />
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>

                    {/* DEBUG CONTROLS */}
                    <div className="absolute bottom-4 left-4 z-[200] flex flex-col gap-2 opacity-30 hover:opacity-100 transition-opacity p-2 bg-black/50 rounded-xl backdrop-blur-md">
                        <div className="text-[10px] font-mono text-white/50 text-center font-bold">DEV TOOLS</div>
                        <button
                            onClick={() => { setGambleState({ active: true, introAck: false, wager: null, doubleDownCount: 0 }); setTheme('crimson'); }}
                            className="bg-red-900/80 text-red-200 text-[10px] px-2 py-1 rounded border border-red-500/50 hover:bg-red-900"
                        >
                            Force Gamble
                        </button>
                        <div className="grid grid-cols-2 gap-1">
                            <button onClick={() => { setBossState({ active: true, introAck: false, type: 'blind' }); setTheme('boss'); setPlaybackSpeed(1.25); }} className="bg-stone-800 text-stone-400 text-[9px] px-1 py-1 rounded hover:bg-stone-700">Force Blind</button>
                            <button onClick={() => { setBossState({ active: true, introAck: false, type: 'lightning' }); setTheme('boss'); setPlaybackSpeed(1.25); }} className="bg-amber-900/50 text-amber-500 text-[9px] px-1 py-1 rounded hover:bg-amber-900">Force Light.</button>
                            <button onClick={() => { setBossState({ active: true, introAck: false, type: 'echo' }); setTheme('boss'); setPlaybackSpeed(1.0); }} className="bg-cyan-900/50 text-cyan-500 text-[9px] px-1 py-1 rounded hover:bg-cyan-900">Force Echo</button>
                            <button onClick={() => { setBossState({ active: true, introAck: false, type: 'reaper', hp: 3, maxHp: 3 }); setTheme('boss'); setPlaybackSpeed(1.0); }} className="bg-rose-900/50 text-rose-500 text-[9px] px-1 py-1 rounded hover:bg-rose-900">Force Reaper</button>
                        </div>
                        <button
                            onClick={() => { setFeverMode(true); setComboCount(3); setTheme('fever'); }}
                            className="bg-purple-900/80 text-purple-200 text-[10px] px-2 py-1 rounded border border-purple-500/50 hover:bg-purple-900"
                        >
                            Force Fever
                        </button>
                        <button
                            onClick={debugTriggerRoulette}
                            className="bg-emerald-900/80 text-emerald-200 text-[10px] px-2 py-1 rounded border border-emerald-500/50 hover:bg-emerald-900 flex items-center justify-center gap-1"
                        >
                            <Dices className="w-3 h-3" /> Spin Roulette
                        </button>
                    </div>

                    {/* Floating Action Bar - Redesigned */}
                    <AnimatePresence>
                        {drillFeedback && !bossState.active && !gambleState.active && (
                            <motion.div
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 50, opacity: 0 }}
                                className="absolute bottom-8 right-6 md:right-10 z-50 pointer-events-none"
                            >
                                <div className="pointer-events-auto filter drop-shadow-2xl">
                                    <button
                                        onClick={() => handleGenerateDrill()}
                                        className="group relative flex items-center gap-3 px-8 py-3.5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white rounded-full font-bold shadow-[0_10px_30px_-10px_rgba(249,115,22,0.5)] hover:shadow-[0_20px_40px_-10px_rgba(249,115,22,0.6)] hover:scale-105 active:scale-95 transition-all text-sm md:text-base tracking-wide overflow-hidden"
                                    >
                                        <span className="relative z-10 font-bold">Next Question</span>
                                        <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />

                                        {/* Shimmer Overlay */}
                                        <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent z-0" />

                                        {/* Glow Effect */}
                                        <div className="absolute inset-0 rounded-full bg-orange-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {wordPopup && <WordPopup key="word-popup" popup={wordPopup} onClose={() => setWordPopup(null)} />}
                </motion.div>

                {/* Negotiator Overlay (Crimson Roulette) - Localized */}
                <AnimatePresence>
                    {gambleState.active && gambleState.introAck && !gambleState.wager && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-8"
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                className="max-w-md w-full bg-[#1a0505] border border-red-900/50 rounded-3xl p-8 flex flex-col gap-6 shadow-[0_0_50px_rgba(220,38,38,0.2)]"
                            >
                                <div className="flex flex-col items-center text-center gap-2">
                                    <div className="w-16 h-16 rounded-full bg-red-950/50 flex items-center justify-center border border-red-900 mb-2">
                                        <Dices className="w-8 h-8 text-red-500" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-red-100">The Devil's Deal</h2>
                                    <p className="text-red-400 text-sm">A "High Value" client is challenging you. <br />Wager your skill for multiplied returns.</p>
                                </div>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => { setGambleState(prev => ({ ...prev, wager: 'safe' })); setTheme('default'); }}
                                        className="w-full p-4 rounded-xl border border-stone-800 bg-stone-900/50 hover:bg-stone-800 transition-colors flex items-center justify-between group"
                                    >
                                        <div className="text-left">
                                            <div className="text-stone-300 font-bold group-hover:text-white">放弃 (认怂)</div>
                                            <div className="text-xs text-stone-500">正常游戏. 无风险.</div>
                                        </div>
                                        <div className="text-stone-400 text-sm">1x</div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            setGambleState(prev => ({ ...prev, wager: 'risky' }));
                                            setTheme('crimson');
                                            setShake(true); // Small Shake
                                        }}
                                        className="w-full p-4 rounded-xl border border-amber-900/30 bg-amber-950/20 hover:bg-amber-900/30 transition-colors flex items-center justify-between group"
                                    >
                                        <div className="text-left">
                                            <div className="text-amber-500 font-bold group-hover:text-amber-400">加注 (玩玩)</div>
                                            <div className="text-xs text-amber-700 group-hover:text-amber-600">下注 20 Elo. 赢 60.</div>
                                        </div>
                                        <div className="text-amber-500 font-bold text-sm">3x</div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            setGambleState(prev => ({ ...prev, wager: 'madness' }));
                                            setTheme('crimson');
                                            setShake(true); // BIG SHAKE
                                            if (navigator.vibrate) navigator.vibrate(200); // Mobile Haptic
                                        }}
                                        className="w-full p-4 rounded-xl border border-red-900/50 bg-red-950/30 hover:bg-red-900/40 transition-colors flex items-center justify-between group relative overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
                                        <div className="text-left relative z-10">
                                            <div className="text-red-500 font-bold group-hover:text-red-400 flex items-center gap-2"><AlertTriangle className="w-3 h-3" /> 梭哈 (疯魔)</div>
                                            <div className="text-xs text-red-700 group-hover:text-red-600">下注 50 Elo. 赢 150.</div>
                                        </div>
                                        <div className="text-red-500 font-black text-xl relative z-10">5x</div>
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* DOUBLE DOWN MODAL (The Greed Trap) */}
                <AnimatePresence>
                    {showDoubleDown && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[80] bg-black/95 flex items-center justify-center p-8 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-10" />
                            <div className="absolute inset-0 bg-red-900/10 animate-pulse" />

                            <motion.div
                                initial={{ scale: 0.8, rotate: -5 }}
                                animate={{ scale: 1, rotate: 0 }}
                                className="relative bg-[#2a0a0a] border-4 border-red-600 p-8 rounded-3xl shadow-[0_0_100px_rgba(220,38,38,0.5)] max-w-sm w-full text-center flex flex-col gap-6"
                            >
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                                    <div className="w-24 h-24 bg-black border-4 border-red-600 rounded-full flex items-center justify-center shadow-2xl">
                                        <span className="text-4xl">😈</span>
                                    </div>
                                </div>

                                <div className="mt-8 space-y-2">
                                    <h2 className="text-3xl font-black text-red-500 uppercase tracking-tighter">Greed Check</h2>
                                    <p className="text-red-200 text-sm">You won... but is it enough?</p>
                                </div>

                                <div className="py-4 bg-black/30 rounded-xl border border-red-900/30">
                                    <div className="text-xs text-stone-500 uppercase tracking-widest mb-1">Current Winnings</div>
                                    <div className="text-4xl font-mono font-bold text-white tabular-nums">
                                        {gambleState.wager === 'risky' ? 60 * Math.pow(2.5, gambleState.doubleDownCount) : 150 * Math.pow(2.5, gambleState.doubleDownCount)}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => {
                                            setShowDoubleDown(false);
                                            setGambleState(prev => ({ ...prev, active: false, introAck: false, wager: null, doubleDownCount: 0 }));
                                            setTheme('default');
                                        }}
                                        className="py-4 rounded-xl bg-stone-800 text-stone-400 font-bold hover:bg-stone-700 hover:text-white transition-colors border border-white/5"
                                    >
                                        Take it (Weak)
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowDoubleDown(false);
                                            // Reset the drill but KEEP the gamble state and increment count
                                            setGambleState(prev => ({ ...prev, doubleDownCount: prev.doubleDownCount + 1 }));
                                            handleGenerateDrill(); // Generate NEXT question immediately
                                            // Theme stays crimson
                                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-sword-slash-swoosh-1476.mp3').play().catch(() => { });
                                        }}
                                        className="py-4 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition-all border border-red-400 shadow-[0_0_20px_rgba(220,38,38,0.4)] animate-pulse"
                                    >
                                        DOUBLE DOWN 💀
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Gamble Intro Overlay */}
                <AnimatePresence>
                    {gambleState.active && !gambleState.introAck && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[70] bg-[#1a0505] flex items-center justify-center p-8"
                            onClick={() => setGambleState(prev => ({ ...prev, introAck: true }))}
                        >
                            <div className="flex flex-col items-center gap-8 text-center pointer-events-none">
                                <motion.div
                                    initial={{ scale: 2, filter: "blur(10px)" }}
                                    animate={{ scale: 1, filter: "blur(0px)" }}
                                    transition={{ duration: 0.8, ease: "circOut" }}
                                    className="relative"
                                >
                                    <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
                                    <AlertTriangle className="w-32 h-32 text-red-600 relative z-10" />
                                </motion.div>

                                <motion.div
                                    initial={{ y: 50, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="space-y-4"
                                >
                                    <h2 className="text-5xl font-black text-red-600 tracking-tighter uppercase">猩红轮盘</h2>
                                    <div className="h-1 w-32 bg-red-600 mx-auto" />
                                    <p className="text-red-200 font-mono text-sm tracking-widest">高风险 • 高回报</p>
                                </motion.div>

                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.5, repeat: Infinity, repeatType: "reverse" }}
                                    className="text-white/30 text-xs mt-12"
                                >
                                    点击进入交易 (CLICK TO ENTER)
                                </motion.p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Boss Intro Overlay */}
                <AnimatePresence>
                    {bossState.active && !bossState.introAck && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[70] bg-black flex items-center justify-center p-8"
                            onClick={() => setBossState(prev => ({ ...prev, introAck: true }))}
                        >
                            <div className="flex flex-col items-center gap-8 text-center pointer-events-none">
                                <motion.div
                                    initial={{ scale: 2, filter: "blur(10px)" }}
                                    animate={{ scale: 1, filter: "blur(0px)" }}
                                    transition={{ duration: 0.8, ease: "circOut" }}
                                    className="relative"
                                >
                                    <div className={cn("absolute inset-0 blur-3xl rounded-full", currentBoss.bg, "opacity-20")} />
                                    <currentBoss.icon className={cn("w-32 h-32 relative z-10", currentBoss.color)} />
                                </motion.div>

                                <motion.div
                                    initial={{ y: 50, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="space-y-4"
                                >
                                    <h2 className={cn("text-5xl font-black tracking-tighter uppercase", currentBoss.color)}>{currentBoss.name}</h2>
                                    <div className={cn("h-1 w-32 mx-auto", currentBoss.bg)} />
                                    <p className={cn("font-mono text-sm tracking-widest opacity-80", currentBoss.color)}>{currentBoss.desc}</p>
                                </motion.div>

                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.5, repeat: Infinity, repeatType: "reverse" }}
                                    className="text-white/30 text-xs mt-12"
                                >
                                    CLICK TO START CHALLENGE
                                </motion.p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Context-Aware Loot Overlay */}
                <AnimatePresence>
                    {lootDrop && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8, y: 50 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: -50 }}
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] flex flex-col items-center gap-4 pointer-events-auto cursor-pointer"
                            onClick={() => setLootDrop(null)}
                        >
                            <div className={cn(
                                "flex flex-col items-center gap-4 p-8 rounded-[2.5rem] border shadow-2xl backdrop-blur-3xl min-w-[280px]",
                                lootDrop.amount < 0 ? "bg-red-950/80 border-red-500/50 shadow-red-500/30" :
                                    lootDrop.rarity === 'legendary' ? "bg-amber-900/80 border-amber-400/50 shadow-amber-500/30" :
                                        lootDrop.rarity === 'rare' ? "bg-indigo-900/80 border-indigo-400/50 shadow-indigo-500/30" :
                                            "bg-stone-900/80 border-stone-500/30 shadow-2xl"
                            )}>
                                <div className={cn(
                                    "p-5 rounded-2xl mb-2",
                                    lootDrop.amount < 0 ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                                )}>
                                    {lootDrop.amount < 0 || lootDrop.message.includes('💀') ? (
                                        <Skull className="w-12 h-12 animate-pulse" />
                                    ) : lootDrop.message.includes('🎰') ? (
                                        <Zap className="w-12 h-12 animate-bounce" />
                                    ) : lootDrop.type === 'gem' ? (
                                        <Gem className="w-12 h-12" />
                                    ) : (
                                        <Gift className="w-12 h-12" />
                                    )}
                                </div>

                                <div className="text-center">
                                    <div className={cn("text-xs font-black uppercase tracking-[0.2em] mb-1 opacity-60",
                                        lootDrop.amount < 0 ? "text-red-400" : "text-amber-500"
                                    )}>
                                        {lootDrop.amount < 0 ? "System Penalty" :
                                            lootDrop.message.includes('🎰') ? "Stakes Locked" : "Reward Dropped"}
                                    </div>
                                    <div className={cn("text-xl font-bold mb-4",
                                        lootDrop.amount < 0 ? "text-red-100" : "text-amber-50"
                                    )}>
                                        {lootDrop.message}
                                    </div>
                                    <div className={cn("text-5xl font-black font-mono tracking-tighter",
                                        lootDrop.amount < 0 ? "text-red-500" : "text-white"
                                    )}>
                                        {lootDrop.amount > 0 ? `+${lootDrop.amount}` : lootDrop.amount}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* RANK UP Celebration Overlay */}
                <AnimatePresence>
                    {rankUp && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl"
                            onClick={() => setRankUp(null)}
                        >
                            {/* Epic Background Rays */}
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 z-0 opacity-30"
                            >
                                <div className={cn("w-[200vw] h-[200vw] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r transparent via-white/10 transparent", rankUp.newRank.gradient)} style={{ clipPath: "polygon(50% 50%, 0 0, 100% 0)" }} />
                            </motion.div>

                            <motion.div
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.5, opacity: 0 }}
                                transition={{ type: "spring", damping: 15, stiffness: 200 }}
                                className="relative z-10 flex flex-col items-center gap-8 p-12 max-w-lg w-full"
                            >
                                {/* Shockwave Effect */}
                                <motion.div
                                    initial={{ scale: 0, opacity: 0.8 }}
                                    animate={{ scale: 2, opacity: 0 }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    className={cn("absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border-4", rankUp.newRank.border)}
                                />

                                {/* THE ICON */}
                                <div className="relative">
                                    <motion.div
                                        initial={{ scale: 0, rotate: -180 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: "spring", damping: 12, stiffness: 100, delay: 0.2 }}
                                        className={cn("w-40 h-40 rounded-3xl flex items-center justify-center shadow-[0_0_100px_rgba(255,255,255,0.3)] bg-gradient-to-br border-4 border-white/50", rankUp.newRank.gradient)}
                                    >
                                        <rankUp.newRank.icon className="w-20 h-20 text-white drop-shadow-md" strokeWidth={1.5} />
                                    </motion.div>

                                    {/* Particles */}
                                    {[...Array(12)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                                            animate={{
                                                x: (Math.random() - 0.5) * 300,
                                                y: (Math.random() - 0.5) * 300,
                                                opacity: 0,
                                                scale: Math.random() * 1.5
                                            }}
                                            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                                            className={cn("absolute top-1/2 left-1/2 w-3 h-3 rounded-full", rankUp.newRank.bg.replace('bg-', 'bg-'))}
                                        />
                                    ))}
                                </div>

                                {/* Text Content */}
                                <div className="text-center space-y-2">
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.5 }}
                                        className="text-sm font-bold tracking-[0.3em] uppercase text-white/60"
                                    >
                                        Rank Promoted
                                    </motion.div>
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.6, type: "spring" }}
                                        className={cn("text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-white/70 filter drop-shadow-lg")}
                                    >
                                        {rankUp.newRank.title}
                                    </motion.div>
                                </div>

                                {/* Rank Comparison */}
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.8 }}
                                    className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/10"
                                >
                                    <span className="text-stone-400 line-through text-lg decoration-stone-500/50">{rankUp.oldRank.title}</span>
                                    <ChevronRight className="w-5 h-5 text-white/40" />
                                    <span className="text-white font-bold text-xl">{rankUp.newRank.title}</span>
                                </motion.div>

                                {/* CTA */}
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className={cn("px-12 py-4 rounded-xl font-bold text-lg shadow-xl transition-all hover:brightness-110 active:scale-95 text-white shadow-lg", rankUp.newRank.bg.replace('bg-', 'bg-').replace('100', '600'))}
                                >
                                    CLAIM GLORY
                                </motion.button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* RANK DOWN Demotion Overlay */}
                <AnimatePresence>
                    {rankDown && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-grayscale"
                            onClick={() => setRankDown(null)}
                        >
                            <motion.div
                                initial={{ scale: 1.1, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="flex flex-col items-center gap-8 p-12 max-w-lg w-full relative"
                            >
                                {/* Cracking Background Texture */}
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cracked-ground.png')] opacity-20 pointer-events-none" />

                                {/* THE SHATTERING ICON */}
                                <div className="relative">
                                    {/* The Old Rank Getting Destroyed */}
                                    <motion.div
                                        initial={{ scale: 1, filter: "brightness(1)", opacity: 1 }}
                                        animate={{ scale: [1, 1.1, 0.8], opacity: 0, filter: "brightness(2)" }}
                                        transition={{ duration: 0.4, delay: 0.2 }}
                                        className={cn("absolute inset-0 w-40 h-40 rounded-3xl flex items-center justify-center bg-gradient-to-br border-4 border-white/50", rankDown.oldRank.gradient)}
                                    >
                                        <rankDown.oldRank.icon className="w-20 h-20 text-white" />
                                    </motion.div>

                                    {/* The New (Lower) Rank Appearing */}
                                    <motion.div
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: "spring", damping: 12, delay: 0.6 }}
                                        className={cn("w-40 h-40 rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(255,0,0,0.2)] bg-stone-900 border-4 border-stone-700 grayscale")}
                                    >
                                        <rankDown.newRank.icon className="w-20 h-20 text-stone-500" strokeWidth={1.5} />
                                    </motion.div>
                                </div>

                                {/* Text Content */}
                                <div className="text-center space-y-2 z-10">
                                    <motion.div
                                        initial={{ opacity: 0, y: -20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 }}
                                        className="text-sm font-bold tracking-[0.5em] uppercase text-red-600 animate-pulse"
                                    >
                                        Demotion Alert
                                    </motion.div>
                                    <motion.div
                                        initial={{ opacity: 0, scale: 2 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                                        className="text-6xl font-black tracking-tighter text-stone-300"
                                    >
                                        RANK LOST
                                    </motion.div>
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.8 }}
                                        className="text-stone-500 font-mono text-sm"
                                    >
                                        {rankDown.oldRank.title} <span className="mx-2 text-stone-700">➜</span> {rankDown.newRank.title}
                                    </motion.p>
                                </div>

                                {/* CTA */}
                                <motion.button
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 1 }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="px-10 py-3 rounded-xl font-bold text-sm bg-stone-800 text-stone-400 border border-stone-700 hover:bg-stone-700 hover:text-stone-200 transition-colors"
                                >
                                    ACCEPT FATE
                                </motion.button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </motion.div>
            {/* DEBUGGER */}
            {/* <DrillDebug onTriggerBoss={handleDebugBossTrigger} /> */}

            {/* ROULETTE OVERLAY */}
            <AnimatePresence>
                {showRoulette && (
                    <RouletteOverlay
                        onComplete={handleRouletteComplete}
                        onCancel={() => setShowRoulette(false)}
                    />
                )}
            </AnimatePresence>

        </AnimatePresence >
    );
}
