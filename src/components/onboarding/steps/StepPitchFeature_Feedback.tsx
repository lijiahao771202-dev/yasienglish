"use client";

import React, { useEffect, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { Zap, Flame, Target, Trophy, Crown } from "lucide-react";
import confetti from "canvas-confetti";
import { LUXURY_MOTION } from "../OnboardingWizard";

// We will use actual valid audio files that exist in the system and range from light to heavy
// 1. reverser_intro.mp3 (light/medium)
// 2. lightning_intro.mp3 (medium/electric)
// 3. gamble_intro.mp3 (heavy)
// 4. gunshot.mp3 (extreme)

const FEEDBACK_LEVELS = [
    {
        tier: "GOOD",
        color: "from-emerald-400 to-green-500",
        shadow: "rgba(16,185,129,0.5)",
        borderColor: "border-emerald-200",
        icon: Target,
        sfx: "/reverser_intro.mp3",
        scale: [1, 1.15, 1], // Mild bounce
        confetti: false,
        shake: 0,
        delayBeforeNext: 1200,
    },
    {
        tier: "EXCELLENT",
        color: "from-blue-400 to-cyan-400",
        shadow: "rgba(6,182,212,0.6)",
        borderColor: "border-cyan-200",
        icon: Zap,
        sfx: "/lightning_intro.mp3",
        scale: [1, 1.3, 0.95, 1.05, 1], // Medium bouncy
        confetti: false,
        shake: 3, // Mild screen jitter
        delayBeforeNext: 1500,
    },
    {
        tier: "UNSTOPPABLE",
        color: "from-purple-500 to-fuchsia-500",
        shadow: "rgba(217,70,239,0.8)",
        borderColor: "border-fuchsia-300",
        icon: Trophy,
        sfx: "/gamble_intro.mp3",
        scale: [1, 1.6, 0.85, 1.2, 1], // Aggressive elastic
        confetti: true,
        confettiColors: ['#d946ef', '#a855f7', '#ffffff'],
        confettiAmount: 60,
        shake: 8, // Heavy shake
        delayBeforeNext: 2000,
    },
    {
        tier: "GODLIKE",
        color: "from-red-600 to-rose-500",
        shadow: "rgba(225,29,72,1)",
        borderColor: "border-red-300",
        icon: Crown,
        sfx: "/sfx/gunshot.mp3", 
        scale: [1, 2.2, 0.7, 1.4, 0.9, 1.1, 1], // Violent bounce
        confetti: true,
        confettiColors: ['#e11d48', '#f43f5e', '#fbbf24', '#ffffff'],
        confettiAmount: 200, // Massive explosion
        shake: 25, // Earthquake
        delayBeforeNext: 3000,
    }
];

export function StepPitchFeature_Feedback() {
    const controls = useAnimation();
    const layoutControls = useAnimation();
    const [levelIndex, setLevelIndex] = useState(0);
    const [score, setScore] = useState(0);

    const currentLevel = FEEDBACK_LEVELS[levelIndex];
    const Icon = currentLevel.icon;

    useEffect(() => {
        let isActive = true;

        const pumpFeedback = async () => {
            let i = 0;
            while (isActive) {
                const lvl = FEEDBACK_LEVELS[i % FEEDBACK_LEVELS.length];
                setLevelIndex(i % FEEDBACK_LEVELS.length);

                // Stop previous audio completely to prevent overlap muddying
                const audio = new Audio(lvl.sfx);
                audio.volume = lvl.tier === "GODLIKE" ? 1.0 : (lvl.tier === "UNSTOPPABLE" ? 0.7 : 0.5);
                audio.play().catch(() => {});

                // Conditionally fire confetti
                if (lvl.confetti) {
                    const screenX = window.innerWidth / 2;
                    const screenY = window.innerHeight / 2 + 50;
                    confetti({
                        particleCount: lvl.confettiAmount,
                        spread: lvl.tier === "GODLIKE" ? 160 : 70,
                        startVelocity: lvl.tier === "GODLIKE" ? 60 : 35,
                        gravity: lvl.tier === "GODLIKE" ? 1.2 : 1,
                        origin: { 
                            x: screenX / window.innerWidth, 
                            y: screenY / window.innerHeight 
                        },
                        colors: lvl.confettiColors,
                        disableForReducedMotion: true,
                        zIndex: 99999
                    });
                }

                setScore(prev => prev + (i % FEEDBACK_LEVELS.length + 1) * 55);

                // Substantial Bloom & Scale Push
                controls.start({
                    scale: lvl.scale,
                    filter: ["brightness(1)", `brightness(${lvl.tier === "GODLIKE" ? 4 : 2})`, "brightness(1)"],
                    transition: { duration: lvl.tier === "GODLIKE" ? 0.8 : 0.5, ease: "backOut" }
                });

                // Screen Earthquake
                if (lvl.shake > 0) {
                    layoutControls.start({
                        x: [0, -lvl.shake, lvl.shake, -lvl.shake*0.8, lvl.shake*0.8, -lvl.shake*0.4, 0],
                        y: [0, lvl.shake, -lvl.shake, lvl.shake*0.8, -lvl.shake*0.8, lvl.shake*0.4, 0],
                        rotate: lvl.tier === "GODLIKE" ? [0, -2, 2, -1, 1, 0] : 0,
                        transition: { duration: 0.5, ease: "easeInOut" }
                    });
                }

                // Wait before moving to next stronger logic
                await new Promise((r) => setTimeout(r, lvl.delayBeforeNext));
                i++;
                if (!isActive) break;
            }
        };

        setTimeout(() => {
            if (isActive) pumpFeedback();
        }, 800);

        return () => {
            isActive = false;
        };
    }, [controls, layoutControls]);

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex w-full flex-col text-left max-w-xl relative"
        >
            <div className="mb-6 opacity-80">
                <Flame className="h-10 w-10 text-rose-500" strokeWidth={1.5} />
            </div>

            <h2 className="font-newsreader text-3xl md:text-4xl text-white font-medium mb-4">
                解药 8：阶梯式暴击反馈泵
            </h2>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
                深海探险般逐渐深入的感官回馈。<br/>
                从微弱的确认声，到电火花的炸脱，再到宛如史诗战场上的重型打击。四阶层层递进的特效与声响，让大脑不可逆转地迷恋上每一步的正确抉择。
            </p>

            {/* Container mapping shaking bounds */}
            <motion.div 
                animate={layoutControls}
                className="flex flex-col items-center justify-center p-12 rounded-[2.5rem] bg-black border-4 relative mb-8"
                style={{ 
                    borderColor: currentLevel.shadow.replace(/[\d.]+\)$/g, '0.2)'),
                    boxShadow: `inset 0 0 100px ${currentLevel.shadow.replace(/[\d.]+\)$/g, '0.15)')}, 0 0 ${levelIndex * 20}px ${currentLevel.shadow.replace(/[\d.]+\)$/g, '0.2)')}` 
                }}
            >
                {/* Background ambient pulse */}
                <motion.div 
                    animate={{ opacity: [0.1, 0.4, 0.1], scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className={`absolute inset-0 bg-gradient-to-t ${currentLevel.color} blur-[100px] opacity-20`}
                />

                {/* Intense hit UI */}
                <motion.div 
                    animate={controls}
                    className={`relative z-10 flex flex-col items-center justify-center w-56 h-40 rounded-3xl bg-gradient-to-tr ${currentLevel.color} border-2 ${currentLevel.borderColor} will-change-transform`}
                    style={{ 
                        boxShadow: `0 20px 40px ${currentLevel.shadow.replace(/[\d.]+\)$/g, '0.5)')}, 0 0 80px ${currentLevel.shadow}` 
                    }}
                >
                    <motion.div 
                        key={`icon-${currentLevel.tier}`}
                        initial={{ opacity: 0, scale: 0, rotate: -45 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        className={`absolute -top-8 -right-8 text-white ${levelIndex >= 2 ? "drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]" : ""}`}
                    >
                        <Icon className={`w-16 h-16 ${levelIndex === 3 ? "animate-pulse hidden" : ""}`} />
                        {levelIndex === 3 && <Flame className="w-16 h-16 animate-ping absolute top-0 left-0 text-white" />}
                        {levelIndex === 3 && <Flame className="w-16 h-16 text-yellow-200" />}
                    </motion.div>
                    
                    <span className="font-black text-6xl text-white tracking-tighter italic mr-2 drop-shadow-[0_4px_4px_rgba(0,0,0,0.4)]">
                        {score}
                    </span>
                    <motion.span 
                        key={`label-${currentLevel.tier}`}
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="absolute -bottom-5 bg-black text-white text-sm font-black uppercase tracking-widest px-5 py-2 rounded-full border-2 shadow-[0_5px_15px_rgba(0,0,0,0.5)]"
                        style={{ borderColor: currentLevel.shadow.replace(/[\d.]+\)$/g, '1)') }}
                    >
                        {currentLevel.tier}
                    </motion.span>
                </motion.div>
            </motion.div>
        </motion.div>
    );
}
