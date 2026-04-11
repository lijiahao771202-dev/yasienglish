import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import {
    getAdaptivePredictionWordCount,
    getDeterministicPrediction,
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
    let trimmed = content.trim();
    
    // Attempt to extract the first valid JSON object block (greedy to handle nested braces)
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]) as { prediction?: string, replaceLen?: number, replaceStr?: string, replaceTarget?: string };
            
            let finalReplaceLen = parsed.replaceLen || 0;
            if (parsed.replaceTarget) {
                const targetLower = parsed.replaceTarget.trim().toLowerCase();
                const inputLower = currentInput.toLowerCase();
                if (inputLower.endsWith(targetLower)) {
                    finalReplaceLen = parsed.replaceTarget.trim().length;
                } else if (inputLower.endsWith(targetLower + " ")) {
                    finalReplaceLen = parsed.replaceTarget.trim().length + 1;
                } else {
                    // Fuzzy match: If the model removed punctuation (like two car's -> two cars), 
                    // find the first word of the target and delete everything after it.
                    const firstWord = targetLower.split(/\s+/)[0];
                    if (firstWord) {
                        const lastIndex = inputLower.lastIndexOf(firstWord);
                        if (lastIndex !== -1 && lastIndex > inputLower.length - 25) {
                            finalReplaceLen = inputLower.length - lastIndex;
                        }
                    }
                }
            }

            return {
                prediction: normalizeRemotePrediction(currentInput, parsed.prediction || "", wordCount),
                replaceLen: finalReplaceLen,
                replaceStr: parsed.replaceStr || ""
            };
        } catch {
            // Unparseable JSON object, fall through to fallback
        }
    }


        const recovered = extractPredictionField(trimmed);
        if (recovered) {
            return {
                prediction: normalizeRemotePrediction(currentInput, recovered, wordCount),
                replaceLen: 0,
                replaceStr: ""
            };
        }
        // If all JSON parsing completely fails, assume the entire content is the predicted string
        // but strip out any lingering JSON key literals if the model got hopelessly confused
        const sanitizedFallback = trimmed
            .replace(/[{}"\n]/g, "")
            .replace(/^prediction\s*:\s*/i, "")
            .trim();
            
        return {
            prediction: normalizeRemotePrediction(currentInput, sanitizedFallback, wordCount),
            replaceLen: 0,
            replaceStr: ""
        };
}

export async function POST(req: NextRequest) {
    try {
        const { sourceText, currentInput, referenceAnswer, predictionWordCount } = await req.json();
        const requestedWordCount = Math.min(Math.max(Number(predictionWordCount) || 2, 1), 3);

        if (!sourceText || !currentInput) {
            return NextResponse.json({ prediction: "" });
        }

        const wordCount = getAdaptivePredictionWordCount(currentInput, requestedWordCount);

        const deterministicPrediction = getDeterministicPrediction(currentInput, referenceAnswer, wordCount);
        if (deterministicPrediction) {
            return NextResponse.json({ 
                prediction: deterministicPrediction.append,
                replaceLen: deterministicPrediction.replaceLen,
                replaceStr: deterministicPrediction.replaceStr
            });
        }

        if (!shouldUseRemotePrediction(currentInput)) {
            return NextResponse.json({ prediction: "" });
        }

        const prompt = `Return strict JSON: {"prediction": "", "replaceLen": 0, "replaceStr": ""}.
Chinese source: "${sourceText}"
Reference translation: "${referenceAnswer || 'N/A'}"
Current user text: "${currentInput}"

CRITICAL INSTRUCTION (SEMANTIC RESCUE): 
The user is attempting to translate the Chinese source, but they may have made a spelling error, used the wrong synonym, or deviated from the Reference wording.
If the user's text diverges from the perfect Reference trajectory, YOU MUST CORRECT THEM using the REPLACEMENT fields.
- "replaceTarget": The exact incorrect word(s) at the very end of the user's text that need to be deleted.
- "replaceStr": The correct vocabulary word(s) from the Reference to insert instead.
- "prediction": Any remaining words from the Reference to append AFTER the replacement (max ${wordCount} words).

EXAMPLES OF REQUIRED BEHAVIOR:
User text: "the staff predite"
Reference: "The staff leaked the party"
{"replaceTarget": "predite", "replaceStr": "leaked", "prediction": " the party"}

User text: "I need a huge"
Reference: "I need an oversized shirt"
{"replaceTarget": "huge", "replaceStr": "oversized", "prediction": " shirt"}

User text: "i really sorry"
Reference: "I sincerely apologize because"
{"replaceTarget": "really sorry", "replaceStr": "sincerely apologize", "prediction": " because"}

User text: "This is perfectly"
Reference: "This is perfectly fine"
{"replaceTarget": "", "replaceStr": "", "prediction": " fine"}

Important guidelines:
- Always prefer correcting the user onto the Reference trajectory if they are stuck or flawed.
- "replaceTarget" MUST be an exact substring match of the end of the user's text! Do not guess.
- Return ONLY JSON string, with no markdown code blocks or explanations.`;

        const completion = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: "You are a fast API that returns strict JSON." },
                { role: "user", content: prompt }
            ],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            temperature: 0,
            // Increase max_tokens significantly to ensure the LLM has enough room to output the full JSON structure (overhead of keys)
            max_tokens: Math.min(60, wordCount * 10 + 40),
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content generated");
        
        try {
            require('fs').appendFileSync('yasi_debug_llm.txt', '\n--- INPUT: ' + currentInput + '\n' + content + '\n');
        } catch {}

        const parsedPayload = parsePredictionContent(content, currentInput, wordCount);
        
        let finalPayload = parsedPayload;
        if (!parsedPayload.prediction && !parsedPayload.replaceLen) {
            const suffixFallback = getSuffixAlignedPrediction(currentInput, referenceAnswer, wordCount);
            if (suffixFallback) {
                finalPayload = {
                    prediction: suffixFallback.append,
                    replaceLen: suffixFallback.replaceLen,
                    replaceStr: suffixFallback.replaceStr
                };
            }
        }
        
        return NextResponse.json(finalPayload);

    } catch (error: unknown) {
        console.error("AI Predict Error:", error instanceof Error ? error.message : error);
        return NextResponse.json(
            { error: "Prediction failed", prediction: "" },
            { status: 500 }
        );
    }
}
// Force rebuild
// turbopack invalidation Sat Apr 11 01:19:58 CST 2026
