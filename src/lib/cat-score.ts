export type CatLegacyDifficulty = "cet4" | "cet6" | "ielts";

export type CatObjectiveQuestionType =
    | "multiple_choice"
    | "multiple_select"
    | "true_false_ng"
    | "matching"
    | "fill_blank_choice";

export interface CatRankTier {
    index: number;
    id: string;
    name: string;
    minScore: number;
    maxScore: number | null;
    primaryLabel: string;
    secondaryLabel: string;
}

export interface CatDifficultyProfile {
    score: number;
    progress: number;
    wordCountMin: number;
    wordCountMax: number;
    sentenceLengthMin: number;
    sentenceLengthMax: number;
    clauseDensityMin: number;
    clauseDensityMax: number;
    rareWordRatioMin: number;
    rareWordRatioMax: number;
    abstractnessLevel: number;
    distractorStrength: number;
    expectedReadingMs: number;
}

export interface ArticleStructureMetrics {
    wordCount: number;
    sentenceCount: number;
    avgSentenceLength: number;
    clauseDensity: number;
    rareWordRatio: number;
}

export interface CatArticleValidation {
    isValid: boolean;
    metrics: ArticleStructureMetrics;
    reasons: string[];
}

export interface TierLexicalProfile extends CatRankTier {
    tierId?: string;
    coreDomain: string;
    stretchDomain: string;
    targetWordCountRange: [number, number];
    targetSentenceLengthRange: [number, number];
    targetClauseDensityRange: [number, number];
    minimumCoreCoverage: number;
    minimumStretchCoverage: number;
    maximumOverlevelPenalty: number;
    minimumConfidence: number;
}

export interface LexicalAuditResult {
    coreCoverage: number;
    stretchCoverage: number;
    overlevelPenalty: number;
    confidence: number;
    reasons?: string[];
}

export interface CatLexicalValidation {
    isValid: boolean;
    coreCoverage: number;
    stretchCoverage: number;
    overlevelPenalty: number;
    confidence: number;
    reasons: string[];
}

export interface CatArticleDifficultyValidation {
    isValid: boolean;
    structure: CatArticleValidation;
    lexical: CatLexicalValidation;
    reasons: string[];
}

export interface CatQuizBlueprint {
    score: number;
    questionCount: number;
    ratioBandLabel: string;
    ratios: Record<CatObjectiveQuestionType, number>;
    distribution: Record<CatObjectiveQuestionType, number>;
}

export const CAT_RANK_ICONS: Record<string, string> = {
    a0: "🌱",
    a1: "🍃",
    a2: "🪴",
    b1: "🥉",
    b1_plus: "🛡️",
    b2_minus: "🥈",
    b2: "⚔️",
    b2_plus: "🔥",
    c1_minus: "🥇",
    c1: "🎯",
    c1_plus: "🏅",
    c2_minus: "💠",
    c2: "💎",
    c2_plus: "✨",
    s1: "👑",
    s2: "🦅",
    master: "🚀",
};

export function getCatRankIconByTierId(tierId: string) {
    return CAT_RANK_ICONS[tierId] ?? "⭐";
}

export function getCatRankIcon(score: number) {
    return getCatRankIconByTierId(getCatRankTier(score).id);
}

export const CAT_OBJECTIVE_QUESTION_TYPES: CatObjectiveQuestionType[] = [
    "multiple_choice",
    "multiple_select",
    "true_false_ng",
    "matching",
    "fill_blank_choice",
];

