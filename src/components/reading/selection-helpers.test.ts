import { describe, expect, it } from "vitest";
import { hasMeaningfulTextSelection } from "./selection-helpers";

describe("hasMeaningfulTextSelection", () => {
    it("returns false for collapsed selection", () => {
        const selection = {
            isCollapsed: true,
            toString: () => "word",
        } as unknown as Selection;

        expect(hasMeaningfulTextSelection(selection)).toBe(false);
    });

    it("returns false for whitespace-only selection", () => {
        const selection = {
            isCollapsed: false,
            toString: () => "   ",
        } as unknown as Selection;

        expect(hasMeaningfulTextSelection(selection)).toBe(false);
    });

    it("returns true for non-empty text selection", () => {
        const selection = {
            isCollapsed: false,
            toString: () => "selected text",
        } as unknown as Selection;

        expect(hasMeaningfulTextSelection(selection)).toBe(true);
    });
});
