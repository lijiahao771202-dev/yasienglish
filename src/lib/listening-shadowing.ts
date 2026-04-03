import { extractWordTokens, normalizeWordForMatch } from "@/lib/read-speaking";

export type PronunciationTokenState = "pending" | "current" | "correct" | "incorrect" | "missed";
export type ListeningScoreTier = "excellent" | "good" | "ok" | "retry";

export function resolveListeningScoreTier(score: number): ListeningScoreTier {
    if (score >= 90) return "excellent";
    if (score >= 75) return "good";
    if (score >= 55) return "ok";
    return "retry";
}

function levenshteinDistance(left: string, right: string) {
    const leftLength = left.length;
    const rightLength = right.length;
    if (leftLength === 0) return rightLength;
    if (rightLength === 0) return leftLength;

    const matrix: number[][] = Array.from({ length: leftLength + 1 }, () => new Array(rightLength + 1).fill(0));
    for (let i = 0; i <= leftLength; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= rightLength; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= leftLength; i += 1) {
        for (let j = 1; j <= rightLength; j += 1) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            );
        }
    }

    return matrix[leftLength][rightLength];
}

function encodeSoundex(input: string) {
    const letters = input.toLowerCase().replace(/[^a-z]/g, "");
    if (!letters) return "";

    const map: Record<string, string> = {
        b: "1", f: "1", p: "1", v: "1",
        c: "2", g: "2", j: "2", k: "2", q: "2", s: "2", x: "2", z: "2",
        d: "3", t: "3",
        l: "4",
        m: "5", n: "5",
        r: "6",
    };

    const first = letters[0];
    let previousCode = map[first] || "";
    let encoded = first.toUpperCase();

    for (let index = 1; index < letters.length && encoded.length < 4; index += 1) {
        const char = letters[index];
        const code = map[char] || "";
        if (!code || code === previousCode) {
            previousCode = code || previousCode;
            continue;
        }
        encoded += code;
        previousCode = code;
    }

    while (encoded.length < 4) {
        encoded += "0";
    }

    return encoded;
}

