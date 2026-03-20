"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";

interface AdminUserRow {
    user_id: string;
    username: string | null;
    email: string | null;
    coins: number | null;
    translation_elo: number | null;
    listening_elo: number | null;
    updated_at: string | null;
    created_at: string | null;
}

interface AdminDashboardProps {
    adminEmail: string;
}

function formatDate(value: string | null) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
}

export function AdminDashboard({ adminEmail }: AdminDashboardProps) {
    const [users, setUsers] = useState<AdminUserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [coinInputs, setCoinInputs] = useState<Record<string, string>>({});
    const [rewardCoinsInputs, setRewardCoinsInputs] = useState<Record<string, string>>({});
    const [rewardItemsInputs, setRewardItemsInputs] = useState<Record<string, string>>({});
    const [itemKeyInputs, setItemKeyInputs] = useState<Record<string, string>>({});
    const [itemAmountInputs, setItemAmountInputs] = useState<Record<string, string>>({});
    const [eloInputs, setEloInputs] = useState<Record<string, { translation: string; listening: string }>>({});
    const [messageTitles, setMessageTitles] = useState<Record<string, string>>({});
    const [messageContents, setMessageContents] = useState<Record<string, string>>({});
    const [busyByUser, setBusyByUser] = useState<Record<string, boolean>>({});

    const totalUsers = users.length;
    const totalCoins = useMemo(() => users.reduce((sum, user) => sum + (user.coins ?? 0), 0), [users]);

    const loadUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/admin/users", { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || "Failed to load users.");
            }
            const nextUsers = payload.users || [];
            setUsers(nextUsers);
            setEloInputs((prev) => {
                const next = { ...prev };
                for (const user of nextUsers as AdminUserRow[]) {
                    next[user.user_id] = {
                        translation: String(user.translation_elo ?? 400),
                        listening: String(user.listening_elo ?? 400),
                    };
                }
                return next;
            });
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Failed to load users.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadUsers();
    }, []);

    useEffect(() => {
        const supabase = createBrowserClientSingleton();
        const channel = supabase
            .channel("admin-profiles-realtime")
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
                const row = payload.new as {
                    user_id?: string;
                    coins?: number | null;
                    translation_elo?: number | null;
                    listening_elo?: number | null;
                    updated_at?: string | null;
                };
                const userId = row.user_id;
                if (!userId) return;
                updateUserRow(userId, {
                    coins: row.coins ?? 0,
                    translation_elo: row.translation_elo ?? 400,
                    listening_elo: row.listening_elo ?? 400,
                    updated_at: row.updated_at ?? new Date().toISOString(),
                });
                setEloInputs((prev) => ({
                    ...prev,
                    [userId]: {
                        translation: String(row.translation_elo ?? 400),
                        listening: String(row.listening_elo ?? 400),
                    },
                }));
            })
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, []);

    const updateUserRow = (userId: string, patch: Partial<AdminUserRow>) => {
        setUsers((prev) => prev.map((user) => (user.user_id === userId ? { ...user, ...patch } : user)));
    };

    const runUserAction = async (userId: string, action: () => Promise<void>) => {
        setBusyByUser((prev) => ({ ...prev, [userId]: true }));
        try {
            await action();
        } finally {
            setBusyByUser((prev) => ({ ...prev, [userId]: false }));
        }
    };

    const handleGrantCoins = async (userId: string) => {
        const amount = Number(coinInputs[userId] ?? "0");
        if (!Number.isFinite(amount) || amount === 0) {
            alert("请输入有效的金币变动数量（可正可负，但不能为 0）。");
            return;
        }

        await runUserAction(userId, async () => {
            const response = await fetch("/api/admin/grant-coins", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, amount }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || "Grant coins failed.");
            }
            setCoinInputs((prev) => ({ ...prev, [userId]: "" }));
            alert(`奖励邮件已发送：${payload.message?.title ?? "系统奖励"}`);
        }).catch((grantError) => {
            alert(grantError instanceof Error ? grantError.message : "Grant coins failed.");
        });
    };

    const handleSendMessage = async (userId: string) => {
        const title = (messageTitles[userId] ?? "").trim();
        const content = (messageContents[userId] ?? "").trim();
        const rewardCoins = Number(rewardCoinsInputs[userId] ?? "0");
        const rewardInventoryRaw = (rewardItemsInputs[userId] ?? "").trim();
        if (!title || !content) {
            alert("标题和内容都不能为空。");
            return;
        }

        let rewardInventory: Record<string, number> = {};
        if (rewardInventoryRaw) {
            try {
                const parsed = JSON.parse(rewardInventoryRaw) as Record<string, unknown>;
                rewardInventory = Object.fromEntries(
                    Object.entries(parsed)
                        .map(([key, value]) => [key, Number(value)])
                        .filter(([, value]) => Number.isFinite(value) && value !== 0),
                );
            } catch {
                alert("道具奖励 JSON 格式不正确，例如 {\"capsule\":2,\"hint_ticket\":1}");
                return;
            }
        }

        await runUserAction(userId, async () => {
            const response = await fetch("/api/admin/send-message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, title, content, rewardCoins, rewardInventory }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || "Send message failed.");
            }
            setMessageTitles((prev) => ({ ...prev, [userId]: "" }));
            setMessageContents((prev) => ({ ...prev, [userId]: "" }));
            setRewardCoinsInputs((prev) => ({ ...prev, [userId]: "" }));
            setRewardItemsInputs((prev) => ({ ...prev, [userId]: "" }));
            alert(`消息已发送：${payload.message?.title ?? title}`);
        }).catch((messageError) => {
            alert(messageError instanceof Error ? messageError.message : "Send message failed.");
        });
    };

    const handleUpdateElo = async (userId: string) => {
        const input = eloInputs[userId];
        if (!input) {
            alert("ELO 输入无效。");
            return;
        }
        const translationElo = Number(input.translation);
        const listeningElo = Number(input.listening);
        if (!Number.isFinite(translationElo) || !Number.isFinite(listeningElo)) {
            alert("ELO 必须是数字。");
            return;
        }

        await runUserAction(userId, async () => {
            const response = await fetch("/api/admin/update-elo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, translationElo, listeningElo }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || "Update ELO failed.");
            }
            updateUserRow(userId, {
                translation_elo: payload.profile?.translation_elo ?? translationElo,
                listening_elo: payload.profile?.listening_elo ?? listeningElo,
                updated_at: payload.profile?.updated_at ?? new Date().toISOString(),
            });
        }).catch((eloError) => {
            alert(eloError instanceof Error ? eloError.message : "Update ELO failed.");
        });
    };

    const handleGrantItems = async (userId: string) => {
        const itemKey = (itemKeyInputs[userId] ?? "capsule").trim();
        const amount = Number(itemAmountInputs[userId] ?? "0");
        if (!Number.isFinite(amount) || amount === 0) {
            alert("请输入有效道具数量（可正可负，但不能为 0）。");
            return;
        }

        await runUserAction(userId, async () => {
            const response = await fetch("/api/admin/grant-items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, itemKey, amount }),
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || "Grant items failed.");
            }
            setItemAmountInputs((prev) => ({ ...prev, [userId]: "" }));
            alert(`道具奖励邮件已发送：${payload.message?.title ?? "系统道具奖励"}`);
        }).catch((itemError) => {
            alert(itemError instanceof Error ? itemError.message : "Grant items failed.");
        });
    };

    return (
        <main className="min-h-screen bg-[#0f1117] px-4 py-6 text-[#f3f4f6] sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1400px] space-y-5">
                <section className="rounded-3xl border border-white/12 bg-white/6 p-5 backdrop-blur-xl">
                    <p className="text-xs uppercase tracking-[0.25em] text-[#9ca3af]">Admin Console</p>
                    <h1 className="mt-3 text-3xl font-semibold">后台管理系统</h1>
                    <p className="mt-2 text-sm text-[#cbd5e1]">管理员：{adminEmail}</p>
                    <div className="mt-4 flex flex-wrap gap-3 text-sm">
                        <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">用户数 {totalUsers}</span>
                        <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">金币总量 {totalCoins}</span>
                        <button
                            type="button"
                            onClick={() => void loadUsers()}
                            className="rounded-full border border-[#93c5fd]/40 bg-[#1d4ed8]/25 px-3 py-1 text-[#dbeafe]"
                        >
                            刷新用户
                        </button>
                    </div>
                </section>

                <section className="rounded-3xl border border-white/12 bg-white/6 p-4 backdrop-blur-xl">
                    {loading ? (
                        <p className="text-sm text-[#cbd5e1]">正在加载用户...</p>
                    ) : error ? (
                        <p className="text-sm text-rose-300">{error}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-[1600px] w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-white/10 text-[#9ca3af]">
                                        <th className="px-3 py-3">用户</th>
                                        <th className="px-3 py-3">邮箱</th>
                                        <th className="px-3 py-3">User ID</th>
                                        <th className="px-3 py-3">金币</th>
                                        <th className="px-3 py-3">ELO</th>
                                        <th className="px-3 py-3">更新时间</th>
                                        <th className="px-3 py-3">发金币</th>
                                        <th className="px-3 py-3">发道具</th>
                                        <th className="px-3 py-3">改 ELO</th>
                                        <th className="px-3 py-3">发消息</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => {
                                        const busy = Boolean(busyByUser[user.user_id]);
                                        return (
                                            <tr key={user.user_id} className="border-b border-white/5 align-top">
                                                <td className="px-3 py-3 text-[#f8fafc]">{user.username || "未设置昵称"}</td>
                                                <td className="px-3 py-3 text-[#dbe2ef]">{user.email || "-"}</td>
                                                <td className="px-3 py-3 font-mono text-xs text-[#cbd5e1]">{user.user_id}</td>
                                                <td className="px-3 py-3 font-semibold text-amber-300">{user.coins ?? 0}</td>
                                                <td className="px-3 py-3 text-[#e2e8f0]">
                                                    <div className="space-y-1 text-xs">
                                                        <p>翻译 {user.translation_elo ?? 400}</p>
                                                        <p>听力 {user.listening_elo ?? 400}</p>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-[#cbd5e1]">{formatDate(user.updated_at)}</td>
                                                <td className="px-3 py-3">
                                                    <div className="flex gap-2">
                                                        <input
                                                            value={coinInputs[user.user_id] ?? ""}
                                                            onChange={(event) => setCoinInputs((prev) => ({
                                                                ...prev,
                                                                [user.user_id]: event.target.value,
                                                            }))}
                                                            placeholder="+100 / -50"
                                                            className="w-28 rounded-xl border border-white/12 bg-[#0f1117] px-3 py-2 text-sm outline-none"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => void handleGrantCoins(user.user_id)}
                                                            className="rounded-xl border border-amber-300/40 bg-amber-300/12 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-50"
                                                        >
                                                            发奖励邮件
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={itemKeyInputs[user.user_id] ?? "capsule"}
                                                            onChange={(event) => setItemKeyInputs((prev) => ({
                                                                ...prev,
                                                                [user.user_id]: event.target.value,
                                                            }))}
                                                            className="w-28 rounded-xl border border-white/12 bg-[#0f1117] px-2 py-2 text-xs outline-none"
                                                        >
                                                            <option value="capsule">胶囊</option>
                                                            <option value="hint_ticket">提示券</option>
                                                            <option value="vocab_ticket">词汇券</option>
                                                            <option value="audio_ticket">听力券</option>
                                                            <option value="refresh_ticket">刷新券</option>
                                                        </select>
                                                        <input
                                                            value={itemAmountInputs[user.user_id] ?? ""}
                                                            onChange={(event) => setItemAmountInputs((prev) => ({
                                                                ...prev,
                                                                [user.user_id]: event.target.value,
                                                            }))}
                                                            placeholder="+1 / -1"
                                                            className="w-24 rounded-xl border border-white/12 bg-[#0f1117] px-2 py-2 text-xs outline-none"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => void handleGrantItems(user.user_id)}
                                                            className="rounded-xl border border-violet-300/40 bg-violet-300/12 px-3 py-2 text-xs font-semibold text-violet-200 disabled:opacity-50"
                                                        >
                                                            发道具邮件
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="flex gap-2">
                                                        <input
                                                            value={eloInputs[user.user_id]?.translation ?? ""}
                                                            onChange={(event) => setEloInputs((prev) => ({
                                                                ...prev,
                                                                [user.user_id]: {
                                                                    translation: event.target.value,
                                                                    listening: prev[user.user_id]?.listening ?? String(user.listening_elo ?? 400),
                                                                },
                                                            }))}
                                                            placeholder="翻译 ELO"
                                                            className="w-24 rounded-xl border border-white/12 bg-[#0f1117] px-2 py-2 text-xs outline-none"
                                                        />
                                                        <input
                                                            value={eloInputs[user.user_id]?.listening ?? ""}
                                                            onChange={(event) => setEloInputs((prev) => ({
                                                                ...prev,
                                                                [user.user_id]: {
                                                                    translation: prev[user.user_id]?.translation ?? String(user.translation_elo ?? 400),
                                                                    listening: event.target.value,
                                                                },
                                                            }))}
                                                            placeholder="听力 ELO"
                                                            className="w-24 rounded-xl border border-white/12 bg-[#0f1117] px-2 py-2 text-xs outline-none"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => void handleUpdateElo(user.user_id)}
                                                            className="rounded-xl border border-fuchsia-300/40 bg-fuchsia-300/12 px-3 py-2 text-xs font-semibold text-fuchsia-200 disabled:opacity-50"
                                                        >
                                                            保存
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="space-y-2">
                                                        <input
                                                            value={messageTitles[user.user_id] ?? ""}
                                                            onChange={(event) => setMessageTitles((prev) => ({
                                                                ...prev,
                                                                [user.user_id]: event.target.value,
                                                            }))}
                                                            placeholder="消息标题"
                                                            className="w-full rounded-xl border border-white/12 bg-[#0f1117] px-3 py-2 text-sm outline-none"
                                                        />
                                                        <textarea
                                                            value={messageContents[user.user_id] ?? ""}
                                                            onChange={(event) => setMessageContents((prev) => ({
                                                                ...prev,
                                                                [user.user_id]: event.target.value,
                                                            }))}
                                                            rows={2}
                                                            placeholder="消息内容"
                                                            className="w-full rounded-xl border border-white/12 bg-[#0f1117] px-3 py-2 text-sm outline-none"
                                                        />
                                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                            <input
                                                                value={rewardCoinsInputs[user.user_id] ?? ""}
                                                                onChange={(event) => setRewardCoinsInputs((prev) => ({
                                                                    ...prev,
                                                                    [user.user_id]: event.target.value,
                                                                }))}
                                                                placeholder="奖励金币（可选）"
                                                                className="w-full rounded-xl border border-white/12 bg-[#0f1117] px-3 py-2 text-sm outline-none"
                                                            />
                                                            <input
                                                                value={rewardItemsInputs[user.user_id] ?? ""}
                                                                onChange={(event) => setRewardItemsInputs((prev) => ({
                                                                    ...prev,
                                                                    [user.user_id]: event.target.value,
                                                                }))}
                                                                placeholder='道具JSON（可选）{"capsule":2}'
                                                                className="w-full rounded-xl border border-white/12 bg-[#0f1117] px-3 py-2 text-sm outline-none"
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => void handleSendMessage(user.user_id)}
                                                            className="rounded-xl border border-sky-300/40 bg-sky-300/12 px-3 py-2 text-xs font-semibold text-sky-200 disabled:opacity-50"
                                                        >
                                                            发送邮箱（可带奖励）
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
