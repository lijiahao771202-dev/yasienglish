const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const SERVER_PORT = 3131;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

let mainWindow = null;
let serverProcess = null;
let isQuitting = false;

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
    if (serverProcess) {
        return serverProcess;
    }

    const serverRoot = getServerRoot();
    const serverEntrypoint = path.join(serverRoot, "server.js");
    const runtimeNodeModulesDir = path.join(serverRoot, "runtime_node_modules");

    if (!fs.existsSync(serverEntrypoint)) {
        throw new Error(`Missing desktop server bundle: ${serverEntrypoint}`);
    }

    const childEnv = {
        ...process.env,
        ...getBundledEnv(serverRoot),
        PORT: String(SERVER_PORT),
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
        ELECTRON_RUN_AS_NODE: "1",
    };

    if (fs.existsSync(runtimeNodeModulesDir)) {
        childEnv.NODE_PATH = childEnv.NODE_PATH
            ? `${runtimeNodeModulesDir}${path.delimiter}${childEnv.NODE_PATH}`
            : runtimeNodeModulesDir;
    }

    serverProcess = spawn(process.execPath, [serverEntrypoint], {
        cwd: serverRoot,
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess.stdout.on("data", (chunk) => {
        process.stdout.write(`[desktop-server] ${chunk}`);
    });

    serverProcess.stderr.on("data", (chunk) => {
        process.stderr.write(`[desktop-server] ${chunk}`);
    });

    serverProcess.on("exit", (code) => {
        serverProcess = null;

        if (!isQuitting) {
            dialog.showErrorBox(
                "Yasi 服务已停止",
                `本地服务异常退出，退出码 ${code ?? "unknown"}。请重新启动应用。`,
            );
        }
    });

    return serverProcess;
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

    await mainWindow.loadURL(SERVER_URL);

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

function stopNextServer() {
    if (!serverProcess) {
        return;
    }

    isQuitting = true;
    serverProcess.kill("SIGTERM");
    serverProcess = null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (!mainWindow) return;

        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }

        mainWindow.focus();
    });

    app.whenReady().then(async () => {
        await createMainWindow();

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
