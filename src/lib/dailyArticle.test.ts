import { describe, expect, it, vi } from "vitest";

import { resolveDailyArticleCandidate } from "./dailyArticle";

describe("resolveDailyArticleCandidate", () => {
    it("falls through to the next parseable feed item when the first item fails", async () => {
        const parseArticle = vi.fn()
            .mockRejectedValueOnce(new Error("401 HTTP Forbidden"))
            .mockResolvedValueOnce({ title: "Second article" });
        const getExistingArticle = vi.fn().mockResolvedValue(undefined);

        const result = await resolveDailyArticleCandidate({
            items: [
                { link: "https://example.com/blocked" },
                { link: "https://example.com/ok" },
            ],
            getExistingArticle,
            parseArticle,
        });

        expect(result).toEqual({
            url: "https://example.com/ok",
            articleData: { title: "Second article" },
            source: "parsed",
        });
        expect(parseArticle).toHaveBeenCalledTimes(2);
    });

    it("returns an existing cached article without reparsing it", async () => {
        const getExistingArticle = vi.fn()
            .mockResolvedValueOnce({ title: "Cached article" });
        const parseArticle = vi.fn();

        const result = await resolveDailyArticleCandidate({
            items: [
                { link: "https://example.com/cached" },
                { link: "https://example.com/other" },
            ],
            getExistingArticle,
            parseArticle,
        });

        expect(result).toEqual({
            url: "https://example.com/cached",
            articleData: { title: "Cached article" },
            source: "cached",
        });
        expect(parseArticle).not.toHaveBeenCalled();
    });

    it("skips feed items without usable urls and returns null when none succeed", async () => {
        const getExistingArticle = vi.fn().mockResolvedValue(undefined);
        const parseArticle = vi.fn().mockRejectedValue(new Error("boom"));

        const result = await resolveDailyArticleCandidate({
            items: [
                {},
                { url: "" },
                { link: "https://example.com/fail" },
            ],
            getExistingArticle,
            parseArticle,
        });

        expect(result).toBeNull();
        expect(parseArticle).toHaveBeenCalledTimes(1);
    });
});
