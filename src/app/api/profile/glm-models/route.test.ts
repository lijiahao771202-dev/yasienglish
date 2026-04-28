import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock, listGlmModelsForConnectionPayloadMock } = vi.hoisted(() => ({
    createServerClientMock: vi.fn(),
    listGlmModelsForConnectionPayloadMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createServerClient: createServerClientMock,
}));

vi.mock("@/lib/deepseek", () => ({
    listGlmModelsForConnectionPayload: listGlmModelsForConnectionPayloadMock,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
    return new Request("http://localhost:3000/api/profile/glm-models", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

describe("profile glm-models route", () => {
    beforeEach(() => {
        createServerClientMock.mockReset();
        listGlmModelsForConnectionPayloadMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns 401 when unauthenticated", async () => {
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const response = await POST(buildRequest({}));

        expect(response.status).toBe(401);
    });

    it("returns model metadata from the helper", async () => {
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
            },
        });
        listGlmModelsForConnectionPayloadMock.mockResolvedValue([
            {
                id: "glm-5.1",
                name: "GLM-5.1",
                summary: "旗舰",
                contextWindow: "200K",
                maxOutputTokens: "128K",
                capabilities: ["深度思考", "工具调用"],
                parameters: ["temperature", "top_p", "max_tokens"],
                recommendedFor: "主力默认位",
            },
        ]);

        const response = await POST(buildRequest({ glm_api_key: "glm_test_key" }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(listGlmModelsForConnectionPayloadMock).toHaveBeenCalledWith({
            glm_api_key: "glm_test_key",
        });
        expect(data.models).toEqual([
            {
                id: "glm-5.1",
                name: "GLM-5.1",
                summary: "旗舰",
                contextWindow: "200K",
                maxOutputTokens: "128K",
                capabilities: ["深度思考", "工具调用"],
                parameters: ["temperature", "top_p", "max_tokens"],
                recommendedFor: "主力默认位",
            },
        ]);
    });

    it("accepts a bearer token when the server cookie session is missing", async () => {
        const getUserMock = vi
            .fn()
            .mockResolvedValueOnce({ data: { user: null }, error: null })
            .mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null });

        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: getUserMock,
            },
        });
        listGlmModelsForConnectionPayloadMock.mockResolvedValue([]);

        const response = await POST(buildRequest(
            { glm_api_key: "glm_test_key" },
            { Authorization: "Bearer access-token-1" },
        ));

        expect(response.status).toBe(200);
        expect(getUserMock).toHaveBeenNthCalledWith(1);
        expect(getUserMock).toHaveBeenNthCalledWith(2, "access-token-1");
    });
});
