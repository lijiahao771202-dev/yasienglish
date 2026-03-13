import { describe, expect, it } from "vitest";

import {
    buildProfilePatch,
    createDefaultLocalProfile,
    createLocalVocabularyItem,
    normalizeWordKey,
    toLocalProfile,
} from "./user-sync";

describe("user sync helpers", () => {
    it("normalizes word keys for cross-device upserts", () => {
        expect(normalizeWordKey(" Resilient ")).toBe("resilient");
    });

    it("creates a default local profile with inventory-derived hints", () => {
        const profile = createDefaultLocalProfile("user-1");

        expect(profile.user_id).toBe("user-1");
        expect(profile.elo_rating).toBe(600);
        expect(profile.listening_elo).toBe(600);
        expect(profile.hints).toBe(profile.inventory?.capsule);
        expect(profile.sync_status).toBe("pending");
    });

    it("maps a remote profile snapshot into the local Dexie shape", () => {
        const localProfile = toLocalProfile({
            user_id: "user-1",
            translation_elo: 900,
            listening_elo: 720,
            streak_count: 4,
            max_translation_elo: 910,
            max_listening_elo: 730,
            coins: 25,
            inventory: {
                capsule: 18,
                hint_ticket: 4,
                vocab_ticket: 3,
                audio_ticket: 2,
                refresh_ticket: 1,
            },
            owned_themes: ["morning_coffee", "sakura"],
            active_theme: "sakura",
            updated_at: "2026-03-13T12:00:00.000Z",
            last_practice_at: "2026-03-13T11:59:00.000Z",
        });

        expect(localProfile.elo_rating).toBe(900);
        expect(localProfile.listening_elo).toBe(720);
        expect(localProfile.hints).toBe(18);
        expect(localProfile.sync_status).toBe("synced");
    });

    it("creates a profile patch without overwriting unrelated fields", () => {
        const patch = buildProfilePatch({
            coins: 42,
            active_theme: "golden_hour",
        });

        expect(patch).toEqual({
            coins: 42,
            active_theme: "golden_hour",
        });
    });

    it("creates a local vocab mirror item with sync metadata", () => {
        const item = createLocalVocabularyItem("user-1", {
            word: "Resilient",
            definition: "Able to recover quickly.",
            translation: "有韧性的",
            context: "She is resilient after setbacks.",
            example: "A resilient team adapts fast.",
            timestamp: 100,
            stability: 1,
            difficulty: 2,
            elapsed_days: 3,
            scheduled_days: 4,
            reps: 5,
            state: 1,
            last_review: 6,
            due: 7,
        });

        expect(item.user_id).toBe("user-1");
        expect(item.word_key).toBe("resilient");
        expect(item.sync_status).toBe("pending");
    });
});
