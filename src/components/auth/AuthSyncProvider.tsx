"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { AuthSessionContext, type SessionUserSummary } from "@/components/auth/AuthSessionContext";
import { APP_HOME_PATH, isGuestOnlyAuthPath, isPublicAuthPath } from "@/lib/auth-routing";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";
import { useSyncStatusStore } from "@/lib/sync-status";
import { bootstrapUserSession, scheduleBackgroundSync } from "@/lib/user-repository";

interface AuthSyncProviderProps {
    initialUser: SessionUserSummary | null;
    children: ReactNode;
}

const AUTH_SESSION_TIMEOUT_MS = 5_000;

async function getSessionWithTimeout(supabase: ReturnType<typeof createBrowserClientSingleton>) {
    return Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error("Timed out while reading your local session.")), AUTH_SESSION_TIMEOUT_MS);
        }),
    ]);
}

export function AuthSyncProvider({ initialUser, children }: AuthSyncProviderProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [isOffline, setIsOffline] = useState(false);
    const [sessionUser, setSessionUser] = useState<SessionUserSummary | null>(initialUser);
    const [authResolved, setAuthResolved] = useState(Boolean(initialUser));
    const bootstrappedUserIdRef = useRef<string | null>(null);
    const pathnameRef = useRef<string | null>(pathname);
    const { phase, error, ready, reset, setPhase, setReady } = useSyncStatusStore();
    const isPublicPath = Boolean(pathname && isPublicAuthPath(pathname));
    const shouldBootstrap = Boolean(pathname && !isPublicAuthPath(pathname) && authResolved && sessionUser?.id);

    useEffect(() => {
        pathnameRef.current = pathname;
    }, [pathname]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const updateOnlineState = () => {
            setIsOffline(!window.navigator.onLine);
        };

        updateOnlineState();
        window.addEventListener("online", updateOnlineState);
        window.addEventListener("offline", updateOnlineState);
        return () => {
            window.removeEventListener("online", updateOnlineState);
            window.removeEventListener("offline", updateOnlineState);
        };
    }, []);

    useEffect(() => {
        if (!pathname || isPublicAuthPath(pathname)) {
            setReady(true);
            return;
        }

        if (!authResolved) {
            return;
        }

        if (!sessionUser?.id) {
            router.replace("/login");
            return;
        }
    }, [authResolved, pathname, router, sessionUser?.id, setReady]);

    useEffect(() => {
        if (!pathname || !isGuestOnlyAuthPath(pathname) || !authResolved) {
            return;
        }

        if (sessionUser?.id) {
            router.replace(APP_HOME_PATH);
        }
    }, [authResolved, pathname, router, sessionUser?.id]);

    useEffect(() => {
        if (!shouldBootstrap || !sessionUser?.id) {
            return;
        }

        if (bootstrappedUserIdRef.current === sessionUser.id) {
            return;
        }

        bootstrappedUserIdRef.current = sessionUser.id;

        let cancelled = false;

        const runBootstrap = async () => {
            try {
                await bootstrapUserSession(sessionUser.id);
            } catch (bootstrapError) {
                if (cancelled) return;
                bootstrappedUserIdRef.current = null;
                setPhase(
                    "error",
                    bootstrapError instanceof Error
                        ? bootstrapError.message
                        : "Failed to bootstrap user data.",
                );
                setReady(false);
            }
        };

        runBootstrap();

        return () => {
            cancelled = true;
        };
    }, [sessionUser?.id, setPhase, setReady, shouldBootstrap]);

    useEffect(() => {
        const supabase = createBrowserClientSingleton();
        let cancelled = false;
        let receivedInitialSession = false;

        const markResolvedFromSession = (session: Session | null) => {
            receivedInitialSession = true;
            setAuthResolved(true);

            if (session?.user) {
                setSessionUser({
                    id: session.user.id,
                    email: session.user.email ?? null,
                });
                return;
            }

            setSessionUser(null);
        };

        const watchdogId = window.setTimeout(() => {
            if (cancelled || receivedInitialSession) {
                return;
            }

            setAuthResolved(true);
            setSessionUser(null);

            if (!isPublicAuthPath(pathnameRef.current || "")) {
                setPhase("error", "We could not restore the local session on this device. Please check your network and sign in again.");
                setReady(false);
            }
        }, AUTH_SESSION_TIMEOUT_MS);

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
            if (cancelled) {
                return;
            }

            if (event === "INITIAL_SESSION") {
                window.clearTimeout(watchdogId);
                markResolvedFromSession(session);
                return;
            }

            setAuthResolved(true);

            if (session?.user) {
                setSessionUser({
                    id: session.user.id,
                    email: session.user.email ?? null,
                });
                return;
            }

            if (!isPublicAuthPath(pathnameRef.current || "")) {
                setSessionUser(null);
                bootstrappedUserIdRef.current = null;
                reset();
                router.replace("/login");
            }
        });

        void (async () => {
            try {
                const sessionResult = await getSessionWithTimeout(supabase);
                if (cancelled) return;

                if (sessionResult.error || !sessionResult.data.session?.user) {
                    if (!receivedInitialSession) {
                        window.clearTimeout(watchdogId);
                        markResolvedFromSession(null);
                    }
                    return;
                }

                if (!receivedInitialSession) {
                    window.clearTimeout(watchdogId);
                    markResolvedFromSession(sessionResult.data.session);
                }
            } catch (sessionError) {
                if (cancelled) return;
                window.clearTimeout(watchdogId);
                receivedInitialSession = true;
                setSessionUser(null);
                setAuthResolved(true);
                if (!isPublicAuthPath(pathnameRef.current || "")) {
                    setPhase(
                        "error",
                        sessionError instanceof Error
                            ? sessionError.message
                            : "Failed to check your session.",
                    );
                    setReady(false);
                }
            }
        })();

        return () => {
            cancelled = true;
            window.clearTimeout(watchdogId);
            subscription.unsubscribe();
        };
    }, [initialUser, reset, router, setPhase, setReady]);

    useEffect(() => {
        if (!sessionUser?.id || !ready || isPublicPath) {
            return;
        }

        const handleOnline = () => {
            void scheduleBackgroundSync({ pullSnapshot: true });
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void scheduleBackgroundSync({ pullSnapshot: true });
            }
        };

        window.addEventListener("online", handleOnline);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            window.removeEventListener("online", handleOnline);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [isPublicPath, ready, sessionUser?.id]);

    const shouldBlock = Boolean(pathname && !isPublicPath && (!authResolved || !ready));
    if (shouldBlock) {
        return (
            <div className="fixed inset-0 z-[140] flex items-center justify-center bg-stone-950/70 px-6 backdrop-blur-xl">
                <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/95 p-8 text-center shadow-2xl">
                    <h2 className="font-newsreader text-4xl text-stone-900">
                        {phase === "error" ? "Sync blocked" : authResolved ? "Preparing your data" : "Checking your session"}
                    </h2>
                    <p className="mt-4 text-sm text-stone-600">
                        {!authResolved
                            ? "We are checking the local session on this device before opening your learning space."
                            : phase === "error"
                            ? error || "We could not sync your account data."
                            : "We are restoring your account from Supabase before the app becomes interactive."}
                    </p>
                    {phase === "error" ? (
                        <div className="mt-6 flex justify-center gap-3">
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="rounded-2xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
                            >
                                Retry
                            </button>
                            <button
                                type="button"
                                onClick={() => router.replace("/logout")}
                                className="rounded-2xl border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700"
                            >
                                Sign out
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <AuthSessionContext.Provider value={sessionUser}>
            {isOffline ? (
                <div className="fixed inset-x-0 top-4 z-[150] flex justify-center px-4">
                    <div className="rounded-full border border-amber-200 bg-white/92 px-4 py-2 text-sm font-medium text-amber-700 shadow-[0_18px_40px_-24px_rgba(217,119,6,0.42)] backdrop-blur-xl">
                        当前网络连接失败，云端同步和 AI 接口暂时不可用。
                    </div>
                </div>
            ) : null}
            {children}
        </AuthSessionContext.Provider>
    );
}
