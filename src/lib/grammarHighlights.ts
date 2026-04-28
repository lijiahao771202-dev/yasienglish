export type GrammarLayer = "core" | "modifier" | "structure";
export type GrammarDisplayMode = "core" | "full";

export interface GrammarHighlightInput {
    substring: string;
    type: string;
    explanation: string;
    segment_translation?: string;
}

export interface GrammarSentenceAnalysis {
    sentence: string;
    translation?: string;
    highlights?: readonly GrammarHighlightInput[];
}

export interface GrammarSentenceMarker {
    start: number;
    translation?: string;
}

export interface GrammarHighlightAlternative {
    rawType: string;
    normalizedType: string;
    translatedLabel: string;
    layer: GrammarLayer;
    explanation: string;
    segmentTranslation?: string;
    displayPriority: number;
}

export interface GrammarHighlightRange {
    start: number;
    end: number;
    sentenceStart: number;
    sentenceIndex: number;
    type: string;
    rawType: string;
    normalizedType: string;
    translatedLabel: string;
    explanation: string;
    segmentTranslation?: string;
    sentenceText: string;
    sentenceTranslation?: string;
    layer: GrammarLayer;
    displayPriority: number;
    overlapCount?: number;
    alternatives?: GrammarHighlightAlternative[];
}

export interface GrammarTextSegment {
    start: number;
    end: number;
    text: string;
    highlight: GrammarHighlightRange | null;
}

export interface GrammarViewModel {
    core: GrammarTextSegment[];
    full: GrammarTextSegment[];
    sentenceMarkers: GrammarSentenceMarker[];
}

interface GrammarTypeMeta {
    normalizedType: string;
    translatedLabel: string;
    layer: GrammarLayer;
    displayPriority: number;
}

export interface GrammarHighlightPalette {
    textClassName: string;
    toneClassName: string;
    markerBase: string;
    markerShade: string;
    border: string;
}

function matchesAnyPattern(value: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(value));
}

function mergeSegmentTranslations(...parts: Array<string | undefined>) {
    const normalized = parts
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part));

    if (normalized.length === 0) {
        return undefined;
    }

    return normalized.reduce((merged, current) => {
        if (!merged) return current;
        if (merged.includes(current)) return merged;
        if (current.includes(merged)) return current;
        return `${merged}${current}`;
    }, "");
}

function findNextUnusedOccurrence(
    haystack: string,
    needle: string,
    startIndex: number,
    usedRanges: Set<string>,
) {
    if (!needle) return -1;

    let searchIndex = Math.max(0, startIndex);
    while (searchIndex <= haystack.length) {
        const foundIndex = haystack.indexOf(needle, searchIndex);
        if (foundIndex === -1) {
            return -1;
        }

        const rangeKey = `${foundIndex}:${foundIndex + needle.length}`;
        if (!usedRanges.has(rangeKey)) {
            return foundIndex;
        }

        searchIndex = foundIndex + 1;
    }

    return -1;
}

function normalizeGrammarTypeInput(value: string) {
    const raw = value.trim();
    if (!raw) return raw;
    const compact = raw.replace(/\s+/g, "").toLowerCase();

    if (
        compact.includes("宾语从句") ||
        compact.includes("主语从句") ||
        compact.includes("表语从句") ||
        compact.includes("同位语从句") ||
        compact.includes("nounclause")
    ) {
        return "名词性从句";
    }
    if (
        compact.includes("关系从句") ||
        compact.includes("关系子句") ||
        compact.includes("非限定性定语从句") ||
        compact.includes("relativeclause")
    ) {
        return "定语从句";
    }
    if (
        compact.includes("时间状语从句") ||
        compact.includes("条件状语从句") ||
        compact.includes("让步状语从句") ||
        compact.includes("原因状语从句")
    ) {
        return "状语从句";
    }
    if (compact.includes("absoluteconstruction") || compact.includes("独立主格")) {
        return "非谓语";
    }
    if (compact.includes("补足语") || compact.includes("宾补") || compact.includes("主补")) {
        return "补语";
    }
    if (compact.includes("pp") || compact.includes("prepphrase")) {
        return "介词短语";
    }
    if (compact.includes("插入语") || compact.includes("parenthetical")) {
        return "同位语";
    }
    return raw;
}

