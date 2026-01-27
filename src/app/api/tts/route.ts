import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { EdgeTTS } from "@andresaya/edge-tts";

export async function POST(req: Request) {
    let step = "Init";
    let tempFile = "";

    try {
        const { text, voice = "en-US-JennyNeural", rate = "+0%" } = await req.json();

        if (!text) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
        }

        step = "Setup";
        const tts = new EdgeTTS();

        // Create a temp file path
        const tempDir = os.tmpdir();
        const fileName = `tts-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`;
        tempFile = path.join(tempDir, fileName);

        // EdgeTTS Generation with Fallback
        try {
            step = "Generating (Faster)";
            await tts.synthesize(text, voice, {
                rate: rate,
                outputFormat: "audio-24khz-48kbitrate-mono-mp3"
            });
        } catch (initialError) {
            console.warn("[TTS] Rate adjustment failed, retrying with default speed:", initialError);
            step = "Generating (Fallback)";
            // Retry without rate
            await tts.synthesize(text, voice, {
                outputFormat: "audio-24khz-48kbitrate-mono-mp3"
            });
        }

        step = "Getting Buffer";
        // Get the buffer directly from the instance
        const audioBuffer = tts.toBuffer();

        if (audioBuffer.length === 0) {
            throw new Error("Generated audio buffer is empty");
        }

        // Get Word Boundaries (Timestamps)
        const marks = tts.getWordBoundaries().map(item => ({
            time: item.offset / 10000, // Convert 100ns units to ms
            type: "word",
            start: item.offset / 10000,
            end: (item.offset + item.duration) / 10000,
            value: item.text
        }));

        // Convert buffer to base64
        const audioBase64 = audioBuffer.toString('base64');

        return NextResponse.json({
            audio: `data:audio/mp3;base64,${audioBase64}`,
            marks: marks
        });
    } catch (error: any) {
        console.error(`[TTS] Error at step ${step}:`, error);

        // DEBUG LOGGING
        try {
            const logMsg = `[${new Date().toISOString()}] Step: ${step} | Error: ${error.message} | Stack: ${error.stack}\n`;
            fs.appendFileSync(path.join(process.cwd(), "tts_error.log"), logMsg);
        } catch (e) {
            console.error("Failed to write log", e);
        }

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
