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

function buildRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/ai/listening-cabin/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

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

describe("listening cabin generate route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns a normalized listening script payload for valid requests", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                title: "Morning Briefing Practice",
                sentences: [
                    { english: "Good morning, everyone.", chinese: "大家早上好。" },
                    { english: "Let me walk you through today's priorities.", chinese: "我来带大家过一遍今天的重点。" },
                    { english: "We need to finish the client proposal before lunch.", chinese: "我们需要在午饭前完成客户提案。" },
                ],
            }),
        );

        const response = await POST(buildRequest({
            prompt: "做一个产品经理晨会口播",
            style: "workplace",
            focusTags: ["business_vocabulary", "linking"],
            cefrLevel: "B2",
            targetDurationMinutes: 3,
            sentenceCount: 8,
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.title).toBe("Morning Briefing Practice");
        expect(data.sourcePrompt).toBe("做一个产品经理晨会口播");
        expect(data.sentences).toHaveLength(3);
        expect(data.sentences[0]).toEqual({
            index: 1,
            english: "Good morning, everyone.",
            chinese: "大家早上好。",
        });
        expect(data.meta).toEqual({
            cefrLevel: "B2",
            targetDurationMinutes: 3,
            sentenceCount: 3,
            model: "deepseek-chat",
        });
        expect(createCompletionMock).toHaveBeenCalledTimes(1);
        expect(createCompletionMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "deepseek-chat",
            response_format: { type: "json_object" },
        }));
    });

    it("returns 400 for empty prompt", async () => {
        const response = await POST(buildRequest({
            prompt: "   ",
            style: "daily_conversation",
            focusTags: [],
            cefrLevel: "B1",
            targetDurationMinutes: 3,
            sentenceCount: 10,
        }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Prompt is required.");
        expect(createCompletionMock).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid sentence count", async () => {
        const response = await POST(buildRequest({
            prompt: "做一个旅行英语脚本",
            style: "travel",
            focusTags: [],
            cefrLevel: "B1",
            targetDurationMinutes: 3,
            sentenceCount: 99,
        }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Sentence count must be between 3 and 24.");
        expect(createCompletionMock).not.toHaveBeenCalled();
    });

    it("returns 502 when the model payload is malformed", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                title: "",
                sentences: [{ english: "", chinese: "" }],
            }),
        );

        const response = await POST(buildRequest({
            prompt: "做一个面试练习",
            style: "interview",
            focusTags: ["fast_speech"],
            cefrLevel: "B2",
            targetDurationMinutes: 2,
            sentenceCount: 6,
        }));
        const data = await response.json();

        expect(response.status).toBe(502);
        expect(data.error).toBe("AI listening script unavailable");
    });
});
