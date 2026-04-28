import { useState, useEffect, useRef, useCallback } from "react";
import { deleteAudioFromCache, getAudioFromCache } from "@/lib/tts-cache";
import { isRetryableTtsError, requestTtsPayload } from "@/lib/tts-client";
import { ttsQueue } from "@/lib/tts-queue";
import { describeHtmlMediaErrorCode, isLikelyPlayableMpegBlob } from "@/lib/tts-audio";

interface TtsWordMark {
    time: number;
    type: string;
    start: number;
    end: number;
    value: string;
}

const marksCache = new Map<string, TtsWordMark[]>();

export function useTTS(text: string) {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [marks, setMarks] = useState<TtsWordMark[]>([]);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const objectUrlRef = useRef<string | null>(null);
    const lastAudioSourceRef = useRef<"cache" | "network" | null>(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);

    const rafRef = useRef<number | null>(null);
    const marksRef = useRef<TtsWordMark[]>([]);
    const latestTextRef = useRef(text);
    const lastProgressUpdateRef = useRef(0);

    useEffect(() => {
        marksRef.current = marks;
    }, [marks]);

    const revokeObjectUrl = useCallback(() => {
        if (!objectUrlRef.current) return;
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
    }, []);

    const setResolvedAudioUrl = useCallback((nextUrl: string, isObjectUrl: boolean) => {
        if (isObjectUrl) {
            revokeObjectUrl();
            objectUrlRef.current = nextUrl;
        }
        setAudioUrl(nextUrl);
    }, [revokeObjectUrl]);

    const hydrateMarksFromApi = useCallback(async (sourceText: string) => {
        if (!sourceText.trim()) return;
        if (marksCache.has(sourceText)) {
            const cached = marksCache.get(sourceText) ?? [];
            setMarks(cached);
            return;
        }

        try {
            const payload = await requestTtsPayload(sourceText);
            const nextMarks = Array.isArray(payload.marks) ? payload.marks : [];
            marksCache.set(sourceText, nextMarks);
            if (latestTextRef.current === sourceText) {
                setMarks(nextMarks);
            }
        } catch {
            if (latestTextRef.current === sourceText) {
                setMarks([]);
            }
        }
    }, []);

    const updateProgress = useCallback(function updateProgressLoop() {
        if (audioRef.current && !audioRef.current.paused) {
            const now = performance.now();
            // Throttle UI updates to ~45fps for smoother rendering under heavy text layout.
            if (now - lastProgressUpdateRef.current >= 22) {
                setCurrentTime(audioRef.current.currentTime);
                lastProgressUpdateRef.current = now;
            }
            rafRef.current = requestAnimationFrame(updateProgressLoop);
        }
    }, []);

    useEffect(() => {
        const audio = new Audio();
        audioRef.current = audio;

        audio.onended = () => {
            setIsPlaying(false);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
        audio.onerror = (e) => {
            const mediaError = audioRef.current?.error;
            const sourceText = latestTextRef.current;
            const eventType = typeof e === "object" && e !== null && "type" in e ? e.type : "unknown";
            console.error("Audio playback error", {
                eventType,
                code: mediaError?.code ?? null,
                reason: describeHtmlMediaErrorCode(mediaError?.code),
                src: audioRef.current?.src ?? null,
                textPreview: sourceText.slice(0, 80),
                source: lastAudioSourceRef.current,
            });
            setIsPlaying(false);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            void deleteAudioFromCache(sourceText);
        };
        audio.onloadedmetadata = () => {
            if (audioRef.current) {
                setDuration(audioRef.current.duration || 0);
            }
        };

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            revokeObjectUrl();
        };
    }, [revokeObjectUrl]);

    useEffect(() => {
        if (isPlaying) {
            lastProgressUpdateRef.current = 0;
            rafRef.current = requestAnimationFrame(updateProgress);
        } else if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }
    }, [isPlaying, updateProgress]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    useEffect(() => {
        if (latestTextRef.current === text) return;

        latestTextRef.current = text;
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        setAudioUrl(null);
        setMarks(marksCache.get(text) ?? []);
        lastAudioSourceRef.current = null;

        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
            audioRef.current.currentTime = 0;
        }

        revokeObjectUrl();
    }, [revokeObjectUrl, text]);

    const loadAudio = useCallback(async () => {
        if (!text.trim()) return null;

        if (audioUrl) {
            if (marksCache.has(text)) {
                setMarks(marksCache.get(text) ?? []);
            }
            return audioUrl;
        }

        setIsLoading(true);
        try {
            if (marksCache.has(text)) {
                setMarks(marksCache.get(text) ?? []);
            }

            // 1. Cache first for audio bytes.
            const cachedBlob = await getAudioFromCache(text);
            if (cachedBlob) {
                const isValidCachedBlob = await isLikelyPlayableMpegBlob(cachedBlob);
                if (!isValidCachedBlob) {
                    await deleteAudioFromCache(text);
                } else {
                const url = URL.createObjectURL(cachedBlob);
                setResolvedAudioUrl(url, true);
                    lastAudioSourceRef.current = "cache";

                // Audio may be in browser cache while marks are not; fetch marks in background.
                if (!marksCache.has(text)) {
                    void hydrateMarksFromApi(text);
                }

                setIsLoading(false);
                return url;
                }
            }

            // 2. Queue request when cache misses.
            const result = await ttsQueue.add(text);
            const url = URL.createObjectURL(result.blob);
            setResolvedAudioUrl(url, true);
            lastAudioSourceRef.current = "network";

            const nextMarks = Array.isArray(result.marks) ? result.marks : [];
            marksCache.set(text, nextMarks);
            setMarks(nextMarks);

            setIsLoading(false);
            return url;
        } catch (error) {
            if (isRetryableTtsError(error)) {
                console.warn("TTS temporarily unavailable:", error);
            } else {
                console.error("Failed to load TTS:", error);
            }
            setIsLoading(false);
            return null;
        }
    }, [audioUrl, hydrateMarksFromApi, setResolvedAudioUrl, text]);

    const play = useCallback(async () => {
        if (isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
            return;
        }

        let url = audioUrl;
        if (!url) {
            url = await loadAudio();
            if (!url) {
                // Retry once for transient network / TTS backend instability.
                url = await loadAudio();
            }
        }

        if (url && audioRef.current) {
            audioRef.current.src = url;

            if (Math.abs(currentTime - duration) < 0.5 || currentTime >= duration) {
                audioRef.current.currentTime = 0;
                setCurrentTime(0);
            } else {
                audioRef.current.currentTime = currentTime;
            }

            audioRef.current.playbackRate = playbackRate;
            audioRef.current.play()
                .then(() => setIsPlaying(true))
                .catch((err) => console.error("Play failed:", err));
        } else {
            console.warn("TTS play aborted: no audio url resolved");
        }
    }, [audioUrl, currentTime, duration, isPlaying, loadAudio, playbackRate]);

    const stop = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setIsPlaying(false);
        setCurrentTime(0);
    }, []);

    const seek = useCallback((time: number) => {
        const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
        if (audioRef.current) {
            audioRef.current.currentTime = safeTime;
        }
        setCurrentTime(safeTime);
    }, []);

    const seekToMs = useCallback(async (timeMs: number, options?: { autoplay?: boolean }) => {
        const autoplay = options?.autoplay ?? false;
        const targetSeconds = Math.max(0, timeMs) / 1000;

        if (audioRef.current) {
            audioRef.current.currentTime = targetSeconds;
            setCurrentTime(targetSeconds);

            if (autoplay) {
                try {
                    await audioRef.current.play();
                    setIsPlaying(true);
                } catch (error) {
                    console.error("seekToMs autoplay failed:", error);
                }
            }
            return;
        }

        seek(targetSeconds);
    }, [seek]);

    const seekToWord = useCallback(async (wordIndex: number, options?: { autoplay?: boolean }) => {
        const mark = marksRef.current[wordIndex];
        if (!mark) return false;

        await seekToMs(mark.start, options);
        return true;
    }, [seekToMs]);

    const preload = useCallback(() => {
        void loadAudio();
    }, [loadAudio]);

    return {
        play,
        stop,
        isPlaying,
        isLoading,
        preload,
        hasAudio: !!audioUrl,
        currentTime,
        duration,
        seek,
        seekToMs,
        seekToWord,
        marks,
        playbackRate,
        setPlaybackRate,
    };
}
