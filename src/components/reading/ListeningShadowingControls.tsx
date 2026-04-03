"use client";

import { type ReactNode } from "react";
import { Mic, Play, RefreshCw, SendHorizontal, Square, Volume2 } from "lucide-react";

import { getPressableStyle } from "@/lib/pressable";
import { cn } from "@/lib/utils";

interface ListeningShadowingControlsProps {
    onPlayReference: () => void;
    onToggleRecording: () => void;
    onPlaySelfRecording: () => void;
    onSubmit: () => void;
    isReferencePreparing: boolean;
    isReferenceDisabled?: boolean;
    isRecording: boolean;
    isRecordingProcessing?: boolean;
    isRecordToggleDisabled?: boolean;
    hasSelfRecording: boolean;
    isPlaySelfDisabled?: boolean;
    isSubmitting?: boolean;
    isSubmitted?: boolean;
    isSubmitDisabled?: boolean;
    helperText?: string;
    progressLabel: string;
    recognitionLabel: string;
    transcriptText: string;
    transcriptContent?: ReactNode;
    isSpeechRecognitionSupported: boolean;
    referenceReadyLabel?: string;
    referencePreparingLabel?: string;
    startRecordLabel?: string;
    stopRecordLabel?: string;
    processRecordLabel?: string;
    playSelfLabel?: string;
    submitLabel?: string;
    submittedLabel?: string;
    submittingLabel?: string;
    idleStatusText?: string;
}

export function ListeningShadowingControls({
    onPlayReference,
    onToggleRecording,
    onPlaySelfRecording,
    onSubmit,
    isReferencePreparing,
    isReferenceDisabled = false,
    isRecording,
    isRecordingProcessing = false,
    isRecordToggleDisabled = false,
    hasSelfRecording,
    isPlaySelfDisabled = false,
    isSubmitting = false,
    isSubmitted = false,
    isSubmitDisabled = false,
    helperText = "先听原句再跟读；录音结束后点“提交跟读评分”。",
    progressLabel,
    recognitionLabel,
    transcriptText,
    transcriptContent,
    isSpeechRecognitionSupported,
    referenceReadyLabel = "听原句",
    referencePreparingLabel = "加载原句中...",
    startRecordLabel = "开始录音",
    stopRecordLabel = "停止录音",
    processRecordLabel = "录音处理中...",
    playSelfLabel = "听我的录音",
    submitLabel = "提交跟读评分",
    submittedLabel = "已提交评分",
    submittingLabel = "评分中...",
    idleStatusText = "开始录音后，会实时跟踪你读到哪里；停止后才显示纠正。",
}: ListeningShadowingControlsProps) {
    const referenceDisabled = isReferenceDisabled || isRecording || isRecordingProcessing || isSubmitting;
    const recordDisabled = isRecordToggleDisabled || isReferencePreparing || isSubmitting || isRecordingProcessing;
    const playSelfDisabled = isPlaySelfDisabled || !hasSelfRecording || isRecording || isRecordingProcessing || isSubmitting;
    const submitDisabled = isSubmitDisabled || isRecording || isRecordingProcessing || isSubmitting;

    return (
        <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
                type="button"
                onClick={onPlayReference}
                disabled={referenceDisabled}
                className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[#eef7ff] px-4 py-2.5 text-sm font-black text-[#2f66f3] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                style={getPressableStyle("rgba(102,159,245,0.55)", 4)}
            >
                {isReferencePreparing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                {isReferencePreparing ? referencePreparingLabel : referenceReadyLabel}
            </button>

            <button
                type="button"
                onClick={onToggleRecording}
                disabled={recordDisabled}
                className={cn(
                    "ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
                    isRecording
                        ? "bg-[#ffe7e7] text-[#d65252]"
                        : isRecordingProcessing
                            ? "bg-[#f5f5f5] text-[#8f8a84]"
                            : "bg-[#fff3e6] text-[#bb6a28]",
                )}
                style={getPressableStyle(
                    isRecording ? "rgba(219,102,102,0.45)" : "rgba(238,186,128,0.85)",
                    4,
                )}
            >
                {isRecordingProcessing ? <RefreshCw className="h-4 w-4 animate-spin" /> : isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {isRecordingProcessing ? processRecordLabel : isRecording ? stopRecordLabel : startRecordLabel}
            </button>

            <button
                type="button"
                onClick={onPlaySelfRecording}
                disabled={playSelfDisabled}
                className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[#f2f8ff] px-4 py-2.5 text-sm font-black text-[#2f66f3] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                style={getPressableStyle("rgba(153,187,236,0.65)", 4)}
            >
                <Play className="h-4 w-4" />
                {playSelfLabel}
            </button>

            <button
                type="button"
                onClick={onSubmit}
                disabled={submitDisabled}
                className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#9fd8b3,#6fbd8f)] px-4 py-2.5 text-sm font-black text-[#113c23] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                style={getPressableStyle("rgba(88,176,126,0.8)", 4)}
            >
                {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                {isSubmitting ? submittingLabel : isSubmitted ? submittedLabel : submitLabel}
            </button>

            <p className="w-full text-xs font-semibold text-[#8f7f6f]">{helperText}</p>
            <div className="w-full rounded-[1rem] border border-[#d8dff5] bg-[#f6f8ff] px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-black text-[#5a6293]">
                    <span className="rounded-full border border-[#cfe0ff] bg-white px-2 py-0.5">
                        {progressLabel}
                    </span>
                    <span className="rounded-full border border-[#d7d2f8] bg-white px-2 py-0.5">
                        {recognitionLabel}
                    </span>
                    {!isSpeechRecognitionSupported && (
                        <span className="rounded-full border border-[#f3d2d2] bg-white px-2 py-0.5 text-[#b64d4d]">
                            浏览器不支持实时识别
                        </span>
                    )}
                </div>
                {transcriptContent ? (
                    <div className="mt-2 line-clamp-2 text-xs leading-6 text-[#616a90]">{transcriptContent}</div>
                ) : (
                    <p className="mt-2 line-clamp-2 text-xs text-[#616a90]">
                        {transcriptText || idleStatusText}
                    </p>
                )}
            </div>
        </div>
    );
}
