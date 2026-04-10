"use client";

import React from "react";
import { motion } from "framer-motion";
import { Eye } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchFeature_Syntax() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col text-left max-w-xl"
        >
            <div className="mb-6 opacity-80">
                <Eye className="h-10 w-10 text-blue-400" strokeWidth={1.5} />
            </div>

            <h2 className="font-newsreader text-3xl md:text-4xl text-white font-medium mb-4">
                解药 2：神级透视句法骨架
            </h2>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
                阅读长难句就像在走钢丝？不用再自己拆解了。任何卡住您的结构，只需一点，瞬间以<strong>上帝视角</strong>展开词法树形图，主谓宾定状补立刻显式呈现，语法障碍被彻底粉碎。
            </p>

            <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                className="p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-4"
            >
                <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-base font-newsreader italic text-white/40">It is</span>
                    <span className="relative">
                        <span className="text-base font-newsreader italic text-blue-300">the phenomenon</span>
                        <motion.div className="absolute -bottom-1 left-0 h-px bg-blue-500 w-full" />
                    </span>
                    <span className="text-base font-newsreader italic text-white/40">that dictates...</span>
                </div>
                <div className="pl-4 border-l-2 border-blue-500/50">
                    <p className="text-sm font-semibold text-blue-300">表语成分 (Predicative)</p>
                    <p className="text-sm text-white/70 mt-1">这里由 It 引导强调句型，将被强调对象 phenomenon 置于聚光灯下。</p>
                </div>
            </motion.div>
        </motion.div>
    );
}
