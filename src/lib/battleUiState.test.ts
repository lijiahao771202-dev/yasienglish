import { describe, expect, it } from "vitest";

import {
    getDrillSurfacePhase,
    shouldExpandShopInventoryDock,
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

describe("shouldExpandShopInventoryDock", () => {
    it("keeps the inventory collapsed on desktop until the shop is hovered", () => {
        expect(
            shouldExpandShopInventoryDock({
                hasHoverSupport: true,
                isShopHovered: false,
            }),
        ).toBe(false);
    });

    it("expands the inventory on desktop while the shop area is hovered", () => {
        expect(
            shouldExpandShopInventoryDock({
                hasHoverSupport: true,
                isShopHovered: true,
            }),
        ).toBe(true);
    });

    it("keeps the inventory visible on touch devices without hover", () => {
        expect(
            shouldExpandShopInventoryDock({
                hasHoverSupport: false,
                isShopHovered: false,
            }),
        ).toBe(true);
    });
});
