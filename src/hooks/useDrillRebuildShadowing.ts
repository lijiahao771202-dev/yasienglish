"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
    REBUILD_SHADOWING_AFFECTS_ELO,
    createRebuildShadowingState,
    getRebuildShadowingEntry,
    type RebuildShadowingScope,
    upsertRebuildShadowingEntry,
} from "@/lib/rebuild-shadowing-state";
import {
    buildRebuildShadowingWordResults,
    estimateRebuildShadowingProgress,
    normalizeRebuildShadowingText,
    resolveRebuildShadowingScoreTier,
    scoreRebuildShadowingRecognition,
} from "@/lib/rebuild-shadowing";
import type { ListeningScoreTier } from "@/lib/listening-shadowing";
import type { PronunciationWordResult } from "@/lib/pronunciation-scoring";

interface RebuildSpeechRecognitionResultEntry {
    transcript?: string;
}

interface RebuildSpeechRecognitionResultLike {
    isFinal?: boolean;
    0?: RebuildSpeechRecognitionResultEntry;
}

interface RebuildSpeechRecognitionEventLike {
    results?: ArrayLike<RebuildSpeechRecognitionResultLike>;
    resultIndex?: number;
}

interface RebuildSpeechRecognitionErrorEventLike {
    error?: string;
    message?: string;
}

interface RebuildSpeechRecognition {
    abort: () => void;
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    onend: ((event?: Event) => void) | null;
    onerror: ((event: RebuildSpeechRecognitionErrorEventLike) => void) | null;
    onresult: ((event: RebuildSpeechRecognitionEventLike) => void) | null;
    start: () => void;
    stop: () => void;
}

type RebuildSpeechRecognitionConstructor = new () => RebuildSpeechRecognition;

interface RebuildShadowingResult {
    content_score?: number;
    coverage_ratio?: number;
    fluency_score?: number;
    pronunciation_score?: number;
    score: number;
    submittedAt: number;
    summary_cn?: string;
    tips_cn?: string[];
    transcript?: string;
    utterance_scores?: {
        accuracy: number;
        completeness: number;
        content_reproduction?: number;
        fluency: number;
        pronunciation_clarity?: number;
        prosody: number;
        rhythm_fluency?: number;
        total: number;
    };
    word_results?: PronunciationWordResult[];
}

interface RebuildShadowingState {
    bySegment: Record<number, {
        result: RebuildShadowingResult | null;
        submitError: string | null;
        updatedAt: number;
        wavBlob: Blob | null;
    }>;
    isProcessing: boolean;
    isRecording: boolean;
    isSubmitting: boolean;
    sentence: {
        result: RebuildShadowingResult | null;
        submitError: string | null;
        updatedAt: number;
        wavBlob: Blob | null;
    };
}

interface RebuildListeningScoreFx {
    detail: string;
    score: number;
    tier: ListeningScoreTier;
    title: string;
}

interface RebuildShadowingDrillData {
    reference_english: string;
    _rebuildMeta?: {
        passageSession?: {
            segments?: Array<{
                referenceEnglish: string;
            }>;
        };
    };
}

type RebuildSentenceShadowingFlow = "idle" | "prompt" | "shadowing" | "feedback";

function createDefaultRebuildShadowingState(): RebuildShadowingState {
    return {
        ...createRebuildShadowingState<Blob, RebuildShadowingResult>(),
        isProcessing: false,
        isRecording: false,
        isSubmitting: false,
    };
}

function playRebuildListeningScoreSfx(tier: ListeningScoreTier) {
    if (typeof window === "undefined") return;
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const base = audioContext.currentTime;

    const scheduleTone = (frequency: number, startOffset: number, duration: number, gain = 0.09, type: OscillatorType = "sine") => {
        const oscillator = audioContext.createOscillator();
        const amp = audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, base + startOffset);
        amp.gain.setValueAtTime(0.0001, base + startOffset);
        amp.gain.exponentialRampToValueAtTime(gain, base + startOffset + 0.018);
        amp.gain.exponentialRampToValueAtTime(0.0001, base + startOffset + duration);
        oscillator.connect(amp);
        amp.connect(audioContext.destination);
        oscillator.start(base + startOffset);
        oscillator.stop(base + startOffset + duration + 0.01);
    };

    if (tier === "excellent") {
        scheduleTone(659, 0, 0.16, 0.11, "triangle");
        scheduleTone(880, 0.13, 0.16, 0.12, "triangle");
        scheduleTone(1047, 0.27, 0.2, 0.13, "triangle");
    } else if (tier === "good") {
        scheduleTone(587, 0, 0.16, 0.095, "triangle");
        scheduleTone(784, 0.14, 0.18, 0.105, "triangle");
    } else if (tier === "ok") {
        scheduleTone(523, 0, 0.22, 0.08, "sine");
    } else {
        scheduleTone(392, 0, 0.14, 0.07, "sawtooth");
        scheduleTone(311, 0.12, 0.2, 0.07, "sawtooth");
    }

    window.setTimeout(() => {
        void audioContext.close().catch(() => undefined);
    }, 900);
}

