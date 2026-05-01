import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock, listNvidiaModelsForConnectionPayloadMock } = vi.hoisted(() => ({
    createServerClientMock: vi.fn(),
    listNvidiaModelsForConnectionPayloadMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createServerClient: createServerClientMock,
}));

vi.mock("@/lib/deepseek", () => ({
    listNvidiaModelsForConnectionPayload: listNvidiaModelsForConnectionPayloadMock,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
    return new Request("http://localhost:3000/api/profile/nvidia-models", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

describe("profile nvidia-models route", () => {
    beforeEach(() => {
        createServerClientMock.mockReset();
        listNvidiaModelsForConnectionPayloadMock.mockReset();
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

    it("returns model ids from the helper", async () => {
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
            },
        });
        listNvidiaModelsForConnectionPayloadMock.mockResolvedValue([
            "deepseek-ai/deepseek-v3.1-terminus",
            "z-ai/glm5",
        ]);

        const response = await POST(buildRequest({ nvidia_api_key: "ignored-client-token" }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(listNvidiaModelsForConnectionPayloadMock).toHaveBeenCalledWith();
        expect(data.models).toEqual([
            "deepseek-ai/deepseek-v3.1-terminus",
            "z-ai/glm5",
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
        listNvidiaModelsForConnectionPayloadMock.mockResolvedValue([]);

        const response = await POST(buildRequest(
            { nvidia_api_key: "nvapi-test" },
            { Authorization: "Bearer access-token-1" },
        ));

        expect(response.status).toBe(200);
        expect(getUserMock).toHaveBeenNthCalledWith(1);
        expect(getUserMock).toHaveBeenNthCalledWith(2, "access-token-1");
    });
});
