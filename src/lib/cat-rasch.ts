export type CatStopReason = "target_se_reached" | "max_items_reached" | "insufficient_items";

export interface CatRaschResponse {
    itemId: string;
    order: number;
    correct: boolean;
    latencyMs: number;
    itemDifficulty: number;
    itemType?: string;
    answer?: string | string[];
}

export interface CatRaschItemTrace {
    itemId: string;
    order: number;
    correct: boolean;
    itemDifficulty: number;
    thetaBefore: number;
    thetaAfter: number;
    predictedCorrect: number;
    infoGain: number;
    latencyMs: number;
    answer?: string | string[];
    itemType?: string;
}

export interface CatRaschSessionInput {
    scoreBefore: number;
    thetaBefore: number;
    seBefore?: number;
    responses: CatRaschResponse[];
    minItems?: number;
    maxItems?: number;
    targetSe?: number;
    qualityTier?: "ok" | "low_confidence";
    growthPace?: "balanced" | "aggressive" | "conservative";
}

export interface CatRaschSessionResult {
    usedItemCount: number;
    minItems: number;
    maxItems: number;
    targetSe: number;
    stopReason: CatStopReason;
    thetaBefore: number;
    thetaAfter: number;
    seBefore: number;
    seAfter: number;
    scoreBefore: number;
    scoreAfter: number;
    delta: number;
    accuracy: number;
    pointsDelta: number;
    performance: number;
    challengeRatio: number;
    traces: CatRaschItemTrace[];
}

const DEFAULT_SE = 1.15;
const DEFAULT_TARGET_SE = 0.56;
const DEFAULT_MIN_ITEMS = 2;
const DEFAULT_MAX_ITEMS = 8;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function sigmoid(value: number) {
    return 1 / (1 + Math.exp(-value));
}

function toFinite(value: unknown, fallback: number) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function growthStepByPace(growthPace: CatRaschSessionInput["growthPace"]) {
    if (growthPace === "aggressive") return 0.74;
    if (growthPace === "conservative") return 0.5;
    return 0.62;
}

function normalizeResponse(raw: CatRaschResponse, index: number): CatRaschResponse {
    return {
        itemId: String(raw.itemId || `item-${index + 1}`),
        order: Math.max(1, Math.round(toFinite(raw.order, index + 1))),
        correct: Boolean(raw.correct),
        latencyMs: Math.max(200, Math.round(toFinite(raw.latencyMs, 10_000))),
        itemDifficulty: clamp(toFinite(raw.itemDifficulty, 0), -3.5, 4.5),
        itemType: typeof raw.itemType === "string" ? raw.itemType : undefined,
        answer: raw.answer,
    };
}

function scoreDeltaFromThetaDelta(params: {
    thetaDelta: number;
    qualityTier: "ok" | "low_confidence";
    accuracy: number;
    challengeRatio: number;
}) {
    const qualityScale = params.qualityTier === "low_confidence" ? 0.68 : 1;
    const base = Math.round(params.thetaDelta * 162 * qualityScale);
    const comfortPenalty = params.challengeRatio < 0.28 ? -4 : 0;
    const challengeBonus = params.challengeRatio >= 0.35 && params.accuracy >= 0.72 ? 4 : 0;
    const accuracyBias = Math.round((params.accuracy - 0.58) * 14);
    return clamp(base + comfortPenalty + challengeBonus + accuracyBias, -48, 66);
}

export function normalizeThetaFromScore(score: number) {
    const normalizedScore = Math.max(0, Math.round(score));
    if (normalizedScore <= 3200) {
        return clamp((normalizedScore / 3200) * 6 - 3, -3, 3);
    }
    return clamp(3 + (normalizedScore - 3200) / 700, -3, 4.5);
}

