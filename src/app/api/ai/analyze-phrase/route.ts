import { NextResponse } from "next/server";
import { createDeepSeekClientForCurrentUser } from "@/lib/deepseek";
import {
    chargeReadingCoins,
    insufficientReadingCoinsPayload,
    isReadEconomyContext,
    type ReadingEconomyContext,
} from "@/lib/reading-economy-server";

export async function POST(req: Request) {
    try {
        const { text, selection, economyContext } = await req.json() as {
            text?: string;
            selection?: string;
            economyContext?: ReadingEconomyContext;
        };

        if (!text || !selection) {
            return NextResponse.json(
                { error: "Text and selection are required" },
                { status: 400 }
            );
        }

        let readingCoinMutation: {
            balance: number;
            delta: number;
            applied: boolean;
            action: string;
        } | null = null;
        const readContext = isReadEconomyContext(economyContext)
            ? {
                ...economyContext,
                action: economyContext?.action ?? "analyze_phrase",
            }
            : null;

        if (readContext?.action) {
            const charge = await chargeReadingCoins({
                action: readContext.action,
                dedupeKey: readContext.dedupeKey,
                meta: {
                    articleUrl: readContext.articleUrl ?? null,
                    from: "api/ai/analyze-phrase",
                },
            });
            if (!charge.ok && charge.insufficient) {
                return NextResponse.json(
                    insufficientReadingCoinsPayload(readContext.action, charge.required ?? 2, charge.balance),
                    { status: 402 },
                );
            }
            readingCoinMutation = {
                balance: charge.balance,
                delta: charge.delta,
                applied: charge.applied,
                action: charge.action,
            };
        }

        const systemPrompt = `You are an expert English-Chinese translator and tutor.
The user has selected a text segment. Analyze it in the context of the paragraph.

Return a JSON object with the following structure (ALL values must be in Simplified Chinese):
{
  "translation": "Natural, fluent Chinese translation",
  "grammar_point": "Concise explanation of the key grammatical structure in Chinese (max 1 sentence)",
  "nuance": "Any idiomatic usage, tone, or cultural context in Chinese (optional, empty if none)",
  "vocabulary": [
    { "word": "key English term", "definition": "Brief definition in Chinese" }
  ]
}

Ensure the translation is elegant and all explanations are in Chinese.`;

        const userPrompt = `
Full Paragraph:
"${text}"

Selected Text:
"${selection}"

Analyze the selected text.
`;

        const deepseek = await createDeepSeekClientForCurrentUser();
        const completion = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
        });

        const content = completion.choices[0].message.content;
        const result = content ? JSON.parse(content) : null;

        return NextResponse.json({
            ...(result ?? {}),
            readingCoins: readingCoinMutation,
        });
    } catch (error) {
        console.error("Error in analyze-phrase:", error);
        return NextResponse.json(
            { error: "Failed to analyze phrase" },
            { status: 500 }
        );
    }
}
