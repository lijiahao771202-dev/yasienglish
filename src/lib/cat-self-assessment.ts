export type CatSystemAssessment = "too_easy" | "matched" | "too_hard";
export type CatSelfAssessment = "easy" | "just_right" | "hard";

export const CAT_SYSTEM_ASSESSMENT_LABELS: Record<CatSystemAssessment, string> = {
    too_easy: "系统判断：偏简单",
    matched: "系统判断：刚好",
    too_hard: "系统判断：偏难",
};

export const CAT_SELF_ASSESSMENT_LABELS: Record<CatSelfAssessment, string> = {
    easy: "自评：简单",
    just_right: "自评：刚好",
    hard: "自评：偏难",
};

const SYSTEM_SIGNAL: Record<CatSystemAssessment, -1 | 0 | 1> = {
    too_easy: 1,
    matched: 0,
    too_hard: -1,
};

const SELF_SIGNAL: Record<CatSelfAssessment, -1 | 0 | 1> = {
    easy: 1,
    just_right: 0,
    hard: -1,
};

const SCORE_CORRECTION_TABLE: Record<CatSystemAssessment, Record<CatSelfAssessment, number>> = {
    too_easy: {
        easy: 12,
        just_right: 6,
        hard: 0,
    },
    matched: {
        easy: 6,
        just_right: 0,
        hard: -6,
    },
    too_hard: {
        easy: 0,
        just_right: -6,
        hard: -12,
    },
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function getCatSystemAssessment(params: {
    delta: number;
    accuracy: number;
    challengeRatio?: number | null;
    qualityTier?: "ok" | "low_confidence" | null;
}): CatSystemAssessment {
    const delta = Number(params.delta ?? 0);
    const accuracy = Number(params.accuracy ?? 0);
    const challengeRatio = Number(params.challengeRatio ?? 0);
    const threshold = params.qualityTier === "low_confidence" ? 24 : 18;

    if (delta >= threshold) return "too_easy";
    if (delta <= -threshold) return "too_hard";

    if (accuracy >= 0.88 && challengeRatio <= 0.4) {
        return "too_easy";
    }

    if (accuracy <= 0.42) {
        return "too_hard";
    }

    return "matched";
}

export function getCatSelfAssessmentScoreCorrection(
    systemAssessment: CatSystemAssessment,
    selfAssessment: CatSelfAssessment,
) {
    return SCORE_CORRECTION_TABLE[systemAssessment][selfAssessment];
}

export function getCatDifficultySignal(
    systemAssessment: CatSystemAssessment,
    selfAssessment: CatSelfAssessment,
) {
    const rawSignal = SELF_SIGNAL[selfAssessment] * 0.6 + SYSTEM_SIGNAL[systemAssessment] * 0.4;
    return clamp(Number(rawSignal.toFixed(2)), -1, 1);
}

export function getCatDifficultyScoreOffset(signal: number) {
    return clamp(Math.round(Number(signal ?? 0) * 160), -160, 160);
}
