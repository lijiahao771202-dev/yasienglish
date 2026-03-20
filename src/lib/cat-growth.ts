export type CatDifficulty = "cet4" | "cet6" | "ielts";

export interface CatGrowthInput {
    score: number;
    level: number;
    theta: number;
    currentBand: number;
    accuracy: number;
    speedScore: number;
    stabilityScore: number;
}

export interface CatGrowthResult {
    performance: number;
    delta: number;
    scoreAfter: number;
    levelAfter: number;
    thetaAfter: number;
    nextBand: number;
    pointsDelta: number;
}

export const CAT_SCORE_BASE = 1000;
export const CAT_LEVEL_STEP = 120;
const CAT_EFFECTIVE_CAP = 3200;

const CAT_MIN_BAND = 1;
const CAT_MAX_BAND = 9;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function normalizeBand(band: number) {
    return clamp(Math.round(band), CAT_MIN_BAND, CAT_MAX_BAND);
}

export function difficultyFromBand(band: number): CatDifficulty {
    const normalizedBand = normalizeBand(band);
    if (normalizedBand <= 3) return "cet4";
    if (normalizedBand <= 6) return "cet6";
    return "ielts";
}

export function levelFromScore(score: number) {
    const normalized = Math.max(1, Math.floor((score - CAT_SCORE_BASE) / CAT_LEVEL_STEP) + 1);
    return normalized;
}

export function levelFloorScore(level: number) {
    return CAT_SCORE_BASE + Math.max(0, level - 1) * CAT_LEVEL_STEP;
}

export function recommendBadges(input: {
    levelBefore: number;
    levelAfter: number;
    accuracy: number;
    delta: number;
}) {
    const badges: string[] = [];

    if (input.levelAfter >= 2 && input.levelBefore < 2) badges.push("cat_level_2");
    if (input.levelAfter >= 5 && input.levelBefore < 5) badges.push("cat_level_5");
    if (input.levelAfter >= 10 && input.levelBefore < 10) badges.push("cat_level_10");
    if (input.accuracy >= 0.9) badges.push("cat_sharp_reader");
    if (input.delta >= 30) badges.push("cat_fast_rise");

    return badges;
}

export function computeCatGrowth(input: CatGrowthInput): CatGrowthResult {
    const safeAccuracy = clamp(input.accuracy, 0, 1);
    const safeSpeed = clamp(input.speedScore, 0, 1);
    const safeStability = clamp(input.stabilityScore, 0, 1);

    const performance = clamp(safeAccuracy * 0.62 + safeSpeed * 0.23 + safeStability * 0.15, 0, 1);

    // Move from fixed band targets to score-driven expectation.
    const scoreProgress = clamp(Math.max(0, input.score) / CAT_EFFECTIVE_CAP, 0, 1);
    const targetPerformance = 0.56 + scoreProgress * 0.22;
    const rawDelta = Math.round((performance - targetPerformance) * 250);
    const delta = clamp(rawDelta, -42, 56);

    const tentativeScore = Math.max(1, Math.round(input.score + delta));
    const tentativeLevel = levelFromScore(tentativeScore);

    // Soft protection rollback: lower question band first, and avoid immediate level downgrade.
    const levelAfter = Math.max(input.level, tentativeLevel);
    const protectedScore = Math.max(tentativeScore, levelFloorScore(levelAfter));

    const previousBand = normalizeBand(input.currentBand);
    const nextBand = clamp(Math.floor(protectedScore / 400) + 1, CAT_MIN_BAND, CAT_MAX_BAND);

    const thetaDelta = (performance - 0.6) * 0.42 + (nextBand - previousBand) * 0.08;
    const thetaAfter = clamp(input.theta + thetaDelta, -3, 3);

    const pointsDelta = Math.max(
        4,
        Math.round(6 + safeAccuracy * 6 + Math.max(0, delta) / 8 + (performance >= 0.75 ? 2 : 0)),
    );

    return {
        performance,
        delta,
        scoreAfter: protectedScore,
        levelAfter,
        thetaAfter,
        nextBand,
        pointsDelta,
    };
}
