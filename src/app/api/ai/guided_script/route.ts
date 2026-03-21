import { NextRequest, NextResponse } from "next/server";

import { deepseek } from "@/lib/deepseek";
import { normalizeGuidedScript } from "@/lib/guidedLearning";

export async function POST(req: NextRequest) {
    try {
        const { chinese, reference_english, elo = 400, topic = "" } = await req.json();

        if (!chinese || !reference_english) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const level = elo < 800 ? "Beginner (A1-A2)" : elo < 1600 ? "Intermediate (B1-B2)" : "Advanced (C1-C2)";
        const prompt = `
You are building a STRICT guided-learning script for Chinese learners.

Student level: ${level}
Topic: ${topic || "General"}
Chinese sentence: "${chinese}"
Reference English: "${reference_english}"

Return strict JSON only with this exact top-level shape:
{
  "lesson_intro": "一段中文开场，不超过2句",
  "sentence_template": "{{slot_1}} {{slot_2}} {{slot_3}} {{slot_4}} {{slot_5}}.",
  "slots": [
    {
      "id": "slot-1",
      "slot_index": 1,
      "slot_kind": "word",
      "answer_text": "I",
      "display_placeholder": "____",
      "hint_focus_cn": "当前空位对应的中文小块",
      "teacher_goal_cn": "先填主语",
      "teacher_demo_en": "I",
      "multiple_choice": [
        { "text": "I", "isCorrect": true, "why_cn": "为什么对" },
        { "text": "me", "isCorrect": false, "why_cn": "为什么不对" },
        { "text": "my", "isCorrect": false, "why_cn": "为什么不对" }
      ],
      "rescue_reason_cn": "为什么这里适合切选择题",
      "idle_rescue_hint_cn": "停太久时显示的轻提示",
      "reveal_mode": "manual_demo_after_3"
    }
  ],
  "summary": {
    "final_sentence": "完整英文句子",
    "chinese_meaning": "中文句意",
    "structure_hint": "结构公式",
    "chinglish_alerts": [
      {
        "wrong": "常见中式错误",
        "correct": "正确表达",
        "explanation": "为什么"
      }
    ],
    "memory_anchor": "一句简单记忆点"
  }
}

Rules:
- All teaching text must be Simplified Chinese.
- sentence_template must use placeholders exactly like {{slot_1}}, {{slot_2}}, in ascending order.
- slots must align 1:1 with placeholders in sentence_template.
- Include at least 2 slots.
- Use word-first slots, but allow phrase slots when the expression should be learned as a whole.
- slot_kind must be "word" or "phrase".
- hint_focus_cn should name the exact Chinese chunk the learner should think about.
- Function words like "to", "the", "my" can still be slots.
- sentence_template should usually be all placeholders plus punctuation, not half-revealed phrases.
- This route is for structure only. Do NOT generate multi-level hint ladders here.
- Keep the payload light so it can return quickly.
- multiple_choice is optional, but recommended for hard spelling, irregular forms, and phrase slots.
- If you include multiple_choice, include 2-4 choices with exactly one correct option.
- teacher_demo_en should reveal the exact text for that slot.
- reveal_mode must be "manual_demo_after_3".
- Keep the structure concrete, beginner-friendly, and compact.
`.trim();

        try {
            const completion = await deepseek.chat.completions.create({
                model: "deepseek-chat",
                response_format: { type: "json_object" },
                temperature: 0.3,
                messages: [
                    {
                        role: "system",
                        content: "You are a precise English teacher. Output valid JSON only.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            });

            const content = completion.choices[0]?.message?.content;
            if (!content) {
                throw new Error("Empty AI guided script");
            }

            const normalized = normalizeGuidedScript(JSON.parse(content));
            if (!normalized) {
                throw new Error("Invalid AI guided script");
            }

            return NextResponse.json(normalized);
        } catch (error) {
            console.error("guided_script generation failed", error);
            return NextResponse.json(
                { error: "AI guided script unavailable" },
                { status: 502 },
            );
        }
    } catch (error) {
        console.error("Guided Script API Error:", error);
        return NextResponse.json(
            { error: "Failed to generate guided script" },
            { status: 500 },
        );
    }
}
