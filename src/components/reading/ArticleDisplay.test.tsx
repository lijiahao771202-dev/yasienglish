/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadingSettingsProvider } from "@/contexts/ReadingSettingsContext";
import { ArticleDisplay } from "./ArticleDisplay";

vi.mock("./ParagraphCard", () => ({
    ParagraphCard: ({ text }: { text: string }) => <p>{text}</p>,
}));

vi.mock("./WordPopup", () => ({
    WordPopup: () => null,
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
        expect(sourceLink?.textContent).toContain("Open original");

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
});
