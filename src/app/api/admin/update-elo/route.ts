import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/admin-auth";
import { DEFAULT_TRANSLATION_ELO } from "@/lib/translation-elo-reset";

interface UpdateEloPayload {
    userId?: string;
    translationElo?: number;
    listeningElo?: number;
}

function parseElo(value: unknown) {
    if (value === undefined || value === null || value === "") return null;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return null;
    return Math.round(numberValue);
}

export async function POST(request: Request) {
    const auth = await requireAdminUser();
    if (!auth.ok) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as UpdateEloPayload;
    const userId = body.userId?.trim();
    const translationElo = parseElo(body.translationElo);
    const listeningElo = parseElo(body.listeningElo);

    if (!userId) {
        return NextResponse.json({ error: "Invalid payload: userId required" }, { status: 400 });
    }
    if (translationElo === null && listeningElo === null) {
        return NextResponse.json({ error: "Invalid payload: at least one elo value required" }, { status: 400 });
    }

    const isOutOfRange =
        (translationElo !== null && (translationElo < 0 || translationElo > 5000)) ||
        (listeningElo !== null && (listeningElo < 0 || listeningElo > 5000));
    if (isOutOfRange) {
        return NextResponse.json({ error: "ELO must be between 0 and 5000" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase
        .from("profiles")
        .select("translation_elo, listening_elo, max_translation_elo, max_listening_elo")
        .eq("user_id", userId)
        .single();

    if (existingError || !existing) {
        return NextResponse.json({ error: existingError?.message || "User not found" }, { status: 404 });
    }

    const nextTranslationElo = translationElo ?? existing.translation_elo ?? DEFAULT_TRANSLATION_ELO;
    const nextListeningElo = listeningElo ?? existing.listening_elo ?? 400;
    const nextMaxTranslationElo = Math.max(existing.max_translation_elo ?? DEFAULT_TRANSLATION_ELO, nextTranslationElo);
    const nextMaxListeningElo = Math.max(existing.max_listening_elo ?? 400, nextListeningElo);

    const { data, error } = await supabase
        .from("profiles")
        .update({
            translation_elo: nextTranslationElo,
            listening_elo: nextListeningElo,
            max_translation_elo: nextMaxTranslationElo,
            max_listening_elo: nextMaxListeningElo,
        })
        .eq("user_id", userId)
        .select("user_id, translation_elo, listening_elo, max_translation_elo, max_listening_elo, updated_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
}
