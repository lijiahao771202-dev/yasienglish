"use client";

import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchFeature_Scheduling() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col text-left max-w-xl"
        >
            <div className="mb-6 opacity-80">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" strokeWidth={1.5} />
            </div>

            <h2 className="font-newsreader text-3xl md:text-4xl text-white font-medium mb-4">
                解药 7：全天候智能任务流
            </h2>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
                不需要再想“今天该学什么”。<br/>
                底层调度框架早已把庞大的阅读、听力切片、错题重构任务拆解为了您潜意识可口服的日程颗粒度。只要按下开始，接下来的所有动向，系统为您自动导流。
            </p>

            <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                className="p-6 rounded-2xl bg-emerald-950/20 border border-emerald-900/30 flex flex-col gap-4 relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <CheckCircle2 className="w-32 h-32 text-emerald-500" />
                </div>
                <div className="relative z-10 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-sm text-emerald-100/90 font-medium tracking-wide">阅读前置·认知预热</span>
                    </div>
                    <div className="flex items-center gap-3 opacity-50">
                        <div className="w-2 h-2 rounded-full border border-emerald-500/50" />
                        <span className="text-sm text-emerald-100/60 font-medium tracking-wide">心流区·自适应图谱填充</span>
                    </div>
                    <div className="flex items-center gap-3 opacity-30">
                        <div className="w-2 h-2 rounded-full border border-emerald-500/30" />
                        <span className="text-sm text-emerald-100/40 font-medium tracking-wide">神经巩固·弱点精准处决</span>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
