"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const PLAYBACK_MEDIA_SOURCE_KEY = "__yasiPlaybackMediaSourceGraph__";

type PlaybackMediaSourceGraph = {
    context: AudioContext;
    source: MediaElementAudioSourceNode;
};

type HTMLAudioElementWithPlaybackGraph = HTMLAudioElement & {
    [PLAYBACK_MEDIA_SOURCE_KEY]?: PlaybackMediaSourceGraph;
};

function getPlaybackMediaSource(
    audioElement: HTMLAudioElement,
    AudioContextClass: typeof AudioContext,
) {
    const elementWithGraph = audioElement as HTMLAudioElementWithPlaybackGraph;
    const cached = elementWithGraph[PLAYBACK_MEDIA_SOURCE_KEY];
    if (cached) {
        return cached;
    }

    const context = new AudioContextClass();
    const source = context.createMediaElementSource(audioElement);
    const graph = { context, source };
    elementWithGraph[PLAYBACK_MEDIA_SOURCE_KEY] = graph;
    return graph;
}

export const PlaybackWaveBars = memo(function PlaybackWaveBars({
    audioElement,
    isPlaying,
}: {
    audioElement: HTMLAudioElement | null;
    isPlaying: boolean;
}) {
    const prefersReducedMotion = useReducedMotion();
    const [levels, setLevels] = useState<number[]>([0.1, 0.1, 0.1]);
    const levelBufferRef = useRef<number[]>([0.1, 0.1, 0.1]);

    useEffect(() => {
        if (!audioElement || !isPlaying || typeof window === "undefined") {
            levelBufferRef.current = [0.1, 0.1, 0.1];
            return;
        }

        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;

        const { context, source } = getPlaybackMediaSource(audioElement, AudioContextClass);
        const analyser = context.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.6;

        source.connect(analyser);
        analyser.connect(context.destination);

        const data = new Uint8Array(analyser.frequencyBinCount);
        let frameId = 0;
        let cancelled = false;

        const updateLevels = () => {
            if (cancelled) return;
            analyser.getByteFrequencyData(data);
            const now = window.performance.now() / 1000;

            const getBand = (s: number, e: number) => {
                let sum = 0;
                for (let i = s; i < e; i += 1) sum += data[i] || 0;
                return sum / (e - s);
            };

            const bandsRaw = [
                getBand(0, 3),
                getBand(3, 8),
                getBand(8, 16),
                getBand(16, 32),
            ];

            const next = bandsRaw.map((raw, idx) => {
                const prev = levelBufferRef.current[idx] || 0.1;
                const normalized = Math.pow(raw / 255, 1.4);
                const pulse = (Math.sin(now * (3.5 + idx * 0.8) + idx * 1.5) + 1) / 2;
                const idle = prefersReducedMotion ? 0 : pulse * 0.15;
                const target = Math.max(normalized, idle);

                const attack = [0.45, 0.5, 0.6, 0.7][idx];
                const release = [0.85, 0.82, 0.78, 0.75][idx];

                const isRising = target > prev;
                return isRising
                    ? prev * (1 - attack) + target * attack
                    : prev * release + target * (1 - release);
            });

            levelBufferRef.current = next;
            setLevels(next);
            frameId = window.requestAnimationFrame(updateLevels);
        };

        void context.resume().finally(() => {
            if (!cancelled) frameId = window.requestAnimationFrame(updateLevels);
        });

        return () => {
            cancelled = true;
            if (frameId) window.cancelAnimationFrame(frameId);
            try { source.disconnect(analyser); } catch {}
            analyser.disconnect();
        };
    }, [audioElement, isPlaying, prefersReducedMotion]);

    const displayLevels = (!audioElement || !isPlaying) ? [0.1, 0.1, 0.1] : levels;
    const [b0, b1, b2, b3] = displayLevels;
    const heights = [
        8 + (b0 || 0) * 32,
        12 + (b1 || 0) * 28,
        14 + (b2 || 0) * 24,
        10 + (b3 || 0) * 20,
    ];

    return (
        <div className="relative flex h-12 w-16 items-center justify-center gap-[3px]">
            {heights.map((h, i) => (
                <div
                    key={i}
                    className={cn(
                        "w-[5px] rounded-[3px] border border-theme-border/20 bg-theme-primary-bg shadow-[0_2px_0_var(--theme-shadow)] will-change-[height,opacity]",
                        isPlaying && "animate-[pulse-glow_2s_ease-in-out_infinite]",
                    )}
                    style={{
                        height: `${h}px`,
                        opacity: isPlaying ? 1 : 0.6 + (h / 80),
                        transition: isPlaying ? "none" : "height 400ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 400ms ease-out",
                    }}
                />
            ))}
        </div>
    );
});
