"use client";

import type { MouseEvent, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ListeningShadowingControls } from "@/components/reading/ListeningShadowingControls";
import { alignTokensToMarks, extractWordTokens, normalizeWordForMatch, type TtsWordMark } from "@/lib/read-speaking";
import type { ListeningScoreTier } from "@/lib/listening-shadowing";

type RebuildShadowingTokenState = "correct" | "incorrect" | "missed";

interface RebuildShadowingPanelEntry {
    wavBlob: Blob | null;
    result: {
        transcript?: string;
    } | null;
    submitError: string | null;
}

interface RebuildShadowingPanelState {
    isProcessing: boolean;
    isRecording: boolean;
    isSubmitting: boolean;
}

interface RebuildShadowingPanelProps {
    activeEntry: RebuildShadowingPanelEntry;
    currentAudioTime: number;
    chinese: string;
    isReferenceAudioLoading: boolean;
    isReferenceAudioPlaying: boolean;
    isSpeechRecognitionRunning: boolean;
    isSpeechRecognitionSupported: boolean;
    liveRecognitionTranscript: string;
    normalizeTranscript: (text: string) => string;
    onInteractiveTextMouseUp: (contextText?: string) => void;
    onPlayReference: (text: string) => void | Promise<unknown>;
    onPlaySelfRecording: () => void;
    onStartRecording: () => void | Promise<unknown>;
    onStopRecording: () => void;
    onSubmit: () => void | Promise<unknown> | boolean;
    onWordClick: (event: MouseEvent<HTMLElement>, word: string, contextText?: string) => void;
    prefersReducedMotion: boolean | null;
    rebuildListeningProgressCursor: number;
    referenceEnglish: string;
    referenceMarks: TtsWordMark[] | undefined;
    renderInteractiveCoachText: (text: string) => ReactNode;
    scoreFx: {
        score: number;
        tier: ListeningScoreTier;
        title: string;
        detail: string;
    } | null;
    scoreRecognition: (referenceSentence: string, transcript: string) => {
        score: number;
        correctCount: number;
        totalCount: number;
    };
    shadowingState: RebuildShadowingPanelState;
    shouldShowCorrection: boolean;
    alignTokens: (params: {
        targetTokens: Array<{ sourceIndex: number; token: string }>;
        spokenTokens: string[];
    }) => {
        tokenStates: Map<number, RebuildShadowingTokenState>;
        correctCount: number;
    };
}

