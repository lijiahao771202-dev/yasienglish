import { describe, expect, it } from "vitest";

import {
    buildDrillGenerationRequestBody,
    canConsumePrefetchedDrill,
    isQuickMatchTopicResetBoundary,
    resolveDrillScenarioPlan,
    resolveListeningGenerationEvent,
    rollListeningPrefetchBossType,
} from "./drill-generation-plan";

function createRandomSequence(...values: number[]) {
    let index = 0;
    return () => {
        const value = values[index];
        index += 1;
        return value ?? 0;
    };
}

describe("drill-generation-plan", () => {
    it("rotates to the random translation pool at the quick match boundary", () => {
        const plan = resolveDrillScenarioPlan({
            articleTitle: "Old topic",
            currentTopic: "Old topic",
            currentTopicPrompt: "old prompt",
            elo: 1600,
            generatedDrillCount: 3,
            isContinuous: true,
            isQuickMatch: true,
            mode: "translation",
            topicResetInterval: 3,
            translationVariant: "sentence",
        });

        expect(plan.shouldRotateTopic).toBe(true);
        expect(plan.targetScenario.topicLine).not.toBe("Old topic");
        expect(plan.nextTopicPrompt).toBe(plan.targetScenario.topicPrompt);
    });

    it("keeps the active topic prompt when quick match stays on the same topic", () => {
        const plan = resolveDrillScenarioPlan({
            articleTitle: "Current topic",
            currentTopic: "Current topic",
            currentTopicPrompt: "keep me",
            elo: 1400,
            generatedDrillCount: 2,
            isContinuous: true,
            isQuickMatch: true,
            mode: "translation",
            topicResetInterval: 3,
            translationVariant: "sentence",
        });

        expect(plan.shouldRotateTopic).toBe(false);
        expect(plan.targetTopic).toBe("Current topic");
        expect(plan.nextTopicPrompt).toBe("keep me");
    });

    it("rolls a listening prefetch boss only inside the 2 percent window", () => {
        expect(
            rollListeningPrefetchBossType({
                isListeningFamilyMode: true,
                randomFn: createRandomSequence(0.019, 0.9),
            }),
        ).toBe("reaper");

        expect(
            rollListeningPrefetchBossType({
                isListeningFamilyMode: true,
                randomFn: createRandomSequence(0.2, 0.1),
            }),
        ).toBeUndefined();
    });

    it("resolves a gamble event when the listening roll lands in the gamble band", () => {
        const result = resolveListeningGenerationEvent({
            bossState: { active: false, introAck: false, type: "blind" },
            gambleState: { active: false, introAck: false, wager: null, doubleDownCount: 0 },
            isListeningFamilyMode: true,
            randomFn: createRandomSequence(0.05),
        });

        expect(result.nextBossType).toBeUndefined();
        expect(result.pendingBossState).toBeNull();
        expect(result.pendingGambleState).toEqual({
            active: true,
            introAck: false,
            wager: null,
            doubleDownCount: 0,
        });
    });

    it("can force a roulette boss state without consuming prefetched drills", () => {
        const result = resolveListeningGenerationEvent({
            bossState: { active: false, introAck: false, type: "blind" },
            gambleState: { active: false, introAck: false, wager: null, doubleDownCount: 0 },
            isListeningFamilyMode: true,
            overrideBossType: "roulette_execution",
        });

        expect(result.nextBossType).toBe("roulette_execution");
        expect(result.pendingBossState?.introAck).toBe(true);
        expect(result.pendingGambleState).toBeNull();
    });

    it("builds the next-drill request payload with translation metadata intact", () => {
        const body = buildDrillGenerationRequestBody({
            articleContent: "source",
            difficulty: "Level 4",
            eloRating: 1361,
            injectedVocabulary: ["proposal - 提案"],
            mode: "translation",
            segmentCount: 3,
            sourceMode: "ai",
            timestamp: 123,
            topicLine: "Topic line",
            topicPrompt: "Topic prompt",
            translationVariant: "passage",
        });

        expect(body).toEqual({
            articleTitle: "Topic line",
            topicPrompt: "Topic prompt",
            articleContent: "source",
            difficulty: "Level 4",
            injectedVocabulary: ["proposal - 提案"],
            eloRating: 1361,
            mode: "translation",
            sourceMode: "ai",
            excludeBankIds: undefined,
            rebuildVariant: undefined,
            translationVariant: "passage",
            segmentCount: 3,
            bossType: undefined,
            _t: 123,
        });
    });

    it("checks prefetched drill compatibility before instant consumption", () => {
        expect(
            canConsumePrefetchedDrill({
                mode: "translation",
                prefetchedDrillData: { mode: "translation", sourceMode: "ai" },
                sourceMode: "ai",
            }),
        ).toBe(true);

        expect(
            canConsumePrefetchedDrill({
                mode: "translation",
                overrideBossType: "blind",
                prefetchedDrillData: { mode: "translation", sourceMode: "ai" },
                sourceMode: "ai",
            }),
        ).toBe(false);
    });

    it("matches the quick match topic reset helper used by generation and prefetch", () => {
        expect(
            isQuickMatchTopicResetBoundary({
                generatedDrillCount: 3,
                isQuickMatch: true,
                topicResetInterval: 3,
            }),
        ).toBe(true);

        expect(
            isQuickMatchTopicResetBoundary({
                generatedDrillCount: 2,
                isQuickMatch: true,
                topicResetInterval: 3,
            }),
        ).toBe(false);
    });
});
