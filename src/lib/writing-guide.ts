export const WRITING_GUIDE_STATES = [
    "unfinished",
    "grammar_error",
    "lexical_gap",
    "phrase_hint",
    "near_finish",
    "valid_alternative",
] as const;

export type WritingGuideState = typeof WRITING_GUIDE_STATES[number];

export interface WritingGuideHistoryItem {
    input: string;
    state: WritingGuideState;
    label: string;
    hint: string;
    focus?: string;
    nextAction?: string;
}

export interface WritingGuidePayload {
    hasError: boolean;
    label: string;
    hint: string;
    grammarPoint?: string;
    grammarExplain?: string;
    state: WritingGuideState;
    focus?: string;
    nextAction?: string;
}

const WRITING_GUIDE_STATE_SET = new Set<WritingGuideState>(WRITING_GUIDE_STATES);
const NON_BLOCKING_STATES = new Set<WritingGuideState>(["unfinished", "near_finish", "valid_alternative"]);
const NON_ESCALATING_STATES = new Set<WritingGuideState>(["near_finish", "valid_alternative"]);

export function isWritingGuideState(value: unknown): value is WritingGuideState {
    return typeof value === "string" && WRITING_GUIDE_STATE_SET.has(value as WritingGuideState);
}

export function normalizeWritingGuidePayload(payload: Record<string, unknown>): WritingGuidePayload {
    const fallbackState: WritingGuideState = payload.hasError === true ? "grammar_error" : "phrase_hint";
    const state = isWritingGuideState(payload.state) ? payload.state : fallbackState;
    const coercedHasError = state === "grammar_error"
        ? true
        : NON_BLOCKING_STATES.has(state)
            ? false
            : Boolean(payload.hasError);

    return {
        state,
        hasError: coercedHasError,
        label: typeof payload.label === "string" && payload.label.trim()
            ? payload.label.trim()
            : state === "grammar_error"
                ? "🩺 语法纠错"
                : state === "valid_alternative"
                    ? "✅ 可接受写法"
                    : "💡 继续推进",
        hint: typeof payload.hint === "string" && payload.hint.trim()
            ? payload.hint.trim()
            : "继续把当前意群补完整。",
        grammarPoint: typeof payload.grammarPoint === "string" ? payload.grammarPoint.trim() : "",
        grammarExplain: typeof payload.grammarExplain === "string" ? payload.grammarExplain.trim() : "",
        focus: typeof payload.focus === "string" ? payload.focus.trim() : "",
        nextAction: typeof payload.nextAction === "string" ? payload.nextAction.trim() : "",
    };
}

export function shouldEscalateWritingGuide(state?: string | null) {
    return !state || !NON_ESCALATING_STATES.has(state as WritingGuideState);
}
