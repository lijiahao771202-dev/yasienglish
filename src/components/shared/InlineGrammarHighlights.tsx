import React, { type CSSProperties, useState } from "react";
import { BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    buildGrammarViewModel,
    getGrammarHighlightColor,
    getGrammarHighlightPaletteByMeta,
    type GrammarDisplayMode,
    type GrammarHighlightPalette,
    type GrammarSentenceAnalysis,
} from "@/lib/grammarHighlights";

interface InlineGrammarHighlightsProps {
    text: string;
    sentences: readonly GrammarSentenceAnalysis[];
    className?: string;
    textClassName?: string;
    showSentenceMarkers?: boolean;
    displayMode?: GrammarDisplayMode;
    showSegmentTranslation?: boolean;
    allowNestedTooltipDetails?: boolean;
}

interface ExplanationBlock {
    label: string;
    content: string;
}

interface ExplanationTone {
    badgeClassName: string;
    textClassName: string;
}

function normalizeExplanationText(raw: string) {
    return raw
        .replace(/\s+/g, " ")
        .replace(/\s*([，。；：！？])/g, "$1")
        .trim();
}

function extractExplanationSegment(text: string, key: string, nextKeys: string[]) {
    const start = text.indexOf(key);
    if (start < 0) return "";
    const from = start + key.length;
    const nextIndexes = nextKeys
        .map((nextKey) => text.indexOf(nextKey, from))
        .filter((index) => index >= 0);
    const end = nextIndexes.length > 0 ? Math.min(...nextIndexes) : text.length;
    return text.slice(from, end).trim().replace(/^[：:]/, "").trim();
}

function buildExplanationBlocks(explanation: string): ExplanationBlock[] {
    const text = normalizeExplanationText(explanation);
    if (!text) return [];

    const structure = extractExplanationSegment(text, "结构判断", ["句中作用", "易错点"]);
    const role = extractExplanationSegment(text, "句中作用", ["易错点"]);
    const pitfalls = extractExplanationSegment(text, "易错点", []);

    const parsedBlocks: ExplanationBlock[] = [];
    if (structure) parsedBlocks.push({ label: "结构", content: structure });
    if (role) parsedBlocks.push({ label: "作用", content: role });
    if (pitfalls) parsedBlocks.push({ label: "易错", content: pitfalls });
    if (parsedBlocks.length > 0) return parsedBlocks;

    const fallbackLines = text
        .split(/[。；]/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3);

    if (fallbackLines.length === 0) return [];
    if (fallbackLines.length === 1) return [{ label: "说明", content: fallbackLines[0] }];
    return fallbackLines.map((line, index) => ({ label: `说明${index + 1}`, content: line }));
}

function getExplanationTone(label: string): ExplanationTone {
    if (label.startsWith("结构")) {
        return {
            badgeClassName: "bg-sky-100 text-sky-700",
            textClassName: "text-stone-700",
        };
    }
    if (label.startsWith("作用")) {
        return {
            badgeClassName: "bg-emerald-100 text-emerald-700",
            textClassName: "text-stone-700",
        };
    }
    if (label.startsWith("易错")) {
        return {
            badgeClassName: "bg-rose-100 text-rose-700",
            textClassName: "text-stone-700",
        };
    }
    return {
        badgeClassName: "bg-stone-100 text-stone-600",
        textClassName: "text-stone-700",
    };
}