function classifyGrammarType(type: string): GrammarTypeMeta {
    const raw = normalizeGrammarTypeInput(type);
    const t = raw.toLowerCase();
    const englishToken = ` ${t.replace(/[_-]+/g, " ")} `;

    if (t.includes("main clause") || t.includes("主句")) {
        return { normalizedType: "主句", translatedLabel: "主句", layer: "structure", displayPriority: 20 };
    }
    if (t.includes("relative clause") || t.includes("定语从句")) {
        return { normalizedType: "定语从句", translatedLabel: "定语从句", layer: "structure", displayPriority: 26 };
    }
    if (t.includes("adverbial clause") || t.includes("状语从句")) {
        return { normalizedType: "状语从句", translatedLabel: "状语从句", layer: "structure", displayPriority: 27 };
    }
    if (t.includes("noun clause") || t.includes("名词性从句")) {
        return { normalizedType: "名词性从句", translatedLabel: "名词性从句", layer: "structure", displayPriority: 25 };
    }
    if (t.includes("participle") || t.includes("非谓语") || t.includes("分词")) {
        return { normalizedType: "非谓语", translatedLabel: "非谓语", layer: "structure", displayPriority: 24 };
    }
    if (t.includes("inversion") || t.includes("倒装")) {
        return { normalizedType: "倒装句", translatedLabel: "倒装句", layer: "structure", displayPriority: 23 };
    }
    if (t.includes("subjunctive") || t.includes("虚拟")) {
        return { normalizedType: "虚拟语气", translatedLabel: "虚拟语气", layer: "structure", displayPriority: 22 };
    }

    if (matchesAnyPattern(englishToken, [/\bsubject\b/, /\bsubject phrase\b/]) || raw.includes("主语")) {
        return { normalizedType: "主语", translatedLabel: "主语", layer: "core", displayPriority: 100 };
    }
    if (
        matchesAnyPattern(englishToken, [
            /\bpredicate\b/,
            /\bverb phrase\b/,
            /\bmodal verb\b/,
            /\bmodal verb phrase\b/,
            /\bauxiliary verb\b/,
            /\bauxiliary\b/,
            /\bverb\b/,
        ]) ||
        raw.includes("谓语") ||
        raw.includes("动词短语") ||
        raw.includes("情态动词")
    ) {
        return { normalizedType: "谓语", translatedLabel: "谓语", layer: "core", displayPriority: 99 };
    }
    if (matchesAnyPattern(englishToken, [/\bobject\b/, /\bobject phrase\b/]) || raw.includes("宾语")) {
        return { normalizedType: "宾语", translatedLabel: "宾语", layer: "core", displayPriority: 98 };
    }
    if (matchesAnyPattern(englishToken, [/\bcomplement\b/, /\bsubject complement\b/, /\bpredicative\b/]) || raw.includes("表语") || raw.includes("补语")) {
        return {
            normalizedType: raw.includes("表语") || englishToken.includes(" predicative ") ? "表语" : "补语",
            translatedLabel: raw.includes("表语") || englishToken.includes(" predicative ") ? "表语" : "补语",
            layer: raw.includes("表语") || englishToken.includes(" predicative ") ? "core" : "modifier",
            displayPriority: raw.includes("表语") || englishToken.includes(" predicative ") ? 97 : 64,
        };
    }

    if (matchesAnyPattern(englishToken, [/\badjective\b/, /\battributive\b/, /\battribute\b/]) || raw.includes("定语")) {
        return { normalizedType: "定语", translatedLabel: "定语", layer: "modifier", displayPriority: 62 };
    }
    if (matchesAnyPattern(englishToken, [/\badverb\b/, /\badverbial\b/, /\btime adverbial\b/, /\bplace adverbial\b/]) || raw.includes("状语")) {
        return { normalizedType: "状语", translatedLabel: "状语", layer: "modifier", displayPriority: 61 };
    }
    if (matchesAnyPattern(englishToken, [/\bappositive\b/]) || raw.includes("同位语")) {
        return { normalizedType: "同位语", translatedLabel: "同位语", layer: "modifier", displayPriority: 60 };
    }
    if (matchesAnyPattern(englishToken, [/\bpreposition\b/, /\bprepositional phrase\b/]) || raw.includes("介词")) {
        return { normalizedType: "介词短语", translatedLabel: "介词短语", layer: "modifier", displayPriority: 59 };
    }

    return {
        normalizedType: raw || "语法结构",
        translatedLabel: raw || "语法结构",
        layer: "modifier",
        displayPriority: 40,
    };
}

function toRangeKey(range: { start: number; end: number }) {
    return `${range.start}:${range.end}`;
}

