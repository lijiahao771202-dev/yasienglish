import type { PronunciationWordResult } from "@/lib/pronunciation-scoring";
import {
    alignPronunciationTokens,
    estimateListeningProgress,
    resolveListeningScoreTier,
    scoreListeningRecognition,
    type ListeningScoreTier,
    type PronunciationTokenState,
} from "@/lib/listening-shadowing";
import { extractWordTokens, normalizeWordForMatch } from "@/lib/read-speaking";

type RebuildShadowingTokenState = Extract<PronunciationTokenState, "correct" | "incorrect" | "missed">;

export function normalizeRebuildShadowingText(text: string) {
    return text.trim().replace(/\s+/g, " ");
}

export function scoreRebuildShadowingRecognition(referenceSentence: string, transcript: string) {
    return scoreListeningRecognition(referenceSentence, transcript);
}

export function estimateRebuildShadowingProgress(referenceSentence: string, transcript: string) {
    return estimateListeningProgress(referenceSentence, transcript);
}

export function resolveRebuildShadowingScoreTier(score: number): ListeningScoreTier {
    return resolveListeningScoreTier(score);
}

export function alignRebuildShadowingTokens(params: {
    spokenTokens: string[];
    targetTokens: Array<{ sourceIndex: number; token: string }>;
}) {
    const result = alignPronunciationTokens(params);
    return {
        correctCount: result.correctCount,
        tokenStates: result.tokenStates as Map<number, RebuildShadowingTokenState>,
    };
}

export function buildRebuildShadowingWordResults(referenceSentence: string, transcript: string): PronunciationWordResult[] {
    const sourceTokens = extractWordTokens(referenceSentence);
    const targetTokens = sourceTokens
        .map((token) => ({ sourceIndex: token.index, token: normalizeWordForMatch(token.text) }))
        .filter((item) => Boolean(item.token));
    const spokenTokens = extractWordTokens(transcript)
        .map((token) => normalizeWordForMatch(token.text))
        .filter(Boolean);
    const { tokenStates } = alignRebuildShadowingTokens({
        spokenTokens,
        targetTokens,
    });

    return sourceTokens.map((token) => {
        const state = tokenStates.get(token.index);
        if (state === "correct") {
            return {
                accuracy_score: 9.4,
                score: 9.5,
                status: "correct",
                stress_score: 9.1,
                word: token.text,
            } satisfies PronunciationWordResult;
        }
        if (state === "missed") {
            return {
                accuracy_score: 0,
                score: 0,
                status: "missing",
                stress_score: 0,
                word: token.text,
            } satisfies PronunciationWordResult;
        }
        return {
            accuracy_score: 5.0,
            score: 5.2,
            status: "weak",
            stress_score: 5.1,
            word: token.text,
        } satisfies PronunciationWordResult;
    });
}
