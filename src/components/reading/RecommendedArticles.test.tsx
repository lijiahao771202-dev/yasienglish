/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecommendedArticles } from "./RecommendedArticles";

const mountedRoots: Root[] = [];
const {
    fetchMock,
    setFeedMock,
    getFeedMock,
    loadFeedFromDBMock,
    deleteArticleMock,
    saveProfilePatchMock,
    applyServerProfilePatchToLocalMock,
    deleteReadArticleSnapshotMock,
    setReadArticleArchivedMock,
    dbArticlesPutMock,
    dbArticlesToArrayMock,
    profileMock,
} = vi.hoisted(() => ({
    fetchMock: vi.fn(),
    setFeedMock: vi.fn(async () => undefined),
    getFeedMock: vi.fn(() => []),
    loadFeedFromDBMock: vi.fn(async () => undefined),
    deleteArticleMock: vi.fn(async () => undefined),
    saveProfilePatchMock: vi.fn(async () => undefined),
    applyServerProfilePatchToLocalMock: vi.fn(async () => undefined),
    deleteReadArticleSnapshotMock: vi.fn(async () => undefined),
    setReadArticleArchivedMock: vi.fn(async () => undefined),
    dbArticlesPutMock: vi.fn(async () => undefined),
    dbArticlesToArrayMock: vi.fn(async () => []),
    profileMock: {
        id: 1,
        cat_score: 1000,
        cat_current_band: 1,
        cat_pending_difficulty_signal: 0,
        learning_preferences: {
            target_mode: "read",
            english_level: "B1",
            daily_goal_minutes: 20,
            ui_theme_preference: "bubblegum_pop",
            tts_voice: "en-US-JennyNeural",
            rebuild_auto_open_shadowing_prompt: true,
            ai_reading_rag: {
                standard: { mode: "reference", source: "hybrid" },
                longform: { mode: "reference", source: "hybrid" },
            },
        },
    },
}));

function markReactActEnvironment() {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

vi.mock("next/navigation", () => ({
    useSearchParams: () => ({
        get: (key: string) => {
            if (key === "smart_task") return "reading_ai";
            if (key === "exam_track") return "ielts";
            return null;
        },
    }),
}));

vi.mock("framer-motion", async () => {
    const ReactModule = await import("react");

    const passthrough = (tag: string) => {
        return ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => {
            const {
                animate,
                exit,
                initial,
                layout,
                layoutId,
                transition,
                variants,
                whileHover,
                whileTap,
                ...rest
            } = props;
            void animate;
            void exit;
            void initial;
            void layout;
            void layoutId;
            void transition;
            void variants;
            void whileHover;
            void whileTap;
            return ReactModule.createElement(tag, rest, children);
        };
    };

    return {
        AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, {
            get: (_target, key) => passthrough(typeof key === "string" ? key : "div"),
        }),
        useReducedMotion: () => false,
    };
});

vi.mock("dexie-react-hooks", () => ({
    useLiveQuery: () => profileMock,
}));

vi.mock("@/lib/feed-store", () => ({
    useFeedStore: () => ({
        setFeed: setFeedMock,
        getFeed: getFeedMock,
        loadFeedFromDB: loadFeedFromDBMock,
        deleteArticle: deleteArticleMock,
    }),
}));

vi.mock("@/lib/store", () => ({
    useUserStore: () => ({
        readArticleUrls: [],
    }),
}));

vi.mock("@/lib/user-repository", () => ({
    applyServerProfilePatchToLocal: applyServerProfilePatchToLocalMock,
    deleteReadArticleSnapshot: deleteReadArticleSnapshotMock,
    setReadArticleArchived: setReadArticleArchivedMock,
    saveProfilePatch: saveProfilePatchMock,
}));

vi.mock("@/components/reading/CatGrowthChart", () => ({
    CatGrowthChart: () => null,
}));

vi.mock("@/components/ui/SpotlightTour", () => ({
    SpotlightTour: () => null,
}));

vi.mock("./GenerationOverlay", () => ({
    GenerationOverlay: () => null,
}));

vi.mock("@/components/battle/TranslationSlotMachine", () => ({
    TranslationSlotMachine: () => null,
}));

vi.mock("@/lib/db", () => ({
    db: {
        user_profile: {
            orderBy: () => ({
                first: async () => null,
            }),
            update: async () => undefined,
        },
        articles: {
            toArray: dbArticlesToArrayMock,
            put: dbArticlesPutMock,
        },
        sync_outbox: {
            toArray: async () => [],
        },
        read_articles: {
            toArray: async () => [],
        },
    },
}));

