import { countWords } from "@/lib/translationDifficulty";
import {
    buildRebuildTokenBank,
    collectRebuildDistractors,
    getRebuildBandPosition,
    getRebuildPracticeTier,
    tokenizeRebuildSentence,
} from "@/lib/rebuild-mode";
import { LOW_BAND_LISTENING_DRILLS } from "./listening-drill-bank-low";
import { HIGH_BAND_LISTENING_DRILLS } from "./listening-drill-bank-high";
import { MID_HIGH_LISTENING_DRILLS } from "./listening-drill-bank-mid-high";

export type DrillSourceMode = "ai" | "bank";
export type ListeningMemoryLoad = "low" | "medium" | "high";
export type ListeningNaturalness = "low" | "medium" | "high";
export type ListeningReducedFormsPresence = "minimal" | "some" | "frequent";
export type ListeningDifficultyStatus = "TOO_EASY" | "TOO_HARD" | "MATCHED";
export type ListeningCefr = "A1" | "A2-" | "A2+" | "B1" | "B2" | "C1" | "C2" | "C2+";
export type ListeningBandPosition = "entry" | "mid" | "exit";
export type ListeningReviewStatus = "curated" | "draft";

export type ListeningFeatureTarget = {
    min: number;
    max: number;
    tier: string;
    cefr: ListeningCefr;
    clauseMax: number;
    memoryLoad: ListeningMemoryLoad;
    spokenNaturalness: ListeningNaturalness;
    reducedFormsPresence: ListeningReducedFormsPresence;
    trainingFocus: string;
};

export type ListeningBankItem = {
    id: string;
    status: "active" | "draft";
    reviewStatus?: ListeningReviewStatus;
    mode: "listening";
    chinese: string;
    reference_english: string;
    target_english_vocab: string[];
    theme: string;
    scene: string;
    tags: string[];
    eloMin: number;
    eloMax: number;
    bandPosition?: ListeningBandPosition;
    cefr: ListeningCefr;
    clauseCount: number;
    memoryLoad: ListeningMemoryLoad;
    spokenNaturalness: ListeningNaturalness;
    reducedFormsPresence: ListeningReducedFormsPresence;
    qualityScore: number;
};

export type ListeningBankValidation = {
    actualWordCount: number;
    status: ListeningDifficultyStatus;
    isValid: boolean;
    issues: string[];
};

export type RebuildDrillMeta = {
    effectiveElo: number;
    bandPosition: ListeningBandPosition | null;
    answerTokens: string[];
    tokenBank: string[];
    distractorTokens: string[];
    theme: string;
    scene: string;
    feedbackStyle: "strong";
};

const memoryRank: Record<ListeningMemoryLoad, number> = { low: 1, medium: 2, high: 3 };
const naturalnessRank: Record<ListeningNaturalness, number> = { low: 1, medium: 2, high: 3 };
const reducedFormsRank: Record<ListeningReducedFormsPresence, number> = { minimal: 1, some: 2, frequent: 3 };

export function getListeningDifficultyExpectation(elo: number): ListeningFeatureTarget {
    if (elo < 400) return { min: 5, max: 8, tier: "新手", cefr: "A1", clauseMax: 0, memoryLoad: "low", spokenNaturalness: "low", reducedFormsPresence: "minimal", trainingFocus: "短句复现" };
    if (elo < 800) return { min: 8, max: 12, tier: "青铜", cefr: "A2-", clauseMax: 0, memoryLoad: "low", spokenNaturalness: "medium", reducedFormsPresence: "minimal", trainingFocus: "基础口语" };
    if (elo < 1200) return { min: 8, max: 14, tier: "白银", cefr: "A2+", clauseMax: 1, memoryLoad: "medium", spokenNaturalness: "medium", reducedFormsPresence: "some", trainingFocus: "基础连贯表达" };
    if (elo < 1600) return { min: 12, max: 18, tier: "黄金", cefr: "B1", clauseMax: 1, memoryLoad: "medium", spokenNaturalness: "medium", reducedFormsPresence: "some", trainingFocus: "自然语流" };
    if (elo < 2000) return { min: 14, max: 22, tier: "铂金", cefr: "B2", clauseMax: 2, memoryLoad: "high", spokenNaturalness: "high", reducedFormsPresence: "frequent", trainingFocus: "高信息密度" };
    if (elo < 2400) return { min: 16, max: 26, tier: "钻石", cefr: "C1", clauseMax: 2, memoryLoad: "high", spokenNaturalness: "high", reducedFormsPresence: "frequent", trainingFocus: "高自然度口语" };
    if (elo < 2800) return { min: 20, max: 32, tier: "大师", cefr: "C2", clauseMax: 3, memoryLoad: "high", spokenNaturalness: "high", reducedFormsPresence: "frequent", trainingFocus: "复杂口语复现" };
    return { min: 20, max: 32, tier: "王者", cefr: "C2+", clauseMax: 3, memoryLoad: "high", spokenNaturalness: "high", reducedFormsPresence: "frequent", trainingFocus: "高压自然口语" };
}

