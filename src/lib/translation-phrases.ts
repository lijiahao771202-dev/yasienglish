export interface PhraseTranslationItem {
    source: string;
    translation: string;
}

interface PhraseCandidate extends PhraseTranslationItem {
    sourceKey: string;
    start: number;
    end: number;
    tokenCount: number;
    stopwordCount: number;
    contentCount: number;
    score: number;
}

const FUNCTION_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "by",
    "for", "from", "if", "in", "into", "is", "it", "of", "on", "or",
    "that", "the", "their", "there", "they", "this", "those", "to",
    "was", "were", "with", "you", "your", "we", "our", "he", "she",
    "his", "her", "its", "them", "these", "than", "then", "but",
]);

const WEAK_LEADING_WORDS = new Set([
    "a", "an", "the", "this", "that", "these", "those", "my", "your",
    "his", "her", "its", "our", "their", "some", "any",
]);

const COMMON_FINITE_VERBS = new Set([
    "am", "are", "be", "been", "being", "did", "do", "does", "go",
    "goes", "had", "has", "have", "help", "helped", "helps", "introduced",
    "introduce", "introduces", "is", "made", "make", "makes", "need",
    "needed", "needs", "said", "say", "says", "thought", "think",
    "thinks", "tried", "tries", "try", "was", "were", "went",
]);

function escapeRegExp(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhraseText(value: string) {
    return value
        .replace(/\s+/g, " ")
        .replace(/[“”]/g, "\"")
        .replace(/[‘’]/g, "'")
        .trim()
        .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
        .trim();
}

function tokenizeEnglish(value: string) {
    return value.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) ?? [];
}

function resolveSentenceMatch(sentence: string, source: string) {
    const matcher = new RegExp(`(^|\\W)(${escapeRegExp(source)})(?=$|\\W)`, "i");
    const match = matcher.exec(sentence);
    if (!match) return null;
    const prefix = match[1] ?? "";
    const matched = match[2] ?? "";
    const start = match.index + prefix.length;
    return {
        start,
        end: start + matched.length,
    };
}

function isOverlyBroadPhrase(candidate: {
    tokenCount: number;
    stopwordCount: number;
    startsWithWeakLead: boolean;
    containsFiniteVerb: boolean;
    sentenceCoverage: number;
    contentCount: number;
}) {
    const stopwordRatio = candidate.stopwordCount / Math.max(1, candidate.tokenCount);

    if (candidate.tokenCount >= 7) return true;
    if (candidate.sentenceCoverage >= 0.7) return true;
    if (candidate.tokenCount >= 5 && stopwordRatio >= 0.4) return true;
    if (candidate.tokenCount >= 4 && candidate.startsWithWeakLead && candidate.containsFiniteVerb) return true;
    if (candidate.tokenCount >= 5 && candidate.startsWithWeakLead && candidate.contentCount <= 3) return true;

    return false;
}

function scorePhraseCandidate(candidate: {
    tokenCount: number;
    stopwordCount: number;
    contentCount: number;
    startsWithWeakLead: boolean;
    containsFiniteVerb: boolean;
    sentenceCoverage: number;
    normalizedSource: string;
}) {
    let score = 0;
    if (candidate.tokenCount === 1) {
        score += 12 + Math.min(candidate.normalizedSource.length, 10);
    } else if (candidate.tokenCount === 2) {
        score += 18;
    } else if (candidate.tokenCount === 3) {
        score += 16;
    } else if (candidate.tokenCount === 4) {
        score += 12;
    } else if (candidate.tokenCount === 5) {
        score += 6;
    } else {
        score -= 6 + Math.max(0, candidate.tokenCount - 5) * 2;
    }

    score += candidate.contentCount * 3;
    score -= candidate.stopwordCount * 2;

    if (candidate.startsWithWeakLead) {
        score -= candidate.tokenCount >= 4 ? 6 : 2;
    }
    if (candidate.containsFiniteVerb && candidate.tokenCount >= 4) {
        score -= 8;
    }
    if (candidate.sentenceCoverage > 0.55) {
        score -= 10;
    } else if (candidate.sentenceCoverage > 0.4) {
        score -= 4;
    }
    if (candidate.tokenCount > 1 && candidate.stopwordCount <= 1) {
        score += 2;
    }

    return score;
}

export function normalizePhraseTranslationItems(
    value: unknown,
    sentence?: string,
): PhraseTranslationItem[] {
    if (!Array.isArray(value)) return [];

    const sentenceText = typeof sentence === "string" ? sentence.trim() : "";
    const candidates: PhraseCandidate[] = [];
    const seen = new Set<string>();

    for (const rawItem of value) {
        if (!rawItem || typeof rawItem !== "object") continue;
        const source = typeof (rawItem as { source?: unknown }).source === "string"
            ? (rawItem as { source: string }).source
            : "";
        const translation = typeof (rawItem as { translation?: unknown }).translation === "string"
            ? (rawItem as { translation: string }).translation.trim()
            : "";
        const normalizedSource = normalizePhraseText(source);
        if (!normalizedSource || !translation) continue;

        const tokens = tokenizeEnglish(normalizedSource);
        if (tokens.length === 0) continue;

        const sourceKey = normalizedSource.toLowerCase();
        if (seen.has(sourceKey)) continue;
        seen.add(sourceKey);

        if (tokens.length === 1 && FUNCTION_WORDS.has(tokens[0])) continue;

        const sentenceMatch = sentenceText ? resolveSentenceMatch(sentenceText, normalizedSource) : null;
        if (sentenceText && !sentenceMatch) continue;

        const tokenCount = tokens.length;
        const stopwordCount = tokens.filter((token) => FUNCTION_WORDS.has(token)).length;
        const contentCount = tokenCount - stopwordCount;
        if (contentCount <= 0) continue;

        const startsWithWeakLead = WEAK_LEADING_WORDS.has(tokens[0]);
        const containsFiniteVerb = tokens.some((token) => COMMON_FINITE_VERBS.has(token));
        const sentenceCoverage = sentenceText
            ? normalizedSource.length / Math.max(1, sentenceText.length)
            : 0;

        if (tokenCount === 1 && normalizedSource.length <= 2) continue;
        if (isOverlyBroadPhrase({
            tokenCount,
            stopwordCount,
            startsWithWeakLead,
            containsFiniteVerb,
            sentenceCoverage,
            contentCount,
        })) {
            continue;
        }

        candidates.push({
            source: normalizedSource,
            translation,
            sourceKey,
            start: sentenceMatch?.start ?? -1,
            end: sentenceMatch?.end ?? normalizedSource.length,
            tokenCount,
            stopwordCount,
            contentCount,
            score: scorePhraseCandidate({
                tokenCount,
                stopwordCount,
                contentCount,
                startsWithWeakLead,
                containsFiniteVerb,
                sentenceCoverage,
                normalizedSource,
            }),
        });
    }

    candidates.sort((left, right) => (
        right.score - left.score
        || right.contentCount - left.contentCount
        || left.tokenCount - right.tokenCount
        || left.start - right.start
    ));

    const selected: PhraseCandidate[] = [];
    for (const candidate of candidates) {
        const overlaps = sentenceText && selected.some((item) => !(candidate.end <= item.start || candidate.start >= item.end));
        if (overlaps) continue;
        selected.push(candidate);
        if (selected.length >= 5) break;
    }

    return selected
        .sort((left, right) => left.start - right.start || left.end - right.end)
        .map(({ source, translation }) => ({ source, translation }));
}