export const CAT_RANK_TIERS: CatRankTier[] = [
    { index: 1, id: "a0", name: "A0 起步", minScore: 0, maxScore: 199, primaryLabel: "英语基础", secondaryLabel: "高中基础" },
    { index: 2, id: "a1", name: "A1 入门", minScore: 200, maxScore: 399, primaryLabel: "英语基础", secondaryLabel: "高中中段" },
    { index: 3, id: "a2", name: "A2 进阶", minScore: 400, maxScore: 599, primaryLabel: "英语基础", secondaryLabel: "高中毕业" },
    { index: 4, id: "b1", name: "B1 预备", minScore: 600, maxScore: 799, primaryLabel: "四级预备", secondaryLabel: "CET-4 Prep" },
    { index: 5, id: "b1_plus", name: "B1+ 强化", minScore: 800, maxScore: 999, primaryLabel: "四级强化", secondaryLabel: "CET-4" },
    { index: 6, id: "b2_minus", name: "B2- 稳定", minScore: 1000, maxScore: 1199, primaryLabel: "四级通过", secondaryLabel: "CET-4" },
    { index: 7, id: "b2", name: "B2 预备", minScore: 1200, maxScore: 1399, primaryLabel: "六级预备", secondaryLabel: "CET-6 Prep" },
    { index: 8, id: "b2_plus", name: "B2+ 冲刺", minScore: 1400, maxScore: 1599, primaryLabel: "六级冲刺", secondaryLabel: "CET-6 Prep" },
    { index: 9, id: "c1_minus", name: "C1- 稳定", minScore: 1600, maxScore: 1799, primaryLabel: "六级通过", secondaryLabel: "CET-6" },
    { index: 10, id: "c1", name: "C1 预备", minScore: 1800, maxScore: 1999, primaryLabel: "专四预备", secondaryLabel: "TEM-4 Prep" },
    { index: 11, id: "c1_plus", name: "C1+ 通过", minScore: 2000, maxScore: 2199, primaryLabel: "专四通过", secondaryLabel: "TEM-4" },
    { index: 12, id: "c2_minus", name: "C2- 学术", minScore: 2200, maxScore: 2399, primaryLabel: "雅思 6.0", secondaryLabel: "IELTS 6.0" },
    { index: 13, id: "c2", name: "C2 学术", minScore: 2400, maxScore: 2599, primaryLabel: "雅思 6.5", secondaryLabel: "IELTS 6.5" },
    { index: 14, id: "c2_plus", name: "C2+ 高阶", minScore: 2600, maxScore: 2799, primaryLabel: "雅思 7.0", secondaryLabel: "IELTS 7.0" },
    { index: 15, id: "s1", name: "S1 专业", minScore: 2800, maxScore: 2999, primaryLabel: "专八预备", secondaryLabel: "TEM-8 Prep" },
    { index: 16, id: "s2", name: "S2 专家", minScore: 3000, maxScore: 3199, primaryLabel: "专八 / 雅思 7.5", secondaryLabel: "TEM-8 / IELTS 7.5" },
    { index: 17, id: "master", name: "大师", minScore: 3200, maxScore: null, primaryLabel: "雅思 8.0+", secondaryLabel: "可持续增长" },
];

