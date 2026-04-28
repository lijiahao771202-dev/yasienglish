import { afterEach, describe, expect, it, vi } from "vitest";

import {
    RANDOM_TRANSLATION_SCENARIO_TOPIC,
    getAvailableTranslationSlotItems,
    getTranslationQuickMatchPoolSize,
    getTranslationQuickMatchTotalCombinationCount,
    pickTranslationQuickMatchTopic,
    resolveTranslationScenarioContext,
} from "./translation-quickmatch-topics";

function createLocalStorageMock() {
    const store = new Map<string, string>();

    return {
        getItem(key: string) {
            return store.has(key) ? store.get(key)! : null;
        },
        setItem(key: string, value: string) {
            store.set(key, value);
        },
        removeItem(key: string) {
            store.delete(key);
        },
        clear() {
            store.clear();
        },
    };
}

describe("translation quickmatch topics", () => {
    const localStorageMock = createLocalStorageMock();

    vi.stubGlobal("window", { localStorage: localStorageMock });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorageMock.clear();
    });

    it("builds more than ten thousand compatible theme-scene-style combinations overall", () => {
        expect(getTranslationQuickMatchTotalCombinationCount()).toBeGreaterThanOrEqual(10000);
    });

    it("keeps low-elo style options grounded", () => {
        const slotItems = getAvailableTranslationSlotItems(600);

        expect(slotItems.col1.length).toBeGreaterThan(0);
        expect(slotItems.col2.length).toBeGreaterThan(100);
        expect(slotItems.col3).toContain("日常叙述");
        expect(slotItems.col3).toContain("消息沟通");
        expect(slotItems.col3).not.toContain("议论段落");
    });

    it("produces a large mid-elo pool for diversity", () => {
        expect(getTranslationQuickMatchPoolSize(1600)).toBeGreaterThan(1500);
    });

    it("avoids recently used themes, scenes, and styles when alternatives exist", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);

        const first = pickTranslationQuickMatchTopic(1600);
        window.localStorage.setItem("transl.quickmatch.recent.themes.v2", JSON.stringify([first.domainId]));
        window.localStorage.setItem("transl.quickmatch.recent.scenes.v2", JSON.stringify([first.scenarioId]));
        window.localStorage.setItem("transl.quickmatch.recent.styles.v2", JSON.stringify([first.genreId]));

        const second = pickTranslationQuickMatchTopic(1600);

        expect(second.domainId).not.toBe(first.domainId);
        expect(second.scenarioId).not.toBe(first.scenarioId);
        expect(second.genreId).not.toBe(first.genreId);
    });

    it("resolves the random sentinel into a structured context", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);

        const context = resolveTranslationScenarioContext(RANDOM_TRANSLATION_SCENARIO_TOPIC, 1800);

        expect(context.topicLine.split("·").map((part) => part.trim()).length).toBe(3);
        expect(context.topicPrompt).toContain("Theme Cluster:");
        expect(context.topicPrompt).toContain("Scene Focus:");
        expect(context.topicPrompt).toContain("Writing Style:");
    });
});
