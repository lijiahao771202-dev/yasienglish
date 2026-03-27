export const TRANSLATION_TOO_HARD_PENALTY = 25;

export function applyTranslationTooHardPenalty(currentElo: number, penalty: number = TRANSLATION_TOO_HARD_PENALTY) {
    return Math.max(0, currentElo - penalty);
}