export function useDrillRebuildShadowing({
    activePassageSegmentIndex,
    clearRebuildPassageShadowingPromptTimer,
    clearRebuildSentenceShadowingPromptTimer,
    drillData,
    hasActivePassageResult,
    isRebuildMode,
    isRebuildPassage,
    pendingRebuildSentenceFeedback,
    rebuildFeedback,
    resetAudioPlayback,
    setPendingRebuildSentenceFeedback,
    setRebuildPassageShadowingFlow,
    setRebuildPassageShadowingSegmentIndex,
    setRebuildSentenceShadowingFlow,
}: {
    activePassageSegmentIndex: number;
    clearRebuildPassageShadowingPromptTimer: () => void;
    clearRebuildSentenceShadowingPromptTimer: () => void;
    drillData: RebuildShadowingDrillData | null;
    hasActivePassageResult: boolean;
    isRebuildMode: boolean;
    isRebuildPassage: boolean;
    pendingRebuildSentenceFeedback: unknown | null;
    rebuildFeedback: unknown | null;
    resetAudioPlayback: () => void;
    setPendingRebuildSentenceFeedback: (value: null) => void;
    setRebuildPassageShadowingFlow: Dispatch<SetStateAction<RebuildSentenceShadowingFlow>>;
    setRebuildPassageShadowingSegmentIndex: Dispatch<SetStateAction<number | null>>;
    setRebuildSentenceShadowingFlow: Dispatch<SetStateAction<RebuildSentenceShadowingFlow>>;
}) {
    const [rebuildShadowingState, setRebuildShadowingState] = useState<RebuildShadowingState>(() => createDefaultRebuildShadowingState());
    const [rebuildShadowingLiveRecognitionState, setRebuildShadowingLiveRecognitionState] = useState({ scopeKey: "none", value: "" });
    const [rebuildShadowingCorrectionState, setRebuildShadowingCorrectionState] = useState({ scopeKey: "none", value: false });
    const [rebuildListeningProgressState, setRebuildListeningProgressState] = useState({ scopeKey: "none", value: 0 });
    const [isRebuildSpeechRecognitionRunning, setIsRebuildSpeechRecognitionRunning] = useState(false);
    const [isRebuildSpeechRecognitionSupported, setIsRebuildSpeechRecognitionSupported] = useState(() => {
        if (typeof window === "undefined") return true;
        const speechWindow = window as typeof window & {
            SpeechRecognition?: RebuildSpeechRecognitionConstructor;
            webkitSpeechRecognition?: RebuildSpeechRecognitionConstructor;
        };
        return Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition);
    });
    const [rebuildListeningScoreFx, setRebuildListeningScoreFx] = useState<RebuildListeningScoreFx | null>(null);

    const rebuildListeningScoreFxTimerRef = useRef<number | null>(null);
    const rebuildShadowingRecorderRef = useRef<MediaRecorder | null>(null);
    const rebuildShadowingRecorderStreamRef = useRef<MediaStream | null>(null);
    const rebuildShadowingRecorderChunksRef = useRef<Blob[]>([]);
    const rebuildShadowingDiscardRecordingOnStopRef = useRef(false);
    const rebuildShadowingSpeechRecognitionRef = useRef<RebuildSpeechRecognition | null>(null);
    const rebuildShadowingSpeechRecognitionStopRequestedRef = useRef(false);
    const rebuildShadowingSpeechRecognitionFinalTranscriptRef = useRef("");
    const rebuildShadowingSpeechRecognitionInterimTranscriptRef = useRef("");
    const rebuildShadowingListeningProgressCursorRef = useRef(0);
    const rebuildShadowingRecordingScopeRef = useRef<RebuildShadowingScope | null>(null);
    const rebuildShadowingPlaybackRef = useRef<HTMLAudioElement | null>(null);
    const rebuildShadowingPlaybackUrlRef = useRef<string | null>(null);

    const activeRebuildShadowingScope = useMemo<RebuildShadowingScope | null>(() => {
        if (!isRebuildMode) return null;
        if (isRebuildPassage) {
            return hasActivePassageResult
                ? { kind: "segment", segmentIndex: activePassageSegmentIndex }
                : null;
        }
        return (rebuildFeedback || pendingRebuildSentenceFeedback) ? { kind: "sentence" } : null;
    }, [activePassageSegmentIndex, hasActivePassageResult, isRebuildMode, isRebuildPassage, pendingRebuildSentenceFeedback, rebuildFeedback]);

    const activeRebuildShadowingReferenceEnglish = useMemo(() => {
        if (!drillData || !activeRebuildShadowingScope) return "";
        if (activeRebuildShadowingScope.kind === "segment") {
            return drillData._rebuildMeta?.passageSession?.segments?.[activeRebuildShadowingScope.segmentIndex]?.referenceEnglish || "";
        }
        return drillData.reference_english || "";
    }, [activeRebuildShadowingScope, drillData]);

    const activeRebuildShadowingEntry = useMemo(() => (
        activeRebuildShadowingScope
            ? getRebuildShadowingEntry<Blob, RebuildShadowingResult>(rebuildShadowingState, activeRebuildShadowingScope)
            : null
    ), [activeRebuildShadowingScope, rebuildShadowingState]);
    const activeRebuildShadowingScopeKey = activeRebuildShadowingScope?.kind === "segment"
        ? `segment:${activeRebuildShadowingScope.segmentIndex}`
        : activeRebuildShadowingScope?.kind ?? "none";
    const activeResultTranscript = normalizeRebuildShadowingText(activeRebuildShadowingEntry?.result?.transcript || "");
    const rebuildListeningProgressCursor = activeResultTranscript
        ? estimateRebuildShadowingProgress(activeRebuildShadowingReferenceEnglish, activeResultTranscript)
        : rebuildListeningProgressState.scopeKey === activeRebuildShadowingScopeKey
            ? rebuildListeningProgressState.value
            : 0;
    const rebuildShadowingLiveRecognitionTranscript = activeResultTranscript
        ? activeResultTranscript
        : rebuildShadowingLiveRecognitionState.scopeKey === activeRebuildShadowingScopeKey
            ? rebuildShadowingLiveRecognitionState.value
            : "";
    const showRebuildShadowingCorrection = activeResultTranscript
        ? true
        : rebuildShadowingCorrectionState.scopeKey === activeRebuildShadowingScopeKey
            ? rebuildShadowingCorrectionState.value
            : false;

    const clearRebuildListeningScoreFxTimer = useCallback(() => {
        if (rebuildListeningScoreFxTimerRef.current !== null) {
            window.clearTimeout(rebuildListeningScoreFxTimerRef.current);
            rebuildListeningScoreFxTimerRef.current = null;
        }
    }, []);

    const upsertRebuildShadowingScopePatch = useCallback((
        scope: RebuildShadowingScope,
        patch: Partial<{
            result: RebuildShadowingResult | null;
            submitError: string | null;
            wavBlob: Blob | null;
        }>,
    ) => {
        setRebuildShadowingState((currentState) => {
            const scoped = upsertRebuildShadowingEntry(
                currentState,
                scope,
                patch,
                Date.now(),
            );
            return { ...currentState, ...scoped };
        });
    }, []);

    const cleanupRebuildShadowingRecorderResources = useCallback(() => {
        const recorder = rebuildShadowingRecorderRef.current;
        if (recorder) {
            recorder.ondataavailable = null;
            recorder.onerror = null;
            recorder.onstop = null;
        }
        rebuildShadowingRecorderRef.current = null;
        rebuildShadowingRecorderChunksRef.current = [];

        if (rebuildShadowingRecorderStreamRef.current) {
            for (const track of rebuildShadowingRecorderStreamRef.current.getTracks()) {
                track.stop();
            }
            rebuildShadowingRecorderStreamRef.current = null;
        }

        setRebuildShadowingState((currentState) => {
            if (!currentState.isRecording && !currentState.isProcessing) {
                return currentState;
            }
            return {
                ...currentState,
                isProcessing: false,
                isRecording: false,
            };
        });
    }, []);

    const stopRebuildShadowingSpeechRecognition = useCallback((forceAbort = false) => {
        rebuildShadowingSpeechRecognitionStopRequestedRef.current = true;
        const recognition = rebuildShadowingSpeechRecognitionRef.current;
        if (recognition) {
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            try {
                if (forceAbort) {
                    recognition.abort();
                } else {
                    recognition.stop();
                }
            } catch {
                // noop
            }
            rebuildShadowingSpeechRecognitionRef.current = null;
        }
        setIsRebuildSpeechRecognitionRunning(false);
        rebuildShadowingSpeechRecognitionFinalTranscriptRef.current = "";
        rebuildShadowingSpeechRecognitionInterimTranscriptRef.current = "";
    }, []);

    const startRebuildShadowingSpeechRecognition = useCallback((scope: RebuildShadowingScope, referenceSentence: string) => {
        if (typeof window === "undefined") return false;

        const speechWindow = window as typeof window & {
            SpeechRecognition?: RebuildSpeechRecognitionConstructor;
            webkitSpeechRecognition?: RebuildSpeechRecognitionConstructor;
        };
        const SpeechRecognitionCtor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) {
            setIsRebuildSpeechRecognitionSupported(false);
            upsertRebuildShadowingScopePatch(scope, {
                submitError: "当前浏览器不支持实时跟读反馈，你仍可录音并回放对比。",
            });
            return false;
        }

        stopRebuildShadowingSpeechRecognition(true);
        rebuildShadowingSpeechRecognitionStopRequestedRef.current = false;
        rebuildShadowingSpeechRecognitionFinalTranscriptRef.current = "";
        rebuildShadowingSpeechRecognitionInterimTranscriptRef.current = "";

        const recognition = new SpeechRecognitionCtor();
        recognition.lang = "en-US";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
            const rows = Array.from(event.results || []);
            const finalParts: string[] = [];
            const interimParts: string[] = [];

            for (const result of rows) {
                const transcript = normalizeRebuildShadowingText(result?.[0]?.transcript || "");
                if (!transcript) continue;
                if (result?.isFinal) {
                    finalParts.push(transcript);
                } else {
                    interimParts.push(transcript);
                }
            }

            const nextFinalTranscript = normalizeRebuildShadowingText(finalParts.join(" "));
            const nextInterimTranscript = normalizeRebuildShadowingText(interimParts.join(" "));
            rebuildShadowingSpeechRecognitionFinalTranscriptRef.current = nextFinalTranscript;
            rebuildShadowingSpeechRecognitionInterimTranscriptRef.current = nextInterimTranscript;
            const nextTranscript = normalizeRebuildShadowingText(`${nextFinalTranscript} ${nextInterimTranscript}`);
            if (!nextTranscript) return;
            setRebuildShadowingLiveRecognitionState({ scopeKey: activeRebuildShadowingScopeKey, value: nextTranscript });
            const nextProgress = estimateRebuildShadowingProgress(referenceSentence, nextTranscript);
            if (nextProgress > rebuildShadowingListeningProgressCursorRef.current) {
                rebuildShadowingListeningProgressCursorRef.current = nextProgress;
                setRebuildListeningProgressState({ scopeKey: activeRebuildShadowingScopeKey, value: nextProgress });
            }
        };
        recognition.onerror = (event) => {
            const errorCode = `${event?.error || ""}`.toLowerCase();
            if (!errorCode || errorCode === "aborted" || errorCode === "no-speech") {
                return;
            }
            if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
                upsertRebuildShadowingScopePatch(scope, {
                    submitError: "语音识别权限被拒绝，请在浏览器设置中允许麦克风后重试。",
                });
                return;
            }
            upsertRebuildShadowingScopePatch(scope, {
                submitError: `实时跟读识别异常：${event?.error || "未知错误"}`,
            });
        };
        recognition.onend = () => {
            if (rebuildShadowingSpeechRecognitionStopRequestedRef.current) {
                setIsRebuildSpeechRecognitionRunning(false);
                rebuildShadowingSpeechRecognitionRef.current = null;
                return;
            }

            const recorder = rebuildShadowingRecorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                try {
                    recognition.start();
                    return;
                } catch {
                    // fall through
                }
            }

            setIsRebuildSpeechRecognitionRunning(false);
            rebuildShadowingSpeechRecognitionRef.current = null;
        };

        rebuildShadowingSpeechRecognitionRef.current = recognition;
        try {
            recognition.start();
            setIsRebuildSpeechRecognitionRunning(true);
            return true;
        } catch (error) {
            rebuildShadowingSpeechRecognitionRef.current = null;
            setIsRebuildSpeechRecognitionRunning(false);
            const message = error instanceof Error ? error.message : "启动实时识别失败";
            upsertRebuildShadowingScopePatch(scope, { submitError: message });
            return false;
        }
    }, [activeRebuildShadowingScopeKey, stopRebuildShadowingSpeechRecognition, upsertRebuildShadowingScopePatch]);

    const resetRebuildShadowingState = useCallback(() => {
        clearRebuildSentenceShadowingPromptTimer();
        clearRebuildPassageShadowingPromptTimer();
        rebuildShadowingDiscardRecordingOnStopRef.current = true;
        const recorder = rebuildShadowingRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            try {
                recorder.stop();
            } catch {
                // noop
            }
        }
        if (rebuildShadowingRecorderStreamRef.current) {
            for (const track of rebuildShadowingRecorderStreamRef.current.getTracks()) {
                track.stop();
            }
            rebuildShadowingRecorderStreamRef.current = null;
        }
        rebuildShadowingRecorderRef.current = null;
        rebuildShadowingRecorderChunksRef.current = [];
        rebuildShadowingDiscardRecordingOnStopRef.current = false;

        const speechRecognition = rebuildShadowingSpeechRecognitionRef.current;
        if (speechRecognition) {
            speechRecognition.onresult = null;
            speechRecognition.onerror = null;
            speechRecognition.onend = null;
            try {
                speechRecognition.abort();
            } catch {
                // noop
            }
            rebuildShadowingSpeechRecognitionRef.current = null;
        }
        rebuildShadowingSpeechRecognitionStopRequestedRef.current = true;
        rebuildShadowingSpeechRecognitionFinalTranscriptRef.current = "";
        rebuildShadowingSpeechRecognitionInterimTranscriptRef.current = "";
        rebuildShadowingListeningProgressCursorRef.current = 0;
        setIsRebuildSpeechRecognitionRunning(false);
        setRebuildShadowingLiveRecognitionState({ scopeKey: "none", value: "" });
        setRebuildShadowingCorrectionState({ scopeKey: "none", value: false });
        setRebuildListeningProgressState({ scopeKey: "none", value: 0 });

        rebuildShadowingRecordingScopeRef.current = null;
        if (rebuildShadowingPlaybackRef.current) {
            rebuildShadowingPlaybackRef.current.pause();
            rebuildShadowingPlaybackRef.current.currentTime = 0;
            rebuildShadowingPlaybackRef.current.src = "";
            rebuildShadowingPlaybackRef.current = null;
        }
        if (rebuildShadowingPlaybackUrlRef.current) {
            URL.revokeObjectURL(rebuildShadowingPlaybackUrlRef.current);
            rebuildShadowingPlaybackUrlRef.current = null;
        }
        setRebuildShadowingState(createDefaultRebuildShadowingState());
        setRebuildSentenceShadowingFlow("idle");
        setPendingRebuildSentenceFeedback(null);
        setRebuildPassageShadowingFlow("idle");
        setRebuildPassageShadowingSegmentIndex(null);
    }, [
        clearRebuildPassageShadowingPromptTimer,
        clearRebuildSentenceShadowingPromptTimer,
        setPendingRebuildSentenceFeedback,
        setRebuildPassageShadowingFlow,
        setRebuildPassageShadowingSegmentIndex,
        setRebuildSentenceShadowingFlow,
    ]);

    const handleStartRebuildShadowingRecording = useCallback(async () => {
        if (!isRebuildMode || !activeRebuildShadowingScope) return;
        const referenceSentence = normalizeRebuildShadowingText(activeRebuildShadowingReferenceEnglish);
        if (!referenceSentence) return;
        if (rebuildShadowingState.isRecording || rebuildShadowingState.isProcessing || rebuildShadowingState.isSubmitting) return;
        if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            upsertRebuildShadowingScopePatch(activeRebuildShadowingScope, {
                submitError: "当前浏览器不支持录音，请更换浏览器后再试。",
            });
            return;
        }
        if (typeof MediaRecorder === "undefined") {
            upsertRebuildShadowingScopePatch(activeRebuildShadowingScope, {
                submitError: "当前环境不支持录音组件，请更换浏览器后再试。",
            });
            return;
        }

        if (rebuildShadowingPlaybackRef.current) {
            rebuildShadowingPlaybackRef.current.pause();
            rebuildShadowingPlaybackRef.current.currentTime = 0;
        }
        resetAudioPlayback();

        cleanupRebuildShadowingRecorderResources();
        stopRebuildShadowingSpeechRecognition(true);
        rebuildShadowingRecordingScopeRef.current = activeRebuildShadowingScope;
        rebuildShadowingSpeechRecognitionFinalTranscriptRef.current = "";
        rebuildShadowingSpeechRecognitionInterimTranscriptRef.current = "";
        rebuildShadowingListeningProgressCursorRef.current = 0;
        setRebuildListeningProgressState({ scopeKey: activeRebuildShadowingScopeKey, value: 0 });
        setRebuildShadowingLiveRecognitionState({ scopeKey: activeRebuildShadowingScopeKey, value: "" });
        setRebuildShadowingCorrectionState({ scopeKey: activeRebuildShadowingScopeKey, value: false });
        clearRebuildListeningScoreFxTimer();
        setRebuildListeningScoreFx(null);

        setRebuildShadowingState((currentState) => ({
            ...currentState,
            ...upsertRebuildShadowingEntry(
                currentState,
                activeRebuildShadowingScope,
                { submitError: null, wavBlob: null },
                Date.now(),
            ),
            isProcessing: false,
            isRecording: false,
        }));

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const preferredMimeTypes = [
                "audio/webm;codecs=opus",
                "audio/webm",
                "audio/mp4",
            ];
            const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            rebuildShadowingRecorderRef.current = recorder;
            rebuildShadowingRecorderStreamRef.current = stream;
            rebuildShadowingRecorderChunksRef.current = [];
            rebuildShadowingDiscardRecordingOnStopRef.current = false;

            recorder.ondataavailable = (event: BlobEvent) => {
                if (event.data.size > 0) {
                    rebuildShadowingRecorderChunksRef.current.push(event.data);
                }
            };
            recorder.onerror = () => {
                const scope = rebuildShadowingRecordingScopeRef.current;
                if (scope) {
                    upsertRebuildShadowingScopePatch(scope, { submitError: "录音失败，请重试。" });
                }
                stopRebuildShadowingSpeechRecognition(true);
                cleanupRebuildShadowingRecorderResources();
                rebuildShadowingRecordingScopeRef.current = null;
            };
            recorder.onstop = () => {
                const scope = rebuildShadowingRecordingScopeRef.current;
                const shouldDiscard = rebuildShadowingDiscardRecordingOnStopRef.current;
                rebuildShadowingDiscardRecordingOnStopRef.current = false;

                const blob = new Blob(
                    rebuildShadowingRecorderChunksRef.current,
                    { type: recorder.mimeType || "audio/webm" },
                );
                cleanupRebuildShadowingRecorderResources();
                if (shouldDiscard || blob.size <= 0 || !scope) {
                    setRebuildShadowingCorrectionState({ scopeKey: "none", value: false });
                    rebuildShadowingRecordingScopeRef.current = null;
                    return;
                }

                setRebuildShadowingState((currentState) => ({
                    ...currentState,
                    ...upsertRebuildShadowingEntry(
                        currentState,
                        scope,
                        {
                            submitError: null,
                            wavBlob: blob,
                        },
                        Date.now(),
                    ),
                }));
                rebuildShadowingRecordingScopeRef.current = null;
            };

            recorder.start();
            setRebuildShadowingState((currentState) => ({
                ...currentState,
                isProcessing: false,
                isRecording: true,
            }));
            startRebuildShadowingSpeechRecognition(activeRebuildShadowingScope, referenceSentence);
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message.toLowerCase().includes("notallowed") || message.toLowerCase().includes("permission")) {
                upsertRebuildShadowingScopePatch(activeRebuildShadowingScope, {
                    submitError: "麦克风权限被拒绝，请在浏览器设置里允许后重试。",
                });
            } else {
                upsertRebuildShadowingScopePatch(activeRebuildShadowingScope, {
                    submitError: message || "麦克风权限获取失败，请检查浏览器设置。",
                });
            }
            cleanupRebuildShadowingRecorderResources();
            stopRebuildShadowingSpeechRecognition(true);
            rebuildShadowingRecordingScopeRef.current = null;
        }
    }, [
        activeRebuildShadowingScopeKey,
        activeRebuildShadowingReferenceEnglish,
        activeRebuildShadowingScope,
        cleanupRebuildShadowingRecorderResources,
        clearRebuildListeningScoreFxTimer,
        isRebuildMode,
        rebuildShadowingState.isProcessing,
        rebuildShadowingState.isRecording,
        rebuildShadowingState.isSubmitting,
        resetAudioPlayback,
        startRebuildShadowingSpeechRecognition,
        stopRebuildShadowingSpeechRecognition,
        upsertRebuildShadowingScopePatch,
    ]);

    const handleStopRebuildShadowingRecording = useCallback(() => {
        if (!isRebuildMode) return;
        const recorder = rebuildShadowingRecorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        stopRebuildShadowingSpeechRecognition(false);
        rebuildShadowingDiscardRecordingOnStopRef.current = false;
        setRebuildShadowingCorrectionState({ scopeKey: activeRebuildShadowingScopeKey, value: true });
        setRebuildShadowingState((currentState) => ({
            ...currentState,
            isProcessing: true,
        }));
        try {
            recorder.stop();
        } catch (error) {
            const scope = rebuildShadowingRecordingScopeRef.current;
            if (scope) {
                const message = error instanceof Error ? error.message : "停止录音失败，请重试。";
                upsertRebuildShadowingScopePatch(scope, { submitError: message });
            }
            cleanupRebuildShadowingRecorderResources();
        }
    }, [
        activeRebuildShadowingScopeKey,
        cleanupRebuildShadowingRecorderResources,
        isRebuildMode,
        stopRebuildShadowingSpeechRecognition,
        upsertRebuildShadowingScopePatch,
    ]);

    const handlePlayRebuildShadowingRecording = useCallback(() => {
        if (!activeRebuildShadowingEntry?.wavBlob) return;
        if (rebuildShadowingPlaybackRef.current) {
            rebuildShadowingPlaybackRef.current.pause();
            rebuildShadowingPlaybackRef.current.currentTime = 0;
        }
        if (rebuildShadowingPlaybackUrlRef.current) {
            URL.revokeObjectURL(rebuildShadowingPlaybackUrlRef.current);
            rebuildShadowingPlaybackUrlRef.current = null;
        }

        const nextUrl = URL.createObjectURL(activeRebuildShadowingEntry.wavBlob);
        rebuildShadowingPlaybackUrlRef.current = nextUrl;
        const nextAudio = new Audio(nextUrl);
        rebuildShadowingPlaybackRef.current = nextAudio;
        nextAudio.currentTime = 0;
        void nextAudio.play().catch(() => undefined);
    }, [activeRebuildShadowingEntry]);

    const handleSubmitRebuildShadowing = useCallback(() => {
        if (!isRebuildMode || !activeRebuildShadowingScope) return false;
        const referenceSentence = normalizeRebuildShadowingText(activeRebuildShadowingReferenceEnglish);
        if (!referenceSentence) return false;
        const activeEntry = getRebuildShadowingEntry<Blob, RebuildShadowingResult>(
            rebuildShadowingState,
            activeRebuildShadowingScope,
        );
        if (!activeEntry.wavBlob) {
            setRebuildShadowingState((currentState) => {
                const scoped = upsertRebuildShadowingEntry(
                    currentState,
                    activeRebuildShadowingScope,
                    { submitError: "先录一遍完整音频，再提交跟读评分。" },
                    Date.now(),
                );
                return { ...currentState, ...scoped };
            });
            return false;
        }
        const transcript = normalizeRebuildShadowingText(
            rebuildShadowingSpeechRecognitionFinalTranscriptRef.current
            || rebuildShadowingLiveRecognitionTranscript
            || "",
        );
        const metrics = scoreRebuildShadowingRecognition(referenceSentence, transcript);
        if (!metrics.spokenCount) {
            upsertRebuildShadowingScopePatch(activeRebuildShadowingScope, {
                submitError: "先开始录音并完整跟读一遍，再提交评分。",
            });
            return false;
        }

        setRebuildShadowingState((currentState) => ({
            ...currentState,
            ...upsertRebuildShadowingEntry(
                currentState,
                activeRebuildShadowingScope,
                { submitError: null },
                Date.now(),
            ),
            isSubmitting: true,
        }));

        if (REBUILD_SHADOWING_AFFECTS_ELO) {
            console.warn("[RebuildShadowing] Unexpected Elo-enabled flag detected.");
        }

        const tier = resolveRebuildShadowingScoreTier(metrics.score);
        const scoreTitle = tier === "excellent"
            ? "太稳了！"
            : tier === "good"
                ? "表现不错！"
                : tier === "ok"
                    ? "继续冲！"
                    : "再来一遍更好";
        const scoreDetail = `匹配 ${metrics.correctCount}/${Math.max(1, metrics.totalCount)} 个词，系统自动评分 ${metrics.score}/100`;
        clearRebuildListeningScoreFxTimer();
        setRebuildListeningScoreFx({
            detail: scoreDetail,
            score: metrics.score,
            tier,
            title: scoreTitle,
        });
        playRebuildListeningScoreSfx(tier);
        rebuildListeningScoreFxTimerRef.current = window.setTimeout(() => {
            setRebuildListeningScoreFx((current) => (current?.score === metrics.score ? null : current));
            rebuildListeningScoreFxTimerRef.current = null;
        }, 1800);

        const summary = tier === "excellent"
            ? "跟读非常稳，节奏和关键词覆盖都很好。"
            : tier === "good"
                ? "整体表现不错，少数词还可以更清晰。"
                : tier === "ok"
                    ? "能跟上主要内容，建议再来一遍提升完整度。"
                    : "这次还没跟上节奏，先慢速复读再提速。";
        const missingWords = buildRebuildShadowingWordResults(referenceSentence, transcript)
            .filter((item) => item.status === "missing")
            .slice(0, 2)
            .map((item) => item.word);
        const tips = [
            missingWords.length > 0
                ? `优先补上漏读词：${missingWords.join(" / ")}。`
                : "保持语速稳定，尽量完整复现整句。",
            "先慢速跟读一遍，再按正常语速复读一遍。",
        ];
        const pronunciationScore = Math.round(metrics.precision * 100);
        const contentScore = Math.round(metrics.recall * 100);
        const fluencyScore = Math.round(metrics.lengthBalance * 100);
        const wordResults = buildRebuildShadowingWordResults(referenceSentence, transcript);
        const normalizedResult: RebuildShadowingResult = {
            content_score: contentScore,
            coverage_ratio: metrics.totalCount > 0 ? metrics.correctCount / metrics.totalCount : 0,
            fluency_score: fluencyScore,
            pronunciation_score: pronunciationScore,
            score: metrics.score,
            submittedAt: Date.now(),
            summary_cn: summary,
            tips_cn: tips,
            transcript,
            utterance_scores: {
                accuracy: pronunciationScore,
                completeness: contentScore,
                content_reproduction: contentScore,
                fluency: fluencyScore,
                pronunciation_clarity: pronunciationScore,
                prosody: pronunciationScore,
                rhythm_fluency: fluencyScore,
                total: metrics.score,
            },
            word_results: wordResults,
        };

        setRebuildShadowingState((currentState) => ({
            ...currentState,
            ...upsertRebuildShadowingEntry(
                currentState,
                activeRebuildShadowingScope,
                {
                    result: normalizedResult,
                    submitError: null,
                },
                Date.now(),
            ),
            isSubmitting: false,
        }));
        return true;
    }, [
        activeRebuildShadowingReferenceEnglish,
        activeRebuildShadowingScope,
        clearRebuildListeningScoreFxTimer,
        isRebuildMode,
        rebuildShadowingLiveRecognitionTranscript,
        rebuildShadowingState,
        upsertRebuildShadowingScopePatch,
    ]);

    useEffect(() => {
        if (!isRebuildMode || isRebuildPassage) return;
        if (!rebuildFeedback) {
            setRebuildSentenceShadowingFlow("idle");
        }
    }, [isRebuildMode, isRebuildPassage, rebuildFeedback, setRebuildSentenceShadowingFlow]);

    useEffect(() => {
        return () => {
            clearRebuildListeningScoreFxTimer();
            const speechRecognition = rebuildShadowingSpeechRecognitionRef.current;
            if (speechRecognition) {
                speechRecognition.onresult = null;
                speechRecognition.onerror = null;
                speechRecognition.onend = null;
                try {
                    speechRecognition.abort();
                } catch {
                    // noop
                }
                rebuildShadowingSpeechRecognitionRef.current = null;
            }
            const recorder = rebuildShadowingRecorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                try {
                    recorder.stop();
                } catch {
                    // noop
                }
            }
            if (rebuildShadowingRecorderStreamRef.current) {
                for (const track of rebuildShadowingRecorderStreamRef.current.getTracks()) {
                    track.stop();
                }
                rebuildShadowingRecorderStreamRef.current = null;
            }
            if (rebuildShadowingPlaybackRef.current) {
                rebuildShadowingPlaybackRef.current.pause();
                rebuildShadowingPlaybackRef.current.currentTime = 0;
                rebuildShadowingPlaybackRef.current.src = "";
            }
            if (rebuildShadowingPlaybackUrlRef.current) {
                URL.revokeObjectURL(rebuildShadowingPlaybackUrlRef.current);
            }
        };
    }, [clearRebuildListeningScoreFxTimer]);

    return {
        activeRebuildShadowingEntry,
        activeRebuildShadowingReferenceEnglish,
        activeRebuildShadowingScope,
        handlePlayRebuildShadowingRecording,
        handleStartRebuildShadowingRecording,
        handleStopRebuildShadowingRecording,
        handleSubmitRebuildShadowing,
        isRebuildSpeechRecognitionRunning,
        isRebuildSpeechRecognitionSupported,
        rebuildListeningProgressCursor,
        rebuildListeningScoreFx,
        rebuildShadowingLiveRecognitionTranscript,
        rebuildShadowingState,
        resetRebuildShadowingState,
        showRebuildShadowingCorrection,
    };
}
