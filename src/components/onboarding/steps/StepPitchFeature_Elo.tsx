"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Swords, Trophy, Target, TrendingUp } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchFeature_Elo() {
    const [rating, setRating] = useState(1200);

    useEffect(() => {
        const interval = setInterval(() => {
            setRating(prev => (prev < 2400 ? prev + Math.floor(Math.random() * 45) : 2400));
        }, 100);
        return () => clearInterval(interval);
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col items-center justify-center text-center max-w-2xl mx-auto"
        >
            <div className="relative mb-8 flex h-48 w-48 items-center justify-center">
                {/* Orbital animated rings */}
                <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border border-white/5 border-l-orange-500/30" 
                />
                <motion.div 
                    animate={{ rotate: -360 }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-4 rounded-full border border-white/10 border-r-red-500/40" 
                />

                {/* Glowing Core */}
                <div className="absolute inset-8 rounded-full bg-gradient-to-tr from-orange-600/20 to-red-600/10 blur-xl" />

                <div className="relative z-10 flex flex-col items-center justify-center">
                    <Swords className="h-10 w-10 text-orange-400 mb-2" strokeWidth={1.5} />
                    <motion.div 
                        className="text-4xl font-mono font-bold tracking-tighter text-white"
                        style={{ textShadow: "0 0 20px rgba(249,115,22,0.5)" }}
                    >
                        {rating}
                    </motion.div>
                    <div className="text-[10px] font-bold text-orange-400/60 uppercase tracking-widest mt-1">
                        Cognitive Elo
                    </div>
                </div>
            </div>

            <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 1 }}
                className="mb-6 text-3xl font-light tracking-tight text-white md:text-5xl"
            >
                最无情的 <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500">Elo 天梯系统</span>
            </motion.h2>

            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 1 }}
                className="text-lg leading-relaxed text-white/50"
            >
                在 Yasi，你的每一次阅读和发音、每一个词汇的掌握，都会实时影响你的隐藏 Elo 分数。
                <br className="hidden md:block" />
                这就像是一场全球级别的残酷电竞匹配。系统将作为最强大的发牌员，
                <br className="hidden md:block" />
                永远为你匹配那些能让你的段位疯狂飙升的“宗师级”特训对手。
            </motion.p>
        </motion.div>
    );
}
