import React, { useLayoutEffect, useMemo, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Play, Pause, BookOpen, BookPlus, Mic, Languages, Loader2, MessageCircleQuestion, Send, PenTool, GripVertical, RotateCcw, X, Sparkles, Globe, Highlighter, Underline, List, Lightbulb, GitBranch, Quote, CheckCircle2, Rocket, ChevronLeft, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useReadingSettings, type PhraseDisplayMode } from "@/contexts/ReadingSettingsContext";
import { useTTS } from "@/hooks/useTTS";
import { usePretextMeasuredLayout } from "@/hooks/usePretextMeasuredLayout";
import { SpeakingPanel } from "./SpeakingPanel";
import { useAnalysisStore } from "@/lib/analysis-store";
import type { SentenceTranslationItem, StoredTranslationPayload } from "@/lib/analysis-store";
import { bionicText } from "@/lib/bionic";
import { InlineGrammarHighlights } from "@/components/shared/InlineGrammarHighlights";
import { PretextTextarea } from "@/components/ui/PretextTextarea";
import { type GrammarDisplayMode, type GrammarSentenceAnalysis } from "@/lib/grammarHighlights";
import {
    buildReadingGrammarExecutionSignature,
    buildGrammarCacheKey,
    GRAMMAR_BASIC_PROMPT_VERSION,
    hasUsableBasicGrammarResult,
    normalizeGrammarSentenceList,
    sanitizeGrammarBasicPayload,
    sentenceIdentity,
} from "@/lib/grammar-analysis";
import { applyServerProfilePatchToLocal, saveVocabulary } from "@/lib/user-repository";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { INSUFFICIENT_READING_COINS, type ReadingEconomyAction } from "@/lib/reading-economy";
import { dispatchReadingCoinFx } from "@/lib/reading-coin-fx";
import { db, type ReadingMarkType, type ReadingNoteItem, type VocabItem } from "@/lib/db";
import { createEmptyCard } from "@/lib/fsrs";
import { defaultVocabSourceLabel, normalizeWordKey } from "@/lib/user-sync";
import { requestTtsPayload, resolveTtsAudioBlob } from "@/lib/tts-client";
import {
    buildAskQaPairs,
    buildAskThreadPreview,
    decodeAskThreadPayload,
    encodeAskThreadPayload,
    resolveAskAssistantMessageParts,
    type AskQaPair,
    type AskContextAttachment,
    type AskThreadMessage,
} from "@/lib/ask-thread";
import {
    alignTokensToMarks,
    buildAutoSentenceBoundaries,
    buildSentenceUnits,
    extractWordTokens,
    type TtsWordMark,
} from "@/lib/read-speaking";
import { queryAskRelevantVocabulary } from "@/lib/ask-vocab-memory";
import type { PopupState } from "./WordPopup";
import { hasMeaningfulTextSelection } from "./selection-helpers";
import { dispatchReadSelectionAskDockEvent } from "@/lib/read-selection-ask-dock";
import { AiRichMarkdown } from "@/components/shared/AiRichMarkdown";
import { readAskSseStream } from "@/lib/ask-sse";
import { AI_PROVIDER_RATE_LIMIT_ERROR_CODE } from "@/lib/ai-provider-errors";
import { normalizePhraseTranslationItems as normalizeTranslationPhraseItems } from "@/lib/translation-phrases";

interface ParagraphCardProps {
    text: string;
    index: number;
    paragraphOrder?: number;
    articleTitle?: string;
    articleUrl?: string;
    ragAppliedWords?: string[];
    readingNotes?: ReadingNoteItem[];
    onCreateReadingNote?: (payload: {
        paragraphOrder: number;
        paragraphBlockIndex: number;
        selectedText: string;
        noteText?: string;
        markType: ReadingMarkType;
        startOffset: number;
        endOffset: number;
    }) => Promise<void> | void;
    onDeleteReadingMarks?: (payload: {
        paragraphOrder: number;
        paragraphBlockIndex: number;
        markType: ReadingMarkType;
        startOffset: number;
        endOffset: number;
    }) => Promise<void> | void;
    onSnapshotDirty?: () => void;
    onWordClick: (e: React.MouseEvent) => void;
    onOpenWordPopupFromSelection?: (payload: PopupState) => void;
    askContextAttachment?: AskContextAttachment | null;
    hasActiveAskDock?: boolean;
    onOpenAskWithContext?: (attachment: AskContextAttachment) => AskContextAttachment | null | void;
    onSplit?: (index: number, textBefore: string, textAfter: string) => void;
    onMerge?: (sourceIndex: number, targetIndex: number) => void;
    onUpdate?: (index: number, newText: string) => void; // New: Update text
    isEditMode?: boolean; // New: Edit mode flag
    // TED video sync props
    startTime?: number;
    endTime?: number;
    currentVideoTime?: number;
    onSeekToTime?: (time: number) => void;
    // Deep Focus Mode Props
    isFocusMode?: boolean;
    isFocusLocked?: boolean;
    hasActiveFocusLock?: boolean;
    onSetFocusLock?: () => void;
    onClearFocusLock?: () => void;
    highlightSnippet?: string;
}

interface GrammarBasicCachePayload {
    mode?: "basic";
    tags?: string[];
    overview?: string;
    difficult_sentences?: GrammarSentenceAnalysis[];
}

interface TranslateSentenceResult {
    sentence: string;
    translation: string;
    phraseTranslations?: Array<{
        source: string;
        translation: string;
    }>;
}

interface TranslateApiResponse {
    translation?: string;
    sentenceTranslations?: TranslateSentenceResult[];
    readingCoins?: unknown;
    error?: string;
    errorCode?: string;
}

interface GrammarSentenceApiResult extends GrammarBasicCachePayload {
    sentence: string;
    cacheKey: string;
    issues?: string[];
    retryRecommended?: boolean;
    qualityScore?: number;
    repairAttempted?: boolean;
    repairAttempts?: number;
    cache?: {
        key: string;
        hit: boolean;
        layer: "server" | "miss";
        mode: "basic";
        promptVersion: string;
        model: string;
    };
    error?: string;
    data?: GrammarBasicCachePayload;
}

type GrammarBasicApiResponse = GrammarBasicCachePayload & {
    results?: GrammarSentenceApiResult[];
    readingCoins?: unknown;
};

const GRAMMAR_RETRY_REPLAY_TTL_MS = 30000;
const GRAMMAR_SENTENCE_BATCH_WINDOW_MS = 220;

interface RewritePracticePrompt {
    source_sentence_en: string;
    imitation_prompt_cn: string;
    rewrite_tips_cn: string[];
    pattern_focus_cn: string;
}

interface RewritePracticeScore {
    total_score: number;
    dimension_scores: {
        grammar: number;
        vocabulary: number;
        semantics: number;
        imitation: number;
    };
    feedback_cn: string;
    better_version_en: string;
    copy_similarity: number;
    copy_penalty_applied: boolean;
    improvement_points_cn: string[];
    corrections?: Array<{
        segment: string;
        correction: string;
        reason: string;
        category?: string;
    }>;
}

interface PhraseAnalysisResult {
    translation?: string;
    grammar_point?: string;
    nuance?: string;
    vocabulary?: Array<{
        word?: string;
        definition?: string;
    }>;
}

type PhraseVocabularyItem = NonNullable<PhraseAnalysisResult["vocabulary"]>[number];

interface SentenceAudioCacheEntry {
    blob: Blob;
    marks: TtsWordMark[];
    objectUrl?: string;
}

type PendingSentenceSeek =
    | { sentenceIndex: number; ratio: number; timeMs?: never }
    | { sentenceIndex: number; timeMs: number; ratio?: never };

interface ClickCharacterResolution {
    index: number;
    sentenceIndex?: number;
}

interface SentenceGrammarUiState {
    cacheKey: string;
    sentence: string;
    analysis: GrammarBasicCachePayload | null;
    error: string | null;
    loading: boolean;
    expanded: boolean;
}

type SelectionPopupMode = "selection" | "ask" | "ask-replay";
type AskAnswerMode = "default" | "short" | "detailed";
type AskThinkingMode = "off" | "on";
type AskReasoningEffort = "low" | "medium" | "high";

interface InlinePhraseRange {
    start: number;
    end: number;
    item: { source: string; translation: string };
}

interface PinnedAskSnapshot {
    rect: DOMRect;
    text: string;
    offsets: { startOffset: number; endOffset: number };
    mode: "ask" | "ask-replay";
    messages: AskThreadMessage[];
    streamingContent: string;
    streamingReasoningContent: string;
    isLoading: boolean;
    autoOpenToken: number;
}

function resolveAskFailureMessage(payload: unknown) {
    if (payload && typeof payload === "object") {
        const record = payload as { errorCode?: unknown; error?: unknown };
        if (record.errorCode === AI_PROVIDER_RATE_LIMIT_ERROR_CODE) {
            return typeof record.error === "string" && record.error.trim()
                ? record.error
                : "当前 AI 模型正在处理上一个请求，请稍等几秒再试。";
        }
        if (typeof record.error === "string" && record.error.trim()) {
            return record.error;
        }
    }

    return "抱歉，出错了。请再试一次。";
}

function isAskRateLimitPayload(payload: unknown) {
    return Boolean(
        payload
        && typeof payload === "object"
        && (payload as { errorCode?: unknown }).errorCode === AI_PROVIDER_RATE_LIMIT_ERROR_CODE,
    );
}

function escapeRegExp(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isStoredTranslationPayload(value: StoredTranslationPayload | string | undefined): value is StoredTranslationPayload {
    return Boolean(value && typeof value === "object" && "translation" in value);
}

function normalizeSentenceTranslationItems(items: unknown): SentenceTranslationItem[] {
    if (!Array.isArray(items)) return [];

    return items
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const sentence = typeof (item as { sentence?: unknown }).sentence === "string"
                ? (item as { sentence: string }).sentence.trim()
                : "";
            const translation = typeof (item as { translation?: unknown }).translation === "string"
                ? (item as { translation: string }).translation.trim()
                : "";
            if (!sentence || !translation) return null;
            return {
                sentence,
                translation,
                phraseTranslations: normalizeTranslationPhraseItems(
                    (item as { phraseTranslations?: unknown }).phraseTranslations,
                    sentence,
                ),
            } satisfies SentenceTranslationItem;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function buildSentenceTranslationLookup(items: SentenceTranslationItem[]) {
    const lookup = new Map<string, string>();
    items.forEach((item) => {
        const key = sentenceIdentity(item.sentence);
        if (!key || lookup.has(key)) return;
        lookup.set(key, item.translation);
    });
    return lookup;
}

function buildSentenceTranslationItemLookup(items: SentenceTranslationItem[]) {
    const lookup = new Map<string, SentenceTranslationItem>();
    items.forEach((item) => {
        const key = sentenceIdentity(item.sentence);
        if (!key) return;
        lookup.set(key, {
            sentence: item.sentence,
            translation: item.translation,
            phraseTranslations: normalizeTranslationPhraseItems(item.phraseTranslations, item.sentence),
        });
    });
    return lookup;
}

function mergeSentenceTranslationLookups(
    ...sources: Array<Map<string, string>>
) {
    const merged = new Map<string, string>();
    sources.forEach((source) => {
        source.forEach((translation, key) => {
            if (!translation || merged.has(key)) return;
            merged.set(key, translation);
        });
    });
    return merged;
}

function splitTranslationFallbackPieces(value: string, targetCount: number) {
    const trimmed = value.trim();
    if (!trimmed || targetCount <= 0) return [];

    const pieces = (trimmed.match(/[^。！？!?]+[。！？!?]?/g) ?? [trimmed])
        .map((item) => item.trim())
        .filter(Boolean);
    if (pieces.length <= targetCount) {
        return pieces;
    }

    return [
        ...pieces.slice(0, targetCount - 1),
        pieces.slice(targetCount - 1).join(""),
    ];
}

function buildFallbackSentenceTranslations(
    units: Array<{ text: string }>,
    translation: string,
): SentenceTranslationItem[] {
    const pieces = splitTranslationFallbackPieces(translation, units.length);
    return units.reduce<SentenceTranslationItem[]>((items, unit, index) => {
        const fallbackTranslation = pieces[index]?.trim() ?? "";
        if (!fallbackTranslation) return items;
        items.push({
            sentence: unit.text.trim(),
            translation: fallbackTranslation,
            phraseTranslations: [],
        });
        return items;
    }, []);
}

function renderSentenceTranslationLine(translation: string, textClassName?: string) {
    return (
        <div
            data-translation-line="true"
            className={cn("mt-2 block w-full leading-[1.9]", textClassName)}
        >
            {translation}
        </div>
    );
}

function renderTranslationAside(
    translation: string,
    phraseItems: Array<{ source: string; translation: string }> = [],
    onPhraseClick?: (item: { source: string; translation: string }, event: React.MouseEvent<HTMLButtonElement>) => void,
    inlinePhraseNode?: React.ReactNode,
    textClassName?: string,
) {
    return (
        <div
            data-translation-aside="true"
            className="reading-translation-inset mt-2.5 block w-full max-w-[min(100%,46rem)] px-3 py-2 text-left"
        >
            <div
                data-translation-line="true"
                className={cn("block w-full leading-[1.8] opacity-90", textClassName)}
            >
                {translation}
            </div>
            {inlinePhraseNode ? (
                <div data-translation-phrases="true" className="mt-2.5">
                    {inlinePhraseNode}
                </div>
            ) : renderPhraseTranslationList(phraseItems, onPhraseClick)}
        </div>
    );
}

function renderPhraseTranslationList(
    items: Array<{ source: string; translation: string }>,
    onPhraseClick?: (item: { source: string; translation: string }, event: React.MouseEvent<HTMLButtonElement>) => void,
) {
    if (items.length === 0) return null;

    return (
        <div data-translation-phrases="true" className="mt-2.5 flex flex-wrap gap-2">
            {items.map((item) => (
                <button
                    key={`${item.source}-${item.translation}`}
                    type="button"
                    data-translation-phrase-tag="true"
                    onMouseDown={onPhraseClick ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    } : undefined}
                    onClick={onPhraseClick ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onPhraseClick(item, event);
                    } : undefined}
                    className={cn(
                        "reading-apple-capsule group/phrase inline-flex max-w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] leading-5 transition",
                        onPhraseClick
                            ? "cursor-pointer text-stone-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-300/70 focus-visible:ring-offset-1 active:scale-[0.985]"
                            : "text-stone-600",
                    )}
                    aria-label={`${item.source}，${item.translation}。点击查看并加入生词本`}
                    title={onPhraseClick ? "查看短语并加入生词本" : undefined}
                >
                    <span className="min-w-0 font-semibold tracking-[0.01em] text-stone-700">{item.source}</span>
                    <span className="text-stone-300">·</span>
                    <span className="min-w-0 text-stone-500">{item.translation}</span>
                    {onPhraseClick ? (
                        <BookPlus className="h-3.5 w-3.5 shrink-0 text-stone-300 opacity-0 transition group-hover/phrase:opacity-100 group-hover/phrase:text-stone-500 group-focus-visible/phrase:opacity-100 group-focus-visible/phrase:text-stone-500" />
                    ) : null}
                </button>
            ))}
        </div>
    );
}

function buildPhraseInitialDefinition(item: { source: string; translation: string }) {
    const translation = item.translation.trim();
    if (!translation) return undefined;

    return {
        context_meaning: {
            definition: `在该句中指：${translation}`,
            translation,
        },
        meaning_groups: [{ pos: "phr.", meanings: [translation] }],
        highlighted_meanings: [translation],
    };
}

function buildInlinePhraseRanges(
    sentence: string,
    items: Array<{ source: string; translation: string }>,
): InlinePhraseRange[] {
    if (!sentence.trim() || items.length === 0) return [];

    const occupied: Array<{ start: number; end: number }> = [];
    const ranges: InlinePhraseRange[] = [];
    const uniqueItems = Array.from(new Map(
        items
            .map((item) => [item.source.trim().toLowerCase(), item] as const)
            .filter(([key]) => key.length > 0),
    ).values()).sort((left, right) => right.source.length - left.source.length);

    for (const item of uniqueItems) {
        const matcher = new RegExp(`(^|\\W)(${escapeRegExp(item.source.trim())})(?=$|\\W)`, "gi");
        let match: RegExpExecArray | null = null;
        while ((match = matcher.exec(sentence)) !== null) {
            const prefix = match[1] ?? "";
            const matched = match[2] ?? "";
            if (!matched) continue;
            const start = match.index + prefix.length;
            const end = start + matched.length;
            const overlaps = occupied.some((range) => !(end <= range.start || start >= range.end));
            if (overlaps) continue;
            occupied.push({ start, end });
            ranges.push({ start, end, item });
        }
    }

    return ranges.sort((left, right) => left.start - right.start);
}

function renderInlinePhraseText(
    sentence: string,
    items: Array<{ source: string; translation: string }>,
    options: {
        phraseDisplayMode: PhraseDisplayMode;
        hoveredPhraseKey: string | null;
        hoveredPhraseSaveState: Record<string, "idle" | "saving" | "saved" | "exists" | "error">;
        onHoverPhrase: (key: string) => void;
        onLeavePhrase: (key: string) => void;
        onSavePhrase: (phrase: string, translation: string, sentenceContext: string) => Promise<void>;
        onInspectPhrase: (item: { source: string; translation: string }, event: React.MouseEvent<HTMLButtonElement>, sentenceContext?: string) => void;
    },
) {
    if (options.phraseDisplayMode !== "inline_wavy" || items.length === 0) {
        return null;
    }

    const ranges = buildInlinePhraseRanges(sentence, items);
    if (ranges.length === 0) return null;

    const nodes: React.ReactNode[] = [];
    let cursor = 0;

    ranges.forEach((range) => {
        if (range.start > cursor) {
            nodes.push(
                <span key={`plain-${cursor}-${range.start}`}>
                    {sentence.slice(cursor, range.start)}
                </span>,
            );
        }

        const phraseText = sentence.slice(range.start, range.end);
        const hoverKey = `${sentence}::${range.item.source.trim().replace(/\s+/g, " ")}`;
        const saveState = options.hoveredPhraseSaveState[hoverKey] ?? "idle";
        const isOpen = options.hoveredPhraseKey === hoverKey;

        nodes.push(
            <span
                key={`phrase-${range.start}-${range.end}`}
                className="relative inline"
                data-translation-inline-phrase="true"
                onMouseEnter={() => options.onHoverPhrase(hoverKey)}
                onMouseLeave={() => options.onLeavePhrase(hoverKey)}
            >
                <span
                    aria-label={`${range.item.source}，${range.item.translation}。悬浮查看短语提示`}
                    className="rounded-[2px] text-inherit transition hover:text-stone-900"
                    style={{
                        textDecorationLine: "underline",
                        textDecorationStyle: "solid",
                        textDecorationColor: "rgba(148,163,184,0.92)",
                        textDecorationThickness: "1.5px",
                        textUnderlineOffset: "3px",
                        textDecorationSkipInk: "none",
                    }}
                >
                    {phraseText}
                </span>
                <div
                    data-translation-inline-hover-card={isOpen ? "open" : "closed"}
                    className={cn(
                        "reading-apple-inset absolute left-0 top-full z-30 mt-2 min-w-[15rem] max-w-[min(22rem,calc(100vw-2rem))] p-2.5 text-left transition",
                        isOpen ? "pointer-events-auto opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1",
                    )}
                    onMouseEnter={() => options.onHoverPhrase(hoverKey)}
                    onMouseLeave={() => options.onLeavePhrase(hoverKey)}
                >
                    <div className="text-[11px] font-semibold leading-5 tracking-[0.01em] text-stone-800 break-words">{range.item.source}</div>
                    <div className="mt-0.5 text-[10px] leading-4 text-stone-500 break-words">{range.item.translation}</div>
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                        <button
                            type="button"
                            className="reading-apple-capsule inline-flex h-7.5 items-center justify-center gap-1 px-2 text-[10px] font-semibold text-stone-700 transition"
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                options.onInspectPhrase(range.item, event, sentence);
                            }}
                        >
                            <Globe className="h-3 w-3 text-stone-400" />
                            查看短语
                        </button>
                        <button
                            type="button"
                            className={cn(
                                "reading-apple-capsule inline-flex h-7.5 items-center justify-center gap-1 px-2 text-[10px] font-semibold transition",
                                saveState === "saved" || saveState === "exists"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_10px_22px_rgba(16,185,129,0.10)]"
                                    : saveState === "error"
                                        ? "border-rose-200 bg-rose-50 text-rose-600 shadow-[0_10px_22px_rgba(244,63,94,0.08)]"
                                        : "text-stone-600",
                            )}
                            disabled={saveState === "saving"}
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void options.onSavePhrase(range.item.source, range.item.translation, sentence);
                            }}
                        >
                            {saveState === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookPlus className="h-3 w-3" />}
                            {saveState === "saved" ? "已加入" : saveState === "exists" ? "已存在" : saveState === "error" ? "重试保存" : "加入生词本"}
                        </button>
                    </div>
                    <div className="mt-1.5 text-[8.5px] leading-4 text-stone-400 opacity-75">单词点击仍走原文查询</div>
                </div>
            </span>,
        );
        cursor = range.end;
    });

    if (cursor < sentence.length) {
        nodes.push(
            <span key={`plain-${cursor}-${sentence.length}`}>
                {sentence.slice(cursor)}
            </span>,
        );
    }

    return (
        <span
            data-translation-inline-phrases="true"
            className="leading-[1.95] text-stone-700/95"
            style={{ font: "inherit", lineHeight: "inherit", color: "inherit" }}
        >
            {nodes}
        </span>
    );
}

function buildRagUnderlineMarkers(paragraphText: string, ragAppliedWords: string[]) {
    if (!paragraphText.trim() || ragAppliedWords.length === 0) return [];

    const markers: Array<{ start: number; end: number; type: "underline" }> = [];
    const occupied: Array<{ start: number; end: number }> = [];
    const uniqueWords = Array.from(new Set(
        ragAppliedWords
            .map((item) => item.trim())
            .filter(Boolean)
            .sort((left, right) => right.length - left.length),
    ));

    for (const word of uniqueWords) {
        const matcher = new RegExp(`(^|\\W)(${escapeRegExp(word)})(?=$|\\W)`, "gi");
        let match: RegExpExecArray | null = null;
        while ((match = matcher.exec(paragraphText)) !== null) {
            const prefix = match[1] ?? "";
            const matchedText = match[2] ?? "";
            if (!matchedText) continue;
            const start = match.index + prefix.length;
            const end = start + matchedText.length;
            const overlaps = occupied.some((segment) => !(end <= segment.start || start >= segment.end));
            if (overlaps) continue;
            occupied.push({ start, end });
            markers.push({ start, end, type: "underline" });
        }
    }

    return markers.sort((left, right) => left.start - right.start);
}

function renderBionicMarkedText(
    text: string,
    renderMarkedText: (paragraphText: string, snippet?: string, baseOffset?: number, locateRange?: { start: number; end: number } | null) => React.ReactNode,
    highlightSnippet?: string,
    locateRange?: { start: number; end: number } | null,
) {
    const marked = renderMarkedText(text, highlightSnippet, 0, locateRange);
    if (typeof marked === "string") {
        return (
            <span>
                {bionicText(marked).map((segment, i) => {
                    if (segment.type === "word") {
                        return (
                            <span key={i}>
                                <strong className="font-bold">{segment.bold}</strong>
                                <span className="font-normal">{segment.regular}</span>
                            </span>
                        );
                    }
                    return <span key={i}>{segment.text}</span>;
                })}
            </span>
        );
    }

    return marked;
}

interface WordLayoutToken {
    start: number;
    end: number;
    text: string;
}

const LEGACY_HIGHLIGHT_COLOR_MAP: Record<string, string> = {
    mint: "hsl(158 74% 86%)",
    gold: "hsl(43 80% 86%)",
    lavender: "hsl(270 72% 88%)",
    peach: "hsl(24 82% 87%)",
    sky: "hsl(202 80% 87%)",
    rose: "hsl(346 76% 87%)",
};

const NUMBER_BADGE_TONES = [
    "border-rose-200 bg-rose-50 text-rose-600",
    "border-amber-200 bg-amber-50 text-amber-600",
    "border-emerald-200 bg-emerald-50 text-emerald-600",
    "border-sky-200 bg-sky-50 text-sky-600",
] as const;

const ASK_ANSWER_MODE_OPTIONS: Array<{ mode: AskAnswerMode; label: string }> = [
    { mode: "default", label: "默认" },
    { mode: "short", label: "简短" },
    { mode: "detailed", label: "详细" },
];

const ASK_REASONING_EFFORT_OPTIONS: Array<{ effort: AskReasoningEffort; label: string }> = [
    { effort: "low", label: "低" },
    { effort: "medium", label: "中" },
    { effort: "high", label: "高" },
];

const SPEAKING_SEEK_STEP_MS = 500;

function askContextMatchesOffsets(
    context: AskContextAttachment | undefined | null,
    paragraphOrder: number,
    offsets: { startOffset: number; endOffset: number },
) {
    if (!context) return false;
    return context.paragraphRanges.some((range) => (
        range.paragraphOrder === paragraphOrder
        && range.startOffset === offsets.startOffset
        && range.endOffset === offsets.endOffset
    ));
}

const normalizeHighlightColor = (rawColor: string | undefined) => {
    if (!rawColor) return LEGACY_HIGHLIGHT_COLOR_MAP.mint;
    return LEGACY_HIGHLIGHT_COLOR_MAP[rawColor] ?? rawColor;
};

const isRangeOverlapping = (startA: number, endA: number, startB: number, endB: number) => (
    startA < endB && startB < endA
);

function getCaretRangeFromPoint(clientX: number, clientY: number) {
    if (typeof document === "undefined") return null;

    const doc = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };

    const caretPosition = doc.caretPositionFromPoint?.(clientX, clientY);
    if (caretPosition?.offsetNode) {
        const range = document.createRange();
        range.setStart(caretPosition.offsetNode, caretPosition.offset);
        range.setEnd(caretPosition.offsetNode, caretPosition.offset);
        return range;
    }

    return doc.caretRangeFromPoint?.(clientX, clientY) ?? null;
}

