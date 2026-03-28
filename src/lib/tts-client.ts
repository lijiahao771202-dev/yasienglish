import { db } from "./db";
import { DEFAULT_TTS_VOICE, normalizeTtsVoice } from "./profile-settings";

export interface TtsPayload {
    audio: string;
    audioDataUrl?: string;
    marks: Array<{
        time: number;
        type: string;
        start: number;
        end: number;
        value: string;
    }>;
}

async function resolvePreferredVoice(voice?: string) {
    if (voice?.trim()) {
        return normalizeTtsVoice(voice);
    }

    const profile = await db.user_profile.orderBy("id").first();
    return normalizeTtsVoice(profile?.learning_preferences?.tts_voice || DEFAULT_TTS_VOICE);
}

export async function requestTtsPayload(text: string, voice?: string, rate = "+0%") {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const resolvedVoice = await resolvePreferredVoice(voice);

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
        throw new Error(data?.details || data?.error || "TTS request failed");
    }

    return data as TtsPayload;
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
