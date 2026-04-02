import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    createCompletionMock,
    chargeReadingCoinsMock,
    insufficientReadingCoinsPayloadMock,
    isReadEconomyContextMock,
} = vi.hoisted(() => ({
    createCompletionMock: vi.fn(),
    chargeReadingCoinsMock: vi.fn(),
    insufficientReadingCoinsPayloadMock: vi.fn(),
    isReadEconomyContextMock: vi.fn(),
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
    isReadEconomyContext: isReadEconomyContextMock,
}));

import { POST } from "./route";

function createStreamCompletion(chunks: string[]) {
    async function* iterator() {
        for (const chunk of chunks) {
            yield {
                choices: [
                    {
                        delta: {
                            content: chunk,
                        },
                    },
                ],
            };
        }
    }

    return iterator();
}

function buildRequest(overrides: Record<string, unknown> = {}) {
    return {
        json: async () => ({
            text: "That piece of paper was the main signal to employers.",
            question: "这个词什么意思？",
            answerMode: "default",
            selection: "main signal",
            economyContext: {
                scene: "read",
                action: "ask_ai",
                articleUrl: "https://example.com/read",
            },
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("ai ask route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        chargeReadingCoinsMock.mockReset();
        insufficientReadingCoinsPayloadMock.mockReset();
        isReadEconomyContextMock.mockReset();

        chargeReadingCoinsMock.mockResolvedValue({
            ok: true,
            insufficient: false,
            balance: 38,
            delta: -2,
            applied: true,
            action: "ask_ai",
        });

        insufficientReadingCoinsPayloadMock.mockImplementation((action: string, required: number, balance: number) => ({
            errorCode: "INSUFFICIENT_READING_COINS",
            action,
            required,
            balance,
        }));

        isReadEconomyContextMock.mockImplementation(
            (context: { scene?: string; action?: string } | null | undefined) =>
                context?.scene === "read" && Boolean(context?.action),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("uses short profile when answerMode is short", async () => {
        createCompletionMock.mockResolvedValueOnce(createStreamCompletion(["短答"]));

        const response = await POST(buildRequest({ answerMode: "short" }));
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain("data:");
        expect(body).toContain("[DONE]");

        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.max_tokens).toBe(520);
        expect(completionParams.messages[0].content).toContain('Response Profile: "forced_short"');
        expect(completionParams.messages[0].content).toContain("MAX 2 bullets");
    });

    it("uses detailed profile when answerMode is detailed", async () => {
        createCompletionMock.mockResolvedValueOnce(createStreamCompletion(["长答"]));

        const response = await POST(buildRequest({ answerMode: "detailed" }));
        await response.text();

        expect(response.status).toBe(200);
        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.max_tokens).toBe(1200);
        expect(completionParams.messages[0].content).toContain('Response Profile: "forced_detailed"');
        expect(completionParams.messages[0].content).toContain("Response style (DETAILED)");
    });

    it("routes default mode to adaptive simple for simple questions", async () => {
        createCompletionMock.mockResolvedValueOnce(createStreamCompletion(["简洁回答"]));

        const response = await POST(buildRequest({
            answerMode: "default",
            question: "这句啥意思？",
        }));
        await response.text();

        expect(response.status).toBe(200);
        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.max_tokens).toBe(520);
        expect(completionParams.messages[0].content).toContain('Response Profile: "adaptive_simple"');
    });

    it("routes default mode to adaptive complex for complex questions", async () => {
        createCompletionMock.mockResolvedValueOnce(createStreamCompletion(["复杂回答"]));

        const response = await POST(buildRequest({
            answerMode: "default",
            question: "请详细对比这句和上一句的语法结构，并解释原因。",
        }));
        await response.text();

        expect(response.status).toBe(200);
        const completionParams = createCompletionMock.mock.calls[0][0];
        expect(completionParams.max_tokens).toBe(1200);
        expect(completionParams.messages[0].content).toContain('Response Profile: "adaptive_complex"');
    });

    it("returns 400 when text or question is empty", async () => {
        const response = await POST(buildRequest({ text: "   ", question: "" }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Text and question are required");
        expect(createCompletionMock).not.toHaveBeenCalled();
    });
});
