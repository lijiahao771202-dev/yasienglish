import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRebuildSystemVocabularyTargets, queryRebuildSystemVocabulary } from "./rebuild-rag";

const { ensureBGEReady, requestRagQuery } = vi.hoisted(() => ({
    ensureBGEReady: vi.fn(),
    requestRagQuery: vi.fn(),
}));

vi.mock("@/lib/bge-client", () => ({
    ensureBGEReady,
    requestRagQuery,
}));

describe("rebuild-rag", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("maps rebuild elo to the expected system vocabulary targets", () => {
        expect(getRebuildSystemVocabularyTargets(200)).toEqual([
            { level: "chuzhong" },
            { level: "cefr", cefrLevel: "A1" },
        ]);
        expect(getRebuildSystemVocabularyTargets(1450)).toEqual([
            { level: "cet4" },
            { level: "cefr", cefrLevel: "B1" },
        ]);
        expect(getRebuildSystemVocabularyTargets(2550)).toEqual([
            { level: "cefr", cefrLevel: "C2" },
            { level: "ielts" },
        ]);
    });

    it("queries only system vocabulary and merges deduped matches by score", async () => {
        ensureBGEReady.mockResolvedValue(true);
        requestRagQuery
            .mockResolvedValueOnce([
                { text: "proposal - 提案", score: 0.62 },
                { text: "briefing - 简报", score: 0.55 },
            ])
            .mockResolvedValueOnce([
                { text: "proposal - 提案", score: 0.58 },
                { text: "timeline - 时间线", score: 0.52 },
            ]);

        const result = await queryRebuildSystemVocabulary({
            effectiveElo: 1800,
            query: "team meeting at work",
            variant: "sentence",
        });

        expect(result).toEqual({
            status: "hit",
            vocabulary: [
                "proposal - 提案",
                "briefing - 简报",
                "timeline - 时间线",
            ],
        });
        expect(requestRagQuery).toHaveBeenNthCalledWith(
            1,
            "team meeting at work",
            5,
            0.1,
            "system",
            { level: "cet6" },
        );
        expect(requestRagQuery).toHaveBeenNthCalledWith(
            2,
            "team meeting at work",
            5,
            0.1,
            "system",
            { level: "cefr", cefrLevel: "B2" },
        );
    });

    it("returns an empty list when the vector engine is unavailable", async () => {
        ensureBGEReady.mockResolvedValue(false);

        await expect(queryRebuildSystemVocabulary({
            effectiveElo: 900,
            query: "school club",
            variant: "passage",
        })).resolves.toEqual({
            status: "unavailable",
            vocabulary: [],
        });
        expect(requestRagQuery).not.toHaveBeenCalled();
    });
});
