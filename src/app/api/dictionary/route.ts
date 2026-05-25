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
    pos_groups?: Array<{ pos: string; meanings: string[] }>;
}

interface YoudaoEeTranslationItem {
    l?: {
        i?: unknown[];
    };
}

interface YoudaoEeGroup {
    pos?: string;
    tr?: YoudaoEeTranslationItem[];
}

interface YoudaoWebTranslationValue {
    value?: string;
}

interface YoudaoWebTranslationItem {
    value?: string;
    trans?: YoudaoWebTranslationValue[];
}

function normalizeDictionaryLookupWord(word: string) {
    return word
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function singularizePlural(word: string) {
    if (word.length <= 3) return word;
    if (/(ches|shes|xes|zes|ses)$/i.test(word)) return word.replace(/es$/i, "");
    if (/ies$/i.test(word) && word.length > 4) return word.replace(/ies$/i, "y");
    if (/s$/i.test(word) && !/ss$/i.test(word)) return word.replace(/s$/i, "");
    return word;
}

function buildDictionaryLookupCandidates(input: string) {
    const normalized = normalizeDictionaryLookupWord(input);
    const compact = normalized
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    const candidates = new Set<string>();
    const push = (value: string) => {
        const normalizedValue = normalizeDictionaryLookupWord(value)
            .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
            .replace(/\s+/g, " ")
            .trim();
        if (normalizedValue) candidates.add(normalizedValue);
    };

    push(normalized);
    push(compact);

    if (compact.includes("-")) {
        push(compact.replace(/-/g, " "));
        push(compact.replace(/-/g, ""));
    }

    const tokens = compact.split(" ").filter(Boolean);
    if (tokens.length > 0) {
        const normalizedTokens = tokens.map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""));
        push(normalizedTokens.join(" "));

        const lastToken = normalizedTokens[normalizedTokens.length - 1];
        if (lastToken) {
            const singularLast = singularizePlural(lastToken);
            if (singularLast !== lastToken) {
                push([...normalizedTokens.slice(0, -1), singularLast].join(" "));
            }
        }

        if (normalizedTokens.length === 1) {
            push(singularizePlural(normalizedTokens[0]));
        }
    }

    return Array.from(candidates);
}

