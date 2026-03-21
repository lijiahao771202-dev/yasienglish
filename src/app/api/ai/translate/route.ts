import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import {
    chargeReadingCoins,
    insufficientReadingCoinsPayload,
    isReadEconomyContext,
    type ReadingEconomyContext,
} from "@/lib/reading-economy-server";

export async function POST(req: Request) {
    try {
        const { text, context, economyContext } = await req.json() as {
            text?: string;
            context?: string;
            economyContext?: ReadingEconomyContext;
        };

        if (!text) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
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
                action: economyContext?.action ?? "translate",
            }
            : null;

        if (readContext?.action) {
            const charge = await chargeReadingCoins({
                action: readContext.action,
                dedupeKey: readContext.dedupeKey,
                meta: {
                    articleUrl: readContext.articleUrl ?? null,
                    from: "api/ai/translate",
                },
            });
            if (!charge.ok && charge.insufficient) {
                return NextResponse.json(
                    insufficientReadingCoinsPayload(readContext.action, charge.required ?? 1, charge.balance),
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

        const prompt = `
      You are an expert translator.
      Translate the following English sentence to Chinese, considering the surrounding context.
      
      Context: "${context || ''}"
      Sentence to translate: "${text}"
      
      Provide ONLY the translation string.
    `;

        const completion = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
        });

        const translation = completion.choices[0].message.content?.trim();
        return NextResponse.json({
            translation,
            readingCoins: readingCoinMutation,
        });

    } catch (error) {
        console.error("Translation API Error:", error);
        return NextResponse.json({ error: "Failed to translate" }, { status: 500 });
    }
}