export function getListeningBandPosition(elo: number): ListeningBandPosition | null {
    if (elo >= 0 && elo <= 129) return "entry";
    if (elo >= 130 && elo <= 264) return "mid";
    if (elo >= 265 && elo <= 399) return "exit";
    if (elo >= 400 && elo <= 529) return "entry";
    if (elo >= 530 && elo <= 664) return "mid";
    if (elo >= 665 && elo <= 799) return "exit";
    if (elo >= 800 && elo <= 929) return "entry";
    if (elo >= 930 && elo <= 1064) return "mid";
    if (elo >= 1065 && elo <= 1199) return "exit";
    if (elo >= 1200 && elo <= 1329) return "entry";
    if (elo >= 1330 && elo <= 1464) return "mid";
    if (elo >= 1465 && elo <= 1599) return "exit";
    if (elo >= 1600 && elo <= 1729) return "entry";
    if (elo >= 1730 && elo <= 1864) return "mid";
    if (elo >= 1865 && elo <= 1999) return "exit";
    if (elo >= 2000 && elo <= 2129) return "entry";
    if (elo >= 2130 && elo <= 2264) return "mid";
    if (elo >= 2265 && elo <= 2399) return "exit";
    if (elo >= 2400 && elo <= 2529) return "entry";
    if (elo >= 2530 && elo <= 2664) return "mid";
    if (elo >= 2665 && elo <= 2799) return "exit";
    if (elo >= 2800 && elo <= 2929) return "entry";
    if (elo >= 2930 && elo <= 3064) return "mid";
    if (elo >= 3065) return "exit";
    return null;
}

export const LISTENING_DRILL_BANK: ListeningBankItem[] = [
    ...LOW_BAND_LISTENING_DRILLS,
    ...MID_HIGH_LISTENING_DRILLS,
    ...HIGH_BAND_LISTENING_DRILLS,
];

export function validateListeningBankItem(item: ListeningBankItem, elo: number): ListeningBankValidation {
    const target = getListeningDifficultyExpectation(elo);
    const actualWordCount = countWords(item.reference_english);
    const issues: string[] = [];

    let status: ListeningDifficultyStatus = "MATCHED";
    if (actualWordCount < target.min) {
        status = "TOO_EASY";
        issues.push(`word count ${actualWordCount} is below ${target.min}`);
    } else if (actualWordCount > target.max) {
        status = "TOO_HARD";
        issues.push(`word count ${actualWordCount} is above ${target.max}`);
    }

    if (item.cefr !== target.cefr) {
        status = status === "TOO_EASY" ? status : "TOO_HARD";
        issues.push(`cefr ${item.cefr} does not match ${target.cefr}`);
    }

    if (item.clauseCount > target.clauseMax) {
        status = status === "TOO_EASY" ? status : "TOO_HARD";
        issues.push(`clause count ${item.clauseCount} exceeds ${target.clauseMax}`);
    }

    if (memoryRank[item.memoryLoad] > memoryRank[target.memoryLoad]) {
        status = status === "TOO_EASY" ? status : "TOO_HARD";
        issues.push(`memory load ${item.memoryLoad} exceeds ${target.memoryLoad}`);
    }

    if (naturalnessRank[item.spokenNaturalness] > naturalnessRank[target.spokenNaturalness]) {
        status = status === "TOO_EASY" ? status : "TOO_HARD";
        issues.push(`spoken naturalness ${item.spokenNaturalness} exceeds ${target.spokenNaturalness}`);
    }

    if (reducedFormsRank[item.reducedFormsPresence] > reducedFormsRank[target.reducedFormsPresence]) {
        status = status === "TOO_EASY" ? status : "TOO_HARD";
        issues.push(`reduced forms ${item.reducedFormsPresence} exceeds ${target.reducedFormsPresence}`);
    }

    return {
        actualWordCount,
        status,
        isValid: issues.length === 0,
        issues,
    };
}

