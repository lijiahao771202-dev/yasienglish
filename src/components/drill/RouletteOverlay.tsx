"use strict";
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skull, Crosshair, AlertTriangle, ArrowRight, RotateCw, Zap, TrendingUp } from 'lucide-react';

interface RouletteOverlayProps {
    onComplete: (result: 'safe' | 'dead', bulletCount: number) => void;
    onCancel: () => void;
}

type RouletteStage = 'intro' | 'loading' | 'spinning' | 'slowmo' | 'aiming' | 'fired';

// GREED SCALING TABLE
const GREED_TABLE = [
    { bullets: 0, surviveBonus: 0, jackpotMultiplier: 0 },
    { bullets: 1, surviveBonus: 10, jackpotMultiplier: 2 },
    { bullets: 2, surviveBonus: 25, jackpotMultiplier: 3 },
    { bullets: 3, surviveBonus: 50, jackpotMultiplier: 5 },
    { bullets: 4, surviveBonus: 100, jackpotMultiplier: 8 },
    { bullets: 5, surviveBonus: 200, jackpotMultiplier: 15 },
    { bullets: 6, surviveBonus: 0, jackpotMultiplier: 50 }, // Suicide Run
];

export function RouletteOverlay({ onComplete, onCancel }: RouletteOverlayProps) {
    const [stage, setStage] = useState<RouletteStage>('intro');

    // VISUAL STATE
    const [rotation, setRotation] = useState(0);

    // LOGIC STATE
    const [chambers, setChambers] = useState<boolean[]>([false, false, false, false, false, false]);
    const [activeChamberIndex, setActiveChamberIndex] = useState(0);

    const [result, setResult] = useState<'safe' | 'dead' | null>(null);

    // Heartbeat Audio Ref (for Atmosphere)
    const heartbeatAudio = useRef<HTMLAudioElement | null>(null);
    const loadAudio = useRef<HTMLAudioElement | null>(null);
    const spinAudio = useRef<HTMLAudioElement | null>(null);
    const clickAudio = useRef<HTMLAudioElement | null>(null);
    const bangAudio = useRef<HTMLAudioElement | null>(null);
    const slowmoAudio = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        heartbeatAudio.current = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-heartbeat-sound-effects-557.mp3');
        heartbeatAudio.current.loop = true;
        heartbeatAudio.current.volume = 0;

        loadAudio.current = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-gun-chamber-bullet-movement-1597.mp3');
        spinAudio.current = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-revolver-chamber-spin-ratchet-1594.mp3');
        clickAudio.current = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-trigger-click-gun-1634.mp3');
        bangAudio.current = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-explosion-with-rocks-debris-1678.mp3');
        slowmoAudio.current = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-cinematic-suspense-hit-1159.mp3');

        return () => {
            heartbeatAudio.current?.pause();
        };
    }, []);

    // ATMOSPHERE MANAGER
    const bulletCount = chambers.filter(Boolean).length;
    const riskLevel = bulletCount / 6; // 0 to 1
    const greedInfo = GREED_TABLE[bulletCount] || GREED_TABLE[0];

    useEffect(() => {
        if (heartbeatAudio.current) {
            // Heartbeat volume scales with risk
            heartbeatAudio.current.volume = Math.min(0.6, riskLevel * 0.8);
            if (stage === 'loading' && bulletCount > 0) {
                heartbeatAudio.current.play().catch(() => { });
            }
            if (stage === 'fired') {
                heartbeatAudio.current.pause();
            }
        }
    }, [bulletCount, stage, riskLevel]);

    const playSound = (type: 'load' | 'spin' | 'click' | 'bang' | 'slowmo') => {
        const audio = type === 'load' ? loadAudio.current :
            type === 'spin' ? spinAudio.current :
                type === 'click' ? clickAudio.current :
                    type === 'slowmo' ? slowmoAudio.current :
                        bangAudio.current;
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => { });
        }
    }

    // --- Actions ---

    const startLoading = () => {
        setStage('loading');
    };

    const toggleBullet = (index: number) => {
        if (stage !== 'loading') return;
        playSound('load');
        setChambers(prev => {
            const next = [...prev];
            next[index] = !next[index];
            return next;
        });
    };

    const handleSpin = () => {
        if (!chambers.some(b => b)) return;

        setStage('spinning');
        playSound('spin');

        const targetIndex = Math.floor(Math.random() * 6);
        setActiveChamberIndex(targetIndex);

        const baseRotation = ((6 - targetIndex) % 6) * 60;
        const extraSpins = 360 * (4 + Math.floor(Math.random() * 2)); // 4-5 Spins (faster for drama)
        const totalRotation = extraSpins + baseRotation;

        setRotation(totalRotation);

        // After main spin, enter SLOW-MO for final approach
        setTimeout(() => {
            setStage('slowmo');
            playSound('slowmo');
        }, 2000);

        // After slow-mo, enter aiming
        setTimeout(() => {
            setStage('aiming');
        }, 3500);
    };

    const handlePullTrigger = () => {
        if (stage !== 'aiming') return;

        const isDead = chambers[activeChamberIndex];

        setResult(isDead ? 'dead' : 'safe');
        setStage('fired');

        if (isDead) {
            playSound('bang');
        } else {
            playSound('click');
        }

        setTimeout(() => {
            onComplete(isDead ? 'dead' : 'safe', bulletCount);
        }, isDead ? 2000 : 1500);
    };

    // --- Renderers ---

    const deathChance = Math.round((bulletCount / 6) * 100);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-xl font-sans select-none"
        >
            {/* Background Atmosphere - Vignette scales with Risk */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-red-900/10 to-transparent" />
                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black to-transparent" />
                <motion.div
                    animate={{ opacity: 0.1 + riskLevel * 0.4 }}
                    className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(150,0,0,0.5)_100%)]"
                />
                {/* Heartbeat Pulse - More intense with more bullets */}
                <motion.div
                    animate={{ opacity: [0.05, 0.1 + riskLevel * 0.15, 0.05] }}
                    transition={{ duration: 0.8 - riskLevel * 0.3, repeat: Infinity }}
                    className="absolute inset-0 bg-red-900/30"
                />
            </div>

            {/* STAGE: INTRO */}
            <AnimatePresence mode="wait">
                {stage === 'intro' && (
                    <motion.div
                        key="intro"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
                        className="relative z-10 flex flex-col items-center gap-8 max-w-lg text-center p-8"
                    >
                        <div className="flex flex-col items-center gap-4">
                            <Skull className="w-20 h-20 text-red-600 animate-pulse" />
                            <h1 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">
                                Russian <span className="text-red-600">Roulette</span>
                            </h1>
                            <div className="h-1 w-24 bg-red-800 rounded-full" />

                            {/* Greed Scaling Info */}
                            <div className="w-full bg-stone-900/50 border border-stone-800 rounded-xl p-4 text-left mt-4">
                                <div className="text-xs font-mono text-stone-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <TrendingUp className="w-3 h-3 text-amber-500" /> Greed Scaling
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                                    <div className="text-stone-500">Bullets</div>
                                    <div className="text-emerald-500">Survive</div>
                                    <div className="text-amber-500">Jackpot</div>
                                    {GREED_TABLE.slice(1).map(row => (
                                        <React.Fragment key={row.bullets}>
                                            <div className="text-white">{row.bullets}</div>
                                            <div className="text-emerald-400">+{row.surviveBonus}</div>
                                            <div className="text-amber-400">x{row.jackpotMultiplier}</div>
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={startLoading}
                            className="w-full py-4 bg-red-700 hover:bg-red-600 text-white font-black tracking-widest uppercase rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all active:scale-95 group max-w-xs"
                        >
                            Start Loading <ArrowRight className="inline ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </motion.div>
                )}

                {/* STAGE: INTERACTIVE */}
                {stage !== 'intro' && (
                    <motion.div
                        key="game"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="relative z-10 flex flex-col items-center justify-center gap-10"
                    >
                        {/* Header Status */}
                        <div className="text-center space-y-2">
                            <div className={cn(
                                "text-xs font-mono tracking-[0.2em] uppercase font-bold transition-colors duration-300",
                                stage === 'fired' && result === 'dead' ? "text-red-500" :
                                    stage === 'fired' && result === 'safe' ? "text-emerald-500" :
                                        stage === 'slowmo' ? "text-amber-400" :
                                            "text-stone-500"
                            )}>
                                {stage === 'loading' ? 'CLICK SLOTS TO LOAD' :
                                    stage === 'spinning' ? 'SPINNING...' :
                                        stage === 'slowmo' ? '...SLOWING DOWN...' :
                                            stage === 'aiming' ? 'CHAMBER LOCKED' :
                                                stage === 'fired' && result === 'dead' ? 'FATAL ERROR' : 'SURVIVAL'}
                            </div>

                            {stage === 'loading' && (
                                <div className="flex flex-col items-center gap-1">
                                    <div className="text-white font-black text-2xl tracking-tighter">
                                        RISK: <span className={cn(
                                            deathChance >= 50 ? "text-red-500" :
                                                deathChance >= 33 ? "text-amber-400" :
                                                    "text-emerald-400"
                                        )}>{deathChance}%</span>
                                    </div>
                                    {bulletCount > 0 && (
                                        <div className="text-xs font-mono text-stone-500">
                                            Survive: <span className="text-emerald-400">+{greedInfo.surviveBonus}</span> |
                                            Jackpot: <span className="text-amber-400">x{greedInfo.jackpotMultiplier}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* CYLINDER VISUAL */}
                        <div className="relative w-80 h-80 flex items-center justify-center">
                            {/* Crosshair Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-10 text-white pointer-events-none">
                                <Crosshair className="w-full h-full p-4" />
                            </div>

                            {/* REVOLVER BODY */}
                            <motion.div
                                className="w-64 h-64 rounded-full bg-[#1a1a1a] shadow-2xl relative border-[12px] border-[#0a0a0a]"
                                animate={{ rotate: rotation }}
                                transition={{
                                    type: "spring",
                                    stiffness: stage === 'slowmo' ? 10 : 20,
                                    damping: stage === 'slowmo' ? 30 : 15,
                                    duration: stage === 'spinning' ? 2 : stage === 'slowmo' ? 1.5 : 0
                                }}
                            >
                                {/* Center Hub */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-[#2a2a2a] border-4 border-[#111] shadow-inner z-20 flex items-center justify-center">
                                    <div className="w-6 h-6 rounded-full bg-[#000]" />
                                </div>

                                {/* Chambers */}
                                {[0, 1, 2, 3, 4, 5].map((index) => {
                                    const deg = index * 60;
                                    return (
                                        <div
                                            key={index}
                                            className={cn(
                                                "absolute w-16 h-16 rounded-full bg-black shadow-[inset_0_4px_8px_rgba(0,0,0,1)] border border-stone-800/50 overflow-hidden cursor-pointer hover:border-stone-500 transition-colors",
                                                stage !== 'loading' && "pointer-events-none"
                                            )}
                                            style={{
                                                top: '50%', left: '50%',
                                                transform: `translate(-50%, -50%) rotate(${deg}deg) translate(0, -84px)`
                                            }}
                                            onClick={() => toggleBullet(index)}
                                        >
                                            {/* BULLET VISUAL */}
                                            <AnimatePresence>
                                                {chambers[index] && (
                                                    <motion.div
                                                        initial={{ scale: 0, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        exit={{ scale: 0, opacity: 0 }}
                                                        className="absolute inset-1 rounded-full bg-[radial-gradient(circle_at_30%_30%,#fbbf24,#b45309)] shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] border border-yellow-900"
                                                    >
                                                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')] opacity-30 mix-blend-overlay" />
                                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-yellow-900/20 blur-sm" />
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </motion.div>

                            {/* Hammer Indicator */}
                            <motion.div
                                className="absolute -top-10 w-8 h-12 bg-gradient-to-b from-stone-700 to-stone-800 rounded-b-xl shadow-xl border-x border-b border-stone-600 z-30 flex items-end justify-center pb-2"
                                animate={{ y: stage === 'spinning' || stage === 'slowmo' ? [0, -2, 0] : stage === 'aiming' ? -4 : 0 }}
                            >
                                <div className="w-1 h-3 bg-red-500/50 rounded-full" />
                            </motion.div>
                        </div>

                        {/* CONTROLS */}
                        <div className="w-80 h-32 flex items-center justify-center">
                            {stage === 'loading' && (
                                <motion.button
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    disabled={bulletCount === 0}
                                    onClick={handleSpin}
                                    className="w-full py-4 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed text-stone-200 font-bold uppercase tracking-widest rounded-xl transition-all border border-stone-600 shadow-xl active:scale-95 flex items-center justify-center gap-2"
                                >
                                    {bulletCount === 0 ? "Load at least 1 bullet" : <><RotateCw className="w-4 h-4" /> Spin Cylinder</>}
                                </motion.button>
                            )}

                            {stage === 'spinning' && (
                                <span className="text-red-500 font-mono text-sm tracking-widest animate-pulse">SPINNING...</span>
                            )}

                            {stage === 'slowmo' && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: [0.5, 1, 0.5] }}
                                    transition={{ duration: 0.5, repeat: Infinity }}
                                    className="text-amber-400 font-mono text-lg tracking-widest uppercase"
                                >
                                    ...Fate Deciding...
                                </motion.span>
                            )}

                            {stage === 'aiming' && (
                                <button
                                    onClick={handlePullTrigger}
                                    className="w-full py-6 bg-gradient-to-b from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-black text-3xl tracking-widest uppercase rounded-xl transition-all shadow-[0_0_50px_rgba(220,38,38,0.6)] active:scale-95 animate-pulse relative overflow-hidden group"
                                >
                                    <span className="relative z-10">PULL TRIGGER</span>
                                </button>
                            )}

                            {stage === 'fired' && result === 'dead' && (
                                <motion.div
                                    initial={{ scale: 2, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="text-center"
                                >
                                    <h2 className="text-6xl font-black text-red-600 uppercase tracking-tighter drop-shadow-lg">BANG</h2>
                                    <p className="text-red-500/50 text-xs uppercase mt-2">Jackpot: x{greedInfo.jackpotMultiplier}</p>
                                </motion.div>
                            )}
                            {stage === 'fired' && result === 'safe' && (
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="text-center"
                                >
                                    <h2 className="text-4xl font-black text-emerald-500 uppercase tracking-tighter">*CLICK*</h2>
                                    <p className="text-emerald-500/50 text-xs uppercase mt-2">Bonus: +{greedInfo.surviveBonus} Elo</p>
                                </motion.div>
                            )}
                        </div>

                    </motion.div>
                )}
            </AnimatePresence>

            {/* Screen Flash on Death */}
            {stage === 'fired' && result === 'dead' && (
                <motion.div
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 1.5 }}
                    className="absolute inset-0 bg-red-600 z-[110] pointer-events-none mix-blend-overlay"
                />
            )}
        </motion.div>
    );
}
