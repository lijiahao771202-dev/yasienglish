/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WordPopup, type PopupState } from "./WordPopup";

const mocks = vi.hoisted(() => {
    const first = vi.fn();
    const equals = vi.fn(() => ({ first }));
    const where = vi.fn(() => ({ equals }));
    return {
        dbFirst: first,
        dbEquals: equals,
        dbWhere: where,
        saveVocabulary: vi.fn(),
        applyServerProfilePatchToLocal: vi.fn(),
        dispatchReadingCoinFx: vi.fn(),
    };
});

vi.mock("@/lib/db", () => ({
    db: {
        vocabulary: {
            where: mocks.dbWhere,
        },
    },
}));

vi.mock("@/lib/user-repository", () => ({
    saveVocabulary: mocks.saveVocabulary,
    applyServerProfilePatchToLocal: mocks.applyServerProfilePatchToLocal,
}));

vi.mock("@/components/auth/AuthSessionContext", () => ({
    useAuthSessionUser: () => ({ id: "user-1" }),
}));

vi.mock("@/lib/reading-coin-fx", () => ({
    dispatchReadingCoinFx: mocks.dispatchReadingCoinFx,
}));

class MockAudio {
    currentTime = 0;
    preload = "auto";
    play = vi.fn(() => Promise.resolve());
}

const mountedRoots: Root[] = [];
const popup: PopupState = {
    word: "transit strategy",
    context: "The transferable strategy is conscious substitution.",
    x: 240,
    y: 200,
    articleUrl: "https://example.com/story",
    sourceKind: "read",
    sourceLabel: "来自 Read",
    sourceSentence: "The transferable strategy is conscious substitution.",
    sourceNote: "Transferable habits",
};

const flushPromises = async (count = 2) => {
    for (let index = 0; index < count; index += 1) {
        await act(async () => {
            await Promise.resolve();
        });
    }
};

function markReactActEnvironment() {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

const renderPopup = async (
    overrides?: Partial<React.ComponentProps<typeof WordPopup>>,
    popupOverride?: Partial<PopupState>,
) => {
    markReactActEnvironment();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
        root.render(
            <WordPopup
                popup={{ ...popup, ...popupOverride }}
                onClose={vi.fn()}
                {...overrides}
            />,
        );
    });

    await flushPromises(3);
    return { container, root };
};

const getAddButton = () => document.body.querySelector<HTMLButtonElement>('button[title="加入生词本"], button[title="已加入生词本"], button[title="正在加入生词本"]');

const buildFetchResponse = (data: unknown, ok = true) => ({
    ok,
    json: vi.fn().mockResolvedValue(data),
    headers: {
        get: vi.fn(() => null),
    },
}) as unknown as Response;

beforeEach(() => {
    vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.dbFirst.mockReset();
    mocks.dbEquals.mockClear();
    mocks.dbWhere.mockClear();
    mocks.saveVocabulary.mockReset();
    mocks.applyServerProfilePatchToLocal.mockReset();
    mocks.dispatchReadingCoinFx.mockReset();
});

