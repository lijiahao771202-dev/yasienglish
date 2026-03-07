import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

const LISTENING_MAX_TOKENS = 256;
const TRANSLATION_MAX_TOKENS = 220;
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
            voiceInstruction = `**IMPORTANT: TASK IS ORAL SHADOWING (SPEAKING)**
               - The user is repeating what they heard.
               - **PHONETIC MATCHING IS PARAMOUNT**.
               - Ignore strictly written rules (spelling, punctuation, capitalization).
               - If it SOUNDS correct, it IS correct.`;
        } else {
            // Translation Mode (Written Task)
            if (input_source === 'voice') {
                voiceInstruction = `**NOTE: Voice Dictation Used for Written Task**
                 - User used Speech-to-Text to write this translation.
                 - Be lenient on homophones (e.g. "sea" vs "see") and missing punctuation.
                 - BUT, Grammar and Vocabulary must still be correct for a written standard.`;
            }
        }

        // Dynamic Listening Grading Standards based on Elo
        let listeningGradingStandard = "";
        if (userElo < 1200) {
            // BEGINNER MODE: Encouragement (High Reward, Minimal Risk)
            listeningGradingStandard = `
            Rating Logic (Beginner Mode - Encouragement):
            - **Perfect Echo (+25)**: User repeated the sentence clearly (minor ASR typos ok).
            - **Good (+12)**: Missed 1-2 words but got the main flow.
            - **Mumble (+3)**: Hard to understand, but at least tried to speak.
            - **Silent/Wrong (-3)**: Completely off or no attempt.`;
        } else if (userElo < 2000) {
            // INTERMEDIATE MODE: Standard
            listeningGradingStandard = `
            Rating Logic (Intermediate Mode - Standard):
            - **Perfect Echo (+20)**: User repeated the sentence clearly (minor ASR typos ok).
            - **Good (+10)**: Missed 1-2 words but got the main flow.
            - **Mumble (0)**: Hard to understand / wrong words.
            - **Silent/Wrong (-8)**: Completely off or no attempt.`;
        } else {
            // ADVANCED MODE: Hardcore (Low Reward, Higher Risk)
            listeningGradingStandard = `
            Rating Logic (Advanced Mode - Hardcore):
            - **Perfect Echo (+12)**: User repeated the sentence clearly with good pronunciation.
            - **Good (+5)**: Missed 1-2 words but got the main flow.
            - **Mumble (-3)**: Unclear pronunciation is unacceptable at this level.
            - **Silent/Wrong (-12)**: Completely off or no attempt.`;
        }

        if (mode === "listening") {
            // Listening Mode Prompt (Phonetic Alignment + Smart Elo)
            prompt = `
            Act as an expert English Speaking Coach AND a Ranking Judge.
            
            Context:
            - Input Method: ${input_source.toUpperCase()}
            - User Elo: ${userElo}
            - Task: **Spoken Shadowing** (User repeats the audio).
            - Reference: "${reference_english}"
            - User Input: "${user_translation}"

            ${voiceInstruction}
 
            **CRITICAL ALIGNMENT RULES** (Phonetic Priority):
            1. **MATCH BY SOUND**: "right" matches "write". "transmission" does NOT match "threatens".
            2. **NUMBER EQUIVALENCE**: Numeric forms and word forms are equivalent. "7" = "seven", "700" = "seven hundred", "1st" = "first", "2024" = "twenty twenty-four".
            3. **IGNORE DISFLUENCIES**: "um", "ah", "I... I..." should be ignored.
            4. **IGNORE PUNCTUATION**: Full stop, comma, question mark -> Irrelevant.
            
            ${listeningGradingStandard}

            **LANGUAGE REQUIREMENT**:
            - Output 'judge_reasoning' and 'feedback' in **Simplified Chinese (简体中文)**.
            - Focus feedback on **Pronunciation** and **Fluency**.
 
            **CRITICAL OUTPUT FORMAT**:
            Return "segments" array using Phonetic Matching.
            
            segments format:
            - "word": Reference word.
            - "status": "correct" | "phonetic_error" | "missing" | "typo"
            - "user_input": valid only if error.
 
            Output JSON:
            {
                "score": 0-10, 
                "judge_reasoning": "Brief spoken performance review",
                "segments": [ {word, status, user_input?} ... ],
                "feedback": { "listening_tips": ["pronunciation tip", "flow tip"] }
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
             - You MUST output 'judge_reasoning', 'feedback', and 'improved_version' contents in **Simplified Chinese (简体中文)**.
  
             Output JSON:
             {
                 "score": 0-10,
                 "judge_reasoning": "Brief ranking feedback",
                 "feedback": ["Point 1", "Point 2"],
                 "improved_version": "..."
             }
             `;
        }

        console.log("[score_translation] Calling DeepSeek API...");
        const MAX_RETRIES = 3;
        const maxTokens = mode === "listening" ? LISTENING_MAX_TOKENS : TRANSLATION_MAX_TOKENS;
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

        const data = JSON.parse(content);
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
