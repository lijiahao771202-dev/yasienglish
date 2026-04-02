export interface TtsWordMark {
    time: number;
    type: string;
    start: number;
    end: number;
    value: string;
}

export interface SentenceUnit {
    index: number;
    start: number;
    end: number;
    text: string;
    speakText: string;
}

export interface WordToken {
    index: number;
    text: string;
    start: number;
    end: number;
}

const SENTENCE_END_CHARS = new Set([".", "!", "?", "。", "！", "？"]);
const SENTENCE_CLOSERS = new Set(["\"", "'", ")", "]", "}", "）", "】", "》", "」", "』", "”", "’"]);
const WORD_TOKEN_RE = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;

export function normalizeWordForMatch(raw: string) {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9'’]+/g, "")
        .replace(/[’]/g, "'");
}

function normalizeBoundaries(text: string, boundaries: number[]) {
    const unique = new Set<number>();
    unique.add(0);
    unique.add(text.length);

    for (const boundary of boundaries) {
        if (!Number.isFinite(boundary)) continue;
        const next = Math.max(0, Math.min(text.length, Math.round(boundary)));
        unique.add(next);
    }

    return Array.from(unique).sort((a, b) => a - b);
}

export function compactSentenceBoundaries(text: string, boundaries: number[]) {
    const normalized = normalizeBoundaries(text, boundaries);
    if (text.length === 0) return [0];

    const result: number[] = [normalized[0]];
    for (let index = 1; index < normalized.length; index += 1) {
        const nextBoundary = normalized[index];
        const previousBoundary = result[result.length - 1];
        const chunk = text.slice(previousBoundary, nextBoundary);

        // Keep the final boundary, and skip intermediate pure-whitespace chunks.
        if (!chunk.trim() && nextBoundary !== text.length) {
            continue;
        }

        result.push(nextBoundary);
    }

    if (result[result.length - 1] !== text.length) {
        result.push(text.length);
    }

    return result;
}

export function buildAutoSentenceBoundaries(text: string) {
    if (!text) return [0];

    const rawBoundaries: number[] = [0];

    let cursor = 0;
    while (cursor < text.length) {
        const char = text[cursor];

        if (SENTENCE_END_CHARS.has(char)) {
            let end = cursor + 1;
            while (end < text.length && SENTENCE_CLOSERS.has(text[end])) {
                end += 1;
            }
            rawBoundaries.push(end);
            cursor = end;
            continue;
        }

        if (char === "\n") {
            let end = cursor + 1;
            while (end < text.length && text[end] === "\n") {
                end += 1;
            }
            rawBoundaries.push(end);
            cursor = end;
            continue;
        }

        cursor += 1;
    }

    rawBoundaries.push(text.length);
    return compactSentenceBoundaries(text, rawBoundaries);
}

export function buildSentenceUnits(text: string, boundaries: number[]) {
    const normalized = compactSentenceBoundaries(text, boundaries);
    const units: SentenceUnit[] = [];

    for (let index = 0; index < normalized.length - 1; index += 1) {
        const start = normalized[index];
        const end = normalized[index + 1];
        if (end <= start) continue;

        const chunk = text.slice(start, end);
        const speakText = chunk.replace(/\s+/g, " ").trim();

        if (!speakText) continue;

        units.push({
            index: units.length,
            start,
            end,
            text: chunk,
            speakText,
        });
    }

    if (units.length === 0 && text.trim()) {
        const speakText = text.replace(/\s+/g, " ").trim();
        units.push({ index: 0, start: 0, end: text.length, text, speakText });
    }

    return units;
}

export function extractWordTokens(text: string): WordToken[] {
    const tokens: WordToken[] = [];
    let match: RegExpExecArray | null;
    let tokenIndex = 0;

    WORD_TOKEN_RE.lastIndex = 0;
    while (true) {
        match = WORD_TOKEN_RE.exec(text);
        if (!match) break;

        const tokenText = match[0];
        const start = match.index;
        const end = start + tokenText.length;

        tokens.push({
            index: tokenIndex,
            text: tokenText,
            start,
            end,
        });
        tokenIndex += 1;
    }

    return tokens;
}

export function alignTokensToMarks(tokens: WordToken[], marks: TtsWordMark[]) {
    const tokenToMark = new Map<number, number>();
    let searchFrom = 0;

    for (const token of tokens) {
        const normalizedToken = normalizeWordForMatch(token.text);
        if (!normalizedToken) continue;

        let matchedIndex = -1;

        for (let markIndex = searchFrom; markIndex < marks.length; markIndex += 1) {
            const mark = marks[markIndex];
            if (!mark || typeof mark.value !== "string") continue;
            const normalizedMark = normalizeWordForMatch(mark.value);
            if (!normalizedMark) continue;

            if (normalizedMark === normalizedToken) {
                matchedIndex = markIndex;
                break;
            }

            // Stop scanning too far forward to avoid crossing sentence chunks by accident.
            if (markIndex - searchFrom >= 8) {
                break;
            }
        }

        if (matchedIndex >= 0) {
            tokenToMark.set(token.index, matchedIndex);
            searchFrom = matchedIndex + 1;
        }
    }

    return tokenToMark;
}

export function collectBoundarySnapPoints(text: string, leftBound: number, rightBound: number) {
    if (rightBound - leftBound <= 1) return [];

    const points = new Set<number>();
    const slice = text.slice(leftBound, rightBound);
    const sliceTokens = extractWordTokens(slice);

    for (const token of sliceTokens) {
        const start = leftBound + token.start;
        const end = leftBound + token.end;
        if (start > leftBound && start < rightBound) points.add(start);
        if (end > leftBound && end < rightBound) points.add(end);
    }

    return Array.from(points).sort((a, b) => a - b);
}

export function shiftSentenceBoundaryBySteps(params: {
    text: string;
    boundaries: number[];
    boundaryIndex: number;
    steps: number;
}) {
    const { text, boundaries, boundaryIndex, steps } = params;
    const normalized = compactSentenceBoundaries(text, boundaries);

    if (boundaryIndex <= 0 || boundaryIndex >= normalized.length - 1 || steps === 0) {
        return normalized;
    }

    const leftBound = normalized[boundaryIndex - 1];
    const current = normalized[boundaryIndex];
    const rightBound = normalized[boundaryIndex + 1];

    const snapPoints = collectBoundarySnapPoints(text, leftBound, rightBound);
    const candidates = [leftBound, ...snapPoints, rightBound]
        .filter((value, index, arr) => arr.indexOf(value) === index)
        .sort((a, b) => a - b);

    let currentIndex = candidates.findIndex((value) => value === current);
    if (currentIndex < 0) {
        currentIndex = 0;
        let smallestDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < candidates.length; index += 1) {
            const distance = Math.abs(candidates[index] - current);
            if (distance < smallestDistance) {
                smallestDistance = distance;
                currentIndex = index;
            }
        }
    }

    const targetIndex = Math.max(0, Math.min(candidates.length - 1, currentIndex + steps));
    const nextBoundary = candidates[targetIndex];

    if (nextBoundary <= leftBound || nextBoundary >= rightBound) {
        return normalized;
    }

    const next = [...normalized];
    next[boundaryIndex] = nextBoundary;
    return compactSentenceBoundaries(text, next);
}
