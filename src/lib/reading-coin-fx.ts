import { type ReadingEconomyAction } from "@/lib/reading-economy";

export const READING_COIN_FX_EVENT = "reading:coin-fx";

export interface ReadingCoinFxEvent {
    id: string;
    delta: number;
    action: ReadingEconomyAction;
    label: string;
    timestamp: number;
}

const ACTION_LABELS: Record<ReadingEconomyAction, string> = {
    translate: "翻译",
    grammar_basic: "语法分析",
    grammar_deep: "深度语法",
    ask_ai: "Ask AI",
    analyze_phrase: "短语解析",
    word_lookup: "查词",
    word_deep_analyze: "单词深析",
    daily_login: "每日补给",
    read_complete: "阅读完成",
    quiz_complete: "测验奖励",
    reading_streak: "连读奖励",
};

export function getReadingCoinActionLabel(action: ReadingEconomyAction) {
    return ACTION_LABELS[action] ?? "阅读币变动";
}

export function createReadingCoinFxEvent(payload: {
    delta: number;
    action: ReadingEconomyAction;
}) {
    const delta = Math.trunc(Number(payload.delta));
    if (!Number.isFinite(delta) || delta === 0) {
        return null;
    }
    return {
        id: `reading-coin-fx-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        delta,
        action: payload.action,
        label: getReadingCoinActionLabel(payload.action),
        timestamp: Date.now(),
    } satisfies ReadingCoinFxEvent;
}

export function dispatchReadingCoinFx(payload: {
    delta: number;
    action: ReadingEconomyAction;
}) {
    if (typeof window === "undefined") return null;
    const event = createReadingCoinFxEvent(payload);
    if (!event) return null;
    window.dispatchEvent(new CustomEvent<ReadingCoinFxEvent>(READING_COIN_FX_EVENT, { detail: event }));
    return event;
}

