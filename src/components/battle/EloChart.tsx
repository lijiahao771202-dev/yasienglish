"use client";

import { useEffect, useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { db, EloHistoryItem } from '@/lib/db';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Headphones, Feather, TrendingUp, Crown, ArrowUp, ArrowDown, Zap, Flame, Snowflake, Calendar, History, Clock, BookOpen } from 'lucide-react';
import { getRank } from '@/lib/rankUtils';

interface EloChartProps {
    mode: 'listening' | 'translation' | 'dictation';
}

// Rank boundaries
const RANK_BOUNDARIES = [
    { elo: 400, name: '新手', color: '#78716c' },
    { elo: 800, name: '青铜', color: '#d97706' },
    { elo: 1200, name: '白银', color: '#64748b' },
    { elo: 1600, name: '黄金', color: '#eab308' },
    { elo: 2000, name: '铂金', color: '#06b6d4' },
    { elo: 2400, name: '钻石', color: '#3b82f6' },
    { elo: 2800, name: '大师', color: '#a855f7' },
    { elo: 3200, name: '王者', color: '#ec4899' },
];

// Milestone milestones
const MILESTONES = [1000, 1500, 2000, 2500, 3000];

type TimeFilter = 'today' | 'week' | 'all';

interface EnhancedEloItem extends EloHistoryItem {
    dateStr: string;
    timeStr: string;
    isPeak: boolean;
    isPromotion: boolean;
    isDemotion: boolean;
    isMilestone: boolean;
    milestoneValue?: number;
    streak: number; // positive = win streak, negative = lose streak
    isStreakStart: boolean; // Only show fire/ice on streak start
    rank: ReturnType<typeof getRank>;
    prevRank?: ReturnType<typeof getRank>;
}

// Custom dot component with fire/ice effects
interface CustomDotProps {
    cx?: number;
    cy?: number;
    payload?: EnhancedEloItem;
}

const CustomDot = ({ cx, cy, payload }: CustomDotProps) => {
    if (!payload || cx === undefined || cy === undefined) return null;

    const item = payload;
    const streak = item.streak || 0;

    // Milestone marker (trophy)
    if (item.isMilestone) {
        return (
            <g>
                <circle cx={cx} cy={cy} r={12} fill="#a855f7" fillOpacity={0.2} />
                <circle cx={cx} cy={cy} r={8} fill="#a855f7" stroke="#7c3aed" strokeWidth={2} />
                <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize={8} fontWeight="bold">🏆</text>
            </g>
        );
    }

    // Peak marker (gold crown)
    if (item.isPeak) {
        return (
            <g>
                <circle cx={cx} cy={cy} r={10} fill="#fbbf24" fillOpacity={0.3} />
                <circle cx={cx} cy={cy} r={7} fill="#fbbf24" stroke="#f59e0b" strokeWidth={2} />
                <text x={cx} y={cy + 4} textAnchor="middle" fill="#78350f" fontSize={8}>👑</text>
            </g>
        );
    }

    // Promotion marker
    if (item.isPromotion) {
        return (
            <g>
                <circle cx={cx} cy={cy} r={10} fill="#22c55e" fillOpacity={0.3} />
                <circle cx={cx} cy={cy} r={6} fill="#22c55e" stroke="#16a34a" strokeWidth={2} />
            </g>
        );
    }

    // Demotion marker
    if (item.isDemotion) {
        return (
            <g>
                <circle cx={cx} cy={cy} r={10} fill="#ef4444" fillOpacity={0.3} />
                <circle cx={cx} cy={cy} r={6} fill="#ef4444" stroke="#dc2626" strokeWidth={2} />
            </g>
        );
    }

    // Hot streak (3+ wins) - fire effect (only on streak start)
    if (streak >= 3 && item.isStreakStart) {
        const intensity = Math.min(streak, 7);
        return (
            <g>
                <circle cx={cx} cy={cy} r={6 + intensity} fill="#f97316" fillOpacity={0.2} />
                <circle cx={cx} cy={cy} r={5} fill={`rgb(${255 - intensity * 10}, ${100 - intensity * 10}, 0)`} stroke="#ea580c" strokeWidth={2} />
                <text x={cx} y={cy - 10} textAnchor="middle" fontSize={10}>🔥</text>
            </g>
        );
    }

    // Cold streak (3+ losses) - ice effect (only on streak start)
    if (streak <= -3 && item.isStreakStart) {
        const intensity = Math.min(Math.abs(streak), 7);
        return (
            <g>
                <circle cx={cx} cy={cy} r={6 + intensity} fill="#3b82f6" fillOpacity={0.2} />
                <circle cx={cx} cy={cy} r={5} fill="#60a5fa" stroke="#2563eb" strokeWidth={2} />
                <text x={cx} y={cy - 10} textAnchor="middle" fontSize={10}>❄️</text>
            </g>
        );
    }

    // Regular dots - uniform size for cleaner look
    const baseSize = 4;
    const color = (item.change || 0) >= 0 ? '#22c55e' : '#ef4444';

    return (
        <circle cx={cx} cy={cy} r={baseSize} fill={color} fillOpacity={0.9} stroke="white" strokeWidth={1} />
    );
};

