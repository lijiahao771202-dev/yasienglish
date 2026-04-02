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

function blurEditor(element: HTMLInputElement | HTMLTextAreaElement | null) {
    element?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

function clickButtonByText(container: HTMLElement, text: string) {
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes(text));
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return button;
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
    highlighted_meanings: ["转达"],
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

    it("auto-saves inline edits on blur without extra save controls", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const { updateVocabularyEntry } = await import("@/lib/user-repository");
        const onSaved = vi.fn();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        vi.mocked(updateVocabularyEntry).mockResolvedValue({
            ...baseCard,
            source_sentence: "A breaking update reached the team.",
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

        await act(async () => {
            clickButtonByText(container, "例句");
        });

        const exampleInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="编辑来源例句"]');
        expect(exampleInput).toBeTruthy();
        expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("保存修改"))).toBeFalsy();
        expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("取消编辑"))).toBeFalsy();

        await act(async () => {
            if (!exampleInput) throw new Error("Missing example input");
            setInputValue(exampleInput, "A breaking update reached the team.");
        });

        await act(async () => {
            blurEditor(exampleInput);
        });

        expect(updateVocabularyEntry).toHaveBeenCalledWith("relay", expect.objectContaining({
            source_sentence: "A breaking update reached the team.",
        }));
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
            source_sentence: "A breaking update reached the team.",
        }));

        await act(async () => {
            root.unmount();
        });
    });

    it("does not auto-save untouched fields when focus leaves the editor", async () => {
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

        await act(async () => {
            clickButtonByText(container, "例句");
        });

        const exampleInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="编辑来源例句"]');
        expect(exampleInput).toBeTruthy();

        await act(async () => {
            blurEditor(exampleInput);
        });

        expect(updateVocabularyEntry).not.toHaveBeenCalled();

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
            word: "brief",
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
        const meaningInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="编辑释义 n. 1"]');

        expect(wordInput).toBeTruthy();
        expect(phoneticInput).toBeTruthy();
        expect(meaningInput).toBeTruthy();

        await act(async () => {
            if (!phoneticInput) throw new Error("Missing direct editors");
            setInputValue(phoneticInput, "/briːf/");
        });

        await act(async () => {
            blurEditor(phoneticInput);
        });

        expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("保存修改"))).toBeFalsy();
        const latestCall = vi.mocked(updateVocabularyEntry).mock.calls.at(-1);
        expect(latestCall).toBeTruthy();
        expect(latestCall?.[0]).toBe("brief");
        expect(latestCall?.[1]).toEqual(expect.objectContaining({
            phonetic: "/briːf/",
        }));
        expect(onSaved).toHaveBeenCalled();

        await act(async () => {
            root.unmount();
        });
    });

    it("surfaces highlighted meaning badges on definitions only while preferring the source sentence", async () => {
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
        expect(container.textContent).toContain("释义");
        expect(container.textContent).toContain("例句");
        expect(container.textContent).not.toContain("重点");
        expect(container.textContent).not.toContain("📣");
        expect(container.querySelector('[data-review-layout="single-card"]')).toBeTruthy();
        expect(container.querySelector('[data-review-word-section="true"]')).toBeTruthy();
        expect(container.querySelector('[data-review-content-section="true"]')).toBeTruthy();
        expect(container.querySelector('[data-review-content-scroller="true"]')).toBeTruthy();
        expect(container.textContent).toContain("re");
        expect(container.textContent).toContain("lay");
        expect(container.textContent).toContain("re-: 再、向后");
        expect(container.textContent).toContain("lay: 放置，引申为传递");
        expect(container.textContent).not.toContain("The anchor relayed the update on air.");
        expect(container.textContent).not.toContain("She relayed the message to the team.");
        expect(container.textContent).not.toContain("Click And Type Directly");
        expect(container.textContent).not.toContain("Word Analysis");
        expect(container.textContent).not.toContain("Pronounce");
        expect(container.querySelector('[data-highlighted-word="true"][data-highlight-source="ai"]')).toBeFalsy();
        expect(container.querySelector('[data-highlighted-meaning="true"][data-highlight-source="ai"]')).toBeTruthy();

        await act(async () => {
            clickButtonByText(container, "例句");
        });

        expect(container.textContent).toContain("The anchor relayed the update on air.");
        expect(container.textContent).toContain("She relayed the message to the team.");
        expect(container.querySelector('[data-highlighted-meaning="true"][data-highlight-source="ai"]')).toBeFalsy();

        await act(async () => {
            root.unmount();
        });
    });

    it("keeps unmatched highlighted meanings completely unmarked", async () => {
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
        expect(container.querySelector('[data-highlighted-word="true"][data-highlight-source="ai"]')).toBeFalsy();
        expect(container.querySelector('[data-highlighted-meaning="true"][data-highlight-source="ai"]')).toBeFalsy();

        await act(async () => {
            root.unmount();
        });
    });

    it("lets the learner clear the source sentence without falling back to the AI example", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const { updateVocabularyEntry } = await import("@/lib/user-repository");
        const onSaved = vi.fn();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        vi.mocked(updateVocabularyEntry).mockResolvedValue({
            ...baseCard,
            source_sentence: "",
            example: "She relayed the message to the team.",
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

        await act(async () => {
            clickButtonByText(container, "例句");
        });

        const sourceSentenceInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="编辑来源例句"]');
        const dictionaryExampleInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="编辑AI例句"]');

        expect(sourceSentenceInput?.value).toBe("The anchor relayed the update on air.");
        expect(dictionaryExampleInput?.value).toBe("She relayed the message to the team.");

        await act(async () => {
            if (!sourceSentenceInput) throw new Error("Missing source sentence input");
            setInputValue(sourceSentenceInput, "");
        });

        await act(async () => {
            blurEditor(sourceSentenceInput);
        });

        expect(updateVocabularyEntry).toHaveBeenCalledWith("relay", expect.objectContaining({
            source_sentence: "",
            example: "She relayed the message to the team.",
        }));
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
            source_sentence: "",
            example: "She relayed the message to the team.",
        }));

        await act(async () => {
            root.unmount();
        });
    });

    it("lets the learner delete an unwanted meaning and persists the trimmed meaning groups", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const { updateVocabularyEntry } = await import("@/lib/user-repository");
        const onSaved = vi.fn();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        vi.mocked(updateVocabularyEntry).mockResolvedValue({
            ...baseCard,
            word: "brief",
            translation: "n. 摘要，概要；v. 给……指示，向……介绍情况",
            meaning_groups: [
                { pos: "n.", meanings: ["摘要，概要"] },
                { pos: "v.", meanings: ["给……指示，向……介绍情况"] },
            ],
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

        const deleteMeaningButton = container.querySelector<HTMLButtonElement>('button[aria-label="删除释义 n. 1"]');
        expect(deleteMeaningButton).toBeTruthy();

        await act(async () => {
            deleteMeaningButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

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

        await act(async () => {
            root.unmount();
        });
    });

    it("switches between meanings and examples with compact panel tabs", async () => {
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

        expect(container.textContent).toContain("释义");
        expect(container.textContent).toContain("转达");
        expect(container.textContent).not.toContain("The anchor relayed the update on air.");

        await act(async () => {
            clickButtonByText(container, "例句");
        });

        expect(container.textContent).toContain("The anchor relayed the update on air.");
        expect(container.textContent).toContain("She relayed the message to the team.");
        expect(container.textContent).not.toContain("转达");

        await act(async () => {
            clickButtonByText(container, "释义");
        });

        expect(container.textContent).toContain("转达");
        expect(container.textContent).not.toContain("The anchor relayed the update on air.");

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
