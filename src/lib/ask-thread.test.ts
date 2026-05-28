import { describe, expect, it } from "vitest";

import {
    buildAskQaPairs,
    decodeAskThreadPayload,
    encodeAskThreadPayload,
    resolveAskAssistantMessageParts,
    sanitizeAskThreadMessages,
} from "./ask-thread";

describe("ask-thread", () => {
    it("returns empty thread for invalid json", () => {
        const payload = decodeAskThreadPayload("{invalid");
        expect(payload.messages).toEqual([]);
        expect(payload.version).toBe(1);
    });

    it("sanitizes malformed messages", () => {
        const now = Date.now();
        const messages = sanitizeAskThreadMessages([
            { role: "user", content: "  hello  ", createdAt: now },
            { role: "assistant", content: " ok " },
            { role: "bot", content: "nope" },
            { role: "user", content: "   " },
        ]);
        expect(messages).toHaveLength(2);
        expect(messages[0].content).toBe("hello");
        expect(messages[1].role).toBe("assistant");
    });

    it("encodes and decodes messages", () => {
        const raw = encodeAskThreadPayload([
            { role: "user", content: "why?", createdAt: 1 },
            { role: "assistant", content: "because", reasoningContent: "thinking first", createdAt: 2 },
        ]);
        const decoded = decodeAskThreadPayload(raw);
        expect(decoded.messages).toHaveLength(2);
        expect(decoded.messages[0].role).toBe("user");
        expect(decoded.messages[1].content).toBe("because");
        expect(decoded.messages[1].reasoningContent).toBe("thinking first");
    });

    it("preserves ask context attachment metadata through encode and decode", () => {
        const raw = encodeAskThreadPayload(
            [{ role: "user", content: "Explain this.", createdAt: 1 }],
            undefined,
            {
                id: "ask-context:1",
                kind: "cross_paragraph",
                label: "跨段选区",
                rangeLabel: "第 2-4 段",
                text: "Selected cross paragraph text.",
                excerpt: "Selected cross paragraph text.",
                paragraphRanges: [
                    {
                        paragraphOrder: 2,
                        paragraphBlockIndex: 1,
                        startOffset: 8,
                        endOffset: 40,
                        text: "Selected cross",
                        paragraphText: "Paragraph two text.",
                    },
                    {
                        paragraphOrder: 4,
                        paragraphBlockIndex: 3,
                        startOffset: 0,
                        endOffset: 12,
                        text: "paragraph text.",
                        paragraphText: "Paragraph four text.",
                    },
                ],
            },
        );

        const decoded = decodeAskThreadPayload(raw);

        expect(decoded.contextAttachment).toMatchObject({
            id: "ask-context:1",
            kind: "cross_paragraph",
            label: "跨段选区",
            rangeLabel: "第 2-4 段",
            text: "Selected cross paragraph text.",
        });
        expect(decoded.contextAttachment?.paragraphRanges).toHaveLength(2);
        expect(decoded.contextAttachment?.paragraphRanges?.[0]).toMatchObject({
            paragraphOrder: 2,
            startOffset: 8,
            endOffset: 40,
        });
    });

    it("builds qa pairs from threaded messages with streaming tail", () => {
        const pairs = buildAskQaPairs(
            [
                { role: "user", content: "Q1" },
                { role: "assistant", content: "A1" },
                { role: "user", content: "Q2" },
            ],
            "typing",
            true,
        );

        expect(pairs).toHaveLength(2);
        expect(pairs[0]).toMatchObject({ question: "Q1", answer: "A1", isStreaming: false });
        expect(pairs[1]).toMatchObject({ question: "Q2", answer: "typing", isStreaming: true });
    });

    it("builds qa pairs with saved and streaming reasoning content", () => {
        const pairs = buildAskQaPairs(
            [
                { role: "user", content: "Q1" },
                { role: "assistant", content: "A1", reasoningContent: "R1" },
                { role: "user", content: "Q2" },
            ],
            "",
            true,
            "R2",
        );

        expect(pairs).toHaveLength(2);
        expect(pairs[0]).toMatchObject({
            question: "Q1",
            answer: "A1",
            reasoningContent: "R1",
            isReasoningStreaming: false,
        });
        expect(pairs[1]).toMatchObject({
            question: "Q2",
            answer: "",
            reasoningContent: "R2",
            isStreaming: true,
            isReasoningStreaming: true,
        });
    });

    it("preserves the isError flag through sanitize, encode/decode, and qa pair building", () => {
        const sanitized = sanitizeAskThreadMessages([
            { role: "user", content: "why?", createdAt: 1 },
            { role: "assistant", content: "抱歉，出错了。请再试一次。", createdAt: 2, isError: true },
        ]);
        expect(sanitized[1].isError).toBe(true);

        const raw = encodeAskThreadPayload(sanitized);
        const decoded = decodeAskThreadPayload(raw);
        expect(decoded.messages[1].isError).toBe(true);

        const pairs = buildAskQaPairs(sanitized);
        expect(pairs).toHaveLength(1);
        expect(pairs[0]).toMatchObject({
            question: "why?",
            answer: "抱歉，出错了。请再试一次。",
            isError: true,
        });
    });

    it("uses reasoning as the visible answer when providers never emit final content", () => {
        expect(resolveAskAssistantMessageParts("", "reasoning-only answer")).toEqual({
            content: "reasoning-only answer",
        });
        expect(resolveAskAssistantMessageParts("final answer", "thinking draft")).toEqual({
            content: "final answer",
            reasoningContent: "thinking draft",
        });
    });
});
