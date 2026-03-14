"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BadgeCheck, CloudUpload, LogOut, RefreshCw, Settings2 } from "lucide-react";

import { PresetAvatar } from "@/components/profile/PresetAvatar";
import { db } from "@/lib/db";
import { syncNow } from "@/lib/user-repository";
import { DEFAULT_AVATAR_PRESET, DEFAULT_PROFILE_USERNAME } from "@/lib/user-sync";
import { useSyncStatusStore } from "@/lib/sync-status";

interface UserAvatarMenuProps {
    email: string;
    displayName: string;
    avatarPreset: string;
    syncLabel: string;
    syncDescription: string;
    placement?: "floating" | "sidebar" | "header";
}

function getSyncTone(syncLabel: string) {
    if (syncLabel === "Synced") {
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (syncLabel === "Sync failed") {
        return "border-rose-200 bg-rose-50 text-rose-700";
    }

    return "border-indigo-200 bg-indigo-50 text-indigo-700";
}

function formatSyncLabel(phase: ReturnType<typeof useSyncStatusStore.getState>["phase"]) {
    switch (phase) {
        case "synced":
            return "Synced";
        case "error":
            return "Sync failed";
        case "syncing":
        case "bootstrapping":
            return "Syncing";
        default:
            return "Preparing";
    }
}

function formatSyncDescription(lastSyncedAt: number | null, fallbackError: string | null) {
    if (fallbackError) return fallbackError;
    if (!lastSyncedAt) return "Restoring your cloud mirror";

    const elapsedMinutes = Math.max(0, Math.round((Date.now() - lastSyncedAt) / 60000));
    if (elapsedMinutes < 1) return "Last sync just now";
    if (elapsedMinutes === 1) return "Last sync 1 minute ago";
    if (elapsedMinutes < 60) return `Last sync ${elapsedMinutes} minutes ago`;

    const elapsedHours = Math.round(elapsedMinutes / 60);
    return `Last sync ${elapsedHours} hours ago`;
}

export function UserAvatarMenu({
    email,
    displayName,
    avatarPreset,
    syncLabel,
    syncDescription,
    placement = "floating",
}: UserAvatarMenuProps) {
    const [open, setOpen] = useState(false);
    const [manualSyncing, setManualSyncing] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const isSidebar = placement === "sidebar";
    const isHeader = placement === "header";

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        window.addEventListener("mousedown", handlePointerDown);
        return () => {
            window.removeEventListener("mousedown", handlePointerDown);
        };
    }, []);

    return (
        <div
            ref={containerRef}
            data-avatar-menu-placement={placement}
            className={isSidebar ? "relative z-[130] w-full" : isHeader ? "relative z-[130]" : "fixed right-4 top-4 z-[130]"}
        >
            <button
                type="button"
                aria-label="Open profile menu"
                onClick={() => setOpen((current) => !current)}
                className={isSidebar
                    ? "flex w-full cursor-pointer items-center gap-3 rounded-[1.65rem] border border-white/76 bg-[linear-gradient(145deg,rgba(255,255,255,0.74),rgba(247,243,236,0.5))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_18px_30px_-24px_rgba(46,39,33,0.18)] transition hover:-translate-y-0.5"
                    : isHeader
                        ? "flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-white/78 bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_20px_32px_-22px_rgba(45,38,31,0.18)] backdrop-blur-xl transition hover:-translate-y-0.5"
                        : "flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-white/70 bg-white/78 shadow-[0_24px_36px_-22px_rgba(79,70,229,0.95)] backdrop-blur-xl transition hover:-translate-y-0.5"}
            >
                <PresetAvatar presetId={avatarPreset} size={isSidebar ? 52 : 44} />
                {isSidebar ? (
                    <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold text-[#1f1b18]">{displayName}</p>
                        <p className="mt-0.5 truncate text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#847b6f]">
                            Account center
                        </p>
                    </div>
                ) : null}
            </button>

            {open ? (
                <div
                    className={isSidebar
                        ? "absolute bottom-full left-0 mb-3 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,243,236,0.88))] p-4 shadow-[0_38px_90px_-36px_rgba(46,39,33,0.18)] backdrop-blur-2xl"
                        : "absolute right-0 mt-3 w-80 overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,243,236,0.9))] p-4 shadow-[0_38px_90px_-36px_rgba(46,39,33,0.2)] backdrop-blur-2xl"}
                >
                    <div className="flex items-center gap-3">
                        <PresetAvatar presetId={avatarPreset} size={58} />
                        <div className="min-w-0">
                            <p className="truncate text-lg font-semibold text-slate-900">{displayName}</p>
                            <p className="truncate text-sm text-slate-500">{email}</p>
                        </div>
                    </div>

                    <div className={`mt-4 rounded-[1.3rem] border px-4 py-3 ${getSyncTone(syncLabel)}`}>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <RefreshCw className="h-4 w-4" />
                            {syncLabel}
                        </div>
                        <p className="mt-1 text-xs leading-5 opacity-90">{syncDescription}</p>
                    </div>

                    <div className="mt-4 space-y-2">
                        <button
                            type="button"
                            onClick={async () => {
                                setManualSyncing(true);
                                try {
                                    await syncNow();
                                } finally {
                                    setManualSyncing(false);
                                }
                            }}
                            className="flex w-full cursor-pointer items-center justify-between rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-amber-200 hover:text-slate-950"
                        >
                            <span className="flex items-center gap-2">
                                <CloudUpload className="h-4 w-4" />
                                {manualSyncing ? "同步中…" : "立即同步"}
                            </span>
                            <RefreshCw className={`h-4 w-4 text-amber-500 ${manualSyncing ? "animate-spin" : ""}`} />
                        </button>
                        <Link
                            href="/profile"
                            className="flex cursor-pointer items-center justify-between rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-indigo-200 hover:text-slate-950"
                        >
                            <span className="flex items-center gap-2">
                                <Settings2 className="h-4 w-4" />
                                个人资料与密码
                            </span>
                            <BadgeCheck className="h-4 w-4 text-indigo-500" />
                        </Link>
                        <Link
                            href="/logout"
                            className="flex cursor-pointer items-center justify-between rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-rose-200 hover:text-rose-700"
                        >
                            <span className="flex items-center gap-2">
                                <LogOut className="h-4 w-4" />
                                退出登录
                            </span>
                        </Link>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export function ConnectedUserAvatarMenu({
    email,
    placement = "floating",
}: {
    email: string;
    placement?: "floating" | "sidebar" | "header";
}) {
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const syncMeta = useLiveQuery(() => db.sync_meta.get("last_successful_sync_at"), []);
    const { phase, error } = useSyncStatusStore();

    const summary = useMemo(() => ({
        displayName: profile?.username || email.split("@")[0] || DEFAULT_PROFILE_USERNAME,
        avatarPreset: profile?.avatar_preset || DEFAULT_AVATAR_PRESET,
        syncLabel: formatSyncLabel(phase),
        syncDescription: formatSyncDescription(
            typeof syncMeta?.value === "number" ? syncMeta.value : null,
            phase === "error" ? error : null,
        ),
    }), [email, error, phase, profile?.avatar_preset, profile?.username, syncMeta?.value]);

    return (
        <UserAvatarMenu
            email={email}
            displayName={summary.displayName}
            avatarPreset={summary.avatarPreset}
            syncLabel={summary.syncLabel}
            syncDescription={summary.syncDescription}
            placement={placement}
        />
    );
}
