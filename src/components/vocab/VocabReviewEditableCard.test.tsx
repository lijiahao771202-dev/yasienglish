/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VocabItem } from "@/lib/db";
import { VocabReviewEditableCard } from "./VocabReviewEditableCard";

vi.mock("@/lib/user-repository", () => ({
    updateVocabularyEntry: vi.fn(),
}));

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
}

function blurField(element: HTMLInputElement | HTMLTextAreaElement | null) {
    element?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    element?.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
}

function clickButtonByText(container: HTMLElement, text: string) {
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes(text));
    button?.click();
    return button;
}

async function advancePersistTimer() {
    await act(async () => {
        vi.advanceTimersByTime(600);
        await Promise.resolve();
    });
}

const baseCard: VocabItem = {
    word: "relay",
    phonetic: "/riːˈleɪ/",
    definition: "v. pass something to the next person",
    translation: "v. 转达; 传递",
    context: "",
    example: "She relayed the message to the team.",
    source_sentence: "The anchor relayed the update on air.",
    source_label: "TED",
    meaning_groups: [{ pos: "v.", meanings: ["转达", "传递"] }],
    highlighted_meanings: ["转达"],
    word_breakdown: ["re", "lay"],
    morphology_notes: ["re-: 再、向后", "lay: 放置，引申为传递"],
    timestamp: 1,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    learning_steps: 0,
    state: 0,
    last_review: 0,
    due: Date.now(),
};

async function renderCard(options: {
    item?: VocabItem;
    posGroups?: { pos: string; meanings: string[] }[];
    onSaved?: (item: VocabItem) => void;
    onArchive?: (item: VocabItem, previousWord: string) => Promise<void> | void;
} = {}) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSaved = options.onSaved ?? vi.fn();

    await act(async () => {
        root.render(
            <VocabReviewEditableCard
                item={options.item ?? baseCard}
                posGroups={options.posGroups ?? [{ pos: "v.", meanings: ["转达", "传递"] }]}
                expandedPosGroups={{}}
                onExpandedPosGroupsChange={vi.fn()}
                onPlayAudio={vi.fn()}
                onSaved={onSaved}
                onArchive={options.onArchive}
            />,
        );
    });

    return { container, root, onSaved };
}

async function unmount(root: Root) {
    await act(async () => {
        root.unmount();
    });
}

describe("VocabReviewEditableCard", () => {
    beforeEach(() => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        document.body.innerHTML = "";
    });

    it("shows highlighted meanings by default and exposes the archive action", async () => {
        const onArchive = vi.fn();
        const { container, root } = await renderCard({ onArchive });

        expect(container.querySelector('[data-review-layout="single-card"]')).toBeTruthy();
        expect(container.querySelector('[data-highlighted-meaning="true"][data-highlight-source="ai"]')).toBeTruthy();

        await act(async () => {
            clickButtonByText(container, "归档");
        });

        expect(onArchive).toHaveBeenCalledTimes(1);
        expect(onArchive).toHaveBeenCalledWith(expect.objectContaining({ word: "relay" }), "relay");

        await unmount(root);
    });

    it("renders the default review layout with tab controls", async () => {
        const { container, root } = await renderCard();

        expect(container.textContent).toContain("释义");
        expect(container.textContent).toContain("例句");
        expect(container.textContent).toContain("解析");
        expect(container.querySelector<HTMLInputElement>('input[aria-label="编辑音标"]')?.value).toBe("/riːˈleɪ/");

        await unmount(root);
    });

    it("persists edited phonetic fields after blur", async () => {
        vi.useFakeTimers();
        const { updateVocabularyEntry } = await import("@/lib/user-repository");
        const onSaved = vi.fn();
        const nextPhonetic = "/rɪˈleɪ/";
        vi.mocked(updateVocabularyEntry).mockResolvedValue({
            ...baseCard,
            phonetic: nextPhonetic,
        });

        const { container, root } = await renderCard({ onSaved });
        const phoneticInput = container.querySelector<HTMLInputElement>('input[aria-label="编辑音标"]');
        expect(phoneticInput).toBeTruthy();

        await act(async () => {
            if (!phoneticInput) throw new Error("Missing phonetic input");
            setInputValue(phoneticInput, nextPhonetic);
            blurField(phoneticInput);
        });

        await advancePersistTimer();

        expect(updateVocabularyEntry).toHaveBeenCalledWith("relay", expect.objectContaining({
            phonetic: nextPhonetic,
        }));
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
            phonetic: nextPhonetic,
        }));

        await unmount(root);
    });

    it("does not persist untouched fields on blur", async () => {
        vi.useFakeTimers();
        const { updateVocabularyEntry } = await import("@/lib/user-repository");

        const { container, root } = await renderCard();
        const phoneticInput = container.querySelector<HTMLInputElement>('input[aria-label="编辑音标"]');
        expect(phoneticInput).toBeTruthy();

        await act(async () => {
            blurField(phoneticInput);
        });

        await advancePersistTimer();

        expect(updateVocabularyEntry).not.toHaveBeenCalled();

        await unmount(root);
    });

    it("persists trimmed meaning groups when deleting a meaning", async () => {
        vi.useFakeTimers();
        const { updateVocabularyEntry } = await import("@/lib/user-repository");
        const onSaved = vi.fn();
        const briefCard: VocabItem = {
            ...baseCard,
            word: "brief",
            translation: "n. 指示，任务简介；摘要，概要；v. 给……指示，向……介绍情况",
            meaning_groups: [
                { pos: "n.", meanings: ["指示，任务简介", "摘要，概要"] },
                { pos: "v.", meanings: ["给……指示，向……介绍情况"] },
            ],
            highlighted_meanings: [],
        };

        vi.mocked(updateVocabularyEntry).mockResolvedValue({
            ...briefCard,
            translation: "n. 摘要，概要；v. 给……指示，向……介绍情况",
            meaning_groups: [
                { pos: "n.", meanings: ["摘要，概要"] },
                { pos: "v.", meanings: ["给……指示，向……介绍情况"] },
            ],
        });

        const { container, root } = await renderCard({
            item: briefCard,
            posGroups: [
                { pos: "n.", meanings: ["指示，任务简介", "摘要，概要"] },
                { pos: "v.", meanings: ["给……指示，向……介绍情况"] },
            ],
            onSaved,
        });

        const deleteMeaningButton = container.querySelector<HTMLButtonElement>('button[aria-label="删除释义 n. 1"]');
        expect(deleteMeaningButton).toBeTruthy();

        await act(async () => {
            deleteMeaningButton?.click();
        });

        await advancePersistTimer();

        expect(updateVocabularyEntry).toHaveBeenCalledWith("brief", expect.objectContaining({
            meaning_groups: [
                { pos: "n.", meanings: ["摘要，概要"] },
                { pos: "v.", meanings: ["给……指示，向……介绍情况"] },
            ],
            translation: "n. 摘要，概要；v. 给……指示，向……介绍情况",
        }));
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
            meaning_groups: [
                { pos: "n.", meanings: ["摘要，概要"] },
                { pos: "v.", meanings: ["给……指示，向……介绍情况"] },
            ],
        }));

        await unmount(root);
    });
});
