import { getListeningDifficultyExpectation } from "@/lib/listening-drill-bank";
import { getRebuildBandPosition, getRebuildPracticeTier, type RebuildBandPosition, type RebuildPracticeTier } from "@/lib/rebuild-mode";

export type RebuildSentenceWordWindow = {
    preferredMin: number;
    preferredMax: number;
    hardMin: number;
    hardMax: number;
};

export type RebuildSentenceDifficultyProfile = {
    effectiveElo: number;
    practiceTier: RebuildPracticeTier;
    bandPosition: RebuildBandPosition;
    wordWindow: RebuildSentenceWordWindow;
    syntaxComplexity: {
        clauseMax: number;
        memoryLoad: string;
        spokenNaturalness: string;
        reducedFormsPresence: string;
        trainingFocus: string;
    };
    complexityGuidance: string;
};

type WindowMatrix = Record<RebuildBandPosition, RebuildSentenceWordWindow>;

const REBUILD_SENTENCE_WORD_WINDOWS: Array<{
    maxExclusive: number;
    windows: WindowMatrix;
}> = [
    {
        maxExclusive: 400,
        windows: {
            entry: { preferredMin: 5, preferredMax: 7, hardMin: 4, hardMax: 8 },
            mid: { preferredMin: 6, preferredMax: 8, hardMin: 5, hardMax: 9 },
            exit: { preferredMin: 7, preferredMax: 9, hardMin: 6, hardMax: 10 },
        },
    },
    {
        maxExclusive: 800,
        windows: {
            entry: { preferredMin: 7, preferredMax: 9, hardMin: 6, hardMax: 10 },
            mid: { preferredMin: 8, preferredMax: 10, hardMin: 7, hardMax: 11 },
            exit: { preferredMin: 9, preferredMax: 11, hardMin: 8, hardMax: 12 },
        },
    },
    {
        maxExclusive: 1200,
        windows: {
            entry: { preferredMin: 8, preferredMax: 10, hardMin: 7, hardMax: 11 },
            mid: { preferredMin: 9, preferredMax: 11, hardMin: 8, hardMax: 12 },
            exit: { preferredMin: 10, preferredMax: 12, hardMin: 9, hardMax: 13 },
        },
    },
    {
        maxExclusive: 1600,
        windows: {
            entry: { preferredMin: 10, preferredMax: 12, hardMin: 9, hardMax: 13 },
            mid: { preferredMin: 11, preferredMax: 13, hardMin: 10, hardMax: 14 },
            exit: { preferredMin: 12, preferredMax: 14, hardMin: 11, hardMax: 15 },
        },
    },
    {
        maxExclusive: 2000,
        windows: {
            entry: { preferredMin: 11, preferredMax: 13, hardMin: 10, hardMax: 14 },
            mid: { preferredMin: 12, preferredMax: 14, hardMin: 11, hardMax: 15 },
            exit: { preferredMin: 13, preferredMax: 15, hardMin: 12, hardMax: 16 },
        },
    },
    {
        maxExclusive: 2400,
        windows: {
            entry: { preferredMin: 13, preferredMax: 15, hardMin: 12, hardMax: 17 },
            mid: { preferredMin: 14, preferredMax: 16, hardMin: 13, hardMax: 18 },
            exit: { preferredMin: 15, preferredMax: 17, hardMin: 14, hardMax: 19 },
        },
    },
    {
        maxExclusive: 2800,
        windows: {
            entry: { preferredMin: 14, preferredMax: 16, hardMin: 13, hardMax: 18 },
            mid: { preferredMin: 15, preferredMax: 17, hardMin: 14, hardMax: 19 },
            exit: { preferredMin: 16, preferredMax: 18, hardMin: 15, hardMax: 20 },
        },
    },
    {
        maxExclusive: Number.POSITIVE_INFINITY,
        windows: {
            entry: { preferredMin: 15, preferredMax: 17, hardMin: 14, hardMax: 19 },
            mid: { preferredMin: 16, preferredMax: 18, hardMin: 15, hardMax: 20 },
            exit: { preferredMin: 17, preferredMax: 19, hardMin: 16, hardMax: 21 },
        },
    },
];

function getComplexityGuidance(effectiveElo: number) {
    if (effectiveElo < 400) {
        return "Use one very clear spoken move with simple phrasing and almost no clause stacking.";
    }
    if (effectiveElo < 800) {
        return "Keep one everyday spoken goal, direct wording, and minimal compression.";
    }
    if (effectiveElo < 1200) {
        return "Allow light implied context, but keep the spoken message linear and easy to parse aloud.";
    }
    if (effectiveElo < 1600) {
        return "Keep it natural and spoken with one clear communicative goal and mild supporting detail.";
    }
    if (effectiveElo < 2000) {
        return "Allow one compact supporting clause or contrast while staying natural for listening.";
    }
    if (effectiveElo < 2400) {
        return "Permit denser spoken phrasing and tighter information packing, but avoid academic or written tone.";
    }
    return "Use high-naturalness spoken English with controlled compression, but keep it plausible as real listening material.";
}

export function getRebuildSentenceWordWindow(effectiveElo: number) {
    const bandPosition = getRebuildBandPosition(effectiveElo);
    const matchedBand = REBUILD_SENTENCE_WORD_WINDOWS.find((band) => effectiveElo < band.maxExclusive)
        ?? REBUILD_SENTENCE_WORD_WINDOWS[REBUILD_SENTENCE_WORD_WINDOWS.length - 1];

    return {
        bandPosition,
        wordWindow: matchedBand.windows[bandPosition],
    };
}

export function buildRebuildSentenceDifficultyProfile(effectiveElo: number): RebuildSentenceDifficultyProfile {
    const listeningTarget = getListeningDifficultyExpectation(effectiveElo);
    const { bandPosition, wordWindow } = getRebuildSentenceWordWindow(effectiveElo);

    return {
        effectiveElo,
        practiceTier: getRebuildPracticeTier(effectiveElo),
        bandPosition,
        wordWindow,
        syntaxComplexity: {
            clauseMax: listeningTarget.clauseMax,
            memoryLoad: listeningTarget.memoryLoad,
            spokenNaturalness: listeningTarget.spokenNaturalness,
            reducedFormsPresence: listeningTarget.reducedFormsPresence,
            trainingFocus: listeningTarget.trainingFocus,
        },
        complexityGuidance: getComplexityGuidance(effectiveElo),
    };
}
