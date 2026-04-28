import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    edgeTtsConstructorMock,
    synthesizeMock,
    toBufferMock,
    getWordBoundariesMock,
} = vi.hoisted(() => ({
    edgeTtsConstructorMock: vi.fn(),
    synthesizeMock: vi.fn(),
    toBufferMock: vi.fn(),
    getWordBoundariesMock: vi.fn(),
}));

vi.mock("@andresaya/edge-tts", () => ({
    EdgeTTS: class EdgeTTS {
        constructor() {
            edgeTtsConstructorMock();
        }

        synthesize(...args: unknown[]) {
            return synthesizeMock(...args);
        }

        toBuffer() {
            return toBufferMock();
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
        synthesizeMock.mockReset();
        toBufferMock.mockReset();
        getWordBoundariesMock.mockReset();

        cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "yasi-tts-cache-"));
        process.env.YASI_TTS_CACHE_DIR = cacheDir;
    });

    afterEach(() => {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        delete process.env.YASI_TTS_CACHE_DIR;
    });

    it("reuses cached synthesis for identical requests", async () => {
        synthesizeMock.mockResolvedValue(undefined);
        toBufferMock.mockReturnValue(Buffer.from([1, 2, 3, 4]));
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
        expect(synthesizeMock).toHaveBeenCalledTimes(1);
        expect(firstJson.audio).toBe(secondJson.audio);
        expect(firstJson.audio).toMatch(/^\/api\/tts\?key=/);
        expect(firstJson.audioDataUrl).toBeUndefined();
        expect(secondJson.audioDataUrl).toBeUndefined();
        expect(secondJson.marks).toEqual(firstJson.marks);
        expect(fs.readdirSync(cacheDir).length).toBeGreaterThan(0);
    });

    it("deduplicates concurrent synthesis for identical requests", async () => {
        synthesizeMock.mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
        });
        toBufferMock.mockReturnValue(Buffer.from([9, 8, 7, 6]));
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
        expect(synthesizeMock).toHaveBeenCalledTimes(1);
        expect(firstJson.audio).toBe(secondJson.audio);
        expect(firstJson.audioDataUrl).toBeUndefined();
    });

    it("serves cached mp3 bytes via GET after synthesis", async () => {
        synthesizeMock.mockResolvedValue(undefined);
        toBufferMock.mockReturnValue(Buffer.from([5, 6, 7, 8]));
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

    it("normalizes whitespace and appends terminal punctuation before synthesis", async () => {
        synthesizeMock.mockResolvedValue(undefined);
        toBufferMock.mockReturnValue(Buffer.from([7, 7, 7, 7]));
        getWordBoundariesMock.mockReturnValue([]);

        const { POST } = await importRoute();
        const response = await POST(await buildRequest({
            text: "  The final words are here \n\n now  ",
            voice: "en-US-JennyNeural",
            rate: "+0%",
        }));

        expect(response.status).toBe(200);
        expect(synthesizeMock).toHaveBeenCalledWith(
            "The final words are here now.",
            "en-US-JennyNeural",
            expect.objectContaining({
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
                rate: "+0%",
            }),
        );
    });

    it("returns a retryable status for transient Edge TTS socket failures", async () => {
        const error = new Error("Client network socket disconnected before secure TLS connection was established");
        synthesizeMock.mockRejectedValue(error);

        const { POST } = await importRoute();
        const response = await POST(await buildRequest({
            text: "Network failure should be retryable",
            voice: "en-US-JennyNeural",
            rate: "+0%",
        }));
        const json = await response.json();

        expect(response.status).toBe(503);
        expect(json.details).toContain("Client network socket disconnected");
    });

    it("returns stable segmentTimings for mixed-segment synthesis and cache reuse", async () => {
        synthesizeMock.mockResolvedValue(undefined);
        toBufferMock
            .mockReturnValueOnce(Buffer.from([1, 2, 3]))
            .mockReturnValueOnce(Buffer.from([4, 5, 6]));
        getWordBoundariesMock
            .mockReturnValueOnce([{ offset: 0, duration: 1000, text: "first" }])
            .mockReturnValueOnce([{ offset: 0, duration: 1400, text: "second" }]);

        const { POST } = await importRoute();
        const body = {
            segments: [
                { text: "First segment.", voice: "en-US-JennyNeural", rate: "-12%" },
                { text: "Second segment is slightly longer.", voice: "en-US-AriaNeural", rate: "+10%" },
            ],
        };

        const firstResponse = await POST(await buildRequest(body));
        const firstJson = await firstResponse.json();
        const secondResponse = await POST(await buildRequest(body));
        const secondJson = await secondResponse.json();

        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);
        expect(Array.isArray(firstJson.segmentTimings)).toBe(true);
        expect(firstJson.segmentTimings).toHaveLength(2);
        expect(firstJson.segmentTimings[0].endMs).toBe(firstJson.segmentTimings[1].startMs);
        expect(firstJson.segmentTimings[0].startMs).toBe(0);
        expect(firstJson.segmentTimings[1].endMs).toBeGreaterThan(firstJson.segmentTimings[1].startMs);
        expect(secondJson.segmentTimings).toEqual(firstJson.segmentTimings);
        expect(synthesizeMock).toHaveBeenCalledTimes(2);
        expect(edgeTtsConstructorMock).toHaveBeenCalledTimes(2);
        expect(synthesizeMock).toHaveBeenNthCalledWith(
            1,
            "First segment.",
            "en-US-JennyNeural",
            expect.objectContaining({ rate: "-12%" }),
        );
        expect(synthesizeMock).toHaveBeenNthCalledWith(
            2,
            "Second segment is slightly longer.",
            "en-US-AriaNeural",
            expect.objectContaining({ rate: "+10%" }),
        );
    });
});
