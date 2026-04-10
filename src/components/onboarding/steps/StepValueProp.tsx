"use client";

import React from "react";
import { motion } from "framer-motion";
import { Wind } from "lucide-react";

export function StepValueProp() {
    return (
        <motion.div
            initial={{ opacity: 0, filter: "blur(10px)", y: 20 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            exit={{ opacity: 0, filter: "blur(10px)", y: -20 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="flex flex-col items-center text-center"
        >
            <motion.div 
                initial={{ scale: 0.8, opacity: 0, rotate: -45 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ delay: 0.4, duration: 1.8, ease: "easeOut" }}
                className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-sky-800/30 shadow-inner backdrop-blur-md"
            >
                <Wind className="h-10 w-10 text-sky-200 opacity-90" />
            </motion.div>

            <h2 className="font-newsreader text-3xl font-medium tracking-tight text-white drop-shadow-sm md:text-4xl" style={{ textWrap: "balance" } as React.CSSProperties}>
                Yasi 截然不同。
            </h2>
            
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 1 }}
                className="mt-8 flex w-full max-w-sm flex-col gap-4"
            >
                {[
                    { title: "全景语境沉浸", desc: "把枯燥的单词放入迷人的故事与外刊阅读中" },
                    { title: "AI 词法穿透", desc: "随时呼出深度词源解析，理解而非死记" },
                    { title: "自适应心流 (CAT)", desc: "动态调整阅读难度，保持最佳的挑战与专注" }
                ].map((item, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.6 + i * 0.3, duration: 0.8 }}
                        className="flex flex-col items-start rounded-2xl bg-white/[0.04] border border-white/5 p-4 text-left backdrop-blur-md"
                    >
                        <span className="font-newsreader text-lg font-bold tracking-wide text-sky-200">
                            {item.title}
                        </span>
                        <span className="mt-1 text-sm text-sky-100/70">
                            {item.desc}
                        </span>
                    </motion.div>
                ))}
            </motion.div>
        </motion.div>
    );
}
