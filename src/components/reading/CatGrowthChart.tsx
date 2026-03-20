"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, Crown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAT_RANK_TIERS, getCatRankIconByTierId, getCatRankTier } from "@/lib/cat-score";

interface CatHistorySession {
    id: string;
    createdAt: string;
    completedAt: string | null;
    scoreBefore: number;
    scoreAfter: number;
    delta: number;
    status: "started" | "completed";
    accuracy: number | null;
    quizCorrect: number | null;
    quizTotal: number | null;
    nextBand: number | null;
}

interface CatHistoryResponse {
    sessions?: CatHistorySession[];
    total?: number;
}

interface CatGrowthChartProps {
    currentScore: number;
}

interface ChartPoint {
    idx: number;
    sessionId: string;
    score: number;
    delta: number;
    dateLabel: string;
    fullDate: string;
    rankName: string;
    rankIcon: string;
}

function formatDateLabel(iso: string) {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "--";
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateTime(iso: string) {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "未知时间";
    return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function CatGrowthChart({ currentScore }: CatGrowthChartProps) {
    const [sessions, setSessions] = useState<CatHistorySession[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const fetchHistory = async () => {
            setIsLoading(true);
            try {
                const response = await fetch("/api/ai/cat/history?limit=48", { cache: "no-store" });
                const payload = await response.json().catch(() => ({})) as CatHistoryResponse;
                if (!response.ok) {
                    throw new Error("Failed to fetch CAT history");
                }
                if (!cancelled) {
                    const normalized = Array.isArray(payload.sessions)
                        ? payload.sessions.filter((item) => item && typeof item.id === "string")
                        : [];
                    setSessions(normalized);
                }
            } catch {
                if (!cancelled) {
                    setSessions([]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        fetchHistory();
        return () => {
            cancelled = true;
        };
    }, []);

    const chartData = useMemo<ChartPoint[]>(() => {
        const completed = sessions.filter((item) => item.status === "completed");
        if (completed.length === 0) {
            const tier = getCatRankTier(currentScore);
            return [
                {
                    idx: 1,
                    sessionId: "seed",
                    score: currentScore,
                    delta: 0,
                    dateLabel: "当前",
                    fullDate: "当前状态",
                    rankName: tier.name,
                    rankIcon: getCatRankIconByTierId(tier.id),
                },
            ];
        }

        return completed.map((item, index) => {
            const tier = getCatRankTier(item.scoreAfter);
            const dateSource = item.completedAt || item.createdAt;
            return {
                idx: index + 1,
                sessionId: item.id,
                score: item.scoreAfter,
                delta: item.delta,
                dateLabel: formatDateLabel(dateSource),
                fullDate: formatDateTime(dateSource),
                rankName: tier.name,
                rankIcon: getCatRankIconByTierId(tier.id),
            };
        });
    }, [sessions, currentScore]);

    const currentPoint = chartData[chartData.length - 1];
    const peakScore = chartData.reduce((max, item) => Math.max(max, item.score), currentScore);
    const trendDelta = chartData.length > 1 ? currentPoint.score - chartData[Math.max(0, chartData.length - 5)].score : 0;
    const trendState = trendDelta > 0 ? "up" : trendDelta < 0 ? "down" : "stable";
    const activeTier = getCatRankTier(currentPoint?.score ?? currentScore);
    const nextTier = CAT_RANK_TIERS.find((tier) => tier.index === activeTier.index + 1) ?? null;

    const yDomain: [number, number] = useMemo(() => {
        const values = chartData.map((item) => item.score);
        const min = Math.min(...values, currentScore);
        const max = Math.max(...values, currentScore);
        const floor = Math.max(0, Math.floor((min - 120) / 100) * 100);
        const ceil = Math.ceil((max + 120) / 100) * 100;
        return [floor, Math.max(floor + 200, ceil)];
    }, [chartData, currentScore]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-[26px] border border-white/70 bg-white/44 shadow-[0_24px_44px_-28px_rgba(15,23,42,0.7)] backdrop-blur-2xl"
        >
            <div className="border-b border-white/70 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold tracking-[0.12em] text-slate-500">成长曲线</p>
                        <div className="mt-1 flex items-center gap-2">
                            <span className="text-[1.28rem] font-semibold text-slate-900 tabular-nums">{currentPoint?.score ?? currentScore}</span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/75 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                <span>{getCatRankIconByTierId(activeTier.id)}</span>
                                {activeTier.name}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-100/70 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            <Crown className="h-3.5 w-3.5" /> 峰值 {peakScore}
                        </span>
                        <span className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
                            trendState === "up" && "border-emerald-200/80 bg-emerald-100/70 text-emerald-700",
                            trendState === "down" && "border-rose-200/80 bg-rose-100/75 text-rose-700",
                            trendState === "stable" && "border-slate-200/80 bg-white/75 text-slate-600",
                        )}>
                            {trendState === "up" ? <TrendingUp className="h-3.5 w-3.5" /> : trendState === "down" ? <ArrowDown className="h-3.5 w-3.5" /> : null}
                            {trendState === "stable" ? "近 5 局持平" : `近 5 局 ${trendDelta > 0 ? `+${trendDelta}` : trendDelta}`}
                        </span>
                    </div>
                </div>
            </div>

            <div className="h-56 px-3 pb-3 pt-2 md:h-60">
                {isLoading ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">曲线加载中...</div>
                ) : chartData.length < 2 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">完成两局后显示趋势</div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 8, right: 14, left: -8, bottom: 6 }}>
                            <defs>
                                <linearGradient id="cat-curve-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.42} />
                                    <stop offset="48%" stopColor="#6366f1" stopOpacity={0.22} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="cat-curve-stroke" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#06b6d4" />
                                    <stop offset="55%" stopColor="#6366f1" />
                                    <stop offset="100%" stopColor="#a855f7" />
                                </linearGradient>
                            </defs>

                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.24)" />

                            {nextTier ? (
                                <ReferenceLine
                                    y={nextTier.minScore}
                                    stroke="rgba(99,102,241,0.34)"
                                    strokeDasharray="8 6"
                                    strokeWidth={1}
                                    label={{
                                        value: `下一段 ${nextTier.name}`,
                                        position: "right",
                                        fill: "rgba(79,70,229,0.82)",
                                        fontSize: 10,
                                        fontWeight: 600,
                                    }}
                                />
                            ) : null}

                            <XAxis
                                dataKey="dateLabel"
                                tick={{ fontSize: 10, fill: "#64748b" }}
                                axisLine={false}
                                tickLine={false}
                                minTickGap={24}
                            />
                            <YAxis
                                domain={yDomain}
                                tick={{ fontSize: 10, fill: "#94a3b8" }}
                                axisLine={false}
                                tickLine={false}
                                width={44}
                            />

                            <Tooltip
                                content={({ active, payload }) => {
                                    if (!active || !payload || payload.length === 0) return null;
                                    const point = payload[0].payload as ChartPoint;
                                    return (
                                        <div className="min-w-[150px] rounded-2xl border border-white/75 bg-white/88 p-3 shadow-[0_20px_36px_-22px_rgba(15,23,42,0.55)] backdrop-blur-xl">
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{point.fullDate}</p>
                                            <div className="mt-1 flex items-center justify-between">
                                                <span className="text-xl font-semibold text-slate-900 tabular-nums">{point.score}</span>
                                                <span className="text-xs text-slate-700">{point.rankIcon} {point.rankName}</span>
                                            </div>
                                            <p className={cn(
                                                "mt-1 text-xs font-semibold",
                                                point.delta >= 0 ? "text-emerald-600" : "text-rose-600",
                                            )}>
                                                本局变化 {point.delta >= 0 ? `+${point.delta}` : point.delta}
                                            </p>
                                        </div>
                                    );
                                }}
                            />

                            <Area
                                type="natural"
                                dataKey="score"
                                stroke="url(#cat-curve-stroke)"
                                strokeWidth={2.5}
                                fill="url(#cat-curve-fill)"
                                dot={{ r: 4, fill: "#6366f1", stroke: "#ffffff", strokeWidth: 1.5 }}
                                activeDot={{ r: 7, fill: "#22d3ee", stroke: "#ffffff", strokeWidth: 2 }}
                                animationDuration={900}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </motion.div>
    );
}
