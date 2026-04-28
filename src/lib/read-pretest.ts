import { buildAutoSentenceBoundaries, buildSentenceUnits } from "@/lib/read-speaking";

export interface ReadPretestBundle {
    listening: string[];
    writing: string[];
    translation: string[];
}

interface BuildReadPretestBundleParams {
    articleText: string;
    articleKey: string;
    listeningCount?: number;
    writingCount?: number;
    translationCount?: number;
}

const DEFAULT_LISTENING_COUNT = 5;
const DEFAULT_WRITING_COUNT = 3;
const DEFAULT_TRANSLATION_COUNT = 3;

function normalizeWhitespace(text: unknown) {
    return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
}

function normalizeIdentity(text: unknown) {
    return normalizeWhitespace(text).toLowerCase();
}

function countEnglishWords(text: string) {
    return (text.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).length;
}

function splitLongSentence(text: string) {
    return text
        .split(/[;,，；:]/g)
        .map((chunk) => normalizeWhitespace(chunk))
        .filter(Boolean);
}

function hashString(input: string) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function makeSeededRandom(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let next = Math.imul(state ^ (state >>> 15), 1 | state);
        next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
}

function buildFallbackChunks(text: string, minCount: number) {
    const clean = normalizeWhitespace(text);
    if (!clean) return [] as string[];

    const words = clean.split(" ").filter(Boolean);
    if (words.length === 0) return [] as string[];

    const chunks: string[] = [];
    const chunkSize = 16;
    const stride = 12;

    for (let start = 0; start < words.length; start += stride) {
        const chunkWords = words.slice(start, start + chunkSize);
        if (chunkWords.length < 5) continue;
        const chunk = chunkWords.join(" ");
        chunks.push(chunk);
        if (chunks.length >= minCount * 2) break;
    }

    if (chunks.length === 0) {
        chunks.push(clean);
    }
    return chunks;
}

export function extractReadPretestCandidates(articleText: string) {
    const text = normalizeWhitespace(articleText);
    if (!text) return [] as string[];

    const boundaries = buildAutoSentenceBoundaries(text);
    const units = buildSentenceUnits(text, boundaries);
    const candidates: string[] = [];

    for (const unit of units) {
        const speakText = normalizeWhitespace(unit.speakText);
        if (!speakText) continue;

        const wordCount = countEnglishWords(speakText);
        const hasLetters = /[A-Za-z]/.test(speakText);
        if (!hasLetters) continue;

        if (wordCount >= 6 && wordCount <= 36) {
            candidates.push(speakText);
            continue;
        }

        if (wordCount > 36) {
            const chunks = splitLongSentence(speakText);
            for (const chunk of chunks) {
                const chunkWordCount = countEnglishWords(chunk);
                if (chunkWordCount >= 6 && chunkWordCount <= 32) {
                    candidates.push(chunk);
                }
            }
        }
    }

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const sentence of candidates) {
        const identity = normalizeIdentity(sentence);
        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        deduped.push(sentence);
    }

    if (deduped.length >= 3) return deduped;

    const fallbackChunks = buildFallbackChunks(text, 12);
    for (const sentence of fallbackChunks) {
        const identity = normalizeIdentity(sentence);
        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        deduped.push(sentence);
    }

    return deduped;
}

function sampleSentences(params: {
    source: string[];
    count: number;
    rng: () => number;
    globalExclusion?: Set<string>;
}) {
    const { source, count, rng, globalExclusion } = params;
    if (count <= 0 || source.length === 0) return [] as string[];

    const selected: string[] = [];
    const localSelected = new Set<string>();

    const firstPool = source.filter((sentence) => {
        const key = normalizeIdentity(sentence);
        if (!key) return false;
        if (globalExclusion?.has(key)) return false;
        return !localSelected.has(key);
    });

    const drawFromPool = (pool: string[]) => {
        const nextPool = [...pool];
        while (nextPool.length > 0 && selected.length < count) {
            const index = Math.floor(rng() * nextPool.length);
            const picked = nextPool.splice(index, 1)[0];
            const pickedKey = normalizeIdentity(picked);
            if (!pickedKey || localSelected.has(pickedKey)) continue;
            localSelected.add(pickedKey);
            selected.push(picked);
        }
    };

    drawFromPool(firstPool);

    if (selected.length < count) {
        const fallbackPool = source.filter((sentence) => {
            const key = normalizeIdentity(sentence);
            return Boolean(key) && !localSelected.has(key);
        });
        drawFromPool(fallbackPool);
    }

    return selected;
}

export function buildReadPretestBundle(params: BuildReadPretestBundleParams): ReadPretestBundle {
    const {
        articleText,
        articleKey,
        listeningCount = DEFAULT_LISTENING_COUNT,
        writingCount = DEFAULT_WRITING_COUNT,
        translationCount = DEFAULT_TRANSLATION_COUNT,
    } = params;

    const candidates = extractReadPretestCandidates(articleText);
    const baseSeed = hashString(`${articleKey}::${candidates.join("|")}`);
    const rng = makeSeededRandom(baseSeed || 1);
    const exclusion = new Set<string>();

    const listening = sampleSentences({
        source: candidates,
        count: listeningCount,
        rng,
    });
    for (const sentence of listening) {
        exclusion.add(normalizeIdentity(sentence));
    }

    const writing = sampleSentences({
        source: candidates,
        count: writingCount,
        rng,
        globalExclusion: exclusion,
    });
    for (const sentence of writing) {
        exclusion.add(normalizeIdentity(sentence));
    }

    const translation = sampleSentences({
        source: candidates,
        count: translationCount,
        rng,
        globalExclusion: exclusion,
    });

    return {
        listening,
        writing,
        translation,
    };
}
