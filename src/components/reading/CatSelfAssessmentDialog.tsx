"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
    CAT_SELF_ASSESSMENT_LABELS,
    type CatSelfAssessment,
} from "@/lib/cat-self-assessment";

interface CatSelfAssessmentDialogProps {
    open: boolean;
    isSubmitting: boolean;
    isPreparing?: boolean;
    onSelect: (value: CatSelfAssessment) => void;
    onClose: () => void;
}

const OPTIONS: Array<{
    value: CatSelfAssessment;
    title: string;
    description: string;
    accentClass: string;
}> = [
    {
        value: "easy",
        title: "简单",
        description: "这篇明显偏轻，可以再往上提一点。",
        accentClass: "border-emerald-200/80 bg-emerald-100/80 text-emerald-700",
    },
    {
        value: "just_right",
        title: "刚好",
        description: "挑战感合适，维持当前节奏就行。",
        accentClass: "border-sky-200/80 bg-sky-100/80 text-sky-700",
    },
    {
        value: "hard",
        title: "偏难",
        description: "读起来有压力，下一局应该保守一点。",
        accentClass: "border-amber-200/80 bg-amber-100/80 text-amber-700",
    },
];

export function CatSelfAssessmentDialog({
    open,
    isSubmitting,
    isPreparing = false,
    onSelect,
    onClose,
}: CatSelfAssessmentDialogProps) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[86]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div
                        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.48),rgba(15,23,42,0.62))] backdrop-blur-[10px]"
                        onClick={() => {
                            if (!isSubmitting) onClose();
                        }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center px-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.98 }}
                            transition={{ duration: 0.38, ease: [0.2, 1, 0.3, 1] }}
                            className="w-full max-w-xl rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_30px_90px_-38px_rgba(15,23,42,0.85)] backdrop-blur-2xl md:p-6"
                        >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">CAT Calibration</p>
                            <h3 className="mt-2 font-newsreader text-[2rem] font-semibold leading-none text-slate-900">
                                这局你主观感觉如何？
                            </h3>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                系统会先按客观表现结算，再用你的主观体感做一层微调。
                            </p>
                            {isPreparing && !isSubmitting && (
                                <p className="mt-2 text-xs font-medium text-slate-500">
                                    系统原判计算中，你可以先做选择。
                                </p>
                            )}

                            <div className="mt-5 grid gap-3">
                                {OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => onSelect(option.value)}
                                        className="group rounded-[22px] border border-slate-200/80 bg-white/90 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_36px_-26px_rgba(15,23,42,0.42)] disabled:cursor-wait disabled:opacity-70"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", option.accentClass)}>
                                                        {option.title}
                                                    </span>
                                                    <span className="text-xs font-medium text-slate-400">
                                                        {CAT_SELF_ASSESSMENT_LABELS[option.value]}
                                                    </span>
                                                </div>
                                                <p className="mt-2 text-sm font-semibold text-slate-800">{option.description}</p>
                                            </div>
                                            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition group-hover:text-slate-500">
                                                选择
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="mt-4 flex justify-end">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={isSubmitting}
                                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-wait disabled:opacity-70"
                                >
                                    按系统结算
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