function canMergeRanges(left: GrammarHighlightRange, right: GrammarHighlightRange, text: string) {
    if (left.layer !== right.layer) return false;
    if (left.normalizedType !== right.normalizedType) return false;
    if (left.explanation !== right.explanation) return false;
    if (left.end > right.start) return false;

    const gap = text.slice(left.end, right.start);
    return /^[\s-–—/]*$/.test(gap);
}

function mergeAdjacentRanges(text: string, ranges: GrammarHighlightRange[]): GrammarHighlightRange[] {
    if (ranges.length <= 1) return ranges;

    const sorted = [...ranges].sort((left, right) => {
        if (left.start !== right.start) return left.start - right.start;
        if (left.displayPriority !== right.displayPriority) {
            return right.displayPriority - left.displayPriority;
        }
        return (right.end - right.start) - (left.end - left.start);
    });

    const merged: GrammarHighlightRange[] = [];

    sorted.forEach((range) => {
        const previous = merged[merged.length - 1];
        if (!previous || !canMergeRanges(previous, range, text)) {
            merged.push(range);
            return;
        }

        merged[merged.length - 1] = {
            ...previous,
            end: range.end,
            segmentTranslation: mergeSegmentTranslations(previous.segmentTranslation, range.segmentTranslation),
            alternatives: [
                ...(previous.alternatives ?? []),
                ...(range.alternatives ?? []),
            ],
        };
    });

    return merged;
}

function toAlternative(range: GrammarHighlightRange | GrammarHighlightAlternative): GrammarHighlightAlternative {
    return {
        rawType: range.rawType,
        normalizedType: range.normalizedType,
        translatedLabel: range.translatedLabel,
        layer: range.layer,
        explanation: range.explanation,
        segmentTranslation: range.segmentTranslation,
        displayPriority: range.displayPriority,
    };
}

function dedupeAlternatives(alternatives: GrammarHighlightAlternative[]) {
    const seen = new Set<string>();
    const output: GrammarHighlightAlternative[] = [];
    alternatives.forEach((item) => {
        const key = `${item.normalizedType}|${item.explanation}|${item.segmentTranslation ?? ""}|${item.layer}`;
        if (seen.has(key)) return;
        seen.add(key);
        output.push(item);
    });
    return output;
}

function createSegments(
    text: string,
    ranges: GrammarHighlightRange[],
    splitPoints: readonly number[] = [],
): GrammarTextSegment[] {
    if (ranges.length === 0) {
        return [{
            start: 0,
            end: text.length,
            text,
            highlight: null,
        }];
    }

    const points = new Set<number>([0, text.length]);
    splitPoints.forEach((point) => {
        if (point > 0 && point < text.length) {
            points.add(point);
        }
    });
    ranges.forEach((range) => {
        points.add(range.start);
        points.add(range.end);
    });

    const sortedPoints = Array.from(points).sort((left, right) => left - right);
    const segments: GrammarTextSegment[] = [];

    for (let index = 0; index < sortedPoints.length - 1; index += 1) {
        const start = sortedPoints[index];
        const end = sortedPoints[index + 1];
        if (end <= start) continue;

        const segmentText = text.slice(start, end);
        if (!segmentText) continue;

        const coveringRanges = ranges
            .filter((range) => range.start <= start && range.end >= end)
            .sort((left, right) => {
                if (left.displayPriority !== right.displayPriority) {
                    return right.displayPriority - left.displayPriority;
                }
                return (left.end - left.start) - (right.end - right.start);
            });

        const primary = coveringRanges[0] ?? null;
        const highlight = primary
            ? (() => {
                const overlaps = dedupeAlternatives([
                    ...(primary.alternatives ?? []),
                    ...coveringRanges.slice(1).map((item) => toAlternative(item)),
                ]);
                return {
                    ...primary,
                    alternatives: overlaps.length > 0 ? overlaps : undefined,
                    overlapCount: overlaps.length,
                } satisfies GrammarHighlightRange;
            })()
            : null;

        segments.push({
            start,
            end,
            text: segmentText,
            highlight,
        });
    }

    return segments;
}

export function locateGrammarSentenceMarkers(
    text: string,
    sentences: readonly GrammarSentenceAnalysis[],
): GrammarSentenceMarker[] {
    const markers: GrammarSentenceMarker[] = [];
    let cursor = 0;

    sentences.forEach((sentence) => {
        const exactSentence = sentence?.sentence?.trim();
        if (!exactSentence) return;

        let start = text.indexOf(exactSentence, cursor);
        if (start === -1) {
            start = text.indexOf(exactSentence);
        }
        if (start === -1) return;

        markers.push({
            start,
            translation: sentence.translation,
        });
        cursor = start + exactSentence.length;
    });

    return markers;
}

