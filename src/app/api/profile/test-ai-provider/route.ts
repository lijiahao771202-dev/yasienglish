import { NextResponse } from "next/server";

import { testAiProviderConnection } from "@/lib/deepseek";
import { resolveRequestUser } from "@/lib/supabase/request-auth";
import { createServerClient } from "@/lib/supabase/server";

type TestAiProviderBody = {
    ai_provider?: string;
    deepseek_api_key?: string;
    deepseek_model?: string;
    deepseek_thinking_mode?: string;
    deepseek_reasoning_effort?: string;
    glm_api_key?: string;
    glm_model?: string;
    glm_thinking_mode?: string;
    nvidia_api_key?: string;
    nvidia_model?: string;
    github_api_key?: string;
    github_model?: string;
};

export async function POST(request: Request) {
    const supabase = await createServerClient();
    const user = await resolveRequestUser(request, supabase);

    if (!user) {
        return NextResponse.json({ error: "请先登录后再测试连通性。" }, { status: 401 });
    }

    const body = await request.json() as TestAiProviderBody;
    if (body.ai_provider !== "deepseek" && body.ai_provider !== "glm" && body.ai_provider !== "nvidia" && body.ai_provider !== "github") {
        return NextResponse.json({ error: "不支持的 AI provider。" }, { status: 400 });
    }

    try {
        const result = await testAiProviderConnection({
            ai_provider: body.ai_provider,
            deepseek_api_key: body.deepseek_api_key,
            deepseek_model: body.deepseek_model,
            deepseek_thinking_mode: body.deepseek_thinking_mode,
            deepseek_reasoning_effort: body.deepseek_reasoning_effort,
            glm_api_key: body.glm_api_key,
            glm_model: body.glm_model,
            glm_thinking_mode: body.glm_thinking_mode,
            nvidia_api_key: body.nvidia_api_key,
            nvidia_model: body.nvidia_model,
            github_api_key: body.github_api_key,
            github_model: body.github_model,
        });

        return NextResponse.json({
            ok: true,
            provider: result.provider,
            model: result.model,
            message: `${result.providerLabel} / ${result.model} 连通成功`,
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : "连通性测试失败，请检查 provider / key / 模型。",
        }, { status: 400 });
    }
}
