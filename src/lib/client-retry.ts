const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export type RetryableClientError = Error & {
    responseStatus?: number;
    responseData?: unknown;
};

export function isRetryableClientError(error: unknown) {
    if (!(error instanceof Error)) return false;
    if (error.name === "AbortError") return false;

    const responseStatus = (error as RetryableClientError).responseStatus;
    if (typeof responseStatus === "number" && RETRYABLE_STATUS_CODES.has(responseStatus)) {
        return true;
    }

    const message = error.message.toLowerCase();
    return (
        message.includes("failed to fetch")
        || message.includes("fetch failed")
        || message.includes("network")
        || message.includes("timeout")
        || message.includes("timed out")
        || message.includes("temporary")
        || message.includes("temporarily unavailable")
        || message.includes("unexpected end of json input")
    );
}

async function waitBeforeRetry(attempt: number) {
    await new Promise((resolve) => setTimeout(resolve, 180 * attempt));
}

export async function retryClientAction<T>(
    action: () => Promise<T>,
    options?: {
        maxAttempts?: number;
        shouldRetry?: (error: unknown) => boolean;
    },
) {
    const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
    const shouldRetry = options?.shouldRetry ?? isRetryableClientError;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await action();
        } catch (error) {
            lastError = error;
            if (!shouldRetry(error) || attempt === maxAttempts) {
                throw error;
            }
            await waitBeforeRetry(attempt);
        }
    }

    throw lastError ?? new Error("Retryable client action failed");
}
