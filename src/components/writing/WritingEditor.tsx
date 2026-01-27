"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, RefreshCw, Send, X, CheckCircle2, ArrowRight, HelpCircle, MessageCircle, Wand2, Mic, Play, Pause, Volume2, Globe, Headphones, Eye, EyeOff, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import * as Diff from 'diff';
import { WordPopup, PopupState } from "../reading/WordPopup";
import { useWhisper } from "@/hooks/useWhisper";

interface WritingEditorProps {
    articleTitle: string;
    articleContent?: string;
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
    feedback: string[];
    improved_version: string;
}

interface DictionaryData {
    word: string;
    phonetic?: string;
    audio?: string;
    translation?: string;
    definition?: string;
}

type DrillMode = "translation" | "listening";

export function WritingEditor({ articleTitle, articleContent, onClose }: WritingEditorProps) {
    // Mode State
    const [mode, setMode] = useState<DrillMode>("translation");

    // Drill State
    const [drillData, setDrillData] = useState<DrillData | null>(null);
    const [userTranslation, setUserTranslation] = useState("");
    const [isGeneratingDrill, setIsGeneratingDrill] = useState(false);
    const [isSubmittingDrill, setIsSubmittingDrill] = useState(false);
    const [drillFeedback, setDrillFeedback] = useState<DrillFeedback | null>(null);

    // Audio & Dictionary State
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    // Cache stores { url: string, marks: { time: number, value: string }[] }
    const audioCache = useRef<Map<string, { url: string; marks?: any[] }>>(new Map());
    const [currentAudioTime, setCurrentAudioTime] = useState(0);

    // Active Word Card (Popover)
    const [activeWord, setActiveWord] = useState<DictionaryData | null>(null);
    const [loadingWord, setLoadingWord] = useState<string | null>(null);
    const [wordPopup, setWordPopup] = useState<PopupState | null>(null);

    // Voice Input State (Legacy WebSpeech - replaced by Whisper hook for main interaction)
    const [isListeningLegacy, setIsListeningLegacy] = useState(false);

    // Whisper Integration
    const {
        isRecording: whisperRecording,
        isProcessing: whisperProcessing,
        result: whisperResult,
        startRecognition,
        stopRecognition
    } = useWhisper();

    // Ask Tutor State
    const [isTutorOpen, setIsTutorOpen] = useState(false);
    const [tutorQuery, setTutorQuery] = useState("");
    const [tutorAnswer, setTutorAnswer] = useState<string | null>(null);
    const [isAskingTutor, setIsAskingTutor] = useState(false);

    // Blind Mode State
    const [isBlindMode, setIsBlindMode] = useState(true);

    // Auto-Submit on Whisper Final Result
    useEffect(() => {
        if (mode === "listening" && whisperResult.isFinal && whisperResult.text) {
            setUserTranslation(whisperResult.text);
            // Trigger submit after a short delay to allow state update
            // We use a ref or direct call if we could, but here we rely on the effect.
            // Actually, we can just call handleSubmitDrill with the text directly if we refactor,
            // but `handleSubmitDrill` uses the state `userTranslation`.
            // Let's set a flag to auto-submit.
        }
    }, [whisperResult, mode]);

    // Effect to trigger submit when translation updates if it came from Whisper
    const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false);
    useEffect(() => {
        if (shouldAutoSubmit && userTranslation) {
            handleSubmitDrill();
            setShouldAutoSubmit(false);
        }
    }, [userTranslation, shouldAutoSubmit]);

    // Update auto-submit flag when whisper finishes
    useEffect(() => {
        if (mode === "listening" && whisperResult.isFinal && whisperResult.text) {
            setShouldAutoSubmit(true);
        }
    }, [whisperResult, mode]);


    // Audio Sync Loop (Karaoke)
    useEffect(() => {
        let frameId: number;
        const tick = () => {
            if (audioRef.current && !audioRef.current.paused) {
                setCurrentAudioTime(audioRef.current.currentTime * 1000); // ms
                frameId = requestAnimationFrame(tick);
            }
        };
        if (isPlaying) {
            frameId = requestAnimationFrame(tick);
        }
        return () => cancelAnimationFrame(frameId);
    }, [isPlaying]);

    // Auto-generate on mount
    useEffect(() => {
        if (typeof window !== "undefined" && !drillData && !isGeneratingDrill) {
            // Initial load
        }
    }, [mode]);

    // Audio Player Logic: Auto-play
    useEffect(() => {
        if (mode === "listening" && drillData?.reference_english) {
            playAudio();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drillData, mode]);

    const [audioDuration, setAudioDuration] = useState(0); // in ms

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        setCurrentAudioTime(time);
        if (audioRef.current) {
            audioRef.current.currentTime = time / 1000;
        }
    };

    const playAudio = async () => {
        if (!drillData?.reference_english) return;

        const textKey = "SENTENCE_" + drillData.reference_english;
        // Don't stop if already valid? No, force restart for consistent flow
        setIsPlaying(true);
        setActiveWord(null);
        setWordPopup(null);

        try {
            let cached = audioCache.current.get(textKey);

            if (!cached) {
                const response = await fetch("/api/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: drillData.reference_english,
                        voice: "en-US-JennyNeural",
                        rate: "+0%" // Fetch at normal speed, we adjust via playbackRate
                    }),
                });
                if (!response.ok) throw new Error("TTS failed");

                const data = await response.json();
                cached = { url: data.audio, marks: data.marks };
                audioCache.current.set(textKey, cached!);
            }

            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }

            const audio = new Audio(cached.url);
            audioRef.current = audio;

            // Capture Duration for Slider
            audio.onloadedmetadata = () => {
                setAudioDuration(audio.duration * 1000); // to ms
            };
            // Fallback if metadata already loaded (cached audio)
            if (audio.duration && !isNaN(audio.duration)) {
                setAudioDuration(audio.duration * 1000);
            }

            audio.onended = () => {
                setIsPlaying(false);
                setCurrentAudioTime(0);
            };

            // Apply current speed
            audio.playbackRate = playbackSpeed;
            await audio.play();
        } catch (error) {
            console.error("Audio chain failed", error);
            setIsPlaying(false);
        }
    };

    // --- Interaction Handlers ---

    const handleWordClick = (e: React.MouseEvent, word: string) => {
        e.stopPropagation();
        const cleanWord = word.replace(/[^a-zA-Z]/g, "").trim();
        if (!cleanWord) return;

        // MODE CHECK: In Listening Mode, clicking text (revealed) should SEEK audio (Karaoke style)
        if (mode === "listening" && drillData?.reference_english) {
            const textKey = "SENTENCE_" + drillData.reference_english;
            const cached = audioCache.current.get(textKey);

            if (cached && cached.marks && audioRef.current) {
                // Strict Match for Seeking
                const targetMark = cached.marks.find((m: any) => {
                    const mClean = m.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
                    return mClean === cleanWord.toLowerCase();
                });

                if (targetMark && isPlaying) {
                    audioRef.current.currentTime = targetMark.time / 1000;
                    return; // Skip popover
                }
            }
        }

        // If NOT playing or NOT listening mode -> Show Definition Popup (Reading Mode Style)
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.bottom + 10;

        setWordPopup({
            word: cleanWord,
            context: drillData?.reference_english || "",
            x,
            y
        });
    };

    const playFallbackTTS = async (text: string) => {
        try {
            const key = "WORD_" + text;
            let cached = audioCache.current.get(key);
            let url = cached?.url;

            if (!url) {
                const res = await fetch("/api/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, voice: "en-US-JennyNeural" })
                });
                if (res.ok) {
                    const data = await res.json();
                    url = data.audio;
                    // For fallback words, we might not get marks, but that's fine
                    audioCache.current.set(key, { url: url!, marks: data.marks });
                }
            }
            if (url) new Audio(url).play();
        } catch (e) { console.error(e); }
    };

    const toggleVoiceInput = () => {
        if (typeof window === "undefined" || !('webkitSpeechRecognition' in window)) {
            alert("Speech recognition not supported in this browser. Please use Chrome.");
            return;
        }

        if (isListeningLegacy) {
            setIsListeningLegacy(false);
            return;
        }

        setIsListeningLegacy(true);
        const recognition = new (window as any).webkitSpeechRecognition();
        recognition.lang = "en-US";
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
            let finalTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                setUserTranslation(prev => prev + (prev ? " " : "") + finalTranscript);
            }
        };

        recognition.onerror = () => setIsListeningLegacy(false);
        recognition.onend = () => setIsListeningLegacy(false);
        recognition.start();
    };

    // --- Drill Handlers ---
    const [difficulty, setDifficulty] = useState<string>('Level 3');
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
    const [isDynamic, setIsDynamic] = useState(true);
    const [level, setLevel] = useState(1);

    // --- Persistence ---
    useEffect(() => {
        const savedDiff = localStorage.getItem('yasi_drill_difficulty');
        const savedLevel = localStorage.getItem('yasi_drill_level');
        if (savedDiff) setDifficulty(savedDiff);
        if (savedLevel) setLevel(parseInt(savedLevel));
    }, []);

    useEffect(() => {
        localStorage.setItem('yasi_drill_difficulty', difficulty);
        localStorage.setItem('yasi_drill_level', level.toString());
    }, [difficulty, level]);

    const handleGenerateDrill = async (targetDifficulty = difficulty) => {
        setIsGeneratingDrill(true);
        setDrillData(null);
        setDrillFeedback(null);
        setUserTranslation("");
        setTutorAnswer(null);
        setIsTutorOpen(false);
        setWordPopup(null); // Close card
        setIsPlaying(false);
        if (audioRef.current) {
            audioRef.current.pause();
        }

        try {
            const response = await fetch("/api/ai/generate_drill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    articleTitle,
                    articleContent: articleContent || "",
                    difficulty: targetDifficulty,
                    mode
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

    const updateDifficultyBasedOnScore = (score: number) => {
        if (!isDynamic) return;

        const levels = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'];
        const currentIndex = levels.indexOf(difficulty);
        if (currentIndex === -1) return; // Should not happen

        let newDiff = difficulty;

        // Upgrade Logic: Score >= 8.5 -> Level Up
        if (score >= 8.5 && currentIndex < levels.length - 1) {
            newDiff = levels[currentIndex + 1];
        }
        // Downgrade Logic: Score <= 6 -> Level Down
        else if (score <= 6 && currentIndex > 0) {
            newDiff = levels[currentIndex - 1];
        }

        if (newDiff !== difficulty) {
            setDifficulty(newDiff);
        }
    };

    const handleSubmitDrill = async () => {
        if (!userTranslation.trim() || !drillData) return;
        setIsSubmittingDrill(true);

        // Simulate "Thinking" / Animation Delay for Transition
        await new Promise(r => setTimeout(r, 1200));

        try {
            const response = await fetch("/api/ai/score_translation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: userTranslation,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    mode // Pass mode to backend for context-aware scoring
                }),
            });
            const data = await response.json();
            setDrillFeedback(data);

            // Auto-adjust difficulty for NEXT round
            if (data.score !== undefined) {
                updateDifficultyBasedOnScore(data.score);
                if (data.score >= 6) {
                    setLevel(prev => prev + 1);
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
                    articleTitle
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

    // Auto-complete hint logic
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

    // --- Diff Rendering (Interactive) ---
    const renderDiff = () => {
        if (!drillData || !drillFeedback) return null;

        // Normalization Helper
        const normalize = (str: string) => {
            return str
                .toLowerCase()
                .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "") // Remove punctuation
                .replace(/\s{2,}/g, " ") // Collapse spaces
                .trim();
        };

        const cleanUser = mode === "listening" ? normalize(userTranslation) : userTranslation;
        const cleanTarget = mode === "listening" ? normalize(drillData.reference_english) : drillData.reference_english;

        const diffs = Diff.diffWords(cleanUser, cleanTarget);

        // Process diffs into a renderable list of tokens with metadata
        // We want to show the USER'S perspective primarily, marking errors on it.
        // Strategy:
        // - Common: Text
        // - Removed: This is what user wrote but shouldn't have. Mark as Error. Check next for correction.
        // - Added: This is what user missed. Show as insertion point.

        const elements: JSX.Element[] = [];

        for (let i = 0; i < diffs.length; i++) {
            const part = diffs[i];

            if (!part.added && !part.removed) {
                // Correct Text
                elements.push(
                    <span key={i} className="text-stone-800">{part.value}</span>
                );
            } else if (part.removed) {
                // WRONG WORD (User wrote this, but it's not in target)
                // Check if next part is added (Substitution)
                let correction = null;
                if (i + 1 < diffs.length && diffs[i + 1].added) {
                    correction = diffs[i + 1].value;
                    i++; // Skip next
                }

                elements.push(
                    <span key={i} className="group relative inline-block cursor-help mx-1">
                        <span className="text-rose-600 decoration-2 underline decoration-wavy decoration-rose-300 bg-rose-50/50 rounded px-0.5">
                            {part.value}
                        </span>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] px-3 py-2 bg-stone-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                            <div className="font-bold text-rose-200 mb-0.5">Incorrect</div>
                            {correction ? (
                                <>Try: <span className="text-emerald-300 font-mono text-sm">{correction}</span></>
                            ) : (
                                <span>Unnecessary word</span>
                            )}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-stone-900"></div>
                        </div>
                    </span>
                );
            } else if (part.added) {
                // MISSING WORD (User didn't write this)
                // Render a green caret/marker
                elements.push(
                    <span key={i} className="group relative inline-block cursor-help mx-0.5 align-text-bottom">
                        <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-bold border border-emerald-200 hover:scale-110 transition-transform">
                            +
                        </div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] px-3 py-2 bg-stone-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                            <div className="font-bold text-emerald-300 mb-0.5">Missing Word</div>
                            <span className="font-mono text-sm">{part.value}</span>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-stone-900"></div>
                        </div>
                    </span>
                );
            }
        }

        return (
            <div className="font-newsreader text-2xl leading-relaxed text-stone-800">
                {elements}
            </div>
        );
    };

    // Mounting
    useEffect(() => {
        if (!drillData && !isGeneratingDrill) {
            handleGenerateDrill(difficulty);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    const vocabList = drillData?.target_english_vocab || drillData?.key_vocab || [];

    // Helper to render interactive text
    const renderInteractiveText = (text: string) => {
        // Find existing marks for this text
        const textKey = "SENTENCE_" + (drillData?.reference_english || "");
        const cached = audioCache.current.get(textKey);
        const marks = cached?.marks || [];

        return text.split(" ").map((word, i) => {
            const clean = word.replace(/[^a-zA-Z]/g, "").trim();
            const isActive = wordPopup?.word === clean;

            // Karaoke Highlight Check
            // Find a mark that corresponds to this word index/value AND overlaps current time
            const isKaraokeActive = isPlaying && !isActive && marks.some((m: any) => {
                const mClean = m.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
                const wordMatch = mClean === clean.toLowerCase(); // STRICT EQUALITY
                const timeMatch = currentAudioTime >= m.start && currentAudioTime <= (m.end + 200);
                if (wordMatch && timeMatch) return true;
                return false;
            });

            return (
                <span
                    key={i}
                    className="relative inline-block" // Wrapper for positioning
                >
                    <span
                        onClick={(e) => handleWordClick(e, word)}
                        className={cn(
                            "cursor-pointer px-1.5 py-0.5 transition-all duration-300 rounded-md mx-[1px]",
                            "hover:text-indigo-600 hover:bg-indigo-50/60",
                            isActive ? "text-indigo-700 bg-indigo-100 ring-2 ring-indigo-200 shadow-sm" : "",
                            // Karaoke
                            isKaraokeActive ? "text-indigo-600 bg-indigo-50 font-semibold shadow-sm" : "text-stone-700"
                        )}
                    >
                        {word}
                    </span>
                    {" "}
                </span>
            );
        });
    };

    const getDifficultyColor = (d: string) => {
        switch (d) {
            case 'Easy': return "bg-cyan-100 text-cyan-700 border-cyan-200";
            case 'Hard': return "bg-rose-100 text-rose-700 border-rose-200";
            default: return "bg-indigo-100 text-indigo-700 border-indigo-200";
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                key="writing-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 overflow-hidden font-sans"
            >
                {/* Liquid Background */}
                <div className="absolute inset-0 bg-stone-50/80 backdrop-blur-3xl z-[-1]" />
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-sky-200/30 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] bg-amber-200/30 rounded-full blur-[100px] animate-pulse delay-700" />

                {/* Main Card Container */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="relative w-full max-w-5xl h-[90vh] glass-panel bg-white/60 border border-white/60 shadow-2xl shadow-stone-300/40 rounded-[3rem] overflow-hidden flex flex-col"
                >
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
                                    <Globe className="w-3 h-3 inline-block mr-2" />
                                    Translate
                                </button>
                                <button
                                    onClick={() => setMode("listening")}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-sm font-bold transition-all",
                                        mode === "listening" ? "bg-white shadow-md text-stone-900" : "text-stone-400 hover:text-stone-600"
                                    )}
                                >
                                    <Headphones className="w-3 h-3 inline-block mr-2" />
                                    Listening
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition-all group"
                        >
                            <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                        </button>
                    </div>

                    {/* Content Body - Optimized for Compactness */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 relative flex flex-col items-center">
                        {isGeneratingDrill && !drillData ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-6 animate-pulse mt-32">
                                <div className="w-16 h-16 rounded-full border-4 border-stone-200 border-t-stone-800 animate-spin" />
                                <p className="text-stone-400 font-newsreader italic text-xl">
                                    {mode === "translation" ? "Crafting phrase..." : "Encoding audio stream..."}
                                </p>
                            </div>
                        ) : drillData ? (
                            <div className="max-w-3xl w-full space-y-4 pb-12">
                                {/* Difficulty & Dynamic Header */}
                                {!drillFeedback && (
                                    <div className="flex justify-center items-center gap-4 mb-4 animate-in fade-in slide-in-from-top-4">
                                        {/* Level Badge */}
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-stone-900 text-white rounded-full text-xs font-bold shadow-lg shadow-stone-300/50">
                                            <span className="text-amber-400">LVL</span>
                                            <span>{level}</span>
                                        </div>

                                        <div className="flex gap-2">
                                            <div className="flex gap-1 bg-stone-100 p-1 rounded-lg">
                                                {['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'].map((d, i) => (
                                                    <button
                                                        key={d}
                                                        onClick={() => {
                                                            setDifficulty(d);
                                                            handleGenerateDrill(d);
                                                        }}
                                                        className={cn(
                                                            "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                                                            difficulty === d
                                                                ? "bg-white shadow-sm text-indigo-600 ring-1 ring-stone-200"
                                                                : "text-stone-400 hover:text-stone-600 hover:bg-stone-200/50"
                                                        )}
                                                        title={d}
                                                    >
                                                        {i + 1}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setIsDynamic(!isDynamic)}
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all",
                                                isDynamic ? "bg-stone-800 text-white border-stone-800" : "bg-white text-stone-400 border-stone-200 hover:border-stone-300"
                                            )}
                                            title="Dynamic Difficulty: Automatically adjusts based on your score"
                                        >
                                            {isDynamic ? <Sparkles className="w-3 h-3 text-amber-300" /> : <div className="w-3 h-3 rounded-full border border-stone-300" />}
                                            Dynamic Flow
                                        </button>
                                    </div>
                                )}

                                {/* Source / Listening Area */}
                                <div className="space-y-6 text-center w-full">
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="relative flex flex-col items-center gap-6 w-full"
                                    >
                                        {mode === "listening" ? (
                                            <div className="w-full flex flex-col items-center justify-center relative">
                                                {/* Play Button - Compact */}
                                                <button
                                                    onClick={playAudio}
                                                    disabled={isPlaying}
                                                    className="group relative w-20 h-20 flex items-center justify-center transition-all duration-500 hover:scale-105 active:scale-95 disabled:opacity-80 disabled:scale-100 mb-4"
                                                >
                                                    {/* Outer Glow / Atmosphere */}
                                                    <div className={cn(
                                                        "absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-xl transition-all duration-500",
                                                        isPlaying ? "scale-110 opacity-100" : "scale-100 opacity-0 group-hover:opacity-100"
                                                    )} />

                                                    {/* Glass Container */}
                                                    <div className="absolute inset-0 rounded-full bg-white/40 dark:bg-white/10 backdrop-blur-2xl border border-white/60 dark:border-white/20 shadow-xl shadow-indigo-500/10 transition-all duration-300 group-hover:bg-white/50 group-hover:border-white/80" />

                                                    {/* Inner Content */}
                                                    <div className="relative z-10 text-indigo-600 dark:text-indigo-300 drop-shadow-sm flex items-center justify-center">
                                                        {isPlaying ? (
                                                            <div className="flex items-center gap-1 h-8">
                                                                {[0.4, 1, 0.6, 0.8, 0.5].map((h, i) => (
                                                                    <motion.div
                                                                        key={i}
                                                                        animate={{ height: [8 * h, 24 * h, 8 * h] }}
                                                                        transition={{
                                                                            duration: 0.6 + (i * 0.1),
                                                                            repeat: Infinity,
                                                                            ease: "easeInOut",
                                                                            repeatType: "mirror"
                                                                        }}
                                                                        className="w-1 bg-indigo-600 dark:bg-indigo-400 rounded-full"
                                                                    />
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <Play className="w-8 h-8 ml-1 fill-indigo-600 dark:fill-indigo-400 text-indigo-600 dark:text-indigo-400" />
                                                        )}
                                                    </div>

                                                    {/* Ripple Effect (Active) */}
                                                    {isPlaying && (
                                                        <>
                                                            <div className="absolute inset-0 rounded-full border border-indigo-500/30 animate-ping" style={{ animationDuration: '2s' }} />
                                                            <div className="absolute inset-0 rounded-full border border-indigo-500/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.6s' }} />
                                                        </>
                                                    )}
                                                </button>

                                                {/* Blind Toggle & Speed Control */}
                                                <div className="flex items-center gap-4 mb-2">
                                                    <button
                                                        onClick={() => setIsBlindMode(!isBlindMode)}
                                                        className={cn(
                                                            "text-[10px] px-2.5 py-1 rounded-full font-bold transition-all flex items-center gap-1.5 uppercase tracking-wide",
                                                            isBlindMode ? "bg-stone-100 text-stone-500 hover:bg-stone-200" : "bg-indigo-100 text-indigo-600"
                                                        )}
                                                    >
                                                        {isBlindMode ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                        {isBlindMode ? "Blind" : "Text"}
                                                    </button>

                                                    <div className="h-4 w-px bg-stone-200" />

                                                    <div className="flex bg-stone-100 rounded-full p-0.5">
                                                        {[0.75, 1.0, 1.25, 1.5].map((speed) => (
                                                            <button
                                                                key={speed}
                                                                onClick={() => {
                                                                    setPlaybackSpeed(speed);
                                                                    if (audioRef.current) audioRef.current.playbackRate = speed;
                                                                }}
                                                                className={cn(
                                                                    "text-[10px] px-2 py-0.5 rounded-full font-bold transition-all min-w-[32px]",
                                                                    playbackSpeed === speed ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600"
                                                                )}
                                                            >
                                                                {speed}x
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Audio Progress Slider (Draggable Cursor) */}
                                                <div className="w-full max-w-sm flex items-center gap-3 px-4 mt-2 mb-2">
                                                    <span className="text-[10px] font-mono text-stone-400 w-8 text-right">
                                                        {(currentAudioTime / 1000).toFixed(1)}s
                                                    </span>
                                                    <input
                                                        type="range"
                                                        min={0}
                                                        max={audioDuration || 100}
                                                        value={currentAudioTime}
                                                        onChange={handleSeek}
                                                        className="flex-1 h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-600 transition-all border-none outline-none"
                                                        style={{
                                                            background: `linear-gradient(to right, #6366f1 ${(currentAudioTime / (audioDuration || 1)) * 100}%, #e7e5e4 ${(currentAudioTime / (audioDuration || 1)) * 100}%)`
                                                        }}
                                                    />
                                                    <span className="text-[10px] font-mono text-stone-400 w-8 text-left">
                                                        {(audioDuration / 1000).toFixed(1)}s
                                                    </span>
                                                </div>

                                                {/* Interactive Text & Active Word Popover */}
                                                {!isBlindMode && (
                                                    <div className="relative w-full max-w-4xl mx-auto mt-4 px-4">
                                                        <motion.div
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: "auto" }}
                                                            className="text-left text-justify font-newsreader italic text-2xl leading-relaxed text-stone-700 tracking-wide"
                                                        >
                                                            {renderInteractiveText(drillData.reference_english)}
                                                        </motion.div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <h3 className="text-2xl md:text-3xl font-newsreader font-medium text-stone-900 leading-normal md:leading-relaxed px-4">
                                                {drillData.chinese}
                                                {/* Speed Control (Translation Mode - for reading out loud maybe? No, usually for listening) */}
                                            </h3>
                                        )}

                                        {/* Target Vocab Chips */}
                                        <div className="flex flex-wrap justify-center gap-3 mt-4">
                                            {vocabList.map((vocab, i) => (
                                                <span
                                                    key={i}
                                                    onClick={(e) => handleWordClick(e, vocab)}
                                                    className="px-5 py-2 rounded-full bg-stone-50 border border-stone-200 text-stone-600 font-newsreader italic text-lg hover:bg-stone-100 hover:text-stone-900 cursor-pointer transition-colors"
                                                >
                                                    {vocab}
                                                </span>
                                            ))}
                                        </div>
                                    </motion.div>
                                </div>

                                {/* Divider */}
                                <div className="w-full max-w-xs mx-auto h-px bg-gradient-to-r from-transparent via-stone-200 to-transparent my-8" />

                                {/* Interactive Area */}
                                {!drillFeedback ? (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.1 }}
                                        className="w-full space-y-6"
                                    >
                                        <div className="relative group">
                                            {mode === "listening" ? (
                                                <div className="flex flex-col items-center justify-center gap-4 py-4 min-h-[160px]">
                                                    {/* Listening Mode: Big Mic Button & Live Transcript */}

                                                    {whisperProcessing ? (
                                                        <div className="flex flex-col items-center animate-pulse gap-4">
                                                            <div className="w-24 h-24 rounded-full bg-indigo-50 border-4 border-indigo-100 flex items-center justify-center">
                                                                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                                                            </div>
                                                            <p className="text-indigo-400 font-bold tracking-wide text-sm uppercase">Transcribing...</p>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={whisperRecording ? stopRecognition : startRecognition}
                                                            className={cn(
                                                                "relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl",
                                                                whisperRecording
                                                                    ? "bg-rose-500 shadow-rose-500/40 scale-110"
                                                                    : "bg-white hover:bg-stone-50 shadow-stone-200/50 hover:scale-105 border border-stone-100"
                                                            )}
                                                        >
                                                            {whisperRecording ? (
                                                                <>
                                                                    <div className="absolute inset-0 rounded-full border-4 border-rose-200 animate-ping" />
                                                                    <div className="w-8 h-8 bg-white rounded-lg shadow-sm" />
                                                                </>
                                                            ) : (
                                                                <Mic className="w-10 h-10 text-stone-700" />
                                                            )}
                                                        </button>
                                                    )}

                                                    {/* Live Transcript Preview */}
                                                    <div className="max-w-2xl w-full text-center min-h-[3rem]">
                                                        {whisperResult.text || whisperRecording ? (
                                                            <p className={cn(
                                                                "text-2xl font-newsreader leading-relaxed transition-all",
                                                                whisperRecording ? "text-stone-400 italic" : "text-stone-800"
                                                            )}>
                                                                "{whisperResult.text || "Listening..."}"
                                                            </p>
                                                        ) : (
                                                            <p className="text-stone-400 text-sm">Tap the microphone to speak your answer</p>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                // Translation Mode: Textarea (Original)
                                                <>
                                                    <textarea
                                                        value={userTranslation}
                                                        onChange={(e) => setUserTranslation(e.target.value)}
                                                        placeholder="Enter your English translation..."
                                                        className="w-full min-h-[160px] p-6 text-xl font-newsreader bg-white/50 border border-stone-200 rounded-3xl focus:ring-4 ring-stone-100 focus:border-stone-400 transition-all resize-none placeholder:text-stone-300 text-stone-800 shadow-sm group-hover:shadow-md outline-none"
                                                        spellCheck={false}
                                                        autoFocus
                                                    />

                                                    <div className="absolute bottom-4 right-4 flex items-center gap-3">
                                                        <button
                                                            onClick={handleMagicHint}
                                                            className="h-10 px-4 rounded-xl bg-amber-100/50 text-amber-700 hover:bg-amber-100 flex items-center gap-2 transition-all font-bold text-sm"
                                                            title="Auto-Complete Hint"
                                                        >
                                                            <Wand2 className="w-4 h-4" />
                                                            Hint
                                                        </button>

                                                        <button
                                                            onClick={() => setIsTutorOpen(!isTutorOpen)}
                                                            className="w-10 h-10 rounded-full bg-stone-100 text-stone-500 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center transition-all shadow-sm"
                                                            title="Ask AI Tutor"
                                                        >
                                                            <HelpCircle className="w-5 h-5" />
                                                        </button>

                                                        <button
                                                            onClick={handleSubmitDrill}
                                                            disabled={!userTranslation.trim() || isSubmittingDrill}
                                                            className="bg-stone-900 hover:bg-black text-white px-6 py-2.5 rounded-xl font-bold shadow-xl shadow-stone-900/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
                                                        >
                                                            {isSubmittingDrill ? (
                                                                <Sparkles className="w-4 h-4 animate-spin" />
                                                            ) : (
                                                                <Send className="w-4 h-4" />
                                                            )}
                                                            Check
                                                        </button>
                                                    </div>
                                                </>
                                            )}

                                            {/* AI Tutor Cloud (Shared) */}
                                            <AnimatePresence>
                                                {isTutorOpen && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                                        className="absolute bottom-20 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-stone-100 p-4 z-20 flex flex-col gap-3"
                                                    >
                                                        <div className="flex items-center justify-between pb-2 border-b border-stone-50">
                                                            <span className="text-xs font-bold text-indigo-500 flex items-center gap-1">
                                                                <MessageCircle className="w-3 h-3" /> AI Tutor
                                                            </span>
                                                            <button onClick={() => setIsTutorOpen(false)} className="text-stone-400 hover:text-stone-600">
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>

                                                        {tutorAnswer ? (
                                                            <div className="bg-indigo-50/50 p-3 rounded-lg text-sm text-stone-700 animate-in fade-in">
                                                                {tutorAnswer}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-stone-400">Ask for a hint about vocab or grammar...</p>
                                                        )}

                                                        <div className="relative">
                                                            <input
                                                                type="text"
                                                                value={tutorQuery}
                                                                onChange={(e) => setTutorQuery(e.target.value)}
                                                                onKeyDown={(e) => e.key === 'Enter' && handleAskTutor()}
                                                                placeholder="e.g. 'How do I start?'"
                                                                className="w-full bg-stone-50 border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                                            />
                                                            <button
                                                                onClick={handleAskTutor}
                                                                disabled={isAskingTutor || !tutorQuery.trim()}
                                                                className="absolute right-2 top-1.5 text-indigo-500 disabled:opacity-30"
                                                            >
                                                                {isAskingTutor ? <Sparkles className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="max-w-4xl mx-auto w-full space-y-8"
                                    >
                                        {/* Score Header */}
                                        <div className="flex flex-col items-center gap-2">
                                            <div className={cn(
                                                "text-6xl font-bold font-newsreader",
                                                drillFeedback.score >= 8 ? "text-emerald-600" :
                                                    drillFeedback.score >= 6 ? "text-amber-500" : "text-rose-500"
                                            )}>
                                                {drillFeedback.score}
                                                <span className="text-2xl text-stone-300 font-normal">/10</span>
                                            </div>
                                            <p className="text-stone-500 font-medium">Accuracy Score</p>
                                        </div>

                                        {/* Revision View */}
                                        <div className="bg-white/80 p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-stone-200/50 border border-stone-100">
                                            <div className="flex items-center justify-between mb-6">
                                                <div className="flex items-center gap-3 text-stone-400 text-sm font-bold uppercase tracking-wider">
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                    Smart Revision
                                                </div>
                                                <button
                                                    onClick={playAudio}
                                                    className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center transition-all"
                                                    title="Listen to Correct Version"
                                                >
                                                    <Volume2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                            {renderDiff()}

                                            {/* Coach's Feedback Section */}
                                            {drillFeedback.feedback && drillFeedback.feedback.length > 0 && (
                                                <div className="mt-8 pt-6 border-t border-stone-100">
                                                    <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                        <Sparkles className="w-4 h-4" />
                                                        Coach's Analysis
                                                    </h4>
                                                    <div className="space-y-3">
                                                        {drillFeedback.feedback.map((point, i) => (
                                                            <div key={i} className="flex gap-3 text-stone-600 leading-relaxed font-medium">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
                                                                <p>{point}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Golden Translation (Collapsed/Simplified since we have Play in Revision) */}
                                        {/* We can keep it if user wants to see the raw text without diff marks, but Diff is usually enough. 
                                            Let's keep it but make it less dominant or merge it? 
                                            User asked for "Detailed Revision", so Diff is key. 
                                            Let's keep the Golden Translation box as a "Clean Read" reference.
                                        */}
                                        {/* Golden Translation Removed */}

                                        {/* Action Buttons */}
                                        <div className="flex justify-center gap-4 pt-1">
                                            <button
                                                onClick={() => {
                                                    setDrillFeedback(null);
                                                    setUserTranslation("");
                                                    setIsSubmittingDrill(false);
                                                    setWordPopup(null);
                                                    // Don't clear drillData, so we retry the same one
                                                }}
                                                className="px-6 py-3 bg-transparent border-2 border-stone-200 rounded-full text-stone-500 font-bold hover:border-stone-300 hover:text-stone-700 hover:bg-stone-50 transition-all duration-300 text-sm"
                                            >
                                                Try Again
                                            </button>

                                            <button
                                                onClick={() => handleGenerateDrill(difficulty)}
                                                className="group relative px-6 py-3 bg-stone-900 border border-stone-900 rounded-full text-white font-bold hover:shadow-xl hover:shadow-indigo-500/20 hover:scale-105 transition-all duration-300 overflow-hidden text-sm"
                                            >
                                                <span className="relative flex items-center gap-2">
                                                    <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                                                    Next Challenge
                                                </span>
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </motion.div>
            </motion.div>
            {/* Render WordPopup Portal/Overlay if active */}
            {wordPopup && (
                <WordPopup
                    key="word-popup"
                    popup={wordPopup}
                    onClose={() => setWordPopup(null)}
                />
            )}
        </AnimatePresence>
    );
}
