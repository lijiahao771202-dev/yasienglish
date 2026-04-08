import {
    type RebuildAttemptSignals,
    type RebuildPracticeTier,
    type RebuildSelfEvaluation,
    getRebuildBandPosition,
    getRebuildPracticeTier,
    tokenizeRebuildSentence,
} from "@/lib/rebuild-mode";
import { buildRebuildSentenceDifficultyProfile } from "@/lib/rebuild-difficulty";
import { countWords } from "@/lib/translationDifficulty";

export interface RebuildPassageWordWindow {
    min: number;
    max: number;
    mean: number;
    sigma: number;
    softMin: number;
    softMax: number;
    hardMin: number;
    hardMax: number;
}

export interface RebuildPassageDifficultyProfile {
    effectiveElo: number;
    segmentCount: 2 | 3 | 5;
    practiceTier: RebuildPracticeTier;
    bandPosition: "entry" | "mid" | "exit";
    syntaxComplexity: {
        clauseMax: number;
        memoryLoad: string;
        spokenNaturalness: string;
        reducedFormsPresence: string;
        trainingFocus: string;
    };
    perSegmentWordWindow: RebuildPassageWordWindow;
    totalWordWindow: RebuildPassageWordWindow;
}

export interface RebuildPassageValidationResult {
    isValid: boolean;
    segmentResults: Array<{
        index: number;
        wordCount: number;
        withinSoftBand: boolean;
        withinHardBand: boolean;
        looksComplete: boolean;
    }>;
    totalResult: {
        wordCount: number;
        withinSoftBand: boolean;
        withinHardBand: boolean;
    };
}

function buildWordWindow(min: number, max: number): RebuildPassageWordWindow {
    const mean = (min + max) / 2;
    const sigma = (max - min) / 4;

    return {
        min,
        max,
        mean,
        sigma,
        softMin: mean - sigma,
        softMax: mean + sigma,
        hardMin: min,
        hardMax: max,
    };
}

function getPassageWordWindowBonus(segmentCount: 2 | 3 | 5) {
    if (segmentCount === 2) {
        return { minBonus: 4, maxBonus: 6 };
    }
    if (segmentCount === 3) {
        return { minBonus: 3, maxBonus: 5 };
    }
    return { minBonus: 2, maxBonus: 4 };
}

function isLikelyCompleteSegment(segment: string) {
    const trimmed = segment.trim();
    const words = tokenizeRebuildSentence(trimmed);
    if (words.length < 3) return false;
    if (!/[a-z]/i.test(trimmed)) return false;
    return /[.!?]"?$/.test(trimmed) || words.length >= 5;
}

export function buildRebuildPassageDifficultyProfile(
    effectiveElo: number,
    segmentCount: 2 | 3 | 5,
): RebuildPassageDifficultyProfile {
    const sentenceDifficulty = buildRebuildSentenceDifficultyProfile(effectiveElo);
    const { minBonus, maxBonus } = getPassageWordWindowBonus(segmentCount);
    const perSegmentWordWindow = buildWordWindow(
        sentenceDifficulty.wordWindow.hardMin + minBonus,
        sentenceDifficulty.wordWindow.hardMax + maxBonus,
    );
    const totalMean = perSegmentWordWindow.mean * segmentCount;
    const totalSigma = Math.sqrt(segmentCount * Math.pow(perSegmentWordWindow.sigma, 2));

    return {
        effectiveElo,
        segmentCount,
        practiceTier: getRebuildPracticeTier(effectiveElo),
        bandPosition: getRebuildBandPosition(effectiveElo),
        syntaxComplexity: {
            clauseMax: sentenceDifficulty.syntaxComplexity.clauseMax,
            memoryLoad: sentenceDifficulty.syntaxComplexity.memoryLoad,
            spokenNaturalness: sentenceDifficulty.syntaxComplexity.spokenNaturalness,
            reducedFormsPresence: sentenceDifficulty.syntaxComplexity.reducedFormsPresence,
            trainingFocus: sentenceDifficulty.syntaxComplexity.trainingFocus,
        },
        perSegmentWordWindow,
        totalWordWindow: {
            min: perSegmentWordWindow.min * segmentCount,
            max: perSegmentWordWindow.max * segmentCount,
            mean: totalMean,
            sigma: totalSigma,
            softMin: totalMean - totalSigma,
            softMax: totalMean + totalSigma,
            hardMin: perSegmentWordWindow.min * segmentCount,
            hardMax: perSegmentWordWindow.max * segmentCount,
        },
    };
}

