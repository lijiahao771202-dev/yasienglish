import { NextResponse } from "next/server";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";

export async function GET() {
    const { user, error } = await getServerUserSafely();
    if (error || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createServerClient();
    const { count, error: queryError } = await supabase
        .from("user_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

    if (queryError) {
        return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    return NextResponse.json({ unreadCount: count ?? 0 });
}

