"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Cloud, RefreshCw, Sparkles } from "lucide-react";

import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { ProfileSettingsPanel } from "@/components/profile/ProfileSettingsPanel";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";
import { db } from "@/lib/db";
import { useSyncStatusStore } from "@/lib/sync-status";
import { saveProfilePatch, syncNow } from "@/lib/user-repository";
import { DEFAULT_AVATAR_PRESET, DEFAULT_LEARNING_PREFERENCES, DEFAULT_PROFILE_USERNAME } from "@/lib/user-sync";

export function ProfilePageClient() {
    const sessionUser = useAuthSessionUser();
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const lastSynced = useLiveQuery(() => db.sync_meta.get("last_successful_sync_at"), []);
    const { phase } = useSyncStatusStore();

    if (!sessionUser?.email) {
        return null;
    }

    if (!profile) {
        return (
            <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(251,207,232,0.72),transparent_28%),linear-gradient(180deg,#fdf2f8_0%,#eef2ff_100%)] px-4 py-16 sm:px-6">
                <div className="mx-auto max-w-5xl rounded-[2.4rem] border border-white/65 bg-white/78 p-10 shadow-[0_40px_100px_-48px_rgba(79,70,229,0.85)] backdrop-blur-2xl">
                    <p className="text-sm text-slate-600">正在准备你的资料镜像…</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(251,207,232,0.72),transparent_28%),linear-gradient(180deg,#fdf2f8_0%,#eef2ff_100%)] px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl space-y-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-3">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/78 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700 shadow-[0_18px_28px_-22px_rgba(99,102,241,1)]">
                            <Sparkles className="h-3.5 w-3.5" />
                            Account Studio
                        </div>
                        <h1 className="font-comic text-5xl font-bold tracking-[-0.05em] text-slate-900">
                            你的角色资料页。
                        </h1>
                        <p className="max-w-2xl text-sm leading-6 text-slate-600">
                            这里负责用户名、预设头像、学习偏好和密码。同步状态会直接跟着本地镜像一起更新，右上角菜单也会实时反映。
                        </p>
                    </div>
                    <Link
                        href="/"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/70 bg-white/82 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_18px_28px_-22px_rgba(99,102,241,1)] transition hover:text-slate-950"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        返回首页
                    </Link>
                </div>

                <div className="rounded-[2.4rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(250,245,255,0.76))] p-4 shadow-[0_40px_100px_-48px_rgba(79,70,229,0.85)] backdrop-blur-2xl sm:p-6">
                    <div className="mb-6 flex items-center gap-3 rounded-[1.4rem] border border-indigo-100 bg-indigo-50/90 px-4 py-3 text-sm text-indigo-800">
                        <Cloud className="h-4 w-4" />
                        <span>
                            当前同步：{phase} · 最近同步：
                            {typeof lastSynced?.value === "number" ? new Date(lastSynced.value).toLocaleString() : " 尚未完成"}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                void syncNow();
                            }}
                            className="ml-auto inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:text-indigo-900"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${phase === "syncing" ? "animate-spin" : ""}`} />
                            立即同步
                        </button>
                    </div>

                    <ProfileSettingsPanel
                        email={sessionUser.email}
                        initialProfile={{
                            username: profile.username || DEFAULT_PROFILE_USERNAME,
                            avatar_preset: profile.avatar_preset || DEFAULT_AVATAR_PRESET,
                            bio: profile.bio || "",
                            learning_preferences: profile.learning_preferences || DEFAULT_LEARNING_PREFERENCES,
                        }}
                        onSave={async (payload) => {
                            await saveProfilePatch(payload);
                        }}
                        onChangePassword={async (password) => {
                            const supabase = createBrowserClientSingleton();
                            const { error } = await supabase.auth.updateUser({ password });
                            if (error) throw error;
                        }}
                    />
                </div>
            </div>
        </main>
    );
}
