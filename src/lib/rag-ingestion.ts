import { ensureBGEReady, initBGEWorker, requestRagStore } from "@/lib/bge-client";
import { db, type VocabItem, type VectorMemoryItem } from "@/lib/db";
import { mapFsrsDifficultyToExamTrack } from "@/lib/vocab-difficulty";
import { normalizeWordKey } from "@/lib/user-sync";
import { useVectorEngineStore } from "@/lib/vector-engine-store";

export type SystemDictionaryKey = "cet6" | "ielts" | "cefr";

export type RagSyncTaskStatus = "idle" | "running" | "completed" | "error";

export interface RagSyncTaskState {
    status: RagSyncTaskStatus;
    completed: number;
    total: number;
    modelId?: string;
    updatedAt: number;
    error?: string;
}

export interface SystemVocabularyTranslation {
    type?: string;
    translation?: string;
}

export interface SystemVocabularyEntry {
    word?: string;
    translations?: SystemVocabularyTranslation[];
}

export interface VocabularyVectorSyncPlan {
    missing: VocabItem[];
    staleVectorIds: string[];
}

interface RagTaskResult {
    processed: number;
    total: number;
    skipped?: boolean;
}

interface VocabularyTaskDeps {
    initWorker?: () => void;
    ensureReady?: () => Promise<boolean>;
    getCurrentModelId?: () => string;
    getTaskState?: () => Promise<RagSyncTaskState | null>;
    setTaskState?: (state: RagSyncTaskState) => Promise<void>;
    listVocabulary?: () => Promise<VocabItem[]>;
    listVocabVectors?: () => Promise<VectorMemoryItem[]>;
    deleteVectors?: (ids: string[]) => Promise<void>;
    store?: (text: string, source: "vocab", metadata?: Record<string, unknown>) => Promise<boolean>;
}

interface SystemDictionaryTaskDeps {
    initWorker?: () => void;
    ensureReady?: () => Promise<boolean>;
    getCurrentModelId?: () => string;
    getTaskState?: () => Promise<RagSyncTaskState | null>;
    setTaskState?: (state: RagSyncTaskState) => Promise<void>;
    countExistingVectors?: () => Promise<number>;
    listExistingVectors?: () => Promise<VectorMemoryItem[]>;
    fetchEntries?: () => Promise<SystemVocabularyEntry[]>;
    store?: (text: string, source: "system", metadata?: Record<string, unknown>) => Promise<boolean>;
    maxNewVectors?: number;
}

interface DefaultRagIngestionOptions {
    systemBatchSize?: number;
    vocabularyDeps?: VocabularyTaskDeps;
    createSystemDeps?: (level: SystemDictionaryKey) => SystemDictionaryTaskDeps;
    waitForSlot?: () => Promise<void>;
}

const SYSTEM_DICTIONARY_FILE_NAMES: Record<SystemDictionaryKey, string> = {
    cet6: "4-CET6-顺序.json",
    ielts: "5-IELTS-顺序.json",
    cefr: "6-OXFORD-5000.json",
};

export const DEFAULT_RAG_SYSTEM_DICTIONARIES: SystemDictionaryKey[] = [
    "cet6",
    "ielts",
    "cefr",
];

const DEFAULT_AUTO_SYSTEM_BATCH_SIZE = 25;
const AUTO_QUEUE_CONTINUE_DELAY_MS = 1200;

let pendingAutoIngestion: Promise<RagTaskResult[]> | null = null;
let pendingVocabularyIngestion: Promise<RagTaskResult> | null = null;
let queuedAutoContinuation = false;

function waitForBackgroundIngestionSlot() {
    if (typeof window === "undefined") {
        return Promise.resolve();
    }

    const idleCallback = window.requestIdleCallback as ((callback: () => void, options?: { timeout?: number }) => number) | undefined;
    if (typeof idleCallback === "function") {
        return new Promise<void>((resolve) => {
            idleCallback(() => resolve(), { timeout: 12_000 });
        });
    }

    return new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1_500);
    });
}

