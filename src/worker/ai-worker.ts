import { pipeline, FeatureExtractionPipeline, env } from '@huggingface/transformers';
import { db } from '../lib/db';
import type { VectorMemoryItem } from '../lib/db';
import { createRagQueryCollector } from '../lib/rag-query';

// Optimization for Domestic Network
env.allowLocalModels = false;
env.remoteHost = self.location.origin + '/api/models';

let generator: FeatureExtractionPipeline | null = null;
let initPromise: Promise<void> | null = null;

type EmbeddingOutput = {
    data: Float32Array | number[];
};

const VECTOR_SOURCES = new Set<VectorMemoryItem["source"]>([
    "vocab",
    "chunk",
    "note",
    "system",
    "error_ledger",
]);

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function asEmbeddingOutput(value: unknown): EmbeddingOutput {
    return value as EmbeddingOutput;
}

function normalizeVectorSource(source: unknown): VectorMemoryItem["source"] {
    return typeof source === "string" && VECTOR_SOURCES.has(source as VectorMemoryItem["source"])
        ? source as VectorMemoryItem["source"]
        : "chunk";
}

function normalizeMetadataFilter(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");
    return Object.fromEntries(entries);
}

async function initModel(modelId: string, onProgress: (progress: unknown) => void) {
    if (generator) return;
    if (initPromise) return initPromise;
    
    initPromise = (async () => {
        try {
            // Strip all forced configurations (device, dtype, quantizations)
            // Let Transformers.js globally negotiate the best available format automatically.
            generator = await pipeline(
                'feature-extraction',
                modelId,
                {
                    progress_callback: onProgress,
                }
            );
        } catch (err: unknown) {
            console.error("Initialization Error:", err);
            throw new Error(`Failed to load model. Error: ${getErrorMessage(err)}`);
        }
    })();
    
    return initPromise;
}

function cosineSimilarity(v1: Float32Array | number[], v2: Float32Array | number[]) {
    let dot = 0; let n1 = 0; let n2 = 0;
    for (let i = 0; i < v1.length; i++) {
        dot += v1[i] * v2[i];
        n1 += v1[i] * v1[i];
        n2 += v2[i] * v2[i];
    }
    const den = Math.sqrt(n1) * Math.sqrt(n2);
    return den === 0 ? 0 : dot / den;
}

