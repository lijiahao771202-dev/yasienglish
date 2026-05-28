import { ensureBGEReady, requestRagQuery, type BGEStatus } from "@/lib/bge-client";
import { db, type CachedArticle, type VocabItem } from "@/lib/db";
import { scheduleVocabularyRagIngestion } from "@/lib/rag-ingestion";
import { waitForRagReady } from "@/lib/rag-readiness";
import { normalizeWordKey } from "./user-sync";
import {
    normalizeAIGenerationRagMode,
    normalizeAIGenerationRagSource,
    type AIGenerationMode,
    type AIGenerationRagMode,
    type AIGenerationRagSource,
} from "./ai-reading-generation";

type Difficulty = "cet4" | "cet6" | "ielts";

const SYSTEM_LEVELS_BY_DIFFICULTY: Record<Difficulty, string[]> = {
    cet4: ["cet6", "cefr"],
    cet6: ["cet6", "cefr"],
    ielts: ["ielts", "cefr"],
};

interface CollectAIGenerationVocabularyParams {
    queryTopic: string;
    difficulty: Difficulty;
    generationMode?: AIGenerationMode;
    ragMode?: AIGenerationRagMode;
    ragSource?: AIGenerationRagSource;
    recentlyUsedWords?: string[];
}

interface AIGenerationRagWord {
    text: string;
    source: "vocab" | "system";
    score: number;
    metadata?: Record<string, unknown>;
}

interface CollectAIGenerationVocabularyResult {
    mode: AIGenerationRagMode;
    source: AIGenerationRagSource;
    words: AIGenerationRagWord[];
}

const AI_GENERATION_VOCAB_TOP_K = 32;
const AI_GENERATION_SYSTEM_TOP_K = 28;
const AI_GENERATION_VOCAB_THRESHOLD = 0.18;
const AI_GENERATION_SYSTEM_THRESHOLD = 0.18;
const DEFAULT_RAG_COOLDOWN_ARTICLE_COUNT = 3;

type AIGenerationRagCooldownArticle = Pick<CachedArticle, "url" | "timestamp" | "isAIGenerated" | "isCatMode" | "ragAppliedWords">;

interface RagDeps {
    ensureReady: typeof ensureBGEReady;
    requestRagQuery: typeof requestRagQuery;
    scheduleVocabularySync: typeof scheduleVocabularyRagIngestion;
    waitForReady: typeof waitForRagReady;
    listVocabulary: () => Promise<VocabItem[]>;
}

const DEFAULT_DEPS: RagDeps = {
    ensureReady: ensureBGEReady,
    requestRagQuery,
    scheduleVocabularySync: scheduleVocabularyRagIngestion,
    waitForReady: waitForRagReady,
    listVocabulary: () => db.vocabulary.toArray(),
};

function normalizeAIGenerationRagText(
    text: string,
    metadata?: Record<string, unknown>,
) {
    const metadataWordKey = typeof metadata?.wordKey === "string"
        ? metadata.wordKey
        : typeof metadata?.vocabId === "string"
            ? metadata.vocabId
            : "";
    const preferred = metadataWordKey.trim();
    if (preferred) {
        return preferred.replace(/\s+/g, " ");
    }

    const head = text.split(/\s+-\s+/)[0]?.trim() || "";
    return head.replace(/\s+/g, " ");
}

function dedupeRankedWords(items: AIGenerationRagWord[]) {
    const seen = new Set<string>();
    const deduped: AIGenerationRagWord[] = [];

    const sorted = [...items].sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (left.source !== right.source) return left.source === "vocab" ? -1 : 1;
        return left.text.localeCompare(right.text);
    });

    for (const item of sorted) {
        const cleanedText = normalizeAIGenerationRagText(item.text, item.metadata);
        const normalized = normalizeWordKey(cleanedText);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        deduped.push({
            ...item,
            text: cleanedText,
        });
    }

    return deduped;
}

function filterRelevantWords(items: AIGenerationRagWord[]) {
    return items.filter((item) => {
        const minScore = item.source === "vocab"
            ? AI_GENERATION_VOCAB_THRESHOLD
            : AI_GENERATION_SYSTEM_THRESHOLD;
        return Number.isFinite(item.score) && item.score >= minScore;
    });
}

function getRagWordKey(item: AIGenerationRagWord) {
    return normalizeWordKey(normalizeAIGenerationRagText(item.text, item.metadata));
}

function buildCooldownWordSet(words?: string[]) {
    return new Set(
        (words ?? [])
            .map((word) => normalizeWordKey(normalizeAIGenerationRagText(word)))
            .filter(Boolean),
    );
}

