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
    const compact = raw.replace(/[\s()（）_-]+/g, "").toLowerCase();

    if (compact.includes("并列主句") || compact.includes("coordinateclause")) {
        return "并列主句";
    }
    if (compact.includes("并列句") || compact.includes("coordinatesentence")) {
        return "并列句";
    }
    if (compact.includes("主句") || compact.includes("mainclause")) {
        return "主句";
    }
    if (compact.includes("主语从句") || compact.includes("subjectclause")) {
        return "主语从句";
    }
    if (compact.includes("宾语从句") || compact.includes("objectclause")) {
        return "宾语从句";
    }
    if (compact.includes("表语从句") || compact.includes("predicativeclause")) {
        return "表语从句";
    }
    if (compact.includes("同位语从句") || compact.includes("appositiveclause")) {
        return "同位语从句";
    }
    if (
        compact.includes("nounclause")
    ) {
        return "名词性从句";
    }
    if (
        compact.includes("非限制性定语从句") ||
        compact.includes("关系从句") ||
        compact.includes("关系子句") ||
        compact.includes("非限定性定语从句") ||
        compact.includes("nonrestrictiverelativeclause") ||
        compact.includes("nondefiningrelativeclause")
    ) {
        return "非限制性定语从句";
    }
    if (
        compact.includes("限制性定语从句") ||
        compact.includes("restrictiverelativeclause") ||
        compact.includes("definingrelativeclause")
    ) {
        return "限制性定语从句";
    }
    if (
        compact.includes("relativeclause")
    ) {
        return "定语从句";
    }
    if (compact.includes("时间状语从句") || compact.includes("timeadverbialclause")) return "时间状语从句";
    if (compact.includes("地点状语从句") || compact.includes("placeadverbialclause")) return "地点状语从句";
    if (compact.includes("原因状语从句") || compact.includes("reasonadverbialclause") || compact.includes("causeadverbialclause")) return "原因状语从句";
    if (compact.includes("目的状语从句") || compact.includes("purposeadverbialclause")) return "目的状语从句";
    if (compact.includes("条件状语从句") || compact.includes("conditionadverbialclause")) return "条件状语从句";
    if (compact.includes("让步状语从句") || compact.includes("concessionadverbialclause")) return "让步状语从句";
    if (compact.includes("结果状语从句") || compact.includes("resultadverbialclause")) return "结果状语从句";
    if (compact.includes("方式状语从句") || compact.includes("manneradverbialclause")) return "方式状语从句";
    if (compact.includes("比较状语从句") || compact.includes("comparisonadverbialclause")) return "比较状语从句";
    if (compact.includes("状语从句") || compact.includes("adverbialclause")) return "状语从句";
    if (compact.includes("前置定语") || compact.includes("prepositiveattributive")) return "前置定语";
    if (compact.includes("后置定语") || compact.includes("postpositiveattributive")) return "后置定语";
    if (compact.includes("时间状语") || compact.includes("timeadverbial")) return "时间状语";
    if (compact.includes("地点状语") || compact.includes("placeadverbial")) return "地点状语";
    if (compact.includes("原因状语") || compact.includes("reasonadverbial") || compact.includes("causeadverbial")) return "原因状语";
    if (compact.includes("目的状语") || compact.includes("purposeadverbial")) return "目的状语";
    if (compact.includes("条件状语") || compact.includes("conditionadverbial")) return "条件状语";
    if (compact.includes("让步状语") || compact.includes("concessionadverbial")) return "让步状语";
    if (compact.includes("结果状语") || compact.includes("resultadverbial")) return "结果状语";
    if (compact.includes("方式状语") || compact.includes("manneradverbial")) return "方式状语";
    if (compact.includes("程度状语") || compact.includes("degreeadverbial")) return "程度状语";
    if (compact.includes("伴随状语") || compact.includes("accompanyingadverbial") || compact.includes("accompanimentadverbial")) return "伴随状语";
    if (compact.includes("absoluteconstruction") || compact.includes("独立主格")) {
        return "非谓语";
    }
    if (compact.includes("补足语") || compact.includes("宾补") || compact.includes("主补")) {
        return "补语";
    }
    if (compact.includes("分词短语") || compact.includes("participlephrase")) return "分词短语";
    if (compact.includes("不定式短语") || compact.includes("infinitivephrase")) return "不定式短语";
    if (compact.includes("动名词短语") || compact.includes("gerundphrase")) return "动名词短语";
    if (compact.includes("介词短语") || compact.includes("prepositionalphrase") || compact.includes("prepphrase")) {
        return "介词短语";
    }
    if (compact.includes("插入语") || compact.includes("parenthetical")) {
        return "插入语";
    }
    if (compact.includes("强调句") || compact.includes("cleft") || compact.includes("emphatic")) return "强调句";
    return raw;
}

