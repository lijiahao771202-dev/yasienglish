"use client";

import React from "react";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchFeature_FSRS() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col text-left max-w-xl"
        >
            <div className="mb-6 opacity-80">
                <Activity className="h-10 w-10 text-rose-500" strokeWidth={1.5} />
            </div>

            <h2 className="font-newsreader text-3xl md:text-4xl text-white font-medium mb-4">
                解药 5：FSRS 记忆引擎
            </h2>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
                不要盲目复习。<br/>
                系统底层装配了当今学术界最顶尖的 Free Spaced Repetition Scheduler 神经记忆推演算法。它能算准您对某个知识点<strong>正趋向遗忘的那一毫秒</strong>，并精确抛出回顾触点。
            </p>

            <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                className="w-full relative h-32 rounded-2xl bg-white/5 border border-white/10 overflow-hidden"
            >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <svg viewBox="0 0 100 50" className="w-[80%] h-[80%] overflow-visible opacity-50">
                        <motion.path 
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 2, ease: "easeOut" }}
                            d="M 0 0 Q 20 40 40 10 L 40 10 Q 60 45 80 5 L 80 5 Q 90 20 100 2" 
                            fill="none" 
                            stroke="rgba(244,63,94,1)" 
                            strokeWidth="1.5"
                        />
                    </svg>
                </div>
            </motion.div>
        </motion.div>
    );
}
