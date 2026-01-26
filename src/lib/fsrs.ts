import { VocabItem } from "./db";

// FSRS v4.5 simplified params
const PROBABILITY_RECALL = 0.9;
const DECAY = -0.5;
const FACTOR = 0.9; // Smoothing factor

// Correctness ratings
export enum Rating {
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4
}

export enum State {
    New = 0,
    Learning = 1,
    Review = 2,
    Relearning = 3
}

// Default parameters (free-spaced-repetition-scheduler standard defaults)
const w = [
    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61
];

export interface FSRSReviewLog {
    rating: Rating;
    state: State;
    due: number;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    last_elapsed_days: number;
    scheduled_days: number;
    review: number;
}

export function createEmptyCard(word: string): Partial<VocabItem> {
    return {
        word,
        timestamp: Date.now(),
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        state: State.New,
        last_review: 0,
        due: Date.now(),
    };
}

export function dateDiffInDays(a: number, b: number) {
    const _MS_PER_DAY = 1000 * 60 * 60 * 24;
    return Math.max(0, Math.floor((b - a) / _MS_PER_DAY));
}

/**
 * Calculates the next state of the card based on the rating
 */
export function scheduleCard(card: VocabItem, rating: Rating, now: number = Date.now()): VocabItem {
    const newCard = { ...card };

    // Elapsed days since last review
    const elapsedDays = card.last_review === 0 ? 0 : dateDiffInDays(card.last_review, now);

    // Retrievability probability
    const retrievability = Math.pow(1 + FACTOR * elapsedDays / Math.max(card.stability, 0.1), DECAY);

    if (card.state === State.New) {
        newCard.difficulty = initDifficulty(rating);
        newCard.stability = initStability(rating);

        switch (rating) {
            case Rating.Again:
                newCard.state = State.Learning;
                newCard.scheduled_days = 0;
                newCard.due = now + 1 * 60 * 1000; // 1 min
                break;
            case Rating.Hard:
                newCard.state = State.Learning;
                newCard.scheduled_days = 0;
                newCard.due = now + 5 * 60 * 1000; // 5 min
                break;
            case Rating.Good:
                newCard.state = State.Learning;
                newCard.scheduled_days = 0;
                newCard.due = now + 10 * 60 * 1000; // 10 min
                break;
            case Rating.Easy:
                newCard.state = State.Review;
                newCard.scheduled_days = nextInterval(newCard.stability);
                newCard.due = now + newCard.scheduled_days * 24 * 60 * 60 * 1000;
                break;
        }

    } else if (card.state === State.Learning || card.state === State.Relearning) {
        // Simple Learning steps for MVP (Again -> 1m, Good -> 10m -> Review)
        // This is a simplified logic. In full FSRS, we'd have steps.

        newCard.difficulty = nextDifficulty(card.difficulty, rating);
        newCard.stability = nextStability(card.stability, card.difficulty, retrievability, rating);

        if (rating === Rating.Again) {
            newCard.state = card.state; // Stay in learning
            newCard.scheduled_days = 0;
            newCard.due = now + 1 * 60 * 1000;
        } else if (rating === Rating.Good || rating === Rating.Hard) {
            newCard.state = State.Review; // Graduate to review
            newCard.scheduled_days = 1;
            newCard.due = now + 1 * 24 * 60 * 60 * 1000;
        } else if (rating === Rating.Easy) {
            newCard.state = State.Review;
            newCard.scheduled_days = nextInterval(newCard.stability);
            newCard.due = now + newCard.scheduled_days * 24 * 60 * 60 * 1000;
        }

    } else if (card.state === State.Review) {
        const difficulty = nextDifficulty(card.difficulty, rating);
        const stability = nextStability(card.stability, card.difficulty, retrievability, rating);

        newCard.difficulty = difficulty;
        newCard.stability = stability;

        if (rating === Rating.Again) {
            newCard.state = State.Relearning;
            newCard.scheduled_days = 0;
            newCard.due = now + 5 * 60 * 1000; // 5 min lapse
            // Decrease stability heavily or reset? FSRS handles stability drop via math usually
        } else {
            // Success
            newCard.state = State.Review;
            newCard.scheduled_days = nextInterval(stability);
            newCard.due = now + newCard.scheduled_days * 24 * 60 * 60 * 1000;
        }
    }

    // Update metadata
    newCard.elapsed_days = elapsedDays;
    newCard.reps += 1;
    newCard.last_review = now;

    return newCard;
}

// --- FSRS Math Helpers (Simplified based on the paper formulas) ---

function initStability(rating: number): number {
    // S0(r) = w[r-1]
    return Math.max(0.1, w[rating - 1]);
}

function initDifficulty(rating: number): number {
    // D0(r) = w[4] - (r-3) * w[5]
    // Capped between 1 and 10 usually
    const d = w[4] - (rating - 3) * w[5];
    return Math.min(Math.max(1, d), 10);
}

function nextInterval(stability: number): number {
    // I(r, s) = s * 9 * (1/R - 1)  -- usually R=0.9
    // For r=0.9, interval is roughly equal to stability
    const interval = Math.round(stability * 9 * (1 / PROBABILITY_RECALL - 1));
    return Math.max(1, interval);
}

function nextDifficulty(D: number, rating: number): number {
    // D' = D - w[6] * (r-3)
    // D(new) = w[7] * D0(3) + (1-w[7]) * nextDifficulty... (Mean reversion)
    const nextD = D - w[6] * (rating - 3);
    const newD = w[7] * w[4] + (1 - w[7]) * nextD;
    return Math.min(Math.max(1, newD), 10);
}

function nextStability(S: number, D: number, R: number, rating: number): number {
    if (rating === Rating.Again) {
        // S_forget = w[8] * D^-w[9] * S^w[10] * exp(w[11]*(1-R))
        return Math.min(S, w[8] * Math.pow(D, -w[9]) * Math.pow(S, w[10]) * Math.exp(w[11] * (1 - R)));
    } else {
        // S_recall = S * (1 + exp(w[12]) * (11-D) * S^-w[13] * (exp(w[14]*(1-R)) - 1) * w[15OrRatingFactor])
        // Simplified recall logic for ratings Hard, Good, Easy:
        // Here we use the Hard/Good/Easy weighting logic from Reference Implementation

        let ratingFactor = 1;
        if (rating === Rating.Hard) ratingFactor = w[15];
        if (rating === Rating.Easy) ratingFactor = w[16];

        const change = Math.exp(w[12]) * Math.pow(11 - D, 1) * Math.pow(S, -w[13]) * (Math.exp(w[14] * (1 - R)) - 1) * ratingFactor;
        return S * (1 + change);
    }
}
