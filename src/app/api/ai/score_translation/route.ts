import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
    try {
        const { user_translation, reference_english, original_chinese, current_elo, mode = "translation", is_reverse = false, input_source = 'keyboard' } = await req.json();

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
            2. **IGNORE DISFLUENCIES**: "um", "ah", "I... I..." should be ignored.
            3. **IGNORE PUNCTUATION**: Full stop, comma, question mark -> Irrelevant.
            
            Rating Logic:
            - **Perfect Echo (+20)**: User repeated the sentence clearly (minor ASR typos ok).
            - **Good (+10)**: Missed 1-2 words but got the main flow.
            - **Mumble (0)**: Hard to understand / wrong words.
            - **Silent/Wrong (-10)**: Completely off.

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
                "elo_adjustment": (Int),
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
            if (userElo < 1200) {
                // BEGINNER MODE: Encouragement (High Reward, Low Risk)
                gradingStandard = `
                 Elo Grading Standards (Beginner Mode):
                 - **Excellent (+25 to +30)**: Correct meaning and structure.
                 - **Good (+10 to +15)**: Understandable but with minor errors.
                 - **Fair (+5)**: Meaning is clear but grammar is shaky.
                 - **Askew (-5)**: Meaning is wrong.
                 `;
            } else if (userElo < 2000) {
                // INTERMEDIATE MODE: Fair Game (Symmetric)
                gradingStandard = `
                 Elo Grading Standards (Intermediate Mode):
                 - **Sophisticated (+20)**: Native-like phrasing using B2 vocabulary.
                 - **Accurate (+10)**: Correct grammar and meaning. Standard.
                 - **Clumsy (-5)**: "Chinglish" or awkward phrasing.
                 - **Error (-15)**: Grammatical faults.
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
                 "elo_adjustment": (Int),
                 "judge_reasoning": "Brief ranking feedback",
                 "feedback": ["Point 1", "Point 2"],
                 "improved_version": "..."
             }
             `;
        }

        const completion = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful AI tutor. Output JSON only." },
                { role: "user", content: prompt }
            ],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            temperature: 0.7,
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content generated");

        const data = JSON.parse(content);
        return NextResponse.json(data);

    } catch (error) {
        console.error("Score Translation Error:", error);
        return NextResponse.json(
            { error: "Failed to score translation" },
            { status: 500 }
        );
    }
}
