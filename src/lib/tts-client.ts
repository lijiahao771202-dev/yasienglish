export interface TtsPayload {
    audio: string;
    marks: Array<{
        time: number;
        type: string;
        start: number;
        end: number;
        value: string;
    }>;
}

export async function requestTtsPayload(text: string, voice = "en-US-JennyNeural", rate = "+0%") {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, rate }),
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

export function dataUrlToAudioBlob(dataUrl: string) {
    const [, base64 = ""] = dataUrl.split(",");
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i += 1) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return new Blob([bytes], { type: "audio/mpeg" });
}
