"use client";

import { AlertTriangle, BookOpen, BrainCircuit, Sparkles, Network } from "lucide-react";
import { syntaxParser } from "@/lib/syntaxParser";
import { useMemo } from "react";

interface TranslationAnalysisDetailsPayload {
    diagnosis_summary_cn?: string;
    chinglish_vs_natural?: {
        chinglish: string;
        natural: string;
        reason_cn: string;
    };
    common_pitfall?: {
        pitfall_cn: string;
        wrong_example: string;
        right_example: string;
        why_cn: string;
    };
    phrase_synonyms?: Array<{
        source_phrase: string;
        alternatives: string[];
        nuance_cn: string;
    }>;
    transfer_pattern?: {
        template: string;
        example_cn: string;
        example_en: string;
        tip_cn: string;
    };
    memory_hook_cn?: string;
    error_analysis?: Array<{
        error: string;
        correction: string;
        rule: string;
        tip: string;
    }>;
    similar_patterns?: Array<{
        chinese: string;
        english: string;
        point: string;
    }>;
    feedback?: unknown;
}

export interface TranslationAnalysisDetailsProps {
    details: TranslationAnalysisDetailsPayload | null;
    teachingMode: boolean;
}

export function TranslationAnalysisDetails({
    details,
    teachingMode,
}: TranslationAnalysisDetailsProps) {
    return (
        <div className="space-y-4">
            {details?.diagnosis_summary_cn ? (
                <div className="rounded-[1.75rem] border border-stone-100 bg-white/90 p-5 shadow-[0_12px_30px_rgba(28,25,23,0.04)]">
                    <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        核心判断
                    </h4>
                    <p className="mt-3 text-sm leading-7 text-stone-600">{details?.diagnosis_summary_cn}</p>
                </div>
            ) : null}

            {details?.chinglish_vs_natural ? (
                <div className="rounded-[1.75rem] border border-orange-100 bg-orange-50/40 p-5">
                    <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                        <Sparkles className="w-3.5 h-3.5" />
                        中式对比
                    </h4>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-rose-100/80 bg-white/85 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-500">Chinglish</p>
                            <p className="mt-2 font-newsreader text-lg italic text-rose-700">{details?.chinglish_vs_natural.chinglish}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-100/80 bg-white/85 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Natural</p>
                            <p className="mt-2 font-newsreader text-lg italic text-emerald-800">{details?.chinglish_vs_natural.natural}</p>
                        </div>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-stone-600">{details?.chinglish_vs_natural.reason_cn}</p>
                </div>
            ) : null}

            {details?.common_pitfall ? (
                <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50/40 p-5">
                    <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        易错提醒
                    </h4>
                    <p className="mt-3 text-sm leading-7 text-stone-600">{details?.common_pitfall.pitfall_cn}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-rose-100/80 bg-white/85 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-500">Wrong</p>
                            <p className="mt-2 font-newsreader text-lg italic text-rose-700">{details?.common_pitfall.wrong_example}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-100/80 bg-white/85 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Right</p>
                            <p className="mt-2 font-newsreader text-lg italic text-emerald-800">{details?.common_pitfall.right_example}</p>
                        </div>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-stone-600">{details?.common_pitfall.why_cn}</p>
                </div>
            ) : null}

            {details?.phrase_synonyms?.length ? (
                <div className="rounded-[1.75rem] border border-sky-100 bg-sky-50/40 p-5">
                    <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-600">
                        <BookOpen className="w-3.5 h-3.5" />
                        短语同义替换
                    </h4>
                    <div className="mt-4 space-y-3">
                        {details?.phrase_synonyms.map((item, index) => (
                            <div key={`${item.source_phrase}-${index}`} className="rounded-2xl border border-sky-100/80 bg-white/85 p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-500">Source Phrase</p>
                                <p className="mt-2 font-newsreader text-lg italic text-stone-900">{item.source_phrase}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {item.alternatives.map((alternative, altIndex) => (
                                        <span key={`${alternative}-${altIndex}`} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                                            {alternative}
                                        </span>
                                    ))}
                                </div>
                                <p className="mt-3 text-sm leading-6 text-stone-600">{item.nuance_cn}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {details?.transfer_pattern ? (
                <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/35 p-5">
                    <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                        <Sparkles className="w-3.5 h-3.5" />
                        可迁移句型
                    </h4>
                    <div className="mt-4 rounded-2xl border border-emerald-100/80 bg-white/85 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-500">Template</p>
                        <p className="mt-2 font-newsreader text-lg italic text-stone-900">{details?.transfer_pattern.template}</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">中文场景</p>
                                <p className="mt-1 text-sm text-stone-700">{details?.transfer_pattern.example_cn}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">英文套用</p>
                                <p className="mt-1 font-newsreader text-base italic text-stone-900">{details?.transfer_pattern.example_en}</p>
                            </div>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-stone-600">{details?.transfer_pattern.tip_cn}</p>
                    </div>
                </div>
            ) : null}

            {details?.memory_hook_cn ? (
                <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50/50 p-5">
                    <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                        <Sparkles className="w-3.5 h-3.5" />
                        一句记忆法
                    </h4>
                    <p className="mt-3 text-sm leading-7 text-stone-700">{details?.memory_hook_cn}</p>
                </div>
            ) : null}

            {teachingMode && details?.error_analysis?.length ? (
                <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50/40 p-5">
                    <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        错误精讲
                    </h4>
                    <div className="mt-4 space-y-3">
                        {details?.error_analysis.map((err, index) => (
                            <div key={index} className="rounded-2xl border border-rose-100/80 bg-white/80 p-4">
                                <div className="flex items-start gap-2">
                                    <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">错误</span>
                                    <span className="text-sm text-stone-600 line-through">{err.error}</span>
                                </div>
                                <div className="mt-2 flex items-start gap-2">
                                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">正确</span>
                                    <span className="text-sm font-medium text-stone-800">{err.correction}</span>
                                </div>
                                <div className="mt-3 border-l-2 border-amber-300 pl-3 text-xs leading-6 text-stone-500">
                                    <strong>规则：</strong>{err.rule}
                                </div>
                                {err.tip ? <div className="mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-600">💡 {err.tip}</div> : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {teachingMode && details?.similar_patterns?.length ? (
                <div className="rounded-[1.75rem] border border-purple-100 bg-purple-50/30 p-5">
                    <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-600">
                        <BrainCircuit className="w-3.5 h-3.5" />
                        举一反三
                    </h4>
                    <div className="mt-4 space-y-3">
                        {details?.similar_patterns.map((pattern, index) => (
                            <div key={index} className="rounded-2xl border border-purple-100/80 bg-white/80 p-4">
                                <div className="text-sm text-stone-600">{pattern.chinese}</div>
                                <div className="mt-1 text-lg font-newsreader italic text-stone-900">→ {pattern.english}</div>
                                {pattern.point ? <div className="mt-2 text-xs leading-5 text-purple-500">🎯 {pattern.point}</div> : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {!details?.diagnosis_summary_cn && Array.isArray(details?.feedback) ? (
                <div className="rounded-[1.75rem] border border-stone-100 bg-white/90 p-5 shadow-[0_12px_30px_rgba(28,25,23,0.04)]">
                    <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        补充说明
                    </h4>
                    <div className="mt-4 space-y-3">
                        {details?.feedback.map((point, index) => (
                            <div key={index} className="flex gap-2 text-sm leading-7 text-stone-600">
                                <div className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                                <p>{point}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