export function buildGrammarHighlightRanges(
    text: string,
    sentences: readonly GrammarSentenceAnalysis[],
): GrammarHighlightRange[] {
    const rawRanges: GrammarHighlightRange[] = [];
    const markers = locateGrammarSentenceMarkers(text, sentences);

    sentences.forEach((sentence, sentenceIndex) => {
        const sentenceText = sentence?.sentence;
        const sentenceStart = markers[sentenceIndex]?.start;
        if (!sentenceText || sentenceStart === undefined) return;

        const highlights = Array.isArray(sentence.highlights) ? sentence.highlights : [];
        const usedRelativeRanges = new Set<string>();
        let localCursor = 0;

        highlights.forEach((highlight) => {
            if (!highlight?.substring?.trim() || !highlight.type?.trim() || !highlight.explanation?.trim()) {
                return;
            }

            let relativeStart = findNextUnusedOccurrence(
                sentenceText,
                highlight.substring,
                localCursor,
                usedRelativeRanges,
            );

            if (relativeStart === -1) {
                relativeStart = findNextUnusedOccurrence(
                    sentenceText,
                    highlight.substring,
                    0,
                    usedRelativeRanges,
                );
            }

            if (relativeStart === -1) return;

            const relativeEnd = relativeStart + highlight.substring.length;
            usedRelativeRanges.add(`${relativeStart}:${relativeEnd}`);
            localCursor = relativeEnd;

            const typeMeta = classifyGrammarType(highlight.type);
            rawRanges.push({
                start: sentenceStart + relativeStart,
                end: sentenceStart + relativeEnd,
                sentenceStart,
                sentenceIndex,
                type: typeMeta.translatedLabel,
                rawType: highlight.type,
                normalizedType: typeMeta.normalizedType,
                translatedLabel: typeMeta.translatedLabel,
                explanation: highlight.explanation,
                segmentTranslation: highlight.segment_translation?.trim() || undefined,
                sentenceText,
                sentenceTranslation: sentence.translation?.trim() || undefined,
                layer: typeMeta.layer,
                displayPriority: typeMeta.displayPriority,
            });
        });
    });

    const groupedByRange = new Map<string, GrammarHighlightRange[]>();
    rawRanges.forEach((range) => {
        const key = toRangeKey(range);
        const bucket = groupedByRange.get(key);
        if (bucket) {
            const duplicate = bucket.find((item) =>
                item.normalizedType === range.normalizedType &&
                item.explanation === range.explanation &&
                item.segmentTranslation === range.segmentTranslation,
            );
            if (!duplicate) {
                bucket.push(range);
            }
            return;
        }
        groupedByRange.set(key, [range]);
    });

    const normalizedRanges = Array.from(groupedByRange.values())
        .map((ranges) => {
            const [primary, ...rest] = ranges.sort((left, right) => {
                if (left.displayPriority !== right.displayPriority) {
                    return right.displayPriority - left.displayPriority;
                }
                return (right.end - right.start) - (left.end - left.start);
            });
            if (!primary) {
                throw new Error("Expected at least one highlight per range group");
            }
            return {
                ...primary,
                alternatives: rest.map((item) => ({
                    rawType: item.rawType,
                    normalizedType: item.normalizedType,
                    translatedLabel: item.translatedLabel,
                    layer: item.layer,
                    explanation: item.explanation,
                    segmentTranslation: item.segmentTranslation,
                    displayPriority: item.displayPriority,
                })),
            };
        })
        .sort((left, right) => {
            if (left.start !== right.start) return left.start - right.start;
            if (left.displayPriority !== right.displayPriority) {
                return right.displayPriority - left.displayPriority;
            }
            return (right.end - right.start) - (left.end - left.start);
        });

    return mergeAdjacentRanges(text, normalizedRanges);
}

export function buildGrammarViewModel(
    text: string,
    sentences: readonly GrammarSentenceAnalysis[],
): GrammarViewModel {
    const fullRanges = buildGrammarHighlightRanges(text, sentences);
    const coreRanges = fullRanges.filter((range) => range.layer === "core" || range.layer === "structure");
    const sentenceMarkers = locateGrammarSentenceMarkers(text, sentences);
    const sentenceStarts = sentenceMarkers.map((item) => item.start);

    return {
        core: createSegments(text, coreRanges, sentenceStarts),
        full: createSegments(text, fullRanges, sentenceStarts),
        sentenceMarkers,
    };
}

