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
            ])
            .mockResolvedValueOnce([
                { id: "sys-3", text: "policy spillover", score: 0.79, source: "system", metadata: { level: "cefr" } },
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
            32,
            0.18,
            "vocab",
        );
        expect(requestRagQuery).toHaveBeenNthCalledWith(
            2,
            "住房与居住 · Affordable housing policy tradeoffs",
            28,
            0.18,
            "system",
            { level: "ielts" },
        );
        expect(requestRagQuery).toHaveBeenNthCalledWith(
            3,
            "住房与居住 · Affordable housing policy tradeoffs",
            16,
            0.18,
            "system",
            { level: "cefr" },
        );
        expect(result).toEqual({
            mode: "reference",
            source: "hybrid",
            words: [
                { text: "affordability", score: 0.92, source: "vocab", metadata: { vocabId: "affordability" } },
                { text: "allocation", score: 0.88, source: "vocab", metadata: { vocabId: "allocation" } },
                { text: "rent burden", score: 0.83, source: "system", metadata: { level: "ielts" } },
                { text: "policy spillover", score: 0.79, source: "system", metadata: { level: "cefr" } },
            ],
        });
    });

    it("falls back gracefully when learner vocab sync fails", async () => {
        const requestRagQuery = vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { id: "sys-1", text: "public trust", score: 0.77, source: "system", metadata: { level: "cet6" } },
            ])
            .mockResolvedValueOnce([
                { id: "sys-2", text: "institutional memory", score: 0.75, source: "system", metadata: { level: "cefr" } },
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

        expect(result).toEqual({
            mode: "reference",
            source: "hybrid",
            words: [
                { text: "public trust", score: 0.77, source: "system", metadata: { level: "cet6" } },
                { text: "institutional memory", score: 0.75, source: "system", metadata: { level: "cefr" } },
            ],
        });
    });

    it("does not block article generation on a long-running vocabulary catch-up task", async () => {
        const scheduleVocabularySync = vi.fn(() => new Promise(() => void 0));
        const requestRagQuery = vi.fn()
            .mockResolvedValueOnce([
                { id: "v1", text: "resilience", score: 0.84, source: "vocab", metadata: { vocabId: "resilience" } },
            ])
            .mockResolvedValueOnce([
                { id: "s1", text: "support network", score: 0.76, source: "system", metadata: { level: "cet6" } },
            ])
            .mockResolvedValueOnce([
                { id: "s2", text: "coping strategy", score: 0.71, source: "system", metadata: { level: "cefr" } },
            ]);

        const result = await collectAIGenerationVocabulary(
            {
                queryTopic: "校园成长 · Resilience under pressure",
                difficulty: "cet6",
            },
            {
                scheduleVocabularySync,
                waitForReady: vi.fn().mockResolvedValue(true),
                requestRagQuery,
                ensureReady: vi.fn(),
            },
        );

        expect(scheduleVocabularySync).toHaveBeenCalledTimes(1);
        expect(requestRagQuery).toHaveBeenCalledTimes(3);
        expect(result.words.map((item) => item.text)).toEqual([
            "resilience",
            "support network",
            "coping strategy",
        ]);
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

        expect(result).toEqual({
            mode: "reference",
            source: "hybrid",
            words: [],
        });
        expect(requestRagQuery).not.toHaveBeenCalled();
    });

    it("skips all RAG work when mode is off", async () => {
        const requestRagQuery = vi.fn();
        const waitForReady = vi.fn();
        const scheduleVocabularySync = vi.fn();

        const result = await collectAIGenerationVocabulary(
            {
                queryTopic: "test topic",
                difficulty: "cet4",
                ragMode: "off",
                ragSource: "dictionary",
            },
            {
                scheduleVocabularySync,
                waitForReady,
                requestRagQuery,
                ensureReady: vi.fn(),
            },
        );

        expect(result).toEqual({
            mode: "off",
            source: "dictionary",
            words: [],
        });
        expect(waitForReady).not.toHaveBeenCalled();
        expect(scheduleVocabularySync).not.toHaveBeenCalled();
        expect(requestRagQuery).not.toHaveBeenCalled();
    });

    it("queries only learner vocab when rag source is vocab", async () => {
        const requestRagQuery = vi.fn().mockResolvedValueOnce([
            { id: "v1", text: "resilience", score: 0.81, source: "vocab", metadata: { vocabId: "resilience" } },
        ]);

        const result = await collectAIGenerationVocabulary(
            {
                queryTopic: "校园成长 · Resilience under pressure",
                difficulty: "cet6",
                ragSource: "vocab",
            },
            {
                scheduleVocabularySync: vi.fn(),
                waitForReady: vi.fn().mockResolvedValue(true),
                requestRagQuery,
                ensureReady: vi.fn(),
            },
        );

        expect(requestRagQuery).toHaveBeenCalledTimes(1);
        expect(result.words.map((item) => item.text)).toEqual(["resilience"]);
        expect(result.source).toBe("vocab");
    });

    it("queries only mapped system dictionaries when rag source is dictionary", async () => {
        const requestRagQuery = vi.fn()
            .mockResolvedValueOnce([{ id: "s1", text: "emission cap", score: 0.8, source: "system", metadata: { level: "cet6" } }])
            .mockResolvedValueOnce([{ id: "s2", text: "carbon budget", score: 0.72, source: "system", metadata: { level: "cefr" } }]);

        const result = await collectAIGenerationVocabulary(
            {
                queryTopic: "环境政策 · Carbon policy choices",
                difficulty: "cet4",
                ragSource: "dictionary",
            },
            {
                scheduleVocabularySync: vi.fn(),
                waitForReady: vi.fn().mockResolvedValue(true),
                requestRagQuery,
                ensureReady: vi.fn(),
            },
        );

        expect(requestRagQuery).toHaveBeenCalledTimes(2);
        expect(requestRagQuery).toHaveBeenNthCalledWith(1, "环境政策 · Carbon policy choices", 28, 0.18, "system", { level: "cet6" });
        expect(requestRagQuery).toHaveBeenNthCalledWith(2, "环境政策 · Carbon policy choices", 16, 0.18, "system", { level: "cefr" });
        expect(result.words.map((item) => item.text)).toEqual(["emission cap", "carbon budget"]);
        expect(result.source).toBe("dictionary");
    });

    it("normalizes injected vocabulary down to the lexical head instead of keeping bilingual glosses", async () => {
        const requestRagQuery = vi.fn()
            .mockResolvedValueOnce([
                { id: "s1", text: "negotiation - 权衡协调", score: 0.93, source: "system", metadata: { level: "cet6", wordKey: "negotiation" } },
                { id: "s2", text: "to fit in - 融入，合群", score: 0.88, source: "system", metadata: { level: "cet6", wordKey: "to fit in" } },
            ])
            .mockResolvedValueOnce([
                { id: "s3", text: "tradeoff - 权衡取舍", score: 0.81, source: "system", metadata: { level: "cefr", vocabId: "tradeoff" } },
            ]);

        const result = await collectAIGenerationVocabulary(
            {
                queryTopic: "社会协作 · Negotiation and belonging",
                difficulty: "cet6",
                ragMode: "strict",
                ragSource: "dictionary",
            },
            {
                scheduleVocabularySync: vi.fn(),
                waitForReady: vi.fn().mockResolvedValue(true),
                requestRagQuery,
                ensureReady: vi.fn(),
            },
        );

        expect(result.words.map((item) => item.text)).toEqual([
            "negotiation",
            "to fit in",
            "tradeoff",
        ]);
    });

    it("collects a much larger topic-relevant pool for reference mode instead of stopping at a tiny handful", async () => {
        const vocabHits = Array.from({ length: 28 }, (_, index) => ({
            id: `v${index + 1}`,
            text: `housing-term-${index + 1}`,
            score: 0.91 - index * 0.01,
            source: "vocab",
            metadata: { vocabId: `housing-term-${index + 1}` },
        }));
        const ieltsHits = Array.from({ length: 24 }, (_, index) => ({
            id: `s${index + 1}`,
            text: `policy-term-${index + 1}`,
            score: 0.88 - index * 0.008,
            source: "system",
            metadata: { level: "ielts" },
        }));
        const cefrHits = [
            { id: "cefr-1", text: "irrelevant-low-score", score: 0.13, source: "system", metadata: { level: "cefr" } },
            { id: "cefr-2", text: "housing-pressure", score: 0.66, source: "system", metadata: { level: "cefr" } },
        ];
        const requestRagQuery = vi.fn()
            .mockResolvedValueOnce(vocabHits)
            .mockResolvedValueOnce(ieltsHits)
            .mockResolvedValueOnce(cefrHits);

        const result = await collectAIGenerationVocabulary(
            {
                queryTopic: "住房与居住 · Affordable housing policy tradeoffs",
                difficulty: "ielts",
                ragMode: "reference",
                ragSource: "hybrid",
            },
            {
                scheduleVocabularySync: vi.fn(),
                waitForReady: vi.fn().mockResolvedValue(true),
                requestRagQuery,
                ensureReady: vi.fn(),
            },
        );

        expect(result.words).toHaveLength(53);
        expect(result.words.some((item) => item.text === "irrelevant-low-score")).toBe(false);
        expect(result.words.at(0)?.source).toBe("vocab");
        expect(result.words.some((item) => item.text === "housing-pressure")).toBe(true);
    });
});
