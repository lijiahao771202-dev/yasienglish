import { NextResponse } from "next/server";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";

export async function GET() {
    const { user, error } = await getServerUserSafely();
    if (error || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let count: number | null = 0;
    let queryError: { message?: string } | null = null;
    try {
        const supabase = await createServerClient();
        const result = await supabase
            .from("user_messages")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("is_read", false);
        count = result.count ?? 0;
        queryError = result.error;
    } catch {
        return NextResponse.json({ unreadCount: 0, degraded: true });
    }

    if (queryError) {
        return NextResponse.json({ unreadCount: 0, degraded: true });
    }

    return NextResponse.json({ unreadCount: count ?? 0 });
}
