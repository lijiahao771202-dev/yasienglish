const EDGE_PUNCTUATION = /^[,.;!?]/;
const NORMALIZE_EDGE_RE = /^[^a-z0-9']+|[^a-z0-9']+$/gi;
const STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "because", "but", "by", "for",
    "from", "he", "her", "his", "i", "if", "in", "is", "it", "me", "my", "of",
    "on", "or", "our", "she", "so", "that", "the", "their", "them", "they",
    "this", "to", "us", "was", "we", "were", "with", "you", "your",
]);

function normalizeToken(token: string) {
    return token.toLowerCase().replace(NORMALIZE_EDGE_RE, "");
}

function tokenize(text: string) {
    return text
        .trim()
        .split(/\s+/)
        .map(raw => ({
            raw,
            normalized: normalizeToken(raw),
        }))
        .filter(token => token.normalized.length > 0);
}

function takeNextWords(text: string, count: number) {
    const match = text.trimStart().match(new RegExp(`^(\\S+\\s*){1,${count}}`));
    return match ? match[0].trimEnd() : "";
}

function addLeadingSpaceIfNeeded(currentInput: string, suggestion: string) {
    if (!suggestion) return "";
    if (currentInput.endsWith(" ") || EDGE_PUNCTUATION.test(suggestion)) {
        return suggestion;
    }
    return ` ${suggestion}`;
}

function hasStrongSuffixMatch(tokens: Array<{ normalized: string }>) {
    let contentCount = 0;
    for (const token of tokens) {
        if (token.normalized.length >= 4 && !STOPWORDS.has(token.normalized)) {
            contentCount += 1;
        }
    }
    return contentCount >= 2 || (tokens.length >= 4 && contentCount >= 1);
}

export function getExactPrefixPrediction(currentInput: string, referenceAnswer?: string, wordCount = 2) {
    if (!referenceAnswer) return "";

    const input = currentInput.trimStart();
    const reference = referenceAnswer.trimStart();
    if (!input || !reference) return "";

    if (!reference.toLowerCase().startsWith(input.toLowerCase())) {
        return "";
    }

    const remainder = reference.slice(input.length).trimStart();
    if (!remainder) {
        return "";
    }

    return addLeadingSpaceIfNeeded(currentInput, takeNextWords(remainder, wordCount));
}

export function getSuffixAlignedPrediction(currentInput: string, referenceAnswer?: string, wordCount = 2) {
    if (!referenceAnswer) return "";

    const currentTokens = tokenize(currentInput);
    const referenceTokens = tokenize(referenceAnswer);

    if (currentTokens.length < 3 || referenceTokens.length < 4) {
        return "";
    }

    const maxWindow = Math.min(5, currentTokens.length - 1, referenceTokens.length - 1);

    for (let windowSize = maxWindow; windowSize >= 3; windowSize -= 1) {
        const suffix = currentTokens.slice(-windowSize);
        if (!hasStrongSuffixMatch(suffix)) {
            continue;
        }

        const matches: number[] = [];

        for (let i = 0; i <= referenceTokens.length - windowSize; i += 1) {
            const isMatch = suffix.every((token, index) => token.normalized === referenceTokens[i + index]?.normalized);
            if (isMatch) {
                matches.push(i);
            }
        }

        if (matches.length !== 1) {
            continue;
        }

        const nextIndex = matches[0] + windowSize;
        if (nextIndex >= referenceTokens.length) {
            return "";
        }

        const suggestion = referenceTokens.slice(nextIndex, nextIndex + wordCount).map(token => token.raw).join(" ");
        return addLeadingSpaceIfNeeded(currentInput, suggestion);
    }

    return "";
}

export function getDeterministicPrediction(currentInput: string, referenceAnswer?: string, wordCount = 2) {
    return (
        getExactPrefixPrediction(currentInput, referenceAnswer, wordCount) ||
        getSuffixAlignedPrediction(currentInput, referenceAnswer, wordCount)
    );
}

export function shouldUseRemotePrediction(currentInput: string, referenceAnswer?: string) {
    if (!referenceAnswer) return false;

    const normalizedInput = currentInput.trim();
    if (!normalizedInput || /[.!?]\s*$/.test(normalizedInput)) {
        return false;
    }

    const tokens = tokenize(normalizedInput);
    if (tokens.length >= 10) {
        return false;
    }

    const contentTokens = tokens.filter(token => token.normalized.length >= 4 && !STOPWORDS.has(token.normalized));
    return contentTokens.length >= 1;
}
