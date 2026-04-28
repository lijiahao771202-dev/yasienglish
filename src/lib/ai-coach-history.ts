import stringSimilarity from "string-similarity";

export function normalizeCoachHistoryInput(raw: string) {
    return raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

export function shouldResetCoachHistoryContext(params: {
    baseline: string;
    current: string;
}) {
    const baseline = normalizeCoachHistoryInput(params.baseline);
    const current = normalizeCoachHistoryInput(params.current);

    if (!baseline || !current) {
        return baseline !== current;
    }

    if (baseline === current) return false;

    if (current.startsWith(baseline) || baseline.startsWith(current)) {
        return false;
    }

    const similarity = stringSimilarity.compareTwoStrings(baseline, current);
    const baselineWords = new Set(baseline.split(" "));
    const currentWords = new Set(current.split(" "));
    const sharedWords = [...baselineWords].filter((word) => currentWords.has(word)).length;
    const overlapRatio = sharedWords / Math.max(1, Math.min(baselineWords.size, currentWords.size));
    return similarity < 0.78 && overlapRatio < 0.67;
}
