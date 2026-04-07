import { db } from "./db";
import {
    DEFAULT_TTS_VOICE,
    normalizeLearningPreferenceTtsVoice,
    normalizeTtsVoice,
    resolveLearningPreferenceTtsVoice,
    type LearningPreferenceTtsVoice,
} from "./profile-settings";

export interface TtsPayload {
    audio: string;
    audioDataUrl?: string;
    segmentTimings?: Array<{
        index: number;
        startMs: number;
        endMs: number;
    }>;
    marks: Array<{
        time: number;
        type: string;
        start: number;
        end: number;
        value: string;
    }>;
}

export interface TtsSegmentInput {
    text: string;
    voice?: string;
    rate?: string;
}

async function resolvePreferredVoice(voice?: string) {
    if (voice?.trim()) {
        return resolveLearningPreferenceTtsVoice(voice);
    }

    const profile = await db.user_profile.orderBy("id").first();
    return resolveLearningPreferenceTtsVoice(profile?.learning_preferences?.tts_voice || DEFAULT_TTS_VOICE);
}

export async function requestTtsPayload(text: string, voice?: string, rate = "+0%") {
    const resolvedVoice = await resolvePreferredVoice(voice);
    const timeoutMs = Math.min(35000, 15000 + Math.max(0, text.length - 120) * 60);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, voice: resolvedVoice, rate }),
                signal: controller.signal,
            }).finally(() => {
                clearTimeout(timeoutId);
            });

            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.audio) {
                const message = data?.details || data?.error || "TTS request failed";
                throw new Error(message);
            }

            return data as TtsPayload;
        } catch (error) {
            const normalizedError = error instanceof Error ? error : new Error("TTS request failed");
            lastError = normalizedError;

            const message = normalizedError.message.toLowerCase();
            const isRetryable = normalizedError.name === "AbortError"
                || message.includes("timed out")
                || message.includes("failed to fetch")
                || message.includes("network")
                || message.includes("no audio data")
                || message.includes("empty")
                || message.includes("socket");

            if (!isRetryable || attempt === 1) {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }

    throw lastError ?? new Error("TTS request failed");
}

export async function requestTtsSegmentsPayload(segments: TtsSegmentInput[]) {
    const profile = await db.user_profile.orderBy("id").first();
    const fallbackVoicePreference: LearningPreferenceTtsVoice = normalizeLearningPreferenceTtsVoice(
        profile?.learning_preferences?.tts_voice || DEFAULT_TTS_VOICE,
    );
    const resolvedFallbackVoice = resolveLearningPreferenceTtsVoice(fallbackVoicePreference);
    const normalizedSegments = await Promise.all(
        segments.map(async (segment) => ({
            text: segment.text,
            voice: segment.voice?.trim()
                ? normalizeTtsVoice(segment.voice)
                : resolvedFallbackVoice,
            rate: typeof segment.rate === "string" && segment.rate.trim() ? segment.rate.trim() : "+0%",
        })),
    );

    const timeoutMs = Math.min(
        60000,
        18000 + normalizedSegments.reduce((sum, segment) => sum + Math.max(0, segment.text.length - 100) * 55, 0),
    );
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ segments: normalizedSegments }),
                signal: controller.signal,
            }).finally(() => {
                clearTimeout(timeoutId);
            });

            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.audio) {
                const message = data?.details || data?.error || "TTS request failed";
                throw new Error(message);
            }

            return data as TtsPayload;
        } catch (error) {
            const normalizedError = error instanceof Error ? error : new Error("TTS request failed");
            lastError = normalizedError;

            const message = normalizedError.message.toLowerCase();
            const isRetryable = normalizedError.name === "AbortError"
                || message.includes("timed out")
                || message.includes("failed to fetch")
                || message.includes("network")
                || message.includes("no audio data")
                || message.includes("empty")
                || message.includes("socket");

            if (!isRetryable || attempt === 1) {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }

    throw lastError ?? new Error("TTS request failed");
}

export async function resolveTtsAudioBlob(audioSource: string) {
    if (!audioSource.startsWith("data:")) {
        const response = await fetch(audioSource);
        if (!response.ok) {
            throw new Error(`Failed to load synthesized audio (${response.status})`);
        }
        return await response.blob();
    }

    const [, base64 = ""] = audioSource.split(",");
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);

    for (let index = 0; index < binaryString.length; index += 1) {
        bytes[index] = binaryString.charCodeAt(index);
    }

    return new Blob([bytes], { type: "audio/mpeg" });
}
