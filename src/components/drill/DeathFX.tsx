"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface DeathFXProps {
    type: 'slash' | 'glitch' | 'shatter' | null;
    onComplete?: () => void;
}

export function DeathFX({ type, onComplete }: DeathFXProps) {
    const [stage, setStage] = useState(0);

    useEffect(() => {
        if (type) {
            setStage(1);
            const timer = setTimeout(() => {
                if (onComplete) onComplete();
            }, 3000); // 3s total animation
            return () => clearTimeout(timer);
        } else {
            setStage(0);
        }
    }, [type, onComplete]);

    if (!type) return null;

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden flex items-center justify-center">
            {/* --- REAPER: THE SEVERANCE (Slash) --- */}
            {type === 'slash' && (
                <>
                    {/* The Blade Flash */}
                    <motion.div
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.1, ease: "circOut" }}
                        className="absolute inset-0 z-50"
                    >
                        <svg viewBox="0 0 100 100" className="w-full h-full preserve-3d">
                            <motion.line
                                x1="-10" y1="110" x2="110" y2="-10"
                                stroke="white"
                                strokeWidth="0.5"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 0.15 }}
                            />
                        </svg>
                    </motion.div>

                    {/* Red Flash */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ duration: 0.2, times: [0, 0.1, 1] }}
                        className="absolute inset-0 bg-red-900 mix-blend-multiply z-40"
                    />

                    {/* Screen Split (Simulated by 2 skewed divs) */}
                    <motion.div
                        initial={{ x: 0, y: 0, rotate: 0 }}
                        animate={{ x: -20, y: 20 }}
                        transition={{ delay: 0.1, duration: 1.5, type: "spring", bounce: 0.5 }}
                        className="absolute inset-0 bg-black/90 clip-path-polygon-[0_0,_100%_0,_0_100%] origin-top-left z-30 flex items-center justify-center backdrop-grayscale"
                    >
                        <h1 className="text-9xl font-black text-stone-800 rotate-45 opacity-50">DEATH</h1>
                    </motion.div>
                    <motion.div
                        initial={{ x: 0, y: 0, rotate: 0 }}
                        animate={{ x: 20, y: -20 }}
                        transition={{ delay: 0.1, duration: 1.5, type: "spring", bounce: 0.5 }}
                        className="absolute inset-0 bg-black/95 clip-path-polygon-[100%_0,_100%_100%,_0_100%] origin-bottom-right z-30"
                    />

                    {/* Blood Spray */}
                    <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.1, duration: 0.2 }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-2 bg-red-600 -rotate-45 shadow-[0_0_50px_rgba(220,38,38,1)] z-40"
                    />
                </>
            )}

            {/* --- LIGHTNING: MELTDOWN (Glitch) --- */}
            {type === 'glitch' && (
                <>
                    <motion.div
                        animate={{
                            backgroundColor: ["#fff", "#000", "#fff", "#000000"],
                            filter: ["invert(0)", "invert(1)", "invert(0)", "contrast(200%) grayscale(100%)"]
                        }}
                        transition={{ duration: 0.5, times: [0, 0.2, 0.4, 1] }}
                        className="absolute inset-0 z-50 flex items-center justify-center"
                    >
                        <motion.div
                            initial={{ scaleY: 1 }}
                            animate={{ scaleY: 0.005, opacity: 0 }}
                            transition={{ delay: 0.5, duration: 0.2, ease: "circIn" }}
                            className="w-full h-full bg-stone-900 flex items-center justify-center"
                        >
                            <div className="w-full h-px bg-white shadow-[0_0_50px_white]" />
                        </motion.div>
                    </motion.div>
                </>
            )}

            {/* --- GAMBLE: SHATTER (Collapse) --- */}
            {type === 'shatter' && (
                <>
                    {/* Background crack */}
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-40" />

                    {/* "BANKRUPT" Stamp */}
                    <motion.div
                        initial={{ scale: 3, opacity: 0, rotate: -20 }}
                        animate={{ scale: 1, opacity: 1, rotate: -15 }}
                        transition={{ type: "spring", bounce: 0.3 }}
                        className="relative z-50 border-[10px] border-red-600 p-8 rounded-xl"
                    >
                        <div className="text-9xl font-black text-red-600 tracking-tighter uppercase font-mono" style={{ textShadow: "0 0 20px rgba(220,38,38,0.5)" }}>
                            BANKRUPT
                        </div>
                    </motion.div>

                    {/* Falling Shards (Simulated) */}
                    {[...Array(12)].map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{ y: -100, x: (Math.random() - 0.5) * 500, rotate: 0 }}
                            animate={{ y: 1000, rotate: (Math.random() - 0.5) * 360 }}
                            transition={{ duration: 1.5 + Math.random(), delay: Math.random() * 0.5, ease: "circIn" }}
                            className="absolute w-32 h-32 bg-white/10 backdrop-blur-xl border border-white/20 z-40"
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 50}%`,
                                clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'
                            }}
                        />
                    ))}
                </>
            )}
        </div>
    );
}
