import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, BookOpen, Headphones, X, Sparkles, ChevronRight, PenTool, BookOpenText } from 'lucide-react';
import { normalizeSmartPlanExamTrack, type SmartPlanExamTrack, type SmartPlanTaskType } from '@/lib/db';

type SmartPlanDraft = {
    type: SmartPlanTaskType;
    target: number;
    text: string;
    exam_track?: SmartPlanExamTrack;
};

interface SmartPlannerWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (type: SmartPlanTaskType, target: number, text: string, examTrack?: SmartPlanExamTrack) => void;
    onBatchSave?: (tasks: SmartPlanDraft[]) => void;
    examType?: string;
    remainingDays?: number | null;
}

const WIZARD_OPTIONS: { id: SmartPlanTaskType, icon: React.ReactNode, title: string, desc: string, presets: number[], unit: string, defaultText: string }[] = [
    {
        id: 'rebuild',
        icon: <Dumbbell className="w-6 h-6 text-[#9c6c82]" />,
        title: "核心重组训练",
        desc: "提升基础词汇与语法感知，绑定 Battle 战斗系统目标",
        presets: [10, 20, 30, 50],
        unit: "题",
        defaultText: "完成重组训练"
    },
    {
        id: 'cat',
        icon: <BookOpen className="w-6 h-6 text-[#7caea4]" />,
        title: "专注 CAT 机考",
        desc: "自适应精读训练，冲刺雅思/六级水平",
        presets: [1, 2, 3, 5],
        unit: "篇",
        defaultText: "攻克 CAT 精读"
    },
    {
        id: 'listening_cabin',
        icon: <Headphones className="w-6 h-6 text-[#b68c92]" />,
        title: "听力仓",
        desc: "精听磨耳朵，逐句击破发音难点",
        presets: [1, 2, 3],
        unit: "篇",
        defaultText: "进入听力仓"
    },
    {
        id: 'reading_ai',
        icon: <BookOpenText className="w-6 h-6 text-[#9a8c98]" />,
        title: "AI 生成阅读",
        desc: "进入阅读流 AI 生成，按四级六级或雅思生成文章",
        presets: [1, 2, 3, 5],
        unit: "篇",
        defaultText: "生成 AI 阅读"
    }
];

