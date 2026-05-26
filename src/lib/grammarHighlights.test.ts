import { describe, expect, it } from "vitest";

import {
    buildGrammarHighlightRanges,
    buildGrammarHighlightSegments,
    buildGrammarViewModel,
    getGrammarHighlightPalette,
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

    it("standardizes selected aliases while keeping truly unknown labels as-is", () => {
        expect(translateGrammarType("独立主格结构")).toBe("非谓语");
        expect(translateGrammarType("未知句法标签")).toBe("未知句法标签");
    });

    it("treats verb and modal phrases as core structure in core mode", () => {
        const text = "The team can finish the project tomorrow.";
        const model = buildGrammarViewModel(text, [
            {
                sentence: text,
                highlights: [
                    { substring: "The team", type: "主语", explanation: "动作发出者", segment_translation: "这个团队" },
                    { substring: "can finish", type: "modal verb phrase", explanation: "表示有能力完成", segment_translation: "能够完成" },
                    { substring: "the project", type: "宾语", explanation: "动作对象", segment_translation: "这个项目" },
                    { substring: "tomorrow", type: "时间状语", explanation: "补充时间信息", segment_translation: "明天" },
                ],
            },
        ]);

        expect(model.core.filter((segment) => segment.highlight).map((segment) => segment.highlight?.normalizedType)).toEqual([
            "主语",
            "谓语",
            "宾语",
        ]);
        expect(model.core.some((segment) => segment.highlight?.normalizedType === "状语")).toBe(false);
    });

    it("merges contiguous highlights of the same role across whitespace", () => {
        const text = "They acted in the Gulf region yesterday.";
        const ranges = buildGrammarHighlightRanges(text, [
            {
                sentence: text,
                highlights: [
                    { substring: "in the", type: "介词短语", explanation: "补充地点信息", segment_translation: "在这个" },
                    { substring: "Gulf region", type: "介词短语", explanation: "补充地点信息", segment_translation: "海湾地区" },
                ],
            },
        ]);

        expect(ranges).toHaveLength(1);
        expect(ranges[0]).toMatchObject({
            start: text.indexOf("in the"),
            end: text.indexOf("Gulf region") + "Gulf region".length,
            normalizedType: "介词短语",
        });
    });

    it("preserves specific clause labels for distinct visual mapping", () => {
        const text = "I know that he left early.";
        const model = buildGrammarViewModel(text, [
            {
                sentence: text,
                highlights: [
                    { substring: "I", type: "主语", explanation: "发出动作的人" },
                    { substring: "know", type: "谓语", explanation: "核心动作" },
                    { substring: "that he left early", type: "宾语从句", explanation: "作宾语的从句" },
                ],
            },
        ]);

        expect(model.full.some((segment) => segment.highlight?.normalizedType === "宾语从句")).toBe(true);
        expect(model.full.some((segment) => segment.highlight?.normalizedType === "名词性从句")).toBe(false);
    });

    it("keeps non-restrictive relatives and result adverbials as their own labels in the view model", () => {
        const text = "Both methods, which many teachers recommend, can short-circuit the loop, leading to calmer decisions.";
        const model = buildGrammarViewModel(text, [
            {
                sentence: text,
                highlights: [
                    { substring: "which many teachers recommend", type: "非限制性定语从句", explanation: "补充说明前面的 methods" },
                    { substring: "leading to calmer decisions", type: "结果状语", explanation: "表示前面动作带来的结果" },
                ],
            },
        ]);

        expect(model.full.some((segment) => segment.highlight?.normalizedType === "非限制性定语从句")).toBe(true);
        expect(model.full.some((segment) => segment.highlight?.translatedLabel === "非限制性定语从句")).toBe(true);
        expect(model.full.some((segment) => segment.highlight?.normalizedType === "结果状语")).toBe(true);
        expect(model.full.some((segment) => segment.highlight?.translatedLabel === "结果状语")).toBe(true);
        expect(model.full.some((segment) => segment.highlight?.normalizedType === "定语")).toBe(false);
        expect(model.full.some((segment) => segment.highlight?.normalizedType === "状语")).toBe(false);
    });

    it("keeps only the primary grammar tag when one fragment has competing labels", () => {
        const text = "I know that he left early.";
        const model = buildGrammarViewModel(text, [
            {
                sentence: text,
                highlights: [
                    { substring: "that he left early", type: "宾语从句", explanation: "作宾语的从句" },
                    { substring: "he left", type: "主谓结构", explanation: "从句内部主谓骨架" },
                ],
            },
        ]);

        const highlightedSegments = model.full.filter((segment) => segment.highlight);
        expect(highlightedSegments.some((segment) => segment.highlight?.normalizedType === "宾语从句")).toBe(true);
        highlightedSegments.forEach((segment) => {
            expect("alternatives" in (segment.highlight ?? {})).toBe(false);
            expect("overlapCount" in (segment.highlight ?? {})).toBe(false);
        });
    });

    it("forces sentence boundaries into segments for stable marker linkage", () => {
        const text = "It rained all day. Then we stayed home.";
        const model = buildGrammarViewModel(text, [
            {
                sentence: "It rained all day.",
                highlights: [
                    { substring: "rained", type: "谓语", explanation: "描述动作" },
                ],
            },
            {
                sentence: "Then we stayed home.",
                highlights: [
                    { substring: "stayed", type: "谓语", explanation: "描述动作" },
                ],
            },
        ]);

        const markerStarts = model.sentenceMarkers.map((item) => item.start);
        expect(markerStarts).toEqual([0, text.indexOf("Then")]);
        markerStarts.forEach((start) => {
            expect(model.full.some((segment) => segment.start === start)).toBe(true);
            expect(model.core.some((segment) => segment.start === start)).toBe(true);
        });
    });

    it("assigns distinct palettes to a wider set of grammar roles and clause types", () => {
        const subject = getGrammarHighlightPalette("主语");
        const predicate = getGrammarHighlightPalette("谓语");
        const object = getGrammarHighlightPalette("宾语");
        const predicative = getGrammarHighlightPalette("表语");
        const attributive = getGrammarHighlightPalette("定语");
        const adverbial = getGrammarHighlightPalette("状语");
        const complement = getGrammarHighlightPalette("补语");
        const appositive = getGrammarHighlightPalette("同位语");
        const prepPhrase = getGrammarHighlightPalette("介词短语");
        const nounClause = getGrammarHighlightPalette("名词性从句");
        const relativeClause = getGrammarHighlightPalette("定语从句");
        const adverbialClause = getGrammarHighlightPalette("状语从句");
        const nonFinite = getGrammarHighlightPalette("非谓语");

        expect(subject).not.toEqual(predicate);
        expect(predicate).not.toEqual(object);
        expect(object).not.toEqual(predicative);
        expect(attributive).not.toEqual(adverbial);
        expect(complement).not.toEqual(appositive);
        expect(prepPhrase).not.toEqual(attributive);
        expect(nounClause).not.toEqual(relativeClause);
        expect(relativeClause).not.toEqual(adverbialClause);
        expect(nonFinite).not.toEqual(nounClause);
    });

    it("assigns distinct palettes to finer clause and modifier subtypes", () => {
        const restrictiveRelative = getGrammarHighlightPalette("限制性定语从句");
        const nonRestrictiveRelative = getGrammarHighlightPalette("非限制性定语从句");
        const subjectClause = getGrammarHighlightPalette("主语从句");
        const objectClause = getGrammarHighlightPalette("宾语从句");
        const predicativeClause = getGrammarHighlightPalette("表语从句");
        const appositiveClause = getGrammarHighlightPalette("同位语从句");
        const timeClause = getGrammarHighlightPalette("时间状语从句");
        const placeClause = getGrammarHighlightPalette("地点状语从句");
        const reasonClause = getGrammarHighlightPalette("原因状语从句");
        const purposeClause = getGrammarHighlightPalette("目的状语从句");
        const conditionClause = getGrammarHighlightPalette("条件状语从句");
        const concessionClause = getGrammarHighlightPalette("让步状语从句");
        const resultClause = getGrammarHighlightPalette("结果状语从句");
        const mannerClause = getGrammarHighlightPalette("方式状语从句");
        const comparisonClause = getGrammarHighlightPalette("比较状语从句");
        const timeAdverbial = getGrammarHighlightPalette("时间状语");
        const resultAdverbial = getGrammarHighlightPalette("结果状语");
        const prepositiveAttributive = getGrammarHighlightPalette("前置定语");
        const postpositiveAttributive = getGrammarHighlightPalette("后置定语");

        expect(restrictiveRelative).not.toEqual(nonRestrictiveRelative);
        expect(subjectClause).not.toEqual(objectClause);
        expect(objectClause).not.toEqual(predicativeClause);
        expect(predicativeClause).not.toEqual(appositiveClause);
        expect(timeClause).not.toEqual(placeClause);
        expect(reasonClause).not.toEqual(purposeClause);
        expect(conditionClause).not.toEqual(concessionClause);
        expect(resultClause).not.toEqual(mannerClause);
        expect(mannerClause).not.toEqual(comparisonClause);
        expect(timeAdverbial).not.toEqual(resultAdverbial);
        expect(prepositiveAttributive).not.toEqual(postpositiveAttributive);
        expect(nonRestrictiveRelative).not.toEqual(prepositiveAttributive);
        expect(resultClause).not.toEqual(resultAdverbial);
    });
});
