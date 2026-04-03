/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VocabItem } from "@/lib/db";
import { GRADUATED_SCHEDULED_DAYS, State } from "@/lib/fsrs";

let liveQueryValue: VocabItem[] | undefined;

const {
    deleteVocabularyMock,
    pushMock,
    saveVocabularyMock,
    updateVocabularyEntryMock,
} = vi.hoisted(() => ({
    deleteVocabularyMock: vi.fn(),
    pushMock: vi.fn(),
    saveVocabularyMock: vi.fn(),
    updateVocabularyEntryMock: vi.fn(),
}));

vi.mock("dexie-react-hooks", () => ({
    useLiveQuery: vi.fn(() => liveQueryValue),
}));

vi.mock("@/lib/user-repository", () => ({
    deleteVocabulary: deleteVocabularyMock,
    saveVocabulary: saveVocabularyMock,
    updateVocabularyEntry: updateVocabularyEntryMock,
}));

vi.mock("@/components/vocab/VocabEditDialog", () => ({
    VocabEditDialog: () => null,
}));

vi.mock("framer-motion", async () => {
    const React = await import("react");

    const stripMotionProps = (props: Record<string, unknown>) => {
        const nextProps = { ...props };
        delete nextProps.initial;
        delete nextProps.animate;
        delete nextProps.exit;
        delete nextProps.layout;
        delete nextProps.whileHover;
        delete nextProps.whileTap;
        delete nextProps.whileInView;
        delete nextProps.viewport;
        delete nextProps.transition;
        return nextProps;
    };

    const createMotionComponent = (tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & Record<string, unknown>>(
            (props, ref) => React.createElement(tag, { ref, ...stripMotionProps(props) }, props.children),
        );
        MotionComponent.displayName = `Motion(${tag})`;
        return MotionComponent;
    };

    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
        motion: new Proxy(
            {},
            {
                get: (_, tag: string) => createMotionComponent(tag),
            },
        ),
        useReducedMotion: () => true,
    };
});

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: pushMock,
    }),
    useSearchParams: () => new URLSearchParams(),
}));

import VocabPage from "./page";

const NOW = new Date("2026-04-02T12:00:00+08:00").getTime();

function buildCard(word: string, overrides: Partial<VocabItem> = {}): VocabItem {
    return {
        word,
        word_key: word.toLowerCase(),
        definition: `definition for ${word}`,
        translation: `翻译 ${word}`,
        context: "",
        example: "",
        phonetic: "",
        meaning_groups: [],
        highlighted_meanings: [],
        word_breakdown: [],
        morphology_notes: [],
        source_kind: "manual",
        source_label: "手动添加",
        source_sentence: "",
        source_note: "",
        timestamp: NOW,
        stability: 1,
        difficulty: 1,
        elapsed_days: 0,
        scheduled_days: 1,
        reps: 0,
        state: State.Review,
        last_review: NOW - 60_000,
        due: NOW + 24 * 60 * 60 * 1000,
        ...overrides,
    };
}

function clickButtonByText(container: HTMLElement, text: string) {
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes(text));
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return button;
}

function findButtonByText(container: HTMLElement, text: string) {
    return Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes(text));
}

