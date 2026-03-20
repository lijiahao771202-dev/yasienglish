import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/admin-auth";

export async function GET() {
    const auth = await requireAdminUser();
    if (!auth.ok) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, coins, translation_elo, listening_elo, updated_at, created_at")
        .order("updated_at", { ascending: false })
        .limit(200);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const userIds = (data ?? []).map((item) => item.user_id);
    let emailByUserId = new Map<string, string | null>();

    if (userIds.length > 0) {
        const { data: authUsers } = await supabase
            .schema("auth")
            .from("users")
            .select("id, email")
            .in("id", userIds);

        emailByUserId = new Map((authUsers ?? []).map((item) => [item.id as string, (item.email as string | null) ?? null]));
    }

    const users = (data ?? []).map((item) => ({
        ...item,
        email: emailByUserId.get(item.user_id) ?? null,
    }));

    return NextResponse.json({ users });
}
