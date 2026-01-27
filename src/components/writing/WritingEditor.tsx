"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, RefreshCw, Send, X, CheckCircle2, ArrowRight, HelpCircle, MessageCircle, Wand2, Mic, Play, Pause, Volume2, Globe, Headphones, Eye, EyeOff, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import * as Diff from 'diff';
import { WordPopup, PopupState } from "../reading/WordPopup";

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

    // Voice Input State
    const [isListening, setIsListening] = useState(false);

    // Ask Tutor State
    const [isTutorOpen, setIsTutorOpen] = useState(false);
    const [tutorQuery, setTutorQuery] = useState("");
    const [tutorAnswer, setTutorAnswer] = useState<string | null>(null);
    const [isAskingTutor, setIsAskingTutor] = useState(false);

    // Blind Mode State
    const [isBlindMode, setIsBlindMode] = useState(true);

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
                        rate: "+15%" // Default speed
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

        if (isListening) {
            setIsListening(false);
            return;
        }

        setIsListening(true);
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

        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognition.start();
    };

    // --- Drill Handlers ---
    const handleGenerateDrill = async (difficulty: "standard" | "easier" | "harder" = "standard") => {
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
                    difficultyModifier: difficulty,
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
                    original_chinese: drillData.chinese
                }),
            });
            const data = await response.json();
            setDrillFeedback(data);
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

    // --- Diff Rendering ---
    const renderDiff = () => {
        if (!drillData || !drillFeedback) return null;
        const diffs = Diff.diffWords(userTranslation, drillData.reference_english);

        return (
            <div className="font-newsreader text-2xl leading-relaxed text-stone-800">
                {diffs.map((part, i) => {
                    const isChange = part.added || part.removed;
                    return (
                        <span
                            key={i}
                            className={cn(
                                isChange ? "mx-1 px-1 rounded transition-all duration-500" : "",
                                part.added ? "bg-emerald-100/80 text-emerald-800 shadow-sm border-b-2 border-emerald-400 font-medium" : "",
                                part.removed ? "bg-rose-50 text-rose-300 line-through decoration-rose-300 decoration-2 opacity-60" : ""
                            )}
                        >
                            {part.value}
                        </span>
                    );
                })}
            </div>
        );
    };

    // Mounting
    useEffect(() => {
        if (!drillData && !isGeneratingDrill) {
            handleGenerateDrill("standard");
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
                    <div className="flex items-center justify-between p-6 md:p-8 border-b border-stone-100/50 shrink-0">
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

                    {/* Content Body */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12 relative flex flex-col items-center">
                        {isGeneratingDrill && !drillData ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-6 animate-pulse mt-32">
                                <div className="w-16 h-16 rounded-full border-4 border-stone-200 border-t-stone-800 animate-spin" />
                                <p className="text-stone-400 font-newsreader italic text-xl">
                                    {mode === "translation" ? "Crafting phrase..." : "Encoding audio stream..."}
                                </p>
                            </div>
                        ) : drillData ? (
                            <div className="max-w-3xl w-full space-y-8 pb-32">
                                {/* Source / Listening Area */}
                                <div className="space-y-6 text-center w-full">
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="relative flex flex-col items-center gap-6 w-full"
                                    >
                                        {mode === "listening" ? (
                                            <div className="w-full flex flex-col items-center justify-center relative">
                                                {/* Play Button */}
                                                <button
                                                    onClick={playAudio}
                                                    disabled={isPlaying}
                                                    className="relative w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white flex items-center justify-center shadow-xl shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-80 disabled:scale-100 mb-6 group overflow-hidden"
                                                >
                                                    {isPlaying ? (
                                                        <>
                                                            <Volume2 className="w-10 h-10 relative z-10" />
                                                            <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-50">
                                                                <div className="w-1 h-8 bg-white animate-pulse" style={{ animationDelay: "0ms" }} />
                                                                <div className="w-1 h-12 bg-white animate-pulse" style={{ animationDelay: "200ms" }} />
                                                                <div className="w-1 h-6 bg-white animate-pulse" style={{ animationDelay: "100ms" }} />
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <Play className="w-10 h-10 ml-1 relative z-10" />
                                                    )}
                                                </button>

                                                {/* Blind Toggle */}
                                                <div className="flex items-center gap-3">
                                                    <p className="text-stone-500 font-medium">Listen and type what you hear</p>
                                                    <button
                                                        onClick={() => setIsBlindMode(!isBlindMode)}
                                                        className={cn(
                                                            "text-xs px-2.5 py-1 rounded-full font-bold transition-all flex items-center gap-1.5",
                                                            isBlindMode ? "bg-stone-100 text-stone-500 hover:bg-stone-200" : "bg-indigo-100 text-indigo-600"
                                                        )}
                                                    >
                                                        {isBlindMode ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                        {isBlindMode ? "Blind Mode" : "Text Revealed"}
                                                    </button>
                                                </div>

                                                {/* Audio Progress Slider (Draggable Cursor) */}
                                                <div className="w-full max-w-sm flex items-center gap-3 px-4 mt-6 mb-2">
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
                                                    <div className="relative w-full max-w-4xl mx-auto mt-8 px-6">
                                                        <motion.div
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: "auto" }}
                                                            className="text-left text-justify font-newsreader italic text-3xl leading-loose text-stone-700 tracking-wide"
                                                        >
                                                            {renderInteractiveText(drillData.reference_english)}
                                                        </motion.div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <h3 className="text-3xl md:text-4xl font-newsreader font-medium text-stone-900 leading-normal md:leading-relaxed px-4">
                                                {drillData.chinese}
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

                                {/* Controls: Regenerate / Difficulty */}
                                {!drillFeedback && (
                                    <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 mt-8">
                                        <button
                                            onClick={() => handleGenerateDrill("easier")}
                                            className="px-4 py-2 rounded-full text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors"
                                        >
                                            Too Hard
                                        </button>
                                        <button
                                            onClick={() => handleGenerateDrill("standard")}
                                            className="p-2 rounded-full text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors"
                                            title="Regenerate"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleGenerateDrill("harder")}
                                            className="px-4 py-2 rounded-full text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors"
                                        >
                                            Too Easy
                                        </button>
                                    </div>
                                )}

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
                                            <textarea
                                                value={userTranslation}
                                                onChange={(e) => setUserTranslation(e.target.value)}
                                                placeholder={mode === "listening" ? "Type what you hear..." : "Enter your English translation..."}
                                                className="w-full min-h-[160px] p-6 text-xl font-newsreader bg-white/50 border border-stone-200 rounded-3xl focus:ring-4 ring-stone-100 focus:border-stone-400 transition-all resize-none placeholder:text-stone-300 text-stone-800 shadow-sm group-hover:shadow-md outline-none"
                                                spellCheck={false}
                                                autoFocus
                                            />
                                            {/* Action Buttons */}
                                            <div className="absolute bottom-4 right-4 flex items-center gap-3">
                                                {/* Voice Input Trigger (Listening Mode) */}
                                                {mode === "listening" && (
                                                    <button
                                                        onClick={toggleVoiceInput}
                                                        className={cn(
                                                            "h-10 px-4 rounded-xl flex items-center gap-2 transition-all font-bold text-sm",
                                                            isListening ? "bg-rose-100 text-rose-600 animate-pulse" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                                                        )}
                                                        title="Dictate"
                                                    >
                                                        <Mic className="w-4 h-4" />
                                                        {isListening ? "Listening..." : "Dictate"}
                                                    </button>
                                                )}

                                                {/* Magic Hint Trigger */}
                                                <button
                                                    onClick={handleMagicHint}
                                                    className="h-10 px-4 rounded-xl bg-amber-100/50 text-amber-700 hover:bg-amber-100 flex items-center gap-2 transition-all font-bold text-sm"
                                                    title="Auto-Complete Hint"
                                                >
                                                    <Wand2 className="w-4 h-4" />
                                                    Hint
                                                </button>

                                                {/* Ask Tutor Trigger */}
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

                                            {/* AI Tutor Cloud */}
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
                                            <div className="flex items-center gap-3 mb-6 text-stone-400 text-sm font-bold uppercase tracking-wider">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                Smart Revision
                                            </div>
                                            {renderDiff()}
                                        </div>

                                        {/* Golden Translation */}
                                        <div className="bg-stone-900 text-stone-200 p-8 rounded-[2rem] shadow-2xl shadow-stone-900/10">
                                            <div className="flex items-center justify-between mb-4">
                                                <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">Golden Translation</p>
                                                <button
                                                    onClick={playAudio}
                                                    className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 flex items-center justify-center transition-all"
                                                >
                                                    <Volume2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="text-xl font-newsreader italic font-light leading-relaxed">
                                                "{renderInteractiveText(drillData.reference_english)}"
                                            </div>
                                        </div>

                                        {/* Feedback Grid */}
                                        <div className="grid md:grid-cols-2 gap-4">
                                            {drillFeedback.feedback.map((comment, i) => (
                                                <div key={i} className="bg-white/40 p-5 rounded-2xl border border-stone-100 flex gap-3 items-start">
                                                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-stone-400 shrink-0" />
                                                    <p className="text-stone-600 text-sm leading-relaxed">{comment}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Action */}
                                        <div className="flex justify-center pt-8">
                                            <button
                                                onClick={() => handleGenerateDrill("standard")}
                                                className="group relative px-8 py-4 bg-white border border-stone-200 rounded-full text-stone-800 font-bold hover:shadow-xl hover:shadow-stone-200/50 hover:border-stone-300 transition-all duration-300 overflow-hidden"
                                            >
                                                <div className="absolute inset-0 bg-stone-50 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <span className="relative flex items-center gap-3">
                                                    <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
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
