import {
    clampRebuildDifficultyDelta,
    getRebuildSelfEvaluationDelta,
    type RebuildSelfEvaluation,
} from "@/lib/rebuild-mode";

export interface RebuildBattleEloBreakdown {
    difficultyElo: number;
    expectedScore: number;
    actualScore: number;
    kFactor: number;
    streakBonus: boolean;
    baseChange: number;
    bonusChange: number;
    systemDelta: number;
    selfDelta: number;
    systemWeighted: number;
    selfWeighted: number;
    rawDelta: number;
    guidedDelta: number;
    clampedDelta: number;
}

export interface RebuildBattleEloResult {
    total: number;
    breakdown: RebuildBattleEloBreakdown;
}

export function calculateRebuildBattleElo(params: {
    playerElo: number;
    sessionSystemDelta: number;
    selfEvaluation: RebuildSelfEvaluation;
    streak: number;
}): RebuildBattleEloResult {
    const { playerElo, sessionSystemDelta, selfEvaluation } = params;
    const selfDelta = getRebuildSelfEvaluationDelta(selfEvaluation);
    const systemWeighted = sessionSystemDelta * 0.35;
    const selfWeighted = selfDelta * 0.65;
    const rawDelta = Math.round(systemWeighted + selfWeighted);
    const guidedDelta = selfEvaluation === "hard"
        ? Math.min(rawDelta, -12)
        : selfEvaluation === "easy"
            ? Math.max(rawDelta, 8)
            : rawDelta;
    const clampedDelta = clampRebuildDifficultyDelta(guidedDelta);

    return {
        total: clampedDelta,
        breakdown: {
            difficultyElo: playerElo,
            expectedScore: 0,
            actualScore: 0,
            kFactor: 0,
            streakBonus: false,
            baseChange: clampedDelta,
            bonusChange: 0,
            systemDelta: sessionSystemDelta,
            selfDelta,
            systemWeighted,
            selfWeighted,
            rawDelta,
            guidedDelta,
            clampedDelta,
        },
    };
}
