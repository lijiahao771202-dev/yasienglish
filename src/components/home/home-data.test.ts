import { describe, expect, it } from "vitest";

import { buildHomeCalendar, buildHomeDashboardModel } from "@/components/home/home-data";

describe("home-data", () => {
    it("marks today, active days, and recent streak days in the monthly calendar", () => {
        const calendar = buildHomeCalendar(
            new Set(["2026-03-10", "2026-03-12", "2026-03-13", "2026-03-14"]),
            new Date(2026, 2, 14),
        );

        const today = calendar.find((day) => day.dateKey === "2026-03-14");
        const streakDay = calendar.find((day) => day.dateKey === "2026-03-13");
        const olderActiveDay = calendar.find((day) => day.dateKey === "2026-03-10");

        expect(today).toMatchObject({
            isToday: true,
            isActive: true,
            isStreak: true,
        });
        expect(streakDay).toMatchObject({
            isToday: false,
            isActive: true,
            isStreak: true,
        });
        expect(olderActiveDay).toMatchObject({
            isActive: true,
            isStreak: false,
        });
    });

    it("builds the dashboard view model from local mirror data", () => {
        const model = buildHomeDashboardModel({
            email: "luna@yasi.app",
            profile: {
                elo_rating: 780,
                streak_count: 6,
                max_elo: 920,
                last_practice: Date.now(),
                username: "Luna",
                avatar_preset: "bubble-bear",
                learning_preferences: {
                    target_mode: "battle",
                    english_level: "C1",
                    daily_goal_minutes: 45,
                    ui_theme_preference: "peach_glow",
                    tts_voice: "en-US-AndrewNeural",
                },
            },
            readArticles: [
                { url: "https://example.com/1", timestamp: new Date(2026, 2, 14).getTime() },
                { url: "https://example.com/2", timestamp: new Date(2026, 2, 12).getTime() },
                { url: "https://example.com/3", timestamp: new Date(2026, 2, 10).getTime() },
            ],
            vocabulary: [
                {
                    word: "gentle",
                    definition: "kind",
                    translation: "温柔",
                    context: "gentle push",
                    example: "A gentle reminder.",
                    timestamp: new Date(2026, 2, 14).getTime(),
                    stability: 0,
                    difficulty: 0,
                    elapsed_days: 0,
                    scheduled_days: 0,
                    reps: 0,
                    state: 0,
                    last_review: new Date(2026, 2, 13).getTime(),
                    due: new Date(2026, 2, 15).getTime(),
                },
                {
                    word: "bloom",
                    definition: "flower",
                    translation: "开花",
                    context: "bloom slowly",
                    example: "Ideas bloom later.",
                    timestamp: new Date(2026, 2, 12).getTime(),
                    stability: 0,
                    difficulty: 0,
                    elapsed_days: 0,
                    scheduled_days: 0,
                    reps: 0,
                    state: 0,
                    last_review: new Date(2026, 2, 12).getTime(),
                    due: new Date(2026, 2, 16).getTime(),
                },
            ],
            writingEntries: [
                { articleTitle: "One", content: "draft", score: 7, timestamp: new Date(2026, 2, 13).getTime() },
                { articleTitle: "Two", content: "draft", score: 8, timestamp: new Date(2026, 2, 11).getTime() },
            ],
            eloHistory: [
                { mode: "translation", elo: 760, change: 12, timestamp: new Date(2026, 2, 13).getTime() },
                { mode: "translation", elo: 780, change: 20, timestamp: new Date(2026, 2, 14).getTime() },
            ],
            now: new Date(2026, 2, 14),
        });

        expect(model.headline).toBe("Luna");
        expect(model.monthLabel).toBe("March");
        expect(model.glowMetrics).toEqual([
            { id: "streak", label: "day streak", value: "6" },
            { id: "words", label: "words saved", value: "2" },
            { id: "reads", label: "articles read", value: "3" },
        ]);
        expect(model.goal).toMatchObject({
            dailyGoalMinutes: 45,
            targetModeLabel: "Battle flow",
            englishLevelLabel: "C1 learner",
        });
        expect(model.growth).toMatchObject({
            eloRating: 780,
            maxElo: 920,
        });
        expect(model.learningLanes.map((lane) => lane.title)).toEqual(["阅读", "对战", "生词本", "写作"]);
        expect(model.learningLanes[0]?.valueLabel).toBe("3 pieces");
        expect(model.learningLanes[1]?.valueLabel).toBe("Elo 780");
        expect(model.learningLanes[2]?.valueLabel).toBe("2 saved");
        expect(model.learningLanes[3]?.valueLabel).toBe("2 drafts");
    });
});
