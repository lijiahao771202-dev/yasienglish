import { NextResponse } from "next/server";

import { createServerClient } from "@/lib/supabase/server";

interface SettleRequest {
    mode: "translation" | "listening";
    eloAfter: number;
    change: number;
    streak: number;
    maxElo: number;
    coins?: number;
    inventory?: Record<string, number> | null;
    ownedThemes?: string[] | null;
    activeTheme?: string | null;
    source?: string;
}

export async function POST(request: Request) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as SettleRequest;

    const { data, error } = await supabase.rpc("apply_battle_settlement", {
        p_mode: body.mode,
        p_elo_after: body.eloAfter,
        p_elo_change: body.change,
        p_streak_count: body.streak,
        p_max_elo: body.maxElo,
        p_coins: body.coins ?? null,
        p_inventory: body.inventory ?? null,
        p_owned_themes: body.ownedThemes ?? null,
        p_active_theme: body.activeTheme ?? null,
        p_source: body.source ?? "battle",
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
}
