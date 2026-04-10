import { getCatDifficultySignal, getCatSelfAssessmentScoreCorrection, type CatSelfAssessment, type CatSystemAssessment } from "./cat-self-assessment";
import { getCatRankTier } from "./cat-score";

export interface CatSettlementRankSnapshot {
    id: string;
    name: string;
    primaryLabel: string;
    secondaryLabel: string;
    index: number;
}

export interface PreparedCatSettlementSnapshot {
    sessionId: string;
    objectiveDelta: number;
    systemAssessment: CatSystemAssessment | null;
    stopReason?: string | null;
    itemCount?: number | null;
    minItems?: number | null;
    maxItems?: number | null;
    scoreBefore: number;
    scoreAfter: number;
    delta: number;
    rankBefore: CatSettlementRankSnapshot;
    rankAfter: CatSettlementRankSnapshot;
    isRankUp: boolean;
    isRankDown: boolean;
}

export interface CatSettlementPreviewPayload {
    scoreBefore: number;
    scoreAfter: number;
    delta: number;
    rankBefore: CatSettlementRankSnapshot;
    rankAfter: CatSettlementRankSnapshot;
    isRankUp: boolean;
    isRankDown: boolean;
    stopReason?: string | null;
    itemCount?: number | null;
    minItems?: number | null;
    maxItems?: number | null;
    objectiveDelta: number;
    systemAssessment: CatSystemAssessment | null;
    selfAssessment: CatSelfAssessment | null;
    scoreCorrection: number;
    difficultySignal: number;
    isPendingFinalization: boolean;
}

export function clampCatSettlementDelta(value: number) {
    return Math.min(66, Math.max(-48, value));
}

export function buildPreparedCatSettlementPreview(params: {
    prepared: PreparedCatSettlementSnapshot;
    selfAssessment: CatSelfAssessment | null;
}) {
    const { prepared, selfAssessment } = params;
    const scoreCorrection = prepared.systemAssessment && selfAssessment
        ? getCatSelfAssessmentScoreCorrection(prepared.systemAssessment, selfAssessment)
        : 0;
    const delta = clampCatSettlementDelta(prepared.objectiveDelta + scoreCorrection);
    const scoreAfter = Math.max(1, prepared.scoreBefore + delta);
    const nextRank = getCatRankTier(scoreAfter);
    const rankAfter: CatSettlementRankSnapshot = {
        id: nextRank.id,
        name: nextRank.name,
        primaryLabel: nextRank.primaryLabel,
        secondaryLabel: nextRank.secondaryLabel,
        index: nextRank.index,
    };

    return {
        scoreBefore: prepared.scoreBefore,
        scoreAfter,
        delta,
        rankBefore: prepared.rankBefore,
        rankAfter,
        isRankUp: rankAfter.index > prepared.rankBefore.index,
        isRankDown: rankAfter.index < prepared.rankBefore.index,
        stopReason: prepared.stopReason,
        itemCount: prepared.itemCount,
        minItems: prepared.minItems,
        maxItems: prepared.maxItems,
        objectiveDelta: prepared.objectiveDelta,
        systemAssessment: prepared.systemAssessment,
        selfAssessment,
        scoreCorrection,
        difficultySignal: prepared.systemAssessment && selfAssessment
            ? getCatDifficultySignal(prepared.systemAssessment, selfAssessment)
            : 0,
        isPendingFinalization: true,
    } satisfies CatSettlementPreviewPayload;
}
