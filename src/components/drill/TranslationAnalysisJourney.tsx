import React, { type ReactNode } from "react";
import { BookOpen, ChevronRight, Sparkles, Volume2, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { GrammarDisplayMode } from "@/lib/grammarHighlights";

export interface TranslationAnalysisHighlight {
    kind: string;
    before: string;
    after: string;
    note: string;
}

interface TranslationAnalysisJourneyProps {
    analysisLead: string;
    analysisHighlights: TranslationAnalysisHighlight[];
    userTranslation: string;
    improvedVersionNode: ReactNode | null;
    referenceSentenceNode: ReactNode;
    isGeneratingGrammar: boolean;
    grammarError: string | null;
    grammarButtonLabel: string;
    hasGrammarAnalysis: boolean;
    grammarDisplayMode: GrammarDisplayMode;
    onGenerateGrammar: () => void;
    onGrammarDisplayModeChange: (mode: GrammarDisplayMode) => void;
    onPlayReferenceAudio?: () => void;
    hasFullAnalysis: boolean;
    isGeneratingFullAnalysis: boolean;
    fullAnalysisError: string | null;
    fullAnalysisOpen: boolean;
    onGenerateFullAnalysis: () => void;
    onToggleFullAnalysis: () => void;
    fullAnalysisContent: ReactNode;
}

interface StepCardProps {
    step: number;
    title: string;
    subtitle: string;
    children: ReactNode;
    actions?: ReactNode;
}

function StepCard({ step, title, subtitle, children, actions }: StepCardProps) {
    return (
        <section className="relative rounded-[2rem] border border-stone-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(251,250,248,0.92))] p-5 shadow-[0_18px_40px_rgba(28,25,23,0.05)] md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex min-h-10 items-center justify-center rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">
                            {`Step ${step}`}
                        </span>
                        <div>
                            <h3 className="font-newsreader text-[1.45rem] leading-tight text-stone-900">{title}</h3>
                            <p className="mt-1 text-sm leading-6 text-stone-500">{subtitle}</p>
                        </div>
                    </div>
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
            <div className="mt-5">{children}</div>
        </section>
    );
}

export function TranslationAnalysisJourney({
    analysisLead,
    analysisHighlights,
    userTranslation,
    improvedVersionNode,
    referenceSentenceNode,
    isGeneratingGrammar,
    grammarError,
    grammarButtonLabel,
    hasGrammarAnalysis,
    grammarDisplayMode,
    onGenerateGrammar,
    onGrammarDisplayModeChange,
    onPlayReferenceAudio,
    hasFullAnalysis,
    isGeneratingFullAnalysis,
    fullAnalysisError,
    fullAnalysisOpen,
    onGenerateFullAnalysis,
    onToggleFullAnalysis,
    fullAnalysisContent,
}: TranslationAnalysisJourneyProps) {
    const hasHighlights = analysisHighlights.length > 0;
    const grammarActionLabel = isGeneratingGrammar ? "正在生成语法分析" : grammarButtonLabel;
    const fullAnalysisButtonLabel = isGeneratingFullAnalysis
        ? "正在生成完整解析"
        : hasFullAnalysis
            ? "重新生成完整解析"
            : "生成完整解析";

    return (
        <div className="space-y-4">
            <StepCard
                step={1}
                title="先看错在哪"
                subtitle="先抓最关键的 2 到 3 个问题，再决定后面重点看什么。"
            >
                <div className="space-y-4">
                    <div className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                        <p className="font-newsreader text-[1.55rem] leading-tight text-stone-900">{analysisLead}</p>
                        <p className="mt-3 text-sm leading-6 text-stone-500">
                            你的答案：<span className="font-newsreader italic text-stone-700">&ldquo;{userTranslation.length > 140 ? `${userTranslation.slice(0, 140)}...` : userTranslation}&rdquo;</span>
                        </p>
                    </div>
                    <div className="space-y-3">
                        {hasHighlights ? analysisHighlights.map((item, index) => (
                            <div key={`${item.kind}-${index}`} className="rounded-[1.35rem] border border-stone-100 bg-stone-50/75 px-4 py-3.5">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-500">{item.kind}</span>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-300">#{index + 1}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                    <span className="rounded-full bg-rose-50 px-2.5 py-1 font-newsreader italic text-rose-600">{item.before}</span>
                                    <ChevronRight className="h-3.5 w-3.5 text-stone-300" />
                                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-newsreader italic text-emerald-700">{item.after}</span>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-stone-500">{item.note}</p>
                            </div>
                        )) : (
                            <div className="rounded-[1.35rem] border border-emerald-100 bg-emerald-50/70 px-4 py-4 text-sm leading-6 text-emerald-800">
                                这题没有明显结构性错误，主要是细节润色。
                            </div>
                        )}
                    </div>
                </div>
            </StepCard>

            {improvedVersionNode ? (
                <StepCard
                    step={2}
                    title="改成什么"
                    subtitle="先把更自然的表达读顺，再回头看参考句的结构。"
                >
                    <div className="rounded-[1.5rem] border border-amber-100/80 bg-[linear-gradient(180deg,rgba(255,250,235,0.88),rgba(255,255,255,0.92))] p-5">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600">
                            <Sparkles className="h-3.5 w-3.5" />
                            更自然表达
                        </div>
                        <div className="mt-4 space-y-2">
                            <div className="font-newsreader text-[1.55rem] leading-tight text-stone-900">
                                {improvedVersionNode}
                            </div>
                            <p className="text-[11px] text-stone-400">点击单词可查看释义并加入生词本</p>
                        </div>
                    </div>
                </StepCard>
            ) : null}

            <StepCard
                step={3}
                title="参考句"
                subtitle="先看标准表达，再按需决定要不要展开语法结构。"
                actions={(
                    <>
                        {hasGrammarAnalysis ? (
                            <div className="flex items-center rounded-full border border-[#dfcfab] bg-white/85 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                <button
                                    type="button"
                                    onClick={() => onGrammarDisplayModeChange("core")}
                                    className={cn(
                                        "rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] transition-all",
                                        grammarDisplayMode === "core"
                                            ? "bg-[#f3e2b5] text-[#6b4c18] shadow-[0_6px_16px_rgba(160,122,42,0.18)]"
                                            : "text-stone-500 hover:bg-[#fcf7eb] hover:text-stone-700",
                                    )}
                                >
                                    主干
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onGrammarDisplayModeChange("full")}
                                    className={cn(
                                        "rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] transition-all",
                                        grammarDisplayMode === "full"
                                            ? "bg-[#f3e2b5] text-[#6b4c18] shadow-[0_6px_16px_rgba(160,122,42,0.18)]"
                                            : "text-stone-500 hover:bg-[#fcf7eb] hover:text-stone-700",
                                    )}
                                >
                                    完整分析
                                </button>
                            </div>
                        ) : null}
                        {onPlayReferenceAudio ? (
                            <button
                                type="button"
                                onClick={onPlayReferenceAudio}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-indigo-200/80 bg-indigo-50 text-indigo-600 transition-all hover:-translate-y-0.5 hover:bg-indigo-100"
                                title="Listen to Correct Version"
                            >
                                <Volume2 className="h-4 w-4" />
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={onGenerateGrammar}
                            disabled={isGeneratingGrammar}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isGeneratingGrammar ? <Wand2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4 text-amber-600" />}
                            {grammarActionLabel}
                        </button>
                    </>
                )}
            >
                <div className="space-y-3">
                    <div className="rounded-[1.5rem] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(249,244,231,0.94))] px-4 py-4 shadow-[0_18px_44px_rgba(120,94,42,0.08)]">
                        <div className="font-newsreader text-base italic leading-relaxed text-stone-700 md:text-[1.075rem]">
                            {referenceSentenceNode}
                        </div>
                    </div>
                    {grammarError ? (
                        <p className="text-xs leading-5 text-stone-400">{grammarError}</p>
                    ) : null}
                </div>
            </StepCard>

            <StepCard
                step={4}
                title="完整解析"
                subtitle="按需生成更具体的教学补充，再决定是否展开细看。"
                actions={(
                    <>
                        <button
                            type="button"
                            onClick={onGenerateFullAnalysis}
                            disabled={isGeneratingFullAnalysis}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isGeneratingFullAnalysis ? <Wand2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-600" />}
                            {fullAnalysisButtonLabel}
                        </button>
                        {hasFullAnalysis ? (
                            <button
                                type="button"
                                onClick={onToggleFullAnalysis}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:border-stone-300"
                            >
                                {fullAnalysisOpen ? "收起详情" : "展开详情"}
                                <ChevronRight className={cn("h-4 w-4 transition-transform", fullAnalysisOpen && "rotate-90")} />
                            </button>
                        ) : null}
                    </>
                )}
            >
                {fullAnalysisError ? (
                    <p className="text-xs leading-5 text-rose-500">{fullAnalysisError}</p>
                ) : null}
                {!hasFullAnalysis && !isGeneratingFullAnalysis ? (
                    <div className="rounded-[1.5rem] border border-dashed border-stone-200 bg-stone-50/70 px-4 py-4 text-sm leading-6 text-stone-500">
                        这里会补充中式对比、易错提醒、短语同义替换和可迁移句型。
                    </div>
                ) : null}
                {fullAnalysisOpen ? <div className="mt-3">{fullAnalysisContent}</div> : null}
            </StepCard>
        </div>
    );
}