function arePronunciationTokensEquivalent(left: string, right: string) {
    if (!left || !right) return false;
    if (left === right) return true;

    const looseLeft = left.replace(/'/g, "");
    const looseRight = right.replace(/'/g, "");
    if (looseLeft === looseRight) return true;
    if (!looseLeft || !looseRight) return false;

    const leftLen = looseLeft.length;
    const rightLen = looseRight.length;
    const maxLen = Math.max(leftLen, rightLen);
    const lenGap = Math.abs(leftLen - rightLen);

    if (lenGap <= 2 && maxLen >= 3) {
        const leftSoundex = encodeSoundex(looseLeft);
        const rightSoundex = encodeSoundex(looseRight);
        if (leftSoundex && leftSoundex === rightSoundex) {
            return true;
        }
    }

    const distance = levenshteinDistance(looseLeft, looseRight);
    if (maxLen <= 4 && distance <= 1) {
        return true;
    }

    if (
        maxLen <= 6
        && distance <= 2
        && looseLeft[0] === looseRight[0]
        && looseLeft.slice(0, 2) === looseRight.slice(0, 2)
    ) {
        return true;
    }

    if (maxLen >= 5) {
        const similarity = 1 - (distance / maxLen);
        if (similarity >= 0.82) {
            return true;
        }
    }

    return false;
}

function computeLcsLength(source: string[], target: string[]) {
    const sourceLength = source.length;
    const targetLength = target.length;
    if (!sourceLength || !targetLength) return 0;

    let previous = new Array(targetLength + 1).fill(0);
    let current = new Array(targetLength + 1).fill(0);

    for (let row = 1; row <= sourceLength; row += 1) {
        for (let col = 1; col <= targetLength; col += 1) {
            if (arePronunciationTokensEquivalent(source[row - 1], target[col - 1])) {
                current[col] = previous[col - 1] + 1;
            } else {
                current[col] = Math.max(previous[col], current[col - 1]);
            }
        }
        [previous, current] = [current, previous];
        current.fill(0);
    }

    return previous[targetLength];
}

export function scoreListeningRecognition(referenceSentence: string, transcript: string) {
    const normalizedTargetTokens = extractWordTokens(referenceSentence)
        .map((token) => normalizeWordForMatch(token.text))
        .filter(Boolean);
    const normalizedSpokenTokens = extractWordTokens(transcript)
        .map((token) => normalizeWordForMatch(token.text))
        .filter(Boolean);

    const totalCount = normalizedTargetTokens.length;
    const spokenCount = normalizedSpokenTokens.length;
    if (!totalCount || !spokenCount) {
        return {
            score: 0,
            correctCount: 0,
            totalCount,
            spokenCount,
            recall: 0,
            precision: 0,
            lengthBalance: 0,
        };
    }

    const matchedCount = computeLcsLength(normalizedTargetTokens, normalizedSpokenTokens);
    const recall = matchedCount / totalCount;
    const precision = matchedCount / spokenCount;
    const lengthBalance = Math.max(0, 1 - (Math.abs(spokenCount - totalCount) / totalCount));
    const weighted = (recall * 0.68) + (precision * 0.24) + (lengthBalance * 0.08);
    const score = Math.round(Math.max(0, Math.min(100, weighted * 100)));

    return {
        score,
        correctCount: matchedCount,
        totalCount,
        spokenCount,
        recall,
        precision,
        lengthBalance,
    };
}

export function estimateListeningProgress(referenceSentence: string, transcript: string) {
    const sourceCount = extractWordTokens(referenceSentence).length;
    if (!sourceCount) return 0;
    const spokenCount = extractWordTokens(transcript).length;
    return Math.max(0, Math.min(sourceCount, spokenCount));
}

export function alignPronunciationTokens(params: {
    targetTokens: Array<{ sourceIndex: number; token: string }>;
    spokenTokens: string[];
}) {
    const { targetTokens, spokenTokens } = params;
    const tokenStates = new Map<number, PronunciationTokenState>();
    const targetLength = targetTokens.length;
    const spokenLength = spokenTokens.length;

    if (!targetLength || !spokenLength) {
        return { tokenStates, correctCount: 0 };
    }

    const dp: number[][] = Array.from(
        { length: targetLength + 1 },
        () => new Array(spokenLength + 1).fill(0),
    );

    for (let i = 0; i <= targetLength; i += 1) dp[i][0] = i;
    for (let j = 0; j <= spokenLength; j += 1) dp[0][j] = j;

    for (let i = 1; i <= targetLength; i += 1) {
        for (let j = 1; j <= spokenLength; j += 1) {
            const isEquivalent = arePronunciationTokensEquivalent(targetTokens[i - 1].token, spokenTokens[j - 1]);
            const matchCost = isEquivalent ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j - 1] + matchCost,
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
            );
        }
    }

    let i = targetLength;
    let j = spokenLength;
    let correctCount = 0;

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0) {
            const isMatch = arePronunciationTokensEquivalent(targetTokens[i - 1].token, spokenTokens[j - 1]);
            const diagonalCost = dp[i - 1][j - 1] + (isMatch ? 0 : 1);
            if (isMatch && dp[i][j] === diagonalCost) {
                const sourceIndex = targetTokens[i - 1].sourceIndex;
                tokenStates.set(sourceIndex, "correct");
                correctCount += 1;
                i -= 1;
                j -= 1;
                continue;
            }
        }

        if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
            tokenStates.set(targetTokens[i - 1].sourceIndex, "missed");
            i -= 1;
            continue;
        }

        if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
            j -= 1;
            continue;
        }

        if (i > 0 && j > 0) {
            const isMatch = arePronunciationTokensEquivalent(targetTokens[i - 1].token, spokenTokens[j - 1]);
            if (isMatch && dp[i][j] === dp[i - 1][j - 1]) {
                tokenStates.set(targetTokens[i - 1].sourceIndex, "correct");
                correctCount += 1;
                i -= 1;
                j -= 1;
                continue;
            }
            tokenStates.set(targetTokens[i - 1].sourceIndex, "incorrect");
            i -= 1;
            j -= 1;
        } else if (i > 0) {
            tokenStates.set(targetTokens[i - 1].sourceIndex, "missed");
            i -= 1;
        } else {
            j -= 1;
        }
    }

    return { tokenStates, correctCount };
}
