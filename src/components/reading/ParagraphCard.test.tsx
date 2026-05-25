/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParagraphCard } from "./ParagraphCard";
import { buildGrammarCacheKey, GRAMMAR_BASIC_PROMPT_VERSION } from "@/lib/grammar-analysis";

const mountedRoots: Root[] = [];
const {
    analysisStoreMock,
    fetchMock,
    decodeAskThreadPayloadMock,
    queryAskRelevantVocabularyMock,
    useTtsMock,
    readingSettingsMock,
} = vi.hoisted(() => ({
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
    useTtsMock: {
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
    },
    readingSettingsMock: {
        fontSizeClass: "text-base",
        isBionicMode: false,
    },
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
    useReadingSettings: () => readingSettingsMock,
}));

vi.mock("@/hooks/useTTS", () => ({
    useTTS: () => useTtsMock,
}));

vi.mock("@/hooks/usePretextMeasuredLayout", () => ({
    usePretextMeasuredLayout: vi.fn(),
}));

vi.mock("@/lib/analysis-store", () => ({
    useAnalysisStore: () => analysisStoreMock,
}));

vi.mock("./SpeakingPanel", () => ({
    SpeakingPanel: (props: {
        onPlayOriginal: () => void;
        onToggleSegmentList: () => void;
        onClose: () => void;
        isSegmentListOpen: boolean;
    }) => (
        <div data-testid="speaking-panel">
            <button type="button" onClick={props.onPlayOriginal}>听全部</button>
            <button type="button" onClick={props.onToggleSegmentList}>
                {props.isSegmentListOpen ? "还原整段" : "排版"}
            </button>
            <button type="button" onClick={props.onClose}>关闭</button>
        </div>
    ),
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
    saveVocabulary: vi.fn(),
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
    requestTtsPayload: vi.fn(async () => ({
        audio: "data:audio/mpeg;base64,ZmFrZQ==",
        marks: [],
    })),
    resolveTtsAudioBlob: vi.fn(async () => new Blob(["fake-audio"], { type: "audio/mpeg" })),
}));

vi.mock("@/lib/ask-thread", () => ({
    buildAskQaPairs: () => [],
    buildAskThreadPreview: () => "",
    decodeAskThreadPayload: decodeAskThreadPayloadMock,
    encodeAskThreadPayload: () => "",
    isLikelyTransientAskFailure: () => false,
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

function createRangeAtTextOffset(root: Node, offset: number) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let current = walker.nextNode();

    while (current) {
        const length = current.textContent?.length ?? 0;
        if (remaining <= length) {
            const range = document.createRange();
            range.setStart(current, remaining);
            range.setEnd(current, remaining);
            return range;
        }

        remaining -= length;
        current = walker.nextNode();
    }

    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    return range;
}

function installFakeAudio(durationSeconds = 5) {
    const instances: Array<{
        currentTime: number;
        duration: number;
        paused: boolean;
        ended: boolean;
        playbackRate: number;
        play: () => Promise<void>;
        pause: () => void;
        onloadedmetadata: ((event: Event) => void) | null;
        onplay: ((event: Event) => void) | null;
        onpause: ((event: Event) => void) | null;
        onended: ((event: Event) => void) | null;
    }> = [];

    class FakeAudio {
        src: string;
        currentTime = 0;
        duration = durationSeconds;
        paused = true;
        ended = false;
        playbackRate = 1;
        onloadedmetadata: ((event: Event) => void) | null = null;
        onplay: ((event: Event) => void) | null = null;
        onpause: ((event: Event) => void) | null = null;
        onended: ((event: Event) => void) | null = null;

        constructor(src = "") {
            this.src = src;
            instances.push(this);
        }

        async play() {
            this.paused = false;
            this.onloadedmetadata?.(new Event("loadedmetadata"));
            this.onplay?.(new Event("play"));
        }

        pause() {
            this.paused = true;
            this.onpause?.(new Event("pause"));
        }
    }

    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: vi.fn(() => "blob:fake-audio"),
        revokeObjectURL: vi.fn(),
    });

    return instances;
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
    useTtsMock.play.mockReset();
    useTtsMock.isPlaying = false;
    useTtsMock.isLoading = false;
    useTtsMock.preload.mockReset();
    useTtsMock.currentTime = 0;
    useTtsMock.duration = 0;
    useTtsMock.seekToMs.mockReset();
    useTtsMock.marks = [];
    useTtsMock.playbackRate = 1;
    useTtsMock.setPlaybackRate.mockReset();
    useTtsMock.stop.mockReset();
    readingSettingsMock.fontSizeClass = "text-base";
    readingSettingsMock.isBionicMode = false;
    vi.unstubAllGlobals();
});

