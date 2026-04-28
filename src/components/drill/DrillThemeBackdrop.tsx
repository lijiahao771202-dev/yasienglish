"use client";

import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

type BattleTheme = "default" | "fever" | "boss" | "crimson";

const LILAC_ORB_CONFIG = [
    { left: "24%", top: "28%", driftX: 36, driftY: -24, duration: 9.5, delay: 0.4 },
    { left: "42%", top: "18%", driftX: -42, driftY: 28, duration: 11.2, delay: 1.1 },
    { left: "61%", top: "34%", driftX: 48, driftY: 36, duration: 13.1, delay: 0.8 },
    { left: "33%", top: "56%", driftX: -30, driftY: -34, duration: 10.4, delay: 2.3 },
    { left: "57%", top: "62%", driftX: 26, driftY: -22, duration: 12.4, delay: 1.7 },
    { left: "74%", top: "46%", driftX: -38, driftY: 30, duration: 14.2, delay: 2.8 },
] as const;

export interface DrillThemeBackdropProps {
    activeCosmeticTheme: {
        bgClass: string;
        isDark: boolean;
    };
    cosmeticTheme: string;
    theme: BattleTheme;
}

export function DrillThemeBackdrop({
    activeCosmeticTheme,
    cosmeticTheme,
    theme,
}: DrillThemeBackdropProps) {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
            <AnimatePresence mode="popLayout">
                {theme === "fever" && (
                    <motion.div
                        key="theme-fever"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1 }}
                        className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0f0a1a] to-[#1a0a0a]"
                    >
                        <motion.div
                            className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-[120px]"
                            animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
                            transition={{ duration: 3, repeat: Infinity }}
                        />
                        <motion.div
                            className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-fuchsia-500/15 rounded-full blur-[100px]"
                            animate={{ scale: [1.2, 1, 1.2], opacity: [0.15, 0.3, 0.15] }}
                            transition={{ duration: 4, repeat: Infinity }}
                        />
                        <motion.div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px]"
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_30px_rgba(249,115,22,0.8),0_0_60px_rgba(249,115,22,0.4)]" />
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent shadow-[0_0_30px_rgba(245,158,11,0.8)]" />
                        <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-orange-500/50 to-transparent" />
                        <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-amber-500/50 to-transparent" />
                    </motion.div>
                )}
                {theme === "crimson" && (
                    <motion.div
                        key="theme-crimson"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1 }}
                        className="absolute inset-0 bg-[#2b0a0a]"
                    >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(220,38,38,0.15),transparent_70%)] animate-pulse" />
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-600 to-transparent shadow-[0_0_30px_rgba(220,38,38,0.6)]" />
                    </motion.div>
                )}
                {theme === "boss" && (
                    <motion.div
                        key="theme-boss"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1 }}
                        className="absolute inset-0 bg-black"
                    >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(217,119,6,0.2),transparent_60%)]" />
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 animate-[spin_100s_linear_infinite]" />
                        <div className="absolute inset-0 border-[20px] border-amber-900/10" />
                    </motion.div>
                )}
                {false && (
                    <motion.div
                        key={`theme-cosmetic-${cosmeticTheme}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.8 }}
                        className={cn("absolute inset-0", activeCosmeticTheme.bgClass)}
                    >
                        {cosmeticTheme === "morning_coffee" && (
                            <>
                                <motion.div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-slate-200/50 rounded-full blur-[120px]" animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, -30, 0] }} transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-100/40 rounded-full blur-[100px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -40, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-stone-100/30 rounded-full blur-[150px]" animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
                            </>
                        )}
                        {cosmeticTheme === "sakura" && (
                            <>
                                <motion.div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-pink-300/25 rounded-full blur-[150px]" animate={{ scale: [1, 1.15, 1], x: [0, -20, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute bottom-1/3 left-1/3 w-[400px] h-[400px] bg-rose-200/20 rounded-full blur-[120px]" animate={{ scale: [1.1, 1, 1.1], y: [0, 15, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
                                {[...Array(8)].map((_, index) => (
                                    <motion.div key={index} className="absolute text-pink-300/60 text-lg select-none pointer-events-none" style={{ left: `${8 + index * 12}%`, top: "-5%" }} animate={{ y: [0, 800], x: [0, Math.sin(index) * 60, 0], rotate: [0, 360 * (index % 2 === 0 ? 1 : -1)] }} transition={{ duration: 8 + index * 2, repeat: Infinity, delay: index * 1.5, ease: "linear" }}>
                                        🌸
                                    </motion.div>
                                ))}
                            </>
                        )}
                        {cosmeticTheme === "golden_hour" && (
                            <>
                                <motion.div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-300/25 rounded-full blur-[150px]" animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -15, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-rose-300/20 rounded-full blur-[130px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -20, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-orange-200/20 rounded-full blur-[110px]" animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.3, 0.15] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
                                <div className="absolute top-0 right-0 w-[60%] h-[60%] bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.12),transparent_60%)]" />
                                <div className="absolute bottom-0 left-0 w-[40%] h-[40%] bg-[radial-gradient(ellipse_at_bottom_left,rgba(251,113,133,0.08),transparent_60%)]" />
                            </>
                        )}
                        {cosmeticTheme === "verdant_atelier" && (
                            <>
                                <div className="absolute inset-0 bg-[url('/themes/forest-photo.jpg')] bg-cover bg-center bg-no-repeat opacity-[0.78]" />
                                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,44,34,0.1),rgba(2,44,34,0.06),rgba(2,44,34,0.16))]" />
                            </>
                        )}
                        {cosmeticTheme === "cute_cream" && (
                            <div className="absolute inset-0 overflow-hidden">
                                <motion.div className="absolute -top-[8%] left-[8%] h-[32vw] w-[32vw] rounded-full bg-[#ffe1bf]/55 blur-[110px]" animate={{ scale: [1, 1.08, 1], x: [0, 24, 0], y: [0, -12, 0] }} transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute top-[10%] right-[6%] h-[28vw] w-[28vw] rounded-full bg-[#d9f3e3]/58 blur-[110px]" animate={{ scale: [1.05, 1, 1.05], x: [0, -20, 0], y: [0, 18, 0] }} transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute bottom-[-6%] left-[28%] h-[30vw] w-[30vw] rounded-full bg-[#fff3d2]/60 blur-[120px]" animate={{ scale: [1, 1.12, 1], x: [0, 28, 0], y: [0, -16, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute bottom-[4%] right-[16%] h-[20vw] w-[20vw] rounded-full bg-[#ffd8cc]/42 blur-[100px]" animate={{ scale: [1.08, 1, 1.08], x: [0, -18, 0], y: [0, 16, 0] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,252,246,0.9),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(240,251,244,0.68),transparent_28%)]" />
                                <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(185,160,126,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(185,160,126,0.14)_1px,transparent_1px)] bg-[size:48px_48px]" />
                                <div className="absolute left-[6%] top-[12%] h-12 w-12 rounded-[18px] border border-[#ffd4ab] bg-white/38" />
                                <div className="absolute right-[10%] top-[18%] h-10 w-10 rounded-full border border-[#cbe9d7] bg-white/28" />
                                <div className="absolute bottom-[16%] left-[10%] h-14 w-14 rounded-[20px] border border-[#ffe4c7] bg-white/26" />
                            </div>
                        )}
                        {cosmeticTheme === "cloud_nine" && (
                            <div className="absolute inset-0 overflow-hidden mix-blend-multiply opacity-50">
                                <motion.div className="absolute -top-[10%] -left-[10%] w-[70vw] h-[70vw] bg-sky-200/40 rounded-full blur-[120px]" animate={{ scale: [1, 1.1, 1], x: [0, 40, 0], y: [0, 30, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute top-[20%] -right-[20%] w-[80vw] h-[80vw] bg-cyan-100/40 rounded-full blur-[130px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -50, 0], y: [0, -30, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute -bottom-[20%] left-[10%] w-[60vw] h-[60vw] bg-blue-100/40 rounded-full blur-[140px]" animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -40, 0] }} transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} />
                                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay" />
                            </div>
                        )}
                        {cosmeticTheme === "lilac_dream" && (
                            <div className="absolute inset-0 overflow-hidden">
                                <motion.div className="absolute top-0 left-0 w-[60vw] h-[60vw] bg-fuchsia-300/15 rounded-full blur-[140px]" animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 20, 0] }} transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute top-[10%] right-[10%] w-[70vw] h-[70vw] bg-purple-300/15 rounded-full blur-[150px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -40, 0], y: [0, -20, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} />
                                <motion.div className="absolute bottom-0 left-[20%] w-[65vw] h-[65vw] bg-pink-300/15 rounded-full blur-[160px]" animate={{ scale: [1, 1.15, 1], x: [0, 30, 0], y: [0, -40, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
                                {LILAC_ORB_CONFIG.map((orb, index) => (
                                    <motion.div
                                        key={index}
                                        className="absolute w-32 h-32 bg-white/20 rounded-full blur-[20px]"
                                        style={{ left: orb.left, top: orb.top }}
                                        animate={{
                                            opacity: [0.2, 0.5, 0.2],
                                            scale: [1, 1.5, 1],
                                            x: [0, orb.driftX],
                                            y: [0, orb.driftY],
                                        }}
                                        transition={{ duration: orb.duration, repeat: Infinity, delay: orb.delay, ease: "easeInOut" }}
                                    />
                                ))}
                            </div>
                        )}
                        <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%274%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E')]" />
                        {!activeCosmeticTheme.isDark ? (
                            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />
                        ) : null}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
