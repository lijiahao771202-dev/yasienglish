"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, Flame, BrainCircuit, BookOpenText, Swords } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { HomeDashboardViewModel } from "@/components/home/home-data";
import { ConnectedUserAvatarMenu } from "@/components/profile/UserAvatarMenu";
import type { EloHistoryItem } from "@/lib/db";

interface HomeDashboardPanelsProps {
    model: HomeDashboardViewModel;
    eloHistory: EloHistoryItem[];
    accountEmail?: string | null;
    passwordUpdated?: boolean;
}

interface EloPoint {
    label: string;
    elo: number;
    change: number;
}

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function buildEloPoints(eloHistory: EloHistoryItem[]): EloPoint[] {
    const translationHistory = eloHistory
        .filter((item) => item.mode === "translation")
        .sort((a, b) => a.timestamp - b.timestamp);
    const sourceHistory = translationHistory.length
        ? translationHistory
        : [...eloHistory].sort((a, b) => a.timestamp - b.timestamp);
    return sourceHistory.slice(-14).map((item) => ({
        label: SHORT_DATE_FORMATTER.format(new Date(item.timestamp)),
        elo: item.elo,
        change: item.change,
    }));
}

function easeOutExpo(t: number) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function AnimatedNumber({
    value,
    signed = false,
    className = "",
    duration = 920,
}: {
    value: number;
    signed?: boolean;
    className?: string;
    duration?: number;
}) {
    const [displayValue, setDisplayValue] = useState(0);
    const previousValueRef = useRef(0);

    useEffect(() => {
        const startValue = previousValueRef.current;
        const delta = value - startValue;
        const startedAt = performance.now();
        let frameId = 0;

        const tick = (now: number) => {
            const progress = Math.min((now - startedAt) / duration, 1);
            const eased = easeOutExpo(progress);
            setDisplayValue(startValue + delta * eased);
            if (progress < 1) {
                frameId = requestAnimationFrame(tick);
            } else {
                previousValueRef.current = value;
                setDisplayValue(value);
            }
        };

        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [duration, value]);

    const roundedValue = Math.round(displayValue);
    const textValue = signed && roundedValue > 0 ? `+${roundedValue}` : String(roundedValue);
    return <span className={className}>{textValue}</span>;
}

interface EloTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: EloPoint }>;
}

function EloTooltip({ active, payload }: EloTooltipProps) {
    if (!active || !payload?.length) return null;
    const pt = payload[0].payload;
    const isUp = pt.change >= 0;
    return (
        <div className="rounded-2xl border-4 border-[#fbbf24] bg-[#fffbeb] px-4 py-3 text-sm font-bold shadow-[0_4px_0_0_#fbbf24]">
            <p className="font-black text-[#1f2937]">{pt.label}</p>
            <p className="text-[#d97706]">Elo {pt.elo}</p>
            <p className={isUp ? "text-[#10b981]" : "text-[#ef4444]"}>
                {isUp ? "▲" : "▼"} {Math.abs(pt.change)}
            </p>
        </div>
    );
}

