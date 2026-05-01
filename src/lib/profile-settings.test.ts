import { describe, expect, it } from "vitest";

import {
    DEFAULT_LEARNING_PREFERENCES,
    normalizeAiProvider,
    normalizeLearningPreferences,
    RANDOM_ENGLISH_TTS_VOICE,
    resolveLearningPreferenceTtsVoice,
} from "./profile-settings";

describe("profile settings", () => {
    it("defaults rebuild shadowing auto-open to enabled", () => {
        expect(DEFAULT_LEARNING_PREFERENCES.rebuild_auto_open_shadowing_prompt).toBe(true);
        expect(normalizeLearningPreferences({}).rebuild_auto_open_shadowing_prompt).toBe(true);
    });

    it("preserves an explicit rebuild shadowing auto-open preference", () => {
        expect(
            normalizeLearningPreferences({
                rebuild_auto_open_shadowing_prompt: false,
            }).rebuild_auto_open_shadowing_prompt,
        ).toBe(false);
    });

    it("preserves the random english voice preference", () => {
        expect(normalizeLearningPreferences({
            tts_voice: RANDOM_ENGLISH_TTS_VOICE,
        }).tts_voice).toBe(RANDOM_ENGLISH_TTS_VOICE);
    });

    it("resolves the random english voice preference without picking zh-CN or en-IN voices", () => {
        const resolved = resolveLearningPreferenceTtsVoice(RANDOM_ENGLISH_TTS_VOICE, 0.25);

        expect(resolved.startsWith("en-")).toBe(true);
        expect(resolved.startsWith("en-IN-")).toBe(false);
    });

    it("normalizes supported AI providers", () => {
        expect(normalizeAiProvider("nvidia")).toBe("nvidia");
        expect(normalizeAiProvider("mimo")).toBe("mimo");
        expect(normalizeAiProvider("unknown")).toBe("deepseek");
    });
});
