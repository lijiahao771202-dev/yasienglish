"use client";

import React from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchReading() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col text-left max-w-xl"
        >
            <div className="mb-6 opacity-80">
                <Search className="h-10 w-10 text-cyan-400" strokeWidth={1.5} />
            </div>

            <h2 className="font-newsreader text-3xl md:text-4xl text-white font-medium mb-4">
                解药 1：全景阅读与 AI 透视
            </h2>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
                系统实时捕获您的词汇边界，生成独一无二的外刊级别爽文。不仅如此，阅读中随时呼出「词法透视图」，长难句骨架瞬间显形，彻底告别死记硬背。
            </p>

            <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-md"
            >
                <p className="text-base font-newsreader italic text-white/60 mb-4">
                    "The unprecedented phenomenon rapidly unfolds..."
                </p>
                <div className="pl-4 border-l-2 border-cyan-500/50">
                    <p className="text-sm font-semibold text-cyan-300">phenomenon (Noun) - 罕见现象</p>
                    <p className="text-sm text-white/70 mt-1">作主语。直指前置定语 unprecedented 所修饰的核心事物。</p>
                </div>
            </motion.div>
        </motion.div>
    );
}
