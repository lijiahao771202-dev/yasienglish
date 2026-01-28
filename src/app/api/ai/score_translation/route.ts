import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
    try {
        const { user_translation, reference_english, original_chinese, current_elo, mode = "translation" } = await req.json();

        // Base Elo (Default to 1200 if undefined)
        const userElo = current_elo || 1200;

        let prompt = "";

        if (mode === "listening") {
            // Listening Mode Prompt (Phonetic Alignment + Smart Elo)
            prompt = `
            Act as an expert English Listening Coach AND a Ranking Judge.
            
            Context:
            - User Elo: ${userElo}
            - Task: Transcribe what they heard (via Speech-to-Text).
            - Reference: "${reference_english}"
            - User Input: "${user_translation}"

            **CRITICAL ALIGNMENT RULES** (Most Important):
            1. **SMART ALIGNMENT**: Do NOT use positional matching. Use PHONETIC SIMILARITY to align words.
               - If user says "Transmission" but reference has "threatens", check if they SOUND similar → phonetic_error
               - If user says "Store" but reference has "stop", check if they SOUND similar → phonetic_error
            2. **IGNORE REPETITIONS/STUTTERS**: If user repeats words (e.g., "the the US", "I... I think"), ignore the extra occurrences. Only match the CORE words.
            3. **IGNORE FALSE STARTS**: If user starts a word then corrects ("thr... threatens"), count only the final attempt.
            4. **CASE INSENSITIVE**: "The" = "the" = "THE". All are CORRECT.
            5. **PUNCTUATION**: IGNORE all punctuation differences completely.
            
            Phonetic Matching Examples:
            - "threatens" ≈ "Transmission" → phonetic_error (similar start sound)
            - "Iraq" ≈ "era" → phonetic_error (similar vowel pattern)
            - "Maliki" ≈ "Molly" → phonetic_error (ASR error)
            - "chaos" ≈ "Charles" → phonetic_error (similar start)
            - "chooses" ≈ "shows" → phonetic_error
            - "completely different word" → typo

            Elo Judgment (Based on MEANING, not word-by-word):
            - **Solid Win (+20 to +30)**: User captured the core meaning. Minor ASR errors acceptable.
            - **Marginal Win (+5 to +10)**: Meaning is mostly there, some drift.
            - **Stagnant (0)**: Hard to understand or significant drift.
            - **Loss (-5 to -15)**: Completely wrong meaning.

            **LANGUAGE REQUIREMENT**:
            - You MUST output 'judge_reasoning' and 'feedback' contents in **Simplified Chinese (简体中文)**.
            - Keep 'segments' structure as is, but 'feedback' inside segments can be Chinese if needed.

            **CRITICAL OUTPUT FORMAT**:
            Return "segments" array aligning EACH reference word to the BEST matching user word (by sound, not position).
            
            segments format:
            - "word": The correct word from reference.
            - "status": "correct" | "phonetic_error" | "missing" | "typo"
              - correct: User said this word (case insensitive)
              - phonetic_error: User said something that SOUNDS similar
              - missing: User completely skipped this word
              - typo: User said something completely different
            - "user_input": What user actually said (ONLY if status is phonetic_error or typo)

            Output JSON:
            {
                "score": 0-10, 
                "elo_adjustment": (Int),
                "judge_reasoning": "Brief ranking feedback",
                "segments": [ {word, status, user_input?} ... ],
                "feedback": { "listening_tips": ["tip1", "tip2"] }
            }
            `;
        } else {
            // Translation Mode Prompt (Smart Elo)
            prompt = `
            Act as an IELTS Examiner AND a Ranking Judge.
            
            Context:
            - User Elo: ${userElo}
            - Task: Translate Chinese to English.
            - Source: "${original_chinese}"
            - Golden: "${reference_english}"
            - User: "${user_translation}"

            Elo Judgment Rules:
            - **Breakthrough (+25 to +35)**: User used vocabulary/grammar ABOVE their current Elo ${userElo}.
            - **Standard (+10 to +15)**: Correct, but within expected difficulty.
            - **Hesitant (+2 to +5)**: Grammatically correct but awkward or "Chinglish".
            - **Fail (-5 to -15)**: Grammatical collapse or wrong meaning.

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
