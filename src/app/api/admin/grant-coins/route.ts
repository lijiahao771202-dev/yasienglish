import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/admin-auth";

interface GrantCoinsPayload {
    userId?: string;
    amount?: number;
    title?: string;
    content?: string;
}

export async function POST(request: Request) {
    const auth = await requireAdminUser();
    if (!auth.ok) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as GrantCoinsPayload;
    const userId = body.userId?.trim();
    const amount = Number(body.amount);

    if (!userId || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const title = body.title?.trim() || "系统奖励";
    const content = body.content?.trim() || `你收到一笔金币奖励：${amount > 0 ? "+" : ""}${Math.round(amount)} 金币。`;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("user_messages")
        .insert({
            user_id: userId,
            title,
            content,
            message_type: "reward",
            reward_coins: Math.round(amount),
            reward_inventory: {},
            created_by: auth.user?.id ?? null,
        })
        .select("id, user_id, title, reward_coins, created_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: data });
}
