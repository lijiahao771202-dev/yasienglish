export type ListeningEloBand = "low" | "mid" | "high";

export interface ListeningEloBreakdown {
    difficultyElo: number;
    expectedScore: number;
    actualScore: number;
    kFactor: number;
    streakBonus: boolean;
    baseChange: number;
    bonusChange: number;
    band: ListeningEloBand;
}

export interface ListeningEloResult {
    total: number;
    breakdown: ListeningEloBreakdown;
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

export function getListeningEloBand(elo: number): ListeningEloBand {
    if (elo < 1000) return "low";
    if (elo < 1800) return "mid";
    return "high";
}

export function normalizeListeningScore(score: number, elo: number) {
    const band = getListeningEloBand(elo);

    if (band === "low") return clamp((score - 2.0) / 8.0, 0, 1);
    if (band === "mid") return clamp((score - 2.6) / 7.4, 0, 1);
    return clamp((score - 3.2) / 6.8, 0, 1);
}

export function getListeningKFactor(elo: number) {
    const band = getListeningEloBand(elo);
    if (band === "low") return 28;
    if (band === "mid") return 20;
    return 14;
}

export function calculateListeningElo(playerElo: number, difficultyElo: number, actualScore: number, streak: number): ListeningEloResult {
    const band = getListeningEloBand(playerElo);
    const expectedScore = 1 / (1 + Math.pow(10, (difficultyElo - playerElo) / 400));
    const normalizedScore = normalizeListeningScore(actualScore, playerElo);
    const kFactor = getListeningKFactor(playerElo);
    const baseChange = Math.round(kFactor * (normalizedScore - expectedScore));
    const streakBonus = streak >= 3 && baseChange > 0;
    const total = baseChange + (streakBonus ? 1 : 0);

    return {
        total,
        breakdown: {
            difficultyElo,
            expectedScore,
            actualScore: normalizedScore,
            kFactor,
            streakBonus,
            baseChange,
            bonusChange: total - baseChange,
            band,
        },
    };
}
