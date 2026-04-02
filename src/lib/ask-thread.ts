export type AskRole = "user" | "assistant";

export interface AskThreadMessage {
    role: AskRole;
    content: string;
    createdAt: number;
}

export interface AskThreadPayload {
    version: 1;
    updatedAt: number;
    messages: AskThreadMessage[];
    summary?: string;
}

export interface AskQaPair {
    id: number;
    question: string;
    answer: string;
    isStreaming: boolean;
}

const ASK_THREAD_VERSION = 1 as const;

function isAskRole(raw: unknown): raw is AskRole {
    return raw === "user" || raw === "assistant";
}

export function sanitizeAskThreadMessages(input: unknown): AskThreadMessage[] {
    if (!Array.isArray(input)) return [];

    return input
        .map((item): AskThreadMessage | null => {
            if (!item || typeof item !== "object") return null;
            const role = (item as { role?: unknown }).role;
            const content = (item as { content?: unknown }).content;
            const createdAt = Number((item as { createdAt?: unknown }).createdAt);
            if (!isAskRole(role)) return null;
            if (typeof content !== "string" || !content.trim()) return null;

            return {
                role,
                content: content.trim(),
                createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
            };
        })
        .filter((item): item is AskThreadMessage => item !== null);
}

export function decodeAskThreadPayload(raw: string | null | undefined): AskThreadPayload {
    if (!raw?.trim()) {
        return {
            version: ASK_THREAD_VERSION,
            updatedAt: Date.now(),
            messages: [],
        };
    }

    try {
        const parsed = JSON.parse(raw) as {
            version?: unknown;
            updatedAt?: unknown;
            messages?: unknown;
            summary?: unknown;
        };

        const messages = sanitizeAskThreadMessages(parsed?.messages);
        const updatedAt = Number(parsed?.updatedAt);
        const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : undefined;

        return {
            version: ASK_THREAD_VERSION,
            updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
            messages,
            ...(summary ? { summary } : {}),
        };
    } catch {
        return {
            version: ASK_THREAD_VERSION,
            updatedAt: Date.now(),
            messages: [],
        };
    }
}

export function encodeAskThreadPayload(messages: AskThreadMessage[], summary?: string): string {
    const payload: AskThreadPayload = {
        version: ASK_THREAD_VERSION,
        updatedAt: Date.now(),
        messages: sanitizeAskThreadMessages(messages),
        ...(summary?.trim() ? { summary: summary.trim() } : {}),
    };
    return JSON.stringify(payload);
}

export function buildAskQaPairs(
    messages: ReadonlyArray<{ role: AskRole; content: string }>,
    streamingContent = "",
    isLoading = false,
): AskQaPair[] {
    const pairs: AskQaPair[] = [];
    let pendingQuestion: string | null = null;
    let idx = 0;

    for (const msg of messages) {
        if (msg.role === "user") {
            if (pendingQuestion) {
                pairs.push({ id: idx++, question: pendingQuestion, answer: "", isStreaming: false });
            }
            pendingQuestion = msg.content;
            continue;
        }

        if (pendingQuestion) {
            pairs.push({ id: idx++, question: pendingQuestion, answer: msg.content, isStreaming: false });
            pendingQuestion = null;
        } else {
            pairs.push({ id: idx++, question: "", answer: msg.content, isStreaming: false });
        }
    }

    if (pendingQuestion) {
        pairs.push({
            id: idx++,
            question: pendingQuestion,
            answer: streamingContent,
            isStreaming: isLoading || Boolean(streamingContent),
        });
    } else if (streamingContent) {
        pairs.push({ id: idx++, question: "", answer: streamingContent, isStreaming: true });
    }

    return pairs;
}

export function buildAskThreadPreview(payload: AskThreadPayload): string {
    const turns = payload.messages.filter((item) => item.role === "user").length;
    if (turns <= 0) return "AI问答记录";

    const lastAssistant = [...payload.messages].reverse().find((item) => item.role === "assistant" && item.content.trim());
    const preview = (lastAssistant?.content ?? "").replace(/\s+/g, " ").trim();

    if (!preview) return `AI问答 ${turns} 轮`;
    const snippet = preview.length > 42 ? `${preview.slice(0, 42)}...` : preview;
    return `AI问答 ${turns} 轮\n${snippet}`;
}
