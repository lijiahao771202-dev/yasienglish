"use client";

import React from "react";
import { motion } from "framer-motion";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchPhilosophy_Flow() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex flex-col items-center text-center px-4"
        >
            <motion.h2 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 1.5, ease: LUXURY_MOTION.ease }}
                className="font-newsreader text-4xl md:text-5xl text-white font-medium leading-tight"
            >
                Yasi 的终极哲学：<br/>
                为您打造绝对的<span className="italic font-light text-cyan-300">「心流 (Flow)」。</span>
            </motion.h2>

            <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 1 }}
                className="mt-10 text-lg md:text-xl text-white/80 max-w-lg leading-relaxed shadow-sm"
            >
                当挑战难度刚刚好，当你被极度吸引人的故事语境包裹。<br/>
                此时，你不觉得你在“受苦”，而是在享受吸收信息的快感。<br/><br/>
                接下来，看看我们用什么壁垒级科技，实现了这一切。
            </motion.p>
        </motion.div>
    );
}
