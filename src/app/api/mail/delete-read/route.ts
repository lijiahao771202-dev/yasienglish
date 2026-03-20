import { NextResponse } from "next/server";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";

interface DeleteReadPayload {
    messageId?: string;
}

export async function POST(request: Request) {
    const { user, error } = await getServerUserSafely();
    if (error || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as DeleteReadPayload;
    const messageId = body.messageId?.trim();

    const supabase = await createServerClient();

    if (messageId) {
        const { data, error: deleteError } = await supabase
            .from("user_messages")
            .delete()
            .eq("id", messageId)
            .eq("user_id", user.id)
            .eq("is_read", true)
            .select("id");

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ deletedCount: data?.length ?? 0 });
    }

    const { data, error: bulkDeleteError } = await supabase
        .from("user_messages")
        .delete()
        .eq("user_id", user.id)
        .eq("is_read", true)
        .select("id");

    if (bulkDeleteError) {
        return NextResponse.json({ error: bulkDeleteError.message }, { status: 500 });
    }

    return NextResponse.json({ deletedCount: data?.length ?? 0 });
}

