import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: Request) {
    try {
        const { text, question } = await req.json();

        if (!text || !question) {
            return NextResponse.json({ error: "Text and question are required" }, { status: 400 });
        }

        const prompt = `
        You are a helpful English tutor.
        
        Context Paragraph: "${text}"
        
        User Question: "${question}"

        Answer the user's question based strictly on the provided paragraph. 
        If the answer cannot be found in the paragraph, say so politely.
        Provide the answer in Simplified Chinese (简体中文) to help the learner understand.
        Keep the answer concise and clear.
        `;

        const completion = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
            temperature: 0.3,
        });

        const answer = completion.choices[0].message.content;

        return NextResponse.json({ answer });

    } catch (error) {
        console.error("Ask AI Error:", error);
        return NextResponse.json({ error: "Failed to get answer" }, { status: 500 });
    }
}
