import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, Play, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useWhisper } from '@/hooks/useWhisper';
import { cn } from '@/lib/utils';

interface ShadowingConsoleProps {
    text: string;
    onClose: () => void;
    articleTitle?: string;
}

// Normalize for comparison
const normalize = (text: string) =>
    text.toLowerCase().replace(/[^a-z\s']/g, '').trim();

const getWords = (text: string) =>
    normalize(text).split(/\s+/).filter(Boolean);

// Levenshtein distance
const levenshtein = (a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1)
            );
        }
    }
    return matrix[b.length][a.length];
};

interface WordResult {
    target: string;           // Original word display
    targetNorm: string;       // Normalized for comparison
    spoken: string | null;    // What user said (null if not matched)
    isCorrect: boolean;
    isMissing: boolean;       // User skipped this word
}

// Align spoken words to target words using dynamic programming
const alignWords = (targetWords: string[], spokenWords: string[]): WordResult[] => {
    const targetNorm = targetWords.map(w => normalize(w));
    const spokenNorm = spokenWords.map(w => normalize(w));

    const results: WordResult[] = targetNorm.map((t, i) => ({
        target: targetWords[i],
        targetNorm: t,
        spoken: null,
        isCorrect: false,
        isMissing: true
    }));

    // Try to match each spoken word to a target word
    let targetIdx = 0;
    for (const spoken of spokenNorm) {
        // Look for best match in remaining target words (allow some lookahead)
        let bestMatch = -1;
        let bestScore = Infinity;

        for (let i = targetIdx; i < Math.min(targetIdx + 3, targetNorm.length); i++) {
            const dist = levenshtein(spoken, targetNorm[i]);
            const maxLen = Math.max(spoken.length, targetNorm[i].length);
            const similarity = 1 - (dist / maxLen);

            if (similarity > 0.5 && dist < bestScore) {
                bestScore = dist;
                bestMatch = i;
            }
        }

        if (bestMatch >= 0) {
            results[bestMatch].spoken = spoken;
            results[bestMatch].isMissing = false;
            results[bestMatch].isCorrect = levenshtein(spoken, targetNorm[bestMatch]) <= 1;
            targetIdx = bestMatch + 1;
        }
    }

    return results;
};

export function ShadowingConsole({ text, onClose, articleTitle }: ShadowingConsoleProps) {
    const [blurLevel, setBlurLevel] = useState<0 | 1 | 2>(0);
    const [showReview, setShowReview] = useState(false);

    const { isReady, isRecording, isProcessing, result, audioBlob, startRecognition, stopRecognition, playRecording } = useWhisper();

    const targetWords = useMemo(() => text.split(/\s+/), [text]);

    // Analyze results when recording stops
    const reviewResults = useMemo(() => {
        if (!result.isFinal || !result.text) return null;
        const spokenWords = getWords(result.text);
        return alignWords(targetWords, spokenWords);
    }, [result.isFinal, result.text, targetWords]);

    const handleToggleRecording = () => {
        if (isRecording) {
            stopRecognition();
            setShowReview(true);
        } else {
            setShowReview(false);
            startRecognition();
        }
    };

    const handleReset = () => {
        setShowReview(false);
    };

    // Calculate score
    const score = reviewResults
        ? Math.round((reviewResults.filter(r => r.isCorrect).length / reviewResults.length) * 100)
        : 0;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex items-center justify-center"
        >
            <div className="w-full max-w-3xl mx-4 bg-slate-900/80 border border-white/10 rounded-2xl flex flex-col shadow-2xl max-h-[90vh]">
                {/* Header */}
                <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-cyan-400">Intensive Shadowing</h2>
                        {showReview && reviewResults && (
                            <span className={cn(
                                "text-sm px-2 py-0.5 rounded-full font-medium",
                                score >= 80 ? "bg-green-500/20 text-green-400" :
                                    score >= 50 ? "bg-amber-500/20 text-amber-400" :
                                        "bg-red-500/20 text-red-400"
                            )}>
                                {score}%
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className={cn(
                        "text-2xl md:text-3xl font-serif leading-[2.5] flex flex-wrap gap-x-2",
                        blurLevel === 1 && "blur-sm hover:blur-none cursor-pointer",
                        blurLevel === 2 && "opacity-10"
                    )}>
                        {showReview && reviewResults ? (
                            // Review Mode - Show corrections
                            reviewResults.map((wordResult, i) => (
                                <span key={i} className="relative inline-flex flex-col items-center">
                                    {/* Error annotation above */}
                                    {!wordResult.isCorrect && wordResult.spoken && (
                                        <motion.span
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-red-400 line-through whitespace-nowrap"
                                        >
                                            {wordResult.spoken}
                                        </motion.span>
                                    )}
                                    {wordResult.isMissing && (
                                        <motion.span
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-amber-400 whitespace-nowrap"
                                        >
                                            (missed)
                                        </motion.span>
                                    )}

                                    {/* Word */}
                                    <span className={cn(
                                        "px-1 rounded transition-colors",
                                        wordResult.isCorrect && "text-green-400",
                                        !wordResult.isCorrect && wordResult.spoken && "text-red-400 underline decoration-red-400/50 decoration-wavy",
                                        wordResult.isMissing && "text-amber-400 opacity-60"
                                    )}>
                                        {wordResult.target}
                                    </span>
                                </span>
                            ))
                        ) : (
                            // Normal Mode - Just show text
                            targetWords.map((word, i) => (
                                <span key={i} className="text-slate-300 px-1">
                                    {word}
                                </span>
                            ))
                        )}
                    </div>
                </div>

                {/* Recognition Display */}
                <div className="px-6 py-3 bg-black/30 shrink-0 border-t border-white/5">
                    <div className="text-sm text-slate-400 min-h-[40px] flex items-center justify-center text-center">
                        {result.text ? (
                            <span className="text-slate-300">{result.text}</span>
                        ) : (
                            <span className="italic">
                                {isProcessing ? "⏳ Processing with Whisper AI..." :
                                    isRecording ? "🎙️ Reading... Press stop when done" :
                                        "Press record, read the text, then stop"}
                            </span>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="px-6 py-4 border-t border-white/5 shrink-0">
                    <div className="flex justify-center items-center gap-6">
                        {/* Blur Toggle */}
                        <button
                            onClick={() => setBlurLevel((prev) => (prev + 1) % 3 as any)}
                            className="p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
                        >
                            {blurLevel === 0 ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5 text-cyan-400" />}
                        </button>

                        {/* Reset */}
                        <button
                            onClick={handleReset}
                            className="p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
                        >
                            <RotateCcw className="w-5 h-5" />
                        </button>

                        {/* Record Button */}
                        <button
                            onClick={handleToggleRecording}
                            disabled={!isReady}
                            className={cn(
                                "p-5 rounded-full transition-all transform hover:scale-105 shadow-xl",
                                isRecording ? "bg-red-500 shadow-red-500/30" : "bg-cyan-500 shadow-cyan-500/30"
                            )}
                        >
                            {isRecording ? (
                                <div className="w-6 h-6 bg-white rounded-sm" />
                            ) : (
                                <Mic className="w-6 h-6 text-white" />
                            )}
                        </button>

                        {/* Play Recording */}
                        <button
                            onClick={playRecording}
                            disabled={!audioBlob}
                            className={cn(
                                "p-3 rounded-full transition-all",
                                audioBlob ? "bg-green-600 hover:bg-green-500 text-white" : "bg-slate-800 text-slate-500 cursor-not-allowed"
                            )}
                            title="Play your recording"
                        >
                            <Play className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </motion.div >
    );
}
