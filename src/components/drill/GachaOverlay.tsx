"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Gem, Headphones, RefreshCw, Sparkles, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { type GachaCard, type GachaRewardType } from "./gacha";

type GachaOverlayPhase =
    | "intro"
    | "dealing"
    | "choosing"
    | "reveal_selected"
    | "reveal_all"
    | "claiming"
    | "done";

interface GachaOverlayProps {
    cards: GachaCard[];
    selectedCardId: string | null;
    claimTarget: { x: number; y: number } | null;
    onSelect: (cardId: string) => void;
    onComplete: () => void;
}

const CARD_POSITIONS = [
    { x: -280, y: 34, rotate: -16 },
    { x: -140, y: 12, rotate: -8 },
    { x: 0, y: 0, rotate: 0 },
    { x: 140, y: 12, rotate: 8 },
    { x: 280, y: 34, rotate: 16 },
] as const;

function getRewardUi(card: GachaCard) {
    const amountText = card.rewardType === "coins" ? `${card.amount} 星光币` : `x${card.amount}`;
    const tierStyle = card.tier === "high"
        ? {
            shell: "from-amber-950/95 via-stone-900 to-orange-950/90",
            border: "border-amber-300/80",
            accent: "shadow-[0_0_40px_rgba(251,191,36,0.24)]",
            title: "text-amber-200",
            chip: "border-amber-300/40 bg-amber-400/12 text-amber-100",
        }
        : {
            shell: "from-stone-950/95 via-stone-900 to-stone-950/90",
            border: "border-stone-600/75",
            accent: "shadow-[0_0_32px_rgba(148,163,184,0.16)]",
            title: "text-stone-100",
            chip: "border-stone-500/35 bg-white/6 text-stone-200",
        };

    const rewardMap: Record<GachaRewardType, { icon: ReactNode; title: string; subtitle: string; glow: string; }> = {
        capsule: {
            icon: <span className="text-4xl md:text-5xl">💊</span>,
            title: "灵感胶囊",
            subtitle: "灵感补给",
            glow: "from-sky-400/24 via-cyan-300/14 to-transparent",
        },
        hint_ticket: {
            icon: <Wand2 className="h-11 w-11 md:h-12 md:w-12" />,
            title: "Hint 道具",
            subtitle: "高价值提示",
            glow: "from-amber-300/24 via-yellow-200/14 to-transparent",
        },
        vocab_ticket: {
            icon: <span className="text-4xl md:text-5xl">🧩</span>,
            title: "关键词券",
            subtitle: "词块提示",
            glow: "from-emerald-400/24 via-green-300/14 to-transparent",
        },
        audio_ticket: {
            icon: <Headphones className="h-11 w-11 md:h-12 md:w-12" />,
            title: card.amount >= 2 ? "朗读券双份" : "朗读券",
            subtitle: "音频解锁",
            glow: "from-indigo-400/24 via-violet-300/14 to-transparent",
        },
        refresh_ticket: {
            icon: <RefreshCw className="h-11 w-11 md:h-12 md:w-12" />,
            title: "刷新卡",
            subtitle: "重刷题目",
            glow: "from-cyan-400/24 via-sky-300/14 to-transparent",
        },
        coins: {
            icon: <Gem className="h-11 w-11 md:h-12 md:w-12" />,
            title: "星光币",
            subtitle: card.amount >= 50 ? "高价值奖励" : "常规奖励",
            glow: "from-amber-300/24 via-orange-300/14 to-transparent",
        },
    };

    return {
        ...rewardMap[card.rewardType],
        amountText,
        tierStyle,
    };
}

