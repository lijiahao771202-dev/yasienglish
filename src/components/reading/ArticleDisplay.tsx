"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { ParagraphCard } from "./ParagraphCard";
import { WordPopup, type PopupState } from "./WordPopup";
import TEDVideoPlayer, { TEDVideoPlayerRef } from "./TEDVideoPlayer";
import { useReadingSettings } from "@/contexts/ReadingSettingsContext";
import { cn } from "@/lib/utils";
import type { ReadingMarkType, ReadingNoteItem } from "@/lib/db";

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
}

export function ArticleDisplay({
    title,
    content,
    byline,
    blocks,
    siteName,
    videoUrl,
    articleUrl,
    isEditMode,
    locateRequest,
    readingNotes = [],
    onCreateReadingNote,
    onDeleteReadingMarks,
    onArticleSnapshotDirty,
    topActionNode,
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
    const lastWordTriggerRef = useRef<{ word: string; at: number }>({ word: "", at: 0 });

    const { fontClass, isFocusMode } = useReadingSettings();
    const [lockedFocusIndex, setLockedFocusIndex] = useState<number | null>(null);

    // Reset lock when focus mode is toggled off
    useEffect(() => {
        if (!isFocusMode) setLockedFocusIndex(null);
    }, [isFocusMode]);

    const isTED = siteName === 'TED' || siteName === 'YouTube';

    useEffect(() => {
        if (popup || !activeSpan) return;

        try {
            const parent = activeSpan.parentNode;
            if (parent) {
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
    const estimatedReadMinutes = Math.max(
        3,
        Math.round(((content || "").split(/\s+/).filter(Boolean).length || 600) / 220),
    );

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

    const handleArticleClick = useCallback(async (e: React.MouseEvent) => {
        let word = "";
        let context = "";
        const selection = window.getSelection();
        const normalizedSelection = selection && !selection.isCollapsed
            ? selection.toString().replace(/\s+/g, " ").trim()
            : "";

        // Multi-word selection takes precedence over caret lookup.
        if (normalizedSelection.length >= 2 && normalizedSelection.includes(" ")) {
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
                const sentenceStart = text.lastIndexOf(".", start) + 1;
                const sentenceEnd = text.indexOf(".", end);
                context = text.slice(sentenceStart === -1 ? 0 : sentenceStart, sentenceEnd === -1 ? text.length : sentenceEnd + 1).trim();

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

        // If selection exists, use its rect for better positioning
        if (selection && !selection.isCollapsed) {
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

    return (
        <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mx-auto w-full pb-28"
        >
            <div className="relative mb-24 overflow-hidden rounded-[2rem] border-[3px] border-[#17120d] bg-[#fffdf8] p-6 shadow-[0_10px_0_rgba(23,18,13,0.14)] transition-all duration-500 md:p-10 xl:p-12">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(255,249,235,0.95),rgba(255,249,235,0))]" />
                {topActionNode ? (
                    <div className="absolute right-6 top-6 z-20 md:right-10 md:top-10 xl:right-12 xl:top-10">
                        {topActionNode}
                    </div>
                ) : null}
                <header className="relative mb-12 border-b-2 border-[#e9decb] pb-8 pt-1 text-left md:pr-60 xl:pr-72">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border-[3px] border-[#17120d] bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#5f5448] shadow-[0_4px_0_rgba(23,18,13,0.08)]">
                            {articleSourceLabel}
                        </span>
                        <span className="inline-flex rounded-full border-[3px] border-[#17120d] bg-[#dbeafe] px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#1d4ed8] shadow-[0_4px_0_rgba(23,18,13,0.08)]">
                            {estimatedReadMinutes} min read
                        </span>
                        {canOpenOriginalArticle && (
                            <a
                                href={articleUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full border-[3px] border-[#17120d] bg-[#fff7d8] px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#5f5448] shadow-[0_4px_0_rgba(23,18,13,0.08)] transition hover:-translate-y-0.5"
                            >
                                原文
                                <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        )}
                    </div>

                    <div className="mt-7">
                        <h1 className="max-w-[15ch] font-newsreader text-[2.8rem] font-medium leading-[0.95] tracking-tight text-[#17120d] md:text-[3.6rem] xl:text-[4.1rem]">
                            {title}
                        </h1>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[#7d6e61]">
                        {byline ? (
                            <p className="font-newsreader text-xl italic text-[#4b3f34]">
                                By {byline}
                            </p>
                        ) : null}
                        <span className="inline-flex items-center gap-2 rounded-full border border-[#ddd1bd] bg-[#fcf6ea] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a7c6b]">
                            Editorial Reading Sheet
                        </span>
                    </div>
                </header>

                {/* TED Video Player */}
                {isTED && videoUrl && (
                    <div className="mb-12 overflow-hidden rounded-[1.5rem] border-[3px] border-[#17120d] shadow-[0_8px_0_rgba(23,18,13,0.12)]">
                        <TEDVideoPlayer
                            ref={videoPlayerRef}
                            videoUrl={videoUrl}
                        />
                    </div>
                )}

                <div ref={contentRef} className={cn("group/article space-y-5 text-[#2f251d] leading-loose", fontClass)}>
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
                                    <div
                                        key={block.id || index}
                                        data-article-paragraph={currentParagraphOrder}
                                        className={cn(
                                            "relative scroll-mt-8 rounded-[1.2rem] px-1 py-1 transition-all duration-500 md:scroll-mt-12",
                                            useParagraphFallbackHighlight && "bg-[#fff0b8]/70 ring-2 ring-[#f59e0b]/35"
                                        )}
                                    >
                                        {isLocatedParagraph && highlightedQuestionNumber && highlightedQuestionNumber > 0 && (
                                            <div className="pointer-events-none absolute -right-2 -top-2 z-20 rounded-full border-[3px] border-[#17120d] bg-[#ffe08a] px-2.5 py-1 text-[10px] font-black text-[#17120d] shadow-[0_4px_0_rgba(23,18,13,0.12)]">
                                                第{highlightedQuestionNumber}题
                                            </div>
                                        )}
                                        <ParagraphCard
                                            text={block.content}
                                            index={index}
                                            paragraphOrder={currentParagraphOrder}
                                            articleTitle={title}
                                            articleUrl={articleUrl}
                                            readingNotes={notesByParagraph.get(currentParagraphOrder) ?? []}
                                            onCreateReadingNote={onCreateReadingNote}
                                            onDeleteReadingMarks={onDeleteReadingMarks}
                                            onSnapshotDirty={onArticleSnapshotDirty}
                                            onWordClick={handleArticleClick}
                                            onOpenWordPopupFromSelection={openWordPopup}
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
                                            onToggleFocusLock={() => setLockedFocusIndex(prev => prev === index ? null : index)}
                                            highlightSnippet={isLocatedParagraph ? (highlightedSnippet || undefined) : undefined}
                                        />
                                    </div>
                                );
                            } else if (block.type === 'header') {
                                const HeaderTag = (block.tag || 'h2') as React.ElementType;
                                return <HeaderTag key={index} className="mt-10 mb-4 font-newsreader text-3xl font-medium text-[#17120d]">{block.content}</HeaderTag>;
                            } else if (block.type === 'list' && block.items) {
                                const ListTag = (block.tag || 'ul') as React.ElementType;
                                return (
                                    <ListTag key={index} className="list-disc list-inside space-y-2 pl-4 text-[#4f4336]">
                                        {block.items.map((item, i) => <li key={i}>{item}</li>)}
                                    </ListTag>
                                );
                            } else if (block.type === 'image' && block.src) {
                                return (
                                    <div key={index} className="my-8 overflow-hidden rounded-[1.6rem] border-[3px] border-[#17120d] shadow-[0_8px_0_rgba(23,18,13,0.12)]">
                                        <img src={block.src} alt={block.alt || ''} className="w-full h-auto" />
                                    </div>
                                );
                            } else if (block.type === 'blockquote' && block.content) {
                                return (
                                    <blockquote key={index} className="my-8 rounded-[1.4rem] border-[3px] border-[#17120d] bg-[#fff4d7] px-5 py-4 text-[#5b4c3e] italic shadow-[0_6px_0_rgba(23,18,13,0.08)]">
                                        {block.content}
                                    </blockquote>
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
                    <WordPopup popup={popup} onClose={() => setPopup(null)} />
                )}
            </AnimatePresence>
        </motion.article >
    );
}
