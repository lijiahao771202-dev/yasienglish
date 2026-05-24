/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
    dbMock,
    saveProfilePatchMock,
    useLiveQueryMock,
} = vi.hoisted(() => ({
    dbMock: {
        user_profile: {
            orderBy: vi.fn(() => ({
                first: vi.fn(() => undefined),
            })),
        },
        read_articles: {
            count: vi.fn(() => 0),
            where: vi.fn(() => ({
                aboveOrEqual: vi.fn(() => ({
                    toArray: vi.fn(() => []),
                })),
            })),
        },
        vocabulary: {
            count: vi.fn(() => 0),
            where: vi.fn(() => ({
                aboveOrEqual: vi.fn(() => ({
                    toArray: vi.fn(() => []),
                })),
                belowOrEqual: vi.fn(() => ({
                    count: vi.fn(() => 0),
                    limit: vi.fn(() => ({
                        toArray: vi.fn(() => []),
                    })),
                })),
            })),
        },
        writing_history: {
            count: vi.fn(() => 0),
            where: vi.fn(() => ({
                aboveOrEqual: vi.fn(() => ({
                    toArray: vi.fn(() => []),
                })),
            })),
        },
        elo_history: {
            orderBy: vi.fn(() => ({
                reverse: vi.fn(() => ({
                    limit: vi.fn(() => ({
                        toArray: vi.fn(() => []),
                    })),
                })),
            })),
        },
        listening_cabin_sessions: {
            where: vi.fn(() => ({
                aboveOrEqual: vi.fn(() => ({
                    toArray: vi.fn(() => []),
                })),
            })),
        },
    },
    saveProfilePatchMock: vi.fn(),
    useLiveQueryMock: vi.fn(),
}));

vi.mock("dexie-react-hooks", () => ({
    useLiveQuery: useLiveQueryMock,
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("framer-motion", async () => {
    const React = await import("react");

    const passthrough = (tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & Record<string, unknown>>(
            ({ children, ...props }, ref) => {
                const nextProps = { ...props };
                delete nextProps.animate;
                delete nextProps.exit;
                delete nextProps.initial;
                delete nextProps.layout;
                delete nextProps.transition;
                delete nextProps.variants;
                delete nextProps.whileHover;
                delete nextProps.whileTap;
                return React.createElement(tag, { ref, ...nextProps }, children);
            },
        );
        MotionComponent.displayName = `Motion(${tag})`;
        return MotionComponent;
    };

    return {
        AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, {
            get: (_target, key) => passthrough(typeof key === "string" ? key : "div"),
        }),
    };
});

vi.mock("@/components/auth/AuthSessionContext", () => ({
    useAuthSessionUser: () => ({
        id: "user-1",
        email: "luna@yasi.app",
    }),
}));

vi.mock("@/components/ui/SpotlightTour", () => ({
    SpotlightTour: () => null,
}));

vi.mock("@/components/home/HomeDashboardPanels_v2", () => ({
    HomeDashboardPanels_v2: () => <section>dashboard</section>,
}));

vi.mock("@/lib/db", () => ({
    db: dbMock,
}));

vi.mock("@/lib/user-repository", () => ({
    saveProfilePatch: saveProfilePatchMock,
}));

import { HomeConsole_v2 } from "./HomeConsole_v2";

describe("HomeConsole_v2", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        vi.unstubAllGlobals();
        useLiveQueryMock.mockReset();
        saveProfilePatchMock.mockReset();
        dbMock.user_profile.orderBy.mockImplementation(() => ({
            first: vi.fn(() => undefined),
        }));
    });

    it("keeps rendering when a live query throws", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        useLiveQueryMock.mockImplementation((querier: (() => unknown), _deps?: unknown[], defaultResult?: unknown) => {
            try {
                return querier();
            } catch {
                return defaultResult;
            }
        });
        dbMock.user_profile.orderBy.mockImplementationOnce(() => ({
            first: vi.fn(() => {
                throw new DOMException(
                    "Data lost due to missing file. Affected record should be considered irrecoverable",
                    "NotReadableError",
                );
            }),
        }));

        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<HomeConsole_v2 />);
        });

        expect(container.textContent).toContain("欢迎回来");
        expect(container.textContent).toContain("dashboard");

        await act(async () => {
            root.unmount();
        });
    });
});
