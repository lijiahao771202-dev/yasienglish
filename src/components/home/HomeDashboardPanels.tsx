"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
});

function formatDelta(value: number) {
    if (value > 0) return `+${value}`;
    return `${value}`;
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
                <h1 className="font-newsreader text-[2.8rem] leading-[0.95] tracking-[-0.06em] text-[#181512] sm:text-[4rem]">
                    {headline}
                </h1>
                <p className="max-w-3xl text-[15px] leading-8 text-[#7d7468] sm:text-base">
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
                    Upgrade
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
}: {
    label: string;
    value: string;
    tone?: "soft" | "dark";
}) {
    return (
        <div
            className={`rounded-[1.4rem] border px-4 py-3 ${
                tone === "dark"
                    ? "border-[#2c2f3a] bg-[linear-gradient(145deg,rgba(29,31,40,0.96),rgba(43,47,58,0.92))] text-white shadow-[0_24px_42px_-30px_rgba(27,28,36,0.88)]"
                    : "border-white/78 bg-white/58 text-[#5d564d] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_24px_42px_-30px_rgba(43,38,31,0.14)]"
            }`}
        >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] opacity-75">{label}</p>
            <p className="mt-2 font-newsreader text-[1.8rem] leading-none tracking-[-0.05em]">{value}</p>
        </div>
    );
}

