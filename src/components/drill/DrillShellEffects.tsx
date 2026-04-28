"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flame } from "lucide-react";

const STREAK_PARTICLE_POSITIONS = [12, 26, 39, 54, 68, 82, 90, 18, 47, 76];

const CRIMSON_EMBER_CONFIG = [
    { left: "12%", duration: 3.1, delay: 0.1 },
    { left: "24%", duration: 4.2, delay: 0.8 },
    { left: "35%", duration: 3.8, delay: 1.6 },
    { left: "48%", duration: 4.7, delay: 0.4 },
    { left: "59%", duration: 3.4, delay: 1.9 },
    { left: "71%", duration: 4.5, delay: 0.6 },
    { left: "83%", duration: 3.6, delay: 1.2 },
    { left: "91%", duration: 4.1, delay: 2.1 },
] as const;

const FEVER_COLORS = ["#f97316", "#fb923c", "#fbbf24", "#f59e0b"] as const;

const FEVER_EMBER_CONFIG = [
    { left: "9%", driftX: 18, driftXFar: 28, duration: 3.4, delay: 0.2 },
    { left: "16%", driftX: -14, driftXFar: -24, duration: 4.1, delay: 1.1 },
    { left: "24%", driftX: 22, driftXFar: 32, duration: 3.7, delay: 0.5 },
    { left: "33%", driftX: -18, driftXFar: -30, duration: 4.4, delay: 1.8 },
    { left: "42%", driftX: 12, driftXFar: 22, duration: 3.9, delay: 0.9 },
    { left: "51%", driftX: -10, driftXFar: -18, duration: 4.6, delay: 2.3 },
    { left: "60%", driftX: 16, driftXFar: 26, duration: 3.3, delay: 0.7 },
    { left: "69%", driftX: -20, driftXFar: -30, duration: 4.2, delay: 1.5 },
    { left: "77%", driftX: 14, driftXFar: 24, duration: 3.8, delay: 2.0 },
    { left: "84%", driftX: -12, driftXFar: -20, duration: 4.5, delay: 0.3 },
    { left: "90%", driftX: 18, driftXFar: 30, duration: 3.6, delay: 1.4 },
    { left: "95%", driftX: -16, driftXFar: -26, duration: 4.3, delay: 2.5 },
] as const;

const FEVER_SPARK_CONFIG = [
    { left: "14%", top: "26%", duration: 1.15, delay: 0.1 },
    { left: "28%", top: "42%", duration: 1.7, delay: 0.6 },
    { left: "41%", top: "58%", duration: 1.35, delay: 1.0 },
    { left: "57%", top: "31%", duration: 1.55, delay: 0.4 },
    { left: "72%", top: "49%", duration: 1.25, delay: 1.3 },
    { left: "86%", top: "64%", duration: 1.8, delay: 0.9 },
] as const;

export interface DrillShellEffectsVisual {
    accent: string;
    auraGradient: string;
    beamGradient: string;
    beamShadow: string;
    surfaceBorder: string;
    badgeGlow: string;
    progressGradient: string;
    particleGradient: string;
}

export interface DrillShellEffectsProps {
    activeParticleCount: number;
    canShowStreakParticles: boolean;
    canUseStreakAura: boolean;
    currentStreak: number;
    fuseTime: number;
    prefersReducedMotion: boolean;
    streakTransition: "surge" | "cooldown" | null;
    streakVisual: DrillShellEffectsVisual;
    theme: "default" | "fever" | "boss" | "crimson";
    whisperRecording: boolean;
}

