import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    createCompletionMock,
    chargeReadingCoinsMock,
    insufficientReadingCoinsPayloadMock,
} = vi.hoisted(() => ({
    createCompletionMock: vi.fn(),
    chargeReadingCoinsMock: vi.fn(),
    insufficientReadingCoinsPayloadMock: vi.fn(),
}));

vi.mock("@/lib/deepseek", () => ({
    deepseek: {
        chat: {
            completions: {
                create: createCompletionMock,
            },
        },
    },
}));

vi.mock("@/lib/reading-economy-server", () => ({
    chargeReadingCoins: chargeReadingCoinsMock,
    insufficientReadingCoinsPayload: insufficientReadingCoinsPayloadMock,
    isReadEconomyContext: () => false,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/ai/translate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

describe("translate route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        chargeReadingCoinsMock.mockReset();
        insufficientReadingCoinsPayloadMock.mockReset();
        chargeReadingCoinsMock.mockResolvedValue({
            ok: true,
            balance: 0,
            delta: 0,
            applied: false,
            action: "translate",
        });
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns full translation plus sentence translations", async () => {
        createCompletionMock.mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            translation: "植物需要阳光和水才能生长。水能帮助根部保持强壮。",
                            sentenceTranslations: [
                                {
                                    sentence: "Plants need sunlight and water to grow.",
                                    translation: "植物需要阳光和水才能生长。",
                                    phraseTranslations: [
                                        {
                                            source: "sunlight and water",
                                            translation: "阳光和水分",
                                        },
                                    ],
                                },
                                {
                                    sentence: "Water helps roots stay strong.",
                                    translation: "水能帮助根部保持强壮。",
                                    phraseTranslations: [
                                        {
                                            source: "stay strong",
                                            translation: "保持强壮",
                                        },
                                    ],
                                },
                            ],
                        }),
                    },
                },
            ],
        });

        const response = await POST(buildRequest({
            text: "Plants need sunlight and water to grow. Water helps roots stay strong.",
            context: "Plants need sunlight and water to grow. Water helps roots stay strong.",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.translation).toBe("植物需要阳光和水才能生长。水能帮助根部保持强壮。");
        expect(data.sentenceTranslations).toEqual([
            {
                sentence: "Plants need sunlight and water to grow.",
                translation: "植物需要阳光和水才能生长。",
                phraseTranslations: [
                    {
                        source: "sunlight and water",
                        translation: "阳光和水分",
                    },
                ],
            },
            {
                sentence: "Water helps roots stay strong.",
                translation: "水能帮助根部保持强壮。",
                phraseTranslations: [
                    {
                        source: "stay strong",
                        translation: "保持强壮",
                    },
                ],
            },
        ]);
        expect(createCompletionMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "deepseek-chat",
            response_format: { type: "json_object" },
        }));
    });

    it("falls back to joining sentence translations when full translation is missing", async () => {
        createCompletionMock.mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            sentenceTranslations: [
                                {
                                    sentence: "Plants need sunlight and water to grow.",
                                    translation: "植物需要阳光和水才能生长。",
                                },
                            ],
                        }),
                    },
                },
            ],
        });

        const response = await POST(buildRequest({
            text: "Plants need sunlight and water to grow.",
            context: "Plants need sunlight and water to grow.",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.translation).toBe("植物需要阳光和水才能生长。");
        expect(data.sentenceTranslations).toHaveLength(1);
    });
});
