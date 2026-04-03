"use client";

import { FormEvent, useMemo, useState } from "react";

import { createBrowserClientSingleton } from "@/lib/supabase/browser";

const fieldLabelClassName = "text-[12px] font-black uppercase tracking-[0.16em] text-[#9ca3af]";
const fieldInputClassName = "h-15 w-full rounded-[1.4rem] border-4 border-[#111827] bg-white px-4 text-[15px] font-bold text-[#111827] shadow-[0_6px_0_0_#111827] outline-none transition placeholder:text-[#c2b5a5] focus:bg-[#fffefb] focus:translate-y-[1px] focus:shadow-[0_4px_0_0_#111827]";
const primaryButtonClassName = "inline-flex h-15 w-full cursor-pointer items-center justify-center rounded-[1.5rem] border-4 border-[#111827] bg-[#bfdbfe] text-[15px] font-black text-[#1d4ed8] shadow-[0_6px_0_0_#111827] transition hover:bg-[#93c5fd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111827] active:translate-y-1 active:shadow-[0_2px_0_0_#111827] disabled:cursor-not-allowed disabled:opacity-60";

export function ForgotPasswordForm() {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
    const [message, setMessage] = useState("");

    const redirectTo = useMemo(() => {
        if (typeof window === "undefined") return "";
        return `${window.location.origin}/auth/callback?next=%2Freset-password`;
    }, []);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus("loading");
        setMessage("");

        try {
            const supabase = createBrowserClientSingleton();
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo,
            });

            if (error) throw error;

            setStatus("sent");
            setMessage("重置密码链接已经发出，请去邮箱继续。");
        } catch (error) {
            setStatus("error");
            setMessage(error instanceof Error ? error.message : "发送失败，请稍后再试。");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2.5">
                <label htmlFor="email" className={fieldLabelClassName}>
                    注册邮箱
                </label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@yasi.app"
                    required
                    autoComplete="email"
                    className={fieldInputClassName}
                />
            </div>
            <button
                type="submit"
                disabled={status === "loading" || !email}
                className={primaryButtonClassName}
            >
                {status === "loading" ? "Sending..." : "发送重置链接"}
            </button>
            {message ? (
                <p className={`text-sm font-bold ${status === "error" ? "text-rose-600" : "text-emerald-600"}`}>
                    {message}
                </p>
            ) : null}
        </form>
    );
}
