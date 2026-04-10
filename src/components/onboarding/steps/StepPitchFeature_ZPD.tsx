"use client";

import React from "react";
import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchFeature_ZPD() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col text-left max-w-xl"
        >
            <div className="mb-6 opacity-80">
                <Compass className="h-10 w-10 text-teal-400" strokeWidth={1.5} />
            </div>

            <h2 className="font-newsreader text-3xl md:text-4xl text-white font-medium mb-4">
                解药 5：锁定「最近发展区」
            </h2>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
                太简单的内容让人无聊，太难的内容让人溃散。<br/>
                Yasi 底层装载了维果茨基（Vygotsky）的 ZPD 引擎。它会每天精准测绘你的认知边缘，确保每一篇文章、每一句话，都恰好位于你<strong>“踮起脚尖刚刚能摘到”的区域</strong>。
            </p>

            <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                className="p-6 rounded-2xl bg-teal-950/20 border border-teal-900/30 flex flex-col gap-6 relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Compass className="w-48 h-48 text-teal-400 rotate-12" />
                </div>
                
                <div className="flex flex-col gap-2 relative z-10 w-full pl-6 border-l-2 border-teal-400/20">
                    <div className="flex items-center gap-4 group">
                        <div className="w-3 h-3 rounded-full border border-white/20 bg-transparent absolute -left-[7px] transition-colors" />
                        <span className="text-white/30 text-sm w-16">Comfort</span>
                        <div className="h-2 w-full max-w-[120px] bg-white/10 rounded-full" />
                    </div>
                    
                    <div className="flex items-center gap-4 py-2 relative">
                        <div className="w-3 h-3 rounded-full bg-teal-400 absolute -left-[7px] shadow-[0_0_15px_rgba(45,212,191,0.8)]" />
                        <span className="text-teal-300 text-sm font-bold w-16 drop-shadow-md">Z P D</span>
                        <div className="h-3 w-full max-w-[200px] bg-gradient-to-r from-teal-500/50 to-teal-400 rounded-full relative overflow-hidden">
                            <motion.div 
                                animate={{ x: ["-100%", "200%"] }} 
                                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                                className="absolute top-0 left-0 w-1/2 h-full bg-white/30 blur-sm skew-x-12"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full border border-rose-500/30 bg-transparent absolute -left-[7px]" />
                        <span className="text-rose-400/50 text-sm w-16">Anxiety</span>
                        <div className="h-2 w-full max-w-[90px] bg-rose-500/20 rounded-full" />
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
