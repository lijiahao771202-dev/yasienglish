"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, CloudUpload, Image as ImageIcon, Loader2, LogOut, Mail, Play, RefreshCw, Search, Settings2, Volume2, X } from "lucide-react";

import { PresetAvatar } from "@/components/profile/PresetAvatar";
import { db } from "@/lib/db";
import { getUserFacingSyncError, saveProfilePatch, syncNow } from "@/lib/user-repository";
import {
    DEFAULT_AVATAR_PRESET,
    DEFAULT_PROFILE_USERNAME,
    RANDOM_ENGLISH_TTS_VOICE,
    TTS_VOICE_OPTIONS,
    normalizeLearningPreferences,
    normalizeLearningPreferenceTtsVoice,
    type LearningPreferenceTtsVoice,
    type LearningPreferences,
    type TtsVoice,
    type TtsVoiceOption,
} from "@/lib/profile-settings";
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
        subtitle: "适合英语跟读、慢速讲解和多口音训练。",
        voices: TTS_VOICE_OPTIONS.filter((option) => option.voice.startsWith("en-")),
    },
];

const RANDOM_ENGLISH_VOICE_OPTION = {
    voice: RANDOM_ENGLISH_TTS_VOICE,
    label: "随机英文",
    description: "每次生成音频都随机选择一个英文发言人，自动排除中文和 en-IN 发言人。",
} as const;

type VoicePickerOption = TtsVoiceOption | typeof RANDOM_ENGLISH_VOICE_OPTION;

function getVoiceOption(voice: TtsVoice) {
    return TTS_VOICE_OPTIONS.find((option) => option.voice === voice);
}

function getVoicePickerOption(voice: LearningPreferenceTtsVoice): VoicePickerOption {
    if (voice === RANDOM_ENGLISH_TTS_VOICE) {
        return RANDOM_ENGLISH_VOICE_OPTION;
    }

    return getVoiceOption(voice) ?? TTS_VOICE_OPTIONS[0];
}

type VoiceFilter = "all" | "zh-CN-" | "en-";

