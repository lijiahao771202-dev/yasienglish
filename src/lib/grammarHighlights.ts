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

export interface GrammarHighlightRange {
    start: number;
    end: number;
    type: string;
    explanation: string;
}

export interface GrammarTextSegment {
    start: number;
    end: number;
    text: string;
    highlight: GrammarHighlightRange | null;
}

export interface GrammarSentenceMarker {
    start: number;
    translation?: string;
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
    const ranges: GrammarHighlightRange[] = [];
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

            ranges.push({
                start: sentenceStart + relativeStart,
                end: sentenceStart + relativeEnd,
                type: highlight.type,
                explanation: highlight.explanation,
            });
        });
    });

    return ranges.sort((left, right) => {
        if (left.start !== right.start) return left.start - right.start;
        return (left.end - left.start) - (right.end - right.start);
    });
}

export function buildGrammarHighlightSegments(
    text: string,
    sentences: GrammarSentenceAnalysis[],
): GrammarTextSegment[] {
    const ranges = buildGrammarHighlightRanges(text, sentences);
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
            .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0] ?? null;

        segments.push({
            start,
            end,
            text: segmentText,
            highlight,
        });
    }

    return segments;
}

export function getGrammarHighlightColor(type: string): string {
    const t = type.toLowerCase();

    if (t.includes("main clause") || t.includes("主句")) {
        return "border-b-2 border-indigo-400/60 text-indigo-700 hover:bg-indigo-50/30 pb-0.5";
    }

    if (t.includes("subject") || t.includes("主语")) {
        return "border-b border-blue-400/40 text-blue-700 hover:bg-blue-50/30 pb-0.5";
    }

    if (t.includes("predicate") || t.includes("verb") || t.includes("谓语") || t.includes("动词")) {
        return "border-b border-emerald-400/40 text-emerald-700 hover:bg-emerald-50/30 pb-0.5";
    }

    if (t.includes("object") || t.includes("宾语") || t.includes("表语")) {
        return "border-b border-rose-400/40 text-rose-700 hover:bg-rose-50/30 pb-0.5";
    }

    if (t.includes("adjective") || t.includes("attributive") || t.includes("定语")) {
        return "border-b border-dashed border-sky-400/40 text-sky-700 hover:bg-sky-50/30 pb-0.5";
    }

    if (t.includes("adverb") || t.includes("状语")) {
        return "border-b border-dashed border-amber-400/40 text-amber-700 hover:bg-amber-50/30 pb-0.5";
    }

    if (t.includes("complement") || t.includes("补语")) {
        return "border-b border-dashed border-violet-400/40 text-violet-700 hover:bg-violet-50/30 pb-0.5";
    }

    if (t.includes("appositive") || t.includes("同位语")) {
        return "border-b border-dotted border-orange-400/40 text-orange-700 hover:bg-orange-50/30 pb-0.5";
    }

    if (t.includes("preposition") || t.includes("介词")) {
        return "border-b border-stone-200 text-stone-600 hover:bg-stone-50/50 pb-0.5";
    }

    if (t.includes("clause") || t.includes("从句")) {
        return "border-l-2 border-stone-200/60 pl-1 text-stone-600 hover:bg-stone-50/30";
    }

    return "text-stone-600";
}

export function translateGrammarType(type: string): string {
    const t = type.toLowerCase();
    if (t.includes("relative clause")) return "定语从句";
    if (t.includes("adverbial clause")) return "状语从句";
    if (t.includes("noun clause")) return "名词性从句";
    if (t.includes("appositive")) return "同位语";
    if (t.includes("passive voice")) return "被动语态";
    if (t.includes("participle")) return "分词结构";
    if (t.includes("inversion")) return "倒装句";
    if (t.includes("subjunctive")) return "虚拟语气";
    if (t.includes("predicate")) return "谓语";
    if (t.includes("subject")) return "主语";
    if (t.includes("object")) return "宾语";
    if (t.includes("adverb")) return "状语";
    if (t.includes("adjective")) return "形容词/定语";
    return type;
}
