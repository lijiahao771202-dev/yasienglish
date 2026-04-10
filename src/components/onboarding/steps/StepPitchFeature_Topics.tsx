"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Brain, Atom, Globe2 } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";

export function StepPitchFeature_Topics() {
    const TOPICS = ["神经生物学", "赛博朋克文学", "文艺复兴史", "量子力学", "硅谷风投研报", "北欧极简美学"];

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col items-center justify-center text-center max-w-3xl mx-auto"
        >
            <div className="relative mb-12 h-64 w-full max-w-sm">
                <div className="absolute inset-0 flex items-center justify-center">
                    <Globe2 className="h-16 w-16 text-cyan-500/20" strokeWidth={1} />
                    <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute w-32 h-32 rounded-full bg-cyan-500/10 blur-2xl" 
                    />
                </div>

                {TOPICS.map((topic, i) => {
                    const angle = (i / TOPICS.length) * Math.PI * 2;
                    const radius = 110;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;

                    return (
                        <motion.div
                            key={topic}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.5 + i * 0.1, duration: 0.8, ease: LUXURY_MOTION.ease }}
                            className="absolute left-1/2 top-1/2 flex items-center justify-center"
                            style={{ 
                                marginLeft: x - 40,
                                marginTop: y - 10,
                                width: 80
                            }}
                        >
                            <motion.div
                                animate={{ y: [0, -5, 0] }}
                                transition={{ duration: 3, delay: i * 0.2, repeat: Infinity, ease: "easeInOut" }}
                                className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-medium text-cyan-200/70 whitespace-nowrap backdrop-blur-md shadow-[0_0_15px_rgba(34,211,238,0.05)]"
                            >
                                {topic}
                            </motion.div>
                        </motion.div>
                    );
                })}
            </div>

            <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 1 }}
                className="mb-6 text-3xl font-light tracking-tight text-white md:text-5xl"
            >
                永不枯竭的 <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">庞大语料漫游</span>
            </motion.h2>

            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 1 }}
                className="text-lg leading-relaxed text-white/50"
            >
                课本里那些无聊的家庭对话，永远无法让你产生分泌多巴胺的渴望。
                <br className="hidden md:block" />
                Yasi 的全局随机主题流，涵盖了全球顶级的几万个细分前沿节点。
                <br className="hidden md:block" />
                今天探索天体物理，明天潜入黑暗网络……你在用母语级别的猎奇心，不知不觉中进行英语的高强度吞吐。
            </motion.p>
        </motion.div>
    );
}
