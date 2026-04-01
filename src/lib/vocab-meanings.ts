export interface MeaningGroup {
    pos: string;
    meanings: string[];
}

const POS_ORDER = ["n.", "v.", "adj.", "adv.", "prep.", "pron.", "conj.", "aux.", "num.", "int."];
const POS_PREFIX_RE = /^(n|v|adj|adv|prep|pron|conj|aux|num|int)\.\s*/i;
const POS_SCAN_RE = /\b(n|v|adj|adv|prep|pron|conj|aux|num|int)\./gi;

function normalizeText(input: string) {
    return input.replace(/\s+/g, " ").replace(/；/g, ";").trim();
}

function splitMeanings(raw: string) {
    return raw
        .split(/[;]/)
        .map((part) => part.trim())
        .filter(Boolean);
}

function dedupe(values: string[]) {
    return Array.from(new Set(values)).slice(0, 6);
}

function inferFallbackPos(word: string) {
    const lower = word.toLowerCase();
    if (/(ly)$/.test(lower)) return "adv.";
    if (/(tion|sion|ment|ness|ity|ism|age|ship|ance|ence)$/.test(lower)) return "n.";
    if (/(ive|ous|ful|less|able|ible|al|ic|ary|ory|ish)$/.test(lower)) return "adj.";
    if (/(ize|ise|fy|ate|en)$/.test(lower)) return "v.";
    return "n.";
}

export function parseMeaningGroups(definition?: string, translation?: string, word = ""): MeaningGroup[] {
    const normalizedTranslation = normalizeText(translation ?? "");
    const normalizedDefinition = normalizeText(definition ?? "");
    const sources = buildMeaningSources(normalizedDefinition, normalizedTranslation);

    const grouped = new Map<string, string[]>();
    const fallback: string[] = [];

    for (const source of sources) {
        const matches = Array.from(source.matchAll(POS_SCAN_RE));

        if (matches.length === 0) {
            fallback.push(...splitMeanings(source));
            continue;
        }

        for (let i = 0; i < matches.length; i += 1) {
            const match = matches[i];
            const start = match.index ?? 0;
            const end = matches[i + 1]?.index ?? source.length;
            const segment = source.slice(start, end).trim();
            const pos = `${(match[1] || "").toLowerCase()}.`;
            const cleaned = segment.replace(POS_PREFIX_RE, "").trim();
            const meanings = splitMeanings(cleaned);
            if (!meanings.length) continue;

            const existing = grouped.get(pos) ?? [];
            grouped.set(pos, [...existing, ...meanings]);
        }
    }

    const orderedKeys = POS_ORDER.filter((key) => grouped.has(key));
    const otherKeys = Array.from(grouped.keys()).filter((key) => !POS_ORDER.includes(key));

    const groups = [...orderedKeys, ...otherKeys].map((key) => ({
        pos: key,
        meanings: dedupe(grouped.get(key) ?? []),
    }));

    if (groups.length > 0) {
        return groups;
    }

    const fallbackMeanings = dedupe(fallback);
    if (fallbackMeanings.length > 0) {
        return [{ pos: inferFallbackPos(word), meanings: fallbackMeanings }];
    }

    return [];
}

export function normalizeHighlightedMeanings(values?: string[] | null) {
    return normalizeTextList(values, 6);
}

export function normalizeWordBreakdown(values?: unknown) {
    return normalizeTextList(values, 8);
}

export function normalizeMorphologyNotes(values?: unknown) {
    return normalizeTextList(values, 8);
}

export function normalizeMeaningMatchText(value: string) {
    return String(value ?? "")
        .trim()
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, "")
        .toLowerCase();
}

export function pickPreferredMeaningGroups(primary: MeaningGroup[] = [], fallback: MeaningGroup[] = []) {
    const normalizedPrimary = primary
        .map((group) => ({
            pos: String(group.pos ?? "").trim(),
            meanings: Array.isArray(group.meanings)
                ? group.meanings.map((meaning) => String(meaning ?? "").trim()).filter(Boolean)
                : [],
        }))
        .filter((group) => group.meanings.length > 0);
    const normalizedFallback = fallback
        .map((group) => ({
            pos: String(group.pos ?? "").trim(),
            meanings: Array.isArray(group.meanings)
                ? group.meanings.map((meaning) => String(meaning ?? "").trim()).filter(Boolean)
                : [],
        }))
        .filter((group) => group.meanings.length > 0);

    if (normalizedPrimary.length === 0) return normalizedFallback;
    if (normalizedFallback.length === 0) return normalizedPrimary;

    const primaryChineseWeight = countChineseWeight(normalizedPrimary);
    const fallbackChineseWeight = countChineseWeight(normalizedFallback);

    if (primaryChineseWeight === fallbackChineseWeight) {
        return normalizedPrimary;
    }

    return fallbackChineseWeight > primaryChineseWeight ? normalizedFallback : normalizedPrimary;
}

export function resolveHighlightedMeaningsFromGroups(groups: MeaningGroup[] = [], highlightedMeanings: string[] = []) {
    const flattenedMeanings = groups.flatMap((group) => (
        Array.isArray(group.meanings)
            ? group.meanings.map((meaning) => String(meaning ?? "").trim()).filter(Boolean)
            : []
    ));
    if (flattenedMeanings.length === 0 || highlightedMeanings.length === 0) {
        return [];
    }

    const resolved: string[] = [];

    for (const rawHighlight of highlightedMeanings) {
        const normalizedHighlight = normalizeMeaningMatchText(rawHighlight);
        if (!normalizedHighlight) continue;

        const matchedMeaning = flattenedMeanings.find((meaning) => {
            const normalizedMeaning = normalizeMeaningMatchText(meaning);
            if (!normalizedMeaning) return false;
            return normalizedMeaning === normalizedHighlight
                || normalizedMeaning.includes(normalizedHighlight)
                || normalizedHighlight.includes(normalizedMeaning);
        });

        if (matchedMeaning && !resolved.includes(matchedMeaning)) {
            resolved.push(matchedMeaning);
        }
    }

    if (resolved.length > 0) {
        return resolved;
    }

    return flattenedMeanings[0] ? [flattenedMeanings[0]] : [];
}

function normalizeTextList(values: unknown, limit: number) {
    if (!Array.isArray(values)) return [];
    return values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .slice(0, limit);
}

function countChineseWeight(groups: MeaningGroup[]) {
    return groups.reduce((total, group) => (
        total + group.meanings.reduce((groupTotal, meaning) => (
            groupTotal + (meaning.match(/[\u3400-\u9fff]/g)?.length ?? 0)
        ), 0)
    ), 0);
}

function buildMeaningSources(definition: string, translation: string) {
    if (containsChineseText(translation)) {
        return [translation];
    }

    return [translation, definition].filter(Boolean);
}

function containsChineseText(value: string) {
    return /[\u3400-\u9fff]/.test(value);
}
