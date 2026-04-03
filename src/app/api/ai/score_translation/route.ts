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
const CJK_CHAR_REGEX = /[\u3400-\u9fff]/;
const LATIN_CHAR_REGEX = /[a-zA-Z]/;

type ScoreCompletion = {
    choices: Array<{
        message: {
            content: string | null;
        };
    }>;
};

function clampScoreToTen(value: unknown, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return Math.max(0, Math.min(10, fallback));
    return Math.max(0, Math.min(10, numeric));
}

function normalizeChineseForSimilarity(text: string) {
    return text.replace(/[^\u3400-\u9fff0-9]/g, "");
}

function splitBigrams(text: string) {
    if (text.length < 2) return text.length ? [text] : [];
    const bigrams: string[] = [];
    for (let index = 0; index < text.length - 1; index += 1) {
        bigrams.push(text.slice(index, index + 2));
    }
    return bigrams;
}

function computeDiceSimilarity(left: string, right: string) {
    const leftBigrams = splitBigrams(left);
    const rightBigrams = splitBigrams(right);
    if (!leftBigrams.length || !rightBigrams.length) return 0;
    const rightCounts = new Map<string, number>();
    for (const token of rightBigrams) {
        rightCounts.set(token, (rightCounts.get(token) ?? 0) + 1);
    }
    let overlap = 0;
    for (const token of leftBigrams) {
        const count = rightCounts.get(token) ?? 0;
        if (count > 0) {
            overlap += 1;
            rightCounts.set(token, count - 1);
        }
    }
    return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function applyTranslationSanityGuard(params: {
    score: number;
    userTranslation: string;
    goldenText: string;
    isReverse: boolean;
}) {
    const userText = typeof params.userTranslation === "string" ? params.userTranslation.trim() : "";
    if (!userText) {
        return {
            score: 0,
            forcedReasoning: "答案为空，暂未形成有效翻译。",
        };
    }

    if (params.isReverse) {
        if (!CJK_CHAR_REGEX.test(userText)) {
            return {
                score: Math.min(params.score, 2),
                forcedReasoning: "答案与题型不匹配：本题需中文翻译，请先写出中文主干。",
            };
        }

        const normalizedUser = normalizeChineseForSimilarity(userText);
        const normalizedGolden = normalizeChineseForSimilarity(params.goldenText || "");
        if (normalizedUser.length <= 2) {
            return {
                score: Math.min(params.score, 2),
                forcedReasoning: "答案过短，信息不足，建议先写出主谓宾核心意思。",
            };
        }

        if (normalizedGolden.length >= 4) {
            const similarity = computeDiceSimilarity(normalizedUser, normalizedGolden);
            if (similarity < 0.08) {
                return {
                    score: Math.min(params.score, 3),
                    forcedReasoning: "与参考语义偏离较大，请先确保主干意思一致。",
                };
            }
            if (similarity < 0.14) {
                return {
                    score: Math.min(params.score, 5),
                    forcedReasoning: "语义对齐不足，建议补全关键信息再优化表达。",
                };
            }
        }
    } else if (!LATIN_CHAR_REGEX.test(userText)) {
        return {
            score: Math.min(params.score, 2),
            forcedReasoning: "答案与题型不匹配：本题需英文翻译，请先写出英文句子。",
        };
    }

    return { score: params.score };
}

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
        } else {
            // Always normalize translation/listening-family score to 0-10 to prevent model format drift.
            const normalizedScore = clampScoreToTen(data.score, 0);
            const sanityGuard = applyTranslationSanityGuard({
                score: normalizedScore,
                userTranslation: typeof user_translation === "string" ? user_translation : "",
                goldenText: typeof original_chinese === "string" ? original_chinese : "",
                isReverse: Boolean(is_reverse),
            });
            data.score = sanityGuard.score;
            if (sanityGuard.forcedReasoning) {
                data.judge_reasoning = sanityGuard.forcedReasoning;
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
