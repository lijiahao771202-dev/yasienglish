import { describe, expect, it } from "vitest";

import {
    buildAskQaPairs,
    decodeAskThreadPayload,
    encodeAskThreadPayload,
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
            { role: "assistant", content: "because", createdAt: 2 },
        ]);
        const decoded = decodeAskThreadPayload(raw);
        expect(decoded.messages).toHaveLength(2);
        expect(decoded.messages[0].role).toBe("user");
        expect(decoded.messages[1].content).toBe("because");
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
});
