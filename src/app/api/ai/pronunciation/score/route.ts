import { NextResponse } from "next/server";

import { normalizePronunciationPayload, toLegacyListeningSegments } from "@/lib/pronunciation-scoring";
import { PronunciationServiceError, getPronunciationServiceHealth, scorePronunciationWithService } from "@/lib/pronunciation-service";
import { parseWavPcm16 } from "@/lib/speech-audio";

export const runtime = "nodejs";

const MIN_DURATION_MS = 700;
const MIN_RMS = 0.008;

function computeRms(samples: Float32Array) {
    if (samples.length === 0) return 0;
    let sum = 0;
    for (let index = 0; index < samples.length; index += 1) {
        sum += samples[index] * samples[index];
    }
    return Math.sqrt(sum / samples.length);
}

export async function GET() {
    if (process.env.YASI_DESKTOP_APP !== "1") {
        return NextResponse.json({
            ready: false,
            engine: "charsiu",
            message: "本地发音评分目前只在桌面 App 提供。",
        }, { status: 503 });
    }

    try {
        const health = await getPronunciationServiceHealth();
        return NextResponse.json({
            ready: true,
            engine: typeof health.engine === "string" ? health.engine : "charsiu",
            engine_version: typeof health.engine_version === "string" ? health.engine_version : "unknown",
            backend: typeof health.backend === "string" ? health.backend : "unknown",
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "本地发音评分服务不可用。";
        return NextResponse.json({
            ready: false,
            engine: "charsiu",
            message,
        }, { status: error instanceof PronunciationServiceError ? error.status : 503 });
    }
}

export async function POST(request: Request) {
    if (process.env.YASI_DESKTOP_APP !== "1") {
        return NextResponse.json({
            error: "Pronunciation scoring unavailable",
            details: "本地发音评分目前只在桌面 App 提供。",
        }, { status: 503 });
    }

    try {
        const formData = await request.formData();
        const audio = formData.get("audio");
        const referenceText = typeof formData.get("reference_english") === "string"
            ? String(formData.get("reference_english")).trim()
            : "";
        const currentElo = typeof formData.get("current_elo") === "string"
            ? Number(formData.get("current_elo"))
            : undefined;
        if (!(audio instanceof File)) {
            return NextResponse.json({
                error: "Missing audio",
                details: "没有收到跟读录音。",
            }, { status: 400 });
        }

        if (!referenceText) {
            return NextResponse.json({
                error: "Missing reference text",
                details: "缺少参考句，无法进行发音评分。",
            }, { status: 400 });
        }

        const arrayBuffer = await audio.arrayBuffer();
        const parsed = parseWavPcm16(arrayBuffer);
        const durationMs = (parsed.samples.length / parsed.sampleRate) * 1000;
        const rms = computeRms(parsed.samples);

        if (durationMs < MIN_DURATION_MS) {
            return NextResponse.json({
                error: "Audio too short",
                details: "录音太短，先完整跟读一句再提交。",
            }, { status: 400 });
        }

        if (rms < MIN_RMS) {
            return NextResponse.json({
                error: "Audio too quiet",
                details: "录音音量太低，请靠近麦克风后再试一次。",
            }, { status: 400 });
        }

        const rawPayload = await scorePronunciationWithService({
            audioBase64: Buffer.from(arrayBuffer).toString("base64"),
            referenceText,
            eloRating: Number.isFinite(currentElo) ? currentElo : undefined,
        });

        const normalized = normalizePronunciationPayload(rawPayload);

        return NextResponse.json({
            ...normalized,
            segments: toLegacyListeningSegments(normalized.word_results),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "本地发音评分失败。";
        return NextResponse.json({
            error: "Pronunciation scoring failed",
            details: message,
        }, { status: error instanceof PronunciationServiceError ? error.status : 500 });
    }
}
