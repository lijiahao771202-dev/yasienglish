"use client";

import { FormEvent, useMemo, useState } from "react";

import { createBrowserClientSingleton } from "@/lib/supabase/browser";

const fieldLabelClassName = "text-[0.82rem] font-medium text-[#716b78]";
const fieldInputClassName = "h-14 w-full rounded-[1rem] border border-[#d9dfea] bg-white px-4 text-[15px] text-[#18141e] shadow-[0_12px_24px_-24px_rgba(15,23,42,0.55)] outline-none transition placeholder:text-[#b5b0bd] focus:border-[#8ab2db] focus:ring-2 focus:ring-[#d7e8fb]";
const primaryButtonClassName = "inline-flex h-14 w-full cursor-pointer items-center justify-center rounded-[1rem] bg-[#18141e] text-sm font-semibold text-white shadow-[0_26px_36px_-26px_rgba(15,23,42,0.92)] transition hover:bg-[#27212f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18141e] disabled:cursor-not-allowed disabled:opacity-60";

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
                {status === "loading" ? "Sending..." : "Send reset link"}
            </button>
            {message ? (
                <p className={`text-sm ${status === "error" ? "text-rose-600" : "text-emerald-600"}`}>
                    {message}
                </p>
            ) : null}
        </form>
    );
}
