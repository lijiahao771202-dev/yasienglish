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
            className="overflow-hidden rounded-[30px] border-4 border-[#d8d3cb] bg-white shadow-[0_12px_0_0_#d8d3cb]"
        >
            <div className="border-b-4 border-[#ece7df] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#64748b]">成长趋势</p>
                        <div className="mt-2 flex items-center gap-2">
                            <span className="font-welcome-display text-[1.9rem] font-black leading-none tracking-[-0.04em] text-[#111827] tabular-nums">
                                {currentPoint?.score ?? currentScore}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#d8d3cb] bg-[#fffdf8] px-2.5 py-1 text-xs font-bold text-slate-700">
                                <span>{getCatRankIconByTierId(activeTier.id)}</span>
                                {activeTier.name}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#fdba74] bg-[#ffedd5] px-3 py-1 text-xs font-bold text-[#9a3412]">
                            <Crown className="h-3.5 w-3.5" /> 峰值 {peakScore}
                        </span>
                        <span className={cn(
                            "inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 text-xs font-bold",
                            trendState === "up" && "border-[#86efac] bg-[#dcfce7] text-[#15803d]",
                            trendState === "down" && "border-[#fda4af] bg-[#ffe4e6] text-[#e11d48]",
                            trendState === "stable" && "border-[#d8d3cb] bg-[#fffdf8] text-slate-600",
                        )}>
                            {trendState === "up" ? <TrendingUp className="h-3.5 w-3.5" /> : trendState === "down" ? <ArrowDown className="h-3.5 w-3.5" /> : null}
                            {trendState === "stable" ? "近 5 局持平" : `近 5 局 ${trendDelta > 0 ? `+${trendDelta}` : trendDelta}`}
                        </span>
                    </div>
                </div>
            </div>

            <div className="h-64 bg-[#fffdf8] px-3 pb-4 pt-3 md:h-72">
                {isLoading ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">曲线加载中...</div>
                ) : chartData.length < 2 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">完成两局后显示趋势</div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 8, right: 14, left: -8, bottom: 6 }}>
                            <defs>
                                <linearGradient id="cat-curve-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.4} />
                                    <stop offset="48%" stopColor="#818cf8" stopOpacity={0.22} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="cat-curve-stroke" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#2563eb" />
                                    <stop offset="55%" stopColor="#4f46e5" />
                                    <stop offset="100%" stopColor="#f59e0b" />
                                </linearGradient>
                            </defs>

                            <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="rgba(148,163,184,0.22)" />

                            {nextTier ? (
                                <ReferenceLine
                                    y={nextTier.minScore}
                                    stroke="rgba(37,99,235,0.34)"
                                    strokeDasharray="8 6"
                                    strokeWidth={1}
                                    label={{
                                        value: `下一段 ${nextTier.name}`,
                                        position: "right",
                                        fill: "rgba(37,99,235,0.82)",
                                        fontSize: 10,
                                        fontWeight: 700,
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
                                        <div className="min-w-[150px] rounded-[20px] border-2 border-[#d8d3cb] bg-white p-3 shadow-[0_8px_0_0_#d8d3cb]">
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{point.fullDate}</p>
                                            <div className="mt-1 flex items-center justify-between">
                                                <span className="font-welcome-display text-xl font-black text-slate-900 tabular-nums">{point.score}</span>
                                                <span className="text-xs font-bold text-slate-700">{point.rankIcon} {point.rankName}</span>
                                            </div>
                                            <p className={cn(
                                                "mt-1 text-xs font-bold",
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
                                strokeWidth={3}
                                fill="url(#cat-curve-fill)"
                                dot={{ r: 4, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 2 }}
                                activeDot={{ r: 7, fill: "#f59e0b", stroke: "#ffffff", strokeWidth: 2.5 }}
                                animationDuration={900}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </motion.div>
    );
}
