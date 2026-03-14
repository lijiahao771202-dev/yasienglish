import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock } = vi.hoisted(() => ({
    createServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createServerClient: createServerClientMock,
}));

import { GET } from "./route";

describe("auth callback route", () => {
    beforeEach(() => {
        createServerClientMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("redirects exchanged code sessions to the new home page", async () => {
        createServerClientMock.mockResolvedValue({
            auth: {
                exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
            },
        });

        const response = await GET(new Request("http://localhost:3000/auth/callback?code=abc"));

        expect(response.headers.get("location")).toBe("http://localhost:3000/");
    });

    it("verifies recovery links and routes them to reset-password", async () => {
        const verifyOtp = vi.fn().mockResolvedValue({ error: null });

        createServerClientMock.mockResolvedValue({
            auth: {
                verifyOtp,
            },
        });

        const response = await GET(
            new Request("http://localhost:3000/auth/callback?token_hash=hash123&type=recovery"),
        );

        expect(verifyOtp).toHaveBeenCalledWith({
            token_hash: "hash123",
            type: "recovery",
        });
        expect(response.headers.get("location")).toBe("http://localhost:3000/reset-password");
    });
});