function nowState(patch: Omit<RagSyncTaskState, "updatedAt">): RagSyncTaskState {
    return {
        ...patch,
        updatedAt: Date.now(),
    };
}

function getTaskMetaKey(taskName: string) {
    return `rag:task:${taskName}`;
}

export function getRagTaskMetaKey(taskName: string) {
    return getTaskMetaKey(taskName);
}

function getCurrentVectorModelId() {
    return useVectorEngineStore.getState().vectorModelId;
}

export function getVocabularyVectorId(wordKey: string) {
    return `vocab:${wordKey}`;
}

function getSystemDictionaryVectorId(level: SystemDictionaryKey, wordKey: string, cefrLevel?: string) {
    const suffix = cefrLevel ? `:${cefrLevel.toLowerCase()}` : "";
    return `system:${level}${suffix}:${wordKey}`;
}

function getSystemVectorIdentity(level: SystemDictionaryKey, item: VectorMemoryItem) {
    if (typeof item.metadata?.vectorId === "string" && item.metadata.vectorId.trim()) {
        return item.metadata.vectorId.trim();
    }

    const rawWordKey = typeof item.metadata?.wordKey === "string"
        ? item.metadata.wordKey
        : typeof item.metadata?.vocabId === "string"
            ? item.metadata.vocabId
            : item.text.split(/\s+-\s+/)[0] || "";
    const wordKey = normalizeWordKey(rawWordKey);
    if (!wordKey) {
        return "";
    }

    const cefrLevel = typeof item.metadata?.cefrLevel === "string"
        ? item.metadata.cefrLevel
        : undefined;
    return getSystemDictionaryVectorId(level, wordKey, cefrLevel);
}

function getVectorWordKey(item: VectorMemoryItem) {
    const metadataWordKey = typeof item.metadata?.wordKey === "string"
        ? item.metadata.wordKey
        : typeof item.metadata?.vocabId === "string"
            ? item.metadata.vocabId
            : "";
    const raw = metadataWordKey || item.text.split(/\s+-\s+/)[0] || item.id?.replace(/^vocab:/, "") || "";
    return normalizeWordKey(raw);
}

function getVocabWordKey(item: VocabItem) {
    return normalizeWordKey(item.word_key || item.word);
}

function formatVocabularyText(item: VocabItem) {
    const word = item.word.trim();
    const meaning = (item.translation || item.definition || "").trim();
    if (!meaning) return word;
    return `${word} - ${meaning}`;
}

function getSystemDictionaryCefrLevel(level: SystemDictionaryKey, entry: SystemVocabularyEntry) {
    if (level !== "cefr") {
        return undefined;
    }

    const firstType = entry.translations?.[0]?.type || "";
    const match = firstType.match(/^(A1|A2|B1|B2|C1|C2)/i);
    return match?.[1]?.toUpperCase();
}

function formatSystemDictionaryText(entry: SystemVocabularyEntry) {
    const word = entry.word?.trim() || "";
    if (!word) return "";

    const meanings = (entry.translations ?? [])
        .map((translation) => `${translation.type || ""} ${translation.translation || ""}`.trim())
        .filter(Boolean)
        .join("; ");

    return meanings ? `${word} - ${meanings}` : word;
}

function normalizeSystemDictionaryEntries(level: SystemDictionaryKey, entries: SystemVocabularyEntry[]) {
    const seenVectorIds = new Set<string>();
    const normalized: SystemVocabularyEntry[] = [];

    for (const entry of entries) {
        const wordKey = normalizeWordKey(entry.word || "");
        if (!wordKey) {
            continue;
        }

        const cefrLevel = getSystemDictionaryCefrLevel(level, entry);
        const vectorId = getSystemDictionaryVectorId(level, wordKey, cefrLevel);
        if (seenVectorIds.has(vectorId)) {
            continue;
        }

        seenVectorIds.add(vectorId);
        normalized.push(entry);
    }

    return normalized;
}

