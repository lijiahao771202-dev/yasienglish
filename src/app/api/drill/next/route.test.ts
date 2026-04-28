import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    generateRebuildAiDrillMock,
    generateRebuildPassageAiDrillMock,
    generateAiDrillMock,
} = vi.hoisted(() => ({
    generateRebuildAiDrillMock: vi.fn(),
    generateRebuildPassageAiDrillMock: vi.fn(),
    generateAiDrillMock: vi.fn(),
}));

vi.mock("@/lib/rebuild-ai", () => ({
    generateRebuildAiDrill: generateRebuildAiDrillMock,
    generateRebuildPassageAiDrill: generateRebuildPassageAiDrillMock,
}));

vi.mock("@/lib/listening-drill-bank", () => ({
    buildListeningBankDrill: vi.fn(),
    selectListeningBankItem: vi.fn(),
}));

vi.mock("@/app/api/ai/generate_drill/route", () => ({
    POST: generateAiDrillMock,
}));

import { POST } from "./route";

function buildRequest(overrides: Partial<{
    articleTitle: string;
    topicPrompt: string;
    eloRating: number;
    mode: "rebuild" | "translation" | "listening";
    rebuildVariant: "sentence" | "passage";
    segmentCount: 2 | 3 | 5;
    provider: "deepseek" | "glm" | "nvidia" | "github";
    nvidiaModel: string;
}> = {}) {
    return {
        json: async () => ({
            articleTitle: "test topic",
            topicPrompt: "brief",
            eloRating: 900,
            mode: "rebuild",
            rebuildVariant: "sentence",
            segmentCount: 3,
            provider: "nvidia",
            nvidiaModel: "minimaxai/minimax-m2.7",
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("drill next route", () => {
    beforeEach(() => {
        generateRebuildAiDrillMock.mockReset();
        generateRebuildPassageAiDrillMock.mockReset();
        generateAiDrillMock.mockReset();
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("delegates rebuild sentence generation to the rebuild helper", async () => {
        generateRebuildAiDrillMock
            .mockResolvedValueOnce({ chinese: "题目", reference_english: "answer" });

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(generateRebuildAiDrillMock).toHaveBeenCalledTimes(1);
        expect(generateRebuildAiDrillMock).toHaveBeenLastCalledWith({
            topic: "test topic",
            topicPrompt: "brief",
            effectiveElo: 900,
            provider: "nvidia",
            nvidiaModel: "minimaxai/minimax-m2.7",
        });
        expect(response.status).toBe(200);
        expect(data).toMatchObject({
            chinese: "题目",
            reference_english: "answer",
        });
    });

    it("returns 500 when rebuild passage generation fails", async () => {
        generateRebuildPassageAiDrillMock.mockRejectedValue(new Error("always broken"));

        const response = await POST(buildRequest({
            rebuildVariant: "passage",
            segmentCount: 5,
        }));
        const data = await response.json();

        expect(generateRebuildPassageAiDrillMock).toHaveBeenCalledTimes(1);
        expect(generateRebuildPassageAiDrillMock).toHaveBeenLastCalledWith({
            topic: "test topic",
            topicPrompt: "brief",
            effectiveElo: 900,
            segmentCount: 5,
            provider: "nvidia",
            nvidiaModel: "minimaxai/minimax-m2.7",
        });
        expect(response.status).toBe(500);
        expect(data).toEqual({ error: "Failed to generate rebuild drill." });
    });

    it("forwards translation requests without forcing DeepSeek when provider is unset", async () => {
        generateAiDrillMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        }));

        await POST(buildRequest({
            mode: "translation",
            provider: undefined,
        }));

        expect(generateAiDrillMock).toHaveBeenCalledTimes(1);
        const forwardedRequest = generateAiDrillMock.mock.calls[0][0];
        const forwardedBody = await forwardedRequest.json();
        expect(forwardedBody.provider).toBeUndefined();
        expect(forwardedBody.mode).toBe("translation");
    });
});
