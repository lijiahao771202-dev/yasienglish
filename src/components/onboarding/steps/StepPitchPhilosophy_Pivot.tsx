"use client";

import React from "react";
import { motion } from "framer-motion";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchPhilosophy_Pivot() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex flex-col items-center text-center px-4"
        >
            <motion.h2 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 1.5, ease: LUXURY_MOTION.ease }}
                className="font-newsreader text-4xl md:text-5xl text-white font-medium leading-tight mb-10"
            >
                语言，从来就不该被“学习”。<br/>
                <span className="italic font-light text-cyan-300">它是被“习得”的。</span>
            </motion.h2>

            <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 1 }}
                className="text-lg md:text-xl text-white/80 max-w-lg leading-relaxed shadow-sm"
            >
                就像您小时候从未背诵过《汉语语法词典》，却能流利表达。<br/>
                因为大脑只在有意义的上下文交互中，建立神经元连接。<br/><br/>
                停止死记硬背。转向真正的认知重塑。
            </motion.p>
        </motion.div>
    );
}
