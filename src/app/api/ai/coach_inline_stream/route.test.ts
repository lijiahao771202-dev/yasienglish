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

function buildRequest(overrides: Partial<{
    systemPrompt: string;
    userMessage: string;
    history: Array<{ role: string; content: string }>;
    ragConcepts: string[];
    referenceEnglish: string;
    responseType: "scaffold" | "polish";
}> = {}) {
    return {
        json: async () => ({
            systemPrompt: "你是一个稳定的 inline coach。",
            userMessage: "我现在写到 Although the plan works 这里卡住了。",
            history: [],
            ragConcepts: ["旧账(depends on)"],
            referenceEnglish: "Although the plan is viable, progress is still too slow.",
            responseType: "scaffold",
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

async function readStreamLines(response: Response) {
    const text = await response.text();
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("coach_inline_stream route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("requests structured JSON and streams meta -> text_delta -> done chunks", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                type: "scaffold",
                text: "先别贴参考答案。\n\n把后半句的推进速度补出来。",
                errorWord: "works",
                fixWord: "is viable",
                backtrans: "方案只是能跑，不够像正式评价。",
                card: {
                    kind: "grammar",
                    content: "让步句后面接完整主句，不要半截停住。",
                },
            }),
        );

        const response = await POST(buildRequest());
        const chunks = await readStreamLines(response);
        const requestBody = createCompletionMock.mock.calls[0][0];
        const systemPrompt = requestBody.messages[0].content as string;

        expect(response.status).toBe(200);
        expect(requestBody.response_format).toEqual({ type: "json_object" });
        expect(requestBody.stream).toBeUndefined();
        expect(systemPrompt).toContain("人设只影响语气");
        expect(systemPrompt).toContain("不要输出完整官方参考英文答案");
        expect(chunks[0]).toMatchObject({
            kind: "meta",
            type: "scaffold",
            errorWord: "works",
            fixWord: "is viable",
            ragConcepts: ["旧账(depends on)"],
            card: {
                kind: "grammar",
                content: "让步句后面接完整主句，不要半截停住。",
            },
        });
        expect(chunks.some((chunk) => chunk.kind === "text_delta")).toBe(true);
        expect(chunks.at(-1)).toEqual({ kind: "done" });
    });

    it("drops leak-prone replacement fields when the model tries to emit the full reference answer", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                type: "polish",
                text: "直接用 Although the plan is viable, progress is still too slow. 就行。",
                errorWord: "Although the plan works",
                fixWord: "Although the plan is viable, progress is still too slow.",
                backtrans: "",
            }),
        );

        const response = await POST(buildRequest({
            responseType: "polish",
        }));
        const chunks = await readStreamLines(response);
        const meta = chunks[0];
        const text = chunks
            .filter((chunk) => chunk.kind === "text_delta")
            .map((chunk) => String(chunk.delta))
            .join("");

        expect(meta.kind).toBe("meta");
        expect(meta.fixWord).toBeUndefined();
        expect(text).not.toContain("Although the plan is viable, progress is still too slow.");
    });
});