function classifyGrammarType(type: string): GrammarTypeMeta {
    const raw = normalizeGrammarTypeInput(type);
    const t = raw.toLowerCase();
    const englishToken = ` ${t.replace(/[_-]+/g, " ")} `;

    if (t.includes("并列句") || t.includes("并列主句") || t.includes("coordinate clause") || t.includes("coordinate sentence")) {
        return { normalizedType: raw.includes("主句") ? "并列主句" : "并列句", translatedLabel: raw.includes("主句") ? "并列主句" : "并列句", layer: "structure", displayPriority: 21 };
    }
    if (t.includes("main clause") || t.includes("主句")) {
        return { normalizedType: "主句", translatedLabel: "主句", layer: "structure", displayPriority: 20 };
    }
    if (raw.includes("非限制性定语从句") || raw.includes("限制性定语从句")) {
        return { normalizedType: raw, translatedLabel: raw, layer: "structure", displayPriority: 26 };
    }
    if (t.includes("relative clause") || t.includes("定语从句")) {
        return { normalizedType: raw.includes("定语从句") ? raw : "定语从句", translatedLabel: raw.includes("定语从句") ? raw : "定语从句", layer: "structure", displayPriority: 26 };
    }
    if (raw.includes("时间状语从句") || raw.includes("地点状语从句") || raw.includes("原因状语从句") || raw.includes("目的状语从句") || raw.includes("条件状语从句") || raw.includes("让步状语从句") || raw.includes("结果状语从句") || raw.includes("方式状语从句") || raw.includes("比较状语从句")) {
        return { normalizedType: raw, translatedLabel: raw, layer: "structure", displayPriority: 27 };
    }
    if (t.includes("adverbial clause") || raw.includes("状语从句")) {
        return { normalizedType: raw.includes("状语从句") ? raw : "状语从句", translatedLabel: raw.includes("状语从句") ? raw : "状语从句", layer: "structure", displayPriority: 27 };
    }
    if (raw.includes("主语从句") || raw.includes("宾语从句") || raw.includes("表语从句") || raw.includes("同位语从句")) {
        return { normalizedType: raw, translatedLabel: raw, layer: "structure", displayPriority: 25 };
    }
    if (t.includes("noun clause") || t.includes("名词性从句")) {
        return { normalizedType: "名词性从句", translatedLabel: "名词性从句", layer: "structure", displayPriority: 25 };
    }
    if (raw.includes("分词短语") || raw.includes("不定式短语") || raw.includes("动名词短语")) {
        return { normalizedType: raw, translatedLabel: raw, layer: "structure", displayPriority: 24 };
    }
    if (t.includes("participle") || t.includes("infinitive") || t.includes("gerund") || t.includes("非谓语") || t.includes("分词")) {
        return { normalizedType: raw.includes("非谓语") ? "非谓语" : raw, translatedLabel: raw.includes("非谓语") ? "非谓语" : raw, layer: "structure", displayPriority: 24 };
    }
    if (t.includes("inversion") || t.includes("倒装")) {
        return { normalizedType: "倒装句", translatedLabel: "倒装句", layer: "structure", displayPriority: 23 };
    }
    if (t.includes("subjunctive") || t.includes("虚拟")) {
        return { normalizedType: "虚拟语气", translatedLabel: "虚拟语气", layer: "structure", displayPriority: 22 };
    }
    if (t.includes("cleft") || t.includes("emphatic") || raw.includes("强调句")) {
        return { normalizedType: "强调句", translatedLabel: "强调句", layer: "structure", displayPriority: 22 };
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
        return {
            normalizedType: raw.includes("定语") ? raw : "定语",
            translatedLabel: raw.includes("定语") ? raw : "定语",
            layer: "modifier",
            displayPriority: 62,
        };
    }
    if (matchesAnyPattern(englishToken, [/\badverb\b/, /\badverbial\b/, /\btime adverbial\b/, /\bplace adverbial\b/]) || raw.includes("状语")) {
        return {
            normalizedType: raw.includes("状语") ? raw : "状语",
            translatedLabel: raw.includes("状语") ? raw : "状语",
            layer: "modifier",
            displayPriority: 61,
        };
    }
    if (matchesAnyPattern(englishToken, [/\bappositive\b/]) || raw.includes("同位语")) {
        return { normalizedType: "同位语", translatedLabel: "同位语", layer: "modifier", displayPriority: 60 };
    }
    if (matchesAnyPattern(englishToken, [/\bparenthetical\b/]) || raw.includes("插入语")) {
        return { normalizedType: "插入语", translatedLabel: "插入语", layer: "modifier", displayPriority: 60 };
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

function grammarPalette(
    textClassName: string,
    toneClassName: string,
    markerBase: string,
    markerShade: string,
    border: string,
): GrammarHighlightPalette {
    return {
        textClassName,
        toneClassName,
        markerBase,
        markerShade,
        border,
    };
}

const PALETTES = {
    subject: grammarPalette("text-indigo-950", "text-indigo-700", "rgba(180, 193, 255, 0.56)", "rgba(129, 145, 238, 0.3)", "rgba(74, 87, 168, 0.2)"),
    predicate: grammarPalette("text-emerald-950", "text-emerald-700", "rgba(151, 219, 190, 0.56)", "rgba(86, 179, 140, 0.28)", "rgba(39, 94, 66, 0.2)"),
    object: grammarPalette("text-sky-950", "text-sky-700", "rgba(171, 213, 244, 0.54)", "rgba(113, 182, 233, 0.28)", "rgba(54, 104, 148, 0.18)"),
    predicative: grammarPalette("text-violet-950", "text-violet-700", "rgba(205, 190, 247, 0.5)", "rgba(158, 132, 226, 0.24)", "rgba(91, 70, 150, 0.16)"),
    complement: grammarPalette("text-rose-950", "text-rose-700", "rgba(246, 204, 196, 0.4)", "rgba(227, 149, 129, 0.18)", "rgba(145, 85, 74, 0.12)"),
    appositive: grammarPalette("text-fuchsia-950", "text-fuchsia-700", "rgba(239, 198, 232, 0.42)", "rgba(214, 133, 199, 0.2)", "rgba(143, 66, 128, 0.14)"),
    parenthetical: grammarPalette("text-stone-950", "text-stone-700", "rgba(224, 214, 199, 0.44)", "rgba(190, 172, 146, 0.22)", "rgba(104, 91, 71, 0.14)"),
    adverbial: grammarPalette("text-amber-950", "text-amber-700", "rgba(244, 217, 156, 0.5)", "rgba(224, 175, 73, 0.24)", "rgba(143, 104, 30, 0.16)"),
    timeAdverbial: grammarPalette("text-amber-950", "text-amber-700", "rgba(245, 214, 145, 0.52)", "rgba(224, 170, 56, 0.24)", "rgba(148, 100, 18, 0.16)"),
    placeAdverbial: grammarPalette("text-lime-950", "text-lime-700", "rgba(215, 233, 163, 0.48)", "rgba(169, 201, 91, 0.22)", "rgba(94, 122, 35, 0.15)"),
    reasonAdverbial: grammarPalette("text-red-950", "text-red-700", "rgba(246, 195, 188, 0.46)", "rgba(226, 129, 115, 0.2)", "rgba(150, 70, 59, 0.14)"),
    purposeAdverbial: grammarPalette("text-orange-950", "text-orange-700", "rgba(248, 206, 162, 0.48)", "rgba(230, 148, 67, 0.22)", "rgba(150, 84, 26, 0.14)"),
    conditionAdverbial: grammarPalette("text-teal-950", "text-teal-700", "rgba(178, 225, 215, 0.46)", "rgba(101, 186, 166, 0.22)", "rgba(42, 115, 101, 0.14)"),
    concessionAdverbial: grammarPalette("text-pink-950", "text-pink-700", "rgba(246, 198, 223, 0.44)", "rgba(224, 126, 178, 0.2)", "rgba(148, 61, 108, 0.14)"),
    resultAdverbial: grammarPalette("text-yellow-950", "text-yellow-700", "rgba(247, 227, 152, 0.46)", "rgba(222, 186, 57, 0.22)", "rgba(139, 111, 23, 0.14)"),
    mannerAdverbial: grammarPalette("text-cyan-950", "text-cyan-700", "rgba(182, 225, 235, 0.44)", "rgba(104, 186, 204, 0.2)", "rgba(49, 116, 135, 0.14)"),
    comparisonAdverbial: grammarPalette("text-purple-950", "text-purple-700", "rgba(220, 198, 246, 0.44)", "rgba(176, 123, 227, 0.2)", "rgba(107, 58, 154, 0.14)"),
    degreeAdverbial: grammarPalette("text-rose-950", "text-rose-700", "rgba(247, 206, 218, 0.42)", "rgba(228, 143, 168, 0.18)", "rgba(151, 74, 101, 0.13)"),
    accompanimentAdverbial: grammarPalette("text-teal-950", "text-teal-700", "rgba(187, 230, 223, 0.42)", "rgba(109, 191, 182, 0.18)", "rgba(54, 121, 114, 0.13)"),
    attributive: grammarPalette("text-cyan-950", "text-cyan-700", "rgba(185, 225, 223, 0.44)", "rgba(119, 189, 185, 0.2)", "rgba(54, 118, 114, 0.14)"),
    prepositiveAttributive: grammarPalette("text-teal-950", "text-teal-700", "rgba(177, 224, 214, 0.44)", "rgba(100, 183, 164, 0.2)", "rgba(42, 112, 98, 0.14)"),
    postpositiveAttributive: grammarPalette("text-sky-950", "text-sky-700", "rgba(183, 222, 244, 0.44)", "rgba(112, 182, 231, 0.2)", "rgba(53, 107, 149, 0.14)"),
    prepPhrase: grammarPalette("text-teal-950", "text-teal-700", "rgba(169, 220, 210, 0.46)", "rgba(93, 178, 162, 0.22)", "rgba(38, 110, 97, 0.16)"),
    mainClause: grammarPalette("text-slate-950", "text-slate-700", "rgba(196, 206, 218, 0.5)", "rgba(153, 169, 187, 0.24)", "rgba(84, 102, 124, 0.18)"),
    coordinateClause: grammarPalette("text-zinc-950", "text-zinc-700", "rgba(210, 206, 218, 0.48)", "rgba(168, 160, 184, 0.22)", "rgba(92, 84, 111, 0.16)"),
    subjectClause: grammarPalette("text-blue-950", "text-blue-700", "rgba(176, 204, 248, 0.46)", "rgba(111, 161, 234, 0.22)", "rgba(48, 91, 159, 0.16)"),
    objectClause: grammarPalette("text-sky-950", "text-sky-700", "rgba(176, 218, 247, 0.46)", "rgba(103, 185, 236, 0.22)", "rgba(45, 109, 160, 0.16)"),
    predicativeClause: grammarPalette("text-violet-950", "text-violet-700", "rgba(208, 191, 247, 0.46)", "rgba(161, 132, 228, 0.22)", "rgba(91, 70, 151, 0.16)"),
    appositiveClause: grammarPalette("text-fuchsia-950", "text-fuchsia-700", "rgba(238, 198, 233, 0.44)", "rgba(211, 131, 199, 0.2)", "rgba(142, 66, 127, 0.14)"),
    nounClause: grammarPalette("text-blue-950", "text-blue-700", "rgba(188, 206, 244, 0.44)", "rgba(123, 163, 224, 0.2)", "rgba(58, 92, 149, 0.14)"),
    relativeClause: grammarPalette("text-cyan-950", "text-cyan-700", "rgba(174, 220, 232, 0.48)", "rgba(96, 177, 198, 0.22)", "rgba(45, 112, 130, 0.16)"),
    restrictiveRelativeClause: grammarPalette("text-cyan-950", "text-cyan-700", "rgba(170, 220, 226, 0.46)", "rgba(81, 179, 185, 0.22)", "rgba(40, 116, 120, 0.15)"),
    nonRestrictiveRelativeClause: grammarPalette("text-teal-950", "text-teal-700", "rgba(168, 226, 218, 0.46)", "rgba(82, 186, 170, 0.22)", "rgba(34, 115, 102, 0.15)"),
    adverbialClause: grammarPalette("text-orange-950", "text-orange-700", "rgba(248, 209, 161, 0.5)", "rgba(230, 153, 74, 0.24)", "rgba(151, 86, 28, 0.16)"),
    timeAdverbialClause: grammarPalette("text-amber-950", "text-amber-700", "rgba(247, 215, 148, 0.5)", "rgba(223, 171, 58, 0.24)", "rgba(148, 100, 20, 0.16)"),
    placeAdverbialClause: grammarPalette("text-lime-950", "text-lime-700", "rgba(213, 233, 164, 0.48)", "rgba(165, 200, 86, 0.22)", "rgba(94, 122, 34, 0.15)"),
    reasonAdverbialClause: grammarPalette("text-red-950", "text-red-700", "rgba(247, 200, 192, 0.46)", "rgba(227, 131, 117, 0.2)", "rgba(151, 70, 60, 0.14)"),
    purposeAdverbialClause: grammarPalette("text-orange-950", "text-orange-700", "rgba(248, 206, 160, 0.46)", "rgba(230, 145, 64, 0.22)", "rgba(151, 83, 25, 0.14)"),
    conditionAdverbialClause: grammarPalette("text-teal-950", "text-teal-700", "rgba(177, 226, 216, 0.46)", "rgba(97, 187, 165, 0.22)", "rgba(41, 115, 100, 0.14)"),
    concessionAdverbialClause: grammarPalette("text-pink-950", "text-pink-700", "rgba(248, 198, 220, 0.44)", "rgba(224, 125, 177, 0.2)", "rgba(149, 61, 107, 0.14)"),
    resultAdverbialClause: grammarPalette("text-yellow-950", "text-yellow-700", "rgba(247, 226, 151, 0.48)", "rgba(222, 185, 58, 0.22)", "rgba(139, 110, 23, 0.16)"),
    mannerAdverbialClause: grammarPalette("text-cyan-950", "text-cyan-700", "rgba(182, 225, 235, 0.46)", "rgba(102, 184, 203, 0.22)", "rgba(49, 116, 135, 0.15)"),
    comparisonAdverbialClause: grammarPalette("text-purple-950", "text-purple-700", "rgba(220, 198, 246, 0.46)", "rgba(176, 122, 227, 0.22)", "rgba(107, 58, 154, 0.15)"),
    nonFinite: grammarPalette("text-lime-950", "text-lime-700", "rgba(207, 232, 155, 0.48)", "rgba(157, 197, 77, 0.22)", "rgba(87, 120, 31, 0.16)"),
    emphasis: grammarPalette("text-purple-950", "text-purple-700", "rgba(218, 196, 247, 0.46)", "rgba(174, 122, 228, 0.22)", "rgba(104, 58, 154, 0.16)"),
    fallbackStructure: grammarPalette("text-slate-900", "text-slate-700", "rgba(196, 206, 218, 0.5)", "rgba(153, 169, 187, 0.24)", "rgba(84, 102, 124, 0.18)"),
} as const;

function getPaletteByMeta(meta: GrammarTypeMeta): GrammarHighlightPalette {
    if (meta.normalizedType === "主语") {
        return PALETTES.subject;
    }
    if (meta.normalizedType === "谓语") {
        return PALETTES.predicate;
    }
    if (meta.normalizedType === "宾语") {
        return PALETTES.object;
    }
    if (meta.normalizedType === "表语") {
        return PALETTES.predicative;
    }
    if (meta.normalizedType === "补语") {
        return PALETTES.complement;
    }
    if (meta.normalizedType === "同位语") {
        return PALETTES.appositive;
    }
    if (meta.normalizedType === "插入语") {
        return PALETTES.parenthetical;
    }
    if (meta.normalizedType === "状语") {
        return PALETTES.adverbial;
    }
    if (meta.normalizedType === "时间状语") {
        return PALETTES.timeAdverbial;
    }
    if (meta.normalizedType === "地点状语") {
        return PALETTES.placeAdverbial;
    }
    if (meta.normalizedType === "原因状语") {
        return PALETTES.reasonAdverbial;
    }
    if (meta.normalizedType === "目的状语") {
        return PALETTES.purposeAdverbial;
    }
    if (meta.normalizedType === "条件状语") {
        return PALETTES.conditionAdverbial;
    }
    if (meta.normalizedType === "让步状语") {
        return PALETTES.concessionAdverbial;
    }
    if (meta.normalizedType === "结果状语") {
        return PALETTES.resultAdverbial;
    }
    if (meta.normalizedType === "方式状语") {
        return PALETTES.mannerAdverbial;
    }
    if (meta.normalizedType === "比较状语") {
        return PALETTES.comparisonAdverbial;
    }
    if (meta.normalizedType === "程度状语") {
        return PALETTES.degreeAdverbial;
    }
    if (meta.normalizedType === "伴随状语") {
        return PALETTES.accompanimentAdverbial;
    }
    if (meta.normalizedType === "定语") {
        return PALETTES.attributive;
    }
    if (meta.normalizedType === "前置定语") {
        return PALETTES.prepositiveAttributive;
    }
    if (meta.normalizedType === "后置定语") {
        return PALETTES.postpositiveAttributive;
    }
    if (meta.normalizedType === "介词短语") {
        return PALETTES.prepPhrase;
    }
    if (meta.normalizedType === "主句") {
        return PALETTES.mainClause;
    }
    if (meta.normalizedType === "并列句" || meta.normalizedType === "并列主句") {
        return PALETTES.coordinateClause;
    }
    if (meta.normalizedType === "主语从句") {
        return PALETTES.subjectClause;
    }
    if (meta.normalizedType === "宾语从句") {
        return PALETTES.objectClause;
    }
    if (meta.normalizedType === "表语从句") {
        return PALETTES.predicativeClause;
    }
    if (meta.normalizedType === "同位语从句") {
        return PALETTES.appositiveClause;
    }
    if (meta.normalizedType === "名词性从句") {
        return PALETTES.nounClause;
    }
    if (meta.normalizedType === "定语从句") {
        return PALETTES.relativeClause;
    }
    if (meta.normalizedType === "限制性定语从句") {
        return PALETTES.restrictiveRelativeClause;
    }
    if (meta.normalizedType === "非限制性定语从句") {
        return PALETTES.nonRestrictiveRelativeClause;
    }
    if (meta.normalizedType === "状语从句") {
        return PALETTES.adverbialClause;
    }
    if (meta.normalizedType === "时间状语从句") {
        return PALETTES.timeAdverbialClause;
    }
    if (meta.normalizedType === "地点状语从句") {
        return PALETTES.placeAdverbialClause;
    }
    if (meta.normalizedType === "原因状语从句") {
        return PALETTES.reasonAdverbialClause;
    }
    if (meta.normalizedType === "目的状语从句") {
        return PALETTES.purposeAdverbialClause;
    }
    if (meta.normalizedType === "条件状语从句") {
        return PALETTES.conditionAdverbialClause;
    }
    if (meta.normalizedType === "让步状语从句") {
        return PALETTES.concessionAdverbialClause;
    }
    if (meta.normalizedType === "结果状语从句") {
        return PALETTES.resultAdverbialClause;
    }
    if (meta.normalizedType === "方式状语从句") {
        return PALETTES.mannerAdverbialClause;
    }
    if (meta.normalizedType === "比较状语从句") {
        return PALETTES.comparisonAdverbialClause;
    }
    if (meta.normalizedType === "非谓语" || meta.normalizedType === "分词短语" || meta.normalizedType === "不定式短语" || meta.normalizedType === "动名词短语") {
        return PALETTES.nonFinite;
    }
    if (meta.normalizedType === "倒装句" || meta.normalizedType === "虚拟语气" || meta.normalizedType === "强调句") {
        return PALETTES.emphasis;
    }
    if (meta.layer === "structure") {
        return PALETTES.fallbackStructure;
    }

    return grammarPalette(
        "text-stone-900",
        "text-stone-700",
        meta.layer === "modifier" ? "rgba(229, 220, 206, 0.34)" : "rgba(206, 216, 227, 0.42)",
        meta.layer === "modifier" ? "rgba(208, 187, 154, 0.18)" : "rgba(149, 168, 191, 0.22)",
        "rgba(87, 83, 78, 0.14)",
    );
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
