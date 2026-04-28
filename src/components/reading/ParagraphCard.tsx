import React, { useLayoutEffect, useMemo, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Play, Pause, BookOpen, Mic, Languages, Loader2, MessageCircleQuestion, Send, PenTool, GripVertical, RotateCcw, Gauge, X, Sparkles, Globe, Highlighter, Underline, List, Lightbulb, GitBranch, Quote, CheckCircle2, Rocket, ChevronLeft, Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useReadingSettings } from "@/contexts/ReadingSettingsContext";
import { useTTS } from "@/hooks/useTTS";
import { usePretextMeasuredLayout } from "@/hooks/usePretextMeasuredLayout";
import { SpeakingPanel } from "./SpeakingPanel";
import { useAnalysisStore } from "@/lib/analysis-store";
import { SyntaxTreeView } from "./SyntaxTreeView";
import { bionicText } from "@/lib/bionic";
import { InlineGrammarHighlights } from "@/components/shared/InlineGrammarHighlights";
import { PretextTextarea } from "@/components/ui/PretextTextarea";
import { type GrammarDisplayMode, type GrammarSentenceAnalysis } from "@/lib/grammarHighlights";
import {
    buildGrammarCacheKey,
    GRAMMAR_BASIC_PROMPT_VERSION,
    GRAMMAR_DEEP_PROMPT_VERSION,
    sanitizeGrammarBasicPayload,
    sanitizeGrammarDeepSentencePayload,
    sentenceIdentity,
    type GrammarDeepSentenceResult,
} from "@/lib/grammar-analysis";
import { applyServerProfilePatchToLocal } from "@/lib/user-repository";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { getReadingCoinCost, INSUFFICIENT_READING_COINS, type ReadingEconomyAction } from "@/lib/reading-economy";
import { dispatchReadingCoinFx } from "@/lib/reading-coin-fx";
import { db, type ReadingMarkType, type ReadingNoteItem } from "@/lib/db";
import { requestTtsPayload, resolveTtsAudioBlob } from "@/lib/tts-client";
import {
    buildAskQaPairs,
    buildAskThreadPreview,
    decodeAskThreadPayload,
    encodeAskThreadPayload,
    resolveAskAssistantMessageParts,
    type AskQaPair,
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
import { getPressableStyle, getPressableTap } from "@/lib/pressable";
import { dispatchReadSelectionAskDockEvent } from "@/lib/read-selection-ask-dock";
import { AiRichMarkdown } from "@/components/shared/AiRichMarkdown";
import { readAskSseStream } from "@/lib/ask-sse";
import { AI_PROVIDER_RATE_LIMIT_ERROR_CODE } from "@/lib/ai-provider-errors";

interface ParagraphCardProps {
    text: string;
    index: number;
    paragraphOrder?: number;
    articleTitle?: string;
    articleUrl?: string;
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

type SelectionPopupMode = "selection" | "ask" | "ask-replay";
type AskAnswerMode = "default" | "short" | "detailed";

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

const normalizeAskThreadMessages = (raw: unknown): AskThreadMessage[] => {
    const source = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === "object" && Array.isArray((raw as { messages?: unknown[] }).messages)
            ? (raw as { messages: unknown[] }).messages
            : []);
    return source
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const role = (item as { role?: unknown }).role;
            const content = (item as { content?: unknown }).content;
            const reasoningContent = (item as { reasoningContent?: unknown }).reasoningContent;
            const createdAt = (item as { createdAt?: unknown }).createdAt;
            if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
                return null;
            }
            return {
                role,
                content,
                createdAt: Number.isFinite(createdAt) ? Number(createdAt) : Date.now(),
                ...(typeof reasoningContent === "string" && reasoningContent.trim()
                    ? { reasoningContent: reasoningContent.trim() }
                    : {}),
            } as AskThreadMessage;
        })
        .filter((item): item is AskThreadMessage => Boolean(item));
};

const normalizeHighlightColor = (rawColor: string | undefined) => {
    if (!rawColor) return LEGACY_HIGHLIGHT_COLOR_MAP.mint;
    return LEGACY_HIGHLIGHT_COLOR_MAP[rawColor] ?? rawColor;
};

const isRangeOverlapping = (startA: number, endA: number, startB: number, endB: number) => (
    startA < endB && startB < endA
);

