import { ensureBGEReady, requestRagQuery } from "@/lib/bge-client";
import { scheduleVocabularyRagIngestion } from "@/lib/rag-ingestion";
import { waitForRagReady } from "@/lib/rag-readiness";

type Difficulty = "cet4" | "cet6" | "ielts";

interface CollectAIGenerationVocabularyParams {
    queryTopic: string;
    difficulty: Difficulty;
}

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

function dedupeVocabulary(items: string[]) {
    const seen = new Set<string>();
    const deduped: string[] = [];

    for (const item of items) {
        const normalized = item.trim();
        if (!normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        deduped.push(normalized);
    }

    return deduped;
}

export async function collectAIGenerationVocabulary(
    params: CollectAIGenerationVocabularyParams,
    deps: Partial<RagDeps> = {},
) {
    const resolved = { ...DEFAULT_DEPS, ...deps };
    const isReady = await resolved.waitForReady(resolved.ensureReady, 4500);
    if (!isReady) {
        return [];
    }

    await Promise.resolve(
        resolved.scheduleVocabularySync().catch(() => ({ processed: 0, total: 0, skipped: true })),
    );

    const [learnerHits, systemHits] = await Promise.all([
        resolved.requestRagQuery(params.queryTopic, 16, 0.1, "vocab"),
        resolved.requestRagQuery(params.queryTopic, 24, 0.1, "system", { level: params.difficulty }),
    ]);

    return dedupeVocabulary([
        ...learnerHits.map((item) => item.text),
        ...systemHits.map((item) => item.text),
    ]);
}
