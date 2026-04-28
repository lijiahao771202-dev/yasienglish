export function buildGhostEmbeddingSource(
    referenceAnswer: string | undefined,
    referenceAnswerAlternatives: string[] | undefined,
    maxReferenceAlternatives: number,
) {
    const reference = typeof referenceAnswer === "string" ? referenceAnswer.trim() : "";
    const alternatives = Array.isArray(referenceAnswerAlternatives)
        ? referenceAnswerAlternatives
            .filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
            .slice(0, Math.max(0, maxReferenceAlternatives))
        : [];

    const texts = reference ? [reference, ...alternatives] : alternatives;

    return {
        texts,
        key: JSON.stringify(texts),
    };
}

export function isSelectionAtTextEnd(fullText: string, textBeforeSelection: string) {
    return fullText.trimStart() === textBeforeSelection.trimStart();
}

export function isGhostCompletionResultStale(requestedInput: string, latestInput: string) {
    return requestedInput !== latestInput;
}

export function resolveAsyncGhostCompletionAction(params: {
    requestedInput: string;
    latestInput: string;
    hasResult: boolean;
}) {
    const { requestedInput, latestInput, hasResult } = params;

    if (isGhostCompletionResultStale(requestedInput, latestInput)) {
        return "ignore" as const;
    }

    return hasResult ? "apply" as const : "clear" as const;
}
