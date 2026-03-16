const { app, BrowserWindow, dialog, ipcMain, session, systemPreferences } = require("electron");
const fs = require("fs");
const Module = require("module");
const net = require("net");
const path = require("path");
const { createSpeechModelController } = require("./speech-model.cjs");

const SERVER_PORT = 3131;
const SERVER_HOST = "localhost";
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
const TRUSTED_APP_ORIGINS = new Set([
    `http://localhost:${SERVER_PORT}`,
    `http://127.0.0.1:${SERVER_PORT}`,
]);

let mainWindow = null;
let serverStarted = false;
let isQuitting = false;
const speechModelController = createSpeechModelController({ app, BrowserWindow });

function toProxyUrl(rule) {
    const [scheme, host] = rule.trim().split(/\s+/, 2);
    if (!scheme || !host) {
        return null;
    }

    const upperScheme = scheme.toUpperCase();
    if (upperScheme === "PROXY" || upperScheme === "HTTPS") {
        return `http://${host}`;
    }

    if (upperScheme === "SOCKS" || upperScheme === "SOCKS4" || upperScheme === "SOCKS5") {
        return `socks5://${host}`;
    }

    return null;
}

async function hydrateProxyEnvFromSystem() {
    if (
        process.env.HTTPS_PROXY
        || process.env.HTTP_PROXY
        || process.env.ALL_PROXY
        || process.env.https_proxy
        || process.env.http_proxy
        || process.env.all_proxy
    ) {
        return;
    }

    const resolvedProxy = await session.defaultSession.resolveProxy("https://speech.platform.bing.com");
    const firstRule = resolvedProxy
        .split(";")
        .map((entry) => entry.trim())
        .find((entry) => entry && entry.toUpperCase() !== "DIRECT");

    if (!firstRule) {
        return;
    }

    const proxyUrl = toProxyUrl(firstRule);
    if (!proxyUrl) {
        try {
            const clashProxyAvailable = await new Promise((resolve) => {
                const socket = net.createConnection({ host: "127.0.0.1", port: 7897 });

                const cleanup = (value) => {
                    socket.removeAllListeners();
                    socket.destroy();
                    resolve(value);
                };

                socket.once("connect", () => cleanup(true));
                socket.once("error", () => cleanup(false));
                socket.setTimeout(800, () => cleanup(false));
            });

            if (clashProxyAvailable) {
                proxyUrl = "http://127.0.0.1:7897";
            }
        } catch {
            proxyUrl = null;
        }
    }

    if (!proxyUrl) {
        return;
    }

    process.env.HTTP_PROXY = proxyUrl;
    process.env.HTTPS_PROXY = proxyUrl;
    process.env.ALL_PROXY = proxyUrl;
}

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const source = fs.readFileSync(filePath, "utf8");
    const result = {};

    for (const rawLine of source.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const separatorIndex = line.indexOf("=");
        if (separatorIndex <= 0) continue;

        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        result[key] = value;
    }

    return result;
}

function getServerRoot() {
    return app.isPackaged
        ? path.join(process.resourcesPath, "server")
        : path.join(app.getAppPath(), "dist-electron", "server");
}

function getBundledEnv(serverRoot) {
    const envFiles = [".env", ".env.local", ".env.production", ".env.production.local"];

    return envFiles.reduce((merged, fileName) => {
        return {
            ...merged,
            ...parseEnvFile(path.join(serverRoot, fileName)),
        };
    }, {});
}

function startNextServer() {
    if (serverStarted) {
        return;
    }

    const serverRoot = getServerRoot();
    const serverEntrypoint = path.join(serverRoot, "server.js");
    const runtimeNodeModulesDir = path.join(serverRoot, "runtime_node_modules");

    if (!fs.existsSync(serverEntrypoint)) {
        throw new Error(`Missing desktop server bundle: ${serverEntrypoint}`);
    }

    Object.assign(process.env, getBundledEnv(serverRoot), {
        PORT: String(SERVER_PORT),
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
        YASI_SERVER_ROOT: serverRoot,
    });

    if (fs.existsSync(runtimeNodeModulesDir)) {
        process.env.NODE_PATH = process.env.NODE_PATH
            ? `${runtimeNodeModulesDir}${path.delimiter}${process.env.NODE_PATH}`
            : runtimeNodeModulesDir;
        process.env.YASI_RUNTIME_NODE_MODULES = runtimeNodeModulesDir;
        Module._initPaths();
    }

    serverStarted = true;

    try {
        require(serverEntrypoint);
    } catch (error) {
        serverStarted = false;
        throw error;
    }
}

