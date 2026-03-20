"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, Gift, Inbox, Trash2 } from "lucide-react";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";

interface MailMessage {
    id: string;
    title: string;
    content: string;
    is_read: boolean;
    message_type: string;
    reward_coins: number;
    reward_inventory: Record<string, number> | null;
    claimed_at: string | null;
    created_at: string;
}

function formatReward(message: MailMessage) {
    const parts: string[] = [];
    if ((message.reward_coins ?? 0) > 0) parts.push(`金币 +${message.reward_coins}`);
    const inv = message.reward_inventory ?? {};
    const keys: Array<[string, string]> = [
        ["capsule", "胶囊"],
        ["hint_ticket", "提示券"],
        ["vocab_ticket", "词汇券"],
        ["audio_ticket", "听力券"],
        ["refresh_ticket", "刷新券"],
    ];
    for (const [key, label] of keys) {
        const value = Number(inv[key] ?? 0);
        if (value > 0) parts.push(`${label} +${value}`);
    }
    return parts;
}

export function MailboxPanel() {
    const sessionUser = useAuthSessionUser();
    const [messages, setMessages] = useState<MailMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hint, setHint] = useState<string | null>(null);
    const unreadCount = useMemo(() => messages.filter((item) => !item.is_read).length, [messages]);
    const readCount = useMemo(() => messages.filter((item) => item.is_read).length, [messages]);

    const loadMessages = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/mail/messages", { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Failed to load mailbox.");
            setMessages(payload.messages || []);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Failed to load mailbox.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadMessages();
    }, []);

    useEffect(() => {
        if (!sessionUser?.id) return;
        const supabase = createBrowserClientSingleton();
        const channel = supabase
            .channel(`mailbox-${sessionUser.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "user_messages", filter: `user_id=eq.${sessionUser.id}` }, () => {
                void loadMessages();
            })
            .subscribe();
        return () => {
            void supabase.removeChannel(channel);
        };
    }, [sessionUser?.id]);

    const markRead = async (messageId: string) => {
        setBusyId(messageId);
        try {
            const response = await fetch("/api/mail/mark-read", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messageId }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Mark read failed.");
            setMessages((prev) => prev.map((item) => (item.id === messageId ? { ...item, is_read: true } : item)));
        } catch (markError) {
            window.alert(markError instanceof Error ? markError.message : "Mark read failed.");
        } finally {
            setBusyId(null);
        }
    };

    const claimReward = async (messageId: string) => {
        setBusyId(messageId);
        try {
            const response = await fetch("/api/mail/claim", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messageId }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Claim reward failed.");
            setMessages((prev) =>
                prev.map((item) =>
                    item.id === messageId ? { ...item, claimed_at: payload.reward?.claimed_at ?? new Date().toISOString(), is_read: true } : item,
                ),
            );
            setHint("奖励已领取。");
        } catch (claimError) {
            window.alert(claimError instanceof Error ? claimError.message : "Claim reward failed.");
        } finally {
            setBusyId(null);
        }
    };

    const deleteRead = async (messageId?: string) => {
        if (messageId) {
            setBusyId(messageId);
        } else {
            setBulkDeleting(true);
        }
        try {
            const response = await fetch("/api/mail/delete-read", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(messageId ? { messageId } : {}),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Delete failed.");
            if (messageId) {
                setMessages((prev) => prev.filter((item) => item.id !== messageId));
            } else {
                setMessages((prev) => prev.filter((item) => !item.is_read));
            }
            setHint(`已删除 ${payload.deletedCount ?? 0} 封已读邮件。`);
        } catch (deleteError) {
            window.alert(deleteError instanceof Error ? deleteError.message : "Delete failed.");
        } finally {
            if (messageId) {
                setBusyId(null);
            } else {
                setBulkDeleting(false);
            }
        }
    };

    return (
        <section className="rounded-[1.6rem] border border-[#ebeef5] bg-white p-4 text-[#1f2430] shadow-[0_20px_45px_-32px_rgba(16,24,40,0.35)]">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[#97a0b2]">Mailbox</p>
                    <h2 className="mt-1 text-xl font-semibold">邮箱</h2>
                    <p className="mt-0.5 text-xs text-[#6b7280]">未读 {unreadCount} 封 · 已读 {readCount} 封</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void loadMessages()}
                        className="rounded-full border border-[#d8e0ec] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#425466]"
                    >
                        刷新
                    </button>
                    <button
                        type="button"
                        disabled={bulkDeleting || readCount === 0}
                        onClick={() => void deleteRead()}
                        className="inline-flex items-center gap-1 rounded-full border border-[#f3d8df] bg-[#fff5f7] px-3 py-1.5 text-xs font-semibold text-[#b42340] disabled:opacity-50"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除已读
                    </button>
                </div>
            </div>

            {hint ? <p className="mb-2 text-xs text-[#3b82f6]">{hint}</p> : null}
            {loading ? <p className="text-sm text-[#6b7280]">正在加载邮箱...</p> : null}
            {error ? <p className="text-sm text-rose-500">{error}</p> : null}
            {!loading && !error && messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-[#9ca3af]">
                    <Inbox className="h-10 w-10" />
                    <p className="text-sm">还没有消息</p>
                </div>
            ) : null}
            {!loading && !error ? (
                <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                    {messages.map((message) => {
                        const rewards = formatReward(message);
                        const claimable = rewards.length > 0;
                        const claimed = Boolean(message.claimed_at);
                        return (
                            <article
                                key={message.id}
                                className={`rounded-2xl border p-3 ${message.is_read ? "border-[#ecf0f6] bg-[#f9fbff]" : "border-[#f7d6df] bg-[#fff9fb]"}`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-semibold text-[#111827]">{message.title}</p>
                                        <p className="mt-1 whitespace-pre-wrap text-sm text-[#4b5563]">{message.content}</p>
                                        <p className="mt-2 text-[11px] text-[#9ca3af]">{new Date(message.created_at).toLocaleString()}</p>
                                    </div>
                                    {!message.is_read ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-[#ffe8ee] px-2 py-1 text-[11px] text-[#b42340]">
                                            <Bell className="h-3 w-3" />
                                            未读
                                        </span>
                                    ) : null}
                                </div>

                                {rewards.length > 0 ? (
                                    <div className="mt-3 rounded-xl border border-[#f4e7be] bg-[#fff9e7] p-3 text-sm text-[#8a6a12]">
                                        <div className="flex items-center gap-2 font-semibold text-[#74550a]">
                                            <Gift className="h-4 w-4" />
                                            奖励
                                        </div>
                                        <p className="mt-1">{rewards.join(" · ")}</p>
                                    </div>
                                ) : null}

                                <div className="mt-3 flex gap-2">
                                    {!message.is_read ? (
                                        <button
                                            type="button"
                                            disabled={busyId === message.id}
                                            onClick={() => void markRead(message.id)}
                                            className="rounded-xl border border-[#d7e0ec] bg-white px-3 py-1.5 text-xs font-semibold text-[#445164] disabled:opacity-50"
                                        >
                                            标记已读
                                        </button>
                                    ) : null}
                                    {claimable ? (
                                        <button
                                            type="button"
                                            disabled={busyId === message.id || claimed}
                                            onClick={() => void claimReward(message.id)}
                                            className="rounded-xl border border-[#cbe8d5] bg-[#eefbf3] px-3 py-1.5 text-xs font-semibold text-[#157347] disabled:opacity-50"
                                        >
                                            {claimed ? "已领取" : "领取奖励"}
                                        </button>
                                    ) : (
                                        message.is_read ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-[#16a34a]">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                已读
                                            </span>
                                        ) : null
                                    )}
                                    {message.is_read ? (
                                        <button
                                            type="button"
                                            disabled={busyId === message.id}
                                            onClick={() => void deleteRead(message.id)}
                                            className="inline-flex items-center gap-1 rounded-xl border border-[#f3d8df] bg-[#fff5f7] px-3 py-1.5 text-xs font-semibold text-[#b42340] disabled:opacity-50"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            删除
                                        </button>
                                    ) : null}
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}
