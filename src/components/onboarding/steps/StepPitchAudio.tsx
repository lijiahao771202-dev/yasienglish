"use client";

import React from "react";
import { motion } from "framer-motion";
import { Headphones } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchAudio() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col text-left max-w-xl"
        >
            <div className="mb-6 opacity-80">
                <Headphones className="h-10 w-10 text-fuchsia-400" strokeWidth={1.5} />
            </div>

            <h2 className="font-newsreader text-3xl md:text-4xl text-white font-medium mb-4">
                解药 2：极度真实的听力舱
            </h2>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
                摆脱千篇一律的机器朗读。内置数百种随机发音人（Random Speakers），涵盖环境底噪与多维度口音，让您在充满不确定性的声场中，淬炼出母语级别的听觉神经。
            </p>

            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6, duration: 1 }}
                className="flex items-center gap-1.5 h-20 w-full justify-center p-6 rounded-2xl bg-white/5 border border-white/10"
            >
                {[...Array(24)].map((_, i) => (
                    <motion.div 
                        key={i}
                        animate={{ height: ["20%", Math.random() > 0.5 ? "90%" : "50%", "20%"] }}
                        transition={{ 
                            duration: 1 + Math.random(), 
                            repeat: Infinity, 
                            ease: "easeInOut"
                        }}
                        className={`w-2 rounded-full ${i % 4 === 0 ? "bg-fuchsia-400" : "bg-white/30"}`}
                    />
                ))}
            </motion.div>
        </motion.div>
    );
}
