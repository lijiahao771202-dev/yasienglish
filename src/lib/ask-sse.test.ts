import { describe, expect, it } from "vitest";

import { readAskSseStream } from "./ask-sse";

function streamFromChunks(chunks: string[]) {
    const encoder = new TextEncoder();
    const encoded = chunks.map((chunk) => encoder.encode(chunk));

    return new ReadableStream<Uint8Array>({
        start(controller) {
            encoded.forEach((chunk) => controller.enqueue(chunk));
            controller.close();
        },
    });
}

describe("readAskSseStream", () => {
    it("keeps content when an SSE JSON event is split across network chunks", async () => {
        const received: string[] = [];
        const stream = streamFromChunks([
            'data: {"content":"这句话说的是：如果缺少周',
            '全的规划，"}\n\n',
            'data: {"content":"原本为了改善交通的工具也可能带来新危险。"}\n\n',
            "data: [DONE]\n\n",
        ]);

        await readAskSseStream(stream.getReader(), { onContent: (content) => received.push(content) });

        expect(received.join("")).toBe("这句话说的是：如果缺少周全的规划，原本为了改善交通的工具也可能带来新危险。");
    });

    it("flushes a final buffered event when the stream closes without a trailing blank line", async () => {
        const received: string[] = [];
        const stream = streamFromChunks([
            'data: {"content":"最后一段"}',
        ]);

        await readAskSseStream(stream.getReader(), { onContent: (content) => received.push(content) });

        expect(received).toEqual(["最后一段"]);
    });

    it("passes reasoning content separately from final answer content", async () => {
        const reasoning: string[] = [];
        const answer: string[] = [];
        const stream = streamFromChunks([
            'data: {"reasoningContent":"先判断主语和谓语。"}\n\n',
            'data: {"content":"正式回答。"}\n\n',
            "data: [DONE]\n\n",
        ]);

        await readAskSseStream(stream.getReader(), {
            onContent: (content) => answer.push(content),
            onReasoningContent: (content) => reasoning.push(content),
        });

        expect(reasoning).toEqual(["先判断主语和谓语。"]);
        expect(answer).toEqual(["正式回答。"]);
    });
});
