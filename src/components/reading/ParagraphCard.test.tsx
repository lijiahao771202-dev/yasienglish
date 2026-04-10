/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParagraphCard } from "./ParagraphCard";

const mountedRoots: Root[] = [];

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
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
    useAnalysisStore: () => ({
        translations: {},
        setTranslation: vi.fn(),
        grammarAnalyses: {},
        setGrammarAnalysis: vi.fn(),
        loadFromDB: vi.fn(),
        loadGrammarFromDB: vi.fn(),
    }),
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
    db: {},
}));

vi.mock("@/lib/tts-client", () => ({
    requestTtsPayload: vi.fn(),
    resolveTtsAudioBlob: vi.fn(),
}));

vi.mock("@/lib/ask-thread", () => ({
    buildAskQaPairs: () => [],
    buildAskThreadPreview: () => "",
    decodeAskThreadPayload: () => null,
    encodeAskThreadPayload: () => "",
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

async function renderCard() {
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
});

describe("ParagraphCard", () => {
    it("does not render a duplicate rewrite mode action in the paragraph toolbar", async () => {
        const container = await renderCard();

        expect(container.textContent).not.toContain("仿写");
    });
});
