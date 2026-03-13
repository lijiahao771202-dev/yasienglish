import React, { type CSSProperties } from "react";
import { BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    buildGrammarViewModel,
    getGrammarHighlightColor,
    type GrammarDisplayMode,
    type GrammarSentenceAnalysis,
} from "@/lib/grammarHighlights";

interface InlineGrammarHighlightsProps {
    text: string;
    sentences: GrammarSentenceAnalysis[];
    className?: string;
    textClassName?: string;
    showSentenceMarkers?: boolean;
    displayMode?: GrammarDisplayMode;
    showSegmentTranslation?: boolean;
    allowNestedTooltipDetails?: boolean;
}

function getMarkerPalette(normalizedType: string, layer: string) {
    if (normalizedType === "主语") {
        return {
            textClassName: "text-teal-950",
            toneClassName: "text-teal-700",
            markerBase: "rgba(148, 210, 189, 0.52)",
            markerShade: "rgba(103, 191, 164, 0.28)",
            border: "rgba(54, 116, 94, 0.18)",
        };
    }
    if (normalizedType === "谓语") {
        return {
            textClassName: "text-emerald-950",
            toneClassName: "text-emerald-700",
            markerBase: "rgba(151, 219, 190, 0.56)",
            markerShade: "rgba(86, 179, 140, 0.28)",
            border: "rgba(39, 94, 66, 0.2)",
        };
    }
    if (normalizedType === "宾语" || normalizedType === "表语") {
        return {
            textClassName: "text-sky-950",
            toneClassName: "text-sky-700",
            markerBase: "rgba(171, 213, 244, 0.54)",
            markerShade: "rgba(113, 182, 233, 0.28)",
            border: "rgba(54, 104, 148, 0.18)",
        };
    }
    if (layer === "structure") {
        return {
            textClassName: "text-slate-900",
            toneClassName: "text-slate-700",
            markerBase: "rgba(196, 206, 218, 0.5)",
            markerShade: "rgba(153, 169, 187, 0.24)",
            border: "rgba(84, 102, 124, 0.18)",
        };
    }
    if (normalizedType === "状语") {
        return {
            textClassName: "text-amber-950",
            toneClassName: "text-amber-700",
            markerBase: "rgba(244, 217, 156, 0.5)",
            markerShade: "rgba(224, 175, 73, 0.24)",
            border: "rgba(143, 104, 30, 0.16)",
        };
    }
    if (normalizedType === "介词短语" || normalizedType === "定语") {
        return {
            textClassName: "text-cyan-950",
            toneClassName: "text-cyan-700",
            markerBase: "rgba(185, 225, 223, 0.44)",
            markerShade: "rgba(119, 189, 185, 0.2)",
            border: "rgba(54, 118, 114, 0.14)",
        };
    }
    if (normalizedType === "补语" || normalizedType === "同位语") {
        return {
            textClassName: "text-rose-950",
            toneClassName: "text-rose-700",
            markerBase: "rgba(246, 204, 196, 0.4)",
            markerShade: "rgba(227, 149, 129, 0.18)",
            border: "rgba(145, 85, 74, 0.12)",
        };
    }

    return {
        textClassName: "text-stone-900",
        toneClassName: "text-stone-700",
        markerBase: layer === "modifier" ? "rgba(229, 220, 206, 0.34)" : "rgba(206, 216, 227, 0.42)",
        markerShade: layer === "modifier" ? "rgba(208, 187, 154, 0.18)" : "rgba(149, 168, 191, 0.22)",
        border: "rgba(87, 83, 78, 0.14)",
    };
}

function getMarkerStyle(normalizedType: string, layer: string): CSSProperties {
    const palette = getMarkerPalette(normalizedType, layer);
    const topStop = layer === "core" ? "42%" : layer === "structure" ? "49%" : "58%";
    const midStop = layer === "core" ? "82%" : layer === "structure" ? "84%" : "80%";
    const bottomStop = layer === "core" ? "92%" : layer === "structure" ? "90%" : "87%";

    return {
        backgroundImage: [
            `linear-gradient(178deg, transparent ${topStop}, ${palette.markerBase} ${topStop}, ${palette.markerBase} ${midStop}, transparent ${bottomStop})`,
            `linear-gradient(182deg, transparent calc(${topStop} - 4%), ${palette.markerShade} calc(${topStop} - 4%), ${palette.markerShade} ${bottomStop}, transparent 100%)`,
        ].join(", "),
        boxShadow: `inset 0 -0.06em 0 ${palette.border}`,
    };
}

