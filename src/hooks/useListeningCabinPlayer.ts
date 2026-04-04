"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    buildListeningCabinPlaybackChunks,
    canonicalizeListeningCabinSentenceSpeakers,
    LISTENING_CABIN_PLAYBACK_RATE_OPTIONS,
    type ListeningCabinPlaybackMode,
    buildListeningCabinSentenceTimings,
    type ListeningCabinPlaybackChunk,
    type ListeningCabinPlayerState,
    type ListeningCabinSentence,
    type ListeningCabinSentenceTiming,
    type ListeningCabinSession,
} from "@/lib/listening-cabin";
import { getListeningCabinNarrationTtsPayload } from "@/lib/listening-cabin-audio";
import { updateListeningCabinSession } from "@/lib/listening-cabin-store";
import type { TtsPayload } from "@/lib/tts-client";

type UseListeningCabinPlayerOptions = {
    session: ListeningCabinSession;
    restart?: boolean;
    subtitleAdvanceMs?: number;
};

const SUBTITLE_SWITCH_DELAY_MS = 3;
const SUBTITLE_END_HOLD_MS = 4;
const SUBTITLE_END_EARLY_ALLOWANCE_MS = 40;
const DEFAULT_SUBTITLE_ADVANCE_MS = 0;
const STOP_BOUNDARY_GUARD_MS = 0;
const STOP_TAIL_BUFFER_MS = 160;
const STOP_BLEED_GUARD_MS = 56;
const STOP_MIN_AUDIBLE_WINDOW_MS = 420;
const STOP_MIN_VALID_OFFSET_FROM_SEEK_MS = 300;
const SEEK_BACKTRACK_TOLERANCE_MS = 40;
const SEEK_UNMUTE_EPSILON_MS = 12;

function clampSentenceIndex(index: number, count: number) {
    if (count <= 0) return 0;
    return Math.min(Math.max(index, 0), count - 1);
}

function findSentenceIndexByTime(timings: ListeningCabinSentenceTiming[], currentMs: number) {
    if (timings.length === 0) {
        return 0;
    }

    for (let index = 0; index < timings.length - 1; index += 1) {
        const timing = timings[index];
        const nextTiming = timings[index + 1];
        if (!nextTiming) {
            return index;
        }

        const currentEndMs = Math.max(timing.startMs, timing.endMs);
        const nextStartMs = Math.max(nextTiming.startMs, currentEndMs);
        const switchAtMs = Math.max(
            nextStartMs + SUBTITLE_SWITCH_DELAY_MS,
            currentEndMs + SUBTITLE_END_HOLD_MS - SUBTITLE_END_EARLY_ALLOWANCE_MS,
        );

        if (currentMs < switchAtMs) {
            return index;
        }
    }

    return timings.length - 1;
}

function findChunkIndexForSentence(chunks: ListeningCabinPlaybackChunk[], sentenceIndex: number) {
    const foundIndex = chunks.findIndex((chunk) => chunk.sentenceIndexes.includes(sentenceIndex));
    return foundIndex >= 0 ? foundIndex : 0;
}

function getChunkEndMs(
    chunk: ListeningCabinPlaybackChunk | undefined,
    timings: ListeningCabinSentenceTiming[],
) {
    if (!chunk || timings.length === 0) {
        return null;
    }

    const lastSentenceIndex = chunk.sentenceIndexes[chunk.sentenceIndexes.length - 1];
    const timing = timings[lastSentenceIndex];
    if (!timing) {
        return null;
    }

    const nextTiming = timings[lastSentenceIndex + 1];
    const naturalEndMs = Math.max(timing.startMs, timing.endMs);
    const preferredStopMs = naturalEndMs + STOP_TAIL_BUFFER_MS;
    const minAudibleStopMs = timing.startMs + STOP_MIN_AUDIBLE_WINDOW_MS;

    if (!nextTiming) {
        return Math.max(preferredStopMs, minAudibleStopMs);
    }

    const upperStopMs = Math.max(
        naturalEndMs + 24,
        nextTiming.startMs - STOP_BLEED_GUARD_MS,
    );
    const clampedStopMs = Math.min(preferredStopMs, upperStopMs);
    return Math.max(clampedStopMs, minAudibleStopMs);
}

