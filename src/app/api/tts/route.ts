import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { EdgeTTS } from "@andresaya/edge-tts";
import { DEFAULT_TTS_VOICE } from "@/lib/profile-settings";

interface TtsMark {
    time: number;
    type: string;
    start: number;
    end: number;
    value: string;
}

interface CachedTtsPayload {
    audio: string;
    marks: TtsMark[];
}

interface CachedTtsMeta {
    marks: TtsMark[];
}

const inflightSynthesis = new Map<string, Promise<CachedTtsPayload>>();

async function runSynthesis(
    tts: EdgeTTS,
    text: string,
    voice: string,
    rate?: string,
) {
    let timeoutId: NodeJS.Timeout | null = null;
    const generationPromise = tts.synthesize(text, voice, {
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
            ...(rate ? { rate } : {}),
        }).then(() => Buffer.from(tts.toBuffer()));

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

function getTtsCacheDir() {
    return process.env.YASI_TTS_CACHE_DIR || path.join(os.tmpdir(), "yasi-tts-cache");
}

function buildCacheKey(text: string, voice: string, rate: string) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify({ text, voice, rate }))
        .digest("hex");
}

function getCachePaths(cacheKey: string) {
    const cacheDir = getTtsCacheDir();
    return {
        cacheDir,
        audioPath: path.join(cacheDir, `${cacheKey}.mp3`),
        metaPath: path.join(cacheDir, `${cacheKey}.json`),
        tmpAudioPath: path.join(cacheDir, `${cacheKey}.${process.pid}.${Date.now()}.mp3.tmp`),
        tmpMetaPath: path.join(cacheDir, `${cacheKey}.${process.pid}.${Date.now()}.json.tmp`),
    };
}

function buildAudioUrl(cacheKey: string) {
    return `/api/tts?key=${cacheKey}`;
}

function isValidCacheKey(cacheKey: string) {
    return /^[a-f0-9]{64}$/i.test(cacheKey);
}

async function readCachedMeta(cacheKey: string) {
    const { audioPath, metaPath } = getCachePaths(cacheKey);
    try {
        await fs.promises.access(audioPath, fs.constants.R_OK);
        const raw = await fs.promises.readFile(metaPath, "utf8");
        return JSON.parse(raw) as CachedTtsMeta;
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError?.code === "ENOENT") {
            return null;
        }

        console.warn("[TTS] Failed to read cache payload, regenerating.", error);
        return null;
    }
}

async function writeCachedPayload(cacheKey: string, audioBuffer: Buffer, payload: CachedTtsMeta) {
    const { cacheDir, audioPath, metaPath, tmpAudioPath, tmpMetaPath } = getCachePaths(cacheKey);
    await fs.promises.mkdir(cacheDir, { recursive: true });
    await fs.promises.writeFile(tmpAudioPath, audioBuffer);
    await fs.promises.writeFile(tmpMetaPath, JSON.stringify(payload), "utf8");
    await fs.promises.rename(tmpAudioPath, audioPath);
    await fs.promises.rename(tmpMetaPath, metaPath);
}

function normalizeTtsText(input: string) {
    const normalized = input
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!normalized) {
        return "";
    }

    if (/[.!?。！？…]["')\]）】》」』”’]*$/.test(normalized)) {
        return normalized;
    }

    if (/[\p{L}\p{N}"')\]）】》」』”’]$/u.test(normalized)) {
        return `${normalized}.`;
    }

    return normalized;
}

async function synthesizePayload(text: string, voice: string, rate: string) {
    const normalizedText = normalizeTtsText(text);

    if (!normalizedText) {
        throw new Error("Normalized TTS text is empty");
    }

    let audioBuffer: Buffer;
    let marks: TtsMark[] = [];

    try {
        const primaryTts = new EdgeTTS();
        audioBuffer = await runSynthesis(primaryTts, normalizedText, voice, rate);
        if (typeof primaryTts.getWordBoundaries === "function") {
            marks = primaryTts.getWordBoundaries().map((item) => ({
                time: item.offset / 10000,
                type: "word",
                start: item.offset / 10000,
                end: (item.offset + item.duration) / 10000,
                value: item.text,
            }));
        }
    } catch (initialError) {
        console.warn("[TTS] Rate-adjusted synthesis failed, retrying without rate.", initialError);
        const fallbackTts = new EdgeTTS();
        audioBuffer = await runSynthesis(fallbackTts, normalizedText, voice);
        if (typeof fallbackTts.getWordBoundaries === "function") {
            marks = fallbackTts.getWordBoundaries().map((item) => ({
                time: item.offset / 10000,
                type: "word",
                start: item.offset / 10000,
                end: (item.offset + item.duration) / 10000,
                value: item.text,
            }));
        }
    }

    if (audioBuffer.length === 0) {
        throw new Error("Generated audio buffer is empty");
    }

    return {
        audioBuffer,
        marks,
    };
}

async function getOrCreatePayload(text: string, voice: string, rate: string) {
    const normalizedText = normalizeTtsText(text);

    if (!normalizedText) {
        throw new Error("Normalized TTS text is empty");
    }

    const cacheKey = buildCacheKey(normalizedText, voice, rate);
    const cachedMeta = await readCachedMeta(cacheKey);
    if (cachedMeta) {
        const { audioPath } = getCachePaths(cacheKey);
        await fs.promises.access(audioPath, fs.constants.R_OK);
        return {
            audio: buildAudioUrl(cacheKey),
            marks: cachedMeta.marks,
        };
    }

    const existingPromise = inflightSynthesis.get(cacheKey);
    if (existingPromise) {
        return existingPromise;
    }

    const synthesisPromise = (async () => {
        const payload = await synthesizePayload(normalizedText, voice, rate);
        await writeCachedPayload(cacheKey, payload.audioBuffer, { marks: payload.marks });
        return {
            audio: buildAudioUrl(cacheKey),
            marks: payload.marks,
        };
    })();

    inflightSynthesis.set(cacheKey, synthesisPromise);

    try {
        return await synthesisPromise;
    } finally {
        inflightSynthesis.delete(cacheKey);
    }
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const cacheKey = searchParams.get("key");

    if (!cacheKey || !isValidCacheKey(cacheKey)) {
        return new Response("Not found", { status: 404 });
    }

    const { audioPath } = getCachePaths(cacheKey);

    try {
        const audioBuffer = await fs.promises.readFile(audioPath);
        return new Response(audioBuffer, {
            status: 200,
            headers: {
                "Content-Type": "audio/mpeg",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError?.code === "ENOENT") {
            return new Response("Not found", { status: 404 });
        }

        console.error("[TTS] Failed to read cached audio:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}

export async function POST(req: Request) {
    let step = "Init";

    try {
        const { text, voice = DEFAULT_TTS_VOICE, rate = "+0%" } = await req.json();

        if (!text) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
        }

        step = "Generating";
        const payload = await getOrCreatePayload(text, voice, rate);

        return NextResponse.json(payload);
    } catch (error: unknown) {
        console.error(`[TTS] Error at step ${step}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        // DEBUG LOGGING
        try {
            const logMsg = `[${new Date().toISOString()}] Step: ${step} | Error: ${errorMessage} | Stack: ${errorStack ?? "N/A"}\n`;
            fs.appendFileSync(path.join(process.cwd(), "tts_error.log"), logMsg);
        } catch (e) {
            console.error("Failed to write log", e);
        }

        return NextResponse.json({
            error: `TTS Failed at ${step} (${new Date().toLocaleTimeString()})`,
            details: errorMessage || "Unknown error",
            raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
            stack: errorStack
        }, { status: 500 });
    }
}
