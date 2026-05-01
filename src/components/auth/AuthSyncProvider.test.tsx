/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    bootstrapUserSessionMock,
    replaceMock,
    scheduleBackgroundSyncMock,
} = vi.hoisted(() => ({
    bootstrapUserSessionMock: vi.fn(),
    replaceMock: vi.fn(),
    scheduleBackgroundSyncMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useRouter: () => ({
        replace: replaceMock,
    }),
}));

vi.mock("@/lib/supabase/browser", () => ({
    createBrowserClientSingleton: () => ({
        auth: {
            getSession: vi.fn(async () => ({
                data: { session: { user: { id: "user-1", email: "luna@yasi.app" } } },
                error: null,
            })),
            onAuthStateChange: vi.fn(() => ({
                data: {
                    subscription: {
                        unsubscribe: vi.fn(),
                    },
                },
            })),
        },
        channel: vi.fn(() => {
            const channel = {
                on: vi.fn(() => channel),
                subscribe: vi.fn(),
            };
            return channel;
        }),
        removeChannel: vi.fn(),
    }),
}));

vi.mock("@/lib/user-repository", () => ({
    bootstrapUserSession: bootstrapUserSessionMock,
    scheduleBackgroundSync: scheduleBackgroundSyncMock,
}));

import { useSyncStatusStore } from "@/lib/sync-status";
import { AuthSyncProvider } from "./AuthSyncProvider";

async function renderProvider() {
    const testGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
        root.render(
            <AuthSyncProvider initialUser={{ id: "user-1", email: "luna@yasi.app" }}>
                <main>Learning shell</main>
            </AuthSyncProvider>,
        );
    });

    return {
        container,
        cleanup: async () => {
            await act(async () => {
                root.unmount();
            });
            container.remove();
        },
    };
}

describe("AuthSyncProvider", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        replaceMock.mockReset();
        scheduleBackgroundSyncMock.mockReset();
        useSyncStatusStore.getState().reset();
        bootstrapUserSessionMock.mockImplementation(async () => {
            useSyncStatusStore.getState().setReady(true);
            useSyncStatusStore.getState().setPhase("error", "background sync failed");
            return { usedLocalCache: true };
        });
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("keeps protected pages usable when background sync fails after local readiness", async () => {
        const view = await renderProvider();

        await Promise.resolve();
        expect(view.container.textContent).toContain("Learning shell");
        expect(view.container.textContent).not.toContain("同步受阻");

        await view.cleanup();
    });
});
