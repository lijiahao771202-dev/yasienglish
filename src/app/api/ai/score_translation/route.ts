import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import {
    hasPunctuationOnlyDictationIssue,
    isDictationPunctuationOnlyDifference,
    normalizeDictationScore,
} from "@/lib/dictation-guardrails";

const TRANSLATION_MAX_TOKENS = 96;
const DICTATION_MAX_TOKENS = 128;
const SCORING_TEMPERATURE = 0.2;

type ScoreCompletion = {
    choices: Array<{
        message: {
            content: string | null;
        };
    }>;
};

export async function POST(req: NextRequest) {
    try {
        const { user_translation, reference_english, original_chinese, current_elo, mode = "translation", is_reverse = false, input_source = 'keyboard', teaching_mode = false } = await req.json();
        console.log("[score_translation] Request received:", { mode, user_translation: user_translation?.substring(0, 30), current_elo });

        // Base Elo (Default to 1200 if undefined)
        const userElo = current_elo || 1200;

        let prompt = "";

        // Voice Input Specific Instruction
        let voiceInstruction = "";

        if (mode === 'listening') {
            return NextResponse.json({
                error: "Listening moved to pronunciation scoring",
                details: "Listening 模式已经切换到本地发音评分接口。",
            }, { status: 400 });
        } else {
            // Translation Mode (Written Task)
            if (input_source === 'voice') {
                voiceInstruction = `**NOTE: Voice Dictation Used for Written Task**
                 - User used Speech-to-Text to write this translation.
                 - Be lenient on homophones (e.g. "sea" vs "see") and missing punctuation.
                 - BUT, Grammar and Vocabulary must still be correct for a written standard.`;
            }
        }

        if (mode === "dictation") {
            // Dictation Mode Prompt (English audio -> Chinese writing)
            prompt = `
            Act as an expert bilingual dictation coach.

            Context:
            - Input Method: ${input_source.toUpperCase()}
            - User Elo: ${userElo}
            - Task: User listened to an English sentence and wrote Chinese.
            - English Reference: "${reference_english}"
            - Chinese Gold Reference: "${original_chinese}"
            - User Chinese Answer: "${user_translation}"

            Scoring rules (Dictation-specific):
            1. Evaluate semantic fidelity first, literal wording second.
            2. Accept reasonable paraphrases/synonyms in Chinese.
            3. Penalize missing key information: subject, action, object, negation, numbers, time/place, causal relation.
            4. Punctuation differences MUST NOT reduce score.
            5. If only punctuation differs, score MUST be 10.
            6. Return an INTEGER score from 0 to 10.
            7. If core meaning is mostly complete, score should be at least 6.

            Output language:
            - judge_reasoning and all tips MUST be in Simplified Chinese.

            Output JSON only:
            {
              "score": 0-10 integer,
              "judge_reasoning": "一句简短评分结论",
              "feedback": {
                "dictation_tips": ["一条信息缺失建议", "一条表达优化建议"],
                "encouragement": "一句简短鼓励"
              }
            }
            `;
        } else {
            // Translation Mode Prompt (Smart Elo)
            // Translation Mode Prompt (Written Elo)
            const taskDescription = is_reverse ? "Translate English to Chinese (Written)." : "Translate Chinese to English (Written).";
            const sourceText = is_reverse ? reference_english : original_chinese;
            const goldenText = is_reverse ? original_chinese : reference_english;

            // Dynamic K-Factor Grading (Anti-Inflation Logic)
            let gradingStandard = "";
            if (userElo < 1600) {
                // BEGINNER MODE: Encouragement (High Reward, Low Risk)
                gradingStandard = `
                 Elo Grading Standards (Beginner Mode - Be Encouraging):
                 - **Excellent (+25 to +30)**: Correct meaning and structure. Minor errors ok.
                 - **Good (+10 to +15)**: Understandable with minor grammar errors.
                 - **Fair (+5)**: Meaning is mostly clear but grammar is shaky.
                 - **Askew (-5)**: Meaning is wrong or completely off-topic.
                 IMPORTANT: Be generous! If the meaning is correct, give at least 7/10.
                 `;
            } else if (userElo < 2200) {
                // INTERMEDIATE MODE: Fair Game (Symmetric)
                gradingStandard = `
                 Elo Grading Standards (Intermediate Mode):
                 - **Sophisticated (+20)**: Native-like phrasing using B2+ vocabulary.
                 - **Accurate (+10)**: Correct grammar and meaning. Standard.
                 - **Clumsy (-5)**: Awkward phrasing or unnatural expression.
                 - **Error (-15)**: Grammatical faults or wrong meaning.
                 `;
            } else {
                // ADVANCED MODE: Hardcore (Low Reward, High Risk) - The Gauntlet
                gradingStandard = `
                 Elo Grading Standards (Advanced C1/C2 Mode):
                 - **Mastery (+10)**: Flawless, nuanced, native-level expression.
                 - **Pass (+5)**: Correct but dry/textbook style.
                 - **Unnatural (-10)**: Non-native phrasing (even if grammatically valid).
                 - **Error (-30)**: Any grammatical error is unacceptable at this level.
                 `;
            }

            prompt = `
             Act as an IELTS Writing Examiner.
             
             Context:
             - User Elo: ${userElo}
             - Task: ${taskDescription}
             - Source: "${sourceText}"
             - Golden: "${goldenText}"
             - User: "${user_translation}"
 
             ${voiceInstruction}
 
             ${gradingStandard}
  
             **LANGUAGE REQUIREMENT**:
             - You MUST output 'judge_reasoning' in **Simplified Chinese (简体中文)**.
             - Keep 'judge_reasoning' to one short sentence.
  
             Output JSON:
             {
                 "score": 0-10,
                 "judge_reasoning": "一句简短评分结论"
             }
             `;
        }

        console.log("[score_translation] Calling DeepSeek API...");
        const MAX_RETRIES = 3;
        const maxTokens = mode === "dictation"
            ? DICTATION_MAX_TOKENS
            : TRANSLATION_MAX_TOKENS;
        let lastError: Error | null = null;
        let completion: ScoreCompletion | null = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`[score_translation] API Attempt ${attempt}/${MAX_RETRIES} (Teaching Mode: ${teaching_mode})`);
                completion = await deepseek.chat.completions.create({
                    messages: [
                        { role: "system", content: "You are a helpful AI tutor. Output JSON only." },
                        { role: "user", content: prompt }
                    ],
                    model: "deepseek-chat",
                    response_format: { type: "json_object" },
                    temperature: SCORING_TEMPERATURE,
                    max_tokens: maxTokens,
                });
                break; // Success, exit retry loop
            } catch (error) {
                lastError = error as Error;
                console.log(`[score_translation] Attempt ${attempt} failed: ${lastError.message}`);
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
                }
            }
        }

        if (!completion) {
            console.error(`[score_translation] All ${MAX_RETRIES} attempts failed:`, lastError);
            throw lastError || new Error("Failed after retries");
        }
        console.log("[score_translation] DeepSeek API response received");

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content generated");

        const data = JSON.parse(content) as Record<string, unknown>;

        if (mode === "dictation") {
            const punctuationOnlyIssue = hasPunctuationOnlyDictationIssue(data);
            const punctuationOnlyDifference = isDictationPunctuationOnlyDifference(
                typeof user_translation === "string" ? user_translation : "",
                typeof original_chinese === "string" ? original_chinese : "",
            );
            const isPunctuationOnly = punctuationOnlyIssue || punctuationOnlyDifference;

            data.score = normalizeDictationScore(data.score, { punctuationOnly: isPunctuationOnly });

            if (isPunctuationOnly) {
                data.judge_reasoning = "核心语义完整；仅标点差异不扣分。";
                data.feedback = {
                    dictation_tips: [
                        "这题关键信息完整，标点只作可读性优化。",
                        "可在停顿处补逗号或句号，让句子层次更清晰。",
                    ],
                    encouragement: "听懂并写对核心意思很棒，继续保持。",
                };
                if (Array.isArray(data.error_analysis)) {
                    data.error_analysis = [];
                }
            }
        }

        console.log("[score_translation] Success:", { score: data.score, teaching_mode });
        return NextResponse.json(data);

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to score translation";
        console.error("Score Translation Error:", message);
        console.error("Full error:", JSON.stringify(error, null, 2));
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
