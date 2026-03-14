import { execFile } from "child_process";
import { existsSync } from "fs";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";

interface WhisperJsonResult {
    text?: string;
    transcription?: Array<{ text?: string }>;
}

function getWhisperPaths() {
    const rootDir = process.cwd();
    const whisperPackageRoot = path.join(rootDir, "node_modules", "@lumen-labs-dev", "whisper-node");

    return {
        whisperCliPath: path.join(whisperPackageRoot, "lib", "whisper.cpp.new", "build", "bin", "whisper-cli"),
        modelPath: path.join(whisperPackageRoot, "lib", "whisper.cpp", "models", "ggml-medium.en.bin"),
        ffmpegBinaryPath: ffmpegPath,
    };
}

function runExecFile(file: string, args: string[], timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
        execFile(file, args, { timeout: timeoutMs }, (error, _stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }

            resolve();
        });
    });
}

export function getLocalWhisperHealth() {
    const { whisperCliPath, modelPath, ffmpegBinaryPath } = getWhisperPaths();

    return {
        ready: Boolean(
            ffmpegBinaryPath
            && existsSync(whisperCliPath)
            && existsSync(modelPath),
        ),
        whisperCliPath,
        modelPath,
        ffmpegBinaryPath,
    };
}

export async function transcribeWithLocalWhisper(audioBuffer: Buffer, prompt?: string) {
    const { ready, whisperCliPath, modelPath, ffmpegBinaryPath } = getLocalWhisperHealth();

    if (!ready || !ffmpegBinaryPath) {
        throw new Error("Local Whisper runtime is not available.");
    }

    const timestamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempDir = os.tmpdir();
    const tempWebmPath = path.join(tempDir, `yasi-whisper-${timestamp}.webm`);
    const tempWavPath = path.join(tempDir, `yasi-whisper-${timestamp}.wav`);
    const outputBasePath = path.join(tempDir, `yasi-whisper-output-${timestamp}`);
    const outputJsonPath = `${outputBasePath}.json`;

    try {
        await fs.writeFile(tempWebmPath, audioBuffer);

        await runExecFile(
            ffmpegBinaryPath,
            ["-i", tempWebmPath, "-ar", "16000", "-ac", "1", "-y", tempWavPath],
            60_000,
        );

        const whisperArgs = [
            "-m",
            modelPath,
            "-f",
            tempWavPath,
            "-l",
            "en",
            ...(prompt ? ["--prompt", prompt.slice(0, 200)] : []),
            "--output-json",
            "-of",
            outputBasePath,
        ];

        await runExecFile(whisperCliPath, whisperArgs, 60_000);

        const rawOutput = await fs.readFile(outputJsonPath, "utf8");
        const result = JSON.parse(rawOutput) as WhisperJsonResult;
        const text = Array.isArray(result.transcription)
            ? result.transcription.map((item) => item.text || "").join(" ").trim()
            : (result.text || "").trim();

        return {
            text,
            segments: result.transcription ?? [],
        };
    } finally {
        await Promise.allSettled([
            fs.rm(tempWebmPath, { force: true }),
            fs.rm(tempWavPath, { force: true }),
            fs.rm(outputJsonPath, { force: true }),
        ]);
    }
}
