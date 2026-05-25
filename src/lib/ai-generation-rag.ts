import { ensureBGEReady, requestRagQuery, type BGEStatus } from "@/lib/bge-client";
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

interface RagDeps {
    ensureReady: typeof ensureBGEReady;
    requestRagQuery: typeof requestRagQuery;
    scheduleVocabularySync: typeof scheduleVocabularyRagIngestion;
    waitForReady: typeof waitForRagReady;
}

const DEFAULT_DEPS: RagDeps = {
    ensureReady: ensureBGEReady,
    requestRagQuery,
    scheduleVocabularySync: scheduleVocabularyRagIngestion,
    waitForReady: waitForRagReady,
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

    const [learnerHits, systemHits] = await Promise.all([
        ragSource === "dictionary"
            ? Promise.resolve([])
            : resolved.requestRagQuery(params.queryTopic, AI_GENERATION_VOCAB_TOP_K, AI_GENERATION_VOCAB_THRESHOLD, "vocab"),
        ragSource === "vocab"
            ? Promise.resolve([])
            : collectSystemDictionaryWords(params.queryTopic, params.difficulty, resolved.requestRagQuery),
    ]);

    const merged = dedupeRankedWords(filterRelevantWords([
        ...learnerHits.map((item) => ({
            text: item.text,
            score: item.score,
            source: "vocab" as const,
            metadata: item.metadata,
        })),
        ...systemHits,
    ]));

    return {
        mode: ragMode,
        source: ragSource,
        words: merged,
    };
}
