import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: Request) {
    try {
        const { topic } = await req.json();

        if (!topic) {
            return NextResponse.json({ error: "Topic is required" }, { status: 400 });
        }

        const prompt = `
      You are an expert content writer.
      Write a high-quality, engaging article about "${topic}".
      The article should be suitable for an English learner (CEFR Level B2/C1).
      It should be around 400-600 words.
      
      Provide the response in JSON format with the following structure:
      {
        "title": "A catchy title",
        "content": "The full article text, with paragraphs separated by double newlines.",
        "byline": "AI Generator"
      }
    `;

        const completion = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content received");

        const result = JSON.parse(content);

        // Format for frontend
        const blocks = result.content.split('\n\n').map((p: string) => ({
            type: 'paragraph',
            content: p.trim()
        })).filter((b: any) => b.content);

        return NextResponse.json({
            ...result,
            blocks,
            textContent: result.content
        });

    } catch (error) {
        console.error("Generation API Error:", error);
        return NextResponse.json({ error: "Failed to generate article" }, { status: 500 });
    }
}
