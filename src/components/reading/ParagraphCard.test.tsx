/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParagraphCard } from "./ParagraphCard";
import { buildGrammarCacheKey, GRAMMAR_BASIC_PROMPT_VERSION } from "@/lib/grammar-analysis";

const mountedRoots: Root[] = [];
const { analysisStoreMock, fetchMock, decodeAskThreadPayloadMock, queryAskRelevantVocabularyMock } = vi.hoisted(() => ({
    analysisStoreMock: {
        translations: {},
        setTranslation: vi.fn(),
        grammarAnalyses: {},
        setGrammarAnalysis: vi.fn(),
        loadFromDB: vi.fn(),
        loadGrammarFromDB: vi.fn(),
    },
    fetchMock: vi.fn(),
    decodeAskThreadPayloadMock: vi.fn(() => null),
    queryAskRelevantVocabularyMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("dexie-react-hooks", () => ({
    useLiveQuery: () => ({
        ai_provider: "deepseek",
        deepseek_model: "deepseek-v4-flash",
        deepseek_thinking_mode: "off",
        deepseek_reasoning_effort: "high",
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

vi.mock("@/contexts/ReadingSettingsContext", () => ({
    useReadingSettings: () => ({
        fontSizeClass: "text-base",
        isBionicMode: false,
    }),
}));

vi.mock("@/hooks/useTTS", () => ({
    useTTS: () => ({
        play: vi.fn(),
        isPlaying: false,
        isLoading: false,
        preload: vi.fn(),
        currentTime: 0,
        duration: 0,
        seekToMs: vi.fn(),
        marks: [],
        playbackRate: 1,
        setPlaybackRate: vi.fn(),
        stop: vi.fn(),
    }),
}));

vi.mock("@/hooks/usePretextMeasuredLayout", () => ({
    usePretextMeasuredLayout: vi.fn(),
}));

vi.mock("@/lib/analysis-store", () => ({
    useAnalysisStore: () => analysisStoreMock,
}));

vi.mock("./SpeakingPanel", () => ({
    SpeakingPanel: () => null,
}));

vi.mock("./SyntaxTreeView", () => ({
    SyntaxTreeView: () => null,
}));

vi.mock("@/components/shared/InlineGrammarHighlights", () => ({
    InlineGrammarHighlights: () => null,
}));

vi.mock("@/components/ui/PretextTextarea", () => ({
    PretextTextarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock("react-markdown", () => ({
    default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("remark-gfm", () => ({
    default: vi.fn(),
}));

vi.mock("@/lib/user-repository", () => ({
    applyServerProfilePatchToLocal: vi.fn(),
}));

vi.mock("@/components/auth/AuthSessionContext", () => ({
    useAuthSessionUser: () => null,
}));

vi.mock("@/lib/reading-economy", () => ({
    getReadingCoinCost: () => 1,
    INSUFFICIENT_READING_COINS: "余额不足",
}));

vi.mock("@/lib/reading-coin-fx", () => ({
    dispatchReadingCoinFx: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
    db: {
        user_profile: {
            orderBy: () => ({
                first: async () => null,
            }),
        },
        reading_notes: {
            where: () => ({
                equals: () => ({
                    toArray: async () => [],
                }),
            }),
        },
        ai_cache: {
            where: () => ({
                equals: () => ({
                    first: async () => null,
                }),
            }),
            put: async () => undefined,
        },
    },
}));

vi.mock("@/lib/tts-client", () => ({
    requestTtsPayload: vi.fn(),
    resolveTtsAudioBlob: vi.fn(),
}));

vi.mock("@/lib/ask-thread", () => ({
    buildAskQaPairs: () => [],
    buildAskThreadPreview: () => "",
    decodeAskThreadPayload: decodeAskThreadPayloadMock,
    encodeAskThreadPayload: () => "",
}));

vi.mock("@/lib/ask-vocab-memory", () => ({
    queryAskRelevantVocabulary: queryAskRelevantVocabularyMock,
}));

vi.mock("@/lib/bionic", () => ({
    bionicText: (value: string) => value,
}));

vi.mock("./selection-helpers", () => ({
    hasMeaningfulTextSelection: () => false,
}));

vi.mock("@/lib/pressable", () => ({
    getPressableStyle: () => "",
    getPressableTap: () => ({}),
}));

async function renderCard(overrides: Partial<React.ComponentProps<typeof ParagraphCard>> = {}) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
        root.render(
            <ParagraphCard
                text="Plants need sunlight and water to grow."
                index={0}
                paragraphOrder={1}
                articleTitle="Sample article"
                articleUrl="https://example.com/article"
                onWordClick={vi.fn()}
                {...overrides}
            />,
        );
    });

    return container;
}

afterEach(async () => {
    await act(async () => {
        while (mountedRoots.length > 0) {
            mountedRoots.pop()?.unmount();
        }
    });
    document.body.innerHTML = "";
    analysisStoreMock.translations = {};
    analysisStoreMock.grammarAnalyses = {};
    analysisStoreMock.setTranslation.mockReset();
    analysisStoreMock.setGrammarAnalysis.mockReset();
    analysisStoreMock.loadFromDB.mockReset();
    analysisStoreMock.loadGrammarFromDB.mockReset();
    fetchMock.mockReset();
    decodeAskThreadPayloadMock.mockReset();
    decodeAskThreadPayloadMock.mockReturnValue(null);
    queryAskRelevantVocabularyMock.mockReset();
    queryAskRelevantVocabularyMock.mockResolvedValue({ status: "empty", vocabulary: [] });
    vi.unstubAllGlobals();
});

describe("ParagraphCard", () => {
    it("does not render a duplicate rewrite mode action in the paragraph toolbar", async () => {
        const container = await renderCard();

        expect(container.textContent).not.toContain("仿写");
    });

    it("ignores stale invalid grammar cache and re-fetches basic analysis", async () => {
        analysisStoreMock.grammarAnalyses = {
            "grammar:basic:old-cache-key": {
                error: "Failed to analyze grammar",
            },
        };
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                mode: "basic",
                tags: ["主语", "谓语"],
                overview: "句子主干完整。",
                difficult_sentences: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        highlights: [
                            {
                                substring: "Plants",
                                type: "主语",
                                explanation: "结构判断：Plants 作主语；句中作用：发出 need 这一动作。",
                                segment_translation: "植物",
                            },
                        ],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard();
        const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));

        expect(grammarButton).toBeTruthy();

        await act(async () => {
            grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(fetchMock).toHaveBeenCalledWith("/api/ai/grammar/basic", expect.objectContaining({
            method: "POST",
        }));
        expect(analysisStoreMock.setGrammarAnalysis).toHaveBeenCalledWith(
            expect.stringContaining("grammar:basic:2026-04-26-basic-v8"),
            expect.objectContaining({ mode: "basic" }),
        );
    });

    it("opens grammar analysis directly in layout mode", async () => {
        const text = "Plants need sunlight and water to grow.";
        const grammarCacheKey = buildGrammarCacheKey({
            text,
            mode: "basic",
            promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
            model: "deepseek:deepseek-v4-flash:thinking=off:reasoning=off",
        });

        analysisStoreMock.grammarAnalyses = {
            [grammarCacheKey]: {
                mode: "basic",
                tags: ["主语", "谓语"],
                overview: "句子主干完整。",
                difficult_sentences: [
                    {
                        sentence: text,
                        translation: "植物需要阳光和水才能生长。",
                        highlights: [
                            {
                                substring: "Plants",
                                type: "主语",
                                explanation: "结构判断：Plants 作主语；句中作用：发出 need 这一动作。",
                                segment_translation: "植物",
                            },
                            {
                                substring: "need",
                                type: "谓语",
                                explanation: "结构判断：need 是谓语；句中作用：说明主语需要什么。",
                                segment_translation: "需要",
                            },
                        ],
                    },
                ],
            },
        };

        const container = await renderCard();
        const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));

        expect(grammarButton).toBeTruthy();

        await act(async () => {
            grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.textContent).toContain("取消排版");
        expect(container.textContent).toContain("主干结构");
    });

    it("keeps the focus-mode clear button anchored to the right edge", async () => {
        const onClearFocusLock = vi.fn();
        const container = await renderCard({
            isFocusMode: true,
            isFocusLocked: true,
            hasActiveFocusLock: true,
            onSetFocusLock: vi.fn(),
            onClearFocusLock,
        });

        const clearButton = container.querySelector<HTMLButtonElement>('button[aria-label="取消当前段落聚焦"]');
        expect(clearButton).toBeTruthy();
        expect(clearButton?.className).toContain("!right-4");
        expect(clearButton?.style.position).toBe("absolute");
        expect(clearButton?.style.right).toBe("1rem");

        await act(async () => {
            clearButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onClearFocusLock).toHaveBeenCalledTimes(1);
    });

    it("reuses an existing sentence ask thread without sending the default request again", async () => {
        const text = "Plants need sunlight and water to grow.";
        decodeAskThreadPayloadMock.mockReturnValue({
            messages: [
                { role: "user", content: "请翻译这句话，并解析它的核心语法结构与词汇搭配。", createdAt: 1 },
                { role: "assistant", content: "这是已有回答。", createdAt: 2 },
            ],
        });

        vi.stubGlobal("fetch", fetchMock);
        Object.defineProperty(Range.prototype, "getBoundingClientRect", {
            configurable: true,
            value: () => new DOMRect(12, 24, 220, 36),
        });

        const container = await renderCard({
            readingNotes: [
                {
                    id: 101,
                    article_key: "reading::sample",
                    selected_text: text,
                    note_text: "encoded-thread",
                    mark_type: "ask",
                    start_offset: 0,
                    end_offset: text.length,
                    created_at: Date.now(),
                    updated_at: Date.now(),
                },
            ],
        });

        const layoutButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("排版"));
        expect(layoutButton).toBeTruthy();

        await act(async () => {
            layoutButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const sentenceRow = container.querySelector<HTMLElement>('[data-reading-layout-segment="true"]');
        const sentenceBadge = sentenceRow?.firstElementChild as HTMLElement | null;
        expect(sentenceRow).toBeTruthy();
        expect(sentenceBadge).toBeTruthy();

        await act(async () => {
            sentenceBadge?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("回答模式");
    });

    it("keeps the selection AskAI dock open when clicking a word in the paragraph", async () => {
        const text = "Plants need sunlight and water to grow.";
        decodeAskThreadPayloadMock.mockReturnValue({
            messages: [
                { role: "user", content: "请翻译这句话，并解析它的核心语法结构与词汇搭配。", createdAt: 1 },
                { role: "assistant", content: "这是已有回答。", createdAt: 2 },
            ],
        });

        Object.defineProperty(Range.prototype, "getBoundingClientRect", {
            configurable: true,
            value: () => new DOMRect(12, 24, 220, 36),
        });

        const container = await renderCard({
            text,
            readingNotes: [
                {
                    id: 102,
                    article_key: "reading::sample",
                    selected_text: text,
                    note_text: "encoded-thread",
                    mark_type: "ask",
                    start_offset: 0,
                    end_offset: text.length,
                    created_at: Date.now(),
                    updated_at: Date.now(),
                },
            ],
        });

        const layoutButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("排版"));
        expect(layoutButton).toBeTruthy();

        await act(async () => {
            layoutButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const sentenceRow = container.querySelector<HTMLElement>('[data-reading-layout-segment="true"]');
        const sentenceBadge = sentenceRow?.firstElementChild as HTMLElement | null;
        expect(sentenceRow).toBeTruthy();
        expect(sentenceBadge).toBeTruthy();

        await act(async () => {
            sentenceBadge?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(document.body.textContent).toContain("回答模式");

        const paragraphText = container.querySelector<HTMLElement>('[data-paragraph-text="true"]');
        expect(paragraphText).toBeTruthy();

        await act(async () => {
            paragraphText?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        });

        expect(document.body.textContent).toContain("回答模式");
    });

    it("includes retrieved vocab memory when auto-asking from a sentence badge", async () => {
        const text = "Research shows that sleep helps solidify new memories.";
        queryAskRelevantVocabularyMock.mockResolvedValue({
            status: "hit",
            vocabulary: [
                {
                    word: "solidify",
                    translation: "巩固；使稳固",
                    meaningHints: ["v. 巩固 / 使稳固"],
                    score: 0.92,
                },
            ],
        });
        fetchMock.mockResolvedValue({
            ok: true,
            headers: {
                get: () => null,
            },
            body: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                    controller.close();
                },
            }),
        });

        vi.stubGlobal("fetch", fetchMock);
        Object.defineProperty(Range.prototype, "getBoundingClientRect", {
            configurable: true,
            value: () => new DOMRect(12, 24, 220, 36),
        });

        const container = await renderCard({ text });
        const layoutButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("排版"));
        expect(layoutButton).toBeTruthy();

        await act(async () => {
            layoutButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const sentenceRow = container.querySelector<HTMLElement>('[data-reading-layout-segment="true"]');
        const sentenceBadge = sentenceRow?.firstElementChild as HTMLElement | null;
        expect(sentenceBadge).toBeTruthy();

        await act(async () => {
            sentenceBadge?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(queryAskRelevantVocabularyMock).toHaveBeenCalledWith({
            paragraph: text,
            question: "请翻译这句话，并解析它的核心语法结构与词汇搭配。",
            selection: text,
        });
        expect(fetchMock).toHaveBeenCalledWith("/api/ai/ask", expect.objectContaining({
            method: "POST",
            body: expect.any(String),
        }));
        const [, requestInit] = fetchMock.mock.calls[0];
        const payload = JSON.parse(String(requestInit.body));
        expect(payload.retrievedVocab).toEqual([
            expect.objectContaining({
                word: "solidify",
                translation: "巩固；使稳固",
            }),
        ]);
    });
});
