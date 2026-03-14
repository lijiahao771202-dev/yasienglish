import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getAuthPageErrorMessage } from "@/lib/auth-errors";
import { APP_HOME_PATH } from "@/lib/auth-routing";
import { getServerUserSafely } from "@/lib/supabase/server";

export default async function ForgotPasswordPage({
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
            badge="recover"
            title="Recover access"
            description="我们会把重置链接发到你的邮箱，点开以后就能进入新的密码设置页。流程走完后，你会回到自己的主页。"
            alert={getAuthPageErrorMessage(errorCode)}
            footerLabel="Remembered it?"
            footerCta="Back to sign in"
            footerHref="/login"
            secondaryText="Need an account?"
            secondaryLabel="Sign up first"
            secondaryHref="/register"
        >
            <ForgotPasswordForm />
        </AuthShell>
    );
}
