import { describe, expect, it } from "vitest";
import { isLikelyPlayableMpegBlob } from "./tts-audio";

describe("isLikelyPlayableMpegBlob", () => {
    it("accepts mp3 frame-sync headers", async () => {
        const blob = new Blob([Uint8Array.from([0xff, 0xf3, 0x64, 0xc4, 0x00]).buffer], { type: "audio/mpeg" });

        await expect(isLikelyPlayableMpegBlob(blob)).resolves.toBe(true);
    });

    it("rejects obvious non-audio payloads", async () => {
        const blob = new Blob([JSON.stringify({ error: "not audio" })], { type: "application/json" });

        await expect(isLikelyPlayableMpegBlob(blob)).resolves.toBe(false);
    });
});