function AskReasoningBlock({ content, isStreaming = false }: { content?: string; isStreaming?: boolean }) {
    const normalized = (content ?? "").trim();
    if (!normalized) return null;

    return (
        <details className="group mb-3 overflow-hidden rounded-[14px] border border-theme-border/30 bg-theme-surface/40 text-theme-text shadow-sm" open={isStreaming}>
            <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2 text-[12px] font-black hover:bg-theme-surface/60 transition-colors">
                <span className="inline-flex min-w-0 items-center gap-2">
                    {isStreaming ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-theme-primary-bg" /> : <Lightbulb className="h-3.5 w-3.5 shrink-0 text-theme-primary-bg opacity-80" />}
                    <span className="opacity-90">{isStreaming ? "正在思考" : "思考过程"}</span>
                </span>
                <span className="text-[10px] font-bold text-theme-text-muted opacity-70">展开</span>
            </summary>
            <div className="whitespace-pre-wrap border-t border-theme-border/20 px-3 py-2.5 text-[12px] leading-6 text-theme-text opacity-85 bg-theme-surface/20">
                {normalized}
            </div>
        </details>
    );
}

export function ParagraphCard({
    text,
    index,
    paragraphOrder = 0,
    articleTitle,
    articleUrl,
    ragAppliedWords = [],
    readingNotes = [],
    onCreateReadingNote,
    onDeleteReadingMarks,
    onSnapshotDirty,
    onWordClick,
    onOpenWordPopupFromSelection,
    askContextAttachment,
    hasActiveAskDock = false,
    onOpenAskWithContext,
    onSplit,
    onMerge,
    onUpdate,
    isEditMode,
    startTime,
    endTime,
    currentVideoTime,
    onSeekToTime,
    isFocusMode,
    isFocusLocked,
    hasActiveFocusLock,
    onSetFocusLock,
    onClearFocusLock,
    highlightSnippet,
}: ParagraphCardProps) {
    const router = useRouter();
    const sessionUser = useAuthSessionUser();
    const {
        fontClass,
        fontSizeClass,
        translationFontClass,
        translationFontSizeClass,
        translationColorClass,
        isBionicMode,
        phraseDisplayMode,
    } = useReadingSettings();
    const translationSentenceTextStyle = useMemo<React.CSSProperties>(() => {
        const fontSizeMap: Record<string, string> = {
            "text-base": "1rem",
            "text-lg": "1.125rem",
            "text-xl": "1.25rem",
            "text-2xl": "1.5rem",
        };
        const familyMap: Record<string, string> = {
            "font-serif": 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
            "font-sans": 'ui-sans-serif, system-ui, sans-serif',
            "font-mono": 'ui-monospace, SFMono-Regular, monospace',
            "font-merriweather": 'var(--font-merriweather), serif',
            "font-lora": 'var(--font-lora), serif',
            "font-inter": 'var(--font-inter), sans-serif',
            "font-libre-baskerville": 'var(--font-libre-baskerville), serif',
            "font-source-serif": 'var(--font-source-serif), serif',
            "font-work-sans": 'var(--font-work-sans), sans-serif',
            "font-roboto-mono": 'var(--font-roboto-mono), monospace',
            "font-comic": 'var(--font-comic), cursive',
            "font-[Arial,sans-serif]": 'Arial, sans-serif',
            "font-[Helvetica,sans-serif]": 'Helvetica, sans-serif',
            "font-[Georgia,serif]": 'Georgia, serif',
            "font-[Verdana,sans-serif]": 'Verdana, sans-serif',
            "font-[Tahoma,sans-serif]": 'Tahoma, sans-serif',
            "font-[Trebuchet_MS,sans-serif]": '"Trebuchet MS", sans-serif',
            "font-[Times_New_Roman,serif]": '"Times New Roman", serif',
            "font-[Palatino,serif]": 'Palatino, serif',
            "font-[Garamond,serif]": 'Garamond, serif',
            "font-[Bookman_Old_Style,serif]": '"Bookman Old Style", serif',
            "font-[Impact,sans-serif]": 'Impact, sans-serif',
            "font-[Lucida_Sans_Unicode,sans-serif]": '"Lucida Sans Unicode", sans-serif',
            "font-[Courier_New,monospace]": '"Courier New", monospace',
            "font-[Consolas,monospace]": 'Consolas, monospace',
            "font-[Optima,sans-serif]": 'Optima, sans-serif',
            "font-[Didot,serif]": 'Didot, serif',
            "font-[Copperplate,sans-serif]": 'Copperplate, sans-serif',
            "font-[Papyrus,fantasy]": 'Papyrus, fantasy',
            "font-[Century_Gothic,sans-serif]": '"Century Gothic", sans-serif',
            "font-[Candara,sans-serif]": 'Candara, sans-serif',
        };

        return {
            fontSize: fontSizeMap[fontSizeClass] ?? "1.25rem",
            lineHeight: 1.65,
            fontFamily: familyMap[fontClass],
        };
    }, [fontClass, fontSizeClass]);
    const translationTextClassName = useMemo(
        () => cn(translationFontClass, translationFontSizeClass, translationColorClass),
        [translationColorClass, translationFontClass, translationFontSizeClass],
    );
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const grammarExecutionSignature = useMemo(() => buildReadingGrammarExecutionSignature(profile), [profile]);
    const {
        translations, setTranslation: setStoreTranslation,
        grammarAnalyses, setGrammarAnalysis: setStoreGrammarAnalysis,
        loadFromDB, loadGrammarFromDB,
    } = useAnalysisStore();

    // Local visibility state
    const [showTranslation, setShowTranslation] = useState(false);
    const [showGrammar, setShowGrammar] = useState(false);
    const [grammarDisplayMode, setGrammarDisplayMode] = useState<GrammarDisplayMode>("core");
    const [isReadingLayoutMode, setIsReadingLayoutMode] = useState(false);
    const [activeListenSentenceIndex, setActiveListenSentenceIndex] = useState(0);

    const [isTranslating, setIsTranslating] = useState(false);
    const [translationError, setTranslationError] = useState<string | null>(null);
    const [isAnalyzingGrammar, setIsAnalyzingGrammar] = useState(false);
    const [sentenceGrammarUi, setSentenceGrammarUi] = useState<Record<string, SentenceGrammarUiState>>({});
    // Load from DB on mount
    useEffect(() => {
        void loadFromDB(text);
    }, [text, loadFromDB]);

    // Derived data from store
    const translationEntry = translations[text];
    const translation = isStoredTranslationPayload(translationEntry) ? translationEntry.translation : translationEntry;
    const sentenceTranslationItems = useMemo(
        () => normalizeSentenceTranslationItems(isStoredTranslationPayload(translationEntry) ? translationEntry.sentenceTranslations : []),
        [translationEntry],
    );
    const sentenceTranslationLookup = useMemo(
        () => buildSentenceTranslationLookup(sentenceTranslationItems),
        [sentenceTranslationItems],
    );
    const sentenceTranslationItemLookup = useMemo(() => {
        return buildSentenceTranslationItemLookup(sentenceTranslationItems);
    }, [sentenceTranslationItems]);
    // Rewrite Practice State
    const [isRewriteModeOpen, setIsRewriteModeOpen] = useState(false);
    const [rewritePrompt, setRewritePrompt] = useState<RewritePracticePrompt | null>(null);
    const [rewriteAttempt, setRewriteAttempt] = useState("");
    const [rewriteScore, setRewriteScore] = useState<RewritePracticeScore | null>(null);
    const [isGeneratingRewritePrompt, setIsGeneratingRewritePrompt] = useState(false);
    const [isScoringRewrite, setIsScoringRewrite] = useState(false);
    const [seenRewriteSentences, setSeenRewriteSentences] = useState<string[]>([]);
    const [rewriteCycleHint, setRewriteCycleHint] = useState<string | null>(null);

    // Speaking State
    const [isSpeakingOpen, setIsSpeakingOpen] = useState(false);
    const [isBlind, setIsBlind] = useState(false);
    const [playMode, setPlayMode] = useState<"full" | "sentence">("full");
    const [sentenceBoundaries, setSentenceBoundaries] = useState<number[]>(() => buildAutoSentenceBoundaries(text));
    const [isSentenceAudioLoading, setIsSentenceAudioLoading] = useState(false);
    const [isSentencePlaying, setIsSentencePlaying] = useState(false);
    const [sentenceCurrentTimeMs, setSentenceCurrentTimeMs] = useState(0);
    const [sentenceDurationMs, setSentenceDurationMs] = useState(0);
    const [sentenceCacheVersion, setSentenceCacheVersion] = useState(0);
    const [isSegmentListOpen, setIsSegmentListOpen] = useState(false);

    // Phrase Analysis State
    const [selectedText, setSelectedText] = useState<string | null>(null);
    const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
    const [selectionOffsets, setSelectionOffsets] = useState<{ startOffset: number; endOffset: number } | null>(null);
    const [selectionAskQuestion, setSelectionAskQuestion] = useState("");
    const [selectionAskMessages, setSelectionAskMessages] = useState<AskThreadMessage[]>([]);
    const [selectionAskStreamingContent, setSelectionAskStreamingContent] = useState("");
    const [selectionAskStreamingReasoningContent, setSelectionAskStreamingReasoningContent] = useState("");
    const [isSelectionAskLoading, setIsSelectionAskLoading] = useState(false);
    const [selectionAskAutoOpenToken, setSelectionAskAutoOpenToken] = useState(0);
    const [selectionAskContextAttachment, setSelectionAskContextAttachment] = useState<AskContextAttachment | null>(null);
    const [isSelectionAskContextCleared, setIsSelectionAskContextCleared] = useState(false);
    const [selectionPopupMode, setSelectionPopupMode] = useState<SelectionPopupMode>("selection");
    // Ask AI State - selection, sentence, and paragraph entries all use the dock composer.
    const [askAnswerMode, setAskAnswerMode] = useState<AskAnswerMode>("detailed");
    const [askThinkingMode, setAskThinkingMode] = useState<AskThinkingMode>(() => (
        profile?.ai_provider === "mimo" && profile.learning_preferences?.ai_provider_params?.mimo?.thinking_mode === "on" ? "on" : "off"
    ));
    const [askReasoningEffort, setAskReasoningEffort] = useState<AskReasoningEffort>(() => (
        profile?.ai_provider === "mimo" ? (profile.learning_preferences?.ai_provider_params?.mimo?.reasoning_effort ?? "medium") : "medium"
    ));
    const lastAppliedExternalAskContextIdRef = useRef<string | null>(null);
    const [pinnedAsk, setPinnedAsk] = useState<PinnedAskSnapshot | null>(null);
    const [phraseAnalysis, setPhraseAnalysis] = useState<PhraseAnalysisResult | null>(null);
    const [isAnalyzingPhrase, setIsAnalyzingPhrase] = useState(false);
    const [isSavingReadingNote, setIsSavingReadingNote] = useState(false);
    const [isNoteComposerOpen, setIsNoteComposerOpen] = useState(false);
    const [noteDraft, setNoteDraft] = useState("");
    const [hoveredReadingNote, setHoveredReadingNote] = useState<{
        text: string;
        x: number;
        anchorTop: number;
        anchorBottom: number;
        analyzeData?: PhraseAnalysisResult;
    } | null>(null);
    const [, setHoveredNoteId] = useState<number | null>(null);
    const [pressedAskNoteId, setPressedAskNoteId] = useState<number | null>(null);
    const [readingCoinHint, setReadingCoinHint] = useState<string | null>(null);
    const [hoveredPhraseKey, setHoveredPhraseKey] = useState<string | null>(null);
    const [hoveredPhraseSaveState, setHoveredPhraseSaveState] = useState<Record<string, "idle" | "saving" | "saved" | "exists" | "error">>({});

    const pRef = useRef<HTMLDivElement>(null);
    const sentenceAudioRef = useRef<HTMLAudioElement | null>(null);
    const grammarRequestReplayRef = useRef<Map<string, {
        promise: Promise<GrammarBasicApiResponse> | null;
        settledAt: number;
        data?: GrammarBasicApiResponse;
        error?: Error;
    }>>(new Map());
    const grammarSentenceQueueRef = useRef<Set<string>>(new Set());
    const grammarSentenceTimerRef = useRef<number | null>(null);
    const grammarSentenceInflightRef = useRef<Set<string>>(new Set());
    const sentenceAudioIndexRef = useRef<number | null>(null);
    const sentenceAudioCacheRef = useRef<Map<number, SentenceAudioCacheEntry>>(new Map());
    const sentenceAudioInflightRef = useRef<Map<number, Promise<SentenceAudioCacheEntry>>>(new Map());
    const pendingSentenceSeekRef = useRef<PendingSentenceSeek | null>(null);
    const sentenceProgressRafRef = useRef<number | null>(null);
    const sentenceProgressLastUiTsRef = useRef(0);
    const wordLayoutCacheRef = useRef<Map<string, WordLayoutToken[]>>(new Map());
    const askReplayOpenTimeoutRef = useRef<number | null>(null);
    const phraseHoverCloseTimerRef = useRef<number | null>(null);

    usePretextMeasuredLayout(pRef, {
        text,
        mode: "paragraph",
        enabled: !isEditMode,
        whiteSpaceMode: "pre-wrap",
    });

    useEffect(() => {
        return () => {
            if (askReplayOpenTimeoutRef.current !== null) {
                window.clearTimeout(askReplayOpenTimeoutRef.current);
            }
            if (phraseHoverCloseTimerRef.current !== null) {
                window.clearTimeout(phraseHoverCloseTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!askContextAttachment) return;
        const isOwnContext = askContextAttachment.paragraphRanges.some((range) => range.paragraphOrder === paragraphOrder);
        if (!isOwnContext && !hasActiveAskDock) return;
        if (lastAppliedExternalAskContextIdRef.current === askContextAttachment.id) return;
        lastAppliedExternalAskContextIdRef.current = askContextAttachment.id;
        const ownRange = askContextAttachment.paragraphRanges.find((range) => range.paragraphOrder === paragraphOrder);
        const rect = pRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);

        setSelectedText(askContextAttachment.text);
        setSelectionOffsets(ownRange
            ? { startOffset: ownRange.startOffset, endOffset: ownRange.endOffset }
            : { startOffset: 0, endOffset: text.length });
        setSelectionRect(rect);
        setSelectionPopupMode("ask");
        setSelectionAskContextAttachment(askContextAttachment);
        setIsSelectionAskContextCleared(false);
        setPhraseAnalysis(null);
        setIsNoteComposerOpen(false);
        setNoteDraft("");
        setSelectionAskQuestion("");
        setSelectionAskStreamingContent("");
        setSelectionAskStreamingReasoningContent("");
        setSelectionAskMessages((current) => {
            const shouldKeepCurrentThread = (
                selectionPopupMode === "ask" || selectionPopupMode === "ask-replay"
            ) && current.length > 0;
            return shouldKeepCurrentThread ? current : [];
        });
        setIsSelectionAskLoading(false);
        setSelectionAskAutoOpenToken(Date.now());
    }, [askContextAttachment, hasActiveAskDock, paragraphOrder, selectionPopupMode, text.length]);

    const {
        play: togglePlay,
        isPlaying,
        isLoading: isTTSLoading,
        preload,
        currentTime,
        duration,
        seekToMs,
        marks: fullMarks,
        playbackRate,
        setPlaybackRate,
        stop
    } = useTTS(text);

    const sentenceUnits = useMemo(() => (
        buildSentenceUnits(text, sentenceBoundaries)
    ), [sentenceBoundaries, text]);
    const grammarSentenceEntries = useMemo(() => {
        return sentenceUnits.map((unit, unitIndex) => {
            const normalizedSentence = normalizeGrammarSentenceList([unit.text])[0] ?? unit.text.trim();
            const cacheKey = buildGrammarCacheKey({
                text: normalizedSentence,
                mode: "basic",
                promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
                model: grammarExecutionSignature,
            });
            const storedAnalysis = grammarAnalyses[cacheKey] as GrammarBasicCachePayload | undefined;
            const uiState = sentenceGrammarUi[cacheKey];
            const analysis = uiState?.analysis ?? storedAnalysis ?? null;
            const assessment = sanitizeGrammarBasicPayload(analysis ?? null, [normalizedSentence]);
            const hasUsableAnalysis = hasUsableBasicGrammarResult(assessment.data);
            return {
                unit,
                unitIndex,
                sentence: normalizedSentence,
                cacheKey,
                analysis,
                assessment,
                hasUsableAnalysis,
                loading: uiState?.loading ?? false,
                error: uiState?.error ?? null,
                expanded: uiState?.expanded ?? false,
            };
        });
    }, [grammarAnalyses, grammarExecutionSignature, sentenceGrammarUi, sentenceUnits]);
    const sentenceUnitsRef = useRef(sentenceUnits);
    useEffect(() => {
        sentenceUnitsRef.current = sentenceUnits;
    }, [sentenceUnits]);
    const hasUsableGrammarAnalysis = grammarSentenceEntries.some((entry) => entry.hasUsableAnalysis);
    const grammarSentenceTranslationLookup = useMemo(() => {
        const items = grammarSentenceEntries.flatMap((entry) => {
            const sentence = entry.assessment.data.difficult_sentences[0];
            if (!sentence?.translation?.trim()) return [];
            return [{
                sentence: sentence.sentence || entry.sentence,
                translation: sentence.translation.trim(),
            }];
        });
        return buildSentenceTranslationLookup(items);
    }, [grammarSentenceEntries]);
    const effectiveSentenceTranslationItemLookup = useMemo(() => {
        const merged = new Map(sentenceTranslationItemLookup);
        grammarSentenceEntries.forEach((entry) => {
            const identity = sentenceIdentity(entry.unit.text);
            if (!identity || merged.has(identity)) return;
            const sentence = entry.assessment.data.difficult_sentences[0];
            const normalizedTranslation = sentence?.translation?.trim() ?? "";
            if (!normalizedTranslation) return;
            merged.set(identity, {
                sentence: entry.unit.text.trim(),
                translation: normalizedTranslation,
                phraseTranslations: [],
            });
        });
        return merged;
    }, [grammarSentenceEntries, sentenceTranslationItemLookup]);
    const effectiveSentenceTranslationLookup = useMemo(
        () => mergeSentenceTranslationLookups(grammarSentenceTranslationLookup, sentenceTranslationLookup),
        [grammarSentenceTranslationLookup, sentenceTranslationLookup],
    );

    const activeSentenceUnit = sentenceUnits[activeListenSentenceIndex] ?? null;

    const fullWordTokens = useMemo(() => extractWordTokens(text), [text]);
    const fullTokenToMark = useMemo(
        () => alignTokensToMarks(fullWordTokens, fullMarks),
        [fullWordTokens, fullMarks],
    );

    const activeSentenceMarks = useMemo(() => {
        // sentenceCacheVersion is a render trigger for ref-backed cache updates.
        void sentenceCacheVersion;
        return sentenceAudioCacheRef.current.get(activeListenSentenceIndex)?.marks ?? [];
    }, [activeListenSentenceIndex, sentenceCacheVersion]);
    const activeSentenceWordTokens = useMemo(
        () => extractWordTokens(activeSentenceUnit?.text ?? ""),
        [activeSentenceUnit?.text],
    );
    const activeSentenceTokenToMark = useMemo(
        () => alignTokensToMarks(activeSentenceWordTokens, activeSentenceMarks),
        [activeSentenceWordTokens, activeSentenceMarks],
    );

    const getWordLayout = useCallback((sourceText: string) => {
        const cached = wordLayoutCacheRef.current.get(sourceText);
        if (cached) return cached;

        const tokenRegex = /[A-Za-z0-9]+(?:[-–—][A-Za-z0-9]+)*(?:['’][A-Za-z0-9]+)*/g;
        const tokens: WordLayoutToken[] = [];
        let match: RegExpExecArray | null;

        tokenRegex.lastIndex = 0;
        while (true) {
            match = tokenRegex.exec(sourceText);
            if (!match) break;
            const start = match.index;
            const end = start + match[0].length;
            tokens.push({ start, end, text: match[0] });
        }

        wordLayoutCacheRef.current.set(sourceText, tokens);
        return tokens;
    }, []);

    const stopSentenceProgressLoop = useCallback(() => {
        if (sentenceProgressRafRef.current !== null) {
            cancelAnimationFrame(sentenceProgressRafRef.current);
            sentenceProgressRafRef.current = null;
        }
    }, []);

    const startSentenceProgressLoop = useCallback(() => {
        stopSentenceProgressLoop();
        sentenceProgressLastUiTsRef.current = 0;

        const tick = () => {
            const audio = sentenceAudioRef.current;
            if (!audio || audio.paused) {
                sentenceProgressRafRef.current = null;
                return;
            }

            const now = performance.now();
            if (now - sentenceProgressLastUiTsRef.current >= 22) {
                setSentenceCurrentTimeMs(audio.currentTime * 1000);
                sentenceProgressLastUiTsRef.current = now;
            }
            sentenceProgressRafRef.current = requestAnimationFrame(tick);
        };

        sentenceProgressRafRef.current = requestAnimationFrame(tick);
    }, [stopSentenceProgressLoop]);

    const clearSentencePlayback = useCallback(() => {
        stopSentenceProgressLoop();
        if (sentenceAudioRef.current) {
            sentenceAudioRef.current.pause();
            sentenceAudioRef.current.src = "";
            sentenceAudioRef.current.ontimeupdate = null;
            sentenceAudioRef.current.onplay = null;
            sentenceAudioRef.current.onpause = null;
            sentenceAudioRef.current.onended = null;
            sentenceAudioRef.current.onloadedmetadata = null;
            sentenceAudioRef.current = null;
        }

        sentenceAudioIndexRef.current = null;
        pendingSentenceSeekRef.current = null;
        setIsSentencePlaying(false);
        setSentenceCurrentTimeMs(0);
        setSentenceDurationMs(0);
    }, [stopSentenceProgressLoop]);

    const clearSentenceAudioCache = useCallback(() => {
        sentenceAudioInflightRef.current.clear();
        for (const entry of sentenceAudioCacheRef.current.values()) {
            if (entry.objectUrl) {
                URL.revokeObjectURL(entry.objectUrl);
            }
        }
        sentenceAudioCacheRef.current.clear();
        setSentenceCacheVersion((prev) => prev + 1);
    }, []);

    const getSentenceAudioObjectUrl = useCallback((sentenceIndex: number, entry: SentenceAudioCacheEntry) => {
        if (entry.objectUrl) return entry.objectUrl;
        const nextUrl = URL.createObjectURL(entry.blob);
        entry.objectUrl = nextUrl;
        sentenceAudioCacheRef.current.set(sentenceIndex, entry);
        return nextUrl;
    }, []);

    const ensureSentenceAudio = useCallback(async (sentenceIndex: number) => {
        const cached = sentenceAudioCacheRef.current.get(sentenceIndex);
        if (cached) return cached;

        const inflight = sentenceAudioInflightRef.current.get(sentenceIndex);
        if (inflight) return inflight;

        const targetUnit = sentenceUnits[sentenceIndex];
        if (!targetUnit || !targetUnit.speakText) {
            throw new Error("No sentence available for speaking");
        }

        const request = (async () => {
            const payload = await requestTtsPayload(targetUnit.speakText);
            const blob = await resolveTtsAudioBlob(payload.audio);
            const marks = Array.isArray(payload.marks) ? payload.marks : [];
            const entry: SentenceAudioCacheEntry = { blob, marks };
            const latestUnit = sentenceUnitsRef.current[sentenceIndex];
            if (latestUnit?.speakText === targetUnit.speakText) {
                sentenceAudioCacheRef.current.set(sentenceIndex, entry);
                setSentenceCacheVersion((prev) => prev + 1);
            }
            return entry;
        })();

        sentenceAudioInflightRef.current.set(sentenceIndex, request);

        try {
            return await request;
        } finally {
            sentenceAudioInflightRef.current.delete(sentenceIndex);
        }
    }, [sentenceUnits]);

    const prefetchNextSentenceAudio = useCallback((sentenceIndex: number) => {
        const nextIndex = sentenceIndex + 1;
        if (nextIndex >= sentenceUnits.length) return;
        if (sentenceAudioCacheRef.current.has(nextIndex) || sentenceAudioInflightRef.current.has(nextIndex)) return;

        void ensureSentenceAudio(nextIndex).catch((error: unknown) => {
            console.warn("[Read Speaking] Prefetch next sentence audio failed:", error);
        });
    }, [ensureSentenceAudio, sentenceUnits.length]);

    const warmupAllSentenceAudio = useCallback(async () => {
        if (sentenceUnits.length === 0) return;

        const pendingIndexes: number[] = [];
        for (let index = 0; index < sentenceUnits.length; index += 1) {
            if (sentenceAudioCacheRef.current.has(index) || sentenceAudioInflightRef.current.has(index)) continue;
            pendingIndexes.push(index);
        }
        if (pendingIndexes.length === 0) return;

        let cursor = 0;
        const workerCount = Math.min(2, pendingIndexes.length);
        const workers = Array.from({ length: workerCount }, async () => {
            while (cursor < pendingIndexes.length) {
                const sentenceIndex = pendingIndexes[cursor];
                cursor += 1;
                if (sentenceIndex === undefined) break;

                try {
                    await ensureSentenceAudio(sentenceIndex);
                } catch (error) {
                    console.warn("[Read Speaking] Warmup sentence audio failed:", error);
                }
            }
        });

        await Promise.all(workers);
    }, [ensureSentenceAudio, sentenceUnits.length]);

    const stopSentencePlayback = useCallback(() => {
        stopSentenceProgressLoop();
        if (sentenceAudioRef.current) {
            sentenceAudioRef.current.pause();
            sentenceAudioRef.current.currentTime = 0;
        }
        setIsSentencePlaying(false);
        setSentenceCurrentTimeMs(0);
    }, [stopSentenceProgressLoop]);

    const playSentence = useCallback(async (sentenceIndex: number, options?: { startRatio?: number; startTimeMs?: number }) => {
        const targetUnit = sentenceUnits[sentenceIndex];
        if (!targetUnit) return;

        setIsSentenceAudioLoading(true);
        setActiveListenSentenceIndex(sentenceIndex);

        try {
            const entry = await ensureSentenceAudio(sentenceIndex);
            const targetUrl = getSentenceAudioObjectUrl(sentenceIndex, entry);
            prefetchNextSentenceAudio(sentenceIndex);

            const existingAudio = sentenceAudioRef.current;
            if (existingAudio && sentenceAudioIndexRef.current === sentenceIndex) {
                if (!existingAudio.paused && !existingAudio.ended) {
                    existingAudio.pause();
                    setIsSentencePlaying(false);
                    return;
                }

                if (existingAudio.ended || existingAudio.currentTime >= existingAudio.duration) {
                    existingAudio.currentTime = 0;
                    setSentenceCurrentTimeMs(0);
                }

                existingAudio.playbackRate = playbackRate;
                await existingAudio.play();
                setIsSentencePlaying(true);
                return;
            }

            clearSentencePlayback();
            pendingSentenceSeekRef.current = options?.startTimeMs !== undefined
                ? { sentenceIndex, timeMs: Math.max(0, options.startTimeMs) }
                : options?.startRatio !== undefined
                    ? { sentenceIndex, ratio: Math.max(0, Math.min(1, options.startRatio)) }
                    : null;

            const audio = new Audio(targetUrl);
            sentenceAudioRef.current = audio;
            sentenceAudioIndexRef.current = sentenceIndex;

            audio.onloadedmetadata = () => {
                const durationMs = (audio.duration || 0) * 1000;
                setSentenceDurationMs(durationMs);

                const pendingSeek = pendingSentenceSeekRef.current;
                if (pendingSeek && pendingSeek.sentenceIndex === sentenceIndex) {
                    pendingSentenceSeekRef.current = null;
                    const targetTimeMs = pendingSeek.timeMs !== undefined
                        ? Math.max(0, Math.min(durationMs > 0 ? durationMs : pendingSeek.timeMs, pendingSeek.timeMs))
                        : durationMs > 0
                            ? Math.max(0, Math.min(durationMs, pendingSeek.ratio * durationMs))
                            : 0;
                    audio.currentTime = targetTimeMs / 1000;
                    setSentenceCurrentTimeMs(targetTimeMs);
                }
            };
            audio.ontimeupdate = () => {
                setSentenceCurrentTimeMs((audio.currentTime || 0) * 1000);
            };
            audio.onplay = () => {
                setIsSentencePlaying(true);
                startSentenceProgressLoop();
            };
            audio.onpause = () => {
                stopSentenceProgressLoop();
                if (!audio.ended) {
                    setIsSentencePlaying(false);
                }
            };
            audio.onended = () => {
                stopSentenceProgressLoop();
                setIsSentencePlaying(false);
                setSentenceCurrentTimeMs((audio.duration || 0) * 1000);
            };

            audio.playbackRate = playbackRate;
            await audio.play();
        } catch (error) {
            pendingSentenceSeekRef.current = null;
            console.error("[Read Speaking] playSentence failed:", error);
        } finally {
            setIsSentenceAudioLoading(false);
        }
    }, [
        clearSentencePlayback,
        ensureSentenceAudio,
        getSentenceAudioObjectUrl,
        playbackRate,
        prefetchNextSentenceAudio,
        startSentenceProgressLoop,
        stopSentenceProgressLoop,
        sentenceUnits,
    ]);

    const seekSentenceMs = useCallback(async (timeMs: number, options?: { autoplay?: boolean }) => {
        const autoplay = options?.autoplay ?? false;
        const targetSeconds = Math.max(0, timeMs) / 1000;
        const audio = sentenceAudioRef.current;

        if (!audio) return false;

        audio.currentTime = targetSeconds;
        setSentenceCurrentTimeMs(targetSeconds * 1000);

        if (autoplay) {
            try {
                await audio.play();
                setIsSentencePlaying(true);
            } catch (error) {
                console.error("[Read Speaking] seekSentenceMs autoplay failed:", error);
            }
        }

        return true;
    }, []);

    const seekOrPlaySentenceAtRatio = useCallback(async (sentenceIndex: number, ratio: number) => {
        const normalizedRatio = Math.max(0, Math.min(1, ratio));
        const existingAudio = sentenceAudioRef.current;
        const isSameSentence = Boolean(existingAudio && sentenceAudioIndexRef.current === sentenceIndex);

        if (isSameSentence && existingAudio) {
            const audioDurationMs = (existingAudio.duration || 0) * 1000;
            const effectiveDurationMs = sentenceDurationMs > 0 ? sentenceDurationMs : audioDurationMs;

            pendingSentenceSeekRef.current = effectiveDurationMs > 0
                ? null
                : { sentenceIndex, ratio: normalizedRatio };

            if (effectiveDurationMs > 0) {
                const targetTimeMs = Math.max(0, Math.min(effectiveDurationMs, normalizedRatio * effectiveDurationMs));
                existingAudio.currentTime = targetTimeMs / 1000;
                setSentenceCurrentTimeMs(targetTimeMs);
                if (sentenceDurationMs <= 0 && audioDurationMs > 0) {
                    setSentenceDurationMs(audioDurationMs);
                }
            }

            if (existingAudio.paused || existingAudio.ended) {
                existingAudio.playbackRate = playbackRate;
                await existingAudio.play();
                setIsSentencePlaying(true);
            }
            return true;
        }

        pendingSentenceSeekRef.current = { sentenceIndex, ratio: normalizedRatio };
        void playSentence(sentenceIndex, { startRatio: normalizedRatio });
        return true;
    }, [playbackRate, playSentence, sentenceDurationMs]);

    const seekOrPlaySentenceAtTime = useCallback(async (sentenceIndex: number, timeMs: number) => {
        const normalizedTimeMs = Math.max(0, timeMs);
        const existingAudio = sentenceAudioRef.current;
        const isSameSentence = Boolean(existingAudio && sentenceAudioIndexRef.current === sentenceIndex);
        if (isSameSentence && existingAudio) {
            const audioDurationMs = (existingAudio.duration || 0) * 1000;
            const effectiveDurationMs = sentenceDurationMs > 0 ? sentenceDurationMs : audioDurationMs;

            pendingSentenceSeekRef.current = effectiveDurationMs > 0
                ? null
                : { sentenceIndex, timeMs: normalizedTimeMs };
            if (effectiveDurationMs > 0) {
                const targetTimeMs = Math.max(0, Math.min(effectiveDurationMs, normalizedTimeMs));
                existingAudio.currentTime = targetTimeMs / 1000;
                setSentenceCurrentTimeMs(targetTimeMs);
                if (sentenceDurationMs <= 0 && audioDurationMs > 0) {
                    setSentenceDurationMs(audioDurationMs);
                }
            }

            if (existingAudio.paused || existingAudio.ended) {
                existingAudio.playbackRate = playbackRate;
                await existingAudio.play();
                setIsSentencePlaying(true);
            }
            return true;
        }

        pendingSentenceSeekRef.current = { sentenceIndex, timeMs: normalizedTimeMs };
        void playSentence(sentenceIndex, { startTimeMs: normalizedTimeMs });
        return true;
    }, [playSentence, playbackRate, sentenceDurationMs]);

    const isSentencePlaybackActive = useCallback((sentenceIndex: number) => (
        playMode === "sentence" && sentenceIndex === activeListenSentenceIndex
    ), [activeListenSentenceIndex, playMode]);

    const handleSentencePlaybackTrigger = useCallback((sentenceIndex: number) => {
        if (!sentenceUnits[sentenceIndex]) return;

        pendingSentenceSeekRef.current = null;
        setActiveListenSentenceIndex(sentenceIndex);
        if (playMode !== "sentence") {
            setPlayMode("sentence");
            stop();
        }
        void playSentence(sentenceIndex);
    }, [playMode, playSentence, sentenceUnits, stop]);

    const handlePlay = () => {
        if (playMode === "sentence") {
            if (sentenceUnits.length === 0) return;
            void playSentence(Math.max(0, Math.min(activeListenSentenceIndex, sentenceUnits.length - 1)));
            return;
        }

        togglePlay();
    };

    // Keep "听全部" behavior stable even when sentence layout mode is enabled.
    const handlePlayOriginalFull = useCallback(() => {
        setPlayMode("full");
        stopSentencePlayback();

        if (isPlaying) {
            stop();
            return;
        }

        // Always restart from the beginning for full-paragraph listening.
        stop();
        void togglePlay();
    }, [isPlaying, stop, stopSentencePlayback, togglePlay]);

    const handleStopPlayback = () => {
        if (playMode === "sentence") {
            stopSentencePlayback();
            return;
        }
        stop();
    };

    const handleToggleSegmentList = useCallback(() => {
        setIsSegmentListOpen((prev) => {
            const next = !prev;
            setPlayMode(next ? "sentence" : "full");
            if (!next) {
                void preload();
            }
            return next;
        });
    }, [preload]);

    useEffect(() => {
        preload();
    }, [preload]);

    useEffect(() => {
        if (!(isSpeakingOpen || showTranslation || showGrammar)) return;
        preload();
        void warmupAllSentenceAudio();
    }, [isSpeakingOpen, preload, showGrammar, showTranslation, warmupAllSentenceAudio]);

    useEffect(() => {
        if (isSpeakingOpen) return;
        setIsSegmentListOpen((prev) => (prev ? false : prev));
        if (playMode !== "sentence") {
            stopSentencePlayback();
        }
    }, [isSpeakingOpen, playMode, stopSentencePlayback]);

    useEffect(() => {
        if (!showGrammar) return;
        setIsNoteComposerOpen(false);
        setNoteDraft("");
        setHoveredReadingNote(null);
    }, [showGrammar]);

    useEffect(() => {
        const shouldDockSelectionAsk = (Boolean(selectionRect) && (
            selectionPopupMode === "ask" || selectionPopupMode === "ask-replay"
        )) || Boolean(pinnedAsk);
        dispatchReadSelectionAskDockEvent(shouldDockSelectionAsk);
        return () => {
            if (shouldDockSelectionAsk) {
                dispatchReadSelectionAskDockEvent(false);
            }
        };
    }, [selectionPopupMode, selectionRect, pinnedAsk]);

    useEffect(() => {
        if (!showGrammar) {
            setSentenceGrammarUi((prev) => {
                const next = { ...prev };
                for (const key of Object.keys(next)) {
                    next[key] = { ...next[key], expanded: false, loading: false };
                }
                return next;
            });
        }
    }, [showGrammar]);

    useEffect(() => {
        setSentenceBoundaries(buildAutoSentenceBoundaries(text));
        setActiveListenSentenceIndex(0);
        setIsSegmentListOpen(false);
        setPlayMode("full");
        setSentenceGrammarUi({});
        grammarSentenceQueueRef.current.clear();
        grammarSentenceInflightRef.current.clear();
        if (grammarSentenceTimerRef.current !== null) {
            window.clearTimeout(grammarSentenceTimerRef.current);
            grammarSentenceTimerRef.current = null;
        }
        clearSentencePlayback();
        clearSentenceAudioCache();
    }, [clearSentenceAudioCache, clearSentencePlayback, text]);

    useEffect(() => {
        return () => {
            clearSentencePlayback();
            clearSentenceAudioCache();
        };
    }, [clearSentenceAudioCache, clearSentencePlayback]);

    useEffect(() => {
        if (sentenceUnits.length === 0) {
            setActiveListenSentenceIndex(0);
            return;
        }

        setActiveListenSentenceIndex((prev) => Math.max(0, Math.min(prev, sentenceUnits.length - 1)));
    }, [sentenceUnits.length]);

    useEffect(() => {
        if (sentenceAudioRef.current) {
            sentenceAudioRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    useEffect(() => {
        if (playMode === "full") {
            stopSentencePlayback();
            return;
        }
        stop();
    }, [playMode, stop, stopSentencePlayback]);

    const isSentenceMode = playMode === "sentence";
    const playbackTimeMs = isSentenceMode ? sentenceCurrentTimeMs : currentTime * 1000;
    const playbackDurationMs = isSentenceMode ? sentenceDurationMs : duration * 1000;
    const playbackIsRunning = isSentenceMode ? isSentencePlaying : isPlaying;
    const playbackIsLoading = isSentenceMode ? isSentenceAudioLoading : isTTSLoading;
    const isPlaybackSessionActive = playbackIsRunning || playbackTimeMs > 0;
    const playbackTimeMsRef = useRef(playbackTimeMs);

    useEffect(() => {
        playbackTimeMsRef.current = playbackTimeMs;
    }, [playbackTimeMs]);

    const handleFullWordSeek = useCallback(async (tokenIndex: number) => {
        if (!isPlaybackSessionActive) return;

        const linkedMarkIndex = fullTokenToMark.get(tokenIndex);
        if (linkedMarkIndex !== undefined) {
            const mark = fullMarks[linkedMarkIndex];
            if (mark) {
                await seekToMs(mark.start, { autoplay: true });
                return;
            }
        }

        const fallbackToken = fullWordTokens[tokenIndex];
        if (!fallbackToken || duration <= 0) return;

        const fallbackTimeMs = (fallbackToken.start / Math.max(1, text.length)) * duration * 1000;
        await seekToMs(fallbackTimeMs, { autoplay: true });
    }, [duration, fullMarks, fullTokenToMark, fullWordTokens, isPlaybackSessionActive, seekToMs, text.length]);

    const handleSentenceWordSeek = useCallback(async (tokenIndex: number) => {
        if (!activeSentenceUnit) return;
        const fallbackToken = activeSentenceWordTokens[tokenIndex];
        const linkedMarkIndex = activeSentenceTokenToMark.get(tokenIndex);
        if (linkedMarkIndex !== undefined) {
            const mark = activeSentenceMarks[linkedMarkIndex];
            if (mark) {
                await seekOrPlaySentenceAtTime(activeListenSentenceIndex, mark.start);
                return;
            }
        }

        if (!fallbackToken) return;
        await seekOrPlaySentenceAtRatio(
            activeListenSentenceIndex,
            fallbackToken.start / Math.max(1, activeSentenceUnit.text.length),
        );
    }, [
        activeSentenceMarks,
        activeSentenceTokenToMark,
        activeSentenceUnit,
        activeSentenceWordTokens,
        activeListenSentenceIndex,
        seekOrPlaySentenceAtTime,
        seekOrPlaySentenceAtRatio,
    ]);

    const handleFullCharacterSeek = useCallback(async (charIndex: number) => {
        if (!isPlaybackSessionActive || duration <= 0) return;
        const boundedIndex = Math.max(0, Math.min(charIndex, text.length));
        const targetTimeMs = (boundedIndex / Math.max(1, text.length)) * duration * 1000;
        await seekToMs(targetTimeMs, { autoplay: true });
    }, [duration, isPlaybackSessionActive, seekToMs, text.length]);

    const handleSentenceCharacterSeek = useCallback(async (charIndex: number) => {
        if (!activeSentenceUnit) return;
        const boundedIndex = Math.max(0, Math.min(charIndex, activeSentenceUnit.text.length));
        await seekOrPlaySentenceAtRatio(
            activeListenSentenceIndex,
            boundedIndex / Math.max(1, activeSentenceUnit.text.length),
        );
    }, [activeListenSentenceIndex, activeSentenceUnit, seekOrPlaySentenceAtRatio]);

    const resolveClickCharacterIndex = useCallback((event: React.MouseEvent<HTMLElement>): ClickCharacterResolution | null => {
        const paragraphNode = pRef.current;
        if (!paragraphNode) return null;

        const targetNode = event.target instanceof Node ? event.target : null;
        const targetElement = targetNode instanceof Element ? targetNode : targetNode?.parentElement ?? null;
        const segmentContentNode = targetElement?.closest<HTMLElement>("[data-speaking-segment-content='true'], [data-segment-content='true']");
        const segmentNode = segmentContentNode?.closest<HTMLElement>("[data-speaking-segment='true'], [data-reading-layout-segment='true']");
        const segmentStart = Number(segmentNode?.getAttribute("data-segment-start"));
        const segmentIndex = Number(segmentNode?.getAttribute("data-speaking-segment-index"));
        const offsetRoot = segmentContentNode && paragraphNode.contains(segmentContentNode)
            ? segmentContentNode
            : paragraphNode;
        const baseOffset = Number.isFinite(segmentStart) ? segmentStart : 0;

        const caretRange = getCaretRangeFromPoint(event.clientX, event.clientY);
        if (!caretRange || !offsetRoot.contains(caretRange.endContainer)) {
            const charNode = targetElement?.closest<HTMLElement>("[data-ktv-char-index]");
            const explicitCharIndex = Number(charNode?.getAttribute("data-ktv-char-index"));
            if (Number.isFinite(explicitCharIndex)) {
                return {
                    index: baseOffset + explicitCharIndex,
                    sentenceIndex: Number.isFinite(segmentIndex) ? segmentIndex : undefined,
                };
            }

            const measurementRoot = segmentContentNode ?? offsetRoot;
            const textLength = measurementRoot.textContent?.length ?? 0;
            if (textLength <= 0) return null;

            const rect = measurementRoot.getBoundingClientRect();
            const measuredWidth = rect.width || (measurementRoot instanceof HTMLElement ? measurementRoot.clientWidth : 0) || 1;
            const relativeX = Math.max(0, Math.min(event.clientX - rect.left, measuredWidth));
            const estimatedIndex = Math.round((relativeX / measuredWidth) * textLength);

            return {
                index: baseOffset + Math.max(0, Math.min(estimatedIndex, textLength)),
                sentenceIndex: Number.isFinite(segmentIndex) ? segmentIndex : undefined,
            };
        }

        const preCaretRange = caretRange.cloneRange();
        preCaretRange.selectNodeContents(offsetRoot);
        preCaretRange.setEnd(caretRange.endContainer, caretRange.endOffset);
        return {
            index: baseOffset + preCaretRange.toString().length,
            sentenceIndex: Number.isFinite(segmentIndex) ? segmentIndex : undefined,
        };
    }, []);

    const stepSpeakingPlayback = useCallback(async (deltaMs: number) => {
        if (!(isSpeakingOpen || playMode === "sentence") || !isPlaybackSessionActive) return;

        const totalMs = Math.max(0, playbackDurationMs);
        if (totalMs <= 0) return;

        const currentMs = playbackTimeMsRef.current;
        const nextMs = Math.max(0, Math.min(currentMs + deltaMs, totalMs));
        playbackTimeMsRef.current = nextMs;
        if (isSentenceMode) {
            setSentenceCurrentTimeMs(nextMs);
            await seekSentenceMs(nextMs, { autoplay: true });
            return;
        }

        await seekToMs(nextMs, { autoplay: true });
    }, [
        isPlaybackSessionActive,
        playMode,
        isSentenceMode,
        isSpeakingOpen,
        playbackDurationMs,
        seekSentenceMs,
        seekToMs,
    ]);

    useEffect(() => {
        if (!(isSpeakingOpen || playMode === "sentence")) return;

        const handleSpeakingKeyDown = (event: KeyboardEvent) => {
            const target = event.target;
            if (target instanceof HTMLElement) {
                const tagName = target.tagName.toLowerCase();
                if (target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select") {
                    return;
                }
            }

            if (event.code === "Space" || event.key === " ") {
                if (playMode === "sentence" && sentenceUnits.length > 0) {
                    event.preventDefault();
                    const index = Math.max(0, Math.min(activeListenSentenceIndex, sentenceUnits.length - 1));
                    stopSentencePlayback();
                    void playSentence(index);
                }
                return;
            }

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                void stepSpeakingPlayback(-SPEAKING_SEEK_STEP_MS);
                return;
            }

            if (event.key === "ArrowRight") {
                event.preventDefault();
                void stepSpeakingPlayback(SPEAKING_SEEK_STEP_MS);
            }
        };

        window.addEventListener("keydown", handleSpeakingKeyDown);
        return () => window.removeEventListener("keydown", handleSpeakingKeyDown);
    }, [activeListenSentenceIndex, isSpeakingOpen, playMode, playSentence, sentenceUnits.length, stepSpeakingPlayback, stopSentencePlayback]);

    const renderWordLevelKtv = useCallback((params: {
        sourceText: string;
        marks: TtsWordMark[];
        tokenToMark: Map<number, number>;
        currentMs: number;
        dimInactive?: boolean;
        isSeekEnabled?: boolean;
        onWordSeek: (tokenIndex: number) => Promise<void> | void;
    }) => {
        const {
            sourceText,
            marks: sourceMarks,
            tokenToMark,
            currentMs,
            dimInactive = false,
            isSeekEnabled = false,
            onWordSeek,
        } = params;
        const wordLayout = getWordLayout(sourceText);
        const nodes: React.ReactNode[] = [];
        let cursor = 0;
        let tokenIndex = 0;

        for (const token of wordLayout) {
            const start = token.start;
            const end = token.end;
            if (start > cursor) {
                nodes.push(
                    <React.Fragment key={`txt-${cursor}-${start}`}>
                        {sourceText.slice(cursor, start)}
                    </React.Fragment>,
                );
            }

            const linkedMarkIndex = tokenToMark.get(tokenIndex);
            const linkedMark = linkedMarkIndex !== undefined ? sourceMarks[linkedMarkIndex] : null;
            const nextLinkedMark = linkedMarkIndex !== undefined ? sourceMarks[linkedMarkIndex + 1] : null;
            const smoothTailMs = 90;
            const activeStartMs = linkedMark ? Math.max(0, linkedMark.start - 40) : 0;
            const activeEndMs = nextLinkedMark ? nextLinkedMark.start + 40 : (linkedMark ? linkedMark.end + smoothTailMs : 0);
            const isCurrent = Boolean(linkedMark && currentMs >= activeStartMs && currentMs < activeEndMs);
            const isPlayed = Boolean(linkedMark && currentMs >= activeEndMs);
            const wordText = token.text;
            const currentTokenIndex = tokenIndex;

            nodes.push(
                <span
                    key={`word-${start}-${end}-${currentTokenIndex}`}
                    data-ktv-word-index={currentTokenIndex}
                    onClick={(event) => {
                        if (!isSeekEnabled) return;
                        event.preventDefault();
                        event.stopPropagation();
                        void onWordSeek(currentTokenIndex);
                    }}
                    className={cn(
                        "relative inline-block",
                        isSeekEnabled ? "cursor-pointer" : "cursor-default",
                        isCurrent && "text-sky-600",
                        !isCurrent && isPlayed && "text-sky-600/90",
                        !isCurrent && !isPlayed && (dimInactive ? "text-stone-400/95" : "text-stone-600/95"),
                    )}
                    title={isSeekEnabled ? "点击跳转到该单词" : ""}
                >
                    {wordText}
                </span>,
            );

            cursor = end;
            tokenIndex += 1;
        }

        if (cursor < sourceText.length) {
            nodes.push(
                <React.Fragment key={`tail-${cursor}`}>
                    {sourceText.slice(cursor)}
                </React.Fragment>,
            );
        }

        if (nodes.length > 0) return <>{nodes}</>;
        return sourceText;
    }, [getWordLayout]);

    const renderCharacterFallback = useCallback((
        sourceText: string,
        currentMs: number,
        totalMs: number,
        options?: {
            isSeekEnabled?: boolean;
            onCharacterSeek?: (charIndex: number) => Promise<void> | void;
        },
    ) => {
        const isSeekEnabled = options?.isSeekEnabled ?? false;
        const onCharacterSeek = options?.onCharacterSeek;
        const chars = sourceText.split("");
        const totalChars = Math.max(1, sourceText.length);
        const progress = totalMs > 0 ? currentMs / totalMs : 0;
        const highlightedChars = progress * totalChars;

        return (
            <span>
                {chars.map((char, charIndex) => (
                    <span
                        key={`${char}-${charIndex}`}
                        data-ktv-char-index={charIndex}
                        onClick={isSeekEnabled && onCharacterSeek
                            ? (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void onCharacterSeek(charIndex);
                            }
                            : undefined}
                        className={cn(
                            "transition-colors duration-75",
                            isSeekEnabled && "cursor-pointer",
                            charIndex < highlightedChars ? "text-amber-600" : "text-stone-400",
                        )}
                        title={isSeekEnabled ? "点击跳转到该位置" : ""}
                    >
                        {char}
                    </span>
                ))}
            </span>
        );
    }, []);

    const renderSentencePlaybackContent = useCallback((
        sentenceUnit: { text: string },
        sentenceIndex: number,
        fallbackContent: React.ReactNode,
    ) => {
        const showSentenceKtv = isSentencePlaybackActive(sentenceIndex) && isPlaybackSessionActive;
        if (!showSentenceKtv) return fallbackContent;

        if (activeSentenceMarks.length > 0) {
            return renderWordLevelKtv({
                sourceText: sentenceUnit.text,
                marks: activeSentenceMarks,
                tokenToMark: activeSentenceTokenToMark,
                currentMs: playbackTimeMs,
                isSeekEnabled: isPlaybackSessionActive,
                onWordSeek: handleSentenceWordSeek,
            });
        }

        return renderCharacterFallback(sentenceUnit.text, playbackTimeMs, playbackDurationMs, {
            isSeekEnabled: isPlaybackSessionActive,
            onCharacterSeek: handleSentenceCharacterSeek,
        });
    }, [
        activeSentenceMarks,
        activeSentenceTokenToMark,
        handleSentenceCharacterSeek,
        handleSentenceWordSeek,
        isPlaybackSessionActive,
        isSentencePlaybackActive,
        playbackDurationMs,
        playbackTimeMs,
        renderCharacterFallback,
        renderWordLevelKtv,
    ]);

    const renderSegmentedSentenceList = useCallback(() => {
        if (sentenceUnits.length === 0) return <span>{text}</span>;

        return (
            <div className="space-y-2">
                <div className="text-[11px] text-stone-400">提示：点击左侧编号可播放该句</div>
                <ul className="space-y-1.5">
                {sentenceUnits.map((unit, unitIndex) => {
                    const isSentenceActive = isSentencePlaybackActive(unitIndex);

                    return (
                        <li
                            key={`segment-line-${unit.start}-${unit.end}`}
                            data-speaking-segment="true"
                            data-speaking-segment-index={unitIndex}
                            data-segment-start={unit.start}
                            className={cn(
                                "group/segment flex items-start gap-2 rounded-md px-1 py-0.5 transition-colors",
                                isSentenceActive ? "bg-amber-50/70" : "hover:bg-stone-50/70",
                            )}
                            onClick={() => {
                                if (playMode !== "sentence") return;
                                setActiveListenSentenceIndex(unitIndex);
                            }}
                        >
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleSentencePlaybackTrigger(unitIndex);
                                }}
                                className={cn(
                                    "mt-[4px] shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full border text-[12px] font-semibold leading-none transition-all",
                                    isSentenceActive
                                        ? "border-stone-300 bg-stone-800 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                                        : `${NUMBER_BADGE_TONES[unitIndex % NUMBER_BADGE_TONES.length]} hover:scale-105`,
                                )}
                                title={`播放第 ${unitIndex + 1} 句`}
                                aria-label={`播放第 ${unitIndex + 1} 句`}
                            >
                                {unitIndex + 1}
                            </button>
                            <div
                                data-speaking-segment-content="true"
                                className={cn("min-w-0 flex-1", playMode === "sentence" && "cursor-pointer")}
                            >
                                {renderSentencePlaybackContent(
                                    unit,
                                    unitIndex,
                                    <span className={cn(isSentenceActive ? "text-stone-900" : "text-stone-700")}>
                                        {unit.text}
                                    </span>,
                                )}
                            </div>
                        </li>
                    );
                })}
                </ul>
            </div>
        );
    }, [
        activeListenSentenceIndex,
        activeSentenceMarks,
        activeSentenceTokenToMark,
        handleSentencePlaybackTrigger,
        isPlaybackSessionActive,
        isSentencePlaybackActive,
        playMode,
        renderSentencePlaybackContent,
        sentenceUnits,
        text,
    ]);

    const locateMarkerRange = useMemo(() => {
        if (!highlightSnippet?.trim()) return null;
        const lowerText = text.toLowerCase();
        const lowerSnippet = highlightSnippet.trim().toLowerCase();
        const idx = lowerText.indexOf(lowerSnippet);
        if (idx < 0) return null;
        return {
            start: idx,
            end: idx + lowerSnippet.length,
        };
    }, [highlightSnippet, text]);

    const renderTextWithReadingMarks = (
        paragraphText: string,
        snippet?: string,
        baseOffset = 0,
        locateRange?: { start: number; end: number } | null,
    ) => {
        const markers: Array<{
            start: number;
            end: number;
            type: "highlight" | "underline" | "note" | "ask" | "locate" | "analyze";
            noteText?: string;
            id?: number;
            markColor?: string;
            askPreview?: string;
            askTurns?: number;
        }> = [];
        const textStart = Math.max(0, baseOffset);
        const textEnd = textStart + paragraphText.length;

        for (const note of normalizedReadingNotes) {
            const overlapStart = Math.max(textStart, note.start_offset);
            const overlapEnd = Math.min(textEnd, note.end_offset);
            if (overlapEnd <= overlapStart) continue;

            // Ignore sentence-level ask marks so they don't render a background highlight over the text
            const isSentenceLevelAsk = note.mark_type === "ask" && sentenceUnits.some(u => u.start === note.start_offset && u.end === note.end_offset);
            if (isSentenceLevelAsk) continue;

            const askThread = note.mark_type === "ask"
                ? decodeAskThreadPayload(note.note_text)
                : null;

            markers.push({
                start: overlapStart - textStart,
                end: overlapEnd - textStart,
                type: note.mark_type,
                noteText: note.note_text,
                id: note.id,
                markColor: note.mark_color,
                askPreview: askThread ? buildAskThreadPreview(askThread) : undefined,
                askTurns: askThread ? askThread.messages.filter((item) => item.role === "user").length : undefined,
            });
        }

        if (locateRange && locateRange.end > locateRange.start) {
            const overlapStart = Math.max(textStart, locateRange.start);
            const overlapEnd = Math.min(textEnd, locateRange.end);
            if (overlapEnd > overlapStart) {
                markers.push({
                    start: overlapStart - textStart,
                    end: overlapEnd - textStart,
                    type: "locate",
                });
            }
        } else if (snippet?.trim()) {
            const lowerText = paragraphText.toLowerCase();
            const lowerSnippet = snippet.trim().toLowerCase();
            const idx = lowerText.indexOf(lowerSnippet);
            if (idx >= 0) {
                markers.push({
                    start: idx,
                    end: idx + lowerSnippet.length,
                    type: "locate",
                });
            }
        }

        for (const ragMarker of buildRagUnderlineMarkers(paragraphText, ragAppliedWords)) {
            markers.push(ragMarker);
        }

        if (markers.length === 0) return paragraphText;

        const boundaries = new Set<number>([0, paragraphText.length]);
        for (const marker of markers) {
            boundaries.add(marker.start);
            boundaries.add(marker.end);
        }
        const sorted = Array.from(boundaries).sort((a, b) => a - b);

        return (
            <>
                {sorted.slice(0, -1).map((start, idx) => {
                    const end = sorted[idx + 1];
                    if (end <= start) return null;
                    const piece = paragraphText.slice(start, end);
                    if (!piece) return null;

                    const active = markers.filter((marker) => marker.start <= start && marker.end >= end);
                    if (active.length === 0) return <React.Fragment key={`${baseOffset}-${start}-${end}`}>{piece}</React.Fragment>;

                    const hasHighlight = active.some((marker) => marker.type === "highlight");
                    const highlightMarker = active.find((marker) => marker.type === "highlight");
                    const highlightColor = normalizeHighlightColor(highlightMarker?.markColor);
                    const hasUnderline = active.some((marker) => marker.type === "underline");
                    const noteMarker = active.find((marker) => marker.type === "note");
                    const askMarker = active.find((marker) => marker.type === "ask");
                    const analyzeMarker = active.find((marker) => marker.type === "analyze");
                    const hasLocate = active.some((marker) => marker.type === "locate");
                    const showLocateVisual = hasLocate;
                    const showNoteVisual = Boolean(noteMarker && !showLocateVisual);
                    const showAskVisual = Boolean(askMarker && !showLocateVisual && !showNoteVisual);
                    const showAnalyzeVisual = Boolean(analyzeMarker && !showLocateVisual && !showNoteVisual && !showAskVisual);
                    const hasUnderlineVisible = hasUnderline && !showNoteVisual && !showLocateVisual && !showAskVisual && !showAnalyzeVisual;
                    const showHighlightVisual = hasHighlight && !showLocateVisual && !showNoteVisual && !showAskVisual && !showAnalyzeVisual;
                    const markStyle: React.CSSProperties | undefined = showHighlightVisual
                        ? { backgroundColor: highlightColor }
                        : undefined;

                    return (
                        <span
                            key={`${baseOffset}-${start}-${end}`}
                            className={cn(
                                "rounded-[3px] px-[1px] transition-colors",
                                showHighlightVisual && "ring-1 ring-black/5",
                                hasUnderlineVisible && "underline decoration-slate-400/80 decoration-[1.5px] underline-offset-[2px]",
                                showNoteVisual && "relative cursor-pointer select-text box-decoration-clone text-inherit px-[4px] py-[1px] bg-amber-200/80 dark:bg-amber-600/40 rounded-md rounded-tl-xl rounded-br-lg rounded-tr-sm rounded-bl-sm [text-shadow:0_1px_2px_rgba(180,83,0,0.3)] dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.8)] transition-all duration-75 ease-out top-0 hover:-top-[1px] hover:bg-amber-300/90 dark:hover:bg-amber-600/60 hover:[text-shadow:0_3px_4px_rgba(180,83,0,0.4)] dark:hover:[text-shadow:0_3px_4px_rgba(0,0,0,0.9)] active:top-[1px] active:bg-amber-400 dark:active:bg-amber-700/60 active:[text-shadow:none]",
                                showAskVisual && "relative cursor-pointer select-text box-decoration-clone text-inherit px-[4px] py-[1px] bg-sky-200/80 dark:bg-sky-600/40 rounded-md rounded-tl-sm rounded-br-sm rounded-tr-xl rounded-bl-lg [text-shadow:0_1px_2px_rgba(3,105,161,0.3)] dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.8)] transition-all duration-75 ease-out top-0 hover:-top-[1px] hover:bg-sky-300/90 dark:hover:bg-sky-600/60 hover:[text-shadow:0_3px_4px_rgba(3,105,161,0.4)] dark:hover:[text-shadow:0_3px_4px_rgba(0,0,0,0.9)] active:top-[1px] active:bg-sky-400 dark:active:bg-sky-700/60 active:[text-shadow:none]",
                                showAskVisual && askMarker?.id === pressedAskNoteId && "top-[1px] bg-sky-400 dark:bg-sky-700/60 [text-shadow:none]",
                                showAnalyzeVisual && "relative cursor-pointer select-text box-decoration-clone text-inherit px-[4px] py-[1px] bg-fuchsia-200/80 dark:bg-fuchsia-600/40 rounded-md rounded-tl-sm rounded-br-sm rounded-tr-xl rounded-bl-lg [text-shadow:0_1px_2px_rgba(192,38,211,0.3)] dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.8)] transition-all duration-75 ease-out top-0 hover:-top-[1px] hover:bg-fuchsia-300/90 dark:hover:bg-fuchsia-600/60 hover:[text-shadow:0_3px_4px_rgba(192,38,211,0.4)] dark:hover:[text-shadow:0_3px_4px_rgba(0,0,0,0.9)] active:top-[1px] active:bg-fuchsia-400 dark:active:bg-fuchsia-700/60 active:[text-shadow:none]",
                                showLocateVisual && "cursor-text select-text box-decoration-clone text-inherit px-[4px] py-[1px] bg-rose-200/80 dark:bg-rose-600/40 rounded-md rounded-tl-lg rounded-br-md rounded-tr-lg rounded-bl-md [text-shadow:0_1px_2px_rgba(159,18,57,0.3)] dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.8)] transition-all duration-150",
                            )}
                            style={markStyle}
                            data-reading-note-id={showNoteVisual ? noteMarker?.id : showAskVisual ? askMarker?.id : showAnalyzeVisual ? analyzeMarker?.id : undefined}
                            title={showNoteVisual ? "点击可编辑标注" : showAskVisual ? "点击查看AI问答记录" : showAnalyzeVisual ? "点击查看AI解读" : undefined}
                            onMouseEnter={(event) => {
                                if (showNoteVisual && noteMarker?.noteText) {
                                    if (noteMarker.id) setHoveredNoteId(noteMarker.id);
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    setHoveredReadingNote({
                                        text: noteMarker.noteText || "",
                                        x: rect.left + rect.width / 2,
                                        anchorTop: rect.top,
                                        anchorBottom: rect.bottom,
                                    });
                                } else if (showAskVisual) {
                                    if (askMarker?.id) setHoveredNoteId(askMarker.id);
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    setHoveredReadingNote({
                                        text: askMarker?.askPreview || "AI问答记录",
                                        x: rect.left + rect.width / 2,
                                        anchorTop: rect.top,
                                        anchorBottom: rect.bottom,
                                    });
                                } else if (showAnalyzeVisual && analyzeMarker?.noteText) {
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    try {
                                        const data = JSON.parse(analyzeMarker.noteText);
                                        setHoveredReadingNote({
                                            text: "AI解读内容",
                                            analyzeData: data,
                                            x: rect.left + rect.width / 2,
                                            anchorTop: rect.top,
                                            anchorBottom: rect.bottom,
                                        });
                                    } catch {
                                        // Ignore parse error
                                    }
                                }
                            }}
                            onMouseMove={(showNoteVisual && noteMarker?.noteText) || showAskVisual || (showAnalyzeVisual && analyzeMarker?.noteText)
                                ? (event) => {
                                    setHoveredReadingNote((prev) => prev ? {
                                        ...prev,
                                        x: event.clientX,
                                    } : prev);
                                }
                                : undefined}
                            onMouseLeave={(showNoteVisual && noteMarker?.noteText) || showAskVisual || (showAnalyzeVisual && analyzeMarker?.noteText)
                                ? () => {
                                    setHoveredReadingNote(null);
                                }
                                : undefined}
                            onClick={showNoteVisual && noteMarker?.id
                                ? (event) => {
                                    if (hasMeaningfulTextSelection(window.getSelection())) return;
                                    event.stopPropagation();
                                    if (!noteMarker.id) return;
                                    const targetNote = normalizedReadingNotes.find((note) => note.id === noteMarker.id && note.mark_type === "note");
                                    if (!targetNote) return;

                                    setSelectionRect(event.currentTarget.getBoundingClientRect());
                                    setSelectedText(targetNote.selected_text || text.slice(targetNote.start_offset, targetNote.end_offset));
                                    setSelectionOffsets({
                                        startOffset: targetNote.start_offset,
                                        endOffset: targetNote.end_offset,
                                    });
                                    setSelectionPopupMode("selection");
                                    setPhraseAnalysis(null);
                                    setIsNoteComposerOpen(true);
                                    setNoteDraft(targetNote.note_text || "");
                                    setHoveredReadingNote(null);
                                }
                                : showAskVisual && askMarker?.id
                                    ? (event) => {
                                        if (hasMeaningfulTextSelection(window.getSelection())) return;
                                        event.stopPropagation();
                                        const targetAskNote = normalizedReadingNotes.find((note) => note.id === askMarker.id && note.mark_type === "ask");
                                        if (!targetAskNote) return;
                                        triggerAskReplayFromMarker(targetAskNote, event.currentTarget.getBoundingClientRect());
                                    }
                                : showAnalyzeVisual && analyzeMarker?.id
                                    ? (event) => {
                                        if (hasMeaningfulTextSelection(window.getSelection())) return;
                                        event.stopPropagation();
                                        const targetAnalyzeNote = normalizedReadingNotes.find((note) => note.id === analyzeMarker.id && note.mark_type === "analyze");
                                        if (!targetAnalyzeNote || !targetAnalyzeNote.note_text) return;
                                        try {
                                            const data = JSON.parse(targetAnalyzeNote.note_text);
                                            setSelectionRect(event.currentTarget.getBoundingClientRect());
                                            setSelectedText(targetAnalyzeNote.selected_text || text.slice(targetAnalyzeNote.start_offset, targetAnalyzeNote.end_offset));
                                            setSelectionOffsets({
                                                startOffset: targetAnalyzeNote.start_offset,
                                                endOffset: targetAnalyzeNote.end_offset,
                                            });
                                            setSelectionPopupMode("selection");
                                            setPhraseAnalysis(data);
                                            setIsNoteComposerOpen(false);
                                            setHoveredReadingNote(null);
                                        } catch {
                                            // fallback
                                        }
                                    }
                                : undefined}
                        >
                            {piece}
                        </span>
                    );
                })}
            </>
        );
    };

    const renderReadingLayoutList = () => {
        if (sentenceUnits.length === 0) {
            return (
                <span className="text-stone-700">
                    {renderTextWithReadingMarks(text, highlightSnippet, 0, locateMarkerRange)}
                </span>
            );
        }

        return (
            <motion.div
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={{
                    hidden: { opacity: 0 },
                    visible: {
                        opacity: 1,
                        transition: { staggerChildren: 0.05 },
                    },
                    exit: { opacity: 0, transition: { staggerChildren: 0.02, staggerDirection: -1 } }
                }}
                className="flex flex-col gap-4 py-2"
            >
                {sentenceUnits.map((unit, i) => {
                    const hasAskNote = normalizedReadingNotes.some(
                        (note) => note.mark_type === "ask" && note.start_offset === unit.start && note.end_offset === unit.end
                    );
                    return (
                    <motion.div
                        key={`reading-layout-${unit.start}-${unit.end}`}
                        variants={{
                            hidden: { opacity: 0, x: -10, y: 5, filter: "blur(4px)" },
                            visible: { opacity: 1, x: 0, y: 0, filter: "blur(0px)" },
                            exit: { opacity: 0, x: -5, filter: "blur(2px)" }
                        }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
                        className="relative flex items-start gap-3 group/layout-item pl-1"
                        data-reading-layout-segment="true"
                        data-segment-start={unit.start}
                    >
                        {/* Premium Soft Badge Indicator */}
                        <div 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSegmentNumberClick(i);
                            }}
                            title="点击整句向 AI 提问"
                            className={cn(
                                "mt-[2px] flex h-5 min-w-[20px] cursor-pointer shrink-0 select-none items-center justify-center rounded border text-[9px] font-black shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300 ease-out group-hover/layout-item:scale-105",
                                hasAskNote
                                    ? "bg-indigo-100/80 border-indigo-200/50 text-indigo-500 shadow-sm dark:bg-indigo-500/20 dark:border-indigo-500/30 dark:text-indigo-400"
                                    : "bg-theme-surface/80 border-theme-border/20 text-theme-text-muted/70 hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-600 group-hover/layout-item:bg-indigo-500/5 group-hover/layout-item:border-indigo-500/20 group-hover/layout-item:text-indigo-500"
                            )}
                        >
                            {i + 1}
                        </div>

                        {/* Content Block — inherit font size from the outer paragraph (fontSizeClass) */}
                        <div data-segment-content="true" className="leading-[1.7] tracking-[0.015em] relative flex-1 text-theme-text">
                            {renderTextWithReadingMarks(unit.text, undefined, unit.start, locateMarkerRange)}
                        </div>
                    </motion.div>
                    );
                })}
            </motion.div>
        );
    };

    function renderGrammarLayoutList() {
        if (grammarSentenceEntries.length === 0) {
            return <span className="text-stone-700">{text}</span>;
        }

        return (
            <ul className={cn("list-none pl-0", showTranslation ? "space-y-2.5" : "space-y-3")}>
                {grammarSentenceEntries.map((entry, index) => {
                    const analysisSentence = entry.assessment.data.difficult_sentences[0] ?? {
                        sentence: entry.sentence,
                        translation: "",
                        highlights: [],
                    };
                    const identity = sentenceIdentity(entry.unit.text);
                    const storedTranslationItem = effectiveSentenceTranslationItemLookup.get(identity);
                    const unitTranslation = storedTranslationItem?.translation ?? effectiveSentenceTranslationLookup.get(identity) ?? "";
                    const phraseTranslations = storedTranslationItem?.phraseTranslations ?? [];
                    const resolvedAnalysisTranslation = unitTranslation || analysisSentence.translation?.trim() || "";
                    const shouldHidePlainTranslation = entry.hasUsableAnalysis && entry.expanded && resolvedAnalysisTranslation;
                    const inlinePhraseSentenceNode = showTranslation && phraseDisplayMode === "inline_wavy" && phraseTranslations.length > 0
                        ? renderInlinePhraseText(entry.unit.text, phraseTranslations, {
                            phraseDisplayMode,
                            hoveredPhraseKey,
                            hoveredPhraseSaveState,
                            onHoverPhrase: openPhraseHoverCard,
                            onLeavePhrase: schedulePhraseHoverClose,
                            onSavePhrase: handleSavePhraseToVocab,
                            onInspectPhrase: handlePhraseTranslationClick,
                        })
                        : null;

                    const isSentenceActive = isSentencePlaybackActive(entry.unitIndex)
                        || (showTranslation && playMode === "sentence" && activeListenSentenceIndex === entry.unitIndex);

                    return (
                        <li
                            key={`grammar-sentence-${entry.cacheKey}`}
                            data-speaking-segment="true"
                            data-speaking-segment-index={entry.unitIndex}
                            data-segment-start={entry.unit.start}
                            data-translation-row={showTranslation ? "true" : undefined}
                            data-translation-row-active={showTranslation ? String(isSentenceActive) : undefined}
                            className={cn(
                                "grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 px-1.5 py-1 transition-colors",
                                showTranslation
                                    ? "reading-apple-row px-3.5 py-3"
                                    : cn(
                                        "rounded-lg",
                                        isSentencePlaybackActive(entry.unitIndex)
                                            ? "bg-amber-50/70"
                                            : "hover:bg-stone-50/70",
                                    ),
                            )}
                            onClick={() => {
                                if (playMode !== "sentence") return;
                                setActiveListenSentenceIndex(entry.unitIndex);
                            }}
                        >
                            <div className="flex flex-col items-center gap-1">
                                <button
                                    type="button"
                                    aria-label={`第 ${index + 1} 句`}
                                    onClick={() => {
                                        if (entry.loading) return;
                                        if (!entry.hasUsableAnalysis) {
                                            queueGrammarSentence(entry.unitIndex);
                                            return;
                                        }
                                        setSentenceGrammarUi((prev) => ({
                                            ...prev,
                                            [entry.cacheKey]: {
                                                cacheKey: entry.cacheKey,
                                                sentence: entry.sentence,
                                                analysis: prev[entry.cacheKey]?.analysis ?? entry.analysis ?? null,
                                                error: prev[entry.cacheKey]?.error ?? null,
                                                loading: prev[entry.cacheKey]?.loading ?? false,
                                                expanded: !prev[entry.cacheKey]?.expanded,
                                            },
                                        }));
                                    }}
                                    className={cn(
                                        "mt-[2px] inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold transition-colors",
                                        entry.loading
                                            ? "border-teal-200 bg-teal-50 text-teal-600"
                                            : entry.hasUsableAnalysis
                                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                                : "border-theme-border/30 bg-theme-surface text-theme-text-muted hover:border-teal-300 hover:text-teal-700",
                                    )}
                                    title={entry.hasUsableAnalysis ? "展开或收起该句解析" : "点击分析该句"}
                                >
                                    {entry.loading ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.6} /> : (index + 1)}
                                </button>
                                {showTranslation ? (
                                    <button
                                        type="button"
                                        aria-label={`把第 ${index + 1} 句植入 Ask AI 上下文`}
                                        title="植入上下文"
                                        onClick={() => handleInjectSentenceAskContext(entry.unitIndex)}
                                        className="reading-apple-capsule inline-flex h-5 w-5 items-center justify-center border-indigo-100 bg-white text-indigo-400 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                                    >
                                        <MessageCircleQuestion className="h-3 w-3" strokeWidth={1.6} />
                                    </button>
                                ) : null}
                            </div>

                            <div className="min-w-0">
                                <div className={cn("flex items-start", showTranslation ? "gap-3" : "gap-2")}>
                                <div className="min-w-0 flex-1">
                                <div
                                    data-translation-sentence-body="true"
                                    data-speaking-segment-content="true"
                                    className={cn(
                                        "min-w-0 text-left text-stone-800 leading-[1.6]",
                                        showTranslation && "px-0.5",
                                        fontClass,
                                        fontSizeClass,
                                        playMode === "sentence" && "cursor-pointer",
                                    )}
                                    style={translationSentenceTextStyle}
                                >
                                        {renderSentencePlaybackContent(
                                            entry.unit,
                                            entry.unitIndex,
                                            entry.hasUsableAnalysis && entry.expanded ? (
                                                <InlineGrammarHighlights
                                                    text={analysisSentence.sentence}
                                                    sentences={[{
                                                        sentence: analysisSentence.sentence,
                                                        translation: resolvedAnalysisTranslation,
                                                        highlights: analysisSentence.highlights,
                                                    }]}
                                                    ragAppliedWords={ragAppliedWords}
                                                    displayMode={grammarDisplayMode}
                                                    showSegmentTranslation
                                                />
                                            ) : (
                                                inlinePhraseSentenceNode ?? entry.unit.text
                                            ),
                                        )}
                                    </div>
                                    {showTranslation && !shouldHidePlainTranslation && unitTranslation
                                        ? renderTranslationAside(
                                            unitTranslation,
                                            phraseDisplayMode === "capsule" ? phraseTranslations : [],
                                            phraseDisplayMode === "capsule"
                                                ? (item, event) => handlePhraseTranslationClick(item, event, entry.unit.text)
                                                : undefined,
                                            undefined,
                                            translationTextClassName,
                                        )
                                        : null}
                                    </div>
                                    <div
                                        data-sentence-action-rail="true"
                                        className={cn(
                                            "ml-1 flex shrink-0 flex-col items-center gap-1.5 self-start pt-0.5 transition-all duration-200",
                                            showTranslation && "ml-0 p-1.5 rounded-2xl",
                                            showTranslation && isSentencePlaybackActive(entry.unitIndex) && "reading-apple-inset shadow-[0_6px_20px_rgba(28,25,23,0.04)]",
                                        )}
                                    >
                                        <button
                                            type="button"
                                            aria-label={`播放第 ${index + 1} 句`}
                                            title={`播放第 ${index + 1} 句`}
                                            className={cn(
                                                "reading-apple-capsule reading-play-button inline-flex h-7 w-7 items-center justify-center bg-white dark:bg-stone-900 transition-colors shadow-sm",
                                                isSentencePlaybackActive(entry.unitIndex)
                                                    ? "border-amber-300/80 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800/80 text-amber-600 dark:text-amber-400 font-medium"
                                                    : "border-stone-200 dark:border-stone-800 text-stone-400 dark:text-stone-500 hover:border-amber-300 hover:text-amber-600 hover:bg-stone-50/50 dark:hover:bg-stone-800/50",
                                            )}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                handleSentencePlaybackTrigger(entry.unitIndex);
                                            }}
                                        >
                                            {isSentenceAudioLoading && isSentencePlaybackActive(entry.unitIndex) ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
                                            ) : isSentencePlaying && isSentencePlaybackActive(entry.unitIndex) ? (
                                                <Pause className="h-3.5 w-3.5" strokeWidth={1.8} />
                                            ) : (
                                                <Play className="h-3.5 w-3.5" strokeWidth={1.8} />
                                            )}
                                        </button>
                                        {isSentencePlaybackActive(entry.unitIndex) && (isSentencePlaying || sentenceCurrentTimeMs > 0) ? (
                                            <>
                                                <div className="w-3.5 border-t border-stone-200/50 dark:border-stone-800/50 my-0.5" />
                                                <div
                                                    data-sentence-playback-secondary-controls="true"
                                                    className="flex flex-col gap-1.5"
                                                >
                                                    {isSentencePlaying ? (
                                                        <button
                                                            type="button"
                                                            aria-label={`第 ${index + 1} 句切换倍速`}
                                                            title="切换倍速"
                                                            className="reading-apple-capsule reading-play-button inline-flex h-7 w-7 items-center justify-center border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-[9px] font-semibold tracking-tighter text-stone-500 dark:text-stone-400 shadow-sm transition-colors hover:border-amber-300 hover:text-amber-600 hover:bg-stone-50/50 dark:hover:bg-stone-800/50"
                                                            onClick={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                const rates = [1, 0.75, 0.5];
                                                                const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
                                                                setPlaybackRate(nextRate);
                                                            }}
                                                        >
                                                            {playbackRate}x
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        aria-label={`取消第 ${index + 1} 句播放`}
                                                        title="取消当前句播放"
                                                        className="reading-apple-capsule reading-play-button inline-flex h-7 w-7 items-center justify-center border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-400 dark:text-stone-500 shadow-sm transition-colors hover:border-rose-300 hover:text-rose-500 hover:bg-stone-50/50 dark:hover:bg-stone-800/50"
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            stopSentencePlayback();
                                                            setPlayMode("full");
                                                        }}
                                                    >
                                                        <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                                                    </button>
                                                </div>
                                            </>
                                        ) : null}
                                        {isSentencePlaybackActive(entry.unitIndex) && entry.hasUsableAnalysis && (
                                            <div className="w-3.5 border-t border-stone-200/50 dark:border-stone-800/50 my-0.5" />
                                        )}
                                        {entry.hasUsableAnalysis ? (
                                            <button
                                                type="button"
                                                aria-label={`重新生成第 ${index + 1} 句解析`}
                                                title="重新生成这一句的解析"
                                                className="reading-apple-capsule reading-play-button inline-flex h-7 w-7 items-center justify-center border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-400 dark:text-stone-500 shadow-sm transition-colors hover:border-amber-300 hover:text-amber-600 hover:bg-stone-50/50 dark:hover:bg-stone-800/50"
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    queueGrammarSentence(entry.unitIndex, { forceRegenerate: true });
                                                }}
                                            >
                                                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                                {entry.error ? (
                                    <div className="mt-1 flex items-center gap-2 text-xs text-rose-600">
                                        <span>{entry.error}</span>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-2 py-0.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50"
                                            onClick={() => queueGrammarSentence(entry.unitIndex, { forceRegenerate: true })}
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                            重试
                                        </button>
                                    </div>
                                ) : null}
                                {!entry.error && entry.hasUsableAnalysis && resolvedAnalysisTranslation && entry.expanded
                                    ? renderSentenceTranslationLine(
                                        resolvedAnalysisTranslation,
                                        translationTextClassName,
                                    )
                                    : null}
                            </div>
                        </li>
                    );
                })}
            </ul>
        );
    }

    const handleAskInlineCodeVocabAction = useCallback(async (rawText: string) => {
        const word = rawText
            .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
            .replace(/\s+/g, " ")
            .trim();
        if (!word) {
            throw new Error("Empty vocab text");
        }

        const wordKey = normalizeWordKey(word);
        const existing = await db.vocabulary.where("word_key").equals(wordKey).first();
        if (existing) {
            return "exists" as const;
        }

        const now = Date.now();
        const base = createEmptyCard(word, now);
        const card: VocabItem = {
            word,
            definition: "",
            translation: "",
            context: text,
            example: "",
            source_kind: "read",
            source_label: defaultVocabSourceLabel("read"),
            source_sentence: text,
            source_note: "从 AskAI 回答中的词汇/搭配词块加入",
            timestamp: base.timestamp ?? now,
            stability: base.stability ?? 0,
            difficulty: base.difficulty ?? 0,
            elapsed_days: base.elapsed_days ?? 0,
            scheduled_days: base.scheduled_days ?? 0,
            reps: base.reps ?? 0,
            lapses: base.lapses ?? 0,
            learning_steps: base.learning_steps ?? 0,
            state: base.state ?? 0,
            last_review: base.last_review ?? 0,
            due: base.due ?? now,
        };

        await saveVocabulary(card);
        return "saved" as const;
    }, [text]);

    const handleSavePhraseToVocab = useCallback(async (
        phrase: string,
        translationText: string,
        sentenceContext: string,
    ) => {
        const normalizedPhrase = phrase.trim().replace(/\s+/g, " ");
        const stateKey = `${sentenceContext}::${normalizedPhrase}`;
        if (!normalizedPhrase) return;

        setHoveredPhraseSaveState((prev) => ({ ...prev, [stateKey]: "saving" }));
        try {
            const wordKey = normalizeWordKey(normalizedPhrase);
            const existing = await db.vocabulary.where("word_key").equals(wordKey).first();
            if (existing) {
                setHoveredPhraseSaveState((prev) => ({ ...prev, [stateKey]: "exists" }));
                return;
            }

            const now = Date.now();
            const base = createEmptyCard(normalizedPhrase, now);
            const card: VocabItem = {
                word: normalizedPhrase,
                definition: "",
                translation: translationText,
                context: text,
                example: "",
                source_kind: "read",
                source_label: defaultVocabSourceLabel("read"),
                source_sentence: sentenceContext,
                source_note: articleTitle || "从阅读短语提示加入",
                timestamp: base.timestamp ?? now,
                stability: base.stability ?? 0,
                difficulty: base.difficulty ?? 0,
                elapsed_days: base.elapsed_days ?? 0,
                scheduled_days: base.scheduled_days ?? 0,
                reps: base.reps ?? 0,
                lapses: base.lapses ?? 0,
                learning_steps: base.learning_steps ?? 0,
                state: base.state ?? 0,
                last_review: base.last_review ?? 0,
                due: base.due ?? now,
            };

            await saveVocabulary(card);
            setHoveredPhraseSaveState((prev) => ({ ...prev, [stateKey]: "saved" }));
        } catch (error) {
            console.error("Failed to save phrase from translation hover card:", error);
            setHoveredPhraseSaveState((prev) => ({ ...prev, [stateKey]: "error" }));
        }
    }, [articleTitle, text]);

    const renderAskMarkdown = (content: string) => (
        <AiRichMarkdown content={content} onInlineCodeVocabAction={handleAskInlineCodeVocabAction} />
    );

    const syncReadingBalance = async (payload: unknown, fallbackAction?: ReadingEconomyAction) => {
        const readingCoins = (payload as {
            readingCoins?: {
                balance?: unknown;
                delta?: unknown;
                applied?: unknown;
                action?: unknown;
            };
        } | null)?.readingCoins;
        if (!readingCoins) return;

        if (typeof readingCoins.balance === "number" && Number(readingCoins.delta ?? 0) !== 0) {
            await applyServerProfilePatchToLocal({ reading_coins: readingCoins.balance });
        }

        const delta = Number(readingCoins.delta ?? 0);
        const action = typeof readingCoins.action === "string"
            ? readingCoins.action
            : fallbackAction;
        const applied = readingCoins.applied !== false;

        if (applied && Number.isFinite(delta) && delta !== 0 && action) {
            dispatchReadingCoinFx({ delta, action: action as ReadingEconomyAction });
        }
    };

    const readEconomyContext = (action: string, dedupeSuffix?: string | null) => ({
        scene: "read",
        action,
        articleUrl,
        ...(dedupeSuffix
            ? { dedupeKey: `${action}:${sessionUser?.id || "anon"}:${articleUrl || articleTitle || "article"}:${index}:${dedupeSuffix}` }
            : {}),
    });

    const normalizedReadingNotes = useMemo(() => (
        readingNotes
            .filter((note) => Number.isFinite(note.start_offset) && Number.isFinite(note.end_offset) && note.end_offset > note.start_offset)
            .slice()
            .sort((a, b) => a.start_offset - b.start_offset)
    ), [readingNotes]);

    const selectionQaPairs = useMemo(
        () => buildAskQaPairs(
            selectionAskMessages,
            selectionAskStreamingContent,
            isSelectionAskLoading,
            selectionAskStreamingReasoningContent,
        ),
        [isSelectionAskLoading, selectionAskMessages, selectionAskStreamingContent, selectionAskStreamingReasoningContent],
    );

    const buildAskContextAttachment = useCallback((
        kind: AskContextAttachment["kind"],
        targetText: string,
        offsets: { startOffset: number; endOffset: number },
    ): AskContextAttachment => {
        const trimmed = targetText.trim().replace(/\s+/g, " ");
        const excerpt = trimmed.length > 180 ? `${trimmed.slice(0, 180)}...` : trimmed;
        const label = kind === "paragraph"
            ? "整段上下文"
            : kind === "sentence"
                ? "句子上下文"
                : "选中文本";
        return {
            id: `ask-context:p${paragraphOrder}:${offsets.startOffset}-${offsets.endOffset}`,
            kind,
            label,
            rangeLabel: `第 ${paragraphOrder} 段`,
            text: trimmed,
            excerpt,
            paragraphRanges: [{
                paragraphOrder,
                paragraphBlockIndex: index,
                startOffset: offsets.startOffset,
                endOffset: offsets.endOffset,
                text: trimmed,
                paragraphText: text,
            }],
        };
    }, [index, paragraphOrder, text]);

    const injectAskContextAttachment = useCallback((attachment: AskContextAttachment, options?: {
        rect?: DOMRect | null;
        openLocalDock?: boolean;
    }) => {
        const resolvedAttachment = onOpenAskWithContext?.(attachment) ?? attachment;
        if (!resolvedAttachment) return null;

        const ownRange = resolvedAttachment.paragraphRanges.find((range) => range.paragraphOrder === paragraphOrder);
        const targetOffsets = ownRange
            ? { startOffset: ownRange.startOffset, endOffset: ownRange.endOffset }
            : { startOffset: 0, endOffset: text.length };
        const targetText = resolvedAttachment.kind === "paragraph"
            ? text
            : ownRange?.text ?? resolvedAttachment.text;

        setSelectedText(targetText);
        setSelectionOffsets(targetOffsets);
        setSelectionAskContextAttachment(resolvedAttachment);
        setIsSelectionAskContextCleared(false);
        setPhraseAnalysis(null);
        setIsNoteComposerOpen(false);
        setNoteDraft("");
        setSelectionAskQuestion("");
        setSelectionAskStreamingContent("");
        setSelectionAskStreamingReasoningContent("");
        setIsSelectionAskLoading(false);
        setReadingCoinHint(null);

        if (options?.openLocalDock) {
            setSelectionRect(options.rect ?? pRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1));
            setSelectionPopupMode("ask");
            setSelectionAskAutoOpenToken(Date.now());
        }

        return resolvedAttachment;
    }, [onOpenAskWithContext, paragraphOrder, text]);

    const findAskNoteByOffsets = useCallback((startOffset: number, endOffset: number) => (
        normalizedReadingNotes.find((note) =>
            note.mark_type === "ask"
            && note.start_offset === startOffset
            && note.end_offset === endOffset,
        ) ?? null
    ), [normalizedReadingNotes]);

    const persistAskThreadForSelection = useCallback(async (
        nextMessages: AskThreadMessage[],
        offsets?: { startOffset: number; endOffset: number } | null,
        explicitSelectedText?: string | null,
        explicitContextAttachment?: AskContextAttachment | null,
    ) => {
        if (!onCreateReadingNote) return;
        const targetOffsets = offsets ?? selectionOffsets;
        if (!targetOffsets) return;

        const sourceText = (explicitSelectedText ?? selectedText ?? "").trim();
        if (!sourceText) return;
        const contextAttachment = explicitContextAttachment
            ?? (!isSelectionAskContextCleared ? selectionAskContextAttachment : null)
            ?? (!isSelectionAskContextCleared ? buildAskContextAttachment("selection", sourceText, targetOffsets) : null);
        const encodedPayload = encodeAskThreadPayload(nextMessages, undefined, contextAttachment ?? undefined);

        if (contextAttachment?.kind === "cross_paragraph" && contextAttachment.paragraphRanges.length > 1) {
            await Promise.all(contextAttachment.paragraphRanges.map((range) => onCreateReadingNote({
                paragraphOrder: range.paragraphOrder,
                paragraphBlockIndex: range.paragraphBlockIndex,
                selectedText: range.text,
                noteText: encodedPayload,
                markType: "ask",
                startOffset: range.startOffset,
                endOffset: range.endOffset,
            })));
            return;
        }

        await onCreateReadingNote({
            paragraphOrder,
            paragraphBlockIndex: index,
            selectedText: sourceText,
            noteText: encodedPayload,
            markType: "ask",
            startOffset: targetOffsets.startOffset,
            endOffset: targetOffsets.endOffset,
        });
    }, [
        index,
        onCreateReadingNote,
        paragraphOrder,
        selectedText,
        selectionOffsets,
        selectionAskContextAttachment,
        isSelectionAskContextCleared,
        buildAskContextAttachment,
    ]);

    const openAskThreadFromNote = useCallback((note: ReadingNoteItem, anchorRect?: DOMRect) => {
        const thread = decodeAskThreadPayload(note.note_text);
        setSelectionRect(anchorRect ?? null);
        setSelectedText(note.selected_text || text.slice(note.start_offset, note.end_offset));
        setSelectionOffsets({
            startOffset: note.start_offset,
            endOffset: note.end_offset,
        });
        setSelectionPopupMode("ask-replay");
        setSelectionAskContextAttachment(thread.contextAttachment ?? buildAskContextAttachment("selection", note.selected_text || text.slice(note.start_offset, note.end_offset), {
            startOffset: note.start_offset,
            endOffset: note.end_offset,
        }));
        setIsSelectionAskContextCleared(false);
        setPhraseAnalysis(null);
        setIsNoteComposerOpen(false);
        setNoteDraft("");
        setSelectionAskQuestion("");
        setSelectionAskStreamingContent("");
        setSelectionAskMessages(thread.messages);
        setSelectionAskAutoOpenToken((prev) => prev + 1);
        setHoveredReadingNote(null);
    }, [buildAskContextAttachment, text]);

    const triggerAskReplayFromMarker = useCallback((note: ReadingNoteItem, anchorRect: DOMRect) => {
        if (askReplayOpenTimeoutRef.current !== null) {
            window.clearTimeout(askReplayOpenTimeoutRef.current);
        }
        setPressedAskNoteId(note.id ?? null);
        setHoveredReadingNote(null);
        askReplayOpenTimeoutRef.current = window.setTimeout(() => {
            setPressedAskNoteId(null);
            openAskThreadFromNote(note, anchorRect);
            askReplayOpenTimeoutRef.current = null;
        }, 110);
    }, [openAskThreadFromNote]);

    const selectionOverlapState = useMemo(() => {
        if (!selectionOffsets) {
            return {
                hasHighlight: false,
                hasUnderline: false,
                note: null as ReadingNoteItem | null,
            };
        }

        const hasHighlight = normalizedReadingNotes.some((note) =>
            note.mark_type === "highlight"
            && isRangeOverlapping(selectionOffsets.startOffset, selectionOffsets.endOffset, note.start_offset, note.end_offset),
        );
        const hasUnderline = normalizedReadingNotes.some((note) =>
            note.mark_type === "underline"
            && isRangeOverlapping(selectionOffsets.startOffset, selectionOffsets.endOffset, note.start_offset, note.end_offset),
        );
        const note = normalizedReadingNotes.find((note) =>
            note.mark_type === "note"
            && isRangeOverlapping(selectionOffsets.startOffset, selectionOffsets.endOffset, note.start_offset, note.end_offset),
        ) || null;

        return { hasHighlight, hasUnderline, note };
    }, [normalizedReadingNotes, selectionOffsets]);

    const getSelectionOffsets = (range: Range) => {
        if (!pRef.current) return null;
        if (!pRef.current.contains(range.commonAncestorContainer)) return null;

        let startOffset = 0;
        let endOffset = 0;
        let selectedTextContent = "";

        if (isReadingLayoutMode) {
            const resolveSegmentBoundary = (
                segmentEl: HTMLElement,
                boundaryContainer: Node,
                boundaryOffset: number,
                edge: "start" | "end",
            ) => {
                const contentEl = segmentEl.querySelector("[data-segment-content='true']") as HTMLElement | null;
                const targetNode = contentEl || segmentEl;
                const segmentTextLength = (targetNode.textContent || "").length;

                if (!targetNode.contains(boundaryContainer)) {
                    return edge === "start" ? 0 : segmentTextLength;
                }

                const localRange = document.createRange();
                localRange.selectNodeContents(targetNode);
                try {
                    localRange.setEnd(boundaryContainer, boundaryOffset);
                } catch {
                    return edge === "start" ? 0 : segmentTextLength;
                }

                const localOffset = localRange.cloneContents().textContent?.length || 0;
                return Math.max(0, Math.min(segmentTextLength, localOffset));
            };

            const startHost = range.startContainer.nodeType === Node.ELEMENT_NODE
                ? range.startContainer as Element
                : range.startContainer.parentElement;
            const endHost = range.endContainer.nodeType === Node.ELEMENT_NODE
                ? range.endContainer as Element
                : range.endContainer.parentElement;

            const startSegment = startHost?.closest("[data-reading-layout-segment='true']") as HTMLElement | null;
            const endSegment = endHost?.closest("[data-reading-layout-segment='true']") as HTMLElement | null;

            if (startSegment && endSegment) {
                const startBase = Number.parseInt(startSegment.dataset.segmentStart || "", 10);
                const endBase = Number.parseInt(endSegment.dataset.segmentStart || "", 10);

                if (Number.isFinite(startBase) && Number.isFinite(endBase)) {
                    const startLocal = resolveSegmentBoundary(startSegment, range.startContainer, range.startOffset, "start");
                    const endLocal = resolveSegmentBoundary(endSegment, range.endContainer, range.endOffset, "end");

                    startOffset = startBase + startLocal;
                    endOffset = endBase + endLocal;
                    
                    if (endOffset > startOffset && text) {
                        selectedTextContent = text.substring(startOffset, endOffset);
                    }
                }
            }
        } 
        
        // If not reading layout mode, or if reading layout mode resolution failed
        if (endOffset <= startOffset) {
            const prefixRange = range.cloneRange();
            prefixRange.selectNodeContents(pRef.current);
            prefixRange.setEnd(range.startContainer, range.startOffset);
            
            startOffset = prefixRange.cloneContents().textContent?.length || 0;
            selectedTextContent = range.cloneContents().textContent || "";
            endOffset = startOffset + selectedTextContent.length;
        }

        // Trim leading and trailing whitespace from the selection offsets bounds
        const matchLeading = selectedTextContent.match(/^\s+/);
        const matchTrailing = selectedTextContent.match(/\s+$/);
        const coreLength = selectedTextContent.trim().length;

        if (matchLeading && coreLength > 0) {
            startOffset += matchLeading[0].length;
        }
        if (matchTrailing && coreLength > 0) {
            endOffset -= matchTrailing[0].length;
        }

        if (coreLength === 0 || endOffset <= startOffset) return null;

        return { startOffset, endOffset };
    };

    const handleCreateReadingMark = async (markType: ReadingMarkType, noteText?: string) => {
        if (showGrammar) return;
        if (!onCreateReadingNote || !selectedText || !selectionOffsets) return;
        if (markType === "note" && !noteText?.trim()) return;

        setIsSavingReadingNote(true);
        try {
            await onCreateReadingNote({
                paragraphOrder,
                paragraphBlockIndex: index,
                selectedText,
                noteText: noteText?.trim(),
                markType,
                startOffset: selectionOffsets.startOffset,
                endOffset: selectionOffsets.endOffset,
            });
            closePhraseAnalysis();
        } catch (error) {
            console.error("Failed to create reading mark:", error);
        } finally {
            setIsSavingReadingNote(false);
        }
    };

    const handleDeleteReadingMark = async (markType: ReadingMarkType) => {
        if (showGrammar) return;
        if (!onDeleteReadingMarks || !selectionOffsets) return;

        setIsSavingReadingNote(true);
        try {
            await onDeleteReadingMarks({
                paragraphOrder,
                paragraphBlockIndex: index,
                markType,
                startOffset: selectionOffsets.startOffset,
                endOffset: selectionOffsets.endOffset,
            });
            closePhraseAnalysis();
        } catch (error) {
            console.error("Failed to delete reading marks:", error);
        } finally {
            setIsSavingReadingNote(false);
        }
    };

    const handleSelection = () => {
        const selection = window.getSelection();
        const isSelectionAskDockOpen = Boolean(selectionRect)
            && (selectionPopupMode === "ask" || selectionPopupMode === "ask-replay");
        const activeAskAttachment = !isSelectionAskContextCleared
            ? selectionAskContextAttachment
            : null;
        const hasVisibleAskThread = selectionAskMessages.length > 0
            || Boolean(selectionAskStreamingContent)
            || Boolean(selectionAskStreamingReasoningContent)
            || Boolean(activeAskAttachment);

        // If no selection or collapsed
        if (!selection || selection.isCollapsed) {
            if (isSelectionAskDockOpen) {
                return;
            }
            // Only clear if we are NOT currently viewing an analysis
            if (!phraseAnalysis && !isAnalyzingPhrase) {
                closePhraseAnalysis();
            }
            return;
        }

        const selectedStr = selection.toString().trim();
        if (selectedStr.length < 2) return;

        // Check if selection is within this paragraph
        if (!pRef.current?.contains(selection.anchorNode)) return;

        const range = selection.getRangeAt(0);
        const offsets = getSelectionOffsets(range);
        if (!offsets) return;
        const rect = range.getBoundingClientRect();
        const nextAttachment = buildAskContextAttachment("selection", selectedStr, offsets);

        // Pin the currently open AskAI panel (if any) so it stays visible
        // while the user works with the new selection.
        if (
            isSelectionAskDockOpen
            && !hasActiveAskDock
            && hasVisibleAskThread
            && selectionRect
            && selectedText
            && selectionOffsets
            && (selectionPopupMode === "ask" || selectionPopupMode === "ask-replay")
        ) {
            setPinnedAsk({
                rect: selectionRect,
                text: selectedText,
                offsets: selectionOffsets,
                mode: selectionPopupMode,
                messages: selectionAskMessages,
                streamingContent: selectionAskStreamingContent,
                streamingReasoningContent: selectionAskStreamingReasoningContent,
                isLoading: false,
                autoOpenToken: selectionAskAutoOpenToken,
            });
        }

        setSelectionRect(rect);
        setSelectedText(selectedStr);
        setSelectionOffsets(offsets);
        setSelectionPopupMode("selection");
        setPhraseAnalysis(null);
        const overlapNote = normalizedReadingNotes.find((note) =>
            note.mark_type === "note"
            && isRangeOverlapping(offsets.startOffset, offsets.endOffset, note.start_offset, note.end_offset),
        );
        const existingAskNote = findAskNoteByOffsets(offsets.startOffset, offsets.endOffset);
        const existingAskThread = decodeAskThreadPayload(existingAskNote?.note_text);
        setIsNoteComposerOpen(Boolean(overlapNote));
        setNoteDraft(overlapNote?.note_text || "");
        setSelectionAskQuestion("");
        setSelectionAskStreamingContent("");
        setSelectionAskMessages(existingAskThread?.messages ?? []);
        setSelectionAskContextAttachment(existingAskThread?.contextAttachment ?? nextAttachment);
        setIsSelectionAskContextCleared(false);
        setSelectionAskAutoOpenToken(0);

        // DO NOT modify DOM for multi-select to avoid breaking native selection behavior
        // Just rely on native blue selection
    };

    const handleAnalyzePhrase = async () => {
        if (!selectedText) return;

        setIsAnalyzingPhrase(true);
        setReadingCoinHint(null);

        try {
            const res = await fetch("/api/ai/analyze-phrase", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text,
                    selection: selectedText,
                    economyContext: readEconomyContext("analyze_phrase", selectedText.slice(0, 42).toLowerCase()),
                }),
            });
            const data = await res.json();
            if (!res.ok && data?.errorCode === INSUFFICIENT_READING_COINS) {
                setReadingCoinHint("当前暂时无法解读，请稍后重试。");
                return;
            }
            await syncReadingBalance(data, "analyze_phrase");
            setPhraseAnalysis(data); // Store the full JSON object
            
            // Persist the analysis as a Reading Mark
            if (onCreateReadingNote && selectedText && selectionOffsets) {
                try {
                    await handleCreateReadingMark("analyze", JSON.stringify(data));
                } catch (e) {
                    console.error("Failed to automatically save analysis:", e);
                }
            }
        } catch (err) {
            console.error(err);
            setPhraseAnalysis({ translation: "Failed to analyze. Please try again." });
        } finally {
            setIsAnalyzingPhrase(false);
        }
    };

    const handleLookupSelectedText = useCallback(() => {
        const normalizedSelectedText = selectedText?.trim().replace(/\s+/g, " ") || "";
        if (!normalizedSelectedText || normalizedSelectedText.length < 2 || !selectionRect || !onOpenWordPopupFromSelection) {
            return;
        }

        onOpenWordPopupFromSelection({
            word: normalizedSelectedText,
            context: text,
            x: selectionRect.left + (selectionRect.width / 2),
            y: selectionRect.bottom,
            articleUrl,
            sourceKind: "read",
            sourceLabel: "来自 Read",
            sourceSentence: text,
            sourceNote: articleTitle || "",
        });
        closePhraseAnalysis();
    }, [
        articleTitle,
        articleUrl,
        onOpenWordPopupFromSelection,
        selectedText,
        selectionRect,
        text,
    ]);

    const handlePhraseTranslationClick = useCallback((
        item: { source: string; translation: string },
        event: React.MouseEvent<HTMLButtonElement>,
        sentenceContext?: string,
    ) => {
        if (!onOpenWordPopupFromSelection) return;
        const targetRect = event.currentTarget.getBoundingClientRect();
        const normalizedSource = item.source.trim().replace(/\s+/g, " ");
        if (!normalizedSource) return;

        onOpenWordPopupFromSelection({
            word: normalizedSource,
            context: sentenceContext?.trim() || text,
            x: targetRect.left + (targetRect.width / 2),
            y: targetRect.bottom,
            articleUrl,
            sourceKind: "read",
            sourceLabel: "来自 Read",
            sourceSentence: sentenceContext?.trim() || text,
            sourceNote: articleTitle || "",
            initialDefinition: buildPhraseInitialDefinition(item),
        });
    }, [articleTitle, articleUrl, onOpenWordPopupFromSelection, text]);

    const openPhraseHoverCard = useCallback((hoverKey: string) => {
        if (phraseHoverCloseTimerRef.current !== null) {
            window.clearTimeout(phraseHoverCloseTimerRef.current);
            phraseHoverCloseTimerRef.current = null;
        }
        setHoveredPhraseKey(hoverKey);
    }, []);

    const schedulePhraseHoverClose = useCallback((hoverKey: string) => {
        if (phraseHoverCloseTimerRef.current !== null) {
            window.clearTimeout(phraseHoverCloseTimerRef.current);
        }
        phraseHoverCloseTimerRef.current = window.setTimeout(() => {
            setHoveredPhraseKey((current) => (current === hoverKey ? null : current));
            phraseHoverCloseTimerRef.current = null;
        }, 140);
    }, []);

    const closePhraseAnalysis = () => {
        setSelectionRect(null);
        setSelectedText(null);
        setSelectionOffsets(null);
        setSelectionPopupMode("selection");
        setSelectionAskQuestion("");
        setSelectionAskMessages([]);
        setSelectionAskStreamingContent("");
        setIsSelectionAskLoading(false);
        setSelectionAskAutoOpenToken(0);
        setSelectionAskContextAttachment(null);
        setIsSelectionAskContextCleared(false);
        setPhraseAnalysis(null);
        setIsNoteComposerOpen(false);
        setNoteDraft("");
        window.getSelection()?.removeAllRanges();
    };

    const requestRewritePrompt = async (excludedSentences: string[]) => {
        setIsGeneratingRewritePrompt(true);
        setRewriteCycleHint(null);
        setRewriteScore(null);

        try {
            const res = await fetch("/api/ai/rewrite-practice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "generate",
                    paragraphText: text,
                    excludedSentences,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(typeof data?.error === "string" ? data.error : "Failed to generate rewrite prompt");
            }

            const prompt = data as RewritePracticePrompt;
            const selectedSentence = prompt.source_sentence_en?.trim();
            if (!selectedSentence) {
                throw new Error("No sentence selected for rewrite practice");
            }

            setRewritePrompt(prompt);
            setRewriteAttempt("");

            const seenSet = new Set(excludedSentences);
            const hasLooped = seenSet.size > 0 && seenSet.has(selectedSentence);
            if (hasLooped) {
                setSeenRewriteSentences([selectedSentence]);
                setRewriteCycleHint("本段句子已轮询完，已重新开始。");
            } else {
                setSeenRewriteSentences((prev) => {
                    if (prev.includes(selectedSentence)) return prev;
                    return [...prev, selectedSentence];
                });
            }
        } catch (err) {
            console.error(err);
            setRewritePrompt(null);
            setRewriteCycleHint("暂时无法生成仿写句，请稍后重试。");
        } finally {
            setIsGeneratingRewritePrompt(false);
        }
    };

    const closeRewritePractice = () => {
        setIsRewriteModeOpen(false);
        setRewritePrompt(null);
        setRewriteAttempt("");
        setRewriteScore(null);
        setSeenRewriteSentences([]);
        setRewriteCycleHint(null);
    };

    const handleShuffleRewriteSentence = async () => {
        if (isGeneratingRewritePrompt) return;
        await requestRewritePrompt(seenRewriteSentences);
    };

    const navigateToRewriteScorePage = (payload: {
        scoredAt: string;
        articleTitle?: string;
        articleUrl?: string;
        paragraphOrder: number;
        source_sentence_en: string;
        imitation_prompt_cn: string;
        pattern_focus_cn: string;
        rewrite_tips_cn: string[];
        user_rewrite_en: string;
        score: RewritePracticeScore;
    }) => {
        if (typeof window === "undefined") return;
        const reviewId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        try {
            window.sessionStorage.setItem(`rewrite-score:${reviewId}`, JSON.stringify(payload));
            router.push(`/read/rewrite-score?id=${reviewId}`);
        } catch (error) {
            console.error("Failed to persist rewrite score payload:", error);
            router.push("/read/rewrite-score");
        }
    };

    const handleScoreRewrite = async () => {
        if (!rewritePrompt || !rewriteAttempt.trim()) return;

        setIsScoringRewrite(true);
        try {
            const res = await fetch("/api/ai/rewrite-practice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "score",
                    source_sentence_en: rewritePrompt.source_sentence_en,
                    imitation_prompt_cn: rewritePrompt.imitation_prompt_cn,
                    user_rewrite_en: rewriteAttempt,
                    strict_semantic_match: false,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(typeof data?.error === "string" ? data.error : "Failed to score rewrite practice");
            }
            const nextScore = data as RewritePracticeScore;
            setRewriteScore(nextScore);
            navigateToRewriteScorePage({
                scoredAt: new Date().toISOString(),
                articleTitle,
                articleUrl,
                paragraphOrder,
                source_sentence_en: rewritePrompt.source_sentence_en,
                imitation_prompt_cn: rewritePrompt.imitation_prompt_cn,
                pattern_focus_cn: rewritePrompt.pattern_focus_cn,
                rewrite_tips_cn: rewritePrompt.rewrite_tips_cn,
                user_rewrite_en: rewriteAttempt,
                score: nextScore,
            });
        } catch (err) {
            console.error(err);
            setRewriteScore({
                total_score: 0,
                dimension_scores: {
                    grammar: 0,
                    vocabulary: 0,
                    semantics: 0,
                    imitation: 0,
                },
                feedback_cn: "评分服务暂时不可用，请稍后再试。",
                better_version_en: "",
                copy_similarity: 0,
                copy_penalty_applied: false,
                improvement_points_cn: [],
            });
        } finally {
            setIsScoringRewrite(false);
        }
    };

    useEffect(() => {
        setIsRewriteModeOpen(false);
        setRewritePrompt(null);
        setRewriteAttempt("");
        setRewriteScore(null);
        setSeenRewriteSentences([]);
        setRewriteCycleHint(null);
    }, [text]);

    useEffect(() => {
        if (!isRewriteModeOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeRewritePractice();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isRewriteModeOpen]);

    const handleTranslate = async (forceRegenerate = false) => {
        const missingSentenceUnits = sentenceUnits.filter(
            (unit) => !effectiveSentenceTranslationLookup.has(sentenceIdentity(unit.text)),
        );
        const hasSentenceTranslations = effectiveSentenceTranslationLookup.size > 0;
        const hasCompleteSentenceTranslations = sentenceUnits.length > 0
            ? missingSentenceUnits.length === 0
            : hasSentenceTranslations;
        const hasAvailableStructuredTranslations = hasCompleteSentenceTranslations
            && sentenceUnits.length > 0
            && sentenceUnits.every((unit) => effectiveSentenceTranslationItemLookup.has(sentenceIdentity(unit.text)));

        if (!forceRegenerate && (translation || hasAvailableStructuredTranslations) && hasCompleteSentenceTranslations) {
            setShowTranslation(!showTranslation); // Toggle visibility
            return;
        }

        if (!forceRegenerate && showTranslation) {
            setShowTranslation(false);
            return;
        }

        setShowTranslation(true);
        setIsTranslating(true);
        setTranslationError(null);
        setReadingCoinHint(null);
        try {
            if (!forceRegenerate && hasAvailableStructuredTranslations && !translation) {
                const mergedSentenceTranslations = sentenceUnits
                    .map((unit) => {
                        const normalized = sentenceIdentity(unit.text);
                        const storedItem = effectiveSentenceTranslationItemLookup.get(normalized);
                        if (!storedItem?.translation) return null;
                        return {
                            sentence: unit.text.trim(),
                            translation: storedItem.translation,
                            phraseTranslations: storedItem.phraseTranslations ?? [],
                        };
                    })
                    .filter((item): item is NonNullable<typeof item> => Boolean(item));
                await setStoreTranslation(text, {
                    translation: mergedSentenceTranslations.map((item) => item.translation).join(""),
                    sentenceTranslations: mergedSentenceTranslations,
                });
                return;
            }
            const requestText = forceRegenerate || missingSentenceUnits.length === 0
                ? text
                : missingSentenceUnits.map((unit) => unit.text).join(" ").trim();
            const res = await fetch("/api/ai/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: requestText,
                    context: text,
                    economyContext: readEconomyContext("translate"),
                }),
            });
            const data = await res.json();
            if (!res.ok && data?.errorCode === INSUFFICIENT_READING_COINS) {
                setReadingCoinHint("当前暂时无法翻译，请稍后重试。");
                setShowTranslation(false);
                return;
            }
            if (!res.ok) {
                throw new Error(typeof data?.error === "string" ? data.error : "翻译生成失败，请稍后重试。");
            }
            await syncReadingBalance(data, "translate");
            const payload = data as TranslateApiResponse;
            const nextSentenceTranslations = normalizeSentenceTranslationItems(payload.sentenceTranslations);
            const mergedSentenceTranslationItemLookup = buildSentenceTranslationItemLookup([
                ...(forceRegenerate ? [] : sentenceTranslationItems),
                ...nextSentenceTranslations,
            ]);
            const mergedLookup = mergeSentenceTranslationLookups(
                forceRegenerate ? new Map<string, string>() : grammarSentenceTranslationLookup,
                forceRegenerate ? new Map<string, string>() : sentenceTranslationLookup,
                buildSentenceTranslationLookup(nextSentenceTranslations),
            );
            const mergedSentenceTranslations = sentenceUnits
                .map((unit) => {
                    const normalized = sentenceIdentity(unit.text);
                    const unitTranslation = mergedLookup.get(normalized);
                    if (!unitTranslation) return null;
                    const storedItem = mergedSentenceTranslationItemLookup.get(normalized);
                    return {
                        sentence: unit.text.trim(),
                        translation: unitTranslation,
                        phraseTranslations: storedItem?.phraseTranslations ?? [],
                    };
                })
                .filter((item): item is NonNullable<typeof item> => Boolean(item));

            const fullTranslation = typeof payload.translation === "string" ? payload.translation.trim() : "";
            const displaySentenceTranslations = sentenceUnits.length > 0 && mergedSentenceTranslations.length === 0 && fullTranslation
                ? buildFallbackSentenceTranslations(sentenceUnits, fullTranslation)
                : mergedSentenceTranslations;

            if (sentenceUnits.length > 0 && displaySentenceTranslations.length === 0) {
                setTranslationError("翻译暂时没有返回内容，请重试。");
                setShowTranslation(true);
                return;
            }
            await setStoreTranslation(text, {
                translation: fullTranslation || displaySentenceTranslations.map((item) => item.translation).join(""),
                sentenceTranslations: displaySentenceTranslations,
            });
        } catch (err) {
            console.error(err);
            setTranslationError(err instanceof Error ? err.message : "翻译生成失败，请稍后重试。");
            setShowTranslation(true);
        } finally {
            setIsTranslating(false);
        }
    };

    const flushQueuedGrammarSentences = useCallback(async (forceRegenerate = false) => {
        const pendingEntries = grammarSentenceEntries.filter((entry) => grammarSentenceQueueRef.current.has(entry.cacheKey));
        if (pendingEntries.length === 0) return;
        const pendingCacheKeys = new Set(pendingEntries.map((entry) => entry.cacheKey));

        pendingEntries.forEach((entry) => {
            grammarSentenceQueueRef.current.delete(entry.cacheKey);
            grammarSentenceInflightRef.current.add(entry.cacheKey);
        });
        setSentenceGrammarUi((prev) => {
            const next = { ...prev };
            for (const entry of pendingEntries) {
                next[entry.cacheKey] = {
                    cacheKey: entry.cacheKey,
                    sentence: entry.sentence,
                    analysis: prev[entry.cacheKey]?.analysis ?? entry.analysis ?? null,
                    error: null,
                    loading: true,
                    expanded: true,
                };
            }
            return next;
        });
        setIsAnalyzingGrammar(true);
        setReadingCoinHint(null);

        const requestKey = pendingEntries.map((entry) => entry.cacheKey).sort().join("|");
        const replayEntry = forceRegenerate ? null : grammarRequestReplayRef.current.get(requestKey);
        const now = Date.now();

        const runRequest = async () => {
            const response = await fetch("/api/ai/grammar/basic", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sentences: pendingEntries.map((entry) => entry.sentence),
                    forceRegenerate,
                    economyContext: readEconomyContext("grammar_basic", requestKey),
                }),
            });
            const payload = await response.json();

            if (!response.ok && payload?.errorCode === INSUFFICIENT_READING_COINS) {
                throw new Error("当前暂时无法进行语法分析，请稍后重试。");
            }
            if (!response.ok) {
                throw new Error(payload?.error || "语法分析暂时不可用");
            }

            return payload as GrammarBasicApiResponse;
        };

        let data: GrammarBasicApiResponse;
        let shouldApplyFreshEffects = false;

        if (replayEntry?.promise) {
            data = await replayEntry.promise;
        } else if (replayEntry && now - replayEntry.settledAt < GRAMMAR_RETRY_REPLAY_TTL_MS) {
            if (replayEntry.error) throw replayEntry.error;
            if (replayEntry.data) {
                data = replayEntry.data;
            } else {
                const requestPromise = runRequest();
                grammarRequestReplayRef.current.set(requestKey, { promise: requestPromise, settledAt: 0 });
                shouldApplyFreshEffects = true;
                data = await requestPromise;
                grammarRequestReplayRef.current.set(requestKey, { promise: null, settledAt: Date.now(), data });
            }
        } else {
            const requestPromise = runRequest();
            grammarRequestReplayRef.current.set(requestKey, { promise: requestPromise, settledAt: 0 });
            shouldApplyFreshEffects = true;
            try {
                data = await requestPromise;
                grammarRequestReplayRef.current.set(requestKey, { promise: null, settledAt: Date.now(), data });
            } catch (error) {
                const normalized = error instanceof Error ? error : new Error("语法分析暂时不可用");
                grammarRequestReplayRef.current.set(requestKey, { promise: null, settledAt: Date.now(), error: normalized });
                throw normalized;
            }
        }

        if (shouldApplyFreshEffects) {
            await syncReadingBalance(data, "grammar_basic");
        }

        const results = Array.isArray(data.results) ? data.results : [];
        await Promise.all(results.map(async (result) => {
            const resolvedData = result.data ?? result;
            if (result.cacheKey) {
                await setStoreGrammarAnalysis(result.cacheKey, resolvedData);
            }
        }));
        setSentenceGrammarUi((prev) => {
            const next = { ...prev };
            for (const entry of pendingEntries) {
                const result = results.find((item) => item.cacheKey === entry.cacheKey || item.sentence === entry.sentence);
                const resolvedData = (result?.data ?? result) as GrammarBasicCachePayload | undefined;
                next[entry.cacheKey] = {
                    cacheKey: entry.cacheKey,
                    sentence: entry.sentence,
                    analysis: resolvedData ?? prev[entry.cacheKey]?.analysis ?? null,
                    error: result?.error ?? null,
                    loading: false,
                    expanded: true,
                };
            }
            return next;
        });
        pendingEntries.forEach((entry) => grammarSentenceInflightRef.current.delete(entry.cacheKey));
        onSnapshotDirty?.();
        setIsAnalyzingGrammar(false);
        return;
    }, [grammarSentenceEntries, onSnapshotDirty, readEconomyContext, setStoreGrammarAnalysis]);

    const queueGrammarSentence = useCallback((sentenceIndex: number, options?: { forceRegenerate?: boolean }) => {
        const entry = grammarSentenceEntries[sentenceIndex];
        if (!entry) return;
        if (entry.loading || grammarSentenceInflightRef.current.has(entry.cacheKey)) return;

        if (entry.hasUsableAnalysis && !options?.forceRegenerate) {
            setSentenceGrammarUi((prev) => ({
                ...prev,
                [entry.cacheKey]: {
                    cacheKey: entry.cacheKey,
                    sentence: entry.sentence,
                    analysis: prev[entry.cacheKey]?.analysis ?? entry.analysis ?? null,
                    error: prev[entry.cacheKey]?.error ?? null,
                    loading: false,
                    expanded: !prev[entry.cacheKey]?.expanded,
                },
            }));
            return;
        }

        grammarSentenceQueueRef.current.add(entry.cacheKey);
        setSentenceGrammarUi((prev) => ({
            ...prev,
            [entry.cacheKey]: {
                cacheKey: entry.cacheKey,
                sentence: entry.sentence,
                analysis: prev[entry.cacheKey]?.analysis ?? entry.analysis ?? null,
                error: null,
                loading: false,
                expanded: true,
            },
        }));

        if (grammarSentenceTimerRef.current !== null) {
            window.clearTimeout(grammarSentenceTimerRef.current);
        }
        grammarSentenceTimerRef.current = window.setTimeout(() => {
            grammarSentenceTimerRef.current = null;
            const batchEntries = grammarSentenceEntries.filter((target) => (
                grammarSentenceQueueRef.current.has(target.cacheKey)
                || grammarSentenceInflightRef.current.has(target.cacheKey)
            ));
            void flushQueuedGrammarSentences(Boolean(options?.forceRegenerate)).catch((error) => {
                console.error(error);
                const message = error instanceof Error ? error.message : "语法分析暂时不可用，请稍后重试。";
                setReadingCoinHint(message);
                setSentenceGrammarUi((prev) => {
                    const next = { ...prev };
                    for (const target of batchEntries) {
                        next[target.cacheKey] = {
                            cacheKey: target.cacheKey,
                            sentence: target.sentence,
                            analysis: prev[target.cacheKey]?.analysis ?? target.analysis ?? null,
                            error: message,
                            loading: false,
                            expanded: true,
                        };
                        grammarSentenceInflightRef.current.delete(target.cacheKey);
                        grammarSentenceQueueRef.current.delete(target.cacheKey);
                    }
                    return next;
                });
                setIsAnalyzingGrammar(false);
            });
        }, GRAMMAR_SENTENCE_BATCH_WINDOW_MS);
    }, [flushQueuedGrammarSentences, grammarSentenceEntries]);

    const handleGrammarAnalysis = async () => {
        if (showGrammar) {
            setShowGrammar(false);
            return;
        }

        setShowGrammar(true);
        setGrammarDisplayMode("core");
        setSentenceGrammarUi((prev) => {
            const next = { ...prev };
            for (const entry of grammarSentenceEntries) {
                next[entry.cacheKey] = {
                    cacheKey: entry.cacheKey,
                    sentence: entry.sentence,
                    analysis: prev[entry.cacheKey]?.analysis ?? entry.analysis ?? null,
                    error: prev[entry.cacheKey]?.error ?? null,
                    loading: prev[entry.cacheKey]?.loading ?? false,
                    expanded: prev[entry.cacheKey]?.expanded ?? false,
                };
            }
            return next;
        });
    };

    const grammarModeLabel = grammarDisplayMode === "core" ? "主干视图" : "完整视图";
    const shouldRenderGrammarLayer = !highlightSnippet && (
        showGrammar || (showTranslation && sentenceUnits.length > 0)
    );
    const renderTranslationError = () => (
        translationError ? (
            <div
                data-translation-error="true"
                className={cn(
                    "my-2 px-4 py-3 text-sm leading-6 text-rose-700",
                    showTranslation ? "reading-apple-inset border-rose-200/80 bg-rose-50/80" : "rounded-[14px] border border-rose-200/80 bg-rose-50/80",
                )}
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{translationError}</span>
                    <button
                        type="button"
                        onClick={() => void handleTranslate(true)}
                        className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-rose-600 transition-colors hover:bg-white hover:text-rose-700",
                            showTranslation ? "reading-apple-capsule border-rose-200 bg-white/85" : "rounded-full border border-rose-200 bg-white/85",
                        )}
                    >
                        <RefreshCw className="h-3 w-3" />
                        重试翻译
                    </button>
                </div>
            </div>
        ) : null
    );
    const recallAskVocabulary = useCallback(async (questionText: string, selectionText: string) => {
        try {
            const result = await queryAskRelevantVocabulary({
                paragraph: text,
                question: questionText,
                selection: selectionText,
            });
            return result.vocabulary;
        } catch (error) {
            console.warn("Failed to recall ask vocab memory", error);
            return [];
        }
    }, [text]);

    const handleSegmentNumberClick = (index: number) => {
        const targetUnit = sentenceUnits[index];
        if (!targetUnit || !pRef.current) return;

        const layoutSegments = pRef.current.querySelectorAll('[data-reading-layout-segment="true"]');
        const targetSegment = layoutSegments[index];
        if (!targetSegment) return;
        const contentNode = targetSegment.querySelector('[data-segment-content="true"]');
        if (!contentNode) return;

        const range = document.createRange();
        range.selectNodeContents(contentNode);
        window.getSelection()?.removeAllRanges();

        const rect = range.getBoundingClientRect();
        const textStr = targetUnit.text.trim();
        const offsets = { startOffset: targetUnit.start, endOffset: targetUnit.end };

        setSelectedText(textStr);
        setSelectionOffsets(offsets);
        setSelectionRect(rect);

        const existingAskNote = findAskNoteByOffsets(offsets.startOffset, offsets.endOffset);
        const existingAskThread = decodeAskThreadPayload(existingAskNote?.note_text);
        const existingMessages = existingAskThread?.messages ?? [];
        const contextAttachment = existingAskThread?.contextAttachment ?? buildAskContextAttachment("sentence", textStr, offsets);
        const resolvedContextAttachment = onOpenAskWithContext?.(contextAttachment) ?? contextAttachment;

        setSelectionPopupMode("ask");
        setPhraseAnalysis(null);
        setSelectionAskQuestion("");
        setSelectionAskStreamingContent("");
        setSelectionAskStreamingReasoningContent("");
        setSelectionAskMessages(existingMessages);
        setSelectionAskContextAttachment(resolvedContextAttachment);
        setIsSelectionAskContextCleared(false);
        setIsSelectionAskLoading(false);
        setReadingCoinHint(null);
        setSelectionAskAutoOpenToken(Date.now());

        if (existingMessages.length > 0) {
            return;
        }

        const autoQuestion = "请翻译这句话，并解析它的核心语法结构与词汇搭配。";
        void handleSelectionAskAI(autoQuestion, textStr, offsets, existingMessages);
    };

    const handleInjectSentenceAskContext = useCallback((index: number) => {
        const targetUnit = sentenceUnits[index];
        if (!targetUnit) return;
        const layoutSegments = pRef.current?.querySelectorAll('[data-reading-layout-segment="true"]');
        const targetSegment = layoutSegments?.[index] as HTMLElement | undefined;
        const rect = targetSegment?.getBoundingClientRect() ?? pRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
        const textStr = targetUnit.text.trim();
        const offsets = { startOffset: targetUnit.start, endOffset: targetUnit.end };
        const attachment = buildAskContextAttachment("sentence", textStr, offsets);
        const resolvedAttachment = injectAskContextAttachment(attachment, {
            rect,
            openLocalDock: !hasActiveAskDock,
        });
        if (resolvedAttachment && hasActiveAskDock) {
            setSelectionRect(null);
            setSelectionPopupMode("selection");
        }
    }, [buildAskContextAttachment, hasActiveAskDock, injectAskContextAttachment, sentenceUnits]);

    const handleSelectionAskAI = async (
        overrideMessage?: string,
        overrideText?: string,
        overrideOffsets?: { startOffset: number; endOffset: number },
        overrideMessages?: AskThreadMessage[]
    ) => {
        const userMessage = (overrideMessage !== undefined ? overrideMessage : selectionAskQuestion).trim();
        if (!userMessage) return;

        const contextClearedForThisAsk = isSelectionAskContextCleared && !overrideText && !overrideOffsets;
        const targetText = contextClearedForThisAsk ? text : (overrideText ?? selectedText);
        const targetOffsets = contextClearedForThisAsk
            ? { startOffset: 0, endOffset: text.length }
            : (overrideOffsets ?? selectionOffsets);
        const baseMessages = overrideMessages ?? selectionAskMessages;
        const targetAttachment = contextClearedForThisAsk
            ? null
            : (selectionAskContextAttachment
                ?? (targetText && targetOffsets ? buildAskContextAttachment("selection", targetText, targetOffsets) : null));

        if (!targetText || !targetOffsets) {
            return;
        }

        const optimisticMessages: AskThreadMessage[] = [
            ...baseMessages,
            { role: "user", content: userMessage, createdAt: Date.now() },
        ];

        setSelectionAskMessages(optimisticMessages);
        setSelectionAskQuestion("");
        setIsSelectionAskLoading(true);
        setSelectionAskStreamingContent("");
        setSelectionAskStreamingReasoningContent("");
        setReadingCoinHint(null);

        try {
            await persistAskThreadForSelection(optimisticMessages, targetOffsets, targetText, targetAttachment);
        } catch (error) {
            console.error("Failed to persist ask user message:", error);
        }

        try {
            const retrievedVocab = await recallAskVocabulary(userMessage, targetText);
            const res = await fetch("/api/ai/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: targetAttachment
                        ? targetAttachment.paragraphRanges
                            .map((range) => `第 ${range.paragraphOrder} 段：${range.paragraphText || range.text}`)
                            .join("\n\n")
                        : text,
                    question: userMessage,
                    messages: optimisticMessages.map(m => ({ role: m.role, content: m.content })),
                    selection: targetAttachment ? targetText : "",
                    retrievedVocab,
                    answerMode: askAnswerMode,
                    askThinkingMode,
                    askReasoningEffort,
                    economyContext: readEconomyContext("ask_ai", (targetAttachment ? targetText : userMessage).slice(0, 42).toLowerCase()),
                }),
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                if (payload?.errorCode === INSUFFICIENT_READING_COINS) {
                    const insufficientMessage: AskThreadMessage = {
                        role: "assistant",
                        content: "当前暂时无法回答这个问题，请稍后重试。",
                        createdAt: Date.now(),
                    };
                    const insufficientMessages = [...optimisticMessages, insufficientMessage];
                    setReadingCoinHint("当前暂时无法 Ask AI，请稍后重试。");
                    setSelectionAskMessages(insufficientMessages);
                    await persistAskThreadForSelection(insufficientMessages, targetOffsets, targetText, targetAttachment);
                    return;
                }
                const failureContent = resolveAskFailureMessage(payload);
                const failureMessages: AskThreadMessage[] = [
                    ...optimisticMessages,
                    { role: "assistant", content: failureContent, createdAt: Date.now(), isError: true },
                ];
                if (isAskRateLimitPayload(payload)) {
                    console.warn("Ask AI temporarily rate limited:", payload);
                }
                setSelectionAskMessages(failureMessages);
                await persistAskThreadForSelection(failureMessages, targetOffsets, targetText, targetAttachment);
                return;
            }

            const readingBalanceHeader = res.headers.get("x-reading-coins-balance");
            const readingDeltaHeader = Number(res.headers.get("x-reading-coins-delta") ?? 0);
            const readingAppliedHeader = res.headers.get("x-reading-coins-applied") === "1";
            if (readingBalanceHeader) {
                const balanceValue = Number(readingBalanceHeader);
                if (Number.isFinite(balanceValue) && readingAppliedHeader && readingDeltaHeader !== 0) {
                    await applyServerProfilePatchToLocal({ reading_coins: balanceValue });
                }
            }
            const readingActionHeader = res.headers.get("x-reading-coins-action");
            if (readingAppliedHeader && Number.isFinite(readingDeltaHeader) && readingDeltaHeader !== 0 && readingActionHeader) {
                dispatchReadingCoinFx({
                    delta: readingDeltaHeader,
                    action: readingActionHeader as ReadingEconomyAction,
                });
            }

            const reader = res.body?.getReader();
            let fullContent = "";
            let fullReasoningContent = "";

            if (reader) {
                await readAskSseStream(reader, {
                    onContent: (content) => {
                        fullContent += content;
                        setSelectionAskStreamingContent(fullContent);
                    },
                    onReasoningContent: (content) => {
                        fullReasoningContent += content;
                        setSelectionAskStreamingReasoningContent(fullReasoningContent);
                    },
                });
            }

            const assistantMessageParts = resolveAskAssistantMessageParts(fullContent, fullReasoningContent);
            const finalizedMessages: AskThreadMessage[] = [
                ...optimisticMessages,
                {
                    role: "assistant",
                    ...assistantMessageParts,
                    createdAt: Date.now(),
                },
            ];

            setSelectionAskMessages(finalizedMessages);
            setSelectionAskStreamingContent("");
            setSelectionAskStreamingReasoningContent("");
            await persistAskThreadForSelection(finalizedMessages, targetOffsets, targetText, targetAttachment);
        } catch (error) {
            console.error(error);
            const failureMessages: AskThreadMessage[] = [
                ...optimisticMessages,
                { role: "assistant", content: "抱歉，出错了。请再试一次。", createdAt: Date.now(), isError: true },
            ];
            setSelectionAskMessages(failureMessages);
            setSelectionAskStreamingContent("");
            setSelectionAskStreamingReasoningContent("");
            try {
                await persistAskThreadForSelection(failureMessages, targetOffsets, targetText, targetAttachment);
            } catch (persistError) {
                console.error("Failed to persist ask failure message:", persistError);
            }
        } finally {
            setIsSelectionAskLoading(false);
        }
    };

    const findLastUserIndex = (list: AskThreadMessage[]): number => {
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].role === "user") return i;
        }
        return -1;
    };

    const handleRetrySelectionAskAI = async () => {
        if (isSelectionAskLoading) return;
        const lastUserIdx = findLastUserIndex(selectionAskMessages);
        if (lastUserIdx < 0) return;
        const lastUserMessage = selectionAskMessages[lastUserIdx].content;
        const trimmed = selectionAskMessages.slice(0, lastUserIdx);
        await handleSelectionAskAI(
            lastUserMessage,
            selectedText ?? undefined,
            selectionOffsets ?? undefined,
            trimmed,
        );
    };

    const openParagraphAskDock = useCallback(() => {
        const rect = pRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
        const offsets = { startOffset: 0, endOffset: text.length };
        const existingAskNote = findAskNoteByOffsets(offsets.startOffset, offsets.endOffset);
        const existingAskThread = decodeAskThreadPayload(existingAskNote?.note_text);
        const matchingExistingThread = askContextMatchesOffsets(existingAskThread?.contextAttachment, paragraphOrder, offsets)
            ? existingAskThread
            : null;
        const requestedAttachment = matchingExistingThread?.contextAttachment ?? buildAskContextAttachment("paragraph", text, offsets);
        const resolvedAttachment = injectAskContextAttachment(requestedAttachment, {
            rect,
            openLocalDock: !(hasActiveAskDock && !askContextAttachment),
        }) ?? requestedAttachment;
        if (hasActiveAskDock && !askContextAttachment) {
            setSelectionRect(null);
            setSelectionPopupMode("selection");
            return;
        }
        const ownRange = resolvedAttachment.paragraphRanges.find((range) => range.paragraphOrder === paragraphOrder);
        const selectedContextText = resolvedAttachment.kind === "paragraph" ? text : resolvedAttachment.text;
        const selectedContextOffsets = ownRange
            ? { startOffset: ownRange.startOffset, endOffset: ownRange.endOffset }
            : offsets;
        const resolvedMessages = askContextMatchesOffsets(matchingExistingThread?.contextAttachment, paragraphOrder, selectedContextOffsets)
            ? matchingExistingThread?.messages ?? []
            : [];

        setSelectedText(selectedContextText);
        setSelectionOffsets(selectedContextOffsets);
        setSelectionRect(rect);
        setSelectionPopupMode("ask");
        setPhraseAnalysis(null);
        setIsNoteComposerOpen(false);
        setNoteDraft("");
        setSelectionAskQuestion("");
        setSelectionAskStreamingContent("");
        setSelectionAskStreamingReasoningContent("");
        setSelectionAskMessages(resolvedMessages);
        setSelectionAskContextAttachment(resolvedAttachment);
        setIsSelectionAskContextCleared(false);
        setIsSelectionAskLoading(false);
        setReadingCoinHint(null);
        setSelectionAskAutoOpenToken(Date.now());
    }, [askContextAttachment, buildAskContextAttachment, findAskNoteByOffsets, hasActiveAskDock, injectAskContextAttachment, paragraphOrder, text]);

    // isSplitting ref to prevent race condition between onKeyDown (split) and onBlur (update)
    const isSplitting = useRef(false);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isEditMode && e.key === 'Enter' && !e.shiftKey && onSplit) {
            e.preventDefault();
            const selection = window.getSelection();
            if (!selection || !selection.rangeCount) return;

            const range = selection.getRangeAt(0);

            // Ensure we are inside this paragraph
            if (!pRef.current?.contains(range.commonAncestorContainer)) return;

            // Get text content before and after caret
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(pRef.current!);
            preCaretRange.setEnd(range.endContainer, range.endOffset);
            const textBefore = preCaretRange.toString();

            const postCaretRange = range.cloneRange();
            postCaretRange.selectNodeContents(pRef.current!);
            postCaretRange.setStart(range.endContainer, range.endOffset);
            const textAfter = postCaretRange.toString();

            isSplitting.current = true;
            onSplit(index, textBefore, textAfter);
        }
    };

    const handleBlur = () => {
        if (isSplitting.current) {
            isSplitting.current = false;
            return;
        }

        if (isEditMode && onUpdate && pRef.current) {
            const newText = pRef.current.innerText;
            if (newText !== text) {
                onUpdate(index, newText);
            }
        }
    };

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData("text/plain", index.toString());
        e.dataTransfer.effectAllowed = "move";
        // Optional: Set drag image
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (onMerge) {
            e.preventDefault(); // Allow drop
            e.dataTransfer.dropEffect = "move";
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"));
        if (!isNaN(sourceIndex) && onMerge && sourceIndex !== index) {
            onMerge(sourceIndex, index);
        }
    };

    // TED Video Sync: Check if this paragraph is currently active
    const isVideoActive = startTime !== undefined && endTime !== undefined && currentVideoTime !== undefined
        && currentVideoTime >= startTime && currentVideoTime < (endTime + 500); // Add small buffer

    const handleVideoSeek = () => {
        if (startTime !== undefined && onSeekToTime) {
            onSeekToTime(startTime);
        }
    };

    // If isEditMode is true, we use dangerouslySetInnerHTML to let the browser manage the editable content
    // and avoid React reconciliation issues (caret jumping, inability to type).
    // When switching out of edit mode, we render the complex interactive view.

    // Safety: Escape text for HTML
    const safeHtml = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

    // Focus Mode Class Logic
    const isLiquidFocus = isFocusMode && isFocusLocked;
    const getFocusClasses = () => {
        if (!isFocusMode) {
            // Default behavior (Focus Mode OFF)
            return isVideoActive
                ? "bg-red-50/40 rounded-lg -mx-4 px-4 py-3 shadow-sm ring-1 ring-red-100"
                : "transition-colors";
        }

        if (hasActiveFocusLock) {
            if (isFocusLocked) {
                return "reading-focus-liquid-card opacity-100 rounded-[2rem] -mx-3 py-7 pl-6 pr-16 z-20 my-5 sm:-mx-6 sm:py-8 sm:pl-8 sm:pr-20";
            }
            return "opacity-20 blur-[1px] grayscale transition-all duration-700 pointer-events-none";
        }

        return "opacity-60 hover:opacity-100 transition-all duration-500 py-2";
    }

    return (
        <div
            className={cn(
                "group relative transition-all duration-500 py-1",
                getFocusClasses()
            )}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={(e) => {
                // Prevent Focus Lock toggle if user is selecting text
                const selection = window.getSelection();
                if (selection && selection.toString().length > 0) {
                    return;
                }

                // Prevent Focus Lock toggle if clicking on interactive elements
                const target = e.target as HTMLElement;
                if (target.closest('.group\\/highlight') || target.closest('button') || target.closest('a') || target.closest('.cursor-help')) {
                    return;
                }

                if (onSetFocusLock && isFocusMode && !isFocusLocked) {
                    onSetFocusLock();
                }

                if (onSeekToTime) handleVideoSeek();
            }}
            style={{ cursor: isFocusMode || onSeekToTime ? 'pointer' : undefined }}
        >
            {isFocusMode && isFocusLocked && onClearFocusLock ? (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onClearFocusLock();
                    }}
                    aria-label="取消当前段落聚焦"
                    title="取消当前段落聚焦"
                    className={cn(
                        "ui-pressable absolute !left-auto !right-4 top-4 z-30 inline-flex items-center justify-center rounded-full border-2 transition hover:text-stone-950 active:translate-y-[1px] active:shadow-none",
                        isLiquidFocus
                            ? "reading-focus-liquid-close h-11 w-11 border-white/70 text-slate-600"
                            : "h-9 w-9 border-stone-300 bg-white/92 text-stone-600 shadow-[0_3px_0_rgba(28,25,23,0.18)] hover:border-stone-500"
                    )}
                    style={{
                        position: "absolute",
                        left: "unset",
                        right: "1rem",
                        top: "1rem",
                        insetInlineStart: "unset",
                        insetInlineEnd: "1rem",
                    }}
                >
                    <X className="h-4 w-4" />
                </button>
            ) : null}
            {/* Margin Marker Visualization */}
            <div className={cn(
                "absolute -left-6 top-3 w-1.5 h-1.5 rounded-full transition-all duration-300",
                isVideoActive
                    ? "bg-red-500 opacity-100 scale-125"
                    : "bg-amber-400 opacity-0 group-hover:opacity-100 scale-100"
            )} />

            {/* Controls - Floating on the left or right, or inline */}
            <div className="absolute left-2 top-2 z-10 flex -translate-x-[calc(100%+0.35rem)] flex-col items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {/* ... (Keep existing controls) ... */}
                {/* Drag Handle */}
                <div
                    draggable
                    onDragStart={handleDragStart}
                    className="p-1.5 rounded-md cursor-grab active:cursor-grabbing text-stone-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    title="Drag to merge"
                >
                    <GripVertical className="w-4 h-4" />
                </div>

                {/* Play/Pause */}
                <button
                    onClick={handlePlay}
                    className={cn("p-1.5 rounded-full transition-colors", playbackIsRunning ? "text-amber-600" : "text-stone-400 hover:text-amber-600")}
                    title={playbackIsRunning ? "Pause" : "Listen"}
                    disabled={playbackIsLoading}
                >
                    {playbackIsLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : playbackIsRunning ? (
                        <Pause className="w-4 h-4 fill-current" />
                    ) : (
                        <Play className="w-4 h-4 fill-current" />
                    )}
                </button>

                {/* Stop Button (Visible when playing or has progress) */}
                {(playbackIsRunning || playbackTimeMs > 0) && (
                    <button
                        onClick={handleStopPlayback}
                        className="p-1.5 rounded-full text-stone-500 hover:text-red-400 transition-colors"
                        title="Stop & Reset"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}

                {/* Speed Control (Only visible when playing or has audio) */}
                {(playbackIsRunning || playbackTimeMs > 0) && (
                    <button
                        onClick={() => {
                            const rates = [1, 0.75, 0.5];
                            const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
                            setPlaybackRate(nextRate);
                        }}
                        className="p-1.5 rounded-md text-xs font-bold text-stone-500 hover:text-amber-400 transition-colors"
                        title="Playback Speed"
                    >
                        {playbackRate}x
                    </button>
                )}
            </div>

            <div className="space-y-2">
                <div
                    ref={pRef}
                    data-paragraph-text="true"
                    contentEditable={isEditMode}
                    suppressContentEditableWarning={true}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    className={cn(
                        "relative leading-loose tracking-wide transition-all duration-300 outline-none focus:ring-0",
                        fontSizeClass, // Apply dynamic size
                        // fontClass is applied globally but can be reinforced here if needed
                        // remove text-lg md:text-xl font-reading text-stone-800 to allow cascade/override
                        // keeping text-stone-800 as base color if needed, but globals sets it. let's check.
                        // globals.css sets color: var(--color-foreground) on body.
                        // ParagraphCard has text-stone-800. Let's keep text-stone-800 but rely on fontSizeClass.
                        isEditMode ? "cursor-text border border-dashed border-stone-300 p-2 rounded-md bg-white/50" : "hover:text-stone-950 cursor-pointer selection:bg-amber-200",
                        isBlind && "blur-md select-none"
                    )}
                    onClick={(e) => {
                        if (isEditMode) return; // Disable click actions in edit mode

                        // 1. Calculate click position for audio seeking
                        const clickResolution = resolveClickCharacterIndex(e);
                        const clickIndex = clickResolution?.index ?? null;
                        let handledSentencePlayback = false;
                        if (clickIndex !== null && playMode === "full" && duration > 0 && isPlaybackSessionActive) {
                            const matchedTokenIndex = fullWordTokens.findIndex((token) => clickIndex >= token.start && clickIndex <= token.end);
                            if (matchedTokenIndex >= 0) {
                                void handleFullWordSeek(matchedTokenIndex);
                            } else {
                                const targetTimeMs = (clickIndex / Math.max(1, text.length)) * duration * 1000;
                                void seekToMs(targetTimeMs, { autoplay: true });
                            }
                        }
                        const clickSentenceIndex = clickResolution?.sentenceIndex ?? activeListenSentenceIndex;
                        const clickSentenceUnit = sentenceUnits[clickSentenceIndex] ?? activeSentenceUnit;
                        if (clickIndex !== null && playMode === "sentence" && clickSentenceUnit) {
                            const sentenceRelativeIndex = Math.max(0, Math.min(clickSentenceUnit.text.length, clickIndex - clickSentenceUnit.start));
                            const targetRatio = sentenceRelativeIndex / Math.max(1, clickSentenceUnit.text.length);
                            handledSentencePlayback = true;
                            if (clickSentenceIndex === activeListenSentenceIndex && sentenceDurationMs > 0) {
                                const sentenceTokens = activeSentenceWordTokens;
                                const matchedTokenIndex = sentenceTokens.findIndex((token) => sentenceRelativeIndex >= token.start && sentenceRelativeIndex <= token.end);
                                if (matchedTokenIndex >= 0) {
                                    void handleSentenceWordSeek(matchedTokenIndex);
                                } else {
                                    void seekOrPlaySentenceAtRatio(clickSentenceIndex, targetRatio);
                                }
                            } else {
                                void seekOrPlaySentenceAtRatio(clickSentenceIndex, targetRatio);
                            }
                        }

                        // 2. Trigger dictionary lookup
                        if (!handledSentencePlayback && !window.getSelection()?.toString().trim()) {
                            onWordClick(e);
                        }
                    }}
                    onMouseUp={isEditMode ? undefined : handleSelection}
                    dangerouslySetInnerHTML={isEditMode ? { __html: safeHtml } : undefined}
                >
                    {isEditMode ? null : (
                        <AnimatePresence mode="wait">
                            {shouldRenderGrammarLayer ? (
                                <motion.div key="grammar-layer" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                                    {showTranslation && sentenceUnits.length > 0 ? (
                                        <div
                                            data-translation-mode-shell="true"
                                            className="reading-apple-shell mt-1 px-3 py-3 sm:px-4 sm:py-4"
                                        >
                                            {renderTranslationError()}
                                            {renderGrammarLayoutList()}
                                        </div>
                                    ) : (
                                        <>
                                            {renderTranslationError()}
                                            {renderGrammarLayoutList()}
                                        </>
                                    )}
                                </motion.div>
                            ) : (
                                isSpeakingOpen && isSegmentListOpen ? (
                                    <motion.div key="speaking-layer" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                                        {renderSegmentedSentenceList()}
                                    </motion.div>
                                ) : isReadingLayoutMode ? (
                                    <motion.div key="layout-mode-layer" initial={{ opacity: 0, filter: "blur(2px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(2px)" }} transition={{ duration: 0.3, ease: "easeInOut" }}>
                                        {renderReadingLayoutList()}
                                    </motion.div>
                                ) : (
                                    <motion.div 
                                        key="default-text-layer"
                                        initial={{ opacity: 0, filter: "blur(2px)" }} 
                                        animate={{ opacity: 1, filter: "blur(0px)" }} 
                                        exit={{ opacity: 0, filter: "blur(2px)" }}
                                        transition={{ duration: 0.3, ease: "easeInOut" }}
                                        className="inline"
                                    >
                                        {playbackIsRunning || playbackTimeMs > 0 ? (
                                            playMode === "full" ? (
                                                fullMarks.length > 0
                                                    ? renderWordLevelKtv({
                                                        sourceText: text,
                                                        marks: fullMarks,
                                                        tokenToMark: fullTokenToMark,
                                                        currentMs: playbackTimeMs,
                                                        isSeekEnabled: isPlaybackSessionActive,
                                                        onWordSeek: handleFullWordSeek,
                                                    })
                                                    : renderCharacterFallback(text, playbackTimeMs, playbackDurationMs, {
                                                        isSeekEnabled: isPlaybackSessionActive,
                                                        onCharacterSeek: handleFullCharacterSeek,
                                                    })
                                            ) : (
                                                sentenceUnits.length === 0 ? (
                                                    <span>{text}</span>
                                                ) : (
                                                    <span>
                                                        {sentenceUnits.map((unit, unitIndex) => {
                                                        if (unitIndex !== activeListenSentenceIndex) {
                                                            return (
                                                                <span
                                                                    key={`sentence-muted-${unit.start}-${unit.end}`}
                                                                    className="text-stone-400/95"
                                                                >
                                                                    {unit.text}
                                                                </span>
                                                            );
                                                        }

                                                        if (activeSentenceMarks.length > 0) {
                                                            return (
                                                                <React.Fragment key={`sentence-active-${unit.start}-${unit.end}`}>
                                                                    {renderWordLevelKtv({
                                                                        sourceText: unit.text,
                                                                        marks: activeSentenceMarks,
                                                                        tokenToMark: activeSentenceTokenToMark,
                                                                        currentMs: playbackTimeMs,
                                                                        isSeekEnabled: isPlaybackSessionActive,
                                                                        onWordSeek: handleSentenceWordSeek,
                                                                    })}
                                                                </React.Fragment>
                                                            );
                                                        }

                                                        return (
                                                            <React.Fragment key={`sentence-fallback-${unit.start}-${unit.end}`}>
                                                                {renderCharacterFallback(unit.text, playbackTimeMs, playbackDurationMs, {
                                                                    isSeekEnabled: isPlaybackSessionActive,
                                                                    onCharacterSeek: handleSentenceCharacterSeek,
                                                                })}
                                                            </React.Fragment>
                                                        );
                                                        })}
                                                    </span>
                                                )
                                            )
                                        ) : (
                                            // Default or Bionic Text
                                            isBionicMode ? (
                                                renderBionicMarkedText(
                                                    text,
                                                    renderTextWithReadingMarks,
                                                    highlightSnippet,
                                                    locateMarkerRange,
                                                )
                                            ) : (
                                                renderTextWithReadingMarks(text, highlightSnippet, 0, locateMarkerRange)
                                            )
                                        )}
                                    </motion.div>
                                )
                            )}
                        </AnimatePresence>
                    )}

                </div>

                <div
                    data-translation-toolbar={showTranslation ? "true" : undefined}
                    className={cn(
                        "mt-2 flex w-full items-center justify-between transition-opacity",
                        showTranslation
                            ? "reading-apple-shell reading-toolbar-shell min-h-12 gap-2 px-3 py-2 opacity-100 sm:px-4"
                            : "h-8 opacity-0 group-hover:opacity-100 [.read-tour-active_&]:opacity-100",
                        isLiquidFocus
                            ? "reading-focus-liquid-toolbar h-12 px-4 opacity-100"
                            : undefined,
                    )}
                >
                    <button
                        data-tour-target={index === 0 ? "paragraph-listen" : undefined}
                        onClick={() => setIsSpeakingOpen(!isSpeakingOpen)}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
                            showTranslation && "reading-apple-capsule reading-toolbar-button px-3 py-2",
                            isSpeakingOpen ? "text-rose-500" : "text-stone-400/80 hover:text-stone-600"
                        )}
                    >
                        <Mic className="w-3.5 h-3.5" strokeWidth={1.6} /> 朗读
                    </button>
 
                    <button
                        data-tour-target={index === 0 ? "paragraph-translate" : undefined}
                        onClick={() => handleTranslate(false)}
                        data-translation-toolbar-active={showTranslation ? "true" : undefined}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
                            showTranslation && "reading-apple-capsule reading-toolbar-button px-3 py-2",
                            showTranslation ? "text-indigo-500" : "text-stone-400/80 hover:text-stone-600"
                        )}
                    >
                        {isTranslating ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.6} /> : <Languages className="w-3.5 h-3.5" strokeWidth={1.6} />}
                        {showTranslation ? "折叠翻译" : "翻译"}
                    </button>
 
                    <button
                        data-tour-target={index === 0 ? "paragraph-grammar" : undefined}
                        onClick={() => void handleGrammarAnalysis()}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
                            showTranslation && "reading-apple-capsule reading-toolbar-button px-3 py-2",
                            showGrammar ? "text-teal-600" : "text-stone-400/80 hover:text-stone-600"
                        )}
                    >
                        {isAnalyzingGrammar ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.6} /> : <BookOpen className="w-3.5 h-3.5" strokeWidth={1.6} />}
                        {showGrammar ? "折叠语法" : "语法"}
                    </button>
 
                    <button
                        data-tour-target={index === 0 ? "paragraph-ask" : undefined}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={openParagraphAskDock}
                        title={hasActiveAskDock && !askContextAttachment ? "把本段上下文植入右侧 Ask AI" : "打开 Ask AI"}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
                            showTranslation && "reading-apple-capsule reading-toolbar-button px-3 py-2",
                            selectionPopupMode === "ask" && selectionAskContextAttachment?.kind === "paragraph"
                                ? "text-sky-500"
                                : hasActiveAskDock && !askContextAttachment
                                    ? "text-sky-500/80 hover:text-sky-600"
                                    : "text-stone-400/80 hover:text-stone-600"
                        )}
                    >
                        <MessageCircleQuestion className="w-3.5 h-3.5" strokeWidth={1.6} />
                        {hasActiveAskDock && !askContextAttachment ? "植入上下文" : "Ask AI"}
                    </button>
 
                    <button
                        onClick={() => setIsReadingLayoutMode((prev) => !prev)}
                        disabled={isSpeakingOpen || showGrammar}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
                            showTranslation && "reading-apple-capsule reading-toolbar-button px-3 py-2",
                            isReadingLayoutMode ? "text-theme-text" : "text-theme-text-muted hover:text-theme-text",
                            (isSpeakingOpen || showGrammar) && "opacity-30 cursor-not-allowed hover:text-theme-text-muted"
                        )}
                        title={
                            isSpeakingOpen || showGrammar
                                ? "已在当前模式下使用专属排版"
                                : isReadingLayoutMode ? "还原整段" : "排版"
                        }
                    >
                        <List className="w-3.5 h-3.5" /> {isReadingLayoutMode ? "还原" : "排版"}
                    </button>
                </div>

                {readingCoinHint ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        {readingCoinHint}
                    </div>
                ) : null}

                <AnimatePresence>
                    {isSpeakingOpen && (
                        <SpeakingPanel
                            text={text}
                            onPlayOriginal={handlePlayOriginalFull}
                            isOriginalPlaying={isPlaying || isTTSLoading}
                            onRecordingComplete={(blob) => console.log("Recording complete", blob)}
                            onClose={() => setIsSpeakingOpen(false)}
                            isBlind={isBlind}
                            onToggleBlind={() => setIsBlind(!isBlind)}
                            isSegmentListOpen={isSegmentListOpen}
                            onToggleSegmentList={handleToggleSegmentList}
                        />
                    )}
                </AnimatePresence>

                {
                    showTranslation && translation && sentenceUnits.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            data-paragraph-translation-block="true"
                            className="relative group/trans pt-1"
                        >
                            {renderTranslationAside(translation, [], undefined, undefined, translationTextClassName)}
                            <button
                                onClick={() => handleTranslate(true)}
                                className="absolute right-0 top-0 rounded-full bg-white/85 p-1.5 text-stone-400 opacity-0 shadow-sm transition-all hover:bg-white hover:text-stone-700 group-hover/trans:opacity-100"
                                title="Regenerate Translation"
                            >
                                <RotateCcw className="w-3 h-3" />
                            </button>
                        </motion.div>
                    )
                }

                <AnimatePresence>
                    {showGrammar && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="mt-3 overflow-hidden origin-top"
                        >
                            <div className="space-y-4 rounded-2xl border border-theme-border/20 bg-theme-base-bg p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] ring-1 ring-theme-border/5 group/grammar">
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-theme-border/10 bg-theme-surface/50 px-3 py-2.5">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <span className="rounded-md border border-theme-border/20 bg-theme-surface px-2.5 py-1 text-[10px] font-bold tracking-wider text-theme-text-muted">
                                            {grammarModeLabel}
                                        </span>
                                        <span className="rounded-md border border-theme-border/10 bg-theme-surface/80 px-2.5 py-1 text-[10px] font-medium text-theme-text-muted">
                                            点击句号编号开始分析
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        <div className="flex items-center rounded-lg border border-theme-border/20 bg-theme-surface p-0.5 shadow-sm">
                                            <button
                                                onClick={() => setGrammarDisplayMode("core")}
                                                className={cn(
                                                    "rounded-md px-3 py-1 text-[11px] font-bold tracking-wide transition-all",
                                                    grammarDisplayMode === "core"
                                                        ? "bg-theme-active-hover text-theme-text shadow-sm border border-theme-border/10"
                                                        : "text-theme-text-muted hover:bg-theme-active-bg hover:text-theme-text",
                                                )}
                                            >
                                                主干结构
                                            </button>
                                            <button
                                                onClick={() => setGrammarDisplayMode("full")}
                                                className={cn(
                                                    "rounded-md px-3 py-1 text-[11px] font-bold tracking-wide transition-all",
                                                    grammarDisplayMode === "full"
                                                        ? "bg-theme-active-hover text-theme-text shadow-sm border border-theme-border/10"
                                                        : "text-theme-text-muted hover:bg-theme-active-bg hover:text-theme-text",
                                                )}
                                            >
                                                完整分析
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </div>

            {isRewriteModeOpen && typeof document !== "undefined" && createPortal(
                <div
                    className="fixed inset-0 z-[13000] flex items-start justify-center overflow-y-auto bg-black/24 px-3 py-4 backdrop-blur-[1px] sm:px-4 sm:py-6"
                    onClick={closeRewritePractice}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        className="relative my-auto w-full max-w-[980px] overflow-hidden rounded-[30px] bg-[#e8eaf0] p-4 shadow-[18px_18px_40px_rgba(15,23,42,0.11),-16px_-16px_36px_rgba(255,255,255,0.72)] sm:max-h-[calc(100vh-2.5rem)] sm:overflow-y-auto sm:rounded-[40px] sm:p-5"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#f6ad55]/20 blur-3xl" />
                        <div className="pointer-events-none absolute -bottom-16 -left-14 h-52 w-52 rounded-full bg-[#c6f6d5]/30 blur-3xl" />

                        <button
                            onClick={closeRewritePractice}
                            className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#e8eaf0] text-[#585a68] shadow-[6px_6px_14px_rgba(15,23,42,0.08),-6px_-6px_14px_rgba(255,255,255,0.68)] transition hover:scale-[1.03] hover:text-[#2e3040]"
                            aria-label="关闭仿写模式"
                        >
                            <X className="h-4 w-4" />
                        </button>

                        <div className="relative space-y-4 p-3 sm:p-4 md:p-5">
                            <div className="flex flex-col gap-3 pr-12 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-white text-[#f6ad55] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)]">
                                        <PenTool className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#6366f1]">Rewrite Studio</p>
                                        <h3 className="mt-1 text-[1.65rem] font-black tracking-tight text-[#1f2435] sm:text-[1.9rem]">仿写模式</h3>
                                        <p className="mt-1 text-[13px] font-medium text-[#585a68]">Step into the shoes of a native speaker</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-black text-[#585a68] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)]">
                                        <span className="h-2.5 w-2.5 rounded-full bg-[#f6ad55]" />
                                        LIVE SESSION
                                    </div>
                                    <button
                                        onClick={() => void handleShuffleRewriteSentence()}
                                        disabled={isGeneratingRewritePrompt}
                                        className="inline-flex items-center gap-2 rounded-full bg-[#e8eaf0] px-3.5 py-1.5 text-[11px] font-black text-[#6366f1] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isGeneratingRewritePrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                        换一句
                                    </button>
                                </div>
                            </div>

                            {rewriteCycleHint ? (
                                <div className="rounded-[22px] bg-[#fff4d8] px-4 py-3 text-sm font-medium text-[#9a6700] shadow-[inset_4px_4px_9px_rgba(15,23,42,0.04),inset_-4px_-4px_9px_rgba(255,255,255,0.75)]">
                                    {rewriteCycleHint}
                                </div>
                            ) : null}

                            <div className="rounded-[28px] bg-[#eef1f8] px-5 py-5 shadow-[inset_8px_8px_16px_rgba(15,23,42,0.06),inset_-8px_-8px_16px_rgba(255,255,255,0.78)] sm:px-7 sm:py-6">
                                <div className="mb-3 flex items-center gap-2 text-[#6366f1]">
                                    <Quote className="h-4 w-4" />
                                    <span className="text-[11px] font-black uppercase tracking-[0.22em]">Target Sentence</span>
                                </div>
                                {isGeneratingRewritePrompt ? (
                                    <div className="flex items-center gap-2 text-sm font-medium text-[#585a68]">
                                        <Loader2 className="h-4 w-4 animate-spin text-[#f6ad55]" />
                                        正在抽取适合仿写的句子…
                                    </div>
                                ) : rewritePrompt ? (
                                    <p className="text-[1.08rem] font-semibold leading-[1.68] text-[#1f2435] sm:text-[1.32rem]">
                                        {rewritePrompt.source_sentence_en}
                                    </p>
                                ) : (
                                    <p className="text-sm font-medium text-[#585a68]">
                                        暂时无法生成仿写句，请点击“换一句”重试。
                                    </p>
                                )}
                            </div>

                            {rewritePrompt && (
                                <div className="grid gap-3 lg:grid-cols-2">
                                    <div className="rounded-[26px] bg-[#c6f6d5]/34 px-4 py-4 shadow-[9px_9px_18px_rgba(15,23,42,0.05),-7px_-7px_14px_rgba(255,255,255,0.6)]">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-white text-green-600 shadow-[5px_5px_12px_rgba(15,23,42,0.07),-5px_-5px_12px_rgba(255,255,255,0.68)]">
                                                <Lightbulb className="h-4.5 w-4.5 fill-current" />
                                            </div>
                                            <div>
                                                <p className="text-[1.05rem] font-black text-green-800">Inspiration</p>
                                                <p className="mt-1 text-[13px] leading-6 text-green-900/90">{rewritePrompt.imitation_prompt_cn}</p>
                                                <p className="mt-1 text-[10px] leading-5 text-green-800/72">这是仿写灵感线索，不要求和原句语义一一对应，可自由替换场景与主语。</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-[26px] bg-[#e9d8fd]/38 px-4 py-4 shadow-[9px_9px_18px_rgba(15,23,42,0.05),-7px_-7px_14px_rgba(255,255,255,0.6)]">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-white text-purple-600 shadow-[5px_5px_12px_rgba(15,23,42,0.07),-5px_-5px_12px_rgba(255,255,255,0.68)]">
                                                <GitBranch className="h-4.5 w-4.5" />
                                            </div>
                                            <div>
                                                <p className="text-[1.05rem] font-black text-purple-800">Structure Focus</p>
                                                <p className="mt-1 text-[13px] leading-6 text-purple-900/92">{rewritePrompt.pattern_focus_cn}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {rewritePrompt?.rewrite_tips_cn?.length ? (
                                <div className="px-1">
                                    <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#585a68]">Expert Advice</p>
                                    <div className="mt-3 space-y-3">
                                        {rewritePrompt.rewrite_tips_cn.map((tip, idx) => (
                                            <div key={`${tip}-${idx}`} className="flex items-start gap-3">
                                                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#6366f1] shadow-[5px_5px_12px_rgba(15,23,42,0.07),-5px_-5px_12px_rgba(255,255,255,0.68)]">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                </div>
                                                <p className="pt-0.5 text-[13px] font-medium leading-6 text-[#2e3040]">{tip}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            <div className="relative">
                                <div className="rounded-[32px] bg-[#dde1ea] p-2 shadow-[inset_9px_9px_18px_rgba(15,23,42,0.06),inset_-9px_-9px_18px_rgba(255,255,255,0.74)]">
                                    <PretextTextarea
                                        value={rewriteAttempt}
                                        onChange={(event) => setRewriteAttempt(event.target.value)}
                                        placeholder="Write your version here..."
                                        className="min-h-[132px] w-full resize-y rounded-[26px] border-none bg-transparent px-5 py-5 pr-32 text-[15px] font-medium leading-7 text-[#1f2435] placeholder:text-[#a1a5b5] focus:outline-none sm:min-h-[150px] sm:px-6 sm:py-6 sm:pr-40"
                                        minRows={4}
                                        maxRows={14}
                                    />
                                </div>
                                <div className="pointer-events-none absolute inset-x-6 bottom-5 h-14 rounded-full bg-[radial-gradient(circle_at_center,rgba(246,173,85,0.12),transparent_70%)] blur-2xl" />
                                <div className="absolute bottom-4 right-4 sm:bottom-5 sm:right-5">
                                    <button
                                        onClick={() => void handleScoreRewrite()}
                                        disabled={isScoringRewrite || isGeneratingRewritePrompt || !rewritePrompt || !rewriteAttempt.trim()}
                                        className="inline-flex items-center gap-2 rounded-full bg-[#f6ad55] px-4 py-2.5 text-[13px] font-black text-white shadow-[10px_10px_20px_rgba(15,23,42,0.12),-8px_-8px_16px_rgba(255,255,255,0.2)] transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-55 sm:px-5 sm:py-2.5"
                                    >
                                        {isScoringRewrite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                                        提交评分
                                    </button>
                                </div>
                            </div>

                            {rewriteScore && (
                                <div className="space-y-4 rounded-[30px] bg-[#f5ecd7] px-5 py-5 shadow-[inset_6px_6px_14px_rgba(15,23,42,0.05),inset_-6px_-6px_14px_rgba(255,255,255,0.72)]">
                                    <div className="flex items-center justify-between">
                                        <p className="text-base font-black text-[#9a6700]">总分 {rewriteScore.total_score}</p>
                                        {rewriteScore.copy_penalty_applied ? (
                                            <span className="rounded-full bg-[#fee2e2] px-3 py-1 text-[11px] font-bold text-[#be123c] shadow-[4px_4px_10px_rgba(15,23,42,0.05),-4px_-4px_10px_rgba(255,255,255,0.65)]">
                                                仿写度降分（{Math.round(rewriteScore.copy_similarity * 100)}%）
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-[#d1fae5] px-3 py-1 text-[11px] font-bold text-[#047857] shadow-[4px_4px_10px_rgba(15,23,42,0.05),-4px_-4px_10px_rgba(255,255,255,0.65)]">
                                                仿写通过
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                        {[
                                            { label: "语法", value: rewriteScore.dimension_scores.grammar },
                                            { label: "词汇", value: rewriteScore.dimension_scores.vocabulary },
                                            { label: "内容表达", value: rewriteScore.dimension_scores.semantics },
                                            { label: "仿写度", value: rewriteScore.dimension_scores.imitation },
                                        ].map((item) => (
                                            <div key={item.label} className="rounded-[20px] bg-[#eef1f8] px-3 py-3 text-center shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                                <p className="text-[11px] font-bold text-[#585a68]">{item.label}</p>
                                                <p className="mt-1 text-lg font-black text-[#1f2435]">{item.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="rounded-[22px] bg-white/80 px-4 py-3 shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#585a68]">反馈</p>
                                        <p className="mt-1.5 text-sm leading-6 text-[#2e3040]">{rewriteScore.feedback_cn}</p>
                                    </div>

                                    {rewriteScore.better_version_en ? (
                                        <div className="rounded-[22px] bg-[#e0e7ff]/75 px-4 py-3 shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#4338ca]">推荐改写</p>
                                            <p className="mt-1.5 text-sm leading-6 text-[#312e81]">{rewriteScore.better_version_en}</p>
                                        </div>
                                    ) : null}

                                    {rewriteScore.improvement_points_cn?.length ? (
                                        <div className="rounded-[22px] bg-white/82 px-4 py-3 shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#585a68]">提升建议</p>
                                            <div className="mt-1.5 space-y-1">
                                                {rewriteScore.improvement_points_cn.map((point, idx) => (
                                                    <p key={`${point}-${idx}`} className="text-sm leading-6 text-[#2e3040]">{idx + 1}. {point}</p>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* Phrase Analysis Popup - Fixed Positioning - Liquid Glass Style */}
            {selectionRect && typeof document !== 'undefined' && createPortal(
                <SelectionActionPopup
                    key={selectionPopupMode === "ask" || selectionPopupMode === "ask-replay"
                        ? "selection-ask-dock"
                        : `selection-popup:${selectionRect.left}:${selectionRect.top}:${selectionRect.width}:${selectionRect.height}:${selectedText ?? ""}:${selectionPopupMode}:${selectionAskAutoOpenToken}`}
                    selectionRect={selectionRect}
                    selectedText={selectedText}
                    popupMode={selectionPopupMode}
                    phraseAnalysis={phraseAnalysis}
                    isAnalyzingPhrase={isAnalyzingPhrase}
                    isSavingReadingNote={isSavingReadingNote}
                    canCreateReadingNote={Boolean(onCreateReadingNote)}
                    noteLayerHidden={showGrammar}
                    isNoteComposerOpen={isNoteComposerOpen}
                    isEditingNote={Boolean(selectionOverlapState.note)}
                    noteDraft={noteDraft}
                    onNoteDraftChange={setNoteDraft}
                    onOpenNoteComposer={() => setIsNoteComposerOpen(true)}
                    onCancelNoteComposer={() => {
                        setIsNoteComposerOpen(false);
                        setNoteDraft("");
                    }}
                    onCreateHighlight={() => void handleCreateReadingMark("highlight")}
                    onCreateUnderline={() => void handleCreateReadingMark("underline")}
                    canDeleteHighlight={selectionOverlapState.hasHighlight}
                    canDeleteUnderline={selectionOverlapState.hasUnderline}
                    canDeleteNote={Boolean(selectionOverlapState.note)}
                    onEditNote={() => setIsNoteComposerOpen(true)}
                    onDeleteHighlight={() => void handleDeleteReadingMark("highlight")}
                    onDeleteUnderline={() => void handleDeleteReadingMark("underline")}
                    onDeleteNote={() => void handleDeleteReadingMark("note")}
                    onSaveNote={() => void handleCreateReadingMark("note", noteDraft)}
                    onAnalyze={handleAnalyzePhrase}
                    onLookupWord={handleLookupSelectedText}
                    qaPairs={selectionQaPairs}
                    question={selectionAskQuestion}
                    onQuestionChange={setSelectionAskQuestion}
                    askContextAttachment={selectionAskContextAttachment}
                    askAnswerMode={askAnswerMode}
                    onAskAnswerModeChange={setAskAnswerMode}
                    askThinkingMode={askThinkingMode}
                    onAskThinkingModeChange={setAskThinkingMode}
                    askReasoningEffort={askReasoningEffort}
                    onAskReasoningEffortChange={setAskReasoningEffort}
                    isAskLoading={isSelectionAskLoading}
                    onAsk={() => void handleSelectionAskAI()}
                    onRetryAsk={() => { void handleRetrySelectionAskAI(); }}
                    onClearAskContext={() => {
                        setSelectionAskContextAttachment(null);
                        setIsSelectionAskContextCleared(true);
                    }}
                    onOpenAskComposer={() => {
                        if (hasActiveAskDock && !askContextAttachment && selectionAskContextAttachment) {
                            const resolvedAttachment = injectAskContextAttachment(selectionAskContextAttachment, {
                                rect: selectionRect,
                                openLocalDock: false,
                            });
                            if (resolvedAttachment) {
                                setSelectionRect(null);
                                setSelectionPopupMode("selection");
                            }
                            window.getSelection()?.removeAllRanges();
                            return;
                        }
                        setSelectionPopupMode("ask");
                    }}
                    onReturnToSelection={() => setSelectionPopupMode("selection")}
                    askPanelDefaultOpenToken={selectionAskAutoOpenToken}
                    renderAskMarkdown={renderAskMarkdown}
                    onClose={closePhraseAnalysis}
                />,
                document.body
            )}

            {pinnedAsk && typeof document !== 'undefined' && createPortal(
                <SelectionActionPopup
                    key={`pinned-ask-popup:${pinnedAsk.offsets.startOffset}:${pinnedAsk.offsets.endOffset}:${pinnedAsk.autoOpenToken}`}
                    selectionRect={pinnedAsk.rect}
                    selectedText={pinnedAsk.text}
                    popupMode={pinnedAsk.mode}
                    phraseAnalysis={null}
                    isAnalyzingPhrase={false}
                    isSavingReadingNote={false}
                    canCreateReadingNote={false}
                    noteLayerHidden={showGrammar}
                    isNoteComposerOpen={false}
                    isEditingNote={false}
                    noteDraft=""
                    onNoteDraftChange={() => {}}
                    onOpenNoteComposer={() => {}}
                    onCancelNoteComposer={() => {}}
                    onCreateHighlight={() => {}}
                    onCreateUnderline={() => {}}
                    canDeleteHighlight={false}
                    canDeleteUnderline={false}
                    canDeleteNote={false}
                    onEditNote={() => {}}
                    onDeleteHighlight={() => {}}
                    onDeleteUnderline={() => {}}
                    onDeleteNote={() => {}}
                    onSaveNote={() => {}}
                    onAnalyze={() => {}}
                    onLookupWord={() => {}}
                    qaPairs={buildAskQaPairs(
                        pinnedAsk.messages,
                        pinnedAsk.streamingContent,
                        pinnedAsk.isLoading,
                        pinnedAsk.streamingReasoningContent,
                    )}
                    question=""
                    onQuestionChange={() => {}}
                    askContextAttachment={null}
                    askAnswerMode={askAnswerMode}
                    onAskAnswerModeChange={setAskAnswerMode}
                    askThinkingMode={askThinkingMode}
                    onAskThinkingModeChange={setAskThinkingMode}
                    askReasoningEffort={askReasoningEffort}
                    onAskReasoningEffortChange={setAskReasoningEffort}
                    isAskLoading={false}
                    onAsk={() => {}}
                    onRetryAsk={() => {}}
                    onOpenAskComposer={() => {}}
                    onReturnToSelection={() => setPinnedAsk(null)}
                    askPanelDefaultOpenToken={pinnedAsk.autoOpenToken}
                    renderAskMarkdown={renderAskMarkdown}
                    onClose={() => setPinnedAsk(null)}
                />,
                document.body
            )}

            {hoveredReadingNote && !showGrammar && typeof document !== "undefined" && createPortal(
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="pointer-events-none fixed z-[10000] w-max max-w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-[14px] border border-theme-border/30 bg-theme-base-bg shadow-xl backdrop-blur-3xl"
                    style={{
                        left: (() => {
                            const viewportPadding = 12;
                            const horizontalGap = 18;
                            const tooltipMaxWidth = Math.min(320, typeof window !== "undefined" ? window.innerWidth - viewportPadding * 2 : 320);
                            const canPlaceRight = hoveredReadingNote.x + horizontalGap + tooltipMaxWidth <= (typeof window !== "undefined" ? window.innerWidth : 1000) - viewportPadding;
                            if (canPlaceRight) return `${hoveredReadingNote.x + horizontalGap}px`;
                            return `${Math.max(viewportPadding, hoveredReadingNote.x - horizontalGap - tooltipMaxWidth)}px`;
                        })(),
                        top: hoveredReadingNote.analyzeData
                            ? `${hoveredReadingNote.anchorBottom + 12}px`
                            : (hoveredReadingNote.anchorTop > 88
                                ? `${hoveredReadingNote.anchorTop - 10}px`
                                : `${hoveredReadingNote.anchorBottom + 10}px`),
                        transform: hoveredReadingNote.analyzeData
                            ? "translateY(0)"
                            : (hoveredReadingNote.anchorTop > 88
                                ? "translateY(-100%)"
                                : "translateY(0)"),
                    }}
                >
                    {(() => {
                        if (hoveredReadingNote.analyzeData) {
                            const data = hoveredReadingNote.analyzeData;
                            return (
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5 border-b border-theme-border/20 bg-theme-surface/50 px-3 py-1.5 text-[10px] font-black tracking-wider text-fuchsia-500">
                                        <Globe className="h-3 w-3" />
                                        AI 解读
                                    </div>
                                    <div className="flex max-h-[300px] flex-col overflow-y-auto px-3 py-2.5 text-xs">
                                        {data.translation && (
                                            <p className="mb-2 font-semibold text-stone-800">{data.translation}</p>
                                        )}
                                        {data.grammar_point && (
                                            <p className="mb-2 leading-relaxed text-stone-600">{data.grammar_point}</p>
                                        )}
                                        {data.nuance && (
                                            <div className="mb-2 rounded border border-amber-100 bg-amber-50/70 p-2 italic text-amber-800">
                                                {data.nuance}
                                            </div>
                                        )}
                                        {Array.isArray(data.vocabulary) && data.vocabulary.length > 0 && (
                                            <div className="mb-2 mt-1 space-y-1 border-t border-stone-100/50 pt-2">
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">核心词汇</div>
                                                <div className="space-y-1">
                                                    {data.vocabulary.map((item: PhraseVocabularyItem, idx: number) => (
                                                        <div key={`${item.word || "word"}-${idx}`} className="text-xs text-stone-600">
                                                            <span className="font-semibold text-stone-800">{item.word || "词汇"}:</span> {item.definition || ""}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }
                        const txt = hoveredReadingNote.text || "";
                        if (txt.startsWith("AI问答")) {
                            const [header, ...bodyParts] = txt.split("\n");
                            const body = bodyParts.join("\n").replace(/[#*_`]/g, "").trim();
                            return (
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5 border-b border-theme-border/20 bg-theme-surface/50 px-3 py-1.5 text-[10px] font-black tracking-wider text-indigo-500">
                                        <MessageCircleQuestion className="h-3 w-3" />
                                        {header.trim()}
                                    </div>
                                    {body && (
                                        <div className="px-3 py-2.5 text-xs font-semibold leading-relaxed text-theme-text-muted opacity-90 line-clamp-3">
                                            {body}
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        return (
                            <div className="flex flex-col">
                                <div className="flex items-center gap-1.5 border-b border-theme-border/20 bg-theme-surface/50 px-3 py-1.5 text-[10px] font-black tracking-wider text-sky-500">
                                    <PenTool className="h-3 w-3" />
                                    阅读笔记
                                </div>
                                <div className="px-3 py-2.5 text-xs font-semibold leading-relaxed text-theme-text line-clamp-3">
                                    {txt}
                                </div>
                            </div>
                        );
                    })()}
                </motion.div>,
                document.body
            )}
        </div>
    );
}

interface SelectionActionPopupProps {
    selectionRect: DOMRect;
    selectedText: string | null;
    popupMode?: SelectionPopupMode;
    askContextAttachment?: AskContextAttachment | null;
    phraseAnalysis: {
        translation?: string;
        grammar_point?: string;
        nuance?: string;
        vocabulary?: Array<{ word?: string; definition?: string }>;
    } | null;
    isAnalyzingPhrase: boolean;
    isSavingReadingNote: boolean;
    canCreateReadingNote: boolean;
    noteLayerHidden: boolean;
    isNoteComposerOpen: boolean;
    isEditingNote: boolean;
    noteDraft: string;
    onNoteDraftChange: (value: string) => void;
    onOpenNoteComposer: () => void;
    onCancelNoteComposer: () => void;
    onCreateHighlight: () => void;
    onCreateUnderline: () => void;
    canDeleteHighlight: boolean;
    canDeleteUnderline: boolean;
    canDeleteNote: boolean;
    onEditNote: () => void;
    onDeleteHighlight: () => void;
    onDeleteUnderline: () => void;
    onDeleteNote: () => void;
    onSaveNote: () => void;
    onAnalyze: () => void;
    onLookupWord: () => void;
    qaPairs: AskQaPair[];
    question: string;
    onQuestionChange: (value: string) => void;
    askAnswerMode: AskAnswerMode;
    onAskAnswerModeChange: (mode: AskAnswerMode) => void;
    isAskLoading: boolean;
    onAsk: () => void;
    /** Re-runs the last ask attempt when the most recent assistant reply was a transient error. */
    onRetryAsk?: () => void;
    onClearAskContext?: () => void;
    onOpenAskComposer: () => void;
    onReturnToSelection: () => void;
    askPanelDefaultOpenToken?: number;
    askThinkingMode: AskThinkingMode;
    onAskThinkingModeChange: (mode: AskThinkingMode) => void;
    askReasoningEffort: AskReasoningEffort;
    onAskReasoningEffortChange: (effort: AskReasoningEffort) => void;
    renderAskMarkdown: (content: string) => React.ReactNode;
    onClose: () => void;
}

export function SelectionActionPopup({
    selectionRect,
    selectedText,
    popupMode = "selection",
    askContextAttachment,
    phraseAnalysis,
    isAnalyzingPhrase,
    isSavingReadingNote,
    canCreateReadingNote,
    noteLayerHidden,
    isNoteComposerOpen,
    isEditingNote,
    noteDraft,
    onNoteDraftChange,
    onOpenNoteComposer,
    onCancelNoteComposer,
    onCreateHighlight,
    onCreateUnderline,
    canDeleteHighlight,
    canDeleteUnderline,
    canDeleteNote,
    onEditNote,
    onDeleteHighlight,
    onDeleteUnderline,
    onDeleteNote,
    onSaveNote,
    onAnalyze,
    onLookupWord,
    qaPairs,
    question,
    onQuestionChange,
    askAnswerMode,
    onAskAnswerModeChange,
    isAskLoading,
    onAsk,
    onRetryAsk,
    onClearAskContext,
    onOpenAskComposer,
    onReturnToSelection,
    askPanelDefaultOpenToken,
    askThinkingMode,
    onAskThinkingModeChange,
    askReasoningEffort,
    onAskReasoningEffortChange,
    renderAskMarkdown,
    onClose,
}: SelectionActionPopupProps) {
    const ref = useRef<HTMLDivElement>(null);
    useReducedMotion();
    const dragStateRef = useRef<{
        pointerId: number;
        startClientX: number;
        startClientY: number;
        originX: number;
        originY: number;
    } | null>(null);
    const askDockInteractionRef = useRef<{
        type: "move" | "resize";
        pointerId: number;
        startClientX: number;
        startClientY: number;
        originLeft: number;
        originTop: number;
        originWidth: number;
        originHeight: number;
    } | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [measuredHeight, setMeasuredHeight] = useState(240);
    const [isAskContextExpanded, setIsAskContextExpanded] = useState(false);
    const isAskReplayMode = popupMode === "ask-replay";
    const isAskDockMode = popupMode === "ask" || isAskReplayMode;
    const isAskComposerOpen = isAskDockMode || Boolean(askPanelDefaultOpenToken);
    const getDefaultAskDockWindow = () => {
        const width = Math.min(420, Math.max(360, window.innerWidth - 32));
        const height = Math.min(760, Math.max(420, window.innerHeight - 144));
        return {
            left: Math.max(16, window.innerWidth - width - 40),
            top: 112,
            width,
            height,
        };
    };
    const [askDockWindow, setAskDockWindow] = useState(getDefaultAskDockWindow);
    const [expandedQaIds, setExpandedQaIds] = useState<number[]>(() => (
        isAskReplayMode
            ? (qaPairs.length > 0 ? [qaPairs[qaPairs.length - 1].id] : [])
            : (askPanelDefaultOpenToken ? qaPairs.map((pair) => pair.id) : (qaPairs.length > 0 ? [qaPairs[qaPairs.length - 1].id] : []))
    ));

    const previousQaCountRef = useRef(qaPairs.length);
    useEffect(() => {
        if (qaPairs.length > previousQaCountRef.current) {
            const newIds = qaPairs.slice(previousQaCountRef.current).map(p => p.id);
            setExpandedQaIds(prev => Array.from(new Set([...prev, ...newIds])));
        }
        previousQaCountRef.current = qaPairs.length;
    }, [qaPairs]);

    useEffect(() => {
        if (isAskDockMode) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isAskDockMode, onClose]);

    useEffect(() => {
        setIsAskContextExpanded(false);
    }, [askContextAttachment?.id]);

    useLayoutEffect(() => {
        if (!ref.current) return;
        const nextHeight = ref.current.offsetHeight;
        if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
        setMeasuredHeight(nextHeight);
    }, [
        selectedText,
        phraseAnalysis,
        isNoteComposerOpen,
        noteDraft,
        noteLayerHidden,
        isAnalyzingPhrase,
        isSavingReadingNote,
        isAskComposerOpen,
        expandedQaIds,
        qaPairs,
        question,
        isAskLoading,
    ]);
    const deleteActionCount = Number(canDeleteHighlight) + Number(canDeleteUnderline);

    const viewportPadding = 16;
    const minAskDockWidth = Math.min(360, Math.max(280, window.innerWidth - viewportPadding * 2));
    const minAskDockHeight = Math.min(420, Math.max(320, window.innerHeight - viewportPadding * 2));
    const maxAskDockWidth = Math.max(minAskDockWidth, window.innerWidth - viewportPadding * 2);
    const maxAskDockHeight = Math.max(minAskDockHeight, window.innerHeight - viewportPadding * 2);
    const clampedAskDockWidth = Math.min(Math.max(askDockWindow.width, minAskDockWidth), maxAskDockWidth);
    const clampedAskDockHeight = Math.min(Math.max(askDockWindow.height, minAskDockHeight), maxAskDockHeight);
    const clampedAskDockLeft = Math.min(
        Math.max(viewportPadding, askDockWindow.left),
        Math.max(viewportPadding, window.innerWidth - clampedAskDockWidth - viewportPadding),
    );
    const clampedAskDockTop = Math.min(
        Math.max(viewportPadding, askDockWindow.top),
        Math.max(viewportPadding, window.innerHeight - clampedAskDockHeight - viewportPadding),
    );
    const popupWidth = isAskDockMode ? clampedAskDockWidth : 330;
    const popupHeight = Math.min(measuredHeight || 240, window.innerHeight - viewportPadding * 2);
    const preferredTop = selectionRect.bottom + 10 + dragOffset.y;
    const flippedTop = selectionRect.top - popupHeight - 10 + dragOffset.y;
    const canFlip = flippedTop >= viewportPadding;
    const shouldFlip = preferredTop + popupHeight > window.innerHeight - viewportPadding && canFlip;
    const baseTop = shouldFlip ? flippedTop : preferredTop;
    const clampedTop = Math.min(
        Math.max(viewportPadding, baseTop),
        Math.max(viewportPadding, window.innerHeight - popupHeight - viewportPadding),
    );
    const baseLeft = selectionRect.left + (selectionRect.width / 2) - (popupWidth / 2) + dragOffset.x;
    const clampedLeft = Math.min(
        Math.max(viewportPadding, baseLeft),
        Math.max(viewportPadding, window.innerWidth - popupWidth - viewportPadding),
    );
    const popupStyle = isAskDockMode
        ? {
            top: `${clampedAskDockTop}px`,
            left: `${clampedAskDockLeft}px`,
            width: `${clampedAskDockWidth}px`,
            height: `${clampedAskDockHeight}px`,
            maxWidth: `${maxAskDockWidth}px`,
            minWidth: `${minAskDockWidth}px`,
            minHeight: `${minAskDockHeight}px`,
        }
        : {
            top: `${clampedTop}px`,
            left: `${clampedLeft}px`,
            width: "auto",
            maxWidth: `${popupWidth}px`,
            minWidth: "260px",
        };

    const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, textarea, input, a")) return;
        dragStateRef.current = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            originX: dragOffset.x,
            originY: dragOffset.y,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const dragState = dragStateRef.current;
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - dragState.startClientX;
        const deltaY = event.clientY - dragState.startClientY;
        setDragOffset({
            x: dragState.originX + deltaX,
            y: dragState.originY + deltaY,
        });
    };

    const handleDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        const dragState = dragStateRef.current;
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        dragStateRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const handleAskDockMoveStart = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, textarea, input, a")) return;
        askDockInteractionRef.current = {
            type: "move",
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            originLeft: clampedAskDockLeft,
            originTop: clampedAskDockTop,
            originWidth: clampedAskDockWidth,
            originHeight: clampedAskDockHeight,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleAskDockResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        askDockInteractionRef.current = {
            type: "resize",
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            originLeft: clampedAskDockLeft,
            originTop: clampedAskDockTop,
            originWidth: clampedAskDockWidth,
            originHeight: clampedAskDockHeight,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleAskDockInteractionMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const interaction = askDockInteractionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - interaction.startClientX;
        const deltaY = event.clientY - interaction.startClientY;

        if (interaction.type === "move") {
            setAskDockWindow((current) => ({
                ...current,
                left: Math.min(
                    Math.max(viewportPadding, interaction.originLeft + deltaX),
                    Math.max(viewportPadding, window.innerWidth - interaction.originWidth - viewportPadding),
                ),
                top: Math.min(
                    Math.max(viewportPadding, interaction.originTop + deltaY),
                    Math.max(viewportPadding, window.innerHeight - interaction.originHeight - viewportPadding),
                ),
            }));
            return;
        }

        setAskDockWindow((current) => ({
            ...current,
            width: Math.min(Math.max(minAskDockWidth, interaction.originWidth + deltaX), maxAskDockWidth),
            height: Math.min(Math.max(minAskDockHeight, interaction.originHeight + deltaY), maxAskDockHeight),
        }));
    };

    const handleAskDockInteractionEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        const interaction = askDockInteractionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId) return;
        askDockInteractionRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const popupContainerClassName = cn(
        // Removed backdrop-blur entirely — it caused per-frame recomposition
        // while the inner content scrolled, producing the flicker. The panel
        // now uses a solid theme background, paired with GPU promotion in
        // `.ask-ai-panel` for smooth scrolling.
        "ask-ai-panel relative overflow-hidden rounded-[1.25rem] border border-theme-border/30 shadow-2xl",
        isAskDockMode
            ? "flex h-full flex-col"
            : "max-h-[min(560px,calc(100vh-2rem))] overflow-y-auto",
        isAskReplayMode ? "p-2" : "p-3.5",
    );
    const askBodyClassName = cn(
        "overflow-y-auto px-1 -mx-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-theme-border/50 [&::-webkit-scrollbar-track]:bg-transparent",
        isAskReplayMode
            ? (isAskDockMode ? "flex-1 min-h-0" : "max-h-[min(500px,calc(100vh-4rem))]")
            : (isAskDockMode ? "flex-1 min-h-0" : "max-h-56"),
        qaPairs.length > 0 && !isAskReplayMode ? "py-2 space-y-3" : "py-0 space-y-3",
    );
    const askContextText = askContextAttachment?.text || "";
    const askContextPreview = askContextAttachment?.excerpt || askContextText;
    const canExpandAskContext = askContextText.length > askContextPreview.length || askContextText.length > 180;
    const renderAskContextCard = () => (
        askContextAttachment ? (
            <div
                data-ask-context-card="true"
                className="rounded-[16px] border border-indigo-200/70 bg-indigo-50/80 px-3 py-2.5 text-left shadow-sm"
            >
                <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                            {askContextAttachment.label}
                        </span>
                        {askContextAttachment.rangeLabel ? (
                            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-indigo-500">
                                {askContextAttachment.rangeLabel}
                            </span>
                        ) : null}
                    </div>
                    {!isAskReplayMode && onClearAskContext ? (
                        <button
                            type="button"
                            data-ask-context-clear="true"
                            aria-label="取消上下文附件"
                            title="取消上下文附件"
                            onClick={onClearAskContext}
                            className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-indigo-400 transition-colors hover:bg-white/80 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    ) : null}
                </div>
                <p className={cn(
                    "text-[12px] leading-5 text-indigo-950/75",
                    !isAskContextExpanded && "line-clamp-3",
                )}>
                    {isAskContextExpanded ? askContextText : askContextPreview}
                </p>
                {canExpandAskContext ? (
                    <button
                        type="button"
                        data-ask-context-toggle="true"
                        onClick={() => setIsAskContextExpanded((current) => !current)}
                        className="mt-1.5 text-[10px] font-black text-indigo-500 transition-colors hover:text-indigo-700"
                    >
                        {isAskContextExpanded ? "收起上下文" : "展开全文"}
                    </button>
                ) : null}
            </div>
        ) : null
    );

    return (
        <div
            ref={ref}
            className="fixed z-[9999] animate-in fade-in zoom-in-95 duration-200"
            data-selection-ask-dock={isAskDockMode ? "true" : undefined}
            style={{ ...popupStyle, transform: "translateZ(0)", willChange: "transform" }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className={popupContainerClassName}>
                <div
                    data-selection-ask-drag-handle={isAskDockMode ? "true" : undefined}
                    className={cn(
                        "relative mb-3 flex items-start justify-between gap-3 border-b border-theme-border/20 pb-3",
                        isAskDockMode || isAskReplayMode ? "cursor-grab select-none active:cursor-grabbing" : "cursor-grab active:cursor-grabbing",
                    )}
                    onPointerDown={isAskDockMode || isAskReplayMode ? handleAskDockMoveStart : handleDragStart}
                    onPointerMove={isAskDockMode || isAskReplayMode ? handleAskDockInteractionMove : handleDragMove}
                    onPointerUp={isAskDockMode || isAskReplayMode ? handleAskDockInteractionEnd : handleDragEnd}
                    onPointerCancel={isAskDockMode || isAskReplayMode ? handleAskDockInteractionEnd : handleDragEnd}
                >
                    <div className="min-w-0 flex items-center gap-1">
                        {popupMode === "ask" ? (
                            <motion.button
                                type="button"
                                onClick={onReturnToSelection}
                                whileTap={{ scale: 0.95 }}
                                className="shrink-0 rounded-full p-1.5 text-theme-text-muted hover:text-theme-text hover:bg-theme-active-hover transition-colors -ml-1.5"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </motion.button>
                        ) : null}
                        <h3 className="line-clamp-2 text-[15px] font-bold leading-tight text-theme-text tracking-tight">
                            {selectedText || (isAskDockMode ? "Ask AI" : "选中文本")}
                        </h3>
                    </div>
                    <motion.button
                        type="button"
                        onClick={onClose}
                        whileTap={{ scale: 0.95 }}
                        className="shrink-0 rounded-full border border-theme-border/50 bg-theme-surface p-1.5 text-theme-text shadow-sm transition-colors hover:bg-theme-active-hover"
                    >
                        <X className="h-4 w-4" />
                    </motion.button>
                </div>

                {(!isAskReplayMode && !isAskComposerOpen) ? (
                    <>
                    {!(isEditingNote || isNoteComposerOpen) && (
                        <>
                        <div className="grid grid-cols-2 gap-2">
                        <motion.button
                            type="button"
                            onClick={onCreateHighlight}
                            disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                            whileTap={{ scale: 0.98 }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-[14px] border border-emerald-500/20 bg-emerald-500/10 px-2 py-2 text-[12px] font-black text-emerald-600 shadow-sm transition-all hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Highlighter className="h-3.5 w-3.5" />
                            高亮
                        </motion.button>
                        <motion.button
                            type="button"
                            onClick={onCreateUnderline}
                            disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                            whileTap={{ scale: 0.98 }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-[14px] border border-fuchsia-500/20 bg-fuchsia-500/10 px-2 py-2 text-[12px] font-black text-fuchsia-600 shadow-sm transition-all hover:bg-fuchsia-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Underline className="h-3.5 w-3.5" />
                            下划线
                        </motion.button>
                        <motion.button
                            type="button"
                            onClick={onOpenNoteComposer}
                            disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                            whileTap={{ scale: 0.98 }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-[14px] border border-blue-500/20 bg-blue-500/10 px-2 py-2 text-[12px] font-black text-blue-600 shadow-sm transition-all hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <PenTool className="h-3.5 w-3.5" />
                            {isEditingNote ? "编辑标注" : "标注"}
                        </motion.button>
                        <motion.button
                            type="button"
                            onClick={onAnalyze}
                            disabled={isAnalyzingPhrase}
                            whileTap={{ scale: 0.98 }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-[14px] border border-indigo-500/20 bg-indigo-500/10 px-2 py-2 text-[12px] font-black text-indigo-600 shadow-sm transition-all hover:bg-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isAnalyzingPhrase ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            解读
                        </motion.button>
                    </div>
                    <div className="mt-2 text-center">
                        <motion.button
                            type="button"
                            onClick={onLookupWord}
                            whileTap={{ scale: 0.98 }}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[14px] border border-sky-500/20 bg-sky-500/10 px-2 py-2.5 text-[12px] font-black text-sky-600 shadow-sm transition-all hover:bg-sky-500/15"
                        >
                            <BookOpen className="h-3.5 w-3.5" />
                            查询选中词境 / 单词
                        </motion.button>
                    </div>
                    </>
                    )}
                    </>
                ) : null}

                {(!isAskReplayMode && !isAskComposerOpen) && deleteActionCount > 0 ? (
                    <div className={cn("mt-2.5 grid gap-2", deleteActionCount === 1 ? "grid-cols-1" : "grid-cols-2")}>
                        {canDeleteHighlight ? (
                            <motion.button
                                type="button"
                                onClick={onDeleteHighlight}
                                disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                                whileTap={{ scale: 0.98 }}
                                className="inline-flex items-center justify-center gap-1.5 rounded-[12px] border border-rose-500/20 bg-rose-500/10 px-2 py-2 text-xs font-black text-rose-600 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                删除高亮
                            </motion.button>
                        ) : null}
                        {canDeleteUnderline ? (
                            <motion.button
                                type="button"
                                onClick={onDeleteUnderline}
                                disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                                whileTap={{ scale: 0.98 }}
                                className="inline-flex items-center justify-center gap-1.5 rounded-[12px] border border-amber-500/20 bg-amber-500/10 px-2 py-2 text-xs font-black text-amber-600 transition-colors hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                删除下划线
                            </motion.button>
                        ) : null}
                    </div>
                ) : null}

                {isAskReplayMode ? null : (!isAskComposerOpen && (
                    <div className="mt-2.5">
                        <motion.button
                            type="button"
                            onClick={() => {
                                setExpandedQaIds([]);
                                onOpenAskComposer();
                            }}
                            whileTap={{ scale: 0.98 }}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[14px] border border-indigo-500/30 bg-indigo-500/10 px-2 py-2 text-[12px] font-black text-indigo-600 shadow-sm transition-all hover:bg-indigo-500/15"
                        >
                            <MessageCircleQuestion className="h-3.5 w-3.5" />
                            向AI提问
                        </motion.button>
                    </div>
                ))}

                {isAskReplayMode || isAskComposerOpen ? (
                    <div 
                        className={cn("flex flex-col", isAskDockMode && "flex-1 min-h-0", !isAskReplayMode && "mt-2", !isAskDockMode && isAskReplayMode && "cursor-grab active:cursor-grabbing")}
                        onPointerDown={!isAskDockMode && isAskReplayMode ? handleDragStart : undefined}
                        onPointerMove={!isAskDockMode && isAskReplayMode ? handleDragMove : undefined}
                        onPointerUp={!isAskDockMode && isAskReplayMode ? handleDragEnd : undefined}
                        onPointerCancel={!isAskDockMode && isAskReplayMode ? handleDragEnd : undefined}
                    >
                        <div className={askBodyClassName}>
                            {isAskReplayMode ? renderAskContextCard() : null}
                            {qaPairs.length > 0 && (
                                <>
                                    {qaPairs.map((pair, index) => {
                                        const isExpanded = expandedQaIds.includes(pair.id);
                                        const questionTitle = pair.question?.trim() || `问题 ${index + 1}`;
                                        return (
                                            <div
                                                key={pair.id}
                                                className="overflow-hidden rounded-[14px] bg-theme-surface/50 border border-theme-border/10"
                                            >
                                                <motion.button
                                                    type="button"
                                                    aria-expanded={isExpanded}
                                                    onClick={() => {
                                                        setExpandedQaIds((prev) => (
                                                            prev.includes(pair.id)
                                                                ? prev.filter((id) => id !== pair.id)
                                                                : [...prev, pair.id]
                                                        ));
                                                    }}
                                                    whileTap={{ scale: 0.98 }}
                                                    className="flex w-full items-center justify-between gap-2 border-b border-theme-border/20 bg-theme-surface px-3 py-2 text-left text-xs font-black text-theme-text"
                                                >
                                                    <span className="min-w-0 truncate">
                                                        {`问题 ${index + 1} · ${questionTitle}`}
                                                    </span>
                                                    <span className="shrink-0 text-[11px] font-bold text-[#efe9ff]">
                                                        {isExpanded ? "收起" : "展开"}
                                                    </span>
                                                </motion.button>
                                                {isExpanded ? (
                                                    <div className="px-3 py-2.5 text-xs leading-6 text-theme-text">
                                                        <AskReasoningBlock content={pair.reasoningContent} isStreaming={pair.isReasoningStreaming} />
                                                        {pair.answer
                                                            ? (
                                                                <div className="yasi-markdown">
                                                                    {renderAskMarkdown(pair.answer)}
                                                                </div>
                                                            )
                                                            : (
                                                                <div className="flex items-center gap-2 opacity-70">
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                    <span>正在思考…</span>
                                                                </div>
                                                            )}
                                                        {pair.isError && !pair.isStreaming && index === qaPairs.length - 1 && onRetryAsk ? (
                                                            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { onRetryAsk(); }}
                                                                    disabled={isAskLoading}
                                                                    className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                                                                >
                                                                    <RefreshCw className={cn("h-3.5 w-3.5", isAskLoading && "animate-spin")} />
                                                                    重试
                                                                </button>
                                                                <span className="text-[10px] text-rose-400/80">网络或服务短时波动，重试通常即可恢复。</span>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>

                        {!isAskReplayMode && (
                            <div className="mt-2 border-t border-theme-border/15 pt-3">
                                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                                    <span className="text-[10px] font-bold tracking-[0.1em] text-theme-text-muted">回答模式</span>
                                    <div className="inline-flex items-center rounded-full bg-theme-surface p-0.5 border border-theme-border/10">
                                        {ASK_ANSWER_MODE_OPTIONS.map((option) => (
                                            <motion.button
                                                key={`ask-mode-selection-${option.mode}`}
                                                type="button"
                                                onClick={() => onAskAnswerModeChange(option.mode)}
                                                disabled={isAskLoading}
                                                whileTap={{ scale: 0.95 }}
                                                className={cn(
                                                    "rounded-full px-2.5 py-1 text-[10px] font-black transition-colors",
                                                    askAnswerMode === option.mode
                                                        ? "bg-theme-active-hover text-theme-text shadow-sm"
                                                        : "text-theme-text-muted hover:bg-theme-active-bg",
                                                )}
                                            >
                                                {option.label}
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                                    <button
                                        type="button"
                                        data-ask-thinking-toggle="true"
                                        onClick={() => onAskThinkingModeChange(askThinkingMode === "on" ? "off" : "on")}
                                        disabled={isAskLoading}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black transition-colors",
                                            askThinkingMode === "on"
                                                ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                                                : "border-theme-border/20 bg-theme-surface text-theme-text-muted hover:bg-theme-active-bg",
                                        )}
                                    >
                                        <Lightbulb className="h-3 w-3" />
                                        深度思考 {askThinkingMode === "on" ? "开" : "关"}
                                    </button>
                                    <div className="inline-flex items-center gap-1 rounded-full border border-theme-border/10 bg-theme-surface p-0.5">
                                        <span className="pl-2 text-[10px] font-bold text-theme-text-muted">推理</span>
                                        {ASK_REASONING_EFFORT_OPTIONS.map((option) => (
                                            <button
                                                key={`ask-reasoning-${option.effort}`}
                                                type="button"
                                                data-ask-reasoning-effort={option.effort}
                                                onClick={() => onAskReasoningEffortChange(option.effort)}
                                                disabled={isAskLoading || askThinkingMode !== "on"}
                                                className={cn(
                                                    "rounded-full px-2 py-0.5 text-[10px] font-black transition-colors",
                                                    askReasoningEffort === option.effort
                                                        ? "bg-theme-active-hover text-theme-text shadow-sm"
                                                        : "text-theme-text-muted hover:bg-theme-active-bg",
                                                    askThinkingMode !== "on" && "opacity-45",
                                                )}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div
                                    data-ask-composer-input-row="true"
                                    className="flex items-center gap-2 rounded-full border border-theme-border/20 bg-theme-surface px-4 py-1.5 shadow-sm"
                                >
                                    <input
                                        type="text"
                                        value={question}
                                        onChange={(event) => onQuestionChange(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                                event.preventDefault();
                                                event.stopPropagation();
                                            }
                                        }}
                                        placeholder={selectedText ? "针对选中文本提问..." : "输入你的问题..."}
                                        className="w-full bg-transparent border-none text-sm font-medium text-theme-text placeholder:text-theme-text-muted/60 focus:outline-none focus:ring-0"
                                    />
                                    <motion.button
                                        type="button"
                                        data-selection-ask-send="true"
                                        onClick={onAsk}
                                        disabled={isAskLoading || !question.trim()}
                                        whileTap={{ scale: 0.95 }}
                                        className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 transition-all hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {isAskLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                    </motion.button>
                                </div>
                                {renderAskContextCard()}
                            </div>
                        )}
                    </div>
                ) : null}

                {(!isAskReplayMode && !isAskComposerOpen) && canDeleteNote ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <motion.button
                            type="button"
                            onClick={onEditNote}
                            disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                            whileTap={{ scale: 0.98 }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-[12px] border border-blue-500/20 bg-blue-500/10 px-2 py-2 text-xs font-black text-blue-600 transition-colors hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            编辑标注
                        </motion.button>
                        <motion.button
                            type="button"
                            onClick={onDeleteNote}
                            disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                            whileTap={{ scale: 0.98 }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-[12px] border border-rose-500/20 bg-rose-500/10 px-2 py-2 text-xs font-black text-rose-600 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            删除标注
                        </motion.button>
                    </div>
                ) : null}

                {(!isAskReplayMode && !isAskComposerOpen) && noteLayerHidden ? (
                    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] font-medium text-blue-700">
                        语法分析已开启，笔记高亮层暂时隐藏。关闭语法分析后会恢复显示。
                    </div>
                ) : null}

                {(!isAskReplayMode && !isAskComposerOpen) && (!noteLayerHidden && isEditingNote) ? (
                    <div className="mt-2 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-2 text-[11px] font-semibold text-cyan-700">
                        已选中已有标注，直接修改内容后保存即可更新。
                    </div>
                ) : null}

                {(!isAskReplayMode && !isAskComposerOpen) && isNoteComposerOpen && (
                    <div className="mt-3 space-y-2.5 rounded-[14px] border border-theme-border/30 bg-theme-surface p-3 shadow-sm">
                        <textarea
                            value={noteDraft}
                            onChange={(event) => onNoteDraftChange(event.target.value)}
                            placeholder="写下你的标注..."
                            className="h-20 w-full resize-none rounded-[12px] border border-theme-border/30 bg-theme-base-bg px-3 py-2 text-sm text-theme-text outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-theme-text-muted/60"
                        />
                        <div className="flex justify-end gap-2">
                            <motion.button
                                type="button"
                                onClick={onCancelNoteComposer}
                                whileTap={{ scale: 0.95 }}
                                className="rounded-[10px] border border-theme-border/50 bg-theme-base-bg px-3 py-1.5 text-xs font-black text-theme-text transition-colors hover:bg-theme-surface"
                            >
                                取消
                            </motion.button>
                            <motion.button
                                type="button"
                                onClick={onSaveNote}
                                disabled={!noteDraft.trim() || isSavingReadingNote}
                                whileTap={{ scale: 0.95 }}
                                className="rounded-[10px] bg-blue-500/10 px-3 py-1.5 text-xs font-black text-blue-600 transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSavingReadingNote ? "保存中..." : (isEditingNote ? "更新标注" : "保存标注")}
                            </motion.button>
                        </div>
                    </div>
                )}

                {(!isAskReplayMode && !isAskComposerOpen) && phraseAnalysis && (
                    <div className="mt-3 space-y-3 rounded-xl border border-theme-border/20 bg-theme-surface p-3">
                        {phraseAnalysis.translation ? (
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-600/80">
                                    <Globe className="h-3 w-3" />
                                    <span>中文翻译</span>
                                </div>
                                <p className="text-sm font-semibold text-stone-800">{phraseAnalysis.translation}</p>
                            </div>
                        ) : null}

                        {phraseAnalysis.grammar_point ? (
                            <div className="space-y-1 border-t border-stone-100 pt-2">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-blue-500/80">语法解析</div>
                                <p className="text-xs leading-relaxed text-stone-600">{phraseAnalysis.grammar_point}</p>
                            </div>
                        ) : null}

                        {phraseAnalysis.nuance ? (
                            <div className="rounded-lg border border-amber-100 bg-amber-50/70 px-2.5 py-2 text-xs italic text-amber-800">
                                {phraseAnalysis.nuance}
                            </div>
                        ) : null}

                        {Array.isArray(phraseAnalysis.vocabulary) && phraseAnalysis.vocabulary.length > 0 ? (
                            <div className="space-y-1 border-t border-stone-100 pt-2">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">核心词汇</div>
                                <div className="space-y-1">
                                    {phraseAnalysis.vocabulary.map((item, idx) => (
                                        <div key={`${item.word || "word"}-${idx}`} className="text-xs text-stone-600">
                                            <span className="font-semibold text-stone-800">{item.word || "词汇"}:</span> {item.definition || ""}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}

                {isAskDockMode ? (
                    <div
                        data-selection-ask-resize-handle="bottom-right"
                        aria-hidden="true"
                        className="absolute bottom-1.5 right-1.5 z-20 h-5 w-5 cursor-nwse-resize rounded-br-[1rem] opacity-55 transition-opacity hover:opacity-100"
                        onPointerDown={handleAskDockResizeStart}
                        onPointerMove={handleAskDockInteractionMove}
                        onPointerUp={handleAskDockInteractionEnd}
                        onPointerCancel={handleAskDockInteractionEnd}
                    >
                        <div className="absolute bottom-1 right-1 h-3 w-3 rounded-br-[0.55rem] border-b-2 border-r-2 border-theme-text-muted/45" />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
