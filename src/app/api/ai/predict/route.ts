import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export const runtime = 'edge';

export async function POST(req: NextRequest) {
    try {
        const { sourceText, currentInput, referenceAnswer } = await req.json();

        if (!sourceText || !currentInput) {
            return NextResponse.json({ prediction: "" });
        }

        const prompt = `
Act as an expert typing autocomplete engine.
Context:
- Original Sentence to Translate: "${sourceText}"
- Standard Reference Answer: "${referenceAnswer || 'N/A'}"
- User's Current Input: "${currentInput}"

Your Task:
The user is translating the sentence into English. They have typed the "Current Input" but paused.
Predict the logical NEXT 1 TO 3 WORDS to continue their sentence.

CRITICAL RULES:
1. ONLY output the next 1-3 words. Do NOT output the user's current input.
2. Do NOT output any explanations, punctuation at the start (unless it belongs to the next word), or quotes.
3. If the user's current input is already a COMPLETE and VALID translation of the source text, set "is_complete" to true and "prediction" to an empty string "".
4. If the user's current input has already expressed the full meaning, STOP predicting immediately. Do not loop or add redundant phrases.
5. Match the casing logically. Usually the next words are lowercase unless it's a proper noun or start of a new sentence.
6. Smoothly continue from the user's exact last word.

Output JSON format:
{
    "is_complete": boolean,
    "prediction": "the next words or empty string"
}
`;

        const completion = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: "You are a fast API that returns strict JSON." },
                { role: "user", content: prompt }
            ],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            temperature: 0.1, // Low temperature for deterministic, predictable autocomplete
            max_tokens: 50, // Keep it fast and cheap
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content generated");

        const data = JSON.parse(content);

        let prediction = data.prediction || "";
        if (data.is_complete || prediction === "<END>") {
            prediction = "";
        }

        // Clean up any leading spaces if the prompt included them by mistake
        prediction = prediction.trimStart();
        // Add a leading space so it attaches cleanly to the user's text (if user didn't end with space)
        if (prediction && !currentInput.endsWith(' ') && !prediction.match(/^[.,?!]/)) {
            prediction = ' ' + prediction;
        }

        return NextResponse.json({ prediction });

    } catch (error: any) {
        console.error("AI Predict Error:", error?.message || error);
        return NextResponse.json(
            { error: "Prediction failed", prediction: "" },
            { status: 500 }
        );
    }
}
