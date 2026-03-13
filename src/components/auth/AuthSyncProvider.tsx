"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SyncStatusBadge } from "@/components/auth/SyncStatusBadge";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";
import { useSyncStatusStore } from "@/lib/sync-status";
import { bootstrapUserSession } from "@/lib/user-repository";

interface AuthSyncProviderProps {
    initialUserId: string | null;
    children: ReactNode;
}

const PUBLIC_PATHS = new Set(["/login", "/auth/callback"]);

export function AuthSyncProvider({ initialUserId, children }: AuthSyncProviderProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { phase, error, ready, reset, setPhase, setReady } = useSyncStatusStore();

    useEffect(() => {
        if (!pathname || PUBLIC_PATHS.has(pathname)) {
            setReady(true);
            return;
        }

        if (!initialUserId) {
            router.replace("/login");
            return;
        }

        let cancelled = false;

        const runBootstrap = async () => {
            try {
                await bootstrapUserSession(initialUserId);
            } catch (bootstrapError) {
                if (cancelled) return;
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
    }, [initialUserId, pathname, router, setPhase, setReady]);

    useEffect(() => {
        const supabase = createBrowserClientSingleton();
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
            if (!session?.user && !PUBLIC_PATHS.has(pathname || "")) {
                reset();
                router.replace("/login");
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [pathname, reset, router]);

    const shouldBlock = Boolean(pathname && !PUBLIC_PATHS.has(pathname) && (!ready || phase === "bootstrapping" || phase === "error"));

    if (shouldBlock) {
        return (
            <div className="fixed inset-0 z-[140] flex items-center justify-center bg-stone-950/70 px-6 backdrop-blur-xl">
                <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/95 p-8 text-center shadow-2xl">
                    <h2 className="font-newsreader text-4xl text-stone-900">
                        {phase === "error" ? "Sync blocked" : "Preparing your data"}
                    </h2>
                    <p className="mt-4 text-sm text-stone-600">
                        {phase === "error"
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
        <>
            {children}
            {initialUserId && pathname && !PUBLIC_PATHS.has(pathname) ? <SyncStatusBadge /> : null}
        </>
    );
}
