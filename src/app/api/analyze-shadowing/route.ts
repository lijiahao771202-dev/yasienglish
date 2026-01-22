import { NextResponse } from 'next/server';
import { deepseek } from '@/lib/deepseek';

export async function POST(request: Request) {
    try {
        const { originalText, spokenText, phonetics } = await request.json();

        if (!originalText || !spokenText) {
            return NextResponse.json(
                { error: "Missing originalText or spokenText" },
                { status: 400 }
            );
        }

        const systemPrompt = `
You are an expert IELTS speaking coach. Your task is to evaluate a student's shadowing performance.
Compare the "Original Text" with the "Spoken Text".
Analyze the pronunciation, accuracy, and fluency.
If "Phonetic Analysis" is provided, use it to identify specific mispronunciations.

Provide the output in JSON format with the following structure:
{
    "score": number, // 0-100
    "feedback": string, // A brief, encouraging comment (max 2 sentences)
    "corrections": [
        {
            "word": string, // The word that was mispronounced or missed
            "issue": string, // "Mispronounced", "Missing", "Extra"
            "tip": string // Brief tip on how to fix it
        }
    ]
}
`;

        const userPrompt = `
Original Text: "${originalText}"
Spoken Text: "${spokenText}"
Phonetic Analysis: ${JSON.stringify(phonetics || [])}
`;

        const completion = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        if (!content) {
            throw new Error("No content received from DeepSeek");
        }

        const analysis = JSON.parse(content);

        return NextResponse.json(analysis);

    } catch (error) {
        console.error("[Analysis API] Error:", error);
        return NextResponse.json(
            { error: "Failed to analyze shadowing" },
            { status: 500 }
        );
    }
}
