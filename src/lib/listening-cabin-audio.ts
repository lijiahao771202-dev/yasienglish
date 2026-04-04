import {
    requestTtsPayload,
    requestTtsSegmentsPayload,
    type TtsPayload,
} from "@/lib/tts-client";
import {
    buildListeningCabinAudioCacheKey,
    buildListeningCabinMixedAudioCacheKey,
    buildListeningCabinNarrationText,
    buildListeningCabinNarrationSegments,
    playbackRateToTtsRate,
    type ListeningCabinScriptMode,
    type ListeningCabinSpeakerPlan,
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
    scriptMode: ListeningCabinScriptMode = "monologue",
    speakerPlan?: ListeningCabinSpeakerPlan,
) {
    if (speakerPlan) {
        const segments = buildListeningCabinNarrationSegments({
            sentences,
            scriptMode,
            speakerPlan,
        }).filter((segment) => segment.text.trim());
        if (segments.length > 0) {
            const cacheKey = buildListeningCabinMixedAudioCacheKey(segments, playbackRate);
            const existing = payloadCache.get(cacheKey);
            if (existing) {
                return existing;
            }

            const promise = requestTtsSegmentsPayload(segments)
                .catch((error) => {
                    payloadCache.delete(cacheKey);
                    throw error;
                });
            payloadCache.set(cacheKey, promise);
            return promise;
        }
    }

    return getListeningCabinTtsPayload(buildListeningCabinNarrationText(sentences), voice, playbackRate);
}
