import { requestSemanticGrade } from "@/lib/bge-client";
import { calculateNlpScore } from "@/lib/translation-scoring";

export type DrillFeedbackLike = {
    _error?: boolean;
    _isLocalEvaluation?: boolean;
    _literalScore?: number;
    _nlpScore?: number;
    _vectorScore?: number;
    feedback?: unknown;
    improved_version?: string;
    judge_reasoning?: string;
    score?: number;
    summary_cn?: string;
    tips_cn?: string[];
    word_results?: unknown[];
};

export async function evaluateLocalTranslationScore(
    userTranslation: string,
    referenceEnglish: string,
): Promise<DrillFeedbackLike | null> {
    const normalizedUserForSim = userTranslation.toLowerCase().replace(/[.,!?;]+$/, "").replace(/\s+/g, " ").trim();
    const normalizedRefForSim = referenceEnglish.toLowerCase().replace(/[.,!?;]+$/, "").replace(/\s+/g, " ").trim();

    const computeLevenshtein = (a: string, b: string): number => {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix: number[][] = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1),
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    };

    const levenshteinDistance = computeLevenshtein(normalizedUserForSim, normalizedRefForSim);
    const maxLen = Math.max(normalizedUserForSim.length, normalizedRefForSim.length);
    const rawSimilarity = maxLen === 0 ? 1 : 1 - (levenshteinDistance / maxLen);

    const negations = ["not", "never", "no", "cannot", "failed", "without", "lack", "hardly", "barely"];
    const hasNegation = (text: string) => {
        const tokens = text.split(/\s+/);
        return tokens.some((token) => negations.includes(token) || token.endsWith("n't"));
    };
    const negationMismatch = hasNegation(normalizedUserForSim) !== hasNegation(normalizedRefForSim);

    const pronouns = ["i", "he", "she", "we", "they"];
    const extractPronouns = (text: string) => text.split(/\s+/).filter((token) => pronouns.includes(token));
    const userPronouns = extractPronouns(normalizedUserForSim);
    const referencePronouns = extractPronouns(normalizedRefForSim);
    const pronounMismatch = userPronouns.some((value) => !referencePronouns.includes(value))
        || referencePronouns.some((value) => !userPronouns.includes(value));

    const userWordCount = normalizedUserForSim.split(/\s+/).length;
    const refWordCount = normalizedRefForSim.split(/\s+/).length;
    const lengthRatio = userWordCount / Math.max(refWordCount, 1);
    const lengthPenalty = lengthRatio < 0.65 ? 0.7 : 1.0;

    let semanticSimilarity = 0;
    try {
        semanticSimilarity = await requestSemanticGrade(normalizedUserForSim, normalizedRefForSim);
    } catch (error) {
        console.warn("Semantic grade failed", error);
    }

    const literalScore = rawSimilarity >= 0.95 ? 10 : rawSimilarity * 10;

    let semanticScore = 0;
    if (semanticSimilarity >= 0.96) {
        semanticScore = 10;
    } else if (semanticSimilarity > 0.6) {
        const ratio = (semanticSimilarity - 0.6) / 0.36;
        semanticScore = Math.pow(ratio, 1.2) * 10;
    }

    let nlpScore = 0;
    try {
        const nlpResult = calculateNlpScore(normalizedUserForSim, normalizedRefForSim);
        nlpScore = nlpResult.score / 10.0;
    } catch (error) {
        console.warn("NLP score failed", error);
    }

    let baseBlendedScore = (semanticScore * 0.4) + (nlpScore * 0.4) + (literalScore * 0.2);
    let internalReasoningFlag = "";
    let finalScore = baseBlendedScore;

    if (negationMismatch || pronounMismatch) {
        finalScore *= 0.5;
        internalReasoningFlag += `[逻辑翻车：检测到${negationMismatch ? "肯定/否定语义颠倒" : "主语人称错位"}] `;
    }
    if (lengthPenalty < 1.0) {
        finalScore *= lengthPenalty;
        internalReasoningFlag += "[句子残缺：疑似漏掉半句] ";
    }

    finalScore = Math.min(10, Number(finalScore.toFixed(1)));
    if (rawSimilarity >= 0.95 && !negationMismatch && !pronounMismatch) {
        finalScore = 10;
    }

    if (finalScore >= 8.5) {
        const isPerfectText = rawSimilarity >= 0.95;
        return {
            score: finalScore,
            judge_reasoning: (isPerfectText
                ? "完全契合！(Xenova/bge-m3 极速本地裁判)"
                : `高维语义匹配过关！(Xenova/bge-m3 极速本地裁判 | 映射得分 ${finalScore})`) + internalReasoningFlag,
            feedback: {
                translation_tips: ["Xenova/bge-m3 逻辑鉴定完毕：句意符合标准要求！(0 API成本)"],
                encouragement: `稳过，拿下了 ${finalScore} 分！`,
            },
            summary_cn: "与标准参考句高度结构吻合或绝对同义。",
            tips_cn: [],
            _isLocalEvaluation: true,
            _vectorScore: semanticScore ? Number(semanticScore.toFixed(1)) : 0,
            _literalScore: Number(literalScore.toFixed(1)),
            _nlpScore: Number(nlpScore.toFixed(1)),
        };
    }

    if (finalScore > 0.5) {
        return {
            score: finalScore,
            judge_reasoning: `与答案存在硬偏差，疑似严重漏词或不同义翻译 (原始夹角率 ${Math.round(semanticSimilarity * 100)}%)。` + internalReasoningFlag,
            feedback: {
                translation_tips: [
                    "系统监测到这可能并非一个有效的同义词替换，或许缺失了主谓宾的完整结构。",
                    "如果你坚信这是纯正高级的地道同义句，请务必「立刻点击 AI 申诉裁判」！",
                ],
                encouragement: "本地算法扣分过重？别慌，点申诉！",
            },
            summary_cn: "与原句不匹配，若确认无语法问题请向 AI 申诉。",
            tips_cn: [],
            _isLocalEvaluation: true,
            _vectorScore: semanticScore ? Number(semanticScore.toFixed(1)) : 0,
            _literalScore: Number(literalScore.toFixed(1)),
            _nlpScore: Number(nlpScore.toFixed(1)),
        };
    }

    return null;
}

export function buildScoringErrorFeedback(
    details: string | undefined,
    isListeningMode: boolean,
): DrillFeedbackLike {
    return {
        score: -1,
        judge_reasoning: isListeningMode
            ? (details || "本地发音评分暂时不可用，请重试。")
            : "评分服务暂时不可用，请重试。",
        feedback: isListeningMode
            ? {
                listening_tips: [details || "本地发音评分暂时不可用，请重试。"],
                encouragement: "录音会保留，调整后可以重新提交。",
            }
            : ["AI 评分接口超时或出错，请再试一次。"],
        summary_cn: isListeningMode ? (details || "本地发音评分暂时不可用，请重试。") : undefined,
        tips_cn: isListeningMode ? [details || "本地发音评分暂时不可用，请重试。"] : undefined,
        improved_version: "",
        word_results: [],
        _error: true,
    };
}

export function normalizeDictationFeedback<T extends DrillFeedbackLike>(feedback: T): T {
    return {
        ...feedback,
        feedback: feedback.feedback ?? {
            dictation_tips: [
                feedback.judge_reasoning || "先写主干意思，再补细节。",
                "建议先听完整句，再回放核对关键词。",
            ],
            encouragement: "听写已提交，继续保持。",
        },
    };
}
