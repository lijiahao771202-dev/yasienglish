import { describe, expect, it } from "vitest";

import {
    getDrillSurfacePhase,
    shouldRefreshBattleChart,
} from "./battleUiState";

describe("shouldRefreshBattleChart", () => {
    it("does not refresh on the initial null state", () => {
        expect(shouldRefreshBattleChart(null, null)).toBe(false);
    });

    it("refreshes only after a drill closes", () => {
        expect(
            shouldRefreshBattleChart(
                { type: "scenario", topic: "Random Scenario" },
                null,
            ),
        ).toBe(true);
    });

    it("does not refresh while a drill is opening", () => {
        expect(
            shouldRefreshBattleChart(
                null,
                { type: "scenario", topic: "Random Scenario" },
            ),
        ).toBe(false);
    });
});

describe("getDrillSurfacePhase", () => {
    it("keeps the drill in bootstrap mode until the profile finishes loading", () => {
        expect(
            getDrillSurfacePhase({
                isProfileLoaded: false,
                isGeneratingDrill: false,
                hasDrillData: false,
            }),
        ).toBe("bootstrap");
    });

    it("shows loading instead of an empty shell while the first drill is still being prepared", () => {
        expect(
            getDrillSurfacePhase({
                isProfileLoaded: true,
                isGeneratingDrill: false,
                hasDrillData: false,
            }),
        ).toBe("loading");
    });

    it("switches to ready once drill data exists", () => {
        expect(
            getDrillSurfacePhase({
                isProfileLoaded: true,
                isGeneratingDrill: false,
                hasDrillData: true,
            }),
        ).toBe("ready");
    });
});