function hasCompleteUsableTimings(timings: ListeningCabinSentenceTiming[], sentenceCount: number) {
    if (timings.length !== sentenceCount || sentenceCount === 0) {
        return false;
    }

    let previousEnd = -1;
    for (const timing of timings) {
        if (timing.endMs <= timing.startMs) {
            return false;
        }

        if (timing.startMs < previousEnd) {
            return false;
        }

        previousEnd = timing.endMs;
    }

    return true;
}

function buildEvenSentenceTimings(sentenceCount: number, durationMs: number) {
    if (sentenceCount <= 0 || durationMs <= 0) {
        return [];
    }

    const unitMs = durationMs / sentenceCount;

    return Array.from({ length: sentenceCount }, (_, index) => ({
        index: index + 1,
        startMs: Math.round(index * unitMs),
        endMs: Math.round((index + 1) * unitMs),
    })) satisfies ListeningCabinSentenceTiming[];
}

function fitSentenceTimingsToDuration(
    timings: ListeningCabinSentenceTiming[],
    durationMs: number,
    options?: { allowExpand?: boolean; allowShrink?: boolean; progressiveExpand?: boolean },
) {
    if (timings.length === 0 || durationMs <= 0) {
        return timings;
    }

    const allowExpand = options?.allowExpand ?? true;
    const allowShrink = options?.allowShrink ?? true;
    const progressiveExpand = options?.progressiveExpand ?? false;
    const lastEndMs = Math.max(1, timings[timings.length - 1]?.endMs ?? 1);
    const roundedDurationMs = Math.max(1, Math.round(durationMs));
    const delta = roundedDurationMs - lastEndMs;

    if (!allowExpand && delta > 0) {
        return timings;
    }

    if (!allowShrink && delta < 0) {
        return timings;
    }

    if (Math.abs(delta) <= 120) {
        return timings;
    }

    if (delta > 0 && progressiveExpand) {
        const fitted: ListeningCabinSentenceTiming[] = [];
        let previousEnd = 0;

        for (let index = 0; index < timings.length; index += 1) {
            const timing = timings[index];
            const startProgress = Math.min(1, Math.max(0, timing.startMs / lastEndMs));
            const endProgress = Math.min(1, Math.max(0, timing.endMs / lastEndMs));
            const easedStartOffset = Math.round(delta * Math.pow(startProgress, 1.18));
            const easedEndOffset = Math.round(delta * Math.pow(endProgress, 1.08));
            const startMs = Math.max(previousEnd, timing.startMs + easedStartOffset);
            const endMs = Math.max(startMs + 1, timing.endMs + easedEndOffset);
            fitted.push({
                index: timing.index,
                startMs,
                endMs,
            });
            previousEnd = endMs;
        }

        const lastTiming = fitted[fitted.length - 1];
        if (lastTiming) {
            lastTiming.endMs = Math.max(lastTiming.startMs + 1, roundedDurationMs);
        }

        return fitted;
    }

    const ratio = roundedDurationMs / lastEndMs;
    if (!Number.isFinite(ratio) || ratio <= 0) {
        return timings;
    }

    const fitted: ListeningCabinSentenceTiming[] = [];
    let previousEnd = 0;

    for (let index = 0; index < timings.length; index += 1) {
        const timing = timings[index];
        const scaledStart = Math.round(timing.startMs * ratio);
        const scaledEnd = Math.round(timing.endMs * ratio);
        const startMs = Math.max(previousEnd, scaledStart);
        const endMs = Math.max(startMs + 1, scaledEnd);
        fitted.push({
            index: timing.index,
            startMs,
            endMs,
        });
        previousEnd = endMs;
    }

    const lastIndex = fitted.length - 1;
    const lastTiming = fitted[lastIndex];
    if (lastTiming) {
        lastTiming.endMs = Math.max(lastTiming.startMs + 1, roundedDurationMs);
    }

    return fitted;
}

function resolveSegmentTimings(
    rawTimings: TtsPayload["segmentTimings"],
    sentenceCount: number,
): ListeningCabinSentenceTiming[] {
    if (!Array.isArray(rawTimings) || rawTimings.length !== sentenceCount || sentenceCount === 0) {
        return [];
    }

    const normalized: ListeningCabinSentenceTiming[] = [];
    let previousEnd = 0;

    for (let index = 0; index < sentenceCount; index += 1) {
        const timing = rawTimings[index];
        if (!timing || !Number.isFinite(timing.startMs) || !Number.isFinite(timing.endMs)) {
            return [];
        }

        const startMs = Math.max(previousEnd, Math.round(timing.startMs));
        const endMs = Math.max(startMs + 1, Math.round(timing.endMs));
        normalized.push({
            index: index + 1,
            startMs,
            endMs,
        });
        previousEnd = endMs;
    }

    return normalized;
}

