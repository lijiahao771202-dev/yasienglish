const { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } = require("fs");
const fs = require("fs/promises");
const { execFile } = require("child_process");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const SPEECH_MODEL_ARCHIVE_URL =
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17.tar.bz2";
const SPEECH_MODEL_ASSET_DIRNAME = "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17";
const SPEECH_MODEL_DIRNAME = "en-us";
const SPEECH_MODEL_REQUIRED_FILES = [
    "encoder-epoch-99-avg-1.int8.onnx",
    "decoder-epoch-99-avg-1.onnx",
    "joiner-epoch-99-avg-1.int8.onnx",
    "tokens.txt",
];

function createSpeechModelController({ app, BrowserWindow }) {
    let state = {
        status: "missing",
        modelPath: "",
        downloadedBytes: 0,
        totalBytes: null,
        error: null,
    };
    let downloadPromise = null;

    function broadcast(channel, payload) {
        for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) {
                window.webContents.send(channel, payload);
            }
        }
    }

    function publish(nextState) {
        state = {
            ...state,
            ...nextState,
        };
        broadcast("speech-model:status", state);
        broadcast("speech-model:progress", state);
        return state;
    }

    function getDevelopmentModelRoot() {
        return path.join(app.getAppPath(), ".cache", "speech-models", SPEECH_MODEL_DIRNAME);
    }

    function getProductionModelRoot() {
        return path.join(app.getPath("userData"), "models", "asr", SPEECH_MODEL_DIRNAME);
    }

    function getArchiveDownloadDir() {
        return path.join(app.getPath("userData"), "models", "downloads");
    }

    function getExpectedModelRoot() {
        return app.isPackaged ? getProductionModelRoot() : getDevelopmentModelRoot();
    }

    function validateModelRoot(modelRoot) {
        if (!modelRoot || !existsSync(modelRoot)) {
            return false;
        }

        return SPEECH_MODEL_REQUIRED_FILES.every((fileName) => existsSync(path.join(modelRoot, fileName)));
    }

    function inspectCurrentState() {
        const modelRoot = getExpectedModelRoot();
        if (validateModelRoot(modelRoot)) {
            return publish({
                status: "ready",
                modelPath: modelRoot,
                downloadedBytes: 0,
                totalBytes: null,
                error: null,
            });
        }

        return publish({
            status: state.status === "failed" ? "failed" : "missing",
            modelPath: modelRoot,
            downloadedBytes: 0,
            totalBytes: null,
            error: state.status === "failed" ? state.error : null,
        });
    }

    async function downloadToFile(url, targetFile) {
        const response = await fetch(url);
        if (!response.ok || !response.body) {
            throw new Error(`模型下载失败 (${response.status})`);
        }

        const totalBytesHeader = response.headers.get("content-length");
        const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
        const writer = createWriteStream(targetFile);
        const reader = response.body.getReader();
        let downloadedBytes = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            writer.write(Buffer.from(value));
            downloadedBytes += value.byteLength;
            publish({
                status: "downloading",
                downloadedBytes,
                totalBytes,
                error: null,
            });
        }

        writer.end();
        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });
    }

    async function extractArchive(archivePath, extractionRoot) {
        mkdirSync(extractionRoot, { recursive: true });
        await execFileAsync("tar", ["-xjf", archivePath, "-C", extractionRoot]);
    }

    async function finalizeExtractedModel(extractionRoot, targetRoot) {
        const directCandidate = path.join(extractionRoot, SPEECH_MODEL_ASSET_DIRNAME);
        const nestedRoot = existsSync(directCandidate)
            ? directCandidate
            : readdirSync(extractionRoot, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => path.join(extractionRoot, entry.name))
                .find((entryPath) => validateModelRoot(entryPath));

        if (!nestedRoot || !validateModelRoot(nestedRoot)) {
            throw new Error("下载完成，但没有找到可用的 Sherpa 英文模型文件。");
        }

        rmSync(targetRoot, { recursive: true, force: true });
        mkdirSync(path.dirname(targetRoot), { recursive: true });
        await fs.rename(nestedRoot, targetRoot);

        if (!validateModelRoot(targetRoot)) {
            throw new Error("Sherpa 英文模型校验失败。");
        }
    }

    async function downloadSpeechModel() {
        if (downloadPromise) {
            return downloadPromise;
        }

        const targetRoot = getExpectedModelRoot();
        const downloadsRoot = getArchiveDownloadDir();
        const archivePath = path.join(downloadsRoot, `${SPEECH_MODEL_ASSET_DIRNAME}.tar.bz2`);
        const extractionRoot = path.join(downloadsRoot, `${SPEECH_MODEL_ASSET_DIRNAME}-extract`);

        mkdirSync(downloadsRoot, { recursive: true });

        downloadPromise = (async () => {
            try {
                publish({
                    status: "downloading",
                    modelPath: targetRoot,
                    downloadedBytes: 0,
                    totalBytes: null,
                    error: null,
                });

                rmSync(archivePath, { force: true });
                rmSync(extractionRoot, { recursive: true, force: true });

                await downloadToFile(SPEECH_MODEL_ARCHIVE_URL, archivePath);
                await extractArchive(archivePath, extractionRoot);
                await finalizeExtractedModel(extractionRoot, targetRoot);

                rmSync(archivePath, { force: true });
                rmSync(extractionRoot, { recursive: true, force: true });

                return publish({
                    status: "ready",
                    modelPath: targetRoot,
                    downloadedBytes: 0,
                    totalBytes: null,
                    error: null,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : "本地语音模型下载失败。";
                return publish({
                    status: "failed",
                    modelPath: targetRoot,
                    downloadedBytes: 0,
                    totalBytes: null,
                    error: message,
                });
            } finally {
                downloadPromise = null;
            }
        })();

        return downloadPromise;
    }

    function initializeEnv() {
        process.env.YASI_DESKTOP_APP = "1";
        process.env.YASI_SPEECH_MODEL_DIR = getProductionModelRoot();
        process.env.YASI_SPEECH_DEV_MODEL_DIR = getDevelopmentModelRoot();
    }

    function getSpeechModelPath() {
        return state.modelPath || getExpectedModelRoot();
    }

    return {
        initializeEnv,
        inspectCurrentState,
        getSpeechModelStatus: () => inspectCurrentState(),
        getSpeechModelPath,
        downloadSpeechModel,
    };
}

module.exports = {
    createSpeechModelController,
};
