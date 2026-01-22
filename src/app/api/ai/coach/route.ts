import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { originalText, transcript } = await req.json();

        if (!originalText || !transcript) {
            return NextResponse.json({ error: 'Missing text or transcript' }, { status: 400 });
        }

        const prompt = `
        Role: You are an expert English pronunciation coach.
        Task: Analyze the user's speech transcript against the original text.
        
        Original Text: "${originalText}"
        User Transcript: "${transcript}"
        
        Instructions:
        1. Compare the transcript to the original text.
        2. Identify specific pronunciation issues (e.g., missing words, wrong words, linking errors).
        3. Provide 3 concise, actionable tips to improve.
        4. Keep the tone encouraging but professional.
        5. Output ONLY JSON in the following format (ensure all values are in Chinese):
        {
            "issues": ["问题 1", "问题 2"],
            "tips": ["建议 1", "建议 2", "建议 3"],
            "encouragement": "Short encouraging phrase in Chinese"
        }
        `;

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: "You are a helpful AI English coach." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            throw new Error('DeepSeek API failed');
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        const feedback = JSON.parse(content);

        return NextResponse.json(feedback);

    } catch (error: any) {
        console.error('AI Coach Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
