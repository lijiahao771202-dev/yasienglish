import { describe, expect, it, vi } from "vitest";

import { waitForRagReady } from "./rag-readiness";

describe("waitForRagReady", () => {
    it("returns false when the vector engine does not become ready before the timeout", async () => {
        vi.useFakeTimers();
        const ensureReady = vi.fn(() => new Promise<boolean>(() => undefined));

        const pending = waitForRagReady(ensureReady, 500);
        await vi.advanceTimersByTimeAsync(500);

        await expect(pending).resolves.toBe(false);
        expect(ensureReady).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it("returns true when the vector engine becomes ready in time", async () => {
        const ensureReady = vi.fn().mockResolvedValue(true);

        await expect(waitForRagReady(ensureReady, 500)).resolves.toBe(true);
    });
});
