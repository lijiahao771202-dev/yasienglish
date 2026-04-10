"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Network } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchFeature_Vocab() {
    const [phase, setPhase] = useState(0);

    // 0: Isolated Word Card
    // 1: Network Lines Context
    // 2: Paragraph

    useEffect(() => {
        const t1 = setTimeout(() => setPhase(1), 2500);
        const t2 = setTimeout(() => setPhase(2), 4000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col items-center justify-center text-center max-w-4xl mx-auto"
        >
            <div className="relative mb-12 flex h-[280px] w-full max-w-2xl items-center justify-center perspective-1000">
                <AnimatePresence mode="wait">
                    {phase === 0 && (
                        <motion.div 
                            key="word"
                            exit={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
                            className="flex flex-col items-center justify-center rounded-2xl bg-white/5 border border-white/10 p-8 w-64 shadow-2xl"
                        >
                            <div className="text-3xl font-serif text-white mb-2">Ephemeral</div>
                            <div className="text-white/40 text-sm">/əˈfem(ə)rəl/</div>
                            <div className="mt-4 text-white/70 text-sm">adj. 短暂的；朝生暮死的</div>
                            <div className="absolute -top-3 -right-3 rotate-12 text-red-500/80 font-bold bg-black/80 px-2 py-1 rounded text-xs border border-red-500/30">传统死记硬背</div>
                        </motion.div>
                    )}

                    {phase >= 1 && (
                        <motion.div 
                            key="context"
                            initial={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
                            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                            transition={{ duration: 1 }}
                            className="relative text-left w-full rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent border border-white/10 p-8 md:p-10 shadow-2xl"
                        >
                            <Network className="absolute top-4 right-4 h-6 w-6 text-purple-400/30" />
                            <p className="text-xl md:text-2xl font-serif leading-relaxed text-white/50 tracking-wide">
                                The beauty of a cherry blossom exists not despite its fragility, but precisely because of its <motion.span 
                                    className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mx-1"
                                    animate={{ textShadow: ["0 0 0px #c084fc", "0 0 20px #c084fc", "0 0 0px #c084fc"] }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                >ephemeral</motion.span> nature. It blooms only for a fleeting moment.
                            </p>
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 1.5 }}
                                className="mt-6 flex border-l-2 border-purple-500/50 pl-4 py-1 flex-col"
                            >
                                <span className="text-sm font-medium text-purple-300/80 mb-1">自然隐性建构</span>
                                <span className="text-xs text-white/40">系统自动根据上下文记忆点生成 FSRS 复习弧</span>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 1 }}
                className="mb-6 text-3xl font-light tracking-tight text-white md:text-5xl"
            >
                绝对禁止 <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">背单词</span>
            </motion.h2>

            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 1 }}
                className="text-lg leading-relaxed text-white/50"
            >
                看着干瘪的中英对照词汇表死记硬背，是对大脑皮层最大的侮辱。
                <br className="hidden md:block" />
                Yasi 生词本系统强迫你在自然、鲜活的阅读文章里偶遇生词。
                <br className="hidden md:block" />
                通过强大的上下文语境编织，为你建立母语者般的原生语义直觉。这才是 FSRS 自由间隔复习算法的真谛。
            </motion.p>
        </motion.div>
    );
}
