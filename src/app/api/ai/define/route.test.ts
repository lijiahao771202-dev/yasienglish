import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    createCompletionMock,
    createNoThinkingClientMock,
} = vi.hoisted(() => ({
    createCompletionMock: vi.fn(),
    createNoThinkingClientMock: vi.fn(),
}));

vi.mock("@/lib/deepseek", () => ({
    createDeepSeekClientForCurrentUserWithoutThinking: createNoThinkingClientMock,
}));

vi.mock("@/lib/reading-economy-server", () => ({
    chargeReadingCoins: vi.fn(),
    insufficientReadingCoinsPayload: vi.fn(),
    isReadEconomyContext: () => false,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/ai/define", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

describe("ai define route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        createNoThinkingClientMock.mockReset();
        createNoThinkingClientMock.mockResolvedValue({
            chat: {
                completions: {
                    create: createCompletionMock,
                },
            },
        });
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("uses the current provider with thinking disabled for dictionary AI fallback", async () => {
        createCompletionMock.mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            phonetic: "/ˈæktʃuəbəl/",
                            context_meaning: {
                                definition: "可以立即执行、能转化为具体行动的",
                                translation: "可执行的",
                            },
                            meaning_groups: [
                                { pos: "adj.", meanings: ["可执行的", "可操作的"] },
                            ],
                            highlighted_meanings: ["可执行的"],
                            word_breakdown: ["act", "-ion", "-able"],
                            morphology_notes: ["able 表示能够"],
                        }),
                    },
                },
            ],
        });

        const response = await POST(buildRequest({
            word: "actionable",
            context: "The advice must be actionable.",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.context_meaning.translation).toBe("可执行的");
        expect(createNoThinkingClientMock).toHaveBeenCalledTimes(1);
        expect(createCompletionMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "deepseek-chat",
            response_format: { type: "json_object" },
        }));
    });
});
