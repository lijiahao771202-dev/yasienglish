"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { APP_HOME_PATH } from "@/lib/auth-routing";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";
import { DEFAULT_AVATAR_PRESET } from "@/lib/user-sync";

const fieldLabelClassName = "text-[0.82rem] font-medium text-[#716b78]";
const fieldInputClassName = "h-14 w-full rounded-[1rem] border border-[#d9dfea] bg-white px-4 text-[15px] text-[#18141e] shadow-[0_12px_24px_-24px_rgba(15,23,42,0.55)] outline-none transition placeholder:text-[#b5b0bd] focus:border-[#8ab2db] focus:ring-2 focus:ring-[#d7e8fb]";
const primaryButtonClassName = "inline-flex h-14 w-full cursor-pointer items-center justify-center rounded-[1rem] bg-[#18141e] text-sm font-semibold text-white shadow-[0_26px_36px_-26px_rgba(15,23,42,0.92)] transition hover:bg-[#27212f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18141e] disabled:cursor-not-allowed disabled:opacity-60";

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
                    <Link href="/login" className="text-[0.8rem] font-semibold text-[#4b8fd2] transition hover:text-[#236fc4]">
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
                {status === "loading" ? "Creating..." : "Create account"}
            </button>
            {message ? (
                <p className="text-sm text-rose-600">
                    {message}
                </p>
            ) : null}
        </form>
    );
}
