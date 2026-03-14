"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createBrowserClientSingleton } from "@/lib/supabase/browser";

const fieldLabelClassName = "text-[0.82rem] font-medium text-[#716b78]";
const fieldInputClassName = "h-14 w-full rounded-[1rem] border border-[#d9dfea] bg-white px-4 text-[15px] text-[#18141e] shadow-[0_12px_24px_-24px_rgba(15,23,42,0.55)] outline-none transition placeholder:text-[#b5b0bd] focus:border-[#8ab2db] focus:ring-2 focus:ring-[#d7e8fb]";
const primaryButtonClassName = "inline-flex h-14 w-full cursor-pointer items-center justify-center rounded-[1rem] bg-[#18141e] text-sm font-semibold text-white shadow-[0_26px_36px_-26px_rgba(15,23,42,0.92)] transition hover:bg-[#27212f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18141e] disabled:cursor-not-allowed disabled:opacity-60";

export function ResetPasswordForm() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
    const [message, setMessage] = useState("");

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
            const { error } = await supabase.auth.updateUser({
                password,
            });

            if (error) throw error;

            router.replace("/?password=updated");
        } catch (error) {
            setStatus("error");
            setMessage(error instanceof Error ? error.message : "修改密码失败，请重试。");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2.5">
                <label htmlFor="password" className={fieldLabelClassName}>
                    新密码
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
                <label htmlFor="confirm-password" className={fieldLabelClassName}>
                    再输入一次
                </label>
                <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="确认密码"
                    required
                    autoComplete="new-password"
                    minLength={6}
                    className={fieldInputClassName}
                />
            </div>
            <button
                type="submit"
                disabled={status === "loading" || !password || !confirmPassword}
                className={primaryButtonClassName}
            >
                {status === "loading" ? "Updating..." : "Reset password"}
            </button>
            {message ? (
                <p className="text-sm text-rose-600">
                    {message}
                </p>
            ) : null}
        </form>
    );
}
