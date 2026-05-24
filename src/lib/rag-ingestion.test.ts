import { describe, expect, it, vi } from "vitest";

import type { VocabItem, VectorMemoryItem } from "@/lib/db";
import {
    buildVocabularyVectorSyncPlan,
    processDefaultRagIngestionQueue,
    processVocabularyTask,
    processSystemDictionaryTask,
    type RagSyncTaskState,
} from "./rag-ingestion";

function createVocab(word: string, translation = "释义"): VocabItem {
    return {
        word,
        word_key: word.toLowerCase(),
        definition: translation,
        translation,
        context: "",
        example: "",
        timestamp: Date.now(),
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        learning_steps: 0,
        state: 0,
        last_review: 0,
        due: Date.now(),
    };
}

function createVector(id: string, wordKey: string): VectorMemoryItem {
    return {
        id,
        text: wordKey,
        embedding: [],
        source: "vocab",
        metadata: { wordKey, vocabId: wordKey },
        created_at: Date.now(),
    };
}

function createSystemVector(id: string, level: string, wordKey: string): VectorMemoryItem {
    return {
        id,
        text: `${wordKey} - 释义`,
        embedding: [],
        source: "system",
        metadata: { wordKey, vocabId: wordKey, level, type: "system_dictionary" },
        created_at: Date.now(),
    };
}

