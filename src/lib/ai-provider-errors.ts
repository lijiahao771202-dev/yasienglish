export const AI_PROVIDER_RATE_LIMIT_ERROR_CODE = "AI_PROVIDER_RATE_LIMIT";

type ProviderErrorLike = {
    status?: unknown;
    code?: unknown;
    type?: unknown;
    message?: unknown;
    headers?: {
        get?: (name: string) => string | null;
    };
};

function readProviderError(error: unknown): ProviderErrorLike {
    return (error && typeof error === "object" ? error : {}) as ProviderErrorLike;
}

export function getAiProviderErrorStatus(error: unknown) {
    const candidate = readProviderError(error).status;
    return typeof candidate === "number" ? candidate : undefined;
}

export function getAiProviderRetryAfterSeconds(error: unknown) {
    const retryAfter = readProviderError(error).headers?.get?.("retry-after");
    const parsed = Number(retryAfter);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function getAiProviderErrorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }
    const message = readProviderError(error).message;
    return typeof message === "string" ? message : "";
}

export function isAiProviderRateLimitError(error: unknown) {
    if (getAiProviderErrorStatus(error) === 429) {
        return true;
    }

    const normalized = [
        getAiProviderErrorMessage(error),
        String(readProviderError(error).code ?? ""),
        String(readProviderError(error).type ?? ""),
    ].join(" ").toLowerCase();

    return (
        normalized.includes("429")
        || normalized.includes("too many requests")
        || normalized.includes("ratelimit")
        || normalized.includes("rate limit")
        || normalized.includes("userconcurrentrequests")
        || normalized.includes("concurrent requests")
    );
}

export function buildAiProviderRateLimitPayload(message = "当前 AI 模型并发请求过多，请稍等几秒再试。") {
    return {
        errorCode: AI_PROVIDER_RATE_LIMIT_ERROR_CODE,
        error: message,
        retryable: true,
    };
}
