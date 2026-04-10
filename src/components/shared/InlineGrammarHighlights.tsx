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

interface PopupTheme {
    cardBorder: string;
    cardTopTint: string;
    cardBottomTint: string;
    sectionBorder: string;
    sectionTint: string;
    subtleTint: string;
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

    const fallback = text
        .split(/[；。]/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3);

    if (fallback.length <= 1) return [{ label: "说明", content: text }];
    return fallback.map((content, index) => ({ label: `说明${index + 1}`, content }));
}

function toRgbaWithAlpha(color: string, alpha: number, fallback: string) {
    const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!match) return fallback;
    const [, r, g, b] = match;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getPopupThemeFromPalette(palette: GrammarHighlightPalette): PopupTheme {
    return {
        cardBorder: toRgbaWithAlpha(palette.border, 0.85, "rgba(214, 211, 209, 0.78)"),
        cardTopTint: toRgbaWithAlpha(palette.markerShade, 0.16, "rgba(245, 243, 240, 0.16)"),
        cardBottomTint: toRgbaWithAlpha(palette.markerBase, 0.14, "rgba(250, 247, 240, 0.18)"),
        sectionBorder: toRgbaWithAlpha(palette.border, 0.65, "rgba(214, 211, 209, 0.62)"),
        sectionTint: toRgbaWithAlpha(palette.markerBase, 0.14, "rgba(250, 250, 249, 0.86)"),
        subtleTint: toRgbaWithAlpha(palette.markerShade, 0.12, "rgba(245, 245, 244, 0.84)"),
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
    const [popupAlign, setPopupAlign] = useState<"center" | "left" | "right">("center");

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
                        const popupTheme = getPopupThemeFromPalette(palette);
                        const overlapCount = segment.highlight.overlapCount ?? 0;
                        const explanationBlocks = buildExplanationBlocks(segment.highlight.explanation);
                        const rangeKey = `${segment.start}-${segment.end}`;
                        const handleActivate = () => {
                            setActiveSentenceStart(segment.highlight?.sentenceStart ?? segmentSentenceStart);
                            setActiveRangeKey(rangeKey);
                        };

                        const checkAlignment = (target: HTMLElement) => {
                            const rect = target.getBoundingClientRect();
                            if (rect.left < 170) setPopupAlign("left");
                            else if (window.innerWidth - rect.right < 170) setPopupAlign("right");
                            else setPopupAlign("center");
                        };

                        return (
                            <span
                                key={rangeKey}
                                tabIndex={0}
                                role="button"
                                aria-label={`${segment.highlight.translatedLabel}：${segment.highlight.explanation}`}
                                data-grammar-layer={segment.highlight.layer}
                                onMouseEnter={(e) => {
                                    handleActivate();
                                    checkAlignment(e.currentTarget);
                                }}
                                onMouseLeave={() => {
                                    setActiveRangeKey((current) => (current === rangeKey ? null : current));
                                }}
                                onFocus={(e) => {
                                    handleActivate();
                                    checkAlignment(e.currentTarget);
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
                                <span
                                    className={cn(
                                        "pointer-events-none absolute bottom-full z-[100] mb-3 w-[min(20rem,calc(100vw-2rem))] rounded-[22px] border p-3 opacity-0 shadow-[0_18px_44px_rgba(28,25,23,0.16)] ring-1 ring-white/70 transition-opacity duration-150 ease-out group-hover/highlight:opacity-100 group-focus/highlight:opacity-100",
                                                popupAlign === "left" && "left-0",
                                                popupAlign === "right" && "right-0",
                                                popupAlign === "center" && "left-1/2 -translate-x-1/2"
                                            )}
                                    style={{
                                        borderColor: popupTheme.cardBorder,
                                        backgroundColor: "rgba(255,253,248,0.985)",
                                        backgroundImage: `linear-gradient(180deg, ${popupTheme.cardTopTint} 0%, ${popupTheme.cardBottomTint} 100%)`,
                                    }}
                                >
                                    <span className="mb-2 flex items-center gap-2 border-b pb-2" style={{ borderColor: popupTheme.sectionBorder }}>
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
                                        <span
                                            className="block rounded-2xl border px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                                            style={{
                                                borderColor: popupTheme.sectionBorder,
                                                backgroundColor: "rgba(255,255,255,0.92)",
                                                backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.92) 0%, ${popupTheme.sectionTint} 100%)`,
                                            }}
                                        >
                                            <span className={cn("mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em]", palette.toneClassName)}>
                                                语法功能
                                            </span>
                                            <span className="block space-y-1.5">
                                                {explanationBlocks.map((item, index) => (
                                                    <span key={`${item.label}-${index}`} className="flex items-start gap-1.5 text-xs leading-5 text-stone-700">
                                                        <span
                                                            className={cn(
                                                                "mt-0.5 inline-flex min-w-10 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                                                                palette.toneClassName,
                                                            )}
                                                            style={{ borderColor: popupTheme.sectionBorder, backgroundColor: "rgba(255,255,255,0.82)" }}
                                                        >
                                                            {item.label}
                                                        </span>
                                                        <span className="min-w-0 flex-1">{item.content}</span>
                                                    </span>
                                                ))}
                                            </span>
                                        </span>
                                        {showSegmentTranslation && segment.highlight.segmentTranslation ? (
                                            <span
                                                className="block rounded-2xl border px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                                                style={{
                                                    borderColor: popupTheme.sectionBorder,
                                                    backgroundColor: "rgba(255,255,255,0.9)",
                                                    backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.9) 0%, ${popupTheme.subtleTint} 100%)`,
                                                }}
                                            >
                                                <span className={cn("mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em]", palette.toneClassName)}>
                                                    片段义
                                                </span>
                                                <span className="block text-xs leading-5 text-stone-700">
                                                    {segment.highlight.segmentTranslation}
                                                </span>
                                            </span>
                                        ) : null}
                                        {Array.isArray(segment.highlight.alternatives) && segment.highlight.alternatives.length > 0 ? (
                                            <span
                                                className="block rounded-2xl border px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                                                style={{
                                                    borderColor: popupTheme.sectionBorder,
                                                    backgroundColor: "rgba(255,255,255,0.9)",
                                                    backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.9) 0%, ${popupTheme.subtleTint} 100%)`,
                                                }}
                                            >
                                                <span className={cn("mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em]", palette.toneClassName)}>
                                                    重叠标签
                                                </span>
                                                <span className="block text-xs leading-5 text-stone-700">
                                                    {segment.highlight.alternatives.slice(0, 3).map((item) => `${item.translatedLabel}：${item.explanation}`).join("；")}
                                                </span>
                                            </span>
                                        ) : null}
                                    </span>
                                    <span
                                        className={cn(
                                            "absolute top-full -mt-[1px] h-3.5 w-3.5 rotate-45 rounded-[3px] border-b border-r",
                                            popupAlign === "left" && "left-4",
                                            popupAlign === "right" && "right-4",
                                            popupAlign === "center" && "left-1/2 -translate-x-1/2"
                                        )}
                                        style={{ borderColor: popupTheme.cardBorder, backgroundColor: "rgba(255,251,244,0.96)" }}
                                    />
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
                                <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-3 w-80 rounded-[22px] border border-stone-200/90 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(250,247,240,0.96))] p-4 text-left opacity-0 shadow-[0_18px_44px_rgba(28,25,23,0.16)] transition-opacity duration-150 ease-out group-hover/trans-icon:opacity-100 group-focus-within/trans-icon:opacity-100">
                                    <span className="mb-2 flex items-center justify-between border-b border-stone-200/80 pb-2">
                                        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.24em] text-amber-700">
                                            第 {markerIndex + 1} 句
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
