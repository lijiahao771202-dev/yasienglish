"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, ChevronRight, CloudUpload, Image as ImageIcon, Loader2, LogOut, Mail, Play, RefreshCw, Search, Settings2, Volume2, X } from "lucide-react";

import { PresetAvatar } from "@/components/profile/PresetAvatar";
import { SpeechModelStatusPanel } from "@/components/speech/SpeechModelStatusPanel";
import { db } from "@/lib/db";
import { useDesktopSpeechModel } from "@/hooks/useDesktopSpeechModel";
import { getUserFacingSyncError, saveProfilePatch, syncNow } from "@/lib/user-repository";
import { DEFAULT_AVATAR_PRESET, DEFAULT_PROFILE_USERNAME, TTS_VOICE_OPTIONS, normalizeLearningPreferences, normalizeTtsVoice, type LearningPreferences, type TtsVoice, type TtsVoiceOption } from "@/lib/profile-settings";
import { requestTtsPayload } from "@/lib/tts-client";
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
    learningPreferences: LearningPreferences;
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

const TTS_VOICE_GROUPS: Array<{
    title: string;
    subtitle: string;
    voices: TtsVoiceOption[];
}> = [
    {
        title: "中文发言人",
        subtitle: "适合中文讲解、跟读和中英混读。",
        voices: TTS_VOICE_OPTIONS.filter((option) => option.voice.startsWith("zh-CN-")),
    },
    {
        title: "英文发言人",
        subtitle: "适合英语跟读、慢速讲解和句子拆解。",
        voices: TTS_VOICE_OPTIONS.filter((option) => option.voice.startsWith("en-US-")),
    },
];

function getVoiceOption(voice: TtsVoice) {
    return TTS_VOICE_OPTIONS.find((option) => option.voice === voice);
}

type VoiceFilter = "all" | "zh-CN" | "en-US";

const VOICE_FILTER_OPTIONS: Array<{ value: VoiceFilter; label: string }> = [
    { value: "all", label: "全部" },
    { value: "en-US", label: "英文" },
    { value: "zh-CN", label: "中文" },
];

