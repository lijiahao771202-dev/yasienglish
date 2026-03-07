import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import {
    getAdaptivePredictionWordCount,
    getExactPrefixPrediction,
    getSuffixAlignedPrediction,
    shouldUseRemotePrediction,
} from "@/lib/predictHint";

export const runtime = 'edge';

function takeNextWords(text: string, count: number) {
    const match = text.trimStart().match(new RegExp(`^(\\S+\\s*){1,${count}}`));
    return match ? match[0].trimEnd() : "";
}

function normalizeRemotePrediction(currentInput: string, rawPrediction: string, wordCount: number) {
    let prediction = rawPrediction
        .replace(/^\s*["'{[]+/, "")
        .replace(/["'}\]]+\s*$/, "")
        .replace(/^prediction\s*:\s*/i, "")
        .trim();

    if (!prediction || prediction === "<END>") {
        return "";
    }

    if (
        /^prediction["']?\s*:?\s*$/i.test(prediction) ||
        /^prediction["']?\s*:/i.test(prediction) ||
        !/[a-z0-9]/i.test(prediction)
    ) {
        return "";
    }

    const current = currentInput.trim();
    if (current && prediction.toLowerCase().startsWith(current.toLowerCase())) {
        prediction = prediction.slice(current.length).trimStart();
    }

    prediction = takeNextWords(prediction, wordCount);
    if (!prediction) {
        return "";
    }

    if (!currentInput.endsWith(" ") && !prediction.match(/^[.,?!]/)) {
        prediction = ` ${prediction}`;
    }

    return prediction;
}

function extractPredictionField(content: string) {
    const keyMatch = content.match(/"prediction"\s*:\s*"/i);
    if (!keyMatch || keyMatch.index === undefined) {
        return "";
    }

    let index = keyMatch.index + keyMatch[0].length;
    let rawValue = "";

    while (index < content.length) {
        const character = content[index];

        if (character === "\\") {
            const nextCharacter = content[index + 1];
            if (nextCharacter === undefined) {
                break;
            }
            rawValue += character + nextCharacter;
            index += 2;
            continue;
        }

        if (character === '"') {
            break;
        }

        rawValue += character;
        index += 1;
    }

    if (!rawValue.trim()) {
        return "";
    }

    try {
        return JSON.parse(`"${rawValue}"`) as string;
    } catch {
        return rawValue
            .replace(/\\n/g, " ")
            .replace(/\\"/g, '"')
            .trim();
    }
}

function parsePredictionContent(content: string, currentInput: string, wordCount: number) {
    const trimmed = content.trim();

    try {
        const parsed = JSON.parse(trimmed) as { prediction?: string };
        return normalizeRemotePrediction(currentInput, parsed.prediction || "", wordCount);
    } catch {
        const recovered = extractPredictionField(trimmed);
        if (recovered) {
            return normalizeRemotePrediction(currentInput, recovered, wordCount);
        }

        return normalizeRemotePrediction(currentInput, trimmed, wordCount);
    }
}

export async function POST(req: NextRequest) {
    try {
        const { sourceText, currentInput, referenceAnswer, predictionWordCount } = await req.json();
        const requestedWordCount = Math.min(Math.max(Number(predictionWordCount) || 2, 1), 3);

        if (!sourceText || !currentInput) {
            return NextResponse.json({ prediction: "" });
        }

        const wordCount = getAdaptivePredictionWordCount(currentInput, requestedWordCount);

        const deterministicPrediction = getExactPrefixPrediction(currentInput, referenceAnswer, wordCount);
        if (deterministicPrediction) {
            return NextResponse.json({ prediction: deterministicPrediction });
        }

        if (!shouldUseRemotePrediction(currentInput)) {
            return NextResponse.json({ prediction: "" });
        }

        const prompt = `Return strict JSON: {"prediction": ""}.
Chinese source: "${sourceText}"
Reference translation (one possible version, not mandatory): "${referenceAnswer || 'N/A'}"
Current user text: "${currentInput}"

Return only the next 1 to ${wordCount} words that should CONTINUE the user's current English sentence.
Important:
- Keep following the user's current wording and sentence structure.
- The user does NOT need to match the reference wording exactly.
- Different valid translations are allowed if they still match the Chinese source.
- Prefer a natural continuation in the user's own phrasing over copying the reference wording.
- If multiple valid continuations exist, choose the most common and least committal short continuation.
- The continuation must fit IMMEDIATELY after the user's last word and remain locally grammatical.
- Prefer finishing the current phrase first; do not jump ahead to a later clause.
- If the user ends on a preposition or article (like "in", "at", "the"), continue that noun phrase naturally.
- Do not rewrite or replace earlier words.
- If the user text already looks complete, return an empty prediction.
- If no short continuation is clearly helpful, return an empty prediction.
- The value of "prediction" must be only actual continuation words, never JSON fragments or labels like prediction, colon, quotes, or braces.
Return JSON only, with no explanations.`;

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

        const prediction = parsePredictionContent(content, currentInput, wordCount)
            || getSuffixAlignedPrediction(currentInput, referenceAnswer, wordCount);

        return NextResponse.json({ prediction });

    } catch (error: unknown) {
        console.error("AI Predict Error:", error instanceof Error ? error.message : error);
        return NextResponse.json(
            { error: "Prediction failed", prediction: "" },
            { status: 500 }
        );
    }
}
