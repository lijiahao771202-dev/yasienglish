"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import {
    ArrowUpRight,
    BookOpenText,
    BrainCircuit,
    Feather,
    Search,
    Sparkles,
    Swords,
} from "lucide-react";

import type {
    HomeCalendarDay,
    HomeDashboardViewModel,
    HomeLearningLane,
} from "@/components/home/home-data";
import { HOME_WEEKDAY_LABELS } from "@/components/home/home-data";
import { ConnectedUserAvatarMenu } from "@/components/profile/UserAvatarMenu";
import type { EloHistoryItem } from "@/lib/db";

interface HomeDashboardPanelsProps {
    model: HomeDashboardViewModel;
    eloHistory: EloHistoryItem[];
    accountEmail?: string | null;
    passwordUpdated?: boolean;
}

interface EloGlowPoint {
    label: string;
    elo: number;
    change: number;
    timestamp: number;
}

interface LanePalette {
    iconBg: string;
    iconText: string;
    chipBg: string;
    chipText: string;
    railEmpty: string;
    railFill: string;
    cardBg: string;
    cardBorder: string;
    cardHoverBorder: string;
}

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
});

function formatDelta(value: number) {
    if (value > 0) return `+${value}`;
    return `${value}`;
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
            const nextValue = startValue + (delta * eased);
            setDisplayValue(nextValue);

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
    const textValue = signed ? formatDelta(roundedValue) : String(roundedValue);

    return <span className={className}>{textValue}</span>;
}

function buildBattleGlowModel(eloHistory: EloHistoryItem[], fallbackElo: number) {
    const translationHistory = eloHistory
        .filter((item) => item.mode === "translation")
        .sort((left, right) => left.timestamp - right.timestamp);
    const sourceHistory = translationHistory.length
        ? translationHistory
        : [...eloHistory].sort((left, right) => left.timestamp - right.timestamp);
    const visibleHistory = sourceHistory.slice(-14);
    const points: EloGlowPoint[] = visibleHistory.map((item) => ({
        label: SHORT_DATE_FORMATTER.format(new Date(item.timestamp)),
        elo: item.elo,
        change: item.change,
        timestamp: item.timestamp,
    }));

    const currentElo = points.at(-1)?.elo ?? fallbackElo;
    const firstElo = points[0]?.elo ?? fallbackElo;
    const peakElo = sourceHistory.length
        ? Math.max(...sourceHistory.map((item) => item.elo), fallbackElo)
        : fallbackElo;

    return {
        points,
        currentElo,
        peakElo,
        delta: currentElo - firstElo,
        latestChange: points.at(-1)?.change ?? 0,
        sessions: sourceHistory.length,
    };
}

function TopBar({
    headline,
    subline,
    accountEmail,
}: {
    headline: string;
    subline: string;
    accountEmail?: string | null;
}) {
    const [searchValue, setSearchValue] = useState("");

    return (
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
                <h1 className="font-welcome-display text-[2.8rem] leading-[0.95] tracking-[-0.06em] text-[#181512] sm:text-[4rem]">
                    {headline}
                </h1>
                <p className="max-w-2xl text-[14px] leading-6 text-[#7d7468] sm:text-[15px]">
                    {subline}
                </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row xl:pt-3">
                <label className="flex min-h-[56px] min-w-[300px] items-center gap-3 rounded-full border border-white/80 bg-white/62 px-5 text-sm text-[#8a8175] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_22px_42px_-28px_rgba(45,38,31,0.14)]">
                    <Search className="h-4 w-4 text-[#8d857b]" />
                    <input
                        value={searchValue}
                        onChange={(event) => setSearchValue(event.target.value)}
                        placeholder="Search your words, notes, or mood"
                        className="w-full bg-transparent text-sm text-[#3e3831] outline-none placeholder:text-[#a49b90]"
                    />
                </label>

                <button
                    type="button"
                    className="min-h-[56px] rounded-full bg-[#1c1c23] px-7 text-sm font-semibold text-white shadow-[0_24px_34px_-24px_rgba(28,28,35,0.92)] transition hover:bg-[#2b2b35]"
                >
                    会员
                </button>
                {accountEmail ? <ConnectedUserAvatarMenu email={accountEmail} placement="header" /> : null}
            </div>
        </div>
    );
}

