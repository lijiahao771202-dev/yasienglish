export type RebuildBandPosition = "entry" | "mid" | "exit";
export type RebuildSystemAssessment = "too_easy" | "matched" | "too_hard";
export type RebuildSelfEvaluation = "easy" | "just_right" | "hard";

export interface RebuildPracticeTier {
    cefr: "A1" | "A2-" | "A2+" | "B1" | "B2" | "C1" | "C2" | "C2+";
    bandPosition: RebuildBandPosition;
    label: string;
}

export interface RebuildAttemptSignals {
    accuracyRatio: number;
    completionRatio: number;
    misplacementRatio: number;
    distractorPickRatio: number;
    contentWordHitRate: number;
    tailCoverage: number;
    replayCount: number;
    tokenEditCount: number;
    exceededSoftLimit: boolean;
    skipped: boolean;
}

export interface RebuildEvaluationToken {
    text: string;
    selectedIndex: number | null;
    expectedIndex: number;
    status: "correct" | "misplaced" | "distractor" | "missing";
}

export interface RebuildEvaluationResult {
    isCorrect: boolean;
    correctCount: number;
    misplacedCount: number;
    distractorCount: number;
    missingCount: number;
    totalCount: number;
    accuracyRatio: number;
    completionRatio: number;
    misplacementRatio: number;
    distractorPickRatio: number;
    contentWordHitRate: number;
    tailCoverage: number;
    userSentence: string;
    tokenFeedback: RebuildEvaluationToken[];
}

export interface RebuildDisplayToken {
    text: string;
    kind: "correct" | "misplaced" | "replacement" | "inserted";
    originalText?: string;
}

export interface RebuildDisplayExtraToken {
    text: string;
    kind: "removed";
}

export interface RebuildDisplaySentence {
    tokens: RebuildDisplayToken[];
    extraTokens: RebuildDisplayExtraToken[];
}

const FUNCTION_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
    "for", "from", "had", "has", "have", "he", "her", "hers", "him", "his",
    "i", "if", "in", "into", "is", "it", "its", "me", "my", "of", "on", "or",
    "our", "ours", "she", "so", "than", "that", "the", "their", "them", "then",
    "there", "they", "this", "to", "up", "was", "we", "were", "when", "with",
    "you", "your", "yours", "will", "would", "should", "could", "after", "before",
    "over", "under", "through", "while", "because", "until", "near", "right",
]);

const CONFUSION_MAP: Record<string, string[]> = {
    bring: ["take", "carry", "leave"],
    take: ["bring", "carry", "leave"],
    menu: ["manual", "bill", "form"],
    counter: ["desk", "table", "window"],
    send: ["share", "bring", "leave"],
    class: ["group", "team", "meeting"],
    photo: ["paper", "copy", "form"],
    parents: ["people", "friends", "family"],
    group: ["class", "team", "club"],
    tonight: ["today", "later", "soon"],
    seat: ["desk", "table", "ticket"],
    window: ["door", "hall", "corner"],
    keys: ["cards", "notes", "forms"],
    train: ["bus", "line", "ride"],
    teacher: ["manager", "driver", "friend"],
    hotel: ["office", "station", "school"],
    meeting: ["class", "practice", "review"],
    before: ["after", "during", "around"],
    after: ["before", "during", "around"],
    in: ["on", "at", "by"],
    on: ["in", "at", "by"],
    the: ["a", "this", "that"],
    a: ["the", "this", "that"],
};

const LOW_FALLBACK_DISTRACTORS = [
    "desk", "later", "today", "bring", "table", "window", "class", "group", "door", "paper",
];

const MID_FALLBACK_DISTRACTORS = [
    "review", "office", "around", "meeting", "station", "manager", "during", "share", "team", "family",
];

const HIGH_FALLBACK_DISTRACTORS = [
    "coordination", "summary", "revised", "briefing", "draft", "proposal", "handoff", "follow-up", "timeline", "supporting",
];

