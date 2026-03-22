import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    edgeTtsConstructorMock,
    synthesizeStreamMock,
    getWordBoundariesMock,
} = vi.hoisted(() => ({
    edgeTtsConstructorMock: vi.fn(),
    synthesizeStreamMock: vi.fn(),
    getWordBoundariesMock: vi.fn(),
}));

vi.mock("@andresaya/edge-tts", () => ({
    EdgeTTS: class EdgeTTS {
        constructor() {
            edgeTtsConstructorMock();
        }

        synthesizeStream(...args: unknown[]) {
            return synthesizeStreamMock(...args);
        }

        getWordBoundaries() {
            return getWordBoundariesMock();
        }
    },
}));

async function buildRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

async function importRoute() {
    return import("./route");
}

describe("tts route", () => {
    let cacheDir: string;

    beforeEach(() => {
        vi.resetModules();
        edgeTtsConstructorMock.mockReset();
        synthesizeStreamMock.mockReset();
        getWordBoundariesMock.mockReset();

        cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "yasi-tts-cache-"));
        process.env.YASI_TTS_CACHE_DIR = cacheDir;
    });

    afterEach(() => {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        delete process.env.YASI_TTS_CACHE_DIR;
    });

    it("reuses cached synthesis for identical requests", async () => {
        synthesizeStreamMock.mockImplementation(async function* () {
            yield Uint8Array.from([1, 2, 3, 4]);
        });
        getWordBoundariesMock.mockReturnValue([
            { offset: 0, duration: 1000, text: "hello" },
        ]);

        const { POST } = await importRoute();

        const firstResponse = await POST(await buildRequest({
            text: "Hello world",
            voice: "en-US-JennyNeural",
            rate: "+0%",
        }));
        const firstJson = await firstResponse.json();

        const secondResponse = await POST(await buildRequest({
            text: "Hello world",
            voice: "en-US-JennyNeural",
            rate: "+0%",
        }));
        const secondJson = await secondResponse.json();

        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);
        expect(edgeTtsConstructorMock).toHaveBeenCalledTimes(1);
        expect(synthesizeStreamMock).toHaveBeenCalledTimes(1);
        expect(firstJson.audio).toBe(secondJson.audio);
        expect(firstJson.audio).toMatch(/^\/api\/tts\?key=/);
        expect(secondJson.marks).toEqual(firstJson.marks);
        expect(fs.readdirSync(cacheDir).length).toBeGreaterThan(0);
    });

    it("deduplicates concurrent synthesis for identical requests", async () => {
        synthesizeStreamMock.mockImplementation(async function* () {
            await new Promise((resolve) => setTimeout(resolve, 50));
            yield Uint8Array.from([9, 8, 7, 6]);
        });
        getWordBoundariesMock.mockReturnValue([
            { offset: 0, duration: 1000, text: "dedupe" },
        ]);

        const { POST } = await importRoute();

        const [firstResponse, secondResponse] = await Promise.all([
            POST(await buildRequest({ text: "Concurrent request", voice: "en-US-JennyNeural", rate: "+0%" })),
            POST(await buildRequest({ text: "Concurrent request", voice: "en-US-JennyNeural", rate: "+0%" })),
        ]);

        const firstJson = await firstResponse.json();
        const secondJson = await secondResponse.json();

        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);
        expect(edgeTtsConstructorMock).toHaveBeenCalledTimes(1);
        expect(synthesizeStreamMock).toHaveBeenCalledTimes(1);
        expect(firstJson.audio).toBe(secondJson.audio);
    });

    it("serves cached mp3 bytes via GET after synthesis", async () => {
        synthesizeStreamMock.mockImplementation(async function* () {
            yield Uint8Array.from([5, 6, 7, 8]);
        });
        getWordBoundariesMock.mockReturnValue([]);

        const { GET, POST } = await importRoute();
        const postResponse = await POST(await buildRequest({
            text: "Serve cached audio",
            voice: "en-US-JennyNeural",
            rate: "+0%",
        }));
        const postJson = await postResponse.json();

        const audioUrl = new URL(postJson.audio, "http://localhost");
        const getResponse = await GET(new Request(audioUrl.toString(), { method: "GET" }));
        const audioBuffer = Buffer.from(await getResponse.arrayBuffer());

        expect(getResponse.status).toBe(200);
        expect(getResponse.headers.get("content-type")).toBe("audio/mpeg");
        expect(audioBuffer.equals(Buffer.from([5, 6, 7, 8]))).toBe(true);
    });
});
