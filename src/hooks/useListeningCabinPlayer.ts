"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    buildListeningCabinPlaybackChunks,
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
};

function clampSentenceIndex(index: number, count: number) {
    if (count <= 0) return 0;
    return Math.min(Math.max(index, 0), count - 1);
}

function findSentenceIndexByTime(timings: ListeningCabinSentenceTiming[], currentMs: number) {
    if (timings.length === 0) {
        return 0;
    }

    for (let index = 0; index < timings.length; index += 1) {
        const timing = timings[index];
        const nextTiming = timings[index + 1];
        const upperBound = nextTiming ? Math.max(timing.endMs, nextTiming.startMs) : timing.endMs + 160;

        if (currentMs < upperBound) {
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
    if (!nextTiming) {
        return timing.endMs;
    }

    // Keep a stronger safety gap before the next sentence to avoid hearing the next word onset.
    return Math.min(timing.endMs, Math.max(timing.startMs, nextTiming.startMs - 80));
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

export function useListeningCabinPlayer({ session, restart = false }: UseListeningCabinPlayerOptions) {
    const initialSentenceIndex = useMemo(
        () => clampSentenceIndex(restart ? 0 : session.lastSentenceIndex, session.sentences.length),
        [restart, session.lastSentenceIndex, session.sentences.length],
    );
    const subtitleChunks = useMemo(
        () => buildListeningCabinPlaybackChunks(session.sentences),
        [session.sentences],
    );

    const [currentSentenceIndex, setCurrentSentenceIndex] = useState(initialSentenceIndex);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [playbackMode, setPlaybackMode] = useState<ListeningCabinPlaybackMode>("auto_all");
    const [playbackRate, setPlaybackRate] = useState(session.playbackRate);
    const [showChineseSubtitle, setShowChineseSubtitle] = useState(session.showChineseSubtitle);
    const [progressRatio, setProgressRatio] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const currentSentenceIndexRef = useRef(initialSentenceIndex);
    const playbackModeRef = useRef<ListeningCabinPlaybackMode>("auto_all");
    const initializedAudioRef = useRef<HTMLAudioElement | null>(null);
    const narrationReadyRef = useRef(false);
    const loadingNarrationRef = useRef<Promise<void> | null>(null);
    const narrationPayloadRef = useRef<TtsPayload | null>(null);
    const timingsRef = useRef<ListeningCabinSentenceTiming[]>([]);
    const stopAtMsRef = useRef<number | null>(null);
    const commandTokenRef = useRef(0);
    const stopBoundaryFrameRef = useRef<number | null>(null);

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

    useEffect(() => {
        currentSentenceIndexRef.current = currentSentenceIndex;
    }, [currentSentenceIndex]);

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
                    session.sentences,
                    session.voice,
                    session.playbackRate,
                );

                narrationPayloadRef.current = payload;
                timingsRef.current = buildListeningCabinSentenceTimings(session.sentences, payload.marks);
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
    }, [session.playbackRate, session.sentences, session.voice]);

    const seekToSentence = useCallback(async (sentenceIndex: number, shouldPlay: boolean) => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        const nextSentenceIndex = clampSentenceIndex(sentenceIndex, session.sentences.length);
        const commandToken = commandTokenRef.current + 1;
        commandTokenRef.current = commandToken;

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

        const timing = timingsRef.current[nextSentenceIndex];
        const targetSeconds = timing ? timing.startMs / 1000 : 0;
        const chunk = subtitleChunks[findChunkIndexForSentence(subtitleChunks, nextSentenceIndex)];

        audio.currentTime = targetSeconds;
        audio.playbackRate = playbackRate;
        setProgressRatio(audio.duration && Number.isFinite(audio.duration) ? audio.currentTime / audio.duration : 0);
        stopAtMsRef.current = playbackModeRef.current === "auto_all" ? null : getChunkEndMs(chunk, timingsRef.current);

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
            if (commandToken === commandTokenRef.current) {
                setIsPlaying(false);
                setErrorMessage("播放失败了，请点一下重试。");
            }
            throw error;
        }
    }, [ensureNarrationReady, persistSessionPatch, playbackRate, session.sentences.length, subtitleChunks]);

    const replayCurrentSentence = useCallback(async () => {
        await seekToSentence(currentSentenceIndexRef.current, true);
    }, [seekToSentence]);

    const pausePlayback = useCallback(() => {
        commandTokenRef.current += 1;
        stopAtMsRef.current = null;
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
        audioRef.current = audio;

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
            if (currentMs < stopAtMs - 8) {
                return false;
            }

            const mode = playbackModeRef.current;
            if (mode === "repeat_current") {
                const currentTiming = timingsRef.current[currentSentenceIndexRef.current];
                audio.currentTime = (currentTiming?.startMs ?? 0) / 1000;
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

        const handleTimeUpdate = () => {
            if (!audio.duration || !Number.isFinite(audio.duration)) {
                setProgressRatio(0);
            } else {
                setProgressRatio(audio.currentTime / audio.duration);
            }

            if (enforceStopBoundary()) {
                return;
            }

            const currentMs = audio.currentTime * 1000;
            const timings = timingsRef.current;
            if (timings.length === 0) {
                return;
            }

            const nextSentenceIndex = findSentenceIndexByTime(timings, currentMs);

            if (playbackModeRef.current !== "auto_all") {
                const currentChunkIndex = findChunkIndexForSentence(
                    subtitleChunks,
                    currentSentenceIndexRef.current,
                );
                const nextChunkIndex = findChunkIndexForSentence(subtitleChunks, nextSentenceIndex);

                if (nextChunkIndex !== currentChunkIndex) {
                    const fallbackStopAtMs = getChunkEndMs(subtitleChunks[currentChunkIndex], timings);
                    const stopAtBoundary = stopAtMsRef.current ?? fallbackStopAtMs;

                    if (stopAtBoundary !== null) {
                        audio.pause();
                        audio.currentTime = stopAtBoundary / 1000;
                        stopAtMsRef.current = null;
                        setIsPlaying(false);
                        setProgressRatio(
                            audio.duration && Number.isFinite(audio.duration)
                                ? audio.currentTime / audio.duration
                                : 0,
                        );
                        return;
                    }
                }
            }

            if (nextSentenceIndex !== currentSentenceIndexRef.current) {
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
        };

        const handlePause = () => {
            clearStopBoundaryMonitor();
            setIsPlaying(false);
        };

        const handlePlay = () => {
            setIsPlaying(true);
            if (stopAtMsRef.current !== null && stopBoundaryFrameRef.current === null) {
                stopBoundaryFrameRef.current = scheduleFrame(monitorStopBoundary);
            }
        };

        const handleLoadedMetadata = () => {
            if (!audio.duration || !Number.isFinite(audio.duration)) {
                return;
            }

            if (!hasCompleteUsableTimings(timingsRef.current, session.sentences.length)) {
                timingsRef.current = buildEvenSentenceTimings(session.sentences.length, audio.duration * 1000);
            }
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
    }, [persistSessionPatch, session.sentences.length, subtitleChunks]);

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
            stopAtMsRef.current = computeStopAtMs(currentSentenceIndexRef.current, mode);
            setPlaybackMode(mode);
        },
        [computeStopAtMs],
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
            .map((sentenceIndex) => session.sentences[sentenceIndex])
            .filter(Boolean);
    }, [session.sentences]);

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
        currentSentence: session.sentences[currentSentenceIndex] ?? null,
        previousSentence: currentSentenceIndex > 0 ? session.sentences[currentSentenceIndex - 1] ?? null : null,
        nextSentencePreview: currentSentenceIndex < session.sentences.length - 1 ? session.sentences[currentSentenceIndex + 1] ?? null : null,
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
    };
}
