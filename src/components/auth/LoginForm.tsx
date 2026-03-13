"use client";

import { FormEvent, useMemo, useState } from "react";

import { createBrowserClientSingleton } from "@/lib/supabase/browser";

export function LoginForm() {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
    const [message, setMessage] = useState("");

    const redirectTo = useMemo(() => {
        if (typeof window === "undefined") return "";
        return `${window.location.origin}/auth/callback`;
    }, []);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus("loading");
        setMessage("");

        try {
            const supabase = createBrowserClientSingleton();
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: redirectTo,
                },
            });

            if (error) throw error;

            setStatus("sent");
            setMessage("Magic link 已发送，请去邮箱完成登录。");
        } catch (error) {
            setStatus("error");
            setMessage(error instanceof Error ? error.message : "登录失败，请重试。");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-stone-700">
                    Email
                </label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                    className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-stone-900 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                />
            </div>
            <button
                type="submit"
                disabled={status === "loading" || !email}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-stone-900 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {status === "loading" ? "Sending..." : "Send Magic Link"}
            </button>
            {message ? (
                <p className={`text-sm ${status === "error" ? "text-rose-600" : "text-emerald-600"}`}>
                    {message}
                </p>
            ) : null}
        </form>
    );
}