export const tierLexicalProfile: TierLexicalProfile[] = [
    {
        ...CAT_RANK_TIERS[0],
        coreDomain: "日常生活",
        stretchDomain: "家庭与校园",
        targetWordCountRange: range(160, 220),
        targetSentenceLengthRange: range(8, 12),
        targetClauseDensityRange: range(0.05, 0.12),
        minimumCoreCoverage: 0.58,
        minimumStretchCoverage: 0.05,
        maximumOverlevelPenalty: 0.24,
        minimumConfidence: 0.52,
    },
    {
        ...CAT_RANK_TIERS[1],
        coreDomain: "校园基础",
        stretchDomain: "自我介绍",
        targetWordCountRange: range(180, 240),
        targetSentenceLengthRange: range(8, 12.5),
        targetClauseDensityRange: range(0.06, 0.13),
        minimumCoreCoverage: 0.6,
        minimumStretchCoverage: 0.06,
        maximumOverlevelPenalty: 0.23,
        minimumConfidence: 0.54,
    },
    {
        ...CAT_RANK_TIERS[2],
        coreDomain: "日常互动",
        stretchDomain: "学习习惯",
        targetWordCountRange: range(200, 260),
        targetSentenceLengthRange: range(9, 13),
        targetClauseDensityRange: range(0.07, 0.14),
        minimumCoreCoverage: 0.62,
        minimumStretchCoverage: 0.07,
        maximumOverlevelPenalty: 0.22,
        minimumConfidence: 0.56,
    },
    {
        ...CAT_RANK_TIERS[3],
        coreDomain: "学校生活",
        stretchDomain: "简单叙事",
        targetWordCountRange: range(220, 280),
        targetSentenceLengthRange: range(9.5, 13.5),
        targetClauseDensityRange: range(0.08, 0.16),
        minimumCoreCoverage: 0.64,
        minimumStretchCoverage: 0.08,
        maximumOverlevelPenalty: 0.21,
        minimumConfidence: 0.58,
    },
    {
        ...CAT_RANK_TIERS[4],
        coreDomain: "校园事务",
        stretchDomain: "连贯叙述",
        targetWordCountRange: range(240, 300),
        targetSentenceLengthRange: range(10, 14),
        targetClauseDensityRange: range(0.09, 0.18),
        minimumCoreCoverage: 0.66,
        minimumStretchCoverage: 0.09,
        maximumOverlevelPenalty: 0.2,
        minimumConfidence: 0.6,
    },
    {
        ...CAT_RANK_TIERS[5],
        coreDomain: "个人经历",
        stretchDomain: "观点说明",
        targetWordCountRange: range(260, 320),
        targetSentenceLengthRange: range(10.5, 15),
        targetClauseDensityRange: range(0.1, 0.2),
        minimumCoreCoverage: 0.68,
        minimumStretchCoverage: 0.1,
        maximumOverlevelPenalty: 0.19,
        minimumConfidence: 0.62,
    },
    {
        ...CAT_RANK_TIERS[6],
        coreDomain: "公共话题",
        stretchDomain: "信息整合",
        targetWordCountRange: range(300, 360),
        targetSentenceLengthRange: range(11, 16),
        targetClauseDensityRange: range(0.12, 0.22),
        minimumCoreCoverage: 0.7,
        minimumStretchCoverage: 0.11,
        maximumOverlevelPenalty: 0.18,
        minimumConfidence: 0.64,
    },
    {
        ...CAT_RANK_TIERS[7],
        coreDomain: "社会情境",
        stretchDomain: "原因分析",
        targetWordCountRange: range(320, 390),
        targetSentenceLengthRange: range(11.5, 17),
        targetClauseDensityRange: range(0.13, 0.24),
        minimumCoreCoverage: 0.72,
        minimumStretchCoverage: 0.12,
        maximumOverlevelPenalty: 0.17,
        minimumConfidence: 0.66,
    },
    {
        ...CAT_RANK_TIERS[8],
        coreDomain: "观点表达",
        stretchDomain: "问题解决",
        targetWordCountRange: range(350, 430),
        targetSentenceLengthRange: range(12, 18),
        targetClauseDensityRange: range(0.14, 0.26),
        minimumCoreCoverage: 0.74,
        minimumStretchCoverage: 0.13,
        maximumOverlevelPenalty: 0.16,
        minimumConfidence: 0.68,
    },
    {
        ...CAT_RANK_TIERS[9],
        coreDomain: "学术讨论",
        stretchDomain: "论证扩展",
        targetWordCountRange: range(380, 470),
        targetSentenceLengthRange: range(12.5, 19),
        targetClauseDensityRange: range(0.16, 0.28),
        minimumCoreCoverage: 0.76,
        minimumStretchCoverage: 0.14,
        maximumOverlevelPenalty: 0.15,
        minimumConfidence: 0.7,
    },
    {
        ...CAT_RANK_TIERS[10],
        coreDomain: "社会议题",
        stretchDomain: "跨段综合",
        targetWordCountRange: range(420, 520),
        targetSentenceLengthRange: range(13, 20),
        targetClauseDensityRange: range(0.18, 0.3),
        minimumCoreCoverage: 0.78,
        minimumStretchCoverage: 0.15,
        maximumOverlevelPenalty: 0.14,
        minimumConfidence: 0.72,
    },
    {
        ...CAT_RANK_TIERS[11],
        coreDomain: "学术文本",
        stretchDomain: "多视角论证",
        targetWordCountRange: range(460, 580),
        targetSentenceLengthRange: range(14, 22),
        targetClauseDensityRange: range(0.2, 0.34),
        minimumCoreCoverage: 0.8,
        minimumStretchCoverage: 0.16,
        maximumOverlevelPenalty: 0.13,
        minimumConfidence: 0.74,
    },
    {
        ...CAT_RANK_TIERS[12],
        coreDomain: "抽象主题",
        stretchDomain: "领域比较",
        targetWordCountRange: range(500, 620),
        targetSentenceLengthRange: range(15, 24),
        targetClauseDensityRange: range(0.22, 0.38),
        minimumCoreCoverage: 0.82,
        minimumStretchCoverage: 0.17,
        maximumOverlevelPenalty: 0.12,
        minimumConfidence: 0.75,
    },
    {
        ...CAT_RANK_TIERS[13],
        coreDomain: "专业叙述",
        stretchDomain: "复杂推理",
        targetWordCountRange: range(540, 660),
        targetSentenceLengthRange: range(16, 25),
        targetClauseDensityRange: range(0.24, 0.4),
        minimumCoreCoverage: 0.83,
        minimumStretchCoverage: 0.18,
        maximumOverlevelPenalty: 0.11,
        minimumConfidence: 0.76,
    },
    {
        ...CAT_RANK_TIERS[14],
        coreDomain: "专业分析",
        stretchDomain: "研究综述",
        targetWordCountRange: range(580, 700),
        targetSentenceLengthRange: range(17, 26),
        targetClauseDensityRange: range(0.26, 0.44),
        minimumCoreCoverage: 0.84,
        minimumStretchCoverage: 0.19,
        maximumOverlevelPenalty: 0.1,
        minimumConfidence: 0.77,
    },
    {
        ...CAT_RANK_TIERS[15],
        coreDomain: "跨学科整合",
        stretchDomain: "理论评述",
        targetWordCountRange: range(620, 760),
        targetSentenceLengthRange: range(18, 28),
        targetClauseDensityRange: range(0.28, 0.48),
        minimumCoreCoverage: 0.85,
        minimumStretchCoverage: 0.2,
        maximumOverlevelPenalty: 0.09,
        minimumConfidence: 0.78,
    },
    {
        ...CAT_RANK_TIERS[16],
        coreDomain: "研究级表达",
        stretchDomain: "高阶综合",
        targetWordCountRange: range(660, 820),
        targetSentenceLengthRange: range(19, 30),
        targetClauseDensityRange: range(0.3, 0.52),
        minimumCoreCoverage: 0.86,
        minimumStretchCoverage: 0.22,
        maximumOverlevelPenalty: 0.08,
        minimumConfidence: 0.8,
    },
];