function extractDictionaryData(data: unknown) {
    const payload = data && typeof data === "object" ? data as Record<string, unknown> : {};
    let definition = "";
    let translation = "";
    let phonetic = "";
    let audio = "";
    let posGroups: Array<{ pos: string; meanings: string[] }> = [];

    const simple = (payload.simple as { word?: Array<{ usphone?: string; ukphone?: string; usspeech?: string }> } | undefined)?.word?.[0];
    const ec = (payload.ec as { word?: Array<{ trs?: unknown[] }> } | undefined)?.word?.[0];
    const ee = payload.ee as { word?: { trs?: YoudaoEeGroup[]; phone?: string; speech?: string } } | undefined;

    if (simple) {
        phonetic = simple.usphone || simple.ukphone || "";
        if (simple.usspeech) {
            audio = `https://dict.youdao.com/dictvoice?audio=${simple.usspeech}`;
        }
    }

    if (ec?.trs?.length > 0) {
        const trsLines = ec.trs
            .map((trItem: unknown) => {
                if (!trItem || typeof trItem !== "object") return "";
                const tr0 = (trItem as { tr?: Array<{ l?: { i?: string[] } }> }).tr?.[0];
                const line = tr0?.l?.i?.[0];
                return typeof line === "string" ? line : "";
            })
            .filter((line: string): line is string => Boolean(line.trim()));

        posGroups = parsePosGroupsFromDefinitionLines(trsLines);
        if (trsLines.length > 0) {
            definition = trsLines.join("；");
            const firstLine = trsLines[0];
            translation = firstLine
                .replace(/^(n|v|adj|adv|prep|pron|conj|aux|num|int)\.\s*/i, "")
                .split(/；|，/)
                .slice(0, 2)
                .join("；");
        }
    }

    if ((!definition || !translation) && ee?.trs?.length > 0) {
        const eeGroups = ee.trs
            .map((group: YoudaoEeGroup) => {
                const pos = typeof group?.pos === "string" ? group.pos.trim() : "";
                const meanings = Array.isArray(group?.tr)
                    ? group.tr
                        .map((item: YoudaoEeTranslationItem) => item?.l?.i)
                        .flat()
                        .map((item: unknown) => String(item || "").trim())
                        .filter(Boolean)
                    : [];
                return {
                    pos: pos || "phr.",
                    meanings: Array.from(new Set(meanings)).slice(0, 6),
                };
            })
            .filter((group: { meanings: string[] }) => group.meanings.length > 0);

        if (eeGroups.length > 0) {
            if (posGroups.length === 0) {
                posGroups = eeGroups;
            }
            if (!definition) {
                definition = eeGroups
                    .map((group) => `${group.pos} ${group.meanings.join("；")}`.trim())
                    .join("；");
            }
            if (!translation) {
                translation = eeGroups[0]?.meanings?.slice(0, 2).join("；") || "";
            }
            if (!phonetic && typeof ee.phone === "string") {
                phonetic = ee.phone;
            }
            if (!audio && typeof ee.speech === "string" && ee.speech.trim()) {
                audio = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(ee.speech.trim())}&type=2`;
            }
        }
    }

    const webTranslations = (payload.web_trans as { "web-translation"?: YoudaoWebTranslationItem[] } | undefined)?.["web-translation"];
    if ((!definition || !translation) && webTranslations?.[0]) {
        const firstWeb = webTranslations[0];
        const webValues = Array.isArray(firstWeb?.trans)
            ? firstWeb.trans
                .map((item: YoudaoWebTranslationValue) => String(item?.value || "").trim())
                .filter(Boolean)
            : [];
        const fallbackValue = webValues[0] || String(firstWeb?.value || "").trim();
        if (fallbackValue) {
            translation = translation || fallbackValue;
            definition = definition || fallbackValue;
        }
    }

    return {
        definition,
        translation,
        phonetic,
        audio,
        posGroups,
    };
}

const DICT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const dictCache = new Map<string, { data: DictionaryResponsePayload; expiresAt: number }>();

function parsePosGroupsFromDefinitionLines(lines: string[]) {
    const posOrder = ["n.", "v.", "adj.", "adv.", "prep.", "pron.", "conj.", "aux.", "num.", "int."];
    const grouped = new Map<string, string[]>();
    const posPrefixRe = /^(n|v|adj|adv|prep|pron|conj|aux|num|int)\.\s*/i;

    for (const rawLine of lines) {
        const line = String(rawLine || "").replace(/\s+/g, " ").trim();
        if (!line) continue;
        const matchedPos = line.match(/^(n|v|adj|adv|prep|pron|conj|aux|num|int)\./i)?.[1]?.toLowerCase();
        if (!matchedPos) continue;

        const pos = `${matchedPos}.`;
        const meanings = line
            .replace(posPrefixRe, "")
            .split(/[；;]/)
            .map((part) => part.trim())
            .filter(Boolean);
        if (meanings.length === 0) continue;

        const existing = grouped.get(pos) ?? [];
        grouped.set(pos, [...existing, ...meanings]);
    }

    const ordered = posOrder.filter((pos) => grouped.has(pos));
    const rest = Array.from(grouped.keys()).filter((pos) => !posOrder.includes(pos));

    return [...ordered, ...rest].map((pos) => ({
        pos,
        meanings: Array.from(new Set(grouped.get(pos) ?? [])).slice(0, 6),
    }));
}

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

        let readingCoinMutation: {
            balance: number;
            delta: number;
            applied: boolean;
            action: string;
        } | null = null;
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
            readingCoinMutation = {
                balance: charge.balance,
                delta: charge.delta,
                applied: charge.applied,
                action: charge.action,
            };
        }

        const normalizedWord = normalizeDictionaryLookupWord(String(word));
        const cached = getCached(normalizedWord);
        if (cached) {
            return NextResponse.json({
                ...cached,
                readingCoins: readingCoinMutation,
            });
        }

        let definition = "";
        let translation = "";
        let phonetic = "";
        let audio = "";
        let posGroups: Array<{ pos: string; meanings: string[] }> = [];

        for (const candidate of buildDictionaryLookupCandidates(normalizedWord)) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2800);

            const youdaoRes = await fetch(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(candidate)}`, {
                signal: controller.signal,
                headers: {
                    "accept": "application/json,text/plain,*/*",
                },
                cache: "no-store",
            }).finally(() => clearTimeout(timeout));

            if (!youdaoRes.ok) {
                continue;
            }

            const data = await youdaoRes.json();
            const extracted = extractDictionaryData(data);
            if (!extracted.definition && !extracted.translation && !extracted.phonetic) {
                continue;
            }

            definition = extracted.definition;
            translation = extracted.translation;
            phonetic = extracted.phonetic;
            audio = extracted.audio;
            posGroups = extracted.posGroups;
            break;
        }

        if (definition || phonetic || translation) {
            const payload: DictionaryResponsePayload = {
                word: normalizedWord,
                definition: definition || translation,
                translation,
                phonetic,
                audio,
                pos_groups: posGroups,
            };
            setCached(normalizedWord, payload);
            return NextResponse.json({
                ...payload,
                readingCoins: readingCoinMutation,
            });
        }

        return NextResponse.json({ error: "Definition not found" }, { status: 404 });

    } catch (error) {
        console.error("Dictionary API Error:", error);
        return NextResponse.json({ error: "Failed to fetch definition" }, { status: 500 });
    }
}
