import { describe, expect, it } from "vitest";

import { resolveNextDrillEffectiveElo } from "./drill-elo";

describe("resolveNextDrillEffectiveElo", () => {
    it("uses the settled current elo for normal next-question generation", () => {
        expect(resolveNextDrillEffectiveElo({ currentElo: 1530 })).toBe(1530);
    });

    it("respects a forced elo override when provided", () => {
        expect(resolveNextDrillEffectiveElo({ currentElo: 1530, forcedElo: 1490 })).toBe(1490);
    });

    it("never returns a negative elo", () => {
        expect(resolveNextDrillEffectiveElo({ currentElo: 100, forcedElo: -25 })).toBe(0);
    });
});
