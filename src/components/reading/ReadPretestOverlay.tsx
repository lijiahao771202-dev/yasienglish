"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    ArrowRight,
    Eraser,
    Headphones,
    Languages,
    Mic,
    PenLine,
    Play,
    Square,
    SendHorizontal,
    Sparkles,
    X,
} from "lucide-react";

import { getPressableStyle } from "@/lib/pressable";
import { buildReadPretestBundle } from "@/lib/read-pretest";
import { alignTokensToMarks, extractWordTokens, normalizeWordForMatch, type TtsWordMark } from "@/lib/read-speaking";
import { requestTtsPayload, resolveTtsAudioBlob } from "@/lib/tts-client";
import { cn } from "@/lib/utils";

type PretestStage = "confirm" | "hub" | "runner" | "complete";
type PretestModule = "listening" | "writing" | "translation";
type PronunciationTokenState = "pending" | "current" | "correct" | "incorrect";
type ListeningScoreTier = "excellent" | "good" | "ok" | "retry";

interface BrowserSpeechRecognitionResultEntry {
    transcript?: string;
}

interface BrowserSpeechRecognitionResultLike {
    isFinal?: boolean;
    0?: BrowserSpeechRecognitionResultEntry;
}

interface BrowserSpeechRecognitionEventLike {
    results?: ArrayLike<BrowserSpeechRecognitionResultLike>;
    resultIndex?: number;
}

interface BrowserSpeechRecognitionErrorEventLike {
    error?: string;
    message?: string;
}