const MULTI_SELECT_MIN_COUNT = 1;

const RATIO_BANDS: Array<{
    min: number;
    max: number | null;
    label: string;
    questionCount: number;
    ratios: Record<CatObjectiveQuestionType, number>;
}> = [
    {
        min: 0,
        max: 799,
        label: "基础段",
        questionCount: 5,
        ratios: {
            multiple_choice: 0.4,
            multiple_select: 0.1,
            true_false_ng: 0.25,
            matching: 0.15,
            fill_blank_choice: 0.1,
        },
    },
    {
        min: 800,
        max: 1599,
        label: "进阶段",
        questionCount: 6,
        ratios: {
            multiple_choice: 0.32,
            multiple_select: 0.15,
            true_false_ng: 0.23,
            matching: 0.2,
            fill_blank_choice: 0.1,
        },
    },
    {
        min: 1600,
        max: 2399,
        label: "强化段",
        questionCount: 7,
        ratios: {
            multiple_choice: 0.24,
            multiple_select: 0.2,
            true_false_ng: 0.21,
            matching: 0.2,
            fill_blank_choice: 0.15,
        },
    },
    {
        min: 2400,
        max: null,
        label: "高阶段",
        questionCount: 8,
        ratios: {
            multiple_choice: 0.18,
            multiple_select: 0.25,
            true_false_ng: 0.17,
            matching: 0.2,
            fill_blank_choice: 0.2,
        },
    },
];

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, progress: number) {
    return start + (end - start) * progress;
}

function range(min: number, max: number): [number, number] {
    return [min, max];
}

export function normalizeCatScore(score: number) {
    if (!Number.isFinite(score)) return 0;
    return Math.max(0, Math.round(score));
}

export function getCatRankTier(score: number): CatRankTier {
    const normalizedScore = normalizeCatScore(score);
    return CAT_RANK_TIERS.find((tier) => {
        if (tier.maxScore === null) return normalizedScore >= tier.minScore;
        return normalizedScore >= tier.minScore && normalizedScore <= tier.maxScore;
    }) ?? CAT_RANK_TIERS[0];
}

export function getCatNextRankTier(score: number): CatRankTier | null {
    const current = getCatRankTier(score);
    const next = CAT_RANK_TIERS.find((tier) => tier.index === current.index + 1);
    return next ?? null;
}

export function getCatScoreToNextRank(score: number) {
    const normalizedScore = normalizeCatScore(score);
    const nextTier = getCatNextRankTier(normalizedScore);
    if (!nextTier) return 0;
    return Math.max(0, nextTier.minScore - normalizedScore);
}

export function getLegacyBandFromScore(score: number) {
    const normalizedScore = normalizeCatScore(score);
    return clamp(Math.floor(normalizedScore / 400) + 1, 1, 9);
}

