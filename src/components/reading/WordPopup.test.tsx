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

const renderPopup = async (overrides?: Partial<React.ComponentProps<typeof WordPopup>>) => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
        root.render(
            <WordPopup
                popup={popup}
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
    it("shows saved state immediately while background save is still pending", async () => {
        let resolveSave: (() => void) | null = null;
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

        await renderPopup();

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