export function RebuildShadowingPanel({
    activeEntry,
    chinese,
    currentAudioTime,
    isReferenceAudioLoading,
    isReferenceAudioPlaying,
    isSpeechRecognitionRunning,
    isSpeechRecognitionSupported,
    liveRecognitionTranscript,
    normalizeTranscript,
    onInteractiveTextMouseUp,
    onPlayReference,
    onPlaySelfRecording,
    onStartRecording,
    onStopRecording,
    onSubmit,
    onWordClick,
    prefersReducedMotion,
    rebuildListeningProgressCursor,
    referenceEnglish,
    referenceMarks,
    renderInteractiveCoachText,
    scoreFx,
    scoreRecognition,
    shadowingState,
    shouldShowCorrection,
    alignTokens,
}: RebuildShadowingPanelProps) {
    const shadowingResult = activeEntry.result;
    const liveTranscript = normalizeTranscript(liveRecognitionTranscript);
    const liveRecognitionTokens = extractWordTokens(liveTranscript)
        .map((token) => normalizeWordForMatch(token.text))
        .filter(Boolean);
    const referenceTokenCount = extractWordTokens(referenceEnglish).length;
    const shouldShowListeningProgress = shadowingState.isRecording;
    const shouldShowPostRecordingCorrection = shouldShowCorrection
        && !shadowingState.isRecording
        && !shadowingState.isProcessing
        && liveRecognitionTokens.length > 0;
    const canSubmitRebuildShadowing = Boolean(activeEntry.wavBlob) && !shadowingState.isSubmitting && liveTranscript.length > 0;
    const isReferenceAudioBusy = isReferenceAudioLoading || isReferenceAudioPlaying;
    const sourceTokens = extractWordTokens(referenceEnglish);
    const referenceWordMarks = Array.isArray(referenceMarks)
        ? referenceMarks
            .filter((mark): mark is TtsWordMark => (
                Boolean(mark)
                && typeof mark.value === "string"
                && Number.isFinite(Number(mark.start))
                && Number.isFinite(Number(mark.end))
            ))
            .sort((left, right) => Number(left.start) - Number(right.start))
        : [];
    const sourceTokenToMarkIndex = alignTokensToMarks(sourceTokens, referenceWordMarks);
    const activeReferenceWordMarkIndex = (() => {
        if (!isReferenceAudioPlaying || referenceWordMarks.length === 0) return null;
        const timeMs = currentAudioTime;
        for (let index = 0; index < referenceWordMarks.length; index += 1) {
            const mark = referenceWordMarks[index];
            const markStart = Number(mark.start);
            const rawMarkEnd = Number(mark.end);
            const markEnd = Number.isFinite(rawMarkEnd) && rawMarkEnd > markStart
                ? rawMarkEnd
                : markStart + 220;
            if (timeMs >= markStart && timeMs < markEnd) {
                return index;
            }
            if (timeMs < markStart) break;
        }
        return null;
    })();
    const pronunciationFeedback = (() => {
        const targetTokens = sourceTokens
            .map((token) => ({ sourceIndex: token.index, token: normalizeWordForMatch(token.text) }))
            .filter((item) => Boolean(item.token));

        if (!shouldShowPostRecordingCorrection) {
            return {
                tokenStates: new Map<number, RebuildShadowingTokenState>(),
                correctCount: 0,
                totalCount: targetTokens.length,
            };
        }

        const { tokenStates, correctCount } = alignTokens({
            targetTokens,
            spokenTokens: liveRecognitionTokens,
        });
        return {
            tokenStates,
            correctCount,
            totalCount: targetTokens.length,
        };
    })();
    const rebuildListeningSummary = (() => {
        if (!shadowingResult) return null;
        const transcript = normalizeTranscript(shadowingResult.transcript || liveTranscript);
        const metrics = scoreRecognition(referenceEnglish, transcript);
        return {
            score: metrics.score,
            detail: `匹配 ${metrics.correctCount}/${Math.max(1, metrics.totalCount)} 个词，系统自动评分 ${metrics.score}/100`,
        };
    })();
    const sourceSentenceKaraokeContent = (() => {
        if (!referenceEnglish || sourceTokens.length === 0) return referenceEnglish;

        let cursor = 0;
        const parts: ReactNode[] = [];

        for (const token of sourceTokens) {
            if (token.start > cursor) {
                parts.push(
                    <span key={`plain-${token.index}-${cursor}`}>
                        {referenceEnglish.slice(cursor, token.start)}
                    </span>,
                );
            }

            const tokenState = pronunciationFeedback.tokenStates.get(token.index);
            const markIndex = sourceTokenToMarkIndex.get(token.index);
            const isActiveWord = isReferenceAudioPlaying
                && typeof markIndex === "number"
                && activeReferenceWordMarkIndex === markIndex;
            const isPassedWord = isReferenceAudioPlaying
                && typeof markIndex === "number"
                && activeReferenceWordMarkIndex !== null
                && markIndex < activeReferenceWordMarkIndex;
            parts.push(
                <span
                    key={`token-${token.index}-${token.start}`}
                    data-word-popup-segment={token.text}
                    onClick={(event) => onWordClick(event, token.text, referenceEnglish)}
                    onMouseUp={() => onInteractiveTextMouseUp(referenceEnglish)}
                    className={cn(
                        "cursor-pointer rounded-[0.38em] px-[0.08em] py-[0.01em] transition-colors duration-220 ease-out hover:bg-[#f3f4f6]/60",
                        isActiveWord
                            ? "bg-[#ffd970] text-[#7a3f00] shadow-[0_0_0_1px_rgba(234,163,27,0.42)]"
                            : "",
                        isPassedWord
                            ? "text-[#6b6358]"
                            : "",
                        !isReferenceAudioPlaying && shouldShowListeningProgress && token.index < rebuildListeningProgressCursor
                            ? "bg-[#eef4ff] text-[#3f5f9a]"
                            : "",
                        !isReferenceAudioPlaying && shouldShowListeningProgress && token.index === rebuildListeningProgressCursor
                            ? "bg-[#ddeaff] text-[#2f58b0] shadow-[inset_0_-1px_0_rgba(78,122,219,0.22)]"
                            : "",
                        !isReferenceAudioPlaying && shouldShowPostRecordingCorrection && tokenState === "correct"
                            ? "text-[#2f6f4d]"
                            : "",
                        !isReferenceAudioPlaying && shouldShowPostRecordingCorrection && (tokenState === "incorrect" || tokenState === "missed")
                            ? "text-[#8e4a4a] underline decoration-[#d97a7a] decoration-2 underline-offset-[0.22em]"
                            : "",
                    )}
                >
                    {referenceEnglish.slice(token.start, token.end)}
                </span>,
            );
            cursor = token.end;
        }

        if (cursor < referenceEnglish.length) {
            parts.push(
                <span key={`plain-tail-${cursor}`}>
                    {referenceEnglish.slice(cursor)}
                </span>,
            );
        }

        return parts;
    })();

    return (
        <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.15 : 0.28 }}
            className="rounded-[1.6rem] border-[3px] border-[#e9dfd1] bg-[#fff8ef] p-4 md:p-5"
        >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#a18f7b]">rebuild shadowing</p>
                    <p className="mt-2 text-sm leading-7 text-[#6e6256]">
                        可选训练反馈，评分仅用于跟读改进，不计入 Elo / 连胜。
                    </p>
                </div>
                <span className="inline-flex items-center rounded-full border-2 border-[#80dcb7] bg-[#e7f9ef] px-3 py-1 text-[11px] font-black text-[#20895f]">
                    训练模式 · 不计 Elo
                </span>
            </div>

            <div className="mt-4 rounded-[1.4rem] border-[3px] border-[#e9dfd1] bg-white/90 px-4 py-5 md:px-6">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#a18f7b]">source sentence</p>
                <p
                    data-word-popup-root="true"
                    onMouseUp={() => onInteractiveTextMouseUp(referenceEnglish)}
                    className={cn(
                        "mt-3 rounded-[0.95rem] px-2 py-1 font-bold text-[#3a322c] transition-all duration-250 text-lg leading-8 md:text-[1.55rem] md:leading-[2.2rem]",
                        (shadowingState.isRecording || isReferenceAudioBusy || shouldShowPostRecordingCorrection)
                            ? "bg-[#fff4cf] shadow-[0_0_0_2px_rgba(243,184,84,0.35),0_10px_24px_rgba(243,184,84,0.16)]"
                            : "",
                    )}
                >
                    {sourceSentenceKaraokeContent}
                </p>
                <p className="mt-2 text-sm leading-7 text-[#6e6256]">{chinese}</p>
            </div>

            <div className="mt-4">
                <ListeningShadowingControls
                    onPlayReference={() => { void onPlayReference(referenceEnglish); }}
                    onToggleRecording={() => {
                        if (shadowingState.isRecording) {
                            onStopRecording();
                            return;
                        }
                        void onStartRecording();
                    }}
                    onPlaySelfRecording={onPlaySelfRecording}
                    onSubmit={() => { void onSubmit(); }}
                    isReferencePreparing={isReferenceAudioLoading}
                    isReferenceDisabled={shadowingState.isRecording || shadowingState.isProcessing}
                    referenceReadyLabel={isReferenceAudioPlaying ? "播放中..." : "听原句"}
                    isRecording={shadowingState.isRecording}
                    isRecordingProcessing={shadowingState.isProcessing}
                    isRecordToggleDisabled={shadowingState.isSubmitting}
                    hasSelfRecording={Boolean(activeEntry.wavBlob)}
                    isPlaySelfDisabled={false}
                    isSubmitting={shadowingState.isSubmitting}
                    isSubmitted={Boolean(shadowingResult)}
                    isSubmitDisabled={!canSubmitRebuildShadowing}
                    helperText="先听原句再跟读；录音结束后点“提交跟读评分”，系统给分后由你手动查看结果。"
                    progressLabel={shadowingState.isRecording
                        ? `进度 ${rebuildListeningProgressCursor}/${referenceTokenCount || 0}`
                        : shouldShowPostRecordingCorrection
                            ? `纠正 ${pronunciationFeedback.correctCount}/${pronunciationFeedback.totalCount || 0}`
                            : "等待录音"}
                    recognitionLabel={isSpeechRecognitionRunning
                        ? "跟读追踪中"
                        : shouldShowPostRecordingCorrection
                            ? "已生成纠正"
                            : "识别待机"}
                    transcriptText={shadowingState.isRecording
                        ? (liveTranscript || "正在追踪你读到的位置...")
                        : shouldShowPostRecordingCorrection
                            ? (liveTranscript || "已完成本次录音纠正。")
                            : "开始录音后，会实时跟踪你读到哪里；停止后才显示纠正。"}
                    transcriptContent={(shadowingState.isRecording || shouldShowPostRecordingCorrection) && liveTranscript
                        ? renderInteractiveCoachText(liveTranscript)
                        : undefined}
                    isSpeechRecognitionSupported={isSpeechRecognitionSupported}
                />

                {activeEntry.submitError ? (
                    <p className="mt-3 text-sm text-rose-600">{activeEntry.submitError}</p>
                ) : null}
            </div>

            {shadowingResult && rebuildListeningSummary ? (
                <div className="mt-4 rounded-[1rem] border-[3px] border-[#bfead4] bg-[#f2fff8] px-4 py-3">
                    <p className="text-sm font-black text-[#15744a]">
                        跟读评分 {rebuildListeningSummary.score}/100
                    </p>
                    <p className="mt-1 text-sm text-[#2f5d46]">{rebuildListeningSummary.detail}</p>
                </div>
            ) : null}

            <AnimatePresence>
                {scoreFx ? (
                    <motion.div
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.9 }}
                        animate={
                            prefersReducedMotion
                                ? { opacity: 1 }
                                : {
                                    opacity: [0, 1, 1],
                                    y: [20, -8, 0],
                                    scale: [0.9, 1.08, 1],
                                }
                        }
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: prefersReducedMotion ? 0.12 : 0.52, ease: [0.22, 1, 0.36, 1] as const }}
                        className={cn(
                            "relative mt-3 w-full overflow-hidden rounded-[1rem] border-[3px] px-3 py-2.5 shadow-[0_10px_0_rgba(19,14,10,0.09),0_20px_28px_rgba(0,0,0,0.08)]",
                            scoreFx.tier === "excellent"
                                ? "border-[#8ed7ad] bg-[#eafff1] text-[#155738]"
                                : scoreFx.tier === "good"
                                    ? "border-[#b9d8ff] bg-[#eef6ff] text-[#1f4b8f]"
                                    : scoreFx.tier === "ok"
                                        ? "border-[#ffd7a3] bg-[#fff4e7] text-[#8f5a22]"
                                        : "border-[#f0b8b8] bg-[#fff0f0] text-[#933535]",
                        )}
                    >
                        <motion.div
                            aria-hidden
                            initial={prefersReducedMotion ? { opacity: 0 } : { x: "-120%", opacity: 0.45 }}
                            animate={prefersReducedMotion ? { opacity: 0 } : { x: "130%", opacity: 0 }}
                            transition={{ duration: 0.78, ease: "easeOut" }}
                            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/50 blur-sm"
                        />
                        <p className="text-sm font-black">{scoreFx.title} · {scoreFx.score}/100</p>
                        <p className="mt-1 text-xs font-semibold">{scoreFx.detail}</p>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </motion.div>
    );
}
