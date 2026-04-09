import { describe, expect, it } from "vitest";

import type { VocabItem } from "./db";
import { Rating, State, createEmptyCard, graduateCard, isCardGraduated, getRatingEtaLabel, scheduleCard } from "./fsrs";

function buildCard(): VocabItem {
    const now = new Date("2026-03-30T10:00:00.000Z").getTime();
    return {
        ...createEmptyCard("brief"),
        word: "brief",
        definition: "n. 简报",
        translation: "n. 简报",
        context: "",
        example: "",
        timestamp: now - 1000,
        stability: 2.3,
        difficulty: 4.2,
        elapsed_days: 1,
        scheduled_days: 1,
        reps: 2,
        state: State.Review,
        last_review: now - 86400000,
        due: now,
    } as VocabItem;
}

describe("fsrs graduation", () => {
    it("graduates a card out of the review queue with a persistent sentinel schedule", () => {
        const now = new Date("2026-03-30T10:00:00.000Z").getTime();
        const graduated = graduateCard(buildCard(), now);

        expect(graduated.state).toBe(State.Review);
        expect(graduated.scheduled_days).toBeGreaterThanOrEqual(365000);
        expect(graduated.due).toBeGreaterThan(now + 100 * 365 * 24 * 60 * 60 * 1000);
        expect(graduated.last_review).toBe(now);
        expect(graduated.reps).toBe(3);
        expect(isCardGraduated(graduated)).toBe(true);
    });

    it("does not treat a normal review card as graduated", () => {
        expect(isCardGraduated(buildCard())).toBe(false);
    });
});

describe("fsrs rating eta labels", () => {
    it("uses the real scheduled result for a new card instead of a static placeholder", () => {
        const now = new Date("2026-04-09T10:00:00.000Z").getTime();
        const card = {
            ...createEmptyCard("brief"),
            word: "brief",
            definition: "n. 简报",
            translation: "n. 简报",
            context: "",
            example: "",
            timestamp: now - 1000,
        } as VocabItem;

        expect(getRatingEtaLabel(card, Rating.Again, now)).toBe("1m");
        expect(getRatingEtaLabel(card, Rating.Hard, now)).toBe("5m");
        expect(getRatingEtaLabel(card, Rating.Good, now)).toBe("10m");
        expect(getRatingEtaLabel(card, Rating.Easy, now)).toBe("6d");
    });

    it("matches the scheduleCard result for review cards", () => {
        const now = new Date("2026-04-09T10:00:00.000Z").getTime();
        const card = buildCard();
        const scheduled = scheduleCard(card, Rating.Easy, now);

        expect(getRatingEtaLabel(card, Rating.Easy, now)).toBe(`${scheduled.scheduled_days}d`);
    });
});
