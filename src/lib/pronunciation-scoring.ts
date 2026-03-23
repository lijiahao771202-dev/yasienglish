export type PronunciationWordStatus = "correct" | "mispronounced" | "missing" | "inserted" | "weak";

export interface PronunciationWordResult {
    word: string;
    status: PronunciationWordStatus;
    spoken?: string;
    score: number;
    accuracy_score?: number;
    stress_score?: number;
}

export interface PronunciationUtteranceScores {
    accuracy: number;
    completeness: number;
    fluency: number;
    prosody: number;
    total: number;
    content_reproduction?: number;
    rhythm_fluency?: number;
    pronunciation_clarity?: number;
}

export interface PronunciationScorePayload {
    score: number;
    pronunciation_score: number;
    content_score: number;
    fluency_score: number;
    coverage_ratio: number;
    transcript: string;
    summary_cn: string;
    tips_cn: string[];
    word_results: PronunciationWordResult[];
    utterance_scores?: PronunciationUtteranceScores;
    engine: string;
    engine_version: string;
}

type RawWordResult = Partial<PronunciationWordResult> & {
    user_input?: string;
    pronunciation_score?: number;
};

type RawUtteranceScores = Partial<PronunciationUtteranceScores>;

function clampScore(score: unknown) {
    const numericScore = typeof score === "number" ? score : Number(score);
    if (!Number.isFinite(numericScore)) return 0;
    return Math.max(0, Math.min(10, Math.round(numericScore * 10) / 10));
}

export function normalizeWordStatus(value: unknown): PronunciationWordStatus {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "correct") return "correct";
    if (normalized === "missing") return "missing";
    if (normalized === "inserted" || normalized === "user_extra" || normalized === "extra") return "inserted";
    if (normalized === "weak" || normalized === "variation") return "weak";
    return "mispronounced";
}

export function normalizeWordResults(value: unknown) {
    if (!Array.isArray(value)) return [] as PronunciationWordResult[];

    return value
        .filter((item) => item && typeof item === "object")
        .map((item) => {
            const row = item as RawWordResult;
            return {
                word: typeof row.word === "string" ? row.word : "",
                status: normalizeWordStatus(row.status),
                spoken: typeof row.spoken === "string"
                    ? row.spoken
                    : typeof row.user_input === "string"
                        ? row.user_input
                        : undefined,
                score: clampScore(row.score ?? row.pronunciation_score),
                accuracy_score: row.accuracy_score === undefined ? undefined : clampScore(row.accuracy_score),
                stress_score: row.stress_score === undefined ? undefined : clampScore(row.stress_score),
            };
        })
        .filter((row) => row.word.length > 0);
}

export function normalizeUtteranceScores(value: unknown) {
    if (!value || typeof value !== "object") return undefined;

    const scores = value as RawUtteranceScores;
    return {
        accuracy: clampScore(scores.accuracy),
        completeness: clampScore(scores.completeness),
        fluency: clampScore(scores.fluency),
        prosody: clampScore(scores.prosody),
        total: clampScore(scores.total),
        content_reproduction: scores.content_reproduction === undefined ? undefined : clampScore(scores.content_reproduction),
        rhythm_fluency: scores.rhythm_fluency === undefined ? undefined : clampScore(scores.rhythm_fluency),
        pronunciation_clarity: scores.pronunciation_clarity === undefined ? undefined : clampScore(scores.pronunciation_clarity),
    };
}

export function computeCoverageRatio(wordResults: PronunciationWordResult[]) {
    const referenceWords = wordResults.filter((row) => row.status !== "inserted");
    if (referenceWords.length === 0) return 0;

    const covered = referenceWords.filter((row) => row.status !== "missing").length;
    return Math.max(0, Math.min(1, covered / referenceWords.length));
}

export function computeContentScore(wordResults: PronunciationWordResult[], coverageRatio: number) {
    const referenceWords = wordResults.filter((row) => row.status !== "inserted");
    if (referenceWords.length === 0) return 0;

    const missingCount = referenceWords.filter((row) => row.status === "missing").length;
    const insertedCount = wordResults.filter((row) => row.status === "inserted").length;
    const weakCount = referenceWords.filter((row) => row.status === "weak").length;

    const rawScore = (coverageRatio * 10) - (insertedCount * 0.35) - (weakCount * 0.15) - (missingCount * 0.2);
    return clampScore(rawScore);
}

export function computeOverallScore(pronunciationScore: number, contentScore: number, coverageRatio: number) {
    const rawScore = (pronunciationScore * 0.85) + (contentScore * 0.15);
    const cappedScore = coverageRatio < 0.6 ? Math.min(rawScore, 6) : rawScore;
    return clampScore(cappedScore);
}

