import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: Request) {
    try {
        const { originalText, userTranslation } = await req.json();

        if (!originalText || !userTranslation) {
            return NextResponse.json({ error: "Original text and user translation are required" }, { status: 400 });
        }

        const prompt = `
      You are an expert translation tutor.
      Evaluate the following translation from English to Chinese.
      
      Original English: "${originalText}"
      Student Translation: "${userTranslation}"
      
      Provide the response in JSON format with the following structure:
      {
        "score": 85, // A number between 0 and 100 based on accuracy and fluency
        "feedback": "A concise comment on the overall quality.",
        "better_translation": "A more natural and accurate Chinese translation.",
        "corrections": [
          { 
            "segment": "The part of the student translation that needs improvement", 
            "correction": "The corrected version", 
            "reason": "Brief explanation (grammar, nuance, wrong meaning)" 
          }
        ]
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
        console.error("Critique API Error:", error);
        return NextResponse.json({ error: "Failed to critique translation" }, { status: 500 });
    }
}