function setInputValue(element: HTMLInputElement, value: string) {
    const prototype = Object.getPrototypeOf(element) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    const previousValue = element.value;
    setter?.call(element, value);
    const tracker = (element as HTMLInputElement & { _valueTracker?: { setValue(value: string): void } })._valueTracker;
    tracker?.setValue(previousValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
}

const vocabularyFixture: VocabItem[] = [
    buildCard("alpha-oldest", { timestamp: NOW - 15_000 }),
    buildCard("beta-old", { timestamp: NOW - 14_000 }),
    buildCard("due-card", {
        timestamp: NOW - 13_000,
        due: NOW - 1_000,
        state: State.Review,
    }),
    buildCard("learning-card", {
        timestamp: NOW - 12_000,
        due: NOW + 30 * 60 * 1000,
        state: State.Learning,
    }),
    buildCard("new-card", {
        timestamp: NOW - 11_000,
        due: NOW + 60 * 60 * 1000,
        state: State.New,
    }),
    buildCard("relearning-card", {
        timestamp: NOW - 10_000,
        due: NOW + 90 * 60 * 1000,
        state: State.Relearning,
    }),
    buildCard("graduated-card", {
        timestamp: NOW - 9_000,
        due: NOW + 400 * 24 * 60 * 60 * 1000,
        state: State.Review,
        scheduled_days: GRADUATED_SCHEDULED_DAYS,
        last_review: NOW,
    }),
    buildCard("recent-1", { timestamp: NOW - 8_000 }),
    buildCard("recent-2", { timestamp: NOW - 7_000 }),
    buildCard("recent-3", { timestamp: NOW - 6_000 }),
    buildCard("recent-4", { timestamp: NOW - 5_000 }),
    buildCard("recent-5", { timestamp: NOW - 4_000 }),
    buildCard("recent-6", { timestamp: NOW - 3_000 }),
    buildCard("recent-7", { timestamp: NOW - 2_000 }),
    buildCard("recent-8", { timestamp: NOW - 1_000 }),
];

describe("vocab page category filters", () => {
    beforeEach(() => {
        liveQueryValue = vocabularyFixture;
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        deleteVocabularyMock.mockReset();
        pushMock.mockReset();
        saveVocabularyMock.mockReset();
        updateVocabularyEntryMock.mockReset();
    });

    afterEach(() => {
        document.body.innerHTML = "";
        liveQueryValue = undefined;
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("shows the five category buttons and defaults to recent items capped at 12", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<VocabPage />);
        });

        expect(findButtonByText(container, "全部")).toBeTruthy();
        expect(findButtonByText(container, "待复习")).toBeTruthy();
        expect(findButtonByText(container, "学习中")).toBeTruthy();
        expect(findButtonByText(container, "最近添加")).toBeTruthy();
        expect(findButtonByText(container, "已掌握")).toBeTruthy();
        expect(container.textContent).toContain("最近添加");
        expect(container.textContent).toContain("recent-8");
        expect(container.textContent).not.toContain("alpha-oldest");
        expect(container.textContent).not.toContain("beta-old");

        await act(async () => {
            root.unmount();
        });
    });

    it("filters due, in-progress, and graduated cards by category", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<VocabPage />);
        });

        await act(async () => {
            clickButtonByText(container, "待复习");
        });
        expect(container.textContent).toContain("due-card");
        expect(container.textContent).not.toContain("learning-card");
        expect(container.textContent).not.toContain("graduated-card");

        await act(async () => {
            clickButtonByText(container, "学习中");
        });
        expect(container.textContent).toContain("learning-card");
        expect(container.textContent).toContain("new-card");
        expect(container.textContent).toContain("relearning-card");
        expect(container.textContent).not.toContain("due-card");
        expect(container.textContent).not.toContain("graduated-card");

        await act(async () => {
            clickButtonByText(container, "已掌握");
        });
        expect(container.textContent).toContain("graduated-card");
        expect(container.textContent).not.toContain("learning-card");
        expect(container.textContent).not.toContain("due-card");

        await act(async () => {
            root.unmount();
        });
    });

    it("lets search override the active category and restores the previous filter when cleared", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<VocabPage />);
        });

        await act(async () => {
            clickButtonByText(container, "已熟记");
        });
        expect(container.textContent).toContain("graduated-card");
        expect(container.textContent).not.toContain("due-card");

        const searchInput = container.querySelector<HTMLInputElement>('input[placeholder="搜索我的单词卡..."]');
        expect(searchInput).toBeTruthy();

        await act(async () => {
            if (!searchInput) throw new Error("Missing search input");
            setInputValue(searchInput, "due-card");
            await Promise.resolve();
        });
        expect(container.textContent).toContain("找到 1 张相关词卡");
        expect(container.textContent).toContain("due-card");
        expect(container.textContent).not.toContain("graduated-card");

        await act(async () => {
            const latestSearchInput = container.querySelector<HTMLInputElement>('input[placeholder="搜索我的单词卡..."]');
            if (!latestSearchInput) throw new Error("Missing search input");
            setInputValue(latestSearchInput, "");
            await Promise.resolve();
        });
        const clearedSearchInput = container.querySelector<HTMLInputElement>('input[placeholder="搜索我的单词卡..."]');
        expect(clearedSearchInput?.value).toBe("");
        expect(container.textContent).not.toContain("找到 1 张相关词卡");
        expect(container.textContent).toContain("graduated-card");
        expect(container.textContent).not.toContain("due-card");

        await act(async () => {
            root.unmount();
        });
    });
});