async function getTaskState(taskName: string) {
    const item = await db.sync_meta.get(getTaskMetaKey(taskName));
    return (item?.value && typeof item.value === "object")
        ? item.value as RagSyncTaskState
        : null;
}

async function setTaskState(taskName: string, state: RagSyncTaskState) {
    await db.sync_meta.put({
        key: getTaskMetaKey(taskName),
        value: state,
        updated_at: state.updatedAt,
    });
}

export async function readRagTaskState(taskName: string) {
    return getTaskState(taskName);
}

async function fetchSystemDictionaryEntries(level: SystemDictionaryKey) {
    const fileName = SYSTEM_DICTIONARY_FILE_NAMES[level];
    const response = await fetch(`/data/${fileName}`);
    if (!response.ok) {
        throw new Error(`Failed to load dictionary ${level}.`);
    }

    return response.json() as Promise<SystemVocabularyEntry[]>;
}

async function listSystemDictionaryVectors(level: SystemDictionaryKey) {
    if (typeof indexedDB === "undefined") {
        return [];
    }

    return db.rag_vectors
        .where("source")
        .equals("system")
        .filter((item) => item.metadata?.level === level)
        .toArray();
}

export function buildVocabularyVectorSyncPlan(
    vocabulary: VocabItem[],
    vectors: VectorMemoryItem[],
): VocabularyVectorSyncPlan {
    const activeVocabulary = vocabulary.filter((item) => !item.archived_at);
    const vocabByWordKey = new Map(activeVocabulary.map((item) => [getVocabWordKey(item), item]));
    const vectorWordKeys = new Set<string>();
    const staleVectorIds: string[] = [];

    for (const vector of vectors) {
        const wordKey = getVectorWordKey(vector);
        if (wordKey) {
            vectorWordKeys.add(wordKey);
        }

        if (!wordKey || !vocabByWordKey.has(wordKey)) {
            if (vector.id) {
                staleVectorIds.push(vector.id);
            }
        }
    }

    return {
        missing: activeVocabulary.filter((item) => !vectorWordKeys.has(getVocabWordKey(item))),
        staleVectorIds,
    };
}

export async function processVocabularyTask(deps: VocabularyTaskDeps = {}): Promise<RagTaskResult> {
    const initWorkerFn = deps.initWorker ?? initBGEWorker;
    const ensureReadyFn = deps.ensureReady ?? ensureBGEReady;
    const getCurrentModelId = deps.getCurrentModelId ?? getCurrentVectorModelId;
    const readTaskState = deps.getTaskState ?? (() => getTaskState("vocabulary"));
    const writeTaskState = deps.setTaskState ?? ((state) => setTaskState("vocabulary", state));
    const listVocabulary = deps.listVocabulary ?? (() => db.vocabulary.toArray());
    const listVocabVectors = deps.listVocabVectors ?? (() => db.rag_vectors.where("source").equals("vocab").toArray());
    const deleteVectors = deps.deleteVectors ?? ((ids) => db.rag_vectors.bulkDelete(ids));
    const store = deps.store ?? requestRagStore;

    initWorkerFn();
    const ready = await ensureReadyFn();
    if (!ready) {
        return { processed: 0, total: 0, skipped: true };
    }

    const [vocabulary, vectors, previousState] = await Promise.all([
        listVocabulary(),
        listVocabVectors(),
        readTaskState(),
    ]);
    void previousState;
    const plan = buildVocabularyVectorSyncPlan(vocabulary, vectors);
    const modelId = getCurrentModelId();

    if (plan.staleVectorIds.length > 0) {
        await deleteVectors(plan.staleVectorIds);
    }

    const total = plan.missing.length;
    if (total === 0) {
        await writeTaskState(nowState({
            status: "completed",
            completed: 0,
            total: 0,
            modelId,
        }));
        return { processed: 0, total: 0, skipped: true };
    }

    await writeTaskState(nowState({
        status: "running",
        completed: 0,
        total,
        modelId,
    }));

    let processed = 0;
    try {
        for (const item of plan.missing) {
            const wordKey = getVocabWordKey(item);
            await store(formatVocabularyText(item), "vocab", {
                vocabId: wordKey,
                wordKey,
                vectorId: getVocabularyVectorId(wordKey),
                type: "learner_vocab",
                level: mapFsrsDifficultyToExamTrack(item.difficulty),
                timestamp: item.timestamp,
            });
            processed += 1;
            await writeTaskState(nowState({
                status: "running",
                completed: processed,
                total,
                modelId,
            }));
        }

        await writeTaskState(nowState({
            status: "completed",
            completed: processed,
            total,
            modelId,
        }));
        return { processed, total };
    } catch (error) {
        await writeTaskState(nowState({
            status: "error",
            completed: processed,
            total,
            modelId,
            error: error instanceof Error ? error.message : String(error),
        }));
        throw error;
    }
}