interface BrowserSpeechRecognition {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((event: BrowserSpeechRecognitionEventLike) => void) | null;
    onerror: ((event: BrowserSpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
    interface Window {
        SpeechRecognition?: BrowserSpeechRecognitionConstructor;
        webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    }
}

interface PretestQuestion {
    id: string;
    module: PretestModule;
    sentence: string;
    moduleIndex: number;
    moduleTotal: number;
    globalIndex: number;
    globalTotal: number;
}

interface PretestRecord {
    questionId: string;
    module: PretestModule;
    skipped: boolean;
    answer: string;
    score?: number;
    feedback?: string;
}

interface ReadPretestOverlayProps {
    visible: boolean;
    articleTitle: string;
    articleText: string;
    articleKey: string;
    currentElo?: number;
    onClose: () => void;
    onDirectQuiz: () => void;
    onEnterQuiz: () => void;
    onMarkCompleted: () => Promise<void> | void;
}

const MODULE_ORDER: PretestModule[] = ["listening", "writing", "translation"];
const MODULE_META: Record<PretestModule, {
    title: string;
    subtitle: string;
    icon: ComponentType<{ className?: string }>;
    chipClass: string;
}> = {
    listening: {
        title: "听力测试",
        subtitle: "抽 5 句 · 自动评分",
        icon: Headphones,
        chipClass: "border-[#c8e4ff] bg-[#eef7ff] text-[#2f66f3]",
    },
    writing: {
        title: "仿写测试",
        subtitle: "抽 3 句 · AI 反馈",
        icon: PenLine,
        chipClass: "border-[#bfead4] bg-[#f0fff7] text-[#1f9a67]",
    },
    translation: {
        title: "翻译测试",
        subtitle: "抽 3 句 · AI 评分",
        icon: Languages,
        chipClass: "border-[#decfff] bg-[#f7f2ff] text-[#7a58e8]",
    },
};

function normalizeWhitespace(text: string) {
    return text.replace(/\s+/g, " ").trim();
}

function resolveListeningScoreTier(score: number): ListeningScoreTier {
    if (score >= 90) return "excellent";
    if (score >= 75) return "good";
    if (score >= 55) return "ok";
    return "retry";
}

function computeLcsLength(source: string[], target: string[]) {
    const sourceLength = source.length;
    const targetLength = target.length;
    if (!sourceLength || !targetLength) return 0;

    let previous = new Array(targetLength + 1).fill(0);
    let current = new Array(targetLength + 1).fill(0);

    for (let row = 1; row <= sourceLength; row += 1) {
        for (let col = 1; col <= targetLength; col += 1) {
            if (source[row - 1] === target[col - 1]) {
                current[col] = previous[col - 1] + 1;
            } else {
                current[col] = Math.max(previous[col], current[col - 1]);
            }
        }
        [previous, current] = [current, previous];
        current.fill(0);
    }

    return previous[targetLength];
}

function scoreListeningRecognition(referenceSentence: string, transcript: string) {
    const normalizedTargetTokens = extractWordTokens(referenceSentence)
        .map((token) => normalizeWordForMatch(token.text))
        .filter(Boolean);
    const normalizedSpokenTokens = extractWordTokens(transcript)
        .map((token) => normalizeWordForMatch(token.text))
        .filter(Boolean);

    const totalCount = normalizedTargetTokens.length;
    const spokenCount = normalizedSpokenTokens.length;
    if (!totalCount || !spokenCount) {
        return {
            score: 0,
            correctCount: 0,
            totalCount,
            spokenCount,
        };
    }

    const matchedCount = computeLcsLength(normalizedTargetTokens, normalizedSpokenTokens);
    const recall = matchedCount / totalCount;
    const precision = matchedCount / spokenCount;
    const lengthBalance = Math.max(0, 1 - (Math.abs(spokenCount - totalCount) / totalCount));
    const weighted = (recall * 0.68) + (precision * 0.24) + (lengthBalance * 0.08);
    const score = Math.round(Math.max(0, Math.min(100, weighted * 100)));

    return {
        score,
        correctCount: matchedCount,
        totalCount,
        spokenCount,
    };
}

function toQuestions(bundle: ReturnType<typeof buildReadPretestBundle>) {
    const byModule: Record<PretestModule, string[]> = {
        listening: bundle.listening,
        writing: bundle.writing,
        translation: bundle.translation,
    };
    const total = MODULE_ORDER.reduce((sum, moduleType) => sum + byModule[moduleType].length, 0);
    const questions: PretestQuestion[] = [];
    let globalIndex = 0;

    for (const moduleType of MODULE_ORDER) {
        const items = byModule[moduleType];
        for (let index = 0; index < items.length; index += 1) {
            questions.push({
                id: `${moduleType}-${index}`,
                module: moduleType,
                sentence: items[index],
                moduleIndex: index + 1,
                moduleTotal: items.length,
                globalIndex: globalIndex + 1,
                globalTotal: total,
            });
            globalIndex += 1;
        }
    }
    return questions;
}

export function ReadPretestOverlay({
    visible,
    articleTitle,
    articleText,
    articleKey,
    currentElo,
    onClose,
    onDirectQuiz,
    onEnterQuiz,
    onMarkCompleted,
}: ReadPretestOverlayProps) {
    const prefersReducedMotion = useReducedMotion();
    const [stage, setStage] = useState<PretestStage>("confirm");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answerDraft, setAnswerDraft] = useState("");
    const [records, setRecords] = useState<Record<string, PretestRecord>>({});
    const [questionFeedback, setQuestionFeedback] = useState<{ scoreLabel: string; feedback: string } | null>(null);
    const [runnerError, setRunnerError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [translationRefMap, setTranslationRefMap] = useState<Record<string, string>>({});
    const [translationRefLoading, setTranslationRefLoading] = useState(false);
    const [translationRefError, setTranslationRefError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(3);
    const completeMarkedRef = useRef(false);
    const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
    const ttsAudioUrlRef = useRef<string | null>(null);
    const ttsRequestIdRef = useRef(0);
    const [isPreparingAudio, setIsPreparingAudio] = useState(false);
    const selfRecordAudioRef = useRef<HTMLAudioElement | null>(null);
    const selfRecordAudioUrlRef = useRef<string | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const recorderStreamRef = useRef<MediaStream | null>(null);
    const recorderChunksRef = useRef<Blob[]>([]);
    const discardRecordingOnStopRef = useRef(false);
    const [isRecordingSelfVoice, setIsRecordingSelfVoice] = useState(false);
    const [hasSelfRecording, setHasSelfRecording] = useState(false);
    const [isReferenceAudioPlaying, setIsReferenceAudioPlaying] = useState(false);
    const [referenceWordMarks, setReferenceWordMarks] = useState<TtsWordMark[]>([]);
    const [activeReferenceWordMarkIndex, setActiveReferenceWordMarkIndex] = useState<number | null>(null);
    const [liveRecognitionTranscript, setLiveRecognitionTranscript] = useState("");
    const [isSpeechRecognitionRunning, setIsSpeechRecognitionRunning] = useState(false);
    const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(true);
    const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
    const speechRecognitionStopRequestedRef = useRef(false);
    const speechRecognitionFinalTranscriptRef = useRef("");
    const speechRecognitionInterimTranscriptRef = useRef("");
    const speechRecognitionStableTranscriptRef = useRef("");
    const speechRecognitionStableMatchRef = useRef(0);
    const speechRecognitionStableTokenCountRef = useRef(0);
    const [lockedCorrectTokenIndexes, setLockedCorrectTokenIndexes] = useState<number[]>([]);
    const [isListeningAdvancePending, setIsListeningAdvancePending] = useState(false);
    const listeningAdvanceTimerRef = useRef<number | null>(null);
    const [listeningScoreFx, setListeningScoreFx] = useState<{
        score: number;
        tier: ListeningScoreTier;
        title: string;
        detail: string;
    } | null>(null);

    const clearListeningAdvanceTimer = useCallback(() => {
        if (listeningAdvanceTimerRef.current !== null) {
            window.clearTimeout(listeningAdvanceTimerRef.current);
            listeningAdvanceTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setIsSpeechRecognitionSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    }, []);

    const bundle = useMemo(
        () => buildReadPretestBundle({ articleText, articleKey }),
        [articleKey, articleText],
    );
    const questions = useMemo(() => toQuestions(bundle), [bundle]);
    const totalQuestions = questions.length;
    const currentQuestion = questions[currentIndex] ?? null;

    const moduleStats = useMemo(() => {
        const result: Record<PretestModule, { done: number; total: number; skipped: number }> = {
            listening: { done: 0, total: bundle.listening.length, skipped: 0 },
            writing: { done: 0, total: bundle.writing.length, skipped: 0 },
            translation: { done: 0, total: bundle.translation.length, skipped: 0 },
        };
        for (const record of Object.values(records)) {
            result[record.module].done += 1;
            if (record.skipped) result[record.module].skipped += 1;
        }
        return result;
    }, [bundle, records]);

    const completedCount = Object.keys(records).length;
    const skippedCount = Object.values(records).filter((row) => row.skipped).length;
    const sourceTokens = useMemo(
        () => extractWordTokens(currentQuestion?.sentence || ""),
        [currentQuestion?.sentence],
    );
    const sourceTokenToMarkIndex = useMemo(
        () => alignTokensToMarks(sourceTokens, referenceWordMarks),
        [sourceTokens, referenceWordMarks],
    );
    const liveRecognitionTokens = useMemo(
        () => extractWordTokens(liveRecognitionTranscript)
            .map((token) => normalizeWordForMatch(token.text))
            .filter(Boolean),
        [liveRecognitionTranscript],
    );
    const pronunciationFeedback = useMemo(() => {
        const tokenStates = new Map<number, PronunciationTokenState>();
        const normalizedTargetTokens = sourceTokens
            .map((token) => normalizeWordForMatch(token.text))
            .filter(Boolean);
        let recognitionCursor = 0;
        let correctCount = 0;

        for (let index = 0; index < sourceTokens.length; index += 1) {
            const token = sourceTokens[index];
            const target = normalizeWordForMatch(token.text);
            if (!target) continue;

            if (recognitionCursor >= liveRecognitionTokens.length) {
                tokenStates.set(token.index, "pending");
                continue;
            }

            if (liveRecognitionTokens[recognitionCursor] === target) {
                tokenStates.set(token.index, "correct");
                correctCount += 1;
                recognitionCursor += 1;
                continue;
            }

            let lookaheadMatch = -1;
            const upperBound = Math.min(liveRecognitionTokens.length, recognitionCursor + 3);
            for (let scan = recognitionCursor + 1; scan < upperBound; scan += 1) {
                if (liveRecognitionTokens[scan] === target) {
                    lookaheadMatch = scan;
                    break;
                }
            }

            if (lookaheadMatch >= 0) {
                tokenStates.set(token.index, "correct");
                correctCount += 1;
                recognitionCursor = lookaheadMatch + 1;
                continue;
            }

            tokenStates.set(token.index, "incorrect");
            recognitionCursor += 1;
        }

        if (isRecordingSelfVoice || isListeningAdvancePending) {
            for (let index = 0; index < sourceTokens.length; index += 1) {
                const token = sourceTokens[index];
                const target = normalizeWordForMatch(token.text);
                if (!target) continue;
                const state = tokenStates.get(token.index);
                if (!state || state === "pending") {
                    tokenStates.set(token.index, "current");
                    break;
                }
            }
        }

        return {
            tokenStates,
            correctCount,
            totalCount: normalizedTargetTokens.length,
        };
    }, [isListeningAdvancePending, isRecordingSelfVoice, liveRecognitionTokens, sourceTokens]);
    const shouldShowPronunciationFeedback = currentQuestion?.module === "listening"
        && (isRecordingSelfVoice || isListeningAdvancePending || liveRecognitionTokens.length > 0);
    const lockedCorrectTokenSet = useMemo(
        () => new Set(lockedCorrectTokenIndexes),
        [lockedCorrectTokenIndexes],
    );
    useEffect(() => {
        if (!shouldShowPronunciationFeedback) return;
        setLockedCorrectTokenIndexes((prev) => {
            const next = new Set(prev);
            let changed = false;
            for (const token of sourceTokens) {
                if (pronunciationFeedback.tokenStates.get(token.index) === "correct" && !next.has(token.index)) {
                    next.add(token.index);
                    changed = true;
                }
            }
            return changed ? Array.from(next).sort((left, right) => left - right) : prev;
        });
    }, [pronunciationFeedback.tokenStates, shouldShowPronunciationFeedback, sourceTokens]);
    const sourceSentenceKaraokeContent = useMemo<ReactNode>(() => {
        const sentence = currentQuestion?.sentence || "";
        if (!sentence || sourceTokens.length === 0) return sentence;

        let cursor = 0;
        const parts: ReactNode[] = [];

        for (const token of sourceTokens) {
            if (token.start > cursor) {
                parts.push(
                    <span key={`plain-${cursor}-${token.start}`}>
                        {sentence.slice(cursor, token.start)}
                    </span>,
                );
            }

            const markIndex = sourceTokenToMarkIndex.get(token.index);
            const isActiveWord = isReferenceAudioPlaying
                && typeof markIndex === "number"
                && activeReferenceWordMarkIndex === markIndex;
            const isPassedWord = isReferenceAudioPlaying
                && typeof markIndex === "number"
                && activeReferenceWordMarkIndex !== null
                && markIndex < activeReferenceWordMarkIndex;
            const tokenState = pronunciationFeedback.tokenStates.get(token.index);
            const isLockedCorrect = lockedCorrectTokenSet.has(token.index);

            parts.push(
                <span
                    key={`token-${token.index}-${token.start}`}
                    className={cn(
                        "rounded-[0.38em] px-[0.08em] py-[0.01em] transition-colors duration-220 ease-out",
                        isActiveWord
                            ? "bg-[#ffd970] text-[#7a3f00] shadow-[0_0_0_1px_rgba(234,163,27,0.42)]"
                            : isPassedWord
                                ? "text-[#6b6358]"
                                : "",
                        !isReferenceAudioPlaying && shouldShowPronunciationFeedback && (tokenState === "correct" || isLockedCorrect)
                            ? "bg-[#ebf9f1] text-[#2f6f4d] shadow-[inset_0_-1px_0_rgba(37,153,95,0.35)]"
                            : "",
                        !isReferenceAudioPlaying && shouldShowPronunciationFeedback && !isLockedCorrect && tokenState === "incorrect"
                            ? "bg-[#fff2f2] text-[#8e4a4a] shadow-[inset_0_-1px_0_rgba(214,97,97,0.34)]"
                            : "",
                        !isReferenceAudioPlaying && shouldShowPronunciationFeedback && !isLockedCorrect && tokenState === "current"
                            ? "bg-[#eef4ff] text-[#2f58b0] shadow-[inset_0_-1px_0_rgba(78,122,219,0.34)]"
                            : "",
                    )}
                >
                    {sentence.slice(token.start, token.end)}
                </span>,
            );

            cursor = token.end;
        }

        if (cursor < sentence.length) {
            parts.push(
                <span key={`plain-tail-${cursor}`}>
                    {sentence.slice(cursor)}
                </span>,
            );
        }

        return parts;
    }, [
        activeReferenceWordMarkIndex,
        currentQuestion?.sentence,
        isReferenceAudioPlaying,
        lockedCorrectTokenSet,
        pronunciationFeedback.tokenStates,
        shouldShowPronunciationFeedback,
        sourceTokenToMarkIndex,
        sourceTokens,
    ]);

    useEffect(() => {
        if (!visible) return;
        setStage("confirm");
        setCurrentIndex(0);
        setAnswerDraft("");
        setRecords({});
        setQuestionFeedback(null);
        setRunnerError(null);
        setTranslationRefMap({});
        setTranslationRefError(null);
        setTranslationRefLoading(false);
        setCountdown(3);
        setReferenceWordMarks([]);
        setActiveReferenceWordMarkIndex(null);
        setIsReferenceAudioPlaying(false);
        setLiveRecognitionTranscript("");
        speechRecognitionFinalTranscriptRef.current = "";
        speechRecognitionInterimTranscriptRef.current = "";
        speechRecognitionStableTranscriptRef.current = "";
        speechRecognitionStableMatchRef.current = 0;
        speechRecognitionStableTokenCountRef.current = 0;
        setLockedCorrectTokenIndexes([]);
        setIsSpeechRecognitionRunning(false);
        setListeningScoreFx(null);
        completeMarkedRef.current = false;
    }, [visible, articleKey]);

    const stopCurrentTts = useCallback(() => {
        ttsRequestIdRef.current += 1;
        setIsPreparingAudio(false);
        setIsReferenceAudioPlaying(false);
        setActiveReferenceWordMarkIndex(null);
        if (ttsAudioRef.current) {
            ttsAudioRef.current.pause();
            ttsAudioRef.current.currentTime = 0;
            ttsAudioRef.current.onended = null;
            ttsAudioRef.current.onpause = null;
            ttsAudioRef.current.onplay = null;
            ttsAudioRef.current.ontimeupdate = null;
            ttsAudioRef.current.onerror = null;
        }
        if (ttsAudioUrlRef.current) {
            URL.revokeObjectURL(ttsAudioUrlRef.current);
            ttsAudioUrlRef.current = null;
        }
    }, []);

    const clearSelfRecordingAudio = useCallback(() => {
        if (selfRecordAudioRef.current) {
            selfRecordAudioRef.current.pause();
            selfRecordAudioRef.current.currentTime = 0;
            selfRecordAudioRef.current.src = "";
            selfRecordAudioRef.current.onended = null;
            selfRecordAudioRef.current.onerror = null;
        }
        if (selfRecordAudioUrlRef.current) {
            URL.revokeObjectURL(selfRecordAudioUrlRef.current);
            selfRecordAudioUrlRef.current = null;
        }
        setHasSelfRecording(false);
    }, []);

    const stopSpeechRecognition = useCallback((forceAbort = false) => {
        speechRecognitionStopRequestedRef.current = true;
        const recognition = speechRecognitionRef.current;
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
                // noop: shutdown path best-effort
            }
            speechRecognitionRef.current = null;
        }
        setIsSpeechRecognitionRunning(false);
        speechRecognitionFinalTranscriptRef.current = "";
        speechRecognitionInterimTranscriptRef.current = "";
        speechRecognitionStableTranscriptRef.current = "";
        speechRecognitionStableMatchRef.current = 0;
        speechRecognitionStableTokenCountRef.current = 0;
    }, []);

    const startSpeechRecognition = useCallback(() => {
        if (typeof window === "undefined") return false;
        const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) {
            setIsSpeechRecognitionSupported(false);
            setRunnerError("当前浏览器不支持实时跟读反馈，你仍可录音并回放对比。");
            return false;
        }

        stopSpeechRecognition(true);
        speechRecognitionStopRequestedRef.current = false;
        speechRecognitionFinalTranscriptRef.current = "";
        speechRecognitionInterimTranscriptRef.current = "";
        speechRecognitionStableTranscriptRef.current = "";
        speechRecognitionStableMatchRef.current = 0;
        speechRecognitionStableTokenCountRef.current = 0;

        const recognition = new SpeechRecognitionCtor();
        recognition.lang = "en-US";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
            const rows = Array.from(event.results || []);
            let nextFinalTranscript = speechRecognitionFinalTranscriptRef.current;
            let nextInterimTranscript = speechRecognitionInterimTranscriptRef.current;
            const startIndex = Number.isFinite(Number(event.resultIndex))
                ? Math.max(0, Number(event.resultIndex))
                : 0;

            for (let index = startIndex; index < rows.length; index += 1) {
                const result = rows[index];
                const transcript = normalizeWhitespace(result?.[0]?.transcript || "");
                if (!transcript) continue;

                if (result?.isFinal) {
                    nextFinalTranscript = normalizeWhitespace(`${nextFinalTranscript} ${transcript}`);
                    nextInterimTranscript = "";
                } else {
                    nextInterimTranscript = transcript;
                }
            }

            speechRecognitionFinalTranscriptRef.current = nextFinalTranscript;
            speechRecognitionInterimTranscriptRef.current = nextInterimTranscript;
            const nextTranscript = normalizeWhitespace(`${nextFinalTranscript} ${nextInterimTranscript}`);
            if (!nextTranscript) return;

            const targetSentence = currentQuestion?.module === "listening" ? currentQuestion.sentence : "";
            const nextMetrics = scoreListeningRecognition(targetSentence, nextTranscript);
            const previousMatch = speechRecognitionStableMatchRef.current;
            const previousTokenCount = speechRecognitionStableTokenCountRef.current;
            const shouldAdopt = !speechRecognitionStableTranscriptRef.current
                || nextMetrics.correctCount > previousMatch
                || (nextMetrics.correctCount === previousMatch && nextMetrics.spokenCount >= previousTokenCount);

            if (shouldAdopt) {
                speechRecognitionStableTranscriptRef.current = nextTranscript;
                speechRecognitionStableMatchRef.current = nextMetrics.correctCount;
                speechRecognitionStableTokenCountRef.current = nextMetrics.spokenCount;
                setLiveRecognitionTranscript(nextTranscript);
            }
        };
        recognition.onerror = (event) => {
            const errorCode = `${event?.error || ""}`.toLowerCase();
            if (!errorCode || errorCode === "aborted" || errorCode === "no-speech") {
                return;
            }
            if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
                setRunnerError("语音识别权限被拒绝，请在浏览器设置中允许麦克风后重试。");
                return;
            }
            setRunnerError(`实时跟读识别异常：${event?.error || "未知错误"}`);
        };
        recognition.onend = () => {
            if (speechRecognitionStopRequestedRef.current) {
                setIsSpeechRecognitionRunning(false);
                speechRecognitionRef.current = null;
                return;
            }

            const recorder = recorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                try {
                    recognition.start();
                    return;
                } catch {
                    // fall through
                }
            }

            setIsSpeechRecognitionRunning(false);
            speechRecognitionRef.current = null;
        };

