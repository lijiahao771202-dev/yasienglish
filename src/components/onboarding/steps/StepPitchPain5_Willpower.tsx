"use client";

import React from "react";
import { motion } from "framer-motion";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchPain5_Willpower() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex flex-col text-left w-full max-w-2xl px-4"
        >
            <div className="mb-6 font-mono text-sm tracking-[0.3em] font-bold text-rose-500/80 uppercase">
                Phase 05 / Burnout
            </div>
            
            <h2 className="font-newsreader text-4xl md:text-5xl text-white font-medium leading-tight mb-8">
                被游戏化榨干的意志力，<br/>
                <span className="text-white/60">学习成了无意义的打卡纪律。</span>
            </h2>

            <p className="text-lg md:text-xl text-white/80 leading-relaxed max-w-xl">
                强迫连胜、打卡日历、好友排名……这些廉价的多巴胺系统，只是为了掩盖学习内容本身的枯燥。<br/><br/>
                真正有效的习得，不需要强迫。如果它足够自然、足够引人入胜，打卡就只是一种可笑的束缚。
            </p>
        </motion.div>
    );
}
