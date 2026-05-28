export type AskRole = "user" | "assistant";

export interface AskThreadMessage {
    role: AskRole;
    content: string;
    createdAt: number;
    reasoningContent?: string;
    /**
     * Set to true on assistant messages that came from a transient failure
     * (network error, 5xx, rate limit). Used to decorate the bubble with a
     * retry affordance. Does NOT apply to business-level errors such as
     * insufficient reading coins, which require user action rather than a retry.
     */
    isError?: boolean;
}

export type AskContextAttachmentKind = "paragraph" | "selection" | "cross_paragraph" | "sentence";

export interface AskContextParagraphRange {
    paragraphOrder: number;
    paragraphBlockIndex: number;
    startOffset: number;
    endOffset: number;
    text: string;
    paragraphText: string;
}

export interface AskContextAttachment {
    id: string;
    kind: AskContextAttachmentKind;
    label: string;
    rangeLabel: string;
    text: string;
    excerpt: string;
    paragraphRanges: AskContextParagraphRange[];
}

export interface AskThreadPayload {
    version: 1;
    updatedAt: number;
    messages: AskThreadMessage[];
    summary?: string;
    contextAttachment?: AskContextAttachment;
}

export interface AskQaPair {
    id: number;
    question: string;
    answer: string;
    reasoningContent: string;
    isStreaming: boolean;
    isReasoningStreaming: boolean;
    /** True when the assistant answer was a transient failure that can be retried. */
    isError: boolean;
}

const ASK_THREAD_VERSION = 1 as const;

const TRANSIENT_FAILURE_CONTENTS = new Set<string>([
    "抱歉，出错了。请再试一次。",
    "当前 AI 模型正在处理上一个请求，请稍等几秒再试。",
]);

/**
 * Returns true when the assistant content matches a known transient-failure template.
 * Used as a content-based fallback for legacy persisted messages that predate the
 * explicit isError flag, so the retry button still shows up after an upgrade.
 */
export function isLikelyTransientAskFailure(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed) return false;
    return TRANSIENT_FAILURE_CONTENTS.has(trimmed);
}

function isAskRole(raw: unknown): raw is AskRole {
    return raw === "user" || raw === "assistant";
}

function sanitizeText(value: unknown, maxLength = 20000) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizeAskContextAttachment(input: unknown): AskContextAttachment | undefined {
    if (!input || typeof input !== "object") return undefined;
    const item = input as Record<string, unknown>;
    const kind = item.kind;
    if (kind !== "paragraph" && kind !== "selection" && kind !== "cross_paragraph" && kind !== "sentence") {
        return undefined;
    }

    const text = sanitizeText(item.text);
    if (!text) return undefined;

    const paragraphRanges = Array.isArray(item.paragraphRanges)
        ? item.paragraphRanges
            .map((range): AskContextParagraphRange | null => {
                if (!range || typeof range !== "object") return null;
                const raw = range as Record<string, unknown>;
                const paragraphOrder = Number(raw.paragraphOrder);
                const paragraphBlockIndex = Number(raw.paragraphBlockIndex);
                const startOffset = Number(raw.startOffset);
                const endOffset = Number(raw.endOffset);
                const rangeText = sanitizeText(raw.text);
                const paragraphText = sanitizeText(raw.paragraphText);
                if (!Number.isFinite(paragraphOrder) || paragraphOrder < 1) return null;
                if (!Number.isFinite(paragraphBlockIndex) || paragraphBlockIndex < 0) return null;
                if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || endOffset < startOffset) return null;
                if (!rangeText) return null;
                return {
                    paragraphOrder,
                    paragraphBlockIndex,
                    startOffset,
                    endOffset,
                    text: rangeText,
                    paragraphText,
                };
            })
            .filter((range): range is AskContextParagraphRange => range !== null)
        : [];

    return {
        id: sanitizeText(item.id, 200) || `ask-context:${Date.now()}`,
        kind,
        label: sanitizeText(item.label, 40) || (kind === "cross_paragraph" ? "跨段选区" : kind === "paragraph" ? "整段上下文" : kind === "sentence" ? "句子上下文" : "选中文本"),
        rangeLabel: sanitizeText(item.rangeLabel, 80),
        text,
        excerpt: sanitizeText(item.excerpt, 280) || (text.length > 160 ? `${text.slice(0, 160)}...` : text),
        paragraphRanges,
    };
}

