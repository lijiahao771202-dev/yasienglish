import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { EdgeTTS } from "@andresaya/edge-tts";

export async function POST(req: Request) {
    let step = "Init";
    let tempFile = "";

    try {
        const { text, voice = "en-US-JennyNeural" } = await req.json();

        if (!text) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
        }

        step = "Setup";
        const tts = new EdgeTTS();

        // Create a temp file path
        const tempDir = os.tmpdir();
        const fileName = `tts-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`;
        tempFile = path.join(tempDir, fileName);

        step = "Generating (@andresaya/edge-tts)";
        // edge-tts generates buffer internally
        await tts.synthesize(text, voice, {
            outputFormat: "audio-24khz-48kbitrate-mono-mp3"
        });
        
        step = "Getting Buffer";
        // Get the buffer directly from the instance
        const audioBuffer = tts.toBuffer();

        if (audioBuffer.length === 0) {
            throw new Error("Generated audio buffer is empty");
        }

        return new NextResponse(audioBuffer, {
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": audioBuffer.length.toString(),
            },
        });
    } catch (error: any) {
        console.error(`[TTS] Error at step ${step}:`, error);

        // Attempt cleanup if failed
        if (tempFile && fs.existsSync(tempFile)) {
            try {
                fs.unlinkSync(tempFile);
            } catch (e) {
                console.error("Failed to cleanup temp file:", e);
            }
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        return NextResponse.json({
            error: `TTS Failed at ${step} (${new Date().toLocaleTimeString()})`,
            details: errorMessage || "Unknown error",
            raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
            stack: errorStack
        }, { status: 500 });
    }
}
