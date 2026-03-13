import { describe, expect, it, vi } from "vitest";

import { buildGuidedHintCacheKey, fetchGuidedHintWithRetry } from "./guidedHintClient";

describe("guidedHintClient", () => {
    it("builds a stable cache key from slot context", () => {
        const key = buildGuidedHintCacheKey({
            guidedKey: "question-1",
            slotId: "slot-2",
            innerMode: "teacher_guided",
            attempt: 1,
            requestCount: 0,
            leftContext: "I",
            rightContext: "yesterday",
        });

        expect(key).toBe(JSON.stringify({
            guidedKey: "question-1",
            slotId: "slot-2",
            innerMode: "teacher_guided",
            attempt: 1,
            requestCount: 0,
            leftContext: "I",
            rightContext: "yesterday",
        }));
    });

    it("changes cache key when the manual AI hint is requested again", () => {
        const first = buildGuidedHintCacheKey({
            guidedKey: "question-1",
            slotId: "slot-2",
            innerMode: "teacher_guided",
            attempt: 1,
            requestCount: 0,
            leftContext: "I",
            rightContext: "yesterday",
        });
        const second = buildGuidedHintCacheKey({
            guidedKey: "question-1",
            slotId: "slot-2",
            innerMode: "teacher_guided",
            attempt: 1,
            requestCount: 1,
            leftContext: "I",
            rightContext: "yesterday",
        });

        expect(second).not.toBe(first);
    });

    it("retries transient failures and eventually returns the hint", async () => {
        let attempts = 0;
        const hint = await fetchGuidedHintWithRetry(async () => {
            attempts += 1;
            if (attempts < 3) {
                throw new Error("temporary failure");
            }
            return { primary: "第三次成功", secondary: null, rescue: null };
        }, 3);

        expect(hint.primary).toBe("第三次成功");
        expect(attempts).toBe(3);
    });

    it("does not retry abort errors", async () => {
        const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
        const fetcher = vi.fn().mockRejectedValue(abortError);

        await expect(fetchGuidedHintWithRetry(fetcher, 3)).rejects.toBe(abortError);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
