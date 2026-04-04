import { requestTtsPayload, type TtsPayload } from "@/lib/tts-client";
import {
    buildListeningCabinAudioCacheKey,
    buildListeningCabinNarrationText,
    playbackRateToTtsRate,
    type ListeningCabinSentence,
} from "@/lib/listening-cabin";

const payloadCache = new Map<string, Promise<TtsPayload>>();

export function getListeningCabinTtsPayload(text: string, voice: string, playbackRate: number) {
    const cacheKey = buildListeningCabinAudioCacheKey(text, voice, playbackRate);
    const existing = payloadCache.get(cacheKey);
    if (existing) {
        return existing;
    }

    const promise = requestTtsPayload(text, voice, playbackRateToTtsRate(playbackRate))
        .catch((error) => {
            payloadCache.delete(cacheKey);
            throw error;
        });

    payloadCache.set(cacheKey, promise);
    return promise;
}

export function primeListeningCabinTtsPayload(text: string, voice: string, playbackRate: number) {
    void getListeningCabinTtsPayload(text, voice, playbackRate);
}

export function getListeningCabinNarrationTtsPayload(
    sentences: ListeningCabinSentence[],
    voice: string,
    playbackRate: number,
) {
    return getListeningCabinTtsPayload(buildListeningCabinNarrationText(sentences), voice, playbackRate);
}
