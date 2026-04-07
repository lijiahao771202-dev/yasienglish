import { describe, expect, it } from "vitest";

import {
    DEFAULT_LEARNING_PREFERENCES,
    normalizeLearningPreferences,
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
});
