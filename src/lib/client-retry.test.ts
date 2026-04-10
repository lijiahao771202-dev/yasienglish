import { describe, expect, it, vi } from "vitest";

import { isRetryableClientError, retryClientAction } from "./client-retry";

describe("client-retry", () => {
    it("retries transient client errors until success", async () => {
        vi.useFakeTimers();
        let attempts = 0;
        const task = retryClientAction(async () => {
            attempts += 1;
            if (attempts < 3) {
                throw new Error("failed to fetch");
            }
            return "ok";
        });

        await vi.runAllTimersAsync();
        await expect(task).resolves.toBe("ok");
        expect(attempts).toBe(3);
        vi.useRealTimers();
    });

    it("does not retry abort errors", async () => {
        const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
        const task = vi.fn().mockRejectedValue(abortError);

        await expect(retryClientAction(task)).rejects.toBe(abortError);
        expect(task).toHaveBeenCalledTimes(1);
    });

    it("treats retryable response status as transient", () => {
        const error = Object.assign(new Error("service unavailable"), { responseStatus: 503 });
        expect(isRetryableClientError(error)).toBe(true);
    });
});
