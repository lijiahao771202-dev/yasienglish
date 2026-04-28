import { db } from './db';
import { useVectorEngineStore } from './vector-engine-store';

const pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
let worker: Worker | null = null;
let requestCounter = 0;

export type BGEStatus = 'idle' | 'loading' | 'ready' | 'error';
let currentStatus: BGEStatus = 'idle';
let currentError: string | null = null;
const statusListeners = new Set<(status: BGEStatus, error: string | null) => void>();
let pendingErrorLedgerVectorSync: Promise<number> | null = null;

export function subscribeBGEStatus(listener: (status: BGEStatus, error: string | null) => void) {
    statusListeners.add(listener);
    listener(currentStatus, currentError);
    return () => {
        statusListeners.delete(listener);
    };
}

function updateStatus(status: BGEStatus, error: string | null = null) {
    currentStatus = status;
    currentError = error;
    statusListeners.forEach(listener => listener(status, error));
}

export function initBGEWorker() {
    if (typeof window === 'undefined') return;
    if (worker) return;

    worker = new Worker(new URL('../worker/ai-worker.ts', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
        const { id, type, payload } = e.data;
        
        if (type === 'init_ready') {
            updateStatus('ready');
        } else if (type === 'init_error') {
            updateStatus('error', payload);
        } else if (id !== undefined && pendingRequests.has(id)) {
            const { resolve, reject } = pendingRequests.get(id)!;
            if (type.endsWith('_done')) resolve(payload);
            else if (type.endsWith('_error')) reject(new Error(payload));
            pendingRequests.delete(id);
        }
    };

    updateStatus('loading');
    const modelId = useVectorEngineStore.getState().vectorModelId;
    worker.postMessage({ type: 'init', payload: { modelId } });
}

export function switchBGEModel(newModelId: string) {
    if (typeof window === 'undefined') return;
    useVectorEngineStore.getState().setVectorModelId(newModelId);

    if (worker) {
        worker.terminate();
        worker = null;
    }

    pendingRequests.forEach(({ reject }) => reject(new Error("Model switched, cancelling request")));
    pendingRequests.clear();

    currentStatus = 'idle';
    currentError = null;
    updateStatus('idle', null);

    initBGEWorker();
}

export function ensureBGEReady(): Promise<boolean> {
    if (typeof window === 'undefined') return Promise.resolve(false);
    
    if (currentStatus === 'ready') return Promise.resolve(true);
    if (currentStatus === 'error') return Promise.resolve(false);
    
    return new Promise((resolve) => {
        const unsubscribe = subscribeBGEStatus((status) => {
            if (status === 'ready') {
                unsubscribe();
                resolve(true);
            } else if (status === 'error') {
                unsubscribe();
                resolve(false);
            }
        });
        if (currentStatus === 'idle') {
            initBGEWorker();
        }
    });
}

export function requestPrefixCompletion(input: string, reference: string): Promise<string> {
    if (!worker || currentStatus !== 'ready') return Promise.resolve("");
    const id = ++requestCounter;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        worker!.postMessage({ id, type: 'predict', payload: { input, reference } });
    });
}

export function requestSemanticGrade(input: string, reference: string): Promise<number> {
    if (!worker || currentStatus !== 'ready') return Promise.reject(new Error("BGE not ready"));
    const id = ++requestCounter;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        worker!.postMessage({ id, type: 'grade', payload: { input, reference } });
    });
}

export function requestEmbeddings(inputs: string[]): Promise<number[][]> {
    if (!worker || currentStatus !== 'ready') return Promise.reject(new Error("BGE not ready"));
    const id = ++requestCounter;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        worker!.postMessage({ id, type: 'embed', payload: { inputs } });
    });
}

export function requestRagStore(text: string, source: 'vocab' | 'chunk' | 'note' | 'system' | 'error_ledger', metadata?: any): Promise<boolean> {
    if (!worker || currentStatus !== 'ready') return Promise.reject(new Error("BGE not ready"));
    const id = ++requestCounter;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        worker!.postMessage({ id, type: 'rag_store', payload: { text, source, metadata } });
    });
}

export function requestRagQuery(query: string, topK: number = 3, threshold: number = 0.85, namespace?: string, metadataFilter?: Record<string, string>): Promise<Array<{id: string, text: string, score: number, source: string, metadata: any}>> {
    if (!worker || currentStatus !== 'ready') return Promise.resolve([]);
    const id = ++requestCounter;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        worker!.postMessage({ id, type: 'rag_query', payload: { query, topK, threshold, namespace, metadataFilter } });
    });
}

interface ErrorLedgerVectorSyncDeps {
    ensureReady?: () => Promise<boolean>;
    listErrorLedgerEntries?: () => Promise<Array<{ text: string; tag?: string; created_at: number }>>;
    listErrorLedgerVectorTexts?: () => Promise<string[]>;
    store?: (text: string, source: 'error_ledger', metadata?: Record<string, unknown>) => Promise<boolean>;
}

export async function syncMissingErrorLedgerVectors(deps: ErrorLedgerVectorSyncDeps = {}): Promise<number> {
    if (
        typeof window === 'undefined'
        && !deps.ensureReady
        && !deps.listErrorLedgerEntries
        && !deps.listErrorLedgerVectorTexts
        && !deps.store
    ) {
        return 0;
    }

    const ensureReadyFn = deps.ensureReady ?? ensureBGEReady;
    if (!await ensureReadyFn()) {
        return 0;
    }

    const listErrorLedgerEntries = deps.listErrorLedgerEntries ?? (() => db.error_ledger.toArray());
    const listErrorLedgerVectorTexts = deps.listErrorLedgerVectorTexts
        ?? (async () => {
            const vectors = await db.rag_vectors.where('source').equals('error_ledger').toArray();
            return vectors.map((item) => item.text);
        });
    const store = deps.store ?? requestRagStore;

    const [entries, vectorTexts] = await Promise.all([
        listErrorLedgerEntries(),
        listErrorLedgerVectorTexts(),
    ]);
    const existingTexts = new Set(vectorTexts);
    const missingEntries = entries.filter((entry) => entry.text.trim() && !existingTexts.has(entry.text));

    for (const entry of missingEntries) {
        await store(entry.text, 'error_ledger', {
            tag: entry.tag,
            tags: entry.tag ? [entry.tag] : [],
            timestamp: entry.created_at,
        });
    }

    return missingEntries.length;
}

export function scheduleMissingErrorLedgerVectorSync(): Promise<number> {
    if (typeof window === 'undefined') {
        return Promise.resolve(0);
    }

    if (pendingErrorLedgerVectorSync) {
        return pendingErrorLedgerVectorSync;
    }

    pendingErrorLedgerVectorSync = syncMissingErrorLedgerVectors()
        .finally(() => {
            pendingErrorLedgerVectorSync = null;
        });

    return pendingErrorLedgerVectorSync;
}