function BattleGlowTooltip({ active, payload }: any) {
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
        <section className="relative overflow-hidden rounded-[2.3rem] border border-white/76 bg-[linear-gradient(135deg,rgba(255,255,255,0.44),rgba(241,236,228,0.2))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_26px_46px_-30px_rgba(15,23,42,0.42)] backdrop-blur-[22px]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.76),transparent_20%),radial-gradient(circle_at_72%_24%,rgba(255,231,169,0.34),transparent_22%),radial-gradient(circle_at_74%_74%,rgba(226,180,125,0.16),transparent_30%)]" />
            <div className="pointer-events-none absolute -left-12 bottom-10 h-40 w-40 rounded-full bg-[#f8edcf]/44 blur-3xl" />
            <div className="pointer-events-none absolute right-12 top-12 h-44 w-44 rounded-full bg-[#fff8df]/36 blur-3xl" />

            <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="space-y-3">
                    <p className="text-[0.78rem] font-semibold uppercase tracking-[0.34em] text-[#8c8275]">
                        Learning glow
                    </p>
                    <div className="space-y-3">
                        <h2 className="max-w-xl font-newsreader text-[2.2rem] leading-[0.98] tracking-[-0.05em] text-[#1e1a16]">
                            把 Battle 的 Elo 轨迹，变成今天最柔软的一道光。
                        </h2>
                        <p className="max-w-xl text-sm leading-7 text-[#6e665b] sm:text-[15px]">
                            这里不再只是一个泡泡。你的每次起伏、回弹和小小爆发，都被留成了一条会发亮的曲线。
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
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex h-[320px] items-center justify-center rounded-[1.7rem] border border-dashed border-white/70 bg-white/28 text-center">
                            <div>
                                <p className="font-newsreader text-3xl tracking-[-0.05em] text-[#2b2621]">
                                    Battle 轨迹还没开始发光
                                </p>
                                <p className="mt-3 max-w-sm text-sm leading-7 text-[#6f675c]">
                                    打一两场 Battle 之后，这里就会开始长出你的 Elo 曲线。
                                </p>
                                <Link
                                    href="/battle"
                                    className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/58 px-4 py-2 text-sm font-semibold text-[#5d564d] shadow-[0_18px_32px_-24px_rgba(45,38,31,0.14)]"
                                >
                                    Go to Battle
                                    <ArrowUpRight className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                    <SummaryChip label="current elo" value={String(glowModel.currentElo)} tone="dark" />
                    <SummaryChip label="peak glow" value={String(glowModel.peakElo)} />
                    <SummaryChip label="recent swing" value={formatDelta(glowModel.delta)} />
                    <SummaryChip label="battle sessions" value={String(glowModel.sessions)} />
                </div>
            </div>

            <div className="relative z-10 mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.4rem] border border-white/72 bg-white/44 px-4 py-3 text-[#5e564b] shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] backdrop-blur-xl">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[#93897c]">
                        Day streak
                    </p>
                    <p className="mt-2 font-newsreader text-3xl leading-none tracking-[-0.05em]">
                        {streakMetric?.value ?? "0"}
                    </p>
                </div>
                <div className="rounded-[1.4rem] border border-white/72 bg-white/44 px-4 py-3 text-[#5e564b] shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] backdrop-blur-xl">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[#93897c]">
                        Words saved
                    </p>
                    <p className="mt-2 font-newsreader text-3xl leading-none tracking-[-0.05em]">
                        {wordsMetric?.value ?? "0"}
                    </p>
                </div>
                <div className="rounded-[1.4rem] border border-white/72 bg-white/44 px-4 py-3 text-[#5e564b] shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] backdrop-blur-xl">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[#93897c]">
                        Articles read
                    </p>
                    <p className="mt-2 font-newsreader text-3xl leading-none tracking-[-0.05em]">
                        {readsMetric?.value ?? "0"}
                    </p>
                </div>
            </div>
        </section>
    );
}

function getCalendarDayTone(day: HomeCalendarDay) {
    if (!day.isCurrentMonth) {
        return "border-white/10 bg-transparent text-[#4c5161]/26";
    }

    if (day.isToday) {
        return "border-[#f1d25b] bg-[#f1d25b] text-[#161720] shadow-[0_18px_28px_-22px_rgba(241,210,91,0.92)]";
    }

    if (day.isStreak) {
        return "border-white/0 bg-white/14 text-white";
    }

    if (day.isActive) {
        return "border-white/0 bg-white/8 text-[#f5f3ee]";
    }

    return "border-white/0 bg-transparent text-[#f5f3ee]";
}

function LearningCalendarCard({
    monthLabel,
    calendarDays,
}: Pick<HomeDashboardViewModel, "monthLabel" | "calendarDays">) {
    return (
        <section className="rounded-[2.3rem] border border-[#2d313e] bg-[linear-gradient(180deg,#1d2029_0%,#171a24_100%)] p-5 text-white shadow-[0_28px_48px_-30px_rgba(15,23,42,0.92)]">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-[0.76rem] font-semibold uppercase tracking-[0.34em] text-[#8f95a4]">
                        Learning calendar
                    </p>
                    <h3 className="mt-3 font-newsreader text-[2rem] leading-none tracking-[-0.05em] text-white">
                        Your training days
                    </h3>
                </div>
                <div className="rounded-full border border-white/8 bg-white/6 px-4 py-2 text-sm font-medium text-[#c7ccd7]">
                    {monthLabel}
                </div>
            </div>

            <div className="mt-6 px-2 py-2">
                <div className="grid grid-cols-7 gap-y-3 text-center">
                    {HOME_WEEKDAY_LABELS.map((day, index) => (
                        <p
                            key={`${day}-${index}`}
                            className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#757c8d]"
                        >
                            {day}
                        </p>
                    ))}
                    {calendarDays.map((day) => (
                        <div key={day.dateKey} className="flex justify-center">
                            <div
                                className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold transition ${getCalendarDayTone(day)}`}
                            >
                                {day.label}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-4 text-xs text-[#a8adba]">
                <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#f1d25b]" />
                    Current day
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/14" />
                    Active streak
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/8" />
                    Active day
                </span>
            </div>
        </section>
    );
}

function GoalCard({
    goal,
}: {
    goal: HomeDashboardViewModel["goal"];
}) {
    return (
        <section className="rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,#fbf8f2_0%,#f7f3ec_100%)] p-5 shadow-[0_24px_42px_-30px_rgba(15,23,42,0.35)]">
            <p className="text-[0.76rem] font-semibold uppercase tracking-[0.34em] text-[#91887c]">
                Today&apos;s intention
            </p>
            <h3 className="mt-3 font-newsreader text-[1.95rem] leading-none tracking-[-0.05em] text-[#181512]">
                给今天一个柔软但明确的方向
            </h3>
            <p className="mt-3 text-sm leading-7 text-[#7e766a]">
                不用把自己逼到最满，先给今天一个小而笃定的练习目标。
            </p>

            <div className="mt-6 flex items-center justify-between gap-4">
                <div className="space-y-2">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#91887c]">Daily goal</p>
                    <p className="font-newsreader text-[2.4rem] leading-none tracking-[-0.06em] text-[#181512]">
                        {goal.dailyGoalMinutes} min
                    </p>
                    <p className="text-sm text-[#655e55]">{goal.targetModeLabel}</p>
                    <p className="text-sm text-[#8d8477]">{goal.englishLevelLabel}</p>
                </div>

                <div
                    className="relative flex h-28 w-28 items-center justify-center rounded-full"
                    style={{
                        background: `conic-gradient(#d97d45 0deg, #d97d45 ${goal.dialRatio * 360}deg, rgba(216,211,202,0.95) ${goal.dialRatio * 360}deg 360deg)`,
                    }}
                >
                    <div className="flex h-[78%] w-[78%] flex-col items-center justify-center rounded-full bg-[#faf7f1] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[#a0978d]">Goal</p>
                        <p className="mt-1 font-newsreader text-[1.35rem] leading-none tracking-[-0.05em] text-[#181512]">
                            {goal.dailyGoalMinutes}
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

function GrowthCard({
    growth,
}: {
    growth: HomeDashboardViewModel["growth"];
}) {
    const percentage = Math.round(growth.progressRatio * 100);

    return (
        <section className="rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,#fbf8f2_0%,#f7f3ec_100%)] p-5 shadow-[0_24px_42px_-30px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-[0.76rem] font-semibold uppercase tracking-[0.34em] text-[#91887c]">
                        Glow progress
                    </p>
                    <h3 className="mt-3 font-newsreader text-[1.85rem] leading-none tracking-[-0.05em] text-[#181512]">
                        你正在靠近自己的高光线
                    </h3>
                </div>
                <div className="rounded-[1.2rem] border border-white/75 bg-white/66 px-4 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                    <p className="font-newsreader text-[1.9rem] leading-none tracking-[-0.05em] text-[#181512]">
                        {percentage}%
                    </p>
                    <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#9a9085]">
                        of peak
                    </p>
                </div>
            </div>

            <div className="mt-6">
                <div className="h-3 overflow-hidden rounded-full bg-[#e5ddd0]">
                    <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#232127_0%,#3b3941_35%,#d97d45_100%)] shadow-[0_14px_22px_-18px_rgba(15,23,42,0.82)]"
                        style={{ width: `${Math.max(12, percentage)}%` }}
                    />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-[#6f675c]">
                    <span>Current Elo {growth.eloRating}</span>
                    <span>Peak {growth.maxElo}</span>
                </div>
            </div>
        </section>
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

function LearningLanesCard({
    learningLanes,
}: {
    learningLanes: HomeDashboardViewModel["learningLanes"];
}) {
    return (
        <section className="rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,#fbf8f2_0%,#f7f3ec_100%)] p-5 shadow-[0_24px_42px_-30px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-[0.76rem] font-semibold uppercase tracking-[0.34em] text-[#91887c]">
                        Learning lanes
                    </p>
                    <h3 className="mt-3 font-newsreader text-[2rem] leading-none tracking-[-0.05em] text-[#181512]">
                        Pick the lane that feels easiest today
                    </h3>
                </div>
                <div className="rounded-full border border-white/75 bg-white/66 px-4 py-2 text-sm font-semibold text-[#3d3731] shadow-[0_14px_22px_-22px_rgba(15,23,42,0.34)]">
                    little rituals
                </div>
            </div>

            <div className="mt-6 space-y-3">
                {learningLanes.map((lane) => {
                    const Icon = getLaneIcon(lane.id);

                    return (
                        <Link
                            key={lane.id}
                            href={lane.href}
                            className="group flex flex-col gap-4 rounded-[1.6rem] border border-white/82 bg-white/72 px-4 py-4 shadow-[0_20px_34px_-30px_rgba(15,23,42,0.25)] transition hover:border-[#d4ccbf] hover:shadow-[0_22px_36px_-30px_rgba(15,23,42,0.34)] sm:flex-row sm:items-center sm:justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-[#ede8de] text-[#1f1c18] shadow-[0_14px_22px_-20px_rgba(15,23,42,0.35)]">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-base font-semibold text-[#181512]">{lane.title}</p>
                                    <p className="mt-1 text-sm text-[#7b7267]">{lane.subtitle}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 sm:min-w-[320px]">
                                <div className="min-w-[92px] text-sm font-medium text-[#5d564d]">{lane.valueLabel}</div>
                                <div className="flex-1">
                                    <div className="flex h-2.5 gap-1">
                                        {Array.from({ length: 10 }, (_, index) => {
                                            const isFilled = index < Math.round(lane.progressRatio * 10);
                                            return (
                                                <span
                                                    key={`${lane.id}-${index}`}
                                                    className={`h-full flex-1 rounded-full ${
                                                        isFilled
                                                            ? "bg-[linear-gradient(180deg,#f08d54,#d96d3e)]"
                                                            : "bg-[#e4ddd4]"
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
        </section>
    );
}

export function HomeDashboardPanels({
    model,
    eloHistory,
    accountEmail,
    passwordUpdated = false,
}: HomeDashboardPanelsProps) {
    return (
        <section className="flex min-w-0 flex-col gap-5 rounded-[2.6rem] bg-[linear-gradient(180deg,#f9f6ef_0%,#f3efe8_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] lg:p-7">
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
        </section>
    );
}
