import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    generateRebuildAiDrillMock,
    generateRebuildPassageAiDrillMock,
} = vi.hoisted(() => ({
    generateRebuildAiDrillMock: vi.fn(),
    generateRebuildPassageAiDrillMock: vi.fn(),
}));

vi.mock("@/lib/rebuild-ai", () => ({
    generateRebuildAiDrill: generateRebuildAiDrillMock,
    generateRebuildPassageAiDrill: generateRebuildPassageAiDrillMock,
}));

vi.mock("@/lib/listening-drill-bank", () => ({
    buildListeningBankDrill: vi.fn(),
    selectListeningBankItem: vi.fn(),
}));

import { POST } from "./route";

function buildRequest(overrides: Partial<{
    articleTitle: string;
    topicPrompt: string;
    eloRating: number;
    mode: "rebuild" | "translation" | "listening";
    rebuildVariant: "sentence" | "passage";
    segmentCount: 2 | 3 | 5;
}> = {}) {
    return {
        json: async () => ({
            articleTitle: "test topic",
            topicPrompt: "brief",
            eloRating: 900,
            mode: "rebuild",
            rebuildVariant: "sentence",
            segmentCount: 3,
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("drill next route", () => {
    beforeEach(() => {
        generateRebuildAiDrillMock.mockReset();
        generateRebuildPassageAiDrillMock.mockReset();
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("retries rebuild sentence generation and eventually succeeds", async () => {
        generateRebuildAiDrillMock
            .mockRejectedValueOnce(new Error("temporary malformed output"))
            .mockResolvedValueOnce({ chinese: "题目", reference_english: "answer" });

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(generateRebuildAiDrillMock).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);
        expect(data).toMatchObject({
            chinese: "题目",
            reference_english: "answer",
        });
    });

    it("retries rebuild passage generation and returns 500 after exhausting attempts", async () => {
        generateRebuildPassageAiDrillMock.mockRejectedValue(new Error("always broken"));

        const response = await POST(buildRequest({
            rebuildVariant: "passage",
            segmentCount: 5,
        }));
        const data = await response.json();

        expect(generateRebuildPassageAiDrillMock).toHaveBeenCalledTimes(3);
        expect(response.status).toBe(500);
        expect(data).toEqual({ error: "Failed to generate rebuild drill." });
    });
});
