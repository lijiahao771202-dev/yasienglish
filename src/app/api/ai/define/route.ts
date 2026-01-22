import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: Request) {
    try {
        const { word, context } = await req.json();

        if (!word || !context) {
            return NextResponse.json({ error: "Word and context are required" }, { status: 400 });
        }

        const prompt = `
      You are an expert IELTS tutor. 
      Define the word "${word}" based on its usage in the following context:
      "${context}"
      
      Provide the response in JSON format with the following structure:
      {
        "phonetic": "IPA phonetic transcription (e.g., /wɜːrd/)",
        "context_meaning": {
            "definition": "Concise definition in Chinese fitting the context (keep it short and clear)",
            "translation": "The word itself translated to Chinese based on context"
        },
        "example": "A new example sentence in English using the word in a similar context"
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
        return NextResponse.json(result);

    } catch (error) {
        console.error("DeepSeek API Error:", error);
        return NextResponse.json({ error: "Failed to fetch definition" }, { status: 500 });
    }
}
