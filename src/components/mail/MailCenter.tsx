"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, Gift, Inbox } from "lucide-react";
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
    if ((message.reward_coins ?? 0) > 0) {
        parts.push(`金币 +${message.reward_coins}`);
    }
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
        if (value > 0) {
            parts.push(`${label} +${value}`);
        }
    }
    return parts;
}

export function MailCenter() {
    const sessionUser = useAuthSessionUser();
    const [messages, setMessages] = useState<MailMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const unreadCount = useMemo(() => messages.filter((item) => !item.is_read).length, [messages]);

    const loadMessages = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/mail/messages", { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || "Failed to load mailbox.");
            }
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
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "user_messages", filter: `user_id=eq.${sessionUser.id}` },
                () => {
                    void loadMessages();
                },
            )
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
            window.alert("奖励已领取。");
        } catch (claimError) {
            window.alert(claimError instanceof Error ? claimError.message : "Claim reward failed.");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <main className="min-h-screen bg-[#0e1016] px-4 py-6 text-[#f3f4f6] sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl space-y-5">
                <section className="rounded-3xl border border-white/12 bg-white/6 p-5 backdrop-blur-xl">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.26em] text-[#9ca3af]">Mailbox</p>
                            <h1 className="mt-2 text-3xl font-semibold">邮箱</h1>
                            <p className="mt-1 text-sm text-[#cbd5e1]">未读 {unreadCount} 封</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadMessages()}
                            className="rounded-full border border-sky-300/40 bg-sky-300/12 px-3 py-1.5 text-xs font-semibold text-sky-200"
                        >
                            刷新
                        </button>
                    </div>
                </section>

                <section className="rounded-3xl border border-white/12 bg-white/6 p-4 backdrop-blur-xl">
                    {loading ? <p className="text-sm text-[#cbd5e1]">正在加载邮箱...</p> : null}
                    {error ? <p className="text-sm text-rose-300">{error}</p> : null}
                    {!loading && !error && messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-12 text-[#9ca3af]">
                            <Inbox className="h-10 w-10" />
                            <p className="text-sm">还没有消息</p>
                        </div>
                    ) : null}
                    {!loading && !error ? (
                        <div className="space-y-3">
                            {messages.map((message) => {
                                const rewards = formatReward(message);
                                const claimable = rewards.length > 0;
                                const claimed = Boolean(message.claimed_at);
                                return (
                                    <article
                                        key={message.id}
                                        className={`rounded-2xl border p-4 ${message.is_read ? "border-white/10 bg-white/4" : "border-fuchsia-300/45 bg-fuchsia-300/10"}`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-base font-semibold">{message.title}</p>
                                                <p className="mt-1 whitespace-pre-wrap text-sm text-[#d7dce6]">{message.content}</p>
                                                <p className="mt-2 text-xs text-[#9ca3af]">{new Date(message.created_at).toLocaleString()}</p>
                                            </div>
                                            {!message.is_read ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-1 text-xs text-rose-200">
                                                    <Bell className="h-3 w-3" />
                                                    未读
                                                </span>
                                            ) : null}
                                        </div>

                                        {rewards.length > 0 ? (
                                            <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                                                <div className="flex items-center gap-2 font-semibold">
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
                                                    className="rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-xs font-semibold text-[#e5e7eb] disabled:opacity-50"
                                                >
                                                    标记已读
                                                </button>
                                            ) : null}
                                            {claimable ? (
                                                <button
                                                    type="button"
                                                    disabled={busyId === message.id || claimed}
                                                    onClick={() => void claimReward(message.id)}
                                                    className="rounded-xl border border-emerald-300/40 bg-emerald-300/14 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50"
                                                >
                                                    {claimed ? "已领取" : "领取奖励"}
                                                </button>
                                            ) : (
                                                message.is_read ? (
                                                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        已读
                                                    </span>
                                                ) : null
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : null}
                </section>
            </div>
        </main>
    );
}

