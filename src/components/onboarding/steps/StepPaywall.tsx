"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { LUXURY_MOTION } from "../OnboardingWizard";
import { ArrowRight } from "lucide-react";

interface StepPaywallProps {
    onStartTrial: (planId: string) => void;
}

export function StepPaywall({ onStartTrial }: StepPaywallProps) {
    const [selectedPlan, setSelectedPlan] = useState<string>("yearly");

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col items-center justify-center pt-4 md:pt-12 relative max-w-4xl mx-auto px-4 overflow-hidden"
        >
            {/* Elegant Soft Volumetric Glow - strictly contained to avoid scrollbars */}
            <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
                <div className="w-[80vw] max-w-[800px] aspect-square rounded-full bg-[radial-gradient(circle_at_center,rgba(0,113,227,0.06)_0%,transparent_70%)] opacity-0 animate-[fadeIn_2s_ease-out_forwards]" />
                <div className="absolute w-[60vw] max-w-[600px] aspect-square rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,1)_0%,transparent_60%)] -translate-y-20 opacity-0 animate-[fadeIn_2s_ease-out_forwards]" />
            </div>

            <div className="z-10 flex flex-col items-center text-center w-full relative">
                
                {/* Ultra-Premium Frosted Glass App Icon */}
                <motion.div 
                    initial={{ y: 40, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{ duration: 1.3, delay: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
                    className="relative mb-8 group"
                >
                    <div className="absolute inset-0 blur-[40px] bg-blue-500/10 rounded-full scale-125 transition-all duration-700 group-hover:scale-150 group-hover:bg-blue-500/20 pointer-events-none" />
                    
                    <div className="relative w-36 h-36 md:w-48 md:h-48 rounded-[2rem] md:rounded-[2.8rem] bg-white/50 backdrop-blur-[40px] border border-white/60 shadow-[0_20px_40px_rgba(0,0,0,0.04),inset_0_2px_15px_rgba(255,255,255,1)] flex items-center justify-center overflow-hidden transition-transform duration-700 hover:scale-[1.03]">
                        {/* Upper highlight reflection */}
                        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/80 to-transparent pointer-events-none" />
                        
                        {/* Vibrant Gradient Logo */}
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 1, delay: 0.8 }}
                            className="bg-gradient-to-br from-blue-600 via-[#1d1d1f] to-indigo-800 bg-clip-text text-transparent text-7xl md:text-8xl font-serif font-black tracking-tighter"
                        >
                            Y
                        </motion.div>
                        
                        {/* Diagonal glass sweep on hover */}
                        <div className="absolute inset-0 -translate-x-[150%] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12 opacity-0 group-hover:opacity-100 transition-opacity group-hover:animate-[shimmer_1.5s_ease-out_infinite] pointer-events-none" />
                    </div>
                </motion.div>

                {/* Premium High-Converting Copy */}
                <motion.h1 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className="text-4xl md:text-[3.25rem] font-bold tracking-tight text-[#1d1d1f] mb-4 leading-tight"
                >
                    碾压听说壁垒的终极解药
                </motion.h1>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.7 }}
                    className="text-[#515154] mb-12 text-[15px] md:text-[17px] tracking-wide font-medium max-w-[480px] leading-relaxed"
                >
                    获取 Yasi 认知引擎最高权限。解锁上百套<span className="text-[#1d1d1f] font-bold">变异战术口音</span>与独家<span className="text-[#1d1d1f] font-bold">数字听力舱</span>，每天仅需 15 分钟，即可生硬淬炼出无坚不摧的绝对语感。
                </motion.p>
                
                {/* Premium iOS-style Configurator */}
                <motion.div 
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 1, delay: 0.9 }}
                    className="relative z-20 w-full max-w-[360px] flex flex-col gap-6"
                >
                     <div className="flex bg-[#f5f5f7] p-1.5 border border-[#e5e5ea] rounded-[2rem] justify-center relative shadow-inner">
                         <motion.div 
                             layoutId="paywallPlanSelector"
                             className="absolute top-1.5 bottom-1.5 rounded-[1.6rem] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.03]"
                             initial={false}
                             animate={{
                                left: selectedPlan === 'monthly' ? '0.375rem' : '50%',
                                width: 'calc(50% - 0.5rem)'
                             }}
                             transition={{ type: "spring" as const, bounce: 0.15, duration: 0.5 }}
                         />

                         <div 
                             onClick={() => setSelectedPlan('monthly')}
                             className={`cursor-pointer flex-1 py-5 px-2 rounded-[1.6rem] relative z-10 transition-colors duration-300 flex flex-col items-center justify-center ${selectedPlan === 'monthly' ? 'text-[#1d1d1f]' : 'text-[#86868b] hover:text-[#515154]'}`}
                         >
                             <div className="text-[11px] font-bold mb-1 uppercase tracking-widest opacity-80">单月冲刺</div>
                             <div className="text-3xl font-extrabold font-sans tracking-tight">¥28</div>
                         </div>
                         <div 
                             onClick={() => setSelectedPlan('yearly')}
                             className={`cursor-pointer flex-1 py-5 px-2 rounded-[1.6rem] relative z-10 transition-colors duration-300 flex flex-col items-center justify-center ${selectedPlan === 'yearly' ? 'text-[#1d1d1f]' : 'text-[#86868b] hover:text-[#515154]'}`}
                         >
                             <div className="text-[11px] font-bold mb-0.5 uppercase tracking-widest text-[#0071e3]">进阶核心玩家</div>
                             <div className="text-4xl font-black font-sans tracking-tight -ml-1">¥188</div>
                         </div>
                     </div>
                     
                     <div className="w-full mt-2">
                         <button
                            onClick={() => onStartTrial(selectedPlan)}
                            className="group w-full flex h-[3.8rem] items-center justify-center rounded-full bg-[#1d1d1f] text-[17px] font-semibold text-white shadow-[0_4px_14px_rgba(0,0,0,0.1)] transition-all hover:scale-[1.02] hover:bg-black hover:shadow-[0_8px_25px_rgba(0,0,0,0.2)] active:scale-95"
                         >
                             <span className="flex items-center gap-2">
                                 获取授权并启动引擎 <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                             </span>
                         </button>
                     </div>
                     <p className="text-[12px] font-medium text-[#86868b] tracking-wide mt-1">7 天无理由极速退款 · 随时在系统内自助取消</p>

                </motion.div>
            </div>
        </motion.div>
    );
}

