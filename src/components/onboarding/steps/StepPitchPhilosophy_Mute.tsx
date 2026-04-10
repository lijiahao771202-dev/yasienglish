"use client";

import React from "react";
import { motion } from "framer-motion";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchPhilosophy_Mute() {
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
                这一次，我们是真的想让你<br/>
                <span className="italic font-light text-rose-400">彻底告别「哑巴英语」。</span>
            </motion.h2>

            <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 1 }}
                className="text-lg md:text-xl text-white/80 max-w-lg leading-relaxed shadow-sm"
            >
                市面上有无数的应试闯关课，它们在教你怎么做题。<br/>
                但 Yasi 的终点，是让这门语言成为你的<strong>认知本能</strong>。<br/><br/>
                没有虚假的应付，只有实打实的真实世界语言重载。<br/>你要能听懂泥泞的连读，要能写出高级的从句。
            </motion.p>
        </motion.div>
    );
}
