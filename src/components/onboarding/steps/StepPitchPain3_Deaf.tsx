"use client";

import React from "react";
import { motion } from "framer-motion";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchPain3_Deaf() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex flex-col text-left w-full max-w-2xl px-4"
        >
            <div className="mb-6 font-mono text-sm tracking-[0.3em] font-bold text-rose-500/80 uppercase">
                Phase 03 / Isolation
            </div>
            
            <h2 className="font-newsreader text-4xl md:text-5xl text-white font-medium leading-tight mb-8">
                文本阅读满分，<br/>
                <span className="text-white/60">面对原生语速瞬间“失聪”。</span>
            </h2>

            <p className="text-lg md:text-xl text-white/80 leading-relaxed max-w-xl">
                您买的课本配套音频全是“字正腔圆”的假人朗读。<br/><br/>
                真实的英语世界充满了变异口音、环境底噪、弱读与连读吞音。当您遇到真实的英美剧或无字幕播客时，辛苦积累的词汇量仿佛彻底蒸发，听力神经完全无法匹配。
            </p>
        </motion.div>
    );
}
