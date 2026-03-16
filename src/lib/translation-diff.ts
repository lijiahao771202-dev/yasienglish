import * as Diff from "diff";

export interface TranslationHighlight {
    kind: string;
    before: string;
    after: string;
    note: string;
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
                note: correction ? "这里需要替换成更准确的表达。" : "这部分在标准表达里不需要。",
            });
        } else if (part.added) {
            highlights.push({
                kind: "缺失内容",
                before: "未写出",
                after: currentValue,
                note: "这部分补上后意思才完整。",
            });
        }

        if (highlights.length >= limit) {
            break;
        }
    }

    return highlights;
}
