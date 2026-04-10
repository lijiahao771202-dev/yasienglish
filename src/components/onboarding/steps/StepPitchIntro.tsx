"use client";

import React from "react";
import { motion } from "framer-motion";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchIntro() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex flex-col items-center text-center px-4"
        >
            <h1 className="font-newsreader text-5xl md:text-6xl text-white font-medium tracking-tight leading-tight" style={{ textWrap: "balance" } as React.CSSProperties}>
                终结您痛苦的<br/>
                <span className="italic text-white/90">英语学习史。</span>
            </h1>
            
            <p className="mt-8 text-lg text-white/70 max-w-md leading-relaxed">
                这不是另一款背单词软件。<br/>
                这是一套基于神经科学的认知重塑系统。
            </p>
        </motion.div>
    );
}
