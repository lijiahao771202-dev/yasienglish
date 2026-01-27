import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
    try {
        const { user_translation, reference_english, original_chinese } = await req.json();

        if (!user_translation || !original_chinese) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        const prompt = `
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

        const completion = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: "You are a strict IELTS examiner. Output JSON only. Feedback MUST be in Chinese." },
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
