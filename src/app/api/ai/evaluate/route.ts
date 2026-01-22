import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: Request) {
    try {
        const { content, articleTitle } = await req.json();

        if (!content) {
            return NextResponse.json({ error: "Content is required" }, { status: 400 });
        }

        const prompt = `
      You are an expert IELTS examiner.
      Evaluate the following student writing task based on the article "${articleTitle}".
      
      Student Writing:
      "${content}"
      
      Provide the response in JSON format with the following structure:
      {
        "score": 7.5, // A number between 0 and 9
        "comments": [
          "Specific positive feedback",
          "Specific constructive criticism regarding vocabulary",
          "Specific constructive criticism regarding grammar/cohesion"
        ]
      }
    `;

        const completion = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
        });

        const responseContent = completion.choices[0].message.content;
        if (!responseContent) throw new Error("No content received");

        const result = JSON.parse(responseContent);
        return NextResponse.json(result);

    } catch (error) {
        console.error("DeepSeek API Error:", error);
        return NextResponse.json({ error: "Failed to evaluate writing" }, { status: 500 });
    }
}
