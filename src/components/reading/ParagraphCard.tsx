import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, BookOpen, Mic, Languages, Loader2, MessageCircleQuestion, Send, PenTool, GripVertical, RotateCcw, Volume2, Gauge, X, Sparkles, XCircle, Globe } from "lucide-react";
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
import { getGrammarHighlightColor, type GrammarDisplayMode } from "@/lib/grammarHighlights";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { applyServerProfilePatchToLocal } from "@/lib/user-repository";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { getReadingCoinCost, INSUFFICIENT_READING_COINS, type ReadingEconomyAction } from "@/lib/reading-economy";
import { dispatchReadingCoinFx } from "@/lib/reading-coin-fx";

interface ParagraphCardProps {
    text: string;
    index: number;
    articleTitle?: string;
    articleUrl?: string;
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

export function ParagraphCard({ text, index, articleTitle, articleUrl, onWordClick, onSplit, onMerge, onUpdate, isEditMode, startTime, endTime, currentVideoTime, onSeekToTime, isFocusMode, isFocusLocked, hasActiveFocusLock, onToggleFocusLock, highlightSnippet }: ParagraphCardProps) {
    const sessionUser = useAuthSessionUser();
    const { fontSizeClass, fontClass, isBionicMode } = useReadingSettings();
    const {
        translations, setTranslation: setStoreTranslation,
        grammarAnalyses, setGrammarAnalysis: setStoreGrammarAnalysis,
        loadFromDB
    } = useAnalysisStore();

    // Local visibility state
    const [showTranslation, setShowTranslation] = useState(false);
    const [showGrammar, setShowGrammar] = useState(false);
    const [grammarDisplayMode, setGrammarDisplayMode] = useState<GrammarDisplayMode>("core");

    const [isTranslating, setIsTranslating] = useState(false);
    const [isAnalyzingGrammar, setIsAnalyzingGrammar] = useState(false);
    const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);
    const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);

    // Load from DB on mount
    useEffect(() => {
        loadFromDB(text);
    }, [text, loadFromDB]);

    // Derived data from store
    const translation = translations[text];
    const grammarAnalysis = grammarAnalyses[text];

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
    const [critique, setCritique] = useState<any>(null);
    const [isCritiquing, setIsCritiquing] = useState(false);

    // Speaking State
    const [isSpeakingOpen, setIsSpeakingOpen] = useState(false);
    const [isBlind, setIsBlind] = useState(false);

    // Phrase Analysis State
    const [selectedText, setSelectedText] = useState<string | null>(null);
    const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
    const [phraseAnalysis, setPhraseAnalysis] = useState<any | null>(null);
    const [isAnalyzingPhrase, setIsAnalyzingPhrase] = useState(false);
    const [activeHighlightSpan, setActiveHighlightSpan] = useState<HTMLElement | null>(null);
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

    const renderTextWithUnderline = (paragraphText: string, snippet?: string) => {
        if (!snippet) return paragraphText;
        const normalizedSnippet = snippet.trim();
        if (!normalizedSnippet) return paragraphText;

        const lowerText = paragraphText.toLowerCase();
        const lowerSnippet = normalizedSnippet.toLowerCase();
        const idx = lowerText.indexOf(lowerSnippet);
        if (idx < 0) return paragraphText;

        const before = paragraphText.slice(0, idx);
        const hit = paragraphText.slice(idx, idx + normalizedSnippet.length);
        const after = paragraphText.slice(idx + normalizedSnippet.length);

        return (
            <>
                {before}
                <span className="rounded-[2px] border-b-2 border-amber-500/95 bg-amber-100/45 px-0.5">
                    {hit}
                </span>
                {after}
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

        // Clean up previous highlight if exists
        if (activeHighlightSpan) {
            unwrapSpan(activeHighlightSpan);
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setSelectionRect(rect);
        setSelectedText(selectedStr);
        setPhraseAnalysis(null);

        // DO NOT modify DOM for multi-select to avoid breaking native selection behavior
        // Just rely on native blue selection
    };

    const unwrapSpan = (span: HTMLElement) => {
        try {
            const parent = span.parentNode;
            if (parent) {
                while (span.firstChild) {
                    parent.insertBefore(span.firstChild, span);
                }
                parent.removeChild(span);
                parent.normalize();
            }
        } catch (e) {
            console.warn("Failed to unwrap span:", e);
        }
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
        setPhraseAnalysis(null);
        if (activeHighlightSpan) {
            unwrapSpan(activeHighlightSpan);
            setActiveHighlightSpan(null);
        }
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

    const handleGrammarAnalysis = async (forceRegenerate = false, mode: "basic" | "deep" = "basic") => {
        if (!forceRegenerate && grammarAnalysis) {
            // If switching to deep mode and we don't have deep data (sentence_tree), force regenerate
            const hasDeepData = grammarAnalysis.difficult_sentences?.some((s: any) => s.sentence_tree);
            if (mode === "deep" && !hasDeepData) {
                // proceed to fetch
            } else {
                const nextShowGrammar = !showGrammar;
                setShowGrammar(nextShowGrammar);
                if (nextShowGrammar) {
                    setGrammarDisplayMode("core");
                }
                return;
            }
        }

        if (!forceRegenerate && showGrammar && mode === "basic") {
            setShowGrammar(false);
            return;
        }

        setShowGrammar(true);
        setGrammarDisplayMode("core");
        if (mode === "deep") setShowDeepAnalysis(true);

        setIsAnalyzingGrammar(true);
        setReadingCoinHint(null);
        try {
            const res = await fetch("/api/ai/grammar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text,
                    mode,
                    economyContext: readEconomyContext(mode === "deep" ? "grammar_deep" : "grammar_basic"),
                }),
            });
            const data = await res.json();
            if (!res.ok && data?.errorCode === INSUFFICIENT_READING_COINS) {
                setReadingCoinHint("阅读币不足，当前无法进行语法分析。");
                setShowGrammar(false);
                return;
            }
            await syncReadingBalance(data, mode === "deep" ? "grammar_deep" : "grammar_basic");

            // If deep mode, merge with existing data if possible, or just set it
            // For simplicity, we just set it. 
            // In a real app, we might want to preserve some basic info, but here the deep analysis includes everything needed.
            setStoreGrammarAnalysis(text, data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsAnalyzingGrammar(false);
        }
    };

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
            // Use the new glass-card-hover for that liquid feel
            return isVideoActive
                ? "bg-red-50/40 rounded-lg -mx-4 px-4 py-3 shadow-sm ring-1 ring-red-100"
                : "rounded-lg glass-card-hover -mx-4 px-4 py-1";
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
                    {isEditMode ? null : (showGrammar && grammarAnalysis ? (
                        <InlineGrammarHighlights
                            text={text}
                            sentences={grammarAnalysis.difficult_sentences || []}
                            displayMode={grammarDisplayMode}
                            showSentenceMarkers
                            showSegmentTranslation
                        />
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
                                renderTextWithUnderline(text, highlightSnippet)
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
                            {/* Old hidden button removed */}

                            {grammarAnalysis.difficult_sentences?.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-newsreader text-xl font-semibold text-[#8a5d1f]">Grammar Analysis</h4>
                                            <button
                                                onClick={() => handleGrammarAnalysis(true, "basic")}
                                                className="rounded-full border border-[#e4d5b5] bg-white/80 p-1.5 text-[#b18747] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:text-[#8a5d1f]"
                                                title="Regenerate Basic Analysis"
                                            >
                                                <RotateCcw className="w-3 h-3" />
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2">
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
                                            {/* Deep Analysis Controls */}
                                            {showDeepAnalysis && grammarAnalysis.difficult_sentences[0].sentence_tree && (
                                                <button
                                                    onClick={() => handleGrammarAnalysis(true, "deep")}
                                                    className="rounded-full border border-[#e4d5b5] bg-white/75 p-1.5 text-[#b18747] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:text-[#8a5d1f]"
                                                    title="Regenerate Deep Analysis"
                                                >
                                                    <RotateCcw className="w-3 h-3" />
                                                </button>
                                            )}

                                            <button
                                                onClick={() => {
                                                    if (!showDeepAnalysis && !grammarAnalysis.difficult_sentences[0].sentence_tree) {
                                                        // Trigger Deep Analysis
                                                        handleGrammarAnalysis(true, "deep");
                                                    } else {
                                                        setShowDeepAnalysis(!showDeepAnalysis);
                                                    }
                                                }}
                                                disabled={isAnalyzingGrammar}
                                                className="flex items-center gap-1 rounded-full border border-transparent px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] text-[#8a5d1f] transition-colors hover:border-[#e4d5b5] hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-70"
                                            >
                                                {isAnalyzingGrammar ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                                {showDeepAnalysis ? "Hide Deep Analysis" : (grammarAnalysis.difficult_sentences[0].sentence_tree ? "Expand Deep Analysis" : "Analyze Deep Structure")}
                                            </button>
                                        </div>
                                    </div>

                                    {showDeepAnalysis && (grammarAnalysis.difficult_sentences[0].sentence_tree ? (
                                        <>
                                            {/* Tab Navigation */}
                                            <div className="flex gap-1 bg-orange-100/50 p-1 rounded-lg overflow-x-auto scrollbar-hide">
                                                {grammarAnalysis.difficult_sentences.map((_: any, idx: number) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setActiveSentenceIndex(idx)}
                                                        className={cn(
                                                            "px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap",
                                                            activeSentenceIndex === idx
                                                                ? "bg-white text-orange-600 shadow-sm"
                                                                : "text-orange-400 hover:text-orange-600 hover:bg-white/50"
                                                        )}
                                                    >
                                                        Sentence {idx + 1}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Active Sentence Analysis Card */}
                                            {(() => {
                                                const item = grammarAnalysis.difficult_sentences[activeSentenceIndex];
                                                if (!item) return null;

                                                return (
                                                    <div
                                                        key={activeSentenceIndex}
                                                        className="bg-white/50 p-3 rounded border border-orange-100 space-y-2 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
                                                    >
                                                        <div className="pl-2">
                                                            {/* Analysis Table */}
                                                            {item.analysis_results && item.analysis_results.length > 0 ? (
                                                                <div className="overflow-hidden rounded-lg border border-stone-200">
                                                                    <table className="min-w-full divide-y divide-stone-200">
                                                                        <thead className="bg-stone-50">
                                                                            <tr>
                                                                                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-stone-500 uppercase tracking-wider w-1/3">语法点</th>
                                                                                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">详细解析</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="bg-white divide-y divide-stone-200">
                                                                            {item.analysis_results.map((result: any, k: number) => {
                                                                                const styleClass = getGrammarHighlightColor(result.point);
                                                                                // Extract border color for the underline and text color
                                                                                const borderColor = styleClass.match(/border-\w+-\d+/)?.[0] || "border-stone-400";
                                                                                const textColor = styleClass.match(/text-\w+-\d+/)?.[0] || "text-stone-700";

                                                                                return (
                                                                                    <tr key={k} className="hover:bg-stone-50/50 transition-colors">
                                                                                        <td className="px-3 py-3 text-xs font-semibold align-top w-1/3">
                                                                                            <span className={cn("border-b-2 pb-0.5 inline-block", borderColor, textColor)}>
                                                                                                {result.point}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="px-3 py-3 text-xs text-stone-600 leading-relaxed">
                                                                                            {result.explanation.split(/(\*\*.*?\*\*)/).map((part: string, i: number) => {
                                                                                                if (part.startsWith("**") && part.endsWith("**")) {
                                                                                                    return <span key={i} className="font-bold text-stone-800 bg-yellow-100/50 px-0.5 rounded">{part.slice(2, -2)}</span>;
                                                                                                }
                                                                                                return part;
                                                                                            })}
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            ) : item.analysis_points ? (
                                                                // Fallback for old data format
                                                                <ul className="list-disc list-inside text-xs text-stone-600 space-y-1">
                                                                    {item.analysis_points.map((point: string, j: number) => (
                                                                        <li key={j}>{point}</li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <p className="text-xs text-stone-600 mb-1">{item.analysis}</p>
                                                            )}
                                                        </div>

                                                        {/* Visual Syntax Tree */}
                                                        {item.sentence_tree && (
                                                            <div className="mt-4 pt-4 border-t border-stone-100">
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <Gauge className="w-4 h-4 text-amber-600" />
                                                                    <h5 className="text-xs font-bold text-stone-500 uppercase tracking-wider">Syntax Structure</h5>
                                                                </div>
                                                                <SyntaxTreeView data={item.sentence_tree} />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </>
                                    ) : (
                                        <div className="text-center p-4 text-stone-500 text-sm italic">
                                            Click &quot;Analyze Deep Structure&quot; to generate detailed sentence trees.
                                        </div>
                                    ))}
                                </div>
                            )}
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

                                    {critique.corrections?.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold text-stone-500">Corrections:</p>
                                            {critique.corrections.map((c: any, i: number) => (
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
                            )}
                        </motion.div>
                    )
                }
            </div>

            {/* Phrase Analysis Popup - Fixed Positioning - Liquid Glass Style */}
            {selectionRect && typeof document !== 'undefined' && createPortal(
                <PhraseAnalysisPopup
                    selectionRect={selectionRect}
                    phraseAnalysis={phraseAnalysis}
                    isAnalyzingPhrase={isAnalyzingPhrase}
                    onAnalyze={handleAnalyzePhrase}
                    onClose={closePhraseAnalysis}
                />,
                document.body
            )}
        </div>
    );
}

// Extracted Component for Click Outside Handling
function PhraseAnalysisPopup({ selectionRect, phraseAnalysis, isAnalyzingPhrase, onAnalyze, onClose }: any) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    return (
        <div
            ref={ref}
            className="fixed z-[9999] animate-in fade-in zoom-in-95 duration-200"
            style={{
                top: `${selectionRect.bottom + 12}px`,
                left: `${Math.min(Math.max(16, selectionRect.left), window.innerWidth - 320)}px`,
                width: 'auto',
                maxWidth: '360px',
                minWidth: '200px'
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className={cn(
                "rounded-2xl backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/40 overflow-hidden transition-all duration-300",
                phraseAnalysis
                    ? "bg-white/80 p-0"
                    : "bg-white/60 hover:bg-white/70 p-1"
            )}>
                {!phraseAnalysis ? (
                    // Initial State: Action Button
                    <button
                        onClick={onAnalyze}
                        disabled={isAnalyzingPhrase}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-stone-700 hover:text-amber-600 transition-colors"
                    >
                        {isAnalyzingPhrase ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                                <span className="text-stone-500">Translating...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4 text-amber-500" />
                                <span>Context Translate · -{getReadingCoinCost("analyze_phrase")}</span>
                            </>
                        )}
                    </button>
                ) : (
                    // Result State: Content
                    <div className="relative group">
                        <div className="p-5 pr-8 space-y-4">
                            {/* Primary Translation */}
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600/70 uppercase tracking-widest">
                                    <Globe className="w-3 h-3" />
                                    <span>中文翻译</span>
                                </div>
                                <div className="text-stone-800 text-base font-semibold leading-relaxed">
                                    {phraseAnalysis.translation}
                                </div>
                            </div>

                            {/* Grammar Point */}
                            {phraseAnalysis.grammar_point && (
                                <div className="space-y-1 pt-3 border-t border-stone-100">
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-500/70 uppercase tracking-widest">
                                        <BookOpen className="w-3 h-3" />
                                        <span>语法解析</span>
                                    </div>
                                    <div className="text-stone-600 text-sm leading-relaxed">
                                        {phraseAnalysis.grammar_point}
                                    </div>
                                </div>
                            )}

                            {/* Nuance/Context */}
                            {phraseAnalysis.nuance && (
                                <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100/50">
                                    <div className="text-amber-800 text-xs leading-relaxed italic">
                                        {phraseAnalysis.nuance}
                                    </div>
                                </div>
                            )}

                            {/* Key Vocabulary */}
                            {phraseAnalysis.vocabulary && phraseAnalysis.vocabulary.length > 0 && (
                                <div className="space-y-2 pt-3 border-t border-stone-100">
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                                        <Sparkles className="w-3 h-3" />
                                        <span>核心词汇</span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {phraseAnalysis.vocabulary.map((item: any, i: number) => (
                                            <div key={i} className="flex flex-col">
                                                <span className="text-xs font-bold text-stone-700">{item.word}</span>
                                                <span className="text-xs text-stone-500">{item.definition}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Close Button (Absolute) */}
                        <button
                            onClick={onClose}
                            className="absolute top-3 right-3 p-1.5 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-200/50 transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
