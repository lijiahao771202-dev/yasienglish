import { NextResponse } from "next/server";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";

interface ClaimPayload {
    messageId?: string;
}

export async function POST(request: Request) {
    const { user, error } = await getServerUserSafely();
    if (error || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as ClaimPayload;
    const messageId = body.messageId?.trim();
    if (!messageId) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data, error: rpcError } = await supabase.rpc("claim_user_message_reward", {
        p_message_id: messageId,
    });

    if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ reward: result ?? null });
}

