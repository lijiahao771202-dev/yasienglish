import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: Request) {
    try {
        const { text, context } = await req.json();

        if (!text) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
        }

        const prompt = `
      You are an expert translator.
      Translate the following English sentence to Chinese, considering the surrounding context.
      
      Context: "${context || ''}"
      Sentence to translate: "${text}"
      
      Provide ONLY the translation string.
    `;

        const completion = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
        });

        const translation = completion.choices[0].message.content?.trim();
        return NextResponse.json({ translation });

    } catch (error) {
        console.error("Translation API Error:", error);
        return NextResponse.json({ error: "Failed to translate" }, { status: 500 });
    }
}