vi.mock("@/lib/content-topic-pool", () => ({
    pickAIGenerationTopicSeed: ({ userTopic }: { userTopic?: string }) => ({
        topicLine: userTopic?.trim() || "Fallback Topic",
    }),
}));

vi.mock("@/lib/ai-generation-rag", () => ({
    collectAIGenerationVocabulary: vi.fn(async () => ({
        mode: "reference",
        source: "hybrid",
        words: [],
    })),
    collectRecentAIGenerationRagCooldownWords: vi.fn(() => []),
}));

function getButtons(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
}

function findButtonByText(container: HTMLElement, text: string) {
    return getButtons(container).find((button) => button.textContent?.includes(text)) ?? null;
}

async function clickButton(button: HTMLButtonElement | null) {
    if (!button) throw new Error("Button not found");
    act(() => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

async function inputValue(element: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
    if (!element) throw new Error("Input not found");
    const prototype = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!valueSetter) throw new Error("Value setter not found");
    act(() => {
        valueSetter.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

async function renderRecommendedArticles() {
    markReactActEnvironment();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    const onSelect = vi.fn();
    const onArticleLoaded = vi.fn();
    const onListUpdate = vi.fn();

    act(() => {
        root.render(
            <RecommendedArticles
                onSelect={onSelect}
                onArticleLoaded={onArticleLoaded}
                onListUpdate={onListUpdate}
            />,
        );
    });

    return { container, onSelect, onArticleLoaded, onListUpdate };
}

async function waitForCondition(check: () => boolean, timeoutMs = 5000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Condition not met within timeout");
}

describe("RecommendedArticles AI Studio wizard", () => {
    beforeEach(() => {
        fetchMock.mockReset();
        setFeedMock.mockClear();
        getFeedMock.mockClear();
        loadFeedFromDBMock.mockClear();
        deleteArticleMock.mockClear();
        saveProfilePatchMock.mockClear();
        applyServerProfilePatchToLocalMock.mockClear();
        deleteReadArticleSnapshotMock.mockClear();
        setReadArticleArchivedMock.mockClear();
        dbArticlesPutMock.mockClear();
        dbArticlesToArrayMock.mockClear();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(async () => {
        while (mountedRoots.length > 0) {
            const root = mountedRoots.pop();
            if (!root) break;
            await act(async () => {
                root.unmount();
            });
        }
        document.body.innerHTML = "";
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("renders the AI Studio wizard in mode step first", async () => {
        const { container } = await renderRecommendedArticles();

        expect(container.querySelector('[data-ai-gen-wizard="true"]')).toBeTruthy();
        expect(container.querySelector('[data-ai-gen-progress="true"]')).toBeTruthy();
        expect(container.querySelector('[data-ai-gen-step="mode"]')).toBeTruthy();
        expect(container.textContent).toContain("第 1 步 / 共 4 步");
        expect(findButtonByText(container, "标准模式")).toBeTruthy();
        expect(findButtonByText(container, "长文模式")).toBeTruthy();
        expect(container.textContent).not.toContain("RAG 模式");
        expect(container.textContent).not.toContain("RAG 来源");
        expect(container.querySelector('input[placeholder*="Quantum Computing"]')).toBeNull();
    });

    it("switches to longform flow and exposes the longform step", async () => {
        const { container } = await renderRecommendedArticles();

        await clickButton(findButtonByText(container, "长文模式"));

        expect(container.querySelector('[data-ai-gen-step="difficulty"]')).toBeTruthy();
        expect(container.textContent).toContain("第 2 步 / 共 5 步");
        expect(findButtonByText(container, "母语者")).toBeTruthy();

        await clickButton(container.querySelector('[data-ai-gen-next="true"]'));

        expect(container.querySelector('[data-ai-gen-step="longform"]')).toBeTruthy();
        expect(container.textContent).toContain("长度档位");
        expect(container.textContent).toContain("下一步再定风格和主题");
        expect(container.textContent).not.toContain("风格选择");
    });

    it("disables RAG source options when RAG is turned off", async () => {
        const { container } = await renderRecommendedArticles();

        await clickButton(findButtonByText(container, "标准模式"));
        await clickButton(container.querySelector('[data-ai-gen-next="true"]'));

        expect(container.querySelector('[data-ai-gen-step="rag"]')).toBeTruthy();

        await clickButton(findButtonByText(container, "关闭 RAG"));

        const vocabButton = findButtonByText(container, "只注入生词本");
        const dictionaryButton = findButtonByText(container, "只注入词典");
        expect(vocabButton?.disabled).toBe(true);
        expect(dictionaryButton?.disabled).toBe(true);
    });

    it("retains selected longform and RAG state when navigating back", async () => {
        const { container } = await renderRecommendedArticles();

        await clickButton(findButtonByText(container, "长文模式"));
        await clickButton(findButtonByText(container, "CET-6 六级"));
        await clickButton(container.querySelector('[data-ai-gen-next="true"]'));

        expect(container.querySelector('[data-ai-gen-step="longform"]')).toBeTruthy();
        await clickButton(container.querySelector('[data-ai-gen-next="true"]'));
        expect(container.querySelector('[data-ai-gen-step="rag"]')).toBeTruthy();
        await clickButton(findButtonByText(container, "关闭 RAG"));
        await clickButton(container.querySelector('[data-ai-gen-next="true"]'));

        expect(container.querySelector('[data-ai-gen-step="topic"]')).toBeTruthy();

        await clickButton(findButtonByText(container, "自定义风格"));
        await inputValue(container.querySelector("textarea"), "像老师一样逐层讲清楚。");

        await clickButton(container.querySelector('[data-ai-gen-back="true"]'));

        expect(container.querySelector('[data-ai-gen-step="rag"]')).toBeTruthy();

        await clickButton(container.querySelector('[data-ai-gen-next="true"]'));

        expect(container.querySelector('[data-ai-gen-step="topic"]')).toBeTruthy();
        expect(container.textContent).toContain("六级");
        expect(container.textContent).toContain("风格选择");

        const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
        expect(textarea?.value).toBe("像老师一样逐层讲清楚。");

        const vocabButton = findButtonByText(container, "只注入生词本");
        expect(vocabButton).toBeNull();
    });

    it("reaches topic step and generates through the existing handler", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                title: "AI Article",
                content: "Generated article body",
                textContent: "Generated article body",
                blocks: [],
                generationMode: "standard",
                ragMode: "off",
                ragSource: "hybrid",
            }),
        });

        const realSetTimeout = globalThis.setTimeout;
        vi.stubGlobal("setTimeout", ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => (
            realSetTimeout(handler, 0, ...args)
        )) as typeof setTimeout);

        const { container, onArticleLoaded } = await renderRecommendedArticles();

        await clickButton(findButtonByText(container, "标准模式"));
        await clickButton(container.querySelector('[data-ai-gen-next="true"]'));
        await clickButton(findButtonByText(container, "关闭 RAG"));
        await clickButton(container.querySelector('[data-ai-gen-next="true"]'));

        expect(container.querySelector('[data-ai-gen-step="topic"]')).toBeTruthy();

        await clickButton(findButtonByText(container, "Globalization"));

        await clickButton(findButtonByText(container, "生成文章"));
        await waitForCondition(() => fetchMock.mock.calls.length > 0, 2500);
        await waitForCondition(() => onArticleLoaded.mock.calls.length > 0, 2500);
        await waitForCondition(() => dbArticlesPutMock.mock.calls.length > 0, 2500);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/ai/generate",
            expect.objectContaining({
                method: "POST",
                headers: { "Content-Type": "application/json" },
            }),
        );
        expect(onArticleLoaded).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "AI Article",
                isAIGenerated: true,
            }),
        );
        expect(dbArticlesPutMock).toHaveBeenCalled();
    });

    it("shows longform style controls in the topic step", async () => {
        const { container } = await renderRecommendedArticles();

        await clickButton(findButtonByText(container, "长文模式"));
        await clickButton(findButtonByText(container, "CET-6 六级"));
        await clickButton(container.querySelector('[data-ai-gen-next="true"]'));
        await clickButton(container.querySelector('[data-ai-gen-next="true"]'));
        await clickButton(container.querySelector('[data-ai-gen-next="true"]'));

        expect(container.querySelector('[data-ai-gen-step="topic"]')).toBeTruthy();
        expect(container.textContent).toContain("风格选择");
        expect(container.textContent).toContain("当前长文设置");

        await clickButton(findButtonByText(container, "自定义风格"));

        const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
        expect(textarea).toBeTruthy();
    });
});
