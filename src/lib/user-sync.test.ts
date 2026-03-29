import { describe, expect, it } from "vitest";

import {
    buildProfilePatch,
    createDefaultLocalProfile,
    createLocalVocabularyItem,
    defaultVocabSourceLabel,
    DEFAULT_AVATAR_PRESET,
    DEFAULT_LEARNING_PREFERENCES,
    DEFAULT_PROFILE_USERNAME,
    normalizeWordKey,
    toLocalProfile,
    toRemoteEloHistoryRow,
    toLocalVocabularyItem,
    toRemoteVocabularyRow,
} from "./user-sync";

describe("user sync helpers", () => {
    it("normalizes word keys for cross-device upserts", () => {
        expect(normalizeWordKey(" Resilient ")).toBe("resilient");
    });

    it("creates a default local profile with inventory-derived hints", () => {
        const profile = createDefaultLocalProfile("user-1");

        expect(profile.user_id).toBe("user-1");
        expect(profile.elo_rating).toBe(400);
        expect(profile.listening_elo).toBe(400);
        expect(profile.rebuild_hidden_elo).toBe(400);
        expect(profile.rebuild_elo).toBe(400);
        expect(profile.dictation_elo).toBe(400);
        expect(profile.max_elo).toBe(400);
        expect(profile.listening_scoring_version).toBe(2);
        expect(profile.listening_max_elo).toBe(400);
        expect(profile.rebuild_max_elo).toBe(400);
        expect(profile.dictation_max_elo).toBe(400);
        expect(profile.coins).toBe(500);
        expect(profile.inventory).toEqual({
            capsule: 10,
            hint_ticket: 10,
            vocab_ticket: 10,
            audio_ticket: 10,
            refresh_ticket: 10,
        });
        expect(profile.owned_themes).toEqual(["morning_coffee"]);
        expect(profile.active_theme).toBe("morning_coffee");
        expect(profile.hints).toBe(profile.inventory?.capsule);
        expect(profile.username).toBe(DEFAULT_PROFILE_USERNAME);
        expect(profile.avatar_preset).toBe(DEFAULT_AVATAR_PRESET);
        expect(profile.learning_preferences).toEqual(DEFAULT_LEARNING_PREFERENCES);
        expect(profile.sync_status).toBe("pending");
    });

    it("maps a remote profile snapshot into the local Dexie shape", () => {
        const localProfile = toLocalProfile({
            user_id: "user-1",
            translation_elo: 900,
            listening_elo: 720,
            rebuild_hidden_elo: 665,
            rebuild_elo: 690,
            dictation_elo: 680,
            streak_count: 4,
            listening_streak: 2,
            rebuild_streak: 5,
            dictation_streak: 3,
            max_translation_elo: 910,
            max_listening_elo: 730,
            rebuild_max_elo: 710,
            dictation_max_elo: 740,
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
            username: "Luna",
            avatar_preset: "peach-spark",
            bio: "Practice makes flow.",
            learning_preferences: {
                target_mode: "battle",
                english_level: "B2",
                daily_goal_minutes: 35,
                ui_theme_preference: "bubblegum_pop",
                tts_voice: "en-US-AriaNeural",
            },
            updated_at: "2026-03-13T12:00:00.000Z",
            last_practice_at: "2026-03-13T11:59:00.000Z",
        });

        expect(localProfile.elo_rating).toBe(900);
        expect(localProfile.listening_scoring_version).toBe(0);
        expect(localProfile.listening_elo).toBe(720);
        expect(localProfile.rebuild_hidden_elo).toBe(665);
        expect(localProfile.rebuild_elo).toBe(690);
        expect(localProfile.rebuild_streak).toBe(5);
        expect(localProfile.rebuild_max_elo).toBe(710);
        expect(localProfile.dictation_elo).toBe(680);
        expect(localProfile.dictation_streak).toBe(3);
        expect(localProfile.hints).toBe(18);
        expect(localProfile.username).toBe("Luna");
        expect(localProfile.avatar_preset).toBe("peach-spark");
        expect(localProfile.bio).toBe("Practice makes flow.");
        expect(localProfile.learning_preferences?.target_mode).toBe("battle");
        expect(localProfile.learning_preferences?.tts_voice).toBe("en-US-AriaNeural");
        expect(localProfile.sync_status).toBe("synced");
    });

    it("creates a profile patch without overwriting unrelated fields", () => {
        const patch = buildProfilePatch({
            coins: 42,
            active_theme: "golden_hour",
            username: "Nova",
            avatar_preset: "mint-orbit",
            bio: "Focused and playful.",
            rebuild_hidden_elo: 588,
            rebuild_elo: 640,
            rebuild_streak: 3,
            rebuild_max_elo: 700,
            dictation_elo: 512,
            dictation_streak: 6,
            dictation_max_elo: 640,
            last_practice_at: "2026-03-13T13:00:00.000Z",
            learning_preferences: {
                target_mode: "vocab",
                english_level: "C1",
                daily_goal_minutes: 45,
                ui_theme_preference: "starlight_arcade",
                tts_voice: "en-US-BrianNeural",
            },
        });

        expect(patch).toEqual({
            coins: 42,
            active_theme: "golden_hour",
            username: "Nova",
            avatar_preset: "mint-orbit",
            bio: "Focused and playful.",
            rebuild_hidden_elo: 588,
            rebuild_elo: 640,
            rebuild_streak: 3,
            rebuild_max_elo: 700,
            dictation_elo: 512,
            dictation_streak: 6,
            dictation_max_elo: 640,
            last_practice_at: "2026-03-13T13:00:00.000Z",
            learning_preferences: {
                target_mode: "vocab",
                english_level: "C1",
                daily_goal_minutes: 45,
                ui_theme_preference: "starlight_arcade",
                tts_voice: "en-US-BrianNeural",
            },
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

    it("preserves vocab source metadata across local and remote mappings", () => {
        const local = createLocalVocabularyItem("user-1", {
            word: "turn off",
            definition: "to stop a device from operating",
            translation: "关闭",
            context: "Sorry, I forgot to turn off the lights.",
            example: "Please turn off your phone.",
            phonetic: "/tɜːrn ɔf/",
            meaning_groups: [
                { pos: "v.", meanings: ["关闭", "关掉设备"] },
                { pos: "phr.", meanings: ["使失去兴趣"] },
            ],
            highlighted_meanings: ["关闭"],
            source_kind: "rebuild",
            source_label: "",
            source_sentence: "Sorry, I forgot to turn off the lights.",
            source_note: "",
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

        expect(local.source_kind).toBe("rebuild");
        expect(local.source_label).toBe(defaultVocabSourceLabel("rebuild"));
        expect(local.source_sentence).toBe("Sorry, I forgot to turn off the lights.");
        expect(local.phonetic).toBe("/tɜːrn ɔf/");
        expect(local.meaning_groups).toHaveLength(2);
        expect(local.highlighted_meanings).toEqual(["关闭"]);

        const remote = toRemoteVocabularyRow("user-1", local);
        const roundTrip = toLocalVocabularyItem({
            ...remote,
            updated_at: "2026-03-29T00:00:00.000Z",
        });

        expect(roundTrip.source_kind).toBe("rebuild");
        expect(roundTrip.source_label).toBe("来自 Rebuild");
        expect(roundTrip.source_sentence).toBe("Sorry, I forgot to turn off the lights.");
        expect(roundTrip.phonetic).toBe("/tɜːrn ɔf/");
        expect(roundTrip.meaning_groups).toEqual(local.meaning_groups);
        expect(roundTrip.highlighted_meanings).toEqual(["关闭"]);
    });

    it("maps dictation elo history rows to remote payloads", () => {
        const row = toRemoteEloHistoryRow("user-1", {
            mode: "dictation",
            elo: 721,
            change: 13,
            timestamp: 1234567890,
        });

        expect(row.user_id).toBe("user-1");
        expect(row.mode).toBe("dictation");
        expect(row.elo).toBe(721);
        expect(row.change).toBe(13);
        expect(row.timestamp_ms).toBe(1234567890);
    });
});
