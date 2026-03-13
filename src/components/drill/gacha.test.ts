import { describe, expect, it } from "vitest";

import {
    buildGachaPack,
    getGachaRewardEconomy,
    isHighValueGachaCard,
    shouldTriggerGacha,
    type GachaCard,
} from "./gacha";

function createSequenceRng(values: number[]) {
    let index = 0;
    return () => {
        const value = values[index];
        index += 1;
        return value ?? 0;
    };
}

describe("shouldTriggerGacha", () => {
    it("triggers only for translation drills above 8.0 with a passing roll", () => {
        expect(
            shouldTriggerGacha({
                mode: "translation",
                score: 8.1,
                learningSession: false,
                roll: 0.29,
            }),
        ).toBe(true);
    });

    it("does not trigger for score 8.0 or lower, non-translation, or learning sessions", () => {
        expect(
            shouldTriggerGacha({
                mode: "translation",
                score: 8,
                learningSession: false,
                roll: 0,
            }),
        ).toBe(false);
        expect(
            shouldTriggerGacha({
                mode: "listening",
                score: 9.5,
                learningSession: false,
                roll: 0,
            }),
        ).toBe(false);
        expect(
            shouldTriggerGacha({
                mode: "translation",
                score: 9.5,
                learningSession: true,
                roll: 0,
            }),
        ).toBe(false);
        expect(
            shouldTriggerGacha({
                mode: "translation",
                score: 9.5,
                learningSession: false,
                roll: 0.3,
            }),
        ).toBe(false);
    });
});

describe("buildGachaPack", () => {
    it("builds five cards with exactly one high-value card and four normal cards", () => {
        const cards = buildGachaPack(createSequenceRng([0.05, 0.24, 0.49, 0.69, 0.95, 0.1, 0.2, 0.3, 0.4]));

        expect(cards).toHaveLength(5);
        expect(cards.filter(isHighValueGachaCard)).toHaveLength(1);
        expect(cards.filter((card) => card.tier === "normal")).toHaveLength(4);
        expect(cards.every((card) => card.revealed === false && card.selected === false)).toBe(true);
    });

    it("only produces configured normal and high-value rewards", () => {
        const cards = buildGachaPack(createSequenceRng([0.99, 0.99, 0.99, 0.99, 0.99, 0, 0, 0, 0]));

        expect(cards.some((card) => card.tier === "high" && card.rewardType === "coins" && card.amount === 100)).toBe(true);
        expect(
            cards
                .filter((card) => card.tier === "normal")
                .every((card) => ["capsule", "vocab_ticket", "audio_ticket", "coins"].includes(card.rewardType)),
        ).toBe(true);
    });
});

describe("getGachaRewardEconomy", () => {
    it("maps coin rewards to coin deltas and reward FX", () => {
        const result = getGachaRewardEconomy({
            id: "coin",
            tier: "high",
            rewardType: "coins",
            amount: 50,
            revealed: true,
            selected: true,
        });

        expect(result).toEqual({
            coinsDelta: 50,
            itemDelta: {},
            fx: {
                kind: "coin_gain",
                amount: 50,
                message: "抽卡获得 50 星光币",
                source: "reward",
            },
        });
    });

    it("maps item rewards to inventory deltas without coin gain", () => {
        const result = getGachaRewardEconomy({
            id: "hint",
            tier: "high",
            rewardType: "hint_ticket",
            amount: 1,
            revealed: true,
            selected: true,
        });

        expect(result).toEqual({
            coinsDelta: 0,
            itemDelta: { hint_ticket: 1 },
            fx: {
                kind: "item_purchase",
                itemId: "hint_ticket",
                amount: 1,
                message: "抽卡获得 1 个 Hint 道具",
                source: "reward",
            },
        });
    });
});

describe("isHighValueGachaCard", () => {
    it("recognizes high-value cards by tier", () => {
        const highCard: GachaCard = {
            id: "high",
            tier: "high",
            rewardType: "refresh_ticket",
            amount: 1,
            revealed: false,
            selected: false,
        };
        const normalCard: GachaCard = {
            id: "normal",
            tier: "normal",
            rewardType: "capsule",
            amount: 1,
            revealed: false,
            selected: false,
        };

        expect(isHighValueGachaCard(highCard)).toBe(true);
        expect(isHighValueGachaCard(normalCard)).toBe(false);
    });
});