function AskReasoningBlock({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
    const normalized = content.trim();
    if (!normalized) return null;

    return (
        <details className="group mb-3 overflow-hidden rounded-[14px] border border-indigo-200/50 bg-indigo-50/45 text-indigo-950 shadow-sm" open={isStreaming}>
            <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2 text-[12px] font-black">
                <span className="inline-flex min-w-0 items-center gap-2">
                    {isStreaming ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-500" /> : <Lightbulb className="h-3.5 w-3.5 shrink-0 text-indigo-500" />}
                    <span>{isStreaming ? "正在思考" : "思考过程"}</span>
                </span>
                <span className="text-[10px] font-bold text-indigo-400">展开</span>
            </summary>
            <div className="whitespace-pre-wrap border-t border-indigo-200/50 px-3 py-2.5 text-[12px] leading-6 text-indigo-900/85">
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
    readingNotes = [],
    onCreateReadingNote,
    onDeleteReadingMarks,
    onSnapshotDirty,
    onWordClick,
    onOpenWordPopupFromSelection,
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
    const { fontSizeClass, isBionicMode } = useReadingSettings();
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const grammarExecutionSignature = useMemo(() => {
        const provider = profile?.ai_provider ?? "deepseek";
        if (provider === "github") {
            return `${provider}:${profile?.github_model ?? "openai/gpt-4.1"}`;
        }
        if (provider === "nvidia") {
            return `${provider}:${profile?.nvidia_model ?? "z-ai/glm5"}`;
        }
        if (provider === "glm") {
            return provider;
        }
        const deepSeekModel = profile?.deepseek_model ?? "deepseek-v4-flash";
        const deepSeekThinkingMode = profile?.deepseek_thinking_mode ?? "off";
        const deepSeekReasoningEffort = deepSeekThinkingMode === "on"
            ? (profile?.deepseek_reasoning_effort ?? "high")
            : "off";
        return `${provider}:${deepSeekModel}:thinking=${deepSeekThinkingMode}:reasoning=${deepSeekReasoningEffort}`;
    }, [
        profile?.ai_provider,
        profile?.deepseek_model,
        profile?.deepseek_reasoning_effort,
        profile?.deepseek_thinking_mode,
        profile?.github_model,
        profile?.nvidia_model,
    ]);
    const grammarBasicCacheKey = buildGrammarCacheKey({
        text,
        mode: "basic",
        promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
        model: grammarExecutionSignature,
    });
    const grammarDeepCacheKey = buildGrammarCacheKey({
        text,
        mode: "deep",
        promptVersion: GRAMMAR_DEEP_PROMPT_VERSION,
        model: `${grammarExecutionSignature}:deep`,
    });
    const {
        translations, setTranslation: setStoreTranslation,
        grammarAnalyses, setGrammarAnalysis: setStoreGrammarAnalysis,
        loadFromDB,
        loadGrammarFromDB,
    } = useAnalysisStore();

    // Local visibility state
    const [showTranslation, setShowTranslation] = useState(false);
    const [showGrammar, setShowGrammar] = useState(false);
    const [grammarDisplayMode, setGrammarDisplayMode] = useState<GrammarDisplayMode>("core");
    const [isGrammarLayoutMode, setIsGrammarLayoutMode] = useState(false);
    const [isReadingLayoutMode, setIsReadingLayoutMode] = useState(false);
    const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);
    const [activeListenSentenceIndex, setActiveListenSentenceIndex] = useState(0);

    const [isTranslating, setIsTranslating] = useState(false);
    const [isAnalyzingGrammar, setIsAnalyzingGrammar] = useState(false);
    const [isAnalyzingDeepGrammar, setIsAnalyzingDeepGrammar] = useState(false);

    // Load from DB on mount
    useEffect(() => {
        loadFromDB(text, grammarBasicCacheKey);
    }, [text, grammarBasicCacheKey, loadFromDB]);
    useEffect(() => {
        loadGrammarFromDB(grammarDeepCacheKey);
    }, [grammarDeepCacheKey, loadGrammarFromDB]);

    // Derived data from store
    const translation = translations[text];
    const grammarAnalysis = grammarAnalyses[grammarBasicCacheKey] as GrammarBasicCachePayload | undefined;
    const grammarAssessment = useMemo(
        () => sanitizeGrammarBasicPayload(grammarAnalysis ?? null, text),
        [grammarAnalysis, text],
    );
    const hasUsableGrammarAnalysis = !grammarAssessment.retryRecommended
        && grammarAssessment.data.difficult_sentences.length > 0;
    const grammarHighlightSentences = useMemo(() => (
        hasUsableGrammarAnalysis
            ? grammarAssessment.data.difficult_sentences
            : []
    ), [grammarAssessment.data.difficult_sentences, hasUsableGrammarAnalysis]);
    const grammarDeepCachePayload = grammarAnalyses[grammarDeepCacheKey] as {
        mode?: "deep";
        bySentence?: Record<string, GrammarDeepSentenceResult>;
    } | undefined;
    const deepBySentence = useMemo(() => {
        const cached = grammarDeepCachePayload?.bySentence ?? {};
        const entries = Object.entries(cached).filter(([, value]) => {
            if (!value?.sentence) return false;
            return !sanitizeGrammarDeepSentencePayload(value, value.sentence).retryRecommended;
        });
        return Object.fromEntries(entries) as Record<string, GrammarDeepSentenceResult>;
    }, [grammarDeepCachePayload?.bySentence]);
    const paragraphAskCacheKey = useMemo(() => {
        const normalizedUrl = typeof articleUrl === "string" ? articleUrl.trim() : "";
        const normalizedTitle = typeof articleTitle === "string" ? articleTitle.trim().toLowerCase() : "";
        const articleKey = normalizedUrl || `title:${normalizedTitle || "untitled"}`;
        return `ask:${articleKey}:p${paragraphOrder || index}`;
    }, [articleTitle, articleUrl, index, paragraphOrder]);

    // Ask AI State - Multi-turn chat with streaming
    const [isAskOpen, setIsAskOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [askAnswerMode, setAskAnswerMode] = useState<AskAnswerMode>("default");
    const [messages, setMessages] = useState<AskThreadMessage[]>([]);
    const [isAskLoading, setIsAskLoading] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [streamingReasoningContent, setStreamingReasoningContent] = useState("");
    const qaPairs = useMemo(
        () => buildAskQaPairs(messages, streamingContent, isAskLoading, streamingReasoningContent),
        [isAskLoading, messages, streamingContent, streamingReasoningContent],
    );
    const [expandedAskQaIds, setExpandedAskQaIds] = useState<number[]>(() => 
        qaPairs.length > 0 ? [qaPairs[qaPairs.length - 1].id] : []
    );
    const previousAskQaCountRef = useRef(qaPairs.length);
    useEffect(() => {
        if (qaPairs.length > previousAskQaCountRef.current) {
            const newIds = qaPairs.slice(previousAskQaCountRef.current).map((p) => p.id);
            if (newIds.length > 0) {
                setExpandedAskQaIds(newIds);
            }
        }
        previousAskQaCountRef.current = qaPairs.length;
    }, [qaPairs]);

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
    const [activeGrammarSentenceIndex, setActiveGrammarSentenceIndex] = useState(0);
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
    const [selectionPopupMode, setSelectionPopupMode] = useState<SelectionPopupMode>("selection");
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
    const [hoveredNoteId, setHoveredNoteId] = useState<number | null>(null);
    const [pressedAskNoteId, setPressedAskNoteId] = useState<number | null>(null);
    const [readingCoinHint, setReadingCoinHint] = useState<string | null>(null);

    const pRef = useRef<HTMLDivElement>(null);
    const sentenceAudioRef = useRef<HTMLAudioElement | null>(null);
    const sentenceAudioIndexRef = useRef<number | null>(null);
    const sentenceAudioCacheRef = useRef<Map<number, SentenceAudioCacheEntry>>(new Map());
    const sentenceAudioInflightRef = useRef<Map<number, Promise<SentenceAudioCacheEntry>>>(new Map());
    const sentenceProgressRafRef = useRef<number | null>(null);
    const sentenceProgressLastUiTsRef = useRef(0);
    const wordLayoutCacheRef = useRef<Map<string, WordLayoutToken[]>>(new Map());
    const askReplayOpenTimeoutRef = useRef<number | null>(null);

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
        };
    }, []);

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
    const sentenceUnitsRef = useRef(sentenceUnits);
    useEffect(() => {
        sentenceUnitsRef.current = sentenceUnits;
    }, [sentenceUnits]);
    const grammarLayoutLines = useMemo(() => {
        const fromGrammarAnalysis = grammarHighlightSentences
            .map((item) => item?.sentence?.trim() ?? "")
            .filter(Boolean);
        if (fromGrammarAnalysis.length > 0) return fromGrammarAnalysis;

        return sentenceUnits
            .map((unit) => unit.text.trim())
            .filter(Boolean);
    }, [grammarHighlightSentences, sentenceUnits]);

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

        const tokenRegex = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;
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
            sentenceAudioRef.current.onplay = null;
            sentenceAudioRef.current.onpause = null;
            sentenceAudioRef.current.onended = null;
            sentenceAudioRef.current.onloadedmetadata = null;
            sentenceAudioRef.current = null;
        }

        sentenceAudioIndexRef.current = null;
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

    const playSentence = useCallback(async (sentenceIndex: number) => {
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
                if (!existingAudio.paused) {
                    existingAudio.pause();
                    setIsSentencePlaying(false);
                    return;
                }

                existingAudio.playbackRate = playbackRate;
                await existingAudio.play();
                setIsSentencePlaying(true);
                return;
            }

            clearSentencePlayback();

            const audio = new Audio(targetUrl);
            sentenceAudioRef.current = audio;
            sentenceAudioIndexRef.current = sentenceIndex;

            audio.onloadedmetadata = () => {
                setSentenceDurationMs((audio.duration || 0) * 1000);
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
        if (!isSpeakingOpen) return;
        preload();
        void warmupAllSentenceAudio();
    }, [isSpeakingOpen, preload, warmupAllSentenceAudio]);

    useEffect(() => {
        if (isSpeakingOpen) return;
        setIsSegmentListOpen((prev) => (prev ? false : prev));
        setPlayMode((prev) => (prev === "sentence" ? "full" : prev));
        stopSentencePlayback();
    }, [isSpeakingOpen, stopSentencePlayback]);

    useEffect(() => {
        if (!showGrammar) return;
        setIsNoteComposerOpen(false);
        setNoteDraft("");
        setHoveredReadingNote(null);
    }, [showGrammar]);

    useEffect(() => {
        const shouldDockSelectionAsk = Boolean(selectionRect) && (
            selectionPopupMode === "ask" || selectionPopupMode === "ask-replay"
        );
        dispatchReadSelectionAskDockEvent(shouldDockSelectionAsk);
        return () => {
            if (shouldDockSelectionAsk) {
                dispatchReadSelectionAskDockEvent(false);
            }
        };
    }, [selectionPopupMode, selectionRect]);

    useEffect(() => {
        if (!showGrammar) {
            setIsGrammarLayoutMode(false);
        }
    }, [showGrammar]);

    useEffect(() => {
        setSentenceBoundaries(buildAutoSentenceBoundaries(text));
        setActiveListenSentenceIndex(0);
        setIsSegmentListOpen(false);
        setPlayMode("full");
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
        if (!isPlaybackSessionActive) return;
        if (!activeSentenceUnit) return;

        const linkedMarkIndex = activeSentenceTokenToMark.get(tokenIndex);
        if (linkedMarkIndex !== undefined) {
            const mark = activeSentenceMarks[linkedMarkIndex];
            if (mark) {
                await seekSentenceMs(mark.start, { autoplay: true });
                return;
            }
        }

        const fallbackToken = activeSentenceWordTokens[tokenIndex];
        if (!fallbackToken || sentenceDurationMs <= 0) return;

        const fallbackTimeMs = (fallbackToken.start / Math.max(1, activeSentenceUnit.text.length)) * sentenceDurationMs;
        await seekSentenceMs(fallbackTimeMs, { autoplay: true });
    }, [
        activeSentenceMarks,
        activeSentenceTokenToMark,
        activeSentenceUnit,
        activeSentenceWordTokens,
        isPlaybackSessionActive,
        seekSentenceMs,
        sentenceDurationMs,
    ]);

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
            const smoothTailMs = 90;
            const isCurrent = Boolean(linkedMark && currentMs >= linkedMark.start && currentMs < linkedMark.end + smoothTailMs);
            const isPlayed = Boolean(linkedMark && currentMs >= linkedMark.end + smoothTailMs);
            const wordText = token.text;

            nodes.push(
                <span
                    key={`word-${start}-${end}-${tokenIndex}`}
                    data-ktv-word-index={tokenIndex}
                    onClick={(event) => {
                        if (!isSeekEnabled) return;
                        event.preventDefault();
                        event.stopPropagation();
                        void onWordSeek(tokenIndex);
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

    const renderCharacterFallback = useCallback((sourceText: string, currentMs: number, totalMs: number) => {
        const chars = sourceText.split("");
        const totalChars = Math.max(1, sourceText.length);
        const progress = totalMs > 0 ? currentMs / totalMs : 0;
        const highlightedChars = progress * totalChars;

        return (
            <span>
                {chars.map((char, charIndex) => (
                    <span
                        key={`${char}-${charIndex}`}
                        className={cn(
                            "transition-colors duration-75",
                            charIndex < highlightedChars ? "text-amber-600" : "text-stone-400",
                        )}
                    >
                        {char}
                    </span>
                ))}
            </span>
        );
    }, []);

    const renderSegmentedSentenceList = useCallback(() => {
        if (sentenceUnits.length === 0) return <span>{text}</span>;

        return (
            <div className="space-y-2">
                <div className="text-[11px] text-stone-400">提示：点击左侧编号可播放该句</div>
                <ul className="space-y-1.5">
                {sentenceUnits.map((unit, unitIndex) => {
                    const isSentenceActive = playMode === "sentence" && unitIndex === activeListenSentenceIndex;
                    const showSentenceKtv = isSentenceActive && isPlaybackSessionActive;

                    return (
                        <li
                            key={`segment-line-${unit.start}-${unit.end}`}
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
                                    setActiveListenSentenceIndex(unitIndex);
                                    void playSentence(unitIndex);
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
                            <div className={cn("min-w-0 flex-1", playMode === "sentence" && "cursor-pointer")}>
                                {showSentenceKtv ? (
                                    activeSentenceMarks.length > 0 ? (
                                        renderWordLevelKtv({
                                            sourceText: unit.text,
                                            marks: activeSentenceMarks,
                                            tokenToMark: activeSentenceTokenToMark,
                                            currentMs: playbackTimeMs,
                                            isSeekEnabled: isPlaybackSessionActive,
                                            onWordSeek: handleSentenceWordSeek,
                                        })
                                    ) : (
                                        renderCharacterFallback(unit.text, playbackTimeMs, playbackDurationMs)
                                    )
                                ) : (
                                    <span className={cn(isSentenceActive ? "text-stone-900" : "text-stone-700")}>
                                        {unit.text}
                                    </span>
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
        handleSentenceWordSeek,
        playSentence,
        playbackDurationMs,
        isPlaybackSessionActive,
        playbackTimeMs,
        playMode,
        renderCharacterFallback,
        renderWordLevelKtv,
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
                    const isNoteHovered = Boolean(showNoteVisual && noteMarker?.id && hoveredNoteId === noteMarker.id);
                    const isAskHovered = Boolean(showAskVisual && askMarker?.id && hoveredNoteId === askMarker.id);
                    const isAnalyzeHovered = Boolean(showAnalyzeVisual && analyzeMarker?.id && hoveredNoteId === analyzeMarker.id);
                    const markStyle: React.CSSProperties | undefined = showHighlightVisual
                        ? { backgroundColor: highlightColor }
                        : undefined;

                    return (
                        <span
                            key={`${baseOffset}-${start}-${end}`}
                            className={cn(
                                "rounded-[3px] px-[1px] transition-colors",
                                showHighlightVisual && "ring-1 ring-black/5",
                                hasUnderlineVisible && "underline decoration-fuchsia-500 decoration-2 underline-offset-[3px]",
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
                                    if (analyzeMarker.id) setHoveredNoteId(analyzeMarker.id);
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
                                    } catch (e) {
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
                                    setHoveredNoteId(null);
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
                                        } catch (e) {
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

                        {/* Content Block */}
                        <div data-segment-content="true" className="leading-[1.7] text-[15px] tracking-[0.015em] relative flex-1 text-theme-text">
                            {renderTextWithReadingMarks(unit.text, undefined, unit.start, locateMarkerRange)}
                        </div>
                    </motion.div>
                    );
                })}
            </motion.div>
        );
    };

    const renderGrammarLayoutList = useCallback(() => {
        const renderGrammarSentenceBadge = (index: number, translation?: string) => (
            <span className="group/trans-icon relative mt-[0.24em] inline-flex h-5 w-5 shrink-0 select-none align-top">
                <span
                    tabIndex={0}
                    role="button"
                    className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[#ecdab5] bg-[linear-gradient(180deg,#fff8e8,#f7e7be)] font-sans text-[10px] font-bold text-amber-700 shadow-[0_4px_14px_rgba(180,134,43,0.16)] transition-[border-color,box-shadow,background-color,color] duration-150 hover:border-amber-400 hover:bg-[linear-gradient(180deg,#fff2d2,#f3d487)] hover:text-amber-800 hover:ring-2 hover:ring-amber-200/60 hover:shadow-[0_8px_20px_rgba(180,134,43,0.28)] focus-visible:border-amber-400 focus-visible:bg-[linear-gradient(180deg,#fff2d2,#f3d487)] focus-visible:text-amber-800 focus-visible:ring-2 focus-visible:ring-amber-200/60 focus-visible:shadow-[0_8px_20px_rgba(180,134,43,0.28)]"
                    aria-label={`第 ${index + 1} 句`}
                >
                    {index + 1}
                </span>
                {translation ? (
                    <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-3 w-80 rounded-[22px] border border-stone-200/90 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(250,247,240,0.96))] p-4 text-left opacity-0 shadow-[0_18px_44px_rgba(28,25,23,0.16)] transition-opacity duration-150 ease-out group-hover/trans-icon:opacity-100 group-focus-within/trans-icon:opacity-100">
                        <span className="mb-2 flex items-center justify-between border-b border-stone-200/80 pb-2">
                            <span className="font-sans text-[10px] font-bold uppercase tracking-[0.24em] text-amber-700">
                                第 {index + 1} 句
                            </span>
                            <span className="rounded-full border border-stone-200/80 bg-white/80 px-2 py-0.5 font-sans text-[10px] font-medium text-stone-500">
                                译文
                            </span>
                        </span>
                        <span className="block font-sans text-sm leading-6 text-stone-700">
                            {translation}
                        </span>
                    </span>
                ) : null}
            </span>
        );

        if (grammarHighlightSentences.length === 0) {
            if (grammarLayoutLines.length === 0) {
                return <span className="text-stone-700">{text}</span>;
            }

            return (
                <ul className="list-none space-y-2 pl-0">
                    {grammarLayoutLines.map((line, index) => (
                        <li
                            key={`grammar-layout-fallback-${index}-${line.slice(0, 20)}`}
                            className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2.5"
                        >
                            {renderGrammarSentenceBadge(index)}
                            <span className="min-w-0 text-stone-800 leading-[1.48]">{line}</span>
                        </li>
                    ))}
                </ul>
            );
        }

        return (
            <ul className="list-none space-y-2 pl-0">
                {grammarHighlightSentences.map((item, index) => {
                    const sentenceText = item?.sentence?.trim() ?? "";
                    if (!sentenceText) return null;

                    return (
                        <li
                            key={`grammar-layout-highlight-${index}-${sentenceText.slice(0, 20)}`}
                            className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2.5"
                        >
                            {renderGrammarSentenceBadge(index, item.translation)}
                            <span className="min-w-0 text-stone-800 leading-[1.48]">
                                <InlineGrammarHighlights
                                    text={sentenceText}
                                    sentences={[item]}
                                    displayMode={grammarDisplayMode}
                                    showSegmentTranslation
                                />
                            </span>
                        </li>
                    );
                })}
            </ul>
        );
    }, [grammarDisplayMode, grammarHighlightSentences, grammarLayoutLines, text]);

    const renderAskMarkdown = (content: string) => (
        <AiRichMarkdown content={content} />
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

        if (typeof readingCoins.balance === "number") {
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

    const persistParagraphAskThread = useCallback(async (nextMessages: AskThreadMessage[]) => {
        if (!paragraphAskCacheKey) return;
        const existing = await db.ai_cache.where("[key+type]").equals([paragraphAskCacheKey, "ask_ai"]).first();
        await db.ai_cache.put({
            id: existing?.id,
            key: paragraphAskCacheKey,
            type: "ask_ai",
            data: {
                messages: nextMessages,
                paragraphOrder,
                updatedAt: Date.now(),
            },
            timestamp: Date.now(),
        });
        onSnapshotDirty?.();
    }, [onSnapshotDirty, paragraphAskCacheKey, paragraphOrder]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const cached = await db.ai_cache.where("[key+type]").equals([paragraphAskCacheKey, "ask_ai"]).first();
                if (cancelled || !cached) return;
                const hydratedMessages = normalizeAskThreadMessages(cached.data);
                if (hydratedMessages.length > 0) {
                    setMessages(hydratedMessages);
                }
            } catch (error) {
                console.error("Failed to hydrate paragraph Ask cache:", error);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [paragraphAskCacheKey]);

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
    ) => {
        if (!onCreateReadingNote) return;
        const targetOffsets = offsets ?? selectionOffsets;
        if (!targetOffsets) return;

        const sourceText = (explicitSelectedText ?? selectedText ?? "").trim();
        if (!sourceText) return;

        await onCreateReadingNote({
            paragraphOrder,
            paragraphBlockIndex: index,
            selectedText: sourceText,
            noteText: encodeAskThreadPayload(nextMessages),
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
        setPhraseAnalysis(null);
        setIsNoteComposerOpen(false);
        setNoteDraft("");
        setSelectionAskQuestion("");
        setSelectionAskStreamingContent("");
        setSelectionAskMessages(thread.messages);
        setSelectionAskAutoOpenToken((prev) => prev + 1);
        setHoveredReadingNote(null);
    }, [text]);

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
        setSelectionAskMessages(existingAskThread.messages);
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
                setReadingCoinHint("阅读币不足，完成阅读或测验可获得阅读币。");
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
        if (!forceRegenerate && translation) {
            setShowTranslation(!showTranslation); // Toggle visibility
            return;
        }

        if (!forceRegenerate && showTranslation) {
            setShowTranslation(false);
            return;
        }

        setShowTranslation(true);
        setIsTranslating(true);
        setReadingCoinHint(null);
        try {
            const res = await fetch("/api/ai/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text,
                    context: text,
                    economyContext: readEconomyContext("translate"),
                }),
            });
            const data = await res.json();
            if (!res.ok && data?.errorCode === INSUFFICIENT_READING_COINS) {
                setReadingCoinHint("阅读币不足，当前无法翻译。");
                setShowTranslation(false);
                return;
            }
            await syncReadingBalance(data, "translate");
            setStoreTranslation(text, data.translation);
        } catch (err) {
            console.error(err);
        } finally {
            setIsTranslating(false);
        }
    };

    useEffect(() => {
        setActiveGrammarSentenceIndex(0);
        setShowDeepAnalysis(false);
    }, [grammarBasicCacheKey]);

    const ensureDeepAnalysisForSentence = async (sentence: string, forceRegenerate = false) => {
        const normalizedSentence = sentence.trim();
        if (!normalizedSentence) return;
        const sentenceKey = sentenceIdentity(normalizedSentence);
        if (!forceRegenerate && deepBySentence[sentenceKey]) return;

        setIsAnalyzingDeepGrammar(true);
        setReadingCoinHint(null);
        try {
            const res = await fetch("/api/ai/grammar/deep", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text,
                    sentence: normalizedSentence,
                    forceRegenerate,
                    economyContext: readEconomyContext("grammar_deep", `${grammarDeepCacheKey}:${sentenceKey}`),
                }),
            });
            const data = await res.json();
            if (!res.ok && data?.errorCode === INSUFFICIENT_READING_COINS) {
                setReadingCoinHint("阅读币不足，当前无法进行深度语法分析。");
                return;
            }
            if (!res.ok) {
                throw new Error(data?.error || "深度语法分析失败");
            }

            await syncReadingBalance(data, "grammar_deep");

            const nextBySentence = { ...deepBySentence };
            const deepSentences = Array.isArray(data?.difficult_sentences) ? data.difficult_sentences : [];
            deepSentences.forEach((item: unknown) => {
                if (!item || typeof item !== "object") return;
                const sentenceText = typeof (item as { sentence?: unknown }).sentence === "string"
                    ? (item as { sentence: string }).sentence
                    : normalizedSentence;
                const key = sentenceIdentity(sentenceText);
                nextBySentence[key] = item as GrammarDeepSentenceResult;
            });

            setStoreGrammarAnalysis(grammarDeepCacheKey, {
                mode: "deep",
                bySentence: nextBySentence,
            });
            onSnapshotDirty?.();
        } catch (err) {
            console.error(err);
            setReadingCoinHint(err instanceof Error ? err.message : "深度语法分析暂时不可用，请稍后重试。");
        } finally {
            setIsAnalyzingDeepGrammar(false);
        }
    };

    const handleGrammarAnalysis = async (forceRegenerate = false) => {
        if (!forceRegenerate && hasUsableGrammarAnalysis) {
            const nextShowGrammar = !showGrammar;
            setShowGrammar(nextShowGrammar);
            if (nextShowGrammar) {
                setGrammarDisplayMode("core");
                setIsGrammarLayoutMode(true);
            } else {
                setShowDeepAnalysis(false);
            }
            return;
        }

        if (!forceRegenerate && showGrammar) {
            setShowGrammar(false);
            setShowDeepAnalysis(false);
            return;
        }

        setShowGrammar(true);
        setGrammarDisplayMode("core");
        setIsGrammarLayoutMode(true);

        setIsAnalyzingGrammar(true);
        setReadingCoinHint(null);
        try {
            const res = await fetch("/api/ai/grammar/basic", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text,
                    forceRegenerate,
                    economyContext: readEconomyContext("grammar_basic", grammarBasicCacheKey),
                }),
            });
            const data = await res.json();
            if (!res.ok && data?.errorCode === INSUFFICIENT_READING_COINS) {
                setReadingCoinHint("阅读币不足，当前无法进行语法分析。");
                setShowGrammar(false);
                return;
            }
            if (!res.ok) {
                throw new Error(data?.error || "语法分析暂时不可用");
            }
            await syncReadingBalance(data, "grammar_basic");

            setStoreGrammarAnalysis(grammarBasicCacheKey, data);
            setActiveGrammarSentenceIndex(0);
            setShowDeepAnalysis(false);
            setIsGrammarLayoutMode(true);
            onSnapshotDirty?.();
        } catch (err) {
            console.error(err);
            setReadingCoinHint(err instanceof Error ? err.message : "语法分析暂时不可用，请稍后重试。");
            setShowGrammar(false);
        } finally {
            setIsAnalyzingGrammar(false);
        }
    };

    const handleToggleDeepAnalysis = () => {
        setShowDeepAnalysis((prev) => !prev);
    };

    const handleDeepSentenceChange = (nextIndex: number) => {
        setActiveGrammarSentenceIndex(nextIndex);
    };

    const grammarSentences = grammarHighlightSentences;
    const grammarModeLabel = grammarDisplayMode === "core" ? "主干视图" : "完整视图";
    const activeGrammarSentence = grammarSentences[activeGrammarSentenceIndex]?.sentence?.trim() ?? "";
    const activeDeepSentence = activeGrammarSentence
        ? deepBySentence[sentenceIdentity(activeGrammarSentence)]
        : null;
    const shouldRenderGrammarLayer = showGrammar && !highlightSnippet;
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

    const handleAskAI = async (overrideQuestion?: string) => {
        const userMessage = (overrideQuestion ?? question).trim();
        if (!userMessage) return;

        const optimisticMessages: AskThreadMessage[] = [
            ...messages,
            { role: "user", content: userMessage, createdAt: Date.now() },
        ];
        setMessages(optimisticMessages);
        setQuestion(""); // Clear input immediately
        setIsAskLoading(true);
        setStreamingContent("");
        setStreamingReasoningContent("");
        setReadingCoinHint(null);

        try {
            await persistParagraphAskThread(optimisticMessages);
        } catch (persistError) {
            console.error("Failed to persist paragraph ask user message:", persistError);
        }

        try {
            const selectionText = selectedText ?? "";
            const retrievedVocab = await recallAskVocabulary(userMessage, selectionText);
            const res = await fetch("/api/ai/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text,
                    question: userMessage,
                    messages: optimisticMessages.map(m => ({ role: m.role, content: m.content })),
                    selection: selectionText,
                    retrievedVocab,
                    answerMode: askAnswerMode,
                    economyContext: readEconomyContext("ask_ai"),
                }),
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                if (payload?.errorCode === INSUFFICIENT_READING_COINS) {
                    setReadingCoinHint("阅读币不足，当前无法 Ask AI。");
                    const insufficientMessages: AskThreadMessage[] = [
                        ...optimisticMessages,
                        { role: "assistant", content: "阅读币不足，请先完成阅读或测验获取阅读币。", createdAt: Date.now() },
                    ];
                    setMessages(insufficientMessages);
                    await persistParagraphAskThread(insufficientMessages);
                    return;
                }
                const failureContent = resolveAskFailureMessage(payload);
                const failureMessages: AskThreadMessage[] = [
                    ...optimisticMessages,
                    { role: "assistant", content: failureContent, createdAt: Date.now() },
                ];
                if (isAskRateLimitPayload(payload)) {
                    console.warn("Ask AI temporarily rate limited:", payload);
                }
                setMessages(failureMessages);
                await persistParagraphAskThread(failureMessages);
                return;
            }

            const readingBalanceHeader = res.headers.get("x-reading-coins-balance");
            if (readingBalanceHeader) {
                const balanceValue = Number(readingBalanceHeader);
                if (Number.isFinite(balanceValue)) {
                    await applyServerProfilePatchToLocal({ reading_coins: balanceValue });
                }
            }
            const readingDeltaHeader = Number(res.headers.get("x-reading-coins-delta") ?? 0);
            const readingAppliedHeader = res.headers.get("x-reading-coins-applied") === "1";
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
                        setStreamingContent(fullContent);
                    },
                    onReasoningContent: (content) => {
                        fullReasoningContent += content;
                        setStreamingReasoningContent(fullReasoningContent);
                    },
                });
            }

            // Add completed message to history
            const assistantMessageParts = resolveAskAssistantMessageParts(fullContent, fullReasoningContent);
            const finalizedMessages: AskThreadMessage[] = [
                ...optimisticMessages,
                {
                    role: "assistant",
                    ...assistantMessageParts,
                    createdAt: Date.now(),
                },
            ];
            setMessages(finalizedMessages);
            setStreamingContent("");
            setStreamingReasoningContent("");
            await persistParagraphAskThread(finalizedMessages);
        } catch (err) {
            console.error(err);
            const failureMessages: AskThreadMessage[] = [
                ...optimisticMessages,
                { role: "assistant", content: "抱歉，出错了。请再试一次。", createdAt: Date.now() },
            ];
            setMessages(failureMessages);
            setStreamingContent("");
            setStreamingReasoningContent("");
            try {
                await persistParagraphAskThread(failureMessages);
            } catch (persistError) {
                console.error("Failed to persist paragraph ask failure message:", persistError);
            }
        } finally {
            setIsAskLoading(false);
        }
    };

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

        setSelectionPopupMode("ask");
        setPhraseAnalysis(null);
        setSelectionAskQuestion("");
        setSelectionAskStreamingContent("");
        setSelectionAskStreamingReasoningContent("");
        setSelectionAskMessages(existingMessages);
        setIsSelectionAskLoading(false);
        setReadingCoinHint(null);
        setSelectionAskAutoOpenToken(Date.now());

        if (existingMessages.length > 0) {
            return;
        }

        const autoQuestion = "请翻译这句话，并解析它的核心语法结构与词汇搭配。";
        void handleSelectionAskAI(autoQuestion, textStr, offsets, existingMessages);
    };

    const handleSelectionAskAI = async (
        overrideMessage?: string,
        overrideText?: string,
        overrideOffsets?: { startOffset: number; endOffset: number },
        overrideMessages?: AskThreadMessage[]
    ) => {
        const userMessage = (overrideMessage !== undefined ? overrideMessage : selectionAskQuestion).trim();
        if (!userMessage) return;

        const targetText = overrideText ?? selectedText;
        const targetOffsets = overrideOffsets ?? selectionOffsets;
        const baseMessages = overrideMessages ?? selectionAskMessages;

        if (!targetText || !targetOffsets) {
            await handleAskAI(userMessage);
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
            await persistAskThreadForSelection(optimisticMessages, targetOffsets, targetText);
        } catch (error) {
            console.error("Failed to persist ask user message:", error);
        }

        try {
            const retrievedVocab = await recallAskVocabulary(userMessage, targetText);
            const res = await fetch("/api/ai/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text,
                    question: userMessage,
                    messages: optimisticMessages.map(m => ({ role: m.role, content: m.content })),
                    selection: targetText,
                    retrievedVocab,
                    answerMode: askAnswerMode,
                    economyContext: readEconomyContext("ask_ai", targetText.slice(0, 42).toLowerCase()),
                }),
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                if (payload?.errorCode === INSUFFICIENT_READING_COINS) {
                    const insufficientMessage: AskThreadMessage = {
                        role: "assistant",
                        content: "阅读币不足，请先完成阅读或测验获取阅读币。",
                        createdAt: Date.now(),
                    };
                    const insufficientMessages = [...optimisticMessages, insufficientMessage];
                    setReadingCoinHint("阅读币不足，当前无法 Ask AI。");
                    setSelectionAskMessages(insufficientMessages);
                    await persistAskThreadForSelection(insufficientMessages, targetOffsets, targetText);
                    return;
                }
                const failureContent = resolveAskFailureMessage(payload);
                const failureMessages: AskThreadMessage[] = [
                    ...optimisticMessages,
                    { role: "assistant", content: failureContent, createdAt: Date.now() },
                ];
                if (isAskRateLimitPayload(payload)) {
                    console.warn("Ask AI temporarily rate limited:", payload);
                }
                setSelectionAskMessages(failureMessages);
                await persistAskThreadForSelection(failureMessages, targetOffsets, targetText);
                return;
            }

            const readingBalanceHeader = res.headers.get("x-reading-coins-balance");
            if (readingBalanceHeader) {
                const balanceValue = Number(readingBalanceHeader);
                if (Number.isFinite(balanceValue)) {
                    await applyServerProfilePatchToLocal({ reading_coins: balanceValue });
                }
            }
            const readingDeltaHeader = Number(res.headers.get("x-reading-coins-delta") ?? 0);
            const readingAppliedHeader = res.headers.get("x-reading-coins-applied") === "1";
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
            await persistAskThreadForSelection(finalizedMessages, targetOffsets, targetText);
        } catch (error) {
            console.error(error);
            const failureMessages: AskThreadMessage[] = [
                ...optimisticMessages,
                { role: "assistant", content: "抱歉，出错了。请再试一次。", createdAt: Date.now() },
            ];
            setSelectionAskMessages(failureMessages);
            setSelectionAskStreamingContent("");
            setSelectionAskStreamingReasoningContent("");
            try {
                await persistAskThreadForSelection(failureMessages, targetOffsets, targetText);
            } catch (persistError) {
                console.error("Failed to persist ask failure message:", persistError);
            }
        } finally {
            setIsSelectionAskLoading(false);
        }
    };

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
                        if (playMode === "full" && duration > 0 && isPlaybackSessionActive) {
                            const selection = window.getSelection();
                            if (selection && selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0);
                                // Ensure the click is within this paragraph
                                if (pRef.current?.contains(range.commonAncestorContainer)) {
                                    // Create a range from the start of the paragraph to the click position
                                    const preCaretRange = range.cloneRange();
                                    preCaretRange.selectNodeContents(pRef.current!);
                                    preCaretRange.setEnd(range.endContainer, range.endOffset);
                                    const clickIndex = preCaretRange.toString().length;

                                    // Calculate timestamp (linear approximation)
                                    const targetTimeMs = (clickIndex / text.length) * duration * 1000;
                                    void seekToMs(targetTimeMs, { autoplay: true });
                                }
                            }
                        }
                        if (playMode === "sentence" && activeSentenceUnit && sentenceDurationMs > 0 && isPlaybackSessionActive) {
                            const selection = window.getSelection();
                            if (selection && selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0);
                                if (pRef.current?.contains(range.commonAncestorContainer)) {
                                    const preCaretRange = range.cloneRange();
                                    preCaretRange.selectNodeContents(pRef.current);
                                    preCaretRange.setEnd(range.endContainer, range.endOffset);
                                    const clickIndex = preCaretRange.toString().length;
                                    const sentenceRelativeIndex = Math.max(0, Math.min(activeSentenceUnit.text.length, clickIndex - activeSentenceUnit.start));
                                    const targetTimeMs = (sentenceRelativeIndex / Math.max(1, activeSentenceUnit.text.length)) * sentenceDurationMs;
                                    void seekSentenceMs(targetTimeMs, { autoplay: true });
                                }
                            }
                        }

                        // 2. Trigger dictionary lookup
                        if (!window.getSelection()?.toString().trim()) {
                            onWordClick(e);
                        }
                    }}
                    onMouseUp={isEditMode ? undefined : handleSelection}
                    dangerouslySetInnerHTML={isEditMode ? { __html: safeHtml } : undefined}
                >
                    {isEditMode ? null : (
                        <AnimatePresence mode="wait">
                            {shouldRenderGrammarLayer ? (
                                hasUsableGrammarAnalysis ? (
                                    <motion.div key="grammar-layer" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                                        {isGrammarLayoutMode ? (
                                            renderGrammarLayoutList()
                                        ) : (
                                            <InlineGrammarHighlights
                                                text={text}
                                                sentences={grammarHighlightSentences}
                                                displayMode={grammarDisplayMode}
                                                showSentenceMarkers
                                                showSegmentTranslation
                                            />
                                        )}
                                    </motion.div>
                                ) : (
                                    <motion.span key="default-grammar-text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-stone-700 inline-block">{text}</motion.span>
                                )
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
                                                    : renderCharacterFallback(text, playbackTimeMs, playbackDurationMs)
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
                                                                {renderCharacterFallback(unit.text, playbackTimeMs, playbackDurationMs)}
                                                            </React.Fragment>
                                                        );
                                                        })}
                                                    </span>
                                                )
                                            )
                                        ) : (
                                            // Default or Bionic Text
                                            isBionicMode ? (
                                                <span>
                                                    {bionicText(text).map((segment, i) => {
                                                        if (segment.type === 'word') {
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
                    className={cn(
                        "mt-2 flex w-full items-center justify-between transition-opacity",
                        isLiquidFocus
                            ? "reading-focus-liquid-toolbar h-12 px-4 opacity-100"
                            : "h-8 opacity-0 group-hover:opacity-100 [.read-tour-active_&]:opacity-100"
                    )}
                >
                    <button
                        data-tour-target={index === 0 ? "paragraph-listen" : undefined}
                        onClick={() => setIsSpeakingOpen(!isSpeakingOpen)}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
                            isSpeakingOpen ? "text-rose-500" : "text-stone-400/80 hover:text-stone-600"
                        )}
                    >
                        <Mic className="w-3.5 h-3.5" /> 朗读
                    </button>

                    <button
                        data-tour-target={index === 0 ? "paragraph-translate" : undefined}
                        onClick={() => handleTranslate(false)}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
                            showTranslation ? "text-indigo-500" : "text-stone-400/80 hover:text-stone-600"
                        )}
                    >
                        {isTranslating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                        {showTranslation ? "折叠翻译" : (
                            <>
                                翻译 <span className="text-[10px] text-amber-500/80">⚡{getReadingCoinCost("translate")}</span>
                            </>
                        )}
                    </button>

                    <button
                        data-tour-target={index === 0 ? "paragraph-grammar" : undefined}
                        onClick={() => handleGrammarAnalysis(false)}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
                            showGrammar ? "text-teal-600" : "text-stone-400/80 hover:text-stone-600"
                        )}
                    >
                        {isAnalyzingGrammar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                        {showGrammar ? "折叠语法" : (
                            <>
                                语法 <span className="text-[10px] text-amber-500/80">⚡{getReadingCoinCost("grammar_basic")}</span>
                            </>
                        )}
                    </button>

                    <button
                        data-tour-target={index === 0 ? "paragraph-ask" : undefined}
                        onClick={() => setIsAskOpen(!isAskOpen)}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
                            isAskOpen ? "text-sky-500" : "text-stone-400/80 hover:text-stone-600"
                        )}
                    >
                        <MessageCircleQuestion className="w-3.5 h-3.5" />
                        Ask AI
                        {!isAskOpen && (
                            <span className="text-[10px] text-amber-500/80">⚡{getReadingCoinCost("ask_ai")}</span>
                        )}
                    </button>

                    <button
                        onClick={() => setIsReadingLayoutMode((prev) => !prev)}
                        disabled={isSpeakingOpen || showGrammar}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
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
                    showTranslation && translation && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="text-base text-rose-700 font-sans bg-rose-50 p-3 rounded-lg border border-rose-100 relative group/trans"
                        >
                            {translation}
                            <button
                                onClick={() => handleTranslate(true)}
                                className="absolute top-2 right-2 p-1.5 bg-white/50 hover:bg-white text-rose-400 hover:text-rose-600 rounded-full opacity-0 group-hover/trans:opacity-100 transition-all"
                                title="Regenerate Translation"
                            >
                                <RotateCcw className="w-3 h-3" />
                            </button>
                        </motion.div>
                    )
                }

                <AnimatePresence>
                    {showGrammar && hasUsableGrammarAnalysis && (
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
                                        <button
                                            onClick={() => setIsGrammarLayoutMode((prev) => !prev)}
                                            className={cn(
                                                "rounded-md border px-2.5 py-1 text-[10px] font-bold tracking-wide transition-colors",
                                                isGrammarLayoutMode
                                                    ? "border-theme-border/30 bg-theme-active-hover text-theme-text"
                                                    : "border-theme-border/10 bg-theme-surface/80 text-theme-text-muted hover:bg-theme-surface hover:text-theme-text",
                                            )}
                                            title={isGrammarLayoutMode ? "取消排版" : "打开大纲模式进行排版"}
                                        >
                                            {isGrammarLayoutMode ? "取消排版" : "段落大纲"}
                                        </button>
                                        <button
                                            onClick={() => handleGrammarAnalysis(true)}
                                            disabled={isAnalyzingGrammar}
                                            className="rounded-md border border-theme-border/10 bg-theme-surface/80 p-1 text-theme-text-muted transition-colors hover:bg-theme-surface hover:text-theme-text disabled:opacity-50"
                                            title="重新分析语法结构"
                                        >
                                            <RotateCcw className={cn("h-3.5 w-3.5", isAnalyzingGrammar && "animate-spin")} />
                                        </button>
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

                                        <button
                                            onClick={() => void handleToggleDeepAnalysis()}
                                            disabled={isAnalyzingDeepGrammar || grammarSentences.length === 0}
                                            className={cn(
                                                "flex items-center gap-1.5 rounded-lg border px-3 py-1 text-[11px] font-bold tracking-wide transition-colors",
                                                showDeepAnalysis
                                                    ? "border-theme-border/30 bg-theme-active-hover text-theme-text"
                                                    : "border-theme-border/20 bg-theme-surface text-theme-text-muted hover:bg-theme-active-bg hover:text-theme-text",
                                                "disabled:cursor-not-allowed disabled:opacity-50",
                                            )}
                                        >
                                            {isAnalyzingDeepGrammar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
                                            {showDeepAnalysis ? "关闭解析" : `Deep · -${getReadingCoinCost("grammar_deep")}`}
                                        </button>
                                    </div>
                                </div>

                                {showDeepAnalysis ? (
                                    <div className="space-y-3 rounded-xl border border-theme-border/20 bg-theme-surface/50 p-3 ring-1 ring-theme-border/5">
                                        {grammarSentences.length > 1 ? (
                                            <div className="flex gap-1 overflow-x-auto rounded-lg bg-theme-base-bg p-1 scrollbar-hide">
                                                {grammarSentences.map((item, idx) => (
                                                    <button
                                                        key={`${item.sentence || "sentence"}-${idx}`}
                                                        onClick={() => void handleDeepSentenceChange(idx)}
                                                        className={cn(
                                                            "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold transition-all",
                                                            activeGrammarSentenceIndex === idx
                                                                ? "bg-indigo-500/10 text-indigo-500"
                                                                : "text-theme-text-muted hover:bg-theme-surface/80 hover:text-theme-text",
                                                        )}
                                                    >
                                                        句 {idx + 1}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}

                                        <div className="rounded-xl border border-theme-border/10 bg-theme-base-bg p-3 shadow-sm">
                                            {activeDeepSentence ? (
                                                <div className="space-y-4">
                                                    {activeDeepSentence.analysis_results.length > 0 ? (
                                                        <div className="overflow-hidden rounded-lg border border-theme-border/20">
                                                            <table className="min-w-full divide-y divide-theme-border/10">
                                                                <thead className="bg-theme-surface">
                                                                    <tr>
                                                                        <th scope="col" className="w-1/3 px-3 py-2 text-left text-[11px] font-bold tracking-wider text-theme-text-muted/80">
                                                                            语法考点
                                                                        </th>
                                                                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-bold tracking-wider text-theme-text-muted/80">
                                                                            详细解析
                                                                        </th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-theme-border/10 bg-theme-base-bg">
                                                                    {activeDeepSentence.analysis_results.map((result, idx) => (
                                                                        <tr key={`${result.point}-${idx}`} className="transition-colors hover:bg-theme-surface/40">
                                                                            <td className="px-3 py-3 text-[12px] font-bold text-theme-text align-top">
                                                                                {result.point}
                                                                            </td>
                                                                            <td className="px-3 py-3 text-[12px] leading-relaxed text-theme-text-muted">
                                                                                {result.explanation}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-theme-text-muted">
                                                            当前句暂未提取到可展示的深度语法点，你可以点击上方重新分析刷新。
                                                        </p>
                                                    )}

                                                    {activeDeepSentence.sentence_tree ? (
                                                        <div className="border-t border-theme-border/10 pt-4">
                                                            <div className="mb-3 flex items-center gap-2 text-indigo-500">
                                                                <Gauge className="h-4 w-4" />
                                                                <h5 className="text-[11px] font-black uppercase tracking-wider">
                                                                    Syntax Structure
                                                                </h5>
                                                            </div>
                                                            <SyntaxTreeView data={activeDeepSentence.sentence_tree} />
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center gap-3 py-6">
                                                    <p className="text-sm text-theme-text-muted">
                                                        当前句还没有深度结构，点击右侧按钮开始首句分析。
                                                    </p>
                                                    <button
                                                        onClick={() => activeGrammarSentence && void ensureDeepAnalysisForSentence(activeGrammarSentence, false)}
                                                        disabled={isAnalyzingDeepGrammar || !activeGrammarSentence}
                                                        className="rounded-full border border-theme-border/20 bg-theme-surface px-4 py-2 text-xs font-bold text-theme-text transition-colors hover:bg-theme-active-bg disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        {isAnalyzingDeepGrammar ? "正在提取深层框架..." : "开始深入解析本句"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {isAskOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="mt-3 overflow-hidden origin-top"
                        >
                            <div className="overflow-hidden rounded-2xl border border-theme-border/20 bg-theme-base-bg shadow-[0_2px_8px_rgba(0,0,0,0.04)] ring-1 ring-theme-border/5">
                                <div className="flex items-center justify-between border-b border-theme-border/10 bg-theme-surface/80 px-4 py-2.5">
                                    <div className="flex items-center gap-2 text-theme-text">
                                        <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                                        <span className="text-xs font-bold tracking-wide">Yasi AI</span>
                                    </div>
                                    <div className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 border border-amber-500/20">
                                        ⚡ {getReadingCoinCost("ask_ai")} 币/次
                                    </div>
                                </div>

                                <div className="max-h-80 min-h-[160px] overflow-y-auto space-y-4 p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-theme-border/30">
                                    {qaPairs.length === 0 ? (
                                        <div className="flex h-full flex-col items-center justify-center space-y-2 py-6 text-center text-theme-text-muted">
                                            <div className="rounded-full border border-theme-border/20 bg-theme-surface p-2.5">
                                                <MessageCircleQuestion className="h-5 w-5 text-theme-text-muted/50" />
                                            </div>
                                            <p className="text-[12px]">向 AI 自由提问当前段落内容<br/>支持 Markdown 高级排版输出</p>
                                        </div>
                                    ) : (
                                        <>
                                            {qaPairs.map((pair, index) => {
                                                const isExpanded = expandedAskQaIds.includes(pair.id);
                                                return (
                                                <div key={pair.id} className="mb-4 overflow-hidden rounded-2xl border border-theme-border/20 bg-theme-base-bg shadow-[0_2px_8px_rgba(0,0,0,0.04)] ring-1 ring-theme-border/5">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setExpandedAskQaIds((prev) =>
                                                                prev.includes(pair.id)
                                                                    ? prev.filter((id) => id !== pair.id)
                                                                    : [...prev, pair.id]
                                                            )
                                                        }}
                                                        className="flex w-full items-start justify-between gap-3 border-b border-theme-border/10 bg-theme-surface/50 px-4 py-3.5 text-left transition-colors hover:bg-theme-surface"
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <div className="mt-0.5 shrink-0 rounded-full bg-indigo-500/10 p-1 text-indigo-500">
                                                                <MessageCircleQuestion className="h-3.5 w-3.5" />
                                                            </div>
                                                            <div className={cn("text-[13px] font-bold leading-relaxed text-theme-text transition-all", !isExpanded && "line-clamp-2 text-theme-text-muted")}>
                                                                {pair.question || `问题 ${index + 1}`}
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0 pt-0.5 text-[11px] font-bold text-indigo-400">
                                                            {isExpanded ? "收起" : "展开"}
                                                        </div>
                                                    </button>
                                                    {isExpanded ? (
                                                        <div className="px-5 py-4 text-[13px] leading-relaxed text-theme-text">
                                                            <AskReasoningBlock content={pair.reasoningContent} isStreaming={pair.isReasoningStreaming} />
                                                            {pair.answer ? (
                                                                <div className="prose prose-sm prose-stone max-w-none text-theme-text">
                                                                    {renderAskMarkdown(pair.answer)}
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-2 py-1 text-indigo-400">
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                    <span className="text-[13px] font-medium">Yasi AI 正在思考...</span>
                                                                </div>
                                                            )}
                                                            {pair.isStreaming && (
                                                                <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-indigo-500 align-middle" />
                                                            )}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )})}
                                        </>
                                    )}
                                </div>

                                <div className="border-t border-theme-border/10 bg-theme-base-bg p-3">
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <div className="flex flex-wrap gap-1.5">
                                            <button
                                                onClick={() => handleAskAI("帮我分析这段话的语法结构")}
                                                disabled={isAskLoading}
                                                className="rounded-lg border border-theme-border/20 bg-theme-surface px-2.5 py-1 text-[11px] font-medium text-theme-text-muted transition-colors hover:bg-theme-active-hover hover:text-theme-text disabled:opacity-50"
                                            >
                                                🔍 语法分析
                                            </button>
                                            <button
                                                onClick={() => handleAskAI("用一句话总结这段话的大意")}
                                                disabled={isAskLoading}
                                                className="rounded-lg border border-theme-border/20 bg-theme-surface px-2.5 py-1 text-[11px] font-medium text-theme-text-muted transition-colors hover:bg-theme-active-hover hover:text-theme-text disabled:opacity-50"
                                            >
                                                📝 总结大意
                                            </button>
                                            <button
                                                onClick={() => handleAskAI("列出这段话中的高级词汇并解释")}
                                                disabled={isAskLoading}
                                                className="rounded-lg border border-theme-border/20 bg-theme-surface px-2.5 py-1 text-[11px] font-medium text-theme-text-muted transition-colors hover:bg-theme-active-hover hover:text-theme-text disabled:opacity-50"
                                            >
                                                ✨ 难词解析
                                            </button>
                                        </div>

                                        <div className="shrink-0 flex items-center rounded-lg border border-theme-border/20 bg-theme-surface p-0.5">
                                            {ASK_ANSWER_MODE_OPTIONS.map((option) => (
                                                <button
                                                    key={`ask-mode-paragraph-${option.mode}`}
                                                    type="button"
                                                    onClick={() => setAskAnswerMode(option.mode)}
                                                    disabled={isAskLoading}
                                                    className={cn(
                                                        "rounded-md px-2 py-0.5 text-[10px] font-bold transition-all",
                                                        askAnswerMode === option.mode
                                                            ? "bg-theme-active-hover text-indigo-600 shadow-sm border border-theme-border/10"
                                                            : "text-theme-text-muted hover:text-theme-text",
                                                    )}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="relative flex items-center">
                                        <input
                                            type="text"
                                            value={question}
                                            onChange={(e) => setQuestion(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAskAI()}
                                            placeholder={selectedText ? "针对选中文本提问..." : "输入你的问题，按回车发送..."}
                                            className="w-full rounded-xl border border-theme-border/30 bg-theme-surface/70 py-2.5 pl-3.5 pr-10 text-[13px] text-theme-text placeholder:text-theme-text-muted/60 transition-colors focus:border-indigo-400 focus:bg-theme-base-bg focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                        />
                                        <button
                                            onClick={() => handleAskAI()}
                                            disabled={isAskLoading || !question.trim()}
                                            className="absolute right-1.5 top-1/2 flex -translate-y-1/2 h-7 w-7 items-center justify-center rounded-lg text-indigo-500 transition-all hover:bg-indigo-500/10 disabled:text-theme-text-muted/40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                        >
                                            {isAskLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -ml-0.5" />}
                                        </button>
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
                    key={`selection-popup:${selectionRect.left}:${selectionRect.top}:${selectionRect.width}:${selectionRect.height}:${selectedText ?? ""}:${selectionPopupMode}:${selectionAskAutoOpenToken}`}
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
                    askAnswerMode={askAnswerMode}
                    onAskAnswerModeChange={setAskAnswerMode}
                    isAskLoading={isSelectionAskLoading}
                    onAsk={() => void handleSelectionAskAI()}
                    onOpenAskComposer={() => setSelectionPopupMode("ask")}
                    onReturnToSelection={() => setSelectionPopupMode("selection")}
                    askPanelDefaultOpenToken={selectionAskAutoOpenToken}
                    renderAskMarkdown={renderAskMarkdown}
                    onClose={closePhraseAnalysis}
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
    onOpenAskComposer: () => void;
    onReturnToSelection: () => void;
    askPanelDefaultOpenToken?: number;
    renderAskMarkdown: (content: string) => React.ReactNode;
    onClose: () => void;
}

export function SelectionActionPopup({
    selectionRect,
    selectedText,
    popupMode = "selection",
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
    onOpenAskComposer,
    onReturnToSelection,
    askPanelDefaultOpenToken,
    renderAskMarkdown,
    onClose,
}: SelectionActionPopupProps) {
    const ref = useRef<HTMLDivElement>(null);
    const reducedMotion = useReducedMotion();
    const shouldReduceMotion = Boolean(reducedMotion);
    const dragStateRef = useRef<{
        pointerId: number;
        startClientX: number;
        startClientY: number;
        originX: number;
        originY: number;
    } | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [measuredHeight, setMeasuredHeight] = useState(240);
    const isAskReplayMode = popupMode === "ask-replay";
    const isAskDockMode = popupMode === "ask" || isAskReplayMode;
    const isAskComposerOpen = isAskDockMode || Boolean(askPanelDefaultOpenToken);
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
    const popupWidth = isAskDockMode ? 400 : 330;
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
            top: "112px",
            right: "40px",
            width: `${popupWidth}px`,
            maxWidth: `${popupWidth}px`,
            minWidth: `${popupWidth}px`,
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

    const popupContainerClassName = cn(
        "relative overflow-hidden rounded-[1.25rem] border border-theme-border/30 bg-theme-base-bg shadow-2xl backdrop-blur-2xl",
        isAskDockMode
            ? "flex h-[min(760px,calc(100vh-9rem))] flex-col"
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

    return (
        <div
            ref={ref}
            className="fixed z-[9999] animate-in fade-in zoom-in-95 duration-200"
            style={popupStyle}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className={popupContainerClassName}>
                <div
                    className={cn(
                        "relative mb-3 flex items-start justify-between gap-3 border-b border-theme-border/20 pb-3",
                        isAskDockMode || isAskReplayMode ? "" : "cursor-grab active:cursor-grabbing",
                    )}
                    onPointerDown={isAskDockMode || isAskReplayMode ? undefined : handleDragStart}
                    onPointerMove={isAskDockMode || isAskReplayMode ? undefined : handleDragMove}
                    onPointerUp={isAskDockMode || isAskReplayMode ? undefined : handleDragEnd}
                    onPointerCancel={isAskDockMode || isAskReplayMode ? undefined : handleDragEnd}
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
                            {selectedText || "选中文本"}
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
                            解读 · -{getReadingCoinCost("analyze_phrase")}
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
                            向AI提问 · -{getReadingCoinCost("ask_ai")}
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
                                                    <div className="px-3 py-2.5 text-xs leading-6 text-theme-text-muted">
                                                        <AskReasoningBlock content={pair.reasoningContent} isStreaming={pair.isReasoningStreaming} />
                                                        {pair.answer
                                                            ? renderAskMarkdown(pair.answer)
                                                            : <div className="opacity-70">等待回答…</div>}
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

                                <div className="flex items-center gap-2 rounded-full border border-theme-border/20 bg-theme-surface px-4 py-1.5 shadow-sm">
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
                                        onClick={onAsk}
                                        disabled={isAskLoading || !question.trim()}
                                        whileTap={{ scale: 0.95 }}
                                        className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 transition-all hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {isAskLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                    </motion.button>
                                </div>
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
            </div>
        </div>
    );
}
