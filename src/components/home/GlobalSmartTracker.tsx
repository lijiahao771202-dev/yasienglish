"use client";

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDailyPlans } from '@/hooks/useDailyPlans';
import { Sparkles, Trophy, ChevronRight, X, Loader2, Blocks } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
    normalizeSmartPlanExamTrack,
    normalizeSmartPlanTaskType,
    type DailyPlanItem,
    type SmartPlanExamTrack,
    type SmartPlanTaskType,
} from '@/lib/db';

type RouteTaskContext = {
    taskType: SmartPlanTaskType;
    examTrack?: SmartPlanExamTrack;
};

function taskMatchesRoute(item: DailyPlanItem, routeTaskContext: RouteTaskContext | null, pathname: string) {
    if (pathname === '/' || pathname === '/home') return true;
    
    if (routeTaskContext) {
        if (item.type !== routeTaskContext.taskType) return false;
        if (routeTaskContext.taskType === 'reading_ai' && routeTaskContext.examTrack) {
            return item.exam_track === routeTaskContext.examTrack;
        }
        if (routeTaskContext.taskType === 'cat' && routeTaskContext.examTrack) {
            return !item.exam_track || item.exam_track === routeTaskContext.examTrack;
        }
        return true;
    }

    // No strict routeTaskContext was provided via searchParams, but we are on specialized pages.
    // We should fallback to allowing ONLY tasks that make sense for this page, or hide them entirely.
    if (pathname.startsWith('/read') || pathname.startsWith('/cat')) {
        return item.type === 'cat' || item.type === 'reading_ai';
    }
    if (pathname.startsWith('/listening-cabin')) {
        return item.type === 'listening_cabin';
    }
    if (pathname.startsWith('/battle')) {
        return item.type === 'rebuild';
    }

    // By default, if we're on some other sub-page, hide tracking rather than pollute it.
    return false;
}

const playIncrementSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const now = ctx.currentTime;
        // G5 note for a pleasant, high-pitched +1 progress tick
        const noteFreq = 783.99; 
        
        // --- 1. Wooden Mallet Strike (Transient Click) ---
        const clickOsc = ctx.createOscillator();
        const clickGain = ctx.createGain();
        const clickFilter = ctx.createBiquadFilter();
        
        clickOsc.type = 'square';
        clickOsc.frequency.setValueAtTime(800, now);
        clickOsc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
        
        clickFilter.type = 'bandpass';
        clickFilter.frequency.value = 1200;
        clickFilter.Q.value = 0.5;
        
        clickGain.gain.setValueAtTime(0, now);
        clickGain.gain.linearRampToValueAtTime(0.5, now + 0.002);
        clickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        
        clickOsc.connect(clickFilter);
        clickFilter.connect(clickGain);
        clickGain.connect(ctx.destination);
        
        // --- 2. Marimba Fundamental (Wooden Resonance Body) ---
        const fundOsc = ctx.createOscillator();
        const fundGain = ctx.createGain();
        
        fundOsc.type = 'sine';
        fundOsc.frequency.value = noteFreq;
        
        fundGain.gain.setValueAtTime(0, now);
        fundGain.gain.linearRampToValueAtTime(0.8, now + 0.01);
        fundGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        
        fundOsc.connect(fundGain);
        fundGain.connect(ctx.destination);
        
        // --- 3. Marimba First Overtone (Characteristic Wood Edge) ---
        // Acoustic marimbas have a prominent overtone at ~3.93x fundamental
        const overtoneOsc = ctx.createOscillator();
        const overtoneGain = ctx.createGain();
        
        overtoneOsc.type = 'sine';
        overtoneOsc.frequency.value = noteFreq * 3.93; 
        
        overtoneGain.gain.setValueAtTime(0, now);
        overtoneGain.gain.linearRampToValueAtTime(0.15, now + 0.01);
        overtoneGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); // Decays faster
        
        overtoneOsc.connect(overtoneGain);
        overtoneGain.connect(ctx.destination);
        
        // Fire all synthetic parts
        clickOsc.start(now);
        fundOsc.start(now);
        overtoneOsc.start(now);
        
        clickOsc.stop(now + 0.05);
        fundOsc.stop(now + 0.25);
        overtoneOsc.stop(now + 0.1);
        
    } catch(e) {}
};

const playCompletionSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const now = ctx.currentTime;
        
        // Helper to synthesize one marimba note
        const playMarimbaNote = (freq: number, startTime: number) => {
            // Transient Click
            const clickOsc = ctx.createOscillator();
            const clickGain = ctx.createGain();
            const clickFilter = ctx.createBiquadFilter();
            clickOsc.type = 'square';
            clickOsc.frequency.setValueAtTime(800, startTime);
            clickOsc.frequency.exponentialRampToValueAtTime(100, startTime + 0.05);
            clickFilter.type = 'bandpass';
            clickFilter.frequency.value = 1200;
            clickFilter.Q.value = 0.5;
            clickGain.gain.setValueAtTime(0, startTime);
            clickGain.gain.linearRampToValueAtTime(0.4, startTime + 0.002);
            clickGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.05);
            clickOsc.connect(clickFilter);
            clickFilter.connect(clickGain);
            clickGain.connect(ctx.destination);
            
            // Fundamental Body
            const fundOsc = ctx.createOscillator();
            const fundGain = ctx.createGain();
            fundOsc.type = 'sine';
            fundOsc.frequency.value = freq;
            fundGain.gain.setValueAtTime(0, startTime);
            fundGain.gain.linearRampToValueAtTime(0.7, startTime + 0.01);
            fundGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
            fundOsc.connect(fundGain);
            fundGain.connect(ctx.destination);
            
            // First Overtone Check (Wood Edge)
            const overtoneOsc = ctx.createOscillator();
            const overtoneGain = ctx.createGain();
            overtoneOsc.type = 'sine';
            overtoneOsc.frequency.value = freq * 3.93; 
            overtoneGain.gain.setValueAtTime(0, startTime);
            overtoneGain.gain.linearRampToValueAtTime(0.1, startTime + 0.01);
            overtoneGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);
            overtoneOsc.connect(overtoneGain);
            overtoneGain.connect(ctx.destination);
            
            clickOsc.start(startTime);
            fundOsc.start(startTime);
            overtoneOsc.start(startTime);
            clickOsc.stop(startTime + 0.05);
            fundOsc.stop(startTime + 0.3);
            overtoneOsc.stop(startTime + 0.1);
        };
        
        // Play a grand Marimba major chord arpeggio (C5, E5, G5, C6) for completion/over-achievement
        playMarimbaNote(523.25, now);         // C5
        playMarimbaNote(659.25, now + 0.08);  // E5
        playMarimbaNote(783.99, now + 0.16);  // G5
        playMarimbaNote(1046.50, now + 0.24); // C6
        
    } catch(e) {}
};

