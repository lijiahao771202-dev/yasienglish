import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { createServerClient } from "@/lib/supabase/server";

export default async function LoginPage() {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
        redirect("/read");
    }

    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_16%_20%,rgba(251,191,36,0.16),transparent_30%),radial-gradient(circle_at_84%_18%,rgba(14,165,233,0.14),transparent_30%),linear-gradient(145deg,#faf7f2_0%,#fffdf9_42%,#f4f4f5_100%)] px-5 py-10">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:42px_42px] opacity-25" />
            <section className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-[0_28px_90px_-28px_rgba(15,23,42,0.24)] backdrop-blur-xl">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-600">Yasi</p>
                <h1 className="mt-4 font-newsreader text-5xl leading-none text-stone-900">
                    必须登录后使用
                </h1>
                <p className="mt-4 text-sm leading-6 text-stone-600">
                    用户数据将本地缓存，并同步到 Supabase。第一版仅支持在线使用。
                </p>
                <LoginForm />
            </section>
        </main>
    );
}
