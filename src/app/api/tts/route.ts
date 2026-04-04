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

interface SegmentTiming {
    index: number;
    startMs: number;
    endMs: number;
}

interface CachedTtsPayload {
    audio: string;
    marks: TtsMark[];
    segmentTimings?: SegmentTiming[];
}

interface CachedTtsMeta {
    marks: TtsMark[];
    segmentTimings?: SegmentTiming[];
}

interface TtsSegmentInput {
    text: string;
    voice: string;
    rate: string;
}

const inflightSynthesis = new Map<string, Promise<CachedTtsPayload>>();
const SEGMENT_TAIL_BUFFER_MS = 76;
const SEGMENT_CACHE_VERSION = "segment-rates-v4";
const EDGE_TTS_OUTPUT_BITRATE_BPS = 48_000;

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

function normalizeTtsRate(input: unknown, fallback = "+0%") {
    if (typeof input === "number" && Number.isFinite(input)) {
        const rounded = Math.round(input);
        return `${rounded >= 0 ? "+" : ""}${rounded}%`;
    }

    if (typeof input === "string") {
        const parsed = Number.parseFloat(input.replace("%", "").trim());
        if (Number.isFinite(parsed)) {
            const rounded = Math.round(parsed);
            return `${rounded >= 0 ? "+" : ""}${rounded}%`;
        }
    }

    return fallback;
}

function rateToDurationFactor(rate: string) {
    const parsed = Number.parseFloat(rate.replace("%", "").trim());
    if (!Number.isFinite(parsed)) {
        return 1;
    }

    const speedFactor = 1 + parsed / 100;
    if (!Number.isFinite(speedFactor) || speedFactor <= 0) {
        return 1;
    }

    return Math.min(1.6, Math.max(0.7, 1 / speedFactor));
}

function estimateSegmentTailPauseMs(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
        return 80;
    }

    if (/(\.{3,}|…+)\s*$/.test(trimmed)) {
        return 180;
    }

    if (/[?？]\s*$/.test(trimmed)) {
        return 130;
    }

    if (/[!！]\s*$/.test(trimmed)) {
        return 110;
    }

    if (/[.。]\s*$/.test(trimmed)) {
        return 120;
    }

    const commaLikeCount = (trimmed.match(/[,，;；:：]/g) ?? []).length;
    if (commaLikeCount > 0) {
        return Math.min(105, 56 + commaLikeCount * 14);
    }

    return 72;
}

function estimateDurationFromText(text: string, rate: string) {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const compactLength = text.replace(/\s+/g, "").length;
    const lexicalEstimate = Math.max(wordCount * 380, compactLength * 26, 700);
    return Math.round(lexicalEstimate * rateToDurationFactor(rate));
}

