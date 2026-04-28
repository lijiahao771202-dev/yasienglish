"use client";

import { useEffect, useRef, useState } from "react";
import { Dices, EyeOff, Skull, Volume2, Zap } from "lucide-react";

import { getDrillSurfacePhase } from "@/lib/battleUiState";

export const DRILL_BOSS_CONFIG = {
    blind: {
        name: "盲眼聆听者 (BLIND)",
        desc: "原速播放 • 无文本提示",
        icon: EyeOff,
        color: "text-stone-300",
        bg: "bg-stone-500",
        style: "bg-[#1a1a1a] border-stone-800 shadow-[0_0_60px_rgba(0,0,0,0.8)] text-stone-300 ring-1 ring-stone-800/50 grayscale",
        introDelay: 2000,
        bgm: "/blind_intro.mp3",
    },
    lightning: {
        name: "闪电恶魔 (LIGHTNING)",
        desc: "30秒限时 • 1.5倍速挑战",
        icon: Zap,
        color: "text-amber-400",
        bg: "bg-amber-500",
        style: "bg-[#2A1B00] border-amber-500/50 shadow-[0_0_80px_rgba(245,158,11,0.3)] text-amber-100 ring-1 ring-amber-500/30",
        introDelay: 2000,
        bgm: "/lightning_intro.mp3",
    },
    echo: {
        name: "回声巨兽 (ECHO)",
        desc: "只听一次 • 瞬间记忆挑战",
        icon: Volume2,
        color: "text-cyan-400",
        bg: "bg-cyan-500",
        style: "bg-[#082f49] border-cyan-500/40 shadow-[0_0_80px_rgba(6,182,212,0.25)] text-cyan-100 ring-1 ring-cyan-500/20",
        introDelay: 2500,
        bgm: "https://commondatastorage.googleapis.com/codeskulptor-demos/pyman_assets/intromusic.ogg",
    },
    reaper: {
        name: "死神 (THE REAPER)",
        desc: "3 HP • 死亡凝视 • 错误即死",
        icon: Skull,
        color: "text-rose-500",
        bg: "bg-rose-600",
        style: "bg-black border-red-900/60 shadow-[0_0_120px_rgba(225,29,72,0.6)] text-rose-50 ring-2 ring-red-900",
        introDelay: 3000,
        bgm: "https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/lose.ogg",
    },
    roulette: {
        name: "幸运转轮 (LUCKY CHAMBER)",
        desc: "1/6 概率死亡 • +20 Elo 奖池",
        icon: Dices,
        color: "text-emerald-400",
        bg: "bg-emerald-600",
        style: "bg-[#022c22] border-emerald-500/50 shadow-[0_0_80px_rgba(16,185,129,0.3)] text-emerald-100 ring-1 ring-emerald-500/30",
        introDelay: 1000,
        bgm: "/gamble_intro.mp3",
    },
    roulette_execution: {
        name: "死刑执行 (EXECUTION)",
        desc: "实弹命中 • 炼狱难度 • 胜者翻倍",
        icon: Skull,
        color: "text-red-600",
        bg: "bg-red-700",
        style: "bg-black border-red-600 shadow-[0_0_150px_rgba(220,38,38,0.9)] text-red-500 ring-4 ring-red-600 animate-pulse",
        introDelay: 500,
        bgm: "https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/lose.ogg",
    },
} as const;

export function useDrillSurfaceLoader({
    bossType,
    hasDrillData,
    isEloLoaded,
    isGeneratingDrill,
}: {
    bossType: keyof typeof DRILL_BOSS_CONFIG | string;
    hasDrillData: boolean;
    isEloLoaded: boolean;
    isGeneratingDrill: boolean;
}) {
    const currentBoss = DRILL_BOSS_CONFIG[bossType as keyof typeof DRILL_BOSS_CONFIG] || DRILL_BOSS_CONFIG.blind;
    const drillSurfacePhase = getDrillSurfacePhase({
        isProfileLoaded: isEloLoaded,
        isGeneratingDrill,
        hasDrillData,
    });

    const [loaderTick, setLoaderTick] = useState(0);
    const [isMinLoaderTimeMet, setIsMinLoaderTimeMet] = useState(false);
    const minLoaderTimerRef = useRef<number | null>(null);
    const loaderActive = drillSurfacePhase === "bootstrap" || drillSurfacePhase === "loading";
    const shouldDriveLoaderClock = loaderActive || !isMinLoaderTimeMet;
    const finalDrillSurfacePhase = drillSurfacePhase === "ready" && isMinLoaderTimeMet ? "ready" : "loading";

    useEffect(() => {
        if (drillSurfacePhase !== "ready") return;

        try {
            const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();

            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(0.3, ctx.currentTime);
            masterGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            masterGain.connect(ctx.destination);

            const osc1 = ctx.createOscillator();
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(1400, ctx.currentTime);
            osc1.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
            osc1.connect(masterGain);

            const osc2 = ctx.createOscillator();
            osc2.type = "triangle";
            osc2.frequency.setValueAtTime(400, ctx.currentTime);
            osc2.connect(masterGain);

            osc1.start();
            osc2.start();
            osc1.stop(ctx.currentTime + 0.4);
            osc2.stop(ctx.currentTime + 0.4);
        } catch (err) {
            console.warn("WebAudio suppressed:", err);
        }
    }, [drillSurfacePhase]);

    useEffect(() => {
        if (!loaderActive) return;

        const frameId = window.requestAnimationFrame(() => {
            setIsMinLoaderTimeMet(false);
        });
        if (minLoaderTimerRef.current) {
            window.clearTimeout(minLoaderTimerRef.current);
        }
        minLoaderTimerRef.current = window.setTimeout(() => {
            setIsMinLoaderTimeMet(true);
            minLoaderTimerRef.current = null;
        }, 1800);

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [loaderActive]);

    useEffect(() => {
        return () => {
            if (minLoaderTimerRef.current) {
                window.clearTimeout(minLoaderTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!shouldDriveLoaderClock) return;
        const intervalId = window.setInterval(() => {
            setLoaderTick((prev) => prev + 1);
        }, 760);

        return () => window.clearInterval(intervalId);
    }, [shouldDriveLoaderClock]);

    return {
        currentBoss,
        drillSurfacePhase,
        finalDrillSurfacePhase,
        loaderTick,
    };
}
