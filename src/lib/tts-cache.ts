export const CACHE_NAME = "tts-audio-cache-v1";

export async function getAudioFromCache(text: string): Promise<Blob | null> {
    if (typeof window === "undefined" || !("caches" in window)) return null;

    try {
        const cache = await caches.open(CACHE_NAME);
        // Create a consistent key for the text
        const key = new Request(`https://tts-cache.local/?text=${encodeURIComponent(text)}`);
        const response = await cache.match(key);

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
        const key = new Request(`https://tts-cache.local/?text=${encodeURIComponent(text)}`);
        const response = new Response(blob, {
            headers: { "Content-Type": "audio/mpeg" }
        });
        await cache.put(key, response);
    } catch (error) {
        console.error("Error saving to TTS cache:", error);
    }
}
