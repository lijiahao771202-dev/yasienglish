'use client';

// [IMPORTS]
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, RefreshCw, CheckCircle, AlertCircle, Wand2, Mic, Volume2, MessageCircle, Send, X, Play, Square, RotateCcw, Volume1, FileAudio } from 'lucide-react';
import axios from 'axios';
import { cn } from '@/lib/utils';
import * as Diff from 'diff';
import { WordPopup, PopupState } from '@/components/reading/WordPopup';

// [TYPES]
type PracticeMode = 'INPUT' | 'REVIEW' | 'RETRY' | 'ORAL';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

// [COMPONENTS]

// 1. Diff View (Moved inline into OralPractice)

// 2. Chat Interface
function ChatInterface({ context, onClose }: { context: string, onClose: () => void }) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;
        const userMsg = { role: 'user' as const, content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const res = await axios.post('/api/ai/translation', {
                action: 'chat',
                history: messages,
                question: userMsg.content,
                context
            });
            setMessages(prev => [...prev, { role: 'assistant', content: res.data.answer }]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 bg-white/95 dark:bg-black/90 backdrop-blur-xl z-20 flex flex-col p-6 animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-stone-100 dark:border-white/10">
                <h3 className="font-bold text-stone-800 dark:text-white flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-indigo-500" />
                    AI 答疑助手
                </h3>
                <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full dark:hover:bg-white/10">
                    <X className="w-5 h-5 text-stone-500" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 mb-4" ref={scrollRef}>
                {messages.length === 0 && (
                    <div className="text-center text-stone-400 mt-10">
                        <p>对当前的翻译或修正有疑问？</p>
                        <p className="text-sm">例如：“为什么要用 past tense？”</p>
                    </div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={cn(
                        "p-3 rounded-2xl max-w-[85%] text-sm",
                        m.role === 'user'
                            ? "bg-indigo-600 text-white ml-auto rounded-tr-none"
                            : "bg-stone-100 dark:bg-white/10 text-stone-800 dark:text-stone-200 mr-auto rounded-tl-none"
                    )}>
                        {m.content}
                    </div>
                ))}
                {loading && (
                    <div className="flex gap-1 ml-4">
                        <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" />
                        <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce delay-100" />
                        <span className="w-2 h-2 bg-stone-400 rounded-full animate-bounce delay-200" />
                    </div>
                )}
            </div>

            <div className="flex gap-2">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="输入你的问题..."
                    className="flex-1 bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}

// 3. Oral Practice (Refined)
function OralPractice({ text, onComplete }: { text: string, onComplete: () => void }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
    const [isPlayingUserAudio, setIsPlayingUserAudio] = useState(false);

    // Analysis
    const [analysisResult, setAnalysisResult] = useState<{ score: number, transcript: string, feedback: string, diff?: any[] } | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Playback State
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Word Popup State
    const [popup, setPopup] = useState<PopupState | null>(null);

    // Refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const userAudioRef = useRef<HTMLAudioElement | null>(null);
    const textRef = useRef<HTMLDivElement>(null);

    // Load TTS Audio
    useEffect(() => {
        const loadAudio = async () => {
            try {
                const res = await fetch('/api/tts', {
                    method: 'POST',
                    body: JSON.stringify({ text }),
                });
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);

                audio.onended = () => {
                    setIsPlaying(false);
                    setCurrentTime(0); // Reset for replay
                };
                audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
                audio.onloadedmetadata = () => setDuration(audio.duration);
                audioRef.current = audio;
            } catch (err) {
                console.error('TTS Error', err);
            }
        };
        loadAudio();

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, [text]);

    const togglePlay = () => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            // Stop user audio if playing
            if (userAudioRef.current && isPlayingUserAudio) {
                userAudioRef.current.pause();
                setIsPlayingUserAudio(false);
            }
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    const toggleUserPlay = () => {
        if (!userAudioRef.current) return;

        if (isPlayingUserAudio) {
            userAudioRef.current.pause();
            setIsPlayingUserAudio(false);
        } else {
            // Stop TTS if playing
            if (audioRef.current && isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
            }
            userAudioRef.current.play();
            setIsPlayingUserAudio(true);
        }
    };

    const seekToPercent = (percent: number) => {
        if (audioRef.current && duration > 0) {
            const time = Math.max(0, Math.min(percent, 1)) * duration;
            audioRef.current.currentTime = time;
            if (!isPlaying) {
                audioRef.current.play();
                setIsPlaying(true);
            }
        }
    };

    const handleWordClick = (e: React.MouseEvent, word: string) => {
        e.stopPropagation();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.bottom;
        setPopup({ word: word.replace(/[^a-zA-Z]/g, ''), context: text, x, y });
    };

    const handleSeekClick = (e: React.MouseEvent) => {
        if (!textRef.current || isRecording) return;
        if (document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(e.clientX, e.clientY);
            if (range && textRef.current.contains(range.startContainer)) {
                const spans = Array.from(textRef.current.querySelectorAll('span'));
                const clickedSpanIndex = spans.findIndex(s => s.contains(range.startContainer));
                if (clickedSpanIndex !== -1) {
                    const percent = clickedSpanIndex / spans.length;
                    seekToPercent(percent);
                    return;
                }
            }
        }
        const rect = textRef.current.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        seekToPercent(percent);
    };

    const startRecording = async () => {
        chunksRef.current = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                setAudioBlob(blob);
                setUserAudioUrl(url);

                // Init user audio ref
                const userAudio = new Audio(url);
                userAudio.onended = () => setIsPlayingUserAudio(false);
                userAudioRef.current = userAudio;

                analyzeAudio(blob);
            };

            recorder.start();
            setIsRecording(true);
            mediaRecorderRef.current = recorder;
            if (isPlaying && audioRef.current) {
                audioRef.current.pause();
                setIsPlaying(false);
            }
        } catch (err) {
            console.error("Microphone access denied", err);
            alert("请允许访问麦克风以进行口语练习");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
    };

    const analyzeAudio = async (blob: Blob) => {
        setIsAnalyzing(true);
        setAnalysisResult(null);
        try {
            const formData = new FormData();
            formData.append('audio', blob);
            formData.append('text', text);
            const res = await axios.post('/api/ai/score', formData);
            setAnalysisResult(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const words = text.split(' ');
    // Important: Use linear word progression for smoother visual tracking
    // If we have N words, and progress is P% (0-1), then current index is floor(P*N)
    const currentWordIndex = Math.floor((currentTime / (duration || 1)) * words.length);

    return (
        <div className="text-center space-y-8 animate-in fade-in zoom-in duration-500 relative">

            {popup && createPortal(
                <AnimatePresence>
                    <WordPopup popup={popup} onClose={() => setPopup(null)} />
                </AnimatePresence>,
                document.body
            )}

            <div className="space-y-2">
                <h3 className="text-xl font-bold text-stone-800 dark:text-white flex items-center justify-center gap-2">
                    <Mic className="w-5 h-5 text-indigo-500" />
                    Oral Shadowing
                </h3>
                <p className="text-stone-500 text-sm">点击单词查词，点击句子调整进度</p>
            </div>

            {/* MAIN TEXT AREA - Transforms into Revision Mode */}
            <div
                ref={textRef}
                onClick={handleSeekClick}
                className={cn(
                    "p-8 bg-indigo-50/50 dark:bg-white/5 rounded-3xl text-xl font-medium text-stone-700 dark:text-indigo-200 leading-loose font-serif text-left cursor-text select-text transition-all duration-500 flex flex-wrap gap-x-2 gap-y-2 shadow-inner border border-stone-100 dark:border-white/5 relative overflow-hidden group",
                    isRecording && "opacity-50 pointer-events-none ring-4 ring-indigo-500/20"
                )}
            >
                {analysisResult?.diff ? (
                    // 1. REVISION MODE VIEW (Inline)
                    analysisResult.diff.map((part: any, i: number) => {
                        if (part.status === 'correct') {
                            return (
                                <span key={i} className="text-green-600 dark:text-green-400 py-1 transition-colors">
                                    {part.word}
                                </span>
                            );
                        } else {
                            // Incorrect / Missing
                            return (
                                <span key={i} className="relative inline-block cursor-help py-1">
                                    {/* Red Strikethrough for what should have been said */}
                                    <span className="text-red-400/80 line-through decoration-red-300 decoration-2 decoration-wavy mx-0.5">
                                        {part.word}
                                    </span>

                                    {/* Heard Transcript Popup (Always visible or on hover? Hover is cleaner) */}
                                    {/* Let's double check requirement: "Revision mode should be in the original text" */}
                                    {/* Strikethrough is standard for "correction". */}

                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-stone-900 text-white text-xs px-2 py-1.5 rounded-lg shadow-xl whitespace-nowrap z-10 opacity-0 hover:opacity-100 transition-opacity">
                                        heard: <span className="text-red-200 font-mono font-bold">"{part.transcript}"</span>
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-stone-900"></div>
                                    </span>
                                </span>
                            );
                        }
                    })
                ) : (
                    // 2. NORMAL / KARAOKE VIEW
                    words.map((word, i) => {
                        const isPlayed = i <= currentWordIndex && isPlaying && duration > 0;
                        return (
                            <span
                                key={i}
                                onClick={(e) => handleWordClick(e, word)}
                                className={cn(
                                    "cursor-pointer rounded-md px-1 py-0.5 transition-colors duration-200", // Increased duration for smoothness
                                    // Removed font-bold to prevent layout shift. Using color + subtle bg.
                                    isPlayed
                                        ? "text-indigo-700 bg-indigo-100/80 shadow-sm"  // Highlight style
                                        : "text-stone-700 hover:bg-stone-100/50" // Normal style
                                )}
                            >
                                {word}
                            </span>
                        );
                    })
                )}

                {/* Loading overlay for analysis */}
                {isAnalyzing && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                        <div className="flex gap-2 items-center px-4 py-2 bg-white shadow-xl rounded-full text-indigo-600 font-bold border border-indigo-50">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Analyzing Speech...
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-8 items-center pt-2">
                {/* Play TTS */}
                <button
                    onClick={togglePlay}
                    disabled={isRecording}
                    className={cn(
                        "w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all disabled:opacity-50 border",
                        isPlaying
                            ? "bg-indigo-50 text-indigo-600 border-indigo-200"
                            : "bg-white text-stone-500 hover:text-indigo-600 hover:scale-105 border-stone-100"
                    )}
                    title={isPlaying ? "Pause Original" : "Listen Original"}
                >
                    {isPlaying ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-6 h-6 ml-1" />}
                </button>

                {/* Mic Trigger */}
                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={cn(
                        "w-20 h-20 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-105 transition-all ring-4 ring-offset-4 ring-offset-white/0",
                        isRecording
                            ? "bg-rose-500 ring-rose-100 shadow-rose-500/30 animate-pulse"
                            : "bg-indigo-600 ring-indigo-50 shadow-indigo-600/30"
                    )}
                >
                    {isRecording ? <Square className="w-8 h-8 fill-current" /> : <Mic className="w-8 h-8" />}
                </button>

                {/* Play User Recording (New!) */}
                <button
                    onClick={toggleUserPlay}
                    disabled={!userAudioUrl || isRecording}
                    className={cn(
                        "w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all disabled:opacity-30 border",
                        isPlayingUserAudio
                            ? "bg-green-50 text-green-600 border-green-200"
                            : "bg-white text-stone-500 hover:text-green-600 hover:scale-105 border-stone-100"
                    )}
                    title="Play My Recording"
                >
                    {isPlayingUserAudio ? <Square className="w-5 h-5 fill-current" /> : <FileAudio className="w-6 h-6" />}
                </button>
            </div>


            {/* Feedback Score (Cleaned up, removed redundant diff box) */}
            {analysisResult && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center space-y-4"
                >
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl border-4 shadow-sm",
                            analysisResult.score >= 80 ? "border-green-400 bg-green-50 text-green-600" : "border-amber-400 bg-amber-50 text-amber-600"
                        )}>
                            {analysisResult.score}
                        </div>
                        <div className="text-left">
                            <h4 className="font-bold text-stone-800">Feedback</h4>
                            <p className="text-sm text-stone-500 max-w-[200px] leading-snug">
                                {analysisResult.feedback}
                            </p>
                        </div>
                    </div>

                    {analysisResult.score >= 60 ? (
                        <button onClick={onComplete} className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-600/20 hover:bg-green-700 transition-all flex items-center justify-center gap-2">
                            通关！挑战下一题 <ArrowRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <div className="text-center text-xs text-rose-500 font-medium bg-rose-50 px-3 py-1 rounded-full">
                            请再试一次，注意红色标记的单词
                        </div>
                    )}
                </motion.div>
            )}
        </div>
    );
}

// 4. Main Component - DIff Import kept for other modes
function DiffView({ original, revised }: { original: string, revised: string }) {
    const diff = Diff.diffWords(original, revised);

    return (
        <div className="text-lg leading-relaxed font-medium">
            {diff.map((part, i) => {
                const color = part.added ? 'text-green-600 bg-green-50 px-1 rounded' :
                    part.removed ? 'text-red-500 bg-red-50 px-1 rounded line-through decoration-2 decoration-red-500/50' :
                        'text-stone-700 dark:text-stone-300';
                return <span key={i} className={color}>{part.value}</span>;
            })}
        </div>
    );
}

// Export default
export default function TranslationPractice() {
    const [loading, setLoading] = useState(false);
    const [chinese, setChinese] = useState<string | null>(null);
    const [translation, setTranslation] = useState('');
    const [result, setResult] = useState<{ score: number; feedback: string; revised_text?: string } | null>(null);

    // Modes
    const [mode, setMode] = useState<PracticeMode>('INPUT');
    const [showChat, setShowChat] = useState(false);

    const generateSentence = async () => {
        setLoading(true);
        setResult(null);
        setMode('INPUT');
        setTranslation('');
        try {
            const response = await axios.post('/api/ai/translation', { action: 'generate' });
            setChinese(response.data.chinese);
        } catch (error) {
            console.error('Failed to generate sentence', error);
        } finally {
            setLoading(false);
        }
    };

    const submitTranslation = async () => {
        if (!chinese || !translation) return;
        setLoading(true);
        try {
            const response = await axios.post('/api/ai/translation', {
                action: 'score',
                text: translation,
                context: chinese,
            });
            setResult(response.data);

            // If perfect score, skip retry
            if (response.data.score === 100) {
                setMode('ORAL');
            } else {
                setMode('REVIEW');
            }
        } catch (error) {
            console.error('Failed to score translation', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRetrySubmit = () => {
        if (!result?.revised_text) return;

        // Simple normalization for check
        const cleanInput = translation.trim().toLowerCase().replace(/[.,!?;:]/g, '');
        const cleanTarget = result.revised_text.trim().toLowerCase().replace(/[.,!?;:]/g, '');

        if (cleanInput === cleanTarget) {
            setMode('ORAL');
        } else {
            alert("请仔细核对，确保与正确答案一致以加深记忆。");
        }
    };

    return (
        <div className="relative w-full max-w-2xl mx-auto p-6 md:p-12 min-h-[600px] flex items-center justify-center">
            {/* Background ... */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
                <motion.div
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[100px] opacity-70"
                />
                <motion.div
                    animate={{ scale: [1.2, 1, 1.2], rotate: [0, -90, 0] }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-purple-500/20 rounded-full blur-[100px] opacity-70"
                />
            </div>

            {/* Chat Overlay */}
            <AnimatePresence>
                {showChat && result && chinese && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="absolute inset-0 z-50 rounded-3xl overflow-hidden shadow-2xl"
                    >
                        <ChatInterface context={`Chinese: ${chinese}\nUser: ${translation}\nRevised: ${result.revised_text}`} onClose={() => setShowChat(false)} />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
                {!chinese ? (
                    // Start Screen
                    <motion.div key="start" className="text-center">
                        <div className="mb-8 relative inline-block">
                            <div className="absolute inset-0 bg-indigo-500/30 blur-xl rounded-full"></div>
                            <div className="relative z-10 w-24 h-24 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl rotate-3 hover:rotate-6 transition-transform">
                                <Wand2 className="w-12 h-12 text-white" strokeWidth={1.5} />
                            </div>
                        </div>
                        <h2 className="text-4xl font-light text-slate-800 dark:text-white mb-4 tracking-tight">中译英魔鬼训练</h2>
                        <p className="text-slate-500 mb-8 max-w-sm mx-auto">模拟真实雅思口语场景，从翻译到跟读，全方位提升你的英语表达能力。</p>
                        <button onClick={generateSentence} disabled={loading} className="group relative px-8 py-4 bg-indigo-600 text-white rounded-2xl font-medium text-lg shadow-lg shadow-indigo-500/30 overflow-hidden transition-all hover:shadow-indigo-500/50 hover:scale-[1.02] w-full max-w-xs">
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                {loading ? "生成场景中..." : "开始挑战"}
                                {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                            </span>
                        </button>
                    </motion.div>
                ) : (
                    <motion.div key="practice" className="w-full">
                        <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden transition-all duration-500">

                            {/* Header */}
                            <div className="mb-6 flex justify-between items-start">
                                <div>
                                    <span className={cn(
                                        "text-xs font-bold tracking-widest uppercase px-2 py-1 rounded",
                                        mode === 'INPUT' ? "bg-indigo-100 text-indigo-600" :
                                            mode === 'REVIEW' ? "bg-amber-100 text-amber-600" :
                                                mode === 'RETRY' ? "bg-rose-100 text-rose-600" :
                                                    "bg-green-100 text-green-600"
                                    )}>
                                        {mode === 'INPUT' ? "Step 1: Translate" :
                                            mode === 'REVIEW' ? "Step 2: Review" :
                                                mode === 'RETRY' ? "Step 3: Correction" :
                                                    "Step 4: Shadowing"}
                                    </span>
                                    <h3 className="text-2xl font-medium text-slate-800 dark:text-white mt-3 leading-normal">{chinese}</h3>
                                </div>
                                <button onClick={generateSentence} className="p-2 hover:bg-black/5 rounded-lg text-slate-400 transition-colors">
                                    <RotateCcw className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Mode: INPUT */}
                            {mode === 'INPUT' && (
                                <div className="animate-in fade-in">
                                    <textarea
                                        value={translation}
                                        onChange={(e) => setTranslation(e.target.value)}
                                        placeholder="输入你的英文翻译..."
                                        disabled={loading}
                                        className="w-full bg-white/50 dark:bg-black/20 border-2 border-transparent focus:border-indigo-400/50 rounded-2xl p-4 text-lg min-h-[120px]"
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submitTranslation())}
                                        autoFocus
                                    />
                                    <div className="mt-4 flex justify-end">
                                        <button onClick={submitTranslation} disabled={!translation.trim() || loading} className="px-6 py-3 bg-slate-900 text-white rounded-xl shadow-lg flex items-center gap-2 hover:scale-[1.02] transition-transform">
                                            {loading ? "AI 批改中..." : "提交答案"}
                                            {!loading && <CheckCircle className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Mode: REVIEW */}
                            {mode === 'REVIEW' && result && (
                                <div className="space-y-6 animate-in slide-in-from-bottom-8">
                                    {/* Diff View */}
                                    <div className="bg-white/60 p-5 rounded-xl border border-slate-200/50 shadow-sm">
                                        <div className="text-xs text-slate-400 mb-2 uppercase font-bold flex justify-between">
                                            <span>Smart Diff</span>
                                            <span className="text-indigo-500 font-serif italic">Revised Version Below</span>
                                        </div>
                                        {result.revised_text ? (
                                            <DiffView original={translation} revised={result.revised_text} />
                                        ) : (
                                            <p className="text-lg">{translation}</p>
                                        )}
                                    </div>

                                    {/* Feedback */}
                                    <div className="flex gap-4 items-start">
                                        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center font-bold border-2 shrink-0", result.score >= 80 ? "border-green-400 text-green-600 bg-green-50" : "border-amber-400 text-amber-600 bg-amber-50")}>
                                            {result.score}
                                        </div>
                                        <div className="p-4 bg-slate-50/80 rounded-2xl text-slate-600 text-sm leading-relaxed flex-1 border border-slate-100">
                                            {result.feedback}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3 pt-2">
                                        <button onClick={() => setShowChat(true)} className="flex-1 py-3 bg-white/50 hover:bg-white text-indigo-600 font-medium rounded-xl border border-indigo-100 transition-colors flex items-center justify-center gap-2">
                                            <MessageCircle className="w-4 h-4" /> AI 答疑
                                        </button>
                                        <button
                                            onClick={() => {
                                                setTranslation(''); // Clear for retry
                                                setMode('RETRY');
                                            }}
                                            className="flex-1 py-3 bg-indigo-600 text-white font-medium rounded-xl shadow-lg hover:shadow-indigo-500/30 transition-all flex items-center justify-center gap-2"
                                        >
                                            强制订正 <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Mode: RETRY */}
                            {mode === 'RETRY' && result?.revised_text && (
                                <div className="space-y-4 animate-in slide-in-from-right-8">
                                    <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl text-rose-800 text-sm mb-4 flex gap-2">
                                        <AlertCircle className="w-5 h-5 shrink-0" />
                                        请重新输入正确的句子以加深记忆。
                                    </div>

                                    <div className="text-sm text-slate-400 mb-1">Target Sentence:</div>
                                    <div className="p-3 bg-slate-100 rounded-lg text-slate-500 font-medium select-none blur-[2px] hover:blur-none transition-all cursor-help" title="Hover to peek">
                                        {result.revised_text}
                                    </div>

                                    <textarea
                                        value={translation}
                                        onChange={(e) => setTranslation(e.target.value)}
                                        placeholder="Type the corrected sentence here..."
                                        className="w-full bg-white/50 border-2 border-rose-100 focus:border-rose-400 rounded-2xl p-4 text-lg min-h-[100px]"
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleRetrySubmit())}
                                        autoFocus
                                    />

                                    <button onClick={handleRetrySubmit} disabled={!translation.trim()} className="w-full py-3 bg-rose-600 text-white rounded-xl font-bold shadow-lg hover:bg-rose-700 transition-all flex items-center justify-center gap-2">
                                        验证并继续 <CheckCircle className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            {/* Mode: ORAL */}
                            {mode === 'ORAL' && result?.revised_text && (
                                <div className="animate-in slide-in-from-right-8">
                                    <OralPractice text={result.revised_text} onComplete={generateSentence} />
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