export function buildSummaryCn(payload: {
    score: number;
    pronunciationScore: number;
    coverageRatio: number;
    wordResults: PronunciationWordResult[];
}) {
    const missingCount = payload.wordResults.filter((row) => row.status === "missing").length;
    const mispronouncedCount = payload.wordResults.filter((row) => row.status === "mispronounced").length;

    if (payload.coverageRatio < 0.6) {
        return "复述覆盖率偏低，先把整句完整跟出来，再追求细节发音。";
    }

    if (payload.pronunciationScore >= 8.5 && missingCount === 0 && mispronouncedCount <= 1) {
        return "这次跟读整体很稳，发音和句子覆盖都已经接近标准。";
    }

    if (payload.pronunciationScore >= 7) {
        return "整体能跟上原句，但还有几个词的发音和收音需要再磨一下。";
    }

    if (missingCount >= 2) {
        return "这次主要问题不是单个词，而是整句覆盖还不够完整。";
    }

    return "这次主要卡在发音清晰度，建议先慢速把关键词读准。";
}

export function buildTipsCn(wordResults: PronunciationWordResult[]) {
    const tips: string[] = [];
    const missingWords = wordResults.filter((row) => row.status === "missing").slice(0, 2).map((row) => row.word);
    const mispronouncedWords = wordResults.filter((row) => row.status === "mispronounced").slice(0, 2).map((row) => row.word);
    const weakWords = wordResults.filter((row) => row.status === "weak").slice(0, 2).map((row) => row.word);

    if (missingWords.length > 0) {
        tips.push(`先把整句骨架补全，尤其注意 ${missingWords.join(" / ")} 这些漏读的位置。`);
    }

    if (mispronouncedWords.length > 0) {
        tips.push(`重点重听并跟读 ${mispronouncedWords.join(" / ")}，把元音和尾音读清楚。`);
    }

    if (tips.length < 2 && weakWords.length > 0) {
        tips.push(`语流还可以更稳，${weakWords.join(" / ")} 这些位置需要更自然地连起来。`);
    }

    while (tips.length < 2) {
        tips.push("先慢速跟读一遍，再按正常语速复述，优先保证每个关键词都清楚落地。");
    }

    return tips.slice(0, 2);
}

export function normalizePronunciationPayload(
    payload: Record<string, unknown>,
    options: { fallbackTranscript?: string } = {},
): PronunciationScorePayload {
    const wordResults = normalizeWordResults(payload.word_results);
    const utteranceScores = normalizeUtteranceScores(payload.utterance_scores);
    const coverageRatio = clampScore(
        (typeof payload.coverage_ratio === "number" ? payload.coverage_ratio : computeCoverageRatio(wordResults)) * 10,
    ) / 10;
    const pronunciationScore = clampScore(
        utteranceScores?.pronunciation_clarity
        ?? payload.pronunciation_score
        ?? payload.score
        ?? (wordResults.length
            ? wordResults.reduce((sum, row) => sum + row.score, 0) / wordResults.length
            : 0),
    );
    const contentScore = clampScore(
        typeof payload.content_score === "number"
            ? payload.content_score
            : (utteranceScores?.content_reproduction ?? utteranceScores?.completeness ?? computeContentScore(wordResults, coverageRatio)),
    );
    const fluencyScore = clampScore(
        payload.fluency_score
        ?? utteranceScores?.rhythm_fluency
        ?? utteranceScores?.fluency
        ?? pronunciationScore,
    );
    const score = clampScore(
        utteranceScores?.total
        ?? payload.score
        ?? pronunciationScore,
    );
    const transcript = typeof payload.transcript === "string"
        ? payload.transcript
        : options.fallbackTranscript ?? "";
    const summaryCn = typeof payload.summary_cn === "string" ? payload.summary_cn : "";
    const tipsCn = Array.isArray(payload.tips_cn) && payload.tips_cn.every((item) => typeof item === "string")
        ? (payload.tips_cn as string[]).slice(0, 2)
        : [];

    return {
        score,
        pronunciation_score: pronunciationScore,
        content_score: contentScore,
        fluency_score: fluencyScore,
        coverage_ratio: coverageRatio,
        transcript,
        summary_cn: summaryCn,
        tips_cn: tipsCn,
        word_results: wordResults,
        utterance_scores: utteranceScores,
        engine: typeof payload.engine === "string" ? payload.engine : "charsiu",
        engine_version: typeof payload.engine_version === "string" ? payload.engine_version : "unknown",
    };
}

export function toLegacyListeningSegments(wordResults: PronunciationWordResult[]) {
    return wordResults.map((row) => ({
        word: row.word,
        status: row.status === "correct"
            ? "correct"
            : row.status === "missing"
                ? "missing"
                : row.status === "inserted"
                    ? "user_extra"
                    : row.status === "weak"
                        ? "variation"
                        : "phonetic_error",
        user_input: row.spoken,
    }));
}
