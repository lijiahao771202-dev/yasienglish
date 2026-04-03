"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { APP_HOME_PATH } from "@/lib/auth-routing";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";
import { DEFAULT_AVATAR_PRESET } from "@/lib/user-sync";

const fieldLabelClassName = "text-[12px] font-black uppercase tracking-[0.16em] text-[#9ca3af]";
const fieldInputClassName = "h-15 w-full rounded-[1.4rem] border-4 border-[#111827] bg-white px-4 text-[15px] font-bold text-[#111827] shadow-[0_6px_0_0_#111827] outline-none transition placeholder:text-[#c2b5a5] focus:bg-[#fffefb] focus:translate-y-[1px] focus:shadow-[0_4px_0_0_#111827]";
const primaryButtonClassName = "inline-flex h-15 w-full cursor-pointer items-center justify-center rounded-[1.5rem] border-4 border-[#111827] bg-[#86efac] text-[15px] font-black text-[#14532d] shadow-[0_6px_0_0_#111827] transition hover:bg-[#4ade80] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111827] active:translate-y-1 active:shadow-[0_2px_0_0_#111827] disabled:cursor-not-allowed disabled:opacity-60";

export function RegisterForm() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
    const [message, setMessage] = useState("");

    const redirectTo = useMemo(() => {
        if (typeof window === "undefined") return "";
        return `${window.location.origin}/auth/callback`;
    }, []);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setStatus("loading");
        setMessage("");

        if (password !== confirmPassword) {
            setStatus("error");
            setMessage("两次输入的密码不一致。");
            return;
        }

        try {
            const supabase = createBrowserClientSingleton();
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        username: username.trim(),
                        avatar_preset: DEFAULT_AVATAR_PRESET,
                    },
                    emailRedirectTo: redirectTo,
                },
            });

            if (error) throw error;

            if (!data.session) {
                throw new Error("注册成功，但当前项目仍启用了邮箱确认。请在 Supabase Auth > Providers > Email 关闭 Confirm email。");
            }

            await supabase.auth.setSession({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
            });
            router.replace(APP_HOME_PATH);
        } catch (error) {
            setStatus("error");
            setMessage(error instanceof Error ? error.message : "注册失败，请稍后重试。");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2.5">
                <label htmlFor="username" className={fieldLabelClassName}>
                    用户名
                </label>
                <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="你想被怎么称呼？"
                    required
                    autoComplete="nickname"
                    className={fieldInputClassName}
                />
            </div>
            <div className="space-y-2.5">
                <label htmlFor="email" className={fieldLabelClassName}>
                    邮箱
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
            <div className="space-y-2.5">
                <label htmlFor="password" className={fieldLabelClassName}>
                    密码
                </label>
                <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="至少 6 位"
                    required
                    autoComplete="new-password"
                    minLength={6}
                    className={fieldInputClassName}
                />
            </div>
            <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-4">
                    <label htmlFor="confirm-password" className={fieldLabelClassName}>
                        确认密码
                    </label>
                    <Link href="/login" className="text-[12px] font-black text-[#ec4899] transition hover:text-[#be185d]">
                        已有账号？
                    </Link>
                </div>
                <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="再输入一次"
                    required
                    autoComplete="new-password"
                    minLength={6}
                    className={fieldInputClassName}
                />
            </div>
            <button
                type="submit"
                disabled={status === "loading" || !username || !email || !password || !confirmPassword}
                className={primaryButtonClassName}
            >
                {status === "loading" ? "Creating..." : "创建账号"}
            </button>
            {message ? (
                <p className="text-sm font-bold text-rose-600">
                    {message}
                </p>
            ) : null}
        </form>
    );
}
