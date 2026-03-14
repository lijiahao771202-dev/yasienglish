import { describe, expect, it } from "vitest";

import { db } from "./db";

function getIndexNames(tableName: string) {
    return db.tables.find((table) => table.name === tableName)?.schema.indexes.map((index) => index.name) ?? [];
}

describe("Dexie schema regressions", () => {
    it("keeps the ai_cache compound key+type index for analysis cache lookups", () => {
        expect(getIndexNames("ai_cache")).toContain("[key+type]");
    });

    it("keeps the due index on vocabulary for review queries", () => {
        expect(getIndexNames("vocabulary")).toContain("due");
    });

    it("keeps the timestamp index on writing_history for ordered loads", () => {
        expect(getIndexNames("writing_history")).toContain("timestamp");
    });
});
