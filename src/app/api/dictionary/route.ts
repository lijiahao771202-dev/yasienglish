import { NextResponse } from "next/server";
import {
    chargeReadingCoins,
    insufficientReadingCoinsPayload,
    isReadEconomyContext,
    type ReadingEconomyContext,
} from "@/lib/reading-economy-server";

interface DictionaryResponsePayload {
    word: string;
    definition: string;
    translation: string;
    phonetic: string;
    audio: string;
}

const DICT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const dictCache = new Map<string, { data: DictionaryResponsePayload; expiresAt: number }>();

function getCached(word: string): DictionaryResponsePayload | null {
    const key = word.toLowerCase();
    const hit = dictCache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        dictCache.delete(key);
        return null;
    }
    return hit.data;
}

function setCached(word: string, data: DictionaryResponsePayload) {
    const key = word.toLowerCase();
    dictCache.set(key, { data, expiresAt: Date.now() + DICT_CACHE_TTL_MS });
    if (dictCache.size > 5000) {
        const firstKey = dictCache.keys().next().value;
        if (firstKey) dictCache.delete(firstKey);
    }
}

export async function POST(req: Request) {
    try {
        const { word, economyContext } = await req.json() as {
            word?: string;
            economyContext?: ReadingEconomyContext;
        };

        if (!word) {
            return NextResponse.json({ error: "Word is required" }, { status: 400 });
        }

        let readingBalance: number | undefined;
        const readContext = isReadEconomyContext(economyContext)
            ? {
                ...economyContext,
                action: economyContext?.action ?? "word_lookup",
            }
            : null;

        if (readContext?.action) {
            const charge = await chargeReadingCoins({
                action: readContext.action,
                dedupeKey: readContext.dedupeKey,
                meta: {
                    articleUrl: readContext.articleUrl ?? null,
                    word,
                    from: "api/dictionary",
                },
            });
            if (!charge.ok && charge.insufficient) {
                return NextResponse.json(
                    insufficientReadingCoinsPayload(readContext.action, charge.required ?? 1, charge.balance),
                    { status: 402 },
                );
            }
            readingBalance = charge.balance;
        }

        const normalizedWord = String(word).trim().toLowerCase();
        const cached = getCached(normalizedWord);
        if (cached) {
            return NextResponse.json({
                ...cached,
                readingCoins: typeof readingBalance === "number" ? { balance: readingBalance } : undefined,
            });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2800);

        // Youdao JSONAPI (Rich Data)
        const youdaoRes = await fetch(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(normalizedWord)}`, {
            signal: controller.signal,
            headers: {
                "accept": "application/json,text/plain,*/*",
            },
            cache: "no-store",
        }).finally(() => clearTimeout(timeout));

        let definition = "";
        let translation = "";
        let phonetic = "";
        let audio = "";

        if (youdaoRes.ok) {
            const data = await youdaoRes.json();

            // 1. Extract Phonetics (US preferred)
            const simple = data.simple?.word?.[0];
            const ec = data.ec?.word?.[0];

            if (simple) {
                phonetic = simple.usphone || simple.ukphone || "";
                // Construct audio URL directly if available (type=2 for US)
                if (simple.usspeech) {
                    audio = `https://dict.youdao.com/dictvoice?audio=${simple.usspeech}`;
                }
            }

            // 2. Extract Definition (EC - Exam Category / Chinese)
            if (ec && ec.trs && ec.trs.length > 0) {
                const firstTr = ec.trs[0]; // First translation group
                // Usually structure: tr[0].tr[0].l.i[0] -> "int. 喂..."
                const defRaw = firstTr.tr?.[0]?.l?.i?.[0];

                if (defRaw) {
                    definition = defRaw;
                    // Clean up part of speech part if needed, or keep it
                    translation = defRaw.split(/；|，/).slice(0, 2).join("；"); // Shorten for UI
                }
            } else if (data.web_trans?.["web-translation"]?.[0]) {
                // Fallback to web translation for names/brands
                translation = data.web_trans["web-translation"][0].value;
                definition = data.web_trans["web-translation"][0].value;
            }
        }

        if (definition || phonetic || translation) {
            const payload: DictionaryResponsePayload = {
                word: normalizedWord,
                definition: definition || translation,
                translation,
                phonetic,
                audio,
            };
            setCached(normalizedWord, payload);
            return NextResponse.json({
                ...payload,
                readingCoins: typeof readingBalance === "number" ? { balance: readingBalance } : undefined,
            });
        }

        return NextResponse.json({ error: "Definition not found" }, { status: 404 });

    } catch (error) {
        console.error("Dictionary API Error:", error);
        return NextResponse.json({ error: "Failed to fetch definition" }, { status: 500 });
    }
}