export function GlobalSmartTracker() {
    const router = useRouter();
    const pathname = usePathname() || '/';
    const searchParams = useSearchParams();
    const { planRecord } = useDailyPlans(new Date());
    const smartTaskParam = normalizeSmartPlanTaskType(searchParams.get('smart_task'));
    const smartEntryParam = searchParams.get('smart_entry') === '1';
    const smartExamTrackParam = normalizeSmartPlanExamTrack(searchParams.get('exam_track'));

    const routeTaskContext = useMemo<RouteTaskContext | null>(() => {
        if (pathname.startsWith('/battle')) {
            return { taskType: 'rebuild' };
        }

        if (pathname.startsWith('/listening-cabin')) {
            return { taskType: 'listening_cabin' };
        }

        if (pathname.startsWith('/read') || pathname.startsWith('/cat')) {
            if (smartTaskParam === 'cat') {
                return { taskType: 'cat', examTrack: smartExamTrackParam };
            }

            if (smartTaskParam === 'reading_ai') {
                return { taskType: 'reading_ai', examTrack: smartExamTrackParam };
            }

            return null;
        }

        return null;
    }, [pathname, smartExamTrackParam, smartTaskParam]);

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
    const [revealChunks, setRevealChunks] = useState(true);
    const [isHeroOverlay, setIsHeroOverlay] = useState(false);
    const [showAbsolute, setShowAbsolute] = useState(false);

    useEffect(() => {
        if (pathname === '/' || pathname === '/home' || pathname.startsWith('/profile') || pathname.startsWith('/vocab')) return;
        if (!routeTaskContext || !smartEntryParam) return;

        setRevealChunks(false);
        setIsHeroOverlay(true);
        setIsExpanded(true); // Ensure items are visible during hero animation

        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete('smart_entry');
        const nextQuery = nextParams.toString();
        // Replace URL but do NOT depend on searchParams or router in a way that cancels timeouts eagerly
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }, [pathname, routeTaskContext, router, searchParams, smartEntryParam]);

    // Independent effect for the hero entry sequence so URL cleanup doesn't cancel timeouts
    useEffect(() => {
        if (!isHeroOverlay) return;
        
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
    }, [isHeroOverlay]);

    useEffect(() => {
        if (!smartItems.length) return;

        let hasNewCompletion = false;
        let hasNewIncrement = false;

        smartItems.forEach(item => {
            const current = item.current || 0;
            const prev = prevItemsRef.current[item.id];

            if (prev !== undefined && current > prev) {
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

    // Check if there are any completed/exceeded tasks meant for the current route directly
    const isRouteOverExceeded = useMemo(() => {
        return smartItems.some(item => {
            if ((item.current || 0) < (item.target || 1) && !item.completed) return false;
            if (pathname === '/' || pathname === '/home') return true;
            if (pathname.startsWith('/vocab') && item.type !== 'vocab') return false;
            return taskMatchesRoute(item, routeTaskContext, pathname);
        });
    }, [pathname, routeTaskContext, smartItems]);

    // Blast extreme confetti on over-completion
    useEffect(() => {
        if (isHeroOverlay && isRouteOverExceeded) {
            const colors = ['#f59e0b', '#fbbf24', '#fcd34d', '#ffffff', '#fb923c'];

            const fireBlast = (x: number, y: number, multiplier = 1) => {
                const count = 150 * multiplier;
                const defaults = { origin: { x, y }, colors, zIndex: 10000 };
                
                confetti({ ...defaults, particleCount: Math.floor(count * 0.25), spread: 26, startVelocity: 55 });
                confetti({ ...defaults, particleCount: Math.floor(count * 0.2), spread: 60 });
                confetti({ ...defaults, particleCount: Math.floor(count * 0.35), spread: 100, decay: 0.91, scalar: 0.8 });
                confetti({ ...defaults, particleCount: Math.floor(count * 0.1), spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
                confetti({ ...defaults, particleCount: Math.floor(count * 0.1), spread: 120, startVelocity: 45 });
            };

            // 1. Initial massive central super-blast
            fireBlast(0.5, 0.6, 1.5);

            // 2. Continuous fireworks popping across screen for 2s
            const duration = 2000;
            const end = Date.now() + duration;

            const interval = setInterval(function() {
                if (Date.now() > end) {
                    return clearInterval(interval);
                }
                confetti({
                    particleCount: 20,
                    startVelocity: 30,
                    spread: 360,
                    ticks: 60,
                    zIndex: 10000,
                    origin: { x: Math.random(), y: Math.random() - 0.2 },
                    colors: colors
                });
            }, 200);

            // 3. Two side blasts right at the climax
            const finalPop = setTimeout(() => {
                fireBlast(0.2, 0.7, 1);
                fireBlast(0.8, 0.7, 1);
            }, 800);

            return () => {
                clearInterval(interval);
                clearTimeout(finalPop);
            };
        }
    }, [isHeroOverlay, isRouteOverExceeded]);

    // Filter to only show uncompleted items or recently completed ones, AND match the current route!
    const activeItems = useMemo(() => {
        return smartItems.filter(item => {
            if (item.id === celebrateGoalId) return true;
            if ((item.current || 0) >= (item.target || 1) || item.completed) return false;

            // Contextual route filtering to prevent distraction
            if (pathname === '/' || pathname === '/home') return true;
            
            // Only show relevant tasks on specific pages
            if (pathname.startsWith('/vocab') && item.type !== 'vocab') return false;
            return taskMatchesRoute(item, routeTaskContext, pathname);
        });
    }, [celebrateGoalId, pathname, routeTaskContext, smartItems]);

    // We do not early return null anymore so AnimatePresence can track unmounting!
    const shouldShowTracker = activeItems.length > 0 || celebrateGoalId || isHeroOverlay;

    // Calculate if we actually have chunkable stuff
    const hasChunkableItems = useMemo(() => {
        return activeItems.some(i => i.chunk_size && (i.target || 1) > i.chunk_size);
    }, [activeItems]);

    const totalChunks = useMemo(() => {
        return activeItems.reduce((acc, i) => {
            if (i.chunk_size && (i.target || 1) > i.chunk_size) {
                return acc + Math.ceil((i.target || 1) / i.chunk_size);
            }
            return acc + 1; // Unchunked items count as 1 chunk logically
        }, 0);
    }, [activeItems]);

    // Exclude if dismissed or no items
    if (isFullyDismissed || smartItems.length === 0) return null;

    // Do not show the floating tracker on non-study pages like home/profile/vocab-notebook
    if (pathname === '/' || pathname === '/home' || pathname.startsWith('/profile') || pathname.startsWith('/vocab')) return null;



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

            <AnimatePresence>
                {isHeroOverlay && shouldShowTracker && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="fixed inset-0 z-[9999] pointer-events-auto flex flex-col items-center justify-center gap-8"
                    >
                        <AnimatePresence mode="wait">
                            {isRouteOverExceeded ? (
                                <motion.div key="overexceeded" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center gap-6">
                                    <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}>
                                        <div className="w-24 h-24 bg-amber-400 border-4 border-theme-border rounded-[2.5rem] flex items-center justify-center shadow-[6px_6px_0_0_var(--theme-shadow)] relative overflow-hidden">
                                            <Trophy className="w-12 h-12 text-white relative z-10" />
                                            <motion.div 
                                                className="absolute inset-x-0 bottom-0 bg-white/30"
                                                animate={{ height: ['0%', '100%'] }}
                                                transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                                            />
                                        </div>
                                    </motion.div>
                                    <h2 className="font-black text-2xl md:text-3xl tracking-[0.2em] text-amber-400 drop-shadow-md text-center flex flex-col gap-2">
                                        {!revealChunks ? "检测到极限超载..." : "🌟 极速超载模式开启！"}
                                    </h2>
                                </motion.div>
                            ) : (
                                <motion.div key="routine" className="flex flex-col items-center">
                                    <AnimatePresence mode="wait">
                                        {!revealChunks ? (
                                            <motion.div
                                                key="analyzing"
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 1.1 }}
                                                transition={{ duration: 0.3 }}
                                                className="flex flex-col items-center gap-4"
                                            >
                                                <div className="w-16 h-16 bg-theme-base-bg border-4 border-theme-border rounded-[2rem] flex items-center justify-center shadow-[4px_4px_0_0_var(--theme-shadow)]">
                                                    <Loader2 className="w-8 h-8 text-theme-text animate-spin" />
                                                </div>
                                                <h2 className="font-black text-2xl tracking-widest text-white mt-2">
                                                    感知任务负荷...
                                                </h2>
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="chunked"
                                                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                transition={{ type: "spring", stiffness: 450, damping: 25 }}
                                                className="flex flex-col items-center gap-4"
                                            >
                                                <div className={`w-20 h-20 border-4 border-theme-border rounded-[2rem] flex items-center justify-center shadow-[6px_6px_0_0_var(--theme-shadow)] relative overflow-hidden ${
                                                    hasChunkableItems ? 'bg-theme-active-bg' : 'bg-emerald-400'
                                                }`}>
                                                    {hasChunkableItems ? (
                                                        <Blocks className="w-10 h-10 text-theme-active-text z-10" />
                                                    ) : (
                                                        <Loader2 className="w-10 h-10 text-white z-10" /> // Using a generic success ring or check logic 
                                                    )}
                                                    <motion.div 
                                                        className="absolute inset-x-0 bottom-0 bg-white/20"
                                                        initial={{ height: 0 }}
                                                        animate={{ height: "100%" }}
                                                        transition={{ delay: 0.2, duration: 0.6 }}
                                                    />
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <h2 className="font-black text-3xl tracking-widest text-white mt-2 drop-shadow-md">
                                                        {hasChunkableItems ? "智能切片开启" : "轨道路由并网"}
                                                    </h2>
                                                    {hasChunkableItems ? (
                                                        <span className="text-white/80 font-bold tracking-widest mt-1 text-sm bg-black/20 px-3 py-1 rounded-full">
                                                            已划分为 {totalChunks} 个子任务碎块
                                                        </span>
                                                    ) : (
                                                        <span className="text-white/80 font-bold tracking-widest mt-1 text-sm bg-black/20 px-3 py-1 rounded-full">
                                                            负荷极低 · 畅快执行阶段
                                                        </span>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        
                        {/* Only show items centrally during hero overlay if we need to */}
                        <motion.div layout className="flex flex-col items-center gap-3">
                            <AnimatePresence mode="popLayout">
                                {activeItems.map(item => {
                                    const absoluteTarget = item.target || 1;
                                    const absoluteCurrent = item.current || 0;
                                    const isFullyCompleted = absoluteCurrent >= absoluteTarget;

                                    let relativeCurrent = absoluteCurrent;
                                    let relativeTarget = absoluteTarget;
                                    let remaining = absoluteTarget - absoluteCurrent;
                                    let isChunked = false;

                                    if (!isFullyCompleted && revealChunks && item.chunk_size && absoluteTarget > item.chunk_size) {
                                        const activeChunkIndex = Math.floor(absoluteCurrent / item.chunk_size);
                                        const chunkBase = activeChunkIndex * item.chunk_size;
                                        relativeCurrent = absoluteCurrent - chunkBase;
                                        
                                        const currentChunkUpperLimit = Math.min(absoluteTarget, (activeChunkIndex + 1) * item.chunk_size);
                                        relativeTarget = currentChunkUpperLimit - chunkBase;
                                        remaining = relativeTarget - relativeCurrent;
                                        isChunked = true;
                                    }

                                    const prog = Math.min(100, relativeTarget > 0 ? Math.round((relativeCurrent / relativeTarget) * 100) : 0);
                                    
                                    return (
                                        <motion.div 
                                            layout
                                            key={`hero-${item.id}`}
                                            initial={{ opacity: 0, scale: 0.8, x: 50 }}
                                            animate={{ opacity: 1, scale: 1, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.8, x: 50 }}
                                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                            className="flex items-center rounded-[3rem] border-[5px] w-[400px] p-4 gap-5 shadow-2xl scale-105 bg-theme-base-bg border-theme-border text-theme-text"
                                        >
                                            <div className="shrink-0 rounded-full flex items-center justify-center border-[3px] w-16 h-16 bg-theme-active-bg border-theme-border text-theme-active-text">
                                                {isFullyCompleted ? <Trophy className="w-6 h-6 animate-bounce" /> : <Loader2 className="w-6 h-6 animate-spin-slow" />}
                                            </div>
                                            <div className="flex-1 flex flex-col justify-center min-w-0 z-10">
                                                <div className="flex justify-between items-end mb-1">
                                                    <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                                        <span className="font-black truncate transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] text-base text-theme-text">
                                                            {item.text}
                                                        </span>
                                                        <AnimatePresence>
                                                            {isChunked && (
                                                                <motion.span
                                                                    initial={{ opacity: 0, scale: 0, x: -20 }}
                                                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                                                    className="px-1.5 py-0.5 rounded border overflow-hidden font-black uppercase tracking-wider shrink-0 shadow-sm transition-all duration-1000 text-[10px] bg-theme-active-bg/15 text-[color:var(--theme-active-bg)] border-[color:var(--theme-active-bg)]/30"
                                                                >
                                                                    智能切片
                                                                </motion.span>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                    <span className="font-black tracking-wider text-sm text-theme-text-light shrink-0">
                                                        {isFullyCompleted 
                                                            ? `✓ ${absoluteCurrent}` 
                                                            : (isChunked ? `${relativeCurrent}/${relativeTarget}` : `${absoluteCurrent}/${absoluteTarget}`)}
                                                    </span>
                                                </div>
                                                <div className="rounded-full overflow-hidden border-[2px] relative transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] h-3.5 border-theme-border bg-theme-card-bg">
                                                    <motion.div 
                                                        className="absolute left-0 top-0 bottom-0 bg-theme-text overflow-hidden transition-all duration-1000"
                                                        style={{ width: `${prog}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* FLOATING TRACKER (DRAGGABLE) */}
            <AnimatePresence>
                {!isHeroOverlay && shouldShowTracker && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8, y: 50 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 50 }}
                        transition={{ duration: 0.5, type: "spring", stiffness: 300, damping: 25 }}
                        className="fixed bottom-6 right-6 z-[999] pointer-events-auto"
                        drag
                        dragMomentum={false}
                        whileDrag={{ scale: 1.05, cursor: 'grabbing' }}
                    >
                        <motion.div layout className="flex flex-col items-end gap-3 relative">

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
                        const isFullyCompleted = absoluteCurrent >= absoluteTarget;

                        if (!isFullyCompleted && revealChunks && item.chunk_size && absoluteTarget > item.chunk_size) {
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
                                            {isFullyCompleted 
                                                ? `✓ ${absoluteCurrent}`
                                                : (showAbsolute 
                                                    ? `${absoluteCurrent}/${absoluteTarget}` 
                                                    : (isChunked ? `${relativeCurrent}/${relativeTarget}` : `${absoluteCurrent}/${absoluteTarget}`)
                                                )}
                                        </span>
                                    </div>
                                    <div className={`rounded-full overflow-hidden border-[2px] relative transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                        isHeroOverlay ? 'h-3.5' : 'h-2.5'
                                    } ${
                                        isFullyCompleted ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]' :
                                        (isInc || isCeleb ? 'border-white/30 bg-black/10' : 'border-theme-border bg-theme-card-bg')
                                    }`}>
                                        <motion.div 
                                            className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                                isFullyCompleted ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 shadow-[inset_0_0_8px_rgba(255,255,255,0.5)]' :
                                                (isCeleb ? 'bg-yellow-500' : isInc ? 'bg-white' : 'bg-theme-text')
                                            } overflow-hidden`}
                                            style={{ width: `${prog}%` }}
                                        >
                                            {isFullyCompleted && (
                                                <motion.div 
                                                    className="absolute inset-0 w-[50%] h-full bg-gradient-to-r from-transparent via-white/60 to-transparent skew-x-12"
                                                    animate={{ x: ['-200%', '300%'] }}
                                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                                />
                                            )}
                                        </motion.div>
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
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
