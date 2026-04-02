import React, { useLayoutEffect, useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, BookOpen, Mic, Languages, Loader2, MessageCircleQuestion, Send, PenTool, GripVertical, RotateCcw, Gauge, X, Sparkles, Globe, Highlighter, Underline } from "lucide-react";
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
    GRAMMAR_BASIC_MODEL,
    GRAMMAR_BASIC_PROMPT_VERSION,
    GRAMMAR_DEEP_MODEL,
    GRAMMAR_DEEP_PROMPT_VERSION,
    sentenceIdentity,
    type GrammarDeepSentenceResult,
} from "@/lib/grammar-analysis";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { applyServerProfilePatchToLocal } from "@/lib/user-repository";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { getReadingCoinCost, INSUFFICIENT_READING_COINS, type ReadingEconomyAction } from "@/lib/reading-economy";
import { dispatchReadingCoinFx } from "@/lib/reading-coin-fx";
import type { ReadingMarkType, ReadingNoteItem } from "@/lib/db";

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
    onWordClick: (e: React.MouseEvent) => void;
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
    onToggleFocusLock?: () => void;
    highlightSnippet?: string;
}

interface GrammarBasicCachePayload {
    mode?: "basic";
    tags?: string[];
    overview?: string;
    difficult_sentences?: GrammarSentenceAnalysis[];
}

interface TranslationCritique {
    score?: number;
    feedback?: string;
    better_translation?: string;
    corrections?: Array<{
        segment?: string;
        correction?: string;
        reason?: string;
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

const LEGACY_HIGHLIGHT_COLOR_MAP: Record<string, string> = {
    mint: "hsl(158 74% 86%)",
    gold: "hsl(43 80% 86%)",
    lavender: "hsl(270 72% 88%)",
    peach: "hsl(24 82% 87%)",
    sky: "hsl(202 80% 87%)",
    rose: "hsl(346 76% 87%)",
};

const normalizeHighlightColor = (rawColor: string | undefined) => {
    if (!rawColor) return LEGACY_HIGHLIGHT_COLOR_MAP.mint;
    return LEGACY_HIGHLIGHT_COLOR_MAP[rawColor] ?? rawColor;
};

const isRangeOverlapping = (startA: number, endA: number, startB: number, endB: number) => (
    startA < endB && startB < endA
);

export function ParagraphCard({
    text,
    index,
    paragraphOrder = 0,
    articleTitle,
    articleUrl,
    readingNotes = [],
    onCreateReadingNote,
    onDeleteReadingMarks,
    onWordClick,
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
    onToggleFocusLock,
    highlightSnippet,
}: ParagraphCardProps) {
    const sessionUser = useAuthSessionUser();
    const { fontSizeClass, isBionicMode } = useReadingSettings();
    const grammarBasicCacheKey = buildGrammarCacheKey({
        text,
        mode: "basic",
        promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
        model: GRAMMAR_BASIC_MODEL,
    });
    const grammarDeepCacheKey = buildGrammarCacheKey({
        text,
        mode: "deep",
        promptVersion: GRAMMAR_DEEP_PROMPT_VERSION,
        model: GRAMMAR_DEEP_MODEL,
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
    const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);
    const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);

    const [isTranslating, setIsTranslating] = useState(false);
    const [isAnalyzingGrammar, setIsAnalyzingGrammar] = useState(false);
    const [isAnalyzingDeepGrammar, setIsAnalyzingDeepGrammar] = useState(false);

    // Load from DB on mount
    useEffect(() => {
        loadFromDB(text, grammarBasicCacheKey, text);
    }, [text, grammarBasicCacheKey, loadFromDB]);
    useEffect(() => {
        loadGrammarFromDB(grammarDeepCacheKey);
    }, [grammarDeepCacheKey, loadGrammarFromDB]);

    // Derived data from store
    const translation = translations[text];
    const grammarAnalysis = (grammarAnalyses[grammarBasicCacheKey] ?? grammarAnalyses[text]) as GrammarBasicCachePayload | undefined;
    const grammarHighlightSentences = Array.isArray(grammarAnalysis?.difficult_sentences)
        ? grammarAnalysis.difficult_sentences
        : [];
    const grammarDeepCachePayload = grammarAnalyses[grammarDeepCacheKey] as {
        mode?: "deep";
        bySentence?: Record<string, GrammarDeepSentenceResult>;
    } | undefined;
    const deepBySentence = grammarDeepCachePayload?.bySentence ?? {};

    // Ask AI State - Multi-turn chat with streaming
    const [isAskOpen, setIsAskOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
    const [isAskLoading, setIsAskLoading] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const qaPairs = (() => {
        const pairs: Array<{ id: number; question: string; answer: string; isStreaming: boolean }> = [];
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
                isStreaming: isAskLoading || Boolean(streamingContent),
            });
        } else if (streamingContent) {
            pairs.push({ id: idx++, question: "", answer: streamingContent, isStreaming: true });
        }

        return pairs;
    })();

    // Practice State
    const [isPracticing, setIsPracticing] = useState(false);
    const [userTranslation, setUserTranslation] = useState("");
    const [critique, setCritique] = useState<TranslationCritique | null>(null);
    const [isCritiquing, setIsCritiquing] = useState(false);

    // Speaking State
    const [isSpeakingOpen, setIsSpeakingOpen] = useState(false);
    const [isBlind, setIsBlind] = useState(false);

