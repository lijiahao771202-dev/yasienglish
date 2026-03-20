import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/admin-auth";

interface SendMessagePayload {
    userId?: string;
    title?: string;
    content?: string;
    rewardCoins?: number;
    rewardInventory?: Record<string, number>;
}

const REWARD_KEYS = ["capsule", "hint_ticket", "vocab_ticket", "audio_ticket", "refresh_ticket"] as const;

export async function POST(request: Request) {
    const auth = await requireAdminUser();
    if (!auth.ok || !auth.user) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as SendMessagePayload;
    const userId = body.userId?.trim();
    const title = body.title?.trim();
    const content = body.content?.trim();
    const rewardCoins = Number(body.rewardCoins ?? 0);

    const rewardInventory: Record<string, number> = {};
    for (const key of REWARD_KEYS) {
        const value = Number(body.rewardInventory?.[key] ?? 0);
        if (Number.isFinite(value) && value !== 0) {
            rewardInventory[key] = Math.round(value);
        }
    }

    if (!userId || !title || !content) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (title.length > 120 || content.length > 4000) {
        return NextResponse.json({ error: "Message too long" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("user_messages")
        .insert({
            user_id: userId,
            title,
            content,
            message_type: rewardCoins !== 0 || Object.keys(rewardInventory).length > 0 ? "reward" : "notice",
            reward_coins: Number.isFinite(rewardCoins) ? Math.round(rewardCoins) : 0,
            reward_inventory: rewardInventory,
            created_by: auth.user.id,
        })
        .select("id, user_id, title, message_type, reward_coins, reward_inventory, created_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: data });
}
