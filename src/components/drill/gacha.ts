export type GachaTier = "normal" | "high";
export type GachaRewardType =
    | "capsule"
    | "hint_ticket"
    | "vocab_ticket"
    | "audio_ticket"
    | "refresh_ticket"
    | "coins";

export type GachaInventoryRewardType = Exclude<GachaRewardType, "coins">;

export interface GachaCard {
    id: string;
    tier: GachaTier;
    rewardType: GachaRewardType;
    amount: number;
    revealed: boolean;
    selected: boolean;
}

export interface GachaRewardDefinition {
    tier: GachaTier;
    rewardType: GachaRewardType;
    amount: number;
    weight: number;
}

type GachaEconomyFx =
    | {
        kind: "coin_gain";
        amount: number;
        message: string;
        source: "reward";
    }
    | {
        kind: "item_purchase";
        itemId: GachaInventoryRewardType;
        amount: number;
        message: string;
        source: "reward";
    };

export interface GachaRewardEconomy {
    coinsDelta: number;
    itemDelta: Partial<Record<GachaInventoryRewardType, number>>;
    fx: GachaEconomyFx;
}

export const NORMAL_GACHA_REWARDS: GachaRewardDefinition[] = [
    { tier: "normal", rewardType: "capsule", amount: 1, weight: 25 },
    { tier: "normal", rewardType: "vocab_ticket", amount: 1, weight: 25 },
    { tier: "normal", rewardType: "audio_ticket", amount: 1, weight: 20 },
    { tier: "normal", rewardType: "coins", amount: 10, weight: 20 },
    { tier: "normal", rewardType: "coins", amount: 20, weight: 10 },
];

export const HIGH_VALUE_GACHA_REWARDS: GachaRewardDefinition[] = [
    { tier: "high", rewardType: "hint_ticket", amount: 1, weight: 25 },
    { tier: "high", rewardType: "refresh_ticket", amount: 1, weight: 20 },
    { tier: "high", rewardType: "audio_ticket", amount: 2, weight: 20 },
    { tier: "high", rewardType: "coins", amount: 50, weight: 30 },
    { tier: "high", rewardType: "coins", amount: 100, weight: 5 },
];

function pickWeightedReward(pool: GachaRewardDefinition[], rng: () => number) {
    const totalWeight = pool.reduce((sum, reward) => sum + reward.weight, 0);
    const threshold = rng() * totalWeight;
    let cursor = 0;

    for (const reward of pool) {
        cursor += reward.weight;
        if (threshold < cursor) {
            return reward;
        }
    }

    return pool[pool.length - 1]!;
}

function shuffleCards<T>(items: T[], rng: () => number) {
    const next = [...items];
    for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(rng() * (index + 1));
        [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
    }
    return next;
}

function createCard(definition: GachaRewardDefinition, index: number): GachaCard {
    return {
        id: `gacha-card-${index}-${definition.tier}-${definition.rewardType}-${definition.amount}`,
        tier: definition.tier,
        rewardType: definition.rewardType,
        amount: definition.amount,
        revealed: false,
        selected: false,
    };
}

export function shouldTriggerGacha({
    mode,
    score,
    learningSession,
    roll,
}: {
    mode: "translation" | "listening";
    score: number;
    learningSession: boolean;
    roll: number;
}) {
    return mode === "translation" && score > 8 && !learningSession && roll < 0.3;
}

export function buildGachaPack(rng: () => number = Math.random) {
    const highCard = createCard(pickWeightedReward(HIGH_VALUE_GACHA_REWARDS, rng), 0);
    const normalCards = Array.from({ length: 4 }, (_, index) =>
        createCard(pickWeightedReward(NORMAL_GACHA_REWARDS, rng), index + 1),
    );

    return shuffleCards([highCard, ...normalCards], rng);
}

export function isHighValueGachaCard(card: GachaCard) {
    return card.tier === "high";
}

function getRewardLabel(card: GachaCard) {
    if (card.rewardType === "coins") {
        return `${card.amount} 星光币`;
    }

    const rewardLabels: Record<GachaInventoryRewardType, string> = {
        capsule: "灵感胶囊",
        hint_ticket: "Hint 道具",
        vocab_ticket: "关键词提示券",
        audio_ticket: "朗读券",
        refresh_ticket: "刷新卡",
    };

    return `${card.amount} 个 ${rewardLabels[card.rewardType]}`;
}

export function getGachaRewardEconomy(card: GachaCard): GachaRewardEconomy {
    if (card.rewardType === "coins") {
        return {
            coinsDelta: card.amount,
            itemDelta: {},
            fx: {
                kind: "coin_gain",
                amount: card.amount,
                message: `抽卡获得 ${getRewardLabel(card)}`,
                source: "reward",
            },
        };
    }

    return {
        coinsDelta: 0,
        itemDelta: { [card.rewardType]: card.amount },
        fx: {
            kind: "item_purchase",
            itemId: card.rewardType,
            amount: card.amount,
            message: `抽卡获得 ${getRewardLabel(card)}`,
            source: "reward",
        },
    };
}
