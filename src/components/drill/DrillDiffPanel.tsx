"use client";

import type { ReactNode } from "react";
import * as Diff from "diff";
import { BookOpen, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineGrammarHighlights } from "../shared/InlineGrammarHighlights";
import { normalizeTranslationForComparison } from "@/lib/translation-diff";
import type { GrammarDisplayMode, GrammarSentenceAnalysis } from "@/lib/grammarHighlights";
import type { PronunciationWordResult } from "@/lib/pronunciation-scoring";

interface DrillDiffPanelDrillData {
    chinese: string;
    reference_english: string;
    reference_english_alternatives?: string[];
}

interface DrillDiffPanelFeedback {
    improved_version?: string;
    word_results?: PronunciationWordResult[];
}

export interface DrillDiffPanelProps {
    drillData: DrillDiffPanelDrillData;
    drillFeedback: DrillDiffPanelFeedback;
    grammarError: string | null;
    isDictationMode: boolean;
    isGeneratingGrammar: boolean;
    mode: "translation" | "listening" | "dictation" | "rebuild" | "imitation";
    onGrammarDisplayModeChange: (mode: GrammarDisplayMode) => void;
    recapNode?: ReactNode;
    referenceGrammarAnalysis: GrammarSentenceAnalysis[] | null;
    referenceGrammarDisplayMode: GrammarDisplayMode;
    renderInteractiveCoachText: (text: string) => ReactNode;
    userTranslation: string;
}

