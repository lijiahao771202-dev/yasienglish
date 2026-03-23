import { describe, expect, it } from "vitest";

import { concatSampleChunks, encodeWavFromChunks, parseWavPcm16 } from "@/lib/speech-audio";

describe("speech-audio", () => {
    it("concatenates PCM chunks in order", () => {
        const merged = concatSampleChunks([
            new Float32Array([0.1, 0.2]),
            new Float32Array([-0.3]),
            new Float32Array([0.4, 0.5]),
        ]);

        expect(Array.from(merged)).toHaveLength(5);
        expect(merged[0]).toBeCloseTo(0.1, 6);
        expect(merged[1]).toBeCloseTo(0.2, 6);
        expect(merged[2]).toBeCloseTo(-0.3, 6);
        expect(merged[3]).toBeCloseTo(0.4, 6);
        expect(merged[4]).toBeCloseTo(0.5, 6);
    });

    it("encodes captured PCM chunks into a 16k wav payload", async () => {
        const wavBlob = encodeWavFromChunks(
            [
                new Float32Array([0, 0.25, -0.25]),
                new Float32Array([0.5, -0.5, 0]),
            ],
            48000,
            16000,
        );

        const parsed = parseWavPcm16(await wavBlob.arrayBuffer());
        expect(parsed.sampleRate).toBe(16000);
        expect(parsed.channelCount).toBe(1);
        expect(parsed.samples.length).toBeGreaterThan(0);
    });
});
