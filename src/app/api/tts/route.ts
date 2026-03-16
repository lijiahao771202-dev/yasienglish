import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { EdgeTTS } from "@andresaya/edge-tts";

async function collectSynthesis(
    tts: EdgeTTS,
    text: string,
    voice: string,
    rate?: string,
) {
    let timeoutId: NodeJS.Timeout | null = null;
    const generationPromise = (async () => {
        const audioChunks: Uint8Array[] = [];

        for await (const chunk of tts.synthesizeStream(text, voice, {
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
            ...(rate ? { rate } : {}),
        })) {
            audioChunks.push(chunk);
        }

        return Buffer.concat(audioChunks.map((chunk) => Buffer.from(chunk)));
    })();

    try {
        return await Promise.race([
            generationPromise,
            new Promise<Buffer>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error("Edge TTS request timed out"));
                }, 12000);
            }),
        ]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
}

export async function POST(req: Request) {
    let step = "Init";

    try {
        const { text, voice = "en-US-JennyNeural", rate = "+0%" } = await req.json();

        if (!text) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
        }

        step = "Setup";
        const tts = new EdgeTTS();

        step = "Generating";
        let audioBuffer: Buffer;

        try {
            audioBuffer = await collectSynthesis(tts, text, voice, rate);
        } catch (initialError) {
            console.warn("[TTS] Rate-adjusted synthesis failed, retrying without rate.", initialError);
            step = "Generating Fallback";
            audioBuffer = await collectSynthesis(tts, text, voice);
        }

        if (audioBuffer.length === 0) {
            throw new Error("Generated audio buffer is empty");
        }

        const marks: Array<{
            time: number;
            type: string;
            start: number;
            end: number;
            value: string;
        }> = [];

        if (typeof tts.getWordBoundaries === "function") {
            marks.push(...tts.getWordBoundaries().map((item) => ({
                time: item.offset / 10000,
                type: "word",
                start: item.offset / 10000,
                end: (item.offset + item.duration) / 10000,
                value: item.text,
            })));
        }

        const audioBase64 = audioBuffer.toString("base64");

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
