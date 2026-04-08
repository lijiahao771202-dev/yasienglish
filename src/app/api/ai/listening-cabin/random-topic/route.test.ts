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
    return new Request("http://localhost/api/ai/listening-cabin/random-topic", {
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

describe("listening cabin random topic route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns ai-generated topic with normalized mode", async () => {
        createCompletionMock.mockResolvedValueOnce(createCompletionPayload({
            topic: "播客模式：主持人与嘉宾聊如何在高压周保持节奏并保持生活感。",
        }));

        const response = await POST(buildRequest({
            scriptMode: "podcast",
            style: "humorous",
            cefrLevel: "B2",
            sentenceLength: "medium",
            scriptLength: "long",
            topicMode: "hybrid",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual({
            topic: "播客模式：主持人与嘉宾聊如何在高压周保持节奏并保持生活感。",
            source: "ai",
            scriptMode: "podcast",
        });
        expect(createCompletionMock).toHaveBeenCalledTimes(1);
        expect(createCompletionMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "deepseek-chat",
            response_format: { type: "json_object" },
        }));
    });

    it("maps legacy style values before building prompt", async () => {
        createCompletionMock.mockResolvedValueOnce(createCompletionPayload({
            topic: "单人口播：一个简洁专业的周会口播主题。",
        }));

        const response = await POST(buildRequest({
            scriptMode: "monologue",
            style: "workplace",
            recentTopics: [
                "讲一个普通晨会如何更高效",
                "聊聊如何在通勤路上学英语",
            ],
        }));
        await response.json();

        expect(response.status).toBe(200);
        const prompt = createCompletionMock.mock.calls[0]?.[0]?.messages?.[0]?.content;
        expect(typeof prompt).toBe("string");
        expect(prompt).toContain("专业");
        expect(prompt).toContain("small surprise");
        expect(prompt).toContain("Stay believable. No fantasy");
        expect(prompt).toContain("Do NOT repeat or closely paraphrase these recent topic directions");
        expect(prompt).toContain("讲一个普通晨会如何更高效");
    });

    it("returns 502 when ai topic payload is empty", async () => {
        createCompletionMock.mockResolvedValueOnce(createCompletionPayload({
            topic: "   ",
        }));

        const response = await POST(buildRequest({
            scriptMode: "dialogue",
        }));
        const data = await response.json();

        expect(response.status).toBe(502);
        expect(data.error).toBe("AI returned an empty random topic.");
    });
});
