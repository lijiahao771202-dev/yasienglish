"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { pickTranslationQuickMatchTopic, getAvailableTranslationSlotItems, rememberTranslationQuickMatchTopic } from "@/lib/translation-quickmatch-topics";
import { getAvailableBattleSlotItems, resolveBattleScenarioContext } from "@/lib/battle-quickmatch-topics";
import { getAvailableCatSlotItems, pickCatTopicSeed } from "@/lib/content-topic-pool";
import { cn } from "@/lib/utils";
import { X, Sparkles, Wand2 } from "lucide-react";
import { createPortal } from "react-dom";

const STOP_AUDIO_URL = 'https://assets.mixkit.co/active_storage/sfx/2574/2574-preview.mp3';
const TICK_AUDIO_URL = 'https://assets.mixkit.co/active_storage/sfx/1120/1120-preview.mp3';

function SlotColumn({ 
    items, 
    rolling, 
    targetItem, 
    delayBeforeStop, 
    label,
    globalAudioCtx
}: { 
    items: string[], 
    rolling: boolean, 
    targetItem: string, 
    delayBeforeStop: number,
    label: string,
    globalAudioCtx: { playStop: () => void, playTick: () => void }
}) {
    // Generate a long list of items for the drum
    const [drumItems] = useState(() => {
        const drum = [];
        // Slowing down the spin by reducing the total items
        for (let i = 0; i < 25; i++) {
            drum.push(items[Math.floor(Math.random() * items.length)] || "");
        }
        // Place the target item near the end
        drum[20] = targetItem;
        return drum;
    });

    const [stopped, setStopped] = useState(false);
    
    const itemHeight = 80;
    const targetIndex = 20;
    const containerHeight = 160;
    const middleOffset = (containerHeight - itemHeight) / 2; 
    const targetY = -(targetIndex * itemHeight) + middleOffset;

    useEffect(() => {
        if (!rolling) return;
        
        const t = setTimeout(() => {
            setStopped(true);
            globalAudioCtx.playStop();
        }, delayBeforeStop);
        
        return () => clearTimeout(t);
    }, [rolling, delayBeforeStop, globalAudioCtx]);

    return (
        <div className="flex flex-col gap-3 relative">
            <div className="text-indigo-400 text-xs font-bold uppercase tracking-widest text-center flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-200" />
                {label}
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-200" />
            </div>
            <div className={cn(
                "relative h-[160px] w-full overflow-hidden rounded-[2rem] border-[3px] transition-all duration-500", 
                stopped 
                    ? "border-indigo-400 bg-white/90 shadow-[0_20px_40px_rgba(99,102,241,0.15)] ring-4 ring-indigo-400/20" 
                    : "border-slate-200/60 bg-slate-50/50 shadow-inner"
            )}
            style={{
                // Mask edges to fake a cylindrical drum
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)'
            }}
            >
                {/* Central Targeting UI */}
                <div className="absolute inset-x-3 top-1/2 -mt-[40px] h-[80px] rounded-[1.5rem] bg-gradient-to-r from-transparent via-indigo-500/5 to-transparent pointer-events-none border border-indigo-400/20 z-10" />

                <motion.div
                    initial={{ y: middleOffset }}
                    animate={rolling ? { y: targetY } : { y: middleOffset }}
                    transition={{
                        duration: delayBeforeStop / 1000,
                        ease: [0.25, 1, 0.5, 1] as const, // Weightier deliberate deceleration
                    }}
                    onUpdate={(latest) => {
                        // Play tick sound continuously crossing item boundaries
                        if (rolling && !stopped && typeof latest.y === "number") {
                            // 60 is item height
                            const currentIdxFloat = (middleOffset - latest.y) / itemHeight;
                            const currentIdx = Math.floor(currentIdxFloat);
                            // Avoid overlap spam, store last checked idx in a ref or property
                            if ((latest as any)._lastIdx !== currentIdx) {
                                (latest as any)._lastIdx = currentIdx;
                                // Only tick if high speed or slowing down
                                globalAudioCtx.playTick();
                            }
                        }
                    }}
                    className="absolute left-0 right-0"
                >
                    {drumItems.map((item, idx) => (
                        <div 
                            key={idx} 
                            style={{ height: itemHeight }}
                            className={cn(
                                "flex items-center justify-center w-full px-6 text-center font-black leading-tight drop-shadow-sm",
                                (stopped && idx === targetIndex) ? "text-2xl md:text-3xl text-indigo-600" : "text-xl md:text-2xl text-slate-300"
                            )}
                        >
                            {item}
                        </div>
                    ))}
                </motion.div>
                
                {/* Inner shadow overlay for depth */}
                <div className="absolute inset-0 shadow-[inset_0_24px_24px_-12px_rgba(0,0,0,0.06),inset_0_-24px_24px_-12px_rgba(0,0,0,0.06)] pointer-events-none z-20 mix-blend-multiply rounded-[2rem]" />
            </div>
        </div>
    );
}

