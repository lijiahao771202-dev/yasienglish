import { describe, expect, it } from "vitest";

import { buildAskContextAttachmentFromRanges } from "./read-selection-context";

describe("read-selection-context", () => {
    it("builds a cross-paragraph ask context attachment with paragraph range metadata", () => {
        const attachment = buildAskContextAttachmentFromRanges([
            {
                paragraphOrder: 2,
                paragraphBlockIndex: 1,
                paragraphText: "The first selected paragraph ends with a difficult transition.",
                startOffset: 4,
                endOffset: 33,
            },
            {
                paragraphOrder: 3,
                paragraphBlockIndex: 2,
                paragraphText: "The second selected paragraph explains the consequence.",
                startOffset: 0,
                endOffset: 29,
            },
        ]);

        expect(attachment).toMatchObject({
            kind: "cross_paragraph",
            label: "跨段选区",
            rangeLabel: "第 2-3 段",
            text: "first selected paragraph ends The second selected paragraph",
        });
        expect(attachment.paragraphRanges).toEqual([
            {
                paragraphOrder: 2,
                paragraphBlockIndex: 1,
                paragraphText: "The first selected paragraph ends with a difficult transition.",
                startOffset: 4,
                endOffset: 33,
                text: "first selected paragraph ends",
            },
            {
                paragraphOrder: 3,
                paragraphBlockIndex: 2,
                paragraphText: "The second selected paragraph explains the consequence.",
                startOffset: 0,
                endOffset: 29,
                text: "The second selected paragraph",
            },
        ]);
    });
});