export function DrillShellEffects({
    activeParticleCount,
    canShowStreakParticles,
    canUseStreakAura,
    currentStreak,
    fuseTime,
    prefersReducedMotion,
    streakTransition,
    streakVisual,
    theme,
    whisperRecording,
}: DrillShellEffectsProps) {
    return (
        <>
            {canUseStreakAura && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                    <motion.div
                        className="absolute inset-0"
                        style={{ backgroundImage: streakVisual.auraGradient }}
                        initial={false}
                        animate={
                            streakTransition === "cooldown"
                                ? { opacity: 0.18, scale: 0.98 }
                                : streakTransition === "surge"
                                    ? { opacity: [0.32, 0.7, 0.42], scale: [0.98, 1.02, 1] }
                                    : { opacity: theme === "fever" ? 0.32 : 0.42, scale: 1 }
                        }
                        transition={{ duration: prefersReducedMotion ? 0.2 : streakTransition ? 0.55 : 1.2, ease: "easeOut" }}
                    />
                    <motion.div
                        className="absolute inset-x-8 top-0 h-[2px]"
                        style={{ backgroundImage: streakVisual.beamGradient, boxShadow: streakVisual.beamShadow }}
                        initial={false}
                        animate={
                            streakTransition === "cooldown"
                                ? { opacity: 0.2, scaleX: 0.82 }
                                : streakTransition === "surge"
                                    ? { opacity: [0.55, 1, 0.8], scaleX: [0.72, 1.05, 1] }
                                    : { opacity: 0.78, scaleX: 1 }
                        }
                        transition={{ duration: prefersReducedMotion ? 0.2 : 0.48, ease: "easeOut" }}
                    />
                    <motion.div
                        className="absolute inset-[1px] rounded-[2.45rem]"
                        style={{
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.72), inset 0 0 0 1px ${streakVisual.surfaceBorder}`,
                        }}
                        initial={false}
                        animate={streakTransition === "cooldown" ? { opacity: 0.22 } : { opacity: 0.7 }}
                    />

                    {canShowStreakParticles && (
                        <div className="absolute inset-0 hidden md:block">
                            {STREAK_PARTICLE_POSITIONS.slice(0, activeParticleCount).map((left, index) => (
                                <motion.div
                                    key={`streak-particle-${left}-${index}`}
                                    className="absolute top-full h-2 w-2 rounded-full blur-[1px]"
                                    style={{
                                        left: `${left}%`,
                                        backgroundImage: streakVisual.particleGradient,
                                        boxShadow: `0 0 18px ${streakVisual.badgeGlow}`,
                                    }}
                                    initial={{ opacity: 0, y: 18, scale: 0.6 }}
                                    animate={{
                                        y: [0, -140 - (index % 4) * 16],
                                        opacity: [0, 0.95, 0],
                                        scale: [0.4, 1.08, 0.6],
                                        x: [0, index % 2 === 0 ? 12 : -10, 0],
                                    }}
                                    transition={{
                                        duration: 2.4 + (index % 3) * 0.35,
                                        repeat: Infinity,
                                        delay: index * 0.18,
                                        ease: "easeOut",
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {theme === "crimson" && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(50,0,0,0.4)_100%)] animate-pulse" />
                    {CRIMSON_EMBER_CONFIG.map((ember, index) => (
                        <motion.div
                            key={`crimson-ember-${ember.left}-${index}`}
                            className="absolute w-1 h-1 bg-red-500 rounded-full blur-[1px]"
                            initial={{ top: "100%", left: ember.left, opacity: 0, scale: 0 }}
                            animate={{ top: "-10%", opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                            transition={{ duration: ember.duration, repeat: Infinity, delay: ember.delay, ease: "easeOut" }}
                        />
                    ))}
                </div>
            )}

            {theme === "fever" && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                    {FEVER_EMBER_CONFIG.map((ember, index) => (
                        <motion.div
                            key={`ember-${ember.left}-${index}`}
                            className="absolute w-1.5 h-1.5 rounded-full"
                            style={{
                                left: ember.left,
                                background: `radial-gradient(circle, ${FEVER_COLORS[index % FEVER_COLORS.length]}, transparent)`,
                            }}
                            initial={{ bottom: -20, opacity: 0, scale: 0 }}
                            animate={{
                                bottom: "110%",
                                opacity: [0, 0.8, 0.6, 0],
                                scale: [0, 1.2, 0.8, 0],
                                x: [0, ember.driftX, ember.driftXFar],
                            }}
                            transition={{
                                duration: ember.duration,
                                repeat: Infinity,
                                delay: ember.delay,
                                ease: "easeOut",
                            }}
                        />
                    ))}
                    {FEVER_SPARK_CONFIG.map((spark, index) => (
                        <motion.div
                            key={`spark-${spark.left}-${index}`}
                            className="absolute w-0.5 h-0.5 bg-yellow-400 rounded-full shadow-[0_0_6px_rgba(250,204,21,0.8)]"
                            style={{ left: spark.left, top: spark.top }}
                            animate={{
                                opacity: [0, 1, 0],
                                scale: [0, 1.5, 0],
                            }}
                            transition={{
                                duration: spark.duration,
                                repeat: Infinity,
                                delay: spark.delay,
                            }}
                        />
                    ))}
                </div>
            )}

            {theme === "fever" && currentStreak >= 2 && (
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-stone-900/50 z-50 overflow-hidden">
                    <motion.div
                        className="h-full relative"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(currentStreak * 10, 100)}%` }}
                        transition={{ type: "spring" as const, stiffness: 100, damping: 15 }}
                        style={{ backgroundImage: streakVisual.progressGradient }}
                    >
                        <div className="absolute inset-0 blur-sm opacity-80" style={{ backgroundImage: streakVisual.progressGradient }} />
                        <motion.div
                            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full blur-[2px]"
                            animate={{ opacity: [0.6, 1, 0.6], scale: [0.8, 1.2, 0.8] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                        />
                    </motion.div>
                    <motion.div
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        style={{ color: streakVisual.accent }}
                    >
                        <Flame className="w-3 h-3 fill-current" />
                        <span className="font-mono">{currentStreak}</span>
                    </motion.div>
                </div>
            )}

            {theme === "boss" && (
                <div className="absolute top-0 left-0 right-0 h-2 bg-stone-900 z-50">
                    <motion.div
                        className="h-full bg-gradient-to-r from-amber-600 via-orange-500 to-yellow-400 shadow-[0_0_20px_rgba(245,158,11,0.8)] relative"
                        style={{ width: `${fuseTime}%` }}
                    >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-white rounded-full blur-[2px] animate-pulse" />
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 bg-orange-500/50 rounded-full blur-xl animate-pulse" />
                    </motion.div>
                </div>
            )}

            <AnimatePresence>
                {whisperRecording && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-full shadow-lg"
                    >
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        <span className="text-sm font-bold">Recording...</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
