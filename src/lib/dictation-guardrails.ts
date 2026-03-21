const DICTATION_PUNCTUATION_HINT_RE = /(标点|逗号|句号|顿号|分号|冒号|引号|问号|感叹号|括号|省略号|破折号|书名号|符号|断句)/;
const DICTATION_SEMANTIC_HINT_RE = /(遗漏|缺失|漏掉|误解|错误|偏差|不完整|关键信息|主语|动作|宾语|否定|数字|时间|地点|因果|逻辑|语义)/;

export type DictationErrorItem = {
    error: string;
    correction: string;
    rule: string;
    tip: string;
};

export function normalizeDictationText(text: string) {
    return text
        .normalize("NFKC")
        .replace(/[\p{P}\p{S}\s]+/gu, "")
        .trim();
}

export function isDictationPunctuationOnlyDifference(userAnswer: string, goldAnswer: string) {
    if (!userAnswer || !goldAnswer) return false;
    return normalizeDictationText(userAnswer) === normalizeDictationText(goldAnswer);
}

function collectDictationIssueText(payload: Record<string, unknown>) {
    const chunks: string[] = [];

    if (typeof payload.judge_reasoning === "string") {
        chunks.push(payload.judge_reasoning);
    }

    const feedback = payload.feedback;
    if (Array.isArray(feedback)) {
        for (const item of feedback) {
            if (typeof item === "string") chunks.push(item);
        }
    } else if (feedback && typeof feedback === "object") {
        const feedbackRecord = feedback as Record<string, unknown>;
        const tips = feedbackRecord.dictation_tips;
        if (Array.isArray(tips)) {
            for (const tip of tips) {
                if (typeof tip === "string") chunks.push(tip);
            }
        }
        if (typeof feedbackRecord.encouragement === "string") {
            chunks.push(feedbackRecord.encouragement);
        }
    }

    const errorAnalysis = payload.error_analysis;
    if (Array.isArray(errorAnalysis)) {
        for (const row of errorAnalysis) {
            if (!row || typeof row !== "object") continue;
            const rowRecord = row as Record<string, unknown>;
            for (const key of ["error", "correction", "rule", "tip"] as const) {
                const value = rowRecord[key];
                if (typeof value === "string") chunks.push(value);
            }
        }
    }

    return chunks.join(" ");
}

export function hasPunctuationOnlyDictationIssue(payload: Record<string, unknown>) {
    const issuesText = collectDictationIssueText(payload);
    return DICTATION_PUNCTUATION_HINT_RE.test(issuesText) && !DICTATION_SEMANTIC_HINT_RE.test(issuesText);
}

export function normalizeDictationScore(rawScore: unknown, options: { punctuationOnly?: boolean } = {}) {
    if (options.punctuationOnly) {
        return 10;
    }

    const numericScore = typeof rawScore === "number" ? rawScore : Number(rawScore);
    if (!Number.isFinite(numericScore)) {
        return 0;
    }

    return Math.max(0, Math.min(10, Math.round(numericScore)));
}

export function normalizeDictationErrorItems(value: unknown): DictationErrorItem[] {
    if (!Array.isArray(value)) return [];

    return value
        .filter((row) => row && typeof row === "object")
        .map((row) => {
            const record = row as Record<string, unknown>;
            return {
                error: typeof record.error === "string" ? record.error : "",
                correction: typeof record.correction === "string" ? record.correction : "",
                rule: typeof record.rule === "string" ? record.rule : "",
                tip: typeof record.tip === "string" ? record.tip : "",
            };
        });
}

function isPunctuationOnlyDictationError(item: DictationErrorItem) {
    const text = [item.error, item.correction, item.rule, item.tip].filter(Boolean).join(" ");
    return DICTATION_PUNCTUATION_HINT_RE.test(text) && !DICTATION_SEMANTIC_HINT_RE.test(text);
}

export function filterSemanticDictationErrorItems(value: unknown) {
    return normalizeDictationErrorItems(value).filter((item) => !isPunctuationOnlyDictationError(item));
}
