import { describe, expect, it } from "vitest";

import { buildGrammarHighlightRanges, buildGrammarHighlightSegments } from "./grammarHighlights";

describe("grammarHighlights", () => {
    it("maps repeated substrings to later occurrences in order", () => {
        const text = "I said that I would go.";
        const sentences = [
            {
                sentence: text,
                highlights: [
                    { substring: "I", type: "主语", explanation: "主句主语" },
                    { substring: "said", type: "谓语", explanation: "主句谓语" },
                    { substring: "I", type: "主语", explanation: "从句主语" },
                ],
            },
        ];

        const ranges = buildGrammarHighlightRanges(text, sentences);

        expect(ranges).toHaveLength(3);
        expect(ranges[0]).toMatchObject({ start: 0, end: 1, explanation: "主句主语" });
        expect(ranges[1]).toMatchObject({ start: 2, end: 6, explanation: "主句谓语" });
        expect(ranges[2]).toMatchObject({ start: 12, end: 13, explanation: "从句主语" });
    });

    it("reconstructs the original sentence from highlighted and plain segments", () => {
        const text = "She will leave soon.";
        const sentences = [
            {
                sentence: text,
                highlights: [
                    { substring: "She", type: "主语", explanation: "动作发出者" },
                    { substring: "will leave", type: "谓语", explanation: "将来动作" },
                    { substring: "soon", type: "状语", explanation: "补充时间信息" },
                ],
            },
        ];

        const segments = buildGrammarHighlightSegments(text, sentences);

        expect(segments.map((segment) => segment.text).join("")).toBe(text);
        expect(
            segments
                .filter((segment) => segment.highlight)
                .map((segment) => segment.highlight?.type),
        ).toEqual(["主语", "谓语", "状语"]);
    });

    it("falls back to plain text segments when no highlights are available", () => {
        const text = "Nothing special here.";
        const segments = buildGrammarHighlightSegments(text, [
            { sentence: text, highlights: [] },
        ]);

        expect(segments).toEqual([
            {
                start: 0,
                end: text.length,
                text,
                highlight: null,
            },
        ]);
    });
});
