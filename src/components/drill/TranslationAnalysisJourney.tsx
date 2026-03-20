import React, { type ReactNode } from "react";
import { BookOpen, ChevronRight, Sparkles, Volume2, Wand2 } from "lucide-react";
import * as Diff from "diff";

import { cn } from "@/lib/utils";
import type { GrammarDisplayMode } from "@/lib/grammarHighlights";

export interface TranslationAnalysisHighlight {
    kind: string;
    before: string;
    after: string;
    note: string;
    tip?: string;
}

interface TranslationAnalysisJourneyProps {
    analysisLead: string;
    analysisHighlights: TranslationAnalysisHighlight[];
    userTranslation: string;
    correctionTargetText: string;
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
    subtitle?: string;
    children: ReactNode;
    actions?: ReactNode;
}

function StepCard({ step, title, subtitle, children, actions }: StepCardProps) {
    return (
        <section className="rounded-2xl border border-stone-200 bg-white p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <span className="inline-flex min-h-8 items-center justify-center rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-600">
                            {`Step ${step}`}
                        </span>
                        <div>
                            <h3 className="font-newsreader text-[1.25rem] leading-tight text-stone-900">{title}</h3>
                            {subtitle ? (
                                <p className="mt-0.5 text-xs leading-5 text-stone-500">{subtitle}</p>
                            ) : null}
                        </div>
                    </div>
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
            <div className="mt-4">{children}</div>
        </section>
    );
}

