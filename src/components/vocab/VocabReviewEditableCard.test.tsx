/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const baseCard: VocabItem = {
    word: "relay",
    phonetic: "/riːˈleɪ/",
    definition: "v. pass something to the next person",
    translation: "v. 转达; 传递",
    context: "",
    example: "She relayed the message to the team.",
    source_sentence: "The anchor relayed the update on air.",
    source_label: "TED",
    highlighted_meanings: ["转达最新消息"],
    word_breakdown: ["re", "lay"],
    morphology_notes: ["re-: 再、向后", "lay: 放置，引申为传递"],
    timestamp: 1,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    state: 0,
    last_review: 0,
    due: Date.now(),
};

describe("VocabReviewEditableCard", () => {
    afterEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
    });

    it("lets the learner edit the word inline and save without a modal", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const { updateVocabularyEntry } = await import("@/lib/user-repository");
        const onSaved = vi.fn();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        vi.mocked(updateVocabularyEntry).mockResolvedValue({
            ...baseCard,
            word: "relay race",
        });

        await act(async () => {
            root.render(
                <VocabReviewEditableCard
                    item={baseCard}
                    posGroups={[{ pos: "v.", meanings: ["转达", "传递"] }]}
                    expandedPosGroups={{}}
                    onExpandedPosGroupsChange={vi.fn()}
                    onPlayAudio={vi.fn()}
                    onSaved={onSaved}
                />,
            );
        });

        const wordInput = container.querySelector<HTMLInputElement>('input[aria-label="编辑单词"]');
        expect(wordInput).toBeTruthy();

        await act(async () => {
            if (!wordInput) throw new Error("Missing word input");
            setInputValue(wordInput, "relay race");
        });

        const saveButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("保存修改"));
        expect(saveButton).toBeTruthy();

        await act(async () => {
            saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(updateVocabularyEntry).toHaveBeenCalledWith("relay", expect.objectContaining({
            word: "relay race",
        }));
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
            word: "relay race",
        }));

        await act(async () => {
            root.unmount();
        });
    });

    it("reverts inline edits when the learner cancels", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const { updateVocabularyEntry } = await import("@/lib/user-repository");
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <VocabReviewEditableCard
                    item={baseCard}
                    posGroups={[{ pos: "v.", meanings: ["转达", "传递"] }]}
                    expandedPosGroups={{}}
                    onExpandedPosGroupsChange={vi.fn()}
                    onPlayAudio={vi.fn()}
                    onSaved={vi.fn()}
                />,
            );
        });

        const exampleInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="编辑例句"]');
        expect(exampleInput).toBeTruthy();

        await act(async () => {
            if (!exampleInput) throw new Error("Missing example input");
            setInputValue(exampleInput, "A new sentence.");
        });

        const cancelButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("取消编辑"));
        expect(cancelButton).toBeTruthy();

        await act(async () => {
            cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(updateVocabularyEntry).not.toHaveBeenCalled();
        expect(container.textContent).toContain("The anchor relayed the update on air.");
        expect(container.textContent).not.toContain("A new sentence.");

        await act(async () => {
            root.unmount();
        });
    });

    it("supports direct inline editing without switching to a separate edit mode", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const { updateVocabularyEntry } = await import("@/lib/user-repository");
        const onSaved = vi.fn();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        vi.mocked(updateVocabularyEntry).mockResolvedValue({
            ...baseCard,
            phonetic: "/briːf/",
            translation: "n. 简报；摘要",
            meaning_groups: [{ pos: "n.", meanings: ["简报", "摘要"] }],
            source_sentence: "We drafted a brief before the meeting.",
        });

        await act(async () => {
            root.render(
                <VocabReviewEditableCard
                    item={{ ...baseCard, word: "brief" }}
                    posGroups={[
                        { pos: "n.", meanings: ["指示，任务简介", "摘要，概要"] },
                        { pos: "v.", meanings: ["给……指示，向……介绍情况"] },
                    ]}
                    expandedPosGroups={{}}
                    onExpandedPosGroupsChange={vi.fn()}
                    onPlayAudio={vi.fn()}
                    onSaved={onSaved}
                />,
            );
        });

        expect(container.textContent).not.toContain("Inline Edit");

        const wordInput = container.querySelector<HTMLInputElement>('input[aria-label="编辑单词"]');
        const phoneticInput = container.querySelector<HTMLInputElement>('input[aria-label="编辑音标"]');
        const exampleInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="编辑例句"]');
        const meaningInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="编辑释义 n. 1"]');

        expect(wordInput).toBeTruthy();
        expect(phoneticInput).toBeTruthy();
        expect(exampleInput).toBeTruthy();
        expect(meaningInput).toBeTruthy();

        await act(async () => {
            if (!phoneticInput || !exampleInput || !meaningInput) throw new Error("Missing direct editors");
            setInputValue(phoneticInput, "/briːf/");
            setInputValue(exampleInput, "We drafted a brief before the meeting.");
            setInputValue(meaningInput, "简报");
        });

        const saveButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("保存修改"));
        expect(saveButton).toBeTruthy();

        await act(async () => {
            saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(updateVocabularyEntry).toHaveBeenCalledWith("brief", expect.objectContaining({
            phonetic: "/briːf/",
            source_sentence: "We drafted a brief before the meeting.",
            meaning_groups: expect.arrayContaining([
                expect.objectContaining({ pos: "n.", meanings: ["简报", "摘要，概要"] }),
            ]),
        }));
        expect(onSaved).toHaveBeenCalled();

        await act(async () => {
            root.unmount();
        });
    });

    it("surfaces highlighted meaning badges, phonetic info, and AI word analysis while preferring the source sentence", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <VocabReviewEditableCard
                    item={baseCard}
                    posGroups={[{ pos: "v.", meanings: ["转达", "传递"] }]}
                    expandedPosGroups={{}}
                    onExpandedPosGroupsChange={vi.fn()}
                    onPlayAudio={vi.fn()}
                    onSaved={vi.fn()}
                />,
            );
        });

        const phoneticInput = container.querySelector<HTMLInputElement>('input[aria-label="编辑音标"]');
        expect(phoneticInput?.value).toBe("/riːˈleɪ/");
        expect(container.textContent).not.toContain("重点");
        expect(container.textContent).not.toContain("📣");
        expect(container.textContent).toContain("re");
        expect(container.textContent).toContain("lay");
        expect(container.textContent).toContain("re-: 再、向后");
        expect(container.textContent).toContain("lay: 放置，引申为传递");
        expect(container.textContent).toContain("The anchor relayed the update on air.");
        expect(container.textContent).not.toContain("She relayed the message to the team.");
        expect(container.textContent).not.toContain("Click And Type Directly");
        expect(container.textContent).not.toContain("Word Analysis");
        expect(container.textContent).not.toContain("Pronounce");
        expect(container.querySelector('[data-highlighted-word="true"][data-highlight-source="ai"]')).toBeTruthy();
        expect(container.querySelector('[data-highlighted-meaning="true"][data-highlight-source="ai"]')).toBeTruthy();

        await act(async () => {
            root.unmount();
        });
    });

    it("keeps unmatched highlighted meanings off the header and falls back to highlighting a meaning row", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <VocabReviewEditableCard
                    item={{
                        ...baseCard,
                        word: "battle",
                        highlighted_meanings: ["A military fight between armed forces"],
                    }}
                    posGroups={[
                        { pos: "n.", meanings: ["战役，战争", "争论，斗争"] },
                        { pos: "v.", meanings: ["与……作战，和……斗争"] },
                    ]}
                    expandedPosGroups={{}}
                    onExpandedPosGroupsChange={vi.fn()}
                    onPlayAudio={vi.fn()}
                    onSaved={vi.fn()}
                />,
            );
        });

        expect(container.textContent).not.toContain("A military fight between armed forces");
        expect(container.querySelector('[data-highlighted-word="true"][data-highlight-source="ai"]')).toBeTruthy();
        expect(container.querySelector('[data-highlighted-meaning="true"][data-highlight-source="ai"]')).toBeTruthy();

        await act(async () => {
            root.unmount();
        });
    });

    it("exposes a direct 熟记毕业 action for graduating the card", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const onGraduate = vi.fn();

        await act(async () => {
            root.render(
                <VocabReviewEditableCard
                    item={baseCard}
                    posGroups={[{ pos: "v.", meanings: ["转达", "传递"] }]}
                    expandedPosGroups={{}}
                    onExpandedPosGroupsChange={vi.fn()}
                    onPlayAudio={vi.fn()}
                    onSaved={vi.fn()}
                    onGraduate={onGraduate}
                />,
            );
        });

        const graduateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("熟记毕业"));
        expect(graduateButton).toBeTruthy();

        await act(async () => {
            graduateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onGraduate).toHaveBeenCalledTimes(1);

        await act(async () => {
            root.unmount();
        });
    });
});
