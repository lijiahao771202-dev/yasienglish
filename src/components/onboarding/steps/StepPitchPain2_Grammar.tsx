"use client";

import React from "react";
import { motion } from "framer-motion";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchPain2_Grammar() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex flex-col text-left w-full max-w-2xl px-4"
        >
            <div className="mb-6 font-mono text-sm tracking-[0.3em] font-bold text-rose-500/80 uppercase">
                Phase 02 / Illusion
            </div>
            
            <h2 className="font-newsreader text-4xl md:text-5xl text-white font-medium leading-tight mb-8">
                精通语法规则，<br/>
                <span className="text-white/60">却依然陷入“汉译英”的沼泽。</span>
            </h2>

            <p className="text-lg md:text-xl text-white/80 leading-relaxed max-w-xl">
                您可能在纸面上拿到定语从句的满分。<br/>
                但当面对《经济学人》的一段长难句时，您的第一反应依然是<strong>停下来，逐字在脑海里翻译成中文。</strong><br/><br/>
                这不是阅读，这是解密。您的英语处理核心根本没有形成直觉反射，所以阅读速度永远提不上去。
            </p>
        </motion.div>
    );
}
