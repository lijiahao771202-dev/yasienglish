import { NextResponse } from "next/server";

import { listNvidiaModelsForConnectionPayload } from "@/lib/deepseek";
import { resolveRequestUser } from "@/lib/supabase/request-auth";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
    const supabase = await createServerClient();
    const user = await resolveRequestUser(request, supabase);

    if (!user) {
        return NextResponse.json({ error: "请先登录后再获取模型列表。" }, { status: 401 });
    }

    await request.json().catch(() => ({}));

    try {
        const models = await listNvidiaModelsForConnectionPayload();

        return NextResponse.json({ models });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : "获取 NVIDIA 模型列表失败。",
        }, { status: 400 });
    }
}
