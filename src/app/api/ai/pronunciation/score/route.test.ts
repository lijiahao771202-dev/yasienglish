import { beforeEach, describe, expect, it, vi } from "vitest";

const { scorePronunciationWithServiceMock } = vi.hoisted(() => ({
    scorePronunciationWithServiceMock: vi.fn(),
}));

vi.mock("@/lib/pronunciation-service", () => ({
    PronunciationServiceError: class PronunciationServiceError extends Error {
        status: number;

        constructor(message: string, status = 503) {
            super(message);
            this.status = status;
        }
    },
    getPronunciationServiceHealth: vi.fn(),
    scorePronunciationWithService: scorePronunciationWithServiceMock,
}));

import { encodeWavPcm16 } from "@/lib/speech-audio";
import { POST } from "./route";

function createWavFile(durationMs: number, amplitude = 0.08) {
    const sampleRate = 16000;
    const sampleCount = Math.max(1, Math.round((sampleRate * durationMs) / 1000));
    const samples = new Float32Array(sampleCount);

    for (let index = 0; index < sampleCount; index += 1) {
        samples[index] = Math.sin(index / 12) * amplitude;
    }

    return new File([encodeWavPcm16(samples, sampleRate)], "recording.wav", { type: "audio/wav" });
}

async function buildRequest(options: {
    audio?: File;
    reference?: string;
} = {}) {
    const formData = new FormData();
    if (options.audio) {
        formData.append("audio", options.audio);
    }
    formData.append("reference_english", options.reference || "The market opens before sunrise.");

    return new Request("http://localhost/api/ai/pronunciation/score", {
        method: "POST",
        body: formData,
    });
}

describe("pronunciation score route", () => {
    beforeEach(() => {
        process.env.YASI_DESKTOP_APP = "1";
        scorePronunciationWithServiceMock.mockReset();
    });

    it("returns normalized pronunciation scoring payloads", async () => {
        scorePronunciationWithServiceMock.mockResolvedValueOnce({
            pronunciation_score: 8.9,
            fluency_score: 8.1,
            transcript: "the market opens before sunrise",
            utterance_scores: {
                accuracy: 7.1,
                completeness: 8.8,
                fluency: 7.8,
                prosody: 7.4,
                total: 8.2,
                content_reproduction: 8.8,
                rhythm_fluency: 7.8,
                pronunciation_clarity: 7.1,
            },
            word_results: [
                { word: "the", status: "correct", score: 9.8, accuracy_score: 9.7, stress_score: 9.8 },
                { word: "market", status: "mispronounced", score: 4.6, accuracy_score: 4.3, stress_score: 4.9 },
                { word: "opens", status: "weak", score: 6.9, accuracy_score: 6.8, stress_score: 7.0 },
                { word: "before", status: "correct", score: 9.1, accuracy_score: 9.0, stress_score: 9.1 },
                { word: "sunrise", status: "correct", score: 9.0, accuracy_score: 8.9, stress_score: 9.0 },
            ],
            engine: "charsiu",
            engine_version: "test-engine",
        });

        const response = await POST(await buildRequest({
            audio: createWavFile(1600),
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.engine).toBe("charsiu");
        expect(data.transcript).toBe("the market opens before sunrise");
        expect(data.word_results).toHaveLength(5);
        expect(data.utterance_scores.total).toBe(8.2);
        expect(data.utterance_scores.content_reproduction).toBe(8.8);
        expect(data.utterance_scores.rhythm_fluency).toBe(7.8);
        expect(data.utterance_scores.pronunciation_clarity).toBe(7.1);
        expect(data.word_results[1].accuracy_score).toBe(4.3);
        expect(data.feedback).toBeUndefined();
        expect(data.judge_reasoning).toBeUndefined();
        expect(data.score).toBeGreaterThan(8);
    });

    it("rejects very short recordings", async () => {
        const response = await POST(await buildRequest({
            audio: createWavFile(250),
        }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Audio too short");
    });

    it("rejects recordings that are too quiet", async () => {
        const response = await POST(await buildRequest({
            audio: createWavFile(1200, 0.0005),
        }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Audio too quiet");
    });

    it("surfaces local service failures without falling back", async () => {
        scorePronunciationWithServiceMock.mockRejectedValueOnce(new Error("service offline"));

        const response = await POST(await buildRequest({
            audio: createWavFile(1200),
        }));
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Pronunciation scoring failed");
        expect(data.details).toContain("service offline");
    });
});
