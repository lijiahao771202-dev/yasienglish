import {
    createEmptyCard as createOfficialEmptyCard,
    fsrs as createOfficialFsrs,
    Rating as OfficialRating,
    State as OfficialState,
    type Card as OfficialCard,
    type Grade as OfficialGrade,
} from "ts-fsrs";

import type { VocabItem } from "./db";

export { Rating, State } from "ts-fsrs";
export type { Card as FSRSCard } from "ts-fsrs";

const officialFsrs = createOfficialFsrs();
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const VOCAB_REVIEW_BATCH_SIZE = 25;

type SchedulingFields = Pick<VocabItem, "stability" | "difficulty" | "elapsed_days" | "scheduled_days" | "reps" | "lapses" | "learning_steps" | "state" | "last_review" | "due">;

export interface FSRSReviewLog {
    rating: OfficialRating;
    state: OfficialState;
    due: number;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    last_elapsed_days: number;
    scheduled_days: number;
    learning_steps: number;
    review: number;
}

export function createEmptyCard(word: string, now: number = Date.now()): Partial<VocabItem> {
    const officialCard = createOfficialEmptyCard(now);

    return {
        word,
        timestamp: now,
        stability: officialCard.stability,
        difficulty: officialCard.difficulty,
        elapsed_days: officialCard.elapsed_days,
        scheduled_days: officialCard.scheduled_days,
        reps: officialCard.reps,
        lapses: officialCard.lapses,
        learning_steps: officialCard.learning_steps,
        state: officialCard.state,
        last_review: 0,
        due: officialCard.due.getTime(),
    };
}

export function dateDiffInDays(a: number, b: number) {
    return Math.max(0, Math.floor((b - a) / MS_PER_DAY));
}

function toOfficialCard(card: SchedulingFields): OfficialCard {
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

function fromOfficialCard<T extends SchedulingFields>(card: T, nextCard: OfficialCard): T {
    return {
        ...card,
        stability: nextCard.stability,
        difficulty: nextCard.difficulty,
        elapsed_days: nextCard.elapsed_days,
        scheduled_days: nextCard.scheduled_days,
        reps: nextCard.reps,
        lapses: nextCard.lapses,
        learning_steps: nextCard.learning_steps,
        state: nextCard.state as T["state"],
        last_review: nextCard.last_review ? nextCard.last_review.getTime() : 0,
        due: nextCard.due.getTime(),
    };
}

export function resetVocabularySchedulingState<T extends VocabItem>(card: T, now: number = Date.now()): T {
    return {
        ...card,
        ...createEmptyCard(card.word, now),
        timestamp: card.timestamp,
        archived_at: undefined,
    } as T;
}

export function isVocabularyArchived(card: Pick<VocabItem, "archived_at">) {
    return typeof card.archived_at === "number" && card.archived_at > 0;
}

export function archiveVocabularyCard<T extends VocabItem>(card: T, now: number = Date.now()): T {
    return {
        ...card,
        archived_at: now,
    };
}

export function unarchiveVocabularyCard<T extends VocabItem>(card: T): T {
    return {
        ...card,
        archived_at: undefined,
    };
}

export function isCardGraduated(card: Pick<VocabItem, "archived_at">) {
    return isVocabularyArchived(card);
}

export function graduateCard<T extends VocabItem>(card: T, now: number = Date.now()): T {
    return archiveVocabularyCard(card, now);
}

export function scheduleCard(card: VocabItem, rating: OfficialRating, now: number = Date.now()): VocabItem {
    const scheduled = officialFsrs.next(toOfficialCard(card), new Date(now), rating as OfficialGrade).card;
    return fromOfficialCard(card, scheduled);
}

function formatEtaFromDue(now: number, due: number, scheduledDays: number): string {
    const diffMs = Math.max(0, due - now);

    if (scheduledDays > 0) {
        return `${scheduledDays}d`;
    }

    const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
    if (diffMinutes < 60) {
        return `${diffMinutes}m`;
    }

    const diffHours = Math.max(1, Math.round(diffMinutes / 60));
    if (diffHours < 24) {
        return `${diffHours}h`;
    }

    return `${Math.max(1, Math.round(diffHours / 24))}d`;
}

export function getRatingEtaLabel(card: VocabItem, rating: OfficialRating, now: number = Date.now()): string {
    const scheduled = scheduleCard(card, rating, now);
    return formatEtaFromDue(now, scheduled.due, scheduled.scheduled_days);
}

export const scheduleVocabularyCard = scheduleCard;
