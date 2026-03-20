import * as Diff from "diff";

export interface TranslationHighlight {
    kind: string;
    before: string;
    after: string;
    note: string;
    tip?: string;
}

const PREPOSITIONS = new Set([
    "about", "at", "by", "for", "from", "in", "into", "of", "on", "to", "with", "over", "under", "through", "between",
]);

function inferReplacementHint(before: string, after: string): string {
    const beforeTokens = tokenizeForComparison(before);
    const afterTokens = tokenizeForComparison(after);
    const allTokens = [...beforeTokens, ...afterTokens];

    if (allTokens.some((token) => PREPOSITIONS.has(token))) {
        return "这里调整了介词或固定搭配，用法更符合英语习惯。";
    }

    const hasArticleShift =
        beforeTokens.some((token) => token === "a" || token === "an" || token === "the") ||
        afterTokens.some((token) => token === "a" || token === "an" || token === "the");
    if (hasArticleShift) {
        return "这里调整了限定词搭配，让名词表达更自然。";
    }

    const hasVerbFormShift = allTokens.some((token) => /(ed|ing|s)$/.test(token));
    if (hasVerbFormShift) {
        return "这里调整了动词或词形，使句子更符合语法和语感。";
    }

    return "这里换成了更地道、更常见的表达方式。";
}

function normalizeToken(token: string) {
    return token
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .trim();
}

export function normalizeTranslationForComparison(text: string) {
    return tokenizeForComparison(text).join(" ");
}

function tokenizeForComparison(text: string) {
    return text
        .split(/\s+/)
        .map(normalizeToken)
        .filter(Boolean);
}

export function buildTranslationHighlights(userText: string, targetText: string, limit = 3): TranslationHighlight[] {
    const userTokens = tokenizeForComparison(userText);
    const targetTokens = tokenizeForComparison(targetText);
    const diffs = Diff.diffArrays(userTokens, targetTokens);
    const highlights: TranslationHighlight[] = [];

    for (let i = 0; i < diffs.length; i++) {
        const part = diffs[i];
        const currentValue = Array.isArray(part.value) ? part.value.join(" ").trim() : "";
        if (!currentValue) {
            continue;
        }

        if (part.removed) {
            let correction = "";
            if (i + 1 < diffs.length && diffs[i + 1].added) {
                const nextValue = Array.isArray(diffs[i + 1].value) ? diffs[i + 1].value.join(" ").trim() : "";
                correction = nextValue;
                i++;
            }

            highlights.push({
                kind: correction ? "关键改错" : "多余表达",
                before: currentValue,
                after: correction || "删除这部分",
                note: correction
                    ? `将“${currentValue}”改为“${correction}”。${inferReplacementHint(currentValue, correction)}`
                    : `“${currentValue}”在这里语义重复或不自然，建议删除。`,
            });
        } else if (part.added) {
            highlights.push({
                kind: "缺失内容",
                before: "未写出",
                after: currentValue,
                note: `补上“${currentValue}”后，句子信息更完整。`,
            });
        }

        if (highlights.length >= limit) {
            break;
        }
    }

    return highlights;
}
