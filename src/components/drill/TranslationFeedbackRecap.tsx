"use client";

import { useMemo, Fragment, type MouseEventHandler, type ReactNode } from "react";
import { BookOpen, HelpCircle, Sparkles, Volume2, Network } from "lucide-react";
import { syntaxParser } from "@/lib/syntaxParser";

interface TranslationFeedbackRecapProps {
    chineseText?: string | null;
    englishText?: string | null;
    learnerText?: string | null;
    alternatives?: string[];
    showScoreTutorButton: boolean;
    showGenerateAnalysisButton: boolean;
    isGeneratingAnalysis: boolean;
    onOpenScoreTutor: MouseEventHandler<HTMLButtonElement>;
    onGenerateAnalysis: () => void;
    onReplayReference: () => void;
    renderInteractiveText: (text: string) => ReactNode;
}

export function TranslationFeedbackRecap({
    chineseText,
    englishText,
    learnerText,
    alternatives = [],
    showScoreTutorButton,
    showGenerateAnalysisButton,
    isGeneratingAnalysis,
    onOpenScoreTutor,
    onGenerateAnalysis,
    onReplayReference,
    renderInteractiveText,
}: TranslationFeedbackRecapProps) {
    const trimmedChinese = chineseText?.trim();
    const trimmedEnglish = englishText?.trim();
    const trimmedLearner = learnerText?.trim();

    const syntaxChunks = useMemo<Array<{ text: string; type: string }>>(() => {
        if (!trimmedEnglish) return [];
        return syntaxParser.parseChunks(trimmedEnglish);
    }, [trimmedEnglish]);

    if (!trimmedChinese && !trimmedEnglish && !trimmedLearner) return null;

    return (
        <div className="overflow-hidden rounded-[2rem] border border-stone-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(247,248,250,0.95))] shadow-[0_18px_40px_rgba(28,25,23,0.05)]">
            <div className="p-4 md:p-6">
                <div className="flex flex-col">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">
                            <BookOpen className="h-4 w-4 text-stone-400" />
                            句意回看 / Recap
                        </div>

                        <div className="flex items-center gap-2.5">
                            {showScoreTutorButton ? (
                                <button
                                    type="button"
                                    onClick={onOpenScoreTutor}
                                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-stone-200/80 bg-stone-50 px-3.5 py-1 text-[12px] font-bold text-stone-600 transition-all hover:scale-105 active:scale-95 shadow-sm"
                                    title="打开英语老师"
                                >
                                    <HelpCircle className="h-3.5 w-3.5 text-stone-500" />
                                    AI 老师
                                </button>
                            ) : null}
                            {showGenerateAnalysisButton ? (
                                <button
                                    onClick={onGenerateAnalysis}
                                    disabled={isGeneratingAnalysis}
                                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,1),rgba(254,243,199,0.9))] px-3.5 py-1 text-[12px] font-bold text-amber-600 transition-all hover:scale-105 active:scale-95 shadow-[0_2px_8px_rgba(245,158,11,0.12)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                                >
                                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                    {isGeneratingAnalysis ? "生成中..." : "生成解析"}
                                </button>
                            ) : null}
                            {trimmedEnglish ? (
                                <button
                                    type="button"
                                    onClick={onReplayReference}
                                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50 px-3.5 py-1 text-[12px] font-bold text-indigo-600 transition-all hover:scale-105 active:scale-95 shadow-sm"
                                    title="重听英文原句"
                                >
                                    <Volume2 className="h-3.5 w-3.5 text-indigo-500" />
                                    重听标准音
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {(trimmedEnglish || trimmedLearner) ? (
                        <div className="mt-1 overflow-hidden rounded-[1.2rem] border border-stone-200/80 bg-white shadow-sm">
                            <div className="flex flex-col divide-y divide-stone-100/80">
                                {trimmedLearner ? (
                                    <div className="flex flex-col bg-stone-50/20">
                                        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/60 px-5 py-2.5">
                                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">你的作答</span>
                                            <span className="text-[10px] font-mono tracking-widest text-stone-400">YOU</span>
                                        </div>
                                        <div className="relative p-5 md:p-6">
                                            <div className="font-sans text-sm leading-7 text-stone-800 md:text-base md:leading-8">
                                                {renderInteractiveText(trimmedLearner)}
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                {trimmedEnglish ? (
                                    <div className="flex flex-col bg-sky-50/10">
                                        <div className="flex items-center justify-between border-b border-sky-100/50 bg-sky-50/30 px-5 py-2.5">
                                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700/80">标准参考</span>
                                            <span className="text-[10px] font-mono tracking-widest text-sky-500/80">REF</span>
                                        </div>
                                        <div className="flex flex-col gap-6 bg-gradient-to-b from-sky-50/20 to-transparent p-5 md:p-6">
                                            <div>
                                                {trimmedChinese ? (
                                                    <div className="mb-2.5">
                                                        <p className="text-[13px] font-medium leading-relaxed text-stone-500/90">
                                                            {trimmedChinese}
                                                        </p>
                                                    </div>
                                                ) : null}
                                                <div className="font-sans text-sm leading-8 text-stone-800 md:text-base md:leading-9">
                                                    {syntaxChunks.length > 0 ? (
                                                        <>
                                                            {syntaxChunks.map((chunk, idx) => {
                                                                let underlineClass = "";
                                                                let labelClass = "";
                                                                let label = "";

                                                                if (chunk.type === "verb_phrase") {
                                                                    underlineClass = "border-rose-400/60";
                                                                    labelClass = "text-rose-500";
                                                                    label = "动词";
                                                                } else if (chunk.type === "noun_phrase") {
                                                                    underlineClass = "border-blue-400/60";
                                                                    labelClass = "text-blue-500";
                                                                    label = "名词";
                                                                } else if (chunk.type === "prep_phrase") {
                                                                    underlineClass = "border-emerald-400/60";
                                                                    labelClass = "text-emerald-500";
                                                                    label = "介词";
                                                                } else if (chunk.type === "conjunction" || chunk.type === "subordinating_conjunction") {
                                                                    underlineClass = "border-amber-400/60";
                                                                    labelClass = "text-amber-500";
                                                                    label = "连词";
                                                                } else if (chunk.type === "adverb") {
                                                                    underlineClass = "border-indigo-400/60";
                                                                    labelClass = "text-indigo-500";
                                                                    label = "副词";
                                                                } else if (chunk.type === "adjective") {
                                                                    underlineClass = "border-teal-400/60";
                                                                    labelClass = "text-teal-500";
                                                                    label = "形容词";
                                                                } else if (chunk.type === "pronoun") {
                                                                    underlineClass = "border-purple-400/60";
                                                                    labelClass = "text-purple-500";
                                                                    label = "代词";
                                                                }

                                                                return (
                                                                    <Fragment key={idx}>
                                                                        <ruby className="group" style={{ rubyPosition: 'over', rubyAlign: 'center' } as any}>
                                                                            <span className={underlineClass ? `border-b-[2.5px] pb-[1px] transition-colors hover:border-b-4 ${underlineClass}` : ""}>
                                                                                {renderInteractiveText(chunk.text)}
                                                                            </span>
                                                                            {label && (
                                                                                <rt className={`text-[9.5px] sm:text-[10px] font-bold tracking-wider opacity-80 select-none ${labelClass}`}>
                                                                                    <span>{label}</span>
                                                                                </rt>
                                                                            )}
                                                                        </ruby>
                                                                        {idx < syntaxChunks.length - 1 ? ' ' : ''}
                                                                    </Fragment>
                                                                );
                                                            })}
                                                        </>
                                                    ) : (
                                                        renderInteractiveText(trimmedEnglish)
                                                    )}
                                                </div>
                                            </div>

                                            {alternatives.length > 0 ? (
                                                <div className="mt-2 flex flex-col gap-4">
                                                    <div className="flex w-full items-center gap-3 opacity-60">
                                                        <div className="h-px w-8 bg-gradient-to-r from-sky-200/80 to-sky-200/80" />
                                                        <span className="flex shrink-0 items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-sky-800">
                                                            <Sparkles className="h-2.5 w-2.5" />其他地道表达
                                                        </span>
                                                        <div className="h-px flex-1 bg-gradient-to-r from-sky-200/80 to-transparent" />
                                                    </div>
                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        {alternatives.map((alt, i) => (
                                                            <div
                                                                key={`${alt}-${i}`}
                                                                className="flex cursor-default items-start gap-2.5 rounded-[14px] border border-sky-100/40 bg-white px-4 py-3.5 shadow-[0_4px_12px_rgba(14,165,233,0.03)] transition-all hover:border-sky-100/60 hover:shadow-[0_4px_16px_rgba(14,165,233,0.06)]"
                                                            >
                                                                <div className="mt-[8px] h-[3px] w-[3px] shrink-0 rounded-full bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.8)]" />
                                                                <p className="font-sans text-[13.5px] leading-relaxed text-stone-600/90">
                                                                    {alt}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
