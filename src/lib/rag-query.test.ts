import { describe, expect, it } from "vitest";

import { createRagQueryCollector } from "./rag-query";
import type { VectorMemoryItem } from "./db";

function createVector(args: {
    id: string;
    embedding: number[];
    source?: VectorMemoryItem["source"];
    metadata?: Record<string, string>;
}): VectorMemoryItem {
    return {
        id: args.id,
        text: `${args.id} text`,
        embedding: args.embedding,
        source: args.source ?? "system",
        metadata: args.metadata,
        created_at: Date.now(),
    };
}

describe("rag-query", () => {
    it("keeps only the top matches without returning raw embeddings", () => {
        const collector = createRagQueryCollector({
            queryVector: [1, 0],
            topK: 2,
            threshold: 0.1,
        });

        collector.consider(createVector({ id: "weak", embedding: [0.2, 0.8] }));
        collector.consider(createVector({ id: "best", embedding: [1, 0] }));
        collector.consider(createVector({ id: "second", embedding: [0.8, 0.2] }));
        collector.consider(createVector({ id: "below", embedding: [0, 1] }));

        const results = collector.getResults();

        expect(results.map((item) => item.id)).toEqual(["best", "second"]);
        expect(results.every((item) => !("embedding" in item))).toBe(true);
    });

    it("applies namespace and metadata filters before ranking", () => {
        const collector = createRagQueryCollector({
            queryVector: [1, 0],
            topK: 5,
            threshold: 0,
            namespace: "system",
            metadataFilter: { level: "cet4" },
        });

        collector.consider(createVector({ id: "vocab", source: "vocab", embedding: [1, 0], metadata: { level: "cet4" } }));
        collector.consider(createVector({ id: "wrong-level", embedding: [1, 0], metadata: { level: "cet6" } }));
        collector.consider(createVector({ id: "match", embedding: [1, 0], metadata: { level: "cet4" } }));

        expect(collector.getResults().map((item) => item.id)).toEqual(["match"]);
    });
});
