import { beforeEach, describe, expect, it, vi } from "vitest";

import { collectAIGenerationVocabulary } from "./ai-generation-rag";

describe("collectAIGenerationVocabulary", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("syncs the latest learner vocab before querying learner and system namespaces separately", async () => {
        const scheduleVocabularySync = vi.fn().mockResolvedValue({ processed: 2, total: 2, skipped: false });
        const waitForReady = vi.fn().mockResolvedValue(true);
        const requestRagQuery = vi.fn()
            .mockResolvedValueOnce([
                { id: "vocab-1", text: "affordability", score: 0.92, source: "vocab", metadata: { vocabId: "affordability" } },
                { id: "dup", text: "allocation", score: 0.88, source: "vocab", metadata: { vocabId: "allocation" } },
            ])
            .mockResolvedValueOnce([
                { id: "dup", text: "allocation", score: 0.84, source: "system", metadata: { level: "ielts" } },
                { id: "sys-2", text: "rent burden", score: 0.83, source: "system", metadata: { level: "ielts" } },
            ]);

        const result = await collectAIGenerationVocabulary(
            {
                queryTopic: "住房与居住 · Affordable housing policy tradeoffs",
                difficulty: "ielts",
            },
            {
                scheduleVocabularySync,
                waitForReady,
                requestRagQuery,
                ensureReady: vi.fn(),
            },
        );

        expect(waitForReady).toHaveBeenCalledTimes(1);
        expect(scheduleVocabularySync).toHaveBeenCalledTimes(1);
        expect(requestRagQuery).toHaveBeenNthCalledWith(
            1,
            "住房与居住 · Affordable housing policy tradeoffs",
            16,
            0.1,
            "vocab",
        );
        expect(requestRagQuery).toHaveBeenNthCalledWith(
            2,
            "住房与居住 · Affordable housing policy tradeoffs",
            24,
            0.1,
            "system",
            { level: "ielts" },
        );
        expect(result).toEqual(["affordability", "allocation", "rent burden"]);
    });

    it("falls back gracefully when learner vocab sync fails", async () => {
        const requestRagQuery = vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { id: "sys-1", text: "public trust", score: 0.77, source: "system", metadata: { level: "cet6" } },
            ]);

        const result = await collectAIGenerationVocabulary(
            {
                queryTopic: "公共信任 · Institutional trust and policy compliance",
                difficulty: "cet6",
            },
            {
                scheduleVocabularySync: vi.fn().mockRejectedValue(new Error("sync failed")),
                waitForReady: vi.fn().mockResolvedValue(true),
                requestRagQuery,
                ensureReady: vi.fn(),
            },
        );

        expect(result).toEqual(["public trust"]);
    });

    it("returns no vocabulary when the vector engine never becomes ready", async () => {
        const requestRagQuery = vi.fn();

        const result = await collectAIGenerationVocabulary(
            {
                queryTopic: "test topic",
                difficulty: "cet4",
            },
            {
                scheduleVocabularySync: vi.fn(),
                waitForReady: vi.fn().mockResolvedValue(false),
                requestRagQuery,
                ensureReady: vi.fn(),
            },
        );

        expect(result).toEqual([]);
        expect(requestRagQuery).not.toHaveBeenCalled();
    });
});