export function runCatRaschSession(input: CatRaschSessionInput): CatRaschSessionResult {
    const minItems = Math.max(1, Math.round(input.minItems ?? DEFAULT_MIN_ITEMS));
    const maxItems = Math.max(minItems, Math.round(input.maxItems ?? DEFAULT_MAX_ITEMS));
    const targetSe = clamp(toFinite(input.targetSe, DEFAULT_TARGET_SE), 0.22, 1.4);
    const scoreBefore = Math.max(1, Math.round(toFinite(input.scoreBefore, 1000)));
    const thetaBefore = clamp(toFinite(input.thetaBefore, normalizeThetaFromScore(scoreBefore)), -3.5, 4.5);
    const seBefore = clamp(toFinite(input.seBefore, DEFAULT_SE), 0.22, 2.4);
    const qualityTier = input.qualityTier === "low_confidence" ? "low_confidence" : "ok";
    const baseStep = growthStepByPace(input.growthPace);

    const responses = (input.responses ?? [])
        .map(normalizeResponse)
        .sort((left, right) => left.order - right.order)
        .slice(0, maxItems);

    let theta = thetaBefore;
    let fisherInfo = 1 / (seBefore * seBefore);
    let usedItemCount = 0;
    let correctCount = 0;
    let challengeCount = 0;
    const traces: CatRaschItemTrace[] = [];

    for (const response of responses) {
        const thetaBeforeItem = theta;
        const p = clamp(sigmoid(thetaBeforeItem - response.itemDifficulty), 0.02, 0.98);
        const correct = response.correct ? 1 : 0;
        const residual = correct - p;

        const challengeBoost =
            response.itemDifficulty > thetaBeforeItem && correct === 1
                ? 0.05
                : response.itemDifficulty < thetaBeforeItem - 0.35 && correct === 0
                    ? -0.05
                    : 0;

        const deltaTheta = clamp((baseStep + challengeBoost) * residual, -0.24, 0.24);
        theta = clamp(theta + deltaTheta, -3.5, 4.5);

        const itemInfo = Math.max(0.045, p * (1 - p));
        fisherInfo += itemInfo;

        usedItemCount += 1;
        correctCount += correct;
        if (response.itemDifficulty > thetaBefore) {
            challengeCount += 1;
        }

        traces.push({
            itemId: response.itemId,
            order: response.order,
            correct: response.correct,
            itemDifficulty: response.itemDifficulty,
            thetaBefore: Number(thetaBeforeItem.toFixed(4)),
            thetaAfter: Number(theta.toFixed(4)),
            predictedCorrect: Number(p.toFixed(4)),
            infoGain: Number(itemInfo.toFixed(4)),
            latencyMs: response.latencyMs,
            answer: response.answer,
            itemType: response.itemType,
        });

        const currentSe = 1 / Math.sqrt(fisherInfo);
        if (usedItemCount >= minItems && currentSe <= targetSe) {
            break;
        }
    }

    const seAfter = 1 / Math.sqrt(fisherInfo);
    const accuracy = usedItemCount > 0 ? correctCount / usedItemCount : 0;
    const challengeRatio = usedItemCount > 0 ? challengeCount / usedItemCount : 0;
    const thetaAfter = theta;
    const thetaDelta = thetaAfter - thetaBefore;
    const delta = scoreDeltaFromThetaDelta({
        thetaDelta,
        qualityTier,
        accuracy,
        challengeRatio,
    });
    const scoreAfter = Math.max(1, scoreBefore + delta);
    const pointsDelta = Math.max(
        4,
        Math.round(5 + accuracy * 7 + Math.max(0, delta) / 10 + (challengeRatio >= 0.3 ? 1 : 0)),
    );
    const performance = clamp(accuracy * 0.8 + challengeRatio * 0.2, 0, 1);

    const stopReason: CatStopReason = usedItemCount < minItems
        ? "insufficient_items"
        : usedItemCount >= maxItems
            ? "max_items_reached"
            : seAfter <= targetSe
                ? "target_se_reached"
                : "max_items_reached";

    return {
        usedItemCount,
        minItems,
        maxItems,
        targetSe: Number(targetSe.toFixed(3)),
        stopReason,
        thetaBefore: Number(thetaBefore.toFixed(4)),
        thetaAfter: Number(thetaAfter.toFixed(4)),
        seBefore: Number(seBefore.toFixed(4)),
        seAfter: Number(seAfter.toFixed(4)),
        scoreBefore,
        scoreAfter,
        delta,
        accuracy: Number(accuracy.toFixed(4)),
        pointsDelta,
        performance: Number(performance.toFixed(4)),
        challengeRatio: Number(challengeRatio.toFixed(4)),
        traces,
    };
}
