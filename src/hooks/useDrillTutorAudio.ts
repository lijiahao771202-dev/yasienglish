"use client";

import { useCallback, type MutableRefObject } from "react";

import { requestTtsPayload } from "@/lib/tts-client";

export function useDrillTutorAudio({
    audioRef,
}: {
    audioRef: MutableRefObject<HTMLAudioElement | null>;
}) {
    const handlePlayTutorCardAudio = useCallback(async (text: string) => {
        const normalizedText = text.trim();
        if (!normalizedText) return;

        try {
            const data = await requestTtsPayload(normalizedText);

            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }

            const nextAudio = new Audio(data.audio);
            audioRef.current = nextAudio;
            await nextAudio.play();
        } catch (error) {
            console.error("[AI Teacher] audio playback failed", error);
        }
    }, [audioRef]);

    return {
        handlePlayTutorCardAudio,
    };
}
