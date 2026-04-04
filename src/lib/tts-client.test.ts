import { afterEach, describe, expect, it, vi } from "vitest";

const firstMock = vi.fn();

vi.mock("./db", () => ({
    db: {
        user_profile: {
            orderBy: () => ({
                first: firstMock,
            }),
        },
    },
}));

import { requestTtsPayload, requestTtsSegmentsPayload } from "./tts-client";

describe("tts-client", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        firstMock.mockReset();
    });

    it("uses the saved profile voice when no explicit voice is provided", async () => {
        firstMock.mockResolvedValue({
            learning_preferences: {
                tts_voice: "en-US-AriaNeural",
            },
        });

        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({
                audio: "/api/tts?key=test",
                marks: [],
            }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            }),
        );

        vi.stubGlobal("fetch", fetchMock);

        const payload = await requestTtsPayload("Hello world");

        expect(payload.audio).toBe("/api/tts?key=test");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith("/api/tts", expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
                text: "Hello world",
                voice: "en-US-AriaNeural",
                rate: "+0%",
            }),
        }));
    });

    it("keeps an explicit voice override intact", async () => {
        firstMock.mockResolvedValue({
            learning_preferences: {
                tts_voice: "en-US-AriaNeural",
            },
        });

        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({
                audio: "/api/tts?key=test-2",
                marks: [],
            }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            }),
        );

        vi.stubGlobal("fetch", fetchMock);

        await requestTtsPayload("Hello world", "en-US-BrianNeural");

        expect(fetchMock).toHaveBeenCalledWith("/api/tts", expect.objectContaining({
            body: JSON.stringify({
                text: "Hello world",
                voice: "en-US-BrianNeural",
                rate: "+0%",
            }),
        }));
    });

    it("posts mixed segments with per-segment voices", async () => {
        firstMock.mockResolvedValue({
            learning_preferences: {
                tts_voice: "en-US-AriaNeural",
            },
        });

        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({
                audio: "/api/tts?key=test-mixed",
                marks: [],
                segmentTimings: [
                    { index: 1, startMs: 0, endMs: 900 },
                    { index: 2, startMs: 900, endMs: 1850 },
                ],
            }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            }),
        );

        vi.stubGlobal("fetch", fetchMock);

        const payload = await requestTtsSegmentsPayload([
            { text: "Good morning.", voice: "en-US-AvaNeural" },
            { text: "Let's begin.", voice: "en-US-BrianNeural" },
        ]);

        expect(payload.segmentTimings).toEqual([
            { index: 1, startMs: 0, endMs: 900 },
            { index: 2, startMs: 900, endMs: 1850 },
        ]);

        expect(fetchMock).toHaveBeenCalledWith("/api/tts", expect.objectContaining({
            body: JSON.stringify({
                segments: [
                    { text: "Good morning.", voice: "en-US-AvaNeural", rate: "+0%" },
                    { text: "Let's begin.", voice: "en-US-BrianNeural", rate: "+0%" },
                ],
            }),
        }));
    });
});