function normalizeSubtitleAdvanceMs(value: number | undefined) {
    if (!Number.isFinite(value)) {
        return DEFAULT_SUBTITLE_ADVANCE_MS;
    }

    return Math.min(1600, Math.max(0, Math.round(value ?? DEFAULT_SUBTITLE_ADVANCE_MS)));
}

function isTimingLikelyUnreliable(
    timings: ListeningCabinSentenceTiming[],
    sentenceIndex: number,
    sentenceCount: number,
) {
    const timing = timings[sentenceIndex];
    if (!timing) {
        return true;
    }

    const windowMs = timing.endMs - timing.startMs;
    if (windowMs < 160) {
        return true;
    }

    if (sentenceIndex > 0 && sentenceCount >= 3 && timing.startMs < 140) {
        return true;
    }

    const previous = sentenceIndex > 0 ? timings[sentenceIndex - 1] : null;
    if (previous && timing.startMs < previous.endMs) {
        return true;
    }

    return false;
}

export function useListeningCabinPlayer({
    session,
    restart = false,
    subtitleAdvanceMs: rawSubtitleAdvanceMs,
}: UseListeningCabinPlayerOptions) {
    const subtitleAdvanceMs = normalizeSubtitleAdvanceMs(rawSubtitleAdvanceMs);
    const resolvedSentences = useMemo(
        () => canonicalizeListeningCabinSentenceSpeakers({
            scriptMode: session.scriptMode,
            speakerPlan: session.speakerPlan,
            sentences: session.sentences,
        }),
        [session.scriptMode, session.speakerPlan, session.sentences],
    );
    const initialSentenceIndex = useMemo(
        () => clampSentenceIndex(restart ? 0 : session.lastSentenceIndex, resolvedSentences.length),
        [resolvedSentences.length, restart, session.lastSentenceIndex],
    );
    const subtitleChunks = useMemo(
        () => buildListeningCabinPlaybackChunks(resolvedSentences),
        [resolvedSentences],
    );

    const [currentSentenceIndex, setCurrentSentenceIndex] = useState(initialSentenceIndex);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [playbackMode, setPlaybackMode] = useState<ListeningCabinPlaybackMode>("auto_all");
    const [playbackRate, setPlaybackRate] = useState(session.playbackRate);
    const [showChineseSubtitle, setShowChineseSubtitle] = useState(session.showChineseSubtitle);
    const [progressRatio, setProgressRatio] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [audioEnergy, setAudioEnergy] = useState(0);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const lastEnergyRef = useRef<number>(0);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const currentSentenceIndexRef = useRef(initialSentenceIndex);
    const playbackModeRef = useRef<ListeningCabinPlaybackMode>("auto_all");
    const initializedAudioRef = useRef<HTMLAudioElement | null>(null);
    const narrationReadyRef = useRef(false);
    const loadingNarrationRef = useRef<Promise<void> | null>(null);
    const narrationPayloadRef = useRef<TtsPayload | null>(null);
    const baseTimingsRef = useRef<ListeningCabinSentenceTiming[]>([]);
    const timingsRef = useRef<ListeningCabinSentenceTiming[]>([]);
    const stopAtMsRef = useRef<number | null>(null);
    const suppressedUntilMsRef = useRef<number | null>(null);
    const commandTokenRef = useRef(0);
    const stopBoundaryFrameRef = useRef<number | null>(null);
    const isPlayingRef = useRef(false);
    const timingsSourceRef = useRef<"segment" | "marks" | "even">("marks");

    const resolveSafeTimingForSentence = useCallback((sentenceIndex: number) => {
        const audio = audioRef.current;
        let timings = timingsRef.current;
        let timing = timings[sentenceIndex];
        const hasDuration = Boolean(audio?.duration && Number.isFinite(audio.duration) && audio.duration > 0);

        if (isTimingLikelyUnreliable(timings, sentenceIndex, resolvedSentences.length) && hasDuration) {
            timings = buildEvenSentenceTimings(resolvedSentences.length, (audio?.duration ?? 0) * 1000);
            baseTimingsRef.current = timings;
            timingsRef.current = timings;
            timingsSourceRef.current = "even";
            timing = timings[sentenceIndex];
        }

        return timing ?? null;
    }, [resolvedSentences.length]);

    const computeStopAtMs = useCallback(
        (sentenceIndex: number, mode: ListeningCabinPlaybackMode) => {
            if (mode === "auto_all") {
                return null;
            }

            const chunk = subtitleChunks[findChunkIndexForSentence(subtitleChunks, sentenceIndex)];
            return getChunkEndMs(chunk, timingsRef.current);
        },
        [subtitleChunks],
    );

    const computeSafeStopAtMs = useCallback((sentenceIndex: number, anchorMs: number) => {
        const chunk = subtitleChunks[findChunkIndexForSentence(subtitleChunks, sentenceIndex)];
        const computed = getChunkEndMs(chunk, timingsRef.current);
        if (computed === null) {
            return null;
        }

        return Math.max(
            computed,
            anchorMs + STOP_MIN_VALID_OFFSET_FROM_SEEK_MS,
        );
    }, [subtitleChunks]);

    const seekWithinSentence = useCallback((
        audio: HTMLAudioElement,
        sentenceIndex: number,
        mode: ListeningCabinPlaybackMode,
    ) => {
        const timing = resolveSafeTimingForSentence(sentenceIndex);
        const targetMs = timing?.startMs ?? 0;
        audio.currentTime = targetMs / 1000;
        audio.playbackRate = playbackRate;

        const actualStartMs = audio.currentTime * 1000;
        const backwardDriftMs = Math.max(0, targetMs - actualStartMs - SEEK_BACKTRACK_TOLERANCE_MS);
        const computedStopAtMs = mode === "auto_all"
            ? null
            : computeSafeStopAtMs(sentenceIndex, actualStartMs);

        if (backwardDriftMs > 0) {
            suppressedUntilMsRef.current = Math.max(0, targetMs - SEEK_UNMUTE_EPSILON_MS);
            audio.muted = true;
        } else {
            suppressedUntilMsRef.current = null;
            audio.muted = false;
        }

        stopAtMsRef.current = computedStopAtMs === null
            ? null
            : computedStopAtMs + backwardDriftMs;

        return {
            targetMs,
            actualStartMs,
        };
    }, [computeSafeStopAtMs, playbackRate, resolveSafeTimingForSentence]);

    useEffect(() => {
        currentSentenceIndexRef.current = currentSentenceIndex;
    }, [currentSentenceIndex]);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    useEffect(() => {
        playbackModeRef.current = playbackMode;

        if (playbackMode === "auto_all") {
            stopAtMsRef.current = null;
            return;
        }

        stopAtMsRef.current = computeStopAtMs(currentSentenceIndexRef.current, playbackMode);
    }, [computeStopAtMs, playbackMode]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        audio.playbackRate = playbackRate;
    }, [playbackRate]);

    const persistSessionPatch = useCallback((patch: Partial<ListeningCabinSession>) => {
        void updateListeningCabinSession(session.id, patch);
    }, [session.id]);

    const ensureNarrationReady = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        if (narrationReadyRef.current && audio.src) {
            return;
        }

        if (narrationReadyRef.current && narrationPayloadRef.current) {
            audio.src = narrationPayloadRef.current.audio;
            audio.load();
            return;
        }

        const currentLoad = loadingNarrationRef.current;
        if (currentLoad) {
            await currentLoad;
            const refreshedAudio = audioRef.current;
            if (refreshedAudio && !refreshedAudio.src && narrationPayloadRef.current) {
                refreshedAudio.src = narrationPayloadRef.current.audio;
                refreshedAudio.load();
            }
            return;
        }

        const loadPromise = (async () => {
            setErrorMessage(null);
            setIsLoading(true);

            try {
                const payload = await getListeningCabinNarrationTtsPayload(
                    resolvedSentences,
                    session.voice,
                    session.playbackRate,
                    session.scriptMode,
                    session.speakerPlan,
                );

                narrationPayloadRef.current = payload;
                const segmentTimings = resolveSegmentTimings(payload.segmentTimings, resolvedSentences.length);
                const markTimings = buildListeningCabinSentenceTimings(resolvedSentences, payload.marks);
                if (hasCompleteUsableTimings(segmentTimings, resolvedSentences.length)) {
                    baseTimingsRef.current = segmentTimings;
                    timingsRef.current = segmentTimings;
                    timingsSourceRef.current = "segment";
                } else {
                    baseTimingsRef.current = markTimings;
                    timingsRef.current = markTimings;
                    timingsSourceRef.current = "marks";
                }
                audio.src = payload.audio;
                audio.load();
                narrationReadyRef.current = true;
            } catch (error) {
                console.error("Listening cabin narration failed:", error);
                setErrorMessage("整篇口播音频加载失败了，请重试。");
                throw error;
            } finally {
                setIsLoading(false);
            }
        })();

        loadingNarrationRef.current = loadPromise;

        try {
            await loadPromise;
        } finally {
            loadingNarrationRef.current = null;
        }
    }, [resolvedSentences, session.playbackRate, session.scriptMode, session.speakerPlan, session.voice]);

    const seekToSentence = useCallback(async (sentenceIndex: number, shouldPlay: boolean) => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        const nextSentenceIndex = clampSentenceIndex(sentenceIndex, resolvedSentences.length);
        const commandToken = commandTokenRef.current + 1;
        commandTokenRef.current = commandToken;
        currentSentenceIndexRef.current = nextSentenceIndex;

        setErrorMessage(null);
        setCurrentSentenceIndex(nextSentenceIndex);
        persistSessionPatch({
            lastSentenceIndex: nextSentenceIndex,
            lastPlayedAt: Date.now(),
        });

        await ensureNarrationReady();

        if (commandToken !== commandTokenRef.current) {
            return;
        }

        seekWithinSentence(audio, nextSentenceIndex, playbackModeRef.current);
        setProgressRatio(audio.duration && Number.isFinite(audio.duration) ? audio.currentTime / audio.duration : 0);

        if (!shouldPlay) {
            audio.pause();
            setIsPlaying(false);
            return;
        }

        try {
            await audio.play();
            if (commandToken !== commandTokenRef.current) {
                audio.pause();
                return;
            }
            setIsPlaying(true);
        } catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : "";
            const isInterruptedPlay = message.includes("interrupted")
                || message.includes("aborterror")
                || message.includes("play() request was interrupted");

            if (isInterruptedPlay && commandToken === commandTokenRef.current) {
                setIsPlaying(false);
                return;
            }

            if (commandToken === commandTokenRef.current) {
                setIsPlaying(false);
                setErrorMessage("播放失败了，请点一下重试。");
            }
            throw error;
        }
    }, [ensureNarrationReady, persistSessionPatch, resolvedSentences.length, seekWithinSentence]);

    const replayCurrentSentence = useCallback(async () => {
        await seekToSentence(currentSentenceIndexRef.current, true);
    }, [seekToSentence]);

        const pausePlayback = useCallback(() => {
        commandTokenRef.current += 1;
        stopAtMsRef.current = null;
        suppressedUntilMsRef.current = null;
        if (audioRef.current) {
            audioRef.current.muted = false;
        }
        audioRef.current?.pause();
        setIsPlaying(false);
    }, []);

    const resumeOrPlay = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio) return;

        await ensureNarrationReady();

        if (playbackModeRef.current !== "auto_all") {
            await seekToSentence(currentSentenceIndexRef.current, true);
            return;
        }

        if (audio.src && audio.paused && audio.currentTime > 0 && !errorMessage) {
            const commandToken = commandTokenRef.current + 1;
            commandTokenRef.current = commandToken;
            try {
                // Resume AudioContext (required for Web Audio API rhythm)
                if (audioContextRef.current?.state === "suspended") {
                    await audioContextRef.current.resume();
                }
                audio.playbackRate = playbackRate;
                await audio.play();
                if (commandToken !== commandTokenRef.current) {
                    audio.pause();
                    return;
                }
                setIsPlaying(true);
                return;
            } catch (error) {
                console.error("Listening cabin resume failed:", error);
            }
        }

        await seekToSentence(currentSentenceIndexRef.current, true);
    }, [ensureNarrationReady, errorMessage, playbackRate, seekToSentence]);

    const goToSentence = useCallback(async (sentenceIndex: number) => {
        await seekToSentence(sentenceIndex, true);
    }, [seekToSentence]);

    const previousSentence = useCallback(async () => {
        await goToSentence(currentSentenceIndexRef.current - 1);
    }, [goToSentence]);

    const nextSentence = useCallback(async () => {
        await goToSentence(currentSentenceIndexRef.current + 1);
    }, [goToSentence]);

    useEffect(() => {
        const audio = new Audio();
        audio.preload = "auto";
        audio.crossOrigin = "anonymous";
        audioRef.current = audio;

        // Initialize Analyser for Rhythm
        const initAnalyser = () => {
            if (analyserRef.current) return;
            try {
                const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
                if (!AudioCtx) {
                    return;
                }
                const context = new AudioCtx();
                const analyser = context.createAnalyser();
                analyser.fftSize = 128;
                const source = context.createMediaElementSource(audio);
                source.connect(analyser);
                analyser.connect(context.destination);
                
                audioContextRef.current = context;
                analyserRef.current = analyser;
                dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
            } catch (err) {
                console.warn("Failed to initialize audio analyzer:", err);
            }
        };

        const onFirstInteraction = () => {
            initAnalyser();
            // Start the monitoring loops
            monitorRhythm();
            window.removeEventListener("mousedown", onFirstInteraction);
            window.removeEventListener("touchstart", onFirstInteraction);
            window.removeEventListener("keydown", onFirstInteraction);
        };
        window.addEventListener("mousedown", onFirstInteraction);
        window.addEventListener("touchstart", onFirstInteraction);
        window.addEventListener("keydown", onFirstInteraction);

        const scheduleFrame = (callback: () => void) => {
            if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
                return window.requestAnimationFrame(() => callback());
            }

            return window.setTimeout(callback, 16) as unknown as number;
        };

        const cancelFrame = (frameId: number) => {
            if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
                window.cancelAnimationFrame(frameId);
                return;
            }

            window.clearTimeout(frameId);
        };

        const clearStopBoundaryMonitor = () => {
            if (stopBoundaryFrameRef.current === null) {
                return;
            }

            cancelFrame(stopBoundaryFrameRef.current);
            stopBoundaryFrameRef.current = null;
        };

        const enforceStopBoundary = () => {
            const stopAtMs = stopAtMsRef.current;
            if (stopAtMs === null) {
                return false;
            }

            const currentMs = audio.currentTime * 1000;
            if (currentMs < stopAtMs - STOP_BOUNDARY_GUARD_MS) {
                return false;
            }

            const mode = playbackModeRef.current;
            if (mode === "repeat_current") {
                seekWithinSentence(audio, currentSentenceIndexRef.current, mode);
                void audio.play().catch(() => undefined);
                return true;
            }

            audio.pause();
            audio.currentTime = stopAtMs / 1000;
            stopAtMsRef.current = null;
            setIsPlaying(false);
            setProgressRatio(
                audio.duration && Number.isFinite(audio.duration)
                    ? audio.currentTime / audio.duration
                    : 0,
            );
            return true;
        };

        const monitorStopBoundary = () => {
            if (audio.paused || stopAtMsRef.current === null) {
                stopBoundaryFrameRef.current = null;
                return;
            }

            if (enforceStopBoundary()) {
                stopBoundaryFrameRef.current = null;
                return;
            }

            stopBoundaryFrameRef.current = scheduleFrame(monitorStopBoundary);
        };

        const monitorRhythm = (timeMs: number = 0) => {
            if (!audioRef.current || audioRef.current.paused) {
                setAudioEnergy(0);
                lastEnergyRef.current = 0;
                return;
            }

            let newEnergy = 0;
            let capturedData = false;

            if (analyserRef.current && dataArrayRef.current) {
                analyserRef.current.getByteFrequencyData(dataArrayRef.current);
                let sum = 0;
                // Focus on human speech frequencies
                const voiceRange = dataArrayRef.current.slice(0, Math.floor(dataArrayRef.current.length * 0.6));
                for (let i = 0; i < voiceRange.length; i++) {
                    sum += voiceRange[i];
                }
                const avg = sum / voiceRange.length;
                if (avg > 0) {
                    newEnergy = Math.pow(avg / 255, 0.7) * 2.2;
                    capturedData = true;
                }
            }

            // Procedural Fallback if Real-Time Analyzer is blocked or silent
            if (!capturedData) {
                // Organic Noise-stipple breathing [0.12 - 0.45 peak]
                const slowBreathing = (Math.sin(timeMs / 800) + 1) / 2;
                const organicPulse = (Math.sin(timeMs / 120) + Math.cos(timeMs / 70) + 2) / 4;
                newEnergy = (slowBreathing * 0.1) + (organicPulse * 0.35);
            }

            // [CRITICAL] Vocal Smoothing Low-Pass Filter
            // Smoothly interpolate (LERP) to remove jitter and flickering
            const smoothed = lastEnergyRef.current * 0.7 + Math.min(newEnergy, 1) * 0.3;
            lastEnergyRef.current = smoothed;

            setAudioEnergy(smoothed);
            scheduleFrame(() => monitorRhythm(timeMs + 16.6));
        };

        const handleTimeUpdate = () => {
            if (!audio.duration || !Number.isFinite(audio.duration)) {
                setProgressRatio(0);
            } else {
                setProgressRatio(audio.currentTime / audio.duration);
            }

             const suppressedUntilMs = suppressedUntilMsRef.current;
             if (suppressedUntilMs !== null && audio.currentTime * 1000 >= suppressedUntilMs) {
                 suppressedUntilMsRef.current = null;
                 audio.muted = false;
             }

            if (enforceStopBoundary()) {
                return;
            }

            const currentMs = audio.currentTime * 1000;
            const timings = timingsRef.current;
            if (timings.length === 0) {
                return;
            }

            if (playbackModeRef.current !== "auto_all") {
                return;
            }

            const nextSentenceIndex = findSentenceIndexByTime(
                timings,
                currentMs + subtitleAdvanceMs,
            );

            if (nextSentenceIndex !== currentSentenceIndexRef.current) {
                currentSentenceIndexRef.current = nextSentenceIndex;
                setCurrentSentenceIndex(nextSentenceIndex);
                persistSessionPatch({
                    lastSentenceIndex: nextSentenceIndex,
                    lastPlayedAt: Date.now(),
                });
            }
        };

        const handleEnded = () => {
            clearStopBoundaryMonitor();
            setIsPlaying(false);
            setProgressRatio(1);
            stopAtMsRef.current = null;
            suppressedUntilMsRef.current = null;
            audio.muted = false;
        };

        const handlePause = () => {
            clearStopBoundaryMonitor();
            suppressedUntilMsRef.current = null;
            audio.muted = false;
            setIsPlaying(false);
        };

        const handlePlay = () => {
            setIsPlaying(true);
            monitorRhythm();
            if (stopAtMsRef.current !== null && stopBoundaryFrameRef.current === null) {
                stopBoundaryFrameRef.current = scheduleFrame(monitorStopBoundary);
            }
        };

        const handleLoadedMetadata = () => {
            if (!audio.duration || !Number.isFinite(audio.duration)) {
                return;
            }

            if (!hasCompleteUsableTimings(timingsRef.current, resolvedSentences.length)) {
                const evenTimings = buildEvenSentenceTimings(resolvedSentences.length, audio.duration * 1000);
                baseTimingsRef.current = evenTimings;
                timingsRef.current = evenTimings;
                timingsSourceRef.current = "even";
                return;
            }

            const baseTimings = hasCompleteUsableTimings(baseTimingsRef.current, resolvedSentences.length)
                ? baseTimingsRef.current
                : timingsRef.current;

            if (timingsSourceRef.current === "segment") {
                timingsRef.current = fitSentenceTimingsToDuration(
                    baseTimings,
                    audio.duration * 1000,
                    { allowExpand: true, allowShrink: false, progressiveExpand: true },
                );
                return;
            }

            timingsRef.current = fitSentenceTimingsToDuration(
                baseTimings,
                audio.duration * 1000,
            );
        };

        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("play", handlePlay);
        audio.addEventListener("loadedmetadata", handleLoadedMetadata);

        return () => {
            clearStopBoundaryMonitor();
            audio.pause();
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            if (initializedAudioRef.current === audio) {
                initializedAudioRef.current = null;
            }
            audioRef.current = null;
        };
    }, [computeSafeStopAtMs, persistSessionPatch, resolvedSentences.length, seekWithinSentence, subtitleAdvanceMs, subtitleChunks]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || initializedAudioRef.current === audio) {
            return;
        }

        initializedAudioRef.current = audio;

        persistSessionPatch({
            lastSentenceIndex: initialSentenceIndex,
            showChineseSubtitle: session.showChineseSubtitle,
        });
        void seekToSentence(initialSentenceIndex, true).catch(() => undefined);
    }, [initialSentenceIndex, persistSessionPatch, seekToSentence, session.showChineseSubtitle]);

    const toggleChineseSubtitle = useCallback(() => {
        setShowChineseSubtitle((current) => {
            const next = !current;
            persistSessionPatch({ showChineseSubtitle: next });
            return next;
        });
    }, [persistSessionPatch]);

    const applyPlaybackMode = useCallback(
        (mode: ListeningCabinPlaybackMode) => {
            playbackModeRef.current = mode;
            setPlaybackMode(mode);
            setErrorMessage(null);
            stopAtMsRef.current = computeStopAtMs(currentSentenceIndexRef.current, mode);

            if (mode !== "auto_all") {
                const audio = audioRef.current;
                if (audio) {
                    seekWithinSentence(audio, currentSentenceIndexRef.current, mode);
                    setProgressRatio(
                        audio.duration && Number.isFinite(audio.duration)
                            ? audio.currentTime / audio.duration
                            : 0,
                    );
                }
                return;
            }

            suppressedUntilMsRef.current = null;
            const audio = audioRef.current;
            if (audio) {
                audio.muted = false;
            }
        },
        [computeStopAtMs, seekWithinSentence],
    );

    const setSinglePauseMode = useCallback(() => {
        applyPlaybackMode("single_pause");
    }, [applyPlaybackMode]);

    const setAutoAllMode = useCallback(() => {
        applyPlaybackMode("auto_all");
    }, [applyPlaybackMode]);

    const setRepeatCurrentMode = useCallback(() => {
        applyPlaybackMode("repeat_current");
    }, [applyPlaybackMode]);

    const cyclePlaybackRate = useCallback(() => {
        setPlaybackRate((current) => {
            const currentIndex = LISTENING_CABIN_PLAYBACK_RATE_OPTIONS.findIndex((option) => option === current);
            const nextIndex = currentIndex >= 0
                ? (currentIndex + 1) % LISTENING_CABIN_PLAYBACK_RATE_OPTIONS.length
                : 0;
            const next = LISTENING_CABIN_PLAYBACK_RATE_OPTIONS[nextIndex];
            persistSessionPatch({ playbackRate: next });
            return next;
        });
    }, [persistSessionPatch]);

    const currentChunkIndex = findChunkIndexForSentence(subtitleChunks, currentSentenceIndex);
    const currentSubtitleChunk = subtitleChunks[currentChunkIndex];
    const previousSubtitleChunk = currentChunkIndex > 0 ? subtitleChunks[currentChunkIndex - 1] : null;
    const nextSubtitleChunk = currentChunkIndex < subtitleChunks.length - 1 ? subtitleChunks[currentChunkIndex + 1] : null;

    const resolveChunkSentences = useCallback((chunk: ListeningCabinPlaybackChunk | null | undefined): ListeningCabinSentence[] => {
        if (!chunk) {
            return [];
        }

        return chunk.sentenceIndexes
            .map((sentenceIndex) => resolvedSentences[sentenceIndex])
            .filter(Boolean);
    }, [resolvedSentences]);

    const playerState: ListeningCabinPlayerState = {
        currentSentenceIndex,
        isPlaying,
        isLoading,
        playbackMode,
        playbackRate,
        showChineseSubtitle,
        progressRatio,
        errorMessage,
    };

    return {
        playerState,
        currentSentence: resolvedSentences[currentSentenceIndex] ?? null,
        previousSentence: currentSentenceIndex > 0 ? resolvedSentences[currentSentenceIndex - 1] ?? null : null,
        nextSentencePreview: currentSentenceIndex < resolvedSentences.length - 1 ? resolvedSentences[currentSentenceIndex + 1] ?? null : null,
        currentSubtitleSentences: resolveChunkSentences(currentSubtitleChunk),
        previousSubtitleSentences: resolveChunkSentences(previousSubtitleChunk),
        nextSubtitleSentences: resolveChunkSentences(nextSubtitleChunk),
        pausePlayback,
        resumeOrPlay,
        replayCurrentSentence,
        previousSentenceAction: previousSentence,
        nextSentenceAction: nextSentence,
        setSinglePauseMode,
        setAutoAllMode,
        setRepeatCurrentMode,
        cyclePlaybackRate,
        toggleChineseSubtitle,
        audioEnergy,
    };
}
