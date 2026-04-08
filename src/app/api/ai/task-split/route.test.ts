import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletionMock } = vi.hoisted(() => ({
    createCompletionMock: vi.fn(),
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

import { POST } from "./route";

function buildRequest(
    overrides: Partial<{
        prompt: string;
        currentItems: unknown[];
        examType: string;
        remainingDays: number;
    }> = {},
) {
    return {
        json: async () => ({
            prompt: "今天帮我安排轻一点，但要兼顾阅读和听力",
            currentItems: [],
            examType: "cet4",
            remainingDays: 18,
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("task split route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("normalizes legacy reading and listening outputs into the new task modules", async () => {
        createCompletionMock.mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            tasks: [
                                { type: "reading", target: 2, text: "四级AI阅读" },
                                { type: "listening", target: 1, text: "听力仓" },
                                { type: "cat", target: 1, text: "CAT成长" },
                                { type: "rebuild", target: 20, text: "核心重组" },
                            ],
                        }),
                    },
                },
            ],
        });

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.tasks).toEqual([
            { type: "reading_ai", target: 2, text: "四级AI阅读", exam_track: "cet4" },
            { type: "listening_cabin", target: 1, text: "听力仓" },
            { type: "cat", target: 1, text: "CAT成长", exam_track: "cet4" },
            { type: "rebuild", target: 20, text: "核心重组" },
        ]);
    });

    it("rejects empty normalized output", async () => {
        createCompletionMock.mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            tasks: [
                                { type: "reading_ai", target: 2, text: "AI阅读" },
                            ],
                        }),
                    },
                },
            ],
        });

        const response = await POST(buildRequest({ examType: "postgrad" }));
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to generate plan");
    });
});
