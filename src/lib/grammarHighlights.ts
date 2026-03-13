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
    highlights?: GrammarHighlightInput[];
}

export interface GrammarSentenceMarker {
    start: number;
    translation?: string;
}

export interface GrammarHighlightRange {
    start: number;
    end: number;
    type: string;
    rawType: string;
    normalizedType: string;
    translatedLabel: string;
    explanation: string;
    segmentTranslation?: string;
    layer: GrammarLayer;
    displayPriority: number;
    alternatives?: Array<{
        rawType: string;
        normalizedType: string;
        translatedLabel: string;
        layer: GrammarLayer;
        explanation: string;
        segmentTranslation?: string;
        displayPriority: number;
    }>;
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

function classifyGrammarType(type: string): GrammarTypeMeta {
    const t = type.trim().toLowerCase();

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

    if (t.includes("subject") || t.includes("主语")) {
        return { normalizedType: "主语", translatedLabel: "主语", layer: "core", displayPriority: 100 };
    }
    if (t.includes("predicate") || t.includes("verb") || t.includes("谓语") || t.includes("动词")) {
        return { normalizedType: "谓语", translatedLabel: "谓语", layer: "core", displayPriority: 99 };
    }
    if (t.includes("object") || t.includes("宾语")) {
        return { normalizedType: "宾语", translatedLabel: "宾语", layer: "core", displayPriority: 98 };
    }
    if (t.includes("complement") || t.includes("表语") || t.includes("补语")) {
        return { normalizedType: t.includes("表语") ? "表语" : "补语", translatedLabel: t.includes("表语") ? "表语" : "补语", layer: t.includes("表语") ? "core" : "modifier", displayPriority: t.includes("表语") ? 97 : 64 };
    }

    if (t.includes("adjective") || t.includes("attributive") || t.includes("定语")) {
        return { normalizedType: "定语", translatedLabel: "定语", layer: "modifier", displayPriority: 62 };
    }
    if (t.includes("adverb") || t.includes("状语")) {
        return { normalizedType: "状语", translatedLabel: "状语", layer: "modifier", displayPriority: 61 };
    }
    if (t.includes("appositive") || t.includes("同位语")) {
        return { normalizedType: "同位语", translatedLabel: "同位语", layer: "modifier", displayPriority: 60 };
    }
    if (t.includes("preposition") || t.includes("介词")) {
        return { normalizedType: "介词短语", translatedLabel: "介词短语", layer: "modifier", displayPriority: 59 };
    }

    return {
        normalizedType: type.trim() || "语法结构",
        translatedLabel: type.trim() || "语法结构",
        layer: "modifier",
        displayPriority: 40,
    };
}

function toRangeKey(range: { start: number; end: number }) {
    return `${range.start}:${range.end}`;
}

function createSegments(text: string, ranges: GrammarHighlightRange[]): GrammarTextSegment[] {
    if (ranges.length === 0) {
        return [{
            start: 0,
            end: text.length,
            text,
            highlight: null,
        }];
    }

    const points = new Set<number>([0, text.length]);
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

        const highlight = ranges
            .filter((range) => range.start <= start && range.end >= end)
            .sort((left, right) => {
                if (left.displayPriority !== right.displayPriority) {
                    return right.displayPriority - left.displayPriority;
                }
                return (left.end - left.start) - (right.end - right.start);
            })[0] ?? null;

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
    sentences: GrammarSentenceAnalysis[],
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
    sentences: GrammarSentenceAnalysis[],
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
                type: typeMeta.translatedLabel,
                rawType: highlight.type,
                normalizedType: typeMeta.normalizedType,
                translatedLabel: typeMeta.translatedLabel,
                explanation: highlight.explanation,
                segmentTranslation: highlight.segment_translation?.trim() || undefined,
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

    return Array.from(groupedByRange.values())
        .map((ranges) => {
            const [primary, ...rest] = ranges.sort((left, right) => {
                if (left.displayPriority !== right.displayPriority) {
                    return right.displayPriority - left.displayPriority;
                }
                return (left.end - left.start) - (right.end - right.start);
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
            return (left.end - left.start) - (right.end - right.start);
        });
}

export function buildGrammarViewModel(
    text: string,
    sentences: GrammarSentenceAnalysis[],
): GrammarViewModel {
    const fullRanges = buildGrammarHighlightRanges(text, sentences);
    const coreRanges = fullRanges.filter((range) => range.layer === "core" || range.layer === "structure");

    return {
        core: createSegments(text, coreRanges),
        full: createSegments(text, fullRanges),
        sentenceMarkers: locateGrammarSentenceMarkers(text, sentences),
    };
}

export function buildGrammarHighlightSegments(
    text: string,
    sentences: GrammarSentenceAnalysis[],
    displayMode: GrammarDisplayMode = "full",
): GrammarTextSegment[] {
    const model = buildGrammarViewModel(text, sentences);
    return displayMode === "core" ? model.core : model.full;
}

export function getGrammarHighlightColor(type: string): string {
    const meta = classifyGrammarType(type);
    const t = meta.normalizedType.toLowerCase();

    if (t.includes("主句")) {
        return "border-b-2 border-indigo-400/60 text-indigo-700 hover:bg-indigo-50/30 pb-0.5";
    }
    if (t.includes("主语")) {
        return "border-b border-blue-400/40 text-blue-700 hover:bg-blue-50/30 pb-0.5";
    }
    if (t.includes("谓语")) {
        return "border-b border-emerald-400/40 text-emerald-700 hover:bg-emerald-50/30 pb-0.5";
    }
    if (t.includes("宾语") || t.includes("表语")) {
        return "border-b border-rose-400/40 text-rose-700 hover:bg-rose-50/30 pb-0.5";
    }
    if (t.includes("定语")) {
        return "border-b border-dashed border-sky-400/40 text-sky-700 hover:bg-sky-50/30 pb-0.5";
    }
    if (t.includes("状语")) {
        return "border-b border-dashed border-amber-400/40 text-amber-700 hover:bg-amber-50/30 pb-0.5";
    }
    if (t.includes("补语")) {
        return "border-b border-dashed border-violet-400/40 text-violet-700 hover:bg-violet-50/30 pb-0.5";
    }
    if (t.includes("同位语")) {
        return "border-b border-dotted border-orange-400/40 text-orange-700 hover:bg-orange-50/30 pb-0.5";
    }
    if (t.includes("介词")) {
        return "border-b border-stone-200 text-stone-600 hover:bg-stone-50/50 pb-0.5";
    }
    if (t.includes("从句") || t.includes("非谓语") || t.includes("倒装") || t.includes("虚拟")) {
        return "border-l-2 border-stone-200/60 pl-1 text-stone-600 hover:bg-stone-50/30";
    }

    return "text-stone-600";
}

export function translateGrammarType(type: string): string {
    return classifyGrammarType(type).translatedLabel;
}
