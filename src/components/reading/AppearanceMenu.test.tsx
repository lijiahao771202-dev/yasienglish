/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppearanceMenu } from "./AppearanceMenu";

const readingSettingsMock = vi.hoisted(() => ({
    theme: "warm",
    setTheme: vi.fn(),
    font: "serif",
    setFont: vi.fn(),
    fontSize: "text-xl",
    setFontSize: vi.fn(),
    translationFont: "serif",
    setTranslationFont: vi.fn(),
    translationFontSize: "text-base",
    setTranslationFontSize: vi.fn(),
    translationColor: "muted",
    setTranslationColor: vi.fn(),
    phraseDisplayMode: "capsule",
    setPhraseDisplayMode: vi.fn(),
    paperStyle: "brutalist",
    setPaperStyle: vi.fn(),
}));

vi.mock("@/contexts/ReadingSettingsContext", () => ({
    useReadingSettings: () => readingSettingsMock,
}));

describe("AppearanceMenu", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        vi.clearAllMocks();
    });

    it("switches between english and chinese typography panels instead of rendering both at once", async () => {
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<AppearanceMenu onClose={vi.fn()} />);
        });

        expect(container.textContent).toContain("Theme");
        expect(container.textContent).toContain("Typography");
        expect(container.textContent).toContain("English");
        expect(container.textContent).toContain("Chinese");
        expect(container.textContent).not.toContain("Muted");
        expect(container.textContent).not.toContain("CN ");

        const chineseToggle = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Chinese"));
        expect(chineseToggle).toBeTruthy();

        await act(async () => {
            chineseToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.textContent).toContain("Chinese");
        expect(container.textContent).toContain("CN ");
        expect(container.textContent).not.toContain("Typography");
        expect(container.textContent).not.toContain("Phrase Display");

        await act(async () => {
            root.unmount();
        });
    });
});