export function buildGrammarHighlightSegments(
    text: string,
    sentences: readonly GrammarSentenceAnalysis[],
    displayMode: GrammarDisplayMode = "full",
): GrammarTextSegment[] {
    const model = buildGrammarViewModel(text, sentences);
    return displayMode === "core" ? model.core : model.full;
}

function getPaletteByMeta(meta: GrammarTypeMeta): GrammarHighlightPalette {
    if (meta.normalizedType === "主语") {
        return {
            textClassName: "text-indigo-950",
            toneClassName: "text-indigo-700",
            markerBase: "rgba(180, 193, 255, 0.56)",
            markerShade: "rgba(129, 145, 238, 0.3)",
            border: "rgba(74, 87, 168, 0.2)",
        };
    }
    if (meta.normalizedType === "谓语") {
        return {
            textClassName: "text-emerald-950",
            toneClassName: "text-emerald-700",
            markerBase: "rgba(151, 219, 190, 0.56)",
            markerShade: "rgba(86, 179, 140, 0.28)",
            border: "rgba(39, 94, 66, 0.2)",
        };
    }
    if (meta.normalizedType === "宾语" || meta.normalizedType === "表语") {
        return {
            textClassName: "text-sky-950",
            toneClassName: "text-sky-700",
            markerBase: "rgba(171, 213, 244, 0.54)",
            markerShade: "rgba(113, 182, 233, 0.28)",
            border: "rgba(54, 104, 148, 0.18)",
        };
    }
    if (meta.layer === "structure") {
        return {
            textClassName: "text-slate-900",
            toneClassName: "text-slate-700",
            markerBase: "rgba(196, 206, 218, 0.5)",
            markerShade: "rgba(153, 169, 187, 0.24)",
            border: "rgba(84, 102, 124, 0.18)",
        };
    }
    if (meta.normalizedType === "状语") {
        return {
            textClassName: "text-amber-950",
            toneClassName: "text-amber-700",
            markerBase: "rgba(244, 217, 156, 0.5)",
            markerShade: "rgba(224, 175, 73, 0.24)",
            border: "rgba(143, 104, 30, 0.16)",
        };
    }
    if (meta.normalizedType === "介词短语" || meta.normalizedType === "定语") {
        return {
            textClassName: "text-cyan-950",
            toneClassName: "text-cyan-700",
            markerBase: "rgba(185, 225, 223, 0.44)",
            markerShade: "rgba(119, 189, 185, 0.2)",
            border: "rgba(54, 118, 114, 0.14)",
        };
    }
    if (meta.normalizedType === "补语" || meta.normalizedType === "同位语") {
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
        markerBase: meta.layer === "modifier" ? "rgba(229, 220, 206, 0.34)" : "rgba(206, 216, 227, 0.42)",
        markerShade: meta.layer === "modifier" ? "rgba(208, 187, 154, 0.18)" : "rgba(149, 168, 191, 0.22)",
        border: "rgba(87, 83, 78, 0.14)",
    };
}

export function getGrammarHighlightPalette(type: string): GrammarHighlightPalette {
    return getPaletteByMeta(classifyGrammarType(type));
}

export function getGrammarHighlightPaletteByMeta(params: { normalizedType: string; layer: GrammarLayer }): GrammarHighlightPalette {
    const inferred = classifyGrammarType(params.normalizedType);
    return getPaletteByMeta({
        ...inferred,
        normalizedType: params.normalizedType,
        translatedLabel: inferred.translatedLabel || params.normalizedType,
        layer: params.layer,
    });
}

export function getGrammarLegendPresets() {
    return [
        { label: "主语", palette: getGrammarHighlightPalette("主语") },
        { label: "谓语", palette: getGrammarHighlightPalette("谓语") },
        { label: "宾语", palette: getGrammarHighlightPalette("宾语") },
        { label: "状语", palette: getGrammarHighlightPalette("状语") },
        { label: "定语", palette: getGrammarHighlightPalette("定语") },
        { label: "从句/结构", palette: getGrammarHighlightPalette("名词性从句") },
    ];
}

export function getGrammarHighlightColor(type: string): string {
    return getGrammarHighlightPalette(type).textClassName;
}

export function translateGrammarType(type: string): string {
    return classifyGrammarType(type).translatedLabel;
}
