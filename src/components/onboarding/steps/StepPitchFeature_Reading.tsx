"use client";

import React from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchFeature_Reading() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col text-left max-w-xl"
        >
            <div className="mb-6 opacity-80">
                <Search className="h-10 w-10 text-cyan-400" strokeWidth={1.5} />
            </div>

            <h2 className="font-newsreader text-3xl md:text-4xl text-white font-medium mb-4">
                解药 1：生成式专属语境库
            </h2>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
                抛弃所有通用教材。系统像一个高级情报员，实时监听并计算您的词汇图谱边界，随手为您捏造一篇满是<strong>您正需要复习的词汇和语法结构</strong>的外刊级深度好文。
            </p>

            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }}
                className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-md"
            >
                 <p className="text-sm font-semibold text-cyan-300 mb-2">TARGET: "obfuscate", "pragmatic"</p>
                 <div className="h-px w-full bg-cyan-900/50 mb-3" />
                <p className="text-base font-newsreader italic text-white/60">
                    "Rather than attempting to <span className="text-white">obfuscate</span> the core issue, her approach was ruthlessly <span className="text-white">pragmatic</span>..."
                </p>
            </motion.div>
        </motion.div>
    );
}
