import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Play, Square, RotateCcw, Volume2, Loader2, X, Eye, EyeOff, CheckCircle2, AlertCircle, Sparkles, Lightbulb, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WaveformVisualizer } from './WaveformVisualizer';

interface SpeakingPanelProps {
    text: string;
    onPlayOriginal: () => void;
    isOriginalPlaying: boolean;
    onRecordingComplete: (blob: Blob) => void;
    onClose: () => void;
    isBlind: boolean;
    onToggleBlind: () => void;
}

export function SpeakingPanel({
    text,
    onPlayOriginal,
    isOriginalPlaying,
    onRecordingComplete,
    onClose,
    isBlind,
    onToggleBlind
}: SpeakingPanelProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [reviewResults, setReviewResults] = useState<any>(null);
    const [aiFeedback, setAiFeedback] = useState<any>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [showReview, setShowReview] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isEchoMode, setIsEchoMode] = useState(false);
    const [isBlindChallenge, setIsBlindChallenge] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setStream(stream);
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                setAudioBlob(blob);
                onRecordingComplete(blob);

                setIsProcessing(true);
                try {
                    const formData = new FormData();
                    formData.append('audio', blob);
                    formData.append('text', text);

                    const res = await fetch('/api/ai/score', {
                        method: 'POST',
                        body: formData
                    });

                    if (!res.ok) throw new Error('Scoring failed');

                    const data = await res.json();
                    setReviewResults(data);
                    setShowReview(true);

                    // Blind Challenge Logic: Auto-unblur if score is high
                    if (isBlindChallenge && data.score >= 80 && isBlind) {
                        onToggleBlind(); // Unblur
                    }

                    // Trigger AI Coach
                    setIsAiLoading(true);
                    try {
                        const aiRes = await fetch('/api/ai/coach', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ originalText: text, transcript: data.transcript })
                        });
                        const aiData = await aiRes.json();
                        setAiFeedback(aiData);
                    } catch (e) {
                        console.error("AI Coach error", e);
                    } finally {
                        setIsAiLoading(false);
                    }

                } catch (err) {
                    console.error("Scoring error:", err);
                    // Fallback or error state
                } finally {
                    setIsProcessing(false);
                }

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingDuration(0);

            timerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone. Please check permissions.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
            setStream(null); // Clear stream to stop visualization
        }
    };

    const handleToggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const playRecording = () => {
        if (audioBlob) {
            if (audioRef.current) {
                audioRef.current.pause(); // Stop existing playback
            }
            const url = URL.createObjectURL(audioBlob);
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.play();
            audio.onended = () => {
                audioRef.current = null;
            };
        }
    };

    const seekToWord = (index: number, totalWords: number) => {
        if (audioRef.current && audioBlob) {
            // Estimate time based on word position (linear interpolation)
            // In a real app, we'd use actual timestamps from Whisper
            const duration = audioRef.current.duration;
            if (duration && isFinite(duration)) {
                const targetTime = (index / totalWords) * duration;
                audioRef.current.currentTime = targetTime;
                audioRef.current.play();
            } else {
                // If duration is not available yet (e.g. not loaded), play first then seek
                playRecording();
                setTimeout(() => {
                    if (audioRef.current) {
                        const d = audioRef.current.duration;
                        const t = (index / totalWords) * d;
                        audioRef.current.currentTime = t;
                    }
                }, 100);
            }
        } else if (audioBlob) {
            playRecording();
            // Seek after a short delay to allow audio to load
            setTimeout(() => {
                seekToWord(index, totalWords);
            }, 100);
        }
    };

    const handleReset = () => {
        setAudioBlob(null);
        setShowReview(false);
        setReviewResults(null);
        setAiFeedback(null);
        setRecordingDuration(0);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Echo Mode Logic
    useEffect(() => {
        if (!isEchoMode) return;

        let timeout: NodeJS.Timeout;
        if (!isOriginalPlaying && !isRecording && !showReview) {
            // Start cycle: Play Original
            onPlayOriginal();
        } else if (!isOriginalPlaying && !isRecording && !showReview) {
            // Wait for playback to finish (handled by parent/hook state usually, but here we rely on isOriginalPlaying)
            // This part is tricky without exact duration callback from parent.
            // Assuming isOriginalPlaying becomes false when done.
        }

        // Simplified Echo Mode: Just auto-replay original after a delay
        if (!isOriginalPlaying && isEchoMode) {
            timeout = setTimeout(() => {
                onPlayOriginal();
            }, 3000); // Wait 3 seconds before replaying
        }

        return () => clearTimeout(timeout);
    }, [isEchoMode, isOriginalPlaying]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4 rounded-xl bg-slate-900/50 border border-white/10 overflow-hidden backdrop-blur-sm"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-amber-400">口语练习</span>
                    {isRecording && (
                        <span className="flex items-center gap-1.5 text-xs text-red-400 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            录音中 {formatTime(recordingDuration)}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsBlindChallenge(!isBlindChallenge)}
                        className={cn(
                            "p-1.5 rounded-md transition-colors relative",
                            isBlindChallenge ? "text-rose-400 bg-rose-500/10" : "text-stone-400 hover:text-stone-200 hover:bg-white/5"
                        )}
                        title={isBlindChallenge ? "关闭盲听挑战" : "开启盲听挑战 (读对自动显示)"}
                    >
                        <EyeOff className="w-4 h-4" />
                        {isBlindChallenge && <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />}
                    </button>
                    <button
                        onClick={() => setIsEchoMode(!isEchoMode)}
                        className={cn(
                            "p-1.5 rounded-md transition-colors",
                            isEchoMode ? "text-amber-400 bg-amber-500/10" : "text-stone-400 hover:text-stone-200 hover:bg-white/5"
                        )}
                        title={isEchoMode ? "关闭回声模式" : "开启回声模式 (自动重播)"}
                    >
                        <Repeat className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onToggleBlind}
                        className={cn(
                            "p-1.5 rounded-md transition-colors",
                            isBlind ? "text-amber-400 bg-amber-500/10" : "text-stone-400 hover:text-stone-200 hover:bg-white/5"
                        )}
                        title={isBlind ? "显示原文" : "隐藏原文"}
                    >
                        {isBlind ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md text-stone-400 hover:text-stone-200 hover:bg-white/5 transition-colors"
                        title="关闭"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-4">
                {/* Review / Feedback Section */}
                <AnimatePresence mode="wait">
                    {showReview && reviewResults ? (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-6 space-y-4"
                        >
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-lg border",
                                    reviewResults.score >= 80 ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                                )}>
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span className="font-bold">{reviewResults.score}</span>
                                    <span className="text-xs opacity-80">分</span>
                                </div>
                                <p className="text-sm text-stone-300">{reviewResults.feedback}</p>
                            </div>

                            {/* Pronunciation Heatmap */}
                            <div className="p-3 bg-black/20 rounded-lg text-lg font-serif leading-relaxed flex flex-wrap">
                                {reviewResults.diff?.map((item: any, i: number) => (
                                    <span
                                        key={i}
                                        onClick={() => seekToWord(i, reviewResults.diff.length)}
                                        className={cn(
                                            "mr-1.5 px-0.5 rounded transition-colors cursor-pointer relative group/word mb-1",
                                            item.status === 'correct' ? "text-green-400 hover:bg-green-500/10" : "text-red-400 hover:bg-red-500/10",
                                            "hover:underline decoration-2 underline-offset-2"
                                        )}
                                        title="点击跳转播放"
                                    >
                                        {item.word}
                                        {item.status !== 'correct' && (
                                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-xs text-slate-200 rounded opacity-0 group-hover/word:opacity-100 whitespace-nowrap pointer-events-none z-10 border border-white/10 shadow-xl">
                                                听到: "{item.transcript}"
                                            </span>
                                        )}
                                    </span>
                                ))}
                            </div>

                            {/* Full Transcript Display */}
                            <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                                <div className="text-xs text-stone-400 mb-1">您的录音原文:</div>
                                <p className="text-sm text-stone-300 italic">
                                    "{reviewResults.transcript}"
                                </p>
                            </div>

                            {/* AI Coach Feedback */}
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 space-y-3">
                                <div className="flex items-center gap-2 text-rose-400 font-medium">
                                    <Sparkles className="w-4 h-4" />
                                    <span>AI 教练分析</span>
                                    {isAiLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                                </div>

                                {aiFeedback ? (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="space-y-1">
                                            {aiFeedback.issues?.map((issue: string, i: number) => (
                                                <div key={i} className="flex items-start gap-2 text-sm text-red-300/90">
                                                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                    <span>{issue}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="space-y-1 pt-2 border-t border-rose-500/20">
                                            {aiFeedback.tips?.map((tip: string, i: number) => (
                                                <div key={i} className="flex items-start gap-2 text-sm text-rose-200/90">
                                                    <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                                                    <span>{tip}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <p className="text-xs text-rose-400/80 italic pt-1">
                                            "{aiFeedback.encouragement}"
                                        </p>
                                    </div>
                                ) : !isAiLoading && (
                                    <p className="text-sm text-stone-400">无法加载 AI 反馈。</p>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        <div className="mb-6 text-center py-4">
                            <p className="text-stone-400 text-sm">
                                {isRecording
                                    ? "请大声朗读..."
                                    : isProcessing
                                        ? "正在分析您的发音..."
                                        : "先听原音，然后录音。"}
                            </p>
                        </div>
                    )}
                </AnimatePresence>

                {/* Controls */}
                <div className="flex items-end justify-between gap-4">
                    {/* Left: Playback Controls */}
                    <div className="flex items-center gap-2 flex-1">
                        <button
                            onClick={onPlayOriginal}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                                isOriginalPlaying ? "bg-amber-500/20 text-amber-400" : "bg-white/5 text-stone-400 hover:bg-white/10 hover:text-stone-200"
                            )}
                        >
                            {isOriginalPlaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                            原音
                        </button>

                        <button
                            onClick={playRecording}
                            disabled={!audioBlob}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                                audioBlob ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-white/5 text-stone-600 cursor-not-allowed"
                            )}
                        >
                            <Play className="w-3.5 h-3.5" />
                            我的录音
                        </button>
                    </div>

                    {/* Center: Main Record Button or Visualizer */}
                    <div className="flex flex-col items-center gap-2 shrink-0">
                        {isRecording && stream ? (
                            <div className="w-48 h-12">
                                <WaveformVisualizer stream={stream} isRecording={isRecording} />
                            </div>
                        ) : null}

                        <button
                            onClick={handleToggleRecording}
                            disabled={isProcessing}
                            className={cn(
                                "flex items-center justify-center w-12 h-12 rounded-full transition-all shadow-lg hover:scale-105 active:scale-95",
                                isRecording ? "bg-red-500 shadow-red-500/40" : "bg-amber-500 shadow-amber-500/40",
                                isProcessing && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            {isRecording ? (
                                <div className="w-4 h-4 bg-white rounded-sm" />
                            ) : (
                                <Mic className="w-5 h-5 text-white" />
                            )}
                        </button>
                    </div>

                    {/* Right: Reset */}
                    <div className="flex items-center gap-2 flex-1 justify-end">
                        {showReview && (
                            <button
                                onClick={handleReset}
                                className="p-2 rounded-full hover:bg-white/10 text-stone-400 hover:text-stone-200 transition-colors"
                                title="重置"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
