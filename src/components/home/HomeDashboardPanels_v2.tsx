"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, Flame, BrainCircuit, BookOpenText, Target, CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Circle, Plus, ListTodo, Waves, Headphones, BellRing, Play, Database } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { useDailyPlans } from "@/hooks/useDailyPlans";
import { useRouter } from "next/navigation";

import type { HomeDashboardViewModel } from "@/components/home/home-data";
import { HOME_WEEKDAY_LABELS } from "@/components/home/home-data";
import { ConnectedUserAvatarMenu } from "@/components/profile/UserAvatarMenu";
import type { EloHistoryItem } from "@/lib/db";

interface HomeDashboardPanelsProps {
    model: HomeDashboardViewModel;
    eloHistory: EloHistoryItem[];
    accountEmail?: string | null;
    passwordUpdated?: boolean;
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

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function DailyPlanBento() {
    const [viewDate, setViewDate] = useState(new Date());
    const { planRecord, addPlanItem, togglePlanItem, removePlanItem } = useDailyPlans(viewDate);
    const [inputValue, setInputValue] = useState("");

    const isToday = viewDate.toDateString() === new Date().toDateString();

    const handlePrevDay = () => {
        const next = new Date(viewDate);
        next.setDate(next.getDate() - 1);
        setViewDate(next);
    };

    const handleNextDay = () => {
        const next = new Date(viewDate);
        next.setDate(next.getDate() + 1);
        setViewDate(next);
    };

    const handleAdd = () => {
        if (!inputValue.trim()) return;
        addPlanItem(inputValue);
        setInputValue("");
    };

    const items = planRecord?.items || [];
    const completedCount = items.filter(i => i.completed).length;
    const progress = items.length === 0 ? 0 : Math.round((completedCount / items.length) * 100);

    return (
        <motion.div
            className="flex flex-col h-full rounded-[2.5rem] border-4 border-[color:var(--module-daily-bd)] bg-[color:var(--module-daily-bg)] shadow-[0_8px_0_0_var(--theme-shadow)] overflow-hidden"
            whileHover={{ scale: 1.01, y: -2 }}
            whileTap={{ scale: 0.98, y: 2 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-5 pb-3 border-b-[3px] border-theme-border bg-theme-base-bg">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-[3px] border-theme-border bg-theme-primary-bg shadow-[0_4px_0_0_var(--theme-shadow)]">
                        <Target className="w-6 h-6 text-theme-primary-text" />
                    </div>
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-theme-text-muted">每日计划</p>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-welcome-display text-2xl font-black text-theme-text">
                                {SHORT_DATE_FORMATTER.format(viewDate)}
                            </span>
                            {!isToday && (
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-black border-[2px] border-theme-border bg-theme-active-bg text-theme-active-text">
                                    回顾
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={handlePrevDay} className="ui-pressable p-2 rounded-xl bg-theme-primary-bg border-[3px] border-theme-border text-theme-primary-text hover:bg-theme-primary-hover shadow-[0_3px_0_0_var(--theme-shadow)]">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button onClick={handleNextDay} className="ui-pressable p-2 rounded-xl bg-theme-primary-bg border-[3px] border-theme-border text-theme-primary-text hover:bg-theme-primary-hover shadow-[0_3px_0_0_var(--theme-shadow)]">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* List Body */}
            <div className="flex-1 flex flex-col p-4 gap-2 min-h-0 overflow-y-auto">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-theme-text-muted pb-4">
                        <ListTodo className="w-12 h-12 opacity-50" />
                        <div className="space-y-1">
                            <p className="font-black text-lg text-theme-text">暂无安排</p>
                            <p className="text-sm font-bold text-theme-text-muted">
                                {isToday ? "写下你今天的探索目标吧！" : "这一天没有留下计划呢"}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between px-1 mb-1">
                            <p className="text-xs font-black uppercase tracking-wider text-theme-text-muted gap-1.5 flex items-center">
                                <CalendarDays className="w-4 h-4" />
                                {completedCount} / {items.length} 完成
                            </p>
                            <span className="text-xs font-black text-theme-text">{progress}%</span>
                        </div>
                        <div className="h-3 w-full bg-theme-base-bg rounded-full overflow-hidden border-[3px] border-theme-border mb-1 shadow-inner">
                            <div className="h-full bg-theme-active-bg transition-all duration-500 ease-out border-r-[3px] border-theme-border" style={{ width: `${progress}%` }} />
                        </div>
                        {items.map(item => (
                            <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.95, y: 0 }}
                                transition={{ type: "spring", stiffness: 450, damping: 25 }}
                                onClick={() => togglePlanItem(item.id)}
                                className={`group cursor-pointer flex items-start gap-3 p-3.5 rounded-2xl border-[3px] transition-colors duration-200 ${
                                    item.completed 
                                        ? "bg-theme-base-bg border-theme-border text-theme-text-muted opacity-70" 
                                        : "bg-theme-primary-bg border-theme-border text-theme-primary-text shadow-[0_3px_0_0_var(--theme-shadow)] hover:bg-theme-primary-hover"
                                }`}
                            >
                                <div className="mt-0.5 flex-shrink-0 relative">
                                    {item.completed ? (
                                        <motion.div
                                            initial={{ scale: 0.5, rotate: -45 }}
                                            animate={{ scale: 1, rotate: 0 }}
                                            transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                        >
                                            <CheckCircle2 className="w-6 h-6 text-theme-active-bg" />
                                        </motion.div>
                                    ) : (
                                        <Circle className="w-6 h-6 text-theme-border group-hover:text-theme-text transition-colors" />
                                    )}
                                </div>
                                <span className={`flex-1 text-sm font-bold my-auto leading-relaxed transition-all duration-300 ${item.completed ? "line-through" : ""}`}>
                                    {item.text}
                                </span>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removePlanItem(item.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-red-500 hover:bg-red-100 rounded-lg disabled:opacity-0 focus:outline-none"
                                    disabled={!isToday}
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Input area - only for today (or future) */}
            {isToday && (
                <div className="p-4 bg-theme-base-bg border-t-[3px] border-theme-border flex items-center gap-2">
                    <input 
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                        placeholder="添加新计划..."
                        className="flex-1 bg-theme-card-bg border-[3px] border-theme-border placeholder-theme-text-muted rounded-xl px-4 py-2.5 text-sm font-bold text-theme-text outline-none focus:bg-theme-primary-bg shadow-inner transition-colors"
                    />
                    <motion.button 
                        whileHover={inputValue.trim() ? { scale: 1.05 } : {}}
                        whileTap={inputValue.trim() ? { scale: 0.85, y: 4, transition: { type: "spring", stiffness: 600, damping: 15 } } : {}}
                        onClick={handleAdd}
                        disabled={!inputValue.trim()}
                        className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-theme-active-bg border-[3px] border-theme-border text-theme-active-text shadow-[0_4px_0_0_var(--theme-shadow)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Plus className="w-5 h-5 stroke-[3]" />
                    </motion.button>
                </div>
            )}
        </motion.div>
    );
}

export function HomeDashboardPanels_v2({
    model,
    eloHistory,
    accountEmail,
    passwordUpdated = false,
}: HomeDashboardPanelsProps) {
    const router = useRouter();
    const { vitalSigns } = model;
    
    const immersionRatio = Math.min(1, vitalSigns.todayImmersionSeconds / Math.max(1, vitalSigns.targetImmersionSeconds));
    const immersionProgressStr = `${Math.max(8, immersionRatio * 100)}%`;
    const rawMinutes = Math.floor(vitalSigns.todayImmersionSeconds / 60);
    const targetMinutes = Math.floor(vitalSigns.targetImmersionSeconds / 60);

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

                {/* ─── DAILY PLAN WIDGET ─── */}
                <div className="col-span-2 row-span-2 relative min-h-[460px]">
                    <div className="absolute inset-0">
                        <DailyPlanBento />
                    </div>
                </div>

                {/* 1. IMMERSION ECHO */}
                <motion.div
                    whileHover={{ scale: 1.02, rotate: 0.5 }}
                    whileTap={{ scale: 0.98 }}
                    transition={springTransition}
                    className="col-span-2 relative overflow-hidden rounded-[2.5rem] border-4 border-[color:var(--module-listen-bd)] bg-[color:var(--module-listen-bg)] p-6 shadow-[0_8px_0_0_var(--theme-shadow)] flex flex-col justify-center cursor-default group"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-700">
                        <Waves className="w-24 h-24 text-theme-border" />
                    </div>
                    <div className="relative z-10 flex items-center justify-between mb-5">
                        <p className="text-sm font-black uppercase tracking-widest text-theme-text-muted flex items-center gap-1.5">
                            <Headphones className="w-4 h-4" /> 沉浸回声
                        </p>
                        <div className="border-[3px] border-theme-border bg-theme-primary-bg rounded-full px-4 py-1.5 text-sm font-black text-theme-primary-text shadow-[0_3px_0_0_var(--theme-shadow)]">
                            {rawMinutes}
                            <span className="text-[10px] text-theme-primary-text ml-1 opacity-70">MINS</span>
                        </div>
                    </div>
                    <div className="relative z-10 h-6 overflow-hidden rounded-full bg-theme-base-bg border-[3px] border-theme-border shadow-inner">
                        <div
                            className="h-full rounded-full bg-theme-active-bg border-r-[3px] border-theme-border transition-all duration-1000 ease-out flex items-center justify-end px-2"
                            style={{ width: immersionProgressStr }}
                        >
                            {immersionRatio >= 1 && <Sparkles className="w-3 h-3 text-theme-active-text" />}
                        </div>
                    </div>
                    <div className="relative z-10 mt-3 flex justify-between text-[13px] font-black text-theme-text-muted">
                        <span>TODAY</span>
                        <span>TARGET {targetMinutes}M</span>
                    </div>
                </motion.div>

                {/* 2. HABIT PULSE */}
                <motion.div
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    transition={springTransition}
                    className="col-span-1 relative overflow-hidden rounded-[2rem] border-4 border-[color:var(--module-battle-bd)] bg-[color:var(--module-battle-bg)] px-3 py-5 shadow-[0_8px_0_0_var(--theme-shadow)] flex flex-col items-center justify-between text-center"
                >
                    <span className="text-xs font-black uppercase tracking-wider text-theme-text mb-2 flex flex-col items-center gap-1">
                        <Flame className="w-6 h-6 text-theme-primary-bg" style={{ filter: "drop-shadow(0 2px 0 var(--theme-shadow))" }} /> 
                        本周脉搏
                    </span>
                    <div className="flex gap-1.5 px-1 pb-1">
                        {vitalSigns.weeklyHeatmap.map((day, ix) => (
                            <div key={day.dateKey} className="flex flex-col items-center gap-1.5">
                                <span className={`text-[9px] font-black ${day.isToday ? 'text-theme-primary-text scale-110' : 'text-theme-text-muted opacity-80'}`}>
                                    {HOME_WEEKDAY_LABELS[ix]}
                                </span>
                                <div className={`w-3.5 h-3.5 rounded-full border-[2px] border-theme-border transition-colors duration-300 ${
                                    day.hasActivity 
                                        ? 'bg-theme-active-bg shadow-[0_2px_0_0_var(--theme-shadow)]' 
                                        : (day.dateKey > vitalSigns.weeklyHeatmap.find(d => d.isToday)?.dateKey! 
                                            ? 'bg-theme-base-bg opacity-50' 
                                            : 'bg-theme-card-bg opacity-40')
                                }`} />
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* 3 & 4. MEMORY VAULT & QUICK LAUNCH */}
                <div className="col-span-1 flex flex-col gap-4">
                    {/* MEMORY VAULT */}
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={springTransition}
                        onClick={() => router.push('/vocab/review')}
                        role="button"
                        className="flex-1 rounded-[1.8rem] border-4 border-[color:var(--module-vocab-bd)] bg-[color:var(--module-vocab-bg)] p-4 shadow-[0_6px_0_0_var(--theme-shadow)] flex items-center justify-between gap-2 overflow-hidden relative group"
                    >
                        <div className="flex flex-col z-10">
                            <span className="text-[10px] items-center gap-1 font-black uppercase text-theme-text-muted tracking-widest flex">
                                <BrainCircuit className="w-3 h-3" /> 金库
                            </span>
                            <span className="font-welcome-display text-2xl font-black text-theme-text leading-none mt-1">
                                {vitalSigns.totalVocabCount}
                            </span>
                        </div>
                        {vitalSigns.fadingVocabCount > 0 && (
                            <div className="z-10 flex flex-col items-center animate-pulse">
                                <div className="bg-theme-active-bg text-theme-active-text rounded-full w-8 h-8 flex items-center justify-center font-black text-xs border-[3px] border-theme-border shadow-[0_3px_0_0_var(--theme-shadow)]">
                                    {vitalSigns.fadingVocabCount}
                                </div>
                                <span className="text-[8px] font-black text-theme-text mt-1.5 uppercase tracking-wider">由于</span>
                            </div>
                        )}
                        {!vitalSigns.fadingVocabCount && (
                             <div className="z-10 text-theme-border opacity-50 pr-2">
                                <CheckCircle2 className="w-6 h-6" />
                             </div>
                        )}
                        {/* decorative */}
                        <div className="absolute right-[-10px] top-[-10px] text-theme-border opacity-10 group-hover:scale-110 transition-transform">
                            <Database className="w-20 h-20" />
                        </div>
                    </motion.div>

                    {/* QUICK LAUNCH */}
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={springTransition}
                        onClick={() => router.push(vitalSigns.lastArticleHref)}
                        role="button"
                        className="flex-1 rounded-[1.8rem] border-4 border-[color:var(--module-read-bd)] bg-[color:var(--module-read-bg)] p-3 shadow-[0_6px_0_0_var(--theme-shadow)] flex items-center gap-3 relative group overflow-hidden"
                    >
                        <div className="w-10 h-10 shrink-0 bg-theme-primary-bg border-[3px] border-theme-border shadow-[0_3px_0_0_var(--theme-shadow)] rounded-full flex items-center justify-center text-theme-primary-text group-active:translate-y-1 group-active:shadow-[0_0px_0_0_var(--theme-shadow)] transition-all">
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                        </div>
                        <div className="flex flex-col items-start min-w-0 z-10">
                            <span className="text-[10px] font-black uppercase text-theme-text-muted tracking-wider mb-0.5">
                                一键启航
                            </span>
                            <span className="text-xs font-bold text-theme-text truncate w-full text-left">
                                {vitalSigns.lastArticleTitle}
                            </span>
                        </div>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
}
