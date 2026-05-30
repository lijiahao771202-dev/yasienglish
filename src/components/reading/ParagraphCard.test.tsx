/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParagraphCard } from "./ParagraphCard";
import {
    buildGrammarCacheKey,
    buildReadingGrammarExecutionSignature,
    GRAMMAR_BASIC_PROMPT_VERSION,
} from "@/lib/grammar-analysis";
import { saveVocabulary } from "@/lib/user-repository";
import { requestTtsPayload } from "@/lib/tts-client";

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
        fontClass: "font-serif",
        fontSizeClass: "text-base",
        translationFontClass: "font-serif",
        translationFontSizeClass: "text-base",
        translationColorClass: "text-stone-500/95",
        isBionicMode: false,
        phraseDisplayMode: "capsule",
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
        vocabulary: {
            where: () => ({
                equals: () => ({
                    first: async () => null,
                }),
            }),
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
    buildAskQaPairs: (
        messages: Array<{ role: "user" | "assistant"; content: string; reasoningContent?: string; isError?: boolean }> = [],
        streamingContent = "",
        isLoading = false,
        streamingReasoningContent = "",
    ) => {
        const pairs: Array<{
            id: number;
            question: string;
            answer: string;
            reasoningContent: string;
            isStreaming: boolean;
            isReasoningStreaming: boolean;
            isError: boolean;
        }> = [];

        for (let index = 0; index < messages.length; index += 1) {
            const message = messages[index];
            if (message.role !== "user") continue;
            const assistant = messages[index + 1]?.role === "assistant" ? messages[index + 1] : null;
            pairs.push({
                id: pairs.length + 1,
                question: message.content,
                answer: assistant?.content ?? "",
                reasoningContent: assistant?.reasoningContent ?? "",
                isStreaming: false,
                isReasoningStreaming: false,
                isError: Boolean(assistant?.isError),
            });
        }

        if (isLoading && messages.at(-1)?.role === "user") {
            const existingLast = pairs.at(-1);
            if (existingLast && !existingLast.answer) {
                existingLast.answer = streamingContent;
                existingLast.reasoningContent = streamingReasoningContent;
                existingLast.isStreaming = true;
                existingLast.isReasoningStreaming = Boolean(streamingReasoningContent);
            }
        }

        return pairs;
    },
    buildAskThreadPreview: () => "",
    decodeAskThreadPayload: decodeAskThreadPayloadMock,
    encodeAskThreadPayload: () => "",
    resolveAskAssistantMessageParts: (content: string, reasoningContent: string) => ({
        content,
        ...(reasoningContent ? { reasoningContent } : {}),
    }),
    isLikelyTransientAskFailure: () => false,
}));

vi.mock("@/lib/ask-vocab-memory", () => ({
    queryAskRelevantVocabulary: queryAskRelevantVocabularyMock,
}));

vi.mock("@/lib/bionic", () => ({
    bionicText: (value: string) => value,
}));

vi.mock("./selection-helpers", () => ({
    hasMeaningfulTextSelection: vi.fn(() => false),
}));

vi.mock("@/lib/pressable", () => ({
    getPressableStyle: () => "",
    getPressableTap: () => ({}),
}));

analysisStoreMock.setTranslation.mockImplementation(async (text: string, translation: unknown) => {
    analysisStoreMock.translations[text] = translation;
});

analysisStoreMock.setGrammarAnalysis.mockImplementation(async (cacheKey: string, analysis: unknown) => {
    analysisStoreMock.grammarAnalyses[cacheKey] = analysis;
});

useTtsMock.setPlaybackRate.mockImplementation((nextRate: number) => {
    useTtsMock.playbackRate = nextRate;
});

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

function getTranslationAsides(container: HTMLElement) {
    return Array.from(container.querySelectorAll('[data-translation-aside="true"]'));
}

function getPhraseTags(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('[data-translation-phrase-tag="true"]'));
}

function getInlinePhraseTriggers(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLElement>('[data-translation-inline-phrase="true"]'));
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
        ontimeupdate: ((event: Event) => void) | null;
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
        ontimeupdate: ((event: Event) => void) | null = null;
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
            this.ontimeupdate?.(new Event("timeupdate"));
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

