export async function readAskSseStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    handlers: {
        onContent: (content: string) => void;
        onReasoningContent?: (content: string) => void;
    },
) {
    const decoder = new TextDecoder();
    let buffer = "";
    let isDone = false;

    const processEvent = (eventText: string) => {
        const data = eventText
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n")
            .trim();

        if (!data) return;
        if (data === "[DONE]") {
            isDone = true;
            return;
        }

        let parsed: {
            content?: unknown;
            reasoningContent?: unknown;
            error?: unknown;
            errorCode?: unknown;
            retryable?: unknown;
        };
        try {
            parsed = JSON.parse(data) as typeof parsed;
        } catch (error) {
            console.warn("[AskAI] Ignoring malformed SSE event:", error);
            return;
        }

        if (typeof parsed.error === "string" || typeof parsed.errorCode === "string") {
            const error = new Error(
                typeof parsed.error === "string" && parsed.error.trim()
                    ? parsed.error
                    : "Ask AI 暂时不可用，请稍后重试。",
            ) as Error & { responseData?: unknown };
            error.responseData = {
                error: parsed.error,
                errorCode: parsed.errorCode,
                retryable: parsed.retryable,
            };
            throw error;
        }
        if (typeof parsed.reasoningContent === "string" && parsed.reasoningContent.length > 0) {
            handlers.onReasoningContent?.(parsed.reasoningContent);
        }
        if (typeof parsed.content === "string" && parsed.content.length > 0) {
            handlers.onContent(parsed.content);
        }
    };

    while (!isDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";

        events.forEach(processEvent);
    }

    buffer += decoder.decode();
    if (!isDone && buffer.trim()) {
        processEvent(buffer);
    }
}
