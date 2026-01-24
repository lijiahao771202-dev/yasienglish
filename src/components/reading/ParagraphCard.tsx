import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, BookOpen, Mic, Languages, Loader2, MessageCircleQuestion, Send, PenTool, GripVertical, RotateCcw, Volume2, Gauge, X, Sparkles, XCircle, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReadingSettings } from "@/contexts/ReadingSettingsContext";
import { useTTS } from "@/hooks/useTTS";
import { SpeakingPanel } from "./SpeakingPanel";
import { useAnalysisStore } from "@/lib/analysis-store";
import { SyntaxTreeView } from "./SyntaxTreeView";
import { bionicText } from "@/lib/bionic";

interface ParagraphCardProps {
    text: string;
    index: number;
    articleTitle?: string;
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
}

export function ParagraphCard({ text, index, articleTitle, onWordClick, onSplit, onMerge, onUpdate, isEditMode, startTime, endTime, currentVideoTime, onSeekToTime, isFocusMode, isFocusLocked, hasActiveFocusLock, onToggleFocusLock }: ParagraphCardProps) {
    const { fontSizeClass, fontClass, isBionicMode } = useReadingSettings();
    const {
        translations, setTranslation: setStoreTranslation,
        grammarAnalyses, setGrammarAnalysis: setStoreGrammarAnalysis,
        loadFromDB
    } = useAnalysisStore();

    // Local visibility state
    const [showTranslation, setShowTranslation] = useState(false);
    const [showGrammar, setShowGrammar] = useState(false);

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

    // Ask AI State
    const [isAskOpen, setIsAskOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState<string | null>(null);
    const [isAskLoading, setIsAskLoading] = useState(false);

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

    const pRef = useRef<HTMLDivElement>(null);

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

        try {
            const res = await fetch("/api/ai/analyze-phrase", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, selection: selectedText }),
            });
            const data = await res.json();
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
        try {
            const res = await fetch("/api/ai/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, context: text }),
            });
            const data = await res.json();
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
                setShowGrammar(!showGrammar); // Toggle visibility
                return;
            }
        }

        if (!forceRegenerate && showGrammar && mode === "basic") {
            setShowGrammar(false);
            return;
        }

        setShowGrammar(true);
        if (mode === "deep") setShowDeepAnalysis(true);

        setIsAnalyzingGrammar(true);
        try {
            const res = await fetch("/api/ai/grammar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, mode }),
            });
            const data = await res.json();

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

    const handleAskAI = async () => {
        if (!question.trim()) return;

        setIsAskLoading(true);
        setAnswer(null);
        try {
            const res = await fetch("/api/ai/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, question }),
            });
            const data = await res.json();
            setAnswer(data.answer);
        } catch (err) {
            console.error(err);
            setAnswer("Sorry, something went wrong. Please try again.");
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
                        (() => {
                            let content: React.ReactNode[] = [];
                            const sentences = grammarAnalysis.difficult_sentences || [];

                            // Flatten all highlights from all sentences into a single list of ranges
                            interface HighlightRange {
                                start: number;
                                end: number;
                                type: string;
                                explanation: string;
                                color: string;
                                isMainSentence?: boolean;
                                segment_translation?: string;
                            }

                            const ranges: HighlightRange[] = [];

                            sentences.forEach((s: any, sIdx: number) => {
                                const sStart = text.indexOf(s.sentence);
                                if (sStart === -1) return;

                                // Add the main sentence ID range (for translation marker)
                                content.push(
                                    <span key={`trans-icon-${sStart}`} className="inline-block mr-1 relative group/trans-icon align-middle select-none z-10">
                                        <span className="cursor-help text-[10px] font-bold bg-amber-100 text-amber-600 hover:text-white hover:bg-amber-500 rounded-full w-4 h-4 flex items-center justify-center transition-all duration-300 border border-amber-200 shadow-sm">
                                            {sIdx + 1}
                                        </span>

                                        {/* Full Sentence Translation Tooltip */}
                                        <span className="fixed z-[9999] p-4 rounded-xl opacity-0 group-hover/trans-icon:opacity-100 pointer-events-none transition-all duration-300 ease-out transform translate-y-2 group-hover/trans-icon:translate-y-0 backdrop-blur-xl bg-white/95 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/50 text-left w-80 ring-1 ring-black/5"
                                            style={{
                                                left: `Math.min(e.clientX, window.innerWidth - 340)px`, // This needs dynamic positioning, simplified for now
                                                // Using simple CSS positioning relative to parent might be safer if not clipped
                                                // Reverting to absolute for simplicity, assuming no overflow issues for now or relying on smart placement if we had a library
                                            }}
                                        >
                                            {/* Note: Fixed positioning without JS measurements is tricky. 
                                                Let's stick to absolute relative to the icon for now, but ensure z-index is high. 
                                                If overflow happens, we might need the Portal approach again. 
                                                For this "StartLine" fix, let's keep it simple. 
                                            */}
                                        </span>
                                        <span className="absolute bottom-full left-0 mb-2 w-80 p-4 rounded-xl opacity-0 group-hover/trans-icon:opacity-100 pointer-events-none z-30 transition-all duration-300 ease-out transform translate-y-2 group-hover/trans-icon:translate-y-0 backdrop-blur-xl bg-white/95 shadow-xl border border-stone-200 text-left">
                                            <div className="flex justify-between items-center mb-2 border-b border-stone-100 pb-2">
                                                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">第 {sIdx + 1} 句</span>
                                                <span className="text-[10px] font-medium text-stone-400 bg-stone-50 px-2 py-0.5 rounded-full">中文翻译</span>
                                            </div>
                                            <div className="text-sm text-stone-700 leading-relaxed font-medium">
                                                {s.translation}
                                            </div>
                                        </span>
                                    </span>
                                );

                                // Add structural highlights
                                if (s.highlights) {
                                    s.highlights.forEach((h: any) => {
                                        // Find highlight within the sentence to ensure correct occurrence
                                        const hRelativeStart = s.sentence.indexOf(h.substring);
                                        if (hRelativeStart === -1) return;

                                        const hStart = sStart + hRelativeStart;
                                        ranges.push({
                                            start: hStart,
                                            end: hStart + h.substring.length,
                                            type: h.type,
                                            explanation: h.explanation,
                                            segment_translation: h.segment_translation,
                                            color: getHighlightColor(h.type),
                                            isMainSentence: false
                                        });
                                    });
                                }
                            });

                            // Remove the rendering loop that was causing issues and use a simpler replacement strategy
                            // or keep the range logic but fix the "StartLine" error 
                            // The error was likely due to the previous `content.push` inside the loop not being in the right place relative to the text reconstruction.
                            // Let's rebuild the text reconstruction cleanly.

                            const points = new Set<number>([0, text.length]);
                            ranges.forEach(r => {
                                points.add(r.start);
                                points.add(r.end);
                            });
                            // Also need to split where sentences start to insert icons?
                            // No, I inserted icons separately above. Wait, that pushes icons to `content`, but the text reconstruction loop below creates a NEW content list? 
                            // Ah, I need to merge them.

                            // Better strategy:
                            // 1. Reconstruct text segments.
                            // 2. Insert icons at the appropriate segment boundaries.

                            sentences.forEach((s: any) => {
                                const start = text.indexOf(s.sentence);
                                if (start !== -1) points.add(start);
                            });

                            const sortedPoints = Array.from(points).sort((a, b) => a - b);

                            // We need to sync the icons with the text. The icons are "independent" nodes in the DOM flow.
                            // Let's reset content array to be strictly the flow of elements.
                            content = [];

                            for (let i = 0; i < sortedPoints.length - 1; i++) {
                                const start = sortedPoints[i];
                                const end = sortedPoints[i + 1];
                                const segmentText = text.substring(start, end);
                                if (!segmentText) continue;

                                // Check if a NEW sentence starts exactly here
                                const startingSentenceIdx = sentences.findIndex((s: any) => text.indexOf(s.sentence) === start);
                                if (startingSentenceIdx !== -1) {
                                    content.push(
                                        <span key={`icon-${start}`} className="inline-block mr-1 relative group/trans-icon align-middle select-none z-10">
                                            <span className="cursor-help text-[10px] font-bold bg-amber-100 text-amber-600 hover:text-white hover:bg-amber-500 rounded-full w-4 h-4 flex items-center justify-center transition-all duration-300 border border-amber-200 shadow-sm">
                                                {startingSentenceIdx + 1}
                                            </span>
                                            <span className="absolute bottom-full left-0 mb-2 w-80 p-4 rounded-xl opacity-0 group-hover/trans-icon:opacity-100 pointer-events-none z-30 transition-all duration-300 ease-out transform translate-y-2 group-hover/trans-icon:translate-y-0 backdrop-blur-xl bg-white/95 shadow-xl border border-stone-200 text-left">
                                                <div className="flex justify-between items-center mb-2 border-b border-stone-100 pb-2">
                                                    <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">第 {startingSentenceIdx + 1} 句</span>
                                                    <span className="text-xs font-bold text-stone-400 bg-stone-50 px-2 py-0.5 rounded-full">译文</span>
                                                </div>
                                                <div className="text-sm text-stone-700 leading-relaxed font-medium">
                                                    {sentences[startingSentenceIdx].translation}
                                                </div>
                                            </span>
                                        </span>
                                    );
                                }

                                // Find ranges covering this segment
                                const coveringRanges = ranges.filter(r => r.start <= start && r.end >= end);
                                // Prioritize structural highlights (smallest range first ideally, for nesting, but here we assume flat structure mostly)
                                const structRange = coveringRanges.sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];

                                if (structRange) {
                                    content.push(
                                        <span
                                            key={`${start}-${end}`}
                                            className={cn(
                                                "cursor-help transition-all duration-200 relative group/highlight rounded-sm px-0.5 mx-0.5 border-b-2",
                                                structRange.color
                                            )}
                                        >
                                            {segmentText}
                                            {/* Highlight Tooltip */}
                                            <span className={cn(
                                                "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[280px] rounded-xl opacity-0 group-hover/highlight:opacity-100 pointer-events-none z-[100] transition-all duration-200 ease-out transform translate-y-2 group-hover/highlight:translate-y-0 backdrop-blur-xl bg-white/95 text-stone-800 shadow-[0_8px_30px_rgba(0,0,0,0.15)] border border-white/60 overflow-hidden ring-1 ring-black/5"
                                            )}>
                                                {/* Header: Type */}
                                                <div className="px-3 py-2 bg-gradient-to-r from-stone-50 to-white border-b border-stone-100 flex justify-between items-center">
                                                    <span className="text-[10px] font-bold text-stone-600 uppercase tracking-widest flex items-center gap-1.5">
                                                        <BookOpen className="w-3 h-3 text-amber-500" />
                                                        {translateGrammarType(structRange.type)}
                                                    </span>
                                                </div>

                                                {/* Content: Translation & Explanation */}
                                                <div className="p-3 bg-white/50 space-y-2">
                                                    {structRange.segment_translation && (
                                                        <div className="text-sm font-bold text-amber-600 leading-tight pb-2 border-b border-stone-100 border-dashed">
                                                            {structRange.segment_translation}
                                                        </div>
                                                    )}
                                                    <div className="text-xs text-stone-600 font-medium leading-relaxed">
                                                        {structRange.explanation}
                                                    </div>
                                                </div>

                                                {/* Decorative Arrow */}
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-6 border-transparent border-t-white/95 filter drop-shadow-sm"></div>
                                            </span>
                                        </span>
                                    );
                                } else {
                                    content.push(<span key={`${start}-${end}`}>{segmentText}</span>);
                                }
                            }

                            return content;
                        })()
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
                                text
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
                        {showTranslation ? "Hide" : "Translate"}
                    </button>

                    <button
                        onClick={() => handleGrammarAnalysis(false)}
                        className={cn("flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-md", grammarAnalysis ? "bg-orange-100 text-orange-600" : "text-stone-400 hover:bg-stone-100 hover:text-orange-500")}
                    >
                        {isAnalyzingGrammar ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookOpen className="w-3 h-3" />}
                        {showGrammar ? "Hide Grammar" : "Grammar"}
                    </button>

                    <button
                        onClick={() => setIsAskOpen(!isAskOpen)}
                        className={cn("flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-md", isAskOpen ? "bg-blue-100 text-blue-600" : "text-stone-400 hover:bg-stone-100 hover:text-blue-500")}
                    >
                        <MessageCircleQuestion className="w-3 h-3" /> Ask AI
                    </button>

                    <button
                        onClick={() => setIsPracticing(!isPracticing)}
                        className={cn("flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-md", isPracticing ? "bg-amber-100 text-amber-600" : "text-stone-400 hover:bg-stone-100 hover:text-amber-500")}
                    >
                        <PenTool className="w-3 h-3" /> Practice
                    </button>
                </div>

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
                            className="bg-orange-50 p-4 rounded-lg border border-orange-100 space-y-4 relative group/grammar"
                        >
                            {/* Old hidden button removed */}

                            {grammarAnalysis.difficult_sentences?.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-orange-700 font-bold text-sm">Grammar Analysis</h4>
                                            <button
                                                onClick={() => handleGrammarAnalysis(true, "basic")}
                                                className="p-1.5 hover:bg-orange-100 rounded-full text-orange-400 hover:text-orange-600 transition-colors"
                                                title="Regenerate Basic Analysis"
                                            >
                                                <RotateCcw className="w-3 h-3" />
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {/* Deep Analysis Controls */}
                                            {showDeepAnalysis && grammarAnalysis.difficult_sentences[0].sentence_tree && (
                                                <button
                                                    onClick={() => handleGrammarAnalysis(true, "deep")}
                                                    className="p-1.5 hover:bg-orange-100 rounded-full text-orange-400 hover:text-orange-600 transition-colors"
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
                                                className="text-xs font-medium text-orange-600 hover:text-orange-800 hover:bg-orange-100 px-2 py-1 rounded transition-colors flex items-center gap-1"
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
                                                                                const styleClass = getHighlightColor(result.point);
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
                                            Click "Analyze Deep Structure" to generate detailed sentence trees.
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
                            <div className="relative">
                                <input
                                    type="text"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAskAI()}
                                    placeholder="Ask a question about this paragraph..."
                                    className="w-full bg-white/50 border border-stone-200 rounded-lg p-3 pr-10 text-stone-800 focus:outline-none focus:border-blue-400 text-sm"
                                />
                                <button
                                    onClick={handleAskAI}
                                    disabled={isAskLoading || !question.trim()}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-md disabled:opacity-50 transition-colors"
                                >
                                    {isAskLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </button>
                            </div>

                            {answer && (
                                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-bold text-blue-600 text-sm">AI Answer</span>
                                    </div>
                                    <p className="text-sm text-stone-700">{answer}</p>
                                </div>
                            )}
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
                                <textarea
                                    value={userTranslation}
                                    onChange={(e) => setUserTranslation(e.target.value)}
                                    placeholder="Type your translation here..."
                                    className="w-full bg-white/50 border border-stone-200 rounded-lg p-3 text-stone-800 focus:outline-none focus:border-amber-400 min-h-[80px] text-sm resize-y"
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
                <div
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
                                onClick={handleAnalyzePhrase}
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
                                        <span>Context Translate</span>
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
                                    onClick={closePhraseAnalysis}
                                    className="absolute top-3 right-3 p-1.5 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-200/50 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

// Helper to get colors for different grammar types
function getHighlightColor(type: string): string {
    const t = type.toLowerCase();

    // === 核心层 (Core Layer) - 优雅、清晰 ===
    // 移除默认背景，改用 hover 显现，增强呼吸感
    // 使用 border-b-2 + opacity 降低视觉冲击

    // 主语 (Subject): 湖水绿 (Teal)
    if (t.includes("subject") || t.includes("主语")) {
        return "border-b-2 border-teal-400/40 text-teal-800 hover:bg-teal-50/50 transition-colors pb-0.5";
    }

    // 谓语/动词 (Predicate/Verb): 玫瑰红 (Rose)
    if (t.includes("verb") || t.includes("predicate") || t.includes("谓语") || t.includes("动词")) {
        return "border-b-2 border-rose-400/40 text-rose-800 hover:bg-rose-50/50 transition-colors pb-0.5";
    }

    // 宾语 (Object): 靛青 (Indigo)
    if (t.includes("object") || t.includes("宾语")) {
        return "border-b-2 border-indigo-400/40 text-indigo-800 hover:bg-indigo-50/50 transition-colors pb-0.5";
    }

    // === 修饰层 (Modifier Layer) - 轻盈、呼吸感 ===
    // 虚线 + 轻量化颜色

    // 定语 (Attributive/Adjective): 天空蓝 (Sky)
    if (t.includes("adjective") || t.includes("attributive") || t.includes("定语")) {
        return "border-b border-dashed border-sky-400/40 text-sky-700 hover:bg-sky-50/30 pb-0.5";
    }

    // 状语 (Adverbial): 琥珀金 (Amber)
    if (t.includes("adverb") || t.includes("状语")) {
        return "border-b border-dashed border-amber-400/40 text-amber-700 hover:bg-amber-50/30 pb-0.5";
    }

    // 补语 (Complement): 紫罗兰 (Violet)
    if (t.includes("complement") || t.includes("补语")) {
        return "border-b border-dashed border-violet-400/40 text-violet-700 hover:bg-violet-50/30 pb-0.5";
    }

    // 同位语 (Appositive): 橙色 (Orange)
    if (t.includes("appositive") || t.includes("同位语")) {
        return "border-b border-dotted border-orange-400/40 text-orange-700 hover:bg-orange-50/30 pb-0.5";
    }

    // 介词短语 (Preposition): 石灰色 (Stone)
    if (t.includes("preposition") || t.includes("介词")) {
        return "border-b border-stone-200 text-stone-600 hover:bg-stone-50/50 pb-0.5";
    }

    // === 结构层 (Structure Layer) - 柔和标记 ===

    // 从句 (Clause): 极细侧边
    if (t.includes("clause") || t.includes("从句")) {
        return "border-l-2 border-stone-200/60 pl-1 text-stone-600 hover:bg-stone-50/30";
    }

    // Default: 干净的文字
    return "text-stone-600";
}

function translateGrammarType(type: string): string {
    const t = type.toLowerCase();
    if (t.includes("relative clause")) return "定语从句";
    if (t.includes("adverbial clause")) return "状语从句";
    if (t.includes("noun clause")) return "名词性从句";
    if (t.includes("appositive")) return "同位语";
    if (t.includes("passive voice")) return "被动语态";
    if (t.includes("participle")) return "分词结构";
    if (t.includes("inversion")) return "倒装句";
    if (t.includes("subjunctive")) return "虚拟语气";
    if (t.includes("predicate")) return "谓语";
    if (t.includes("subject")) return "主语";
    if (t.includes("object")) return "宾语";
    if (t.includes("adverb")) return "状语";
    if (t.includes("adjective")) return "形容词/定语";
    return type; // Return original if no match (or if already Chinese)
}


