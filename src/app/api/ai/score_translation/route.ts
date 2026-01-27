import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
    try {
        const { user_translation, reference_english, original_chinese, mode = "translation" } = await req.json();

        if (!user_translation || !original_chinese) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        let prompt = "";

        if (mode === "listening") {
            // Listening Mode Prompt
            prompt = `
            Act as a lenient English Listening Coach.
            The student listened to an audio clip and tried to transcribe it.

            Reference Transcript (Correct Answer):
            "${reference_english}"

            Student Transcription:
            "${user_translation}"

            Evaluation Criteria for Listening:
            1. **IGNORE**: Punctuation, capitalization, and minor spacing errors.
            2. **IGNORE**: Filler words (um, uh) unless they change meaning.
            3. **FOCUS ON**: Did they capture the correct words and sequence?
            4. **LENIENCY**: Homophones or very close spelling errors should be penalized minimally.

            Task:
            1. Score the transcription from 0 to 10.
               - 10: Perfect match (ignoring case/punctuation).
               - 8-9: Missed 1-2 minor words (a, the) or slight spelling error.
               - <6: Missed key content words.
            2. Provide 2-3 specific feedback points in CHINESE (Simplified). Focus on what they misheard (e.g. "You missed the linking sound in...").
            3. Provide the "Improved Version" (which is just the Reference Transcript, corrected for any minor valid variations the student might have had).

            Output strictly in JSON format:
            {
                "score": 9.5,
                "feedback": ["漏听了连读...", "注意单词拼写..."],
                "improved_version": "${reference_english}"
            }
            `;
        } else {
            // Translation Mode Prompt (Original)
            prompt = `
            Act as a strict IELTS examiner.
            The student was asked to translate this Chinese sentence into English:
            "${original_chinese}"

            The reference (Golden) translation is:
            "${reference_english}"

            The student wrote:
            "${user_translation}"

            Evaluation Criteria:
            1. Accuracy of meaning vs the Chinese source.
            2. Grammar and sentence structure.
            3. Vocabulary choice (lexical resource).

            Task:
            1. Score the translation from 0 to 10.
            2. Provide 2-3 specific, constructive feedback points in CHINESE (Simplified). Explain what was wrong and why.
            3. Provide an "Improved Version" of the student's translation.

            Output strictly in JSON format:
            {
                "score": 7.5,
                "feedback": ["你的时态用错了...", "建议使用..."],
                "improved_version": "Better English sentence"
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
