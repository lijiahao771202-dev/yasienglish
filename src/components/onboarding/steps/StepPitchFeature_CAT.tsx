"use client";

import React from "react";
import { motion } from "framer-motion";
import { Target } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchFeature_CAT() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col text-left max-w-xl"
        >
            <div className="mb-6 opacity-80">
                <Target className="h-10 w-10 text-amber-500" strokeWidth={1.5} />
            </div>

            <h2 className="font-newsreader text-3xl md:text-4xl text-white font-medium mb-4">
                解药 6：CAT 定级系统与 ELO
            </h2>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
                宛如国际象棋大师的动态对弈。<br/>
                Computer Adaptive Testing 引擎将永远为您锚定<strong>稍微跨越当前认知边界</strong>的阅读难度。您一旦变强，试题就立刻变狠。享受这种被无情逼迫上天的快感吧。
            </p>

            <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                className="p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-4"
            >
                <div className="flex justify-between items-center w-full">
                    <span className="text-sm text-white/50">Current Ability Network</span>
                    <span className="bg-amber-500/20 text-amber-300 text-xs font-bold px-2 py-1 rounded shadow-[0_0_10px_rgba(245,158,11,0.2)]">ELO 1680 (铂金)</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden relative">
                    <motion.div 
                        initial={{ width: "0%" }} 
                        animate={{ width: "70%" }} 
                        transition={{ duration: 1.5, delay: 1 }}
                        className="h-full bg-amber-500 relative"
                    >
                        <div className="absolute top-0 right-0 h-full w-20 bg-gradient-to-r from-transparent to-white/50" />
                    </motion.div>
                </div>
                <p className="text-xs text-white/40 mt-1 uppercase tracking-wider font-mono">Difficulty threshold dynamically increased +2.5%</p>
            </motion.div>
        </motion.div>
    );
}
