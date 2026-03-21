import { afterEach, describe, expect, it, vi } from "vitest";

import {
    RANDOM_SCENARIO_TOPIC,
    getBattleQuickMatchPoolSize,
    pickBattleQuickMatchTopic,
    resolveBattleScenarioTopic,
} from "./battle-quickmatch-topics";

describe("resolveBattleScenarioTopic", () => {
    it("passes through explicit topics unchanged", () => {
        expect(resolveBattleScenarioTopic("  Custom scenario  ")).toBe("Custom scenario");
    });

    it("treats the random sentinel as a quickmatch request", () => {
        const spy = vi.spyOn(Math, "random").mockReturnValue(0);
        const topic = resolveBattleScenarioTopic(RANDOM_SCENARIO_TOPIC);
        spy.mockRestore();

        expect(topic).toContain("·");
    });
});

describe("pickBattleQuickMatchTopic", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("avoids recently used topics and domains when possible", () => {
        const spy = vi.spyOn(Math, "random").mockReturnValue(0);

        const recentTopicIds = [
            "daily-life:morning-rush:first-person",
            "social-relations:new-introduction:first-person",
            "family-home:parent-talk:first-person",
            "education-learning:class-participation:first-person",
            "workplace-career:meeting-change:first-person",
        ];
        const recentDomainIds = [
            "daily-life",
            "social-relations",
            "family-home",
            "education-learning",
            "workplace-career",
            "business-communication",
            "travel-transport",
            "city-living",
        ];

        const topic = pickBattleQuickMatchTopic({
            elo: 1000,
            history: {
                topicIds: recentTopicIds,
                domainIds: recentDomainIds,
            },
        });

        spy.mockRestore();

        expect(recentTopicIds).not.toContain(topic.id);
        expect(recentDomainIds).not.toContain(topic.domainId);
        expect(topic.topicLine).toContain(topic.domainLabel);
        expect(topic.label).toMatch(/·/);
        expect(topic.detail).toBeTruthy();
    });

    it("falls back cleanly when the history has exhausted the pool", () => {
        const spy = vi.spyOn(Math, "random").mockReturnValue(0);
        const topic = pickBattleQuickMatchTopic({
            elo: 2200,
            history: {
                topicIds: ["a", "b", "c"],
                domainIds: [
                    "daily-life",
                    "social-relations",
                    "family-home",
                    "education-learning",
                    "workplace-career",
                    "business-communication",
                    "travel-transport",
                    "city-living",
                    "food-consumer",
                    "health-medical",
                    "mental-emotion",
                    "tech-ai",
                    "science-research",
                    "media-communication",
                    "culture-history",
                    "entertainment-film",
                    "music-arts",
                    "sports-fitness",
                    "finance-economy",
                    "society-governance",
                    "law-ethics",
                    "environment-climate",
                    "public-service",
                    "personal-growth",
                    "lifestyle",
                    "hobbies-interest",
                    "online-shopping",
                    "communication-conflict",
                    "planning-management",
                    "future-trends",
                ],
            },
        });
        spy.mockRestore();

        expect(topic.id).toBeTruthy();
        expect(topic.topicLine).toBeTruthy();
    });
});

describe("getBattleQuickMatchPoolSize", () => {
    it("creates a large enough pool for diverse quickmatch rounds", () => {
        expect(getBattleQuickMatchPoolSize(1000)).toBeGreaterThan(900);
    });
});
