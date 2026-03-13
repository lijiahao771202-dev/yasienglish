import { NextRequest, NextResponse } from "next/server";

import { deepseek } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
    try {
        const {
            chinese,
            reference_english,
            answer_text,
            hint_focus_cn = "",
            left_context = "",
            right_context = "",
            attempt = 0,
            slot_kind = "word",
            inner_mode = "teacher_guided",
            has_multiple_choice = false,
            local_hint = "",
            manual_request = false,
            request_count = 0,
        } = await req.json();

        if (!chinese || !reference_english || !answer_text) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const prompt = `
You are generating ONE guided-learning hint for a Chinese learner.

Chinese sentence: "${chinese}"
Reference English: "${reference_english}"
Current answer text: "${answer_text}"
Current Chinese focus: "${hint_focus_cn}"
Left visible context: "${left_context || "(none)"}"
Right visible context: "${right_context || "(none)"}"
Slot kind: "${slot_kind}"
Mode: "${inner_mode}"
Attempt count: ${attempt}
Has multiple choice rescue: ${has_multiple_choice ? "yes" : "no"}
Current local hint already shown: "${local_hint || "(none)"}"
Manual AI request: ${manual_request ? "yes" : "no"}
Manual AI request count: ${request_count}

Return strict JSON only:
{
  "primary": "主提示，一句中文",
  "secondary": "补充提示，一句中文，可为空字符串",
  "rescue": "救援提示，一句中文，可为空字符串"
}

Rules:
- All output must be Simplified Chinese.
- Sound like a patient teacher, not a system notice.
- Never say vague filler like "先补当前这一小块", "不要一下子想整句", "只处理当前空位".
- The hint must mention either the exact Chinese focus, or visible left/right context.
- If manual_request is yes, your hint must be noticeably stronger and smarter than the local hint already shown.
- If manual_request is yes, do not just paraphrase the local hint. Narrow the range harder.
- If manual_request is yes and request_count is higher, make the clue even sharper than before.
- attempt 0: give only a concrete first clue. Do not reveal the answer.
- attempt 1: be more specific than attempt 0. Still do not reveal the answer.
- attempt 2: make the clue clearly stronger. You may give first letter, tense, word form, collocation, or whether it is a phrase.
- attempt 3 or above: do NOT auto-reveal the answer. Instead, give a rescue-style hint that tells the learner they can use options or manually reveal this blank if needed.
- For harder manual hints, it is good to mention likely word family, tense, collocation, first letter, or what kind of wrong guess to avoid.
- Keep it short: primary required; secondary/rescue optional.
`.trim();

        const completion = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            temperature: 0.4,
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
            return NextResponse.json({ error: "Empty AI hint" }, { status: 502 });
        }

        const raw = JSON.parse(content) as Record<string, unknown>;
        const primary = typeof raw.primary === "string" ? raw.primary.trim() : "";
        const secondary = typeof raw.secondary === "string" ? raw.secondary.trim() : "";
        const rescue = typeof raw.rescue === "string" ? raw.rescue.trim() : "";

        if (!primary) {
            return NextResponse.json({ error: "Invalid AI hint" }, { status: 502 });
        }

        return NextResponse.json({
            primary,
            secondary: secondary || null,
            rescue: rescue || null,
        });
    } catch (error) {
        console.error("Guided Hint API Error:", error);
        return NextResponse.json(
            { error: "Failed to generate guided hint" },
            { status: 500 },
        );
    }
}
