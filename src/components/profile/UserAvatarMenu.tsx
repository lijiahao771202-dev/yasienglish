"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, ChevronRight, CloudUpload, Image as ImageIcon, Loader2, LogOut, Mail, Play, RefreshCw, Settings2, Volume2, X } from "lucide-react";

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
    const [selectedVoice, setSelectedVoice] = useState<TtsVoice>(normalizeTtsVoice(learningPreferences.tts_voice));
    const containerRef = useRef<HTMLDivElement | null>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const router = useRouter();
    const speechModel = useDesktopSpeechModel();
    const isSidebar = placement === "sidebar";
    const isHeader = placement === "header";
    const selectedVoiceOption = useMemo(
        () => getVoiceOption(selectedVoice) ?? TTS_VOICE_OPTIONS[0],
        [selectedVoice],
    );

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
                    <button
                        type="button"
                        onClick={() => {
                            setTtsVoiceOpen((current) => !current);
                            setMailboxOpen(false);
                            setBackgroundOpen(false);
                        }}
                        className="mt-2 flex w-full items-center justify-between rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5 text-left text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    >
                        <span className="flex items-center gap-2">
                            <Volume2 className="h-4 w-4" />
                            发言人
                        </span>
                        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                            {selectedVoiceOption.label}
                            <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                    </button>
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
            {ttsVoiceOpen ? (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="发言人选择"
                    className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/28 px-4 py-6 backdrop-blur-[2px]"
                    onClick={() => setTtsVoiceOpen(false)}
                >
                    <div
                        className="relative w-[min(92vw,32rem)] max-h-[min(84vh,42rem)] overflow-hidden rounded-[1.5rem] border border-white/80 bg-white p-3 shadow-[0_32px_90px_-44px_rgba(15,23,42,0.48)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setTtsVoiceOpen(false)}
                            className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#dfe3ec] bg-white text-[#3f4a5a]"
                            aria-label="Close voice picker"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <div className="pr-10">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">发言人列表</p>
                            <p className="mt-1 text-base font-semibold text-slate-900">选择一个声音</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">切换后，后续合成会跟着这个发言人走。</p>
                            <div className="mt-3 flex items-center justify-between gap-2 rounded-[0.95rem] border border-slate-200 bg-slate-50 px-3 py-2.5">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-800">当前：{selectedVoiceOption.label}</p>
                                    <p className="truncate text-[11px] text-slate-500">{selectedVoiceOption.description}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handlePreviewVoice(selectedVoice)}
                                    disabled={ttsVoiceBusy || previewVoice !== null}
                                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {previewVoice === selectedVoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                    试听当前
                                </button>
                            </div>
                        </div>
                        <div className="mt-3 max-h-[calc(84vh-10rem)] space-y-4 overflow-y-auto pr-0.5">
                            {TTS_VOICE_GROUPS.map((group) => (
                                <section key={group.title} className="space-y-2">
                                    <div className="px-1">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{group.title}</p>
                                        <p className="mt-1 text-[11px] leading-4 text-slate-500">{group.subtitle}</p>
                                    </div>
                                    <div className="overflow-hidden rounded-[1rem] border border-slate-200 bg-white">
                                        <table className="w-full border-collapse text-left">
                                            <thead className="bg-slate-50">
                                                <tr className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                                    <th className="px-3 py-2.5 font-semibold">发言人</th>
                                                    <th className="px-3 py-2.5 font-semibold">说明</th>
                                                    <th className="px-3 py-2.5 text-center font-semibold">试听</th>
                                                    <th className="px-3 py-2.5 text-center font-semibold">选择</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.voices.map((option) => {
                                                    const selected = option.voice === selectedVoice;
                                                    return (
                                                        <tr
                                                            key={option.voice}
                                                            className={`border-t border-slate-100 transition ${
                                                                selected ? "bg-indigo-50/80" : "bg-white hover:bg-slate-50"
                                                            }`}
                                                        >
                                                            <td className="px-3 py-3 align-top">
                                                                <div className="flex items-start gap-2">
                                                                    <span
                                                                        className={`mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full border ${
                                                                            selected ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white"
                                                                        }`}
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <p className="truncate text-sm font-semibold text-slate-900">{option.label}</p>
                                                                        <p className="mt-0.5 text-[11px] text-slate-500">{option.voice}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-3 align-top">
                                                                <p className="text-[11px] leading-5 text-slate-500">{option.description}</p>
                                                            </td>
                                                            <td className="px-3 py-3 align-top text-center">
                                                                <button
                                                                    type="button"
                                                                    aria-label={`试听 ${option.label}`}
                                                                    onClick={() => void handlePreviewVoice(option.voice)}
                                                                    disabled={ttsVoiceBusy || previewVoice !== null}
                                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                                                                >
                                                                    {previewVoice === option.voice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                                                </button>
                                                            </td>
                                                            <td className="px-3 py-3 align-top text-center">
                                                                <button
                                                                    type="button"
                                                                    aria-label={`${selected ? "当前" : "选择"} ${option.label}`}
                                                                    onClick={() => void handleSelectVoice(option.voice)}
                                                                    disabled={ttsVoiceBusy}
                                                                    className={`inline-flex h-9 items-center justify-center rounded-full px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                                                                        selected
                                                                            ? "border border-indigo-300 bg-indigo-100 text-indigo-700"
                                                                            : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
                                                                    }`}
                                                                >
                                                                    {selected ? (
                                                                        <span className="inline-flex items-center gap-1">
                                                                            <Check className="h-3.5 w-3.5" />
                                                                            当前
                                                                        </span>
                                                                    ) : (
                                                                        "选择"
                                                                    )}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            ))}
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