export async function processSystemDictionaryTask(
    level: SystemDictionaryKey,
    deps: SystemDictionaryTaskDeps = {},
): Promise<RagTaskResult> {
    const initWorkerFn = deps.initWorker ?? initBGEWorker;
    const ensureReadyFn = deps.ensureReady ?? ensureBGEReady;
    const getCurrentModelId = deps.getCurrentModelId ?? getCurrentVectorModelId;
    const readTaskState = deps.getTaskState ?? (() => getTaskState(`system:${level}`));
    const writeTaskState = deps.setTaskState ?? ((state) => setTaskState(`system:${level}`, state));
    const countExistingVectors = deps.countExistingVectors ?? (() => db.rag_vectors
        .where("source")
        .equals("system")
        .filter((item) => item.metadata?.level === level)
        .count());
    const listExistingVectors = deps.listExistingVectors ?? (() => listSystemDictionaryVectors(level));
    const fetchEntries = deps.fetchEntries ?? (() => fetchSystemDictionaryEntries(level));
    const store = deps.store ?? requestRagStore;
    const maxNewVectors = Number.isFinite(deps.maxNewVectors)
        ? Math.max(0, Math.floor(deps.maxNewVectors ?? 0))
        : Number.POSITIVE_INFINITY;

    initWorkerFn();
    const ready = await ensureReadyFn();
    if (!ready) {
        return { processed: 0, total: 0, skipped: true };
    }

    const modelId = getCurrentModelId();
    const previousState = await readTaskState();

    if (previousState?.status === "completed" && previousState.modelId === modelId) {
        const existingCount = await countExistingVectors();
        if (existingCount >= previousState.total) {
            return { processed: 0, total: previousState.total, skipped: true };
        }
    }

    const entries = normalizeSystemDictionaryEntries(level, await fetchEntries());
    const total = entries.length;
    const existingVectorIds = new Set(
        (await listExistingVectors())
            .map((item) => getSystemVectorIdentity(level, item))
            .filter(Boolean),
    );

    if (existingVectorIds.size >= total && total > 0) {
        await writeTaskState(nowState({
            status: "completed",
            completed: total,
            total,
            modelId,
        }));
        return { processed: 0, total, skipped: true };
    }

    const shouldResume = previousState?.status === "running" && previousState.modelId === modelId;
    const startIndex = shouldResume
        ? Math.min(Math.max(previousState.completed, 0), total)
        : 0;
    let completed = startIndex;
    let processed = 0;

    await writeTaskState(nowState({
        status: "running",
        completed,
        total,
        modelId,
    }));

    try {
        for (let index = startIndex; index < entries.length; index += 1) {
            const entry = entries[index];
            const text = formatSystemDictionaryText(entry);
            if (!text) {
                completed += 1;
                continue;
            }

            const wordKey = normalizeWordKey(entry.word || "");
            const cefrLevel = getSystemDictionaryCefrLevel(level, entry);
            const vectorId = getSystemDictionaryVectorId(level, wordKey, cefrLevel);
            if (existingVectorIds.has(vectorId)) {
                completed += 1;
                continue;
            }

            if (processed >= maxNewVectors) {
                break;
            }

            await store(text, "system", {
                vocabId: wordKey,
                wordKey,
                level,
                cefrLevel,
                type: "system_dictionary",
                vectorId,
            });
            existingVectorIds.add(vectorId);
            completed += 1;
            processed += 1;

            if (processed % 10 === 0 || completed === total) {
                await writeTaskState(nowState({
                    status: "running",
                    completed,
                    total,
                    modelId,
                }));
            }
        }

        if (completed >= total) {
            await writeTaskState(nowState({
                status: "completed",
                completed: total,
                total,
                modelId,
            }));
        } else {
            await writeTaskState(nowState({
                status: "running",
                completed,
                total,
                modelId,
            }));
        }
        return { processed, total };
    } catch (error) {
        await writeTaskState(nowState({
            status: "error",
            completed,
            total,
            modelId,
            error: error instanceof Error ? error.message : String(error),
        }));
        throw error;
    }
}

