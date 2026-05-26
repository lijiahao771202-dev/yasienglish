import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import {
    chargeReadingCoins,
    insufficientReadingCoinsPayload,
    isReadEconomyContext,
    type ReadingEconomyContext,
} from "@/lib/reading-economy-server";

interface TranslateRequestPayload {
    text?: string;
    context?: string;
    economyContext?: ReadingEconomyContext;
}

interface TranslateSentenceResult {
    sentence: string;
    translation: string;
    phraseTranslations?: Array<{
        source: string;
        translation: string;
    }>;
}

interface TranslateResponsePayload {
    translation: string;
    sentenceTranslations: TranslateSentenceResult[];
}

function sanitizeSentenceTranslations(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const sentence = typeof (item as { sentence?: unknown }).sentence === "string"
                ? (item as { sentence: string }).sentence.trim()
                : "";
            const translation = typeof (item as { translation?: unknown }).translation === "string"
                ? (item as { translation: string }).translation.trim()
                : "";
            const phraseTranslations = Array.isArray((item as { phraseTranslations?: unknown }).phraseTranslations)
                ? ((item as { phraseTranslations: unknown[] }).phraseTranslations)
                    .map((phrase) => {
                        if (!phrase || typeof phrase !== "object") return null;
                        const source = typeof (phrase as { source?: unknown }).source === "string"
                            ? (phrase as { source: string }).source.trim()
                            : "";
                        const phraseTranslation = typeof (phrase as { translation?: unknown }).translation === "string"
                            ? (phrase as { translation: string }).translation.trim()
                            : "";
                        if (!source || !phraseTranslation) return null;
                        return {
                            source,
                            translation: phraseTranslation,
                        };
                    })
                    .filter((phrase): phrase is { source: string; translation: string } => Boolean(phrase))
                : [];
            if (!sentence || !translation) return null;
            return {
                sentence,
                translation,
                phraseTranslations,
            } satisfies TranslateSentenceResult;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function buildTranslatePrompt(text: string, context: string) {
    return [
        "You are an expert English-to-Chinese reading translator for Chinese learners.",
        "Return strict JSON only.",
        "Translate naturally, accurately, and sentence by sentence.",
        "Do not omit any sentence.",
        "Do not add explanations, notes, numbering, or markdown.",
        "",
        "Output JSON schema:",
        "{",
        '  "translation": "full Chinese translation for the whole input",',
        '  "sentenceTranslations": [',
        '    { "sentence": "original English sentence", "translation": "Chinese translation for that sentence", "phraseTranslations": [{ "source": "important phrase", "translation": "contextual Chinese meaning" }] }',
        "  ]",
        "}",
        "",
        "Rules for phraseTranslations:",
        "- For each sentence, return 2 to 5 high-value phrases/collocations only.",
        "- Prioritize fixed collocations, phrasal verbs, idiomatic chunks, prepositional phrases, and hard-to-parse meaning units.",
        "- Do not list trivial single function words.",
        "- Keep phrase translations contextual and concise in Chinese.",
        "- Do not duplicate the whole sentence as a phrase.",
        "",
        `Context: ${JSON.stringify(context)}`,
        `Text to translate: ${JSON.stringify(text)}`,
    ].join("\n");
}

export async function POST(req: Request) {
    try {
        const { text, context, economyContext } = await req.json() as TranslateRequestPayload;

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

        const completion = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            messages: [{
                role: "user",
                content: buildTranslatePrompt(text, context || text),
            }],
        });

        const rawContent = completion.choices[0]?.message?.content?.trim() || "{}";
        const parsed = JSON.parse(rawContent) as Partial<TranslateResponsePayload>;
        const sentenceTranslations = sanitizeSentenceTranslations(parsed.sentenceTranslations);
        const translation = typeof parsed.translation === "string" && parsed.translation.trim()
            ? parsed.translation.trim()
            : sentenceTranslations.map((item) => item.translation).join("");

        return NextResponse.json({
            translation,
            sentenceTranslations,
            readingCoins: readingCoinMutation,
        });
    } catch (error) {
        console.error("Translation API Error:", error);
        return NextResponse.json({ error: "Failed to translate" }, { status: 500 });
    }
}
