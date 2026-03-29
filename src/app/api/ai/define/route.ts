import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import {
    chargeReadingCoins,
    insufficientReadingCoinsPayload,
    isReadEconomyContext,
    type ReadingEconomyContext,
} from "@/lib/reading-economy-server";
import { normalizeHighlightedMeanings, type MeaningGroup } from "@/lib/vocab-meanings";

export async function POST(req: Request) {
    try {
        const { word, context, economyContext, uiSurface } = await req.json() as {
            word?: string;
            context?: string;
            economyContext?: ReadingEconomyContext;
            uiSurface?: string;
        };

        if (!word) {
            return NextResponse.json({ error: "Word is required" }, { status: 400 });
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
                action: economyContext?.action ?? "word_deep_analyze",
            }
            : null;

        if (readContext?.action) {
            const charge = await chargeReadingCoins({
                action: readContext.action,
                dedupeKey: readContext.dedupeKey,
                meta: {
                    articleUrl: readContext.articleUrl ?? null,
                    word,
                    from: "api/ai/define",
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

        const normalizedContext = typeof context === "string" ? context.trim() : "";
        const isBattlePopup = uiSurface === "battle_word_popup";
        const systemPrompt = isBattlePopup
            ? "You are a fast IELTS vocabulary coach. Return compact JSON only. Prefer speed and clarity over detail."
            : "You are an expert IELTS tutor. Return valid JSON only.";
        const userPrompt = normalizedContext
            ? isBattlePopup
                ? [
                    `Word or phrase: "${word}"`,
                    `Local context: "${normalizedContext}"`,
                    'Return JSON: {"phonetic":"IPA or empty string","context_meaning":{"definition":"用中文解释这句话里它的意思，限1句","translation":"对应中文"},"example":"简短英文例句，没有就空字符串","meaning_groups":[{"pos":"v.","meanings":["释义1","释义2"]}],"highlighted_meanings":["最常用释义"]}',
                    "Keep the answer short.",
                ].join("\n")
                : [
                    `Define the word "${word}" based on its usage in the following context:`,
                    `"${normalizedContext}"`,
                    'Return JSON: {"phonetic":"IPA phonetic transcription","context_meaning":{"definition":"Concise definition in Chinese fitting the context","translation":"The word itself translated to Chinese based on context"},"example":"A new example sentence in English using the word in a similar context","meaning_groups":[{"pos":"v.","meanings":["释义1","释义2"]}],"highlighted_meanings":["最常用释义"]}',
                ].join("\n")
            : [
                `The user is adding a vocabulary word: "${word}".`,
                'Return JSON: {"phonetic":"IPA phonetic transcription","context_meaning":{"definition":"Concise Chinese explanation for IELTS learners","translation":"The core Chinese translation of the word"},"example":"A short practical English example sentence","meaning_groups":[{"pos":"n.","meanings":["释义1","释义2"]}],"highlighted_meanings":["最常用释义"]}',
            ].join("\n");

        const completion = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            temperature: isBattlePopup ? 0.2 : 0.3,
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content received");

        const result = JSON.parse(content);
        const meaningGroups = Array.isArray(result?.meaning_groups)
            ? (result.meaning_groups as MeaningGroup[])
                .filter((group) => group && typeof group.pos === "string" && Array.isArray(group.meanings))
                .map((group) => ({
                    pos: group.pos,
                    meanings: group.meanings
                        .map((meaning) => String(meaning || "").trim())
                        .filter(Boolean)
                        .slice(0, 6),
                }))
                .filter((group) => group.meanings.length > 0)
            : [];
        const highlightedMeanings = normalizeHighlightedMeanings(result?.highlighted_meanings);

        return NextResponse.json({
            ...result,
            phonetic: typeof result?.phonetic === "string" ? result.phonetic : "",
            meaning_groups: meaningGroups,
            highlighted_meanings: highlightedMeanings,
            readingCoins: readingCoinMutation,
        });

    } catch (error) {
        console.error("DeepSeek API Error:", error);
        return NextResponse.json({ error: "Failed to fetch definition" }, { status: 500 });
    }
}
