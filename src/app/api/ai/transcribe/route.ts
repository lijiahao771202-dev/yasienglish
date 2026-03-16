import { NextResponse } from 'next/server';

import {
    LOCAL_SPEECH_DESKTOP_ONLY_MESSAGE,
    LOCAL_SPEECH_MODEL_MISSING_MESSAGE,
    LOCAL_SPEECH_TRANSCRIBE_FAILED_MESSAGE,
} from '@/lib/speech-input';
import { getDesktopSpeechModelStatus, transcribeDesktopWav } from '@/lib/desktop-speech-server';

export const runtime = "nodejs";

export async function GET() {
    if (process.env.YASI_DESKTOP_APP !== "1") {
        return NextResponse.json({
            ready: false,
            mode: "maintenance",
            message: LOCAL_SPEECH_DESKTOP_ONLY_MESSAGE,
        }, { status: 503 });
    }

    const status = getDesktopSpeechModelStatus();
    return NextResponse.json({
        ready: status.status === "ready",
        mode: "local",
        modelStatus: status.status,
        modelPath: status.modelDir,
        message: status.status === "ready" ? "Local Sherpa ASR ready" : LOCAL_SPEECH_MODEL_MISSING_MESSAGE,
    }, { status: status.status === "ready" ? 200 : 503 });
}

export async function POST(request: Request) {
    if (process.env.YASI_DESKTOP_APP !== "1") {
        return NextResponse.json({
            error: "Speech input unavailable",
            details: LOCAL_SPEECH_DESKTOP_ONLY_MESSAGE,
            modelStatus: "missing",
        }, { status: 503 });
    }

    const status = getDesktopSpeechModelStatus();
    if (status.status !== "ready") {
        return NextResponse.json({
            error: "Speech model unavailable",
            details: LOCAL_SPEECH_MODEL_MISSING_MESSAGE,
            modelStatus: status.status,
        }, { status: 503 });
    }

    try {
        const formData = await request.formData();
        const audio = formData.get("audio");

        if (!(audio instanceof File)) {
            return NextResponse.json({
                error: "Missing audio",
                details: "没有收到录音文件。",
                modelStatus: status.status,
            }, { status: 400 });
        }

        const arrayBuffer = await audio.arrayBuffer();
        const text = await transcribeDesktopWav(arrayBuffer);

        return NextResponse.json({
            text,
            mode: "local",
            modelStatus: status.status,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : LOCAL_SPEECH_TRANSCRIBE_FAILED_MESSAGE;
        return NextResponse.json({
            error: "Transcription failed",
            details: message,
            modelStatus: status.status,
        }, { status: 500 });
    }
}