export function sanitizeAskThreadMessages(input: unknown): AskThreadMessage[] {
    if (!Array.isArray(input)) return [];

    return input
        .map((item): AskThreadMessage | null => {
            if (!item || typeof item !== "object") return null;
            const role = (item as { role?: unknown }).role;
            const content = (item as { content?: unknown }).content;
            const reasoningContent = (item as { reasoningContent?: unknown }).reasoningContent;
            const createdAt = Number((item as { createdAt?: unknown }).createdAt);
            const explicitIsError = (item as { isError?: unknown }).isError === true;
            if (!isAskRole(role)) return null;
            if (typeof content !== "string" || !content.trim()) return null;
            const trimmedContent = content.trim();
            const inferredIsError = role === "assistant" && isLikelyTransientAskFailure(trimmedContent);
            const isError = explicitIsError || inferredIsError;

            return {
                role,
                content: trimmedContent,
                createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
                ...(typeof reasoningContent === "string" && reasoningContent.trim()
                    ? { reasoningContent: reasoningContent.trim() }
                    : {}),
                ...(isError ? { isError: true } : {}),
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
            contextAttachment?: unknown;
        };

        const messages = sanitizeAskThreadMessages(parsed?.messages);
        const updatedAt = Number(parsed?.updatedAt);
        const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : undefined;
        const contextAttachment = sanitizeAskContextAttachment(parsed?.contextAttachment);

        return {
            version: ASK_THREAD_VERSION,
            updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
            messages,
            ...(summary ? { summary } : {}),
            ...(contextAttachment ? { contextAttachment } : {}),
        };
    } catch {
        return {
            version: ASK_THREAD_VERSION,
            updatedAt: Date.now(),
            messages: [],
        };
    }
}

export function encodeAskThreadPayload(
    messages: AskThreadMessage[],
    summary?: string,
    contextAttachment?: AskContextAttachment,
): string {
    const sanitizedContext = sanitizeAskContextAttachment(contextAttachment);
    const payload: AskThreadPayload = {
        version: ASK_THREAD_VERSION,
        updatedAt: Date.now(),
        messages: sanitizeAskThreadMessages(messages),
        ...(summary?.trim() ? { summary: summary.trim() } : {}),
        ...(sanitizedContext ? { contextAttachment: sanitizedContext } : {}),
    };
    return JSON.stringify(payload);
}

export function buildAskQaPairs(
    messages: ReadonlyArray<{ role: AskRole; content: string; reasoningContent?: string; isError?: boolean }>,
    streamingContent = "",
    isLoading = false,
    streamingReasoningContent = "",
): AskQaPair[] {
    const pairs: AskQaPair[] = [];
    let pendingQuestion: string | null = null;
    let idx = 0;

    for (const msg of messages) {
        if (msg.role === "user") {
            if (pendingQuestion) {
                pairs.push({
                    id: idx++,
                    question: pendingQuestion,
                    answer: "",
                    reasoningContent: "",
                    isStreaming: false,
                    isReasoningStreaming: false,
                    isError: false,
                });
            }
            pendingQuestion = msg.content;
            continue;
        }

        const assistantReasoning = "reasoningContent" in msg && typeof msg.reasoningContent === "string" ? msg.reasoningContent : "";
        const assistantIsError = Boolean((msg as { isError?: boolean }).isError);
        if (pendingQuestion) {
            pairs.push({
                id: idx++,
                question: pendingQuestion,
                answer: msg.content,
                reasoningContent: assistantReasoning,
                isStreaming: false,
                isReasoningStreaming: false,
                isError: assistantIsError,
            });
            pendingQuestion = null;
        } else {
            pairs.push({
                id: idx++,
                question: "",
                answer: msg.content,
                reasoningContent: assistantReasoning,
                isStreaming: false,
                isReasoningStreaming: false,
                isError: assistantIsError,
            });
        }
    }

    if (pendingQuestion) {
        pairs.push({
            id: idx++,
            question: pendingQuestion,
            answer: streamingContent,
            reasoningContent: streamingReasoningContent,
            isStreaming: isLoading || Boolean(streamingContent),
            isReasoningStreaming: isLoading && Boolean(streamingReasoningContent) && !streamingContent,
            isError: false,
        });
    } else if (streamingContent) {
        pairs.push({
            id: idx++,
            question: "",
            answer: streamingContent,
            reasoningContent: streamingReasoningContent,
            isStreaming: true,
            isReasoningStreaming: false,
            isError: false,
        });
    }

    return pairs;
}

export function resolveAskAssistantMessageParts(
    answerContent: string,
    reasoningContent: string,
    fallbackContent = "抱歉，暂无可展示回答。",
): { content: string; reasoningContent?: string } {
    const answer = answerContent.trim();
    const reasoning = reasoningContent.trim();

    if (answer) {
        return {
            content: answer,
            ...(reasoning ? { reasoningContent: reasoning } : {}),
        };
    }

    if (reasoning) {
        return { content: reasoning };
    }

    return { content: fallbackContent };
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
