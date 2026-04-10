export const CACHE_NAME = "tts-audio-cache-v2";

function buildCacheRequest(text: string) {
    return new Request(`https://tts-cache.local/?text=${encodeURIComponent(text)}`);
}

export async function getAudioFromCache(text: string): Promise<Blob | null> {
    if (typeof window === "undefined" || !("caches" in window)) return null;

    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(buildCacheRequest(text));

        if (response) {
            return await response.blob();
        }
        return null;
    } catch (error) {
        console.error("Error reading from TTS cache:", error);
        return null;
    }
}

export async function saveAudioToCache(text: string, blob: Blob): Promise<void> {
    if (typeof window === "undefined" || !("caches" in window)) return;

    try {
        const cache = await caches.open(CACHE_NAME);
        const response = new Response(blob, {
            headers: { "Content-Type": "audio/mpeg" }
        });
        await cache.put(buildCacheRequest(text), response);
    } catch (error) {
        console.error("Error saving to TTS cache:", error);
    }
}

export async function deleteAudioFromCache(text: string): Promise<void> {
    if (typeof window === "undefined" || !("caches" in window)) return;

    try {
        const cache = await caches.open(CACHE_NAME);
        await cache.delete(buildCacheRequest(text));
    } catch (error) {
        console.error("Error deleting from TTS cache:", error);
    }
}