export function UserAvatarMenu({
    userId,
    email,
    displayName,
    avatarPreset,
    learningPreferences,
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
    const [ttsVoiceOpen, setTtsVoiceOpen] = useState(false);
    const [ttsVoiceBusy, setTtsVoiceBusy] = useState(false);
    const [previewVoice, setPreviewVoice] = useState<TtsVoice | null>(null);
    const [voiceFilter, setVoiceFilter] = useState<VoiceFilter>("all");
    const [voiceSearch, setVoiceSearch] = useState("");
    const [selectedVoice, setSelectedVoice] = useState<TtsVoice>(normalizeTtsVoice(learningPreferences.tts_voice));
    const containerRef = useRef<HTMLDivElement | null>(null);
    const voiceListRef = useRef<HTMLDivElement | null>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const router = useRouter();
    const speechModel = useDesktopSpeechModel();
    const isSidebar = placement === "sidebar";
    const isHeader = placement === "header";
    const selectedVoiceOption = useMemo(
        () => getVoiceOption(selectedVoice) ?? TTS_VOICE_OPTIONS[0],
        [selectedVoice],
    );
    const normalizedVoiceSearch = voiceSearch.trim().toLowerCase();
    const filteredVoiceGroups = useMemo(() => (
        TTS_VOICE_GROUPS
            .map((group) => ({
                ...group,
                voices: group.voices.filter((option) => {
                    const matchesFilter = voiceFilter === "all" || option.voice.startsWith(voiceFilter);
                    if (!matchesFilter) return false;

                    if (!normalizedVoiceSearch) return true;
                    const target = `${option.label} ${option.voice} ${option.description}`.toLowerCase();
                    return target.includes(normalizedVoiceSearch);
                }),
            }))
            .filter((group) => group.voices.length > 0)
    ), [normalizedVoiceSearch, voiceFilter]);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setOpen(false);
                setMailboxOpen(false);
                setBackgroundOpen(false);
                setTtsVoiceOpen(false);
            }
        };

        window.addEventListener("mousedown", handlePointerDown);
        return () => {
            window.removeEventListener("mousedown", handlePointerDown);
        };
    }, []);

    useEffect(() => {
        if (!mailboxOpen && !backgroundOpen && !ttsVoiceOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setMailboxOpen(false);
                setBackgroundOpen(false);
                setTtsVoiceOpen(false);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [backgroundOpen, mailboxOpen, ttsVoiceOpen]);

    useEffect(() => {
        setSelectedVoice(normalizeTtsVoice(learningPreferences.tts_voice));
    }, [learningPreferences.tts_voice]);

    useEffect(() => {
        return () => {
            previewAudioRef.current?.pause();
            previewAudioRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!ttsVoiceOpen) return;
        const timer = window.setTimeout(() => {
            const listElement = voiceListRef.current;
            if (!listElement) return;

            const selectedCard = listElement.querySelector<HTMLElement>(`[data-voice-card="${selectedVoice}"]`);
            if (selectedCard && typeof selectedCard.scrollIntoView === "function") {
                selectedCard.scrollIntoView({ block: "center", inline: "nearest" });
                return;
            }
            if (typeof listElement.scrollTo === "function") {
                listElement.scrollTo({ top: 0 });
            } else {
                listElement.scrollTop = 0;
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [selectedVoice, ttsVoiceOpen]);

    const handleSelectVoice = async (nextVoice: TtsVoice) => {
        if (nextVoice === selectedVoice) {
            setTtsVoiceOpen(false);
            return;
        }

        setTtsVoiceBusy(true);
        try {
            await saveProfilePatch({
                learning_preferences: {
                    ...learningPreferences,
                    tts_voice: nextVoice,
                },
            });
            setSelectedVoice(nextVoice);
            setTtsVoiceOpen(false);
        } catch (error) {
            window.alert(error instanceof Error ? error.message : "切换发言人失败，请重试。");
        } finally {
            setTtsVoiceBusy(false);
        }
    };

    const handlePreviewVoice = async (voice: TtsVoice) => {
        setPreviewVoice(voice);
        try {
            previewAudioRef.current?.pause();
            previewAudioRef.current = null;

            const payload = await requestTtsPayload("This is a preview of your speaking voice.", voice);
            const audio = new Audio(payload.audio);
            previewAudioRef.current = audio;
            audio.onended = () => {
                if (previewAudioRef.current === audio) {
                    previewAudioRef.current = null;
                }
            };
            await audio.play();
        } catch (error) {
            window.alert(error instanceof Error ? error.message : "试听失败，请重试。");
        } finally {
            setPreviewVoice(null);
        }
    };

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
                        ? "absolute bottom-full left-0 mb-3 w-[19rem] max-w-[calc(100vw-2rem)] max-h-[min(82vh,36rem)] overflow-y-auto rounded-[1.8rem] border-3 border-[#e5e7eb] bg-[#fffbeb] p-3 shadow-[0_6px_0_0_#e5e7eb] __cute-hide-scrollbars"
                        : "absolute right-0 mt-3 w-[19rem] max-w-[calc(100vw-2rem)] max-h-[min(82vh,36rem)] overflow-y-auto rounded-[1.8rem] border-3 border-[#e5e7eb] bg-[#fffbeb] p-3 shadow-[0_6px_0_0_#e5e7eb] __cute-hide-scrollbars"}
                >
                    {/* Profile Header */}
                    <div className="rounded-[1.2rem] border-3 border-[#fbbf24] bg-white p-2.5 shadow-[0_4px_0_0_#fbbf24] flex items-center gap-2.5">
                        <div className="flex-shrink-0"><PresetAvatar presetId={avatarPreset} size={38} /></div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[#1f2937]">{displayName}</p>
                            <p className="truncate text-[11px] font-bold text-[#9ca3af]">{email}</p>
                        </div>
                    </div>

                    {/* Sync status */}
                    <div className={`mt-2 rounded-[1rem] border-3 px-3 py-2 ${
                        syncLabel === "Synced"
                            ? "border-[#6ee7b7] bg-[#ecfdf5] text-[#065f46]"
                            : syncLabel === "Sync failed"
                                ? "border-[#fca5a5] bg-[#fef2f2] text-[#991b1b]"
                                : "border-[#93c5fd] bg-[#eff6ff] text-[#1e40af]"
                    } shadow-[0_3px_0_0_currentColor/20]`}>
                        <div className="flex items-center gap-1.5 text-xs font-black">
                            <RefreshCw className="h-3.5 w-3.5" />
                            {syncLabel}
                        </div>
                        <p className="mt-0.5 text-[11px] font-bold leading-4 opacity-80 line-clamp-2">{syncDescription}</p>
                    </div>

                    {speechModel.isDesktopApp ? (
                        <div className="mt-2">
                            <SpeechModelStatusPanel progress={speechModel.progress} onDownload={speechModel.downloadModel} compact />
                        </div>
                    ) : null}

                    {/* Action grid */}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={async () => { setManualSyncing(true); try { await syncNow(); } catch (error) { window.alert(getUserFacingSyncError(error)); } finally { setManualSyncing(false); } }}
                            className="col-span-2 flex w-full cursor-pointer items-center justify-between rounded-[1rem] border-3 border-[#93c5fd] bg-white px-3 py-2 font-black text-xs text-[#1d4ed8] shadow-[0_4px_0_0_#93c5fd] transition active:shadow-none active:translate-y-0.5"
                        >
                            <span className="flex items-center gap-1.5"><CloudUpload className="h-3.5 w-3.5" />{manualSyncing ? "同步中…" : "立即同步"}</span>
                            <RefreshCw className={`h-3.5 w-3.5 text-[#3b82f6] ${manualSyncing ? "animate-spin" : ""}`} />
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMailboxOpen(true); setOpen(false); }}
                            className="flex min-h-[52px] cursor-pointer flex-col items-start justify-between rounded-[1rem] border-3 border-[#fca5a5] bg-white px-3 py-2 text-left font-black text-xs text-[#991b1b] shadow-[0_4px_0_0_#fca5a5] transition active:shadow-none active:translate-y-0.5"
                        >
                            <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />邮箱</span>
                            {unreadCount > 0 ? (
                                <span className="rounded-full border-2 border-[#fca5a5] bg-[#fef2f2] px-1.5 py-0.5 text-[10px] font-black text-[#dc2626]">{unreadCount} 封未读</span>
                            ) : (
                                <span className="text-[10px] font-bold text-[#9ca3af]">无新消息</span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setBackgroundOpen(true); setOpen(false); }}
                            className="flex min-h-[52px] cursor-pointer flex-col items-start justify-between rounded-[1rem] border-3 border-[#c4b5fd] bg-white px-3 py-2 text-left font-black text-xs text-[#5b21b6] shadow-[0_4px_0_0_#c4b5fd] transition active:shadow-none active:translate-y-0.5"
                        >
                            <span className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />背景</span>
                            <span className="text-[10px] font-bold text-[#9ca3af]">主题可切换</span>
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => { setMailboxOpen(false); setBackgroundOpen(false); setTtsVoiceOpen((c) => { const n = !c; if (n) { setVoiceFilter("all"); setVoiceSearch(""); } return n; }); }}
                        className="mt-2 flex w-full cursor-pointer items-center justify-between rounded-[1rem] border-3 border-[#6ee7b7] bg-white px-3 py-2 font-black text-xs text-[#065f46] shadow-[0_4px_0_0_#6ee7b7] transition active:shadow-none active:translate-y-0.5"
                    >
                        <span className="flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" />发言人</span>
                        <span className="flex items-center gap-1 text-[11px] font-black text-[#6b7280]">{selectedVoiceOption.label}<ChevronRight className="h-3 w-3" /></span>
                    </button>
                    <div className="mt-2 space-y-2">
                        <Link href="/profile" prefetch={false} className="flex cursor-pointer items-center justify-between rounded-[1rem] border-3 border-[#a5b4fc] bg-white px-3 py-2 font-black text-xs text-[#3730a3] shadow-[0_4px_0_0_#a5b4fc] transition active:shadow-none active:translate-y-0.5">
                            <span className="flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5" />个人资料与密码</span>
                            <BadgeCheck className="h-3.5 w-3.5 text-[#6366f1]" />
                        </Link>
                        <button
                            type="button"
                            onClick={async () => { setLogoutBusy(true); try { const supabase = createBrowserClientSingleton(); await supabase.auth.signOut(); await fetch("/logout", { method: "POST" }).catch(() => undefined); } finally { setLogoutBusy(false); router.replace("/login"); } }}
                            className="flex w-full cursor-pointer items-center justify-between rounded-[1rem] border-3 border-[#fca5a5] bg-white px-3 py-2 font-black text-xs text-[#dc2626] shadow-[0_4px_0_0_#fca5a5] transition active:shadow-none active:translate-y-0.5"
                        >
                            <span className="flex items-center gap-1.5"><LogOut className="h-3.5 w-3.5" />{logoutBusy ? "退出中…" : "退出登录"}</span>
                        </button>
                    </div>
                    <style dangerouslySetInnerHTML={{ __html: `.__cute-hide-scrollbars::-webkit-scrollbar{display:none}.__cute-hide-scrollbars{-ms-overflow-style:none;scrollbar-width:none}` }} />
                </div>
            ) : null}
            {ttsVoiceOpen ? (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="发言人选择"
                    className="fixed inset-0 z-[180] flex items-center justify-center bg-[#1f2937]/40 px-4 py-6"
                    onClick={() => setTtsVoiceOpen(false)}
                >
                    <div
                        className="relative flex w-[min(94vw,48rem)] max-h-[min(82vh,38rem)] flex-col overflow-hidden rounded-[2rem] border-3 border-[#e5e7eb] bg-[#fffbeb] shadow-[0_8px_0_0_#e5e7eb]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setTtsVoiceOpen(false)}
                            className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border-3 border-[#fca5a5] bg-white text-[#dc2626] font-black shadow-[0_3px_0_0_#fca5a5] transition active:shadow-none active:translate-y-0.5"
                            aria-label="Close voice picker"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                        <div className="border-b-3 border-[#e5e7eb] bg-white px-4 pb-3 pt-3 sm:px-5">
                            <p className="pr-10 text-[10px] font-black uppercase tracking-widest text-[#d97706]">发言人列表</p>
                            <p className="mt-0.5 pr-10 text-base font-black text-[#1f2937]">选择一个声音</p>
                            <p className="mt-0.5 pr-10 text-[11px] font-bold text-[#6b7280]">切换后，后续合成会跟着这个发言人走。</p>
                            <div className="mt-2 flex flex-col gap-2 rounded-[1rem] border-3 border-[#fbbf24] bg-[#fffbeb] p-2.5 shadow-[0_3px_0_0_#fbbf24] sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <p className="truncate text-xs font-black text-[#1f2937]">当前：{selectedVoiceOption.label}</p>
                                    <p className="truncate text-[10px] font-bold text-[#9ca3af]">{selectedVoiceOption.voice}</p>
                                    <p className="mt-0.5 text-[11px] font-bold text-[#6b7280]">{selectedVoiceOption.description}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handlePreviewVoice(selectedVoice)}
                                    disabled={ttsVoiceBusy || previewVoice !== null}
                                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full border-3 border-[#93c5fd] bg-white px-3 text-[11px] font-black text-[#1d4ed8] shadow-[0_3px_0_0_#93c5fd] transition active:shadow-none active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {previewVoice === selectedVoice ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                    试听当前
                                </button>
                            </div>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {VOICE_FILTER_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setVoiceFilter(option.value)}
                                            className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[11px] font-black transition ${
                                                voiceFilter === option.value
                                                    ? "border-3 border-[#1f2937] bg-[#1f2937] text-white shadow-[0_3px_0_0_#111827]"
                                                    : "border-3 border-[#e5e7eb] bg-white text-[#374151] shadow-[0_3px_0_0_#e5e7eb] active:shadow-none active:translate-y-0.5"
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                                <label className="flex h-7 w-full items-center gap-1.5 rounded-full border-3 border-[#e5e7eb] bg-white px-2.5 text-[11px] text-[#6b7280] shadow-[0_3px_0_0_#e5e7eb] sm:w-[13rem]">
                                    <Search className="h-3 w-3 shrink-0" />
                                    <input
                                        value={voiceSearch}
                                        onChange={(event) => setVoiceSearch(event.target.value)}
                                        placeholder="搜索发言人"
                                        aria-label="搜索发言人"
                                        className="w-full border-0 bg-transparent p-0 text-[11px] font-bold text-[#1f2937] outline-none placeholder:text-[#9ca3af]"
                                    />
                                </label>
                            </div>
                        </div>
                        <div ref={voiceListRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-3 sm:px-5">
                            {filteredVoiceGroups.length === 0 ? (
                                <div className="rounded-[1rem] border-3 border-dashed border-[#fcd34d] bg-white px-4 py-5 text-center shadow-[0_3px_0_0_#fcd34d]">
                                    <p className="text-xs font-black text-[#d97706]">没有找到匹配的发言人</p>
                                    <p className="mt-0.5 text-[11px] font-bold text-[#9ca3af]">试试改个关键词</p>
                                </div>
                            ) : (
                                filteredVoiceGroups.map((group) => (
                                    <section key={group.title} className="space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-[#d97706]">{group.title}</p>
                                                <p className="mt-0.5 text-[10px] font-bold text-[#9ca3af]">{group.subtitle}</p>
                                            </div>
                                            <span className="inline-flex h-5 items-center rounded-full border-2 border-[#fbbf24] bg-[#fffbeb] px-2 text-[10px] font-black text-[#d97706]">
                                                {group.voices.length} 个
                                            </span>
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {group.voices.map((option) => {
                                                const selected = option.voice === selectedVoice;
                                                return (
                                                    <article
                                                        key={option.voice}
                                                        data-voice-card={option.voice}
                                                        className={`rounded-[1rem] border-3 p-2.5 transition ${
                                                            selected
                                                                ? "border-[#a5b4fc] bg-[#eef2ff] shadow-[0_4px_0_0_#a5b4fc]"
                                                                : "border-[#e5e7eb] bg-white shadow-[0_3px_0_0_#e5e7eb] hover:border-[#c4b5fd]"
                                                        }`}
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <span className={`mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full border-2 ${selected ? "border-[#6366f1] bg-[#6366f1]" : "border-[#d1d5db] bg-white"}`} />
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-xs font-black text-[#1f2937]">{option.label}</p>
                                                                <p className="truncate text-[10px] font-bold text-[#9ca3af]">{option.voice}</p>
                                                                <p className="mt-0.5 text-[10px] font-bold leading-4 text-[#6b7280]">{option.description}</p>
                                                            </div>
                                                        </div>
                                                        <div className="mt-2 flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                aria-label={`试听 ${option.label}`}
                                                                onClick={() => void handlePreviewVoice(option.voice)}
                                                                disabled={ttsVoiceBusy || previewVoice !== null}
                                                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[#e5e7eb] bg-white text-[#6b7280] shadow-[0_2px_0_0_#e5e7eb] transition active:shadow-none active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                                                            >
                                                                {previewVoice === option.voice ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                aria-label={`${selected ? "当前" : "选择"} ${option.label}`}
                                                                onClick={() => void handleSelectVoice(option.voice)}
                                                                disabled={ttsVoiceBusy}
                                                                className={`inline-flex h-7 flex-1 items-center justify-center rounded-full px-3 text-[10px] font-black transition disabled:cursor-not-allowed disabled:opacity-70 ${
                                                                    selected
                                                                        ? "border-2 border-[#a5b4fc] bg-[#eef2ff] text-[#4f46e5]"
                                                                        : "border-2 border-[#e5e7eb] bg-white text-[#374151] shadow-[0_2px_0_0_#e5e7eb] active:shadow-none active:translate-y-0.5"
                                                                }`}
                                                            >
                                                                {selected ? (
                                                                    <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" />当前</span>
                                                                ) : (
                                                                    "选择"
                                                                )}
                                                            </button>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    </section>
                                ))
                            )}
                        </div>
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
        learningPreferences: normalizeLearningPreferences(profile?.learning_preferences),
        syncLabel: formatSyncLabel(phase),
        syncDescription: formatSyncDescription(
            typeof syncMeta?.value === "number" ? syncMeta.value : null,
            phase === "error" ? error : null,
        ),
    }), [email, error, phase, profile?.avatar_preset, profile?.learning_preferences, profile?.username, syncMeta?.value]);

    return (
        <UserAvatarMenu
            userId={sessionUser?.id}
            email={email}
            displayName={summary.displayName}
            avatarPreset={summary.avatarPreset}
            learningPreferences={summary.learningPreferences}
            syncLabel={summary.syncLabel}
            syncDescription={summary.syncDescription}
            unreadCount={unreadCount}
            placement={placement}
        />
    );
}
