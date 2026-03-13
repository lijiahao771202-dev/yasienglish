import type { GuidedAiHint } from "./guidedLearning";

export function buildGuidedHintCacheKey({
    guidedKey,
    slotId,
    innerMode,
    attempt,
    requestCount,
    leftContext,
    rightContext,
}: {
    guidedKey: string;
    slotId: string;
    innerMode: "teacher_guided" | "gestalt_cloze";
    attempt: number;
    requestCount: number;
    leftContext: string;
    rightContext: string;
}) {
    return JSON.stringify({
        guidedKey,
        slotId,
        innerMode,
        attempt,
        requestCount,
        leftContext,
        rightContext,
    });
}

export async function fetchGuidedHintWithRetry(
    fetcher: () => Promise<GuidedAiHint>,
    maxAttempts = 3,
) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await fetcher();
        } catch (error) {
            if ((error as Error).name === "AbortError") {
                throw error;
            }
            lastError = error;
        }
    }

    throw lastError ?? new Error("Failed to fetch guided hint");
}
