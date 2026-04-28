import { beforeEach, describe, expect, it, vi } from "vitest";

const { createBrowserClientSingletonMock } = vi.hoisted(() => ({
    createBrowserClientSingletonMock: vi.fn(),
}));

vi.mock("./browser", () => ({
    createBrowserClientSingleton: createBrowserClientSingletonMock,
}));

import { getBrowserSupabaseAuthHeaders } from "./browser-auth";

describe("getBrowserSupabaseAuthHeaders", () => {
    beforeEach(() => {
        createBrowserClientSingletonMock.mockReset();
    });

    it("returns an authorization header when a browser session exists", async () => {
        createBrowserClientSingletonMock.mockReturnValue({
            auth: {
                getSession: vi.fn().mockResolvedValue({
                    data: {
                        session: {
                            access_token: "token-1",
                        },
                    },
                    error: null,
                }),
            },
        });

        await expect(getBrowserSupabaseAuthHeaders()).resolves.toEqual({
            Authorization: "Bearer token-1",
        });
    });

    it("returns an empty header object when there is no browser session", async () => {
        createBrowserClientSingletonMock.mockReturnValue({
            auth: {
                getSession: vi.fn().mockResolvedValue({
                    data: {
                        session: null,
                    },
                    error: null,
                }),
            },
        });

        await expect(getBrowserSupabaseAuthHeaders()).resolves.toEqual({});
    });
});
