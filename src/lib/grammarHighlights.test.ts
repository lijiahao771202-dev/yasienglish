import { describe, expect, it } from "vitest";

import {
    buildGrammarHighlightRanges,
    buildGrammarHighlightSegments,
    buildGrammarViewModel,
    translateGrammarType,
} from "./grammarHighlights";

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

    it("normalizes highlight metadata with layers and segment translations", () => {
        const text = "She quickly finished the report in the office.";
        const model = buildGrammarViewModel(text, [
            {
                sentence: text,
                highlights: [
                    { substring: "She", type: "subject", explanation: "发出动作的人", segment_translation: "她" },
                    { substring: "quickly", type: "状语", explanation: "补充动作方式", segment_translation: "很快地" },
                    { substring: "finished", type: "谓语", explanation: "核心动作", segment_translation: "完成了" },
                    { substring: "in the office", type: "介词短语", explanation: "补充地点信息", segment_translation: "在办公室里" },
                ],
            },
        ]);

        expect(model.full.filter((segment) => segment.highlight)).toHaveLength(4);
        expect(model.full.find((segment) => segment.highlight?.normalizedType === "主语")?.highlight).toMatchObject({
            layer: "core",
            translatedLabel: "主语",
            segmentTranslation: "她",
        });
        expect(model.full.find((segment) => segment.highlight?.normalizedType === "状语")?.highlight).toMatchObject({
            layer: "modifier",
            translatedLabel: "状语",
            segmentTranslation: "很快地",
        });
        expect(model.full.find((segment) => segment.highlight?.normalizedType === "介词短语")?.highlight).toMatchObject({
            layer: "modifier",
            translatedLabel: "介词短语",
            segmentTranslation: "在办公室里",
        });
    });

    it("keeps only core and structure layers in core display mode", () => {
        const text = "When she arrived, she quickly opened the door.";
        const model = buildGrammarViewModel(text, [
            {
                sentence: text,
                highlights: [
                    { substring: "When she arrived", type: "状语从句", explanation: "交代时间背景", segment_translation: "当她到达时" },
                    { substring: "she", type: "主语", explanation: "动作发出者", segment_translation: "她" },
                    { substring: "quickly", type: "状语", explanation: "修饰动作速度", segment_translation: "迅速地" },
                    { substring: "opened", type: "谓语", explanation: "核心动作", segment_translation: "打开了" },
                ],
            },
        ]);

        expect(model.core.filter((segment) => segment.highlight).map((segment) => segment.highlight?.normalizedType)).toEqual([
            "状语从句",
            "主语",
            "谓语",
        ]);
        expect(model.full.some((segment) => segment.highlight?.normalizedType === "状语")).toBe(true);
    });

    it("returns unknown grammar labels as-is without recursive fallback", () => {
        expect(translateGrammarType("独立主格结构")).toBe("独立主格结构");
    });
});
