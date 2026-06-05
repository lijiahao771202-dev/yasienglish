"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Flame, Check, ChevronLeft, Trophy, Clock, BookOpen, RotateCcw, Hourglass } from "lucide-react";
import { ParagraphCard } from "./ParagraphCard";
import { WordPopup, type PopupState } from "./WordPopup";
import TEDVideoPlayer, { TEDVideoPlayerRef } from "./TEDVideoPlayer";
import { useReadingSettings } from "@/contexts/ReadingSettingsContext";
import { cn } from "@/lib/utils";
import type { ReadingMarkType, ReadingNoteItem } from "@/lib/db";
import type { AskContextAttachment } from "@/lib/ask-thread";
import {
    buildAskContextAttachmentFromRanges,
    type ReadSelectionParagraphRangeInput,
} from "@/lib/read-selection-context";
import { getPressableStyle } from "@/lib/pressable";

interface Block {
    type: 'paragraph' | 'header' | 'list' | 'image' | 'blockquote';
    id?: string;
    content?: string;
    tag?: string;
    items?: string[];
    src?: string;
    alt?: string;
    startTime?: number;  // For TED timed blocks
    endTime?: number;    // For TED timed blocks
}

interface ArticleDisplayProps {
    title: string;
    content: string;
    byline?: string;
    blocks?: Block[];
    siteName?: string;   // To detect TED articles
    videoUrl?: string;   // TED video URL
    articleUrl?: string; // Original article URL for download
    ragAppliedWords?: string[];
    difficulty?: "cet4" | "cet6" | "ielts";
    isEditMode?: boolean; // New prop for edit mode
    locateRequest?: {
        requestId: number;
        questionNumber?: number;
        paragraphNumber: number;
        evidence?: string;
    } | null;
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
    onArticleSnapshotDirty?: () => void;
    topActionNode?: React.ReactNode;
    onCompleteArticle?: () => void;
}

