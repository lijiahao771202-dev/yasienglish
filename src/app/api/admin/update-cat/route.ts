import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { levelFromScore, normalizeBand } from "@/lib/cat-growth";
import { createAdminClient } from "@/lib/supabase/admin";

interface UpdateCatPayload {
    userId?: string;
    catScore?: number;
    catLevel?: number;
    catTheta?: number;
    catPoints?: number;
    catCurrentBand?: number;
}

function parseOptionalNumber(value: unknown) {
    if (value === undefined || value === null || value === "") return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num;
}

export async function POST(request: Request) {
    const auth = await requireAdminUser();
    if (!auth.ok) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as UpdateCatPayload;
    const userId = body.userId?.trim();
    if (!userId) {
        return NextResponse.json({ error: "Invalid payload: userId required" }, { status: 400 });
    }

    const catScore = parseOptionalNumber(body.catScore);
    const catLevel = parseOptionalNumber(body.catLevel);
    const catTheta = parseOptionalNumber(body.catTheta);
    const catPoints = parseOptionalNumber(body.catPoints);
    const catCurrentBand = parseOptionalNumber(body.catCurrentBand);

    if ([catScore, catLevel, catTheta, catPoints, catCurrentBand].every((item) => item === null)) {
        return NextResponse.json({ error: "No CAT fields to update" }, { status: 400 });
    }

    const nextPatch: Record<string, number | string> = {};

    if (catScore !== null) {
        const rounded = Math.max(1, Math.round(catScore));
        nextPatch.cat_score = rounded;
        if (catLevel === null) {
            nextPatch.cat_level = levelFromScore(rounded);
        }
    }
    if (catLevel !== null) {
        nextPatch.cat_level = Math.max(1, Math.round(catLevel));
    }
    if (catTheta !== null) {
        nextPatch.cat_theta = Math.max(-3, Math.min(3, catTheta));
    }
    if (catPoints !== null) {
        nextPatch.cat_points = Math.max(0, Math.round(catPoints));
    }
    if (catCurrentBand !== null) {
        nextPatch.cat_current_band = normalizeBand(catCurrentBand);
    }

    nextPatch.cat_updated_at = new Date().toISOString();

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("profiles")
        .update(nextPatch)
        .eq("user_id", userId)
        .select("user_id, cat_score, cat_level, cat_theta, cat_points, cat_current_band, cat_updated_at, updated_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
}
