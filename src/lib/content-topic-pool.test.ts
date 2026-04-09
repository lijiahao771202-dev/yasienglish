import { beforeEach, describe, expect, it, vi } from "vitest";

import { __resetTopicHistoryForTests, pickCatTopicSeed } from "./content-topic-pool";

describe("content topic pool", () => {
    beforeEach(() => {
        __resetTopicHistoryForTests();
        vi.restoreAllMocks();
    });

    it("avoids exact recent CAT topics from persistent history", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);

        const picked = pickCatTopicSeed({
            score: 1000,
            recentTopicLines: [
                "学习方法 · Spaced repetition versus massed practice",
                "学习方法 · How retrieval practice improves long-term memory",
            ],
        });

        expect(picked.topicLine).not.toBe("学习方法 · Spaced repetition versus massed practice");
        expect(picked.topicLine).not.toBe("学习方法 · How retrieval practice improves long-term memory");
    });

    it("rotates CAT domains and subtopics across consecutive picks", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);

        const first = pickCatTopicSeed({ score: 2200 });
        const second = pickCatTopicSeed({ score: 2200 });
        const third = pickCatTopicSeed({ score: 2200 });

        expect(second.topicLine).not.toBe(first.topicLine);
        expect(third.topicLine).not.toBe(second.topicLine);
        expect(new Set([first.domainId, second.domainId, third.domainId]).size).toBe(3);
        expect(new Set([first.subtopicId, second.subtopicId, third.subtopicId]).size).toBe(3);
    });
});
