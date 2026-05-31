"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BookOpen, Flame, GraduationCap, Languages, Award, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    AI_GEN_TRACKER_WINDOW_DAYS,
    buildAIGenLearningTrackerModel,
    type AIGenLearningArticleRecord,
    type AIGenLearningDayPoint,
    type AIGenLearningReadEvent,
} from "./ai-learning-tracker";

interface AIGenLearningTrackerProps {
    articles: AIGenLearningArticleRecord[];
    readEvents: AIGenLearningReadEvent[];
}

function formatWordCount(value: number) {
    if (value >= 10_000) {
        return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}w`;
    }
    return value.toLocaleString("zh-CN");
}

function getChartMax(points: AIGenLearningDayPoint[]) {
    const maxCount = points.reduce((max, point) => Math.max(max, point.generatedCount, point.completedCount), 0);
    return maxCount <= 2 ? 2 : maxCount + 1;
}

export function AIGenLearningTracker({ articles, readEvents }: AIGenLearningTrackerProps) {
    const reducedMotion = useReducedMotion();
    const model = useMemo(
        () => buildAIGenLearningTrackerModel(articles, readEvents),
        [articles, readEvents],
    );

    const summaryItems = [
        {
            key: "generated",
            label: "总生成",
            value: model.totalGenerated.toLocaleString("zh-CN"),
            detail: "AI 文章累计篇数",
            icon: BookOpen,
            color: "#38bdf8", // Sky blue accent
        },
        {
            key: "completed",
            label: "完成学习",
            value: model.totalCompleted.toLocaleString("zh-CN"),
            detail: "按真实完成时间统计",
            icon: GraduationCap,
            color: "#34d399", // Emerald green accent
        },
        {
            key: "words",
            label: `近 ${AI_GEN_TRACKER_WINDOW_DAYS} 天字数`,
            value: formatWordCount(model.wordsLastWindow),
            detail: "按生成日期累计",
            icon: Languages,
            color: "#f59e0b", // Amber accent
        },
        {
            key: "streak",
            label: "连续学习",
            value: `${model.streakDays} 天`,
            detail: "生成或完成任一行为都算",
            icon: Flame,
            color: "#f43f5e", // Rose accent
        },
    ] as const;

    return (
        <motion.section
            data-ai-gen-learning-tracker="true"
            initial={reducedMotion ? undefined : { opacity: 0, y: 12 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden rounded-2xl border-2 border-theme-border bg-theme-base-bg shadow-[0_6px_0_0_var(--theme-shadow)]"
        >
            <div className="border-b-2 border-theme-border/20 px-5 py-4 md:px-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-theme-text-muted">Learning Tracker</p>
                        <h4 className="mt-1 font-welcome-display text-[1.45rem] font-black leading-none tracking-[-0.04em] text-theme-text md:text-[1.65rem]">
                            追踪学习
                        </h4>
                        <p className="mt-1.5 max-w-2xl text-xs font-medium leading-5 text-theme-text-muted">
                            把 AI 生成的学习节奏压成一个轻量总览，直接看近 {AI_GEN_TRACKER_WINDOW_DAYS} 天的生成、完成和字数变化。
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-theme-border bg-theme-card-bg px-3 py-1.5 text-xs font-black text-theme-text shadow-[0_2px_0_var(--theme-shadow)]">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        最近 {AI_GEN_TRACKER_WINDOW_DAYS} 天
                    </div>
                </div>
            </div>

            <div className="space-y-4 px-4 py-4 md:px-5 md:py-5">
                <div
                    data-ai-gen-learning-summary="true"
                    className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4"
                >
                    {summaryItems.map((item) => {
                        const Icon = item.icon;
                        const bgStyle = `color-mix(in srgb, var(--theme-card-bg) 88%, ${item.color})`;
                        const borderStyle = `color-mix(in srgb, var(--theme-border) 70%, ${item.color})`;
                        const textStyle = `color-mix(in srgb, var(--theme-text) 50%, ${item.color})`;
                        
                        return (
                            <div
                                key={item.key}
                                className="group/tracker-card rounded-xl border-2 border-theme-border bg-theme-card-bg p-3.5 shadow-[0_3px_0_0_var(--theme-shadow)] transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_var(--theme-shadow)]"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-theme-text-muted truncate">
                                            {item.label}
                                        </p>
                                        <p className="mt-1 text-[1.35rem] font-black tracking-[-0.04em] text-theme-text leading-tight truncate">
                                            {item.value}
                                        </p>
                                        <p className="mt-0.5 text-[10px] font-medium leading-4 text-theme-text-muted line-clamp-2">
                                            {item.detail}
                                        </p>
                                    </div>
                                    
                                    {/* Stylized Stamp Icon Container */}
                                    <div className="relative h-10 w-10 shrink-0 select-none">
                                        {/* Solid Shadow Plate */}
                                        <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl border border-theme-border/30 bg-theme-shadow transition-transform group-hover/tracker-card:translate-x-[3.5px] group-hover/tracker-card:translate-y-[3.5px]" />
                                        
                                        {/* Active Icon Plate */}
                                        <div 
                                            className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-theme-border transition-transform group-hover/tracker-card:-translate-x-[0.5px] group-hover/tracker-card:-translate-y-[0.5px]"
                                            style={{
                                                backgroundColor: bgStyle,
                                                borderColor: borderStyle,
                                                color: textStyle,
                                            }}
                                        >
                                            <Icon className="h-5 w-5 stroke-[2.25] transition-transform duration-300 group-hover/tracker-card:rotate-12" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div
                    data-ai-gen-learning-chart="true"
                    data-window-days={model.chartData.length}
                    className="overflow-hidden rounded-xl border-2 border-theme-border bg-theme-card-bg shadow-[0_3px_0_0_var(--theme-shadow)]"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-theme-border/20 px-4 py-2.5 md:px-5">
                        <div>
                            <p className="text-xs font-black text-theme-text">近 30 天学习走势</p>
                            <p className="mt-0.5 text-[10px] font-medium text-theme-text-muted">
                                柱状显示生成/完成，面积显示每日生成字数。
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black">
                            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-theme-border bg-theme-card-bg px-2 py-0.5 text-theme-text shadow-[1px_1px_0_0_var(--theme-shadow)]">
                                <span className="h-2.5 w-2.5 rounded-sm border border-theme-border bg-[#38bdf8]" />
                                生成
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-theme-border bg-theme-card-bg px-2 py-0.5 text-theme-text shadow-[1px_1px_0_0_var(--theme-shadow)]">
                                <span className="h-2.5 w-2.5 rounded-sm border border-theme-border bg-[#34d399]" />
                                完成
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-theme-border bg-theme-card-bg px-2 py-0.5 text-theme-text shadow-[1px_1px_0_0_var(--theme-shadow)]">
                                <span className="h-2.5 w-2.5 rounded-full border border-theme-border bg-[#f59e0b]" />
                                字数
                            </span>
                        </div>
                    </div>

                    <div className="h-[210px] bg-theme-base-bg/40 px-2 pb-2.5 pt-1.5 md:h-[230px] md:px-3">
                        {!model.hasHistory ? (
                            <div className="flex h-full items-center justify-center px-6 text-center text-xs font-medium leading-6 text-theme-text-muted">
                                还没有 AI 生成学习记录。先生成一篇文章，后面这里会开始追踪你的每日节奏。
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={model.chartData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="ai-learning-words-fill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="color-mix(in srgb, var(--theme-text) 50%, #f59e0b)" stopOpacity={0.15} />
                                            <stop offset="90%" stopColor="color-mix(in srgb, var(--theme-text) 50%, #f59e0b)" stopOpacity={0.0} />
                                        </linearGradient>
                                    </defs>

                                    <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--theme-border) 18%, transparent)" />
                                    <XAxis
                                        dataKey="shortLabel"
                                        tick={{ fontSize: 9, fill: "var(--theme-text-muted)", fontFamily: "var(--font-mono)", fontWeight: "600" }}
                                        axisLine={false}
                                        tickLine={false}
                                        interval={4}
                                        minTickGap={14}
                                    />
                                    <YAxis
                                        yAxisId="count"
                                        domain={[0, getChartMax(model.chartData)]}
                                        tick={{ fontSize: 9, fill: "var(--theme-text-muted)", fontFamily: "var(--font-mono)", fontWeight: "600" }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={28}
                                    />
                                    <YAxis
                                        yAxisId="words"
                                        orientation="right"
                                        tick={{ fontSize: 9, fill: "var(--theme-text-muted)", fontFamily: "var(--font-mono)", fontWeight: "600" }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(value) => `${Math.round(Number(value) / 100) / 10}k`}
                                        width={32}
                                    />
                                    <Tooltip
                                        cursor={{ fill: "color-mix(in srgb, var(--theme-text) 4%, transparent)" }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) {
                                                return null;
                                            }

                                            const point = payload[0]?.payload as AIGenLearningDayPoint | undefined;
                                            if (!point) {
                                                return null;
                                            }

                                            return (
                                                <div className="rounded-xl border-2 border-theme-border bg-theme-card-bg p-3.5 shadow-[0_3px_0_0_var(--theme-shadow)]">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-theme-text-muted">{point.fullLabel}</p>
                                                    <div className="mt-2 space-y-1.5 text-[11px] font-bold">
                                                        <div className="flex items-center justify-between gap-6">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="h-2 w-2 rounded-sm border border-theme-border bg-[#38bdf8]" />
                                                                <span className="text-theme-text-muted">生成篇数</span>
                                                            </div>
                                                            <span className="font-mono font-black text-theme-text">{point.generatedCount} 篇</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-6">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="h-2 w-2 rounded-sm border border-theme-border bg-[#34d399]" />
                                                                <span className="text-theme-text-muted">完成学习</span>
                                                            </div>
                                                            <span className="font-mono font-black text-theme-text">{point.completedCount} 篇</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-6 border-t border-theme-border/10 pt-1.5 mt-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="h-2.5 w-2.5 rounded-full border border-theme-border bg-[#f59e0b]" />
                                                                <span className="text-theme-text-muted">生成字数</span>
                                                            </div>
                                                            <span className="font-mono font-black text-theme-text">{formatWordCount(point.generatedWords)} 字</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Area
                                        yAxisId="words"
                                        type="monotone"
                                        dataKey="generatedWords"
                                        stroke="#f59e0b"
                                        fill="url(#ai-learning-words-fill)"
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{ r: 4, fill: "#f59e0b", stroke: "var(--theme-border)", strokeWidth: 1.5 }}
                                    />
                                    <Bar
                                        yAxisId="count"
                                        dataKey="generatedCount"
                                        fill="#38bdf8"
                                        stroke="var(--theme-border)"
                                        strokeWidth={1.5}
                                        radius={[1.5, 1.5, 0, 0]}
                                        barSize={6}
                                    />
                                    <Bar
                                        yAxisId="count"
                                        dataKey="completedCount"
                                        fill="#34d399"
                                        stroke="var(--theme-border)"
                                        strokeWidth={1.5}
                                        radius={[1.5, 1.5, 0, 0]}
                                        barSize={6}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div
                    data-ai-gen-learning-history="true"
                    className="grid gap-2.5 md:grid-cols-2"
                >
                    <div className="group/tracker-card rounded-xl border-2 border-theme-border bg-theme-card-bg p-3.5 shadow-[0_3px_0_0_var(--theme-shadow)] flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-theme-text-muted">历史摘要</p>
                            <p className="mt-1 text-xs font-black text-theme-text truncate">
                                {model.mostActiveDayLabel
                                    ? `${model.mostActiveDayLabel} 最活跃`
                                    : "等待第一天学习记录"}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium leading-normal text-theme-text-muted line-clamp-2">
                                {model.mostActiveDayLabel
                                    ? `当天一共发生 ${model.mostActiveDayActivity} 次 AI 学习行为。`
                                    : "生成或完成任一篇 AI 文章后，这里会自动识别高活跃日。"}
                            </p>
                        </div>
                        <div className="relative h-10 w-10 shrink-0 select-none">
                            <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl border border-theme-border/30 bg-theme-shadow transition-transform group-hover/tracker-card:translate-x-[3.5px] group-hover/tracker-card:translate-y-[3.5px]" />
                            <div 
                                className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-theme-border transition-transform group-hover/tracker-card:-translate-x-[0.5px] group-hover/tracker-card:-translate-y-[0.5px]"
                                style={{
                                    backgroundColor: "color-mix(in srgb, var(--theme-card-bg) 88%, #8b5cf6)",
                                    borderColor: "color-mix(in srgb, var(--theme-border) 70%, #8b5cf6)",
                                    color: "color-mix(in srgb, var(--theme-text) 50%, #8b5cf6)",
                                }}
                            >
                                <Award className="h-5 w-5 stroke-[2.25] transition-transform duration-300 group-hover/tracker-card:rotate-12" />
                            </div>
                        </div>
                    </div>

                    <div className="group/tracker-card rounded-xl border-2 border-theme-border bg-theme-card-bg p-3.5 shadow-[0_3px_0_0_var(--theme-shadow)] flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-theme-text-muted">最近完成</p>
                            <p className="mt-1 text-xs font-black text-theme-text truncate">
                                {model.lastCompletedLabel ?? "还没有完成过 AI 学习"}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium leading-normal text-theme-text-muted line-clamp-2">
                                {model.lastCompletedLabel
                                    ? "这里按真实阅读完成时间更新，不会回落到生成当天。"
                                    : "等你完成第一篇 AI 文章后，这里会显示最近一次完成时间。"}
                            </p>
                        </div>
                        <div className="relative h-10 w-10 shrink-0 select-none">
                            <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl border border-theme-border/30 bg-theme-shadow transition-transform group-hover/tracker-card:translate-x-[3.5px] group-hover/tracker-card:translate-y-[3.5px]" />
                            <div 
                                className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-theme-border transition-transform group-hover/tracker-card:-translate-x-[0.5px] group-hover/tracker-card:-translate-y-[0.5px]"
                                style={{
                                    backgroundColor: "color-mix(in srgb, var(--theme-card-bg) 88%, #ec4899)",
                                    borderColor: "color-mix(in srgb, var(--theme-border) 70%, #ec4899)",
                                    color: "color-mix(in srgb, var(--theme-text) 50%, #ec4899)",
                                }}
                            >
                                <CheckCircle2 className="h-5 w-5 stroke-[2.25] transition-transform duration-300 group-hover/tracker-card:rotate-12" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.section>
    );
}
