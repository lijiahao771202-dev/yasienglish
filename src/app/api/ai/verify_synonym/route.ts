import { NextResponse } from "next/server";
import { createDeepSeekClientForCurrentUserWithOverride } from "@/lib/deepseek";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { chinese_context, chunk_role, chunk_chinese, target_english, user_input } = body;

        if (!user_input || !target_english) {
            return NextResponse.json({ isValid: false, correction: "Missing input." }, { status: 400 });
        }

        const systemPrompt = `You are a strict but fair English examiner. 
The user is translating a sentence piece-by-piece. They typed a synonymous override for a specific chunk.

Full Sentence Context: "${chinese_context}"
Chunk Role: "${chunk_role}"
Chunk Target Meaning: "${chunk_chinese}"
The Original Expected Answer: "${target_english}"
The User's Override Input: "${user_input}"

Is the user's input grammatically correct and exact enough in meaning for this chunk in this context? 
If it is a valid synonym, respond strictly with 'YES'.
If it is factually wrong, grammatically broken, or drops crucial meaning, respond with 'NO: <short reason in Chinese under 10 words>'.`;

        // Using a fast model, usually default deepseek/glm configured for user
        const client = await createDeepSeekClientForCurrentUserWithOverride({});
        const completion = await client.chat.completions.create({
            model: "glm-4-flash", // We can request glm-4-flash to override or it will fall back to default
            temperature: 0.2,
            max_tokens: 20,
            messages: [{ role: "user", content: systemPrompt }]
        });
        const responseText = completion.choices[0]?.message?.content?.trim() || "NO: AI Error";

        let isValid = false;
        let correction = "";

        if (responseText.toUpperCase().startsWith("YES")) {
            isValid = true;
        } else {
            isValid = false;
            correction = responseText.replace(/^NO:\s*/i, "").trim() || "语法或语义不符";
        }

        return NextResponse.json({ isValid, correction });
    } catch (error: any) {
        console.error("[Verify Synonym API] error:", error);
        let errorMsg = error?.message || "网络或API错误";
        if (errorMsg.includes("429")) {
            errorMsg = "英伟达/底层模型 API 频率超限 (429 Too Many Requests)，由于免税白嫖接口限制极严，请放慢手速或在设置中切换回 DeepSeek/GLM！";
        }
        return NextResponse.json(
            { isValid: false, correction: `验证服务出错: ${errorMsg}` },
            { status: 500 }
        );
    }
}
