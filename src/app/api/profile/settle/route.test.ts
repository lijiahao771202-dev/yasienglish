import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock } = vi.hoisted(() => ({
    createServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createServerClient: createServerClientMock,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
    return new Request("http://localhost:3000/api/profile/settle", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

describe("profile settle route", () => {
    beforeEach(() => {
        createServerClientMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns 401 when the user is not authenticated", async () => {
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const response = await POST(buildRequest({
            mode: "translation",
            eloAfter: 840,
            change: 24,
            streak: 3,
            maxElo: 840,
            coins: 18,
            source: "battle_win",
        }));

        expect(response.status).toBe(401);
    });

    it("forwards an authenticated settlement to the rpc function", async () => {
        const rpc = vi.fn().mockResolvedValue({
            data: {
                user_id: "user-1",
                translation_elo: 840,
                listening_elo: 400,
                streak_count: 3,
                max_translation_elo: 840,
                max_listening_elo: 400,
                coins: 18,
                inventory: { capsule: 10 },
                owned_themes: ["morning_coffee"],
                active_theme: "morning_coffee",
                updated_at: "2026-03-13T12:00:00.000Z",
                last_practice_at: "2026-03-13T12:00:00.000Z",
            },
            error: null,
        });

        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({
                    data: { user: { id: "user-1" } },
                    error: null,
                }),
            },
            rpc,
        });

        const response = await POST(buildRequest({
            mode: "translation",
            eloAfter: 840,
            change: 24,
            streak: 3,
            maxElo: 840,
            coins: 18,
            source: "battle_win",
        }));

        expect(response.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith("apply_battle_settlement", {
            p_mode: "translation",
            p_elo_after: 840,
            p_elo_change: 24,
            p_streak_count: 3,
            p_max_elo: 840,
            p_coins: 18,
            p_inventory: null,
            p_owned_themes: null,
            p_active_theme: null,
            p_source: "battle_win",
        });

        const data = await response.json();
        expect(data.profile.translation_elo).toBe(840);
        expect(data.profile.coins).toBe(18);
    });
});
