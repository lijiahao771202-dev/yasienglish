import "server-only";

const DEFAULT_PRONUNCIATION_SERVICE_URL = "http://127.0.0.1:3132";
const PRONUNCIATION_SERVICE_TIMEOUT_MS = Number(process.env.YASI_PRONUNCIATION_SERVICE_TIMEOUT_MS || 45_000);
const PRONUNCIATION_SERVICE_RETRY_ATTEMPTS = Math.max(1, Number(process.env.YASI_PRONUNCIATION_SERVICE_RETRY_ATTEMPTS || 3));
const PRONUNCIATION_SERVICE_RETRY_DELAY_MS = Math.max(0, Number(process.env.YASI_PRONUNCIATION_SERVICE_RETRY_DELAY_MS || 250));

export class PronunciationServiceError extends Error {
    status: number;

    constructor(message: string, status = 503) {
        super(message);
        this.name = "PronunciationServiceError";
        this.status = status;
    }
}

function getPronunciationServiceUrl() {
    return process.env.YASI_PRONUNCIATION_SERVICE_URL || DEFAULT_PRONUNCIATION_SERVICE_URL;
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryablePronunciationServiceStatus(status: number) {
    return status === 502 || status === 503 || status === 504;
}

async function requestPronunciationServiceJson(pathname: string, init: RequestInit, messages: {
    unavailable: string;
    fallback: string;
}) {
    let lastError: PronunciationServiceError | null = null;

    for (let attempt = 0; attempt < PRONUNCIATION_SERVICE_RETRY_ATTEMPTS; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), PRONUNCIATION_SERVICE_TIMEOUT_MS);

        try {
            const response = await fetch(`${getPronunciationServiceUrl()}${pathname}`, {
                ...init,
                signal: controller.signal,
            });
            const payload = await response.json().catch(() => ({}));

            if (response.ok) {
                return payload as Record<string, unknown>;
            }

            lastError = new PronunciationServiceError(
                typeof payload?.error === "string" ? payload.error : messages.fallback,
                response.status,
            );

            if (!isRetryablePronunciationServiceStatus(response.status) || attempt === PRONUNCIATION_SERVICE_RETRY_ATTEMPTS - 1) {
                break;
            }
        } catch (error) {
            if (error instanceof PronunciationServiceError) {
                lastError = error;
                if (!isRetryablePronunciationServiceStatus(error.status) || attempt === PRONUNCIATION_SERVICE_RETRY_ATTEMPTS - 1) {
                    break;
                }
            } else {
                lastError = new PronunciationServiceError(messages.unavailable);
                if (attempt === PRONUNCIATION_SERVICE_RETRY_ATTEMPTS - 1) {
                    break;
                }
            }
        } finally {
            clearTimeout(timeout);
        }

        await delay(PRONUNCIATION_SERVICE_RETRY_DELAY_MS);
    }

    throw lastError ?? new PronunciationServiceError(messages.unavailable);
}

export async function getPronunciationServiceHealth() {
    return requestPronunciationServiceJson("/health", {
        method: "GET",
    }, {
        unavailable: "本地发音评分服务没有启动。",
        fallback: "本地发音评分服务不可用。",
    });
}

export async function scorePronunciationWithService(input: {
    audioBase64: string;
    referenceText: string;
    transcript?: string;
    eloRating?: number;
}) {
    return requestPronunciationServiceJson("/score", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            audio_base64: input.audioBase64,
            reference_text: input.referenceText,
            ...(typeof input.eloRating === "number" ? { elo_rating: input.eloRating } : {}),
        }),
    }, {
        unavailable: "本地发音评分服务没有响应。",
        fallback: "本地发音评分失败。",
    });
}
