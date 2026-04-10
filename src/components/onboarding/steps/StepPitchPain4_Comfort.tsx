"use client";

import React from "react";
import { motion } from "framer-motion";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchPain4_Comfort() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex flex-col text-left w-full max-w-2xl px-4"
        >
            <div className="mb-6 font-mono text-sm tracking-[0.3em] font-bold text-rose-500/80 uppercase">
                Phase 04 / Trap
            </div>
            
            <h2 className="font-newsreader text-4xl md:text-5xl text-white font-medium leading-tight mb-8">
                舒适圈的骗局：<br/>
                <span className="text-white/60">永远在用最幼态的词汇。</span>
            </h2>

            <p className="text-lg md:text-xl text-white/80 leading-relaxed max-w-xl">
                背了 8000 个单词，到了开口和写作，依然只会用 "good", "bad", "happy"。<br/><br/>
                输入与输出极度割裂。因为大量背记软件只强调“看懂即算”，从未强迫您从语境中主动把它们<strong>召唤</strong>出来。
            </p>
        </motion.div>
    );
}
