/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionActionPopup } from "./ParagraphCard";

type RenderOverrides = Partial<React.ComponentProps<typeof SelectionActionPopup>>;

const renderMarkdown = (content: string) => <div>{content}</div>;

const createBaseProps = (): React.ComponentProps<typeof SelectionActionPopup> => ({
    selectionRect: new DOMRect(120, 120, 100, 24),
    selectedText: "looking for a job",
    phraseAnalysis: null,
    isAnalyzingPhrase: false,
    isSavingReadingNote: false,
    canCreateReadingNote: true,
    noteLayerHidden: false,
    isNoteComposerOpen: false,
    isEditingNote: false,
    noteDraft: "",
    onNoteDraftChange: vi.fn(),
    onOpenNoteComposer: vi.fn(),
    onCancelNoteComposer: vi.fn(),
    onCreateHighlight: vi.fn(),
    onCreateUnderline: vi.fn(),
    canDeleteHighlight: false,
    canDeleteUnderline: false,
    canDeleteNote: false,
    onEditNote: vi.fn(),
    onDeleteHighlight: vi.fn(),
    onDeleteUnderline: vi.fn(),
    onDeleteNote: vi.fn(),
    onSaveNote: vi.fn(),
    onAnalyze: vi.fn(),
    qaPairs: [],
    question: "",
    onQuestionChange: vi.fn(),
    isAskLoading: false,
    onAsk: vi.fn(),
    renderAskMarkdown: renderMarkdown,
    onClose: vi.fn(),
});

const mountedRoots: Root[] = [];

const renderPopup = async (overrides: RenderOverrides = {}) => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
        root.render(<SelectionActionPopup {...createBaseProps()} {...overrides} />);
    });

    return { container, root };
};

afterEach(async () => {
    await act(async () => {
        while (mountedRoots.length > 0) {
            const root = mountedRoots.pop();
            root?.unmount();
        }
    });
    document.body.innerHTML = "";
});

describe("SelectionActionPopup", () => {
    it("hides both delete buttons when selection has no highlight or underline", async () => {
        const { container } = await renderPopup({
            canDeleteHighlight: false,
            canDeleteUnderline: false,
        });

        expect(container.textContent).not.toContain("删除高亮");
        expect(container.textContent).not.toContain("删除下划线");
    });

    it("shows only delete highlight button when highlight exists", async () => {
        const { container } = await renderPopup({
            canDeleteHighlight: true,
            canDeleteUnderline: false,
        });

        expect(container.textContent).toContain("删除高亮");
        expect(container.textContent).not.toContain("删除下划线");
    });

    it("shows only delete underline button when underline exists", async () => {
        const { container } = await renderPopup({
            canDeleteHighlight: false,
            canDeleteUnderline: true,
        });

        expect(container.textContent).not.toContain("删除高亮");
        expect(container.textContent).toContain("删除下划线");
    });

    it("opens ask panel and triggers ask callback", async () => {
        const onAsk = vi.fn();
        const { container } = await renderPopup({
            question: "怎么理解这个短语？",
            onAsk,
        });

        const askToggleButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("向AI提问"));
        expect(askToggleButton).toBeTruthy();

        await act(async () => {
            askToggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const input = container.querySelector<HTMLInputElement>('input[placeholder="针对选中文本提问..."]');
        expect(input).toBeTruthy();

        const sendButton = input?.nextElementSibling as HTMLButtonElement | null;
        expect(sendButton).toBeTruthy();
        expect(sendButton?.disabled).toBe(false);

        await act(async () => {
            input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        });

        expect(onAsk).toHaveBeenCalledTimes(1);
    });

    it("disables send button and shows loading indicator while asking", async () => {
        const { container } = await renderPopup({
            question: "解释一下",
            isAskLoading: true,
        });

        const askToggleButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("向AI提问"));
        expect(askToggleButton).toBeTruthy();

        await act(async () => {
            askToggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const input = container.querySelector<HTMLInputElement>('input[placeholder="针对选中文本提问..."]');
        expect(input).toBeTruthy();

        const sendButton = input?.nextElementSibling as HTMLButtonElement | null;
        expect(sendButton).toBeTruthy();
        expect(sendButton?.disabled).toBe(true);
        expect(sendButton?.querySelector(".animate-spin")).toBeTruthy();
    });

    it("keeps answers collapsed by default and resets collapsed state after reopen", async () => {
        const { container } = await renderPopup({
            qaPairs: [
                { id: 1, question: "为什么用ing", answer: "这里是在描述进行中的状态。", isStreaming: false },
            ],
        });

        const askToggleButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("向AI提问"));
        expect(askToggleButton).toBeTruthy();

        await act(async () => {
            askToggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.textContent).not.toContain("这里是在描述进行中的状态。");

        const questionButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("问题 1"));
        expect(questionButton).toBeTruthy();
        expect(questionButton?.getAttribute("aria-expanded")).toBe("false");

        await act(async () => {
            questionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.textContent).toContain("这里是在描述进行中的状态。");
        expect(questionButton?.getAttribute("aria-expanded")).toBe("true");

        await act(async () => {
            askToggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await act(async () => {
            askToggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const reopenedQuestionButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("问题 1"));
        expect(reopenedQuestionButton?.getAttribute("aria-expanded")).toBe("false");
        expect(container.textContent).not.toContain("这里是在描述进行中的状态。");
    });
});
