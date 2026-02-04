import { NextRequest } from "next/server";
import { EdgeTTS } from "@andresaya/edge-tts";

export async function POST(req: NextRequest) {
    try {
        const { text, voice = "en-US-JennyNeural", rate = "+0%" } = await req.json();

        if (!text) {
            return new Response(JSON.stringify({ error: "Text is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const tts = new EdgeTTS();

        // Create a readable stream that yields audio chunks
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of tts.synthesizeStream(text, voice, {
                        rate: rate,
                        outputFormat: "audio-24khz-48kbitrate-mono-mp3"
                    })) {
                        controller.enqueue(chunk);
                    }
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
