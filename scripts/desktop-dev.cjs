/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const configuredDevUrl = process.env.YASI_DESKTOP_DEV_URL;
const parsedDevUrl = configuredDevUrl ? new URL(configuredDevUrl) : null;
const devHost = process.env.YASI_DESKTOP_DEV_HOST || parsedDevUrl?.hostname || "127.0.0.1";
const devPort = Number(
    process.env.YASI_DESKTOP_DEV_PORT
    || (parsedDevUrl
        ? parsedDevUrl.port || (parsedDevUrl.protocol === "https:" ? "443" : "80")
        : "3000"),
);
const devUrl = configuredDevUrl || `http://${devHost}:${devPort}`;
const desktopSpeechDevModelDir = path.join(projectRoot, ".cache", "speech-models", "en-us");
const ttsCacheDir = process.env.YASI_TTS_CACHE_DIR || path.join(projectRoot, ".cache", "tts");
const pronunciationServiceUrl = process.env.YASI_PRONUNCIATION_SERVICE_URL || "http://127.0.0.1:3132";
const defaultPronunciationPython = path.join(projectRoot, "services", "pronunciation", ".venv-pronunciation", "bin", "python");
const defaultCharsiuRepo = path.join(projectRoot, ".cache", "charsiu");
const canRunCharsiu = [defaultPronunciationPython, defaultCharsiuRepo]
    .every((target) => fs.existsSync(target));
const pronunciationBackend = process.env.YASI_PRONUNCIATION_BACKEND || (canRunCharsiu ? "charsiu" : "mock");

function getRouteUrl(baseUrl, route) {
    return new URL(route, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

let nextDevProcess = null;
let electronProcess = null;
let shuttingDown = false;

function npmCommand() {
    return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function isServerReady() {
    try {
        const response = await fetch(getRouteUrl(devUrl, "login"), { method: "GET" });
        return response.ok || response.redirected;
    } catch {
        return false;
    }
}

async function isDesktopServerCompatible() {
    try {
        const response = await fetch(getRouteUrl(devUrl, "api/ai/transcribe"), { method: "GET" });
        const payload = await response.json().catch(() => ({}));
        if (payload?.mode === "maintenance" && typeof payload?.message === "string" && payload.message.includes("只在桌面 App 提供")) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

async function waitForServerReady(timeoutMs = 60_000) {
    const timeoutAt = Date.now() + timeoutMs;

    while (Date.now() < timeoutAt) {
        if (await isServerReady()) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Timed out while waiting for Next dev server at ${devUrl}`);
}

function terminate(child) {
    if (!child || child.killed) {
        return;
    }

    child.kill("SIGTERM");
}

function shutdown(code = 0) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    terminate(electronProcess);
    terminate(nextDevProcess);

    setTimeout(() => {
        terminate(electronProcess);
        terminate(nextDevProcess);
        process.exit(code);
    }, 500);
}

async function main() {
    const serverReady = await isServerReady();
    if (serverReady && !(await isDesktopServerCompatible())) {
        throw new Error(
            `A Next dev server is already running at ${devUrl}, but it is not in desktop mode. `
            + "Stop that process first, then rerun `npm run desktop:dev`.",
        );
    }

    if (!serverReady) {
        nextDevProcess = spawn(
            npmCommand(),
            ["run", "dev", "--", "--hostname", devHost, "--port", String(devPort)],
            {
                cwd: projectRoot,
                stdio: "inherit",
                env: {
                    ...process.env,
                    YASI_DESKTOP_APP: "1",
                    YASI_SPEECH_DEV_MODEL_DIR: desktopSpeechDevModelDir,
                    YASI_TTS_CACHE_DIR: ttsCacheDir,
                    YASI_PRONUNCIATION_SERVICE_URL: pronunciationServiceUrl,
                    YASI_PRONUNCIATION_BACKEND: pronunciationBackend,
                    YASI_PRONUNCIATION_PYTHON: process.env.YASI_PRONUNCIATION_PYTHON || defaultPronunciationPython,
                    YASI_CHARSIU_REPO: process.env.YASI_CHARSIU_REPO || defaultCharsiuRepo,
                    YASI_PRONUNCIATION_SERVICE_TIMEOUT_MS: process.env.YASI_PRONUNCIATION_SERVICE_TIMEOUT_MS || "45000",
                    HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET || "1",
                },
            },
        );

        nextDevProcess.on("exit", (code) => {
            if (!shuttingDown) {
                process.exit(code ?? 1);
            }
        });
    }

    await waitForServerReady();

    const electronBinary = require("electron");
    electronProcess = spawn(electronBinary, ["."], {
        cwd: projectRoot,
        stdio: "inherit",
        env: {
            ...process.env,
            YASI_DESKTOP_APP: "1",
            YASI_SPEECH_DEV_MODEL_DIR: desktopSpeechDevModelDir,
            YASI_TTS_CACHE_DIR: ttsCacheDir,
            YASI_PRONUNCIATION_SERVICE_URL: pronunciationServiceUrl,
            YASI_DESKTOP_DEV_URL: devUrl,
            YASI_PRONUNCIATION_BACKEND: pronunciationBackend,
            YASI_PRONUNCIATION_PYTHON: process.env.YASI_PRONUNCIATION_PYTHON || defaultPronunciationPython,
            YASI_CHARSIU_REPO: process.env.YASI_CHARSIU_REPO || defaultCharsiuRepo,
            YASI_PRONUNCIATION_SERVICE_TIMEOUT_MS: process.env.YASI_PRONUNCIATION_SERVICE_TIMEOUT_MS || "45000",
            HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET || "1",
        },
    });

    electronProcess.on("exit", (code) => {
        shutdown(code ?? 0);
    });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", (error) => {
    console.error(error);
    shutdown(1);
});

main().catch((error) => {
    console.error(error);
    shutdown(1);
});
