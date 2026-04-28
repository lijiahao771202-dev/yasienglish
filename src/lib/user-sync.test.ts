import { describe, expect, it } from "vitest";

import {
    applyTranslationEloReset,
    buildProfilePatch,
    createDefaultLocalProfile,
    createLocalVocabularyItem,
    defaultVocabSourceLabel,
    DEFAULT_AVATAR_PRESET,
    DEFAULT_LEARNING_PREFERENCES,
    DEFAULT_PROFILE_USERNAME,
    DEFAULT_TRANSLATION_ELO,
    normalizeWordKey,
    toLocalDailyPlanRecord,
    toLocalProfile,
    toLocalReadArticle,
    toRemoteEloHistoryRow,
    toRemoteDailyPlanRow,
    toRemoteReadArticle,
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
        expect(profile.elo_rating).toBe(DEFAULT_TRANSLATION_ELO);
        expect(profile.listening_elo).toBe(400);
        expect(profile.rebuild_hidden_elo).toBe(400);
        expect(profile.rebuild_elo).toBe(400);
        expect(profile.dictation_elo).toBe(400);
        expect(profile.max_elo).toBe(DEFAULT_TRANSLATION_ELO);
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
        expect(profile.deepseek_model).toBe("deepseek-v4-flash");
        expect(profile.deepseek_thinking_mode).toBe("off");
        expect(profile.deepseek_reasoning_effort).toBe("high");
        expect(profile.nvidia_api_key).toBe("");
        expect(profile.nvidia_model).toBe("z-ai/glm5");
        expect(profile.github_api_key).toBe("");
        expect(profile.github_model).toBe("openai/gpt-4.1");
        expect(profile.learning_preferences).toEqual(DEFAULT_LEARNING_PREFERENCES);
        expect(profile.daily_plan_snapshots).toEqual([]);
        expect(profile.sync_status).toBe("pending");
    });

    it("resets only translate elo fields to the 200 baseline", () => {
        const nextProfile = applyTranslationEloReset({
            elo_rating: 1380,
            max_elo: 1640,
            listening_elo: 920,
            listening_max_elo: 1080,
        });

        expect(nextProfile.elo_rating).toBe(DEFAULT_TRANSLATION_ELO);
        expect(nextProfile.max_elo).toBe(DEFAULT_TRANSLATION_ELO);
        expect(nextProfile.listening_elo).toBe(920);
        expect(nextProfile.listening_max_elo).toBe(1080);
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
            deepseek_model: "deepseek-v4-pro",
            deepseek_thinking_mode: "on",
            deepseek_reasoning_effort: "max",
            github_api_key: "github-key",
            github_model: "gpt-4o-mini",
            learning_preferences: {
                target_mode: "battle",
                english_level: "B2",
                daily_goal_minutes: 35,
                ui_theme_preference: "bubblegum_pop",
                tts_voice: "en-US-AriaNeural",
            },
            daily_plan_snapshots: [
                {
                    date: "2026-04-08",
                    updated_at: 1712563200000,
                    items: [
                        {
                            id: "task-1",
                            text: "雅思精听",
                            completed: false,
                            type: "listening",
                            target: 2,
                            current: 1,
                            chunk_size: 1,
                        },
                    ],
                },
            ],
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
        expect(localProfile.deepseek_model).toBe("deepseek-v4-pro");
        expect(localProfile.deepseek_thinking_mode).toBe("on");
        expect(localProfile.deepseek_reasoning_effort).toBe("max");
        expect(localProfile.github_api_key).toBe("github-key");
        expect(localProfile.github_model).toBe("gpt-4o-mini");
        expect(localProfile.learning_preferences?.target_mode).toBe("battle");
        expect(localProfile.learning_preferences?.tts_voice).toBe("en-US-AriaNeural");
        expect(localProfile.daily_plan_snapshots).toEqual([
            {
                date: "2026-04-08",
                updated_at: 1712563200000,
                items: [
                    {
                        id: "task-1",
                        text: "雅思精听",
                        completed: false,
                        type: "listening_cabin",
                        target: 2,
                        current: 1,
                        chunk_size: 1,
                    },
                ],
            },
        ]);
        expect(localProfile.sync_status).toBe("synced");
    });

    it("creates a profile patch without overwriting unrelated fields", () => {
        const patch = buildProfilePatch({
            coins: 42,
            active_theme: "golden_hour",
            username: "Nova",
            avatar_preset: "mint-orbit",
            bio: "Focused and playful.",
            ai_provider: "nvidia",
            deepseek_model: "deepseek-v4-pro",
            deepseek_thinking_mode: "enabled",
            deepseek_reasoning_effort: "max",
            nvidia_api_key: "nvapi-123",
            nvidia_model: "z-ai/glm5",
            github_api_key: " github-key ",
            github_model: " gpt-4o-mini ",
            rebuild_hidden_elo: 588,
            rebuild_elo: 640,
            rebuild_streak: 3,
            rebuild_max_elo: 700,
            dictation_elo: 512,
            dictation_streak: 6,
            dictation_max_elo: 640,
            exam_date: "2026-06-13",
            exam_type: "ielts",
            daily_plan_snapshots: [
                {
                    date: "2026-04-08",
                    updated_at: 1712563200000,
                    items: [
                        { id: "task-1", text: "语感找回", completed: false, type: "rebuild", target: 20, current: 0, chunk_size: 15 },
                    ],
                },
            ],
            last_practice_at: "2026-03-13T13:00:00.000Z",
            learning_preferences: {
                target_mode: "vocab",
                english_level: "C1",
                daily_goal_minutes: 45,
                ui_theme_preference: "starlight_arcade",
                tts_voice: "en-US-BrianNeural",
                rebuild_auto_open_shadowing_prompt: true,
            },
        });

        expect(patch).toEqual({
            coins: 42,
            active_theme: "golden_hour",
            username: "Nova",
            avatar_preset: "mint-orbit",
            bio: "Focused and playful.",
            ai_provider: "nvidia",
            deepseek_model: "deepseek-v4-pro",
            deepseek_thinking_mode: "on",
            deepseek_reasoning_effort: "max",
            nvidia_api_key: "nvapi-123",
            nvidia_model: "z-ai/glm5",
            github_api_key: "github-key",
            github_model: "gpt-4o-mini",
            rebuild_hidden_elo: 588,
            rebuild_elo: 640,
            rebuild_streak: 3,
            rebuild_max_elo: 700,
            dictation_elo: 512,
            dictation_streak: 6,
            dictation_max_elo: 640,
            exam_date: "2026-06-13",
            exam_type: "ielts",
            daily_plan_snapshots: [
                {
                    date: "2026-04-08",
                    updated_at: 1712563200000,
                    items: [
                        { id: "task-1", text: "语感找回", completed: false, type: "rebuild", target: 20, current: 0, chunk_size: 15 },
                    ],
                },
            ],
            last_practice_at: "2026-03-13T13:00:00.000Z",
            learning_preferences: {
                target_mode: "vocab",
                english_level: "C1",
                daily_goal_minutes: 45,
                ui_theme_preference: "starlight_arcade",
                tts_voice: "en-US-BrianNeural",
                rebuild_auto_open_shadowing_prompt: true,
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
            lapses: 1,
            learning_steps: 0,
            state: 1,
            last_review: 6,
            due: 7,
            archived_at: 8,
        });

        expect(item.user_id).toBe("user-1");
        expect(item.word_key).toBe("resilient");
        expect(item.sync_status).toBe("pending");
        expect(item.lapses).toBe(1);
        expect(item.learning_steps).toBe(0);
        expect(item.archived_at).toBe(8);
    });

    it("round-trips daily plans with source metadata across remote sync helpers", () => {
        const remote = toRemoteDailyPlanRow("user-1", {
            date: "2026-04-08",
            updated_at: 1712563200000,
            items: [
                {
                    id: "task-1",
                    text: "雅思冲刺",
                    completed: false,
                    type: "rebuild",
                    target: 20,
                    current: 4,
                    chunk_size: 15,
                    source: "ai",
                },
                {
                    id: "task-2",
                    text: "补一条",
                    completed: true,
                    source: "manual",
                },
            ],
        });

        expect(remote).toEqual({
            user_id: "user-1",
            date: "2026-04-08",
            items: [
                {
                    id: "task-1",
                    text: "雅思冲刺",
                    completed: false,
                    type: "rebuild",
                    target: 20,
                    current: 4,
                    chunk_size: 15,
                    source: "ai",
                },
                {
                    id: "task-2",
                    text: "补一条",
                    completed: true,
                    source: "manual",
                },
            ],
            updated_at: "2024-04-08T08:00:00.000Z",
        });

        expect(toLocalDailyPlanRecord(remote)).toEqual({
            date: "2026-04-08",
            updated_at: 1712563200000,
            items: [
                {
                    id: "task-1",
                    text: "雅思冲刺",
                    completed: false,
                    type: "rebuild",
                    target: 20,
                    current: 4,
                    chunk_size: 15,
                    source: "ai",
                },
                {
                    id: "task-2",
                    text: "补一条",
                    completed: true,
                    source: "manual",
                },
            ],
        });
    });

    it("preserves vocab source metadata across local and remote mappings", () => {
        const local = createLocalVocabularyItem("user-1", {
            word: "turn off",
            definition: "to stop a device from operating",
            translation: "关闭",
            context: "Sorry, I forgot to turn off the lights.",
            example: "Please turn off your phone.",
            phonetic: "/tɜːrn ɔf/",
            word_breakdown: ["turn", "off"],
            morphology_notes: ["turn: 转动/切换", "off: 离开、关闭状态"],
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
            lapses: 1,
            learning_steps: 0,
            state: 1,
            last_review: 6,
            due: 7,
            archived_at: 8,
        });

        expect(local.source_kind).toBe("rebuild");
        expect(local.source_label).toBe(defaultVocabSourceLabel("rebuild"));
        expect(local.source_sentence).toBe("Sorry, I forgot to turn off the lights.");
        expect(local.phonetic).toBe("/tɜːrn ɔf/");
        expect(local.word_breakdown).toEqual(["turn", "off"]);
        expect(local.morphology_notes).toEqual(["turn: 转动/切换", "off: 离开、关闭状态"]);
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
        expect(roundTrip.word_breakdown).toEqual(["turn", "off"]);
        expect(roundTrip.morphology_notes).toEqual(["turn: 转动/切换", "off: 离开、关闭状态"]);
        expect(roundTrip.meaning_groups).toEqual(local.meaning_groups);
        expect(roundTrip.highlighted_meanings).toEqual(["关闭"]);
        expect(roundTrip.lapses).toBe(1);
        expect(roundTrip.learning_steps).toBe(0);
        expect(roundTrip.archived_at).toBe(8);
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

    it("preserves read article snapshot payloads for cloud round-trip", () => {
        const remote = toRemoteReadArticle("user-1", {
            url: "ai-gen://ielts/123",
            timestamp: 123,
            read_at: 123,
            article_key: "ai-gen://ielts/123",
            article_title: "AI Snapshot",
            article_payload: {
                url: "ai-gen://ielts/123",
                title: "AI Snapshot",
                content: "Paragraph one.",
                textContent: "Paragraph one.",
                timestamp: 123,
                isAIGenerated: true,
            },
            reading_notes_payload: [{
                article_key: "ai-gen://ielts/123",
                article_url: "ai-gen://ielts/123",
                article_title: "AI Snapshot",
                paragraph_order: 1,
                paragraph_block_index: 0,
                selected_text: "Paragraph",
                note_text: "note",
                mark_type: "note",
                mark_color: "hsl(43 80% 86%)",
                start_offset: 0,
                end_offset: 9,
                created_at: 123,
                updated_at: 123,
            }],
            grammar_payload: [{
                key: "grammar:basic:key",
                data: { summary: "ok" },
                timestamp: 123,
            }],
            ask_payload: [{
                key: "ask:ai-gen://ielts/123:p1",
                data: { messages: [{ role: "user", content: "Why?" }] },
                timestamp: 123,
            }],
        });

        const local = toLocalReadArticle({
            ...remote,
            updated_at: "2026-04-02T10:00:00.000Z",
        });

        expect(local.article_key).toBe("ai-gen://ielts/123");
        expect(local.article_title).toBe("AI Snapshot");
        expect(local.article_payload?.isAIGenerated).toBe(true);
        expect(local.reading_notes_payload?.[0]?.selected_text).toBe("Paragraph");
        expect(local.grammar_payload?.[0]?.key).toBe("grammar:basic:key");
        expect(local.ask_payload?.[0]?.key).toBe("ask:ai-gen://ielts/123:p1");
    });
});
