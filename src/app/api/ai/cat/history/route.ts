import { NextResponse } from "next/server";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";

function toPositiveInt(value: string | null, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(120, Math.round(parsed)));
}

export async function GET(request: Request) {
    const { user, error } = await getServerUserSafely();
    if (error || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = toPositiveInt(url.searchParams.get("limit"), 40);

    const supabase = await createServerClient();
    const { data, error: queryError } = await supabase
        .from("cat_sessions")
        .select("id, created_at, completed_at, score_before, score_after, delta, status, accuracy, quiz_correct, quiz_total, next_band")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (queryError) {
        return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    const sessions = (data ?? []).map((item) => ({
        id: item.id,
        createdAt: item.created_at,
        completedAt: item.completed_at,
        scoreBefore: Number(item.score_before ?? 1000),
        scoreAfter: Number(item.score_after ?? item.score_before ?? 1000),
        delta: Number(item.delta ?? 0),
        status: item.status,
        accuracy: typeof item.accuracy === "number" ? item.accuracy : null,
        quizCorrect: typeof item.quiz_correct === "number" ? item.quiz_correct : null,
        quizTotal: typeof item.quiz_total === "number" ? item.quiz_total : null,
        nextBand: typeof item.next_band === "number" ? item.next_band : null,
    }));

    return NextResponse.json({
        sessions: sessions.reverse(),
        total: sessions.length,
    });
}
