"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { BadgeCheck, CloudUpload, Image as ImageIcon, LogOut, Mail, RefreshCw, Settings2, X } from "lucide-react";

import { PresetAvatar } from "@/components/profile/PresetAvatar";
import { SpeechModelStatusPanel } from "@/components/speech/SpeechModelStatusPanel";
import { db } from "@/lib/db";
import { useDesktopSpeechModel } from "@/hooks/useDesktopSpeechModel";
import { getUserFacingSyncError, syncNow } from "@/lib/user-repository";
import { DEFAULT_AVATAR_PRESET, DEFAULT_PROFILE_USERNAME } from "@/lib/user-sync";
import { useSyncStatusStore } from "@/lib/sync-status";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { MailboxPanel } from "@/components/mail/MailboxPanel";
import { BackgroundThemePicker } from "@/components/background/BackgroundThemePicker";

interface UserAvatarMenuProps {
    userId?: string | null;
    email: string;
    displayName: string;
    avatarPreset: string;
    syncLabel: string;
    syncDescription: string;
    unreadCount?: number;
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
    userId,
    email,
    displayName,
    avatarPreset,
    syncLabel,
    syncDescription,
    unreadCount = 0,
    placement = "floating",
}: UserAvatarMenuProps) {
    const [open, setOpen] = useState(false);
    const [manualSyncing, setManualSyncing] = useState(false);
    const [logoutBusy, setLogoutBusy] = useState(false);
    const [mailboxOpen, setMailboxOpen] = useState(false);
    const [backgroundOpen, setBackgroundOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const router = useRouter();
    const speechModel = useDesktopSpeechModel();
    const isSidebar = placement === "sidebar";
    const isHeader = placement === "header";

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setOpen(false);
                setMailboxOpen(false);
                setBackgroundOpen(false);
            }
        };

        window.addEventListener("mousedown", handlePointerDown);
        return () => {
            window.removeEventListener("mousedown", handlePointerDown);
        };
    }, []);

    useEffect(() => {
        if (!mailboxOpen && !backgroundOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setMailboxOpen(false);
                setBackgroundOpen(false);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [backgroundOpen, mailboxOpen]);

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
                    ? "relative flex w-full cursor-pointer items-center gap-3 rounded-[1.65rem] border border-white/76 bg-[linear-gradient(145deg,rgba(255,255,255,0.74),rgba(247,243,236,0.5))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_18px_30px_-24px_rgba(46,39,33,0.18)] transition hover:-translate-y-0.5"
                    : isHeader
                        ? "relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-white/78 bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_20px_32px_-22px_rgba(45,38,31,0.18)] backdrop-blur-xl transition hover:-translate-y-0.5"
                        : "relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-white/70 bg-white/78 shadow-[0_24px_36px_-22px_rgba(79,70,229,0.95)] backdrop-blur-xl transition hover:-translate-y-0.5"}
            >
                <PresetAvatar presetId={avatarPreset} size={isSidebar ? 52 : 44} />
                {unreadCount > 0 ? (
                    <span className="absolute right-2 top-2 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(255,255,255,0.85)]" />
                ) : null}
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
                        ? "absolute bottom-full left-0 mb-3 w-[22.5rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(246,244,239,0.92))] p-4 shadow-[0_38px_90px_-36px_rgba(46,39,33,0.18)] backdrop-blur-2xl"
                        : "absolute right-0 mt-3 w-[22.5rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(246,244,239,0.93))] p-4 shadow-[0_38px_90px_-36px_rgba(46,39,33,0.2)] backdrop-blur-2xl"}
                >
                    <div className="rounded-[1.55rem] border border-white/70 bg-white/65 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
                        <div className="flex items-center gap-3">
                            <PresetAvatar presetId={avatarPreset} size={56} />
                            <div className="min-w-0">
                                <p className="truncate text-2xl font-semibold tracking-[-0.02em] text-slate-900">{displayName}</p>
                                <p className="mt-1 truncate text-sm text-slate-500">{email}</p>
                            </div>
                        </div>
                    </div>

                    <div className={`mt-3 rounded-[1.3rem] border px-4 py-3 ${getSyncTone(syncLabel)}`}>
                        <div className="flex items-center gap-2 text-base font-semibold">
                            <RefreshCw className="h-4 w-4" />
                            {syncLabel}
                        </div>
                        <p className="mt-1 text-sm leading-5 opacity-90">{syncDescription}</p>
                    </div>

                    {speechModel.isDesktopApp ? (
                        <div className="mt-3">
                            <SpeechModelStatusPanel
                                progress={speechModel.progress}
                                onDownload={speechModel.downloadModel}
                                compact
                            />
                        </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-2 gap-2.5">
                        <button
                            type="button"
                            onClick={async () => {
                                setManualSyncing(true);
                                try {
                                    await syncNow();
                                } catch (error) {
                                    window.alert(getUserFacingSyncError(error));
                                } finally {
                                    setManualSyncing(false);
                                }
                            }}
                            className="col-span-2 flex w-full cursor-pointer items-center justify-between rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-amber-200 hover:text-slate-950"
                        >
                            <span className="flex items-center gap-2">
                                <CloudUpload className="h-4 w-4" />
                                {manualSyncing ? "同步中…" : "立即同步"}
                            </span>
                            <RefreshCw className={`h-4 w-4 text-amber-500 ${manualSyncing ? "animate-spin" : ""}`} />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setMailboxOpen(true);
                                setOpen(false);
                            }}
                            className="flex min-h-[78px] cursor-pointer flex-col items-start justify-between rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-rose-200 hover:text-slate-950"
                        >
                            <span className="flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                邮箱
                            </span>
                            {unreadCount > 0 ? (
                                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">{unreadCount} 封未读</span>
                            ) : (
                                <span className="text-xs text-slate-400">无新消息</span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setBackgroundOpen(true);
                                setOpen(false);
                            }}
                            className="flex min-h-[78px] cursor-pointer flex-col items-start justify-between rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-slate-950"
                        >
                            <span className="flex items-center gap-2">
                                <ImageIcon className="h-4 w-4" />
                                背景
                            </span>
                            <span className="text-xs text-slate-400">主题可切换</span>
                        </button>
                    </div>
                    <div className="mt-2 space-y-2">
                        <Link
                            href="/profile"
                            prefetch={false}
                            className="flex cursor-pointer items-center justify-between rounded-[1.2rem] border border-indigo-200/70 bg-[linear-gradient(135deg,rgba(246,248,255,0.92),rgba(240,245,255,0.84))] px-4 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-indigo-300 hover:text-slate-950"
                        >
                            <span className="flex items-center gap-2">
                                <Settings2 className="h-4 w-4" />
                                个人资料与密码
                            </span>
                            <BadgeCheck className="h-4 w-4 text-indigo-500" />
                        </Link>
                        <button
                            type="button"
                            onClick={async () => {
                                setLogoutBusy(true);
                                try {
                                    const supabase = createBrowserClientSingleton();
                                    await supabase.auth.signOut();
                                    await fetch("/logout", { method: "POST" }).catch(() => undefined);
                                } finally {
                                    setLogoutBusy(false);
                                    router.replace("/login");
                                }
                            }}
                            className="flex w-full cursor-pointer items-center justify-between rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-700"
                        >
                            <span className="flex items-center gap-2">
                                <LogOut className="h-4 w-4" />
                                {logoutBusy ? "退出中…" : "退出登录"}
                            </span>
                        </button>
                    </div>
                </div>
            ) : null}
            {mailboxOpen ? (
                <div
                    className={isSidebar
                        ? "absolute bottom-full left-full z-[180] mb-3 ml-3 w-[min(92vw,40rem)]"
                        : "absolute right-0 top-full z-[180] mt-3 w-[min(92vw,40rem)]"}
                >
                    <div className="relative rounded-[1.9rem] border border-white/80 bg-white p-3 shadow-[0_36px_100px_-42px_rgba(15,23,42,0.45)]">
                        <button
                            type="button"
                            onClick={() => setMailboxOpen(false)}
                            className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#dfe3ec] bg-white text-[#3f4a5a]"
                            aria-label="Close mailbox"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <MailboxPanel />
                    </div>
                </div>
            ) : null}
            {backgroundOpen ? (
                <div
                    className={isSidebar
                        ? "absolute bottom-full left-full z-[180] mb-3 ml-3 w-[min(92vw,42.5rem)]"
                        : "absolute right-0 top-full z-[180] mt-3 w-[min(92vw,42.5rem)]"}
                >
                    <div className="relative rounded-[1.9rem] border border-white/80 bg-white p-3 shadow-[0_36px_100px_-42px_rgba(15,23,42,0.45)]">
                        <button
                            type="button"
                            onClick={() => setBackgroundOpen(false)}
                            className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#dfe3ec] bg-white text-[#3f4a5a]"
                            aria-label="Close background picker"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <BackgroundThemePicker userId={userId} />
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
    const sessionUser = useAuthSessionUser();
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const syncMeta = useLiveQuery(() => db.sync_meta.get("last_successful_sync_at"), []);
    const { phase, error } = useSyncStatusStore();
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        const loadUnread = async () => {
            try {
                const response = await fetch("/api/mail/unread-count", { cache: "no-store" });
                const payload = await response.json();
                if (response.ok) {
                    setUnreadCount(Number(payload.unreadCount ?? 0));
                }
            } catch {
                // ignore
            }
        };

        void loadUnread();
        const timer = window.setInterval(() => void loadUnread(), 15_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!sessionUser?.id) return;
        const supabase = createBrowserClientSingleton();
        const channel = supabase
            .channel(`avatar-mail-${sessionUser.id}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "user_messages", filter: `user_id=eq.${sessionUser.id}` },
                async () => {
                    const response = await fetch("/api/mail/unread-count", { cache: "no-store" });
                    const payload = await response.json().catch(() => ({ unreadCount: 0 }));
                    if (response.ok) {
                        setUnreadCount(Number(payload.unreadCount ?? 0));
                    }
                },
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [sessionUser?.id]);

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
            userId={sessionUser?.id}
            email={email}
            displayName={summary.displayName}
            avatarPreset={summary.avatarPreset}
            syncLabel={summary.syncLabel}
            syncDescription={summary.syncDescription}
            unreadCount={unreadCount}
            placement={placement}
        />
    );
}
