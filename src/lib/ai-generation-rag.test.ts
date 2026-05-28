import { beforeEach, describe, expect, it, vi } from "vitest";

import { collectAIGenerationVocabulary } from "./ai-generation-rag";
import { collectRecentAIGenerationRagCooldownWords } from "./ai-generation-rag";
import type { VocabItem } from "@/lib/db";

function createVocab(word: string, archivedAt?: number): VocabItem {
    return {
        word,
        word_key: word.toLowerCase(),
        definition: "",
        translation: "",
        context: "",
        example: "",
        timestamp: 1,
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        learning_steps: 0,
        state: 0,
        last_review: 0,
        due: 1,
        archived_at: archivedAt,
    };
}

describe("collectAIGenerationVocabulary", () => {
    const listVocabulary = vi.fn(async () => [
        createVocab("affordability"),
        createVocab("allocation"),
        createVocab("resilience"),
        createVocab("housing-term-1"),
        ...Array.from({ length: 28 }, (_, index) => createVocab(`housing-term-${index + 1}`)),
    ]);

    beforeEach(() => {
        vi.restoreAllMocks();
        listVocabulary.mockClear();
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
                listVocabulary,
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
                listVocabulary,
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
        const scheduleVocabularySync = vi.fn((): Promise<{ processed: number; total: number; skipped?: boolean }> => new Promise(() => void 0));
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
                listVocabulary,
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
                listVocabulary,
            },
        );

        expect(requestRagQuery).toHaveBeenCalledTimes(1);
        expect(result.words.map((item) => item.text)).toEqual(["resilience"]);
        expect(result.source).toBe("vocab");
    });

    it("excludes archived learner vocab hits even when stale vectors still exist", async () => {
        const requestRagQuery = vi.fn().mockResolvedValueOnce([
            { id: "vocab:active", text: "resilience - 复原力", score: 0.91, source: "vocab", metadata: { vocabId: "resilience", wordKey: "resilience" } },
            { id: "vocab:archived", text: "craving - 渴望", score: 0.9, source: "vocab", metadata: { vocabId: "craving", wordKey: "craving" } },
            { id: "vocab:ghost", text: "obsolete - 过期", score: 0.89, source: "vocab", metadata: { vocabId: "obsolete", wordKey: "obsolete" } },
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
                listVocabulary: vi.fn(async () => [
                    createVocab("resilience"),
                    createVocab("craving", 2),
                ]),
            },
        );

        expect(result.words.map((item) => item.text)).toEqual(["resilience"]);
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
                listVocabulary,
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
                listVocabulary,
            },
        );

        expect(result.words.map((item) => item.text)).toEqual([
            "negotiation",
            "to fit in",
            "tradeoff",
        ]);
    });

    it("excludes recently injected words from the next article vocabulary pool", async () => {
        const requestRagQuery = vi.fn()
            .mockResolvedValueOnce([
                { id: "v1", text: "resilience - 复原力", score: 0.94, source: "vocab", metadata: { vocabId: "resilience", wordKey: "resilience" } },
                { id: "v2", text: "belonging - 归属感", score: 0.9, source: "vocab", metadata: { vocabId: "belonging", wordKey: "belonging" } },
            ])
            .mockResolvedValueOnce([
                { id: "s1", text: "support network", score: 0.86, source: "system", metadata: { level: "cet6" } },
            ])
            .mockResolvedValueOnce([
                { id: "s2", text: "coping strategy", score: 0.82, source: "system", metadata: { level: "cefr" } },
            ]);

        const result = await collectAIGenerationVocabulary(
            {
                queryTopic: "校园成长 · Resilience and belonging",
                difficulty: "cet6",
                ragSource: "hybrid",
                recentlyUsedWords: ["resilience", "support network - 支持网络"],
            },
            {
                scheduleVocabularySync: vi.fn(),
                waitForReady: vi.fn().mockResolvedValue(true),
                requestRagQuery,
                ensureReady: vi.fn(),
                listVocabulary: vi.fn(async () => [
                    createVocab("resilience"),
                    createVocab("belonging"),
                ]),
            },
        );

        expect(result.words.map((item) => item.text)).toEqual([
            "belonging",
            "coping strategy",
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
                listVocabulary,
            },
        );

        expect(result.words).toHaveLength(53);
        expect(result.words.some((item) => item.text === "irrelevant-low-score")).toBe(false);
        expect(result.words.at(0)?.source).toBe("vocab");
        expect(result.words.some((item) => item.text === "housing-pressure")).toBe(true);
    });
});

describe("collectRecentAIGenerationRagCooldownWords", () => {
    it("collects deduped RAG words from the latest non-CAT AI articles only", () => {
        const result = collectRecentAIGenerationRagCooldownWords([
            {
                url: "ai-gen://cet6/4",
                timestamp: 4,
                isAIGenerated: true,
                ragAppliedWords: ["resilience", "belonging"],
            },
            {
                url: "cat://session/1",
                timestamp: 3,
                isAIGenerated: true,
                isCatMode: true,
                ragAppliedWords: ["cat-only"],
            },
            {
                url: "ai-gen://ielts/2",
                timestamp: 2,
                isAIGenerated: true,
                ragAppliedWords: ["Resilience", "policy spillover - 政策外溢"],
            },
            {
                url: "https://example.com/feed",
                timestamp: 1,
                ragAppliedWords: ["feed-only"],
            },
        ]);

        expect(result).toEqual([
            "resilience",
            "belonging",
            "policy spillover",
        ]);
    });
});