describe("ParagraphCard", () => {
    it("does not render a duplicate rewrite mode action in the paragraph toolbar", async () => {
        const container = await renderCard();

        expect(container.textContent).not.toContain("仿写");
    });

    it("underlines injected RAG words when they appear in the paragraph text", async () => {
        const container = await renderCard({
            text: "Affordable housing depends on public trust and careful allocation.",
            ragAppliedWords: ["public trust", "allocation", "unmatched term"],
        });

        const underlinedSpans = Array.from(container.querySelectorAll("span"))
            .filter((node) => node.className.includes("underline") && node.className.includes("decoration-slate-400/80"));

        const renderedText = underlinedSpans.map((node) => node.textContent?.trim()).filter(Boolean);
        expect(renderedText).toContain("public trust");
        expect(renderedText).toContain("allocation");
        expect(renderedText).not.toContain("unmatched term");
    });

    it("keeps RAG underlines visible in bionic mode", async () => {
        readingSettingsMock.isBionicMode = true;

        const container = await renderCard({
            text: "Affordable housing depends on public trust and careful allocation.",
            ragAppliedWords: ["public trust", "allocation"],
        });

        const underlinedSpans = Array.from(container.querySelectorAll("span"))
            .filter((node) => node.className.includes("underline") && node.className.includes("decoration-slate-400/80"));

        const renderedText = underlinedSpans.map((node) => node.textContent?.trim()).filter(Boolean);
        expect(renderedText).toContain("public trust");
        expect(renderedText).toContain("allocation");
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
            expect.stringContaining(`grammar:basic:${GRAMMAR_BASIC_PROMPT_VERSION}`),
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

    it("keeps every sentence visible in grammar layout even when the grammar payload only analyzes some of them", async () => {
        const text = "Marcus introduced Elena to the concept of metacognitive awareness in management. \"You need to think about how you think,\" he said. That's what separates a discerning leader from a mere operator.";
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
                overview: "部分句子有主干，部分句子缺失。",
                difficult_sentences: [
                    {
                        sentence: "Marcus introduced Elena to the concept of metacognitive awareness in management.",
                        translation: "马库斯向埃琳娜介绍了管理中的元认知意识概念。",
                        highlights: [
                            {
                                substring: "Marcus",
                                type: "主语",
                                explanation: "结构判断：Marcus 作主语；句中作用：发出 introduced 这一动作。",
                                segment_translation: "马库斯",
                            },
                        ],
                    },
                    {
                        sentence: "\"You need to think about how you think,\" he said.",
                        translation: "“你需要思考你是如何思考的，”他说。",
                        highlights: [
                            {
                                substring: "\"You need to think about how you think,\"",
                                type: "宾语从句",
                                explanation: "结构判断：引号里的内容作 said 的内容部分；句中作用：承载他说的话。",
                                segment_translation: "你需要思考你是如何思考的",
                            },
                        ],
                    },
                    {
                        sentence: "That's what separates a discerning leader from a mere operator.",
                        translation: "",
                        highlights: [],
                    },
                ],
            },
        };

        const container = await renderCard({ text });
        const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));

        expect(grammarButton).toBeTruthy();

        await act(async () => {
            grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.querySelectorAll("li")).toHaveLength(3);
        expect(container.textContent).toContain("That's what separates a discerning leader from a mere operator.");
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

    it("seeks playback forward and backward with arrow keys while speaking mode is open", async () => {
        useTtsMock.currentTime = 5;
        useTtsMock.duration = 30;
        useTtsMock.seekToMs.mockImplementation(async (timeMs: number) => {
            useTtsMock.currentTime = timeMs / 1000;
        });

        const container = await renderCard();
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        expect(speakingButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        await act(async () => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        });

        await act(async () => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        });

        expect(useTtsMock.seekToMs).toHaveBeenNthCalledWith(
            1,
            8000,
            expect.objectContaining({ autoplay: true }),
        );
        expect(useTtsMock.seekToMs).toHaveBeenNthCalledWith(
            2,
            5000,
            expect.objectContaining({ autoplay: true }),
        );
    });

    it("seeks to the clicked text position while speaking mode is open", async () => {
        useTtsMock.currentTime = 6;
        useTtsMock.duration = 40;
        useTtsMock.marks = [
            { time: 0, type: "word", start: 0, end: 500, value: "Plants" },
            { time: 500, type: "word", start: 500, end: 1000, value: "need" },
            { time: 1000, type: "word", start: 1000, end: 1500, value: "sunlight" },
            { time: 1500, type: "word", start: 1500, end: 2000, value: "and" },
            { time: 2000, type: "word", start: 2000, end: 2500, value: "water" },
            { time: 2500, type: "word", start: 2500, end: 3000, value: "to" },
            { time: 3000, type: "word", start: 3000, end: 3500, value: "grow" },
        ];

        const container = await renderCard();
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        expect(speakingButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const paragraphText = container.querySelector<HTMLElement>('[data-paragraph-text="true"]');
        const targetWord = paragraphText?.querySelector<HTMLElement>('[data-ktv-word-index="4"]');
        const targetNode = targetWord?.firstChild;
        expect(paragraphText).toBeTruthy();
        expect(targetWord).toBeTruthy();
        expect(targetNode?.nodeType).toBe(Node.TEXT_NODE);

        const clickRange = document.createRange();
        clickRange.setStart(targetNode!, 2);
        clickRange.setEnd(targetNode!, 2);

        Object.defineProperty(document, "caretRangeFromPoint", {
            configurable: true,
            value: vi.fn(() => clickRange),
        });

        await act(async () => {
            paragraphText?.dispatchEvent(new MouseEvent("click", {
                bubbles: true,
                clientX: 180,
                clientY: 60,
            }));
        });

        expect(useTtsMock.seekToMs).toHaveBeenCalledTimes(1);
        expect(useTtsMock.seekToMs.mock.calls[0]?.[0]).toBe(2000);
        expect(useTtsMock.seekToMs).toHaveBeenCalledWith(
            expect.any(Number),
            expect.objectContaining({ autoplay: true }),
        );
    });

    it("uses sentence text instead of list chrome when clicking in sentence listening layout", async () => {
        const audioInstances = installFakeAudio(5);
        const text = "Plants need sunlight and water to grow. Water helps roots stay strong.";

        const container = await renderCard({ text });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        expect(speakingButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const segmentLayoutButton = Array.from(container.querySelectorAll('[data-testid="speaking-panel"] button')).find((button) => button.textContent?.includes("排版"));
        expect(segmentLayoutButton).toBeTruthy();

        await act(async () => {
            segmentLayoutButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const sentenceBadge = container.querySelector<HTMLElement>('[data-speaking-segment-index="0"] button');
        expect(sentenceBadge).toBeTruthy();

        await act(async () => {
            sentenceBadge?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const sentenceContent = container.querySelector<HTMLElement>('[data-speaking-segment-index="0"] [data-speaking-segment-content="true"]');
        expect(sentenceContent).toBeTruthy();

        const clickOffset = 7;
        const clickRange = createRangeAtTextOffset(sentenceContent!, clickOffset);
        Object.defineProperty(document, "caretRangeFromPoint", {
            configurable: true,
            value: vi.fn(() => clickRange),
        });

        await act(async () => {
            sentenceContent?.dispatchEvent(new MouseEvent("click", {
                bubbles: true,
                clientX: 240,
                clientY: 90,
            }));
        });

        const firstSentenceLength = "Plants need sunlight and water to grow.".length;
        expect(audioInstances[0]?.currentTime).toBeCloseTo((clickOffset / firstSentenceLength) * 5, 4);
    });
});