export function HomeDashboardPanels_v2({
    model,
    eloHistory,
    accountEmail,
    passwordUpdated = false,
}: HomeDashboardPanelsProps) {
    const streakMetric = model.glowMetrics.find((m) => m.id === "streak")?.value ?? "0";
    const wordsMetric = model.glowMetrics.find((m) => m.id === "words")?.value ?? "0";
    const readsMetric = model.glowMetrics.find((m) => m.id === "reads")?.value ?? "0";

    const eloPoints = useMemo(() => buildEloPoints(eloHistory), [eloHistory]);
    const currentElo = eloPoints.at(-1)?.elo ?? model.growth.eloRating;
    const firstElo = eloPoints[0]?.elo ?? currentElo;
    const eloDelta = currentElo - firstElo;
    const hasCurve = eloPoints.length > 1;

    const springTransition = { type: "spring" as const, stiffness: 300, damping: 20 };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-5 w-full h-full"
        >
            {passwordUpdated && (
                <div className="rounded-[1.5rem] border-2 border-[#10b981] bg-[#d1fae5] px-4 py-3 text-sm font-bold text-[#047857] shadow-[0_4px_0_0_#10b981]">
                    密码已更新，欢迎回来！
                </div>
            )}

            <div className="flex items-center justify-between px-2">
                <p className="text-[15px] font-bold text-[#6b7280] flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#f472b6]" />
                    {model.subline || "今天也要开心地学习哦"}
                </p>
                {accountEmail && (
                    <div className="hidden sm:block">
                        <ConnectedUserAvatarMenu email={accountEmail} placement="header" />
                    </div>
                )}
            </div>

            {/* Cute Bento Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 flex-1 min-h-0">

                {/* ─── ELO CHART (replaces Goal card) ─── */}
                <motion.div
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    transition={springTransition}
                    className="col-span-2 row-span-2 relative overflow-hidden rounded-[2.5rem] border-4 border-[#fbbf24] bg-[#fffbeb] p-5 shadow-[0_8px_0_0_#fbbf24] flex flex-col"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3 flex-shrink-0">
                        <div className="flex items-center gap-3">
                            {/* Cat mascot via emoji-free SVG path: Lucide Swords icon with cat-flair label */}
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-[#fbbf24] bg-white shadow-[0_4px_0_0_#fbbf24]">
                                <Swords className="w-6 h-6 text-[#f59e0b]" />
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-[#d97706]">BATTLE ELO</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="font-welcome-display text-3xl font-black text-[#1f2937]">
                                        <AnimatedNumber value={currentElo} />
                                    </span>
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-black border-2 ${eloDelta >= 0 ? "border-[#6ee7b7] bg-[#ecfdf5] text-[#059669]" : "border-[#fca5a5] bg-[#fef2f2] text-[#dc2626]"}`}>
                                        {eloDelta >= 0 ? "▲" : "▼"} {Math.abs(eloDelta)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {/* cat face deco — SVG-only, no emoji */}
                        <div className="select-none text-[3.5rem] leading-none opacity-40 pointer-events-none">
                            {/* Simple SVG cat face as inline art */}
                            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                                <path d="M8 40 C8 20 16 8 28 8 C40 8 48 20 48 40" fill="#fcd34d" stroke="#fbbf24" strokeWidth="3"/>
                                <polygon points="8,24 4,8 16,18" fill="#fcd34d" stroke="#fbbf24" strokeWidth="2.5" strokeLinejoin="round"/>
                                <polygon points="48,24 52,8 40,18" fill="#fcd34d" stroke="#fbbf24" strokeWidth="2.5" strokeLinejoin="round"/>
                                <ellipse cx="20" cy="32" rx="4" ry="5" fill="#1f2937"/>
                                <ellipse cx="36" cy="32" rx="4" ry="5" fill="#1f2937"/>
                                <ellipse cx="21.5" cy="30.5" rx="1.5" ry="2" fill="white"/>
                                <ellipse cx="37.5" cy="30.5" rx="1.5" ry="2" fill="white"/>
                                <path d="M24 40 Q28 44 32 40" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                                <circle cx="28" cy="39" r="2.5" fill="#fca5a5"/>
                                {/* whiskers */}
                                <line x1="28" y1="39" x2="10" y2="36" stroke="#374151" strokeWidth="1.5" strokeLinecap="round"/>
                                <line x1="28" y1="39" x2="10" y2="39" stroke="#374151" strokeWidth="1.5" strokeLinecap="round"/>
                                <line x1="28" y1="39" x2="46" y2="36" stroke="#374151" strokeWidth="1.5" strokeLinecap="round"/>
                                <line x1="28" y1="39" x2="46" y2="39" stroke="#374151" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="flex-1 min-h-0">
                        {hasCurve ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={eloPoints} margin={{ top: 8, right: 4, bottom: 0, left: -28 }}>
                                    <defs>
                                        <linearGradient id="cute-elo-fill" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.5} />
                                            <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.05} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: "#d97706", fontSize: 11, fontWeight: 700 }}
                                        dy={6}
                                    />
                                    <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
                                    <Tooltip cursor={{ stroke: "#fbbf24", strokeWidth: 2, strokeDasharray: "6 3" }} content={<EloTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="elo"
                                        stroke="#f59e0b"
                                        strokeWidth={4}
                                        strokeLinecap="round"
                                        fill="url(#cute-elo-fill)"
                                        dot={{ r: 5, fill: "#fbbf24", stroke: "#fff", strokeWidth: 3 }}
                                        activeDot={{ r: 7, fill: "#f59e0b", stroke: "#fff", strokeWidth: 3 }}
                                        animationDuration={1200}
                                        animationEasing="ease-out"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center rounded-[1.6rem] border-4 border-dashed border-[#fcd34d] bg-white/60 gap-3 text-center p-6">
                                <svg width="48" height="48" viewBox="0 0 56 56" fill="none">
                                    <path d="M8 40 C8 20 16 8 28 8 C40 8 48 20 48 40" fill="#fcd34d" stroke="#fbbf24" strokeWidth="3"/>
                                    <polygon points="8,24 4,8 16,18" fill="#fcd34d" stroke="#fbbf24" strokeWidth="2.5" strokeLinejoin="round"/>
                                    <polygon points="48,24 52,8 40,18" fill="#fcd34d" stroke="#fbbf24" strokeWidth="2.5" strokeLinejoin="round"/>
                                    <ellipse cx="20" cy="32" rx="4" ry="5" fill="#1f2937"/>
                                    <ellipse cx="36" cy="32" rx="4" ry="5" fill="#1f2937"/>
                                    <ellipse cx="21.5" cy="30.5" rx="1.5" ry="2" fill="white"/>
                                    <ellipse cx="37.5" cy="30.5" rx="1.5" ry="2" fill="white"/>
                                    <path d="M24 40 Q28 44 32 40" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                                    <circle cx="28" cy="39" r="2.5" fill="#fca5a5"/>
                                    <line x1="28" y1="39" x2="10" y2="36" stroke="#374151" strokeWidth="1.5" strokeLinecap="round"/>
                                    <line x1="28" y1="39" x2="10" y2="39" stroke="#374151" strokeWidth="1.5" strokeLinecap="round"/>
                                    <line x1="28" y1="39" x2="46" y2="36" stroke="#374151" strokeWidth="1.5" strokeLinecap="round"/>
                                    <line x1="28" y1="39" x2="46" y2="39" stroke="#374151" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                                <p className="font-welcome-display text-xl font-black text-[#d97706]">先打一场 Battle</p>
                                <p className="text-sm font-bold text-[#92400e]">这里会出现你的 Elo 曲线</p>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Progress / Elo bar BENTO */}
                <motion.div
                    whileHover={{ scale: 1.03, rotate: 1 }}
                    whileTap={{ scale: 0.97 }}
                    transition={springTransition}
                    className="col-span-2 relative overflow-hidden rounded-[2.5rem] border-4 border-[#c4b5fd] bg-[#f5f3ff] p-6 shadow-[0_8px_0_0_#c4b5fd] flex flex-col justify-center"
                >
                    <div className="flex items-center justify-between mb-5">
                        <p className="text-sm font-black uppercase tracking-widest text-[#8b5cf6]">Progress</p>
                        <div className="border-2 border-[#ede9fe] bg-white rounded-full px-4 py-1.5 text-sm font-black text-[#7c3aed] shadow-sm">
                            Elo <AnimatedNumber value={model.growth.eloRating} />
                        </div>
                    </div>
                    <div className="h-6 overflow-hidden rounded-full bg-[#ede9fe] border-2 border-white shadow-inner">
                        <div
                            className="h-full rounded-full bg-[#8b5cf6] transition-all duration-1000 ease-out"
                            style={{ width: `${Math.max(10, model.growth.progressRatio * 100)}%` }}
                        />
                    </div>
                    <div className="mt-3 flex justify-between text-[13px] font-black text-[#a78bfa]">
                        <span>START</span>
                        <span>PEAK {model.growth.maxElo}</span>
                    </div>
                </motion.div>

                {/* Streak BENTO */}
                <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={springTransition}
                    className="col-span-1 relative overflow-hidden rounded-[2rem] border-4 border-[#fcd34d] bg-[#fffbeb] p-5 shadow-[0_8px_0_0_#fcd34d] flex flex-col items-center justify-center text-center"
                >
                    <Flame className="w-10 h-10 text-[#f59e0b] mb-2" />
                    <span className="font-welcome-display text-4xl font-black text-[#d97706]">{streakMetric}</span>
                    <span className="text-xs font-black uppercase tracking-wider text-[#ea580c] mt-2">Day Streak</span>
                </motion.div>

                {/* Words / Reads BENTO (stacked) */}
                <div className="col-span-1 flex flex-col gap-4">
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={springTransition}
                        className="flex-1 rounded-[1.8rem] border-4 border-[#6ee7b7] bg-[#ecfdf5] p-4 shadow-[0_6px_0_0_#6ee7b7] flex items-center gap-4"
                    >
                        <div className="bg-white border-2 border-[#a7f3d0] text-[#10b981] p-3 rounded-full flex-shrink-0 shadow-sm">
                            <BrainCircuit className="w-6 h-6" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-welcome-display text-2xl font-black text-[#059669]">{wordsMetric}</span>
                            <span className="text-[10px] font-black uppercase text-[#34d399]">Words</span>
                        </div>
                    </motion.div>

                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={springTransition}
                        className="flex-1 rounded-[1.8rem] border-4 border-[#93c5fd] bg-[#eff6ff] p-4 shadow-[0_6px_0_0_#93c5fd] flex items-center gap-4"
                    >
                        <div className="bg-white border-2 border-[#bfdbfe] text-[#3b82f6] p-3 rounded-full flex-shrink-0 shadow-sm">
                            <BookOpenText className="w-6 h-6" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-welcome-display text-2xl font-black text-[#2563eb]">{readsMetric}</span>
                            <span className="text-[10px] font-black uppercase text-[#60a5fa]">Articles</span>
                        </div>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
}