function SummaryChip({
    label,
    value,
    tone = "soft",
    signed = false,
}: {
    label: string;
    value: number;
    tone?: "soft" | "dark";
    signed?: boolean;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.994, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] as const }}
            className={`rounded-[1.4rem] border px-4 py-3 ${
                tone === "dark"
                    ? "border-[#2c2f3a] bg-[linear-gradient(145deg,rgba(29,31,40,0.96),rgba(43,47,58,0.92))] text-white shadow-[0_24px_42px_-30px_rgba(27,28,36,0.88)]"
                    : "border-white/78 bg-white/58 text-[#5d564d] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_24px_42px_-30px_rgba(43,38,31,0.14)]"
            }`}
        >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] opacity-75">{label}</p>
            <p className="mt-2 font-welcome-display text-[1.8rem] leading-none tracking-[-0.05em]">
                <AnimatedNumber value={value} signed={signed} />
            </p>
        </motion.div>
    );
}

interface BattleGlowTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: EloGlowPoint }>;
}

function BattleGlowTooltip({ active, payload }: BattleGlowTooltipProps) {
    if (!active || !payload?.length) {
        return null;
    }

    const point = payload[0].payload as EloGlowPoint;

    return (
        <div className="rounded-[1.2rem] border border-white/80 bg-white/86 px-4 py-3 text-sm text-[#62584d] shadow-[0_18px_36px_-24px_rgba(45,37,31,0.18)] backdrop-blur-xl">
            <p className="font-semibold text-[#1d1916]">{point.label}</p>
            <p className="mt-1">Elo {point.elo}</p>
            <p className="text-[#d97d45]">Change {formatDelta(point.change)}</p>
        </div>
    );
}

