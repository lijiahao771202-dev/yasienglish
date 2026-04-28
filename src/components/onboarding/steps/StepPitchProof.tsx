"use client";

import React from "react";
import { motion } from "framer-motion";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchProof() {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex flex-col items-center text-center px-4"
        >
            <h2 className="font-newsreader text-4xl md:text-5xl text-white font-medium italic mb-10 leading-tight">
                “语言不再是工具，<br/>
                它是重塑我认知世界的器官。”
            </h2>
            
            <div className="flex flex-col items-center gap-2 relative z-10">
                <p className="text-base text-white/50 tracking-wider">
                    Alex — 慕尼黑工业大学
                </p>
                <div className="h-px w-12 bg-white/20 mt-8 mb-8" />
                
                {/* Advanced Avatar Cluster */}
                <div className="flex -space-x-4 mb-4">
                    {[
                        { bg: "bg-gradient-to-br from-blue-500 to-indigo-600", initial: "A" },
                        { bg: "bg-gradient-to-br from-purple-500 to-fuchsia-600", initial: "K" },
                        { bg: "bg-gradient-to-br from-emerald-400 to-teal-600", initial: "L" },
                        { bg: "bg-gradient-to-br from-rose-400 to-red-600", initial: "S" },
                        { bg: "bg-gradient-to-br from-amber-400 to-orange-600", initial: "M" },
                        { bg: "bg-gradient-to-br from-cyan-400 to-blue-600", initial: "E" },
                        { bg: "bg-gradient-to-br from-violet-500 to-purple-700", initial: "R" },
                        { bg: "bg-gradient-to-br from-zinc-700 to-zinc-900 border border-white/20", initial: "99+" },
                    ].map((avatar, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -20, scale: 0.8 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            transition={{ delay: 0.8 + (i * 0.1), type: "spring" as const, stiffness: 200, damping: 20 }}
                            className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shadow-[0_0_15px_rgba(0,0,0,0.5)] ring-2 ring-[#020202] ${avatar.bg} z-[${10 - i}] hover:-translate-y-2 hover:scale-110 transition-transform cursor-pointer`}
                        >
                            {avatar.initial}
                        </motion.div>
                    ))}
                </div>

                <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.8 }}
                    className="text-xl md:text-2xl text-yellow-500 font-semibold uppercase tracking-widest"
                >
                    100,000+ 极客与思考者
                </motion.p>
                <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2.0 }}
                    className="text-sm md:text-base text-white/40 mt-1"
                >
                    正在使用 Yasi 重构自己的神经边界。
                </motion.p>
            </div>
        </motion.div>
    );
}