export function TranslationSlotMachine({
    elo,
    mode = "translation",
    onComplete,
    onCancel,
    forcedTopic,
    translationVariant
}: {
    elo: number;
    mode?: "translation" | "battle" | "cat";
    onComplete: (topic: { topicLine: string; topicPrompt: string }) => void;
    onCancel: () => void;
    forcedTopic?: {
        domainLabel: string;
        scenarioLabel: string;
        genreLabel: string;
        topicLine: string;
        topicPrompt: string;
    };
    translationVariant?: "sentence" | "passage";
}) {
    const [mounted, setMounted] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const [rolling, setRolling] = useState(false);
    const [pool, setPool] = useState<{ col1: string[], col2: string[], col3: string[] }>({ col1: [], col2: [], col3: [] });
    const [result, setResult] = useState<{ col1Label: string, col2Label: string, col3Label: string, topic: { topicLine: string; topicPrompt: string } } | null>(null);

    // Audio Context (Singleton inside the component to prevent aggressive garbage collection before play)
    const [audioReady, setAudioReady] = useState(false);
    const stopAudioRefs = useRef<HTMLAudioElement[]>([]);
    const tickAudioRefs = useRef<HTMLAudioElement[]>([]);
    const currentTickIdx = useRef(0);

    useEffect(() => {
        setMounted(true);

        // Preload multi-channel audio for overlapping ticks and stops
        for (let i = 0; i < 3; i++) {
            const stopAudio = new Audio(STOP_AUDIO_URL);
            stopAudio.volume = 0.6;
            stopAudio.load();
            stopAudioRefs.current.push(stopAudio);
        }
        for (let i = 0; i < 15; i++) {
            const tickAudio = new Audio(TICK_AUDIO_URL);
            tickAudio.volume = 0.05; // very quiet clicks
            tickAudio.load();
            tickAudioRefs.current.push(tickAudio);
        }
        setAudioReady(true);

        // Compute pool and target result on mount
        if (forcedTopic) {
            const items = mode === "cat" ? getAvailableCatSlotItems(elo) : mode === "battle" ? getAvailableBattleSlotItems(elo) : getAvailableTranslationSlotItems(elo);
            setPool(items);
            setResult({
                col1Label: forcedTopic.domainLabel,
                col2Label: forcedTopic.scenarioLabel,
                col3Label: forcedTopic.genreLabel,
                topic: { topicLine: forcedTopic.topicLine, topicPrompt: forcedTopic.topicPrompt }
            });
        } else if (mode === "translation") {
            const items = getAvailableTranslationSlotItems(elo);
            setPool(items);
            const pick = pickTranslationQuickMatchTopic(elo, translationVariant);
            rememberTranslationQuickMatchTopic(pick);
            setResult({
                col1Label: pick.domainLabel,
                col2Label: pick.scenarioLabel,
                col3Label: pick.genreLabel,
                topic: pick
            });
        } else if (mode === "battle") {
            const items = getAvailableBattleSlotItems(elo);
            setPool(items);
            const pick = resolveBattleScenarioContext(null, elo); // automatically handles history in the lib
            setResult({
                col1Label: pick.domainLabel,
                col2Label: pick.scenarioLabel,
                col3Label: pick.roleFrameLabel,
                topic: pick
            });
        } else if (mode === "cat") {
            const items = getAvailableCatSlotItems(elo);
            setPool(items);
            const pick = pickCatTopicSeed({ score: elo }); // handles history
            setResult({
                col1Label: pick.domainLabel,
                col2Label: pick.subtopicLabel,
                col3Label: pick.angle,
                topic: { topicLine: pick.topicLine, topicPrompt: pick.angle }
            });
        }

        // Start roll automatically
        const t = setTimeout(() => {
            setRolling(true);
        }, 800);

        return () => clearTimeout(t);
    }, [elo]);

    const globalAudioCtx = useMemo(() => ({
        playStop: () => {
            const audio = stopAudioRefs.current.find(a => a.paused || a.ended);
            if (audio) {
                audio.currentTime = 0;
                audio.play().catch(() => {});
            } else if (stopAudioRefs.current[0]) {
                stopAudioRefs.current[0].currentTime = 0;
                stopAudioRefs.current[0].play().catch(() => {});
            }
        },
        playTick: () => {
            const audio = tickAudioRefs.current[currentTickIdx.current];
            if (audio) {
                audio.currentTime = 0;
                audio.play().catch(() => {});
                currentTickIdx.current = (currentTickIdx.current + 1) % tickAudioRefs.current.length;
            }
        }
    }), []);

    // The durations and speeds heavily modified for a super slow, graceful 2x slow-mo spin
    const DUR_1 = 4000;
    const DUR_2 = 5600;
    const DUR_3 = 7200;

    const onCompleteRef = useRef(onComplete);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        if (rolling && result) {
            // Wait for all 3 columns to stop (DUR_3) + padding to admire the result
            const waitToFinish = DUR_3 + 1200;
            const finishTimer = setTimeout(() => {
                onCompleteRef.current(result.topic);
                setIsVisible(false);
            }, waitToFinish);
            return () => clearTimeout(finishTimer);
        }
    }, [rolling, result]);

    if (!mounted || !result || !audioReady) return null;

    const overlayContent = (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-100/50 p-4 backdrop-blur-2xl md:p-8"
                >
                    <div className="absolute inset-0 z-0 bg-[url('/noise.png')] opacity-[0.05] mix-blend-overlay pointer-events-none" />

                    <motion.div
                        initial={{ scale: 0.9, y: 30, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.85, y: -40, opacity: 0, filter: "blur(10px)" }}
                        transition={{ type: "spring" as const, damping: 25, stiffness: 200 }}
                        className="relative z-10 w-full max-w-[1050px] overflow-hidden rounded-[3rem] border border-white/60 bg-white/60 p-8 shadow-[0_40px_100px_rgba(0,0,0,0.08)] backdrop-blur-md md:p-14 mb-20"
                    >
                        <button
                            onClick={onCancel}
                            className="absolute right-6 top-6 flex h-12 w-12 items-center justify-center rounded-full bg-white/50 border border-slate-200 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        >
                            <X className="h-6 w-6" />
                        </button>

                        <div className="mb-14 text-center">
                            <div className="mb-6 inline-flex items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 px-5 py-2 text-sm font-black uppercase tracking-widest text-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.1)]">
                                <Sparkles className="mr-2 h-4 w-4" />
                                Premium Selection Engine
                            </div>
                            <h2 className="text-4xl font-black text-slate-800 tracking-tight md:text-5xl drop-shadow-sm">匹配高级语境组合</h2>
                            <p className="mt-4 text-slate-500 font-medium text-lg">AI 正在为您组建高难度主题网络...</p>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
                            <SlotColumn 
                                label={mode === "cat" ? "探讨领域 / Academic Domain" : "探讨领域 / Domain"}
                                items={pool.col1} 
                                rolling={rolling} 
                                targetItem={result.col1Label} 
                                delayBeforeStop={DUR_1} 
                                globalAudioCtx={globalAudioCtx}
                            />
                            <SlotColumn 
                                label={mode === "translation" ? "微观情境 / Scenario" : mode === "battle" ? "沟通意境 / Core Intent" : "垂类学科 / Subtopic"}
                                items={pool.col2} 
                                rolling={rolling} 
                                targetItem={result.col2Label} 
                                delayBeforeStop={DUR_2} 
                                globalAudioCtx={globalAudioCtx}
                            />
                            <SlotColumn 
                                label={mode === "translation" ? "文体体裁 / Text Genre" : mode === "battle" ? "身份预设 / Role Frame" : "深度切入点 / Specific Angle"}
                                items={pool.col3} 
                                rolling={rolling} 
                                targetItem={result.col3Label} 
                                delayBeforeStop={DUR_3} 
                                globalAudioCtx={globalAudioCtx}
                            />
                        </div>

                        <div className="mt-14 flex justify-center">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: rolling ? 1 : 0, scale: 1 }}
                                className="flex items-center gap-3 text-indigo-500 font-bold tracking-widest px-8 py-3 bg-indigo-50/50 rounded-full border border-indigo-100/50"
                            >
                                <Wand2 className="w-5 h-5 animate-pulse" />
                                <span className="animate-pulse">LOADING LOGICS...</span>
                            </motion.div>
                        </div>

                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return createPortal(overlayContent, document.body);
}
