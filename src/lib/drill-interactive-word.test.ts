import { describe, expect, it } from "vitest";

import { getBattleInteractiveWordClassName } from "./drill-interactive-word";

describe("getBattleInteractiveWordClassName", () => {
    it("keeps karaoke highlighting disabled by default", () => {
        expect(getBattleInteractiveWordClassName({
            isActive: false,
            isKaraokeActive: true,
        })).toBe("text-stone-700");
    });

    it("keeps the active word highlight unchanged", () => {
        expect(getBattleInteractiveWordClassName({
            isActive: true,
            isKaraokeActive: true,
        })).toContain("text-rose-700");
    });
});
