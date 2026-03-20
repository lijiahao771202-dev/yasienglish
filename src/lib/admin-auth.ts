import { getServerUserSafely } from "@/lib/supabase/server";

function readAdminEmails() {
    const raw = process.env.ADMIN_EMAILS ?? "";
    return new Set(
        raw
            .split(",")
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
    );
}

export function isAdminEmail(email?: string | null) {
    if (!email) return false;
    const admins = readAdminEmails();
    return admins.has(email.toLowerCase());
}

export async function requireAdminUser() {
    const { user, error } = await getServerUserSafely();
    if (error || !user || !isAdminEmail(user.email)) {
        return { ok: false as const, user: null };
    }

    return { ok: true as const, user };
}