self.addEventListener('message', async (e) => {
    const { id, type, payload } = e.data;
    
    if (type === 'init') {
        const { modelId } = payload;
        try {
            // Migration check: if the model changes, vectors dimensions will be incompatible
            const metaKey = await db.sync_meta.get('vector_model_id');
            if (metaKey?.value !== modelId) {
                console.log(`[AI Worker] Upgrading vector engine to ${modelId}. Wiping obsolete vector dimension cache...`);
                await db.rag_vectors.clear();
                await db.sync_meta.put({ key: 'vector_model_id', value: modelId, updated_at: Date.now() });
            }

            await initModel(modelId, (progress) => {
                self.postMessage({ id, type: 'init_progress', payload: progress });
            });
            self.postMessage({ id, type: 'init_ready' });
        } catch (error: unknown) {
            self.postMessage({ id, type: 'init_error', payload: getErrorMessage(error) });
        }
    } 
    else if (type === 'predict') {
        const { input, reference } = payload;
        if (!generator) {
            self.postMessage({ id, type: 'predict_error', payload: "Model not initialized" });
            return;
        }
        
        try {
            const rawClean = (input || "").trim();
            if (!rawClean) {
                self.postMessage({ id, type: 'predict_done', payload: "" });
                return;
            }
            
            // 1. Get input embedding
            // We use pooling: 'cls' to get the single sentence-level embedding vector
            const inputOut = asEmbeddingOutput(await generator(rawClean, { pooling: 'cls', normalize: true }));
            const inputVector = inputOut.data;
            
            // 2. Generate prefix chunks of reference
            // e.g. ref = "This message says the driver..."
            // tokenizes into ["This", "message", "says", ...] by space. Just a simple approx tokenizer.
            const refWords = reference.trim().split(/\s+/);
            const prefixStrings: string[] = [];
            const remainderStrings: string[] = [];
            
            for (let i = 1; i <= refWords.length; i++) {
                prefixStrings.push(refWords.slice(0, i).join(' '));
                remainderStrings.push(refWords.slice(i).join(' ')); // What comes AFTER the prefix
            }
            
            // 3. Score all prefixes individually (SEQUENTIALLY to prevent ONNX WASM deadlock)
            let maxSim = -Infinity;
            let bestIndex = -1;
            
            const prefixOuts: EmbeddingOutput[] = [];
            for (const p of prefixStrings) {
                const out = asEmbeddingOutput(await generator(p, { pooling: 'cls', normalize: true }));
                prefixOuts.push(out);
            }
            
            for (let i = 0; i < prefixOuts.length; i++) {
                const sim = cosineSimilarity(inputVector, prefixOuts[i].data);
                if (sim > maxSim) {
                    maxSim = sim;
                    bestIndex = i;
                }
            }
            
            // 4. Threshold lock. If the semantic similarity of the BEST prefix > 0.82
            if (maxSim > 0.80 && bestIndex !== -1 && remainderStrings[bestIndex]) {
                const completion = remainderStrings[bestIndex];
                self.postMessage({ id, type: 'predict_done', payload: " " + completion });
            } else {
                self.postMessage({ id, type: 'predict_done', payload: "" });
            }
            
        } catch (error: unknown) {
             self.postMessage({ id, type: 'predict_error', payload: getErrorMessage(error) });
        }
    }
    else if (type === 'grade') {
        const { input, reference } = payload;
        if (!generator) {
            self.postMessage({ id, type: 'grade_error', payload: "Model not initialized" });
            return;
        }
        try {
            const userRaw = (input || "").trim();
            const refRaw = (reference || "").trim();
            if (!userRaw || !refRaw) {
                self.postMessage({ id, type: 'grade_done', payload: 0 });
                return;
            }
            // Run sequentially to prevent ONNX Session deadlocks
            const userOut = asEmbeddingOutput(await generator(userRaw, { pooling: 'cls', normalize: true }));
            const refOut = asEmbeddingOutput(await generator(refRaw, { pooling: 'cls', normalize: true }));
            
            const sim = cosineSimilarity(userOut.data, refOut.data);
            self.postMessage({ id, type: 'grade_done', payload: sim });
        } catch(error: unknown) {
            self.postMessage({ id, type: 'grade_error', payload: getErrorMessage(error) });
        }
    }
    else if (type === 'embed') {
        const { inputs } = payload;
        if (!generator) {
            self.postMessage({ id, type: 'embed_error', payload: "Model not initialized" });
            return;
        }
        try {
            if (!inputs || !inputs.length) {
                self.postMessage({ id, type: 'embed_done', payload: [] });
                return;
            }
            const embeddings: number[][] = [];
            for (const input of inputs) {
                const out = asEmbeddingOutput(await generator(input, { pooling: 'cls', normalize: true }));
                embeddings.push(Array.from(out.data));
            }
            self.postMessage({ id, type: 'embed_done', payload: embeddings });
        } catch(error: unknown) {
            self.postMessage({ id, type: 'embed_error', payload: getErrorMessage(error) });
        }
    }
    else if (type === 'rag_store') {
        const { text, source, metadata } = payload;
        if (!generator) {
            self.postMessage({ id, type: 'rag_store_error', payload: "Model not initialized" });
            return;
        }
        try {
            if (!text || !text.trim()) {
                self.postMessage({ id, type: 'rag_store_done', payload: false });
                return;
            }
            const out = asEmbeddingOutput(await generator(text.trim(), { pooling: 'cls', normalize: true }));
            const floatArray = out.data; // Float32Array
            const vectorId = typeof metadata?.vectorId === 'string' && metadata.vectorId.trim()
                ? metadata.vectorId.trim()
                : crypto.randomUUID();
            
            await db.rag_vectors.put({
                id: vectorId,
                text: text.trim(),
                embedding: Array.from(floatArray),
                source: normalizeVectorSource(source),
                metadata,
                created_at: Date.now()
            });
            
            self.postMessage({ id, type: 'rag_store_done', payload: true });
        } catch(error: unknown) {
            self.postMessage({ id, type: 'rag_store_error', payload: getErrorMessage(error) });
        }
    }
    else if (type === 'rag_query') {
        const { query, topK = 3, threshold = 0.85, namespace, metadataFilter } = payload;
        if (!generator) {
            self.postMessage({ id, type: 'rag_query_error', payload: "Model not initialized" });
            return;
        }
        try {
            if (!query || !query.trim()) {
                self.postMessage({ id, type: 'rag_query_done', payload: [] });
                return;
            }
            const out = asEmbeddingOutput(await generator(query.trim(), { pooling: 'cls', normalize: true }));
            const queryVector = out.data;
            const normalizedNamespace = normalizeVectorSource(namespace);
            const hasNamespace = typeof namespace === "string" && VECTOR_SOURCES.has(namespace as VectorMemoryItem["source"]);
            
            const collector = createRagQueryCollector({
                queryVector,
                topK,
                threshold,
                namespace: hasNamespace ? normalizedNamespace : undefined,
                metadataFilter: normalizeMetadataFilter(metadataFilter),
            });
            const collection = hasNamespace
                ? db.rag_vectors.where('source').equals(normalizedNamespace)
                : db.rag_vectors.toCollection();

            await collection.each((doc) => {
                collector.consider(doc);
            });
            const results = collector.getResults();
            
            self.postMessage({ id, type: 'rag_query_done', payload: results });
        } catch(error: unknown) {
            self.postMessage({ id, type: 'rag_query_error', payload: getErrorMessage(error) });
        }
    }
});