function BattleGlowCard({
    model,
    eloHistory,
}: {
    model: HomeDashboardViewModel;
    eloHistory: EloHistoryItem[];
}) {
    const glowModel = useMemo(
        () => buildBattleGlowModel(eloHistory, model.growth.eloRating),
        [eloHistory, model.growth.eloRating],
    );
    const streakMetric = model.glowMetrics.find((metric) => metric.id === "streak");
    const wordsMetric = model.glowMetrics.find((metric) => metric.id === "words");
    const readsMetric = model.glowMetrics.find((metric) => metric.id === "reads");
    const hasCurve = glowModel.points.length > 1;

    return (
        <motion.section
            initial={{ opacity: 0, scale: 0.994, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.86, ease: [0.22, 1, 0.36, 1] as const }}
            className="liquid-glass-interactive relative overflow-hidden rounded-[2.3rem] border border-white/76 bg-[linear-gradient(135deg,rgba(255,255,255,0.44),rgba(241,236,228,0.2))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_26px_46px_-30px_rgba(15,23,42,0.42)] backdrop-blur-[22px]"
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.76),transparent_20%),radial-gradient(circle_at_72%_24%,rgba(255,231,169,0.34),transparent_22%),radial-gradient(circle_at_74%_74%,rgba(226,180,125,0.16),transparent_30%)]" />
            <div className="pointer-events-none absolute -left-12 bottom-10 h-40 w-40 rounded-full bg-[#f8edcf]/44 blur-3xl" />
            <div className="pointer-events-none absolute right-12 top-12 h-44 w-44 rounded-full bg-[#fff8df]/36 blur-3xl" />

            <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="space-y-3">
                    <p className="text-[0.78rem] font-semibold uppercase tracking-[0.34em] text-[#8c8275]">
                        BATTLE
                    </p>
                    <div className="space-y-3">
                        <h2 className="max-w-xl font-welcome-display text-[2.2rem] leading-[0.98] tracking-[-0.05em] text-[#1e1a16]">
                            Elo 曲线
                        </h2>
                        <p className="max-w-xl text-sm leading-6 text-[#6e665b] sm:text-[15px]">
                            保持节奏，就会发光。
                        </p>
                    </div>
                </div>

                <div className="rounded-full border border-[#26242b] bg-[#26242b] p-3 text-[#efd35d] shadow-[0_18px_22px_-18px_rgba(15,23,42,0.85)]">
                    <Sparkles className="h-5 w-5" />
                </div>
            </div>

            <div className="relative z-10 mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_280px]">
                <div className="rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,250,240,0.24))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),inset_0_-1px_0_rgba(255,255,255,0.35)] backdrop-blur-2xl">
                    {hasCurve ? (
                        <div className="h-[320px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={glowModel.points}
                                    margin={{ top: 18, right: 18, bottom: 4, left: 0 }}
                                >
                                    <defs>
                                        <linearGradient id="home-elo-fill" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="0%" stopColor="#f1d572" stopOpacity={0.58} />
                                            <stop offset="60%" stopColor="#f5c08d" stopOpacity={0.2} />
                                            <stop offset="100%" stopColor="#ffffff" stopOpacity={0.06} />
                                        </linearGradient>
                                        <linearGradient id="home-elo-stroke" x1="0" x2="1" y1="0" y2="0">
                                            <stop offset="0%" stopColor="#2d2c33" />
                                            <stop offset="100%" stopColor="#d78a4c" />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} stroke="rgba(98,88,73,0.1)" />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: "#8f857b", fontSize: 12 }}
                                        dy={12}
                                    />
                                    <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
                                    <Tooltip cursor={{ stroke: "rgba(215,138,76,0.18)", strokeWidth: 2 }} content={<BattleGlowTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="elo"
                                        stroke="url(#home-elo-stroke)"
                                        strokeWidth={4}
                                        fill="url(#home-elo-fill)"
                                        activeDot={{ r: 6, fill: "#d78a4c", stroke: "#fff9ef", strokeWidth: 2 }}
                                        isAnimationActive
                                        animationDuration={1300}
                                        animationEasing="ease-out"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex h-[320px] items-center justify-center rounded-[1.7rem] border border-dashed border-white/70 bg-white/28 text-center">
                            <div>
                                <p className="font-welcome-display text-3xl tracking-[-0.05em] text-[#2b2621]">
                                    先打一场 Battle
                                </p>
                                <p className="mt-3 max-w-sm text-sm leading-6 text-[#6f675c]">
                                    这里会出现 Elo 曲线。
                                </p>
                                <Link
                                    href="/battle"
                                    className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/58 px-4 py-2 text-sm font-semibold text-[#5d564d] shadow-[0_18px_32px_-24px_rgba(45,38,31,0.14)]"
                                >
                                    去 Battle
                                    <ArrowUpRight className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                    <SummaryChip label="Elo" value={glowModel.currentElo} tone="dark" />
                    <SummaryChip label="Peak" value={glowModel.peakElo} />
                    <SummaryChip label="Delta" value={glowModel.delta} signed />
                    <SummaryChip label="Sessions" value={glowModel.sessions} />
                </div>
            </div>

            <div className="relative z-10 mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.4rem] border border-white/72 bg-white/44 px-4 py-3 text-[#5e564b] shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] backdrop-blur-xl">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[#93897c]">
                        Day streak
                    </p>
                    <p className="mt-2 font-welcome-display text-3xl leading-none tracking-[-0.05em]">
                        {streakMetric?.value ?? "0"}
                    </p>
                </div>
                <div className="rounded-[1.4rem] border border-white/72 bg-white/44 px-4 py-3 text-[#5e564b] shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] backdrop-blur-xl">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[#93897c]">
                        Words saved
                    </p>
                    <p className="mt-2 font-welcome-display text-3xl leading-none tracking-[-0.05em]">
                        {wordsMetric?.value ?? "0"}
                    </p>
                </div>
                <div className="rounded-[1.4rem] border border-white/72 bg-white/44 px-4 py-3 text-[#5e564b] shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] backdrop-blur-xl">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[#93897c]">
                        Articles read
                    </p>
                    <p className="mt-2 font-welcome-display text-3xl leading-none tracking-[-0.05em]">
                        {readsMetric?.value ?? "0"}
                    </p>
                </div>
            </div>
        </motion.section>
    );
}

function getCalendarDayTone(day: HomeCalendarDay) {
    if (!day.isCurrentMonth) {
        return "border-transparent bg-transparent text-[#c8cfef]/24";
    }

    if (day.isToday) {
        return "border-[#ff8cc0]/80 bg-[linear-gradient(180deg,rgba(255,159,210,0.96),rgba(242,113,180,0.9))] text-[#2a1120] shadow-[0_16px_24px_-18px_rgba(246,120,187,0.84),inset_0_1px_0_rgba(255,233,245,0.72)]";
    }

    if (day.isStreak) {
        return "border-[#cebaff]/56 bg-[linear-gradient(180deg,rgba(196,177,255,0.34),rgba(165,150,233,0.24))] text-[#f3efff] shadow-[inset_0_1px_0_rgba(236,229,255,0.4)]";
    }

    if (day.isActive) {
        return "border-[#9ec5ff]/56 bg-[linear-gradient(180deg,rgba(143,188,255,0.3),rgba(112,158,236,0.2))] text-[#ecf5ff] shadow-[inset_0_1px_0_rgba(225,238,255,0.36)]";
    }

    return "border-white/22 bg-white/6 text-[#f2f3ff]";
}

function LearningCalendarCard({
    monthLabel,
    calendarDays,
}: Pick<HomeDashboardViewModel, "monthLabel" | "calendarDays">) {
    return (
        <motion.section
            initial={{ opacity: 0, scale: 0.994, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.88, delay: 0.06, ease: [0.22, 1, 0.36, 1] as const }}
            className="liquid-glass-interactive relative overflow-hidden rounded-[2.5rem] border border-white/24 bg-[linear-gradient(180deg,rgba(54,64,108,0.34)_0%,rgba(64,48,92,0.32)_44%,rgba(44,36,78,0.3)_100%)] p-6 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.26),inset_0_-1px_0_rgba(185,203,255,0.12),0_28px_52px_-34px_rgba(18,20,42,0.72)] backdrop-blur-[52px] backdrop-saturate-[170%]"
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(84%_54%_at_12%_10%,rgba(255,255,255,0.18),transparent_62%),radial-gradient(64%_40%_at_88%_14%,rgba(255,157,206,0.18),transparent_66%),radial-gradient(110%_72%_at_50%_100%,rgba(130,166,255,0.14),transparent_76%)]" />
            <div className="pointer-events-none absolute inset-[1px] rounded-[2.38rem] border border-white/12" />
            <div className="relative z-10 flex items-start justify-between gap-4">
                <div>
                    <p className="text-[0.74rem] font-semibold uppercase tracking-[0.32em] text-[#cfd9ff]">
                        CALENDAR
                    </p>
                    <h3 className="mt-2.5 font-welcome-display text-[2.05rem] leading-none tracking-[-0.01em] text-white">
                        本月打卡
                    </h3>
                </div>
                <div className="rounded-full border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.06))] px-4 py-2 text-sm font-medium text-[#e7edff] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-xl">
                    {monthLabel}
                </div>
            </div>

            <div className="relative z-10 mt-6 rounded-[1.85rem] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                <div className="grid grid-cols-7 gap-y-4 text-center">
                    {HOME_WEEKDAY_LABELS.map((day, index) => (
                        <p
                            key={`${day}-${index}`}
                            className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#c9d2f5]"
                        >
                            {day}
                        </p>
                    ))}
                    {calendarDays.map((day, index) => (
                        <motion.div
                            key={day.dateKey}
                            className="flex justify-center"
                            initial={{ opacity: 0, scale: 0.94, filter: "blur(6px)" }}
                            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                            transition={{ delay: 0.12 + (index * 0.012), duration: 0.46, ease: [0.22, 1, 0.36, 1] as const }}
                        >
                            <div
                                className={`flex h-12 w-12 items-center justify-center rounded-full border text-[1.03rem] font-semibold transition ${getCalendarDayTone(day)}`}
                            >
                                {day.label}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            <div className="relative z-10 mt-5 flex flex-wrap gap-5 text-xs text-[#d8def6]">
                <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff7db7]" />
                    Current day
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#cebaff]" />
                    Active streak
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#9ec5ff]" />
                    Active day
                </span>
            </div>
        </motion.section>
    );
}

function GoalCard({
    goal,
}: {
    goal: HomeDashboardViewModel["goal"];
}) {
    return (
        <motion.section
            initial={{ opacity: 0, scale: 0.994, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.78, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
            className="liquid-glass-interactive rounded-[2rem] border border-[#f7d4e4] bg-[linear-gradient(180deg,#fff7fa_0%,#feeef5_100%)] p-5 shadow-[0_24px_42px_-30px_rgba(43,18,32,0.26)]"
        >
            <p className="text-[0.76rem] font-semibold uppercase tracking-[0.34em] text-[#9c6c82]">
                TODAY
            </p>
            <h3 className="mt-3 font-welcome-display text-[1.95rem] leading-none tracking-[-0.05em] text-[#181512]">
                今日目标
            </h3>
            <p className="mt-3 text-sm leading-6 text-[#866274]">
                小步也算前进。
            </p>

            <div className="mt-6 flex items-center justify-between gap-4">
                <div className="space-y-2">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#9c6c82]">Daily goal</p>
                    <p className="font-welcome-display text-[2.4rem] leading-none tracking-[-0.06em] text-[#181512]">
                        {goal.dailyGoalMinutes} min
                    </p>
                    <p className="text-sm text-[#6b505f]">{goal.targetModeLabel}</p>
                    <p className="text-sm text-[#8f6f80]">{goal.englishLevelLabel}</p>
                </div>

                <div
                    className="relative flex h-28 w-28 items-center justify-center rounded-full"
                    style={{
                        background: `conic-gradient(#ea5e9d 0deg, #ea5e9d ${goal.dialRatio * 360}deg, rgba(236,210,223,0.95) ${goal.dialRatio * 360}deg 360deg)`,
                    }}
                >
                    <div className="flex h-[78%] w-[78%] flex-col items-center justify-center rounded-full bg-[#fff5fa] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[#a8778f]">Goal</p>
                        <p className="mt-1 font-welcome-display text-[1.35rem] leading-none tracking-[-0.05em] text-[#181512]">
                            {goal.dailyGoalMinutes}
                        </p>
                    </div>
                </div>
            </div>
        </motion.section>
    );
}

function GrowthCard({
    growth,
}: {
    growth: HomeDashboardViewModel["growth"];
}) {
    const percentage = Math.round(growth.progressRatio * 100);

    return (
        <motion.section
            initial={{ opacity: 0, scale: 0.994, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.78, delay: 0.14, ease: [0.22, 1, 0.36, 1] as const }}
            className="liquid-glass-interactive rounded-[2rem] border border-[#f7d4e4] bg-[linear-gradient(180deg,#fff7fa_0%,#feeef5_100%)] p-5 shadow-[0_24px_42px_-30px_rgba(43,18,32,0.26)]"
        >
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-[0.76rem] font-semibold uppercase tracking-[0.34em] text-[#9c6c82]">
                        PROGRESS
                    </p>
                    <h3 className="mt-3 font-welcome-display text-[1.85rem] leading-none tracking-[-0.05em] text-[#181512]">
                        成长进度
                    </h3>
                </div>
                <div className="rounded-[1.2rem] border border-white/80 bg-white/72 px-4 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                    <p className="font-welcome-display text-[1.9rem] leading-none tracking-[-0.05em] text-[#181512]">
                        <AnimatedNumber value={percentage} />%
                    </p>
                    <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#a17488]">
                        of peak
                    </p>
                </div>
            </div>

            <div className="mt-6">
                <div className="h-3 overflow-hidden rounded-full bg-[#efdbe5]">
                    <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#b22f73_0%,#df5798_38%,#ff97bf_100%)] shadow-[0_14px_22px_-18px_rgba(87,22,53,0.6)] transition-[width] duration-1000 ease-out"
                        style={{ width: `${Math.max(12, percentage)}%` }}
                    />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-[#775966]">
                    <span>Current Elo <AnimatedNumber value={growth.eloRating} /></span>
                    <span>Peak <AnimatedNumber value={growth.maxElo} /></span>
                </div>
            </div>
        </motion.section>
    );
}

function getLaneIcon(laneId: HomeLearningLane["id"]) {
    switch (laneId) {
        case "battle":
            return Swords;
        case "vocab":
            return BrainCircuit;
        case "writing":
            return Feather;
        default:
            return BookOpenText;
    }
}

function getLanePalette(laneId: HomeLearningLane["id"]): LanePalette {
    switch (laneId) {
        case "battle":
            return {
                iconBg: "bg-[#ffe4ef]",
                iconText: "text-[#b42366]",
                chipBg: "bg-[#ffd5e8]",
                chipText: "text-[#8d2459]",
                railEmpty: "bg-[#f2dbe6]",
                railFill: "bg-[linear-gradient(90deg,#ff5da2,#d93687)]",
                cardBg: "bg-[linear-gradient(145deg,rgba(255,237,246,0.88),rgba(255,219,238,0.78))]",
                cardBorder: "border-[#f7c6de]",
                cardHoverBorder: "hover:border-[#ef9ec8]",
            };
        case "vocab":
            return {
                iconBg: "bg-[#ffe9f0]",
                iconText: "text-[#c73774]",
                chipBg: "bg-[#ffe1ec]",
                chipText: "text-[#9e2f63]",
                railEmpty: "bg-[#f5dee8]",
                railFill: "bg-[linear-gradient(90deg,#ff79b0,#df4f8d)]",
                cardBg: "bg-[linear-gradient(145deg,rgba(255,243,248,0.9),rgba(255,228,241,0.78))]",
                cardBorder: "border-[#f8d2e3]",
                cardHoverBorder: "hover:border-[#f2aacb]",
            };
        case "writing":
            return {
                iconBg: "bg-[#ffeef4]",
                iconText: "text-[#c74f85]",
                chipBg: "bg-[#ffe6f0]",
                chipText: "text-[#a03d6d]",
                railEmpty: "bg-[#f3e0e9]",
                railFill: "bg-[linear-gradient(90deg,#ffa1c7,#e1669a)]",
                cardBg: "bg-[linear-gradient(145deg,rgba(255,247,250,0.9),rgba(255,234,244,0.8))]",
                cardBorder: "border-[#f7dbe8]",
                cardHoverBorder: "hover:border-[#ecb8d1]",
            };
        default:
            return {
                iconBg: "bg-[#fff0f5]",
                iconText: "text-[#d04d85]",
                chipBg: "bg-[#ffeaf3]",
                chipText: "text-[#a93b6f]",
                railEmpty: "bg-[#f5dfe8]",
                railFill: "bg-[linear-gradient(90deg,#ff8fbd,#e15694)]",
                cardBg: "bg-[linear-gradient(145deg,rgba(255,245,249,0.9),rgba(255,228,239,0.78))]",
                cardBorder: "border-[#f7d3e3]",
                cardHoverBorder: "hover:border-[#efabca]",
            };
    }
}

function LearningLanesCard({
    learningLanes,
}: {
    learningLanes: HomeDashboardViewModel["learningLanes"];
}) {
    return (
        <motion.section
            initial={{ opacity: 0, scale: 0.994, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.82, delay: 0.18, ease: [0.22, 1, 0.36, 1] as const }}
            className="liquid-glass-interactive rounded-[2rem] border border-[#f7d4e4] bg-[linear-gradient(180deg,#fff7fa_0%,#feeef5_100%)] p-5 shadow-[0_24px_42px_-30px_rgba(43,18,32,0.26)]"
        >
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-[0.76rem] font-semibold uppercase tracking-[0.34em] text-[#9c6c82]">
                        LANE
                    </p>
                    <h3 className="mt-3 font-welcome-display text-[2rem] leading-none tracking-[-0.05em] text-[#181512]">
                        学习入口
                    </h3>
                </div>
                <div className="rounded-full border border-[#f4d5e4] bg-white/72 px-4 py-2 text-sm font-semibold text-[#8f345f] shadow-[0_14px_22px_-22px_rgba(72,21,46,0.25)]">
                    quick start
                </div>
            </div>

            <div className="mt-6 space-y-3">
                {learningLanes.map((lane) => {
                    const Icon = getLaneIcon(lane.id);
                    const palette = getLanePalette(lane.id);

                    return (
                        <Link
                            key={lane.id}
                            href={lane.href}
                            className={`group flex flex-col gap-4 rounded-[1.6rem] border px-4 py-4 shadow-[0_20px_34px_-30px_rgba(15,23,42,0.25)] transition ${palette.cardBg} ${palette.cardBorder} ${palette.cardHoverBorder} hover:shadow-[0_22px_36px_-30px_rgba(15,23,42,0.34)] sm:flex-row sm:items-center sm:justify-between`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`flex h-12 w-12 items-center justify-center rounded-[1rem] shadow-[0_14px_22px_-20px_rgba(15,23,42,0.35)] ${palette.iconBg} ${palette.iconText}`}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-base font-semibold text-[#181512]">{lane.title}</p>
                                    <p className="mt-1 text-sm text-[#7b7267]">{lane.subtitle}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 sm:min-w-[320px]">
                                <div className={`rounded-full px-2.5 py-1 text-sm font-semibold ${palette.chipBg} ${palette.chipText}`}>{lane.valueLabel}</div>
                                <div className="flex-1">
                                    <div className="flex h-2.5 gap-1">
                                        {Array.from({ length: 10 }, (_, index) => {
                                            const isFilled = index < Math.round(lane.progressRatio * 10);
                                            return (
                                                <span
                                                    key={`${lane.id}-${index}`}
                                                    className={`h-full flex-1 rounded-full ${
                                                        isFilled
                                                            ? palette.railFill
                                                            : palette.railEmpty
                                                    }`}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                                <ArrowUpRight className="h-4 w-4 text-[#7f766a] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                            </div>
                        </Link>
                    );
                })}
            </div>
        </motion.section>
    );
}

export function HomeDashboardPanels({
    model,
    eloHistory,
    accountEmail,
    passwordUpdated = false,
}: HomeDashboardPanelsProps) {
    return (
        <motion.section
            initial={{ opacity: 0, scale: 0.996, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.86, ease: [0.22, 1, 0.36, 1] as const }}
            className="relative flex min-w-0 flex-col gap-5 overflow-hidden rounded-[2.75rem] border border-white/18 bg-[linear-gradient(180deg,rgba(255,251,254,0.1)_0%,rgba(252,240,248,0.05)_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_20px_46px_-40px_rgba(28,22,38,0.22)] backdrop-blur-[58px] backdrop-saturate-[200%] lg:p-7"
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_55%_at_12%_8%,rgba(255,255,255,0.16),transparent_62%),radial-gradient(65%_44%_at_84%_20%,rgba(255,219,240,0.1),transparent_66%)]" />
            <div className="relative z-10 flex min-w-0 flex-col gap-5">
            {passwordUpdated ? (
                <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                    密码已经更新，你的账号空间也已经回来了。
                </div>
            ) : null}

            <TopBar headline={model.headline} subline={model.subline} accountEmail={accountEmail} />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_360px]">
                <BattleGlowCard model={model} eloHistory={eloHistory} />
                <LearningCalendarCard monthLabel={model.monthLabel} calendarDays={model.calendarDays} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="space-y-5">
                    <GoalCard goal={model.goal} />
                    <GrowthCard growth={model.growth} />
                </div>
                <LearningLanesCard learningLanes={model.learningLanes} />
            </div>
            </div>
        </motion.section>
    );
}