export function getLegacyDifficultyFromScore(score: number): CatLegacyDifficulty {
    const band = getLegacyBandFromScore(score);
    if (band <= 3) return "cet4";
    if (band <= 6) return "cet6";
    return "ielts";
}

export function getCatDifficultyProfile(score: number): CatDifficultyProfile {
    const normalizedScore = normalizeCatScore(score);
    const progress = clamp(normalizedScore / 3200, 0, 1);

    const wordCountMin = Math.round(lerp(220, 720, progress));
    const wordCountMax = Math.round(lerp(340, 820, progress));
    const sentenceLengthMin = Number(lerp(11, 18, progress).toFixed(2));
    const sentenceLengthMax = Number(lerp(16, 28, progress).toFixed(2));
    const clauseDensityMin = Number(lerp(0.12, 0.4, progress).toFixed(3));
    const clauseDensityMax = Number(lerp(0.25, 0.55, progress).toFixed(3));
    const rareWordRatioMin = Number(lerp(0.04, 0.1, progress).toFixed(3));
    const rareWordRatioMax = Number(lerp(0.08, 0.16, progress).toFixed(3));
    const abstractnessLevel = Number(lerp(1, 5, progress).toFixed(2));
    const distractorStrength = Number(lerp(1, 5, progress).toFixed(2));
    const expectedReadingMs = Math.round(lerp(6 * 60 * 1000, 12 * 60 * 1000, progress));

    return {
        score: normalizedScore,
        progress,
        wordCountMin,
        wordCountMax,
        sentenceLengthMin,
        sentenceLengthMax,
        clauseDensityMin,
        clauseDensityMax,
        rareWordRatioMin,
        rareWordRatioMax,
        abstractnessLevel,
        distractorStrength,
        expectedReadingMs,
    };
}

export function getTierLexicalProfile(score: number): TierLexicalProfile {
    const normalizedScore = normalizeCatScore(score);
    const profile = tierLexicalProfile.find((candidate) => {
        if (candidate.maxScore === null) return normalizedScore >= candidate.minScore;
        return normalizedScore >= candidate.minScore && normalizedScore <= candidate.maxScore;
    }) ?? tierLexicalProfile[0];

    return {
        ...profile,
        tierId: profile.id,
    };
}

export function analyzeArticleStructure(text: string): ArticleStructureMetrics {
    const words = (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).map((token) => token.toLowerCase());
    const wordCount = words.length;

    const sentenceChunks = text
        .split(/[.!?]+/g)
        .map((item) => item.trim())
        .filter(Boolean);
    const sentenceCount = Math.max(1, sentenceChunks.length);

    const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : wordCount;

    const clauseMarkers = (text.match(/\b(because|although|though|while|whereas|which|that|who|whose|whom|if|when|unless|whether|since)\b/gi) ?? []).length;
    const clauseDensity = clauseMarkers / sentenceCount;

    const rareWordCount = words.filter((word) => word.length >= 9).length;
    const rareWordRatio = wordCount > 0 ? rareWordCount / wordCount : 0;

    return {
        wordCount,
        sentenceCount,
        avgSentenceLength,
        clauseDensity,
        rareWordRatio,
    };
}

function validateArticleStructureAgainstDifficultyProfile(text: string, profile: CatDifficultyProfile): CatArticleValidation {
    const metrics = analyzeArticleStructure(text);
    const reasons: string[] = [];

    const wordMin = Math.max(120, profile.wordCountMin - 30);
    const wordMax = profile.wordCountMax + 30;
    if (metrics.wordCount < wordMin || metrics.wordCount > wordMax) {
        reasons.push(`Word count out of range (${wordMin}-${wordMax}).`);
    }

    const sentenceMin = Math.max(6, profile.sentenceLengthMin - 3.2);
    const sentenceMax = profile.sentenceLengthMax + 3.2;
    if (metrics.avgSentenceLength < sentenceMin || metrics.avgSentenceLength > sentenceMax) {
        reasons.push(`Average sentence length out of range (${sentenceMin.toFixed(1)}-${sentenceMax.toFixed(1)}).`);
    }

    const clauseMin = Math.max(0.02, profile.clauseDensityMin - 0.08);
    const clauseMax = profile.clauseDensityMax + 0.08;
    if (metrics.clauseDensity < clauseMin || metrics.clauseDensity > clauseMax) {
        reasons.push(`Clause density out of range (${clauseMin.toFixed(2)}-${clauseMax.toFixed(2)}).`);
    }

    return {
        isValid: reasons.length === 0,
        metrics,
        reasons,
    };
}