function shuffleWithRandom<T>(items: T[], random: () => number) {
    const next = [...items];
    for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }
    return next;
}

export function tokenizeRebuildSentence(sentence: string) {
    return sentence
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

export function normalizeRebuildToken(token: string) {
    return token
        .toLowerCase()
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
}

export function isContentToken(token: string) {
    const normalized = normalizeRebuildToken(token);
    return normalized.length > 0 && !FUNCTION_WORDS.has(normalized);
}

export function getRebuildBandPosition(elo: number): RebuildBandPosition {
    if (elo <= 129) return "entry";
    if (elo <= 264) return "mid";
    if (elo <= 399) return "exit";
    if (elo <= 529) return "entry";
    if (elo <= 664) return "mid";
    if (elo <= 799) return "exit";
    if (elo <= 929) return "entry";
    if (elo <= 1064) return "mid";
    if (elo <= 1199) return "exit";
    if (elo <= 1329) return "entry";
    if (elo <= 1464) return "mid";
    if (elo <= 1599) return "exit";
    if (elo <= 1729) return "entry";
    if (elo <= 1864) return "mid";
    if (elo <= 1999) return "exit";
    if (elo <= 2129) return "entry";
    if (elo <= 2264) return "mid";
    if (elo <= 2399) return "exit";
    if (elo <= 2529) return "entry";
    if (elo <= 2664) return "mid";
    if (elo <= 2799) return "exit";
    if (elo <= 2929) return "entry";
    if (elo <= 3064) return "mid";
    return "exit";
}

export function getRebuildPracticeTier(elo: number): RebuildPracticeTier {
    const bandPosition = getRebuildBandPosition(elo);
    if (elo < 400) return { cefr: "A1", bandPosition, label: `A1 · ${bandPosition}` };
    if (elo < 800) return { cefr: "A2-", bandPosition, label: `A2- · ${bandPosition}` };
    if (elo < 1200) return { cefr: "A2+", bandPosition, label: `A2+ · ${bandPosition}` };
    if (elo < 1600) return { cefr: "B1", bandPosition, label: `B1 · ${bandPosition}` };
    if (elo < 2000) return { cefr: "B2", bandPosition, label: `B2 · ${bandPosition}` };
    if (elo < 2400) return { cefr: "C1", bandPosition, label: `C1 · ${bandPosition}` };
    if (elo < 2800) return { cefr: "C2", bandPosition, label: `C2 · ${bandPosition}` };
    return { cefr: "C2+", bandPosition, label: `C2+ · ${bandPosition}` };
}

export function getRebuildDistractorCount(elo: number, random: () => number = Math.random) {
    if (elo < 800) return random() < 0.5 ? 2 : 3;
    if (elo < 1600) return random() < 0.5 ? 3 : 4;
    const roll = random();
    if (roll < 0.34) return 4;
    if (roll < 0.67) return 5;
    return 6;
}

export function getRebuildFallbackDistractors(elo: number) {
    if (elo < 800) return LOW_FALLBACK_DISTRACTORS;
    if (elo < 1600) return MID_FALLBACK_DISTRACTORS;
    return HIGH_FALLBACK_DISTRACTORS;
}

export function collectRebuildDistractors(params: {
    answerTokens: string[];
    effectiveElo: number;
    relatedBankTokens: string[];
    random?: () => number;
}) {
    const { answerTokens, effectiveElo, relatedBankTokens, random = Math.random } = params;
    const desiredCount = getRebuildDistractorCount(effectiveElo, random);
    const answerNormalized = new Set(answerTokens.map(normalizeRebuildToken));
    const candidates: string[] = [];
    const seen = new Set<string>();

    for (const token of answerTokens) {
        const normalized = normalizeRebuildToken(token);
        const confusionWords = CONFUSION_MAP[normalized] ?? [];
        for (const confusion of confusionWords) {
            const confusionNormalized = normalizeRebuildToken(confusion);
            if (!confusionNormalized || answerNormalized.has(confusionNormalized) || seen.has(confusionNormalized)) continue;
            candidates.push(confusion);
            seen.add(confusionNormalized);
        }
    }

    for (const token of relatedBankTokens) {
        const normalized = normalizeRebuildToken(token);
        if (!normalized || answerNormalized.has(normalized) || seen.has(normalized)) continue;
        candidates.push(token);
        seen.add(normalized);
    }

    for (const token of getRebuildFallbackDistractors(effectiveElo)) {
        const normalized = normalizeRebuildToken(token);
        if (!normalized || answerNormalized.has(normalized) || seen.has(normalized)) continue;
        candidates.push(token);
        seen.add(normalized);
    }

    return shuffleWithRandom(candidates, random).slice(0, desiredCount);
}

export function buildRebuildTokenBank(params: {
    answerTokens: string[];
    distractorTokens: string[];
    random?: () => number;
}) {
    const { answerTokens, distractorTokens, random = Math.random } = params;
    return shuffleWithRandom([...answerTokens, ...distractorTokens], random);
}

function buildLcsPairs(answerTokens: string[], selectedTokens: string[]) {
    const answerNormalized = answerTokens.map((token) => normalizeRebuildToken(token));
    const selectedNormalized = selectedTokens.map((token) => normalizeRebuildToken(token));
    const answerLength = answerTokens.length;
    const selectedLength = selectedTokens.length;

    const dp = Array.from({ length: answerLength + 1 }, () => new Array(selectedLength + 1).fill(0));
    for (let answerIndex = answerLength - 1; answerIndex >= 0; answerIndex -= 1) {
        for (let selectedIndex = selectedLength - 1; selectedIndex >= 0; selectedIndex -= 1) {
            if (
                answerNormalized[answerIndex]
                && selectedNormalized[selectedIndex]
                && answerNormalized[answerIndex] === selectedNormalized[selectedIndex]
            ) {
                dp[answerIndex][selectedIndex] = dp[answerIndex + 1][selectedIndex + 1] + 1;
            } else {
                dp[answerIndex][selectedIndex] = Math.max(
                    dp[answerIndex + 1][selectedIndex],
                    dp[answerIndex][selectedIndex + 1],
                );
            }
        }
    }

    const pairs: Array<{ answerIndex: number; selectedIndex: number }> = [];
    let answerCursor = 0;
    let selectedCursor = 0;
    while (answerCursor < answerLength && selectedCursor < selectedLength) {
        if (
            answerNormalized[answerCursor]
            && selectedNormalized[selectedCursor]
            && answerNormalized[answerCursor] === selectedNormalized[selectedCursor]
        ) {
            pairs.push({ answerIndex: answerCursor, selectedIndex: selectedCursor });
            answerCursor += 1;
            selectedCursor += 1;
            continue;
        }

        if (dp[answerCursor + 1][selectedCursor] >= dp[answerCursor][selectedCursor + 1]) {
            answerCursor += 1;
        } else {
            selectedCursor += 1;
        }
    }

    return pairs;
}

export function evaluateRebuildSelection(params: {
    answerTokens: string[];
    selectedTokens: string[];
}) : RebuildEvaluationResult {
    const { answerTokens, selectedTokens } = params;
    const answerCounts = new Map<string, number>();

    for (const token of answerTokens) {
        const normalized = normalizeRebuildToken(token);
        answerCounts.set(normalized, (answerCounts.get(normalized) ?? 0) + 1);
    }

    const tokenFeedback: RebuildEvaluationToken[] = [];
    let correctCount = 0;
    let misplacedCount = 0;
    let distractorCount = 0;
    const matchedAnswerIndexes = new Set<number>();
    const consumedAnswerIndexes = new Set<number>();
    const lcsPairs = buildLcsPairs(answerTokens, selectedTokens);
    const exactBySelectedIndex = new Map<number, number>();
    lcsPairs.forEach(({ answerIndex, selectedIndex }) => {
        exactBySelectedIndex.set(selectedIndex, answerIndex);
        consumedAnswerIndexes.add(answerIndex);
    });

    selectedTokens.forEach((token, selectedIndex) => {
        const exactAnswerIndex = exactBySelectedIndex.get(selectedIndex);
        if (exactAnswerIndex !== undefined) {
            tokenFeedback.push({
                text: token,
                selectedIndex,
                expectedIndex: exactAnswerIndex,
                status: "correct",
            });
            matchedAnswerIndexes.add(exactAnswerIndex);
            correctCount += 1;
            const normalized = normalizeRebuildToken(token);
            answerCounts.set(normalized, Math.max(0, (answerCounts.get(normalized) ?? 1) - 1));
            return;
        }

        const normalized = normalizeRebuildToken(token);
        const matchingIndex = answerTokens.findIndex((answerToken, answerIndex) => (
            !consumedAnswerIndexes.has(answerIndex) && normalizeRebuildToken(answerToken) === normalized
        ));

        if (matchingIndex >= 0) {
            tokenFeedback.push({
                text: token,
                selectedIndex,
                expectedIndex: matchingIndex,
                status: "misplaced",
            });
            consumedAnswerIndexes.add(matchingIndex);
            matchedAnswerIndexes.add(matchingIndex);
            misplacedCount += 1;
            answerCounts.set(normalized, Math.max(0, (answerCounts.get(normalized) ?? 1) - 1));
            return;
        }

        tokenFeedback.push({
            text: token,
            selectedIndex,
            expectedIndex: -1,
            status: "distractor",
        });
        distractorCount += 1;
    });

    let missingCount = 0;
    answerTokens.forEach((token, expectedIndex) => {
        const normalized = normalizeRebuildToken(token);
        const remaining = answerCounts.get(normalized) ?? 0;
        if (remaining <= 0) return;
        answerCounts.set(normalized, remaining - 1);
        tokenFeedback.push({
            text: token,
            selectedIndex: null,
            expectedIndex,
            status: "missing",
        });
        missingCount += 1;
    });

    const contentIndexes = answerTokens
        .map((token, index) => (isContentToken(token) ? index : -1))
        .filter((index) => index >= 0);
    const contentHitCount = contentIndexes.filter((index) => matchedAnswerIndexes.has(index)).length;
    const tailStartIndex = Math.floor(answerTokens.length / 2);
    const tailContentIndexes = contentIndexes.filter((index) => index >= tailStartIndex);
    const tailHitCount = tailContentIndexes.filter((index) => matchedAnswerIndexes.has(index)).length;
    const selectedCount = selectedTokens.length;
    const completionRatio = answerTokens.length > 0
        ? Math.min(selectedCount, answerTokens.length) / answerTokens.length
        : 0;

    return {
        isCorrect: answerTokens.length === selectedTokens.length && correctCount === answerTokens.length,
        correctCount,
        misplacedCount,
        distractorCount,
        missingCount,
        totalCount: answerTokens.length,
        accuracyRatio: answerTokens.length > 0 ? correctCount / answerTokens.length : 0,
        completionRatio,
        misplacementRatio: answerTokens.length > 0 ? misplacedCount / answerTokens.length : 0,
        distractorPickRatio: selectedCount > 0 ? distractorCount / selectedCount : 0,
        contentWordHitRate: contentIndexes.length > 0 ? contentHitCount / contentIndexes.length : 1,
        tailCoverage: tailContentIndexes.length > 0 ? tailHitCount / tailContentIndexes.length : 1,
        userSentence: selectedTokens.join(" "),
        tokenFeedback,
    };
}

export function buildRebuildDisplaySentence(params: {
    answerTokens: string[];
    evaluation: RebuildEvaluationResult;
}): RebuildDisplaySentence {
    const { answerTokens, evaluation } = params;
    const selectedFeedback = evaluation.tokenFeedback
        .filter((token) => token.selectedIndex !== null)
        .sort((left, right) => (left.selectedIndex ?? 0) - (right.selectedIndex ?? 0));
    const feedbackByExpectedIndex = new Map<number, RebuildEvaluationToken>();
    selectedFeedback.forEach((token) => {
        if (typeof token.expectedIndex === "number" && token.expectedIndex >= 0) {
            feedbackByExpectedIndex.set(token.expectedIndex, token);
        }
    });

    const tokens: RebuildDisplayToken[] = answerTokens.map((answerToken, index) => {
        const feedbackAtIndex = feedbackByExpectedIndex.get(index);
        if (!feedbackAtIndex) {
            return {
                text: answerToken,
                kind: "inserted",
            };
        }

        if (feedbackAtIndex.status === "correct") {
            return {
                text: answerToken,
                kind: "correct",
            };
        }

        if (feedbackAtIndex.status === "misplaced") {
            return {
                text: answerToken,
                kind: "misplaced",
                originalText: feedbackAtIndex.text,
            };
        }

        return {
            text: answerToken,
            kind: "replacement",
            originalText: feedbackAtIndex.text,
        };
    });

    const extraTokens = selectedFeedback
        .filter((token) => (token.expectedIndex ?? -1) < 0)
        .map((token) => ({
            text: token.text,
            kind: "removed" as const,
        }));

    return {
        tokens,
        extraTokens,
    };
}

export function getRebuildSoftTimeLimitMs(answerTokenCount: number, effectiveElo: number) {
    if (effectiveElo < 800) return 24000 + (answerTokenCount * 4000);
    if (effectiveElo < 1600) return 30000 + (answerTokenCount * 4500);
    return 38000 + (answerTokenCount * 5000);
}

export function getRebuildSelfEvaluationDelta(evaluation: RebuildSelfEvaluation) {
    if (evaluation === "easy") return 22;
    if (evaluation === "hard") return -22;
    return 0;
}

export function getRebuildSystemDelta(signals: RebuildAttemptSignals) {
    let delta = 0;
    if (signals.skipped) return -48;

    if (signals.accuracyRatio >= 0.92) delta += 14;
    else if (signals.accuracyRatio >= 0.8) delta += 7;
    else if (signals.accuracyRatio < 0.35) delta -= 18;
    else if (signals.accuracyRatio < 0.55) delta -= 8;

    if (signals.completionRatio < 0.5) delta -= 14;
    else if (signals.completionRatio < 0.75) delta -= 6;

    if (signals.misplacementRatio >= 0.5) delta -= 12;
    else if (signals.misplacementRatio >= 0.3) delta -= 6;

    if (signals.distractorPickRatio >= 0.4) delta -= 14;
    else if (signals.distractorPickRatio >= 0.2) delta -= 8;

    if (signals.contentWordHitRate >= 0.85) delta += 8;
    else if (signals.contentWordHitRate < 0.35) delta -= 18;
    else if (signals.contentWordHitRate < 0.6) delta -= 10;

    if (signals.tailCoverage < 0.35) delta -= 14;
    else if (signals.tailCoverage < 0.6) delta -= 8;

    if (signals.replayCount >= 7) delta -= 10;
    else if (signals.replayCount >= 4) delta -= 5;

    if (signals.tokenEditCount >= 8) delta -= 10;
    else if (signals.tokenEditCount >= 4) delta -= 5;

    if (signals.exceededSoftLimit) delta -= 5;
    return delta;
}

export function clampRebuildDifficultyDelta(delta: number) {
    return Math.max(-65, Math.min(48, delta));
}

export function getRebuildSystemAssessment(delta: number): RebuildSystemAssessment {
    if (delta >= 18) return "too_easy";
    if (delta <= -18) return "too_hard";
    return "matched";
}

export function getRebuildSystemAssessmentLabel(assessment: RebuildSystemAssessment) {
    if (assessment === "too_easy") return "偏简单";
    if (assessment === "too_hard") return "偏难";
    return "刚好";
}
