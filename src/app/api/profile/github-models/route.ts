import { NextResponse } from "next/server";

import { listGitHubModelsForConnectionPayload } from "@/lib/deepseek";
import { resolveRequestUser } from "@/lib/supabase/request-auth";
import { createServerClient } from "@/lib/supabase/server";

type GitHubModelsBody = {
    github_api_key?: string;
};

export async function POST(request: Request) {
    const supabase = await createServerClient();
    const user = await resolveRequestUser(request, supabase);

    if (!user) {
        return NextResponse.json({ error: "请先登录后再获取模型列表。" }, { status: 401 });
    }

    const body = await request.json() as GitHubModelsBody;

    try {
        const models = await listGitHubModelsForConnectionPayload({
            github_api_key: body.github_api_key,
        });

        return NextResponse.json({ models });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : "获取 GitHub 模型列表失败。",
        }, { status: 400 });
    }
}
