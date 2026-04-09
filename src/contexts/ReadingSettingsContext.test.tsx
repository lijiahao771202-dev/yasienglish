/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReadingSettingsProvider, useReadingSettings } from "./ReadingSettingsContext";

function Consumer() {
    const { theme, font, fontSize, isFocusMode, isBionicMode } = useReadingSettings();
    return (
        <div
            data-theme={theme}
            data-font={font}
            data-font-size={fontSize}
            data-focus={String(isFocusMode)}
            data-bionic={String(isBionicMode)}
        />
    );
}

describe("ReadingSettingsProvider", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        window.localStorage.clear();
        document.body.innerHTML = "";
    });

    it("renders stable defaults during SSR even when local storage has user settings", () => {
        window.localStorage.setItem("reading_theme", "navy");
        window.localStorage.setItem("reading_font", "work-sans");
        window.localStorage.setItem("reading_size", "text-2xl");
        window.localStorage.setItem("reading_focus_mode", "true");
        window.localStorage.setItem("reading_bionic_mode", "true");

        const html = renderToString(
            <ReadingSettingsProvider>
                <Consumer />
            </ReadingSettingsProvider>,
        );

        expect(html).toContain('data-theme="warm"');
        expect(html).toContain('data-font="serif"');
        expect(html).toContain('data-font-size="text-xl"');
        expect(html).toContain('data-focus="false"');
        expect(html).toContain('data-bionic="false"');
    });

    it("hydrates client settings from local storage after mount", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        window.localStorage.setItem("reading_theme", "navy");
        window.localStorage.setItem("reading_font", "work-sans");
        window.localStorage.setItem("reading_size", "text-2xl");
        window.localStorage.setItem("reading_focus_mode", "true");
        window.localStorage.setItem("reading_bionic_mode", "true");

        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ReadingSettingsProvider>
                    <Consumer />
                </ReadingSettingsProvider>,
            );
        });

        const node = container.querySelector("div");
        expect(node?.getAttribute("data-theme")).toBe("navy");
        expect(node?.getAttribute("data-font")).toBe("work-sans");
        expect(node?.getAttribute("data-font-size")).toBe("text-2xl");
        expect(node?.getAttribute("data-focus")).toBe("true");
        expect(node?.getAttribute("data-bionic")).toBe("true");

        await act(async () => {
            root.unmount();
        });
    });
});
