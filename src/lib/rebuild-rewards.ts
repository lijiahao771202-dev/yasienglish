import type { RebuildEvaluationResult } from "./rebuild-mode";

export interface RebuildRewardDropLoot {
    type: "gem";
    amount: number;
    message: string;
    rarity: "rare";
}

export interface RebuildRewardFx {
    kind: "coin_gain";
    amount: number;
    message: string;
    source: "reward";
}

export interface RebuildRewardOutcome {
    earnedCoins: number;
    dropEligible: boolean;
}

export interface RebuildDropRewardOutcome {
    coinsDelta: number;
    itemDelta: Partial<Record<"capsule", number>>;
    loot: RebuildRewardDropLoot | null;
    fx: RebuildRewardFx | null;
}

export function calculateSentenceRebuildRewards(params: {
    evaluation: RebuildEvaluationResult;
    replayCount: number;
    tokenEditCount: number;
    exceededSoftLimit: boolean;
    skipped: boolean;
}): RebuildRewardOutcome {
    const { evaluation, replayCount, tokenEditCount, exceededSoftLimit, skipped } = params;

    let earnedCoins = 5;

    if (evaluation.isCorrect) {
        earnedCoins += 10;
    } else if (!skipped && evaluation.accuracyRatio >= 0.75 && evaluation.completionRatio >= 0.85) {
        earnedCoins += 6;
    } else if (!skipped && evaluation.accuracyRatio >= 0.5 && evaluation.completionRatio >= 0.65) {
        earnedCoins += 3;
    }

    if (evaluation.isCorrect && replayCount <= 1 && tokenEditCount <= 1 && !exceededSoftLimit) {
        earnedCoins += 6;
    } else if (!skipped && replayCount <= 2 && tokenEditCount <= 3 && !exceededSoftLimit) {
        earnedCoins += 3;
    }

    return {
        earnedCoins,
        dropEligible: evaluation.isCorrect || (!skipped && evaluation.accuracyRatio >= 0.75 && evaluation.completionRatio >= 0.85),
    };
}

export function calculatePassageRebuildRewards(params: {
    sessionObjectiveScore100: number;
    skippedSegments: number;
    totalSegments: number;
    streak: number;
}): RebuildRewardOutcome {
    const { sessionObjectiveScore100, skippedSegments, totalSegments, streak } = params;

    let earnedCoins = 5;

    if (sessionObjectiveScore100 >= 90) earnedCoins += 15;
    else if (sessionObjectiveScore100 >= 80) earnedCoins += 10;
    else if (sessionObjectiveScore100 >= 65) earnedCoins += 6;
    else if (sessionObjectiveScore100 >= 50) earnedCoins += 3;

    if (totalSegments > 0 && skippedSegments === 0) {
        if (sessionObjectiveScore100 >= 80) earnedCoins += 6;
        else if (sessionObjectiveScore100 >= 65) earnedCoins += 3;
    }

    if (streak >= 10) earnedCoins += 15;
    else if (streak >= 5) earnedCoins += 8;
    else if (streak >= 3) earnedCoins += 4;

    return {
        earnedCoins,
        dropEligible: sessionObjectiveScore100 >= 65,
    };
}

export function shouldTriggerSentenceRebuildGacha(params: {
    learningSession: boolean;
    roll: number;
    evaluation: RebuildEvaluationResult;
    replayCount: number;
    tokenEditCount: number;
    exceededSoftLimit: boolean;
    skipped: boolean;
}) {
    const { learningSession, roll, evaluation, replayCount, tokenEditCount, exceededSoftLimit, skipped } = params;
    return !learningSession
        && !skipped
        && evaluation.isCorrect
        && replayCount <= 1
        && tokenEditCount <= 2
        && !exceededSoftLimit
        && roll < 0.2;
}

export function shouldTriggerPassageRebuildGacha(params: {
    learningSession: boolean;
    roll: number;
    sessionObjectiveScore100: number;
    skippedSegments: number;
}) {
    const { learningSession, roll, sessionObjectiveScore100, skippedSegments } = params;
    return !learningSession
        && skippedSegments === 0
        && sessionObjectiveScore100 >= 85
        && roll < 0.2;
}

export function rollRebuildDropReward(params: {
    eligible: boolean;
    variant: "sentence" | "passage";
    dropRoll: number;
    capsuleRoll: number;
    coinRoll: number;
}): RebuildDropRewardOutcome | null {
    const { eligible, variant, dropRoll, capsuleRoll, coinRoll } = params;
    if (!eligible) return null;

    const dropChance = variant === "sentence" ? 0.12 : 0.18;
    if (dropRoll >= dropChance) return null;

    if (capsuleRoll < 0.25) {
        return {
            coinsDelta: 0,
            itemDelta: { capsule: 1 },
            loot: { type: "gem", amount: 1, rarity: "rare", message: "🎁 重构掉落！获得灵感胶囊！" },
            fx: null,
        };
    }

    const minCoins = variant === "sentence" ? 8 : 12;
    const maxCoins = variant === "sentence" ? 18 : 24;
    const coinsDelta = Math.floor(coinRoll * (maxCoins - minCoins + 1)) + minCoins;

    return {
        coinsDelta,
        itemDelta: {},
        loot: null,
        fx: { kind: "coin_gain", amount: coinsDelta, message: `+${coinsDelta} 星光币`, source: "reward" },
    };
}