export function EloChart({ mode }: EloChartProps) {
    const [allData, setAllData] = useState<EnhancedEloItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [peakElo, setPeakElo] = useState(0);
    const [currentElo, setCurrentElo] = useState(0);
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const history = await db.elo_history
                    .where('mode')
                    .equals(mode)
                    .reverse()
                    .limit(100) // Load more for filtering
                    .toArray();

                // Process data
                let peak = 0;
                let currentStreak = 0;
                const sorted = history.reverse();

                const enhanced: EnhancedEloItem[] = sorted.map((item, i) => {
                    const rank = getRank(item.elo);
                    const prevRank = i > 0 ? getRank(sorted[i - 1].elo) : undefined;
                    const prevElo = i > 0 ? sorted[i - 1].elo : item.elo;

                    if (item.elo > peak) peak = item.elo;

                    // Calculate streak
                    if (item.change > 0) {
                        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
                    } else if (item.change < 0) {
                        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
                    } else {
                        currentStreak = 0;
                    }

                    // Check milestones (crossing a milestone threshold)
                    const isMilestone = MILESTONES.some(m => prevElo < m && item.elo >= m);
                    const milestoneValue = MILESTONES.find(m => prevElo < m && item.elo >= m);

                    const isPromotion = prevRank && rank.title !== prevRank.title && item.change > 0;
                    const isDemotion = prevRank && rank.title !== prevRank.title && item.change < 0;

                    // Check if this is the start of a streak (streak just reached 3)
                    const isStreakStart = (currentStreak === 3) || (currentStreak === -3);

                    return {
                        ...item,
                        dateStr: new Date(item.timestamp).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' }),
                        timeStr: new Date(item.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
                        isPeak: false,
                        isPromotion: !!isPromotion,
                        isDemotion: !!isDemotion,
                        isMilestone,
                        milestoneValue,
                        streak: currentStreak,
                        isStreakStart,
                        rank,
                        prevRank
                    };
                });

                // Mark peak
                const peakIndex = enhanced.findIndex(e => e.elo === peak);
                if (peakIndex >= 0) enhanced[peakIndex].isPeak = true;

                setPeakElo(peak);
                setCurrentElo(enhanced.length > 0 ? enhanced[enhanced.length - 1].elo : 0);
                setAllData(enhanced);
            } catch (error) {
                console.error("Failed to load history", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [mode]);

    // Filter data by time
    const data = useMemo(() => {
        const now = Date.now();
        const todayStart = new Date().setHours(0, 0, 0, 0);
        const weekStart = now - 7 * 24 * 60 * 60 * 1000;

        switch (timeFilter) {
            case 'today':
                return allData.filter(d => d.timestamp >= todayStart);
            case 'week':
                return allData.filter(d => d.timestamp >= weekStart);
            default:
                return allData.slice(-30); // Last 30 for 'all'
        }
    }, [allData, timeFilter]);

    // Calculate visible rank boundaries
    const visibleBoundaries = useMemo(() => {
        if (data.length === 0) return [];
        const minElo = Math.min(...data.map(d => d.elo)) - 100;
        const maxElo = Math.max(...data.map(d => d.elo)) + 100;
        return RANK_BOUNDARIES.filter(b => b.elo >= minElo && b.elo <= maxElo);
    }, [data]);

    // Calculate trend
    const trend = useMemo(() => {
        if (data.length < 2) return 'neutral';
        const recent = data.slice(-5);
        const totalChange = recent.reduce((sum, d) => sum + (d.change || 0), 0);
        if (totalChange > 20) return 'up';
        if (totalChange < -20) return 'down';
        return 'neutral';
    }, [data]);

    // Current streak
    const currentStreak = useMemo(() => {
        if (data.length === 0) return 0;
        return data[data.length - 1].streak;
    }, [data]);

    // Average Elo
    const averageElo = useMemo(() => {
        if (data.length === 0) return 0;
        return Math.round(data.reduce((sum, d) => sum + d.elo, 0) / data.length);
    }, [data]);

    // Comparison with yesterday/last week
    const comparison = useMemo(() => {
        if (allData.length < 2) return null;

        const now = Date.now();
        const yesterdayStart = new Date().setHours(0, 0, 0, 0) - 24 * 60 * 60 * 1000;
        const lastWeekStart = now - 7 * 24 * 60 * 60 * 1000;

        // Find yesterday's last elo
        const yesterdayData = allData.filter(d => d.timestamp < new Date().setHours(0, 0, 0, 0) && d.timestamp >= yesterdayStart);
        const lastWeekData = allData.filter(d => d.timestamp < lastWeekStart + 24 * 60 * 60 * 1000 && d.timestamp >= lastWeekStart);

        const yesterdayElo = yesterdayData.length > 0 ? yesterdayData[yesterdayData.length - 1].elo : null;
        const lastWeekElo = lastWeekData.length > 0 ? lastWeekData[lastWeekData.length - 1].elo : null;

        return {
            vsYesterday: yesterdayElo ? currentElo - yesterdayElo : null,
            vsLastWeek: lastWeekElo ? currentElo - lastWeekElo : null
        };
    }, [allData, currentElo]);

    // Y-axis domain with nice round numbers
    const yAxisDomain = useMemo(() => {
        if (data.length === 0) return [0, 100];
        const minElo = Math.min(...data.map(d => d.elo));
        const maxElo = Math.max(...data.map(d => d.elo));
        // Round to nearest 100
        const roundedMin = Math.floor((minElo - 50) / 100) * 100;
        const roundedMax = Math.ceil((maxElo + 50) / 100) * 100;
        return [roundedMin, roundedMax];
    }, [data]);

    const isListening = mode === 'listening';
    const isDictation = mode === 'dictation';
    const baseColor = isListening ? '#0ea5e9' : isDictation ? '#a855f7' : '#8b5cf6';
    const trendColor = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : baseColor;
    const gradientId = `colorElo-${mode}`;
    const currentRank = getRank(currentElo || 400);

    if (isLoading) return <div className="h-64 flex items-center justify-center text-stone-400">Loading chart...</div>;

    if (data.length < 2) {
        return (
            <div className="flex flex-col bg-white/40 rounded-3xl border border-white/40 backdrop-blur-sm">
                {/* Time Filter Tabs - Always visible */}
                <div className="flex items-center gap-2 p-4 border-b border-stone-100/50">
                    {[
                        { key: 'today' as TimeFilter, label: '今日', icon: Clock },
                        { key: 'week' as TimeFilter, label: '本周', icon: Calendar },
                        { key: 'all' as TimeFilter, label: '历史', icon: History },
                    ].map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setTimeFilter(key)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                timeFilter === key
                                    ? "bg-stone-800 text-white shadow-lg"
                                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                            )}
                        >
                            <Icon className="w-3 h-3" />
                            {label}
                        </button>
                    ))}
                </div>
                {/* Empty state message */}
                <div className="h-48 flex flex-col items-center justify-center text-stone-400 gap-3 p-4">
                    <div className="relative">
                        <TrendingUp className="w-12 h-12 opacity-30" />
                        <motion.div
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full"
                        />
                    </div>
                    <p className="text-sm font-medium">
                        {timeFilter === 'today' ? '今日暂无数据' :
                            timeFilter === 'week' ? '本周暂无数据' : '完成更多练习以查看进度!'}
                    </p>
                    <p className="text-xs text-stone-300">
                        {timeFilter === 'today' ? '完成练习后这里会显示今日曲线' :
                            timeFilter === 'week' ? '完成练习后这里会显示本周曲线' : '至少需要2次练习才能显示图表'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-lg overflow-hidden"
        >
            {/* Header */}
            <div className="p-4 border-b border-stone-100/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-2 rounded-xl text-white shadow-lg",
                            isListening
                                ? "bg-gradient-to-br from-sky-400 to-sky-600"
                                : isDictation
                                    ? "bg-gradient-to-br from-fuchsia-500 to-purple-600"
                                    : "bg-gradient-to-br from-violet-400 to-violet-600"
                        )}>
                            {isListening ? <Headphones className="w-5 h-5" /> : isDictation ? <BookOpen className="w-5 h-5" /> : <Feather className="w-5 h-5" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-stone-700 text-lg">{currentElo}</span>
                                <div className={cn("flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", currentRank.color, currentRank.bg)}>
                                    <currentRank.icon className="w-3 h-3" />
                                    {currentRank.title}
                                </div>
                                {/* Streak badge */}
                                {currentStreak >= 3 && (
                                    <div className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">
                                        <Flame className="w-3 h-3" /> {currentStreak}🔥
                                    </div>
                                )}
                                {currentStreak <= -3 && (
                                    <div className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">
                                        <Snowflake className="w-3 h-3" /> {Math.abs(currentStreak)}❄️
                                    </div>
                                )}
                            </div>
                            <div className="text-[10px] text-stone-400 uppercase tracking-wider mt-1">
                                {currentRank.distToNext > 0 ? `${currentRank.distToNext} to ${currentRank.nextRank?.title}` : 'Max Rank'}
                            </div>
                        </div>
                    </div>

                    {/* Peak Elo Badge + Comparison */}
                    <div className="flex items-center gap-2">
                        {/* Comparison badges */}
                        {comparison && comparison.vsYesterday !== null && (
                            <div className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold",
                                comparison.vsYesterday >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                            )}>
                                {comparison.vsYesterday >= 0 ? "+" : ""}{comparison.vsYesterday} vs 昨日
                            </div>
                        )}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
                            <Crown className="w-4 h-4 text-amber-500" />
                            <span className="text-xs font-bold text-amber-700">Peak: {peakElo}</span>
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3">
                    <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${currentRank.progress}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={cn("h-full rounded-full bg-gradient-to-r",
                                isListening
                                    ? "from-sky-400 to-sky-500"
                                    : isDictation
                                        ? "from-fuchsia-500 to-purple-600"
                                        : "from-violet-400 to-violet-500"
                            )}
                        />
                    </div>
                </div>

                {/* Time Filter Tabs */}
                <div className="flex items-center gap-2 mt-4">
                    {[
                        { key: 'today' as TimeFilter, label: '今日', icon: Clock },
                        { key: 'week' as TimeFilter, label: '本周', icon: Calendar },
                        { key: 'all' as TimeFilter, label: '历史', icon: History },
                    ].map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setTimeFilter(key)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                timeFilter === key
                                    ? "bg-stone-800 text-white shadow-lg"
                                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                            )}
                        >
                            <Icon className="w-3 h-3" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart Area */}
            <div className="h-56 p-4">
                {data.length < 2 ? (
                    <div className="h-full flex items-center justify-center text-stone-400 text-sm">
                        此时间段内没有数据
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                            <defs>
                                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={trendColor} stopOpacity={0.4} />
                                    <stop offset="50%" stopColor={baseColor} stopOpacity={0.15} />
                                    <stop offset="95%" stopColor={baseColor} stopOpacity={0} />
                                </linearGradient>
                            </defs>

                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e5e5" />

                            {/* Rank boundaries with gradient bands */}
                            {visibleBoundaries.map((boundary) => (
                                <ReferenceLine
                                    key={boundary.elo}
                                    y={boundary.elo}
                                    stroke={boundary.color}
                                    strokeDasharray="8 4"
                                    strokeOpacity={0.5}
                                    strokeWidth={1.5}
                                    label={{
                                        value: boundary.name,
                                        position: 'right',
                                        fill: boundary.color,
                                        fontSize: 10,
                                        fontWeight: 'bold'
                                    }}
                                />
                            ))}

                            {/* Peak line */}
                            <ReferenceLine
                                y={peakElo}
                                stroke="#f59e0b"
                                strokeDasharray="4 2"
                                strokeWidth={2}
                                strokeOpacity={0.6}
                            />

                            {/* Average Elo line */}
                            <ReferenceLine
                                y={averageElo}
                                stroke="#a1a1aa"
                                strokeDasharray="3 3"
                                strokeWidth={1}
                                strokeOpacity={0.5}
                                label={{
                                    value: `Avg: ${averageElo}`,
                                    position: 'left',
                                    fill: '#a1a1aa',
                                    fontSize: 9
                                }}
                            />

                            <XAxis
                                dataKey="timestamp"
                                tickFormatter={(ts) => {
                                    const d = new Date(ts);
                                    return timeFilter === 'today'
                                        ? `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`
                                        : `${d.getMonth() + 1}/${d.getDate()}`;
                                }}
                                tick={{ fontSize: 9, fill: '#a8a29e' }}
                                axisLine={false}
                                tickLine={false}
                                interval="preserveStartEnd"
                                minTickGap={40}
                            />
                            <YAxis
                                domain={yAxisDomain}
                                tick={{ fontSize: 10, fill: '#a8a29e' }}
                                axisLine={false}
                                tickLine={false}
                                width={45}
                                tickFormatter={(v) => v.toString()}
                            />

                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const item = payload[0].payload as EnhancedEloItem;
                                        const change = item.change || 0;
                                        const streak = item.streak || 0;

                                        return (
                                            <div className="bg-white/95 backdrop-blur-xl p-4 rounded-2xl border border-stone-200 shadow-2xl min-w-[160px]">
                                                <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mb-2">
                                                    {item.dateStr} • {item.timeStr}
                                                </div>

                                                <div className="flex items-center justify-between gap-4 mb-3">
                                                    <span className="text-2xl font-black text-stone-800">{item.elo}</span>
                                                    <span className={cn(
                                                        "flex items-center gap-1 text-sm font-bold px-2 py-1 rounded-lg",
                                                        change > 0 ? "text-emerald-600 bg-emerald-50" :
                                                            change < 0 ? "text-rose-600 bg-rose-50" : "text-stone-400 bg-stone-50"
                                                    )}>
                                                        {change > 0 ? <ArrowUp className="w-3 h-3" /> : change < 0 ? <ArrowDown className="w-3 h-3" /> : null}
                                                        {change > 0 ? `+${change}` : change}
                                                    </span>
                                                </div>

                                                <div className={cn("flex items-center gap-2 text-xs font-bold px-2 py-1 rounded-lg mb-2", item.rank.color, item.rank.bg)}>
                                                    <item.rank.icon className="w-3 h-3" />
                                                    {item.rank.title}
                                                </div>

                                                {/* Streak indicator */}
                                                {streak >= 3 && (
                                                    <div className="flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg mb-2">
                                                        🔥 {streak} 连胜中!
                                                    </div>
                                                )}
                                                {streak <= -3 && (
                                                    <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg mb-2">
                                                        ❄️ {Math.abs(streak)} 连败中
                                                    </div>
                                                )}

                                                {/* Special badges */}
                                                {item.isMilestone && (
                                                    <div className="flex items-center gap-1 text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-lg mb-2">
                                                        🏆 突破 {item.milestoneValue} 里程碑!
                                                    </div>
                                                )}
                                                {item.isPeak && (
                                                    <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg mb-2">
                                                        👑 历史最高
                                                    </div>
                                                )}
                                                {item.isPromotion && (
                                                    <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                                        ⬆️ 晋升到 {item.rank.title}!
                                                    </div>
                                                )}
                                                {item.isDemotion && (
                                                    <div className="flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">
                                                        ⬇️ 降级至 {item.rank.title}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />

                            <Area
                                type="natural"
                                dataKey="elo"
                                stroke={trendColor}
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill={`url(#${gradientId})`}
                                animationDuration={1500}
                                dot={<CustomDot />}
                                activeDot={{ r: 8, stroke: trendColor, strokeWidth: 2, fill: 'white' }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Footer Stats */}
            <div className="px-4 pb-4">
                <div className="flex items-center justify-between text-xs text-stone-400 bg-stone-50/50 rounded-xl p-3">
                    <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span>{data.length} drills ({timeFilter === 'today' ? '今日' : timeFilter === 'week' ? '本周' : '历史'})</span>
                    </div>
                    <div className={cn(
                        "flex items-center gap-1 font-bold",
                        trend === 'up' ? "text-emerald-500" : trend === 'down' ? "text-rose-500" : "text-stone-400"
                    )}>
                        {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : trend === 'down' ? <ArrowDown className="w-3 h-3" /> : null}
                        {trend === 'up' ? 'Rising' : trend === 'down' ? 'Falling' : 'Stable'}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