export async function processDefaultRagIngestionQueue(
    dictionaries = DEFAULT_RAG_SYSTEM_DICTIONARIES,
    options: DefaultRagIngestionOptions = {},
): Promise<RagTaskResult[]> {
    const results: RagTaskResult[] = [];
    const systemBatchSize = options.systemBatchSize ?? DEFAULT_AUTO_SYSTEM_BATCH_SIZE;
    const waitForSlot = options.waitForSlot ?? waitForBackgroundIngestionSlot;
    const createSystemDeps = options.createSystemDeps ?? (() => ({}));

    results.push(await processVocabularyTask(options.vocabularyDeps));

    let shouldContinue = false;

    for (const dictionary of dictionaries) {
        await waitForSlot();
        try {
            const result = await processSystemDictionaryTask(dictionary, {
                ...createSystemDeps(dictionary),
                maxNewVectors: systemBatchSize,
            });
            results.push(result);
            if (!result.skipped && result.total > 0 && result.processed >= systemBatchSize) {
                shouldContinue = true;
            }
            if (!result.skipped && result.total > 0 && result.processed < result.total) {
                shouldContinue = true;
            }
        } catch (error) {
            console.warn(`RAG system dictionary ingestion failed for ${dictionary}`, error);
            results.push({ processed: 0, total: 0, skipped: true });
        }
    }

    if (shouldContinue && typeof window !== "undefined" && !queuedAutoContinuation) {
        queuedAutoContinuation = true;
        window.setTimeout(() => {
            queuedAutoContinuation = false;
            void scheduleDefaultRagIngestionQueue(dictionaries);
        }, AUTO_QUEUE_CONTINUE_DELAY_MS);
    }

    return results;
}

export function scheduleDefaultRagIngestionQueue(
    dictionaries = DEFAULT_RAG_SYSTEM_DICTIONARIES,
): Promise<RagTaskResult[]> {
    if (typeof window === "undefined") {
        return Promise.resolve([]);
    }

    if (pendingAutoIngestion) {
        return pendingAutoIngestion;
    }

    pendingAutoIngestion = processDefaultRagIngestionQueue(dictionaries)
        .catch((error) => {
            console.warn("Default RAG ingestion failed", error);
            return [];
        })
        .finally(() => {
            pendingAutoIngestion = null;
        });

    return pendingAutoIngestion;
}

export function scheduleVocabularyRagIngestion(): Promise<RagTaskResult> {
    if (typeof window === "undefined") {
        return Promise.resolve({ processed: 0, total: 0, skipped: true });
    }

    if (pendingVocabularyIngestion) {
        return pendingVocabularyIngestion;
    }

    pendingVocabularyIngestion = processVocabularyTask()
        .catch((error) => {
            console.warn("Vocabulary RAG ingestion failed", error);
            return { processed: 0, total: 0, skipped: true };
        })
        .finally(() => {
            pendingVocabularyIngestion = null;
        });

    return pendingVocabularyIngestion;
}
