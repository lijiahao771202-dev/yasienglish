/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadingSettingsProvider } from "@/contexts/ReadingSettingsContext";
import { ArticleDisplay } from "./ArticleDisplay";

const paragraphCardProps: Array<Record<string, unknown>> = [];
let latestWordPopup: Record<string, unknown> | null = null;

function markReactActEnvironment() {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

vi.mock("./ParagraphCard", () => ({
    ParagraphCard: (props: Record<string, unknown> & { text: string }) => {
        paragraphCardProps.push(props);
        return (
            <div>
                <button type="button">Ask AI</button>
                <p data-paragraph-text="true" data-testid={`paragraph-${String(props.paragraphOrder)}`}>
                    {props.text}
                </p>
            </div>
        );
    },
}));

vi.mock("./WordPopup", () => ({
    WordPopup: ({ popup, showAiDefinitionButton }: { popup: Record<string, unknown>; showAiDefinitionButton?: boolean }) => {
        latestWordPopup = popup;
        return popup ? <div data-testid="word-popup" data-ai-button={showAiDefinitionButton ? "true" : "false"}>{String(popup.word)}</div> : null;
    },
}));

vi.mock("./TEDVideoPlayer", () => ({
    __esModule: true,
    default: React.forwardRef(function MockTedVideoPlayer() {
        return null;
    }),
}));

describe("ArticleDisplay", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        paragraphCardProps.length = 0;
        latestWordPopup = null;
        vi.restoreAllMocks();
    });

    it("renders an external source link when the original article URL is available", async () => {
        markReactActEnvironment();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ReadingSettingsProvider>
                    <ArticleDisplay
                        title="Sample article"
                        content="<p>Sample body</p>"
                        blocks={[{ type: "paragraph", content: "Sample body" }]}
                        articleUrl="https://example.com/story"
                    />
                </ReadingSettingsProvider>,
            );
        });

        const sourceLink = container.querySelector<HTMLAnchorElement>('a[href="https://example.com/story"]');
        expect(sourceLink).toBeTruthy();
        expect(sourceLink?.target).toBe("_blank");
        expect(sourceLink?.textContent).toContain("原文");

        await act(async () => {
            root.unmount();
        });
    });

    it("does not render an external source link for local articles", async () => {
        markReactActEnvironment();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ReadingSettingsProvider>
                    <ArticleDisplay
                        title="Local article"
                        content="<p>Sample body</p>"
                        blocks={[{ type: "paragraph", content: "Sample body" }]}
                        articleUrl="local://ielts/0"
                    />
                </ReadingSettingsProvider>,
            );
        });

        expect(container.querySelector("a")).toBeNull();

        await act(async () => {
            root.unmount();
        });
    });

    it("opens WordPopup from paragraph selection lookup payload", async () => {
        markReactActEnvironment();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const paragraphText = "The transferable strategy is conscious substitution.";

        await act(async () => {
            root.render(
                <ReadingSettingsProvider>
                    <ArticleDisplay
                        title="Selection article"
                        content={`<p>${paragraphText}</p>`}
                        blocks={[{ type: "paragraph", content: paragraphText }]}
                        articleUrl="https://example.com/story"
                    />
                </ReadingSettingsProvider>,
            );
        });

        const firstParagraphCard = paragraphCardProps[0];
        expect(firstParagraphCard).toBeTruthy();
        expect(typeof firstParagraphCard.onOpenWordPopupFromSelection).toBe("function");

        await act(async () => {
            (firstParagraphCard.onOpenWordPopupFromSelection as (payload: Record<string, unknown>) => void)({
                word: "conscious substitution",
                context: paragraphText,
                x: 240,
                y: 320,
                articleUrl: "https://example.com/story",
                sourceKind: "read",
                sourceLabel: "来自 Read",
                sourceSentence: paragraphText,
                sourceNote: "Selection article",
            });
        });

        expect(container.querySelector('[data-testid="word-popup"]')?.textContent).toBe("conscious substitution");
        expect(container.querySelector('[data-testid="word-popup"]')?.getAttribute("data-ai-button")).toBe("true");
        expect(latestWordPopup?.context).toBe(paragraphText);
        expect(latestWordPopup?.sourceSentence).toBe(paragraphText);

        await act(async () => {
            root.unmount();
        });
    });

    it("prefers caret word lookup over phrase selection inside inline phrase markup", async () => {
        markReactActEnvironment();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const paragraphText = "People often bridge the gap through shared rituals.";

        await act(async () => {
            root.render(
                <ReadingSettingsProvider>
                    <ArticleDisplay
                        title="Inline phrase article"
                        content={`<p>${paragraphText}</p>`}
                        blocks={[{ type: "paragraph", content: paragraphText }]}
                        articleUrl="https://example.com/story"
                    />
                </ReadingSettingsProvider>,
            );
        });

        const firstParagraphCard = paragraphCardProps[0];
        expect(firstParagraphCard).toBeTruthy();
        expect(typeof firstParagraphCard.onWordClick).toBe("function");

        const sentenceSpan = document.createElement("span");
        sentenceSpan.setAttribute("data-translation-inline-phrases", "true");
        sentenceSpan.appendChild(document.createTextNode("People often "));

        const phraseWrapper = document.createElement("span");
        phraseWrapper.setAttribute("data-translation-inline-phrase", "true");
        const phraseTextNode = document.createTextNode("bridge the gap");
        phraseWrapper.appendChild(phraseTextNode);
        sentenceSpan.appendChild(phraseWrapper);
        sentenceSpan.appendChild(document.createTextNode(" through shared rituals."));
        document.body.appendChild(sentenceSpan);

        const selectionRect = {
            left: 20,
            width: 100,
            bottom: 48,
        };
        const selectionMock = {
            isCollapsed: false,
            toString: () => "bridge the gap",
            anchorNode: phraseTextNode,
            focusNode: phraseTextNode,
            containsNode: (node: Node) => node === phraseTextNode || node === phraseWrapper,
            getRangeAt: () => ({
                getBoundingClientRect: () => selectionRect,
            }),
        } as unknown as Selection;
        vi.spyOn(window, "getSelection").mockReturnValue(selectionMock);

        const caretRange = document.createRange();
        caretRange.setStart(phraseTextNode, 2);
        caretRange.setEnd(phraseTextNode, 2);
        Object.defineProperty(document, "caretRangeFromPoint", {
            configurable: true,
            value: vi.fn(() => caretRange),
        });

        await act(async () => {
            (firstParagraphCard.onWordClick as (event: React.MouseEvent) => void)({
                clientX: 132,
                clientY: 164,
                target: phraseWrapper,
            } as unknown as React.MouseEvent);
        });

        expect(latestWordPopup?.word).toBe("bridge");
        expect(latestWordPopup?.sourceSentence).toBe(paragraphText);
        expect(latestWordPopup?.x).toBe(132);
        expect(latestWordPopup?.y).toBe(184);

        await act(async () => {
            root.unmount();
        });
    });

    it("does not throw when the temporary highlight span is already detached before popup cleanup", async () => {
        markReactActEnvironment();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const paragraphText = "People often bridge the gap through shared rituals.";

        await act(async () => {
            root.render(
                <ReadingSettingsProvider>
                    <ArticleDisplay
                        title="Detached highlight article"
                        content={`<p>${paragraphText}</p>`}
                        blocks={[{ type: "paragraph", content: paragraphText }]}
                        articleUrl="https://example.com/story"
                    />
                </ReadingSettingsProvider>,
            );
        });

        const firstParagraphCard = paragraphCardProps[0];
        expect(firstParagraphCard).toBeTruthy();
        expect(typeof firstParagraphCard.onWordClick).toBe("function");

        const textNode = document.createTextNode(paragraphText);
        const host = document.createElement("p");
        host.appendChild(textNode);
        document.body.appendChild(host);

        const caretRange = document.createRange();
        const clickOffset = paragraphText.indexOf("bridge") + 2;
        caretRange.setStart(textNode, clickOffset);
        caretRange.setEnd(textNode, clickOffset);
        Object.defineProperty(document, "caretRangeFromPoint", {
            configurable: true,
            value: vi.fn(() => caretRange),
        });
        vi.spyOn(window, "getSelection").mockReturnValue({
            isCollapsed: true,
            toString: () => "",
        } as unknown as Selection);

        await act(async () => {
            (firstParagraphCard.onWordClick as (event: React.MouseEvent) => void)({
                clientX: 132,
                clientY: 164,
                target: textNode,
            } as unknown as React.MouseEvent);
        });

        const highlightSpan = host.querySelector("span");
        expect(highlightSpan).toBeTruthy();
        highlightSpan?.remove();

        await act(async () => {
            root.render(
                <ReadingSettingsProvider>
                    <ArticleDisplay
                        title="Detached highlight article"
                        content={`<p>${paragraphText}</p>`}
                        blocks={[{ type: "paragraph", content: paragraphText }]}
                        articleUrl="https://example.com/story"
                    />
                </ReadingSettingsProvider>,
            );
        });

        expect(container.querySelector('[data-testid="word-popup"]')?.textContent).toBe("bridge");

        await act(async () => {
            root.unmount();
        });
    });

    it("passes cross-paragraph ask context attachment to paragraph cards", async () => {
        markReactActEnvironment();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ReadingSettingsProvider>
                    <ArticleDisplay
                        title="Cross paragraph article"
                        content="<p>First paragraph.</p><p>Second paragraph.</p>"
                        blocks={[
                            { type: "paragraph", content: "First paragraph." },
                            { type: "paragraph", content: "Second paragraph." },
                        ]}
                        articleUrl="https://example.com/story"
                    />
                </ReadingSettingsProvider>,
            );
        });

        const firstParagraphCard = paragraphCardProps[0];
        const secondParagraphCard = paragraphCardProps[1];
        expect(typeof firstParagraphCard.onOpenAskWithContext).toBe("function");

        const context = {
            id: "ask-context:1:0-5|2:0-6",
            kind: "cross_paragraph",
            label: "跨段选区",
            rangeLabel: "第 1-2 段",
            text: "First Second",
            excerpt: "First Second",
            paragraphRanges: [
                {
                    paragraphOrder: 1,
                    paragraphBlockIndex: 0,
                    startOffset: 0,
                    endOffset: 5,
                    text: "First",
                    paragraphText: "First paragraph.",
                },
                {
                    paragraphOrder: 2,
                    paragraphBlockIndex: 1,
                    startOffset: 0,
                    endOffset: 6,
                    text: "Second",
                    paragraphText: "Second paragraph.",
                },
            ],
        };

        await act(async () => {
            (firstParagraphCard.onOpenAskWithContext as (payload: unknown) => void)(context);
        });

        const latestFirstParagraphCard = paragraphCardProps.at(-2);
        const latestSecondParagraphCard = paragraphCardProps.at(-1);
        expect(latestFirstParagraphCard?.askContextAttachment).toEqual(context);
        expect(latestSecondParagraphCard?.askContextAttachment).toBeNull();

        await act(async () => {
            root.unmount();
        });
    });

    it("resolves active DOM selection into cross-paragraph ask context using paragraph text nodes", async () => {
        markReactActEnvironment();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ReadingSettingsProvider>
                    <ArticleDisplay
                        title="Cross paragraph article"
                        content="<p>First paragraph.</p><p>Second paragraph.</p>"
                        blocks={[
                            { type: "paragraph", content: "First paragraph." },
                            { type: "paragraph", content: "Second paragraph." },
                        ]}
                        articleUrl="https://example.com/story"
                    />
                </ReadingSettingsProvider>,
            );
        });

        const firstParagraphText = container.querySelector<HTMLElement>('[data-testid="paragraph-1"]');
        const secondParagraphText = container.querySelector<HTMLElement>('[data-testid="paragraph-2"]');
        expect(firstParagraphText?.firstChild).toBeTruthy();
        expect(secondParagraphText?.firstChild).toBeTruthy();

        const range = document.createRange();
        range.setStart(firstParagraphText!.firstChild!, 6);
        range.setEnd(secondParagraphText!.firstChild!, 6);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        const firstParagraphCard = paragraphCardProps[0];
        expect(typeof firstParagraphCard.onOpenAskWithContext).toBe("function");

        await act(async () => {
            (firstParagraphCard.onOpenAskWithContext as (payload: unknown) => unknown)({
                id: "fallback",
                kind: "paragraph",
                label: "整段上下文",
                rangeLabel: "第 1 段",
                text: "First paragraph.",
                excerpt: "First paragraph.",
                paragraphRanges: [{
                    paragraphOrder: 1,
                    paragraphBlockIndex: 0,
                    startOffset: 0,
                    endOffset: 16,
                    text: "First paragraph.",
                    paragraphText: "First paragraph.",
                }],
            });
        });

        const latestFirstParagraphCard = paragraphCardProps.at(-2);
        const latestSecondParagraphCard = paragraphCardProps.at(-1);
        const context = latestFirstParagraphCard?.askContextAttachment as Record<string, unknown> | null;
        expect(context).toMatchObject({
            kind: "cross_paragraph",
            label: "跨段选区",
            rangeLabel: "第 1-2 段",
            text: "paragraph. Second",
        });
        expect(latestSecondParagraphCard?.askContextAttachment).toBeNull();
        expect((context?.paragraphRanges as Array<Record<string, unknown>>)[0]).toMatchObject({
            paragraphOrder: 1,
            startOffset: 6,
            endOffset: 16,
            text: "paragraph.",
        });
        expect((context?.paragraphRanges as Array<Record<string, unknown>>)[1]).toMatchObject({
            paragraphOrder: 2,
            startOffset: 0,
            endOffset: 6,
            text: "Second",
        });

        selection?.removeAllRanges();
        await act(async () => {
            root.unmount();
        });
    });

    it("injects a new ask selection into the currently open ask dock instead of moving the dock", async () => {
        markReactActEnvironment();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ReadingSettingsProvider>
                    <ArticleDisplay
                        title="Ask dock article"
                        content="<p>First paragraph.</p><p>Second paragraph.</p>"
                        blocks={[
                            { type: "paragraph", content: "First paragraph." },
                            { type: "paragraph", content: "Second paragraph." },
                        ]}
                        articleUrl="https://example.com/story"
                    />
                </ReadingSettingsProvider>,
            );
        });

        const firstAskContext = {
            id: "ask-context:paragraph-1",
            kind: "paragraph",
            label: "整段上下文",
            rangeLabel: "第 1 段",
            text: "First paragraph.",
            excerpt: "First paragraph.",
            paragraphRanges: [{
                paragraphOrder: 1,
                paragraphBlockIndex: 0,
                startOffset: 0,
                endOffset: 16,
                text: "First paragraph.",
                paragraphText: "First paragraph.",
            }],
        };
        const secondAskContext = {
            id: "ask-context:paragraph-2",
            kind: "selection",
            label: "选中文本",
            rangeLabel: "第 2 段",
            text: "Second",
            excerpt: "Second",
            paragraphRanges: [{
                paragraphOrder: 2,
                paragraphBlockIndex: 1,
                startOffset: 0,
                endOffset: 6,
                text: "Second",
                paragraphText: "Second paragraph.",
            }],
        };

        await act(async () => {
            (paragraphCardProps[0].onOpenAskWithContext as (payload: unknown) => unknown)(firstAskContext);
        });

        let latestFirstParagraphCard = paragraphCardProps.at(-2);
        let latestSecondParagraphCard = paragraphCardProps.at(-1);
        expect(latestFirstParagraphCard?.askContextAttachment).toEqual(firstAskContext);
        expect(latestFirstParagraphCard?.hasActiveAskDock).toBe(true);
        expect(latestSecondParagraphCard?.hasActiveAskDock).toBe(true);
        expect(latestSecondParagraphCard?.askContextAttachment).toBeNull();

        await act(async () => {
            (latestSecondParagraphCard?.onOpenAskWithContext as (payload: unknown) => unknown)(secondAskContext);
        });

        latestFirstParagraphCard = paragraphCardProps.at(-2);
        latestSecondParagraphCard = paragraphCardProps.at(-1);
        expect(latestFirstParagraphCard?.askContextAttachment).toEqual(secondAskContext);
        expect(latestSecondParagraphCard?.askContextAttachment).toBeNull();

        await act(async () => {
            root.unmount();
        });
    });
});