function estimateDurationFromAudioBytes(byteLength: number) {
    if (!Number.isFinite(byteLength) || byteLength <= 0) {
        return 0;
    }

    // outputFormat is fixed at 48kbps mono mp3; bytes -> ms gives a close segment duration proxy.
    return Math.round((byteLength * 8 * 1000) / EDGE_TTS_OUTPUT_BITRATE_BPS);
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

function getSegmentDurationMs(segmentText: string, marks: TtsMark[], rate: string, audioByteLength: number) {
    const lastBoundary = marks.reduce((max, mark) => Math.max(max, mark.end || mark.time || 0), 0);
    const punctuationTailMs = estimateSegmentTailPauseMs(segmentText);
    const markBasedDuration = lastBoundary > 0
        ? lastBoundary + Math.max(SEGMENT_TAIL_BUFFER_MS, punctuationTailMs)
        : 0;
    const bytesDuration = estimateDurationFromAudioBytes(audioByteLength);
    const textEstimateDuration = estimateDurationFromText(segmentText, rate);

    if (markBasedDuration > 0) {
        if (bytesDuration > 0) {
            const boundedByBytes = Math.min(
                Math.max(markBasedDuration, bytesDuration - 120),
                bytesDuration + 90,
            );
            return Math.max(markBasedDuration, boundedByBytes);
        }

        return Math.max(markBasedDuration, 420);
    }

    if (bytesDuration > 0) {
        return Math.max(Math.round(bytesDuration * 0.88), 520);
    }

    return Math.max(Math.round(textEstimateDuration * 0.74), 700);
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
            segmentTimings: cachedMeta.segmentTimings,
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

function normalizeSegmentsInput(rawSegments: unknown, fallbackVoice: string, fallbackRate: string) {
    if (!Array.isArray(rawSegments)) {
        return [];
    }

    return rawSegments
        .map((item) => {
            const text = normalizeTtsText((item as { text?: unknown })?.text ?? "");
            const voice = typeof (item as { voice?: unknown })?.voice === "string"
                ? (item as { voice?: string }).voice ?? fallbackVoice
                : fallbackVoice;
            const rate = normalizeTtsRate((item as { rate?: unknown })?.rate, fallbackRate);
            if (!text) {
                return null;
            }
            return {
                text,
                voice,
                rate,
            } satisfies TtsSegmentInput;
        })
        .filter((segment): segment is TtsSegmentInput => Boolean(segment));
}

async function getOrCreateSegmentPayload(segments: TtsSegmentInput[]) {
    if (segments.length === 0) {
        throw new Error("Segments are empty");
    }

    const cacheKey = buildCacheKey(JSON.stringify(segments), "multi", SEGMENT_CACHE_VERSION);
    const cachedMeta = await readCachedMeta(cacheKey);
    const hasUsableSegmentTimings = Array.isArray(cachedMeta?.segmentTimings)
        && cachedMeta.segmentTimings.length === segments.length
        && cachedMeta.segmentTimings.every((timing) => (
            Number.isFinite(timing?.startMs)
            && Number.isFinite(timing?.endMs)
            && timing.endMs > timing.startMs
        ));

    if (cachedMeta && hasUsableSegmentTimings) {
        const { audioPath } = getCachePaths(cacheKey);
        await fs.promises.access(audioPath, fs.constants.R_OK);
        return {
            audio: buildAudioUrl(cacheKey),
            marks: cachedMeta.marks,
            segmentTimings: cachedMeta.segmentTimings,
        };
    }

    const existingPromise = inflightSynthesis.get(cacheKey);
    if (existingPromise) {
        return existingPromise;
    }

    const synthesisPromise = (async () => {
        const synthesized = await Promise.all(
            segments.map(async (segment) => {
                const payload = await synthesizePayload(segment.text, segment.voice, segment.rate);
                return { ...payload, segment };
            }),
        );

        const combinedAudio = Buffer.concat(synthesized.map((item) => item.audioBuffer));
        const mergedMarks: TtsMark[] = [];
        let offsetMs = 0;
        const segmentTimings: SegmentTiming[] = [];

        synthesized.forEach((item, index) => {
            const segmentDuration = getSegmentDurationMs(
                item.segment.text,
                item.marks,
                item.segment.rate,
                item.audioBuffer.length,
            );
            const segmentStartMs = Math.max(0, Math.round(offsetMs));
            const segmentEndMs = Math.max(segmentStartMs + 1, Math.round(segmentStartMs + segmentDuration));
            segmentTimings.push({
                index: index + 1,
                startMs: segmentStartMs,
                endMs: segmentEndMs,
            });

            item.marks.forEach((mark) => {
                mergedMarks.push({
                    ...mark,
                    time: Math.max(0, Math.round(mark.time + offsetMs)),
                    start: Math.max(0, Math.round(mark.start + offsetMs)),
                    end: Math.max(0, Math.round(mark.end + offsetMs)),
                });
            });

            offsetMs = segmentEndMs;
        });

        await writeCachedPayload(cacheKey, combinedAudio, { marks: mergedMarks, segmentTimings });
        return {
            audio: buildAudioUrl(cacheKey),
            marks: mergedMarks,
            segmentTimings,
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
        const { text, segments, voice = DEFAULT_TTS_VOICE, rate = "+0%" } = await req.json();
        const normalizedRate = normalizeTtsRate(rate);
        const normalizedSegments = normalizeSegmentsInput(segments, voice, normalizedRate);

        step = "Generating";
        if (normalizedSegments.length === 0 && !text) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
        }

        const payload = normalizedSegments.length > 0
            ? await getOrCreateSegmentPayload(normalizedSegments)
            : await getOrCreatePayload(text, voice, normalizedRate);

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
