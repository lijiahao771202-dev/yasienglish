import React, { type CSSProperties, useState } from "react";

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

    const structure = extractExplanationSegment(text, "结构判断", ["句中作用", "主干关系", "依附关系", "理解提醒", "易错点"]);
    const role = extractExplanationSegment(text, "句中作用", ["主干关系", "依附关系", "理解提醒", "易错点"]);
    const relation = extractExplanationSegment(text, "主干关系", ["依附关系", "理解提醒", "易错点"])
        || extractExplanationSegment(text, "依附关系", ["理解提醒", "易错点"]);
    const learningCue = extractExplanationSegment(text, "理解提醒", ["易错点"]);
    const pitfalls = extractExplanationSegment(text, "易错点", []);

    const parsedBlocks: ExplanationBlock[] = [];
    if (structure) parsedBlocks.push({ label: "这部分", content: structure });
    if (role) parsedBlocks.push({ label: "放在这里", content: role });
    if (relation) parsedBlocks.push({ label: "它连着", content: relation });
    if (learningCue) parsedBlocks.push({ label: "提醒", content: learningCue });
    if (pitfalls) parsedBlocks.push({ label: "别看错", content: pitfalls });
    if (parsedBlocks.length > 0) return parsedBlocks.slice(0, 3);

    const fallback = text
        .split(/[；。]/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3);

    if (fallback.length <= 1) return [{ label: "说明", content: text }];
    return fallback.slice(0, 3).map((content, index) => ({ label: index === 0 ? "说明" : "补充", content }));
}

function makeLearnerFriendlyText(text: string) {
    return text
        .replace(/时间状语从句/g, "交代时间的一小句")
        .replace(/时间状语/g, "补充时间的部分")
        .replace(/地点状语/g, "补充地点的部分")
        .replace(/方式状语/g, "补充方式的部分")
        .replace(/原因状语从句/g, "交代原因的一小句")
        .replace(/条件状语从句/g, "交代条件的一小句")
        .replace(/定语从句/g, "补充说明前面名词的一小句")
        .replace(/名词性从句/g, "像名词一样使用的一小句")
        .replace(/主句主语/g, "主句里表示谁或什么的部分")
        .replace(/主语/g, "表示谁或什么的部分")
        .replace(/主句谓语部分/g, "主句里表示动作或状态的部分")
        .replace(/谓语/g, "表示动作或状态的部分")
        .replace(/宾语/g, "动作对应的对象")
        .replace(/表语/g, "补充说明状态的部分")
        .replace(/介词短语/g, "补充说明的一小段")
        .replace(/动名词短语/g, "一个动作短语")
        .replace(/先行词/g, "前面的名词")
        .replace(/修饰/g, "补充说明")
        .replace(/主句骨架|主句主干/g, "主句最核心的部分")
        .replace(/不属于主句骨架/g, "不属于主句最核心的部分")
        .replace(/\s+/g, " ")
        .trim();
}

function makeLearnerFriendlyBlock(block: ExplanationBlock): ExplanationBlock {
    let content = makeLearnerFriendlyText(block.content);

    if (block.label === "放在这里") {
        content = content
            .replace(/^说明/, "用来说明")
            .replace(/^指出/, "用来指出")
            .replace(/^交代/, "用来交代")
            .replace(/^补充说明/, "用来补充说明");
    }

    if (block.label === "它连着") {
        content = content
            .replace(/^和/, "它和")
            .replace(/^它/, "这部分")
            .replace(/^后接在/, "它接在");
    }

    return {
        label: block.label,
        content,
    };
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
                        const explanationBlocks = buildExplanationBlocks(segment.highlight.explanation)
                            .map(makeLearnerFriendlyBlock);
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
                                        "pointer-events-none absolute bottom-full z-[100] mb-2 w-[min(15rem,calc(100vw-2rem))] rounded-2xl border px-3 py-2.5 opacity-0 shadow-[0_14px_30px_rgba(28,25,23,0.12)] transition-opacity duration-150 ease-out group-hover/highlight:opacity-100 group-focus/highlight:opacity-100",
                                        popupAlign === "left" && "left-0",
                                        popupAlign === "right" && "right-0",
                                        popupAlign === "center" && "left-1/2 -translate-x-1/2",
                                    )}
                                    style={{
                                        borderColor: popupTheme.cardBorder,
                                        backgroundColor: "rgba(255,255,255,0.97)",
                                        backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.98) 0%, ${popupTheme.cardBottomTint} 100%)`,
                                    }}
                                >
                                    <span className="mb-2 flex items-center gap-2">
                                        <span
                                            className={cn(
                                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none",
                                                palette.toneClassName,
                                            )}
                                            style={{ borderColor: popupTheme.sectionBorder, backgroundColor: "rgba(255,255,255,0.86)" }}
                                        >
                                            {segment.highlight.translatedLabel}
                                        </span>
                                        <span className="text-[10px] font-medium text-stone-400">
                                            语法提示
                                        </span>
                                    </span>
                                    <span className="block space-y-1.5 font-sans text-[12px] leading-5 text-stone-700">
                                        {explanationBlocks.map((item, index) => (
                                            <span key={`${item.label}-${index}`} className="flex items-start gap-2">
                                                <span
                                                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                                                    style={{ backgroundColor: palette.border }}
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className="font-medium text-stone-900">{item.label}</span>
                                                    <span className="text-stone-600"> {item.content}</span>
                                                </span>
                                            </span>
                                        ))}
                                    </span>
                                    {showSegmentTranslation && segment.highlight.segmentTranslation ? (
                                        <span
                                            className="mt-2 block border-t pt-2 font-sans"
                                            style={{ borderColor: popupTheme.sectionBorder }}
                                        >
                                            <span className="block text-[10px] font-medium text-stone-400">
                                                片段义
                                            </span>
                                            <span className="block text-[11px] leading-5 text-stone-600">
                                                {segment.highlight.segmentTranslation}
                                            </span>
                                        </span>
                                    ) : null}
                                    <span
                                        className={cn(
                                            "absolute top-full -mt-[1px] h-3 w-3 rotate-45 rounded-[2px] border-b border-r",
                                            popupAlign === "left" && "left-4",
                                            popupAlign === "right" && "right-4",
                                            popupAlign === "center" && "left-1/2 -translate-x-1/2"
                                        )}
                                        style={{ borderColor: popupTheme.cardBorder, backgroundColor: "rgba(255,255,255,0.96)" }}
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
