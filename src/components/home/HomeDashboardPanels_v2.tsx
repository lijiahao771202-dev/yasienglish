"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import { Sparkles, Flame, BrainCircuit, BookOpenText, Target, CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Circle, Plus, ListTodo, Waves, Headphones, BellRing, Play, Database } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { useDailyPlans } from "@/hooks/useDailyPlans";
import { db } from "@/lib/db";
import { saveProfilePatch } from "@/lib/user-repository";
import { useRouter } from "next/navigation";

import type { HomeDashboardViewModel } from "@/components/home/home-data";
import { HOME_WEEKDAY_LABELS } from "@/components/home/home-data";
import { ConnectedUserAvatarMenu } from "@/components/profile/UserAvatarMenu";
import { SmartPlannerWizard } from "@/components/home/SmartPlannerWizard";
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
    const router = useRouter();
    const { planRecord, addPlanItem, addSmartPlanItem, batchAddSmartPlanItems, togglePlanItem, removePlanItem } = useDailyPlans(viewDate);
    const [inputValue, setInputValue] = useState("");
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const bentoProfile = useLiveQuery(() => db.user_profile.toCollection().first());
    const bentoRemainingDays = useMemo(() => {
        if (!bentoProfile?.exam_date) return null;
        const exam = new Date(bentoProfile.exam_date);
        const today = new Date();
        exam.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return Math.max(0, Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    }, [bentoProfile?.exam_date]);

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

    const sortedItems = useMemo(() => {
        return [...items].sort((a, b) => {
            if (a.completed && !b.completed) return 1;
            if (!a.completed && b.completed) return -1;
            return 0;
        });
    }, [items]);

    return (
        <>
            <SmartPlannerWizard 
                isOpen={isWizardOpen} 
                onClose={() => setIsWizardOpen(false)} 
                onSave={addSmartPlanItem}
                onBatchSave={batchAddSmartPlanItems}
                examType={bentoProfile?.exam_type}
                remainingDays={bentoRemainingDays}
            />
            <motion.div
                className="flex flex-col h-full rounded-[2.5rem] border-4 border-[color:var(--module-daily-bd)] bg-[color:var(--module-daily-bg)] shadow-[0_8px_0_0_var(--theme-shadow)] overflow-hidden"
            whileHover={{ scale: 1.01, y: -2 }}
            whileTap={{ scale: 0.98, y: 2 }}
            transition={{ type: "spring" as const, stiffness: 300, damping: 20 }}
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
                        {sortedItems.map(item => {
                            const handleItemClick = () => {
                                if (item.completed) return;
                                const examTrackQuery = item.exam_track ? `&exam_track=${item.exam_track}` : "";
                                if (item.type === 'rebuild') {
                                    router.push('/battle?smart_task=rebuild&smart_entry=1');
                                } else if (item.type === 'cat') {
                                    router.push(`/read?smart_task=cat${examTrackQuery}&smart_entry=1`);
                                } else if (item.type === 'reading_ai') {
                                    router.push(`/read?smart_task=reading_ai${examTrackQuery}&smart_entry=1`);
                                } else if (item.type === 'listening_cabin') {
                                    router.push('/listening-cabin?smart_task=listening_cabin&smart_entry=1');
                                }
                            };

                            return (
                            <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.95, y: 0 }}
                                transition={{ type: "spring" as const, stiffness: 450, damping: 25 }}
                                onClick={handleItemClick}
                                className={`group cursor-pointer flex items-start gap-3 p-3.5 rounded-2xl border-[3px] transition-colors duration-200 ${
                                    item.completed 
                                        ? "bg-theme-base-bg border-theme-border text-theme-text-muted opacity-70" 
                                        : "bg-theme-primary-bg border-theme-border text-theme-primary-text shadow-[0_3px_0_0_var(--theme-shadow)] hover:bg-theme-primary-hover"
                                }`}
                            >
                                <div 
                                    className="mt-0.5 flex-shrink-0 relative z-10" 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        togglePlanItem(item.id);
                                    }}
                                >
                                    {item.completed ? (
                                        <motion.div
                                            initial={{ scale: 0.5, rotate: -45 }}
                                            animate={{ scale: 1, rotate: 0 }}
                                            transition={{ type: "spring" as const, stiffness: 500, damping: 20 }}
                                        >
                                            <CheckCircle2 className="w-6 h-6 text-theme-active-bg" />
                                        </motion.div>
                                    ) : (
                                        <Circle className="w-6 h-6 text-theme-border group-hover:text-theme-text transition-colors" />
                                    )}
                                </div>
                                <span className={`flex-1 flex flex-col justify-center text-sm font-bold my-auto leading-relaxed transition-all duration-300 ${item.completed ? "line-through opacity-70" : ""}`}>
                                    <span>{item.text}</span>
                                    {item.type && item.type !== 'custom' && item.target && item.target > 0 && (
                                        <div className="flex items-center gap-2 mt-1 line-through-none">
                                            <div className="h-1.5 flex-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden border-[1px] border-theme-border">
                                                <div 
                                                     className="h-full bg-theme-active-bg transition-all border-r-[1px] border-theme-border" 
                                                     style={{ width: `${Math.min(100, Math.round((item.current || 0) / item.target * 100))}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-black tracking-wider text-theme-text-muted">
                                                {item.current || 0} / {item.target}
                                            </span>
                                        </div>
                                    )}
                                </span>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removePlanItem(item.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-red-500 hover:bg-red-100 rounded-lg disabled:opacity-0 focus:outline-none z-10 relative"
                                    disabled={!isToday}
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </motion.div>
                        )})}
                    </div>
                )}
            </div>

            {/* Input area - only for today (or future) */}
            {isToday && (
                <div className="p-3 bg-theme-base-bg border-t-[3px] border-theme-border flex items-center gap-2">
                    <button 
                         onClick={() => setIsWizardOpen(true)}
                         className="flex-shrink-0 flex items-center gap-1.5 px-3 w-11 h-11 justify-center rounded-xl bg-theme-text text-theme-base-bg border-2 border-theme-text hover:opacity-90 shadow-[0_3px_0_0_var(--theme-shadow)] transition-all active:translate-y-1 active:shadow-none"
                    >
                        <Sparkles className="w-5 h-5 flex-shrink-0" />
                    </button>
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
                        whileTap={inputValue.trim() ? { scale: 0.85, y: 4, transition: { type: "spring" as const, stiffness: 600, damping: 15 } } : {}}
                        onClick={handleAdd}
                        disabled={!inputValue.trim()}
                        className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-theme-active-bg border-[3px] border-theme-border text-theme-active-text shadow-[0_4px_0_0_var(--theme-shadow)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Plus className="w-5 h-5 stroke-[3]" />
                    </motion.button>
                </div>
            )}
        </motion.div>
        </>
    );
}

export function HomeDashboardPanels_v2({
    model,
    eloHistory,
    accountEmail,
    passwordUpdated = false,
}: HomeDashboardPanelsProps) {
    const router = useRouter();
    const [showExamModal, setShowExamModal] = useState(false);
    const [tempExamDate, setTempExamDate] = useState("");
    const [tempExamType, setTempExamType] = useState<'cet4' | 'cet6' | 'postgrad' | 'ielts'>('cet4');
    const { vitalSigns } = model;

    const profile = useLiveQuery(() => db.user_profile.toCollection().first());

    const EXAM_TYPES = [
        { value: 'cet4' as const, label: '四级', emoji: '📗' },
        { value: 'cet6' as const, label: '六级', emoji: '📘' },
        { value: 'postgrad' as const, label: '考研', emoji: '📕' },
        { value: 'ielts' as const, label: '雅思', emoji: '📙' },
    ];

    const handleSaveExamDate = async () => {
        if (!tempExamDate) return;
        try {
            await saveProfilePatch({
                exam_date: tempExamDate,
                exam_type: tempExamType,
            });
            setShowExamModal(false);
            window.dispatchEvent(new CustomEvent('yasi:sync_smart_goals'));
        } catch (error) {
            console.error("Failed to save exam goal:", error);
            alert("考试日期保存失败，请稍后重试。");
        }
    };
    
    const immersionRatio = Math.min(1, vitalSigns.todayImmersionSeconds / Math.max(1, vitalSigns.targetImmersionSeconds));
    const immersionProgressStr = `${Math.max(8, immersionRatio * 100)}%`;
    const rawMinutes = Math.floor(vitalSigns.todayImmersionSeconds / 60);
    const targetMinutes = Math.floor(vitalSigns.targetImmersionSeconds / 60);

    const springTransition = { type: "spring" as const, stiffness: 300, damping: 20 };

    const remainingDays = useMemo(() => {
        if (!profile?.exam_date) return null;
        const exam = new Date(profile.exam_date);
        const today = new Date();
        exam.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return Math.max(0, Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    }, [profile?.exam_date]);

    const examTypeLabel = useMemo(() => {
        return EXAM_TYPES.find(t => t.value === profile?.exam_type)?.label || '大考';
    }, [profile?.exam_type]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
            className="flex flex-col gap-5 w-full h-full relative"
        >
            {/* Exam Date Modal */}
            <AnimatePresence>
                {showExamModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowExamModal(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-sm bg-theme-base-bg border-4 border-theme-border rounded-[2rem] p-6 shadow-2xl flex flex-col gap-4">
                            <h3 className="text-xl font-black text-theme-text text-center">🎯 设定目标大考日</h3>
                            <p className="text-xs font-bold text-center text-theme-text-muted">选好考试类型和日期后，系统将根据倒计时自动安排每日训练计划。</p>
                            
                            {/* Exam Type Selector */}
                            <div className="grid grid-cols-4 gap-2">
                                {EXAM_TYPES.map(t => (
                                    <button
                                        key={t.value}
                                        onClick={() => setTempExamType(t.value)}
                                        className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 font-black text-sm transition-all
                                            ${tempExamType === t.value 
                                                ? 'bg-theme-active-bg border-theme-active-text text-theme-active-text scale-105 shadow-lg' 
                                                : 'bg-theme-card-bg border-theme-border text-theme-text-muted hover:border-theme-text'}`}
                                    >
                                        <span className="text-lg">{t.emoji}</span>
                                        <span>{t.label}</span>
                                    </button>
                                ))}
                            </div>

                            <input 
                                type="date" 
                                value={tempExamDate}
                                onChange={e => setTempExamDate(e.target.value)}
                                className="w-full bg-theme-bg border-2 border-theme-border rounded-xl px-4 py-3 font-black text-theme-text outline-none text-center"
                            />
                            <div className="flex gap-3 mt-2">
                                <button onClick={() => setShowExamModal(false)} className="flex-1 py-3 bg-theme-card-bg text-theme-text font-bold rounded-xl border-2 border-theme-border">取消</button>
                                <button onClick={handleSaveExamDate} className="flex-1 py-3 bg-theme-text text-theme-base-bg font-black rounded-xl border-2 border-theme-text shadow-[0_4px_0_0_rgba(0,0,0,0.2)]">结下契约</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {passwordUpdated && (
                <div className="rounded-[1.5rem] border-2 border-[#10b981] bg-[#d1fae5] px-4 py-3 text-sm font-bold text-[#047857] shadow-[0_4px_0_0_#10b981]">
                    密码已更新，欢迎回来！
                </div>
            )}

            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                    <p className="text-[15px] font-bold text-[#6b7280] flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#f472b6]" />
                        {model.subline || "今天也要开心地学习哦"}
                    </p>
                    <button 
                        onClick={() => {
                            setTempExamDate(profile?.exam_date || "");
                            setTempExamType(profile?.exam_type || "cet4");
                            setShowExamModal(true);
                        }}
                        className={`text-xs font-black px-2 py-1 rounded-lg border-2 flex items-center gap-1 transition-all
                            ${profile?.exam_date ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300' : 'bg-theme-bg text-theme-text-muted border-theme-border hover:text-theme-text'}`}
                    >
                        {profile?.exam_date ? `🔥 ${examTypeLabel} · 剩 ${remainingDays} 天` : '未设大考倒计时'}
                    </button>
                </div>
                {accountEmail && (
                    <div className="hidden sm:flex items-center gap-4">
                        <button
                            onClick={() => router.push('/paywall-demo')}
                            className="group flex items-center gap-1.5 rounded-xl border-[2.5px] border-amber-300/60 bg-amber-50 px-3 py-1.5 shadow-[0_3px_0_0_rgba(251,191,36,0.25)] transition-all hover:bg-amber-100/80 active:translate-y-[3px] active:shadow-none dark:border-amber-500/40 dark:bg-amber-900/20"
                        >
                            <span className="text-amber-500 drop-shadow-sm group-hover:animate-pulse">✨</span>
                            <span className="font-newsreader text-[13px] font-bold tracking-widest text-amber-700 dark:text-amber-300 uppercase">
                                Premium
                            </span>
                        </button>
                        <ConnectedUserAvatarMenu email={accountEmail} placement="header" />
                    </div>
                )}
            </div>

            {/* Cute Bento Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 flex-1 min-h-0">

                {/* ─── DAILY PLAN WIDGET ─── */}
                <div data-tour-target="daily-plan" className="col-span-2 row-span-2 relative min-h-[460px]">
                    <div className="absolute inset-0">
                        <DailyPlanBento />
                    </div>
                </div>

                {/* 1. IMMERSION ECHO */}
                <motion.div
                    data-tour-target="immersion-echo"
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
                    data-tour-target="habit-pulse"
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
