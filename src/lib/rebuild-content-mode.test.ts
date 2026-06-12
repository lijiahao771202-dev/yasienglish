import { describe, expect, it } from "vitest";

import {
    getRebuildContentModePrompt,
    normalizeRebuildContentMode,
} from "@/lib/rebuild-content-mode";

describe("rebuild content mode", () => {
    it("normalizes unknown values to dialogue", () => {
        expect(normalizeRebuildContentMode("blog")).toBe("blog");
        expect(normalizeRebuildContentMode("unknown")).toBe("dialogue");
        expect(normalizeRebuildContentMode(undefined)).toBe("dialogue");
    });

    it("keeps article-like modes away from direct dialogue", () => {
        expect(getRebuildContentModePrompt("article")).toContain("Avoid direct dialogue replies");
        expect(getRebuildContentModePrompt("dialogue")).toContain("everyday dialogue");
    });
});