function filterRecentlyUsedWords(
    hits: AIGenerationRagWord[],
    recentlyUsedWords?: string[],
) {
    const cooldownWords = buildCooldownWordSet(recentlyUsedWords);
    if (cooldownWords.size === 0) return hits;

    return hits.filter((item) => {
        const wordKey = getRagWordKey(item);
        return Boolean(wordKey && !cooldownWords.has(wordKey));
    });
}

export function collectRecentAIGenerationRagCooldownWords(
    articles: AIGenerationRagCooldownArticle[],
    limit = DEFAULT_RAG_COOLDOWN_ARTICLE_COUNT,
) {
    const seen = new Set<string>();
    const words: string[] = [];

    const recentArticles = [...articles]
        .filter((item) => (
            Boolean(item.isAIGenerated)
            && !Boolean(item.isCatMode)
            && !item.url.startsWith("cat://")
            && Array.isArray(item.ragAppliedWords)
            && item.ragAppliedWords.length > 0
        ))
        .sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0))
        .slice(0, Math.max(0, limit));

    for (const article of recentArticles) {
        for (const word of article.ragAppliedWords ?? []) {
            if (typeof word !== "string") continue;
            const cleaned = normalizeAIGenerationRagText(word);
            const normalized = normalizeWordKey(cleaned);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            words.push(cleaned);
        }
    }

    return words;
}

function filterActiveLearnerHits(
    hits: AIGenerationRagWord[],
    vocabulary: VocabItem[],
) {
    const activeWordKeys = new Set(
        vocabulary
            .filter((item) => !item.archived_at)
            .map((item) => normalizeWordKey(item.word_key || item.word))
            .filter(Boolean),
    );

    return hits.filter((item) => {
        const wordKey = getRagWordKey(item);
        return Boolean(wordKey && activeWordKeys.has(wordKey));
    });
}

async function collectSystemDictionaryWords(
    queryTopic: string,
    difficulty: Difficulty,
    requestRagQueryImpl: typeof requestRagQuery,
) {
    const results = await Promise.all(
        SYSTEM_LEVELS_BY_DIFFICULTY[difficulty].map((level) => (
            requestRagQueryImpl(
                queryTopic,
                level === "cefr" ? Math.min(16, AI_GENERATION_SYSTEM_TOP_K) : AI_GENERATION_SYSTEM_TOP_K,
                AI_GENERATION_SYSTEM_THRESHOLD,
                "system",
                { level },
            )
        )),
    );

    return results.flat().map((item) => ({
        text: item.text,
        score: item.score,
        source: "system" as const,
        metadata: item.metadata,
    }));
}

export async function collectAIGenerationVocabulary(
    params: CollectAIGenerationVocabularyParams,
    deps: Partial<RagDeps> = {},
): Promise<CollectAIGenerationVocabularyResult> {
    const resolved = { ...DEFAULT_DEPS, ...deps };
    const ragMode = normalizeAIGenerationRagMode(params.ragMode);
    const ragSource = normalizeAIGenerationRagSource(params.ragSource);

    if (ragMode === "off") {
        return {
            mode: "off",
            source: ragSource,
            words: [],
        };
    }

    const isReady = await resolved.waitForReady(resolved.ensureReady, 4500);
    if (!isReady) {
        return {
            mode: ragMode,
            source: ragSource,
            words: [],
        };
    }

    void Promise.resolve(resolved.scheduleVocabularySync()).catch(() => void 0);

    const shouldQueryLearnerVocab = ragSource !== "dictionary";
    const [rawLearnerHits, systemHits, vocabulary] = await Promise.all([
        !shouldQueryLearnerVocab
            ? Promise.resolve([])
            : resolved.requestRagQuery(params.queryTopic, AI_GENERATION_VOCAB_TOP_K, AI_GENERATION_VOCAB_THRESHOLD, "vocab"),
        ragSource === "vocab"
            ? Promise.resolve([])
            : collectSystemDictionaryWords(params.queryTopic, params.difficulty, resolved.requestRagQuery),
        shouldQueryLearnerVocab
            ? resolved.listVocabulary()
            : Promise.resolve([]),
    ]);
    const learnerHits = shouldQueryLearnerVocab
        ? filterActiveLearnerHits(rawLearnerHits.map((item) => ({
            text: item.text,
            score: item.score,
            source: "vocab" as const,
            metadata: item.metadata,
        })), vocabulary)
        : [];

    const merged = dedupeRankedWords(filterRecentlyUsedWords(filterRelevantWords([
        ...learnerHits,
        ...systemHits,
    ]), params.recentlyUsedWords));

    return {
        mode: ragMode,
        source: ragSource,
        words: merged,
    };
}
