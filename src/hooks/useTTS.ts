import { useState, useEffect, useRef, useCallback } from "react";
import { getAudioFromCache } from "@/lib/tts-cache";
import { ttsQueue } from "@/lib/tts-queue";

export function useTTS(text: string) {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);

    // Initialize audio element
    useEffect(() => {
        audioRef.current = new Audio();
        audioRef.current.onended = () => {
            setIsPlaying(false);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
        audioRef.current.onerror = (e) => {
            console.error("Audio playback error", e);
            setIsPlaying(false);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
        audioRef.current.onloadedmetadata = () => {
            if (audioRef.current) {
                setDuration(audioRef.current.duration);
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
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, []);

    // High-frequency update loop
    const rafRef = useRef<number | null>(null);
    const updateProgress = useCallback(() => {
        if (audioRef.current && !audioRef.current.paused) {
            setCurrentTime(audioRef.current.currentTime);
            rafRef.current = requestAnimationFrame(updateProgress);
        }
    }, []);

    useEffect(() => {
        if (isPlaying) {
            rafRef.current = requestAnimationFrame(updateProgress);
        } else {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        }
    }, [isPlaying, updateProgress]);

    // Update playback rate when it changes
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    const loadAudio = useCallback(async () => {
        if (audioUrl) return audioUrl;

        setIsLoading(true);
        try {
            // 1. Check Cache
            const cachedBlob = await getAudioFromCache(text);
            if (cachedBlob) {
                const url = URL.createObjectURL(cachedBlob);
                setAudioUrl(url);
                setIsLoading(false);
                return url;
            }

            // 2. Request from Queue
            const blob = await ttsQueue.add(text);
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);
            setIsLoading(false);
            return url;
        } catch (error) {
            console.error("Failed to load TTS:", error);
            setIsLoading(false);
            return null;
        }
    }, [text, audioUrl]);

    const play = useCallback(async () => {
        if (isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
            return;
        }

        let url = audioUrl;
        if (!url) {
            url = await loadAudio();
        }

        if (url && audioRef.current) {
            audioRef.current.src = url;

            // Replay if at the end
            if (Math.abs(currentTime - duration) < 0.5 || currentTime >= duration) {
                audioRef.current.currentTime = 0;
                setCurrentTime(0);
            } else {
                audioRef.current.currentTime = currentTime;
            }

            audioRef.current.playbackRate = playbackRate;
            audioRef.current.play()
                .then(() => setIsPlaying(true))
                .catch(err => console.error("Play failed:", err));
        }
    }, [audioUrl, isPlaying, loadAudio, currentTime, duration, playbackRate]);

    const stop = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setIsPlaying(false);
        setCurrentTime(0);
    }, []);

    const seek = useCallback((time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    }, []);

    const preload = useCallback(() => {
        loadAudio();
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
        playbackRate,
        setPlaybackRate
    };
}
