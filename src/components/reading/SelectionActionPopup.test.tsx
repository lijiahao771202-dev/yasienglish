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
    onLookupWord: vi.fn(),
    qaPairs: [],
    question: "",
    onQuestionChange: vi.fn(),
    askAnswerMode: "default",
    onAskAnswerModeChange: vi.fn(),
    isAskLoading: false,
    onAsk: vi.fn(),
    onOpenAskComposer: vi.fn(),
    onReturnToSelection: vi.fn(),
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

const dispatchPointer = (target: Element, type: string, options: { pointerId?: number; clientX: number; clientY: number }) => {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: options.clientX,
        clientY: options.clientY,
    });
    Object.defineProperty(event, "pointerId", {
        configurable: true,
        value: options.pointerId ?? 1,
    });
    target.dispatchEvent(event);
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

    it("requests ask composer mode when clicking ask action", async () => {
        const onOpenAskComposer = vi.fn();
        const { container } = await renderPopup({
            onOpenAskComposer,
        });

        const askToggleButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("向AI提问"));
        expect(askToggleButton).toBeTruthy();

        await act(async () => {
            askToggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onOpenAskComposer).toHaveBeenCalledTimes(1);
    });

    it("only sends when clicking the send button in ask mode", async () => {
        const onAsk = vi.fn();
        const { container } = await renderPopup({
            popupMode: "ask",
            question: "怎么理解这个短语？",
            onAsk,
        });

        const input = container.querySelector<HTMLInputElement>('input[placeholder="针对选中文本提问..."]');
        expect(input).toBeTruthy();

        const sendButton = input?.nextElementSibling as HTMLButtonElement | null;
        expect(sendButton).toBeTruthy();
        expect(sendButton?.disabled).toBe(false);

        await act(async () => {
            input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        });

        expect(onAsk).toHaveBeenCalledTimes(0);

        await act(async () => {
            sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onAsk).toHaveBeenCalledTimes(1);
    });

    it("disables send button and shows loading indicator while asking", async () => {
        const { container } = await renderPopup({
            popupMode: "ask",
            question: "解释一下",
            isAskLoading: true,
        });

        const input = container.querySelector<HTMLInputElement>('input[placeholder="针对选中文本提问..."]');
        expect(input).toBeTruthy();

        const sendButton = input?.nextElementSibling as HTMLButtonElement | null;
        expect(sendButton).toBeTruthy();
        expect(sendButton?.disabled).toBe(true);
        expect(sendButton?.querySelector(".animate-spin")).toBeTruthy();
    });

    it("resets expanded answers when reopening the ask composer", async () => {
        const Wrapper = () => {
            const [popupMode, setPopupMode] = React.useState<"selection" | "ask">("selection");
            return (
                <SelectionActionPopup
                    {...createBaseProps()}
                    popupMode={popupMode}
                    qaPairs={[
                        { id: 1, question: "为什么用ing", answer: "这里是在描述进行中的状态。", isStreaming: false },
                    ]}
                    onOpenAskComposer={() => setPopupMode("ask")}
                    onReturnToSelection={() => setPopupMode("selection")}
                />
            );
        };

        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        mountedRoots.push(root);

        await act(async () => {
            root.render(<Wrapper />);
        });

        const askToggleButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("向AI提问"));
        expect(askToggleButton).toBeTruthy();

        await act(async () => {
            askToggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        let questionButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("问题 1"));
        expect(questionButton).toBeTruthy();
        expect(questionButton?.getAttribute("aria-expanded")).toBe("false");
        expect(container.textContent).not.toContain("这里是在描述进行中的状态。");

        await act(async () => {
            questionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        questionButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("问题 1"));
        expect(questionButton?.getAttribute("aria-expanded")).toBe("true");
        expect(container.textContent).toContain("这里是在描述进行中的状态。");

        const backButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.querySelector("svg"));
        expect(backButton).toBeTruthy();

        await act(async () => {
            backButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const reopenedAskToggleButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("向AI提问"));
        expect(reopenedAskToggleButton).toBeTruthy();

        await act(async () => {
            reopenedAskToggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const reopenedQuestionButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("问题 1"));
        expect(reopenedQuestionButton?.getAttribute("aria-expanded")).toBe("false");
        expect(container.textContent).not.toContain("这里是在描述进行中的状态。");
    });

    it("auto opens ask panel when default-open token is provided", async () => {
        const { container } = await renderPopup({
            qaPairs: [
                { id: 1, question: "这句什么意思？", answer: "这是在讨论就业场景。", isStreaming: false },
            ],
            askPanelDefaultOpenToken: 1,
        });

        expect(container.textContent).toContain("这是在讨论就业场景。");
    });

    it("switches ask answer mode when clicking segmented buttons", async () => {
        const onAskAnswerModeChange = vi.fn();
        const { container } = await renderPopup({
            popupMode: "ask",
            onAskAnswerModeChange,
        });

        const shortModeButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.trim() === "简短");
        expect(shortModeButton).toBeTruthy();

        await act(async () => {
            shortModeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onAskAnswerModeChange).toHaveBeenCalledWith("short");
    });

    it("lets the ask dock move by dragging its header", async () => {
        HTMLElement.prototype.setPointerCapture = vi.fn();
        HTMLElement.prototype.releasePointerCapture = vi.fn();
        HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);

        const { container } = await renderPopup({
            popupMode: "ask",
            qaPairs: [
                { id: 1, question: "这句什么意思？", answer: "这是解释。", reasoningContent: "", isStreaming: false },
            ],
        });

        const popup = container.querySelector<HTMLElement>('[data-selection-ask-dock="true"]');
        const dragHandle = container.querySelector<HTMLElement>('[data-selection-ask-drag-handle="true"]');
        expect(popup).toBeTruthy();
        expect(dragHandle).toBeTruthy();

        const initialLeft = Number.parseFloat(popup?.style.left ?? "0");
        const initialTop = Number.parseFloat(popup?.style.top ?? "0");

        await act(async () => {
            dispatchPointer(dragHandle!, "pointerdown", { clientX: 100, clientY: 100 });
            dispatchPointer(dragHandle!, "pointermove", { clientX: 140, clientY: 130 });
            dispatchPointer(dragHandle!, "pointerup", { clientX: 140, clientY: 130 });
        });

        expect(Number.parseFloat(popup?.style.left ?? "0")).toBeGreaterThan(initialLeft);
        expect(Number.parseFloat(popup?.style.top ?? "0")).toBeGreaterThan(initialTop);
    });

    it("lets the ask dock resize from its bottom-right handle", async () => {
        HTMLElement.prototype.setPointerCapture = vi.fn();
        HTMLElement.prototype.releasePointerCapture = vi.fn();
        HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);

        const { container } = await renderPopup({
            popupMode: "ask",
            qaPairs: [
                { id: 1, question: "这句什么意思？", answer: "这是解释。", reasoningContent: "", isStreaming: false },
            ],
        });

        const popup = container.querySelector<HTMLElement>('[data-selection-ask-dock="true"]');
        const resizeHandle = container.querySelector<HTMLElement>('[data-selection-ask-resize-handle="bottom-right"]');
        expect(popup).toBeTruthy();
        expect(resizeHandle).toBeTruthy();

        const initialWidth = Number.parseFloat(popup?.style.width ?? "0");
        const initialHeight = Number.parseFloat(popup?.style.height ?? "0");

        await act(async () => {
            dispatchPointer(resizeHandle!, "pointerdown", { clientX: 300, clientY: 300 });
            dispatchPointer(resizeHandle!, "pointermove", { clientX: 360, clientY: 350 });
            dispatchPointer(resizeHandle!, "pointerup", { clientX: 360, clientY: 350 });
        });

        expect(Number.parseFloat(popup?.style.width ?? "0")).toBeGreaterThan(initialWidth);
        expect(Number.parseFloat(popup?.style.height ?? "0")).toBeGreaterThan(initialHeight);
    });

    it("shows ask replay view directly when popup mode is ask-replay", async () => {
        const { container } = await renderPopup({
            popupMode: "ask-replay",
            qaPairs: [
                { id: 1, question: "这句话想表达什么？", answer: "强调学历是过去求职的重要信号。", isStreaming: false },
            ],
            askPanelDefaultOpenToken: 1,
        });

        expect(container.textContent).toContain("强调学历是过去求职的重要信号。");
        expect(container.textContent).toContain("强调学历是过去求职的重要信号。");
        expect(container.textContent).not.toContain("向AI提问");
        expect(container.textContent).not.toContain("高亮");
    });

    it("shows lookup action in normal selection mode and triggers callback", async () => {
        const onLookupWord = vi.fn();
        const { container } = await renderPopup({
            onLookupWord,
        });

        const lookupButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("查询"));

        expect(lookupButton).toBeTruthy();

        await act(async () => {
            lookupButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onLookupWord).toHaveBeenCalledTimes(1);
    });

    it("hides lookup action in ask replay mode", async () => {
        const { container } = await renderPopup({
            popupMode: "ask-replay",
        });

        expect(container.textContent).not.toContain("查询");
    });
});
