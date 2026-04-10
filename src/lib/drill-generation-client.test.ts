import { describe, expect, it, vi } from "vitest";

import { fetchNextDrillWithRetry } from "./drill-generation-client";

function buildBody() {
    return {
        articleTitle: "test",
        articleContent: "",
        difficulty: "Level 1",
        eloRating: 800,
        mode: "rebuild" as const,
        sourceMode: "ai",
        _t: 1,
    };
}

describe("fetchNextDrillWithRetry", () => {
    it("retries transient 500 errors and eventually returns drill data", async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Failed to generate rebuild drill." }), { status: 500 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ chinese: "题目", reference_english: "Answer" }), { status: 200 }));

        const data = await fetchNextDrillWithRetry(buildBody(), {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(data).toMatchObject({
            chinese: "题目",
            reference_english: "Answer",
        });
    });

    it("does not retry non-retryable 400 errors", async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Article title is required" }), { status: 400 }));

        await expect(fetchNextDrillWithRetry(buildBody(), {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })).rejects.toThrow("Article title is required");

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("does not retry abort errors", async () => {
        const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
        const fetchImpl = vi.fn().mockRejectedValue(abortError);

        await expect(fetchNextDrillWithRetry(buildBody(), {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })).rejects.toBe(abortError);

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
