const { spawn } = require("child_process");

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
    if (!(await isServerReady())) {
        nextDevProcess = spawn(
            npmCommand(),
            ["run", "dev", "--", "--hostname", devHost, "--port", String(devPort)],
            {
                cwd: projectRoot,
                stdio: "inherit",
                env: process.env,
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
            YASI_DESKTOP_DEV_URL: devUrl,
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