export function GachaOverlay({ cards, selectedCardId, claimTarget, onSelect, onComplete }: GachaOverlayProps) {
    const prefersReducedMotion = useReducedMotion();
    const [phase, setPhase] = useState<GachaOverlayPhase>("intro");
    const [viewport, setViewport] = useState({ width: 0, height: 0 });

    const selectedCard = useMemo(
        () => cards.find((card) => card.id === selectedCardId) ?? null,
        [cards, selectedCardId],
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        const updateViewport = () => {
            setViewport({ width: window.innerWidth, height: window.innerHeight });
        };

        updateViewport();
        window.addEventListener("resize", updateViewport);
        return () => window.removeEventListener("resize", updateViewport);
    }, []);

    useEffect(() => {
        if (cards.length === 0) return;

        if (!selectedCardId) {
            const introDelay = prefersReducedMotion ? 180 : 480;
            const dealingDelay = prefersReducedMotion ? 260 : 720;
            const introTimer = window.setTimeout(() => setPhase("dealing"), introDelay);
            const chooseTimer = window.setTimeout(() => setPhase("choosing"), introDelay + dealingDelay);

            return () => {
                window.clearTimeout(introTimer);
                window.clearTimeout(chooseTimer);
            };
        }

        const revealNowTimer = window.setTimeout(() => setPhase("reveal_selected"), 0);
        const revealSelectedDelay = prefersReducedMotion ? 260 : 900;
        const revealAllDelay = prefersReducedMotion ? 460 : 1750;
        const claimingDelay = prefersReducedMotion ? 700 : 2700;
        const doneDelay = prefersReducedMotion ? 980 : 3600;
        const finishDelay = prefersReducedMotion ? 1180 : 4350;

        const revealSelectedTimer = window.setTimeout(() => setPhase("reveal_all"), revealSelectedDelay);
        const revealAllTimer = window.setTimeout(() => setPhase("claiming"), revealAllDelay);
        const claimingTimer = window.setTimeout(() => setPhase("done"), claimingDelay);
        const finishTimer = window.setTimeout(onComplete, finishDelay);
        const doneTimer = window.setTimeout(() => setPhase("done"), doneDelay);

        return () => {
            window.clearTimeout(revealNowTimer);
            window.clearTimeout(revealSelectedTimer);
            window.clearTimeout(revealAllTimer);
            window.clearTimeout(claimingTimer);
            window.clearTimeout(doneTimer);
            window.clearTimeout(finishTimer);
        };
    }, [cards.length, onComplete, prefersReducedMotion, selectedCardId]);

    const title = phase === "choosing" || phase === "dealing"
        ? "命运翻牌"
        : phase === "reveal_selected"
            ? "揭晓奖励"
            : phase === "reveal_all"
                ? "全场揭晓"
                : phase === "claiming"
                    ? "奖励入账"
                    : "Lucky Draw";

    const subtitle = phase === "intro"
        ? "高分奖励已触发，准备翻牌"
        : phase === "choosing"
            ? "从 5 张命运牌中选 1 张"
            : phase === "reveal_selected"
                ? "你的选择正在翻面"
                : phase === "reveal_all"
                    ? "其余命运牌也已揭晓"
                    : phase === "claiming"
                        ? "奖励正在飞入资源栏"
                        : "好运降临";

    const claimDelta = claimTarget
        ? {
            x: claimTarget.x - viewport.width / 2,
            y: claimTarget.y - viewport.height / 2,
        }
        : null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.16),transparent_34%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(10,10,10,0.96))] backdrop-blur-xl"
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(250,204,21,0.08),transparent_22%),radial-gradient(circle_at_50%_82%,rgba(59,130,246,0.08),transparent_28%)]" />
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20" />

            <div className="relative flex h-full flex-col items-center justify-center px-4 py-10">
                <motion.div
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-10 text-center"
                >
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-white/6 px-4 py-2 text-[11px] font-black uppercase tracking-[0.32em] text-amber-200/90">
                        <Sparkles className="h-3.5 w-3.5" />
                        {title}
                    </div>
                    <h2 className="text-4xl font-black tracking-tight text-white md:text-5xl">
                        {phase === "choosing" ? "Choose Your Card" : "Fortune Unfolds"}
                    </h2>
                    <p className="mt-3 text-sm font-medium tracking-[0.18em] text-stone-300 md:text-base">
                        {subtitle}
                    </p>
                </motion.div>

                <div className="relative h-[360px] w-full max-w-6xl">
                    {cards.map((card, index) => {
                        const position = CARD_POSITIONS[index] ?? CARD_POSITIONS[2];
                        const isSelected = card.id === selectedCardId;
                        const revealSelectedOnly = phase === "reveal_selected";
                        const isRevealed = isSelected
                            ? phase === "reveal_selected" || phase === "reveal_all" || phase === "claiming" || phase === "done"
                            : phase === "reveal_all" || phase === "claiming" || phase === "done";
                        const ui = getRewardUi(card);

                        const animateState = phase === "intro"
                            ? { opacity: 0, y: 120, scale: 0.86, rotate: 0, x: 0 }
                            : isSelected && revealSelectedOnly
                                ? { opacity: 1, y: -38, scale: 1.16, rotate: 0, x: 0 }
                                : {
                                    opacity: revealSelectedOnly && !isSelected ? 0.32 : 1,
                                    y: position.y,
                                    scale: isSelected ? 1.08 : 1,
                                    rotate: position.rotate,
                                    x: position.x,
                                };

                        return (
                            <motion.button
                                key={card.id}
                                type="button"
                                onClick={() => phase === "choosing" && onSelect(card.id)}
                                initial={{ opacity: 0, y: 180, rotate: position.rotate * 0.45, scale: 0.82 }}
                                animate={animateState}
                                transition={{
                                    duration: prefersReducedMotion ? 0.18 : isSelected ? 0.52 : 0.72,
                                    delay: phase === "dealing" || phase === "choosing" ? index * 0.08 : 0,
                                    ease: "easeOut",
                                }}
                                whileHover={phase === "choosing" ? { y: position.y - 18, scale: 1.05 } : undefined}
                                className={cn(
                                    "group absolute left-1/2 top-1/2 h-[224px] w-[150px] -translate-x-1/2 -translate-y-1/2 transform-gpu rounded-[28px] focus:outline-none md:h-[276px] md:w-[184px]",
                                    phase === "choosing" ? "cursor-pointer" : "cursor-default",
                                )}
                                style={{ transformStyle: "preserve-3d" }}
                                disabled={phase !== "choosing"}
                            >
                                <motion.div
                                    className={cn(
                                        "relative h-full w-full rounded-[28px] transition-all duration-500",
                                        isRevealed ? "rotate-y-180" : "",
                                        ui.tierStyle.accent,
                                    )}
                                    style={{ transformStyle: "preserve-3d" }}
                                    animate={isRevealed ? { rotateY: 180 } : { rotateY: 0 }}
                                    transition={{ duration: prefersReducedMotion ? 0.24 : 0.7, ease: "easeInOut" }}
                                >
                                    <div className="absolute inset-0 backface-hidden overflow-hidden rounded-[28px] border border-stone-600/75 bg-[linear-gradient(155deg,rgba(12,10,9,0.98),rgba(24,24,27,0.94))]">
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(251,191,36,0.14),transparent_26%),linear-gradient(180deg,transparent,rgba(255,255,255,0.03))]" />
                                        <div className="absolute inset-3 rounded-[22px] border border-white/8" />
                                        <div className="absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/18 to-transparent" />
                                        <div className="relative flex h-full flex-col items-center justify-center gap-4">
                                            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 shadow-[0_0_28px_rgba(255,255,255,0.08)]">
                                                <Sparkles className="h-7 w-7 text-amber-200/80" />
                                            </div>
                                            <div className="text-center">
                                                <div className="text-xs font-black uppercase tracking-[0.38em] text-stone-300/70">
                                                    Tarot Pick
                                                </div>
                                                <div className="mt-2 text-sm font-semibold tracking-[0.28em] text-stone-500">
                                                    Hidden Reward
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={cn("absolute inset-0 rotate-y-180 backface-hidden overflow-hidden rounded-[28px] border bg-gradient-to-br", ui.tierStyle.shell, ui.tierStyle.border)}>
                                        <div className={cn("absolute inset-0 bg-gradient-to-b opacity-90", ui.glow)} />
                                        <div className="absolute inset-3 rounded-[22px] border border-white/10" />
                                        <div className="relative flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
                                            <div className="text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.16)]">
                                                {ui.icon}
                                            </div>
                                            <div>
                                                <div className={cn("text-lg font-black tracking-tight md:text-xl", ui.tierStyle.title)}>
                                                    {ui.title}
                                                </div>
                                                <div className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-stone-300/70">
                                                    {ui.subtitle}
                                                </div>
                                            </div>
                                            <div className={cn("rounded-full border px-3 py-1.5 text-xs font-black tracking-[0.18em]", ui.tierStyle.chip)}>
                                                {ui.amountText}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            </motion.button>
                        );
                    })}
                </div>

                <AnimatePresence>
                    {selectedCard && (phase === "reveal_selected" || phase === "reveal_all" || phase === "claiming" || phase === "done") && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="mt-8 rounded-[28px] border border-white/10 bg-white/6 px-5 py-4 text-center shadow-[0_22px_60px_rgba(15,23,42,0.28)] backdrop-blur-xl"
                        >
                            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-200/80">
                                Selected Reward
                            </div>
                            <div className="mt-2 text-2xl font-black text-white">
                                {getRewardUi(selectedCard).title}
                            </div>
                            <div className="mt-1 text-sm font-semibold tracking-[0.16em] text-stone-300">
                                {getRewardUi(selectedCard).amountText}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {phase === "claiming" && selectedCard && claimDelta && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.78, x: 0, y: 0 }}
                        animate={{ opacity: [0, 1, 1, 0], scale: [0.78, 1.08, 0.94, 0.72], x: [0, 0, claimDelta.x], y: [0, 0, claimDelta.y] }}
                        transition={{ duration: prefersReducedMotion ? 0.55 : 1.15, times: [0, 0.18, 0.76, 1], ease: "easeInOut" }}
                        className="pointer-events-none fixed left-1/2 top-1/2 z-[150] -translate-x-1/2 -translate-y-1/2"
                    >
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-200/60 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(254,240,138,0.92))] text-amber-600 shadow-[0_16px_40px_rgba(251,191,36,0.32)]">
                            {getRewardUi(selectedCard).icon}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export default GachaOverlay;
