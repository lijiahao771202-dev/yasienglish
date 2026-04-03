"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { APP_HOME_PATH } from "@/lib/auth-routing";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";

const fieldLabelClassName = "text-[12px] font-black uppercase tracking-[0.16em] text-[#9ca3af]";
const fieldInputClassName = "h-15 w-full rounded-[1.4rem] border-4 border-[#111827] bg-white px-4 text-[15px] font-bold text-[#111827] shadow-[0_6px_0_0_#111827] outline-none transition placeholder:text-[#c2b5a5] focus:bg-[#fffefb] focus:translate-y-[1px] focus:shadow-[0_4px_0_0_#111827]";
const primaryButtonClassName = "inline-flex h-15 w-full cursor-pointer items-center justify-center rounded-[1.5rem] border-4 border-[#111827] bg-[#facc15] text-[15px] font-black text-[#111827] shadow-[0_6px_0_0_#111827] transition hover:bg-[#fbbf24] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111827] active:translate-y-1 active:shadow-[0_2px_0_0_#111827] disabled:cursor-not-allowed disabled:opacity-60";

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
                    <Link href="/forgot-password" className="text-[12px] font-black text-[#ec4899] transition hover:text-[#be185d]">
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
                {status === "loading" ? "Signing in..." : "进入 Yasi"}
            </button>
            {message ? (
                <p className={`text-sm font-bold ${status === "error" ? "text-rose-600" : "text-emerald-600"}`}>
                    {message}
                </p>
            ) : null}
        </form>
    );
}
