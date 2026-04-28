"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { getSentenceAudioCacheKey } from "@/lib/drill-rebuild-helpers";
import { requestTtsPayload, resolveTtsAudioBlob, type TtsPayload } from "@/lib/tts-client";

export interface CachedDrillAudio {
    blob?: Blob;
    marks?: TtsPayload["marks"];
    url?: string;
}

interface UseDrillAudioPlaybackParams {
    bossActive: boolean;
    bossType: string;
    drillReferenceEnglish?: string | null;
    hasPlayedEchoRef: MutableRefObject<boolean>;
    mode: string;
    onBeforePlay?: () => void;
    onEchoBlocked?: () => void;
    onLightningStart?: () => void;
    onReplayCount?: () => void;
    passageReferenceTexts?: string[];
    playbackSpeed: number;
    setPlaybackSpeed: Dispatch<SetStateAction<number>>;
    shouldCountReplay?: boolean;
    shouldPrefetchSentenceAudio: boolean;
}

export function useDrillAudioPlayback({
    bossActive,
    bossType,
    drillReferenceEnglish,
    hasPlayedEchoRef,
    mode,
    onBeforePlay,
    onEchoBlocked,
    onLightningStart,
    onReplayCount,
    passageReferenceTexts = [],
    playbackSpeed,
    setPlaybackSpeed,
    shouldCountReplay = false,
    shouldPrefetchSentenceAudio,
}: UseDrillAudioPlaybackParams) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [isPrefetching, setIsPrefetching] = useState(false);
    const [loadingAudioKeys, setLoadingAudioKeys] = useState<Set<string>>(() => new Set());
    const [currentAudioTime, setCurrentAudioTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [audioSourceText, setAudioSourceText] = useState<string | null>(null);
    const [activePlaybackAudio, setActivePlaybackAudio] = useState<HTMLAudioElement | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioObjectUrlRef = useRef<string | null>(null);
    const audioCache = useRef<Map<string, CachedDrillAudio>>(new Map());
    const audioInflight = useRef<Map<string, Promise<{ blob: Blob; marks: TtsPayload["marks"] }>>>(new Map());
    const lastPlayTime = useRef(0);

    const fetchTtsAudio = useCallback(async (text: string) => {
        const data = await requestTtsPayload(text);
        const blob = await resolveTtsAudioBlob(data.audio);

        if (blob.size < 100) {
            throw new Error("Generated audio blob too small");
        }

        return { blob, marks: data.marks || [] };
    }, []);

    const ensureAudioCached = useCallback(async (text: string) => {
        const textKey = getSentenceAudioCacheKey(text);
        const cached = audioCache.current.get(textKey);
        if (cached?.blob) {
            return cached;
        }

        const pending = audioInflight.current.get(textKey);
        if (pending) {
            return pending;
        }

        setLoadingAudioKeys((prev) => {
            if (prev.has(textKey)) return prev;
            const next = new Set(prev);
            next.add(textKey);
            return next;
        });

        const nextRequest = fetchTtsAudio(text)
            .then((nextAudio) => {
                audioCache.current.set(textKey, nextAudio);
                return nextAudio;
            })
            .finally(() => {
                audioInflight.current.delete(textKey);
                setLoadingAudioKeys((prev) => {
                    if (!prev.has(textKey)) return prev;
                    const next = new Set(prev);
                    next.delete(textKey);
                    return next;
                });
            });

        audioInflight.current.set(textKey, nextRequest);
        return nextRequest;
    }, [fetchTtsAudio]);

    const resetAudioPlayback = useCallback(() => {
        const activeAudio = audioRef.current;
        if (activeAudio) {
            activeAudio.onplay = null;
            activeAudio.onpause = null;
            activeAudio.onloadedmetadata = null;
            activeAudio.ontimeupdate = null;
            activeAudio.onended = null;
            activeAudio.onerror = null;
            activeAudio.onabort = null;
            activeAudio.onstalled = null;
            activeAudio.onemptied = null;
            activeAudio.pause();
            activeAudio.src = "";
            audioRef.current = null;
        }

        if (audioObjectUrlRef.current) {
            URL.revokeObjectURL(audioObjectUrlRef.current);
            audioObjectUrlRef.current = null;
        }

        setIsPlaying(false);
        setIsAudioLoading(false);
        setCurrentAudioTime(0);
        setAudioDuration(0);
        setAudioSourceText(null);
        setActivePlaybackAudio(null);
    }, []);

    const playAudio = useCallback(async (explicitText?: string) => {
        const resolvedText = explicitText ?? drillReferenceEnglish;
        if (!resolvedText) return false;

        const now = Date.now();
        if (now - lastPlayTime.current < 500) return false;
        lastPlayTime.current = now;

        if (bossActive && bossType === "echo" && hasPlayedEchoRef.current) {
            onEchoBlocked?.();
            return false;
        }

        const textKey = getSentenceAudioCacheKey(resolvedText);
        onBeforePlay?.();

        try {
            let cached = audioCache.current.get(textKey);

            if (!cached) {
                setIsAudioLoading(true);
                setIsPlaying(false);
                cached = await ensureAudioCached(resolvedText);
                setIsAudioLoading(false);
            }

            resetAudioPlayback();
            setAudioSourceText(resolvedText);

            const audioUrl = cached.blob ? URL.createObjectURL(cached.blob) : (cached.url || "");
            if (cached.blob) {
                audioObjectUrlRef.current = audioUrl;
            }

            const audio = new Audio(audioUrl);
            audioRef.current = audio;
            setActivePlaybackAudio(audio);

            audio.onerror = () => {
                resetAudioPlayback();
            };
            audio.onabort = () => {
                resetAudioPlayback();
            };
            audio.onstalled = () => {
                setIsPlaying(false);
            };
            audio.onemptied = () => {
                resetAudioPlayback();
            };
            audio.onplay = () => {
                setIsPlaying(true);
                setIsAudioLoading(false);
            };
            audio.onpause = () => {
                if (!audio.ended) {
                    setIsPlaying(false);
                }
            };
            audio.onloadedmetadata = () => {
                setAudioDuration(audio.duration * 1000);
            };
            if (audio.duration && !Number.isNaN(audio.duration)) {
                setAudioDuration(audio.duration * 1000);
            }
            audio.ontimeupdate = () => {
                if (!audio.paused) {
                    setCurrentAudioTime(audio.currentTime * 1000);
                }
            };
            audio.onended = () => {
                resetAudioPlayback();
            };
            audio.playbackRate = playbackSpeed;

            if (bossActive && bossType === "echo") {
                if (hasPlayedEchoRef.current) {
                    onEchoBlocked?.();
                    setIsPlaying(false);
                    return false;
                }
                hasPlayedEchoRef.current = true;
            }

            await audio.play();
            if (shouldCountReplay) {
                onReplayCount?.();
            }
            setIsPlaying(!audio.paused);

            if (bossActive && bossType === "lightning") {
                onLightningStart?.();
            }
            return true;
        } catch (error) {
            console.error("Audio chain failed", error);
            resetAudioPlayback();
            return false;
        }
    }, [
        bossActive,
        bossType,
        drillReferenceEnglish,
        ensureAudioCached,
        hasPlayedEchoRef,
        onBeforePlay,
        onEchoBlocked,
        onLightningStart,
        onReplayCount,
        playbackSpeed,
        resetAudioPlayback,
        shouldCountReplay,
    ]);

    useEffect(() => {
        if (!shouldPrefetchSentenceAudio || !drillReferenceEnglish) {
            setIsPrefetching(false);
            return;
        }

        const textKey = getSentenceAudioCacheKey(drillReferenceEnglish);
        if (audioCache.current.has(textKey) || audioInflight.current.has(textKey)) {
            return;
        }

        let isCancelled = false;

        const prefetchAudio = async () => {
            setIsPrefetching(true);
            try {
                const cachedAudio = await ensureAudioCached(drillReferenceEnglish);
                if (isCancelled) return;
                audioCache.current.set(textKey, cachedAudio);
            } catch (error) {
                if (!isCancelled) {
                    console.error("[Audio Prefetch] Error:", error);
                }
            } finally {
                if (!isCancelled) {
                    setIsPrefetching(false);
                }
            }
        };

        void prefetchAudio();

        return () => {
            isCancelled = true;
        };
    }, [drillReferenceEnglish, ensureAudioCached, shouldPrefetchSentenceAudio]);

    useEffect(() => {
        if (passageReferenceTexts.length === 0) return;

        const uniqueTexts = Array.from(new Set(
            passageReferenceTexts
                .map((text) => text?.trim())
                .filter((text): text is string => Boolean(text))
        ));
        const pendingTexts = uniqueTexts.filter((text) => {
            const textKey = getSentenceAudioCacheKey(text);
            return !audioCache.current.has(textKey) && !audioInflight.current.has(textKey);
        });
        if (pendingTexts.length === 0) return;

        let isCancelled = false;

        const prefetchAllPassageAudio = async () => {
            setIsPrefetching(true);
            try {
                await Promise.allSettled(pendingTexts.map((text) => ensureAudioCached(text)));
            } catch (error) {
                if (!isCancelled) {
                    console.error("[Passage Audio Prefetch] Error:", error);
                }
            } finally {
                if (!isCancelled) {
                    setIsPrefetching(false);
                }
            }
        };

        void prefetchAllPassageAudio();

        return () => {
            isCancelled = true;
        };
    }, [ensureAudioCached, passageReferenceTexts]);

    const handleSeek = useCallback((timeMs: number) => {
        setCurrentAudioTime(timeMs);
        if (audioRef.current) {
            audioRef.current.currentTime = timeMs / 1000;
        }
    }, []);

    const handlePlaybackSpeedChange = useCallback((speed: number) => {
        setPlaybackSpeed(speed);
        if (audioRef.current) {
            audioRef.current.playbackRate = speed;
        }
    }, [setPlaybackSpeed]);

    const cyclePlaybackSpeed = useCallback(() => {
        const speedOptions = [0.5, 0.75, 1, 1.25, 1.5] as const;
        const speedIndex = speedOptions.findIndex((speed) => speed === playbackSpeed);
        const nextSpeed = speedOptions[(speedIndex + 1) % speedOptions.length] ?? 1;
        handlePlaybackSpeedChange(nextSpeed);
    }, [handlePlaybackSpeedChange, playbackSpeed]);

    const getCachedAudio = useCallback((text: string) => {
        return audioCache.current.get(getSentenceAudioCacheKey(text));
    }, []);

    useEffect(() => {
        resetAudioPlayback();
        return () => {
            resetAudioPlayback();
        };
    }, [drillReferenceEnglish, mode, resetAudioPlayback]);

    return {
        activePlaybackAudio,
        audioCacheRef: audioCache,
        audioDuration,
        audioRef,
        audioSourceText,
        currentAudioTime,
        cyclePlaybackSpeed,
        ensureAudioCached,
        getCachedAudio,
        handlePlaybackSpeedChange,
        handleSeek,
        isAudioLoading,
        isPlaying,
        isPrefetching,
        loadingAudioKeys,
        playbackSpeed,
        playAudio,
        resetAudioPlayback,
        setIsPlaying,
    };
}
