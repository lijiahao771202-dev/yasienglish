/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadingSettingsProvider } from "@/contexts/ReadingSettingsContext";
import { ArticleDisplay } from "./ArticleDisplay";

const paragraphCardProps: Array<Record<string, unknown>> = [];
let latestWordPopup: Record<string, unknown> | null = null;

vi.mock("./ParagraphCard", () => ({
    ParagraphCard: (props: Record<string, unknown> & { text: string }) => {
        paragraphCardProps.push(props);
        return <p>{props.text}</p>;
    },
}));

vi.mock("./WordPopup", () => ({
    WordPopup: ({ popup }: { popup: Record<string, unknown> }) => {
        latestWordPopup = popup;
        return popup ? <div data-testid="word-popup">{String(popup.word)}</div> : null;
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
    });

    it("renders an external source link when the original article URL is available", async () => {
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
        expect(latestWordPopup?.context).toBe(paragraphText);
        expect(latestWordPopup?.sourceSentence).toBe(paragraphText);

        await act(async () => {
            root.unmount();
        });
    });
});
