import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface UpdateReadingCoinsPayload {
    userId?: string;
    amount?: number;
}

function parseAmount(value: unknown) {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return null;
    return Math.round(num);
}

export async function POST(request: Request) {
    const auth = await requireAdminUser();
    if (!auth.ok) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as UpdateReadingCoinsPayload;
    const userId = body.userId?.trim();
    const amount = parseAmount(body.amount);

    if (!userId || amount === null) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: profile, error: findError } = await supabase
        .from("profiles")
        .select("reading_coins")
        .eq("user_id", userId)
        .single();

    if (findError) {
        return NextResponse.json({ error: findError.message }, { status: 404 });
    }

    const current = Number(profile?.reading_coins ?? 0);
    const next = Math.max(0, current + amount);

    const { data, error } = await supabase
        .from("profiles")
        .update({ reading_coins: next })
        .eq("user_id", userId)
        .select("user_id, reading_coins, updated_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        profile: data,
        delta: next - current,
    });
}
