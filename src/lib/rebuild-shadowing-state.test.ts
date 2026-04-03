import { describe, expect, it } from "vitest";

import {
    REBUILD_SHADOWING_AFFECTS_ELO,
    createRebuildShadowingState,
    getRebuildShadowingEntry,
    upsertRebuildShadowingEntry,
} from "@/lib/rebuild-shadowing-state";

describe("rebuild shadowing state helpers", () => {
    it("updates sentence shadowing entry", () => {
        const initial = createRebuildShadowingState<string, { score: number }>();
        const next = upsertRebuildShadowingEntry(
            initial,
            { kind: "sentence" },
            {
                wavBlob: "audio-a",
                result: { score: 8.7 },
                submitError: null,
            },
            100,
        );

        expect(next.sentence.wavBlob).toBe("audio-a");
        expect(next.sentence.result?.score).toBe(8.7);
        expect(next.sentence.updatedAt).toBe(100);
    });

    it("stores and overwrites segment shadowing entry by index", () => {
        const initial = createRebuildShadowingState<string, { score: number }>();
        const withFirst = upsertRebuildShadowingEntry(
            initial,
            { kind: "segment", segmentIndex: 1 },
            {
                wavBlob: "segment-audio",
                result: { score: 6.2 },
            },
            200,
        );
        const withOverwrite = upsertRebuildShadowingEntry(
            withFirst,
            { kind: "segment", segmentIndex: 1 },
            {
                result: { score: 9.1 },
                submitError: "retry",
            },
            300,
        );

        const segmentEntry = getRebuildShadowingEntry(withOverwrite, { kind: "segment", segmentIndex: 1 });
        expect(segmentEntry.wavBlob).toBe("segment-audio");
        expect(segmentEntry.result?.score).toBe(9.1);
        expect(segmentEntry.submitError).toBe("retry");
        expect(segmentEntry.updatedAt).toBe(300);
    });

    it("keeps segment buckets isolated", () => {
        const initial = createRebuildShadowingState<string, { score: number }>();
        const next = upsertRebuildShadowingEntry(
            initial,
            { kind: "segment", segmentIndex: 0 },
            { result: { score: 7.5 } },
            400,
        );

        const segment0 = getRebuildShadowingEntry(next, { kind: "segment", segmentIndex: 0 });
        const segment2 = getRebuildShadowingEntry(next, { kind: "segment", segmentIndex: 2 });
        expect(segment0.result?.score).toBe(7.5);
        expect(segment2.result).toBeNull();
    });

    it("marks rebuild shadowing as training-only (no Elo impact)", () => {
        expect(REBUILD_SHADOWING_AFFECTS_ELO).toBe(false);
    });
});
