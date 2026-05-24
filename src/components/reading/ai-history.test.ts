import { describe, expect, it } from "vitest";
import { filterAIGenerationHistory, getAIGenerationDifficultyCounts } from "./ai-history";
import { formatLongformHistoryDescriptor } from "@/lib/ai-reading-generation";

describe("ai history helpers", () => {
    const items = [
        { title: "One", link: "1", pubDate: "2026-01-01T00:00:00.000Z", source: "AI Gen", difficulty: "cet4" as const },
        { title: "Two", link: "2", pubDate: "2026-01-02T00:00:00.000Z", source: "AI Gen", difficulty: "cet6" as const },
        { title: "Three", link: "3", pubDate: "2026-01-03T00:00:00.000Z", source: "AI Gen", difficulty: "ielts" as const },
        { title: "Four", link: "4", pubDate: "2026-01-04T00:00:00.000Z", source: "AI Gen" as const },
    ];

    it("counts AI history items by difficulty", () => {
        const counts = getAIGenerationDifficultyCounts(items);

        expect(counts).toEqual([
            { id: "all", label: "全部", count: 4 },
            { id: "cet4", label: "四级", count: 1 },
            { id: "cet6", label: "六级", count: 1 },
            { id: "ielts", label: "雅思", count: 1 },
        ]);
    });

    it("filters AI history by difficulty", () => {
        expect(filterAIGenerationHistory(items, "all")).toHaveLength(4);
        expect(filterAIGenerationHistory(items, "cet4")).toHaveLength(1);
        expect(filterAIGenerationHistory(items, "cet6")).toHaveLength(1);
        expect(filterAIGenerationHistory(items, "ielts")).toHaveLength(1);
    });

    it("formats longform history labels for article cards", () => {
        expect(formatLongformHistoryDescriptor({
            difficulty: "ielts",
            generationMode: "longform",
            longformStyle: { name: "商业经济" },
            lengthTier: { targetWordCount: 1600 },
        })).toBe("雅思 · 长文 · 商业经济 · 1600词");
    });
});
