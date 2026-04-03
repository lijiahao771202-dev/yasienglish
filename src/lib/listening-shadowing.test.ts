import { describe, expect, it } from "vitest";

import { alignPronunciationTokens, scoreListeningRecognition } from "@/lib/listening-shadowing";
import { extractWordTokens, normalizeWordForMatch } from "@/lib/read-speaking";

function toTargetTokens(text: string) {
    return extractWordTokens(text)
        .map((token) => ({ sourceIndex: token.index, token: normalizeWordForMatch(token.text) }))
        .filter((item) => Boolean(item.token));
}

function toSpokenTokens(text: string) {
    return extractWordTokens(text)
        .map((token) => normalizeWordForMatch(token.text))
        .filter(Boolean);
}

describe("listening-shadowing tolerance", () => {
    it("treats common ASR near-homophones as equivalent for correction alignment", () => {
        const reference = "Could you help me move this box? It's a bit heavy.";
        const transcript = "could you help me move this boss is a big heaven";

        const targetTokens = toTargetTokens(reference);
        const spokenTokens = toSpokenTokens(transcript);
        const result = alignPronunciationTokens({ targetTokens, spokenTokens });

        expect(result.correctCount).toBeGreaterThanOrEqual(10);
    });

    it("does not cascade to all-following words when one middle word is omitted", () => {
        const reference = "I really like to read books every night";
        const transcript = "i really to read books every night";

        const score = scoreListeningRecognition(reference, transcript);
        expect(score.correctCount).toBeGreaterThanOrEqual(6);
        expect(score.totalCount).toBe(8);
    });
});

