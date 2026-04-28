import type {
    RebuildEvaluationResult,
    RebuildSelfEvaluation,
    RebuildSystemAssessment,
} from "@/lib/rebuild-mode";

export interface RebuildFeedbackState {
    evaluation: RebuildEvaluationResult;
    systemDelta: number;
    systemAssessment: RebuildSystemAssessment;
    systemAssessmentLabel: string;
    selfEvaluation: RebuildSelfEvaluation | null;
    effectiveElo: number;
    replayCount: number;
    editCount: number;
    skipped: boolean;
    exceededSoftLimit: boolean;
    resolvedAt: number;
}

export interface RebuildPassageSegmentScore {
    segmentIndex: number;
    objectiveScore100: number;
    selfScore100: number;
    finalScore100: number;
}

export interface RebuildPassageSegmentResultState {
    segmentIndex: number;
    feedback: RebuildFeedbackState;
    objectiveScore100: number;
    selfScore100: number | null;
    finalScore100: number | null;
    selfEvaluation: RebuildSelfEvaluation | null;
}

export interface RebuildPassageSegmentUiState {
    chineseExpanded: boolean;
}

export interface RebuildPassageSummaryState {
    sessionObjectiveScore100: number;
    sessionSelfScore100: number;
    sessionScore100: number;
    sessionBattleScore10: number;
    segmentCount: number;
    eloAfter: number;
    change: number;
    streak: number;
    maxElo: number;
    coinsEarned: number;
    settledAt: number;
}
