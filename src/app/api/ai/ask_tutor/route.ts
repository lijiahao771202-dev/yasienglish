import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
    try {
        const { query, drillContext, articleTitle } = await req.json();

        if (!query || !drillContext) {
            return NextResponse.json(
                { error: "Query and drill context are required" },
                { status: 400 }
            );
        }

        const prompt = `
        You are a friendly and helpful English tutor. The user is currently doing a translation drill based on the article "${articleTitle}".
        
        Current Drill Sentence (Chinese): "${drillContext.chinese}"
        Target English Vocab: ${JSON.stringify(drillContext.key_vocab)}
        Golden Reference: "${drillContext.reference_english}"

        User's Question: "${query}"

        Task:
        Answer the user's question to help them translate the sentence.
        - If they ask for a hint, give a subtle clue (e.g., "Think about using the word 'despite' here").
        - If they ask about grammar, explain the structure used in the Golden Reference.
        - DO NOT just give them the full answer unless they explicitly give up and ask for it.
        - Keep your answer concise (1-2 sentences).

        Return only the answer text.
        `;

        const completion = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful tutor. Be concise and encouraging." },
                { role: "user", content: prompt }
            ],
            model: "deepseek-chat",
            temperature: 0.7,
        });

        const answer = completion.choices[0].message.content;

        return NextResponse.json({ answer });

    } catch (error) {
        console.error("Ask Tutor Error:", error);
        return NextResponse.json(
            { error: "Failed to get help" },
            { status: 500 }
        );
    }
}