function getMarkerStyle(palette: GrammarHighlightPalette, layer: string): CSSProperties {
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
    const [activeSentenceStart, setActiveSentenceStart] = useState<number | null>(null);
    const [activeRangeKey, setActiveRangeKey] = useState<string | null>(null);

    const sentenceStarts = sentenceMarkers.map((item) => item.start).sort((left, right) => left - right);
    const markerByStart = new Map(sentenceMarkers.map((item) => [item.start, item]));
    const markerIndexByStart = new Map(sentenceMarkers.map((item, index) => [item.start, index]));

    const findSentenceStartForOffset = (offset: number) => {
        let resolved: number | null = null;
        for (const start of sentenceStarts) {
            if (start <= offset) {
                resolved = start;
                continue;
            }
            break;
        }
        return resolved;
    };

    return (
        <span
            className={cn("inline", textClassName, className)}
            onMouseLeave={() => {
                setActiveRangeKey(null);
                setActiveSentenceStart(null);
            }}
            onBlurCapture={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                    setActiveRangeKey(null);
                    setActiveSentenceStart(null);
                }
            }}
        >
            {segments.map((segment) => {
                const marker = markerByStart.get(segment.start);
                const markerIndex = marker ? markerIndexByStart.get(marker.start) ?? 0 : -1;
                const segmentSentenceStart = findSentenceStartForOffset(segment.start);
                const isSentenceFocused = activeSentenceStart !== null && segmentSentenceStart === activeSentenceStart;
                const isSentenceDimmed = activeSentenceStart !== null && segmentSentenceStart !== null && segmentSentenceStart !== activeSentenceStart;
                const content = segment.highlight ? (
                    (() => {
                        const palette = getGrammarHighlightPaletteByMeta({
                            normalizedType: segment.highlight.normalizedType,
                            layer: segment.highlight.layer,
                        });
                        const overlapCount = segment.highlight.overlapCount ?? 0;
                        const explanationBlocks = buildExplanationBlocks(segment.highlight.explanation);
                        const rangeKey = `${segment.start}-${segment.end}`;
                        return (
                            <span
                                key={rangeKey}
                                tabIndex={0}
                                role="button"
                                aria-label={`${segment.highlight.translatedLabel}：${segment.highlight.explanation}`}
                                data-grammar-layer={segment.highlight.layer}
                                onMouseEnter={() => {
                                    setActiveSentenceStart(segment.highlight?.sentenceStart ?? segmentSentenceStart);
                                    setActiveRangeKey(rangeKey);
                                }}
                                onMouseLeave={() => {
                                    setActiveRangeKey((current) => (current === rangeKey ? null : current));
                                }}
                                onFocus={() => {
                                    setActiveSentenceStart(segment.highlight?.sentenceStart ?? segmentSentenceStart);
                                    setActiveRangeKey(rangeKey);
                                }}
                                onBlur={() => {
                                    setActiveRangeKey((current) => (current === rangeKey ? null : current));
                                }}
                                className={cn(
                                    "group/highlight relative inline cursor-help rounded-[0.38em] px-[0.16em] py-[0.03em] align-baseline font-medium [box-decoration-break:clone] [-webkit-box-decoration-break:clone] transition-[opacity,filter,color,background-size,box-shadow] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-300/70 focus-visible:ring-offset-1",
                                    "hover:brightness-[1.01] focus:brightness-[1.01]",
                                    getGrammarHighlightColor(segment.highlight.type),
                                    palette.textClassName,
                                    isSentenceDimmed && "opacity-[0.72]",
                                    isSentenceFocused && "bg-amber-50/35",
                                    activeRangeKey === rangeKey && "ring-1 ring-amber-200/60",
                                )}
                                style={getMarkerStyle(palette, segment.highlight.layer)}
                            >
                                {overlapCount > 0 ? (
                                    <span className="absolute -right-1.5 -top-1 z-20 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-amber-300/80 bg-amber-100 px-1 text-[9px] font-bold leading-none text-amber-700 shadow-sm">
                                        +{overlapCount}
                                    </span>
                                ) : null}
                                {segment.text}
                                <span className="pointer-events-none absolute bottom-full left-1/2 z-[100] mb-2.5 w-[min(18.5rem,calc(100vw-1rem))] max-h-[min(44vh,18rem)] -translate-x-1/2 overflow-hidden rounded-[22px] border border-rose-100 bg-[linear-gradient(145deg,#fffdfb_0%,#fff7fc_48%,#f4fbff_100%)] p-0 opacity-0 shadow-[0_16px_36px_rgba(244,114,182,0.14)] ring-1 ring-white/85 transition-opacity duration-150 ease-out group-hover/highlight:opacity-100 group-focus/highlight:opacity-100">
                                    <span className="relative z-10 flex items-center gap-2 border-b border-rose-100/90 bg-[linear-gradient(90deg,rgba(255,255,255,0.98),rgba(255,241,248,0.85))] px-3.5 py-2.5">
                                        <span
                                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white shadow-[0_6px_12px_rgba(244,114,182,0.15)] ring-1 ring-rose-100"
                                            style={{ color: palette.toneClassName.includes("text-stone-") ? "#0f172a" : undefined }}
                                        >
                                            <BookOpen className={cn("h-3.5 w-3.5", palette.toneClassName)} />
                                        </span>
                                        <span className="min-w-0 leading-none">
                                            <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-rose-300">
                                                Syntax Note
                                            </span>
                                            <span className="mt-0.5 block font-sans text-[13px] font-semibold leading-tight text-stone-800">
                                                {segment.highlight.translatedLabel}
                                            </span>
                                        </span>
                                    </span>
                                    <span className="relative z-10 block max-h-[calc(min(44vh,18rem)-42px)] overflow-y-auto px-3.5 py-2.5 font-sans">
                                        {(explanationBlocks.length > 0 ? explanationBlocks : [{ label: "说明", content: segment.highlight.explanation }]).map((block, idx) => {
                                            const tone = getExplanationTone(block.label);
                                            return (
                                                <span
                                                    key={`${block.label}-${idx}`}
                                                    className={cn(
                                                        "block break-words py-2 text-[12px] leading-[1.72] tracking-[0.01em]",
                                                        idx === 0 ? "pt-0" : "border-t border-rose-100/85",
                                                        tone.textClassName,
                                                    )}
                                                >
                                                    <span className={cn("mr-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]", tone.badgeClassName)}>
                                                        {block.label}
                                                    </span>
                                                    <span className="text-stone-700">{block.content}</span>
                                                </span>
                                            );
                                        })}
                                        {showSegmentTranslation && segment.highlight.segmentTranslation ? (
                                            <span className="block break-words border-t border-rose-100/85 py-2 text-[12px] leading-[1.72] tracking-[0.01em] text-stone-700">
                                                <span className="mr-1.5 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                                                    片段义
                                                </span>
                                                <span>{segment.highlight.segmentTranslation}</span>
                                            </span>
                                        ) : null}
                                        {Array.isArray(segment.highlight.alternatives) && segment.highlight.alternatives.length > 0 ? (
                                            <span className="block break-words border-t border-rose-100/85 pt-2 text-[12px] leading-[1.72] tracking-[0.01em] text-stone-700">
                                                <span className="mr-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                                                    重叠标签
                                                </span>
                                                <span>{segment.highlight.alternatives.slice(0, 3).map((item) => `${item.translatedLabel}：${item.explanation}`).join("；")}</span>
                                            </span>
                                        ) : null}
                                    </span>
                                </span>
                            </span>
                        );
                    })()
                ) : (
                    <span
                        key={`${segment.start}-${segment.end}`}
                        className={cn(isSentenceDimmed && "opacity-[0.72]", isSentenceFocused && "bg-amber-50/35")}
                    >
                        {segment.text}
                    </span>
                );

                if (!marker) {
                    return content;
                }

                return (
                    <React.Fragment key={`fragment-${segment.start}-${segment.end}`}>
                        <span
                            className="group/trans-icon relative mr-1 inline-block select-none align-middle"
                            onMouseEnter={() => setActiveSentenceStart(marker.start)}
                        >
                            <span
                                tabIndex={0}
                                role="button"
                                onFocus={() => setActiveSentenceStart(marker.start)}
                                className={cn(
                                    "flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[#ecdab5] bg-[linear-gradient(180deg,#fff8e8,#f7e7be)] font-sans text-[10px] font-bold text-amber-700 shadow-[0_4px_14px_rgba(180,134,43,0.16)] transition-[opacity,border-color,box-shadow,background-color,color] duration-150",
                                    activeSentenceStart !== null && activeSentenceStart !== marker.start && "opacity-45",
                                    activeSentenceStart === marker.start && "border-amber-400 bg-[linear-gradient(180deg,#fff2d2,#f3d487)] text-amber-800 ring-2 ring-amber-200/60 shadow-[0_8px_20px_rgba(180,134,43,0.28)]",
                                )}
                            >
                                {markerIndex + 1}
                            </span>
                            {marker.translation ? (
                                <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2.5 w-[min(16rem,calc(100vw-1rem))] max-h-[min(34vh,12rem)] overflow-hidden rounded-2xl border border-rose-100/90 bg-[linear-gradient(145deg,#fffdfb_0%,#fff7fc_48%,#f4fbff_100%)] p-0 text-left opacity-0 shadow-[0_12px_24px_rgba(244,114,182,0.15)] transition-opacity duration-150 ease-out group-hover/trans-icon:opacity-100 group-focus-within/trans-icon:opacity-100">
                                    <span className="flex items-center justify-between border-b border-rose-100/90 px-3 py-2">
                                        <span className="font-sans text-[9px] font-bold uppercase tracking-[0.16em] text-rose-400">
                                            第 {markerIndex + 1} 句
                                        </span>
                                        <span className="rounded-full border border-rose-100 bg-white/90 px-1.5 py-0.5 font-sans text-[9px] font-medium text-rose-400">
                                            译文
                                        </span>
                                    </span>
                                    <span className="block max-h-[calc(min(34vh,12rem)-36px)] overflow-y-auto px-3 py-2.5 font-sans text-[12px] leading-5 text-stone-700">
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