export function validateArticleAgainstDifficultyProfile(text: string, profile: CatDifficultyProfile): CatArticleValidation {
    return validateArticleStructureAgainstDifficultyProfile(text, profile);
}

function isFiniteRatio(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function normalizeRatio(value: unknown) {
    if (!isFiniteRatio(value)) return 0;
    return clamp(value, 0, 1);
}

export function validateLexicalAudit(
    lexicalAuditResult: Partial<LexicalAuditResult> | null | undefined,
    profile: TierLexicalProfile,
): CatLexicalValidation {
    if (!lexicalAuditResult) {
        return {
            isValid: false,
            coreCoverage: 0,
            stretchCoverage: 0,
            overlevelPenalty: 0,
            confidence: 0,
            reasons: ["Missing lexical audit result."],
        };
    }

    const reasons: string[] = Array.isArray(lexicalAuditResult.reasons) ? [...lexicalAuditResult.reasons] : [];
    const coreCoverage = normalizeRatio(lexicalAuditResult.coreCoverage);
    const stretchCoverage = normalizeRatio(lexicalAuditResult.stretchCoverage);
    const overlevelPenalty = normalizeRatio(lexicalAuditResult.overlevelPenalty);
    const confidence = normalizeRatio(lexicalAuditResult.confidence);

    if (!isFiniteRatio(lexicalAuditResult.coreCoverage)) {
        reasons.push("Missing or invalid core coverage.");
    } else if (coreCoverage < profile.minimumCoreCoverage) {
        reasons.push(`Core coverage below target (${coreCoverage.toFixed(2)} < ${profile.minimumCoreCoverage.toFixed(2)}).`);
    }

    if (!isFiniteRatio(lexicalAuditResult.stretchCoverage)) {
        reasons.push("Missing or invalid stretch coverage.");
    } else if (stretchCoverage < profile.minimumStretchCoverage) {
        reasons.push(`Stretch coverage below target (${stretchCoverage.toFixed(2)} < ${profile.minimumStretchCoverage.toFixed(2)}).`);
    }

    if (!isFiniteRatio(lexicalAuditResult.overlevelPenalty)) {
        reasons.push("Missing or invalid over-level penalty.");
    } else if (overlevelPenalty > profile.maximumOverlevelPenalty) {
        reasons.push(`Over-level penalty above target (${overlevelPenalty.toFixed(2)} > ${profile.maximumOverlevelPenalty.toFixed(2)}).`);
    }

    if (!isFiniteRatio(lexicalAuditResult.confidence)) {
        reasons.push("Missing or invalid lexical confidence.");
    } else if (confidence < profile.minimumConfidence) {
        reasons.push(`Lexical confidence below target (${confidence.toFixed(2)} < ${profile.minimumConfidence.toFixed(2)}).`);
    }

    return {
        isValid: reasons.length === 0,
        coreCoverage,
        stretchCoverage,
        overlevelPenalty,
        confidence,
        reasons,
    };
}

export function validateArticleDifficulty(params: {
    text: string;
    score: number;
    lexicalAuditResult?: Partial<LexicalAuditResult> | null;
    profile?: CatDifficultyProfile;
}): CatArticleDifficultyValidation {
    const score = params.profile?.score ?? params.score;
    const profile = params.profile ?? getCatDifficultyProfile(score);
    const lexicalProfile = getTierLexicalProfile(score);
    const structure = validateArticleStructureAgainstDifficultyProfile(params.text, profile);
    const lexical = validateLexicalAudit(params.lexicalAuditResult, lexicalProfile);
    const reasons = [...structure.reasons, ...lexical.reasons];

    return {
        isValid: structure.isValid && lexical.isValid,
        structure,
        lexical,
        reasons,
    };
}

function getRatioBand(score: number) {
    const normalizedScore = normalizeCatScore(score);
    return RATIO_BANDS.find((band) => {
        if (band.max === null) return normalizedScore >= band.min;
        return normalizedScore >= band.min && normalizedScore <= band.max;
    }) ?? RATIO_BANDS[0];
}

function getProtectedMinimum(type: CatObjectiveQuestionType, questionCount: number) {
    if (type === "multiple_select") return MULTI_SELECT_MIN_COUNT;
    if (questionCount >= 7 && (type === "true_false_ng" || type === "matching")) return 1;
    return 0;
}

function sumDistribution(distribution: Record<CatObjectiveQuestionType, number>) {
    return CAT_OBJECTIVE_QUESTION_TYPES.reduce((sum, type) => sum + distribution[type], 0);
}

export function buildObjectiveDistribution(
    questionCount: number,
    ratios: Record<CatObjectiveQuestionType, number>,
): Record<CatObjectiveQuestionType, number> {
    const safeQuestionCount = Math.max(1, Math.round(questionCount));
    const distribution = CAT_OBJECTIVE_QUESTION_TYPES.reduce((acc, type) => {
        acc[type] = Math.floor(safeQuestionCount * ratios[type]);
        return acc;
    }, {} as Record<CatObjectiveQuestionType, number>);

    if (distribution.multiple_select < MULTI_SELECT_MIN_COUNT) {
        distribution.multiple_select = MULTI_SELECT_MIN_COUNT;
    }

    for (const type of CAT_OBJECTIVE_QUESTION_TYPES) {
        const minimum = getProtectedMinimum(type, safeQuestionCount);
        if (distribution[type] < minimum) {
            distribution[type] = minimum;
        }
    }

    let currentTotal = sumDistribution(distribution);

    while (currentTotal > safeQuestionCount) {
        const reductionOrder: CatObjectiveQuestionType[] = [
            "multiple_choice",
            "fill_blank_choice",
            "true_false_ng",
            "matching",
            "multiple_select",
        ];
        const removable = reductionOrder.find((type) => distribution[type] > getProtectedMinimum(type, safeQuestionCount));
        if (!removable) break;
        distribution[removable] -= 1;
        currentTotal -= 1;
    }

    if (currentTotal < safeQuestionCount) {
        const remainders = CAT_OBJECTIVE_QUESTION_TYPES
            .map((type) => {
                const exact = safeQuestionCount * ratios[type];
                return {
                    type,
                    remainder: exact - Math.floor(exact),
                };
            })
            .sort((left, right) => {
                if (right.remainder !== left.remainder) return right.remainder - left.remainder;
                const priority = ["multiple_select", "true_false_ng", "matching", "multiple_choice", "fill_blank_choice"] as CatObjectiveQuestionType[];
                return priority.indexOf(left.type) - priority.indexOf(right.type);
            });

        let cursor = 0;
        while (currentTotal < safeQuestionCount) {
            const fallbackType = remainders[cursor % remainders.length]?.type ?? "multiple_choice";
            distribution[fallbackType] += 1;
            currentTotal += 1;
            cursor += 1;
        }
    }

    return distribution;
}

export function getCatQuizBlueprint(score: number): CatQuizBlueprint {
    const normalizedScore = normalizeCatScore(score);
    const ratioBand = getRatioBand(normalizedScore);

    return {
        score: normalizedScore,
        questionCount: ratioBand.questionCount,
        ratioBandLabel: ratioBand.label,
        ratios: ratioBand.ratios,
        distribution: buildObjectiveDistribution(ratioBand.questionCount, ratioBand.ratios),
    };
}

export function buildCatArticleRetryInstruction(params: {
    attempt: number;
    maxAttempts: number;
    validation: CatArticleValidation;
    profile: CatDifficultyProfile;
}) {
    const { attempt, maxAttempts, validation, profile } = params;
    const reasonText = validation.reasons.length > 0
        ? validation.reasons.map((reason) => `- ${reason}`).join("\n")
        : "- Keep constraints tighter than previous attempt.";

    return `\nRETRY (${attempt}/${maxAttempts})\nPrevious draft does not fit the target profile:\n${reasonText}\nRegenerate the full article and keep these hard constraints:\n- Word count around ${profile.wordCountMin}-${profile.wordCountMax}\n- Average sentence length around ${profile.sentenceLengthMin.toFixed(1)}-${profile.sentenceLengthMax.toFixed(1)} words\n- Clause density around ${profile.clauseDensityMin.toFixed(2)}-${profile.clauseDensityMax.toFixed(2)}\n- Keep vocabulary aligned with the target tier profile and avoid drifting into over-level wording.\n`;
}

export function formatDistributionForPrompt(distribution: Record<CatObjectiveQuestionType, number>) {
    return CAT_OBJECTIVE_QUESTION_TYPES
        .map((type) => `${type}: ${distribution[type]}`)
        .join("\n");
}