afterEach(async () => {
    await act(async () => {
        while (mountedRoots.length > 0) {
            mountedRoots.pop()?.unmount();
        }
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

describe("WordPopup", () => {
    it("falls back to AI definition automatically when dictionary lookup returns not found", async () => {
        mocks.dbFirst.mockResolvedValue(null);
        vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/dictionary") {
                return Promise.resolve(buildFetchResponse({ error: "Definition not found" }, false));
            }
            if (url === "/api/ai/define") {
                return Promise.resolve(buildFetchResponse({
                    context_meaning: {
                        definition: "在这段语境里指被放进更大的英雄谱系中讨论",
                        translation: "纳入同类谱系",
                    },
                    phonetic: "/ˈpænθiən/",
                    meaning_groups: [{ pos: "n.", meanings: ["万神殿", "名流群"] }],
                    highlighted_meanings: ["万神殿"],
                    word_breakdown: [],
                    morphology_notes: [],
                    readingCoins: null,
                }));
            }
            return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }));

        await renderPopup(undefined, {
            word: "pantheon",
            context: "In the pantheon of contemporary antiheroes, few figures are as unsettling as this one.",
        });

        expect(document.body.textContent).toContain("在这段语境里指被放进更大的英雄谱系中讨论");
        expect(document.body.textContent).toContain("词典未命中，已切换为 AI 释义。");
    });

    it("shows a dictionary failure message when dictionary and AI fallback both fail", async () => {
        mocks.dbFirst.mockResolvedValue(null);
        vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/dictionary") {
                return Promise.resolve(buildFetchResponse({ error: "Failed to fetch definition" }, false));
            }
            if (url === "/api/ai/define") {
                return Promise.resolve(buildFetchResponse({ error: "Failed to analyze word" }, false));
            }
            return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }));

        await renderPopup(undefined, {
            word: "quietly drains",
            context: "The habit quietly drains attention before people notice what is happening.",
        });

        expect(document.body.textContent).toContain("词典查询失败，已切换为 AI 释义。");
        expect(document.body.textContent).toContain("AI 释义生成失败，请重试。");
    });

    it("uses an initial phrase translation without dictionary lookup or AI fallback", async () => {
        mocks.dbFirst.mockResolvedValue(null);
        const fetchSpy = vi.fn((input: RequestInfo | URL) => Promise.reject(new Error(`Unexpected fetch: ${String(input)}`)));
        vi.stubGlobal("fetch", fetchSpy);

        await renderPopup(undefined, {
            word: "sunlight and water",
            context: "Plants need sunlight and water to grow.",
            sourceSentence: "Plants need sunlight and water to grow.",
            initialDefinition: {
                context_meaning: {
                    definition: "在该句中指：阳光和水分",
                    translation: "阳光和水分",
                },
                meaning_groups: [{ pos: "phr.", meanings: ["阳光和水分"] }],
                highlighted_meanings: ["阳光和水分"],
            },
        });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("在该句中指：阳光和水分");
        expect(document.body.textContent).toContain("阳光和水分");

        await act(async () => {
            getAddButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await flushPromises(2);

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(mocks.saveVocabulary).toHaveBeenCalledTimes(1);
        expect(mocks.saveVocabulary.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
            word: "sunlight and water",
            definition: "在该句中指：阳光和水分",
            translation: "阳光和水分",
            meaning_groups: [{ pos: "phr.", meanings: ["阳光和水分"] }],
            highlighted_meanings: ["阳光和水分"],
            source_sentence: "Plants need sunlight and water to grow.",
        }));
    });

    it("shows saved state immediately while background save is still pending", async () => {
        let resolveSave: () => void = () => {};
        mocks.dbFirst.mockResolvedValue(null);
        mocks.saveVocabulary.mockImplementation(() => new Promise<void>((resolve) => {
            resolveSave = resolve;
        }));
        vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/dictionary") {
                return Promise.resolve(buildFetchResponse({
                    definition: "strategy",
                    translation: "策略",
                    phonetic: "/test/",
                    pos_groups: [],
                }));
            }
            if (url === "/api/ai/define") {
                return Promise.resolve(buildFetchResponse({
                    context_meaning: {
                        definition: "conscious substitution",
                        translation: "有意识替代",
                    },
                    phonetic: "/test/",
                    meaning_groups: [],
                    highlighted_meanings: [],
                    word_breakdown: [],
                    morphology_notes: [],
                    readingCoins: null,
                }));
            }
            return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }));

        await renderPopup(undefined, {
            word: "transit strategy retry",
            context: "The retry-specific context needs fresh AI definition.",
        });

        const addButton = getAddButton();
        expect(addButton).toBeTruthy();

        await act(async () => {
            addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(getAddButton()?.getAttribute("title")).toBe("已加入生词本");
        expect(document.body.textContent).toContain("已加入生词本。");
        expect(mocks.saveVocabulary).toHaveBeenCalledTimes(1);

        resolveSave?.();
        await flushPromises(2);
    });

    it("rolls back optimistic saved state when background save fails", async () => {
        mocks.dbFirst.mockResolvedValue(null);
        mocks.saveVocabulary.mockRejectedValue(new Error("save failed"));
        vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/dictionary") {
                return Promise.resolve(buildFetchResponse({
                    definition: "strategy",
                    translation: "策略",
                    phonetic: "/test/",
                    pos_groups: [],
                }));
            }
            if (url === "/api/ai/define") {
                return Promise.resolve(buildFetchResponse({
                    context_meaning: {
                        definition: "conscious substitution",
                        translation: "有意识替代",
                    },
                    phonetic: "/test/",
                    meaning_groups: [],
                    highlighted_meanings: [],
                    word_breakdown: [],
                    morphology_notes: [],
                    readingCoins: null,
                }));
            }
            return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }));

        await renderPopup();

        await act(async () => {
            getAddButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await flushPromises(3);

        expect(getAddButton()?.getAttribute("title")).toBe("加入生词本");
        expect(document.body.textContent).toContain("保存失败，请重试");
        expect(document.body.textContent).not.toContain("已加入生词本。");
    });

    it("retries transient save failures before succeeding", async () => {
        vi.useFakeTimers();
        mocks.dbFirst.mockResolvedValue(null);
        mocks.saveVocabulary
            .mockRejectedValueOnce(new Error("failed to fetch"))
            .mockResolvedValueOnce(undefined);
        vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/dictionary") {
                return Promise.resolve(buildFetchResponse({
                    definition: "strategy",
                    translation: "策略",
                    phonetic: "/test/",
                    pos_groups: [],
                }));
            }
            if (url === "/api/ai/define") {
                return Promise.resolve(buildFetchResponse({
                    context_meaning: {
                        definition: "conscious substitution",
                        translation: "有意识替代",
                    },
                    phonetic: "/test/",
                    meaning_groups: [],
                    highlighted_meanings: [],
                    word_breakdown: [],
                    morphology_notes: [],
                    readingCoins: null,
                }));
            }
            return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }));

        await renderPopup();

        await act(async () => {
            getAddButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await vi.runAllTimersAsync();
        });
        await flushPromises(4);

        expect(mocks.saveVocabulary).toHaveBeenCalledTimes(2);
        expect(getAddButton()?.getAttribute("title")).toBe("已加入生词本");
        expect(document.body.textContent).toContain("已加入生词本。");
        vi.useRealTimers();
    });

    it("keeps saved state when the vocab already exists", async () => {
        mocks.dbFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ word: "transit strategy" });
        mocks.saveVocabulary.mockResolvedValue(undefined);
        vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/dictionary") {
                return Promise.resolve(buildFetchResponse({
                    definition: "strategy",
                    translation: "策略",
                    phonetic: "/test/",
                    pos_groups: [],
                }));
            }
            return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }));

        await renderPopup();

        await act(async () => {
            getAddButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await flushPromises(2);

        expect(getAddButton()?.getAttribute("title")).toBe("已加入生词本");
        expect(document.body.textContent).toContain("这个词/短语已经在生词本里了，不重复入库。");
        expect(mocks.saveVocabulary).not.toHaveBeenCalled();
    });
});
