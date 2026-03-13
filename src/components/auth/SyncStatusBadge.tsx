"use client";

import Link from "next/link";

import { useSyncStatusStore } from "@/lib/sync-status";

function getLabel(phase: ReturnType<typeof useSyncStatusStore.getState>["phase"]) {
    switch (phase) {
        case "bootstrapping":
            return "Syncing";
        case "syncing":
            return "Syncing";
        case "synced":
            return "Synced";
        case "error":
            return "Sync failed";
        default:
            return "Loading";
    }
}

function getTone(phase: ReturnType<typeof useSyncStatusStore.getState>["phase"]) {
    switch (phase) {
        case "synced":
            return "border-emerald-200 bg-emerald-50 text-emerald-700";
        case "error":
            return "border-rose-200 bg-rose-50 text-rose-700";
        default:
            return "border-stone-200 bg-white/90 text-stone-600";
    }
}

export function SyncStatusBadge() {
    const { phase, error } = useSyncStatusStore();

    return (
        <div className="fixed right-4 top-4 z-[120] flex items-center gap-2">
            <div className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ${getTone(phase)}`}>
                {getLabel(phase)}
            </div>
            <Link
                href="/logout"
                className="rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm transition-colors hover:text-stone-900"
            >
                Sign out
            </Link>
            {phase === "error" && error ? (
                <div className="hidden max-w-xs rounded-2xl border border-rose-100 bg-white/95 px-3 py-2 text-xs text-rose-600 shadow-sm md:block">
                    {error}
                </div>
            ) : null}
        </div>
    );
}
