import { describe, expect, it } from "vitest";
import { fsrs as createOfficialFsrs, Rating as OfficialRating, State as OfficialState, type Card } from "ts-fsrs";

import type { VocabItem } from "./db";
import {
    Rating,
    State,
    archiveVocabularyCard,
    createEmptyCard,
    getRatingEtaLabel,
    isVocabularyArchived,
    resetVocabularySchedulingState,
    scheduleCard,
} from "./fsrs";

const officialScheduler = createOfficialFsrs();

function buildNewCard(now: number): VocabItem {
    return {
        ...createEmptyCard("brief", now),
        word: "brief",
        definition: "n. 简报",
        translation: "n. 简报",
        context: "",
        example: "",
        timestamp: now - 1000,
    } as VocabItem;
}

function buildReviewCard(now: number): VocabItem {
    return {
        ...buildNewCard(now),
        stability: 2.3,
        difficulty: 4.2,
        elapsed_days: 1,
        scheduled_days: 1,
        reps: 2,
        lapses: 1,
        learning_steps: 0,
        state: State.Review,
        last_review: now - 86400000,
        due: now,
    };
}

function toOfficialCard(card: VocabItem): Card {
    return {
        due: new Date(card.due),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        learning_steps: card.learning_steps,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state as OfficialState,
        last_review: card.last_review > 0 ? new Date(card.last_review) : undefined,
    };
}

describe("official fsrs adapter", () => {
    it("matches ts-fsrs for a new card preview", () => {
        const now = Date.parse("2026-04-09T10:00:00.000Z");
        const card = buildNewCard(now);

        const expected = officialScheduler.next(toOfficialCard(card), new Date(now), OfficialRating.Easy).card;
        const scheduled = scheduleCard(card, Rating.Easy, now);

        expect(scheduled.state).toBe(expected.state);
        expect(scheduled.scheduled_days).toBe(expected.scheduled_days);
        expect(scheduled.learning_steps).toBe(expected.learning_steps);
        expect(scheduled.reps).toBe(expected.reps);
        expect(scheduled.lapses).toBe(expected.lapses);
        expect(scheduled.due).toBe(expected.due.getTime());
        expect(getRatingEtaLabel(card, Rating.Easy, now)).toBe(`${expected.scheduled_days}d`);
    });

    it("matches ts-fsrs for a review lapse", () => {
        const now = Date.parse("2026-04-09T10:00:00.000Z");
        const card = buildReviewCard(now);

        const expected = officialScheduler.next(toOfficialCard(card), new Date(now), OfficialRating.Again).card;
        const scheduled = scheduleCard(card, Rating.Again, now);

        expect(scheduled.state).toBe(expected.state);
        expect(scheduled.scheduled_days).toBe(expected.scheduled_days);
        expect(scheduled.learning_steps).toBe(expected.learning_steps);
        expect(scheduled.reps).toBe(expected.reps);
        expect(scheduled.lapses).toBe(expected.lapses);
        expect(scheduled.due).toBe(expected.due.getTime());
        expect(scheduled.stability).toBeCloseTo(expected.stability, 8);
        expect(scheduled.difficulty).toBeCloseTo(expected.difficulty, 8);
    });
});

describe("vocabulary scheduling resets", () => {
    it("fully resets scheduling fields while preserving word content", () => {
        const now = Date.parse("2026-04-09T10:00:00.000Z");
        const card = {
            ...buildReviewCard(now),
            archived_at: now - 1000,
        };

        const reset = resetVocabularySchedulingState(card, now);

        expect(reset.word).toBe(card.word);
        expect(reset.translation).toBe(card.translation);
        expect(reset.timestamp).toBe(card.timestamp);
        expect(reset.stability).toBe(0);
        expect(reset.difficulty).toBe(0);
        expect(reset.elapsed_days).toBe(0);
        expect(reset.scheduled_days).toBe(0);
        expect(reset.reps).toBe(0);
        expect(reset.lapses).toBe(0);
        expect(reset.learning_steps).toBe(0);
        expect(reset.state).toBe(State.New);
        expect(reset.last_review).toBe(0);
        expect(reset.due).toBe(now);
        expect(reset.archived_at).toBeUndefined();
    });
});

describe("manual archive helpers", () => {
    it("archives a card without rewriting scheduling fields", () => {
        const now = Date.parse("2026-04-09T10:00:00.000Z");
        const card = buildReviewCard(now);

        const archived = archiveVocabularyCard(card, now);

        expect(isVocabularyArchived(archived)).toBe(true);
        expect(archived.archived_at).toBe(now);
        expect(archived.due).toBe(card.due);
        expect(archived.state).toBe(card.state);
        expect(archived.scheduled_days).toBe(card.scheduled_days);
        expect(archived.stability).toBe(card.stability);
    });
});
