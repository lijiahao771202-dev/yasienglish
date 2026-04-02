import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InlineGrammarHighlights } from "./InlineGrammarHighlights";

describe("InlineGrammarHighlights", () => {
    it("renders tooltip text with grammar type, explanation, and segment translation", () => {
        const html = renderToStaticMarkup(
            <InlineGrammarHighlights
                text="She will leave soon."
                sentences={[
                    {
                        sentence: "She will leave soon.",
                        highlights: [
                            {
                                substring: "will leave",
                                type: "谓语",
                                explanation: "这里是核心动作。",
                                segment_translation: "将离开",
                            },
                        ],
                    },
                ]}
                showSegmentTranslation
            />,
        );

        expect(html).toContain("谓语");
        expect(html).toContain("语法功能");
        expect(html).toContain("这里是核心动作。");
        expect(html).toContain("片段义");
        expect(html).toContain("将离开");
        expect(html).toContain("tabindex=\"0\"");
    });

    it("filters modifier highlights out of core mode and keeps them in full mode", () => {
        const props = {
            text: "She quickly left.",
            sentences: [
                {
                    sentence: "She quickly left.",
                    highlights: [
                        {
                            substring: "She",
                            type: "主语",
                            explanation: "动作发出者",
                            segment_translation: "她",
                        },
                        {
                            substring: "quickly",
                            type: "状语",
                            explanation: "补充动作方式",
                            segment_translation: "迅速地",
                        },
                        {
                            substring: "left",
                            type: "谓语",
                            explanation: "核心动作",
                            segment_translation: "离开了",
                        },
                    ],
                },
            ],
            showSegmentTranslation: true,
        } as const;

        const coreHtml = renderToStaticMarkup(
            <InlineGrammarHighlights
                {...props}
                displayMode="core"
            />,
        );
        const fullHtml = renderToStaticMarkup(
            <InlineGrammarHighlights
                {...props}
                displayMode="full"
            />,
        );

        expect(coreHtml).toContain("She");
        expect(coreHtml).toContain("left");
        expect(coreHtml).not.toContain("迅速地");
        expect(fullHtml).toContain("迅速地");
    });
});
