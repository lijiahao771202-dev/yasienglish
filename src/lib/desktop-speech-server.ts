import "server-only";

import fs from "fs";
import path from "path";

import { OnlineRecognizer } from "sherpa-onnx-node";

import { parseWavPcm16 } from "@/lib/speech-audio";

const MODEL_REQUIRED_FILES = {
    encoder: "encoder-epoch-99-avg-1.int8.onnx",
    decoder: "decoder-epoch-99-avg-1.onnx",
    joiner: "joiner-epoch-99-avg-1.int8.onnx",
    tokens: "tokens.txt",
};

type SpeechModelState = "missing" | "downloading" | "ready" | "failed";

let cachedRecognizer: OnlineRecognizer | null = null;
let cachedModelDir: string | null = null;

function resolveActiveModelDir() {
    const candidates = [
        process.env.YASI_SPEECH_DEV_MODEL_DIR,
        process.env.YASI_SPEECH_MODEL_DIR,
    ].filter((value): value is string => Boolean(value));

    return candidates.find((candidate) => validateModelDirectory(candidate)) || candidates[0] || "";
}

export function validateModelDirectory(modelDir: string) {
    if (!modelDir || !fs.existsSync(modelDir)) {
        return false;
    }

    return Object.values(MODEL_REQUIRED_FILES).every((fileName) => fs.existsSync(path.join(modelDir, fileName)));
}

export function getDesktopSpeechModelStatus() {
    const modelDir = resolveActiveModelDir();
    const ready = validateModelDirectory(modelDir);

    return {
        status: (ready ? "ready" : "missing") as SpeechModelState,
        modelDir,
    };
}

function getRecognizer(modelDir: string) {
    if (cachedRecognizer && cachedModelDir === modelDir) {
        return cachedRecognizer;
    }

    cachedRecognizer = new OnlineRecognizer({
        featConfig: {
            sampleRate: 16000,
            featureDim: 80,
        },
        modelConfig: {
            transducer: {
                encoder: path.join(modelDir, MODEL_REQUIRED_FILES.encoder),
                decoder: path.join(modelDir, MODEL_REQUIRED_FILES.decoder),
                joiner: path.join(modelDir, MODEL_REQUIRED_FILES.joiner),
            },
            tokens: path.join(modelDir, MODEL_REQUIRED_FILES.tokens),
            numThreads: 2,
            provider: "cpu",
        },
        decodingMethod: "greedy_search",
        enableEndpoint: false,
    });
    cachedModelDir = modelDir;

    return cachedRecognizer;
}

export async function transcribeDesktopWav(arrayBuffer: ArrayBuffer) {
    const { status, modelDir } = getDesktopSpeechModelStatus();
    if (status !== "ready" || !modelDir) {
        throw new Error("本地语音模型还没有准备好。");
    }

    const parsed = parseWavPcm16(arrayBuffer);
    const recognizer = getRecognizer(modelDir);
    const stream = recognizer.createStream();
    const frameSize = 1600;

    for (let start = 0; start < parsed.samples.length; start += frameSize) {
        const end = Math.min(parsed.samples.length, start + frameSize);
        const chunk = parsed.samples.slice(start, end);
        stream.acceptWaveform({
            samples: chunk,
            sampleRate: parsed.sampleRate,
        });

        while (recognizer.isReady(stream)) {
            recognizer.decode(stream);
        }
    }

    stream.inputFinished();

    while (recognizer.isReady(stream)) {
        recognizer.decode(stream);
    }

    return recognizer.getResult(stream).text.trim();
}
