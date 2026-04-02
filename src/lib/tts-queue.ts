import { saveAudioToCache } from "./tts-cache";
import { requestTtsPayload, resolveTtsAudioBlob } from "./tts-client";

export interface TTSQueueResult {
    blob: Blob;
    marks: Array<{
        time: number;
        type: string;
        start: number;
        end: number;
        value: string;
    }>;
}

type TTSRequest = {
    text: string;
    resolve: (result: TTSQueueResult) => void;
    reject: (error: unknown) => void;
};

class TTSQueueManager {
    private queue: TTSRequest[] = [];
    private activeCount = 0;
    private CONCURRENCY_LIMIT = 5;
    private pendingMap = new Map<string, Promise<TTSQueueResult>>();

    async add(text: string): Promise<TTSQueueResult> {
        // 1. Deduplication: If this text is already being processed or queued, return the existing promise
        if (this.pendingMap.has(text)) {
            return this.pendingMap.get(text)!;
        }

        // 2. Create a new promise for this text
        const promise = new Promise<TTSQueueResult>((resolve, reject) => {
            this.queue.push({ text, resolve, reject });
            this.processQueue();
        });

        // Store it to prevent duplicate requests
        this.pendingMap.set(text, promise);

        // Clean up from map when done (so we can retry later if needed, or if cache missed)
        // Actually, successful results go to cache, so next time we hit cache.
        // If failed, we might want to retry.
        promise.catch(() => {
            this.pendingMap.delete(text);
        });

        return promise;
    }

    private async processQueue() {
        if (this.activeCount >= this.CONCURRENCY_LIMIT || this.queue.length === 0) return;

        this.activeCount++;
        const request = this.queue.shift();

        if (!request) {
            this.activeCount--;
            return;
        }

        try {
            const payload = await requestTtsPayload(request.text);
            const blob = await resolveTtsAudioBlob(payload.audio);
            const marks = Array.isArray(payload.marks) ? payload.marks : [];

            // 2. Save to Cache
            saveAudioToCache(request.text, blob);

            // 3. Resolve
            request.resolve({
                blob,
                marks,
            });

        } catch (error) {
            console.error("TTS Queue Error:", error);
            request.reject(error);
        } finally {
            this.activeCount--;
            // Remove from pending map on success too (strictly speaking not needed if we want to cache promise, 
            // but cache layer handles persistence. Memory map should probably be cleared to free memory 
            // and allow re-fetch if something weird happens, although cache check comes before add())
            this.pendingMap.delete(request.text);

            // Process next
            this.processQueue();
        }
    }
}

export const ttsQueue = new TTSQueueManager();
