import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const MODEL_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17.tar.bz2";
const MODEL_DIRNAME = "en-us";
const ASSET_DIRNAME = "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17";
const REQUIRED_FILES = [
    "encoder-epoch-99-avg-1.int8.onnx",
    "decoder-epoch-99-avg-1.onnx",
    "joiner-epoch-99-avg-1.int8.onnx",
    "tokens.txt",
];

const rootDir = process.cwd();
const cacheRoot = path.join(rootDir, ".cache", "speech-models");
const targetDir = path.join(cacheRoot, MODEL_DIRNAME);
const downloadsDir = path.join(cacheRoot, "downloads");
const archivePath = path.join(downloadsDir, `${ASSET_DIRNAME}.tar.bz2`);
const extractionDir = path.join(downloadsDir, `${ASSET_DIRNAME}-extract`);

function validate(dir) {
    return REQUIRED_FILES.every((fileName) => fs.existsSync(path.join(dir, fileName)));
}

if (validate(targetDir)) {
    console.log(`Sherpa model already ready at ${targetDir}`);
    process.exit(0);
}

fs.mkdirSync(downloadsDir, { recursive: true });
fs.rmSync(archivePath, { force: true });
fs.rmSync(extractionDir, { recursive: true, force: true });

console.log(`Downloading Sherpa model from ${MODEL_URL}`);
execFileSync("curl", ["-L", "--fail", "--retry", "5", "--retry-delay", "2", "-o", archivePath, MODEL_URL], {
    stdio: "inherit",
});

fs.mkdirSync(extractionDir, { recursive: true });
execFileSync("tar", ["-xjf", archivePath, "-C", extractionDir], {
    stdio: "inherit",
});

const extractedDir = path.join(extractionDir, ASSET_DIRNAME);
if (!validate(extractedDir)) {
    throw new Error(`Extracted Sherpa model is invalid at ${extractedDir}`);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(targetDir), { recursive: true });
fs.renameSync(extractedDir, targetDir);
fs.rmSync(archivePath, { force: true });
fs.rmSync(extractionDir, { recursive: true, force: true });

console.log(`Sherpa model ready at ${targetDir}`);