describe("rag-ingestion", () => {
    it("builds a vocab vector sync plan from missing and stale entries", () => {
        const vocabulary = [
            createVocab("abandon"),
            createVocab("bold"),
        ];
        const vectors = [
            createVector("vocab:abandon", "abandon"),
            createVector("vocab:ghost", "ghost"),
        ];

        const plan = buildVocabularyVectorSyncPlan(vocabulary, vectors);

        expect(plan.missing.map((item) => item.word)).toEqual(["bold"]);
        expect(plan.staleVectorIds).toEqual(["vocab:ghost"]);
    });

    it("vectorizes missing learner vocab and removes stale vocab vectors", async () => {
        const deletedVectorIds: string[] = [];
        const stored: Array<{ text: string; source: string; metadata?: Record<string, unknown> }> = [];
        const states: RagSyncTaskState[] = [];

        const result = await processVocabularyTask({
            initWorker: vi.fn(),
            ensureReady: vi.fn().mockResolvedValue(true),
            getCurrentModelId: vi.fn(() => "Xenova/bge-m3"),
            getTaskState: vi.fn(async (): Promise<RagSyncTaskState> => ({ status: "idle", completed: 0, total: 0, updatedAt: 1 })),
            setTaskState: vi.fn(async (state) => {
                states.push(state);
            }),
            listVocabulary: vi.fn(async () => [
                createVocab("abandon", "放弃"),
                createVocab("bold", "大胆的"),
            ]),
            listVocabVectors: vi.fn(async () => [
                createVector("vocab:abandon", "abandon"),
                createVector("vocab:ghost", "ghost"),
            ]),
            deleteVectors: vi.fn(async (ids) => {
                deletedVectorIds.push(...ids);
            }),
            store: vi.fn(async (text, source, metadata) => {
                stored.push({ text, source, metadata });
                return true;
            }),
        });

        expect(result.processed).toBe(1);
        expect(deletedVectorIds).toEqual(["vocab:ghost"]);
        expect(stored).toEqual([
            {
                text: "bold - 大胆的",
                source: "vocab",
                metadata: expect.objectContaining({
                    vocabId: "bold",
                    wordKey: "bold",
                    vectorId: "vocab:bold",
                    type: "learner_vocab",
                    level: "cet4",
                }),
            },
        ]);
        expect(states.at(-1)).toMatchObject({
            status: "completed",
            completed: 1,
            total: 1,
            modelId: "Xenova/bge-m3",
        });
    });

    it("resumes an interrupted system dictionary instead of starting over", async () => {
        const store = vi.fn().mockResolvedValue(true);

        const result = await processSystemDictionaryTask("cet4", {
            initWorker: vi.fn(),
            ensureReady: vi.fn().mockResolvedValue(true),
            getCurrentModelId: vi.fn(() => "Xenova/bge-m3"),
            getTaskState: vi.fn(async (): Promise<RagSyncTaskState> => ({
                status: "running",
                completed: 1,
                total: 3,
                modelId: "Xenova/bge-m3",
                updatedAt: 1,
            })),
            setTaskState: vi.fn(),
            countExistingVectors: vi.fn(async () => 1),
            fetchEntries: vi.fn(async () => ([
                { word: "abandon", translations: [{ translation: "放弃" }] },
                { word: "bold", translations: [{ translation: "大胆的" }] },
                { word: "calm", translations: [{ translation: "冷静的" }] },
            ])),
            store,
        });

        expect(result.processed).toBe(2);
        expect(store).toHaveBeenCalledTimes(2);
        expect(store.mock.calls[0][0]).toBe("bold - 大胆的");
        expect(store.mock.calls[1][0]).toBe("calm - 冷静的");
    });

    it("dedupes system dictionary rows by their final vector id", async () => {
        const store = vi.fn().mockResolvedValue(true);
        const states: RagSyncTaskState[] = [];

        const result = await processSystemDictionaryTask("cet4", {
            initWorker: vi.fn(),
            ensureReady: vi.fn().mockResolvedValue(true),
            getCurrentModelId: vi.fn(() => "Xenova/bge-m3"),
            getTaskState: vi.fn(async (): Promise<RagSyncTaskState> => ({ status: "idle", completed: 0, total: 0, updatedAt: 1 })),
            setTaskState: vi.fn(async (state) => {
                states.push(state);
            }),
            fetchEntries: vi.fn(async () => ([
                { word: "abandon", translations: [{ translation: "放弃" }] },
                { word: "Abandon", translations: [{ translation: "抛弃" }] },
                { word: "bold", translations: [{ translation: "大胆的" }] },
            ])),
            store,
        });

        expect(result.processed).toBe(2);
        expect(store).toHaveBeenCalledTimes(2);
        expect(store.mock.calls.map((call) => call[0])).toEqual([
            "abandon - 放弃",
            "bold - 大胆的",
        ]);
        expect(states.at(-1)).toMatchObject({
            status: "completed",
            completed: 2,
            total: 2,
        });
    });

    it("does not duplicate existing system vectors created before deterministic ids", async () => {
        const store = vi.fn().mockResolvedValue(true);

        const result = await processSystemDictionaryTask("cet4", {
            initWorker: vi.fn(),
            ensureReady: vi.fn().mockResolvedValue(true),
            getCurrentModelId: vi.fn(() => "Xenova/bge-m3"),
            getTaskState: vi.fn(async (): Promise<RagSyncTaskState> => ({ status: "idle", completed: 0, total: 0, updatedAt: 1 })),
            setTaskState: vi.fn(),
            listExistingVectors: vi.fn(async () => [
                createSystemVector("legacy-random-id", "cet4", "abandon"),
            ]),
            fetchEntries: vi.fn(async () => ([
                { word: "abandon", translations: [{ translation: "放弃" }] },
                { word: "bold", translations: [{ translation: "大胆的" }] },
            ])),
            store,
        });

        expect(result.processed).toBe(1);
        expect(store).toHaveBeenCalledTimes(1);
        expect(store.mock.calls[0][0]).toBe("bold - 大胆的");
    });

    it("skips a completed system dictionary when the model and vector count still match", async () => {
        const fetchEntries = vi.fn();
        const store = vi.fn();

        const result = await processSystemDictionaryTask("cet4", {
            initWorker: vi.fn(),
            ensureReady: vi.fn().mockResolvedValue(true),
            getCurrentModelId: vi.fn(() => "Xenova/bge-m3"),
            getTaskState: vi.fn(async (): Promise<RagSyncTaskState> => ({
                status: "completed",
                completed: 2,
                total: 2,
                modelId: "Xenova/bge-m3",
                updatedAt: 1,
            })),
            setTaskState: vi.fn(),
            countExistingVectors: vi.fn(async () => 2),
            fetchEntries,
            store,
        });

        expect(result.processed).toBe(0);
        expect(result.skipped).toBe(true);
        expect(fetchEntries).not.toHaveBeenCalled();
        expect(store).not.toHaveBeenCalled();
    });

    it("re-ingests a completed system dictionary after the vector model changes", async () => {
        const states: RagSyncTaskState[] = [];
        const store = vi.fn().mockResolvedValue(true);

        const result = await processSystemDictionaryTask("cet4", {
            initWorker: vi.fn(),
            ensureReady: vi.fn().mockResolvedValue(true),
            getCurrentModelId: vi.fn(() => "Xenova/bge-large-en-v1.5"),
            getTaskState: vi.fn(async (): Promise<RagSyncTaskState> => ({
                status: "completed",
                completed: 2,
                total: 2,
                modelId: "Xenova/bge-m3",
                updatedAt: 1,
            })),
            countExistingVectors: vi.fn(async () => 2),
            setTaskState: vi.fn(async (state) => {
                states.push(state);
            }),
            fetchEntries: vi.fn(async () => ([
                { word: "abandon", translations: [{ translation: "放弃" }] },
                { word: "bold", translations: [{ translation: "大胆的" }] },
            ])),
            store,
        });

        expect(result.processed).toBe(2);
        expect(store).toHaveBeenCalledTimes(2);
        expect(states.at(-1)).toMatchObject({
            status: "completed",
            completed: 2,
            total: 2,
            modelId: "Xenova/bge-large-en-v1.5",
        });
    });

    it("limits automatic background system dictionary ingestion to one small idle batch", async () => {
        const store = vi.fn().mockResolvedValue(true);
        const statesByTask = new Map<string, RagSyncTaskState[]>();
        const getStates = (taskName: string) => {
            const states = statesByTask.get(taskName) ?? [];
            statesByTask.set(taskName, states);
            return states;
        };

        const result = await processDefaultRagIngestionQueue(["cet4", "cet6"], {
            systemBatchSize: 2,
            vocabularyDeps: {
                initWorker: vi.fn(),
                ensureReady: vi.fn().mockResolvedValue(true),
                getCurrentModelId: vi.fn(() => "Xenova/bge-m3"),
                getTaskState: vi.fn(async () => null),
                setTaskState: vi.fn(),
                listVocabulary: vi.fn(async () => []),
                listVocabVectors: vi.fn(async () => []),
                deleteVectors: vi.fn(),
                store: vi.fn(),
            },
            createSystemDeps: (level) => ({
                initWorker: vi.fn(),
                ensureReady: vi.fn().mockResolvedValue(true),
                getCurrentModelId: vi.fn(() => "Xenova/bge-m3"),
                getTaskState: vi.fn(async () => null),
                setTaskState: vi.fn(async (state) => {
                    getStates(level).push(state);
                }),
                countExistingVectors: vi.fn(async () => 0),
                listExistingVectors: vi.fn(async () => []),
                fetchEntries: vi.fn(async () => [
                    { word: `${level}-a`, translations: [{ translation: "A" }] },
                    { word: `${level}-b`, translations: [{ translation: "B" }] },
                    { word: `${level}-c`, translations: [{ translation: "C" }] },
                ]),
                store,
            }),
            waitForSlot: vi.fn(async () => undefined),
        });

        expect(result).toHaveLength(2);
        expect(store).toHaveBeenCalledTimes(2);
        expect(getStates("cet4").at(-1)).toMatchObject({
            status: "running",
            completed: 2,
            total: 3,
        });
        expect(getStates("cet6")).toEqual([]);
    });
});
