import type { VectorMemoryItem } from "./db";

export interface RagQueryResult {
    id: string | undefined;
    text: string;
    score: number;
    source: VectorMemoryItem["source"];
    metadata: VectorMemoryItem["metadata"];
}

interface RagQueryCollectorOptions {
    queryVector: Float32Array | number[];
    topK: number;
    threshold: number;
    namespace?: VectorMemoryItem["source"];
    metadataFilter?: Record<string, string>;
}

function cosineSimilarity(v1: Float32Array | number[], v2: Float32Array | number[]) {
    let dot = 0;
    let n1 = 0;
    let n2 = 0;
    for (let i = 0; i < v1.length; i++) {
        dot += v1[i] * v2[i];
        n1 += v1[i] * v1[i];
        n2 += v2[i] * v2[i];
    }
    const den = Math.sqrt(n1) * Math.sqrt(n2);
    return den === 0 ? 0 : dot / den;
}

function matchesMetadataFilter(item: VectorMemoryItem, metadataFilter?: Record<string, string>) {
    if (!metadataFilter) {
        return true;
    }
    if (!item.metadata) {
        return false;
    }

    for (const [key, value] of Object.entries(metadataFilter)) {
        if (item.metadata[key] !== value) {
            return false;
        }
    }
    return true;
}

export function createRagQueryCollector({
    queryVector,
    topK,
    threshold,
    namespace,
    metadataFilter,
}: RagQueryCollectorOptions) {
    const limit = Math.max(0, Math.floor(topK));
    const results: RagQueryResult[] = [];

    return {
        consider(item: VectorMemoryItem) {
            if (limit === 0) {
                return;
            }
            if (namespace && item.source !== namespace) {
                return;
            }
            if (!matchesMetadataFilter(item, metadataFilter)) {
                return;
            }

            const score = cosineSimilarity(queryVector, item.embedding);
            if (score < threshold) {
                return;
            }

            results.push({
                id: item.id,
                text: item.text,
                score,
                source: item.source,
                metadata: item.metadata,
            });
            results.sort((a, b) => b.score - a.score);
            if (results.length > limit) {
                results.pop();
            }
        },
        getResults() {
            return [...results];
        },
    };
}