export function InlineGrammarHighlights({
    text,
    sentences,
    className,
    textClassName,
    showSentenceMarkers = false,
    displayMode = "core",
    showSegmentTranslation = false,
}: InlineGrammarHighlightsProps) {
    const viewModel = buildGrammarViewModel(text, sentences);
    const segments = displayMode === "core" ? viewModel.core : viewModel.full;
    const sentenceMarkers = showSentenceMarkers ? viewModel.sentenceMarkers : [];

    return (
        <span className={cn("inline", textClassName, className)}>
            {segments.map((segment) => {
                const marker = sentenceMarkers.find((item) => item.start === segment.start);
                const content = segment.highlight ? (
                    (() => {
                        const palette = getMarkerPalette(segment.highlight.normalizedType, segment.highlight.layer);
                        return (
                            <span
                                key={`${segment.start}-${segment.end}`}
                                tabIndex={0}
                                role="button"
                                aria-label={`${segment.highlight.translatedLabel}：${segment.highlight.explanation}`}
                                data-grammar-layer={segment.highlight.layer}
                                className={cn(
                                    "group/highlight relative inline cursor-help rounded-[0.38em] px-[0.16em] py-[0.03em] align-baseline font-medium [box-decoration-break:clone] [-webkit-box-decoration-break:clone] transition-[filter,transform,color,background-size] duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-300/70 focus-visible:ring-offset-1",
                                    "hover:saturate-[1.08] hover:brightness-[0.99] focus:saturate-[1.08] focus:brightness-[0.99]",
                                    getGrammarHighlightColor(segment.highlight.type),
                                    palette.textClassName,
                                )}
                                style={getMarkerStyle(segment.highlight.normalizedType, segment.highlight.layer)}
                            >
                                {segment.text}
                                <span className="pointer-events-none absolute bottom-full left-1/2 z-[100] mb-3 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 translate-y-2 rounded-[22px] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(250,247,240,0.96))] p-3 opacity-0 shadow-[0_18px_44px_rgba(28,25,23,0.16)] ring-1 ring-white/70 transition-all duration-200 ease-out group-hover/highlight:translate-y-0 group-hover/highlight:opacity-100 group-focus/highlight:translate-y-0 group-focus/highlight:opacity-100">
                                    <span className="mb-2 flex items-center gap-2 border-b border-stone-200/80 pb-2">
                                        <span
                                            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/70 shadow-sm"
                                            style={{ backgroundColor: palette.markerBase, color: palette.toneClassName === "text-stone-700" ? "#57534e" : undefined }}
                                        >
                                            <BookOpen className={cn("h-3.5 w-3.5", palette.toneClassName)} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">
                                                Grammar Note
                                            </span>
                                            <span className="block font-sans text-sm font-semibold text-stone-900">
                                                {segment.highlight.translatedLabel}
                                            </span>
                                        </span>
                                    </span>
                                    <span className="space-y-2.5 font-sans">
                                        <span className="block rounded-2xl border border-stone-200/70 bg-white/70 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                                                语法功能
                                            </span>
                                            <span className="block text-xs leading-5 text-stone-700">
                                                {segment.highlight.explanation}
                                            </span>
                                        </span>
                                        {showSegmentTranslation && segment.highlight.segmentTranslation ? (
                                            <span className="block rounded-2xl border border-stone-200/70 bg-stone-50/85 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                                                    片段义
                                                </span>
                                                <span className="block text-xs leading-5 text-stone-700">
                                                    {segment.highlight.segmentTranslation}
                                                </span>
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="absolute left-1/2 top-full -mt-[1px] h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-[3px] border-b border-r border-stone-200/80 bg-[#fbf8f1]" />
                                </span>
                            </span>
                        );
                    })()
                ) : (
                    <span key={`${segment.start}-${segment.end}`}>{segment.text}</span>
                );

                if (!marker) {
                    return content;
                }

                return (
                    <React.Fragment key={`fragment-${segment.start}-${segment.end}`}>
                        <span className="group/trans-icon relative mr-1 inline-block select-none align-middle">
                            <span className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[#ecdab5] bg-[linear-gradient(180deg,#fff8e8,#f7e7be)] font-sans text-[10px] font-bold text-amber-700 shadow-[0_4px_14px_rgba(180,134,43,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(180,134,43,0.2)]">
                                {sentenceMarkers.indexOf(marker) + 1}
                            </span>
                            {marker.translation ? (
                                <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-3 w-80 translate-y-2 rounded-[22px] border border-stone-200/90 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(250,247,240,0.96))] p-4 text-left opacity-0 shadow-[0_18px_44px_rgba(28,25,23,0.16)] transition-all duration-300 ease-out group-hover/trans-icon:translate-y-0 group-hover/trans-icon:opacity-100">
                                    <span className="mb-2 flex items-center justify-between border-b border-stone-200/80 pb-2">
                                        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.24em] text-amber-700">
                                            第 {sentenceMarkers.indexOf(marker) + 1} 句
                                        </span>
                                        <span className="rounded-full border border-stone-200/80 bg-white/80 px-2 py-0.5 font-sans text-[10px] font-medium text-stone-500">
                                            译文
                                        </span>
                                    </span>
                                    <span className="block font-sans text-sm leading-6 text-stone-700">
                                        {marker.translation}
                                    </span>
                                </span>
                            ) : null}
                        </span>
                        {content}
                    </React.Fragment>
                );
            })}
        </span>
    );
}
