
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || "https://api.deepseek.com",
    });
    try {
        const { action, text, context } = await req.json();

        if (action === 'generate') {
            const completion = await openai.chat.completions.create({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: "You are a helpful language tutor. Generate a random Chinese sentence for a student to translate into English. The sentence should be suitable for an intermediate learner. Return ONLY the JSON object: { \"chinese\": \"生成的中文句子\" }" },
                ],
                response_format: { type: "json_object" }
            });
            const result = JSON.parse(completion.choices[0].message.content || "{}");
            return NextResponse.json(result);
        }

        if (action === 'score') {
            const completion = await openai.chat.completions.create({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: "You are a helpful language tutor. Evaluate the student's English translation of the given Chinese sentence. Return ONLY the JSON object: { \"score\": 0-100, \"feedback\": \"Concise feedback in CHINESE (中文) explaining the score and offering corrections if needed.\", \"revised_text\": \"The perfect/corrected English translation\" }" },
                    { role: "user", content: `Chinese: ${context}\nStudent Translation: ${text}` }
                ],
                response_format: { type: "json_object" }
            });
            const result = JSON.parse(completion.choices[0].message.content || "{}");
            return NextResponse.json(result);
        }

        if (action === 'chat') {
            const { history, question, context } = await req.json();
            const completion = await openai.chat.completions.create({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: `You are a helpful language tutor explaining a specific translation. Context Chinese: "${context}". Please answer the student's question specifically about the translation and grammar. Keep it concise.` },
                    ...history, // [{role: "user", content: "..."}]
                    { role: "user", content: question }
                ]
            });
            return NextResponse.json({ answer: completion.choices[0].message.content });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('Error in translation API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
