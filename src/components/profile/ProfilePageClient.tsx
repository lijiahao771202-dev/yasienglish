"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Cloud, RefreshCw, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { ProfileSettingsPanel } from "@/components/profile/ProfileSettingsPanel";
import { SpeechModelStatusPanel } from "@/components/speech/SpeechModelStatusPanel";
import { useDesktopSpeechModel } from "@/hooks/useDesktopSpeechModel";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";
import { db } from "@/lib/db";
import { useSyncStatusStore } from "@/lib/sync-status";
import { getUserFacingSyncError, saveProfilePatch, syncNow } from "@/lib/user-repository";
import { DEFAULT_AVATAR_PRESET, DEFAULT_PROFILE_USERNAME } from "@/lib/user-sync";
import { normalizeLearningPreferences } from "@/lib/profile-settings";

export function ProfilePageClient() {
    const sessionUser = useAuthSessionUser();
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const lastSynced = useLiveQuery(() => db.sync_meta.get("last_successful_sync_at"), []);
    const { phase } = useSyncStatusStore();
    const speechModel = useDesktopSpeechModel();

    if (!sessionUser?.email) {
        return null;
    }

    if (!profile) {
        return (
            <main className="font-welcome-ui min-h-screen bg-[#fefce8] px-4 py-16 sm:px-6 flex items-center justify-center">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[2rem] border-4 border-[#111827] bg-[#fffaf0] p-10 shadow-[0_8px_0_0_#111827]">
                    <p className="font-welcome-display text-2xl text-[#111827]">正在进入奇妙控制台…</p>
                </motion.div>
            </main>
        );
    }

    return (
        <main className="font-welcome-ui min-h-screen bg-[#fefce8] px-4 py-12 sm:px-6 lg:px-8 overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#fffbeb,#fefce8)] pointer-events-none" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="mx-auto max-w-5xl space-y-8 relative z-10">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-2">
                        <motion.div whileHover={{ scale: 1.05 }} className="inline-flex items-center gap-2 rounded-full border-4 border-[#111827] bg-[#fde68a] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[#92400e] shadow-[0_4px_0_0_#111827] cursor-default">
                            <Sparkles className="h-4 w-4" />
                            Account Studio
                        </motion.div>
                        <h1 className="font-welcome-display text-5xl tracking-[-0.05em] text-[#111827]">
                            你的资料空间
                        </h1>
                        <p className="max-w-2xl text-[15px] font-bold leading-6 text-[#6b7280]">
                            管理用户名、神奇头像、学习偏好和通行密码。同步状态实时更新中！
                        </p>
                    </div>
                    <Link href="/" passHref>
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            whileHover={{ scale: 1.05, y: -2 }}
                            className="inline-flex items-center gap-2 rounded-[1.2rem] border-4 border-[#111827] bg-white px-5 py-3 text-sm font-black text-[#111827] shadow-[0_4px_0_0_#111827] transition-all hover:bg-slate-50 hover:shadow-[0_6px_0_0_#111827]"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            返回主页
                        </motion.button>
                    </Link>
                </div>

                <div className="rounded-[3rem] border-4 border-[#111827] bg-[#f8fafc] p-8 shadow-[0_12px_0_0_#111827]">
                    <div className="mb-8 flex flex-wrap items-center gap-3 rounded-[1.5rem] border-4 border-[#111827] bg-[#dcfce7] px-5 py-3 text-sm font-black text-[#166534] shadow-[0_4px_0_0_#111827]">
                        <Cloud className="h-5 w-5" />
                        <span>
                            当前同步：<span className="text-[#15803d] font-welcome-display text-lg tracking-wider">{phase}</span> · 最近：
                            <span className="text-slate-600 ml-1">{typeof lastSynced?.value === "number" ? new Date(lastSynced.value).toLocaleString() : "尚未完成"}</span>
                        </span>
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            whileHover={{ y: -2 }}
                            type="button"
                            onClick={async () => {
                                try {
                                    await syncNow();
                                } catch (error) {
                                    window.alert(getUserFacingSyncError(error));
                                }
                            }}
                            className="ml-auto flex items-center justify-center gap-1.5 rounded-full border-4 border-[#111827] bg-white px-4 py-2 text-xs font-black text-[#111827] shadow-[0_2px_0_0_#111827] transition-all hover:bg-slate-50 hover:shadow-[0_4px_0_0_#111827]"
                        >
                            <RefreshCw className={`h-4 w-4 ${phase === "syncing" ? "animate-spin" : ""}`} />
                            立即拉取
                        </motion.button>
                    </div>

                    {speechModel.isDesktopApp ? (
                        <div className="mb-8">
                            <SpeechModelStatusPanel
                                progress={speechModel.progress}
                                onDownload={speechModel.downloadModel}
                            />
                        </div>
                    ) : null}

                    <ProfileSettingsPanel
                        email={sessionUser.email}
                        initialProfile={{
                            username: profile.username || DEFAULT_PROFILE_USERNAME,
                            avatar_preset: profile.avatar_preset || DEFAULT_AVATAR_PRESET,
                            bio: profile.bio || "",
                            deepseek_api_key: profile.deepseek_api_key || "",
                            learning_preferences: normalizeLearningPreferences(profile.learning_preferences),
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
            </motion.div>
        </main>
    );
}
