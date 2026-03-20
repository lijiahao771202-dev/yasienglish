import { NextResponse } from "next/server";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";

export async function GET() {
    const { user, error } = await getServerUserSafely();
    if (error || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createServerClient();
    const { data, error: queryError } = await supabase
        .from("user_messages")
        .select("id, title, content, is_read, message_type, reward_coins, reward_inventory, claimed_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

    if (queryError) {
        return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    return NextResponse.json({ messages: data ?? [] });
}

