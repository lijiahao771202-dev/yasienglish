import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getAuthPageErrorMessage } from "@/lib/auth-errors";
import { APP_HOME_PATH } from "@/lib/auth-routing";
import { getServerUserSafely } from "@/lib/supabase/server";

export default async function RegisterPage({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = searchParams ? await searchParams : {};
    const errorCode = typeof params.error === "string" ? params.error : undefined;
    const { user } = await getServerUserSafely();

    if (user) {
        redirect(APP_HOME_PATH);
    }

    return (
        <AuthShell
            badge="sign up"
            title="Create account"
            description="用户名、邮箱和密码就够了。注册完成后直接进入首页，把同一套情绪化体验和同步能力绑定到你的账号里。"
            alert={getAuthPageErrorMessage(errorCode)}
            footerLabel="Already in?"
            footerCta="Sign in"
            footerHref="/login"
            secondaryText="Need recovery?"
            secondaryLabel="Password help"
            secondaryHref="/forgot-password"
        >
            <RegisterForm />
        </AuthShell>
    );
}
