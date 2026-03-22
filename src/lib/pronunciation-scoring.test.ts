import { describe, expect, it } from "vitest";

import {
    buildTipsCn,
    computeOverallScore,
    normalizePronunciationPayload,
} from "./pronunciation-scoring";

describe("pronunciation scoring helpers", () => {
    it("caps the overall score when coverage is too low", () => {
        expect(computeOverallScore(9.4, 8.5, 0.45)).toBe(6);
    });

    it("generates actionable fallback tips from word results", () => {
        const tips = buildTipsCn([
            { word: "market", status: "missing", score: 0 },
            { word: "budget", status: "mispronounced", score: 4.2, spoken: "bugit" },
        ]);

        expect(tips).toHaveLength(2);
        expect(tips[0]).toContain("market");
        expect(tips[1]).toContain("budget");
    });

    it("normalizes raw service payloads into the app contract", () => {
        const payload = normalizePronunciationPayload({
            pronunciation_score: 8.8,
            fluency_score: 7.2,
            utterance_scores: {
                accuracy: 8.4,
                completeness: 8.9,
                fluency: 7.2,
                prosody: 7.6,
                total: 8.1,
            },
            word_results: [
                { word: "the", status: "correct", score: 9.8, accuracy_score: 9.7, stress_score: 9.8 },
                { word: "market", status: "weak", score: 6.7, accuracy_score: 6.5, stress_score: 6.8 },
                { word: "opens", status: "mispronounced", score: 4.3, accuracy_score: 4.1, stress_score: 4.9 },
            ],
            engine: "charsiu",
            engine_version: "test",
        }, {
            fallbackTranscript: "the open",
        });

        expect(payload.engine).toBe("charsiu");
        expect(payload.transcript).toBe("the open");
        expect(payload.score).toBe(8.1);
        expect(payload.pronunciation_score).toBe(8.1);
        expect(payload.content_score).toBe(8.9);
        expect(payload.tips_cn).toHaveLength(0);
        expect(payload.utterance_scores?.prosody).toBe(7.6);
        expect(payload.word_results[2].accuracy_score).toBe(4.1);
        expect(payload.word_results[2].status).toBe("mispronounced");
    });
});
