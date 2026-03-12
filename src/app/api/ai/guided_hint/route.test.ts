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

function createCompletionPayload(payload: Record<string, unknown>) {
    return {
        choices: [
            {
                message: {
                    content: JSON.stringify(payload),
                },
            },
        ],
    };
}

function buildRequest(overrides: Record<string, unknown> = {}) {
    return {
        json: async () => ({
            chinese: "在电梯里，我突然意识到自己忘带门禁卡了。",
            reference_english: "In the elevator, I suddenly realized I had forgotten my key card.",
            answer_text: "realized",
            hint_focus_cn: "突然意识到",
            left_context: "I suddenly",
            right_context: "I had",
            attempt: 1,
            slot_kind: "word",
            inner_mode: "teacher_guided",
            has_multiple_choice: true,
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("guided_hint route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns compact AI hint lines", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                primary: "这里对的是中文里“突然意识到”那一下，不是后面忘带门禁卡本身。",
                secondary: "前面已经有 I suddenly 了，所以现在补的是那个过去式动作词。",
                rescue: "",
            }),
        );

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.primary).toContain("突然意识到");
        expect(data.secondary).toContain("过去式");
        expect(data.rescue).toBeNull();
    });

    it("returns 502 when AI output misses primary", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                primary: "",
                secondary: "",
                rescue: "",
            }),
        );

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(response.status).toBe(502);
        expect(data.error).toBe("Invalid AI hint");
    });
});
