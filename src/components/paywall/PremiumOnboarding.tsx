"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { X, Sparkles, Zap, BrainCircuit, Mic2 } from "lucide-react";
import { SubscriptionCard } from "./SubscriptionCard";
import { cn } from "@/lib/utils";

interface PremiumOnboardingProps {
    onClose: () => void;
    onStartTrial: (planId: string) => void;
}

const PREMIUM_FEATURES = [
    { icon: <Sparkles className="w-5 h-5 text-indigo-300" />, text: "AI 词汇精准溯源引擎" },
    { icon: <Zap className="w-5 h-5 text-purple-300" />, text: "全栈深层语法解析" },
    { icon: <BrainCircuit className="w-5 h-5 text-blue-300" />, text: "沉浸式CAT自适应训练" },
    { icon: <Mic2 className="w-5 h-5 text-emerald-300" />, text: "高保真全频段语音合成" },
];

export function PremiumOnboarding({ onClose, onStartTrial }: PremiumOnboardingProps) {
    const [selectedPlan, setSelectedPlan] = useState<string>("yearly");
    const [showCloseButton, setShowCloseButton] = useState(false);

    // Delayed close button for maximum conversion focus
    useEffect(() => {
        const timer = setTimeout(() => setShowCloseButton(true), 2500);
        return () => clearTimeout(timer);
    }, []);

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.15, delayChildren: 0.3 }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 30, filter: "blur(8px)" },
        visible: {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            transition: { type: "spring" as const, stiffness: 200, damping: 25, mass: 1 }
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-slate-900 text-slate-50 font-sans">
            {/* Animated Ambient Background (Now Meditation Style) */}
            <div className="pointer-events-none absolute inset-0 z-0">
                <motion.div
                    animate={{
                        scale: [1, 1.05, 1],
                        opacity: [0.4, 0.6, 0.4],
                    }}
                    transition={{
                        duration: 8,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    className="absolute -left-[20%] -top-[10%] h-[60vh] w-[60vw] rounded-full bg-indigo-500/30 blur-[120px]"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.3, 0.5, 0.3],
                    }}
                    transition={{
                        duration: 10,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 2
                    }}
                    className="absolute -bottom-[20%] -right-[10%] h-[70vh] w-[70vw] rounded-full bg-purple-600/20 blur-[130px]"
                />
                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[30px]" />
                
                {/* Subtle Noise Texture overlay */}
                <div 
                    className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
                />
            </div>

            {/* Delayed Close Button */}
            <AnimatePresence>
                {showCloseButton && (
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute right-6 top-6 z-50 rounded-full p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Skip for now"
                    >
                        <X className="h-6 w-6" />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Main Content Area */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="relative z-10 flex w-full max-w-lg flex-col items-center px-6 text-center"
            >
                {/* Header Section */}
                <motion.div variants={itemVariants} className="mb-2">
                    <span className="inline-flex rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-200 backdrop-blur-sm">
                        Yasi Premium
                    </span>
                </motion.div>

                <motion.h1 
                    variants={itemVariants}
                    className="font-newsreader w-full text-center text-[2.75rem] font-medium leading-[1.1] tracking-tight drop-shadow-sm md:text-5xl"
                    style={{ textWrap: "balance" } as React.CSSProperties}
                >
                    突破语言边界，<br className="hidden sm:block" />进入心流状态。
                </motion.h1>

                <motion.p variants={itemVariants} className="mt-4 max-w-[280px] text-sm text-slate-300 md:max-w-xs md:text-base">
                    解锁全部高阶学习特权，每天一杯咖啡钱，给自己一次重塑语言神经的机会。
                </motion.p>

                {/* Features List */}
                <motion.div variants={itemVariants} className="mt-10 w-full space-y-3">
                    {PREMIUM_FEATURES.map((feature, i) => (
                        <div key={i} className="flex items-center gap-4 border-b border-white/5 pb-3 pl-2 text-left text-sm font-medium text-slate-200">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 p-1.5 shadow-inner">
                                {feature.icon}
                            </div>
                            <span className="tracking-wide">{feature.text}</span>
                        </div>
                    ))}
                </motion.div>

                {/* Subscription Options */}
                <motion.div variants={itemVariants} className="mt-10 flex w-full flex-col gap-4">
                    <SubscriptionCard
                        id="yearly"
                        title="连续包年套餐"
                        price="¥188"
                        period="/ 年"
                        description="折合每月仅需 ¥15.6，持续沉浸无压力"
                        isPopular
                        popularLabel="最佳性价比 立省 50%"
                        isSelected={selectedPlan === "yearly"}
                        onSelect={setSelectedPlan}
                    />
                    <SubscriptionCard
                        id="monthly"
                        title="连续包月套餐"
                        price="¥28"
                        period="/ 月"
                        description="随时取消，随心体验"
                        isSelected={selectedPlan === "monthly"}
                        onSelect={setSelectedPlan}
                    />
                </motion.div>

                {/* CTA Button */}
                <motion.div variants={itemVariants} className="mt-8 w-full">
                    <button
                        onClick={() => onStartTrial(selectedPlan)}
                        className="group relative flex h-14 w-full items-center justify-center overflow-hidden rounded-[20px] bg-white text-base font-bold text-slate-900 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_40px_rgba(255,255,255,0.2)]"
                    >
                        <span className="relative z-10 transition-transform duration-300 group-hover:scale-105">
                            开始 7 天免费试用
                        </span>
                        
                        {/* Continuous Shimmer Effect */}
                        <div className="absolute inset-0 z-0 -translate-x-[150%] animate-[shimmer_3s_infinite] bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.05),transparent)]" />
                    </button>
                    <p className="mt-4 text-[11px] text-white/40">
                        7天试用期后将自动扣费。您可以在试用期结束前随时取消。
                    </p>
                </motion.div>

            </motion.div>
        </div>
    );
}
