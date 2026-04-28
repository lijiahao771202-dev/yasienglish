import { describe, expect, it } from "vitest";

import { syncMissingErrorLedgerVectors } from "./bge-client";

describe("syncMissingErrorLedgerVectors", () => {
    it("vectorizes only pulled black-history entries that are still missing locally", async () => {
        const store = async (text: string, source: string, metadata?: Record<string, unknown>) => {
            calls.push({ text, source, metadata });
            return true;
        };
        const calls: Array<{ text: string; source: string; metadata?: Record<string, unknown> }> = [];

        const result = await syncMissingErrorLedgerVectors({
            ensureReady: async () => true,
            listErrorLedgerEntries: async () => [
                { text: "I goed there yesterday.", tag: "grammar", created_at: 1 },
                { text: "She don't like it.", tag: "agreement", created_at: 2 },
            ],
            listErrorLedgerVectorTexts: async () => ["I goed there yesterday."],
            store,
        });

        expect(result).toBe(1);
        expect(calls).toEqual([
            {
                text: "She don't like it.",
                source: "error_ledger",
                metadata: {
                    tag: "agreement",
                    tags: ["agreement"],
                    timestamp: 2,
                },
            },
        ]);
    });
});