export function TranslationAnalysisJourney({
    analysisHighlights,
    userTranslation,
    correctionTargetText,
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
    const grammarActionLabel = isGeneratingGrammar ? "正在生成语法分析" : grammarButtonLabel;
    const fullAnalysisButtonLabel = isGeneratingFullAnalysis
        ? "正在生成完整解析"
        : hasFullAnalysis
            ? "重新生成完整解析"
            : "生成完整解析";
    const normalizedUserTranslation = userTranslation.replace(/\s+/g, " ").trim();
    const normalizedCorrectionTarget = correctionTargetText.replace(/\s+/g, " ").trim();
    const correctionDiffParts = Diff.diffWords(
        normalizedUserTranslation,
        normalizedCorrectionTarget,
    );
    const hasCorrectionDiff = correctionDiffParts.some((part) => part.added || part.removed);
    const hasDedicatedNaturalExpression = Boolean(improvedVersionNode);

    const normalizeForMatch = (text: string) =>
        text
            .toLowerCase()
            .replace(/['’]/g, "")
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();

    interface CorrectionInsight {
        title: string;
        before?: string;
        after?: string;
        reason: string;
        tip?: string;
    }

    const cleanTooltipText = (text: string) => text.replace(/\s+/g, " ").trim();

    const getCorrectionInsight = (index: number): CorrectionInsight => {
        const part = correctionDiffParts[index];
        if (!part || (!part.added && !part.removed)) {
            return {
                title: "说明",
                reason: "这里做了表达优化。",
            };
        }

        const currentValue = cleanTooltipText(part.value || "");
        const currentNormalized = normalizeForMatch(part.value || "");
        const nextPart = index + 1 < correctionDiffParts.length ? correctionDiffParts[index + 1] : null;
        const prevPart = index - 1 >= 0 ? correctionDiffParts[index - 1] : null;
        const nextValue = cleanTooltipText(nextPart?.value || "");
        const prevValue = cleanTooltipText(prevPart?.value || "");
        const pairedAdded = part.removed && nextPart?.added ? normalizeForMatch(nextPart.value || "") : "";
        const pairedRemoved = part.added && prevPart?.removed ? normalizeForMatch(prevPart.value || "") : "";

        const matched = analysisHighlights.find((item) => {
            const before = normalizeForMatch(item.before || "");
            const after = normalizeForMatch(item.after || "");
            const currentInBefore = currentNormalized && before.includes(currentNormalized);
            const currentInAfter = currentNormalized && after.includes(currentNormalized);
            const pairedByNext = pairedAdded && before.includes(currentNormalized) && after.includes(pairedAdded);
            const pairedByPrev = pairedRemoved && before.includes(pairedRemoved) && after.includes(currentNormalized);

            if (part.removed) {
                return pairedByNext || currentInBefore;
            }
            return pairedByPrev || currentInAfter;
        });

        if (matched) {
            const matchedBefore = cleanTooltipText(matched.before || "");
            const matchedAfter = cleanTooltipText(matched.after || "");
            const matchedNote = (matched.note || "").trim();
            const matchedTip = (matched.tip || "").trim();

            if (matched.kind === "关键改错") {
                return {
                    title: "替换说明",
                    before: matchedBefore,
                    after: matchedAfter,
                    reason: matchedNote || "这样表达更地道、更符合英语习惯。",
                    tip: matchedTip || undefined,
                };
            }
            if (matched.kind === "缺失内容") {
                return {
                    title: "补充说明",
                    after: matchedAfter,
                    reason: matchedNote || `补上“${matchedAfter}”后，句子信息更完整。`,
                    tip: matchedTip || undefined,
                };
            }
            if (matched.kind === "多余表达") {
                return {
                    title: "删除说明",
                    before: matchedBefore,
                    reason: matchedNote || `“${matchedBefore}”在这里不需要，删除后更自然。`,
                    tip: matchedTip || undefined,
                };
            }
            return {
                title: "说明",
                before: matchedBefore || undefined,
                after: matchedAfter || undefined,
                reason: matchedNote || "这里做了表达优化。",
                tip: matchedTip || undefined,
            };
        }

        if (part.removed && nextPart?.added) {
            return {
                title: "替换说明",
                before: currentValue,
                after: nextValue,
                reason: "这样表达更自然、更贴近英语习惯。",
            };
        }
        if (part.added && prevPart?.removed) {
            return {
                title: "替换说明",
                before: prevValue,
                after: currentValue,
                reason: "这样表达更自然、更贴近英语习惯。",
            };
        }
        if (part.removed) {
            return {
                title: "删除说明",
                before: currentValue,
                reason: `“${currentValue}”在这里不需要，删掉更简洁。`,
            };
        }
        return {
            title: "补充说明",
            after: currentValue,
            reason: `补上“${currentValue}”，句子信息才完整。`,
        };
    };

    return (
        <div className="space-y-4">
            <StepCard
                step={1}
                title="先看错在哪"
            >
                <div className="space-y-3">
                    <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">你的答案</p>
                        <p className="mt-2 font-newsreader text-[1.22rem] italic leading-relaxed text-stone-800">
                            &ldquo;{userTranslation.length > 180 ? `${userTranslation.slice(0, 180)}...` : userTranslation}&rdquo;
                        </p>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3.5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-500">内容纠错</div>
                        {hasCorrectionDiff ? (
                            <div className="mt-2.5 flex flex-wrap items-center gap-y-1 text-[1.12rem] leading-relaxed font-newsreader text-stone-800 md:text-[1.2rem]">
                                {correctionDiffParts.map((part, index) => {
                                    if (!part.removed && !part.added) {
                                        return <span key={`${part.value}-${index}`} className="whitespace-pre-wrap">{part.value}</span>;
                                    }

                                    const insight = getCorrectionInsight(index);
                                    return (
                                        <span key={`${part.value}-${index}`} className="group relative inline-block">
                                            <span
                                                className={cn(
                                                    "whitespace-pre-wrap cursor-help rounded-sm px-1",
                                                    part.removed && "bg-rose-50 text-rose-600 line-through decoration-rose-400 decoration-2",
                                                    part.added && "bg-emerald-50 text-emerald-700",
                                                )}
                                            >
                                                {part.value}
                                            </span>
                                            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 font-sans text-stone-700 opacity-0 shadow-[0_14px_28px_rgba(28,25,23,0.14)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                                                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{insight.title}</span>
                                                {insight.before || insight.after ? (
                                                    <span className="mt-1.5 flex flex-wrap items-center gap-1 text-[12px] leading-5">
                                                        {insight.before ? (
                                                            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-600 line-through decoration-rose-400">{insight.before}</span>
                                                        ) : null}
                                                        {insight.before && insight.after ? <span className="text-stone-400">→</span> : null}
                                                        {insight.after ? (
                                                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{insight.after}</span>
                                                        ) : null}
                                                    </span>
                                                ) : null}
                                                <span className="mt-1.5 block text-[11px] leading-5 text-stone-600">{insight.reason}</span>
                                                {insight.tip ? (
                                                    <span className="mt-1 block text-[11px] leading-5 text-sky-700">记忆：{insight.tip}</span>
                                                ) : null}
                                            </span>
                                        </span>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="mt-2.5 text-xs leading-5 text-emerald-800">这句整体已经接近目标表达。</p>
                        )}
                    </div>

                </div>
            </StepCard>

            <StepCard
                step={2}
                title="表达对照"
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
                    {hasDedicatedNaturalExpression ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3.5">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">地道表达</div>
                            <div className="mt-2 font-newsreader text-[1.12rem] italic leading-relaxed text-stone-800 md:text-[1.2rem]">
                                {improvedVersionNode}
                            </div>
                        </div>
                    ) : null}
                    <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3.5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">参考句</div>
                        <div className="mt-2 font-newsreader text-[1.12rem] italic leading-relaxed text-stone-800 md:text-[1.2rem]">
                            {referenceSentenceNode}
                        </div>
                    </div>
                    {grammarError ? (
                        <p className="text-xs leading-5 text-stone-400">{grammarError}</p>
                    ) : null}
                </div>
            </StepCard>

            <StepCard
                step={3}
                title="完整解析"
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
                    <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-500">
                        按需生成完整解析。
                    </div>
                ) : null}
                {fullAnalysisOpen ? <div className="mt-3">{fullAnalysisContent}</div> : null}
            </StepCard>
        </div>
    );
}