export function calculateRebuildPassageObjectiveScore(signals: RebuildAttemptSignals) {
    if (signals.skipped) return 0;

    const rawScore = (
        signals.accuracyRatio * 30
        + signals.completionRatio * 20
        + (1 - signals.misplacementRatio) * 15
        + (1 - signals.distractorPickRatio) * 15
        + signals.contentWordHitRate * 10
        + signals.tailCoverage * 10
        - Math.min(signals.replayCount, 5)
        - Math.min(signals.tokenEditCount, 6) * 1.5
        - (signals.exceededSoftLimit ? 5 : 0)
    );

    return Math.max(0, Math.min(100, Math.round(rawScore)));
}

export function getRebuildPassageSelfScore(
    selfEvaluation: RebuildSelfEvaluation,
    attempt: {
        objectiveScore100: number;
        skippedSegments: number;
        totalSegments: number;
    },
) {
    const mapped = selfEvaluation === "easy"
        ? 100
        : selfEvaluation === "hard"
            ? 60
            : 80;

    const skippedRatio = attempt.totalSegments > 0
        ? attempt.skippedSegments / attempt.totalSegments
        : 0;

    if (skippedRatio >= 1) {
        return selfEvaluation === "easy"
            ? 20
            : selfEvaluation === "just_right"
                ? 10
                : 0;
    }

    if (skippedRatio >= 0.5 || attempt.objectiveScore100 < 20) {
        return selfEvaluation === "easy"
            ? 40
            : selfEvaluation === "just_right"
                ? 20
                : 0;
    }

    if (attempt.objectiveScore100 < 40) {
        return selfEvaluation === "easy"
            ? 60
            : selfEvaluation === "just_right"
                ? 40
                : 20;
    }

    return mapped;
}

export function aggregateRebuildPassageScores(
    segmentScores: Array<{
        objectiveScore100: number;
        selfScore100: number;
    }>,
) {
    if (segmentScores.length === 0) {
        return {
            sessionObjectiveScore100: 0,
            sessionSelfScore100: 0,
            sessionScore100: 0,
            sessionBattleScore10: 0,
            segmentFinalScores100: [] as number[],
        };
    }

    const segmentFinalScores100 = segmentScores.map(({ objectiveScore100, selfScore100 }) => (
        Math.round((objectiveScore100 * 0.5) + (selfScore100 * 0.5))
    ));
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    const sessionObjectiveScore100 = Math.round(sum(segmentScores.map((item) => item.objectiveScore100)) / segmentScores.length);
    const sessionSelfScore100 = Math.round(sum(segmentScores.map((item) => item.selfScore100)) / segmentScores.length);
    const sessionScore100 = Math.round(sum(segmentFinalScores100) / segmentFinalScores100.length);

    return {
        sessionObjectiveScore100,
        sessionSelfScore100,
        sessionScore100,
        sessionBattleScore10: Math.round(sessionScore100) / 10,
        segmentFinalScores100,
    };
}

export function validateRebuildPassageSegments(params: {
    profile: RebuildPassageDifficultyProfile;
    segments: string[];
}): RebuildPassageValidationResult {
    const { profile, segments } = params;
    const perSegmentHardBuffer = Math.max(1, Math.ceil(profile.perSegmentWordWindow.sigma));
    const totalHardBuffer = perSegmentHardBuffer * profile.segmentCount;
    const segmentResults = segments.map((segment, index) => {
        const wordCount = countWords(segment);
        const looksComplete = isLikelyCompleteSegment(segment);
        return {
            index,
            wordCount,
            withinSoftBand: wordCount >= profile.perSegmentWordWindow.softMin && wordCount <= profile.perSegmentWordWindow.softMax,
            withinHardBand: (
                wordCount >= (profile.perSegmentWordWindow.hardMin - perSegmentHardBuffer)
                && wordCount <= (profile.perSegmentWordWindow.hardMax + perSegmentHardBuffer)
            ),
            looksComplete,
        };
    });

    const totalWordCount = segments.reduce((total, segment) => total + countWords(segment), 0);
    const totalResult = {
        wordCount: totalWordCount,
        withinSoftBand: totalWordCount >= profile.totalWordWindow.softMin && totalWordCount <= profile.totalWordWindow.softMax,
        withinHardBand: (
            totalWordCount >= (profile.totalWordWindow.hardMin - totalHardBuffer)
            && totalWordCount <= (profile.totalWordWindow.hardMax + totalHardBuffer)
        ),
    };

    return {
        isValid: segmentResults.every((result) => result.withinHardBand && result.looksComplete) && totalResult.withinHardBand,
        segmentResults,
        totalResult,
    };
}
