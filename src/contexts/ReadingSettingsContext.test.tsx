/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReadingSettingsProvider, useReadingSettings } from "./ReadingSettingsContext";

function Consumer() {
    const {
        theme,
        font,
        fontSize,
        translationFont,
        translationFontSize,
        translationColor,
        isFocusMode,
        isBionicMode,
        phraseDisplayMode,
        paperStyle,
    } = useReadingSettings();
    return (
        <div
            data-theme={theme}
            data-font={font}
            data-font-size={fontSize}
            data-translation-font={translationFont}
            data-translation-font-size={translationFontSize}
            data-translation-color={translationColor}
            data-focus={String(isFocusMode)}
            data-bionic={String(isBionicMode)}
            data-phrase-display-mode={phraseDisplayMode}
            data-paper-style={paperStyle}
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
        window.localStorage.setItem("reading_translation_font", "sans");
        window.localStorage.setItem("reading_translation_size", "text-lg");
        window.localStorage.setItem("reading_translation_color", "stone");
        window.localStorage.setItem("reading_focus_mode", "true");
        window.localStorage.setItem("reading_bionic_mode", "true");
        window.localStorage.setItem("reading_phrase_display_mode", "inline_wavy");
        window.localStorage.setItem("reading_paper_style", "grid");

        const html = renderToString(
            <ReadingSettingsProvider>
                <Consumer />
            </ReadingSettingsProvider>,
        );

        expect(html).toContain('data-theme="warm"');
        expect(html).toContain('data-font="serif"');
        expect(html).toContain('data-font-size="text-xl"');
        expect(html).toContain('data-translation-font="serif"');
        expect(html).toContain('data-translation-font-size="text-base"');
        expect(html).toContain('data-translation-color="muted"');
        expect(html).toContain('data-focus="false"');
        expect(html).toContain('data-bionic="false"');
        expect(html).toContain('data-phrase-display-mode="capsule"');
        expect(html).toContain('data-paper-style="brutalist"');
    });

    it("hydrates client settings from local storage after mount", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        window.localStorage.setItem("reading_theme", "navy");
        window.localStorage.setItem("reading_font", "work-sans");
        window.localStorage.setItem("reading_size", "text-2xl");
        window.localStorage.setItem("reading_translation_font", "sans");
        window.localStorage.setItem("reading_translation_size", "text-lg");
        window.localStorage.setItem("reading_translation_color", "stone");
        window.localStorage.setItem("reading_focus_mode", "true");
        window.localStorage.setItem("reading_bionic_mode", "true");
        window.localStorage.setItem("reading_phrase_display_mode", "inline_wavy");
        window.localStorage.setItem("reading_paper_style", "grid");

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
        expect(node?.getAttribute("data-translation-font")).toBe("sans");
        expect(node?.getAttribute("data-translation-font-size")).toBe("text-lg");
        expect(node?.getAttribute("data-translation-color")).toBe("stone");
        expect(node?.getAttribute("data-focus")).toBe("true");
        expect(node?.getAttribute("data-bionic")).toBe("true");
        expect(node?.getAttribute("data-phrase-display-mode")).toBe("inline_wavy");
        expect(node?.getAttribute("data-paper-style")).toBe("grid");

        await act(async () => {
            root.unmount();
        });
    });
});
