import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/admin-auth";

interface SendMessagePayload {
    userId?: string;
    title?: string;
    content?: string;
    rewardCoins?: number;
    rewardReadingCoins?: number;
    rewardCatPoints?: number;
    rewardCatBadges?: string[];
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
    const rewardReadingCoins = Number(body.rewardReadingCoins ?? 0);
    const rewardCatPoints = Number(body.rewardCatPoints ?? 0);
    const rewardCatBadges = Array.isArray(body.rewardCatBadges)
        ? body.rewardCatBadges
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
            .slice(0, 12)
        : [];

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
            message_type:
                rewardCoins !== 0
                || rewardReadingCoins !== 0
                || rewardCatPoints !== 0
                || rewardCatBadges.length > 0
                || Object.keys(rewardInventory).length > 0
                    ? "reward"
                    : "notice",
            reward_coins: Number.isFinite(rewardCoins) ? Math.round(rewardCoins) : 0,
            reward_reading_coins: Number.isFinite(rewardReadingCoins) ? Math.round(rewardReadingCoins) : 0,
            reward_cat_points: Number.isFinite(rewardCatPoints) ? Math.round(rewardCatPoints) : 0,
            reward_cat_badges: rewardCatBadges,
            reward_inventory: rewardInventory,
            created_by: auth.user.id,
        })
        .select("id, user_id, title, message_type, reward_coins, reward_reading_coins, reward_cat_points, reward_cat_badges, reward_inventory, created_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: data });
}