    // Phrase Analysis State
    const [selectedText, setSelectedText] = useState<string | null>(null);
    const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
    const [selectionOffsets, setSelectionOffsets] = useState<{ startOffset: number; endOffset: number } | null>(null);
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
    } | null>(null);
    const [hoveredNoteId, setHoveredNoteId] = useState<number | null>(null);
    const [readingCoinHint, setReadingCoinHint] = useState<string | null>(null);

    const pRef = useRef<HTMLDivElement>(null);

    usePretextMeasuredLayout(pRef, {
        text,
        mode: "paragraph",
        enabled: !isEditMode,
        whiteSpaceMode: "pre-wrap",
    });

    const {
        play: togglePlay,
        isPlaying,
        isLoading: isTTSLoading,
        preload,
        currentTime,
        duration,
        seek,
        playbackRate,
        setPlaybackRate,
        stop
    } = useTTS(text);

    useEffect(() => {
        preload();
    }, [preload]);

    useEffect(() => {
        if (!showGrammar) return;
        setIsNoteComposerOpen(false);
        setNoteDraft("");
        setHoveredReadingNote(null);
    }, [showGrammar]);

    const handlePlay = () => {
        togglePlay();
    };
    const renderAskMarkdown = (content: string) => (
        <div className="prose prose-sm max-w-none text-inherit leading-7 prose-p:my-2 prose-ol:my-3 prose-ol:space-y-2 prose-ul:my-3 prose-ul:space-y-1.5">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => <p className="my-2 text-inherit">{children}</p>,
                    ol: ({ children }) => <ol className="my-3 list-decimal space-y-2.5 pl-6 marker:font-semibold marker:text-amber-700">{children}</ol>,
                    ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-stone-400">{children}</ul>,
                    li: ({ children }) => <li className="my-1 leading-7">{children}</li>,
                    blockquote: ({ children }) => (
                        <blockquote className="my-2 rounded-r-lg border-l-4 border-sky-300 bg-sky-50/60 px-3 py-2 text-sky-900">
                            {children}
                        </blockquote>
                    ),
                    strong: ({ children }) => (
                        <strong className="rounded-[6px] bg-amber-100/90 px-1.5 py-0.5 font-semibold text-amber-950 shadow-[inset_0_-1px_0_rgba(251,191,36,0.35)] underline decoration-amber-300/80 decoration-[1.5px] underline-offset-[3px]">
                            {children}
                        </strong>
                    ),
                    code: ({ children, className: codeClassName, ...props }) => {
                        const isInline = !String(codeClassName || "").includes("language-");
                        if (isInline) {
                            return (
                                <code className="rounded-md border border-sky-100 bg-sky-50/85 px-1.5 py-0.5 text-[0.9em] font-medium text-sky-800">
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <code className={cn("text-xs", codeClassName)} {...props}>
                                {children}
                            </code>
                        );
                    },
                }}
            >
                {content.replace(/\n/g, "  \n")}
            </ReactMarkdown>
        </div>
    );

    const renderTextWithReadingMarks = (paragraphText: string, snippet?: string) => {
        const markers: Array<{
            start: number;
            end: number;
            type: "highlight" | "underline" | "note" | "locate";
            noteText?: string;
            id?: number;
            markColor?: string;
        }> = [];

        for (const note of normalizedReadingNotes) {
            markers.push({
                start: Math.max(0, note.start_offset),
                end: Math.min(paragraphText.length, note.end_offset),
                type: note.mark_type,
                noteText: note.note_text,
                id: note.id,
                markColor: note.mark_color,
            });
        }

        if (snippet?.trim()) {
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
                    if (active.length === 0) return <React.Fragment key={`${start}-${end}`}>{piece}</React.Fragment>;

                    const hasHighlight = active.some((marker) => marker.type === "highlight");
                    const highlightMarker = active.find((marker) => marker.type === "highlight");
                    const highlightColor = normalizeHighlightColor(highlightMarker?.markColor);
                    const hasUnderline = active.some((marker) => marker.type === "underline");
                    const noteMarker = active.find((marker) => marker.type === "note");
                    const hasLocate = active.some((marker) => marker.type === "locate");
                    const showLocateVisual = hasLocate;
                    const showNoteVisual = Boolean(noteMarker && !showLocateVisual);
                    const hasUnderlineVisible = hasUnderline && !showNoteVisual && !showLocateVisual;
                    const showHighlightVisual = hasHighlight && !showLocateVisual && !showNoteVisual;
                    const isNoteHovered = Boolean(showNoteVisual && noteMarker?.id && hoveredNoteId === noteMarker.id);
                    const markStyle: React.CSSProperties | undefined = showHighlightVisual
                        ? { backgroundColor: highlightColor }
                        : undefined;

                    return (
                        <span
                            key={`${start}-${end}`}
                            className={cn(
                                "rounded-[3px] px-[1px] transition-colors",
                                showHighlightVisual && "ring-1 ring-black/5",
                                hasUnderlineVisible && "underline decoration-fuchsia-500 decoration-2 underline-offset-[3px]",
                                showNoteVisual && "inline-block cursor-pointer rounded-[9px] border border-sky-500/45 bg-[linear-gradient(160deg,rgba(236,247,255,0.98),rgba(189,223,255,0.95))] px-[4px] text-slate-900 ring-1 ring-white/72 shadow-[0_2px_0_rgba(59,130,246,0.28),0_10px_22px_-12px_rgba(37,99,235,0.6),inset_0_1px_0_rgba(255,255,255,0.98)] transition-all duration-220 transform-gpu will-change-transform",
                                showNoteVisual && isNoteHovered && "z-[2] -translate-y-[4px] scale-[1.03] border-sky-500/70 bg-[linear-gradient(160deg,rgba(244,251,255,1),rgba(205,232,255,0.98))] ring-sky-100 shadow-[0_5px_0_rgba(59,130,246,0.36),0_22px_38px_-14px_rgba(37,99,235,0.76),inset_0_1px_0_rgba(255,255,255,1)]",
                                showLocateVisual && "rounded-[4px] bg-amber-100/58 text-stone-900 border-b border-amber-500/75"
                            )}
                            style={markStyle}
                            data-reading-note-id={noteMarker?.id}
                            title={showNoteVisual ? "点击可编辑标注" : undefined}
                            onMouseEnter={showNoteVisual && noteMarker?.noteText
                                ? (event) => {
                                    if (noteMarker.id) setHoveredNoteId(noteMarker.id);
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    setHoveredReadingNote({
                                        text: noteMarker.noteText || "",
                                        x: rect.left + rect.width / 2,
                                        anchorTop: rect.top,
                                        anchorBottom: rect.bottom,
                                    });
                                }
                                : undefined}
                            onMouseMove={showNoteVisual && noteMarker?.noteText
                                ? (event) => {
                                    setHoveredReadingNote((prev) => prev ? {
                                        ...prev,
                                        x: event.clientX,
                                    } : prev);
                                }
                                : undefined}
                            onMouseLeave={showNoteVisual && noteMarker?.noteText
                                ? () => {
                                    setHoveredReadingNote(null);
                                    setHoveredNoteId(null);
                                }
                                : undefined}
                            onClick={showNoteVisual && noteMarker?.id
                                ? (event) => {
                                    event.stopPropagation();
                                    if (!noteMarker.id) return;
                                    handleOpenExistingNoteEditor(noteMarker.id, event.currentTarget.getBoundingClientRect());
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

    const normalizedReadingNotes = useMemo(() => (
        readingNotes
            .filter((note) => Number.isFinite(note.start_offset) && Number.isFinite(note.end_offset) && note.end_offset > note.start_offset)
            .slice()
            .sort((a, b) => a.start_offset - b.start_offset)
    ), [readingNotes]);

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

    const handleOpenExistingNoteEditor = (noteId: number, anchorRect?: DOMRect) => {
        const targetNote = normalizedReadingNotes.find((note) => note.id === noteId && note.mark_type === "note");
        if (!targetNote) return;

        setSelectionRect(anchorRect ?? null);
        setSelectedText(targetNote.selected_text || text.slice(targetNote.start_offset, targetNote.end_offset));
        setSelectionOffsets({
            startOffset: targetNote.start_offset,
            endOffset: targetNote.end_offset,
        });
        setPhraseAnalysis(null);
        setIsNoteComposerOpen(true);
        setNoteDraft(targetNote.note_text || "");
        setHoveredReadingNote(null);
    };

    const getSelectionOffsets = (range: Range) => {
        if (!pRef.current) return null;
        if (!pRef.current.contains(range.commonAncestorContainer)) return null;

        const prefixRange = range.cloneRange();
        prefixRange.selectNodeContents(pRef.current);
        prefixRange.setEnd(range.startContainer, range.startOffset);
        const startOffset = prefixRange.toString().length;
        const selected = range.toString();
        const endOffset = startOffset + selected.length;
        if (!selected.trim() || endOffset <= startOffset) return null;

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

    const handleDeleteReadingMark = async (markType: "highlight" | "underline" | "note") => {
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

        // If no selection or collapsed
        if (!selection || selection.isCollapsed) {
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
        setPhraseAnalysis(null);
        const overlapNote = normalizedReadingNotes.find((note) =>
            note.mark_type === "note"
            && isRangeOverlapping(offsets.startOffset, offsets.endOffset, note.start_offset, note.end_offset),
        );
        setIsNoteComposerOpen(Boolean(overlapNote));
        setNoteDraft(overlapNote?.note_text || "");

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
        } catch (err) {
            console.error(err);
            setPhraseAnalysis({ translation: "Failed to analyze. Please try again." });
        } finally {
            setIsAnalyzingPhrase(false);
        }
    };

    const closePhraseAnalysis = () => {
        setSelectionRect(null);
        setSelectedText(null);
        setSelectionOffsets(null);
        setPhraseAnalysis(null);
        setIsNoteComposerOpen(false);
        setNoteDraft("");
        window.getSelection()?.removeAllRanges();
    };

    const handleCritique = async () => {
        if (!userTranslation.trim()) return;

        setIsCritiquing(true);
        try {
            const res = await fetch("/api/ai/critique-translation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ originalText: text, userTranslation }),
            });
            const data = await res.json();
            setCritique(data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsCritiquing(false);
        }
    };

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
        setActiveSentenceIndex(0);
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
        } catch (err) {
            console.error(err);
        } finally {
            setIsAnalyzingDeepGrammar(false);
        }
    };

    const handleGrammarAnalysis = async (forceRegenerate = false) => {
        if (!forceRegenerate && grammarAnalysis) {
            const nextShowGrammar = !showGrammar;
            setShowGrammar(nextShowGrammar);
            if (nextShowGrammar) {
                setGrammarDisplayMode("core");
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
            await syncReadingBalance(data, "grammar_basic");

            setStoreGrammarAnalysis(grammarBasicCacheKey, data);
            setActiveSentenceIndex(0);
            setShowDeepAnalysis(false);
        } catch (err) {
            console.error(err);
        } finally {
            setIsAnalyzingGrammar(false);
        }
    };

    const handleToggleDeepAnalysis = () => {
        setShowDeepAnalysis((prev) => !prev);
    };

    const handleDeepSentenceChange = (nextIndex: number) => {
        setActiveSentenceIndex(nextIndex);
    };

    const grammarSentences = grammarHighlightSentences;
    const activeGrammarSentence = grammarSentences[activeSentenceIndex]?.sentence?.trim() ?? "";
    const activeDeepSentence = activeGrammarSentence
        ? deepBySentence[sentenceIdentity(activeGrammarSentence)]
        : null;
    const shouldRenderGrammarLayer = showGrammar && !highlightSnippet;

    const handleAskAI = async (overrideQuestion?: string) => {
        const userMessage = (overrideQuestion ?? question).trim();
        if (!userMessage) return;

        setMessages(prev => [...prev, { role: "user", content: userMessage }]);
        setQuestion(""); // Clear input immediately
        setIsAskLoading(true);
        setStreamingContent("");
        setReadingCoinHint(null);

        try {
            const res = await fetch("/api/ai/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text,
                    question: userMessage,
                    selection: selectedText,
                    economyContext: readEconomyContext("ask_ai"),
                }),
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                if (payload?.errorCode === INSUFFICIENT_READING_COINS) {
                    setReadingCoinHint("阅读币不足，当前无法 Ask AI。");
                    setMessages(prev => [...prev, { role: "assistant", content: "阅读币不足，请先完成阅读或测验获取阅读币。" }]);
                    return;
                }
                throw new Error("API Error");
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
            const decoder = new TextDecoder();
            let fullContent = "";

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split("\n");

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            const data = line.slice(6);
                            if (data === "[DONE]") break;
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.content) {
                                    fullContent += parsed.content;
                                    setStreamingContent(fullContent);
                                }
                            } catch (e) {
                                // Ignore parse errors for incomplete chunks
                            }
                        }
                    }
                }
            }

            // Add completed message to history
            setMessages(prev => [...prev, { role: "assistant", content: fullContent }]);
            setStreamingContent("");
        } catch (err) {
            console.error(err);
            setMessages(prev => [...prev, { role: "assistant", content: "抱歉，出错了。请再试一次。" }]);
        } finally {
            setIsAskLoading(false);
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

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        // ... existing handleInput logic if needed
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
    const getFocusClasses = () => {
        if (!isFocusMode) {
            // Default behavior (Focus Mode OFF)
            return isVideoActive
                ? "bg-red-50/40 rounded-lg -mx-4 px-4 py-3 shadow-sm ring-1 ring-red-100"
                : "rounded-lg -mx-4 px-4 py-1 transition-colors hover:bg-white/45";
        }

        // Focus Mode ON
        if (hasActiveFocusLock) {
            if (isFocusLocked) {
                // LIGHT ON: The active paragraph needs to pop out
                // User requested NO magnification. Removed scale-[1.02].
                return "opacity-100 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-white/50 backdrop-blur-sm rounded-xl -mx-6 px-6 py-6 z-20 my-4";
            } else {
                // LIGHT OFF: Deep fade for background paragraphs
                return "opacity-20 blur-[1px] grayscale transition-all duration-700 pointer-events-none";
            }
        } else {
            // Focus Mode ON (Idle): Everything is slightly dimmed until hovered
            // User requested NO magnification. Removed hover:scale-[1.005].
            return "opacity-60 hover:opacity-100 hover:bg-white/40 transition-all duration-500 rounded-lg -mx-4 px-4 py-2";
        }
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

                // Toggle Focus Lock on Click
                if (onToggleFocusLock && isFocusMode) {
                    onToggleFocusLock();
                }

                if (onSeekToTime) handleVideoSeek();
            }}
            style={{ cursor: isFocusMode ? 'pointer' : (onSeekToTime ? 'pointer' : undefined) }}
        >
            {/* Margin Marker Visualization */}
            <div className={cn(
                "absolute -left-6 top-3 w-1.5 h-1.5 rounded-full transition-all duration-300",
                isVideoActive
                    ? "bg-red-500 opacity-100 scale-125"
                    : "bg-amber-400 opacity-0 group-hover:opacity-100 scale-100"
            )} />

            {/* Controls - Floating on the left or right, or inline */}
            <div className="absolute -left-12 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 items-center z-10">
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
                    className={cn("p-1.5 rounded-full transition-colors", isPlaying ? "text-amber-600" : "text-stone-400 hover:text-amber-600")}
                    title={isPlaying ? "Pause" : "Listen"}
                    disabled={isTTSLoading}
                >
                    {isTTSLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                    ) : (
                        <Play className="w-4 h-4 fill-current" />
                    )}
                </button>

                {/* Stop Button (Visible when playing or has progress) */}
                {(isPlaying || currentTime > 0) && (
                    <button
                        onClick={stop}
                        className="p-1.5 rounded-full text-stone-500 hover:text-red-400 transition-colors"
                        title="Stop & Reset"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}

                {/* Speed Control (Only visible when playing or has audio) */}
                {(isPlaying || currentTime > 0) && (
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
                    contentEditable={isEditMode}
                    suppressContentEditableWarning={true}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    className={cn(
                        "leading-loose tracking-wide transition-all duration-300 outline-none focus:ring-0",
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
                        if (duration > 0) {
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
                                    const targetTime = (clickIndex / text.length) * duration;
                                    seek(targetTime);
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
                    {isEditMode ? null : (shouldRenderGrammarLayer ? (
                        grammarAnalysis ? (
                            <InlineGrammarHighlights
                                text={text}
                                sentences={grammarHighlightSentences}
                                displayMode={grammarDisplayMode}
                                showSentenceMarkers
                                showSegmentTranslation
                            />
                        ) : (
                            <span className="text-stone-700">{text}</span>
                        )
                    ) : (
                        // Karaoke Effect Logic (Character-based for smoothness)
                        isPlaying || currentTime > 0 ? (
                            (() => {
                                const chars = text.split('');
                                const totalChars = text.length;
                                const progressChars = (currentTime / (duration || 1)) * totalChars;

                                return (
                                    <span>
                                        {chars.map((char, i) => {
                                            const isHighlighted = i < progressChars;
                                            return (
                                                <span
                                                    key={i}
                                                    className={cn(
                                                        "transition-colors duration-75",
                                                        isHighlighted ? "text-amber-600 font-medium" : "text-stone-400"
                                                    )}
                                                >
                                                    {char}
                                                </span>
                                            );
                                        })}
                                    </span>
                                );
                            })()
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
                                renderTextWithReadingMarks(text, highlightSnippet)
                            )
                        )
                    ))}
                </div>

                {/* Progress Bar (Only visible when playing or paused with progress) */}
                {
                    (isPlaying || currentTime > 0) && (
                        <div className="h-1 bg-stone-200 rounded-full overflow-hidden cursor-pointer group/progress" onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const percent = (e.clientX - rect.left) / rect.width;
                            seek(percent * duration);
                        }}>
                            <div
                                className="h-full bg-amber-400 group-hover/progress:bg-amber-500 transition-all duration-100 ease-linear"
                                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                            />
                        </div>
                    )
                }

                {/* Inline Actions Bar (Visible on Hover) */}
                <div className="h-8 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => setIsSpeakingOpen(!isSpeakingOpen)}
                        className={cn("flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-md", isSpeakingOpen ? "bg-red-100 text-red-600" : "text-stone-400 hover:bg-stone-100 hover:text-red-500")}
                    >
                        <Mic className="w-3 h-3" /> Speaking
                    </button>

                    <button
                        onClick={() => handleTranslate(false)}
                        className={cn("flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-md", translation ? "bg-rose-100 text-rose-600" : "text-stone-400 hover:bg-stone-100 hover:text-stone-600")}
                    >
                        {isTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                        {showTranslation ? "Hide" : `Translate · -${getReadingCoinCost("translate")}`}
                    </button>

                    <button
                        onClick={() => handleGrammarAnalysis(false)}
                        className={cn("flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-md", grammarAnalysis ? "bg-orange-100 text-orange-600" : "text-stone-400 hover:bg-stone-100 hover:text-orange-500")}
                    >
                        {isAnalyzingGrammar ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookOpen className="w-3 h-3" />}
                        {showGrammar ? "Hide Grammar" : `Grammar · -${getReadingCoinCost("grammar_basic")}`}
                    </button>

                    <button
                        onClick={() => setIsAskOpen(!isAskOpen)}
                        className={cn("flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-md", isAskOpen ? "bg-blue-100 text-blue-600" : "text-stone-400 hover:bg-stone-100 hover:text-blue-500")}
                    >
                        <MessageCircleQuestion className="w-3 h-3" /> Ask AI · -{getReadingCoinCost("ask_ai")}
                    </button>

                    <button
                        onClick={() => setIsPracticing(!isPracticing)}
                        className={cn("flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-md", isPracticing ? "bg-amber-100 text-amber-600" : "text-stone-400 hover:bg-stone-100 hover:text-amber-500")}
                    >
                        <PenTool className="w-3 h-3" /> Practice
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
                            onPlayOriginal={togglePlay}
                            isOriginalPlaying={isPlaying}
                            onRecordingComplete={(blob) => console.log("Recording complete", blob)}
                            onClose={() => setIsSpeakingOpen(false)}
                            isBlind={isBlind}
                            onToggleBlind={() => setIsBlind(!isBlind)}
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

                {
                    showGrammar && grammarAnalysis && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="relative space-y-4 rounded-[28px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,251,242,0.96),rgba(248,242,228,0.92))] p-5 shadow-[0_18px_45px_rgba(120,94,42,0.08)] ring-1 ring-white/70 group/grammar"
                        >
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    <div className="flex items-center rounded-full border border-[#dfcfab] bg-white/85 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                        <button
                                            onClick={() => setGrammarDisplayMode("core")}
                                            className={cn(
                                                "rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] transition-all",
                                                grammarDisplayMode === "core"
                                                    ? "bg-[#f3e2b5] text-[#6b4c18] shadow-[0_6px_16px_rgba(160,122,42,0.18)]"
                                                    : "text-stone-500 hover:bg-[#fcf7eb] hover:text-stone-700",
                                            )}
                                        >
                                            主干结构
                                        </button>
                                        <button
                                            onClick={() => setGrammarDisplayMode("full")}
                                            className={cn(
                                                "rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] transition-all",
                                                grammarDisplayMode === "full"
                                                    ? "bg-[#f3e2b5] text-[#6b4c18] shadow-[0_6px_16px_rgba(160,122,42,0.18)]"
                                                    : "text-stone-500 hover:bg-[#fcf7eb] hover:text-stone-700",
                                            )}
                                        >
                                            完整分析
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => void handleToggleDeepAnalysis()}
                                        disabled={isAnalyzingDeepGrammar || grammarSentences.length === 0}
                                        className={cn(
                                            "flex items-center gap-1 rounded-full border px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] transition-colors",
                                            showDeepAnalysis
                                                ? "border-[#d8c193] bg-[#f7ebd0] text-[#7b5117]"
                                                : "border-[#e4d5b5] bg-white/75 text-[#8a5d1f] hover:bg-white",
                                            "disabled:cursor-not-allowed disabled:opacity-65",
                                        )}
                                    >
                                        {isAnalyzingDeepGrammar ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                        {showDeepAnalysis ? "Hide Deep" : `Deep · -${getReadingCoinCost("grammar_deep")}`}
                                    </button>
                                </div>

                                {showDeepAnalysis ? (
                                    <div className="space-y-3 rounded-2xl border border-[#e7d8ba] bg-white/75 p-3">
                                        {grammarSentences.length > 1 ? (
                                            <div className="flex gap-1 overflow-x-auto rounded-lg bg-orange-100/50 p-1 scrollbar-hide">
                                                {grammarSentences.map((item, idx) => (
                                                    <button
                                                        key={`${item.sentence || "sentence"}-${idx}`}
                                                        onClick={() => void handleDeepSentenceChange(idx)}
                                                        className={cn(
                                                            "whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all",
                                                            activeSentenceIndex === idx
                                                                ? "bg-white text-orange-600 shadow-sm"
                                                                : "text-orange-500 hover:bg-white/65 hover:text-orange-700",
                                                        )}
                                                    >
                                                        Sentence {idx + 1}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}

                                        <div className="rounded-xl border border-orange-100 bg-white/70 p-3">
                                            {activeDeepSentence ? (
                                                <div className="space-y-3">
                                                    {activeDeepSentence.analysis_results.length > 0 ? (
                                                        <div className="overflow-hidden rounded-lg border border-stone-200">
                                                            <table className="min-w-full divide-y divide-stone-200">
                                                                <thead className="bg-stone-50">
                                                                    <tr>
                                                                        <th scope="col" className="w-1/3 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
                                                                            语法点
                                                                        </th>
                                                                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
                                                                            详细解析
                                                                        </th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-stone-200 bg-white">
                                                                    {activeDeepSentence.analysis_results.map((result, idx) => (
                                                                        <tr key={`${result.point}-${idx}`} className="transition-colors hover:bg-stone-50/50">
                                                                            <td className="px-3 py-3 text-xs font-semibold align-top text-stone-800">
                                                                                {result.point}
                                                                            </td>
                                                                            <td className="px-3 py-3 text-xs leading-relaxed text-stone-600">
                                                                                {result.explanation}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-stone-600">
                                                            当前句暂未提取到可展示的深度语法点，你可以点击刷新重新生成。
                                                        </p>
                                                    )}

                                                    {activeDeepSentence.sentence_tree ? (
                                                        <div className="border-t border-stone-100 pt-3">
                                                            <div className="mb-3 flex items-center gap-2">
                                                                <Gauge className="h-4 w-4 text-amber-600" />
                                                                <h5 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                                                                    Syntax Structure
                                                                </h5>
                                                            </div>
                                                            <SyntaxTreeView data={activeDeepSentence.sentence_tree} />
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm text-stone-500">
                                                        当前句还没有深度结构，点击右侧按钮开始分析。
                                                    </p>
                                                    <button
                                                        onClick={() => activeGrammarSentence && void ensureDeepAnalysisForSentence(activeGrammarSentence, false)}
                                                        disabled={isAnalyzingDeepGrammar || !activeGrammarSentence}
                                                        className="rounded-full border border-[#e4d5b5] bg-white px-3 py-1.5 text-xs font-semibold text-[#8a5d1f] transition-colors hover:bg-[#fff7e6] disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {isAnalyzingDeepGrammar ? "分析中..." : "Analyze Current Sentence"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </motion.div>
                    )
                }

                {
                    isAskOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="space-y-3"
                        >
                            <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/62 shadow-[0_18px_40px_-26px_rgba(15,23,42,0.32)] ring-1 ring-white/45 backdrop-blur-xl">
                                <div className="border-b border-white/60 bg-white/36 px-4 py-2.5">
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Ask AI · {getReadingCoinCost("ask_ai")} 阅读币/次</p>
                                </div>

                                <div className="max-h-72 min-h-[132px] overflow-y-auto space-y-2 px-4 py-3">
                                    {qaPairs.length === 0 ? (
                                        <div className="rounded-xl border border-white/60 bg-white/46 p-3 text-sm text-stone-500">
                                            输入问题，AI 会基于当前段落回答，支持 <span className="font-semibold text-stone-700">Markdown</span> 输出。
                                        </div>
                                    ) : (
                                        <>
                                            {qaPairs.map((pair) => (
                                                <div
                                                    key={pair.id}
                                                    className="overflow-hidden rounded-2xl border border-white/65 bg-white/68 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.5)]"
                                                >
                                                    {pair.question && (
                                                        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-sm font-medium text-white">
                                                            {pair.question}
                                                        </div>
                                                    )}
                                                    <div className="px-3.5 py-3 text-sm text-stone-700">
                                                        {pair.answer ? (
                                                            renderAskMarkdown(pair.answer)
                                                        ) : (
                                                            <div className="text-stone-400">等待回答…</div>
                                                        )}
                                                        {pair.isStreaming && (
                                                            <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-indigo-500/50 align-middle" />
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>

                                <div className="border-t border-white/60 bg-white/42 px-4 py-3">
                                    <div className="flex flex-wrap gap-2 pb-2.5">
                                        <button
                                            onClick={() => handleAskAI("帮我分析这段话的语法结构")}
                                            disabled={isAskLoading}
                                            className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                                        >
                                            🔍 语法分析
                                        </button>
                                        <button
                                            onClick={() => handleAskAI("用一句话总结这段话的大意")}
                                            disabled={isAskLoading}
                                            className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                                        >
                                            📝 总结大意
                                        </button>
                                        <button
                                            onClick={() => handleAskAI("列出这段话中的高级词汇并解释")}
                                            disabled={isAskLoading}
                                            className="text-xs bg-violet-50 hover:bg-violet-100 text-violet-600 border border-violet-200 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                                        >
                                            ✨ 难词解析
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                                        <input
                                            type="text"
                                            value={question}
                                            onChange={(e) => setQuestion(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAskAI()}
                                            placeholder={selectedText ? "针对选中文本提问..." : "输入你的问题..."}
                                            className="w-full bg-transparent border-none text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-0"
                                        />
                                        <button
                                            onClick={() => handleAskAI()}
                                            disabled={isAskLoading || !question.trim()}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-all hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {isAskLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )
                }

                {
                    isPracticing && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="space-y-3"
                        >
                            <div className="relative">
                                <PretextTextarea
                                    value={userTranslation}
                                    onChange={(e) => setUserTranslation(e.target.value)}
                                    placeholder="Type your translation here..."
                                    className="w-full bg-white/50 border border-stone-200 rounded-lg p-3 text-stone-800 focus:outline-none focus:border-amber-400 min-h-[80px] text-sm resize-y"
                                    minRows={3}
                                    maxRows={14}
                                />
                                <button
                                    onClick={handleCritique}
                                    disabled={isCritiquing || !userTranslation.trim()}
                                    className="absolute bottom-2 right-2 p-1.5 bg-amber-100 hover:bg-amber-200 text-amber-600 rounded-md disabled:opacity-50 transition-colors"
                                >
                                    {isCritiquing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </button>
                            </div>

                            {critique && (
                                (() => {
                                    const corrections = critique.corrections ?? [];
                                    return (
                                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-amber-600">Score: {critique.score}</span>
                                        <span className="text-xs text-stone-500">AI Feedback</span>
                                    </div>
                                    <p className="text-sm text-stone-700">{critique.feedback}</p>

                                    <div className="bg-white/50 p-3 rounded border border-amber-100">
                                        <p className="text-xs text-stone-500 mb-1">Better Translation:</p>
                                        <p className="text-sm text-rose-600">{critique.better_translation}</p>
                                    </div>

                                    {corrections.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold text-stone-500">Corrections:</p>
                                            {corrections.map((c, i: number) => (
                                                <div key={i} className="text-xs bg-white/50 p-2 rounded">
                                                    <div className="flex gap-2 items-center mb-1">
                                                        <span className="text-red-500 line-through decoration-red-400/50">{c.segment}</span>
                                                        <span className="text-stone-400">→</span>
                                                        <span className="text-green-600">{c.correction}</span>
                                                    </div>
                                                    <p className="text-stone-500 italic">{c.reason}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                    );
                                })()
                            )}
                        </motion.div>
                    )
                }
            </div>

            {/* Phrase Analysis Popup - Fixed Positioning - Liquid Glass Style */}
            {selectionRect && typeof document !== 'undefined' && createPortal(
                <SelectionActionPopup
                    key={`selection-popup:${selectionRect.left}:${selectionRect.top}:${selectionRect.width}:${selectionRect.height}:${selectedText ?? ""}`}
                    selectionRect={selectionRect}
                    selectedText={selectedText}
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
                    onClose={closePhraseAnalysis}
                />,
                document.body
            )}

            {hoveredReadingNote && !showGrammar && typeof document !== "undefined" && createPortal(
                <div
                    className="pointer-events-none fixed z-[10000] w-max max-w-[min(360px,calc(100vw-24px))] rounded-lg border border-cyan-200/90 bg-white/95 px-2.5 py-1.5 text-xs font-medium leading-relaxed text-slate-700 shadow-[0_14px_28px_-14px_rgba(14,116,144,0.45)] backdrop-blur whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-h-[36vh] overflow-y-auto"
                    style={{
                        left: (() => {
                            const viewportPadding = 12;
                            const horizontalGap = 18;
                            const tooltipMaxWidth = Math.min(360, window.innerWidth - viewportPadding * 2);
                            const canPlaceRight = hoveredReadingNote.x + horizontalGap + tooltipMaxWidth <= window.innerWidth - viewportPadding;
                            if (canPlaceRight) return `${hoveredReadingNote.x + horizontalGap}px`;
                            return `${Math.max(viewportPadding, hoveredReadingNote.x - horizontalGap - tooltipMaxWidth)}px`;
                        })(),
                        top: hoveredReadingNote.anchorTop > 88
                            ? `${hoveredReadingNote.anchorTop - 10}px`
                            : `${hoveredReadingNote.anchorBottom + 10}px`,
                        transform: hoveredReadingNote.anchorTop > 88
                            ? "translateY(-100%)"
                            : "translateY(0)",
                    }}
                >
                    {hoveredReadingNote.text}
                </div>,
                document.body
            )}
        </div>
    );
}

interface SelectionActionPopupProps {
    selectionRect: DOMRect;
    selectedText: string | null;
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
    onClose: () => void;
}

function SelectionActionPopup({
    selectionRect,
    selectedText,
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
    onClose,
}: SelectionActionPopupProps) {
    const ref = useRef<HTMLDivElement>(null);
    const dragStateRef = useRef<{
        pointerId: number;
        startClientX: number;
        startClientY: number;
        originX: number;
        originY: number;
    } | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [measuredHeight, setMeasuredHeight] = useState(240);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

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
    ]);

    const viewportPadding = 16;
    const popupWidth = 380;
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

    return (
        <div
            ref={ref}
            className="fixed z-[9999] animate-in fade-in zoom-in-95 duration-200"
            style={{
                top: `${clampedTop}px`,
                left: `${clampedLeft}px`,
                width: 'auto',
                maxWidth: `${popupWidth}px`,
                minWidth: '280px'
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="max-h-[min(560px,calc(100vh-2rem))] overflow-y-auto rounded-2xl border border-white/45 bg-white/82 p-3 shadow-[0_12px_36px_rgba(0,0,0,0.16)] backdrop-blur-xl">
                <div
                    className="mb-2 flex items-start justify-between gap-2 cursor-grab active:cursor-grabbing"
                    onPointerDown={handleDragStart}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                >
                    <p className="line-clamp-2 text-xs font-semibold text-stone-600">
                        {selectedText || "选中文本"}
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={onCreateHighlight}
                        disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Highlighter className="h-3.5 w-3.5" />
                        高亮
                    </button>
                    <button
                        type="button"
                        onClick={onCreateUnderline}
                        disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2 py-1.5 text-xs font-semibold text-fuchsia-700 transition-colors hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Underline className="h-3.5 w-3.5" />
                        下划线
                    </button>
                    <button
                        type="button"
                        onClick={onOpenNoteComposer}
                        disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <PenTool className="h-3.5 w-3.5" />
                        {isEditingNote ? "编辑标注" : "标注"}
                    </button>
                    <button
                        type="button"
                        onClick={onAnalyze}
                        disabled={isAnalyzingPhrase}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isAnalyzingPhrase ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        解读 · -{getReadingCoinCost("analyze_phrase")}
                    </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={onDeleteHighlight}
                        disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden || !canDeleteHighlight}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        删除高亮
                    </button>
                    <button
                        type="button"
                        onClick={onDeleteUnderline}
                        disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden || !canDeleteUnderline}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        删除下划线
                    </button>
                </div>

                {canDeleteNote ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={onEditNote}
                            disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            编辑标注
                        </button>
                        <button
                            type="button"
                            onClick={onDeleteNote}
                            disabled={!canCreateReadingNote || isSavingReadingNote || noteLayerHidden}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            删除标注
                        </button>
                    </div>
                ) : null}

                {noteLayerHidden ? (
                    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] font-medium text-blue-700">
                        语法分析已开启，笔记高亮层暂时隐藏。关闭语法分析后会恢复显示。
                    </div>
                ) : null}

                {!noteLayerHidden && isEditingNote ? (
                    <div className="mt-2 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-2 text-[11px] font-semibold text-cyan-700">
                        已选中已有标注，直接修改内容后保存即可更新。
                    </div>
                ) : null}

                {isNoteComposerOpen && (
                    <div className="mt-3 space-y-2 rounded-xl border border-sky-200 bg-white/75 p-2.5">
                        <textarea
                            value={noteDraft}
                            onChange={(event) => onNoteDraftChange(event.target.value)}
                            placeholder="写下你的标注..."
                            className="h-20 w-full resize-none rounded-md border border-sky-100 bg-white px-2 py-1.5 text-xs text-stone-700 outline-none ring-sky-200 placeholder:text-stone-400 focus:ring-2"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={onCancelNoteComposer}
                                className="rounded-md border border-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-500 transition-colors hover:bg-stone-50"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={onSaveNote}
                                disabled={!noteDraft.trim() || isSavingReadingNote}
                                className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSavingReadingNote ? "保存中..." : (isEditingNote ? "更新标注" : "保存标注")}
                            </button>
                        </div>
                    </div>
                )}

                {phraseAnalysis && (
                    <div className="mt-3 space-y-3 rounded-xl border border-stone-200 bg-white/70 p-3">
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
