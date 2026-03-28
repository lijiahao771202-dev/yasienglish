import { NextRequest } from "next/server";
import { EdgeTTS } from "@andresaya/edge-tts";
import { DEFAULT_TTS_VOICE } from "@/lib/profile-settings";

// Keep a warm TTS instance for faster subsequent requests
let warmTts: EdgeTTS | null = null;

export async function POST(req: NextRequest) {
    try {
        const { text, voice = DEFAULT_TTS_VOICE, rate = "+0%" } = await req.json();

        if (!text) {
            return new Response(JSON.stringify({ error: "Text is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Use existing or create new TTS instance
        const tts = new EdgeTTS();

        // Use lower bitrate for faster first chunk delivery
        // audio-16khz-32kbitrate-mono-mp3 is smaller = faster first chunk
        const outputFormat = "audio-16khz-32kbitrate-mono-mp3";

        // Create a readable stream that yields audio chunks immediately
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    let chunkCount = 0;
                    for await (const chunk of tts.synthesizeStream(text, voice, {
                        rate: rate,
                        outputFormat: outputFormat
                    })) {
                        controller.enqueue(chunk);
                        chunkCount++;
                    }
                    console.log(`[TTS Stream] Sent ${chunkCount} chunks`);
                    controller.close();
                } catch (error) {
                    console.error("[TTS Stream] Error:", error);
                    controller.error(error);
                }
            }
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "audio/mpeg",
                "Transfer-Encoding": "chunked",
                "Cache-Control": "no-cache",
                "X-Content-Type-Options": "nosniff",
            }
        });

    } catch (error: any) {
        console.error("[TTS Stream] Error:", error);
        return new Response(JSON.stringify({
            error: "TTS Stream Failed",
            details: error.message || "Unknown error"
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
