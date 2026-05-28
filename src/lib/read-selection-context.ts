import type { AskContextAttachment } from "./ask-thread";

export interface ReadSelectionParagraphRangeInput {
    paragraphOrder: number;
    paragraphBlockIndex: number;
    paragraphText: string;
    startOffset: number;
    endOffset: number;
}

function normalizeInlineText(text: string) {
    return text.replace(/\s+/g, " ").trim();
}

function buildRangeLabel(ranges: ReadSelectionParagraphRangeInput[]) {
    if (ranges.length === 0) return "";
    const first = ranges[0].paragraphOrder;
    const last = ranges[ranges.length - 1].paragraphOrder;
    return first === last ? `第 ${first} 段` : `第 ${first}-${last} 段`;
}

export function buildAskContextAttachmentFromRanges(
    ranges: ReadSelectionParagraphRangeInput[],
): AskContextAttachment {
    const orderedRanges = [...ranges]
        .filter((range) => range.endOffset > range.startOffset)
        .sort((left, right) => left.paragraphOrder - right.paragraphOrder);
    const paragraphRanges = orderedRanges.map((range) => {
        const startOffset = Math.max(0, Math.min(range.paragraphText.length, range.startOffset));
        const endOffset = Math.max(startOffset, Math.min(range.paragraphText.length, range.endOffset));
        return {
            paragraphOrder: range.paragraphOrder,
            paragraphBlockIndex: range.paragraphBlockIndex,
            paragraphText: range.paragraphText,
            startOffset,
            endOffset,
            text: normalizeInlineText(range.paragraphText.slice(startOffset, endOffset)),
        };
    }).filter((range) => range.text.length > 0);
    const text = normalizeInlineText(paragraphRanges.map((range) => range.text).join(" "));
    const rangeLabel = buildRangeLabel(paragraphRanges);
    const kind = paragraphRanges.length > 1 ? "cross_paragraph" : "selection";
    const label = kind === "cross_paragraph" ? "跨段选区" : "选中文本";
    const excerpt = text.length > 180 ? `${text.slice(0, 180)}...` : text;
    const idSeed = paragraphRanges
        .map((range) => `${range.paragraphOrder}:${range.startOffset}-${range.endOffset}`)
        .join("|") || "empty";

    return {
        id: `ask-context:${idSeed}`,
        kind,
        label,
        rangeLabel,
        text,
        excerpt,
        paragraphRanges,
    };
}
