export type InlineCoachTipType = "scaffold" | "polish";
export type InlineCoachCardKind = "vocab" | "grammar" | "example";

export interface InlineCoachCard {
    kind: InlineCoachCardKind;
    content: string;
}

export interface InlineCoachMetaChunk {
    kind: "meta";
    type: InlineCoachTipType;
    errorWord?: string;
    fixWord?: string;
    backtrans?: string;
    ragConcepts?: string[];
    tts?: string;
    card?: InlineCoachCard;
}

export interface InlineCoachTextDeltaChunk {
    kind: "text_delta";
    delta: string;
}

export interface InlineCoachDoneChunk {
    kind: "done";
}

export type InlineCoachStreamChunk =
    | InlineCoachMetaChunk
    | InlineCoachTextDeltaChunk
    | InlineCoachDoneChunk;

export interface InlineCoachTipState {
    text: string;
    type: InlineCoachTipType;
    errorWord?: string;
    fixWord?: string;
    backtrans?: string;
    vocabCard?: string;
    grammarCard?: string;
    exampleCard?: string;
    ragConcepts?: string[];
}

export function createEmptyInlineCoachTip(type: InlineCoachTipType): InlineCoachTipState {
    return {
        text: "",
        type,
    };
}

function parseInlineCoachChunk(raw: string): InlineCoachStreamChunk | null {
    if (!raw.trim()) return null;

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.kind === "meta" && (parsed.type === "scaffold" || parsed.type === "polish")) {
            return {
                kind: "meta",
                type: parsed.type,
                errorWord: typeof parsed.errorWord === "string" ? parsed.errorWord : undefined,
                fixWord: typeof parsed.fixWord === "string" ? parsed.fixWord : undefined,
                backtrans: typeof parsed.backtrans === "string" ? parsed.backtrans : undefined,
                ragConcepts: Array.isArray(parsed.ragConcepts)
                    ? parsed.ragConcepts.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                    : undefined,
                tts: typeof parsed.tts === "string" ? parsed.tts : undefined,
                card: parsed.card && typeof parsed.card === "object"
                    && (parsed.card as Record<string, unknown>).kind
                    && (parsed.card as Record<string, unknown>).content
                    && (parsed.card as Record<string, unknown>).kind !== "none"
                    ? {
                        kind: (parsed.card as Record<string, unknown>).kind as InlineCoachCardKind,
                        content: String((parsed.card as Record<string, unknown>).content),
                    }
                    : undefined,
            };
        }

        if (parsed.kind === "text_delta" && typeof parsed.delta === "string") {
            return {
                kind: "text_delta",
                delta: parsed.delta,
            };
        }

        if (parsed.kind === "done") {
            return { kind: "done" };
        }
    } catch {
        return null;
    }

    return null;
}

export function consumeInlineCoachBuffer(buffer: string, options?: { flush?: boolean }) {
    const lines = buffer.split("\n");
    let remaining = lines.pop() ?? "";
    const chunks: InlineCoachStreamChunk[] = [];

    for (const line of lines) {
        const chunk = parseInlineCoachChunk(line);
        if (chunk) {
            chunks.push(chunk);
        }
    }

    if (options?.flush && remaining.trim()) {
        const trailingChunk = parseInlineCoachChunk(remaining);
        if (trailingChunk) {
            chunks.push(trailingChunk);
            remaining = "";
        }
    }

    return {
        chunks,
        remaining,
    };
}

export function applyInlineCoachChunk(
    current: InlineCoachTipState,
    chunk: InlineCoachStreamChunk,
): InlineCoachTipState {
    if (chunk.kind === "meta") {
        const next: InlineCoachTipState = {
            ...current,
            type: chunk.type,
            errorWord: chunk.errorWord,
            fixWord: chunk.fixWord,
            backtrans: chunk.backtrans,
            ragConcepts: chunk.ragConcepts,
            vocabCard: undefined,
            grammarCard: undefined,
            exampleCard: undefined,
        };

        if (chunk.card?.kind === "vocab") {
            next.vocabCard = chunk.card.content;
        } else if (chunk.card?.kind === "grammar") {
            next.grammarCard = chunk.card.content;
        } else if (chunk.card?.kind === "example") {
            next.exampleCard = chunk.card.content;
        }

        return next;
    }

    if (chunk.kind === "text_delta") {
        return {
            ...current,
            text: `${current.text}${chunk.delta}`,
        };
    }

    return current;
}
