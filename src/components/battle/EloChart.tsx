"use client";

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { db, EloHistoryItem } from '@/lib/db';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Headphones, Feather, TrendingUp } from 'lucide-react';

interface EloChartProps {
    mode: 'listening' | 'translation';
}

export function EloChart({ mode }: EloChartProps) {
    const [data, setData] = useState<EloHistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                // Get last 20 entries
                const history = await db.elo_history
                    .where('mode')
                    .equals(mode)
                    .reverse()
                    .limit(20)
                    .toArray();

                // Sort back to chronological order
                const sorted = history.reverse().map(item => ({
                    ...item,
                    dateStr: new Date(item.timestamp).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' }),
                    timeStr: new Date(item.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                }));

                setData(sorted);
            } catch (error) {
                console.error("Failed to load history", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [mode]);

    const isListening = mode === 'listening';
    const color = isListening ? '#0ea5e9' : '#8b5cf6'; // sky-500 : violet-500
    const gradientId = `colorElo-${mode}`;

    if (isLoading) return <div className="h-48 flex items-center justify-center text-stone-400">Loading chart...</div>;

    if (data.length < 2) {
        return (
            <div className="h-48 flex flex-col items-center justify-center text-stone-400 gap-2 bg-white/40 rounded-3xl border border-white/40 backdrop-blur-sm">
                <TrendingUp className="w-8 h-8 opacity-50" />
                <p className="text-sm">Complete more drills to see your progress!</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full h-64 bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-lg p-4 relative overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4 px-2">
                <div className={cn("p-1.5 rounded-lg text-white", isListening ? "bg-sky-500" : "bg-violet-500")}>
                    {isListening ? <Headphones className="w-4 h-4" /> : <Feather className="w-4 h-4" />}
                </div>
                <span className="font-bold text-stone-600 uppercase tracking-wider text-xs">
                    {mode} Curve
                </span>
            </div>

            <ResponsiveContainer width="100%" height="80%">
                <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis
                        dataKey="timestamp"
                        tickFormatter={(ts) => {
                            const d = new Date(ts);
                            return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
                        }}
                        tick={{ fontSize: 9, fill: '#a8a29e' }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={30}
                    />
                    <YAxis
                        domain={['dataMin - 50', 'dataMax + 50']}
                        tick={{ fontSize: 10, fill: '#a8a29e' }}
                        axisLine={false}
                        tickLine={false}
                        width={45}
                    />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                const item = payload[0].payload;
                                const change = item.change || 0;
                                return (
                                    <div className="bg-white/90 backdrop-blur-md p-3 rounded-2xl border border-stone-200 shadow-xl min-w-[120px]">
                                        <div className="text-[10px] text-stone-500 font-bold uppercase tracking-wider mb-1">{item.timeStr}</div>
                                        <div className="flex items-baseline justify-between gap-4">
                                            <span className="text-xl font-black text-stone-800">{item.elo}</span>
                                            <span className={cn(
                                                "text-xs font-bold px-1.5 py-0.5 rounded",
                                                change > 0 ? "text-emerald-600 bg-emerald-50" :
                                                    change < 0 ? "text-rose-600 bg-rose-50" : "text-stone-400 bg-stone-50"
                                            )}>
                                                {change > 0 ? `+${change}` : change}
                                            </span>
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="elo"
                        stroke={color}
                        strokeWidth={3}
                        fillOpacity={1}
                        fill={`url(#${gradientId})`}
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </motion.div>
    );
}
