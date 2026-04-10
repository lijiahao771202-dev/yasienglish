"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, Loader2 } from "lucide-react";
import { LUXURY_MOTION } from "../OnboardingWizard";
import { requestTtsSegmentsPayload } from "@/lib/tts-client";

export function StepPitchFeature_Voices() {
    const [activeIndex, setActiveIndex] = useState(0);

    const AVATARS = [
        { name: "Christopher", region: "US", id: 1 },
        { name: "Sonia", region: "UK", id: 2 },
        { name: "William", region: "AU", id: 3 },
        { name: "Connor", region: "IE", id: 4 },
        { name: "Luke", region: "ZA", id: 5 },
        { name: "Neerja", region: "IN", id: 6 },
        { name: "Clara", region: "CA", id: 7 },
        { name: "Mitchell", region: "NZ", id: 8 },
    ];

    useEffect(() => {
        const handleSync = (e: Event) => {
            const customEvent = e as CustomEvent<{ activeIndex: number }>;
            const index = customEvent.detail.activeIndex;
            // 0-7 are the country avatars. Index 8 is Xiaoxiao's master summary.
            if (index >= 8 || index === -1) {
                setActiveIndex(-1);
            } else {
                setActiveIndex(index);
            }
        };

        window.addEventListener('voicesSync', handleSync);
        return () => window.removeEventListener('voicesSync', handleSync);
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col text-left max-w-2xl px-4"
        >
            <div className="mb-6 opacity-80 flex items-center gap-4">
                <div className="p-3 bg-white/5 border border-white/10 rounded-2xl shadow-lg">
                    <Users className="h-8 w-8 text-purple-400" strokeWidth={1.5} />
                </div>
                
                <motion.div className="flex gap-1">
                    {[...Array(4)].map((_, i) => (
                        <motion.div 
                            key={i}
                            animate={{ height: ["4px", "20px", "4px"] }}
                            transition={{ repeat: Infinity, duration: 0.6 + i * 0.1 }}
                            className="w-1.5 bg-purple-400 rounded-full"
                        />
                    ))}
                </motion.div>
            </div>

            <h2 className="font-newsreader text-4xl md:text-5xl text-white font-medium mb-4">
                解药 4：随机变异发信源
            </h2>
            <p className="text-lg md:text-xl text-white/80 leading-relaxed mb-8">
                不要只听懂一个人的口音。Yasi 搭载了上百个不可预测的神经网络声学模型。在一段听力中，系统会极具攻击性地随机切换国籍、口音与底噪。这才是真正的<strong>反脆弱听觉训练</strong>。
            </p>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 1 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-black/40 p-4 rounded-[2rem] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
            >
                 {AVATARS.map((voice, i) => {
                     const isCurrent = activeIndex === i;
                     return (
                         <div 
                             key={voice.name}
                             className={`relative p-3 rounded-2xl border transition-all duration-500 overflow-hidden ${
                                 isCurrent 
                                 ? "bg-gradient-to-br from-purple-600/40 to-indigo-900/40 border-purple-400 scale-[1.05] shadow-[0_0_20px_rgba(168,85,247,0.3)] z-10" 
                                 : "bg-white/5 border-white/10 opacity-50 grayscale-[30%]"
                             }`}
                         >
                             {isCurrent && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_1.5s_ease-out_infinite]" />}
                             <div className="flex items-center justify-between mb-1">
                                <p className={`text-sm font-bold tracking-wide ${isCurrent ? "text-white" : "text-white/60"}`}>{voice.name}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isCurrent ? "bg-purple-500 text-white" : "bg-white/10 text-white/40"}`}>{voice.region}</span>
                             </div>
                             <p className="text-[10px] text-white/30 uppercase tracking-widest mt-2 flex items-center justify-between">
                                 <span>Neural Cast</span>
                                 <span className={isCurrent ? "text-purple-300 font-bold" : ""}>#{voice.id}</span>
                             </p>
                         </div>
                     );
                 })}
            </motion.div>
        </motion.div>
    );
}
