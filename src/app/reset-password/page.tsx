import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
    return (
        <AuthShell
            badge="reset"
            title="Reset password"
            description="这是恢复流程的最后一步。保存成功后，你会直接回到首页，然后继续同步和学习。"
            footerLabel="Old password back?"
            footerCta="Sign in"
            footerHref="/login"
            secondaryText="Need an account?"
            secondaryLabel="Sign up"
            secondaryHref="/register"
        >
            <ResetPasswordForm />
        </AuthShell>
    );
}
