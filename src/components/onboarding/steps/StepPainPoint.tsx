"use client";

import React from "react";
import { motion } from "framer-motion";

export function StepPainPoint() {
    return (
        <motion.div
            initial={{ opacity: 0, filter: "blur(10px)", y: 20 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            exit={{ opacity: 0, filter: "blur(10px)", y: -20 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="flex flex-col items-center text-center"
        >
            <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, duration: 1.5, ease: "easeOut" }}
                className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-slate-800/50 shadow-inner backdrop-blur-md"
            >
                {/* Abstract heavy/chain representation or a simple tired sigh icon */}
                <svg className="h-10 w-10 text-slate-400 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </motion.div>

            <h2 className="font-newsreader text-3xl font-medium tracking-tight text-white drop-shadow-sm md:text-4xl" style={{ textWrap: "balance" } as React.CSSProperties}>
                传统的英语学习，<br />就像在脑海里搬砖。
            </h2>
            
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 1 }}
                className="mt-6 flex flex-col items-center space-y-4"
            >
                <p className="max-w-[280px] text-base font-medium text-slate-300 leading-relaxed md:max-w-xs md:text-lg">
                    强行记忆，痛苦挣扎。<br />耗尽了心力，却依然无法用英语思考。
                </p>

                <div className="mt-4 flex flex-col gap-3">
                    {[
                        "背了忘，忘了背的无尽循环",
                        "面对长难句时的深深无力感",
                        "无法脱口而出的哑巴英语",
                    ].map((text, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 0.4, x: 0 }}
                            transition={{ delay: 2 + i * 0.4, duration: 0.8 }}
                            className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2"
                        >
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/20 text-[10px] font-bold text-rose-300">
                                X
                            </span>
                            <span className="text-sm tracking-wide text-rose-200 line-through decoration-rose-500/50">
                                {text}
                            </span>
                        </motion.div>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    );
}
