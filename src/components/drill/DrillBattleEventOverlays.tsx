"use client";

import { createPortal } from "react-dom";
import { type ComponentProps, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle,
    ChevronRight,
    Dices,
    Gem,
    Gift,
    Skull,
    TrendingDown,
    TrendingUp,
    Zap,
    type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { GachaOverlay } from "./GachaOverlay";
import { RouletteOverlay } from "./RouletteOverlay";

const RANK_UP_PARTICLE_TRAJECTORIES = [
    { x: -136, y: -122, scale: 0.92 },
    { x: -98, y: -34, scale: 1.18 },
    { x: -72, y: 118, scale: 0.84 },
    { x: -26, y: -146, scale: 1.12 },
    { x: 0, y: -176, scale: 1.28 },
    { x: 24, y: 138, scale: 0.88 },
    { x: 66, y: -108, scale: 1.04 },
    { x: 94, y: 54, scale: 0.9 },
    { x: 118, y: -18, scale: 1.2 },
    { x: 142, y: 122, scale: 0.86 },
    { x: -152, y: 46, scale: 0.78 },
    { x: 156, y: -126, scale: 1.08 },
] as const;

interface DrillBattleBossState {
    active: boolean;
    introAck: boolean;
}

interface DrillBattleBossVisual {
    bg: string;
    color: string;
    desc: string;
    icon: LucideIcon;
    name: string;
}

interface DrillBattleGambleState {
    active: boolean;
    doubleDownCount: number;
    introAck: boolean;
    wager: "safe" | "risky" | "madness" | null;
}

export interface DrillBattleLootDrop {
    amount: number;
    message: string;
    name?: string;
    rarity: "common" | "rare" | "legendary";
    type: "gem" | "exp" | "theme";
}

interface DrillBattleRankVisual {
    bg: string;
    border: string;
    gradient: string;
    icon: LucideIcon;
    title: string;
}

interface DrillBattleRankTransition {
    newRank: DrillBattleRankVisual;
    oldRank: DrillBattleRankVisual;
}

interface DrillBattleEloSplash {
    delta: number;
    uid: string;
}

export interface DrillBattleEventOverlaysProps {
    bossState: DrillBattleBossState;
    currentBoss: DrillBattleBossVisual;
    currentWinnings: number;
    economyFxOverlay?: ReactNode;
    eloSplash: DrillBattleEloSplash | null;
    gachaOverlayProps?: ComponentProps<typeof GachaOverlay> | null;
    gambleState: DrillBattleGambleState;
    isShopEconomyFx: boolean;
    lootDrop: DrillBattleLootDrop | null;
    onAcknowledgeBossIntro: () => void;
    onAcknowledgeGambleIntro: () => void;
    onCloseDoubleDown: () => void;
    onCloseLootDrop: () => void;
    onCloseRankDown: () => void;
    onCloseRankUp: () => void;
    onDoubleDown: () => void;
    onSelectMadnessWager: () => void;
    onSelectRiskyWager: () => void;
    onSelectSafeWager: () => void;
    rankDown: DrillBattleRankTransition | null;
    rankUp: DrillBattleRankTransition | null;
    rouletteOverlayProps?: ComponentProps<typeof RouletteOverlay> | null;
    showDoubleDown: boolean;
}

export function DrillBattleEventOverlays({
    bossState,
    currentBoss,
    currentWinnings,
    economyFxOverlay,
    eloSplash,
    gachaOverlayProps,
    gambleState,
    isShopEconomyFx,
    lootDrop,
    onAcknowledgeBossIntro,
    onAcknowledgeGambleIntro,
    onCloseDoubleDown,
    onCloseLootDrop,
    onCloseRankDown,
    onCloseRankUp,
    onDoubleDown,
    onSelectMadnessWager,
    onSelectRiskyWager,
    onSelectSafeWager,
    rankDown,
    rankUp,
    rouletteOverlayProps,
    showDoubleDown,
}: DrillBattleEventOverlaysProps) {
    return (
        <>
            <AnimatePresence>
                {gambleState.active && gambleState.introAck && !gambleState.wager && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-8"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="max-w-md w-full bg-[#1a0505] border border-red-900/50 rounded-3xl p-8 flex flex-col gap-6 shadow-[0_0_50px_rgba(220,38,38,0.2)]"
                        >
                            <div className="flex flex-col items-center text-center gap-2">
                                <div className="w-16 h-16 rounded-full bg-red-950/50 flex items-center justify-center border border-red-900 mb-2">
                                    <Dices className="w-8 h-8 text-red-500" />
                                </div>
                                <h2 className="text-2xl font-bold text-red-100">The Devil&apos;s Deal</h2>
                                <p className="text-red-400 text-sm">A &quot;High Value&quot; client is challenging you. <br />Wager your skill for multiplied returns.</p>
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={onSelectSafeWager}
                                    className="w-full p-4 rounded-xl border border-stone-800 bg-stone-900/50 hover:bg-stone-800 transition-colors flex items-center justify-between group"
                                >
                                    <div className="text-left">
                                        <div className="text-stone-300 font-bold group-hover:text-white">放弃 (认怂)</div>
                                        <div className="text-xs text-stone-500">正常游戏. 无风险.</div>
                                    </div>
                                    <div className="text-stone-400 text-sm">1x</div>
                                </button>

                                <button
                                    onClick={onSelectRiskyWager}
                                    className="w-full p-4 rounded-xl border border-amber-900/30 bg-amber-950/20 hover:bg-amber-900/30 transition-colors flex items-center justify-between group"
                                >
                                    <div className="text-left">
                                        <div className="text-amber-500 font-bold group-hover:text-amber-400">加注 (玩玩)</div>
                                        <div className="text-xs text-amber-700 group-hover:text-amber-600">下注 20 Elo. 赢 60.</div>
                                    </div>
                                    <div className="text-amber-500 font-bold text-sm">3x</div>
                                </button>

                                <button
                                    onClick={onSelectMadnessWager}
                                    className="w-full p-4 rounded-xl border border-red-900/50 bg-red-950/30 hover:bg-red-900/40 transition-colors flex items-center justify-between group relative overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
                                    <div className="text-left relative z-10">
                                        <div className="text-red-500 font-bold group-hover:text-red-400 flex items-center gap-2"><AlertTriangle className="w-3 h-3" /> 梭哈 (疯魔)</div>
                                        <div className="text-xs text-red-700 group-hover:text-red-600">下注 50 Elo. 赢 150.</div>
                                    </div>
                                    <div className="text-red-500 font-black text-xl relative z-10">5x</div>
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showDoubleDown && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[80] bg-black/95 flex items-center justify-center p-8 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-10" />
                        <div className="absolute inset-0 bg-red-900/10 animate-pulse" />

                        <motion.div
                            initial={{ scale: 0.8, rotate: -5 }}
                            animate={{ scale: 1, rotate: 0 }}
                            className="relative bg-[#2a0a0a] border-4 border-red-600 p-8 rounded-3xl shadow-[0_0_100px_rgba(220,38,38,0.5)] max-w-sm w-full text-center flex flex-col gap-6"
                        >
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                                <div className="w-24 h-24 bg-black border-4 border-red-600 rounded-full flex items-center justify-center shadow-2xl">
                                    <span className="text-4xl">😈</span>
                                </div>
                            </div>

                            <div className="mt-8 space-y-2">
                                <h2 className="text-3xl font-black text-red-500 uppercase tracking-tighter">Greed Check</h2>
                                <p className="text-red-200 text-sm">You won... but is it enough?</p>
                            </div>

                            <div className="py-4 bg-black/30 rounded-xl border border-red-900/30">
                                <div className="text-xs text-stone-500 uppercase tracking-widest mb-1">Current Winnings</div>
                                <div className="text-4xl font-mono font-bold text-white tabular-nums">
                                    {currentWinnings}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={onCloseDoubleDown}
                                    className="py-4 rounded-xl bg-stone-800 text-stone-400 font-bold hover:bg-stone-700 hover:text-white transition-colors border border-white/5"
                                >
                                    Take it (Weak)
                                </button>
                                <button
                                    onClick={onDoubleDown}
                                    className="py-4 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition-all border border-red-400 shadow-[0_0_20px_rgba(220,38,38,0.4)] animate-pulse"
                                >
                                    DOUBLE DOWN 💀
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {gambleState.active && !gambleState.introAck && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[70] bg-[#1a0505] flex items-center justify-center p-8"
                        onClick={onAcknowledgeGambleIntro}
                    >
                        <div className="flex flex-col items-center gap-8 text-center pointer-events-none">
                            <motion.div
                                initial={{ scale: 2, filter: "blur(10px)" }}
                                animate={{ scale: 1, filter: "blur(0px)" }}
                                transition={{ duration: 0.8, ease: "circOut" }}
                                className="relative"
                            >
                                <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
                                <AlertTriangle className="w-32 h-32 text-red-600 relative z-10" />
                            </motion.div>

                            <motion.div
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.5 }}
                                className="space-y-4"
                            >
                                <h2 className="text-5xl font-black text-red-600 tracking-tighter uppercase">猩红轮盘</h2>
                                <div className="h-1 w-32 bg-red-600 mx-auto" />
                                <p className="text-red-200 font-mono text-sm tracking-widest">高风险 • 高回报</p>
                            </motion.div>

                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.5, repeat: Infinity, repeatType: "reverse" }}
                                className="text-white/30 text-xs mt-12"
                            >
                                点击进入交易 (CLICK TO ENTER)
                            </motion.p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {bossState.active && !bossState.introAck && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[70] bg-black flex items-center justify-center p-8"
                        onClick={onAcknowledgeBossIntro}
                    >
                        <div className="flex flex-col items-center gap-8 text-center pointer-events-none">
                            <motion.div
                                initial={{ scale: 2, filter: "blur(10px)" }}
                                animate={{ scale: 1, filter: "blur(0px)" }}
                                transition={{ duration: 0.8, ease: "circOut" }}
                                className="relative"
                            >
                                <div className={cn("absolute inset-0 blur-3xl rounded-full", currentBoss.bg, "opacity-20")} />
                                <currentBoss.icon className={cn("w-32 h-32 relative z-10", currentBoss.color)} />
                            </motion.div>

                            <motion.div
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.5 }}
                                className="space-y-4"
                            >
                                <h2 className={cn("text-5xl font-black tracking-tighter uppercase", currentBoss.color)}>{currentBoss.name}</h2>
                                <div className={cn("h-1 w-32 mx-auto", currentBoss.bg)} />
                                <p className={cn("font-mono text-sm tracking-widest opacity-80", currentBoss.color)}>{currentBoss.desc}</p>
                            </motion.div>

                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.5, repeat: Infinity, repeatType: "reverse" }}
                                className="text-white/30 text-xs mt-12"
                            >
                                CLICK TO START CHALLENGE
                            </motion.p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {!isShopEconomyFx && economyFxOverlay}
            </AnimatePresence>

            {isShopEconomyFx && typeof window !== "undefined" && economyFxOverlay
                ? createPortal(
                    <AnimatePresence>{economyFxOverlay}</AnimatePresence>,
                    document.body
                )
                : null}

            <AnimatePresence>
                {lootDrop && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 50 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -50 }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] flex flex-col items-center gap-4 pointer-events-auto cursor-pointer"
                        onClick={onCloseLootDrop}
                    >
                        <div className={cn(
                            "flex flex-col items-center gap-4 p-8 rounded-[2.5rem] border shadow-2xl backdrop-blur-3xl min-w-[280px]",
                            lootDrop.amount < 0 ? "bg-red-950/80 border-red-500/50 shadow-red-500/30" :
                                lootDrop.rarity === "legendary" ? "bg-amber-900/80 border-amber-400/50 shadow-amber-500/30" :
                                    lootDrop.rarity === "rare" ? "bg-indigo-900/80 border-indigo-400/50 shadow-indigo-500/30" :
                                        "bg-stone-900/80 border-stone-500/30 shadow-2xl"
                        )}>
                            <div className={cn(
                                "p-5 rounded-2xl mb-2",
                                lootDrop.amount < 0 ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                            )}>
                                {lootDrop.amount < 0 || lootDrop.message.includes("💀") ? (
                                    <Skull className="w-12 h-12 animate-pulse" />
                                ) : lootDrop.message.includes("🎰") ? (
                                    <Zap className="w-12 h-12 animate-bounce" />
                                ) : lootDrop.type === "gem" ? (
                                    <Gem className="w-12 h-12" />
                                ) : (
                                    <Gift className="w-12 h-12" />
                                )}
                            </div>

                            <div className="text-center">
                                <div className={cn(
                                    "text-xs font-black uppercase tracking-[0.2em] mb-1 opacity-60",
                                    lootDrop.amount < 0 ? "text-red-400" : "text-amber-500"
                                )}>
                                    {lootDrop.amount < 0 ? "System Penalty" :
                                        lootDrop.message.includes("🎰") ? "Stakes Locked" : "Reward Dropped"}
                                </div>
                                <div className={cn(
                                    "text-xl font-bold mb-4",
                                    lootDrop.amount < 0 ? "text-red-100" : "text-amber-50"
                                )}>
                                    {lootDrop.message}
                                </div>
                                <div className={cn(
                                    "text-5xl font-black font-mono tracking-tighter",
                                    lootDrop.amount < 0 ? "text-red-500" : "text-white"
                                )}>
                                    {lootDrop.amount > 0 ? `+${lootDrop.amount}` : lootDrop.amount}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {rankUp && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl"
                        onClick={onCloseRankUp}
                    >
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 z-0 opacity-30"
                        >
                            <div
                                className={cn("w-[200vw] h-[200vw] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r transparent via-white/10 transparent", rankUp.newRank.gradient)}
                                style={{ clipPath: "polygon(50% 50%, 0 0, 100% 0)" }}
                            />
                        </motion.div>

                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ type: "spring" as const, damping: 15, stiffness: 200 }}
                            className="relative z-10 flex flex-col items-center gap-8 p-12 max-w-lg w-full"
                        >
                            <motion.div
                                initial={{ scale: 0, opacity: 0.8 }}
                                animate={{ scale: 2, opacity: 0 }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className={cn("absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border-4", rankUp.newRank.border)}
                            />

                            <div className="relative">
                                <motion.div
                                    initial={{ scale: 0, rotate: -180 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    transition={{ type: "spring" as const, damping: 12, stiffness: 100, delay: 0.2 }}
                                    className={cn("w-40 h-40 rounded-3xl flex items-center justify-center shadow-[0_0_100px_rgba(255,255,255,0.3)] bg-gradient-to-br border-4 border-white/50", rankUp.newRank.gradient)}
                                >
                                    <rankUp.newRank.icon className="w-20 h-20 text-white drop-shadow-md" strokeWidth={1.5} />
                                </motion.div>

                                {RANK_UP_PARTICLE_TRAJECTORIES.map((particle, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                                        animate={{
                                            x: particle.x,
                                            y: particle.y,
                                            opacity: 0,
                                            scale: particle.scale,
                                        }}
                                        transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                                        className={cn("absolute top-1/2 left-1/2 w-3 h-3 rounded-full", rankUp.newRank.bg.replace("bg-", "bg-"))}
                                    />
                                ))}
                            </div>

                            <div className="text-center space-y-2">
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 }}
                                    className="text-sm font-bold tracking-[0.3em] uppercase text-white/60"
                                >
                                    Rank Promoted
                                </motion.div>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.6, type: "spring" as const }}
                                    className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-white/70 filter drop-shadow-lg"
                                >
                                    {rankUp.newRank.title}
                                </motion.div>
                            </div>

                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.8 }}
                                className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/10"
                            >
                                <span className="text-stone-400 line-through text-lg decoration-stone-500/50">{rankUp.oldRank.title}</span>
                                <ChevronRight className="w-5 h-5 text-white/40" />
                                <span className="text-white font-bold text-xl">{rankUp.newRank.title}</span>
                            </motion.div>

                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className={cn("px-12 py-4 rounded-xl font-bold text-lg shadow-xl transition-all hover:brightness-110 active:scale-95 text-white shadow-lg", rankUp.newRank.bg.replace("bg-", "bg-").replace("100", "600"))}
                            >
                                CLAIM GLORY
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {rankDown && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-grayscale"
                        onClick={onCloseRankDown}
                    >
                        <motion.div
                            initial={{ scale: 1.1, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="flex flex-col items-center gap-8 p-12 max-w-lg w-full relative"
                        >
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cracked-ground.png')] opacity-20 pointer-events-none" />

                            <div className="relative">
                                <motion.div
                                    initial={{ scale: 1, filter: "brightness(1)", opacity: 1 }}
                                    animate={{ scale: [1, 1.1, 0.8], opacity: 0, filter: "brightness(2)" }}
                                    transition={{ duration: 0.4, delay: 0.2 }}
                                    className={cn("absolute inset-0 w-40 h-40 rounded-3xl flex items-center justify-center bg-gradient-to-br border-4 border-white/50", rankDown.oldRank.gradient)}
                                >
                                    <rankDown.oldRank.icon className="w-20 h-20 text-white" />
                                </motion.div>

                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: "spring" as const, damping: 12, delay: 0.6 }}
                                    className="w-40 h-40 rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(255,0,0,0.2)] bg-stone-900 border-4 border-stone-700 grayscale"
                                >
                                    <rankDown.newRank.icon className="w-20 h-20 text-stone-500" strokeWidth={1.5} />
                                </motion.div>
                            </div>

                            <div className="text-center space-y-2 z-10">
                                <motion.div
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-sm font-bold tracking-[0.5em] uppercase text-red-600 animate-pulse"
                                >
                                    Demotion Alert
                                </motion.div>
                                <motion.div
                                    initial={{ opacity: 0, scale: 2 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.2, type: "spring" as const, stiffness: 300 }}
                                    className="text-6xl font-black tracking-tighter text-stone-300"
                                >
                                    RANK LOST
                                </motion.div>
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.8 }}
                                    className="text-stone-500 font-mono text-sm"
                                >
                                    {rankDown.oldRank.title} <span className="mx-2 text-stone-700">➜</span> {rankDown.newRank.title}
                                </motion.p>
                            </div>

                            <motion.button
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 1 }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="px-10 py-3 rounded-xl font-bold text-sm bg-stone-800 text-stone-400 border border-stone-700 hover:bg-stone-700 hover:text-stone-200 transition-colors"
                            >
                                ACCEPT FATE
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {eloSplash && (
                    <motion.div
                        key={eloSplash.uid}
                        initial={{ backdropFilter: "blur(0px)", backgroundColor: "rgba(0,0,0,0)" }}
                        animate={{ backdropFilter: "blur(8px)", backgroundColor: "rgba(250,250,250,0.4)" }}
                        exit={{ backdropFilter: "blur(0px)", backgroundColor: "rgba(0,0,0,0)", opacity: 0 }}
                        className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none"
                    >
                        {eloSplash.delta > 0 ? (
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0, y: 30 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.95, opacity: 0, filter: "blur(4px)" }}
                                transition={{ type: "spring" as const, stiffness: 450, damping: 30 }}
                                className="flex items-center gap-5 px-6 py-4 bg-white/70 backdrop-blur-2xl shadow-[0_12px_40px_rgb(16,185,129,0.15)] border border-emerald-100/60 rounded-[2.5rem]"
                            >
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-[inset_0_2px_10px_rgba(255,255,255,1)]">
                                    <TrendingUp className="w-6 h-6 stroke-[2.5]" />
                                </div>
                                <div className="flex flex-col text-left pr-4">
                                    <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-emerald-600/70">Elo Gained</span>
                                    <span className="font-newsreader text-4xl font-medium tracking-tight text-emerald-600 leading-none mt-1">+{eloSplash.delta}</span>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0, y: 30 }}
                                animate={{ scale: 1, opacity: 1, y: 0, x: [0, -3, 3, -2, 2, 0] }}
                                exit={{ scale: 0.95, opacity: 0, filter: "blur(4px)" }}
                                transition={{ duration: 0.45, ease: "easeOut" }}
                                className="flex items-center gap-5 px-6 py-4 bg-white/70 backdrop-blur-2xl shadow-[0_12px_40px_rgb(220,38,38,0.12)] border border-red-100/60 rounded-[2.5rem]"
                            >
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 shadow-[inset_0_2px_10px_rgba(255,255,255,1)]">
                                    <TrendingDown className="w-6 h-6 stroke-[2.5]" />
                                </div>
                                <div className="flex flex-col text-left pr-4">
                                    <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-red-500/70">Elo Deducted</span>
                                    <span className="font-newsreader text-4xl font-medium tracking-tight text-red-500 leading-none mt-1">{eloSplash.delta}</span>
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence key="roulette-overlay">
                {rouletteOverlayProps ? <RouletteOverlay {...rouletteOverlayProps} /> : null}
            </AnimatePresence>

            <AnimatePresence key="gacha-overlay">
                {gachaOverlayProps ? <GachaOverlay {...gachaOverlayProps} /> : null}
            </AnimatePresence>
        </>
    );
}
