"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, AudioLines } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

const AVATARS = [
    { id: 0, color: "bg-blue-500", shadow: "shadow-blue-500/50", label: "Emma" },
    { id: 1, color: "bg-purple-500", shadow: "shadow-purple-500/50", label: "Brian" },
    { id: 2, color: "bg-emerald-500", shadow: "shadow-emerald-500/50", label: "Ava" },
];

export function StepPitchFeature_Cabin() {
    const [activeSpeaker, setActiveSpeaker] = useState(0);

    useEffect(() => {
        // Rotate speakers every 1.5s to simulate a dynamic multi-speaker conversation
        const interval = setInterval(() => {
            setActiveSpeaker((prev) => (prev + 1) % AVATARS.length);
        }, 1800);
        return () => clearInterval(interval);
    }, []);

    // Play immersive audio demo when entering this step
    useEffect(() => {
        let audio: HTMLAudioElement | null = null;
        try {
            audio = new Audio("/blind_intro.mp3");
            audio.volume = 0.5;
            audio.play().catch(() => {});
        } catch (e) {
            console.error(e);
        }
        return () => {
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
        };
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col text-left max-w-2xl relative px-4"
        >
            <div className="mb-4">
                <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-white/5 border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                    <Headphones className="h-8 w-8 text-indigo-400" strokeWidth={1.5} />
                </div>
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight drop-shadow-md">
                全境发音生命舱
            </h2>
            <p className="text-lg md:text-xl text-white/70 leading-relaxed mb-8 max-w-lg">
                您的世界不再被机械电音污染。内置上百位神经模型发音人，在文章阅读中 <span className="text-white font-bold tracking-widest border-b border-indigo-400/50">多角色无缝切换</span>。用最暴力的语境，撕开你的听力屏障。
            </p>

            {/* Listening Cabin Interactive UI Mockup */}
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 1 }}
                className="relative w-full rounded-[2rem] bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.1)] p-6 md:p-8 overflow-hidden"
            >
                {/* Background Glow tied to active speaker */}
                <div className={`absolute -top-32 -left-32 w-64 h-64 rounded-full blur-[100px] transition-colors duration-1000 ${activeSpeaker === 0 ? 'bg-blue-500/20' : activeSpeaker === 1 ? 'bg-purple-500/20' : 'bg-emerald-500/20'}`} />

                {/* Multilingual Avatars Header */}
                <div className="flex items-center gap-4 mb-8">
                    <div className="text-xs font-bold uppercase tracking-widest text-white/30 mr-2">Active Roles</div>
                    {AVATARS.map((avatar) => {
                        const isActive = activeSpeaker === avatar.id;
                        return (
                            <div key={avatar.id} className="relative flex flex-col items-center">
                                <motion.div 
                                    animate={{ 
                                        scale: isActive ? 1.1 : 1,
                                        opacity: isActive ? 1 : 0.4
                                    }}
                                    transition={{ type: "spring" as const, stiffness: 300, damping: 20 }}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white shadow-lg ${avatar.color} ${isActive ? avatar.shadow + ' shadow-[0_0_20px_var(--tw-shadow-color)] ring-2 ring-white/50' : 'grayscale-[50%]'}`}
                                >
                                    {avatar.label[0]}
                                </motion.div>
                                {isActive && (
                                    <motion.div layoutId="speakerIndicator" className="absolute -bottom-4 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Simulated Article Lines With Karaoke Sync */}
                <div className="space-y-6 relative z-10 w-full">
                    {/* Line 1 */}
                    <div className={`transition-all duration-700 ease-out pl-4 border-l-2 ${activeSpeaker === 0 ? 'border-blue-500 opacity-100' : 'border-transparent opacity-30'}`}>
                        <div className="text-xs font-bold text-blue-400 mb-1 tracking-wider uppercase">Emma</div>
                        <div className={`h-3 rounded-[3px] bg-white/80 w-[90%] mb-2 transition-all duration-500 ${activeSpeaker === 0 ? 'shadow-[0_0_15px_rgba(255,255,255,0.4)]' : ''}`} />
                        <div className="h-3 rounded-[3px] bg-white/80 w-[70%]" />
                    </div>

                    {/* Line 2 */}
                    <div className={`transition-all duration-700 ease-out pl-4 border-l-2 ${activeSpeaker === 1 ? 'border-purple-500 opacity-100 translate-x-2' : 'border-transparent opacity-30'}`}>
                        <div className="text-xs font-bold text-purple-400 mb-1 tracking-wider uppercase">Brian</div>
                        <div className={`h-3 rounded-[3px] bg-white/80 w-[100%] mb-2 transition-all duration-500 ${activeSpeaker === 1 ? 'shadow-[0_0_15px_rgba(255,255,255,0.4)]' : ''}`} />
                        <div className="h-3 rounded-[3px] bg-white/80 w-[85%]" />
                    </div>

                    {/* Line 3 */}
                    <div className={`transition-all duration-700 ease-out pl-4 border-l-2 ${activeSpeaker === 2 ? 'border-emerald-500 opacity-100 translate-x-2' : 'border-transparent opacity-30'}`}>
                        <div className="text-xs font-bold text-emerald-400 mb-1 tracking-wider uppercase">Ava</div>
                        <div className={`h-3 rounded-[3px] bg-white/80 w-[80%] mb-2 transition-all duration-500 ${activeSpeaker === 2 ? 'shadow-[0_0_15px_rgba(255,255,255,0.4)]' : ''}`} />
                        <div className="h-3 rounded-[3px] bg-white/80 w-[60%]" />
                    </div>
                </div>

                {/* Animated Mini Waveform in corner when active */}
                <div className="absolute bottom-6 right-6 flex items-center justify-center p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md">
                    <AudioLines className="text-white/70 h-5 w-5 animate-pulse" />
                    <div className="ml-2 flex gap-1 h-4 items-center">
                        {[...Array(4)].map((_, i) => (
                            <motion.div 
                                key={i}
                                animate={{ height: ["20%", "100%", "20%"] }}
                                transition={{ duration: 0.5 + i * 0.1, repeat: Infinity, ease: "easeInOut" }}
                                className="w-1 bg-white/70 rounded-full"
                            />
                        ))}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