export function DrillDiffPanel({
    drillData,
    drillFeedback,
    grammarError,
    isDictationMode,
    isGeneratingGrammar,
    mode,
    onGrammarDisplayModeChange,
    recapNode,
    referenceGrammarAnalysis,
    referenceGrammarDisplayMode,
    renderInteractiveCoachText,
    userTranslation,
}: DrillDiffPanelProps) {
    if (mode === "listening" && drillFeedback.word_results?.length) {
        const pronounceWord = (word: string) => {
            const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${word}&type=2`);
            audio.play().catch(() => {});
        };

        return (
            <div className="space-y-4">
                <div className="p-5 bg-white/60 rounded-2xl border border-stone-100 shadow-sm">
                    <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <BookOpen className="w-3 h-3" />
                        词级评分 <span className="text-stone-300 font-normal ml-2">点击单词可发音</span>
                    </div>
                    <div className="font-newsreader text-2xl leading-loose text-stone-800 flex flex-wrap gap-x-1 gap-y-2">
                        {drillFeedback.word_results.map((result, index) => {
                            const tooltip = [
                                `总分 ${result.score.toFixed(1)}/10`,
                                typeof result.accuracy_score === "number" ? `准确度 ${result.accuracy_score.toFixed(1)}` : null,
                                typeof result.stress_score === "number" ? `重音 ${result.stress_score.toFixed(1)}` : null,
                            ].filter(Boolean).join(" · ");

                            if (result.status === "correct") {
                                return (
                                    <span key={index} className="relative group cursor-pointer" onClick={() => pronounceWord(result.word)}>
                                        <span className="text-emerald-700 hover:bg-emerald-50 px-0.5 rounded transition-colors">{result.word}</span>
                                        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-200 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">{tooltip}</span>
                                    </span>
                                );
                            }

                            if (result.status === "weak") {
                                return (
                                    <span key={index} className="relative group cursor-pointer" onClick={() => pronounceWord(result.word)}>
                                        <span className="text-amber-600 font-semibold hover:bg-amber-50 px-0.5 rounded transition-colors">{result.word}</span>
                                        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-amber-600 bg-amber-50 px-1 rounded border border-amber-200 opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">{tooltip}</span>
                                    </span>
                                );
                            }

                            return (
                                <span key={index} className="relative group cursor-pointer" onClick={() => pronounceWord(result.word)}>
                                    <span className="text-rose-500 font-semibold underline decoration-wavy decoration-rose-300 hover:bg-rose-50 px-0.5 rounded transition-colors">{result.word}</span>
                                    <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-rose-600 bg-rose-50 px-1 rounded border border-rose-200 opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">{tooltip}</span>
                                </span>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    const comparisonTarget = isDictationMode ? drillData.chinese : drillData.reference_english;
    const cleanUser = normalizeTranslationForComparison(userTranslation);
    const cleanTarget = normalizeTranslationForComparison(comparisonTarget);
    const diffs = Diff.diffWords(cleanUser, cleanTarget);

    const elements: ReactNode[] = [];
    for (let index = 0; index < diffs.length; index += 1) {
        const part = diffs[index];
        if (!part.added && !part.removed) {
            elements.push(<span key={index} className="text-stone-800">{part.value}</span>);
            continue;
        }
        if (part.removed) {
            let correction: string | null = null;
            if (index + 1 < diffs.length && diffs[index + 1].added) {
                correction = diffs[index + 1]?.value ?? null;
                index += 1;
            }
            elements.push(
                <span key={index} className="group relative inline-block cursor-help mx-1">
                    <span className="text-rose-600 decoration-2 underline decoration-wavy decoration-rose-300 bg-rose-50/50 rounded px-0.5">{part.value}</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] px-3 py-2 bg-stone-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                        <div className="font-bold text-rose-200 mb-0.5">Incorrect</div>
                        {correction ? <span className="text-emerald-300 font-mono text-sm">{correction}</span> : <span>Unnecessary word</span>}
                    </div>
                </span>,
            );
            continue;
        }
        elements.push(
            <span key={index} className="group relative inline-block cursor-help mx-0.5 align-text-bottom">
                <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-bold border border-emerald-200 hover:scale-110 transition-transform">+</div>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] px-3 py-2 bg-stone-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                    <div className="font-bold text-emerald-300 mb-0.5">Missing Word</div>
                    <span className="font-mono text-sm">{part.value}</span>
                </div>
            </span>,
        );
    }

    return (
        <div className="space-y-4">
            {recapNode}
            <div className="p-5 bg-white/60 rounded-2xl border border-stone-100 shadow-sm">
                <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <BookOpen className="w-3 h-3" />
                    对照修订
                </div>
                <div className="font-newsreader text-xl leading-loose text-stone-800 flex flex-wrap gap-x-1 gap-y-2 mb-4">
                    {elements}
                </div>

                <div className="pt-4 border-t border-stone-100/80 space-y-3">
                    {drillFeedback.improved_version ? (
                        <div>
                            <p className="text-[10px] text-stone-400 font-sans font-bold uppercase mb-1 flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-indigo-400" /> AI 地道改写</p>
                            <p className="text-lg font-newsreader text-indigo-900 leading-relaxed font-medium">{renderInteractiveCoachText(drillFeedback.improved_version)}</p>
                        </div>
                    ) : null}
                    <div>
                        <div className="mb-1 flex items-center justify-between gap-3">
                            <p className="text-[10px] text-stone-400 font-sans font-bold uppercase">
                                {isDictationMode ? "Standard Reference (中文参考)" : "Standard Reference (参考答案)"}
                            </p>
                            {!isDictationMode && referenceGrammarAnalysis ? (
                                <div className="flex items-center rounded-full border border-[#dfcfab] bg-white/85 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                    <button
                                        type="button"
                                        onClick={() => onGrammarDisplayModeChange("core")}
                                        className={cn(
                                            "rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] transition-all",
                                            referenceGrammarDisplayMode === "core"
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
                                            referenceGrammarDisplayMode === "full"
                                                ? "bg-[#f3e2b5] text-[#6b4c18] shadow-[0_6px_16px_rgba(160,122,42,0.18)]"
                                                : "text-stone-500 hover:bg-[#fcf7eb] hover:text-stone-700",
                                        )}
                                    >
                                        完整分析
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        {isDictationMode ? (
                            <div className="rounded-[24px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(249,244,231,0.94))] px-4 py-4 shadow-[0_18px_44px_rgba(120,94,42,0.08)]">
                                <p className="text-base font-newsreader text-stone-700 italic leading-relaxed md:text-[1.075rem]">&ldquo;{drillData.chinese}&rdquo;</p>
                            </div>
                        ) : isGeneratingGrammar ? (
                            <div className="rounded-[20px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,250,241,0.96),rgba(249,243,228,0.92))] px-4 py-3 text-xs text-[#8a5d1f] shadow-[0_12px_28px_rgba(120,94,42,0.06)]">
                                语法分析生成中...
                            </div>
                        ) : referenceGrammarAnalysis ? (
                            <div className="rounded-[24px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(249,244,231,0.94))] px-4 py-4 shadow-[0_18px_44px_rgba(120,94,42,0.08)]">
                                <p className="text-base font-newsreader text-stone-700 italic leading-relaxed md:text-[1.075rem]">
                                    &ldquo;
                                    <InlineGrammarHighlights
                                        text={drillData.reference_english}
                                        sentences={referenceGrammarAnalysis}
                                        displayMode={referenceGrammarDisplayMode}
                                        showSegmentTranslation
                                        textClassName="leading-relaxed"
                                    />
                                    &rdquo;
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-[24px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(249,244,231,0.94))] px-4 py-4 shadow-[0_18px_44px_rgba(120,94,42,0.08)]">
                                <p className="text-base font-newsreader text-stone-700 italic leading-relaxed md:text-[1.075rem]">&ldquo;{drillData.reference_english}&rdquo;</p>
                            </div>
                        )}
                        {!isDictationMode && grammarError ? (
                            <p className="mt-2 text-xs text-stone-400">参考句语法分析暂时不可用，已回退到普通参考句显示。</p>
                        ) : null}
                        {!isDictationMode && drillData.reference_english_alternatives?.length ? (
                            <div className="mt-4 pt-3 border-t border-stone-100/80">
                                <p className="text-[10px] text-stone-400 font-sans font-bold uppercase mb-2 flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3 text-emerald-400" /> 其他地道表达
                                </p>
                                <ul className="space-y-2 pl-1">
                                    {drillData.reference_english_alternatives.slice(0, 2).map((alt, index) => (
                                        <li key={index} className="text-sm font-newsreader text-stone-600 italic flex items-start gap-2 max-w-[95%]">
                                            <span className="text-emerald-300/50 select-none text-xs translate-y-[2px]">✦</span>
                                            <span className="leading-relaxed whitespace-pre-wrap">{alt}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
