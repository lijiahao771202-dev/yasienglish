import { describe, expect, it } from "vitest";

import { getBackgroundThemeSpec } from "./background-preferences";

describe("background themes", () => {
    it("exposes the extended cool-tone theme ids", () => {
        expect(getBackgroundThemeSpec("winter-breeze").name).toBe("Winter Breeze");
        expect(getBackgroundThemeSpec("crystal-frost").name).toBe("Crystal Frost");
    });
});
