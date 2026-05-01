import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock, testAiProviderConnectionMock } = vi.hoisted(() => ({
    createServerClientMock: vi.fn(),
    testAiProviderConnectionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createServerClient: createServerClientMock,
}));

vi.mock("@/lib/deepseek", () => ({
    testAiProviderConnection: testAiProviderConnectionMock,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
    return new Request("http://localhost:3000/api/profile/test-ai-provider", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

describe("profile test-ai-provider route", () => {
    beforeEach(() => {
        createServerClientMock.mockReset();
        testAiProviderConnectionMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("returns 401 when unauthenticated", async () => {
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const response = await POST(buildRequest({ ai_provider: "nvidia" }));

        expect(response.status).toBe(401);
    });

    it("returns 400 for unsupported provider", async () => {
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
            },
        });

        const response = await POST(buildRequest({ ai_provider: "gemini" }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("不支持");
        expect(testAiProviderConnectionMock).not.toHaveBeenCalled();
    });

    it("tests the current provider payload and returns a success message", async () => {
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
            },
        });
        testAiProviderConnectionMock.mockResolvedValue({
            provider: "nvidia",
            providerLabel: "NVIDIA",
            model: "z-ai/glm5",
            content: "OK",
        });

        const response = await POST(buildRequest({
            ai_provider: "nvidia",
            nvidia_api_key: "nvapi-test",
            nvidia_model: "z-ai/glm5",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(testAiProviderConnectionMock).toHaveBeenCalledWith({
            ai_provider: "nvidia",
            deepseek_model: undefined,
            deepseek_thinking_mode: undefined,
            deepseek_reasoning_effort: undefined,
            glm_model: undefined,
            glm_thinking_mode: undefined,
            nvidia_model: "z-ai/glm5",
            github_model: undefined,
            mimo_model: undefined,
        });
        expect(testAiProviderConnectionMock.mock.calls.at(-1)?.[0]).not.toHaveProperty("nvidia_api_key");
        expect(data.message).toBe("NVIDIA / z-ai/glm5 连通成功");
    });

    it("forwards the selected GLM model and thinking mode to the connection test", async () => {
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
            },
        });
        testAiProviderConnectionMock.mockResolvedValue({
            provider: "glm",
            providerLabel: "GLM",
            model: "glm-4.7-flash",
            content: "OK",
        });

        const response = await POST(buildRequest({
            ai_provider: "glm",
            glm_api_key: "",
            glm_model: "glm-4.7-flash",
            glm_thinking_mode: "off",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(testAiProviderConnectionMock).toHaveBeenCalledWith(expect.objectContaining({
            ai_provider: "glm",
            glm_model: "glm-4.7-flash",
            glm_thinking_mode: "off",
        }));
        expect(testAiProviderConnectionMock.mock.calls.at(-1)?.[0]).not.toHaveProperty("glm_api_key");
        expect(data.message).toBe("GLM / glm-4.7-flash 连通成功");
    });

    it("accepts and forwards Xiaomi MiMo connection settings", async () => {
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
            },
        });
        testAiProviderConnectionMock.mockResolvedValue({
            provider: "mimo",
            providerLabel: "Xiaomi MiMo",
            model: "mimo-v2.5-pro",
            content: "OK",
        });

        const response = await POST(buildRequest({
            ai_provider: "mimo",
            mimo_api_key: "",
            mimo_model: "mimo-v2.5-pro",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(testAiProviderConnectionMock).toHaveBeenCalledWith(expect.objectContaining({
            ai_provider: "mimo",
            mimo_model: "mimo-v2.5-pro",
        }));
        expect(testAiProviderConnectionMock.mock.calls.at(-1)?.[0]).not.toHaveProperty("mimo_api_key");
        expect(data.message).toBe("Xiaomi MiMo / mimo-v2.5-pro 连通成功");
    });

    it("allows local development connection tests without a Supabase session", async () => {
        vi.stubEnv("NODE_ENV", "development");
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });
        testAiProviderConnectionMock.mockResolvedValue({
            provider: "mimo",
            providerLabel: "Xiaomi MiMo",
            model: "mimo-v2.5-pro",
            content: "OK",
        });

        const response = await POST(buildRequest({
            ai_provider: "mimo",
            mimo_model: "mimo-v2.5-pro",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(testAiProviderConnectionMock).toHaveBeenCalledWith(expect.objectContaining({
            ai_provider: "mimo",
            mimo_model: "mimo-v2.5-pro",
        }));
        expect(data.message).toBe("Xiaomi MiMo / mimo-v2.5-pro 连通成功");
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
        testAiProviderConnectionMock.mockResolvedValue({
            provider: "github",
            providerLabel: "GitHub Models",
            model: "openai/gpt-4.1",
            content: "OK",
        });

        const response = await POST(buildRequest(
            {
                ai_provider: "github",
                github_api_key: "test-github-token",
                github_model: "openai/gpt-4.1",
            },
            { Authorization: "Bearer access-token-1" },
        ));

        expect(response.status).toBe(200);
        expect(getUserMock).toHaveBeenNthCalledWith(1);
        expect(getUserMock).toHaveBeenNthCalledWith(2, "access-token-1");
    });
});