export function SmartPlannerWizard({ isOpen, onClose, onSave, onBatchSave, examType, remainingDays }: SmartPlannerWizardProps) {
    const [step, setStep] = useState<1 | 2>(1);
    const [selectedType, setSelectedType] = useState<SmartPlanTaskType | null>(null);
    const [target, setTarget] = useState<number>(0);
    const [customText, setCustomText] = useState("");
    const [aiPrompt, setAiPrompt] = useState("");
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    // Reset when opened
    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setSelectedType(null);
            setTarget(0);
            setCustomText("");
            setAiPrompt("");
            setIsAiLoading(false);
        }
    }, [isOpen]);

    const planExamTrack = normalizeSmartPlanExamTrack(examType);

    const handleSelectType = (id: SmartPlanTaskType) => {
        setSelectedType(id);
        const option = WIZARD_OPTIONS.find(o => o.id === id);
        if (option) {
            setTarget(option.presets[1] || option.presets[0]); // Default to second preset or first
            setCustomText(option.defaultText);
        }
        setStep(2);
    };

    const handleSave = () => {
        if (!selectedType || target <= 0) return;
        const finalOption = WIZARD_OPTIONS.find(o => o.id === selectedType);
        const text = customText.trim() || finalOption?.defaultText || "智能任务";
        let title = text;
        if (finalOption && !text.includes(finalOption.unit)) {
             title = `${text} ${target} ${finalOption.unit}`;
        }

        const examTrack = (selectedType === 'cat' || selectedType === 'reading_ai') ? planExamTrack : undefined;
        onSave(selectedType, target, title, examTrack);
        onClose();
    };

    const handleAiSubmit = async () => {
        if (!aiPrompt.trim() || isAiLoading) return;
        setIsAiLoading(true);
        try {
            const res = await fetch('/api/ai/task-split', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: aiPrompt, currentItems: [], examType, remainingDays })
            });
            if (!res.ok) throw new Error('API failed');
            const data = await res.json();
            if (data.tasks && data.tasks.length > 0 && onBatchSave) {
                onBatchSave(data.tasks);
                onClose();
            }
        } catch (error) {
            console.error("AI Split failed", error);
            alert("AI调取失败，请重试！");
        } finally {
            setIsAiLoading(false);
        }
    };

    if (!mounted || typeof document === 'undefined' || !isOpen) return null;

    const currentOption = WIZARD_OPTIONS.find(o => o.id === selectedType);

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring" as const, damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-lg bg-theme-base-bg border-4 border-[color:var(--theme-border)] rounded-[2.5rem] p-6 shadow-2xl flex flex-col gap-6"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-[color:var(--theme-bg)] rounded-2xl border-2 border-[color:var(--theme-border)]">
                                    <Sparkles className="w-6 h-6 text-yellow-500" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-[color:var(--theme-text)]">
                                        {step === 1 ? 'AI 智能任务规划' : '设定具体目标'}
                                    </h2>
                                    <p className="text-sm font-semibold text-[color:var(--theme-text-light)]">
                                        {step === 1 ? '全自动侦听，实时全局追踪' : '量化你的学习里程碑'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-[color:var(--theme-text-light)] hover:text-[color:var(--theme-text)] bg-[color:var(--theme-bg)] hover:bg-[color:var(--theme-bg-hover)] rounded-xl transition-colors border-2 border-transparent hover:border-[color:var(--theme-border)]"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto min-h-[300px]">
                            <AnimatePresence mode="wait">
                                {step === 1 ? (
                                    <motion.div
                                        key="step1"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className="flex flex-col gap-3"
                                    >
                                        <div className="mb-2">
                                            <div className="flex bg-[color:var(--theme-bg)] border-2 border-[color:var(--theme-border)] rounded-2xl overflow-hidden shadow-inner focus-within:border-[color:var(--theme-text)] focus-within:ring-2 focus-within:ring-[color:var(--theme-text)] focus-within:ring-opacity-20 transition-all p-1">
                                                <input 
                                                    type="text" 
                                                    value={aiPrompt}
                                                    onChange={e => setAiPrompt(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleAiSubmit()}
                                                    placeholder="诉说你的痛点，AI自动排期..."
                                                    className="flex-1 bg-transparent px-3 py-2 font-bold text-sm text-[color:var(--theme-text)] outline-none placeholder-[color:var(--theme-text-light)]"
                                                />
                                                <button 
                                                    onClick={handleAiSubmit}
                                                    disabled={isAiLoading || !aiPrompt.trim()}
                                                    className="bg-[color:var(--theme-text)] text-theme-base-bg px-4 py-2 rounded-xl font-bold text-sm shadow-[0_2px_0_0_rgba(0,0,0,0.2)] active:translate-y-[2px] active:shadow-none disabled:opacity-50 transition-all flex items-center gap-2"
                                                >
                                                    {isAiLoading ? <span className="animate-spin inline-block">⏳</span> : <Sparkles className="w-4 h-4" />}
                                                    {isAiLoading ? "规划中" : "AI 编排"}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-2 mb-2 text-sm font-bold text-[color:var(--theme-text)] opacity-80 uppercase tracking-widest pl-2">
                                            或手动选择你要征服的领域
                                        </div>
                                        {WIZARD_OPTIONS.map((option) => (
                                            <button
                                                key={option.id}
                                                onClick={() => handleSelectType(option.id)}
                                                className="group flex flex-col text-left p-4 rounded-[1.5rem] bg-[color:var(--theme-bg)] border-2 border-[color:var(--theme-border)] hover:border-[color:var(--theme-text)] hover:shadow-[0_4px_0_0_var(--theme-text)] transition-all active:translate-y-1 active:shadow-none"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-theme-base-bg rounded-xl border-2 border-[color:var(--theme-border)] shadow-sm">
                                                        {option.icon}
                                                    </div>
                                                    <div className="flex-1">
                                                        <h3 className="text-lg font-black text-[color:var(--theme-text)]">{option.title}</h3>
                                                        <p className="text-xs font-semibold text-[color:var(--theme-text-light)] mt-1">{option.desc}</p>
                                                    </div>
                                                    <ChevronRight className="w-5 h-5 text-[color:var(--theme-text-light)] group-hover:text-[color:var(--theme-text)] transition-colors" />
                                                </div>
                                            </button>
                                        ))}
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="step2"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className="flex flex-col gap-6"
                                    >
                                        {currentOption && (
                                            <>
                                                {/* Focus Banner */}
                                                <div className="flex items-center gap-4 p-4 bg-[color:var(--theme-bg)] rounded-[1.5rem] border-2 border-[color:var(--theme-border)]">
                                                     <div className="p-2 bg-theme-base-bg rounded-lg border-2 border-[color:var(--theme-border)]">
                                                        {currentOption.icon}
                                                    </div>
                                                    <div>
                                                        <span className="text-xs font-bold text-[color:var(--theme-text-light)] uppercase tracking-wider block">当前选择</span>
                                                        <span className="text-lg font-black text-[color:var(--theme-text)]">{currentOption.title}</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => setStep(1)}
                                                        className="ml-auto text-xs font-semibold px-3 py-1.5 bg-theme-base-bg rounded-lg border-2 border-[color:var(--theme-border)] hover:bg-[color:var(--theme-bg-hover)]"
                                                    >
                                                        更换
                                                    </button>
                                                </div>

                                                {/* Target Selection */}
                                                <div>
                                                    <label className="block text-sm font-bold text-[color:var(--theme-text)] opacity-80 uppercase tracking-widest pl-2 mb-3">
                                                        目标数量 ({currentOption.unit})
                                                    </label>
                                                    <div className="grid grid-cols-4 gap-3">
                                                        {currentOption.presets.map((num) => (
                                                            <button
                                                                key={num}
                                                                onClick={() => setTarget(num)}
                                                                className={`
                                                                    py-3 rounded-2xl border-2 font-black text-lg transition-all
                                                                    ${target === num 
                                                                        ? 'bg-[color:var(--theme-text)] text-theme-base-bg border-[color:var(--theme-text)] shadow-[0_4px_0_0_rgba(0,0,0,0.2)] -translate-y-1' 
                                                                        : 'bg-[color:var(--theme-bg)] text-[color:var(--theme-text)] border-[color:var(--theme-border)] hover:border-[color:var(--theme-text)] hover:shadow-sm'
                                                                    }
                                                                `}
                                                            >
                                                                {num}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="mt-4 flex items-center gap-3">
                                                        <span className="text-sm font-bold text-[color:var(--theme-text-light)] pl-2">或自定义:</span>
                                                        <input 
                                                            type="number" 
                                                            min="1"
                                                            value={target || ''}
                                                            onChange={(e) => setTarget(parseInt(e.target.value) || 0)}
                                                            className="flex-1 bg-[color:var(--theme-bg)] border-2 border-[color:var(--theme-border)] rounded-xl px-4 py-2 font-bold text-[color:var(--theme-text)] focus:outline-none focus:border-[color:var(--theme-text)]"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Title Customization */}
                                                <div>
                                                     <label className="block text-sm font-bold text-[color:var(--theme-text)] opacity-80 uppercase tracking-widest pl-2 mb-3">
                                                        任务名称 (可选阅读)
                                                    </label>
                                                    <div className="relative">
                                                        <PenTool className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[color:var(--theme-text-light)]" />
                                                        <input
                                                            type="text"
                                                            value={customText}
                                                            onChange={(e) => setCustomText(e.target.value)}
                                                            className="w-full pl-12 pr-4 py-3 bg-[color:var(--theme-bg)] border-2 border-[color:var(--theme-border)] rounded-2xl font-bold text-[color:var(--theme-text)] focus:outline-none focus:border-[color:var(--theme-text)] transition-colors"
                                                            placeholder={currentOption.defaultText}
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Footer Controls */}
                        {step === 2 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="pt-4 border-t-2 border-[color:var(--theme-border)] flex gap-4"
                            >
                                 <button
                                    onClick={handleSave}
                                    disabled={target <= 0}
                                    className="w-full py-4 rounded-[1.5rem] bg-[color:var(--theme-text)] text-theme-base-bg font-black text-lg border-2 border-[color:var(--theme-text)] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-[0_4px_0_0_rgba(0,0,0,0.2)]"
                                >
                                    <Sparkles className="w-5 h-5" />
                                    生成全局智能任务
                                </button>
                            </motion.div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