        speechRecognitionRef.current = recognition;
        try {
            recognition.start();
            setIsSpeechRecognitionRunning(true);
            return true;
        } catch (error) {
            speechRecognitionRef.current = null;
            setIsSpeechRecognitionRunning(false);
            const message = error instanceof Error ? error.message : "启动实时识别失败";
            setRunnerError(message);
            return false;
        }
    }, [currentQuestion?.module, currentQuestion?.sentence, stopSpeechRecognition]);

    const playListeningScoreSfx = useCallback((tier: ListeningScoreTier) => {
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
    }, []);

    const cleanupRecorderResources = useCallback(() => {
        if (recorderStreamRef.current) {
            for (const track of recorderStreamRef.current.getTracks()) {
                track.stop();
            }
        }
        recorderRef.current = null;
        recorderStreamRef.current = null;
        recorderChunksRef.current = [];
        setIsRecordingSelfVoice(false);
    }, []);

    const forceStopSelfRecorder = useCallback((discardRecording: boolean) => {
        stopSpeechRecognition(true);
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            discardRecordingOnStopRef.current = discardRecording;
            try {
                recorder.stop();
            } catch {
                cleanupRecorderResources();
            }
            return;
        }
        cleanupRecorderResources();
    }, [cleanupRecorderResources, stopSpeechRecognition]);

    useEffect(() => {
        if (!visible) {
            clearListeningAdvanceTimer();
            stopCurrentTts();
            forceStopSelfRecorder(true);
            clearSelfRecordingAudio();
            setLiveRecognitionTranscript("");
            speechRecognitionFinalTranscriptRef.current = "";
            speechRecognitionInterimTranscriptRef.current = "";
            setIsSpeechRecognitionRunning(false);
            setIsListeningAdvancePending(false);
        }
    }, [clearListeningAdvanceTimer, clearSelfRecordingAudio, forceStopSelfRecorder, stopCurrentTts, visible]);

    useEffect(() => {
        if (!visible || stage !== "runner" || !currentQuestion || currentQuestion.module !== "translation") return;
        if (translationRefMap[currentQuestion.id]) return;

        let cancelled = false;
        setTranslationRefLoading(true);
        setTranslationRefError(null);

        void (async () => {
            try {
                const response = await fetch("/api/ai/translate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: currentQuestion.sentence,
                        context: currentQuestion.sentence,
                    }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload?.error || "翻译参考获取失败");
                }
                const translation = normalizeWhitespace(payload?.translation || "");
                if (!translation) {
                    throw new Error("翻译参考为空");
                }
                if (!cancelled) {
                    setTranslationRefMap((prev) => ({ ...prev, [currentQuestion.id]: translation }));
                }
            } catch (error) {
                if (!cancelled) {
                    const message = error instanceof Error ? error.message : "翻译参考获取失败";
                    setTranslationRefError(message);
                }
            } finally {
                if (!cancelled) {
                    setTranslationRefLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [currentQuestion, stage, translationRefMap, visible]);

    useEffect(() => {
        if (!visible || stage !== "complete") return;
        if (!completeMarkedRef.current) {
            completeMarkedRef.current = true;
            void Promise.resolve(onMarkCompleted());
        }

        setCountdown(3);
        const timer = window.setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    window.clearInterval(timer);
                    onEnterQuiz();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            window.clearInterval(timer);
        };
    }, [onEnterQuiz, onMarkCompleted, stage, visible]);

    useEffect(() => {
        return () => {
            clearListeningAdvanceTimer();
            stopCurrentTts();
            forceStopSelfRecorder(true);
            clearSelfRecordingAudio();
        };
    }, [clearListeningAdvanceTimer, clearSelfRecordingAudio, forceStopSelfRecorder, stopCurrentTts]);

    const moveToNextQuestion = () => {
        clearListeningAdvanceTimer();
        stopCurrentTts();
        forceStopSelfRecorder(true);
        clearSelfRecordingAudio();
        if (currentIndex >= questions.length - 1) {
            setStage("complete");
            return;
        }
        setCurrentIndex((prev) => prev + 1);
        setAnswerDraft("");
        setQuestionFeedback(null);
        setRunnerError(null);
        setIsListeningAdvancePending(false);
        setReferenceWordMarks([]);
        setActiveReferenceWordMarkIndex(null);
        setIsReferenceAudioPlaying(false);
        setLiveRecognitionTranscript("");
        speechRecognitionFinalTranscriptRef.current = "";
        speechRecognitionInterimTranscriptRef.current = "";
        speechRecognitionStableTranscriptRef.current = "";
        speechRecognitionStableMatchRef.current = 0;
        speechRecognitionStableTokenCountRef.current = 0;
        setLockedCorrectTokenIndexes([]);
        setIsSpeechRecognitionRunning(false);
        setListeningScoreFx(null);
    };

    const commitRecord = (nextRecord: PretestRecord) => {
        setRecords((prev) => ({
            ...prev,
            [nextRecord.questionId]: nextRecord,
        }));
    };

    const handleSkipQuestion = () => {
        if (isListeningAdvancePending) return;
        if (!currentQuestion) return;
        commitRecord({
            questionId: currentQuestion.id,
            module: currentQuestion.module,
            skipped: true,
            answer: "",
        });
        moveToNextQuestion();
    };

    const handleSubmitQuestion = async () => {
        if (!currentQuestion) return;
        const answer = normalizeWhitespace(answerDraft);

        if (currentQuestion.module === "listening") {
            return;
        }

        if (!answer) {
            setRunnerError("请输入你的答案再提交。");
            return;
        }

        setRunnerError(null);
        setIsSubmitting(true);

        try {
            if (currentQuestion.module === "writing") {
                const response = await fetch("/api/ai/rewrite-practice", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "score",
                        source_sentence_en: currentQuestion.sentence,
                        imitation_prompt_cn: "请在保持原意的前提下，改写这个句子。",
                        user_rewrite_en: answer,
                        strict_semantic_match: false,
                    }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload?.error || "仿写评分失败");
                }
                const numericScore = Number(payload?.total_score ?? 0);
                const boundedScore = Number.isFinite(numericScore) ? Math.max(0, Math.min(100, numericScore)) : 0;
                const feedback = typeof payload?.feedback_cn === "string" && payload.feedback_cn.trim()
                    ? payload.feedback_cn.trim()
                    : "已完成仿写评分。";

                commitRecord({
                    questionId: currentQuestion.id,
                    module: currentQuestion.module,
                    skipped: false,
                    answer,
                    score: boundedScore,
                    feedback,
                });
                setQuestionFeedback({
                    scoreLabel: `AI评分 ${Math.round(boundedScore)}/100`,
                    feedback,
                });
                return;
            }

            const translationRef = normalizeWhitespace(
                translationRefMap[currentQuestion.id] || "",
            );
            if (!translationRef) {
                throw new Error("翻译参考尚未准备好，请稍后再试。");
            }

            const scoreResponse = await fetch("/api/ai/score_translation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: "translation",
                    is_reverse: true,
                    input_source: "keyboard",
                    teaching_mode: false,
                    user_translation: answer,
                    reference_english: currentQuestion.sentence,
                    original_chinese: translationRef,
                    current_elo: Number.isFinite(Number(currentElo)) ? Number(currentElo) : 1200,
                }),
            });
            const payload = await scoreResponse.json().catch(() => ({}));
            if (!scoreResponse.ok) {
                throw new Error(payload?.error || "翻译评分失败");
            }
            const numericScore = Number(payload?.score ?? 0);
            const boundedScore = Number.isFinite(numericScore) ? Math.max(0, Math.min(10, numericScore)) : 0;
            const feedback = typeof payload?.judge_reasoning === "string" && payload.judge_reasoning.trim()
                ? payload.judge_reasoning.trim()
                : "已完成翻译评分。";

            commitRecord({
                questionId: currentQuestion.id,
                module: currentQuestion.module,
                skipped: false,
                answer,
                score: boundedScore * 10,
                feedback,
            });
            setQuestionFeedback({
                scoreLabel: `AI评分 ${boundedScore.toFixed(1)}/10`,
                feedback,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "提交失败";
            setRunnerError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleListeningSubmit = () => {
        if (!currentQuestion || currentQuestion.module !== "listening") return;
        if (isListeningAdvancePending) return;
        if (questionFeedback) return;
        if (isRecordingSelfVoice) {
            setRunnerError("请先停止录音，再提交评分。");
            return;
        }
        const recognitionTranscript = normalizeWhitespace(speechRecognitionFinalTranscriptRef.current)
            || normalizeWhitespace(liveRecognitionTranscript);
        const metrics = scoreListeningRecognition(currentQuestion.sentence, recognitionTranscript);
        if (!metrics.spokenCount) {
            setRunnerError("先开始录音并跟读一遍，再提交评分。");
            return;
        }

        const score = metrics.score;
        const tier = resolveListeningScoreTier(score);
        const title = tier === "excellent"
            ? "太稳了！"
            : tier === "good"
                ? "表现不错！"
                : tier === "ok"
                    ? "继续冲！"
                    : "再来一遍更好";
        const detail = `匹配 ${metrics.correctCount}/${Math.max(1, metrics.totalCount)} 个词，系统自动评分 ${score}/100`;

        commitRecord({
            questionId: currentQuestion.id,
            module: currentQuestion.module,
            skipped: false,
            answer: recognitionTranscript,
            score,
            feedback: detail,
        });
        setQuestionFeedback({
            scoreLabel: `跟读评分 ${score}/100`,
            feedback: detail,
        });
        setListeningScoreFx({ score, tier, title, detail });
        playListeningScoreSfx(tier);
        setRunnerError(null);
    };

    const playCurrentSentence = async () => {
        if (!currentQuestion) return;
        const text = normalizeWhitespace(currentQuestion.sentence);
        if (!text) return;
        const requestId = ttsRequestIdRef.current + 1;
        ttsRequestIdRef.current = requestId;
        setRunnerError(null);
        setIsPreparingAudio(true);

        try {
            const payload = await requestTtsPayload(text);
            if (ttsRequestIdRef.current !== requestId) return;
            const normalizedMarks = (Array.isArray(payload.marks) ? payload.marks : [])
                .filter((mark): mark is TtsWordMark => {
                    if (!mark || typeof mark.value !== "string") return false;
                    const hasStart = Number.isFinite(Number(mark.start));
                    const hasEnd = Number.isFinite(Number(mark.end));
                    return hasStart && hasEnd;
                })
                .sort((left, right) => Number(left.start) - Number(right.start));
            setReferenceWordMarks(normalizedMarks);
            setActiveReferenceWordMarkIndex(null);
            const blob = await resolveTtsAudioBlob(payload.audioDataUrl || payload.audio);
            if (ttsRequestIdRef.current !== requestId) return;

            const audio = ttsAudioRef.current ?? new Audio();
            ttsAudioRef.current = audio;

            audio.pause();
            audio.currentTime = 0;
            if (ttsAudioUrlRef.current) {
                URL.revokeObjectURL(ttsAudioUrlRef.current);
                ttsAudioUrlRef.current = null;
            }

            const objectUrl = URL.createObjectURL(blob);
            ttsAudioUrlRef.current = objectUrl;
            audio.src = objectUrl;
            audio.onended = () => {
                if (ttsRequestIdRef.current === requestId) {
                    setIsReferenceAudioPlaying(false);
                    setActiveReferenceWordMarkIndex(null);
                }
            };
            audio.onpause = () => {
                if (ttsRequestIdRef.current === requestId) {
                    setIsReferenceAudioPlaying(false);
                    setActiveReferenceWordMarkIndex(null);
                }
            };
            audio.onplay = () => {
                if (ttsRequestIdRef.current === requestId) {
                    setIsReferenceAudioPlaying(true);
                }
            };
            audio.ontimeupdate = () => {
                if (ttsRequestIdRef.current !== requestId) return;
                if (normalizedMarks.length === 0) {
                    setActiveReferenceWordMarkIndex(null);
                    return;
                }

                const currentMs = audio.currentTime * 1000;
                let activeMarkIndex = -1;
                for (let index = 0; index < normalizedMarks.length; index += 1) {
                    const mark = normalizedMarks[index];
                    const startMs = Number(mark.start);
                    const rawEndMs = Number(mark.end);
                    const endMs = Number.isFinite(rawEndMs) && rawEndMs > startMs ? rawEndMs : startMs + 220;
                    if (currentMs >= startMs && currentMs < endMs) {
                        activeMarkIndex = index;
                        break;
                    }
                    if (currentMs < startMs) break;
                }
                setActiveReferenceWordMarkIndex(activeMarkIndex >= 0 ? activeMarkIndex : null);
            };
            audio.onerror = () => {
                if (ttsRequestIdRef.current === requestId) {
                    setRunnerError("音频播放失败，请重试。");
                    setIsPreparingAudio(false);
                    setIsReferenceAudioPlaying(false);
                    setActiveReferenceWordMarkIndex(null);
                }
            };
            await audio.play();
            if (ttsRequestIdRef.current === requestId) {
                setIsPreparingAudio(false);
                setIsReferenceAudioPlaying(true);
            }
        } catch (error) {
            if (ttsRequestIdRef.current !== requestId) return;
            const message = error instanceof Error ? error.message : "语音加载失败，请重试。";
            setRunnerError(message);
            setIsPreparingAudio(false);
            setIsReferenceAudioPlaying(false);
            setActiveReferenceWordMarkIndex(null);
        }
    };

    const startSelfRecording = async () => {
        if (typeof window === "undefined" || !currentQuestion || currentQuestion.module !== "listening") return;
        if (isListeningAdvancePending) return;
        if (isRecordingSelfVoice) return;
        if (!navigator.mediaDevices?.getUserMedia) {
            setRunnerError("当前浏览器不支持录音，请更换浏览器后再试。");
            return;
        }
        if (typeof MediaRecorder === "undefined") {
            setRunnerError("当前环境不支持录音组件，请更换浏览器后再试。");
            return;
        }

        stopCurrentTts();
        clearSelfRecordingAudio();
        setRunnerError(null);
        setListeningScoreFx(null);
        setLiveRecognitionTranscript("");
        speechRecognitionFinalTranscriptRef.current = "";
        speechRecognitionInterimTranscriptRef.current = "";
        speechRecognitionStableTranscriptRef.current = "";
        speechRecognitionStableMatchRef.current = 0;
        speechRecognitionStableTokenCountRef.current = 0;
        setLockedCorrectTokenIndexes([]);

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

            recorderRef.current = recorder;
            recorderStreamRef.current = stream;
            recorderChunksRef.current = [];
            discardRecordingOnStopRef.current = false;

            recorder.ondataavailable = (event: BlobEvent) => {
                if (event.data.size > 0) {
                    recorderChunksRef.current.push(event.data);
                }
            };
            recorder.onerror = () => {
                setRunnerError("录音失败，请重试。");
            };
            recorder.onstop = () => {
                const shouldDiscard = discardRecordingOnStopRef.current;
                discardRecordingOnStopRef.current = false;
                const blob = new Blob(
                    recorderChunksRef.current,
                    { type: recorder.mimeType || "audio/webm" },
                );
                cleanupRecorderResources();
                if (shouldDiscard || blob.size <= 0) return;

                const objectUrl = URL.createObjectURL(blob);
                selfRecordAudioUrlRef.current = objectUrl;
                if (!selfRecordAudioRef.current) {
                    selfRecordAudioRef.current = new Audio();
                }
                selfRecordAudioRef.current.src = objectUrl;
                selfRecordAudioRef.current.currentTime = 0;
                setHasSelfRecording(true);
            };
            recorder.start();
            setIsRecordingSelfVoice(true);
            startSpeechRecognition();
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message.toLowerCase().includes("notallowed") || message.toLowerCase().includes("permission")) {
                setRunnerError("麦克风权限被拒绝，请在浏览器设置里允许后重试。");
            } else {
                setRunnerError(message || "麦克风权限获取失败，请检查浏览器设置。");
            }
            cleanupRecorderResources();
        }
    };

    const stopSelfRecording = () => {
        if (isListeningAdvancePending) return;
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        stopSpeechRecognition();
        discardRecordingOnStopRef.current = false;
        try {
            recorder.stop();
        } catch (error) {
            const message = error instanceof Error ? error.message : "停止录音失败，请重试。";
            setRunnerError(message);
            cleanupRecorderResources();
        }
    };

    const playSelfRecording = async () => {
        if (isListeningAdvancePending) return;
        if (!hasSelfRecording || !selfRecordAudioUrlRef.current) {
            setRunnerError("还没有录音，先点“开始录音”试试。");
            return;
        }
        setRunnerError(null);
        try {
            const audio = selfRecordAudioRef.current ?? new Audio();
            selfRecordAudioRef.current = audio;
            audio.pause();
            audio.currentTime = 0;
            audio.src = selfRecordAudioUrlRef.current;
            await audio.play();
        } catch (error) {
            const message = error instanceof Error ? error.message : "录音播放失败，请重试。";
            setRunnerError(message);
        }
    };

    const shouldHighlightSourceSentence = currentQuestion?.module === "listening"
        && (isRecordingSelfVoice || isReferenceAudioPlaying || isListeningAdvancePending || shouldShowPronunciationFeedback);
    const liveListeningMetrics = useMemo(
        () => scoreListeningRecognition(
            currentQuestion?.module === "listening" ? currentQuestion.sentence : "",
            liveRecognitionTranscript,
        ),
        [currentQuestion?.module, currentQuestion?.sentence, liveRecognitionTranscript],
    );

    if (!visible) return null;

    return (
        <AnimatePresence>
            <motion.div
                key="read-pretest-overlay"
                className="fixed inset-0 z-[95] flex items-center justify-center px-4 py-6"
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.12 : 0.24 }}
            >
                <div className="absolute inset-0 bg-[#2b2a28]/40 backdrop-blur-[5px]" onClick={onClose} />

                <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 14, scale: 0.98 }}
                    transition={{ duration: prefersReducedMotion ? 0.16 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                        "relative z-[1] w-full overflow-hidden rounded-[2rem] border-[3px] border-[#17120d] bg-[#fff8ef] text-[#2f2a26] shadow-[0_12px_0_rgba(23,18,13,0.12)]",
                        stage === "runner" ? "max-w-4xl" : "max-w-3xl",
                    )}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        className="ui-pressable absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#17120d] bg-white text-[#6a6055]"
                        style={getPressableStyle("rgba(23,18,13,0.1)", 3)}
                        aria-label="关闭前测"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {stage === "confirm" && (
                        <section className="px-6 pb-7 pt-8 md:px-10">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#f4d2e0] bg-[#fff0f7] px-3 py-1 text-xs font-black text-[#c45f95]">
                                <Sparkles className="h-3.5 w-3.5" />
                                PRE-TEST
                            </div>
                            <h3 className="mt-4 text-3xl font-black tracking-[-0.02em] text-[#5a3f30]">进入完整测试？</h3>
                            <p className="mt-3 text-sm leading-7 text-[#6f6458] md:text-base">
                                先完成听 / 写 / 译小测试，可帮助你更稳进入答题状态。该测试不影响 CAT 分。
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2.5">
                                <span className="rounded-full border border-[#c8e4ff] bg-[#eef7ff] px-3 py-1.5 text-xs font-black text-[#2f66f3]">听5题</span>
                                <span className="rounded-full border border-[#bfead4] bg-[#f0fff7] px-3 py-1.5 text-xs font-black text-[#1f9a67]">写3题</span>
                                <span className="rounded-full border border-[#decfff] bg-[#f7f2ff] px-3 py-1.5 text-xs font-black text-[#7a58e8]">译3题</span>
                            </div>
                            <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => setStage("hub")}
                                    className="ui-pressable rounded-[1.2rem] border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#f7b78d,#ea9167)] px-4 py-3.5 text-sm font-black text-white"
                                    style={getPressableStyle("rgba(207,135,93,0.92)", 5)}
                                >
                                    是，进入完整测试
                                </button>
                                <button
                                    type="button"
                                    onClick={onDirectQuiz}
                                    className="ui-pressable rounded-[1.2rem] border-[3px] border-[#17120d] bg-white px-4 py-3.5 text-sm font-black text-[#4d4338]"
                                    style={getPressableStyle("rgba(23,18,13,0.08)", 5)}
                                >
                                    否，直接答题
                                </button>
                            </div>
                            <p className="mt-5 text-xs text-[#8b7f72]">
                                同一篇完成一次后，下次默认不再强提醒
                            </p>
                        </section>
                    )}

                    {stage === "hub" && (
                        <section className="px-6 pb-7 pt-8 md:px-10">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9b8a78]">READ PRE-TEST</p>
                            <h3 className="mt-2 text-3xl font-black tracking-[-0.02em] text-[#5a3f30]">阅读前测</h3>
                            <p className="mt-2 line-clamp-1 text-sm text-[#7a6d60]">{articleTitle}</p>
                            <div className="mt-6 grid grid-cols-1 gap-3">
                                {MODULE_ORDER.map((moduleType) => {
                                    const meta = MODULE_META[moduleType];
                                    const Icon = meta.icon;
                                    const stats = moduleStats[moduleType];
                                    const completed = stats.done >= stats.total && stats.total > 0;
                                    return (
                                        <div
                                            key={moduleType}
                                            className="rounded-[1.3rem] border-[3px] border-[#e7ddcf] bg-white/70 px-4 py-3.5"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm", meta.chipClass)}>
                                                        <Icon className="h-4 w-4" />
                                                    </span>
                                                    <div>
                                                        <p className="text-sm font-black text-[#4d4338]">{meta.title}</p>
                                                        <p className="text-xs text-[#857868]">{meta.subtitle}</p>
                                                    </div>
                                                </div>
                                                <span className={cn(
                                                    "rounded-full border px-3 py-1 text-xs font-black",
                                                    completed
                                                        ? "border-[#9fdfba] bg-[#e9fff2] text-[#22814f]"
                                                        : stats.done > 0
                                                            ? "border-[#f5ddb7] bg-[#fff3df] text-[#9f6c27]"
                                                            : "border-[#e1d8cc] bg-[#f9f5ef] text-[#7a6d60]",
                                                )}>
                                                    {completed ? "已完成" : stats.done > 0 ? "进行中" : "未开始"}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-6 rounded-[1.2rem] border-[3px] border-[#ece3d5] bg-[#fffdf8] p-4 text-sm text-[#75695d]">
                                已完成 {completedCount}/{totalQuestions} · 跳过 {skippedCount} 题 · 仅作测试，不影响 CAT 分
                            </div>

                            <div className="mt-6 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setStage("runner")}
                                    className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#f7b78d,#ea9167)] px-6 py-3 text-sm font-black text-white"
                                    style={getPressableStyle("rgba(207,135,93,0.92)", 5)}
                                >
                                    {completedCount > 0 ? "继续测试" : "开始测试"}
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        </section>
                    )}

                    {stage === "runner" && currentQuestion && (
                        <section className="px-4 pb-5 pt-6 md:px-6 md:pb-6 md:pt-7">
                            <div className="rounded-[1.3rem] border-[3px] border-[#eadfce] bg-white/80 px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black", MODULE_META[currentQuestion.module].chipClass)}>
                                            {(() => {
                                                const Icon = MODULE_META[currentQuestion.module].icon;
                                                return <Icon className="h-3.5 w-3.5" />;
                                            })()}
                                            {MODULE_META[currentQuestion.module].title}
                                        </span>
                                        <span className="text-xs font-black text-[#897b6b]">
                                            {currentQuestion.moduleIndex}/{currentQuestion.moduleTotal}
                                        </span>
                                    </div>
                                    <span className="rounded-full border border-[#ddd1c0] bg-[#f8f3ea] px-2.5 py-1 text-[11px] font-black text-[#7a6d60]">
                                        {currentQuestion.globalIndex}/{currentQuestion.globalTotal}
                                    </span>
                                </div>
                                <div className="mt-3 h-2 rounded-full bg-[#efe7da]">
                                    <div
                                        className="h-full rounded-full bg-[linear-gradient(90deg,#f3ad86,#e58a62)]"
                                        style={{ width: `${Math.max(6, (currentQuestion.globalIndex / Math.max(1, currentQuestion.globalTotal)) * 100)}%` }}
                                    />
                                </div>
                            </div>

                            <div className="mt-4 rounded-[1.4rem] border-[3px] border-[#e9dfd1] bg-white/90 px-4 py-5 md:px-6">
                                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#a18f7b]">source sentence</p>
                                <p
                                    className={cn(
                                        "mt-3 rounded-[0.95rem] px-2 py-1 text-lg font-bold leading-8 text-[#3a322c] transition-all duration-250 md:text-[1.55rem] md:leading-[2.2rem]",
                                        shouldHighlightSourceSentence
                                            ? "bg-[#fff4cf] shadow-[0_0_0_2px_rgba(243,184,84,0.35),0_10px_24px_rgba(243,184,84,0.16)]"
                                            : "",
                                    )}
                                >
                                    {currentQuestion.module === "listening" ? sourceSentenceKaraokeContent : currentQuestion.sentence}
                                </p>

                                {currentQuestion.module === "listening" && (
                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={playCurrentSentence}
                                            disabled={isPreparingAudio || isRecordingSelfVoice || isListeningAdvancePending}
                                            className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[#eef7ff] px-4 py-2.5 text-sm font-black text-[#2f66f3]"
                                            style={getPressableStyle("rgba(102,159,245,0.55)", 4)}
                                        >
                                            <Play className="h-4 w-4" />
                                            {isPreparingAudio ? "生成语音中..." : "听原句"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={isRecordingSelfVoice ? stopSelfRecording : startSelfRecording}
                                            disabled={isPreparingAudio || isListeningAdvancePending}
                                            className={cn(
                                                "ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] px-4 py-2.5 text-sm font-black",
                                                isRecordingSelfVoice
                                                    ? "bg-[#ffe7e7] text-[#d65252]"
                                                    : "bg-[#fff3e6] text-[#bb6a28]",
                                            )}
                                            style={getPressableStyle(
                                                isRecordingSelfVoice ? "rgba(219,102,102,0.45)" : "rgba(238,186,128,0.85)",
                                                4,
                                            )}
                                        >
                                            {isRecordingSelfVoice ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                                            {isRecordingSelfVoice ? "停止录音" : "开始录音"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={playSelfRecording}
                                            disabled={!hasSelfRecording || isRecordingSelfVoice || isListeningAdvancePending}
                                            className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[#f2f8ff] px-4 py-2.5 text-sm font-black text-[#2f66f3] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                                            style={getPressableStyle("rgba(153,187,236,0.65)", 4)}
                                        >
                                            <Play className="h-4 w-4" />
                                            听我的录音
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleListeningSubmit}
                                            disabled={isRecordingSelfVoice || isListeningAdvancePending || !normalizeWhitespace(liveRecognitionTranscript) || Boolean(questionFeedback)}
                                            className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#9fd8b3,#6fbd8f)] px-4 py-2.5 text-sm font-black text-[#113c23] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                                            style={getPressableStyle("rgba(88,176,126,0.8)", 4)}
                                        >
                                            <SendHorizontal className="h-4 w-4" />
                                            {questionFeedback ? "已提交评分" : "提交跟读评分"}
                                        </button>
                                        <p className="w-full text-xs font-semibold text-[#8f7f6f]">
                                            先听原句再跟读；录音结束后点“提交跟读评分”，系统给分后由你手动进入下一题。
                                        </p>
                                        <div className="w-full rounded-[1rem] border border-[#d8dff5] bg-[#f6f8ff] px-3 py-2.5">
                                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-black text-[#5a6293]">
                                                <span className="rounded-full border border-[#cfe0ff] bg-white px-2 py-0.5">
                                                    匹配 {liveListeningMetrics.correctCount}/{liveListeningMetrics.totalCount || 0}
                                                </span>
                                                <span className="rounded-full border border-[#d7d2f8] bg-white px-2 py-0.5">
                                                    {isSpeechRecognitionRunning ? "实时识别中" : "识别待机"}
                                                </span>
                                                {!isSpeechRecognitionSupported && (
                                                    <span className="rounded-full border border-[#f3d2d2] bg-white px-2 py-0.5 text-[#b64d4d]">
                                                        浏览器不支持实时识别
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-2 line-clamp-2 text-xs text-[#616a90]">
                                                {liveRecognitionTranscript || "开始录音后，这里会实时显示你读到的内容。"}
                                            </p>
                                        </div>
                                        <AnimatePresence>
                                            {listeningScoreFx && (
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
                                                    transition={{ duration: prefersReducedMotion ? 0.12 : 0.52, ease: [0.22, 1, 0.36, 1] }}
                                                    className={cn(
                                                        "relative w-full overflow-hidden rounded-[1rem] border-[3px] px-3 py-2.5 shadow-[0_10px_0_rgba(19,14,10,0.09),0_20px_28px_rgba(0,0,0,0.08)]",
                                                        listeningScoreFx.tier === "excellent"
                                                            ? "border-[#8ed7ad] bg-[#eafff1] text-[#155738]"
                                                            : listeningScoreFx.tier === "good"
                                                                ? "border-[#b9d8ff] bg-[#eef6ff] text-[#1f4b8f]"
                                                                : listeningScoreFx.tier === "ok"
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
                                                    <p className="text-sm font-black">{listeningScoreFx.title} · {listeningScoreFx.score}/100</p>
                                                    <p className="mt-1 text-xs font-semibold">{listeningScoreFx.detail}</p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {currentQuestion.module === "translation" && (
                                    <div className="mt-4 rounded-[1rem] border border-[#dfd2ff] bg-[#f7f2ff] px-3 py-2.5 text-xs font-semibold text-[#6f5c9e]">
                                        {translationRefLoading
                                            ? "正在准备翻译参考..."
                                            : translationRefError
                                                ? `翻译参考加载失败：${translationRefError}`
                                                : "请将上面英文句子翻译成中文。"}
                                    </div>
                                )}

                                {currentQuestion.module !== "listening" && (
                                    <textarea
                                        value={answerDraft}
                                        onChange={(event) => setAnswerDraft(event.target.value)}
                                        placeholder={
                                            currentQuestion.module === "translation"
                                                ? "输入你的中文翻译..."
                                                : "输入你的英文仿写..."
                                        }
                                        className="mt-4 h-32 w-full resize-none rounded-[1rem] border-[3px] border-[#ece0ce] bg-[#fffdf8] px-4 py-3 text-sm font-medium text-[#3a322c] outline-none transition focus:border-[#e0c39b]"
                                    />
                                )}
                            </div>

                            {runnerError && (
                                <div className="mt-3 rounded-[1rem] border-2 border-[#f5b2b2] bg-[#fff1f1] px-3 py-2 text-sm font-semibold text-[#b93a3a]">
                                    {runnerError}
                                </div>
                            )}

                            {questionFeedback && (
                                <div className="mt-3 rounded-[1rem] border-[3px] border-[#bfead4] bg-[#f2fff8] px-4 py-3">
                                    <p className="text-sm font-black text-[#15744a]">{questionFeedback.scoreLabel}</p>
                                    <p className="mt-1 text-sm text-[#2f5d46]">{questionFeedback.feedback}</p>
                                </div>
                            )}

                            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={handleSkipQuestion}
                                    disabled={isListeningAdvancePending}
                                    className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-white px-4 py-2.5 text-sm font-black text-[#574d43]"
                                    style={getPressableStyle("rgba(23,18,13,0.08)", 4)}
                                >
                                    跳过
                                </button>
                                {currentQuestion.module === "listening" && questionFeedback && (
                                    <button
                                        type="button"
                                        onClick={moveToNextQuestion}
                                        className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#9fd8b3,#6fbd8f)] px-5 py-2.5 text-sm font-black text-[#113c23]"
                                        style={getPressableStyle("rgba(88,176,126,0.8)", 4)}
                                    >
                                        下一题
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                )}
                                {currentQuestion.module !== "listening" && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAnswerDraft("");
                                                setRunnerError(null);
                                            }}
                                            className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[#fff6ea] px-4 py-2.5 text-sm font-black text-[#9d6b33]"
                                            style={getPressableStyle("rgba(238,186,128,0.9)", 4)}
                                        >
                                            <Eraser className="h-4 w-4" />
                                            清空
                                        </button>

                                        {questionFeedback ? (
                                            <button
                                                type="button"
                                                onClick={moveToNextQuestion}
                                                className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#9fd8b3,#6fbd8f)] px-5 py-2.5 text-sm font-black text-[#113c23]"
                                                style={getPressableStyle("rgba(88,176,126,0.8)", 4)}
                                            >
                                                下一题
                                                <ArrowRight className="h-4 w-4" />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={handleSubmitQuestion}
                                                disabled={isSubmitting}
                                                className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#f7b78d,#ea9167)] px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                                                style={getPressableStyle("rgba(207,135,93,0.92)", 4)}
                                            >
                                                <SendHorizontal className="h-4 w-4" />
                                                {isSubmitting ? "提交中..." : "提交"}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </section>
                    )}

                    {stage === "complete" && (
                        <section className="px-6 pb-7 pt-8 md:px-10">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#ffd9a8] bg-[#fff4df] px-3 py-1 text-xs font-black text-[#b26b16]">
                                <Sparkles className="h-3.5 w-3.5" />
                                PRE-TEST COMPLETE
                            </div>
                            <h3 className="mt-3 text-3xl font-black tracking-[-0.02em] text-[#5a3f30]">前测完成，准备开答！</h3>
                            <p className="mt-3 text-sm leading-7 text-[#6f6458] md:text-base">
                                你已完成听/写/译测试，结果仅用于热身，不影响 CAT 分。
                            </p>

                            <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
                                <StatPill label="听力" value={`${moduleStats.listening.done}/${moduleStats.listening.total}`} />
                                <StatPill label="仿写" value={`${moduleStats.writing.done}/${moduleStats.writing.total}`} />
                                <StatPill label="翻译" value={`${moduleStats.translation.done}/${moduleStats.translation.total}`} />
                                <StatPill label="跳过" value={`${skippedCount}`} />
                            </div>

                            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                                <span className="rounded-full border border-[#e4d8c6] bg-white px-3 py-1.5 text-xs font-black text-[#7b6f63]">
                                    {Math.max(0, countdown)}s 后自动进入
                                </span>
                                <button
                                    type="button"
                                    onClick={onEnterQuiz}
                                    className="ui-pressable inline-flex items-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[linear-gradient(180deg,#f7b78d,#ea9167)] px-6 py-3 text-sm font-black text-white"
                                    style={getPressableStyle("rgba(207,135,93,0.92)", 5)}
                                >
                                    进入正式答题
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        </section>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function StatPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-[1rem] border-[3px] border-[#eadfce] bg-white/80 px-3 py-2.5 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#9b8a78]">{label}</p>
            <p className="mt-1 text-sm font-black text-[#4d4338]">{value}</p>
        </div>
    );
}
