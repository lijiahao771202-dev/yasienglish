import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock, listGitHubModelsForConnectionPayloadMock } = vi.hoisted(() => ({
    createServerClientMock: vi.fn(),
    listGitHubModelsForConnectionPayloadMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createServerClient: createServerClientMock,
}));

vi.mock("@/lib/deepseek", () => ({
    listGitHubModelsForConnectionPayload: listGitHubModelsForConnectionPayloadMock,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
    return new Request("http://localhost:3000/api/profile/github-models", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

describe("profile github-models route", () => {
    beforeEach(() => {
        createServerClientMock.mockReset();
        listGitHubModelsForConnectionPayloadMock.mockReset();
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
        listGitHubModelsForConnectionPayloadMock.mockResolvedValue([
            {
                id: "openai/gpt-4.1",
                name: "OpenAI GPT-4.1",
                publisher: "OpenAI",
                summary: "Strong coding and long context model",
                capabilities: ["streaming", "tool-calling"],
                rateLimitTier: "high",
            },
        ]);

        const response = await POST(buildRequest({ github_api_key: "test-github-token" }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(listGitHubModelsForConnectionPayloadMock).toHaveBeenCalledWith({
            github_api_key: "test-github-token",
        });
        expect(data.models).toEqual([
            {
                id: "openai/gpt-4.1",
                name: "OpenAI GPT-4.1",
                publisher: "OpenAI",
                summary: "Strong coding and long context model",
                capabilities: ["streaming", "tool-calling"],
                rateLimitTier: "high",
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
        listGitHubModelsForConnectionPayloadMock.mockResolvedValue([]);

        const response = await POST(buildRequest(
            { github_api_key: "test-github-token" },
            { Authorization: "Bearer access-token-1" },
        ));

        expect(response.status).toBe(200);
        expect(getUserMock).toHaveBeenNthCalledWith(1);
        expect(getUserMock).toHaveBeenNthCalledWith(2, "access-token-1");
    });
});
