import { afterEach, describe, expect, it } from "vitest";
import { randomInt } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";


const SERVICE_PATH = path.join(process.cwd(), "services", "pronunciation", "service.py");

async function waitForService(port: number, allowUnavailable = false) {
    const timeoutAt = Date.now() + 15_000;
    while (Date.now() < timeoutAt) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/health`);
            if (response.ok || (allowUnavailable && response.status === 503)) {
                return response;
            }
        } catch {
            // Still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Timed out while waiting for pronunciation service.");
}

function startService(env: Record<string, string>) {
    const port = randomInt(3400, 3900);
    const child = spawn("python3", [SERVICE_PATH], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PYTHONUNBUFFERED: "1",
            YASI_PRONUNCIATION_SERVICE_PORT: String(port),
            ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});

    return { child, port };
}

async function stopService(child: ChildProcessWithoutNullStreams) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
}

describe("local pronunciation service", () => {
    const children: ChildProcessWithoutNullStreams[] = [];

    afterEach(async () => {
        while (children.length > 0) {
            const child = children.pop();
            if (child) {
                await stopService(child);
            }
        }
    });

    it("reports mock charsiu health", async () => {
        const { child, port } = startService({
            YASI_PRONUNCIATION_BACKEND: "mock",
        });
        children.push(child);

        const response = await waitForService(port);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.status).toBe("ready");
        expect(payload.backend).toBe("mock");
        expect(payload.engine).toBe("charsiu");
    });

    it("scores audio through the mock contract", async () => {
        const { child, port } = startService({
            YASI_PRONUNCIATION_BACKEND: "mock",
        });
        children.push(child);

        await waitForService(port);

        const response = await fetch(`http://127.0.0.1:${port}/score`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                audio_base64: Buffer.from("RIFFfakewav").toString("base64"),
                reference_text: "The market opens.",
                transcript: "the market",
            }),
        });
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.engine).toBe("charsiu");
        expect(payload.word_results).toHaveLength(3);
        expect(payload.word_results[0].status).toBe("correct");
        expect(payload.word_results[2].status).toBe("missing");
    });

    it("stays unavailable when the charsiu runtime is not configured", async () => {
        const { child, port } = startService({
            YASI_PRONUNCIATION_BACKEND: "charsiu",
            YASI_CHARSIU_REPO: path.join(process.cwd(), "missing-charsiu-repo"),
        });
        children.push(child);

        const response = await waitForService(port, true);
        const payload = await response.json();

        expect(response.status).toBe(503);
        expect(payload.status).toBe("unavailable");
        expect(String(payload.error)).toContain("YASI_CHARSIU_REPO");
    });
});
