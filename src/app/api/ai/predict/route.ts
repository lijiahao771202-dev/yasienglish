import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export const runtime = 'edge';

function takeNextWords(text: string, count: number) {
    const match = text.trimStart().match(new RegExp(`^(\\S+\\s*){1,${count}}`));
    return match ? match[0].trimEnd() : "";
}

function getFastReferencePrediction(currentInput: string, referenceAnswer?: string) {
    if (!referenceAnswer) return "";

    const input = currentInput.trimStart();
    const reference = referenceAnswer.trimStart();
    if (!input || !reference) return "";

    if (!reference.toLowerCase().startsWith(input.toLowerCase())) {
        return "";
    }

    const remainder = reference.slice(input.length).trimStart();
    if (!remainder) {
        return "";
    }

    const nextWords = takeNextWords(remainder, 3);
    if (!nextWords) {
        return "";
    }

    if (!currentInput.endsWith(' ') && !nextWords.match(/^[.,?!]/)) {
        return ` ${nextWords}`;
    }

    return nextWords;
}

export async function POST(req: NextRequest) {
    try {
        const { sourceText, currentInput, referenceAnswer } = await req.json();

        if (!sourceText || !currentInput) {
            return NextResponse.json({ prediction: "" });
        }

        const fastPrediction = getFastReferencePrediction(currentInput, referenceAnswer);
        if (fastPrediction) {
            return NextResponse.json({ prediction: fastPrediction });
        }

        const prompt = `Return strict JSON: {"prediction": ""}.
Source: "${sourceText}"
Reference: "${referenceAnswer || 'N/A'}"
User: "${currentInput}"

Return only the next 1 to 3 words that should continue the user's English translation.
If the translation is already complete, return an empty prediction.
Do not repeat the user's existing text.
Do not include quotes or explanations.`;

        const completion = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: "You are a fast API that returns strict JSON." },
                { role: "user", content: prompt }
            ],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: 12,
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content generated");

        const data = JSON.parse(content);

        let prediction = data.prediction || "";
        if (prediction === "<END>") {
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
