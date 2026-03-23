import "server-only";

const DEFAULT_PRONUNCIATION_SERVICE_URL = "http://127.0.0.1:3132";
const PRONUNCIATION_SERVICE_TIMEOUT_MS = Number(process.env.YASI_PRONUNCIATION_SERVICE_TIMEOUT_MS || 45_000);

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

export async function getPronunciationServiceHealth() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRONUNCIATION_SERVICE_TIMEOUT_MS);

    try {
        const response = await fetch(`${getPronunciationServiceUrl()}/health`, {
            method: "GET",
            signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new PronunciationServiceError(
                typeof payload?.error === "string" ? payload.error : "本地发音评分服务不可用。",
                response.status,
            );
        }
        return payload as Record<string, unknown>;
    } catch (error) {
        if (error instanceof PronunciationServiceError) throw error;
        throw new PronunciationServiceError("本地发音评分服务没有启动。");
    } finally {
        clearTimeout(timeout);
    }
}

export async function scorePronunciationWithService(input: {
    audioBase64: string;
    referenceText: string;
    transcript?: string;
    eloRating?: number;
}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRONUNCIATION_SERVICE_TIMEOUT_MS);

    try {
        const response = await fetch(`${getPronunciationServiceUrl()}/score`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                audio_base64: input.audioBase64,
                reference_text: input.referenceText,
                ...(typeof input.eloRating === "number" ? { elo_rating: input.eloRating } : {}),
            }),
            signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new PronunciationServiceError(
                typeof payload?.error === "string" ? payload.error : "本地发音评分失败。",
                response.status,
            );
        }
        return payload as Record<string, unknown>;
    } catch (error) {
        if (error instanceof PronunciationServiceError) throw error;
        throw new PronunciationServiceError("本地发音评分服务没有响应。");
    } finally {
        clearTimeout(timeout);
    }
}
