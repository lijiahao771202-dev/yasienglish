import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: Request) {
    try {
        const { word, context } = await req.json();

        if (!word) {
            return NextResponse.json({ error: "Word is required" }, { status: 400 });
        }

        const normalizedContext = typeof context === "string" ? context.trim() : "";
        const prompt = normalizedContext
            ? `
You are an expert IELTS tutor.
Define the word "${word}" based on its usage in the following context:
"${normalizedContext}"

Provide the response in JSON format with the following structure:
{
  "phonetic": "IPA phonetic transcription (e.g., /wɜːrd/)",
  "context_meaning": {
      "definition": "Concise definition in Chinese fitting the context (keep it short and clear)",
      "translation": "The word itself translated to Chinese based on context"
  },
  "example": "A new example sentence in English using the word in a similar context"
}
`
            : `
You are an expert IELTS tutor.
The user is adding a vocabulary word: "${word}".
Please provide a learner-friendly Chinese meaning and one short English example sentence.

Provide the response in JSON format with the following structure:
{
  "phonetic": "IPA phonetic transcription (e.g., /wɜːrd/)",
  "context_meaning": {
      "definition": "Concise Chinese explanation for IELTS learners",
      "translation": "The core Chinese translation of the word"
  },
  "example": "A short practical English example sentence"
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
