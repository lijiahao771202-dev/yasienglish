"use client";

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useDailyPlans } from '@/hooks/useDailyPlans';
import { Sparkles, Trophy, ChevronRight, X, Loader2 } from 'lucide-react';
import type { DailyPlanItem } from '@/lib/db';

const playIncrementSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
    } catch(e) {}
};

const playCompletionSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        // Base synth chord
        [440, 554.37, 659.25].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.05);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.05 + 0.05);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.05 + 0.6);
            osc.start(ctx.currentTime + i * 0.05);
            osc.stop(ctx.currentTime + i * 0.05 + 0.6);
        });
        
        // High sparkle
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.3);
        osc2.frequency.exponentialRampToValueAtTime(2093, ctx.currentTime + 0.4);
        gain2.gain.setValueAtTime(0, ctx.currentTime + 0.3);
        gain2.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.35);
        gain2.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
        osc2.start(ctx.currentTime + 0.3);
        osc2.stop(ctx.currentTime + 0.8);
    } catch(e) {}
};

export function GlobalSmartTracker() {
    const pathname = usePathname() || '/';
    const { planRecord } = useDailyPlans(new Date());

    const smartItems = useMemo(() => {
        if (!planRecord) return [];
        return planRecord.items.filter((item: DailyPlanItem) => item.type && item.type !== 'custom' && item.target && item.target > 0);
    }, [planRecord]);

    // 2. Track previous states to detect increments/completions
    const prevItemsRef = useRef<Record<string, number>>({});
    const [celebrateGoalId, setCelebrateGoalId] = useState<string | null>(null);
    const [incrementGoalId, setIncrementGoalId] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isFullyDismissed, setIsFullyDismissed] = useState(false);
    const [revealChunks, setRevealChunks] = useState(false);
    const [isHeroOverlay, setIsHeroOverlay] = useState(false);
    const [showAbsolute, setShowAbsolute] = useState(false);

    useEffect(() => {
        if (pathname === '/' || pathname === '/home') return;

        setRevealChunks(false);
        setIsHeroOverlay(true);
        setIsExpanded(true); // Ensure items are visible during hero animation

        const t1 = setTimeout(() => {
            setRevealChunks(true);
        }, 1800);

        const t2 = setTimeout(() => {
            setIsHeroOverlay(false);
        }, 4000);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, [pathname]);

    useEffect(() => {
        if (!smartItems.length) return;

        let hasNewCompletion = false;
        let hasNewIncrement = false;

        smartItems.forEach(item => {
            const prev = prevItemsRef.current[item.id] || 0;
            const current = item.current || 0;

            if (current > prev) {
                let isChunkCompletion = false;
                if (item.chunk_size && current % item.chunk_size === 0 && current < (item.target || 0)) {
                    isChunkCompletion = true;
                }

                // It increased!
                if (current >= (item.target || 0) || isChunkCompletion) {
                    hasNewCompletion = true;
                    setCelebrateGoalId(item.id);
                    setIsExpanded(true); // Expand on completion
                    setIsFullyDismissed(false); // Restore if it was dismissed
                    playCompletionSound(); // <-- Trigger Completion SFX
                } else {
                    hasNewIncrement = true;
                    setIncrementGoalId(item.id);
                    setIsExpanded(true); // Expand on increment
                    setIsFullyDismissed(false); // Restore if it was dismissed
                    playIncrementSound(); // <-- Trigger Increment SFX
                }
            }
            prevItemsRef.current[item.id] = current;
        });

        if (hasNewCompletion) {
            setTimeout(() => setCelebrateGoalId(null), 5000);
        } else if (hasNewIncrement) {
             setTimeout(() => setIncrementGoalId(null), 2000);
        }

    }, [smartItems]); // Removed isExpanded from deps to avoid resetting timer manually

    // Exclude if dismissed or no items
    if (isFullyDismissed || smartItems.length === 0) return null;

    // Do not show the floating tracker on the home page (DailyPlanBento takes care of it)
    if (pathname === '/' || pathname === '/home') return null;

    // Filter to only show uncompleted items or recently completed ones, AND match the current route!
    const activeItems = smartItems.filter(item => {
        if (item.id === celebrateGoalId) return true;
        if ((item.current || 0) >= (item.target || 1) || item.completed) return false;

        // Contextual route filtering to prevent distraction
        if (pathname === '/' || pathname === '/home') return true;
        
        // Only show relevant tasks on specific pages
        if (pathname.startsWith('/battle') && item.type !== 'rebuild') return false;
        if (pathname.startsWith('/listening-cabin') && item.type !== 'listening') return false;
        if ((pathname.startsWith('/read') || pathname.startsWith('/cat')) && item.type !== 'reading' && item.type !== 'cat') return false;
        if (pathname.startsWith('/vocab') && item.type !== 'vocab') return false;

        return true;
    });

    // If everything is done and nothing is celebrating, we can hide
    if (activeItems.length === 0 && !celebrateGoalId && !isHeroOverlay) return null;

    // Drag constraints: just let it float freely with some bouncy bounds
    return (
        <>
            <AnimatePresence>
                {isHeroOverlay && (
                    <motion.div 
                        initial={{ opacity: 0, backdropFilter: 'blur(0px)' }} 
                        animate={{ opacity: 1, backdropFilter: 'blur(12px)' }} 
                        exit={{ opacity: 0, backdropFilter: 'blur(0px)' }} 
                        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                        className="fixed inset-0 bg-black/60 z-[9998] pointer-events-auto"
                    />
                )}
            </AnimatePresence>

            <motion.div 
                layout="position"
                transition={{ layout: { type: "spring", stiffness: 120, damping: 25, duration: 1.5 } }}
                className={isHeroOverlay
                    ? "fixed inset-0 z-[9999] pointer-events-auto flex flex-col items-center justify-center gap-8"
                    : "fixed bottom-6 right-6 z-[999] pointer-events-auto flex flex-col items-end gap-3"
                }
                drag={!isHeroOverlay}
                dragMomentum={false}
                whileDrag={!isHeroOverlay ? { scale: 1.05, cursor: 'grabbing' } : undefined}
            >
                <AnimatePresence mode="popLayout">
                    {isHeroOverlay && (
                        <motion.div
                            layout
                            initial={{ opacity: 0, y: -30, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                            className="flex flex-col items-center gap-3 text-white mb-2"
                        >
                            <motion.div animate={!revealChunks ? { rotate: 360 } : {}} transition={{ repeat: !revealChunks ? Infinity : 0, duration: 2, ease: "linear" }}>
                                <Sparkles className={`w-10 h-10 ${!revealChunks ? 'text-theme-text-muted opacity-80' : 'text-theme-active-bg drop-shadow-[0_0_15px_var(--theme-active-bg)]'} transition-colors duration-1000`} />
                            </motion.div>
                            <h2 className="font-black text-2xl tracking-[0.2em] drop-shadow-2xl">
                                {!revealChunks ? "AI 分析任务负荷..." : "已为您切换至[切片模式]"}
                            </h2>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Celebration Confetti Overlay (local to widget but overflows) */}
            <AnimatePresence>
                {celebrateGoalId && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 2 }}
                        exit={{ opacity: 0, scale: 3 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                        <div className="w-full h-full rounded-full bg-yellow-400/20 blur-xl" />
                        <Sparkles className="w-16 h-16 text-yellow-400 absolute animate-spin-slow" />
                        <Trophy className="w-12 h-12 text-yellow-500 drop-shadow-2xl absolute" />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="popLayout">
                {!isExpanded ? (
                    <motion.div
                        key="collapsed"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        onClick={() => {
                            setIsExpanded(true);
                        }}
                        className="w-14 h-14 bg-[color:var(--theme-active-bg)] text-[color:var(--theme-active-text)] rounded-full flex items-center justify-center border-4 border-[color:var(--theme-border)] shadow-[0_6px_0_0_var(--theme-shadow)] cursor-pointer active:translate-y-1 active:shadow-none transition-all relative z-10"
                    >
                        {celebrateGoalId ? <Trophy className="w-6 h-6 animate-bounce" /> : <Loader2 className="w-6 h-6 animate-spin-slow" />}
                    </motion.div>
                ) : (
                    activeItems.map(item => {
                        let absoluteTarget = item.target || 1;
                        let absoluteCurrent = item.current || 0;
                        let isChunked = false;
                        
                        let relativeCurrent = absoluteCurrent;
                        let relativeTarget = absoluteTarget;
                        let remaining = absoluteTarget - absoluteCurrent;

                        const isCeleb = item.id === celebrateGoalId;
                        const isInc = item.id === incrementGoalId;

                        if (revealChunks && item.chunk_size && absoluteTarget > item.chunk_size) {
                            // If celebrating a chunk completion, freeze the UI at the chunk limit so the bar fills 100%. Otherwise roll over.
                            const refValue = isCeleb ? Math.max(0, absoluteCurrent - 1) : absoluteCurrent;
                            const activeChunkIndex = Math.floor(refValue / item.chunk_size);
                            
                            const chunkBase = activeChunkIndex * item.chunk_size;
                            relativeCurrent = absoluteCurrent - chunkBase;
                            
                            const currentChunkUpperLimit = Math.min(absoluteTarget, (activeChunkIndex + 1) * item.chunk_size);
                            relativeTarget = currentChunkUpperLimit - chunkBase;
                            remaining = relativeTarget - relativeCurrent;
                            
                            isChunked = true;
                        }

                        const displayCurrentProg = showAbsolute ? absoluteCurrent : relativeCurrent;
                        const displayTargetProg = showAbsolute ? absoluteTarget : relativeTarget;
                        const prog = Math.min(100, Math.round((displayCurrentProg / displayTargetProg) * 100));

                        return (
                            <motion.div 
                                layout
                                key={item.id}
                                onClick={() => isExpanded && setShowAbsolute(prev => !prev)}
                                initial={{ opacity: 0, scale: 0.8, x: 50 }}
                                animate={{ 
                                    opacity: 1, 
                                    scale: isInc ? [1, 1.05, 0.95, 1.02, 1] : 1, 
                                    x: 0,
                                    rotate: isInc ? [0, -2, 2, -1, 0] : 0,
                                }}
                                transition={{ 
                                    default: { type: "spring", stiffness: 300, damping: 20 },
                                    scale: { type: "tween", duration: 0.5 },
                                    rotate: { type: "tween", duration: 0.5 }
                                }}
                                exit={{ opacity: 0, scale: 0.8, x: 50 }}
                                className={`flex items-center rounded-[3rem] border-[5px] cursor-grab relative overflow-hidden transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                    isHeroOverlay ? 'w-[400px] p-4 gap-5 shadow-2xl scale-105' : 'w-[280px] p-2 pr-4 gap-3'
                                } ${
                                    isCeleb ? 'bg-yellow-200 border-yellow-500 shadow-[0_6px_0_0_rgba(234,179,8,1)]' 
                                    : isInc ? 'bg-theme-active-bg border-theme-border shadow-[0_6px_0_0_var(--theme-shadow)] text-white'
                                    : 'bg-theme-base-bg border-theme-border shadow-[0_6px_0_0_var(--theme-shadow)]'
                                }`}
                            >
                                <AnimatePresence>
                                    {isInc && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 0, scale: 0, rotate: -20 }}
                                            animate={{ opacity: 1, y: -45, scale: [1.8, 1.2, 1.3, 1.2], rotate: [20, -10, 5, 0] }}
                                            exit={{ opacity: 0, y: -60, scale: 0.8 }}
                                            transition={{ duration: 0.6, ease: "easeOut" }}
                                            className="absolute -top-10 -right-2 text-emerald-500 font-black text-4xl drop-shadow-[0_0_15px_rgba(16,185,129,0.5)] z-50 pointer-events-none"
                                            style={{ WebkitTextStroke: '2px white' }}
                                        >
                                            +1
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                {/* Left icon bubble */}
                                <div className={`shrink-0 rounded-full flex items-center justify-center border-[3px] z-10 transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                    isHeroOverlay ? 'w-16 h-16' : 'w-12 h-12'
                                } ${
                                    isCeleb ? 'bg-yellow-400 border-yellow-500 text-yellow-900'
                                    : isInc ? 'bg-white border-white/30 text-theme-active-bg'
                                    : 'bg-theme-active-bg border-theme-border text-theme-active-text'
                                }`}>
                                    {isCeleb ? <Trophy className="w-6 h-6 animate-bounce" /> : <Loader2 className="w-6 h-6 animate-spin-slow" />}
                                </div>

                                {/* Center content */}
                                <div className="flex-1 flex flex-col justify-center min-w-0 z-10">
                                    <div className="flex justify-between items-end mb-1">
                                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                            <span className={`font-black truncate transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                                isHeroOverlay ? 'text-base' : 'text-xs'
                                            } ${isInc ? 'text-white' : 'text-theme-text'}`}>
                                                {item.text}
                                            </span>
                                            <AnimatePresence>
                                                {isChunked && (
                                                    <motion.span
                                                        initial={{ opacity: 0, scale: 0, x: -20 }}
                                                        animate={{ opacity: 1, scale: 1, x: 0 }}
                                                        transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
                                                        className={`px-1.5 py-0.5 rounded border overflow-hidden font-black uppercase tracking-wider shrink-0 shadow-sm transition-all duration-1000 ${
                                                            isHeroOverlay ? 'text-[10px]' : 'text-[8px]'
                                                        } ${
                                                            isInc || isCeleb ? 'bg-white/20 text-white border-white/40' : 'bg-theme-active-bg/15 text-[color:var(--theme-active-bg)] border-[color:var(--theme-active-bg)]/30'
                                                        }`}
                                                    >
                                                        智能切片
                                                    </motion.span>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                        <span className={`font-black tracking-wider transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                            isHeroOverlay ? 'text-sm' : 'text-[10px] min-w-[32px] text-right'
                                        } ${isInc ? 'text-white' : 'text-theme-text-light'}`}>
                                            {showAbsolute 
                                                ? `${absoluteCurrent}/${absoluteTarget}` 
                                                : (isChunked ? `剩 ${Math.max(0, remaining)}` : `${absoluteCurrent}/${absoluteTarget}`)}
                                        </span>
                                    </div>
                                    <div className={`rounded-full overflow-hidden border-[2px] relative transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                        isHeroOverlay ? 'h-3.5' : 'h-2.5'
                                    } ${isInc || isCeleb ? 'border-white/30 bg-black/10' : 'border-theme-border bg-theme-card-bg'}`}>
                                        <motion.div 
                                            className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${isCeleb ? 'bg-yellow-500' : isInc ? 'bg-white' : 'bg-theme-text'}`}
                                            style={{ width: `${prog}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Right close button */}
                                {!isHeroOverlay && (
                                    <button 
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            setIsExpanded(false); 
                                        }}
                                        className={`p-1.5 rounded-full hover:scale-110 active:scale-95 transition-transform z-10 ${isInc || isCeleb ? 'text-black/50 hover:bg-black/10' : 'text-theme-text-light hover:bg-theme-card-bg hover:text-theme-text'}`}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                                
                                {/* Background flare for event */}
                                {isInc && !isCeleb && (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1.5 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white/30 to-transparent pointer-events-none"
                                    />
                                )}
                            </motion.div>
                        );
                    })
                )}
            </AnimatePresence>
        </motion.div>
        </>
    );
}
