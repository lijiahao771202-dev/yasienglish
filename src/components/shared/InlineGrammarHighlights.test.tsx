import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InlineGrammarHighlights } from "./InlineGrammarHighlights";

describe("InlineGrammarHighlights", () => {
    it("renders tooltip text with grammar type and explanation only", () => {
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
            />,
        );

        expect(html).toContain("谓语");
        expect(html).toContain("这里是核心动作。");
        expect(html).not.toContain("将离开");
    });
});
