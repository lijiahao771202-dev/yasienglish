/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_PORT = Number(process.env.YASI_PRONUNCIATION_SERVICE_PORT || 3132);
const DEFAULT_HOST = "127.0.0.1";

function resolveServiceRoot(app) {
    return app.isPackaged
        ? path.join(process.resourcesPath, "pronunciation-service")
        : path.join(app.getAppPath(), "services", "pronunciation");
}

function resolvePythonBinary() {
    if (process.env.YASI_PRONUNCIATION_PYTHON) {
        return process.env.YASI_PRONUNCIATION_PYTHON;
    }
    return process.platform === "win32" ? "python" : "python3";
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealthyService(serviceUrl) {
    const timeoutAt = Date.now() + 20_000;

    while (Date.now() < timeoutAt) {
        try {
            const response = await fetch(`${serviceUrl}/health`);
            const payload = await response.json().catch(() => ({}));
            if (response.ok && payload?.status === "ready") {
                return { ok: true, payload };
            }

            if (response.status === 503) {
                return { ok: false, payload };
            }
        } catch {
            // Service is still starting.
        }

        await delay(300);
    }

    throw new Error("Timed out while waiting for the local pronunciation service.");
}

function createPronunciationServiceController({ app }) {
    let childProcess = null;
    let startPromise = null;
    let lastError = null;

    const serviceUrl = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

    async function start() {
        if (startPromise) {
            return startPromise;
        }

        startPromise = (async () => {
            process.env.YASI_PRONUNCIATION_SERVICE_URL = serviceUrl;

            const serviceRoot = resolveServiceRoot(app);
            const scriptPath = path.join(serviceRoot, "service.py");
            if (!fs.existsSync(scriptPath)) {
                lastError = `Missing pronunciation service script: ${scriptPath}`;
                return;
            }

            const backend = process.env.YASI_PRONUNCIATION_BACKEND || (app.isPackaged ? "charsiu" : "mock");
            const env = {
                ...process.env,
                PYTHONUNBUFFERED: "1",
                YASI_PRONUNCIATION_BACKEND: backend,
                YASI_PRONUNCIATION_SERVICE_PORT: String(DEFAULT_PORT),
                HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET || "1",
            };

            childProcess = spawn(resolvePythonBinary(), [scriptPath], {
                env,
                cwd: serviceRoot,
                stdio: ["ignore", "pipe", "pipe"],
            });

            childProcess.stdout?.on("data", (chunk) => {
                process.stdout.write(String(chunk));
            });
            childProcess.stderr?.on("data", (chunk) => {
                process.stderr.write(String(chunk));
            });
            childProcess.once("exit", (code, signal) => {
                if (code !== 0 && signal !== "SIGTERM") {
                    lastError = `Pronunciation service exited unexpectedly (${signal || code || "unknown"}).`;
                }
                childProcess = null;
            });

            try {
                const health = await waitForHealthyService(serviceUrl);
                lastError = health.ok
                    ? null
                    : typeof health.payload?.error === "string"
                        ? health.payload.error
                        : "Pronunciation service started but the charsiu backend is unavailable.";
            } catch (error) {
                lastError = error instanceof Error ? error.message : "Failed to start pronunciation service.";
            }
        })().finally(() => {
            startPromise = null;
        });

        return startPromise;
    }

    function stop() {
        if (!childProcess) return;

        childProcess.kill("SIGTERM");
        childProcess = null;
    }

    function getStatus() {
        return {
            ready: Boolean(childProcess && !lastError),
            url: serviceUrl,
            error: lastError,
        };
    }

    return {
        start,
        stop,
        getStatus,
        getServiceUrl: () => serviceUrl,
    };
}

module.exports = {
    createPronunciationServiceController,
};
