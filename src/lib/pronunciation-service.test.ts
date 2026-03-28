import { afterEach, describe, expect, it, vi } from "vitest";

const { originalRetryAttempts, originalRetryDelay } = vi.hoisted(() => {
    const originalRetryAttempts = process.env.YASI_PRONUNCIATION_SERVICE_RETRY_ATTEMPTS;
    const originalRetryDelay = process.env.YASI_PRONUNCIATION_SERVICE_RETRY_DELAY_MS;

    process.env.YASI_PRONUNCIATION_SERVICE_RETRY_ATTEMPTS = "2";
    process.env.YASI_PRONUNCIATION_SERVICE_RETRY_DELAY_MS = "0";

    return {
        originalRetryAttempts,
        originalRetryDelay,
    };
});

vi.mock("server-only", () => ({}));

import {
    getPronunciationServiceHealth,
    scorePronunciationWithService,
} from "./pronunciation-service";

function jsonResponse(payload: unknown, status: number) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "Content-Type": "application/json",
        },
    });
}

describe("pronunciation-service", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();

        if (originalRetryAttempts === undefined) {
            delete process.env.YASI_PRONUNCIATION_SERVICE_RETRY_ATTEMPTS;
        } else {
            process.env.YASI_PRONUNCIATION_SERVICE_RETRY_ATTEMPTS = originalRetryAttempts;
        }

        if (originalRetryDelay === undefined) {
            delete process.env.YASI_PRONUNCIATION_SERVICE_RETRY_DELAY_MS;
        } else {
            process.env.YASI_PRONUNCIATION_SERVICE_RETRY_DELAY_MS = originalRetryDelay;
        }
    });

    it("retries health checks when the service is still warming up", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ status: "starting" }, 503))
            .mockResolvedValueOnce(jsonResponse({
                status: "ready",
                engine: "charsiu",
                engine_version: "test-engine",
            }, 200));

        vi.stubGlobal("fetch", fetchMock);

        const payload = await getPronunciationServiceHealth();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(payload.status).toBe("ready");
        expect(payload.engine).toBe("charsiu");
        expect(payload.engine_version).toBe("test-engine");
    });

    it("retries scoring after a transient 503 response", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ error: "starting" }, 503))
            .mockResolvedValueOnce(jsonResponse({
                score: 9.2,
                transcript: "hello world",
            }, 200));

        vi.stubGlobal("fetch", fetchMock);

        const payload = await scorePronunciationWithService({
            audioBase64: "dGVzdA==",
            referenceText: "Hello world",
            eloRating: 1200,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(payload.score).toBe(9.2);
        expect(payload.transcript).toBe("hello world");
    });
});
