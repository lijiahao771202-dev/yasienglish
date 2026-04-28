import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

const COACH_PROMPT = `你是专业英语写作教练，学生正在实时翻译中文到英文。你的任务是给出一句精准的写作指导。

【绝对禁止】以下类型的回复直接扣分：
- 任何关于"缺少XX词"的提示（系统已有关键词检测）
- "继续""加油""不错""注意语法"等废话
- 重复参考答案中的原文

【你只关注这3件事】
1. 语法错误 → 指出具体错在哪（时态/主谓一致/介词/冠词）
2. 表达升级 → 当前用词太口语化或不够地道，暗示更好的表达方式
3. 句式问题 → 句子结构是否自然、是否符合英文表达习惯

【输出格式】一句中文，不超过18字，不带引号和标点格式。
如果句子写得很好没什么可改的，只输出：准确，提交吧

【示例】
学生写 "I want to talk with you" → talk with不够正式，试试discuss
学生写 "She have been there" → have应改为has，注意主谓一致
学生写 "The problem about noise" → about换成of或regarding更地道
学生写 "I am grateful for their contributions" → 准确，提交吧`;

/**
 * POST /api/ai/coach
 * 
 * Real-time AI coaching. Supports switching between DeepSeek (cloud) and Qwen (local).
 * Pass `model: "qwen"` in body to use local Qwen model.
 */
export async function POST(req: NextRequest) {
    try {
        const { systemPrompt, history = [], userMessage } = await req.json();

        if (!userMessage || !systemPrompt) {
            return NextResponse.json({ tip: null });
        }

        const messages: any[] = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: userMessage }
        ];

        const completion = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages,
            temperature: 0.15,
            max_tokens: 250,
            response_format: { type: "json_object" }
        });

        const tip = completion.choices[0]?.message?.content?.trim() || null;

        return NextResponse.json({ tip });
    } catch (error) {
        console.error("[coach] Error:", (error as Error).message);
        return NextResponse.json({ tip: null });
    }
}
