import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import { getDeterministicPrediction, shouldUseRemotePrediction } from "@/lib/predictHint";

export const runtime = 'edge';

export async function POST(req: NextRequest) {
    try {
        const { sourceText, currentInput, referenceAnswer, predictionWordCount } = await req.json();
        const wordCount = Math.min(Math.max(Number(predictionWordCount) || 2, 1), 3);

        if (!sourceText || !currentInput) {
            return NextResponse.json({ prediction: "" });
        }

        const deterministicPrediction = getDeterministicPrediction(currentInput, referenceAnswer, wordCount);
        if (deterministicPrediction) {
            return NextResponse.json({ prediction: deterministicPrediction });
        }

        if (!shouldUseRemotePrediction(currentInput, referenceAnswer)) {
            return NextResponse.json({ prediction: "" });
        }

        const prompt = `Return strict JSON: {"prediction": ""}.
Source: "${sourceText}"
Reference: "${referenceAnswer || 'N/A'}"
User: "${currentInput}"

Return only the next 1 to ${wordCount} words that should continue the user's English translation.
If the translation is already complete, return an empty prediction.
If the user text already diverges from the reference, would need rewriting instead of appending, or already contains the same idea in a different wording, return an empty prediction.
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
            max_tokens: Math.min(10, wordCount * 3 + 2),
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

    } catch (error: unknown) {
        console.error("AI Predict Error:", error instanceof Error ? error.message : error);
        return NextResponse.json(
            { error: "Prediction failed", prediction: "" },
            { status: 500 }
        );
    }
}
