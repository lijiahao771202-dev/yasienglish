import { saveAudioToCache } from "./tts-cache";

type TTSRequest = {
    text: string;
    resolve: (blob: Blob) => void;
    reject: (error: any) => void;
};

class TTSQueueManager {
    private queue: TTSRequest[] = [];
    private isProcessing = false;

    async add(text: string): Promise<Blob> {
        return new Promise((resolve, reject) => {
            this.queue.push({ text, resolve, reject });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const request = this.queue.shift();

        if (!request) {
            this.isProcessing = false;
            return;
        }

        try {
            // 1. Fetch from API
            const res = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: request.text }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "TTS API Error");
            }

            const blob = await res.blob();

            // 2. Save to Cache (Fire and forget)
            saveAudioToCache(request.text, blob);

            // 3. Return result
            request.resolve(blob);

        } catch (error) {
            console.error("TTS Queue Error:", error);
            request.reject(error);
        } finally {
            this.isProcessing = false;
            // Process next item
            this.processQueue();
        }
    }
}

export const ttsQueue = new TTSQueueManager();
