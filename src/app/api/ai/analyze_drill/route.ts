import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

const LISTENING_ANALYSIS_MAX_TOKENS = 320;
const TRANSLATION_ANALYSIS_MAX_TOKENS = 360;
const TEACHING_ANALYSIS_MAX_TOKENS = 520;
const FULL_TRANSLATION_ANALYSIS_MAX_TOKENS = 820;
const ANALYSIS_TEMPERATURE = 0.3;

type AnalysisCompletion = {
    choices: Array<{
        message: {
            content: string | null;
        };
    }>;
};

export async function POST(req: NextRequest) {
    try {
        const {
            user_translation,
            reference_english,
            original_chinese,
            current_elo,
            score,
            mode = "translation",
            is_reverse = false,
            input_source = "keyboard",
            teaching_mode = false,
            detail_level = "basic",
        } = await req.json();

        if (!user_translation || !reference_english || !original_chinese) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const userElo = current_elo || 1200;
        let prompt = "";

        if (mode === "listening") {
            prompt = `
            Act as an expert English speaking coach.

            This is a post-score analysis request. Do NOT rescore.
            Final score: ${score ?? "unknown"}/10
            Input Method: ${input_source.toUpperCase()}
            User Elo: ${userElo}
            Reference: "${reference_english}"
            User Input: "${user_translation}"

            Analyze using phonetic matching:
            1. Match by sound, not strict spelling.
            2. Numeric forms and word forms are equivalent.
            3. Ignore fillers like "um", "ah".
            4. Ignore punctuation and capitalization.

            Output JSON only:
            {
              "segments": [
                { "word": "reference word", "status": "correct" | "phonetic_error" | "missing" | "typo" | "variation", "user_input": "only if needed" }
              ],
              "feedback": {
                "listening_tips": ["一条简短发音建议", "一条简短流畅度建议"],
                "encouragement": "一句简短中文鼓励"
              }
            }
            `;
        } else {
            const taskDescription = is_reverse ? "Translate English to Chinese." : "Translate Chinese to English.";
            const sourceText = is_reverse ? reference_english : original_chinese;
            const improvedVersionLanguage = is_reverse ? "简体中文" : "natural English";
            if (detail_level === "full") {
                prompt = `
                Act as an IELTS writing coach who gives concrete, reusable teaching feedback.

                This is a post-score analysis request. Do NOT rescore.
                Final score: ${score ?? "unknown"}/10
                User Elo: ${userElo}
                Task: ${taskDescription}
                Source: "${sourceText}"
                Reference Answer: "${reference_english}"
                User Answer: "${user_translation}"

                Output JSON only:
                {
                  "feedback": ["一条简短中文点评", "一条简短中文修改建议"],
                  "improved_version": "更自然的改写版本",
                  "diagnosis_summary_cn": "一句话指出最该记住的问题",
                  "chinglish_vs_natural": {
                    "chinglish": "用户原本容易直译的说法",
                    "natural": "更自然的表达",
                    "reason_cn": "为什么前者像中式表达，后者为什么更自然"
                  },
                  "common_pitfall": {
                    "pitfall_cn": "这题最容易翻车的点",
                    "wrong_example": "错误示例",
                    "right_example": "正确示例",
                    "why_cn": "为什么这里容易错"
                  },
                  "phrase_synonyms": [
                    {
                      "source_phrase": "参考句里的关键短语",
                      "alternatives": ["同义替换1", "同义替换2"],
                      "nuance_cn": "这些替换的语气和适用场景"
                    }
                  ],
                  "transfer_pattern": {
                    "template": "可迁移句型模板",
                    "example_cn": "类似中文句子",
                    "example_en": "对应英文句子",
                    "tip_cn": "怎么套这个模板"
                  },
                  "memory_hook_cn": "一句很短的记忆法"${teaching_mode ? `,
                  "error_analysis": [
                    { "error": "用户写错的部分", "correction": "正确写法", "rule": "语法规则解释", "tip": "记忆技巧" }
                  ],
                  "similar_patterns": [
                    { "chinese": "类似中文句子", "english": "对应英文翻译", "point": "这个句型的要点" }
                  ]` : ""}
                }

                Rules:
                - All Chinese explanatory fields must be in Simplified Chinese.
                - "improved_version" must be in ${improvedVersionLanguage}.
                - Keep the meaning aligned with the reference answer.
                - Avoid generic praise such as "翻译准确" or "符合原意" unless you immediately anchor it to a concrete phrase.
                - Every teaching block must quote or reference a concrete phrase, collocation, or structure from the user answer or reference answer.
                - "chinglish_vs_natural" must compare two specific expressions, not abstract advice.
                - "common_pitfall" must include a realistic wrong example and right example.
                - "phrase_synonyms" should return 1 to 3 useful alternatives, not a long list.
                - "transfer_pattern" must be reusable in another sentence, not just a comment on this one answer.
                - Keep the response concise, specific, and reusable.
                `;
            } else {
                prompt = `
                Act as an IELTS writing coach.

                This is a post-score analysis request. Do NOT rescore.
                Final score: ${score ?? "unknown"}/10
                User Elo: ${userElo}
                Task: ${taskDescription}
                Source: "${sourceText}"
                Reference Answer: "${reference_english}"
                User Answer: "${user_translation}"

                Output JSON only:
                {
                  "feedback": ["一条简短中文点评", "一条简短中文修改建议"],
                  "improved_version": "更自然的改写版本"${teaching_mode ? `,
                  "error_analysis": [
                    { "error": "用户写错的部分", "correction": "正确写法", "rule": "语法规则解释", "tip": "记忆技巧" }
                  ],
                  "similar_patterns": [
                    { "chinese": "类似中文句子", "english": "对应英文翻译", "point": "这个句型的要点" }
                  ]` : ""}
                }

                Rules:
                - "feedback", "error_analysis", and "similar_patterns.point" must be in Simplified Chinese.
                - "improved_version" must be in ${improvedVersionLanguage}.
                - Keep the meaning aligned with the reference answer.
                - Keep the response concise and actionable.
                `;
            }
        }

        const maxTokens = mode === "listening"
            ? LISTENING_ANALYSIS_MAX_TOKENS
            : detail_level === "full"
                ? FULL_TRANSLATION_ANALYSIS_MAX_TOKENS
            : teaching_mode
                ? TEACHING_ANALYSIS_MAX_TOKENS
                : TRANSLATION_ANALYSIS_MAX_TOKENS;

        const completion = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful AI tutor. Output JSON only." },
                { role: "user", content: prompt }
            ],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            temperature: ANALYSIS_TEMPERATURE,
            max_tokens: maxTokens,
        }) as AnalysisCompletion;

        const content = completion.choices[0]?.message?.content;
        if (!content) {
            throw new Error("No content generated");
        }

        return NextResponse.json(JSON.parse(content));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to generate drill analysis";
        console.error("Analyze Drill Error:", message);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
