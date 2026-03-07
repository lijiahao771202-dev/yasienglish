const EDGE_PUNCTUATION = /^[,.;!?]/;
const NORMALIZE_EDGE_RE = /^[^a-z0-9']+|[^a-z0-9']+$/gi;
const STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "because", "but", "by", "for",
    "from", "he", "her", "his", "i", "if", "in", "is", "it", "me", "my", "of",
    "on", "or", "our", "she", "so", "that", "the", "their", "them", "they",
    "this", "to", "us", "was", "we", "were", "with", "you", "your",
]);

const PHRASE_OPENERS = new Set([
    "a", "an", "the", "my", "your", "his", "her", "our", "their", "this", "that",
    "these", "those", "to", "in", "on", "at", "for", "with", "from", "near", "by",
    "under", "over", "inside", "outside", "around", "behind", "beside", "because",
    "after", "before", "during", "into", "onto",
]);

const SHORT_CONTEXT_TOKENS = new Set([
    ...PHRASE_OPENERS,
    "i", "we", "you", "he", "she", "they", "it",
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

export function getAdaptivePredictionWordCount(currentInput: string, requestedWordCount = 2) {
    const tokens = tokenize(currentInput);
    if (tokens.length === 0) return Math.min(Math.max(requestedWordCount, 1), 3);

    const lastToken = tokens[tokens.length - 1]?.normalized;
    if (lastToken && PHRASE_OPENERS.has(lastToken)) {
        return 1;
    }

    return Math.min(Math.max(requestedWordCount, 1), 3);
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

function hasUsefulShortSuffixMatch(tokens: Array<{ normalized: string }>) {
    if (tokens.length !== 2) {
        return false;
    }

    const [firstToken, lastToken] = tokens;
    if (!lastToken?.normalized || !SHORT_CONTEXT_TOKENS.has(lastToken.normalized)) {
        return false;
    }

    return (
        firstToken.normalized.length >= 3 ||
        !STOPWORDS.has(firstToken.normalized) ||
        PHRASE_OPENERS.has(firstToken.normalized)
    );
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

    if (currentTokens.length < 2 || referenceTokens.length < 3) {
        return "";
    }

    const maxWindow = Math.min(5, currentTokens.length - 1, referenceTokens.length - 1);
    const minWindow = Math.min(2, maxWindow);

    for (let windowSize = maxWindow; windowSize >= minWindow; windowSize -= 1) {
        const suffix = currentTokens.slice(-windowSize);
        const canUseWindow = windowSize >= 3
            ? hasStrongSuffixMatch(suffix)
            : hasUsefulShortSuffixMatch(suffix);

        if (!canUseWindow) {
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

export function shouldUseRemotePrediction(currentInput: string) {
    const normalizedInput = currentInput.trim();
    if (!normalizedInput || /[.!?]\s*$/.test(normalizedInput)) {
        return false;
    }

    const tokens = tokenize(normalizedInput);
    if (tokens.length > 24) {
        return false;
    }

    const contentTokens = tokens.filter(token => token.normalized.length >= 4 && !STOPWORDS.has(token.normalized));
    return tokens.length >= 2 || contentTokens.length >= 1;
}
