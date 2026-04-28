"use client";

import type { ReactNode } from "react";
import { ArrowRight, BookOpen, BrainCircuit, Mic, Sparkles, Volume2 } from "lucide-react";
import { LocalEngineBadge } from "./LocalEngineBadge";

export interface DrillFeedbackHighlight {
    after: string;
    before: string;
    kind: string;
    note: string;
}

export interface DrillFeedbackSummaryCardProps {
    analysisHighlights: DrillFeedbackHighlight[];
    analysisLead: string;
    improvedVersionNode?: ReactNode | null;
    isDictationMode: boolean;
    isLocalEvaluation?: boolean;
    isShadowingMode: boolean;
    judgeReasoning?: string;
    metricCardsNode?: ReactNode | null;
    onPlayRecording?: () => void;
    onPlayReferenceAudio: () => void;
    primaryAdvice?: string;
    userTranslation: string;
}

export function DrillFeedbackSummaryCard({
    analysisHighlights,
    analysisLead,
    improvedVersionNode,
    isDictationMode,
    isLocalEvaluation,
    isShadowingMode,
    judgeReasoning,
    metricCardsNode,
    onPlayRecording,
    onPlayReferenceAudio,
    primaryAdvice,
    userTranslation,
}: DrillFeedbackSummaryCardProps) {
    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-[2rem] border border-stone-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(251,250,248,0.94))] shadow-[0_18px_40px_rgba(28,25,23,0.06)]">
                <div className="p-6 md:p-7">
                    <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                        <div className="max-w-2xl">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    本题解析
                                </span>
                                <span className="inline-flex items-center rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                    {analysisHighlights.length} Fix{analysisHighlights.length === 1 ? "" : "es"}
                                </span>
                            </div>
                            <p className="mt-4 text-[1.8rem] leading-tight text-stone-900 font-newsreader">
                                {analysisLead}
                            </p>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
                                你的答案：<span className="font-newsreader italic text-stone-700">&ldquo;{userTranslation.length > 140 ? `${userTranslation.slice(0, 140)}...` : userTranslation}&rdquo;</span>
                            </p>
                        </div>

                        <div className="flex gap-2">
                            {isShadowingMode && onPlayRecording ? (
                                <button
                                    onClick={onPlayRecording}
                                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition-all hover:-translate-y-0.5 hover:bg-rose-100"
                                    title="Play My Recording"
                                >
                                    <Mic className="w-3.5 h-3.5" />
                                    Play Mine
                                </button>
                            ) : null}
                            <button
                                onClick={onPlayReferenceAudio}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-indigo-200/80 bg-indigo-50 text-indigo-600 transition-all hover:-translate-y-0.5 hover:bg-indigo-100"
                                title="Listen to Correct Version"
                            >
                                <Volume2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                        <div className="rounded-[1.5rem] border border-stone-200/80 bg-white/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                                <BookOpen className="w-3.5 h-3.5 text-stone-400" />
                                {isShadowingMode ? "词级评分" : "关键改错"}
                            </div>
                            <div className="mt-4 space-y-3">
                                {analysisHighlights.length > 0 ? analysisHighlights.map((item, index) => (
                                    <div key={`${item.kind}-${index}`} className="rounded-2xl border border-stone-100 bg-stone-50/70 px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-500">{item.kind}</span>
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-300">#{index + 1}</span>
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                            <span className="rounded-full bg-rose-50 px-2.5 py-1 font-newsreader italic text-rose-600">{item.before}</span>
                                            <ArrowRight className="w-3.5 h-3.5 text-stone-300" />
                                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-newsreader italic text-emerald-700">{item.after}</span>
                                        </div>
                                        <p className="mt-2 text-sm leading-6 text-stone-500">{item.note}</p>
                                    </div>
                                )) : (
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4 text-sm leading-6 text-emerald-800">
                                        {isShadowingMode ? "当前没有明显低分词，词级评分整体稳定。" : "这题没有明显结构性错误，主要是细节润色。"}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-[1.5rem] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,250,235,0.88),rgba(255,255,255,0.92))] p-5">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600">
                                {isShadowingMode ? "句级指标" : isDictationMode ? "听写建议" : "更自然表达"}
                            </div>
                            {isShadowingMode ? (
                                metricCardsNode
                            ) : improvedVersionNode ? (
                                <div className="mt-4 space-y-2">
                                    <p className="text-[1.6rem] leading-tight font-newsreader">
                                        {improvedVersionNode}
                                    </p>
                                    <p className="text-[11px] text-stone-400">点击单词可查看释义并加入生词本</p>
                                </div>
                            ) : primaryAdvice ? (
                                <p className="mt-4 text-base leading-7 text-stone-700">{primaryAdvice}</p>
                            ) : (
                                <p className="mt-4 text-sm leading-6 text-stone-500">这题主要是局部修正，原句整体已经接近标准表达。</p>
                            )}
                        </div>
                    </div>

                    {!isShadowingMode && judgeReasoning ? (
                        <div className="mb-4 mx-1 flex items-start gap-3 rounded-2xl border border-stone-200/50 bg-stone-50/50 px-5 py-3 backdrop-blur-sm">
                            <BrainCircuit className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                            <div className="flex-1 text-sm font-medium leading-relaxed text-stone-600">
                                <span className="mr-2 text-[10px] font-bold uppercase tracking-wider text-indigo-900/60">AI JUDGE</span>
                                {judgeReasoning}
                            </div>
                            {isLocalEvaluation ? <LocalEngineBadge /> : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
