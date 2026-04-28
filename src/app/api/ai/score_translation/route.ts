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
        const { user_translation, reference_english, reference_english_alternatives = [], original_chinese, current_elo, mode = "translation", is_reverse = false, input_source = 'keyboard', teaching_mode = false, force_cloud = false, appeal_provider = 'deepseek' } = await req.json();
        const validAlternatives: string[] = Array.isArray(reference_english_alternatives)
            ? reference_english_alternatives.filter((a: unknown) => typeof a === "string" && a.trim())
            : [];
        console.log("[score_translation] Request received:", { mode, user_translation: user_translation?.substring(0, 30), current_elo, force_cloud });

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
            // Translation Mode Prompt — Comprehensive Rewrite for Gemma 4
            const taskDescription = is_reverse ? "Translate English → Chinese." : "Translate Chinese → English.";
            const sourceText = is_reverse ? reference_english : original_chinese;
            const goldenText = is_reverse ? original_chinese : reference_english;

            let eloTierName = "";
            let gradingStandard = "";
            if (userElo < 1600) {
                eloTierName = "初学者 (Beginner, Elo < 1600)";
                gradingStandard = `评分标准 — 初学者模式（宽松鼓励）:
- 10分: 意思完全正确，语法结构无误。
- 8-9分: 意思正确，仅有轻微语法或拼写瑕疵。
- 6-7分: 核心意思对了，但存在明显语法错误或漏掉了关键信息。
- 4-5分: 意思基本能猜到，但句子结构混乱或关键词汇错误。
- 1-3分: 严重偏题或几乎无法理解。
- 0分: 完全空白或与题目无关。
重要：此阶段以鼓励为主！只要核心含义传达正确，至少给 6 分。`;
            } else if (userElo < 2200) {
                eloTierName = "中级 (Intermediate, Elo 1600-2200)";
                gradingStandard = `评分标准 — 中级模式（公平对等）:
- 10分: 地道流畅，表达自然，像母语者写的。
- 8-9分: 语法正确，意思完整，表达通顺但稍显课本化。
- 6-7分: 意思正确但表达不自然，或有 1-2 处语法错误。
- 4-5分: 存在多处语法错误，或遗漏重要信息。
- 1-3分: 句子结构严重混乱，或意思偏离原文。
- 0分: 完全空白或与题目无关。`;
            } else {
                eloTierName = "高级 (Advanced C1/C2, Elo > 2200)";
                gradingStandard = `评分标准 — 高级模式（严苛精修）:
- 10分: 无可挑剔，措辞精准且有文采，媲美 native speaker。
- 8-9分: 语法无误，意思完整，但表达略显普通。
- 6-7分: 基本正确，但用词不够精准或搭配不地道。
- 4-5分: 有语法错误，在此水平不可接受。
- 1-3分: 多处错误，严重不符合该水平预期。
- 0分: 完全空白或与题目无关。
重要：此阶段对用词的精准度和地道程度有极高要求。`;
            }

            prompt = `你是一位专业的英语翻译评分官。请根据以下信息对用户的翻译进行评分。

## 题目信息
- 任务: ${taskDescription}
- 原文: "${sourceText}"
- 标准参考译文: "${goldenText}"${validAlternatives.length > 0 ? `\n- 补充参考译文（均为正确答案）:\n${validAlternatives.map((alt: string, i: number) => `  ${i + 1}. "${alt}"`).join("\n")}` : ""}
- 用户提交的译文: "${user_translation}"

## 用户水平
- 当前 Elo 等级分: ${userElo}
- 对应段位: ${eloTierName}

${gradingStandard}

## 评分规则（必须严格遵守）

### 不扣分项（以下差异完全忽略）:
1. 大小写差异: "i understand" 和 "I understand" 视为完全等价，绝不扣分。
2. 标点符号差异: 缺少句号、逗号、感叹号等一律不扣分。
3. 缩写差异: "don't" 和 "do not"、"I'm" 和 "I am" 视为等价。
4. 英美拼写差异: "colour/color"、"realise/realize" 视为等价。

### 可接受项（不应扣分或仅轻微扣分）:
1. 同义替换: 用不同但含义正确的词汇或句型，只要语义完全覆盖原文，应给高分。例如 "We intended to throw a surprise party" 和 "We planned a surprise party" 含义等价。
2. 语序微调: 只要不改变含义，语序的轻微调整不扣分。
3. 合理的时态选择: 只要时态前后一致且合理，不同时态选择不严厉扣分。

### 必须扣分项:
1. 关键信息遗漏: 漏掉原文中的重要含义（否定、数量、因果关系等）。
2. 语法错误: 主谓不一致、时态混乱、介词误用等。
3. 词汇误用: 使用错误的词导致含义改变。
4. 语义偏离: 翻译含义与原文不符。

${voiceInstruction}

## 输出要求
请直接输出 JSON，不要包含 markdown 代码块标记:
{
  "score": <0到10的整数或一位小数>,
  "judge_reasoning": "<一句简短的中文评语，说明给分理由>"
}
`;
        }

        const maxTokens = mode === "dictation"
            ? DICTATION_MAX_TOKENS
            : TRANSLATION_MAX_TOKENS;
        let completion: ScoreCompletion | null = null;
        let scoringProvider = "unknown";

        // ===== CLOUD ONLY: DeepSeek =====
        console.log("[score_translation] ☁️ Calling DeepSeek API...");
        const MAX_RETRIES = 3;
        let lastError: Error | null = null;

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
                scoringProvider = "deepseek-cloud";
                break;
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
        
        console.log(`[score_translation] Response received (via ${scoringProvider})`);

        const rawContent = completion.choices[0].message.content;
        if (!rawContent) throw new Error("No content generated");

        // Strip markdown code fences that local models (Gemma) sometimes wrap around JSON
        const content = rawContent.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
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
