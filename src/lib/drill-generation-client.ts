import type { AiProvider } from "@/lib/profile-settings";

export type DrillGenerationRequestBody = {
    articleTitle: string;
    topicPrompt?: string;
    articleContent: string;
    difficulty: string;
    injectedVocabulary?: string[];
    eloRating: number;
    mode: "translation" | "listening" | "rebuild";
    sourceMode: string;
    excludeBankIds?: string[];
    rebuildVariant?: "sentence" | "passage";
    translationVariant?: "sentence" | "passage";
    segmentCount?: 2 | 3 | 5;
    provider?: AiProvider;
    nvidiaModel?: string;
    bossType?: string;
    _t: number;
};

type FetchLike = typeof fetch;

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function createAbortError() {
    const error = new Error("Drill generation aborted");
    error.name = "AbortError";
    return error;
}

function isAbortError(error: unknown) {
    return (error as Error | undefined)?.name === "AbortError";
}

function isRetryableRequestError(error: unknown) {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return (
        message.includes("failed to fetch")
        || message.includes("network")
        || message.includes("timeout")
        || message.includes("timed out")
        || message.includes("fetch failed")
        || message.includes("unexpected end of json input")
    );
}

function isRetryableResponse(status: number, message: string) {
    if (RETRYABLE_STATUS_CODES.has(status)) {
        return true;
    }

    const normalizedMessage = message.toLowerCase();
    return (
        normalizedMessage.includes("temporarily unavailable")
        || normalizedMessage.includes("timeout")
        || normalizedMessage.includes("network")
        || normalizedMessage.includes("upstream")
    );
}

async function parseResponsePayload(response: Response) {
    const rawText = await response.text();
    if (!rawText.trim()) {
        return { data: null as Record<string, unknown> | null, message: "" };
    }

    try {
        const data = JSON.parse(rawText) as Record<string, unknown>;
        const message = typeof data.error === "string"
            ? data.error
            : typeof data.details === "string"
                ? data.details
                : rawText;
        return { data, message };
    } catch {
        return { data: null as Record<string, unknown> | null, message: rawText.trim() };
    }
}

async function waitBeforeRetry(attempt: number, signal?: AbortSignal) {
    await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(resolve, 450 * attempt);

        if (!signal) return;

        const onAbort = () => {
            clearTimeout(timeoutId);
            signal.removeEventListener("abort", onAbort);
            reject(createAbortError());
        };

        signal.addEventListener("abort", onAbort, { once: true });
    });
}

export async function fetchNextDrillWithRetry(
    body: DrillGenerationRequestBody,
    options?: {
        signal?: AbortSignal;
        maxAttempts?: number;
        fetchImpl?: FetchLike;
    },
) {
    const signal = options?.signal;
    const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
    const fetchImpl = options?.fetchImpl ?? fetch;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (signal?.aborted) {
            throw createAbortError();
        }

        try {
            const response = await fetchImpl("/api/drill/next", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal,
            });

            if (signal?.aborted) {
                throw createAbortError();
            }

            const { data, message } = await parseResponsePayload(response);

            if (signal?.aborted) {
                throw createAbortError();
            }

            if (response.ok && !data?.error) {
                return data;
            }

            const errorMessage = message || "Failed to generate drill";
            const error = new Error(errorMessage);
            const shouldRetry = attempt < maxAttempts && isRetryableResponse(response.status, errorMessage);

            if (!shouldRetry) {
                throw error;
            }

            lastError = error;
            console.warn(
                `[Drill] Retrying generation after API failure (${attempt}/${maxAttempts})`,
                { status: response.status, error: errorMessage },
            );
            await waitBeforeRetry(attempt, signal);
        } catch (error) {
            if (isAbortError(error)) {
                throw error;
            }

            const normalizedError = error instanceof Error ? error : new Error("Failed to generate drill");
            const shouldRetry = attempt < maxAttempts && isRetryableRequestError(normalizedError);

            if (!shouldRetry) {
                throw normalizedError;
            }

            lastError = normalizedError;
            console.warn(
                `[Drill] Retrying generation after request failure (${attempt}/${maxAttempts})`,
                normalizedError,
            );
            await waitBeforeRetry(attempt, signal);
        }
    }

    throw lastError ?? new Error("Failed to generate drill");
}
