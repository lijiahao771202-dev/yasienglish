"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { APP_HOME_PATH } from "@/lib/auth-routing";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";

const fieldLabelClassName = "text-[0.82rem] font-medium text-[#716b78]";
const fieldInputClassName = "h-14 w-full rounded-[1rem] border border-[#d9dfea] bg-white px-4 text-[15px] text-[#18141e] shadow-[0_12px_24px_-24px_rgba(15,23,42,0.55)] outline-none transition placeholder:text-[#b5b0bd] focus:border-[#8ab2db] focus:ring-2 focus:ring-[#d7e8fb]";
const primaryButtonClassName = "inline-flex h-14 w-full cursor-pointer items-center justify-center rounded-[1rem] bg-[#18141e] text-sm font-semibold text-white shadow-[0_26px_36px_-26px_rgba(15,23,42,0.92)] transition hover:bg-[#27212f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18141e] disabled:cursor-not-allowed disabled:opacity-60";

export function LoginForm() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
    const [message, setMessage] = useState("");

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus("loading");
        setMessage("");

        try {
            const supabase = createBrowserClientSingleton();
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            if (data.session) {
                await supabase.auth.setSession({
                    access_token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                });
            }
            const adminResponse = await fetch("/api/admin/is-admin", {
                method: "GET",
                cache: "no-store",
            });
            const adminPayload = await adminResponse.json().catch(() => ({ isAdmin: false }));
            router.replace(adminPayload?.isAdmin ? "/admin" : APP_HOME_PATH);
        } catch (error) {
            setStatus("error");
            setMessage(error instanceof Error ? error.message : "登录失败，请重试。");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2.5">
                <label htmlFor="email" className={fieldLabelClassName}>
                    邮箱
                </label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className={fieldInputClassName}
                />
            </div>
            <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-4">
                    <label htmlFor="password" className={fieldLabelClassName}>
                        密码
                    </label>
                    <Link href="/forgot-password" className="text-[0.8rem] font-semibold text-[#4b8fd2] transition hover:text-[#236fc4]">
                        忘记密码？
                    </Link>
                </div>
                <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className={fieldInputClassName}
                />
            </div>
            <button
                type="submit"
                disabled={status === "loading" || !email || !password}
                className={primaryButtonClassName}
            >
                {status === "loading" ? "Signing in..." : "Sign in"}
            </button>
            {message ? (
                <p className={`text-sm ${status === "error" ? "text-rose-600" : "text-emerald-600"}`}>
                    {message}
                </p>
            ) : null}
        </form>
    );
}
