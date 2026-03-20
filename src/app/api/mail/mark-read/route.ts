import { NextResponse } from "next/server";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";

interface MarkReadPayload {
    messageId?: string;
}

export async function POST(request: Request) {
    const { user, error } = await getServerUserSafely();
    if (error || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as MarkReadPayload;
    const messageId = body.messageId?.trim();
    if (!messageId) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data, error: updateError } = await supabase
        .from("user_messages")
        .update({ is_read: true })
        .eq("id", messageId)
        .eq("user_id", user.id)
        .select("id, is_read")
        .single();

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ message: data });
}