const VOICE_FILTER_OPTIONS: Array<{ value: VoiceFilter; label: string }> = [
    { value: "all", label: "全部" },
    { value: "en-", label: "英文" },
    { value: "zh-CN-", label: "中文" },
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
    const [previewVoice, setPreviewVoice] = useState<LearningPreferenceTtsVoice | null>(null);
    const [voiceFilter, setVoiceFilter] = useState<VoiceFilter>("all");
    const [voiceSearch, setVoiceSearch] = useState("");
    const [selectedVoice, setSelectedVoice] = useState<LearningPreferenceTtsVoice>(normalizeLearningPreferenceTtsVoice(learningPreferences.tts_voice));
    const containerRef = useRef<HTMLDivElement | null>(null);
    const voiceModalRef = useRef<HTMLDivElement | null>(null);
    const voiceListRef = useRef<HTMLDivElement | null>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const router = useRouter();
    const isSidebar = placement === "sidebar";
    const isHeader = placement === "header";
    const selectedVoiceOption = useMemo(() => getVoicePickerOption(selectedVoice), [selectedVoice]);
    const normalizedVoiceSearch = voiceSearch.trim().toLowerCase();
    const filteredVoiceGroups = useMemo(() => (
        TTS_VOICE_GROUPS
            .map((group) => ({
                ...group,
                voices: [
                    ...(group.title === "英文发言人" ? [RANDOM_ENGLISH_VOICE_OPTION] : []),
                    ...group.voices,
                ].filter((option) => {
                    const matchesFilter = voiceFilter === "all"
                        || option.voice.startsWith(voiceFilter)
                        || (voiceFilter === "en-" && option.voice === RANDOM_ENGLISH_TTS_VOICE);
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
            if (
                !containerRef.current?.contains(event.target as Node) &&
                !voiceModalRef.current?.contains(event.target as Node)
            ) {
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
        setSelectedVoice(normalizeLearningPreferenceTtsVoice(learningPreferences.tts_voice));
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

    const handleSelectVoice = async (nextVoice: LearningPreferenceTtsVoice) => {
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

    const handlePreviewVoice = async (voice: LearningPreferenceTtsVoice) => {
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
            <motion.button
                type="button"
                whileTap={{ scale: 0.93 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                aria-label="Open profile menu"
                onClick={() => setOpen((current) => !current)}
                className={isSidebar
                    ? "relative flex w-full cursor-pointer items-center gap-3 rounded-[1.65rem] border-[3px] border-theme-border bg-theme-base-bg px-3 py-3 shadow-[0_4px_0_0_var(--theme-shadow)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_var(--theme-shadow)] transition-all"
                    : isHeader
                        ? "relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-[3px] border-theme-border bg-theme-base-bg shadow-[0_4px_0_0_var(--theme-shadow)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_var(--theme-shadow)] transition-all"
                        : "relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-[3px] border-theme-border bg-theme-base-bg shadow-[0_4px_0_0_var(--theme-shadow)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_var(--theme-shadow)] transition-all"}
            >
                <PresetAvatar presetId={avatarPreset} size={isSidebar ? 52 : 44} />
                {unreadCount > 0 ? (
                    <span className="absolute right-2 top-2 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(255,255,255,0.85)]" />
                ) : null}
                {isSidebar ? (
                    <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-bold text-theme-text">{displayName}</p>
                        <p className="mt-0.5 truncate text-[0.68rem] font-bold uppercase tracking-[0.22em] text-theme-text-muted">
                            Account center
                        </p>
                    </div>
                ) : null}
            </motion.button>

            <AnimatePresence>
                {open ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: isSidebar ? 15 : -15, filter: "blur(4px)" }}
                        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, scale: 0.95, y: isSidebar ? 10 : -10, filter: "blur(2px)" }}
                        transition={{ type: "spring", stiffness: 450, damping: 25 }}
                        className={isSidebar
                            ? "absolute bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] overflow-y-auto rounded-[1.2rem] border-[3px] border-theme-border bg-theme-base-bg p-2 shadow-[0_6px_0_0_var(--theme-shadow)]"
                            : "absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] overflow-y-auto rounded-[1.2rem] border-[3px] border-theme-border bg-theme-base-bg p-2 shadow-[0_6px_0_0_var(--theme-shadow)]"}
                    >
                    {/* Profile Header */}
                    <div className="rounded-[1rem] p-2 flex items-center gap-3">
                        <div className="flex-shrink-0"><PresetAvatar presetId={avatarPreset} size={36} /></div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-theme-text">{displayName}</p>
                            <p className="truncate text-xs font-semibold text-theme-text-muted">{email}</p>
                        </div>
                    </div>

                    {/* Sync status */}
                    <div className={`mt-2 rounded-[0.8rem] border-2 px-3 py-2.5 ${
                        syncLabel === "Synced"
                            ? "border-theme-border bg-emerald-50 text-emerald-800"
                            : syncLabel === "Sync failed"
                                ? "border-theme-border bg-rose-50 text-rose-800"
                                : "border-theme-border bg-indigo-50 text-indigo-800"
                    }`}>
                        <div className="flex items-center gap-2 text-xs font-bold">
                            <RefreshCw className={`h-3.5 w-3.5 ${manualSyncing ? "animate-spin" : ""}`} />
                            {syncLabel}
                        </div>
                        <p className="mt-1 text-xs font-medium opacity-80">{syncDescription}</p>
                    </div>

                    {/* Action grid */}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={async () => { setManualSyncing(true); try { await syncNow(); } catch (error) { window.alert(getUserFacingSyncError(error)); } finally { setManualSyncing(false); } }}
                            className="col-span-2 flex w-full cursor-pointer items-center justify-between rounded-[0.8rem] px-3 py-2 text-sm font-bold text-theme-text hover:bg-theme-card-bg border-2 border-transparent hover:border-theme-border transition-colors"
                        >
                            <span className="flex items-center gap-2.5"><CloudUpload className="h-4 w-4" />{manualSyncing ? "同步中…" : "立即同步云端档案"}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMailboxOpen(true); setOpen(false); }}
                            className="flex cursor-pointer items-center gap-2.5 rounded-[0.8rem] px-3 py-2 text-sm font-bold text-theme-text hover:bg-theme-card-bg border-2 border-transparent hover:border-theme-border transition-colors"
                        >
                            <Mail className="h-4 w-4" />消息
                            {unreadCount > 0 && <span className="ml-auto inline-flex items-center justify-center rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-600">{unreadCount}</span>}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setBackgroundOpen(true); setOpen(false); }}
                            className="flex cursor-pointer items-center gap-2.5 rounded-[0.8rem] px-3 py-2 text-sm font-bold text-theme-text hover:bg-theme-card-bg border-2 border-transparent hover:border-theme-border transition-colors text-left"
                        >
                            <ImageIcon className="h-4 w-4" />主题
                        </button>
                    </div>

                    <div className="my-2 h-[3px] bg-theme-border rounded-full" />
                    
                    <button
                        type="button"
                        onClick={() => { setMailboxOpen(false); setBackgroundOpen(false); setTtsVoiceOpen((c) => { const n = !c; if (n) { setVoiceFilter("all"); setVoiceSearch(""); } return n; }); }}
                        className="flex w-full cursor-pointer items-center justify-between rounded-[0.8rem] px-3 py-2 text-sm font-bold text-theme-text hover:bg-theme-card-bg border-2 border-transparent hover:border-theme-border transition-colors"
                    >
                        <span className="flex items-center gap-2.5"><Volume2 className="h-4 w-4" />专属发言人</span>
                        <span className="flex items-center gap-0.5 text-xs text-theme-text bg-theme-card-bg px-2 py-0.5 rounded-[0.4rem] border-2 border-theme-border">{selectedVoiceOption.label}<ChevronRight className="h-3 w-3" /></span>
                    </button>
                    
                    <div className="mt-2 space-y-2">
                        <Link href="/profile" prefetch={false} className="flex cursor-pointer items-center justify-between rounded-[0.8rem] px-3 py-2 text-sm font-bold text-theme-text hover:bg-theme-card-bg border-2 border-transparent hover:border-theme-border transition-colors">
                            <span className="flex items-center gap-2.5"><Settings2 className="h-4 w-4" />个人资料</span>
                        </Link>
                        <button
                            type="button"
                            onClick={async () => { setLogoutBusy(true); try { const supabase = createBrowserClientSingleton(); await supabase.auth.signOut(); await fetch("/logout", { method: "POST" }).catch(() => undefined); } finally { setLogoutBusy(false); router.replace("/login"); } }}
                            className="flex w-full cursor-pointer items-center justify-between rounded-[0.8rem] px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 border-2 border-transparent hover:border-rose-200 transition-colors"
                        >
                            <span className="flex items-center gap-2.5"><LogOut className="h-4 w-4" />{logoutBusy ? "退出中…" : "断开连接"}</span>
                        </button>
                    </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
            {typeof window !== "undefined" && createPortal(
                <AnimatePresence>
                    {ttsVoiceOpen && (
                        <motion.div
                            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                            animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
                            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                            role="dialog"
                            aria-modal="true"
                            aria-label="发言人选择"
                            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/30 p-4 sm:p-8 overflow-hidden"
                            onClick={() => setTtsVoiceOpen(false)}
                        >
                        <motion.div
                            ref={voiceModalRef}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: "spring", stiffness: 350, damping: 25 }}
                            className="relative flex w-full max-w-3xl max-h-[85vh] flex-col overflow-hidden rounded-[2rem] border-[3px] border-theme-border bg-theme-base-bg shadow-[0_12px_0_0_var(--theme-shadow)]"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => setTtsVoiceOpen(false)}
                                className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-theme-border bg-theme-active-bg text-theme-text shadow-[0_4px_0_0_var(--theme-shadow)] transition-transform hover:-translate-y-0.5"
                                aria-label="Close voice picker"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <div className="border-b-[3px] border-theme-border px-6 pb-5 pt-6 bg-theme-card-bg shrink-0">
                                <h2 className="pr-12 font-welcome-display text-2xl tracking-tight text-theme-text">发言人列表</h2>
                                <p className="mt-1 pr-12 text-sm font-bold text-theme-text-muted">选择一个声音，作为全局 AI 语音合成的默认发言人。</p>
                                
                                <div className="mt-4 flex flex-col gap-3 rounded-2xl border-[3px] border-theme-border bg-theme-base-bg p-3 sm:flex-row sm:items-center sm:justify-between shadow-[0_4px_0_0_var(--theme-shadow)]">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-theme-text">
                                            <span className="text-theme-text-muted mr-2 font-bold">当前：</span>
                                            {selectedVoiceOption.label}
                                        </p>
                                        <p className="mt-0.5 truncate text-xs font-bold text-theme-text-muted">
                                            {selectedVoice === RANDOM_ENGLISH_TTS_VOICE ? "English only · excludes en-IN" : selectedVoiceOption.voice}
                                        </p>
                                    </div>
                                    <motion.button
                                        whileTap={{ scale: 0.95 }}
                                        type="button"
                                        onClick={() => void handlePreviewVoice(selectedVoice)}
                                        disabled={ttsVoiceBusy || previewVoice !== null}
                                        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[0.8rem] border-[3px] border-theme-border bg-theme-primary-bg px-4 text-xs font-black text-theme-primary-text shadow-[0_2px_0_0_var(--theme-shadow)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {previewVoice === selectedVoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                        当前试听
                                    </motion.button>
                                </div>
                                
                                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {VOICE_FILTER_OPTIONS.map((option) => (
                                            <motion.button
                                                whileTap={{ scale: 0.95 }}
                                                key={option.value}
                                                type="button"
                                                onClick={() => setVoiceFilter(option.value)}
                                                className={`inline-flex h-9 items-center justify-center rounded-[0.8rem] border-[3px] border-theme-border px-4 text-xs font-black transition-transform hover:-translate-y-0.5 shadow-[0_2px_0_0_var(--theme-shadow)] ${
                                                    voiceFilter === option.value
                                                        ? "bg-theme-active-bg text-theme-active-text"
                                                        : "bg-theme-card-bg text-theme-text"
                                                }`}
                                            >
                                                {option.label}
                                            </motion.button>
                                        ))}
                                    </div>
                                    <label className="relative flex h-10 items-center w-full sm:w-64 max-w-full">
                                        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-theme-text-muted" />
                                        <input
                                            value={voiceSearch}
                                            onChange={(event) => setVoiceSearch(event.target.value)}
                                            placeholder="搜索发言人..."
                                            className="w-full rounded-[1rem] border-[3px] border-theme-border bg-theme-base-bg py-1.5 pl-9 pr-3 text-sm font-bold text-theme-text shadow-[0_2px_0_0_var(--theme-shadow)] placeholder:text-theme-text-muted focus:outline-none focus:shadow-[0_4px_0_0_var(--theme-shadow)] focus:-translate-y-0.5 transition-transform"
                                        />
                                    </label>
                                </div>
                            </div>
                            <div ref={voiceListRef} className="min-h-0 flex-1 overflow-y-auto w-full bg-theme-base-bg/50">
                                {filteredVoiceGroups.length === 0 ? (
                                    <div className="px-6 py-12 text-center">
                                        <p className="text-sm font-bold text-theme-text">未找到相关发言人</p>
                                        <p className="mt-1 text-xs font-semibold text-theme-text-muted">请尝试其他搜索词</p>
                                    </div>
                                ) : (
                                    <div className="w-full p-6">
                                        <div className="flex flex-col gap-8">
                                            {filteredVoiceGroups.map((group) => (
                                                <div key={group.title} className="flex flex-col gap-3">
                                                    <div className="px-1">
                                                        <span className="inline-flex items-center rounded-full border-[3px] border-theme-border bg-theme-active-bg px-3 py-1 text-xs font-bold tracking-wide text-theme-active-text shadow-[0_2px_0_0_var(--theme-shadow)]">
                                                            {group.title}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {group.voices.map((option) => {
                                                            const selected = option.voice === selectedVoice;
                                                            return (
                                                                <div 
                                                                    key={option.voice} 
                                                                    data-voice-card={option.voice} 
                                                                    className={`flex flex-col justify-between rounded-[1.2rem] border-[3px] border-theme-border p-4 shadow-[0_4px_0_0_var(--theme-shadow)] ${selected ? "bg-theme-active-bg" : "bg-theme-card-bg"}`}
                                                                >
                                                                    <div>
                                                                        <div className="flex items-start justify-between">
                                                                            <span className={`text-[15px] font-bold ${selected ? "text-theme-active-text" : "text-theme-text"}`}>{option.label}</span>
                                                                            <span className="text-[10px] font-semibold text-theme-text-muted">
                                                                                {option.voice === RANDOM_ENGLISH_TTS_VOICE ? "dynamic" : option.voice}
                                                                            </span>
                                                                        </div>
                                                                        <p className="mt-2 text-xs font-medium text-theme-text-muted line-clamp-2">
                                                                            {option.description}
                                                                        </p>
                                                                    </div>
                                                                    <div className="mt-4 flex items-center justify-end gap-2">
                                                                        <motion.button
                                                                            whileTap={{ scale: 0.95 }}
                                                                            type="button"
                                                                            aria-label={`试听 ${option.label}`}
                                                                            onClick={() => void handlePreviewVoice(option.voice)}
                                                                            disabled={ttsVoiceBusy || previewVoice !== null}
                                                                            className="inline-flex h-9 w-9 items-center justify-center rounded-[0.8rem] border-[3px] border-theme-border bg-theme-base-bg text-theme-text shadow-[0_2px_0_0_var(--theme-shadow)] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                                                                        >
                                                                            {previewVoice === option.voice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 ml-0.5" />}
                                                                        </motion.button>
                                                                        <motion.button
                                                                            whileTap={!selected ? { scale: 0.95 } : undefined}
                                                                            type="button"
                                                                            aria-label={`${selected ? "当前" : "选择"} ${option.label}`}
                                                                            onClick={() => void handleSelectVoice(option.voice)}
                                                                            disabled={ttsVoiceBusy || selected}
                                                                            className={`inline-flex h-9 items-center justify-center rounded-[0.8rem] border-[3px] border-theme-border px-4 text-xs font-bold shadow-[0_2px_0_0_var(--theme-shadow)] transition-transform ${
                                                                                selected 
                                                                                    ? "bg-theme-text text-theme-card-bg opacity-100" 
                                                                                    : "bg-theme-card-bg text-theme-text hover:-translate-y-0.5"
                                                                            }`}
                                                                        >
                                                                            {selected ? (
                                                                                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />已选</span>
                                                                            ) : "选择"}
                                                                        </motion.button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
                </AnimatePresence>,
                document.body
            )}


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
            {typeof window !== "undefined" && createPortal(
                <AnimatePresence>
                    {backgroundOpen && (
                        <motion.div
                            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                            animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
                            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                            role="dialog"
                            aria-modal="true"
                            aria-label="全局主题选择"
                            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 sm:p-8 overflow-hidden"
                            onClick={() => setBackgroundOpen(false)}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                                className="relative flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-[2rem] border-4 border-theme-border bg-theme-base-bg shadow-[0_12px_0_0_var(--theme-shadow)]"
                                onClick={(event) => event.stopPropagation()}
                            >
                                <button
                                    type="button"
                                    onClick={() => setBackgroundOpen(false)}
                                    className="absolute right-4 top-4 z-[999] flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-theme-border bg-theme-active-bg text-theme-text shadow-[0_4px_0_0_var(--theme-shadow)] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-[0_2px_0_0_var(--theme-shadow)]"
                                    aria-label="Close background picker"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                                <div className="flex-1 overflow-y-auto">
                                    <BackgroundThemePicker userId={userId} />
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
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
