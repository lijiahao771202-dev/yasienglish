import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/admin-auth";

const ITEM_KEYS = ["capsule", "hint_ticket", "vocab_ticket", "audio_ticket", "refresh_ticket"] as const;
type ItemKey = (typeof ITEM_KEYS)[number];

interface GrantItemsPayload {
    userId?: string;
    itemKey?: ItemKey;
    amount?: number;
    title?: string;
    content?: string;
}

export async function POST(request: Request) {
    const auth = await requireAdminUser();
    if (!auth.ok || !auth.user) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as GrantItemsPayload;
    const userId = body.userId?.trim();
    const itemKey = body.itemKey;
    const amount = Math.round(Number(body.amount));

    if (!userId || !itemKey || !ITEM_KEYS.includes(itemKey) || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 9999) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const itemLabelMap: Record<ItemKey, string> = {
        capsule: "胶囊",
        hint_ticket: "提示券",
        vocab_ticket: "词汇券",
        audio_ticket: "听力券",
        refresh_ticket: "刷新券",
    };
    const title = body.title?.trim() || "系统道具奖励";
    const content = body.content?.trim() || `你收到道具奖励：${itemLabelMap[itemKey]} ${amount > 0 ? "+" : ""}${amount}`;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("user_messages")
        .insert({
            user_id: userId,
            title,
            content,
            message_type: "reward",
            reward_coins: 0,
            reward_inventory: { [itemKey]: amount },
            created_by: auth.user.id,
        })
        .select("id, user_id, title, reward_inventory, created_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: data });
}

