"use client";

import { motion } from "framer-motion";
import { Mic, RefreshCw, Send, Sparkles } from "lucide-react";

export interface ShadowingInputStageProps {
    hasRecordingResult: boolean;
    isSubmitting: boolean;
    isSpeechInputAvailable: boolean;
    isSpeechInputReady: boolean;
    isProcessing: boolean;
    isRecording: boolean;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onSubmit: () => void;
    speechInputError?: string | null;
    speechInputLevel: number;
}

export function ShadowingInputStage({
    hasRecordingResult,
    isProcessing,
    isRecording,
    isSpeechInputAvailable,
    isSpeechInputReady,
    isSubmitting,
    onStartRecording,
    onStopRecording,
    onSubmit,
    speechInputError,
    speechInputLevel,
}: ShadowingInputStageProps) {
    return (
        <div className="flex flex-col items-center justify-center gap-4 py-2">
            {isProcessing ? (
                <div className="flex items-center gap-3 px-6 py-3 bg-indigo-50 rounded-full">
                    <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
                    <span className="text-indigo-600 font-bold text-sm">Processing...</span>
                </div>
            ) : isRecording ? (
                <div className="flex items-center gap-4 px-6 py-3 bg-white/80 backdrop-blur-sm border border-stone-200 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-0.5 h-6">
                        {[...Array(8)].map((_, index) => (
                            <div
                                key={index}
                                className="w-1 rounded-full bg-rose-500"
                                style={{
                                    height: `${Math.max(8, 8 + speechInputLevel * 20 + ((index % 3) * 4))}px`,
                                    opacity: 0.45 + speechInputLevel * 0.55,
                                }}
                            />
                        ))}
                    </div>

                    <div className="min-w-[180px] max-w-[340px]">
                        <p className="text-base font-newsreader text-stone-700 truncate">
                            <span className="text-stone-400 italic">Recording...</span>
                        </p>
                        <p className="mt-1 text-[11px] text-stone-400">
                            停止后将直接按发音评分，不做语音转写。
                        </p>
                    </div>

                    <button
                        onClick={onStopRecording}
                        className="w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center shadow-md transition-all hover:scale-105 active:scale-95 shrink-0"
                    >
                        <div className="w-4 h-4 bg-white rounded-sm" />
                    </button>
                </div>
            ) : hasRecordingResult ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-white/80 backdrop-blur-sm border border-stone-200 rounded-2xl shadow-sm">
                    <div className="max-w-[280px]">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">录音已保存</p>
                        <p className="mt-1 text-base font-newsreader text-stone-800">
                            将只按发音质量评分，不再做语音转写。
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={onStartRecording}
                            className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-all"
                            title="Re-record"
                        >
                            <RefreshCw className="w-4 h-4 text-stone-600" />
                        </button>
                        <button
                            onClick={onSubmit}
                            disabled={isSubmitting}
                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold text-sm shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                        >
                            {isSubmitting ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            {isSubmitting ? "..." : "Submit"}
                        </button>
                    </div>
                </div>
            ) : (
                <motion.button
                    onClick={onStartRecording}
                    disabled={!isSpeechInputAvailable || !isSpeechInputReady}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    className="relative flex items-center gap-3 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full shadow-lg shadow-indigo-500/25 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <motion.div
                        className="absolute inset-0 rounded-full bg-indigo-500/20"
                        animate={{ scale: [1, 1.15], opacity: [0.4, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <Mic className="w-5 h-5 text-white relative z-10" />
                    <span className="text-white font-bold text-sm relative z-10">
                        {isSpeechInputAvailable ? "Tap to Record" : "桌面端可用"}
                    </span>
                </motion.button>
            )}
            {speechInputError ? <p className="text-sm text-rose-500">{speechInputError}</p> : null}
        </div>
    );
}
