import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock, getServerUserSafelyMock } = vi.hoisted(() => ({
    createServerClientMock: vi.fn(),
    getServerUserSafelyMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createServerClient: createServerClientMock,
    getServerUserSafely: getServerUserSafelyMock,
}));

import { GET } from "./route";

describe("mail unread-count route", () => {
    beforeEach(() => {
        createServerClientMock.mockReset();
        getServerUserSafelyMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns an empty count instead of crashing when Supabase count lookup disconnects", async () => {
        getServerUserSafelyMock.mockResolvedValue({
            user: { id: "user-1" },
            error: null,
        });
        createServerClientMock.mockResolvedValue({
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn().mockRejectedValue(new Error("Client network socket disconnected before secure TLS connection was established")),
                    })),
                })),
            })),
        });

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            unreadCount: 0,
            degraded: true,
        });
    });
});
