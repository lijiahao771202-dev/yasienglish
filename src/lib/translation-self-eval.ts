import {
    type RebuildSelfEvaluation,
} from "@/lib/rebuild-mode";

export function getTranslationSelfEvaluationEloDelta(selfEvaluation: RebuildSelfEvaluation) {
    if (selfEvaluation === "easy") return 22;
    if (selfEvaluation === "hard") return -22;
    return 10;
}

export function resolveTranslationSelfEvaluationEloChange(params: {
    systemEloChange?: number | null;
    selfEvaluation: RebuildSelfEvaluation;
}) {
    void params.systemEloChange;
    return getTranslationSelfEvaluationEloDelta(params.selfEvaluation);
}
