import { describe, expect, it } from "vitest";

import {
    applyInlineCoachChunk,
    consumeInlineCoachBuffer,
    createEmptyInlineCoachTip,
} from "./inline-coach-stream";

describe("consumeInlineCoachBuffer", () => {
    it("parses complete newline-delimited chunks and preserves the trailing partial fragment", () => {
        const result = consumeInlineCoachBuffer(
            '{"kind":"meta","type":"scaffold"}\n{"kind":"text_delta","delta":"先补主句"}\n{"kind":"do',
        );

        expect(result.chunks).toHaveLength(2);
        expect(result.chunks[0]).toMatchObject({ kind: "meta", type: "scaffold" });
        expect(result.chunks[1]).toMatchObject({ kind: "text_delta", delta: "先补主句" });
        expect(result.remaining).toBe('{"kind":"do');
    });
});

describe("applyInlineCoachChunk", () => {
    it("accumulates text deltas and exposes structured meta fields for the UI", () => {
        let tip = createEmptyInlineCoachTip("scaffold");

        tip = applyInlineCoachChunk(tip, {
            kind: "meta",
            type: "scaffold",
            errorWord: "works",
            fixWord: "is viable",
            backtrans: "只是能跑，不够正式。",
            ragConcepts: ["旧账(depends on)"],
            card: {
                kind: "vocab",
                content: "viable | /ˈvaɪəb(ə)l/ | 可行的 | a viable plan",
            },
        });
        tip = applyInlineCoachChunk(tip, {
            kind: "text_delta",
            delta: "先别贴参考答案。",
        });
        tip = applyInlineCoachChunk(tip, {
            kind: "text_delta",
            delta: " 把评价词补进去。",
        });
        tip = applyInlineCoachChunk(tip, {
            kind: "done",
        });

        expect(tip.text).toBe("先别贴参考答案。 把评价词补进去。");
        expect(tip.errorWord).toBe("works");
        expect(tip.fixWord).toBe("is viable");
        expect(tip.backtrans).toContain("能跑");
        expect(tip.ragConcepts).toEqual(["旧账(depends on)"]);
        expect(tip.vocabCard).toContain("viable");
        expect(tip.grammarCard).toBeUndefined();
        expect(tip.exampleCard).toBeUndefined();
    });
});