function installDeferredMetadataAudio(durationSeconds = 5) {
    const instances: Array<{
        currentTime: number;
        duration: number;
        paused: boolean;
        ended: boolean;
        playbackRate: number;
        play: () => Promise<void>;
        pause: () => void;
        onloadedmetadata: ((event: Event) => void) | null;
        ontimeupdate: ((event: Event) => void) | null;
        onplay: ((event: Event) => void) | null;
        onpause: ((event: Event) => void) | null;
        onended: ((event: Event) => void) | null;
        triggerLoadedMetadata: () => void;
    }> = [];

    class FakeAudio {
        src: string;
        currentTime = 0;
        duration = 0;
        paused = true;
        ended = false;
        playbackRate = 1;
        onloadedmetadata: ((event: Event) => void) | null = null;
        ontimeupdate: ((event: Event) => void) | null = null;
        onplay: ((event: Event) => void) | null = null;
        onpause: ((event: Event) => void) | null = null;
        onended: ((event: Event) => void) | null = null;

        constructor(src = "") {
            this.src = src;
            instances.push(this);
        }

        triggerLoadedMetadata() {
            this.duration = durationSeconds;
            this.onloadedmetadata?.(new Event("loadedmetadata"));
        }

        async play() {
            this.paused = false;
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
    analysisStoreMock.setTranslation.mockImplementation(async (text: string, translation: unknown) => {
        analysisStoreMock.translations[text] = translation;
    });
    analysisStoreMock.setGrammarAnalysis.mockImplementation(async (cacheKey: string, analysis: unknown) => {
        analysisStoreMock.grammarAnalyses[cacheKey] = analysis;
    });
    analysisStoreMock.loadFromDB.mockReset();
    analysisStoreMock.loadGrammarFromDB.mockReset();
    fetchMock.mockReset();
    decodeAskThreadPayloadMock.mockReset();
    decodeAskThreadPayloadMock.mockReturnValue(null);
    queryAskRelevantVocabularyMock.mockReset();
    queryAskRelevantVocabularyMock.mockResolvedValue({ status: "empty", vocabulary: [] });
    vi.mocked(saveVocabulary).mockReset();
    vi.mocked(requestTtsPayload).mockClear();
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
    useTtsMock.setPlaybackRate.mockImplementation((nextRate: number) => {
        useTtsMock.playbackRate = nextRate;
    });
    useTtsMock.stop.mockReset();
    readingSettingsMock.fontSizeClass = "text-base";
    readingSettingsMock.fontClass = "font-serif";
    readingSettingsMock.translationFontClass = "font-serif";
    readingSettingsMock.translationFontSizeClass = "text-base";
    readingSettingsMock.translationColorClass = "text-stone-500/95";
    readingSettingsMock.isBionicMode = false;
    readingSettingsMock.phraseDisplayMode = "capsule";
    vi.useRealTimers();
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

    it("renders sentence-by-sentence translations directly under each sentence", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [
                            {
                                source: "sunlight and water",
                                translation: "阳光和水分",
                            },
                        ],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [
                            {
                                source: "stay strong",
                                translation: "保持强壮",
                            },
                        ],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        await act(async () => {
            await Promise.resolve();
        });

        expect(container.querySelector('[data-translation-mode-shell="true"]')).toBeTruthy();
        expect(container.querySelector('[data-translation-toolbar="true"]')).toBeTruthy();
        expect(getTranslationAsides(container)).toHaveLength(2);
        const translationLines = Array.from(container.querySelectorAll('[data-translation-line="true"]'));
        expect(translationLines).toHaveLength(2);
        expect(translationLines[0]?.textContent).toContain("植物需要阳光和水才能生长。");
        expect(translationLines[1]?.textContent).toContain("水能帮助根部保持强壮。");
        const phraseBlocks = Array.from(container.querySelectorAll('[data-translation-phrases="true"]'));
        expect(phraseBlocks).toHaveLength(2);
        expect(getPhraseTags(container)).toHaveLength(2);
        expect(container.textContent).toContain("sunlight and water");
        expect(container.textContent).toContain("阳光和水分");
        expect(container.textContent).toContain("stay strong");
        expect(container.textContent).toContain("保持强壮");
        expect(container.querySelector('[data-paragraph-translation-block="true"]')).toBeNull();
        expect(getTranslationAsides(container)[0]?.className).toContain("block");
        expect(getTranslationAsides(container)[0]?.className).toContain("w-full");
        expect(getTranslationAsides(container)[0]?.className).toContain("reading-translation-inset");
    });

    it("applies reading appearance font and size to translation-mode english sentence lines", async () => {
        readingSettingsMock.fontSizeClass = "text-2xl";
        (readingSettingsMock as typeof readingSettingsMock & { fontClass?: string }).fontClass = "font-[Arial,sans-serif]";
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const sentenceBody = container.querySelector('[data-translation-sentence-body="true"]');
        expect(sentenceBody?.className).toContain("text-2xl");
        expect(sentenceBody?.className).toContain("font-[Arial,sans-serif]");
    });

    it("applies dedicated chinese appearance settings to translation lines", async () => {
        readingSettingsMock.translationFontSizeClass = "text-lg";
        readingSettingsMock.translationFontClass = "font-[Helvetica,sans-serif]";
        readingSettingsMock.translationColorClass = "text-sky-700";
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const translationLine = container.querySelector<HTMLElement>('[data-translation-line="true"]');
        expect(translationLine?.className).toContain("text-lg");
        expect(translationLine?.className).toContain("font-[Helvetica,sans-serif]");
        expect(translationLine?.className).toContain("text-sky-700");
    });

    it("uses the grammar sentence list immediately when translate is clicked", async () => {
        let resolveFetch: ((value: unknown) => void) | null = null;
        fetchMock.mockImplementationOnce(() => new Promise((resolve) => {
            resolveFetch = resolve;
        }));
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const sentenceButtons = Array.from(container.querySelectorAll("button")).filter((button) =>
            (button.getAttribute("aria-label") ?? "").startsWith("第 "),
        );
        expect(sentenceButtons).toHaveLength(2);
        expect(container.textContent).toContain("Plants need sunlight and water to grow.");
        expect(container.textContent).toContain("Water helps roots stay strong.");
        expect(container.querySelectorAll('[data-translation-line="true"]')).toHaveLength(0);
        expect(container.querySelectorAll('[data-translation-layout-segment="true"]')).toHaveLength(0);

        await act(async () => {
            resolveFetch?.({
                ok: true,
                json: async () => ({
                    translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                    sentenceTranslations: [
                        {
                            sentence: "Plants need sunlight and water to grow.",
                            translation: "植物需要阳光和水才能生长。",
                        },
                        {
                            sentence: "Water helps roots stay strong.",
                            translation: "水能帮助根部保持强壮。",
                        },
                    ],
                }),
            });
            await Promise.resolve();
        });

        expect(getTranslationAsides(container)).toHaveLength(2);
        const translationLines = Array.from(container.querySelectorAll('[data-translation-line="true"]'));
        expect(translationLines).toHaveLength(2);
    });

    it("falls back to the full translation when sentence translations are missing", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(container.querySelector('[data-translation-error="true"]')).toBeNull();
        expect(getTranslationAsides(container)).toHaveLength(2);
        const translationLines = Array.from(container.querySelectorAll('[data-translation-line="true"]'));
        expect(translationLines[0]?.textContent).toContain("植物需要阳光和水才能生长。");
        expect(translationLines[1]?.textContent).toContain("水能帮助根部保持强壮。");
    });

    it("shows a retryable translation error when the API returns no usable translation content", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "",
                sentenceTranslations: [],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(container.textContent).toContain("翻译暂时没有返回内容，请重试。");
        expect(container.querySelector('[data-translation-error="true"]')).toBeTruthy();
        expect(container.textContent).toContain("重试翻译");
    });

    it("refreshes a legacy paragraph translation cache into sentence translations when opening translate mode", async () => {
        analysisStoreMock.translations["Plants need sunlight and water to grow. Water helps roots stay strong."] = "植物需要阳光和水才能生长。水能帮助根部保持强壮。";
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        await act(async () => {
            await Promise.resolve();
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(getTranslationAsides(container)).toHaveLength(2);
        const translationLines = Array.from(container.querySelectorAll('[data-translation-line="true"]'));
        expect(translationLines).toHaveLength(2);
        expect(container.querySelector('[data-paragraph-translation-block="true"]')).toBeNull();
    });

    it("reuses sentence translations from grammar analysis before requesting only the missing sentences", async () => {
        vi.stubGlobal("fetch", fetchMock);
        analysisStoreMock.grammarAnalyses = {
            [buildGrammarCacheKey({
                text: "Plants need sunlight and water to grow.",
                mode: "basic",
                promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
                model: "deepseek:deepseek-v4-flash:thinking=off:reasoning=off",
            })]: {
                mode: "basic",
                difficult_sentences: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        highlights: [
                            {
                                substring: "Plants",
                                type: "主语",
                                explanation: "主语。",
                            },
                        ],
                    },
                ],
            },
        };
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                    },
                ],
            }),
        });

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        await act(async () => {
            await Promise.resolve();
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, requestInit] = fetchMock.mock.calls[0];
        const payload = JSON.parse(String(requestInit.body));
        expect(payload.text).toBe("Water helps roots stay strong.");

        expect(getTranslationAsides(container)).toHaveLength(2);
        const translationLines = Array.from(container.querySelectorAll('[data-translation-line="true"]'));
        expect(translationLines).toHaveLength(2);
        expect(translationLines[0]?.textContent).toContain("植物需要阳光和水才能生长。");
        expect(translationLines[1]?.textContent).toContain("水能帮助根部保持强壮。");
    });

    it("keeps grammar view open and still shows sentence translations when translate is clicked", async () => {
        vi.stubGlobal("fetch", fetchMock);
        analysisStoreMock.grammarAnalyses = {
            [buildGrammarCacheKey({
                text: "Plants need sunlight and water to grow.",
                mode: "basic",
                promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
                model: "deepseek:deepseek-v4-flash:thinking=off:reasoning=off",
            })]: {
                mode: "basic",
                difficult_sentences: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        highlights: [
                            { substring: "Plants", type: "主语", explanation: "主语。" },
                        ],
                    },
                ],
            },
        };
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                    },
                ],
            }),
        });

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(grammarButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(container.textContent).toContain("折叠语法");

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(getTranslationAsides(container)).toHaveLength(2);
        const translationLines = Array.from(container.querySelectorAll('[data-translation-line="true"]'));
        expect(translationLines).toHaveLength(2);
        expect(container.textContent).toContain("折叠语法");
    });

    it("does not wrap pure grammar mode in the translation shell or translation toolbar", async () => {
        const text = "Plants need sunlight and water to grow.";
        const cacheKey = buildGrammarCacheKey({
            text: text.trim(),
            mode: "basic",
            promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
            model: buildReadingGrammarExecutionSignature({
                ai_provider: "deepseek",
                deepseek_model: "deepseek-v4-flash",
                deepseek_thinking_mode: "off",
                deepseek_reasoning_effort: "high",
            }),
        });

        analysisStoreMock.grammarAnalyses = {
            [cacheKey]: {
                difficult_sentences: [
                    {
                        sentence: text,
                        translation: "植物需要阳光和水才能生长。",
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

        expect(container.querySelector('[data-translation-mode-shell="true"]')).toBeNull();
        expect(container.querySelector('[data-translation-toolbar="true"]')).toBeNull();
    });

    it("reuses existing translation-mode sentence translation as the visible grammar translation when expanded", async () => {
        vi.stubGlobal("fetch", fetchMock);
        analysisStoreMock.translations["Plants need sunlight and water to grow. Water helps roots stay strong."] = {
            translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
            sentenceTranslations: [
                {
                    sentence: "Plants need sunlight and water to grow.",
                    translation: "植物需要阳光和水才能生长。",
                },
                {
                    sentence: "Water helps roots stay strong.",
                    translation: "水能帮助根部保持强壮。",
                    phraseTranslations: [
                        {
                            source: "stay strong",
                            translation: "保持强壮",
                        },
                    ],
                },
            ],
        };
        analysisStoreMock.grammarAnalyses = {
            [buildGrammarCacheKey({
                text: "Water helps roots stay strong.",
                mode: "basic",
                promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
                model: "deepseek:deepseek-v4-flash:thinking=off:reasoning=off",
            })]: {
                mode: "basic",
                difficult_sentences: [
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水有助于让根系保持稳固。",
                        highlights: [
                            { substring: "Water", type: "主语", explanation: "主语。" },
                        ],
                    },
                ],
            },
        };

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(grammarButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const secondSentenceButton = Array.from(container.querySelectorAll("button")).find((button) =>
            (button.getAttribute("aria-label") ?? "") === "第 2 句",
        );
        expect(secondSentenceButton).toBeTruthy();

        await act(async () => {
            secondSentenceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const translationLines = Array.from(container.querySelectorAll('[data-translation-line="true"]'));
        expect(translationLines.some((node) => node.textContent?.includes("水能帮助根部保持强壮。"))).toBe(true);
        expect(translationLines.some((node) => node.textContent?.includes("水有助于让根系保持稳固。"))).toBe(false);
        expect(getPhraseTags(container)).toHaveLength(0);
    });

    it("keeps the translation-mode sentence translation as the higher-priority line once that sentence is analyzed", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [
                            {
                                source: "sunlight and water",
                                translation: "阳光和水分",
                            },
                        ],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [
                            {
                                source: "stay strong",
                                translation: "保持强壮",
                            },
                        ],
                    },
                ],
            }),
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                mode: "basic",
                results: [
                    {
                        sentence: "Water helps roots stay strong.",
                        cacheKey: buildGrammarCacheKey({
                            text: "Water helps roots stay strong.",
                            mode: "basic",
                            promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
                            model: "deepseek:deepseek-v4-flash:thinking=off:reasoning=off",
                        }),
                        data: {
                            mode: "basic",
                            difficult_sentences: [
                                {
                                    sentence: "Water helps roots stay strong.",
                                    translation: "水有助于让根系保持稳固。",
                                    highlights: [
                                        { substring: "Water", type: "主语", explanation: "主语。" },
                                    ],
                                },
                            ],
                        },
                    },
                ],
            }),
        });

        try {
            const container = await renderCard({
                text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
            });
            const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));
            const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
            expect(grammarButton).toBeTruthy();
            expect(translateButton).toBeTruthy();

            await act(async () => {
                grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });
            await act(async () => {
                translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });
            await act(async () => {
                await Promise.resolve();
            });

            expect(getTranslationAsides(container)).toHaveLength(2);
            let translationLines = Array.from(container.querySelectorAll('[data-translation-line="true"]'));
            expect(translationLines).toHaveLength(2);
            expect(translationLines[1]?.textContent).toContain("水能帮助根部保持强壮。");

            const sentenceButtons = Array.from(container.querySelectorAll("button")).filter((button) =>
                (button.getAttribute("aria-label") ?? "").includes("第 2 句"),
            );
            expect(sentenceButtons[0]).toBeTruthy();

            await act(async () => {
                sentenceButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                vi.advanceTimersByTime(260);
            });
            await act(async () => {
                await Promise.resolve();
            });

            translationLines = Array.from(container.querySelectorAll('[data-translation-line="true"]'));
            expect(translationLines).toHaveLength(2);
            expect(translationLines[1]?.textContent).toContain("水能帮助根部保持强壮。");
            const phraseBlocks = Array.from(container.querySelectorAll('[data-translation-phrases="true"]'));
            expect(phraseBlocks).toHaveLength(1);
            expect(getPhraseTags(container)).toHaveLength(1);
            expect(container.textContent).not.toContain("stay strong");
            expect(container.textContent).not.toContain("水能帮助根部保持强壮。水能帮助根部保持强壮。");
        } finally {
            vi.useRealTimers();
        }
    });

    it("opens the existing word popup payload when a phrase translation tag is clicked", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [
                            {
                                source: "sunlight and water",
                                translation: "阳光和水分",
                            },
                        ],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [
                            {
                                source: "stay strong",
                                translation: "保持强壮",
                            },
                        ],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const onOpenWordPopupFromSelection = vi.fn();

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
            articleTitle: "Photosynthesis basics",
            articleUrl: "https://example.com/photosynthesis",
            onOpenWordPopupFromSelection,
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        await act(async () => {
            await Promise.resolve();
        });

        const phraseTags = getPhraseTags(container);
        expect(phraseTags).toHaveLength(2);

        await act(async () => {
            phraseTags[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onOpenWordPopupFromSelection).toHaveBeenCalledTimes(1);
        expect(onOpenWordPopupFromSelection).toHaveBeenCalledWith(expect.objectContaining({
            word: "sunlight and water",
            context: "Plants need sunlight and water to grow.",
            articleUrl: "https://example.com/photosynthesis",
            sourceKind: "read",
            sourceLabel: "来自 Read",
            sourceSentence: "Plants need sunlight and water to grow.",
            sourceNote: "Photosynthesis basics",
            initialDefinition: expect.objectContaining({
                context_meaning: {
                    definition: "在该句中指：阳光和水分",
                    translation: "阳光和水分",
                },
                meaning_groups: [{ pos: "phr.", meanings: ["阳光和水分"] }],
                highlighted_meanings: ["阳光和水分"],
            }),
        }));
    });

    it("renders inline wavy phrases in translation mode when phrase display mode is inline_wavy", async () => {
        readingSettingsMock.phraseDisplayMode = "inline_wavy";
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [
                            {
                                source: "sunlight and water",
                                translation: "阳光和水分",
                            },
                        ],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [
                            {
                                source: "stay strong",
                                translation: "保持强壮",
                            },
                        ],
                    },
                ],
            }),
        });

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(getPhraseTags(container)).toHaveLength(0);
        const inlinePhraseTriggers = getInlinePhraseTriggers(container);
        expect(inlinePhraseTriggers).toHaveLength(2);
        expect(inlinePhraseTriggers[0]?.textContent).toContain("sunlight and water");
        expect(inlinePhraseTriggers[1]?.textContent).toContain("stay strong");
    });

    it("inherits reading typography and uses a continuous inline phrase line in mode 2", async () => {
        readingSettingsMock.phraseDisplayMode = "inline_wavy";
        readingSettingsMock.fontSizeClass = "text-2xl";
        readingSettingsMock.fontClass = "font-[Arial,sans-serif]";
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [
                            {
                                source: "sunlight and water",
                                translation: "阳光和水分",
                            },
                        ],
                    },
                ],
            }),
        });

        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const inlineSentence = container.querySelector<HTMLElement>('[data-translation-inline-phrases="true"]');
        expect(inlineSentence).toBeTruthy();
        expect(inlineSentence?.className).not.toContain("font-serif");
        expect(inlineSentence?.className).not.toContain("text-[15px]");
        expect(inlineSentence?.style.font).toBe("inherit");

        const phraseVisual = inlineSentence?.querySelector<HTMLElement>('span[aria-label]');
        expect(phraseVisual).toBeTruthy();
        expect(phraseVisual?.style.textDecorationLine).toBe("underline");
        expect(phraseVisual?.style.textDecorationStyle).toBe("solid");
        expect(phraseVisual?.style.textDecorationSkipInk).toBe("none");
        expect(phraseVisual?.style.borderBottom).toBe("");
    });

    it("lets inline phrase highlights fall through to the single-word click handler", async () => {
        readingSettingsMock.phraseDisplayMode = "inline_wavy";
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [
                            {
                                source: "sunlight and water",
                                translation: "阳光和水分",
                            },
                        ],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [
                            {
                                source: "stay strong",
                                translation: "保持强壮",
                            },
                        ],
                    },
                ],
            }),
        });
        const onWordClick = vi.fn();

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
            articleTitle: "Photosynthesis basics",
            articleUrl: "https://example.com/photosynthesis",
            onWordClick,
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const inlinePhraseTriggers = getInlinePhraseTriggers(container);
        expect(inlinePhraseTriggers).toHaveLength(2);

        await act(async () => {
            inlinePhraseTriggers[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onWordClick).toHaveBeenCalledTimes(1);
    });

    it("shows an inline hover card save action for wavy phrases", async () => {
        readingSettingsMock.phraseDisplayMode = "inline_wavy";
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [
                            {
                                source: "sunlight and water",
                                translation: "阳光和水分",
                            },
                        ],
                    },
                ],
            }),
        });

        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const inlinePhraseTriggers = getInlinePhraseTriggers(container);
        expect(inlinePhraseTriggers).toHaveLength(1);

        await act(async () => {
            inlinePhraseTriggers[0]?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
            await Promise.resolve();
        });

        const hoverCard = container.querySelector('[data-translation-inline-hover-card="open"]');
        expect(hoverCard).toBeTruthy();

        const saveButton = Array.from(hoverCard?.querySelectorAll("button") ?? []).find((button) => button.textContent?.includes("加入生词本"));
        expect(saveButton).toBeTruthy();

        await act(async () => {
            saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(saveVocabulary).toHaveBeenCalledTimes(1);
        expect(vi.mocked(saveVocabulary).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
            word: "sunlight and water",
            translation: "阳光和水分",
            source_sentence: "Plants need sunlight and water to grow.",
        }));
    });

    it("opens the full phrase word popup from the inline hover card", async () => {
        readingSettingsMock.phraseDisplayMode = "inline_wavy";
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [
                            {
                                source: "sunlight and water",
                                translation: "阳光和水分",
                            },
                        ],
                    },
                ],
            }),
        });
        const onOpenWordPopupFromSelection = vi.fn();

        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
            articleTitle: "Photosynthesis basics",
            articleUrl: "https://example.com/photosynthesis",
            onOpenWordPopupFromSelection,
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const inlinePhraseTriggers = getInlinePhraseTriggers(container);
        expect(inlinePhraseTriggers).toHaveLength(1);

        await act(async () => {
            inlinePhraseTriggers[0]?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
            await Promise.resolve();
        });

        const hoverCard = container.querySelector('[data-translation-inline-hover-card="open"]');
        expect(hoverCard).toBeTruthy();

        const inspectButton = Array.from(hoverCard?.querySelectorAll("button") ?? []).find((button) => button.textContent?.includes("查看短语"));
        expect(inspectButton).toBeTruthy();

        await act(async () => {
            inspectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onOpenWordPopupFromSelection).toHaveBeenCalledTimes(1);
        expect(onOpenWordPopupFromSelection).toHaveBeenCalledWith(expect.objectContaining({
            word: "sunlight and water",
            context: "Plants need sunlight and water to grow.",
            articleUrl: "https://example.com/photosynthesis",
            sourceKind: "read",
            sourceLabel: "来自 Read",
            sourceSentence: "Plants need sunlight and water to grow.",
            sourceNote: "Photosynthesis basics",
            initialDefinition: expect.objectContaining({
                context_meaning: {
                    definition: "在该句中指：阳光和水分",
                    translation: "阳光和水分",
                },
                meaning_groups: [{ pos: "phr.", meanings: ["阳光和水分"] }],
                highlighted_meanings: ["阳光和水分"],
            }),
        }));
    });

    it("keeps the inline hover card open while moving from the phrase highlight into the card", async () => {
        readingSettingsMock.phraseDisplayMode = "inline_wavy";
        vi.useFakeTimers();
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [
                            {
                                source: "sunlight and water",
                                translation: "阳光和水分",
                            },
                        ],
                    },
                ],
            }),
        });

        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const inlinePhraseTriggers = getInlinePhraseTriggers(container);
        expect(inlinePhraseTriggers).toHaveLength(1);

        await act(async () => {
            inlinePhraseTriggers[0]?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
            await Promise.resolve();
        });

        const hoverCard = container.querySelector<HTMLElement>('[data-translation-inline-hover-card="open"]');
        expect(hoverCard).toBeTruthy();

        await act(async () => {
            inlinePhraseTriggers[0]?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: hoverCard ?? undefined }));
            hoverCard?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: inlinePhraseTriggers[0] ?? undefined }));
            vi.advanceTimersByTime(180);
        });

        expect(container.querySelector('[data-translation-inline-hover-card="open"]')).toBeTruthy();

        const saveButton = Array.from(hoverCard?.querySelectorAll("button") ?? []).find((button) => button.textContent?.includes("加入生词本"));
        expect(saveButton).toBeTruthy();

        await act(async () => {
            saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(saveVocabulary).toHaveBeenCalledTimes(1);
    });

    it("clicking grammar only expands the sentence list and does not auto-request analysis", async () => {
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));

        expect(grammarButton).toBeTruthy();

        await act(async () => {
            grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(container.textContent).toContain("1");
        expect(container.textContent).toContain("2");
        expect(container.textContent).toContain("Plants need sunlight and water to grow.");
        expect(container.textContent).toContain("Water helps roots stay strong.");
    });

    it("micro-batches rapid sentence clicks into a single request", async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                mode: "basic",
                results: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        cacheKey: "grammar:basic:sentence-1",
                        data: {
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
                        },
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        cacheKey: "grammar:basic:sentence-2",
                        data: {
                            mode: "basic",
                            tags: ["主语", "谓语"],
                            overview: "句子主干完整。",
                            difficult_sentences: [
                                {
                                    sentence: "Water helps roots stay strong.",
                                    translation: "水能帮助根部保持强壮。",
                                    highlights: [
                                        {
                                            substring: "Water",
                                            type: "主语",
                                            explanation: "结构判断：Water 作主语；句中作用：发出 helps 这一动作。",
                                            segment_translation: "水",
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            const container = await renderCard({
                text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
            });
            const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));
            expect(grammarButton).toBeTruthy();

            await act(async () => {
                grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            const sentenceButtons = Array.from(container.querySelectorAll("button")).filter((button) => {
                const label = button.getAttribute("aria-label") ?? "";
                return label === "第 1 句" || label === "第 2 句";
            });
            expect(sentenceButtons).toHaveLength(2);

            await act(async () => {
                sentenceButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                sentenceButtons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            await act(async () => {
                vi.advanceTimersByTime(260);
            });

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [, requestInit] = fetchMock.mock.calls[0];
            const payload = JSON.parse(String(requestInit.body));
            expect(payload.sentences).toEqual([
                "Plants need sunlight and water to grow.",
                "Water helps roots stay strong.",
            ]);
        } finally {
            vi.useRealTimers();
        }
    });

    it("already analyzed sentence click only toggles display without refetching", async () => {
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

        const sentenceButton = Array.from(container.querySelectorAll("button")).find((button) => (button.getAttribute("aria-label") ?? "").includes("第 1 句"));
        expect(sentenceButton).toBeTruthy();

        await act(async () => {
            sentenceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(container.textContent).toContain("植物需要阳光和水才能生长。");

        await act(async () => {
            sentenceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows a per-sentence retry button after analysis and force-regenerates on click", async () => {
        vi.useFakeTimers();
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    mode: "basic",
                    results: [
                        {
                            sentence: "Plants need sunlight and water to grow.",
                            cacheKey: "grammar:basic:sentence-1",
                            data: {
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
                            },
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    mode: "basic",
                    results: [
                        {
                            sentence: "Plants need sunlight and water to grow.",
                            cacheKey: "grammar:basic:sentence-1",
                            data: {
                                mode: "basic",
                                tags: ["主语", "谓语"],
                                overview: "已重新生成。",
                                difficult_sentences: [
                                    {
                                        sentence: "Plants need sunlight and water to grow.",
                                        translation: "植物要依靠阳光和水分来生长。",
                                        highlights: [
                                            {
                                                substring: "Plants",
                                                type: "主语",
                                                explanation: "结构判断：Plants 作主语；句中作用：发出 grow 相关动作。",
                                                segment_translation: "植物",
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    ],
                }),
            });
        vi.stubGlobal("fetch", fetchMock);

        try {
            const container = await renderCard({
                text: "Plants need sunlight and water to grow.",
            });
            const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));
            expect(grammarButton).toBeTruthy();

            await act(async () => {
                grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            const sentenceButton = Array.from(container.querySelectorAll("button")).find((button) => (button.getAttribute("aria-label") ?? "").includes("第 1 句"));
            expect(sentenceButton).toBeTruthy();

            await act(async () => {
                sentenceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                vi.advanceTimersByTime(260);
            });

            await act(async () => {
                await Promise.resolve();
            });

            const retryButton = Array.from(container.querySelectorAll("button")).find((button) => (button.getAttribute("aria-label") ?? "").includes("重新生成第 1 句解析"));
            expect(retryButton).toBeTruthy();
            expect(fetchMock).toHaveBeenCalledTimes(1);

            await act(async () => {
                retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                vi.advanceTimersByTime(260);
            });

            await act(async () => {
                await Promise.resolve();
            });

            expect(fetchMock).toHaveBeenCalledTimes(2);
            const [, retryRequestInit] = fetchMock.mock.calls[1];
            const retryPayload = JSON.parse(String(retryRequestInit.body));
            expect(retryPayload.sentences).toEqual(["Plants need sunlight and water to grow."]);
            expect(retryPayload.forceRegenerate).toBe(true);
            expect(container.textContent).toContain("植物要依靠阳光和水分来生长。");
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not trigger grammar analysis when clicking sentence text", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("fetch", fetchMock);

        try {
            const container = await renderCard({
                text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
            });
            const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));
            expect(grammarButton).toBeTruthy();

            await act(async () => {
                grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            const sentenceText = Array.from(container.querySelectorAll("li div"))
                .find((node) => node.textContent?.includes("Plants need sunlight and water to grow."));
            expect(sentenceText).toBeTruthy();

            await act(async () => {
                sentenceText?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                vi.advanceTimersByTime(260);
            });

            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("shows retry affordance and stops spinner when grammar sentence analysis fails", async () => {
        vi.useFakeTimers();
        fetchMock.mockRejectedValueOnce(new Error("语法分析暂时不可用，请稍后重试。"));
        vi.stubGlobal("fetch", fetchMock);

        try {
            const container = await renderCard({
                text: "Plants need sunlight and water to grow.",
            });
            const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));
            expect(grammarButton).toBeTruthy();

            await act(async () => {
                grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            const sentenceButton = Array.from(container.querySelectorAll("button")).find((button) => (button.getAttribute("aria-label") ?? "").includes("第 1 句"));
            expect(sentenceButton).toBeTruthy();

            await act(async () => {
                sentenceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                vi.advanceTimersByTime(260);
            });

            await act(async () => {
                await Promise.resolve();
            });

            const retryButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("重试"));
            expect(retryButton).toBeTruthy();
            expect(container.textContent).toContain("语法分析暂时不可用");
            expect(sentenceButton?.textContent).toContain("1");
        } finally {
            vi.useRealTimers();
        }
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

    it("opens the right-side ask dock with paragraph context instead of rendering the old bottom ask panel", async () => {
        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
            paragraphOrder: 3,
        });

        const askButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("Ask AI"));
        expect(askButton).toBeTruthy();

        await act(async () => {
            askButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.textContent).not.toContain("向 AI 自由提问当前段落内容");

        const dock = document.body.querySelector('[data-selection-ask-dock="true"]');
        expect(dock).toBeTruthy();
        const contextCard = document.body.querySelector('[data-ask-context-card="true"]');
        expect(contextCard?.textContent).toContain("整段上下文");
        expect(contextCard?.textContent).toContain("第 3 段");
        expect(contextCard?.textContent).toContain("Plants need sunlight and water to grow.");
        expect(fetchMock).not.toHaveBeenCalledWith("/api/ai/ask", expect.anything());
    });

    it("uses parent-resolved selected context when paragraph Ask is opened with an active selection", async () => {
        decodeAskThreadPayloadMock.mockReturnValue({
            messages: [
                { role: "user", content: "旧整段问题", createdAt: 1 },
                { role: "assistant", content: "旧整段回答", createdAt: 2 },
            ],
            contextAttachment: {
                id: "ask-context:p2:0-39",
                kind: "paragraph",
                label: "整段上下文",
                rangeLabel: "第 2 段",
                text: "Plants need sunlight and water to grow.",
                excerpt: "Plants need sunlight and water to grow.",
                paragraphRanges: [{
                    paragraphOrder: 2,
                    paragraphBlockIndex: 0,
                    startOffset: 0,
                    endOffset: 39,
                    text: "Plants need sunlight and water to grow.",
                    paragraphText: "Plants need sunlight and water to grow.",
                }],
            },
        });
        const resolvedContext = {
            id: "ask-context:2:0-5|3:0-6",
            kind: "cross_paragraph" as const,
            label: "跨段选区",
            rangeLabel: "第 2-3 段",
            text: "First Second",
            excerpt: "First Second",
            paragraphRanges: [
                {
                    paragraphOrder: 2,
                    paragraphBlockIndex: 1,
                    startOffset: 0,
                    endOffset: 5,
                    text: "First",
                    paragraphText: "First paragraph.",
                },
                {
                    paragraphOrder: 3,
                    paragraphBlockIndex: 2,
                    startOffset: 0,
                    endOffset: 6,
                    text: "Second",
                    paragraphText: "Second paragraph.",
                },
            ],
        };
        const onOpenAskWithContext = vi.fn(() => resolvedContext);
        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
            paragraphOrder: 2,
            onOpenAskWithContext,
        });

        const askButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("Ask AI"));
        expect(askButton).toBeTruthy();

        await act(async () => {
            askButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onOpenAskWithContext).toHaveBeenCalledTimes(1);
        const contextCard = document.body.querySelector('[data-ask-context-card="true"]');
        expect(contextCard?.textContent).toContain("跨段选区");
        expect(contextCard?.textContent).toContain("第 2-3 段");
        expect(contextCard?.textContent).toContain("First Second");
        expect(document.body.textContent).not.toContain("旧整段问题");
    });

    it("turns paragraph Ask into context injection when a global ask dock is already open", async () => {
        const onOpenAskWithContext = vi.fn((attachment) => attachment);
        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
            paragraphOrder: 4,
            hasActiveAskDock: true,
            onOpenAskWithContext,
        });

        const injectButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("植入上下文"));
        expect(injectButton).toBeTruthy();

        await act(async () => {
            injectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onOpenAskWithContext).toHaveBeenCalledWith(expect.objectContaining({
            kind: "paragraph",
            label: "整段上下文",
            rangeLabel: "第 4 段",
            text: "Plants need sunlight and water to grow.",
        }));
        expect(document.body.querySelector('[data-selection-ask-dock="true"]')).toBeNull();
    });

    it("keeps multi-select action popup visible instead of auto injecting into an existing Ask dock", async () => {
        vi.mocked(await import("./selection-helpers")).hasMeaningfulTextSelection?.mockImplementation?.(() => true);
        const onOpenAskWithContext = vi.fn((attachment) => attachment);
        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
            paragraphOrder: 4,
            hasActiveAskDock: true,
            onOpenAskWithContext,
        });
        const paragraphText = container.querySelector<HTMLElement>('[data-paragraph-text="true"]');
        expect(paragraphText?.firstChild).toBeTruthy();

        const startRange = createRangeAtTextOffset(paragraphText!, 0);
        const endRange = createRangeAtTextOffset(paragraphText!, 6);
        const range = document.createRange();
        range.setStart(startRange.startContainer, startRange.startOffset);
        range.setEnd(endRange.startContainer, endRange.startOffset);
        Object.defineProperty(range, "getBoundingClientRect", {
            configurable: true,
            value: () => new DOMRect(120, 140, 96, 22),
        });
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        await act(async () => {
            paragraphText?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        });

        expect(onOpenAskWithContext).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("向AI提问");
        expect(document.body.querySelector('[data-selection-ask-dock="true"]')).toBeNull();
        selection?.removeAllRanges();
    });

    it("keeps the current Ask conversation when injecting a new external context", async () => {
        const text = "Plants need sunlight and water to grow.";
        const existingContext = {
            id: "ask-context:p1:0-39",
            kind: "paragraph" as const,
            label: "整段上下文",
            rangeLabel: "第 1 段",
            text,
            excerpt: text,
            paragraphRanges: [{
                paragraphOrder: 1,
                paragraphBlockIndex: 0,
                startOffset: 0,
                endOffset: text.length,
                text,
                paragraphText: text,
            }],
        };
        const injectedContext = {
            id: "ask-context:p9:0-22",
            kind: "paragraph" as const,
            label: "整段上下文",
            rangeLabel: "第 9 段",
            text: "New paragraph context.",
            excerpt: "New paragraph context.",
            paragraphRanges: [{
                paragraphOrder: 9,
                paragraphBlockIndex: 8,
                startOffset: 0,
                endOffset: 22,
                text: "New paragraph context.",
                paragraphText: "New paragraph context.",
            }],
        };

        decodeAskThreadPayloadMock.mockReturnValue({
            messages: [
                { role: "user", content: "旧整段问题", createdAt: 1 },
                { role: "assistant", content: "旧整段回答", createdAt: 2 },
            ],
            contextAttachment: existingContext,
        });

        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        mountedRoots.push(root);
        const baseProps: React.ComponentProps<typeof ParagraphCard> = {
            text,
            index: 0,
            paragraphOrder: 1,
            articleTitle: "Sample article",
            articleUrl: "https://example.com/article",
            onWordClick: vi.fn(),
            readingNotes: [{
                id: 201,
                article_key: "reading::sample",
                selected_text: text,
                note_text: "encoded-thread",
                mark_type: "ask",
                start_offset: 0,
                end_offset: text.length,
                created_at: Date.now(),
                updated_at: Date.now(),
            }],
        };

        await act(async () => {
            root.render(<ParagraphCard {...baseProps} />);
        });

        const askButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("Ask AI"));
        expect(askButton).toBeTruthy();

        await act(async () => {
            askButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(document.body.textContent).toContain("旧整段问题");
        expect(document.body.textContent).toContain("旧整段回答");

        await act(async () => {
            root.render(
                <ParagraphCard
                    {...baseProps}
                    hasActiveAskDock
                    askContextAttachment={injectedContext}
                />,
            );
        });

        const contextCard = document.body.querySelector('[data-ask-context-card="true"]');
        expect(contextCard?.textContent).toContain("第 9 段");
        expect(contextCard?.textContent).toContain("New paragraph context.");
        expect(document.body.textContent).toContain("旧整段问题");
        expect(document.body.textContent).toContain("旧整段回答");
    });

    it("sends Ask-specific thinking controls with the Ask AI request", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            headers: new Headers(),
            body: {
                getReader: () => ({
                    read: vi.fn()
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode("data: {\"content\":\"Answer.\"}\n\n"),
                        })
                        .mockResolvedValueOnce({ done: true, value: undefined }),
                    releaseLock: vi.fn(),
                }),
            },
        });
        vi.stubGlobal("fetch", fetchMock);
        queryAskRelevantVocabularyMock.mockResolvedValueOnce({ vocabulary: [] });
        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
            paragraphOrder: 1,
        });

        const askButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("Ask AI"));
        await act(async () => {
            askButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const thinkingToggle = document.body.querySelector<HTMLButtonElement>('[data-ask-thinking-toggle="true"]');
        expect(thinkingToggle).toBeTruthy();
        await act(async () => {
            thinkingToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const highReasoningButton = document.body.querySelector<HTMLButtonElement>('[data-ask-reasoning-effort="high"]');
        expect(highReasoningButton).toBeTruthy();
        await act(async () => {
            highReasoningButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const input = document.body.querySelector<HTMLInputElement>('input[placeholder="针对选中文本提问..."]');
        expect(input).toBeTruthy();
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "解释这一段");
            input?.dispatchEvent(new Event("input", { bubbles: true }));
        });

        const sendButton = document.body.querySelector<HTMLButtonElement>('[data-selection-ask-send="true"]');
        await act(async () => {
            sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const [, requestInit] = fetchMock.mock.calls[0];
        const payload = JSON.parse(String(requestInit.body));
        expect(payload.askThinkingMode).toBe("on");
        expect(payload.askReasoningEffort).toBe("high");
    });

    it("persists cross-paragraph ask threads to every involved paragraph range", async () => {
        const onCreateReadingNote = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            headers: new Headers(),
            body: {
                getReader: () => ({
                    read: vi.fn()
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode("data: {\"content\":\"Answer.\"}\n\n"),
                        })
                        .mockResolvedValueOnce({ done: true, value: undefined }),
                    releaseLock: vi.fn(),
                }),
            },
        });
        queryAskRelevantVocabularyMock.mockResolvedValueOnce({ vocabulary: [] });
        const contextAttachment = {
            id: "ask-context:1:0-6|2:0-7",
            kind: "cross_paragraph" as const,
            label: "跨段选区",
            rangeLabel: "第 1-2 段",
            text: "Plants Another",
            excerpt: "Plants Another",
            paragraphRanges: [
                {
                    paragraphOrder: 1,
                    paragraphBlockIndex: 0,
                    startOffset: 0,
                    endOffset: 6,
                    text: "Plants",
                    paragraphText: "Plants need sunlight and water to grow.",
                },
                {
                    paragraphOrder: 2,
                    paragraphBlockIndex: 1,
                    startOffset: 0,
                    endOffset: 7,
                    text: "Another",
                    paragraphText: "Another paragraph continues the idea.",
                },
            ],
        };
        const container = await renderCard({
            text: "Plants need sunlight and water to grow.",
            paragraphOrder: 1,
            askContextAttachment: contextAttachment,
            onCreateReadingNote,
        });

        const input = document.body.querySelector<HTMLInputElement>('input[placeholder="针对选中文本提问..."]');
        expect(input).toBeTruthy();

        await act(async () => {
            input?.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "为什么跨段？" }));
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "为什么跨段？");
            input?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        const sendButton = document.body.querySelector<HTMLButtonElement>('[data-selection-ask-send="true"]');
        expect(sendButton).toBeTruthy();

        await act(async () => {
            sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onCreateReadingNote).toHaveBeenCalledWith(expect.objectContaining({
            paragraphOrder: 1,
            paragraphBlockIndex: 0,
            selectedText: "Plants",
            markType: "ask",
            startOffset: 0,
            endOffset: 6,
        }));
        expect(onCreateReadingNote).toHaveBeenCalledWith(expect.objectContaining({
            paragraphOrder: 2,
            paragraphBlockIndex: 1,
            selectedText: "Another",
            markType: "ask",
            startOffset: 0,
            endOffset: 7,
        }));

        expect(container.textContent).toContain("Plants need sunlight and water to grow.");
    });

    it("clears the Ask context card and sends a paragraph-only ask without selection", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            headers: new Headers(),
            body: {
                getReader: () => ({
                    read: vi.fn()
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode("data: {\"content\":\"Answer.\"}\n\n"),
                        })
                        .mockResolvedValueOnce({ done: true, value: undefined }),
                    releaseLock: vi.fn(),
                }),
            },
        });
        vi.stubGlobal("fetch", fetchMock);
        queryAskRelevantVocabularyMock.mockResolvedValueOnce({ vocabulary: [] });

        const contextAttachment = {
            id: "ask-context:1:0-6",
            kind: "selection" as const,
            label: "选中文本",
            rangeLabel: "第 1 段",
            text: "Plants",
            excerpt: "Plants",
            paragraphRanges: [{
                paragraphOrder: 1,
                paragraphBlockIndex: 0,
                startOffset: 0,
                endOffset: 6,
                text: "Plants",
                paragraphText: "Plants need sunlight and water to grow.",
            }],
        };
        await renderCard({
            text: "Plants need sunlight and water to grow.",
            paragraphOrder: 1,
            askContextAttachment: contextAttachment,
        });

        const clearButton = document.body.querySelector<HTMLButtonElement>('[data-ask-context-clear="true"]');
        expect(clearButton).toBeTruthy();

        await act(async () => {
            clearButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(document.body.querySelector('[data-ask-context-card="true"]')).toBeNull();

        const input = document.body.querySelector<HTMLInputElement>('input[placeholder="针对选中文本提问..."], input[placeholder="输入你的问题..."]');
        expect(input).toBeTruthy();
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "解释这一段");
            input?.dispatchEvent(new Event("input", { bubbles: true }));
        });

        const sendButton = document.body.querySelector<HTMLButtonElement>('[data-selection-ask-send="true"]');
        await act(async () => {
            sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const [, requestInit] = fetchMock.mock.calls[0];
        const payload = JSON.parse(String(requestInit.body));
        expect(payload.text).toBe("Plants need sunlight and water to grow.");
        expect(payload.selection).toBe("");
        expect(queryAskRelevantVocabularyMock).toHaveBeenCalledWith({
            paragraph: "Plants need sunlight and water to grow.",
            question: "解释这一段",
            selection: "Plants need sunlight and water to grow.",
        });
    });

    it("includes retrieved vocab memory when auto-asking from a sentence badge", async () => {
        const text = "Research shows that sleep helps solidify new memories.";
        const onOpenAskWithContext = vi.fn((attachment) => attachment);
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

        const container = await renderCard({ text, paragraphOrder: 5, onOpenAskWithContext });
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

        expect(onOpenAskWithContext).toHaveBeenCalledWith(expect.objectContaining({
            kind: "sentence",
            label: "句子上下文",
            rangeLabel: "第 5 段",
            text,
        }));
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
            5500,
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

    it("renders sentence play buttons at the end of each translated sentence", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const sentencePlayButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label^="播放第 "]'));
        expect(sentencePlayButtons).toHaveLength(2);
        expect(sentencePlayButtons[0]?.getAttribute("aria-label")).toContain("第 1 句");
        expect(sentencePlayButtons[1]?.getAttribute("aria-label")).toContain("第 2 句");
    });

    it("warms up sentence audio as soon as translation sentence mode is expanded", async () => {
        installFakeAudio(10);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(vi.mocked(requestTtsPayload).mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(vi.mocked(requestTtsPayload).mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
            "Plants need sunlight and water to grow.",
            "Water helps roots stay strong.",
        ]));
    });

    it("keeps sentence playback inline and only reveals right-side speed/cancel controls while that sentence is playing", async () => {
        installFakeAudio(10);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(speakingButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="speaking-panel"]')).toBeNull();
        expect(container.querySelector('button[aria-label="第 1 句切换倍速"]')).toBeNull();
        expect(container.querySelector('button[aria-label="取消第 1 句播放"]')).toBeNull();

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(playButton).toBeTruthy();

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.querySelector('[data-testid="speaking-panel"]')).toBeNull();

        const speedButton = container.querySelector<HTMLButtonElement>('button[aria-label="第 1 句切换倍速"]');
        const cancelButton = container.querySelector<HTMLButtonElement>('button[aria-label="取消第 1 句播放"]');
        expect(speedButton).toBeTruthy();
        expect(cancelButton).toBeTruthy();
        expect(speedButton?.textContent).toContain("1x");

        await act(async () => {
            speedButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(useTtsMock.setPlaybackRate).toHaveBeenCalledWith(0.75);

        await act(async () => {
            cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.querySelector('button[aria-label="第 1 句切换倍速"]')).toBeNull();
        expect(container.querySelector('button[aria-label="取消第 1 句播放"]')).toBeNull();
    });

    it("keeps the cancel button available after sentence playback ends", async () => {
        const audioInstances = installFakeAudio(10);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(playButton).toBeTruthy();

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        await act(async () => {
            audioInstances[0]!.ended = true;
            audioInstances[0]!.paused = true;
            audioInstances[0]!.onended?.(new Event("ended"));
        });

        expect(container.querySelector('button[aria-label="取消第 1 句播放"]')).toBeTruthy();
        expect(container.querySelector('button[aria-label="第 1 句切换倍速"]')).toBeNull();
    });

    it("replays the current sentence from the beginning when space is pressed in sentence mode", async () => {
        const audioInstances = installFakeAudio(10);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const container = await renderCard({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(playButton).toBeTruthy();

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        audioInstances[0]!.currentTime = 4;
        audioInstances[0]!.ended = true;
        audioInstances[0]!.paused = true;

        await act(async () => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
        });

        expect(audioInstances[0]?.currentTime).toBe(0);
        expect(audioInstances[0]?.paused).toBe(false);
    });

    it("plays and seeks within a translated sentence from the sentence-level controls", async () => {
        const audioInstances = installFakeAudio(5);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const text = "Plants need sunlight and water to grow. Water helps roots stay strong.";
        const container = await renderCard({ text });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(speakingButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(playButton).toBeTruthy();

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
        expect(audioInstances).toHaveLength(1);
        expect(audioInstances[0]?.currentTime).toBeCloseTo((clickOffset / firstSentenceLength) * 5, 4);
    });

    it("seeks translated sentence playback when clicking fallback characters without caret APIs", async () => {
        const audioInstances = installFakeAudio(10);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const sentence = "Plants need sunlight and water to grow.";
        const container = await renderCard({ text: sentence });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(speakingButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(playButton).toBeTruthy();

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        Object.defineProperty(document, "caretPositionFromPoint", {
            configurable: true,
            value: undefined,
        });
        Object.defineProperty(document, "caretRangeFromPoint", {
            configurable: true,
            value: undefined,
        });

        const targetChar = container.querySelector<HTMLElement>('[data-speaking-segment-index="0"] [data-ktv-char-index="7"]');
        expect(targetChar).toBeTruthy();

        await act(async () => {
            targetChar?.dispatchEvent(new MouseEvent("click", {
                bubbles: true,
                clientX: 200,
                clientY: 80,
            }));
        });

        expect(audioInstances).toHaveLength(1);
        expect(audioInstances[0]?.currentTime).toBeCloseTo((7 / sentence.length) * 10, 4);
    });

    it("still seeks translated sentence playback when clicking sentence body without caret APIs", async () => {
        const audioInstances = installFakeAudio(10);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const sentence = "Plants need sunlight and water to grow.";
        const container = await renderCard({ text: sentence });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(speakingButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(playButton).toBeTruthy();

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        Object.defineProperty(document, "caretPositionFromPoint", {
            configurable: true,
            value: undefined,
        });
        Object.defineProperty(document, "caretRangeFromPoint", {
            configurable: true,
            value: undefined,
        });

        const sentenceContent = container.querySelector<HTMLElement>('[data-speaking-segment-index="0"] [data-speaking-segment-content="true"]');
        expect(sentenceContent).toBeTruthy();

        await act(async () => {
            sentenceContent?.dispatchEvent(new MouseEvent("click", {
                bubbles: true,
                clientX: 240,
                clientY: 90,
            }));
        });

        expect(audioInstances).toHaveLength(1);
        expect(audioInstances[0]?.currentTime).toBeGreaterThan(0);
    });

    it("queues a seek for a newly playing sentence until its metadata is available", async () => {
        const audioInstances = installDeferredMetadataAudio(10);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const text = "Plants need sunlight and water to grow. Water helps roots stay strong.";
        const container = await renderCard({ text });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(speakingButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(playButton).toBeTruthy();

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const secondSentenceBody = container.querySelector<HTMLElement>('[data-speaking-segment-index="1"] [data-speaking-segment-content="true"]');
        expect(secondSentenceBody).toBeTruthy();

        const clickOffset = 8;
        const clickRange = createRangeAtTextOffset(secondSentenceBody!, clickOffset);
        Object.defineProperty(document, "caretRangeFromPoint", {
            configurable: true,
            value: vi.fn(() => clickRange),
        });

        await act(async () => {
            secondSentenceBody?.dispatchEvent(new MouseEvent("click", {
                bubbles: true,
                clientX: 260,
                clientY: 92,
            }));
        });

        expect(audioInstances).toHaveLength(2);
        expect(audioInstances[1]?.currentTime).toBe(0);

        await act(async () => {
            audioInstances[1]?.triggerLoadedMetadata();
        });

        expect(audioInstances[1]?.currentTime).toBeCloseTo((clickOffset / (secondSentenceBody!.textContent?.length ?? 1)) * 10, 4);
    });

    it("queues same-sentence body clicks until metadata is available", async () => {
        const audioInstances = installDeferredMetadataAudio(10);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const text = "Plants need sunlight and water to grow. Water helps roots stay strong.";
        const container = await renderCard({ text });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(speakingButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(playButton).toBeTruthy();

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const sentenceContent = container.querySelector<HTMLElement>('[data-speaking-segment-index="0"] [data-speaking-segment-content="true"]');
        expect(sentenceContent).toBeTruthy();

        const clickOffset = "Plants need sunlight and ".length + 2;
        const clickRange = createRangeAtTextOffset(sentenceContent!, clickOffset);
        Object.defineProperty(document, "caretRangeFromPoint", {
            configurable: true,
            value: vi.fn(() => clickRange),
        });

        await act(async () => {
            sentenceContent?.dispatchEvent(new MouseEvent("click", {
                bubbles: true,
                clientX: 260,
                clientY: 92,
            }));
        });

        expect(audioInstances).toHaveLength(1);
        expect(audioInstances[0]?.currentTime).toBe(0);

        await act(async () => {
            audioInstances[0]?.triggerLoadedMetadata();
        });

        expect(audioInstances[0]?.currentTime).toBeCloseTo((clickOffset / "Plants need sunlight and water to grow.".length) * 10, 4);
    });

    it("queues same-sentence single word clicks until metadata is available", async () => {
        const audioInstances = installDeferredMetadataAudio(10);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "许多组织举行长达一小时的每周状态会议。",
                sentenceTranslations: [
                    {
                        sentence: "Many organizations hold hour-long weekly status meetings.",
                        translation: "许多组织举行长达一小时的每周状态会议。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);
        vi.mocked(requestTtsPayload).mockResolvedValueOnce({
            audio: "data:audio/mpeg;base64,ZmFrZQ==",
            marks: [
                { time: 0, type: "word", start: 0, end: 200, value: "Many" },
                { time: 210, type: "word", start: 210, end: 520, value: "organizations" },
                { time: 530, type: "word", start: 530, end: 700, value: "hold" },
                { time: 710, type: "word", start: 710, end: 980, value: "hour-long" },
                { time: 990, type: "word", start: 990, end: 1180, value: "weekly" },
                { time: 1190, type: "word", start: 1190, end: 1450, value: "status" },
                { time: 1460, type: "word", start: 1460, end: 1750, value: "meetings" },
            ],
        });

        const container = await renderCard({ text: "Many organizations hold hour-long weekly status meetings." });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(speakingButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(playButton).toBeTruthy();

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const targetWord = Array.from(container.querySelectorAll<HTMLElement>('[data-speaking-segment-index="0"] [data-ktv-word-index]'))
            .find((node) => node.textContent?.trim() === "hour-long");
        expect(targetWord).toBeTruthy();

        await act(async () => {
            targetWord?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(audioInstances).toHaveLength(1);
        expect(audioInstances[0]?.currentTime).toBe(0);

        await act(async () => {
            audioInstances[0]?.triggerLoadedMetadata();
        });

        expect(audioInstances[0]?.currentTime).toBeCloseTo(0.71, 4);
    });

    it("keeps hyphenated words highlighted in sentence playback", async () => {
        const audioInstances = installFakeAudio(10);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "许多组织举行长达一小时的每周状态会议。",
                sentenceTranslations: [
                    {
                        sentence: "Many organizations hold hour-long weekly status meetings.",
                        translation: "许多组织举行长达一小时的每周状态会议。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);
        vi.mocked(requestTtsPayload).mockResolvedValueOnce({
            audio: "data:audio/mpeg;base64,ZmFrZQ==",
            marks: [
                { time: 0, type: "word", start: 0, end: 200, value: "Many" },
                { time: 210, type: "word", start: 210, end: 520, value: "organizations" },
                { time: 530, type: "word", start: 530, end: 700, value: "hold" },
                { time: 710, type: "word", start: 710, end: 980, value: "hour-long" },
                { time: 990, type: "word", start: 990, end: 1180, value: "weekly" },
                { time: 1190, type: "word", start: 1190, end: 1450, value: "status" },
                { time: 1460, type: "word", start: 1460, end: 1750, value: "meetings" },
            ],
        });

        const sentence = "Many organizations hold hour-long weekly status meetings.";
        const container = await renderCard({ text: sentence });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(speakingButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(playButton).toBeTruthy();

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(audioInstances).toHaveLength(1);
        audioInstances[0]!.currentTime = 0.75;

        await act(async () => {
            audioInstances[0]?.ontimeupdate?.(new Event("timeupdate"));
        });

        const highlightedWords = Array.from(container.querySelectorAll<HTMLElement>('[data-speaking-segment-index="0"] [data-ktv-word-index]'))
            .filter((node) => node.className.includes("text-sky-600"))
            .map((node) => node.textContent?.trim());

        expect(highlightedWords).toContain("hour-long");
    });

    it("seeks sentence playback when clicking a highlighted word token", async () => {
        installFakeAudio(10);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "许多组织举行长达一小时的每周状态会议。",
                sentenceTranslations: [
                    {
                        sentence: "Many organizations hold hour-long weekly status meetings.",
                        translation: "许多组织举行长达一小时的每周状态会议。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);
        vi.mocked(requestTtsPayload).mockResolvedValueOnce({
            audio: "data:audio/mpeg;base64,ZmFrZQ==",
            marks: [
                { time: 0, type: "word", start: 0, end: 200, value: "Many" },
                { time: 210, type: "word", start: 210, end: 520, value: "organizations" },
                { time: 530, type: "word", start: 530, end: 700, value: "hold" },
                { time: 710, type: "word", start: 710, end: 980, value: "hour-long" },
                { time: 990, type: "word", start: 990, end: 1180, value: "weekly" },
                { time: 1190, type: "word", start: 1190, end: 1450, value: "status" },
                { time: 1460, type: "word", start: 1460, end: 1750, value: "meetings" },
            ],
        });

        const sentence = "Many organizations hold hour-long weekly status meetings.";
        const container = await renderCard({ text: sentence });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(speakingButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(playButton).toBeTruthy();

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(installFakeAudio).toBeTruthy();
        const targetWord = Array.from(container.querySelectorAll<HTMLElement>('[data-speaking-segment-index="0"] [data-ktv-word-index]'))
            .find((node) => node.textContent?.trim() === "hour-long");
        expect(targetWord).toBeTruthy();

        await act(async () => {
            targetWord?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const activeAudio = (globalThis.Audio as unknown as { mock?: unknown });
        void activeAudio;
        const sentenceAudio = Array.from(container.querySelectorAll('[data-speaking-segment-index="0"] [data-ktv-word-index]'));
        expect(sentenceAudio.length).toBeGreaterThan(0);
    });

    it("keeps grammar refresh affordance while adding a sentence play button", async () => {
        installFakeAudio(8);
        const text = "Plants need sunlight and water to grow.";
        const cacheKey = buildGrammarCacheKey({
            text: text.trim(),
            mode: "basic",
            promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
            model: buildReadingGrammarExecutionSignature({
                ai_provider: "deepseek",
                deepseek_model: "deepseek-v4-flash",
                deepseek_thinking_mode: "off",
                deepseek_reasoning_effort: "high",
            }),
        });

        analysisStoreMock.grammarAnalyses = {
            [cacheKey]: {
                difficult_sentences: [
                    {
                        sentence: text,
                        translation: "植物需要阳光和水才能生长。",
                        highlights: [
                            {
                                substring: "Plants",
                                type: "主语",
                                explanation: "结构判断：Plants 作主语；句中作用：发出 need 这一动作。",
                            },
                        ],
                    },
                ],
            },
        };

        const container = await renderCard({ text });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        const grammarButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("语法"));
        expect(speakingButton).toBeTruthy();
        expect(grammarButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            grammarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const playButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        const refreshButton = container.querySelector<HTMLButtonElement>('button[aria-label="重新生成第 1 句解析"]');

        expect(playButton).toBeTruthy();
        expect(refreshButton).toBeTruthy();

        const actionRail = container.querySelector<HTMLElement>('[data-speaking-segment-index="0"] [data-sentence-action-rail="true"]');
        expect(actionRail).toBeTruthy();
        expect(actionRail?.className).toContain("flex-col");

        await act(async () => {
            playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const secondaryControls = container.querySelector<HTMLElement>('[data-speaking-segment-index="0"] [data-sentence-playback-secondary-controls="true"]');
        expect(secondaryControls).toBeTruthy();
        expect(secondaryControls?.className).toContain("flex-col");
    });

    it("sanitizes cached translation phrase choices before rendering inline highlights", async () => {
        readingSettingsMock.phraseDisplayMode = "inline_wavy";
        analysisStoreMock.translations["The committee tried to consolidate scattered evidence."] = {
            translation: "委员会试图整合分散的证据。",
            sentenceTranslations: [
                {
                    sentence: "The committee tried to consolidate scattered evidence.",
                    translation: "委员会试图整合分散的证据。",
                    phraseTranslations: [
                        {
                            source: "the committee tried to consolidate",
                            translation: "委员会试图去整合",
                        },
                        {
                            source: "consolidate",
                            translation: "整合；巩固",
                        },
                        {
                            source: "the",
                            translation: "这个",
                        },
                    ],
                },
            ],
        };

        const container = await renderCard({
            text: "The committee tried to consolidate scattered evidence.",
        });
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(translateButton).toBeTruthy();

        await act(async () => {
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const inlinePhraseTriggers = getInlinePhraseTriggers(container);
        expect(inlinePhraseTriggers).toHaveLength(1);
        expect(inlinePhraseTriggers[0]?.textContent).toContain("consolidate");
        expect(inlinePhraseTriggers[0]?.textContent).not.toContain("the committee tried to consolidate");
    });

    it("returns to full-paragraph seek after replaying the full track from sentence mode", async () => {
        const audioInstances = installFakeAudio(5);
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                sentenceTranslations: [
                    {
                        sentence: "Plants need sunlight and water to grow.",
                        translation: "植物需要阳光和水才能生长。",
                        phraseTranslations: [],
                    },
                    {
                        sentence: "Water helps roots stay strong.",
                        translation: "水能帮助根部保持强壮。",
                        phraseTranslations: [],
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

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

        const text = "Plants need sunlight and water to grow. Water helps roots stay strong.";
        const container = await renderCard({ text });
        const speakingButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("朗读"));
        const translateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("翻译"));
        expect(speakingButton).toBeTruthy();
        expect(translateButton).toBeTruthy();

        await act(async () => {
            speakingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        const sentencePlayButton = container.querySelector<HTMLButtonElement>('button[aria-label="播放第 1 句"]');
        expect(sentencePlayButton).toBeTruthy();

        await act(async () => {
            sentencePlayButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const fullTrackButton = Array.from(container.querySelectorAll('[data-testid="speaking-panel"] button')).find((button) => button.textContent?.includes("听全部"));
        expect(fullTrackButton).toBeTruthy();

        await act(async () => {
            fullTrackButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const sentenceContent = container.querySelector<HTMLElement>('[data-speaking-segment-index="0"] [data-speaking-segment-content="true"]');
        expect(sentenceContent).toBeTruthy();

        const waterOffset = "Plants need sunlight and water to grow.".indexOf("water") + 2;
        const clickRange = createRangeAtTextOffset(sentenceContent!, waterOffset);

        Object.defineProperty(document, "caretRangeFromPoint", {
            configurable: true,
            value: vi.fn(() => clickRange),
        });

        await act(async () => {
            sentenceContent?.dispatchEvent(new MouseEvent("click", {
                bubbles: true,
                clientX: 180,
                clientY: 60,
            }));
        });

        expect(audioInstances).toHaveLength(1);
        expect(audioInstances[0]?.currentTime).toBe(0);
        expect(useTtsMock.seekToMs).toHaveBeenCalledTimes(1);
        expect(useTtsMock.seekToMs.mock.calls[0]?.[0]).toBe(2000);
    });
});
