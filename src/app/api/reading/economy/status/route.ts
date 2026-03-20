import { NextResponse } from "next/server";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";
import {
    READING_COIN_COSTS,
    READING_COIN_REWARDS,
    READING_COIN_DAILY_GAIN_CAP,
} from "@/lib/reading-economy";

export async function GET() {
    const { user, error } = await getServerUserSafely();
    if (error || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createServerClient();
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("reading_coins, reading_streak, reading_last_daily_grant_at, cat_score, cat_level, cat_theta, cat_points, cat_current_band, cat_updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({
        reading: {
            balance: typeof profile?.reading_coins === "number" ? profile.reading_coins : 40,
            streak: typeof profile?.reading_streak === "number" ? profile.reading_streak : 0,
            lastGrantAt: profile?.reading_last_daily_grant_at ?? null,
            costs: READING_COIN_COSTS,
            rewards: READING_COIN_REWARDS,
            dailyGainCap: READING_COIN_DAILY_GAIN_CAP,
        },
        cat: {
            score: typeof profile?.cat_score === "number" ? profile.cat_score : 1000,
            level: typeof profile?.cat_level === "number" ? profile.cat_level : 1,
            theta: typeof profile?.cat_theta === "number" ? profile.cat_theta : 0,
            points: typeof profile?.cat_points === "number" ? profile.cat_points : 0,
            currentBand: typeof profile?.cat_current_band === "number" ? profile.cat_current_band : 3,
            updatedAt: profile?.cat_updated_at ?? null,
        },
    });
}