export function selectListeningBankItem(params: {
    elo: number;
    excludeIds?: string[];
    random?: () => number;
}) {
    const { elo, excludeIds = [], random = Math.random } = params;
    const targetBandPosition = getListeningBandPosition(elo);
    const eligible = LISTENING_DRILL_BANK.filter((item) => {
        if (item.status !== "active") return false;
        if (item.reviewStatus === "draft") return false;
        if (item.eloMin > elo || item.eloMax < elo) return false;
        return validateListeningBankItem(item, elo).isValid;
    });

    const pool = eligible.filter((item) => !excludeIds.includes(item.id));
    const initialCandidates = pool.length > 0 ? pool : eligible;
    const curatedCandidates = initialCandidates.filter((item) => item.reviewStatus !== "draft");
    const exactCuratedCandidates = targetBandPosition
        ? curatedCandidates.filter((item) => item.bandPosition === targetBandPosition)
        : [];
    const exactBandPositionCandidates = targetBandPosition
        ? initialCandidates.filter((item) => item.bandPosition === targetBandPosition)
        : [];
    const candidates = exactCuratedCandidates.length > 0
        ? exactCuratedCandidates
        : exactBandPositionCandidates.length > 0
            ? exactBandPositionCandidates
            : curatedCandidates.length > 0
                ? curatedCandidates
                : initialCandidates;
    if (candidates.length === 0) return null;

    const totalWeight = candidates.reduce((sum, item) => sum + item.qualityScore, 0);
    let cursor = random() * totalWeight;
    for (const item of candidates) {
        cursor -= item.qualityScore;
        if (cursor <= 0) {
            return item;
        }
    }

    return candidates[candidates.length - 1] ?? null;
}

export function buildListeningBankDrill(item: ListeningBankItem, elo: number) {
    const target = getListeningDifficultyExpectation(elo);
    const validation = validateListeningBankItem(item, elo);

    return {
        chinese: item.chinese,
        target_english_vocab: item.target_english_vocab,
        reference_english: item.reference_english,
        _topicMeta: {
            topic: item.theme,
            subTopic: item.scene,
            isScenario: true,
        },
        _sourceMeta: {
            sourceMode: "bank" as DrillSourceMode,
            bankItemId: item.id,
            bandPosition: item.bandPosition ?? null,
            reviewStatus: item.reviewStatus ?? "curated",
        },
        _difficultyMeta: {
            requestedElo: elo,
            tier: target.tier,
            cefr: target.cefr,
            expectedWordRange: { min: target.min, max: target.max },
            actualWordCount: validation.actualWordCount,
            isValid: validation.isValid,
            status: validation.status,
            aiSelfReport: null,
            listeningFeatures: {
                memoryLoad: target.memoryLoad,
                spokenNaturalness: target.spokenNaturalness,
                reducedFormsPresence: target.reducedFormsPresence,
                clauseMax: target.clauseMax,
                trainingFocus: target.trainingFocus,
                downgraded: false,
            },
            listeningValidation: {
                reportedCefr: item.cefr,
                issues: validation.issues,
                featureReport: {
                    wordCount: validation.actualWordCount,
                    clauseCount: item.clauseCount,
                    memoryLoad: item.memoryLoad,
                    spokenNaturalness: item.spokenNaturalness,
                    reducedFormsPresence: item.reducedFormsPresence,
                },
            },
        },
    };
}

function collectRelatedBankTokens(params: {
    item: ListeningBankItem;
}) {
    const { item } = params;
    return LISTENING_DRILL_BANK
        .filter((candidate) => (
            candidate.id !== item.id
            && candidate.status === "active"
            && candidate.theme === item.theme
            && candidate.cefr === item.cefr
        ))
        .flatMap((candidate) => tokenizeRebuildSentence(candidate.reference_english));
}

export function buildRebuildDrill(item: ListeningBankItem, effectiveElo: number) {
    const listeningDrill = buildListeningBankDrill(item, effectiveElo);
    const answerTokens = tokenizeRebuildSentence(item.reference_english);
    const distractorTokens = collectRebuildDistractors({
        answerTokens,
        effectiveElo,
        relatedBankTokens: collectRelatedBankTokens({ item }),
    });
    const tokenBank = buildRebuildTokenBank({
        answerTokens,
        distractorTokens,
    });
    const practiceTier = getRebuildPracticeTier(effectiveElo);

    return {
        ...listeningDrill,
        _difficultyMeta: {
            ...listeningDrill._difficultyMeta,
            requestedElo: effectiveElo,
            cefr: practiceTier.cefr,
        },
        _sourceMeta: {
            ...listeningDrill._sourceMeta,
            bandPosition: item.bandPosition ?? getRebuildBandPosition(effectiveElo),
        },
        _rebuildMeta: {
            effectiveElo,
            bandPosition: item.bandPosition ?? getRebuildBandPosition(effectiveElo),
            answerTokens,
            tokenBank,
            distractorTokens,
            theme: item.theme,
            scene: item.scene,
            feedbackStyle: "strong",
        } satisfies RebuildDrillMeta,
    };
}