export function ArticleDisplay({
    title,
    content,
    byline,
    blocks,
    siteName,
    videoUrl,
    articleUrl,
    ragAppliedWords = [],
    isEditMode,
    locateRequest,
    readingNotes = [],
    onCreateReadingNote,
    onDeleteReadingMarks,
    onArticleSnapshotDirty,
    topActionNode,
    onCompleteArticle,
}: ArticleDisplayProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    const videoPlayerRef = useRef<TEDVideoPlayerRef>(null);
    // Generate IDs if missing (migration)
    const [activeBlocks, setActiveBlocks] = useState<Block[]>(() => {
        const initial = blocks || [];
        return initial.map(b => ({
            ...b,
            id: b.id || Math.random().toString(36).substr(2, 9)
        }));
    });
    const [popup, setPopup] = useState<PopupState | null>(null);
    const [activeSpan, setActiveSpan] = useState<HTMLElement | null>(null);
    const [highlightedParagraphNumber, setHighlightedParagraphNumber] = useState<number | null>(null);
    const [highlightedQuestionNumber, setHighlightedQuestionNumber] = useState<number | null>(null);
    const [highlightedSnippet, setHighlightedSnippet] = useState<string | null>(null);
    const [activeAskContextAttachment, setActiveAskContextAttachment] = useState<AskContextAttachment | null>(null);
    const [activeAskAnchorParagraphOrder, setActiveAskAnchorParagraphOrder] = useState<number | null>(null);
    const lastWordTriggerRef = useRef<{ word: string; at: number }>({ word: "", at: 0 });

    const { fontClass, isFocusMode, paperStyleClass, isFlowMode, toggleFlowMode } = useReadingSettings();
    const [lockedFocusIndex, setLockedFocusIndex] = useState<number | null>(null);

    const estimatedReadMinutes = Math.max(
        3,
        Math.round(((content || "").split(/\s+/).filter(Boolean).length || 600) / 220),
    );

    useEffect(() => {
        if (!isFocusMode) {
            setLockedFocusIndex(null);
        }
    }, [isFocusMode]);
    const isTED = siteName === 'TED' || siteName === 'YouTube';

    // Flow Mode local states & memos
    const flowSegments = useMemo(() => {
        const segments: Array<{
            paragraphBlock: Block;
            paragraphIndex: number;
            paragraphOrder: number;
            precedingBlocks: Block[];
        }> = [];
        
        let currentPreceding: Block[] = [];
        let paragraphOrder = 0;
        
        activeBlocks.forEach((block, index) => {
            if (block.type === 'paragraph' && block.content) {
                paragraphOrder += 1;
                segments.push({
                    paragraphBlock: block,
                    paragraphIndex: index,
                    paragraphOrder: paragraphOrder,
                    precedingBlocks: currentPreceding
                });
                currentPreceding = [];
            } else {
                currentPreceding.push(block);
            }
        });
        
        if (currentPreceding.length > 0 && segments.length > 0) {
            segments[segments.length - 1].precedingBlocks.push(...currentPreceding);
        }
        
        return segments;
    }, [activeBlocks]);

    const isFlowActive = isFlowMode && flowSegments.length > 0;

    const [activeFlowIndex, setActiveFlowIndex] = useState(0);
    const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string }>>([]);
    const [isShaking, setIsShaking] = useState(false);
    const [isFlashing, setIsFlashing] = useState(false);
    const [timerMode, setTimerMode] = useState<'up' | 'down'>('up');
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [timeRemaining, setTimeRemaining] = useState(0);
    const [timerConfigured, setTimerConfigured] = useState(false);
    const [countdownDuration, setCountdownDuration] = useState(estimatedReadMinutes * 60);
    const [overtimeElapsed, setOvertimeElapsed] = useState(0);
    const [isOvertime, setIsOvertime] = useState(false);
    const [showOvertimeToast, setShowOvertimeToast] = useState(false);

    useEffect(() => {
        if (!isFlowMode) {
            setTimerConfigured(false);
            setIsOvertime(false);
            setOvertimeElapsed(0);
            setShowOvertimeToast(false);
        }
    }, [isFlowMode]);

    useEffect(() => {
        setActiveFlowIndex(0);
        setTimeElapsed(0);
        setTimerConfigured(false);
        setIsOvertime(false);
        setOvertimeElapsed(0);
        setShowOvertimeToast(false);
        const secs = estimatedReadMinutes * 60;
        setCountdownDuration(secs);
        setTimeRemaining(secs);
    }, [activeBlocks, estimatedReadMinutes]);

    const playFlowAlarmSound = () => {
        if (typeof window === "undefined") return;
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            const now = ctx.currentTime;
            
            // Triple A5 chime (880 Hz)
            const beats = [0, 0.25, 0.5];
            beats.forEach((t) => {
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();
                
                osc.type = "sine";
                osc.frequency.setValueAtTime(880, now + t);
                
                gainNode.gain.setValueAtTime(0, now + t);
                gainNode.gain.linearRampToValueAtTime(0.08, now + t + 0.02);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + t + 0.22);
                
                osc.connect(gainNode);
                gainNode.connect(ctx.destination);
                osc.start(now + t);
                osc.stop(now + t + 0.25);
            });
        } catch (e) {
            console.warn("Failed to play alarm sound:", e);
        }
    };

    useEffect(() => {
        if (!isFlowActive || !timerConfigured || activeFlowIndex >= flowSegments.length) return;

        const interval = setInterval(() => {
            if (timerMode === 'up') {
                setTimeElapsed(prev => prev + 1);
            } else {
                if (!isOvertime) {
                    setTimeRemaining(prev => {
                        if (prev <= 1) {
                            setIsOvertime(true);
                            setShowOvertimeToast(true);
                            playFlowAlarmSound();
                            return 0;
                        }
                        return prev - 1;
                    });
                } else {
                    setOvertimeElapsed(prev => prev + 1);
                }
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isFlowActive, timerConfigured, timerMode, isOvertime, activeFlowIndex, flowSegments.length]);

    const toggleTimerMode = () => {
        playFlowNavSound();
        setTimerMode(prev => prev === 'up' ? 'down' : 'up');
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const playFlowSuccessSound = (isLast: boolean) => {
        if (typeof window === "undefined") return;
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            const now = ctx.currentTime;

            if (isLast) {
                const freqs = [523.25, 659.25, 783.99, 1046.50];
                freqs.forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gainNode = ctx.createGain();
                    
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(freq, now + idx * 0.07);
                    
                    gainNode.gain.setValueAtTime(0, now);
                    gainNode.gain.linearRampToValueAtTime(0.08, now + idx * 0.07 + 0.02);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.6);
                    
                    osc.connect(gainNode);
                    gainNode.connect(ctx.destination);
                    osc.start(now + idx * 0.07);
                    osc.stop(now + idx * 0.07 + 0.65);
                });
            } else {
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();
                
                osc.type = "sine";
                osc.frequency.setValueAtTime(987.77, now);
                osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.08);
                
                gainNode.gain.setValueAtTime(0.08, now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                
                osc.connect(gainNode);
                gainNode.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.4);

                const osc2 = ctx.createOscillator();
                const gainNode2 = ctx.createGain();
                osc2.type = "triangle";
                osc2.frequency.setValueAtTime(329.63, now);
                gainNode2.gain.setValueAtTime(0.04, now);
                gainNode2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc2.connect(gainNode2);
                gainNode2.connect(ctx.destination);
                osc2.start(now);
                osc2.stop(now + 0.3);
            }
        } catch (e) {
            console.warn("Failed to play flow sound:", e);
        }
    };

    const playFlowNavSound = () => {
        if (typeof window === "undefined") return;
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            const now = ctx.currentTime;
            
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            osc.type = "sine";
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
            
            gainNode.gain.setValueAtTime(0.02, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
            
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.07);
        } catch (e) {
            console.warn("Failed to play nav sound:", e);
        }
    };

    const handleSegmentClick = (idx: number) => {
        playFlowNavSound();
        setActiveFlowIndex(idx);
    };



    const handleDoneClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 300);

        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 350);

        const isLastSegment = activeFlowIndex === flowSegments.length - 1;
        playFlowSuccessSound(isLastSegment);

        const newParticles = Array.from({ length: 32 }).map((_, i) => {
            const angle = (i / 32) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
            const distance = 50 + Math.random() * 80;
            const colors = ["#10b981", "#f59e0b", "#06b6d4", "#ec4899", "#8b5cf6"];
            const color = colors[Math.floor(Math.random() * colors.length)];
            return {
                id: Date.now() + i,
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                color,
            };
        });
        setParticles(newParticles);
        setTimeout(() => setParticles([]), 800);

        if (activeFlowIndex < flowSegments.length - 1) {
            const coinEvent = {
                id: `flow-complete-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                delta: 1,
                action: "read_complete" as const,
                label: `段落 ${activeFlowIndex + 1} 已读完`,
                timestamp: Date.now(),
            };
            window.dispatchEvent(new CustomEvent("reading:coin-fx", { detail: coinEvent }));
            setActiveFlowIndex(prev => prev + 1);
        } else {
            onCompleteArticle?.();
            setActiveFlowIndex(flowSegments.length);
        }
    };

    const renderBlock = (block: Block, index: number, paragraphOrder?: number) => {
        if (block.type === 'paragraph' && block.content) {
            const currentParagraphOrder = paragraphOrder || 1;
            const isLocatedParagraph = highlightedParagraphNumber === currentParagraphOrder;
            const useParagraphFallbackHighlight = isLocatedParagraph && !highlightedSnippet;
            return (
                <div
                    key={block.id || index}
                    data-article-paragraph={currentParagraphOrder}
                    data-article-paragraph-block-index={index}
                    data-article-paragraph-text={block.content}
                    className={cn(
                        "relative scroll-mt-8 rounded-[1.2rem] px-1 py-1 transition-all duration-500 md:scroll-mt-12",
                        useParagraphFallbackHighlight && "bg-theme-active-bg/30 ring-2 ring-theme-active-bg"
                    )}
                >
                    {isLocatedParagraph && highlightedQuestionNumber && highlightedQuestionNumber > 0 && (
                        <div className="pointer-events-none absolute -right-2 -top-2 z-20 rounded-full border-[3px] border-theme-border bg-theme-active-bg px-2.5 py-1 text-[10px] font-black text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)]">
                            第{highlightedQuestionNumber}题
                        </div>
                    )}
                    <ParagraphCard
                        text={block.content}
                        index={index}
                        paragraphOrder={currentParagraphOrder}
                        articleTitle={title}
                        articleUrl={articleUrl}
                        ragAppliedWords={ragAppliedWords}
                        readingNotes={notesByParagraph.get(currentParagraphOrder) ?? []}
                        onCreateReadingNote={onCreateReadingNote}
                        onDeleteReadingMarks={onDeleteReadingMarks}
                        onSnapshotDirty={onArticleSnapshotDirty}
                        onWordClick={handleArticleClick}
                        onOpenWordPopupFromSelection={openWordPopup}
                        askContextAttachment={activeAskAnchorParagraphOrder === currentParagraphOrder ? activeAskContextAttachment : null}
                        hasActiveAskDock={activeAskAnchorParagraphOrder !== null}
                        onOpenAskWithContext={(attachment) => {
                            const resolvedAttachment = resolveArticleSelectionContext() ?? attachment;
                            const targetParagraphOrder = activeAskAnchorParagraphOrder ?? currentParagraphOrder;
                            setActiveAskContextAttachment(resolvedAttachment);
                            setActiveAskAnchorParagraphOrder(targetParagraphOrder);
                            return resolvedAttachment;
                        }}
                        onSplit={handleSplit}
                        onMerge={handleMerge}
                        onUpdate={handleUpdate}
                        isEditMode={isEditMode}
                        startTime={block.startTime}
                        endTime={block.endTime}
                        isFocusMode={isFocusMode}
                        isFocusLocked={lockedFocusIndex === index}
                        hasActiveFocusLock={lockedFocusIndex !== null}
                        onSetFocusLock={() => setLockedFocusIndex(index)}
                        onClearFocusLock={() => setLockedFocusIndex(null)}
                        highlightSnippet={isLocatedParagraph ? (highlightedSnippet || undefined) : undefined}
                    />
                </div>
            );
        } else if (block.type === 'header') {
            const HeaderTag = (block.tag || 'h2') as React.ElementType;
            return <HeaderTag key={index} className="mt-8 mb-4 font-newsreader text-2xl font-medium text-theme-text">{block.content}</HeaderTag>;
        } else if (block.type === 'list' && block.items) {
            const ListTag = (block.tag || 'ul') as React.ElementType;
            return (
                <ListTag key={index} className="list-disc list-inside space-y-2 pl-4 text-theme-text my-4">
                    {block.items.map((item, i) => <li key={i}>{item}</li>)}
                </ListTag>
            );
        } else if (block.type === 'image' && block.src) {
            return (
                <div key={index} className="my-6 overflow-hidden rounded-[1.6rem] border-4 border-theme-border shadow-[0_6px_0_var(--theme-shadow)]">
                    <img src={block.src} alt={block.alt || ''} className="w-full h-auto object-cover" />
                </div>
            );
        } else if (block.type === 'blockquote' && block.content) {
            return (
                <blockquote key={index} className="my-6 rounded-[1.4rem] border-4 border-theme-border bg-theme-primary-bg/20 px-5 py-4 text-theme-text italic shadow-[0_4px_0_var(--theme-shadow)]">
                    {block.content}
                </blockquote>
            );
        }
        return null;
    };

    useEffect(() => {
        if (popup || !activeSpan) return;

        try {
            const parent = activeSpan.parentNode;
            if (parent && parent.contains(activeSpan)) {
                while (activeSpan.firstChild) {
                    parent.insertBefore(activeSpan.firstChild, activeSpan);
                }
                parent.removeChild(activeSpan);
                parent.normalize();
            }
        } catch (e) {
            console.warn("Failed to unwrap active span:", e);
        } finally {
            setActiveSpan(null);
        }
    }, [popup, activeSpan]);

    // Fallback for HTML content if no blocks (shouldn't happen with new API)
    useEffect(() => {
        if (contentRef.current && (!activeBlocks || activeBlocks.length === 0)) {
            const clean = DOMPurify.sanitize(content);
            contentRef.current.innerHTML = clean;
        }
    }, [content, activeBlocks]);

    useEffect(() => {
        if (blocks) {
            setActiveBlocks(blocks.map(b => ({
                ...b,
                id: b.id || Math.random().toString(36).substr(2, 9)
            })));
        }
    }, [blocks]);

    const notesByParagraph = useMemo(() => {
        const map = new Map<number, ReadingNoteItem[]>();
        for (const note of readingNotes) {
            const existing = map.get(note.paragraph_order);
            if (existing) {
                existing.push(note);
            } else {
                map.set(note.paragraph_order, [note]);
            }
        }
        return map;
    }, [readingNotes]);

    const paragraphEntries = useMemo(() => {
        const entries: Array<{ order: number; text: string }> = [];
        let paragraphCount = 0;
        for (const block of activeBlocks) {
            if (block.type === "paragraph" && block.content) {
                paragraphCount += 1;
                entries.push({ order: paragraphCount, text: block.content });
            }
        }
        return entries;
    }, [activeBlocks]);

    const pickBestSnippet = useCallback((paragraphText: string, evidence?: string): string | null => {
        if (!evidence) return null;
        const normalizedEvidence = evidence
            .replace(/[“”"']/g, "")
            .replace(/\s+/g, " ")
            .trim();
        if (!normalizedEvidence) return null;

        const candidates = [
            normalizedEvidence,
            ...normalizedEvidence.split(/[。！？.!?]/).map(s => s.trim()),
            ...normalizedEvidence.split(/[，,;；]/).map(s => s.trim()),
        ]
            .filter((s, i, arr) => s.length >= 10 && arr.indexOf(s) === i)
            .sort((a, b) => b.length - a.length);

        const paraLower = paragraphText.toLowerCase();
        for (const candidate of candidates) {
            const idx = paraLower.indexOf(candidate.toLowerCase());
            if (idx >= 0) {
                return paragraphText.slice(idx, idx + candidate.length);
            }
        }
        return null;
    }, []);

    const resolveLocateTarget = useCallback((request: NonNullable<ArticleDisplayProps["locateRequest"]>) => {
        if (paragraphEntries.length === 0) return null;

        const requestedOrder = Math.max(1, Number(request.paragraphNumber || 1));
        const requested = paragraphEntries.find((entry) => entry.order === requestedOrder);

        if (requested) {
            const snippet = pickBestSnippet(requested.text, request.evidence);
            if (snippet || !request.evidence) {
                return { paragraphOrder: requested.order, snippet };
            }
        }

        if (request.evidence) {
            let best: { paragraphOrder: number; snippet: string } | null = null;
            for (const entry of paragraphEntries) {
                const snippet = pickBestSnippet(entry.text, request.evidence);
                if (!snippet) continue;
                if (!best || snippet.length > best.snippet.length) {
                    best = {
                        paragraphOrder: entry.order,
                        snippet,
                    };
                }
            }
            if (best) return best;
        }

        const fallback = paragraphEntries[Math.min(requestedOrder - 1, paragraphEntries.length - 1)];
        return {
            paragraphOrder: fallback.order,
            snippet: pickBestSnippet(fallback.text, request.evidence),
        };
    }, [paragraphEntries, pickBestSnippet]);

    const resolveArticleSelectionContext = useCallback(() => {
        if (typeof window === "undefined") return null;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !contentRef.current) return null;
        const selectedText = selection.toString().replace(/\s+/g, " ").trim();
        if (selectedText.length < 2) return null;

        const range = selection.getRangeAt(0);
        const paragraphEls = Array.from(contentRef.current.querySelectorAll<HTMLElement>("[data-article-paragraph]"));
        const ranges: ReadSelectionParagraphRangeInput[] = [];

        const resolveParagraphTextRoot = (paragraphEl: HTMLElement) => (
            paragraphEl.querySelector<HTMLElement>("[data-paragraph-text='true']") ?? paragraphEl
        );

        const resolveOffsetWithin = (
            root: HTMLElement,
            container: Node,
            offset: number,
            fallback: number,
        ) => {
            if (!root.contains(container)) return fallback;
            const prefixRange = document.createRange();
            prefixRange.selectNodeContents(root);
            try {
                prefixRange.setEnd(container, offset);
                return prefixRange.cloneContents().textContent?.length ?? fallback;
            } catch {
                return fallback;
            }
        };

        for (const paragraphEl of paragraphEls) {
            const textRoot = resolveParagraphTextRoot(paragraphEl);
            if (!range.intersectsNode(textRoot)) continue;
            const paragraphOrder = Number(paragraphEl.dataset.articleParagraph);
            const paragraphBlockIndex = Number(paragraphEl.dataset.articleParagraphBlockIndex);
            const paragraphText = paragraphEl.dataset.articleParagraphText || paragraphEl.textContent || "";
            if (!Number.isFinite(paragraphOrder) || !Number.isFinite(paragraphBlockIndex) || !paragraphText.trim()) continue;

            const startOffset = textRoot.contains(range.startContainer)
                ? resolveOffsetWithin(textRoot, range.startContainer, range.startOffset, 0)
                : 0;
            const endOffset = textRoot.contains(range.endContainer)
                ? resolveOffsetWithin(textRoot, range.endContainer, range.endOffset, paragraphText.length)
                : paragraphText.length;

            ranges.push({
                paragraphOrder,
                paragraphBlockIndex,
                paragraphText,
                startOffset,
                endOffset,
            });
        }

        if (ranges.length === 0) return null;
        const attachment = buildAskContextAttachmentFromRanges(ranges);
        return attachment.text ? attachment : null;
    }, []);

    useEffect(() => {
        setHighlightedParagraphNumber(null);
        setHighlightedQuestionNumber(null);
        setHighlightedSnippet(null);
    }, [title, content, blocks]);

    useEffect(() => {
        if (!locateRequest) {
            setHighlightedParagraphNumber(null);
            setHighlightedQuestionNumber(null);
            setHighlightedSnippet(null);
            return;
        }
        const resolved = resolveLocateTarget(locateRequest);
        if (!resolved) return;

        const targetParagraph = resolved.paragraphOrder;
        const el = contentRef.current?.querySelector<HTMLElement>(`[data-article-paragraph="${targetParagraph}"]`);
        if (!el) return;

        setHighlightedParagraphNumber(targetParagraph);
        setHighlightedQuestionNumber(locateRequest.questionNumber ?? null);
        setHighlightedSnippet(resolved.snippet ?? null);
        const scrollContainer = el.closest<HTMLElement>('[data-reading-scroll-container="true"]');
        if (scrollContainer) {
            const computed = window.getComputedStyle(scrollContainer);
            const isScrollable =
                (computed.overflowY === "auto" || computed.overflowY === "scroll")
                && scrollContainer.scrollHeight > scrollContainer.clientHeight + 1;
            if (!isScrollable) {
                el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
                return;
            }
            const containerRect = scrollContainer.getBoundingClientRect();
            const elementRect = el.getBoundingClientRect();
            const nextTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - 24;
            scrollContainer.scrollTo({
                top: Math.max(0, nextTop),
                behavior: "smooth",
            });
            return;
        }
        el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }, [locateRequest, resolveLocateTarget]);

    const canOpenOriginalArticle = typeof articleUrl === "string"
        && /^https?:\/\//i.test(articleUrl);
    const articleSourceLabel = siteName || "Reading Flow";

    const openWordPopup = useCallback((nextPopup: PopupState) => {
        setPopup(nextPopup);
    }, []);

    const handleSplit = (index: number, textBefore: string, textAfter: string) => {
        const newBlocks = [...activeBlocks];
        // Create two new paragraph blocks with new IDs
        const block1: Block = {
            type: 'paragraph',
            content: textBefore,
            id: Math.random().toString(36).substr(2, 9)
        };
        const block2: Block = {
            type: 'paragraph',
            content: textAfter,
            id: Math.random().toString(36).substr(2, 9)
        };

        // Replace the original block with the two new ones
        newBlocks.splice(index, 1, block1, block2);
        setActiveBlocks(newBlocks);
    };

    const handleMerge = (sourceIndex: number, targetIndex: number) => {
        if (sourceIndex === targetIndex) return;

        const newBlocks = [...activeBlocks];
        const sourceBlock = newBlocks[sourceIndex];
        const targetBlock = newBlocks[targetIndex];

        // Only merge paragraphs
        if (sourceBlock.type !== 'paragraph' || targetBlock.type !== 'paragraph') return;

        // Append source content to target content
        // You might want to add a space if not present, but usually merging implies joining text
        const mergedContent = (targetBlock.content || '').trim() + ' ' + (sourceBlock.content || '').trim();

        // Update target block
        newBlocks[targetIndex] = { ...targetBlock, content: mergedContent };

        // Remove source block
        // Note: We need to be careful with indices if we remove one. 
        // If sourceIndex > targetIndex, removing source doesn't affect targetIndex.
        // If sourceIndex < targetIndex, targetIndex shifts down by 1.
        // But since we already grabbed the objects, we just need to remove the source position.
        newBlocks.splice(sourceIndex, 1);

        setActiveBlocks(newBlocks);
    };

    const handleUpdate = (index: number, newText: string) => {
        const newBlocks = [...activeBlocks];
        newBlocks[index] = { ...newBlocks[index], content: newText };
        setActiveBlocks(newBlocks);
    };

    const getEventElement = (target: EventTarget | null) => {
        if (target instanceof Element) return target;
        if (target instanceof Node) return target.parentElement;
        return null;
    };

    const isWithinInlinePhraseTarget = (target: EventTarget | null) => {
        const element = getEventElement(target);
        if (!element) return false;
        return Boolean(element.closest("[data-translation-inline-phrase='true']"));
    };

    const getInlinePhraseSentenceContext = (target: EventTarget | null) => {
        const element = getEventElement(target);
        if (!element) return "";
        return element.closest("[data-translation-inline-phrases='true']")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    };

    const handleArticleClick = useCallback(async (e: React.MouseEvent) => {
        let word = "";
        let context = "";
        const clickedInlinePhrase = isWithinInlinePhraseTarget(e.target);
        const inlinePhraseSentenceContext = clickedInlinePhrase ? getInlinePhraseSentenceContext(e.target) : "";
        const selection = window.getSelection();
        const normalizedSelection = selection && !selection.isCollapsed
            ? selection.toString().replace(/\s+/g, " ").trim()
            : "";
        const hasMultiWordSelection = normalizedSelection.length >= 2 && normalizedSelection.includes(" ");

        // Outside inline phrase mode, an intentional multi-word selection should still win.
        if (!clickedInlinePhrase && hasMultiWordSelection) {
            word = normalizedSelection;
            context = selection?.anchorNode?.textContent || normalizedSelection;
        }

        if (!word && document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(e.clientX, e.clientY);
            if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
                const textNode = range.startContainer;
                const text = textNode.textContent || "";
                const offset = range.startOffset;

                // Expand to find word boundaries
                let start = offset;
                let end = offset;
                while (start > 0 && /\w/.test(text[start - 1])) start--;
                while (end < text.length && /\w/.test(text[end])) end++;

                word = text.slice(start, end).trim();

                // Get context (sentence)
                if (inlinePhraseSentenceContext) {
                    context = inlinePhraseSentenceContext;
                } else {
                    const sentenceStart = text.lastIndexOf(".", start) + 1;
                    const sentenceEnd = text.indexOf(".", end);
                    context = text.slice(sentenceStart === -1 ? 0 : sentenceStart, sentenceEnd === -1 ? text.length : sentenceEnd + 1).trim();
                }

                // === Highlight Animation ===
                try {
                    const range = document.createRange();
                    range.setStart(textNode, start);
                    range.setEnd(textNode, end);

                    const span = document.createElement("span");
                    // Apply visual style
                    // Using inline-block to allow transform, but it might affect line height slightly
                    // Using background and color for safer "press" effect
                    span.className = "inline-block rounded-md bg-amber-200/50 text-amber-900 transition-all duration-150 ease-out origin-center scale-95 shadow-sm";

                    range.surroundContents(span);
                    setActiveSpan(span);

                    // Trigger "release" animation after short delay
                    setTimeout(() => {
                        if (span && span.isConnected) {
                            span.classList.remove("scale-95");
                            span.classList.add("scale-100");
                        }
                    }, 150);

                } catch (e) {
                    console.warn("Failed to highlight word:", e);
                }
            }
        }

        // 2. If no word found via click, check selection
        if (!word && selection && !selection.isCollapsed) {
            word = normalizedSelection;
            context = selection.anchorNode?.textContent || word;
        }

        if (!word || word.length < 2) {
            setPopup(null);
            return;
        }

        // Debounce repeated clicks on the same word to avoid duplicate popup/audio requests.
        const now = Date.now();
        const last = lastWordTriggerRef.current;
        if (last.word === word.toLowerCase() && now - last.at < 450) {
            return;
        }
        lastWordTriggerRef.current = { word: word.toLowerCase(), at: now };

        // 3. Show popup and fetch definition
        // Calculate position
        let x = e.clientX;
        let y = e.clientY + 20;

        // If a real multi-word selection won, use its rect for better positioning.
        if (selection && !selection.isCollapsed && word === normalizedSelection) {
            const rect = selection.getRangeAt(0).getBoundingClientRect();
            x = rect.left + rect.width / 2;
            y = rect.bottom + 10;
        }

        openWordPopup({
            word,
            context,
            x,
            y,
            articleUrl,
            sourceKind: "read",
            sourceLabel: "来自 Read",
            sourceSentence: context,
            sourceNote: title || "",
        });
    }, [articleUrl, openWordPopup, title]);

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.08, delayChildren: 0.05 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 35, scale: 0.99 },
        show: { 
            opacity: 1, 
            y: 0, 
            scale: 1,
            transition: { type: "spring" as const, stiffness: 180, damping: 24, mass: 1 } 
        }
    };

    if (isFlowActive) {
        return (
            <motion.article
                initial="hidden"
                animate="show"
                variants={containerVariants}
                className="relative mx-auto w-full pb-28"
            >
                {/* Story progress tracks at the top */}
                {timerConfigured && (
                    <div className="mb-6 flex w-full items-center gap-1.5 px-1">
                        {flowSegments.map((segment, idx) => {
                            const isCompleted = idx < activeFlowIndex;
                            const isActive = idx === activeFlowIndex;
                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleSegmentClick(idx)}
                                    className="h-2 flex-1 overflow-hidden rounded-full bg-theme-border/40 transition-all duration-300 relative group cursor-pointer border-none outline-none focus:outline-none hover:h-3"
                                    title={`第 ${idx + 1} 段`}
                                >
                                    <div
                                        className={cn(
                                            "h-full w-full bg-emerald-500 transition-all duration-500 ease-out origin-left",
                                            isCompleted ? "scale-x-100" : isActive ? "scale-x-100 animate-pulse bg-emerald-400" : "scale-x-0"
                                        )}
                                    />
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="mb-4 flex items-center justify-between px-1">
                    <span className="text-xs font-bold uppercase tracking-widest text-theme-text-muted">
                        心流专注模式 · {title}
                    </span>
                    <div className="flex items-center gap-3">
                        {/* Flow Timer */}
                        {timerConfigured && (
                            <div
                                onClick={toggleTimerMode}
                                className="flex items-center gap-1.5 rounded-full border border-theme-border bg-theme-card-bg px-3 py-1 text-xs font-black text-theme-text shadow-sm hover:bg-theme-active-bg/20 cursor-pointer select-none transition"
                                title={timerMode === "up" ? "正在进行正计时（点击切换为倒计时）" : "正在进行倒计时（点击切换为正计时）"}
                            >
                                {timerMode === "up" ? (
                                    <Clock className="h-3.5 w-3.5 text-indigo-500 animate-spin-slow" />
                                ) : (
                                    <Hourglass className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                                )}
                                <span className={cn(
                                    "font-mono tracking-wider transition-all duration-300",
                                    timerMode === "down" && (
                                        isOvertime 
                                            ? "text-rose-500 font-extrabold animate-pulse drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]" 
                                            : timeRemaining <= 10 && "text-rose-500 animate-pulse"
                                    )
                                )}>
                                    {timerMode === "up" 
                                        ? formatTime(timeElapsed) 
                                        : isOvertime 
                                            ? `+${formatTime(overtimeElapsed)}` 
                                            : formatTime(timeRemaining)}
                                </span>
                            </div>
                        )}

                        <button
                            onClick={toggleFlowMode}
                            className="flex items-center gap-1.5 rounded-full border border-theme-border bg-theme-card-bg px-2.5 py-1 text-xs font-bold text-theme-text shadow-sm hover:bg-theme-active-bg/20 active:translate-y-[1px]"
                        >
                            <Flame className="h-3.5 w-3.5 text-orange-500 animate-pulse" />
                            退出心流
                        </button>
                    </div>
                </div>

                <motion.div
                    animate={isShaking ? { x: [0, -10, 10, -10, 10, -5, 5, 0] } : { x: 0 }}
                    transition={{ duration: 0.3 }}
                    className={cn("relative mb-24 rounded-[2rem] p-6 border border-theme-border/50 shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-all duration-500 md:p-8 xl:p-8 min-h-[200px] flex flex-col justify-start overflow-hidden", paperStyleClass)}
                >
                    {/* Screen energy flash overlay on paragraph completion */}
                    <AnimatePresence>
                        {isFlashing && (
                            <motion.div
                                initial={{ opacity: 0.45 }}
                                animate={{ opacity: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.35, ease: "easeOut" }}
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    pointerEvents: "none",
                                    zIndex: 50,
                                    backgroundColor: "rgba(16, 185, 129, 0.25)",
                                }}
                            />
                        )}
                    </AnimatePresence>

                    {/* Overtime Toast Alert */}
                    <AnimatePresence>
                        {showOvertimeToast && (
                            <motion.div
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="absolute top-4 left-4 right-4 z-50 rounded-xl border-[2px] border-rose-300 bg-rose-50/95 p-3.5 shadow-md flex items-center justify-between text-left dark:border-rose-900/60 dark:bg-rose-950/90 backdrop-blur-md"
                            >
                                <div className="flex items-center gap-2.5">
                                    <Clock className="h-5 w-5 text-rose-500 animate-bounce" />
                                    <div>
                                        <div className="text-xs font-black text-rose-900 dark:text-rose-200">专注目标时间已到</div>
                                        <div className="text-[11px] text-rose-800/80 dark:text-rose-300/80">已为您自动转入超时记录，继续保持专注吧！</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        playFlowNavSound();
                                        setShowOvertimeToast(false);
                                    }}
                                    className="text-xs font-bold text-rose-800 hover:text-rose-900 dark:text-rose-300 dark:hover:text-rose-200 px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/50 dark:hover:bg-rose-900 border-none cursor-pointer"
                                >
                                    知道了
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence mode="wait">
                        {!timerConfigured ? (
                            <motion.div
                                key="timer-setup"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                className="py-4 md:py-6 flex flex-col items-center justify-center text-center max-w-lg mx-auto"
                            >
                                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border-[3px] border-theme-border shadow-sm">
                                    <Clock className="h-7 w-7" />
                                </div>
                                
                                <h2 className="font-newsreader text-2xl md:text-3xl font-black text-theme-text mb-2">
                                    选择计时模式
                                </h2>
                                <p className="text-xs text-theme-text-muted mb-8 max-w-sm">
                                    设定一个计时方式，帮助您在心流模式下更加专注地阅读。
                                </p>

                                {/* Mode Selection Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-6">
                                    <div
                                        onClick={() => {
                                            playFlowNavSound();
                                            setTimerMode('up');
                                            setTimerConfigured(true);
                                        }}
                                        className={cn(
                                            "group relative rounded-2xl border-[3px] p-5 text-left cursor-pointer transition-all duration-300 hover:-translate-y-0.5",
                                            timerMode === 'up'
                                                ? "bg-indigo-50/20 border-indigo-500 shadow-[2px_3px_0_var(--theme-shadow)]"
                                                : "bg-theme-card-bg border-theme-border hover:border-indigo-500 hover:shadow-[2px_5px_0_var(--theme-shadow)]"
                                        )}
                                        data-testid="timer-mode-up"
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border border-theme-border">
                                                <Clock className="h-4 w-4" />
                                            </span>
                                            <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200 px-2 py-0.5 rounded">
                                                正计时
                                            </span>
                                        </div>
                                        <h3 className="font-newsreader text-base font-bold text-theme-text mb-1">
                                            正计时模式
                                        </h3>
                                        <p className="text-[11px] text-theme-text-muted leading-relaxed">
                                            记录阅读时间，从 00:00 开始累加。适合自由无压力的沉浸式阅读。
                                        </p>
                                    </div>

                                    {/* Countdown Mode Option */}
                                    <div
                                        onClick={() => {
                                            playFlowNavSound();
                                            setTimerMode('down');
                                        }}
                                        className={cn(
                                            "group relative rounded-2xl border-[3px] p-5 text-left cursor-pointer transition-all duration-300",
                                            timerMode === 'down'
                                                ? "bg-indigo-50/20 border-indigo-500 shadow-[2px_3px_0_var(--theme-shadow)]"
                                                : "bg-theme-card-bg border-theme-border hover:border-indigo-500 hover:-translate-y-0.5 hover:shadow-[2px_5px_0_var(--theme-shadow)]"
                                        )}
                                        data-testid="timer-mode-down"
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="p-2 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-theme-border">
                                                <Hourglass className="h-4 w-4" />
                                            </span>
                                            <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 px-2 py-0.5 rounded">
                                                倒计时
                                            </span>
                                        </div>
                                        <h3 className="font-newsreader text-base font-bold text-theme-text mb-1">
                                            倒计时模式
                                        </h3>
                                        <p className="text-[11px] text-theme-text-muted leading-relaxed">
                                            设定阅读目标时长。时间截止时会有声音提醒，并自动转为超时正计时。
                                        </p>
                                    </div>
                                </div>

                                {/* Countdown duration settings if 'down' mode is chosen */}
                                <AnimatePresence>
                                    {timerMode === 'down' && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="w-full overflow-hidden text-left mb-6 border-t border-theme-border/50 pt-4"
                                        >
                                            <h4 className="text-[10px] font-black uppercase tracking-wider text-theme-text-muted mb-3">
                                                选择倒计时时长
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                                {(() => {
                                                    const uniqueOpts: Array<{ label: string; secs: number }> = [];
                                                    const seenSecs = new Set<number>();
                                                    [
                                                        { label: `${estimatedReadMinutes}分 (推荐)`, secs: estimatedReadMinutes * 60 },
                                                        { label: "1分", secs: 60 },
                                                        { label: "3分", secs: 180 },
                                                        { label: "5分", secs: 300 },
                                                        { label: "10分", secs: 600 },
                                                    ].forEach(opt => {
                                                        if (!seenSecs.has(opt.secs)) {
                                                            seenSecs.add(opt.secs);
                                                            uniqueOpts.push(opt);
                                                        }
                                                    });
                                                    return uniqueOpts.map((opt, idx) => (
                                                        <button
                                                            key={`${opt.secs}-${idx}`}
                                                            onClick={() => {
                                                                playFlowNavSound();
                                                                setCountdownDuration(opt.secs);
                                                                setTimeRemaining(opt.secs);
                                                            }}
                                                            className={cn(
                                                                "px-3 py-1.5 rounded-full border text-[11px] font-black transition cursor-pointer select-none",
                                                                countdownDuration === opt.secs
                                                                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                                                    : "border-theme-border bg-theme-card-bg text-theme-text hover:bg-theme-active-bg/20"
                                                            )}
                                                            data-testid={`duration-option-${opt.secs}`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ));
                                                })()}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Start Countdown Button */}
                                {timerMode === 'down' && (
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => {
                                            playFlowNavSound();
                                            setTimerConfigured(true);
                                        }}
                                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-[2.5px] border-theme-border bg-indigo-600 px-6 py-2.5 text-sm font-black text-white shadow-[2px_3px_0_var(--theme-shadow)] transition hover:bg-indigo-500 active:translate-y-[2px] active:shadow-none cursor-pointer"
                                        data-testid="start-countdown-btn"
                                    >
                                        <Check className="h-4 w-4" />
                                        开始倒计时阅读
                                    </motion.button>
                                )}
                            </motion.div>
                        ) : activeFlowIndex < flowSegments.length ? (
                            <motion.div
                                key={activeFlowIndex}
                                initial={{ opacity: 0, x: 80, scale: 0.96 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: -80, scale: 0.96 }}
                                transition={{ type: "spring", stiffness: 350, damping: 26 }}
                                className="flex-1 flex flex-col justify-start"
                            >
                                <div className={cn("space-y-5 text-theme-text leading-loose group/article", fontClass)}>
                                    {flowSegments[activeFlowIndex].precedingBlocks.map((block, idx) =>
                                        renderBlock(block, idx)
                                    )}
                                    {renderBlock(
                                        flowSegments[activeFlowIndex].paragraphBlock,
                                        flowSegments[activeFlowIndex].paragraphIndex,
                                        flowSegments[activeFlowIndex].paragraphOrder
                                    )}
                                </div>

                                <div className="mt-6 flex items-center justify-center gap-4">
                                    {activeFlowIndex > 0 && (
                                        <motion.button
                                            whileHover={{ scale: 1.03 }}
                                            whileTap={{ scale: 0.96 }}
                                            onClick={() => { playFlowNavSound(); setActiveFlowIndex(prev => prev - 1); }}
                                            className="inline-flex items-center gap-1.5 rounded-md border-[2px] border-theme-border bg-theme-card-bg px-4 py-2 text-sm font-black text-theme-text shadow-[2px_3px_0_var(--theme-shadow)] transition hover:bg-theme-active-bg/50 active:translate-y-[2px] active:shadow-none"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            上一段
                                        </motion.button>
                                    )}

                                    <div className="relative">
                                        {/* Particle explosion elements using Framer Motion */}
                                        {particles.map((p) => (
                                            <motion.span
                                                key={p.id}
                                                initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                                                animate={{ x: p.x, y: p.y, scale: 0, opacity: 0 }}
                                                transition={{ duration: 0.8, ease: "easeOut" }}
                                                style={{
                                                    position: "absolute",
                                                    left: "50%",
                                                    top: "50%",
                                                    backgroundColor: p.color,
                                                    width: "8px",
                                                    height: "8px",
                                                    borderRadius: "50%",
                                                    pointerEvents: "none",
                                                    zIndex: 100,
                                                }}
                                            />
                                        ))}
                                        
                                        <motion.button
                                            whileHover={{ scale: 1.03 }}
                                            whileTap={{ scale: 0.96 }}
                                            onClick={handleDoneClick}
                                            className="inline-flex items-center gap-2 rounded-md border-[2px] border-theme-border bg-emerald-500 px-6 py-2 text-sm font-black text-white shadow-[2px_3px_0_var(--theme-shadow)] transition hover:bg-emerald-400 active:translate-y-[2px] active:shadow-none"
                                        >
                                            {activeFlowIndex === flowSegments.length - 1 ? (
                                                <>
                                                    <Trophy className="h-4.5 w-4.5 animate-bounce" />
                                                    完成心流
                                                </>
                                            ) : (
                                                <>
                                                    <Check className="h-4.5 w-4.5" />
                                                    已读完本段
                                                </>
                                            )}
                                        </motion.button>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="completion-card"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.3 }}
                                className="flex flex-col items-center justify-center text-center py-8"
                            >
                                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-md dark:bg-emerald-900/40 dark:text-emerald-400 border-[3px] border-theme-border animate-bounce">
                                    <Trophy className="h-10 w-10" />
                                </div>
                                <h2 className="font-newsreader text-3xl font-black text-theme-text mb-2">
                                    恭喜完成本次心流阅读！
                                </h2>
                                <p className="text-theme-text-muted mb-8 max-w-md">
                                    你已经专注地读完了全篇 {flowSegments.length} 个段落，获得了专注能量与金币奖励。
                                </p>
                                
                                <div className="grid grid-cols-3 gap-4 mb-10 w-full max-w-lg">
                                    <div className="rounded-xl border-[2px] border-theme-border bg-theme-primary-bg/20 p-4 shadow-[2px_3px_0_var(--theme-shadow)]">
                                        <BookOpen className="h-5 w-5 text-indigo-500 mx-auto mb-2" />
                                        <div className="text-xs text-theme-text-muted">总段落</div>
                                        <div className="text-lg font-black text-theme-text">{flowSegments.length}</div>
                                    </div>
                                    <div className="rounded-xl border-[2px] border-theme-border bg-theme-primary-bg/20 p-4 shadow-[2px_3px_0_var(--theme-shadow)]">
                                        <Clock className="h-5 w-5 text-amber-500 mx-auto mb-2" />
                                        <div className="text-xs text-theme-text-muted">预估用时</div>
                                        <div className="text-lg font-black text-theme-text">{estimatedReadMinutes} min</div>
                                    </div>
                                    <div className="rounded-xl border-[2px] border-theme-border bg-theme-primary-bg/20 p-4 shadow-[2px_3px_0_var(--theme-shadow)]">
                                        <Flame className="h-5 w-5 text-emerald-500 mx-auto mb-2" />
                                        <div className="text-xs text-theme-text-muted">金币收益</div>
                                        <div className="text-lg font-black text-emerald-500">+{flowSegments.length + 4}</div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-center gap-4">
                                    <motion.button
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.96 }}
                                        onClick={() => {
                                            toggleFlowMode();
                                            setTimeout(() => {
                                                document.querySelector<HTMLElement>('[data-tour-target="read-quiz-toggle"]')?.click();
                                            }, 100);
                                        }}
                                        className="inline-flex items-center gap-2 rounded-md border-[2px] border-theme-border bg-indigo-500 px-6 py-3 text-sm font-black text-white shadow-[3px_4px_0_var(--theme-shadow)] transition hover:bg-indigo-400 active:translate-y-[2px] active:shadow-none"
                                    >
                                        <Check className="h-4 w-4" />
                                        开始答题
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.96 }}
                                        onClick={() => { playFlowNavSound(); setActiveFlowIndex(0); }}
                                        className="inline-flex items-center gap-2 rounded-md border-[2px] border-theme-border bg-theme-card-bg px-6 py-3 text-sm font-black text-theme-text shadow-[3px_4px_0_var(--theme-shadow)] transition hover:bg-theme-active-bg/50 active:translate-y-[2px] active:shadow-none"
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                        重新阅读
                                    </motion.button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                <AnimatePresence>
                    {popup && (
                        <WordPopup popup={popup} onClose={() => setPopup(null)} showAiDefinitionButton />
                    )}
                </AnimatePresence>
            </motion.article>
        );
    }

    return (
        <motion.article
            initial="hidden"
            animate="show"
            variants={containerVariants}
            className="relative mx-auto w-full pb-28"
        >
            <div className={cn("relative mb-24 rounded-[2rem] p-6 transition-all duration-500 md:p-10 xl:p-12", paperStyleClass)}>
                {/* Isolate overflow-hidden decoration to prevent clipping popups */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[calc(2rem-4px)]">
                    <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-theme-base-bg/95 to-transparent" />
                </div>
                {topActionNode ? (
                    <div className="absolute right-6 top-6 z-20 md:right-10 md:top-10 xl:right-12 xl:top-10">
                        {topActionNode}
                    </div>
                ) : null}
                <motion.header variants={itemVariants} className="relative mb-14 border-b-[3px] border-theme-border pb-10 pt-2 text-left">
                    <div className="flex flex-wrap items-center gap-3 md:pr-60 xl:pr-72">
                        <span className="inline-flex -rotate-2 rounded-md border-[2.5px] border-theme-border bg-[#a7f3d0] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#064e3b] shadow-[2px_3px_0_var(--theme-shadow)] dark:border-theme-border/50 dark:bg-emerald-600/40 dark:text-emerald-100">
                            {articleSourceLabel}
                        </span>
                        <span className="inline-flex rotate-1 rounded-md border-[2.5px] border-theme-border bg-[#fbcfe8] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#831843] shadow-[2px_3px_0_var(--theme-shadow)] dark:border-theme-border/50 dark:bg-pink-600/40 dark:text-pink-100">
                            {estimatedReadMinutes} min read
                        </span>
                        {canOpenOriginalArticle && (
                            <a
                                href={articleUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="group inline-flex rotate-[1deg] items-center gap-1.5 rounded-md border-[2.5px] border-theme-border bg-theme-card-bg px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-theme-text shadow-[2px_3px_0_var(--theme-shadow)] transition hover:bg-theme-active-bg/50 active:translate-y-[2px] active:shadow-none"
                            >
                                原文 <ExternalLink className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </a>
                        )}
                        <span className="inline-flex -rotate-1 items-center gap-2 rounded-md border-[2px] border-dashed border-theme-border/40 bg-theme-primary-bg/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-theme-text-muted">
                            Editorial Sheet
                        </span>
                    </div>

                    <div className="mt-8">
                        <h1 className="font-newsreader text-[2.4rem] font-semibold leading-[1.15] text-theme-text drop-shadow-sm md:text-[3rem] xl:text-[3.4rem]">
                            {title}
                        </h1>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <div className="group flex items-center gap-3 opacity-90 transition-opacity hover:opacity-100">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-theme-text text-theme-base-bg shadow-sm">
                                <span className="font-newsreader text-base font-bold italic">By</span>
                            </div>
                            <p className="font-newsreader text-xl italic text-theme-text-muted">
                                {byline || "Editorial Desk"}
                            </p>
                        </div>
                    </div>
                </motion.header>

                {/* TED Video Player */}
                {isTED && videoUrl && (
                    <div className="mb-12 overflow-hidden rounded-[1.5rem] border-4 border-theme-border shadow-[0_8px_0_var(--theme-shadow)]">
                        <TEDVideoPlayer
                            ref={videoPlayerRef}
                            videoUrl={videoUrl}
                        />
                    </div>
                )}

                <div ref={contentRef} className={cn("group/article space-y-5 text-theme-text leading-loose", fontClass)}>
                    {activeBlocks && activeBlocks.length > 0 ? (
                        (() => {
                            let paragraphOrder = 0;
                            return activeBlocks.map((block, index) => {
                            if (block.type === 'paragraph' && block.content) {
                                paragraphOrder += 1;
                                const currentParagraphOrder = paragraphOrder;
                                const isLocatedParagraph = highlightedParagraphNumber === currentParagraphOrder;
                                const useParagraphFallbackHighlight = isLocatedParagraph && !highlightedSnippet;
                                return (
                                    <motion.div
                                        variants={itemVariants}
                                        key={block.id || index}
                                        data-article-paragraph={currentParagraphOrder}
                                        data-article-paragraph-block-index={index}
                                        data-article-paragraph-text={block.content}
                                        className={cn(
                                            "relative scroll-mt-8 rounded-[1.2rem] px-1 py-1 transition-all duration-500 md:scroll-mt-12",
                                            useParagraphFallbackHighlight && "bg-theme-active-bg/30 ring-2 ring-theme-active-bg"
                                        )}
                                    >
                                        {isLocatedParagraph && highlightedQuestionNumber && highlightedQuestionNumber > 0 && (
                                            <div className="pointer-events-none absolute -right-2 -top-2 z-20 rounded-full border-[3px] border-theme-border bg-theme-active-bg px-2.5 py-1 text-[10px] font-black text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)]">
                                                第{highlightedQuestionNumber}题
                                            </div>
                                        )}
                                        <ParagraphCard
                                            text={block.content}
                                            index={index}
                                            paragraphOrder={currentParagraphOrder}
                                            articleTitle={title}
                                            articleUrl={articleUrl}
                                            ragAppliedWords={ragAppliedWords}
                                            readingNotes={notesByParagraph.get(currentParagraphOrder) ?? []}
                                            onCreateReadingNote={onCreateReadingNote}
                                            onDeleteReadingMarks={onDeleteReadingMarks}
                                            onSnapshotDirty={onArticleSnapshotDirty}
                                            onWordClick={handleArticleClick}
                                            onOpenWordPopupFromSelection={openWordPopup}
                                            askContextAttachment={activeAskAnchorParagraphOrder === currentParagraphOrder ? activeAskContextAttachment : null}
                                            hasActiveAskDock={activeAskAnchorParagraphOrder !== null}
                                            onOpenAskWithContext={(attachment) => {
                                                const resolvedAttachment = resolveArticleSelectionContext() ?? attachment;
                                                const targetParagraphOrder = activeAskAnchorParagraphOrder ?? currentParagraphOrder;
                                                setActiveAskContextAttachment(resolvedAttachment);
                                                setActiveAskAnchorParagraphOrder(targetParagraphOrder);
                                                return resolvedAttachment;
                                            }}
                                            onSplit={handleSplit}
                                            onMerge={handleMerge}
                                            onUpdate={handleUpdate}
                                            isEditMode={isEditMode}
                                            startTime={block.startTime}
                                            endTime={block.endTime}
                                            // Deep Focus Mode
                                            isFocusMode={isFocusMode}
                                            isFocusLocked={lockedFocusIndex === index}
                                            hasActiveFocusLock={lockedFocusIndex !== null}
                                            onSetFocusLock={() => setLockedFocusIndex(index)}
                                            onClearFocusLock={() => setLockedFocusIndex(null)}
                                            highlightSnippet={isLocatedParagraph ? (highlightedSnippet || undefined) : undefined}
                                        />
                                    </motion.div>
                                );
                            } else if (block.type === 'header') {
                                const HeaderTag = (block.tag || 'h2') as React.ElementType;
                                return <motion.div variants={itemVariants} key={index}><HeaderTag className="mt-10 mb-4 font-newsreader text-3xl font-medium text-theme-text">{block.content}</HeaderTag></motion.div>;
                            } else if (block.type === 'list' && block.items) {
                                const ListTag = (block.tag || 'ul') as React.ElementType;
                                return (
                                    <motion.div variants={itemVariants} key={index}>
                                        <ListTag className="list-disc list-inside space-y-2 pl-4 text-theme-text">
                                            {block.items.map((item, i) => <li key={i}>{item}</li>)}
                                        </ListTag>
                                    </motion.div>
                                );
                            } else if (block.type === 'image' && block.src) {
                                return (
                                    <motion.div variants={itemVariants} key={index} className="my-8 overflow-hidden rounded-[1.6rem] border-4 border-theme-border shadow-[0_8px_0_var(--theme-shadow)]">
                                        <img src={block.src} alt={block.alt || ''} className="w-full h-auto object-cover" />
                                    </motion.div>
                                );
                            } else if (block.type === 'blockquote' && block.content) {
                                return (
                                    <motion.div variants={itemVariants} key={index}>
                                        <blockquote className="my-8 rounded-[1.4rem] border-4 border-theme-border bg-theme-primary-bg/20 px-5 py-4 text-theme-text italic shadow-[0_6px_0_var(--theme-shadow)]">
                                            {block.content}
                                        </blockquote>
                                    </motion.div>
                                );
                            }
                            return null;
                        });
                        })()
                    ) : (
                        <div
                            onClick={handleArticleClick}
                            className={cn(
                                "prose prose-lg prose-stone max-w-none cursor-text",
                                "prose-p:text-lg prose-p:leading-loose prose-p:text-stone-700 prose-p:mb-8",
                                "prose-headings:font-newsreader prose-headings:font-medium prose-headings:text-stone-800",
                                "prose-a:text-amber-600 prose-a:no-underline hover:prose-a:underline",
                                "prose-blockquote:border-l-amber-400 prose-blockquote:bg-amber-50/50 prose-blockquote:p-6 prose-blockquote:rounded-r-lg prose-blockquote:italic prose-blockquote:font-newsreader",
                                "prose-img:rounded-xl prose-img:shadow-xl",
                                fontClass // Apply dynamic font
                            )}
                        />
                    )}
                </div>
            </div>

            <AnimatePresence>
                {popup && (
                    <WordPopup popup={popup} onClose={() => setPopup(null)} showAiDefinitionButton />
                )}
            </AnimatePresence>
        </motion.article >
    );
}