function isTrustedAppOrigin(origin) {
    return Array.from(TRUSTED_APP_ORIGINS).some((trustedOrigin) => origin === trustedOrigin || origin.startsWith(`${trustedOrigin}/`));
}

function configureMediaPermissions() {
    const defaultSession = session.defaultSession;

    defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
        if (permission === "media") {
            return isTrustedAppOrigin(requestingOrigin);
        }

        return false;
    });

    defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
        if (permission === "media") {
            callback(isTrustedAppOrigin(details.requestingUrl || ""));
            return;
        }

        callback(false);
    });
}

async function ensureMicrophoneAccess() {
    if (process.platform !== "darwin") {
        return { granted: true, status: "granted" };
    }

    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status === "granted") {
        return { granted: true, status };
    }

    if (status === "not-determined") {
        const granted = await systemPreferences.askForMediaAccess("microphone");
        return {
            granted,
            status: granted ? "granted" : systemPreferences.getMediaAccessStatus("microphone"),
        };
    }

    return { granted: false, status };
}

function getMicrophoneStatus() {
    if (process.platform !== "darwin") {
        return { granted: true, status: "granted" };
    }

    const status = systemPreferences.getMediaAccessStatus("microphone");
    return {
        granted: status === "granted",
        status,
    };
}

async function waitForServerReady() {
    const timeoutAt = Date.now() + 60_000;

    while (Date.now() < timeoutAt) {
        try {
            const response = await fetch(`${SERVER_URL}/login`, { method: "GET" });
            if (response.ok || response.redirected) {
                return;
            }
        } catch {
            // Server not ready yet.
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("Timed out while waiting for the local Yasi service to start.");
}

async function createMainWindow() {
    await hydrateProxyEnvFromSystem();
    startNextServer();
    await waitForServerReady();

    mainWindow = new BrowserWindow({
        width: 1480,
        height: 960,
        minWidth: 1180,
        minHeight: 780,
        backgroundColor: "#ece7df",
        show: false,
        title: "Yasi",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, "preload.cjs"),
        },
    });

    mainWindow.once("ready-to-show", () => {
        mainWindow?.show();
    });

    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
        dialog.showErrorBox(
            "Yasi 页面加载失败",
            `无法加载 ${validatedURL || SERVER_URL}\n${errorDescription} (${errorCode})`,
        );
    });

    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        dialog.showErrorBox(
            "Yasi 渲染进程异常退出",
            `原因: ${details.reason}${details.exitCode ? `\n退出码: ${details.exitCode}` : ""}`,
        );
    });

    await mainWindow.loadURL(SERVER_URL);

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

function stopNextServer() {
    isQuitting = true;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    ipcMain.handle("desktop:get-microphone-status", () => {
        return getMicrophoneStatus();
    });

    ipcMain.handle("desktop:request-microphone-access", async () => {
        return ensureMicrophoneAccess();
    });

    ipcMain.handle("desktop:get-speech-model-status", () => {
        return speechModelController.getSpeechModelStatus();
    });

    ipcMain.handle("desktop:get-speech-model-path", () => {
        return speechModelController.getSpeechModelPath();
    });

    ipcMain.handle("desktop:download-speech-model", async () => {
        return speechModelController.downloadSpeechModel();
    });

    app.on("second-instance", () => {
        if (!mainWindow) return;

        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }

        mainWindow.focus();
    });

    app.whenReady().then(async () => {
        speechModelController.initializeEnv();
        speechModelController.inspectCurrentState();
        configureMediaPermissions();

        await createMainWindow();

        void ensureMicrophoneAccess().then((microphoneAccess) => {
            if (!microphoneAccess.granted) {
                dialog.showMessageBox({
                    type: "warning",
                    title: "麦克风权限未开启",
                    message: "Yasi 需要麦克风权限才能进行本地英文录音识别，请在系统设置里允许 Yasi 使用麦克风后重新启动应用。",
                }).catch(() => {});
            }
        });

        app.on("activate", async () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                await createMainWindow();
            }
        });
    }).catch((error) => {
        dialog.showErrorBox("Yasi 启动失败", error instanceof Error ? error.message : String(error));
        app.quit();
    });

    app.on("before-quit", () => {
        isQuitting = true;
        stopNextServer();
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            app.quit();
        }
    });
}
