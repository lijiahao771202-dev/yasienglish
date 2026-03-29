"use client";

import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { ParagraphCard } from "./ParagraphCard";
import { WordPopup, type PopupState } from "./WordPopup";
import TEDVideoPlayer, { TEDVideoPlayerRef } from "./TEDVideoPlayer";
import { useReadingSettings } from "@/contexts/ReadingSettingsContext";
import { cn } from "@/lib/utils";

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
    isEditMode?: boolean; // New prop for edit mode
    locateRequest?: {
        requestId: number;
        questionNumber: number;
        paragraphNumber: number;
        evidence?: string;
    } | null;
}

export function ArticleDisplay({ title, content, byline, blocks, siteName, videoUrl, articleUrl, isEditMode, locateRequest }: ArticleDisplayProps) {
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

    const getParagraphTextByOrder = (order: number): string | null => {
        let paragraphCount = 0;
        for (const block of activeBlocks) {
            if (block.type === "paragraph" && block.content) {
                paragraphCount += 1;
                if (paragraphCount === order) return block.content;
            }
        }
        return null;
    };

    const pickBestSnippet = (paragraphText: string, evidence?: string): string | null => {
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
    };

    useEffect(() => {
        if (!locateRequest) return;
        const targetParagraph = locateRequest.paragraphNumber;
        const el = document.querySelector<HTMLElement>(`[data-article-paragraph="${targetParagraph}"]`);
        if (!el) return;

        const paragraphText = getParagraphTextByOrder(targetParagraph);
        const snippet = paragraphText ? pickBestSnippet(paragraphText, locateRequest.evidence) : null;

        setHighlightedParagraphNumber(targetParagraph);
        setHighlightedQuestionNumber(locateRequest.questionNumber);
        setHighlightedSnippet(snippet);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [locateRequest, activeBlocks]);

    const canOpenOriginalArticle = typeof articleUrl === "string"
        && /^https?:\/\//i.test(articleUrl);

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

    const handleArticleClick = async (e: React.MouseEvent) => {
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

        setPopup({
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
    };

    return (
        <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto pb-32 relative"
        >
            <div className="glass-panel rounded-2xl p-8 md:p-16 mb-24 transition-all duration-500">
                <header className="space-y-6 text-center mb-16 border-b border-stone-100 pb-12">
                    <h1 className="text-4xl md:text-6xl font-medium font-newsreader italic text-stone-900 leading-tight">
                        {title}
                    </h1>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        {byline && (
                            <p className="text-xs font-bold tracking-[0.2em] uppercase text-stone-400">
                                By {byline}
                            </p>
                        )}
                        {canOpenOriginalArticle && (
                            <a
                                href={articleUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-stone-500 transition-colors hover:border-amber-300 hover:text-amber-700"
                            >
                                Open original
                                <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        )}
                    </div>
                </header>

                {/* TED Video Player */}
                {isTED && videoUrl && (
                    <div className="mb-12 rounded-xl overflow-hidden shadow-lg">
                        <TEDVideoPlayer
                            ref={videoPlayerRef}
                            videoUrl={videoUrl}
                        />
                    </div>
                )}

                <div className={cn("space-y-4 text-stone-800 leading-loose group/article", fontClass)}>
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
                                            "relative rounded-xl transition-all duration-500",
                                            useParagraphFallbackHighlight && "bg-amber-100/45 ring-2 ring-amber-300/70"
                                        )}
                                    >
                                        {isLocatedParagraph && highlightedQuestionNumber && (
                                            <div className="pointer-events-none absolute -right-2 -top-2 z-20 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 shadow-sm">
                                                第{highlightedQuestionNumber}题
                                            </div>
                                        )}
                                        <ParagraphCard
                                            text={block.content}
                                            index={index}
                                            articleTitle={title}
                                            articleUrl={articleUrl}
                                            onWordClick={handleArticleClick}
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
                                return <HeaderTag key={index} className="text-amber-700 font-bold mt-8 mb-4 text-2xl">{block.content}</HeaderTag>;
                            } else if (block.type === 'list' && block.items) {
                                const ListTag = (block.tag || 'ul') as React.ElementType;
                                return (
                                    <ListTag key={index} className="list-disc list-inside space-y-2 text-stone-700 pl-4">
                                        {block.items.map((item, i) => <li key={i}>{item}</li>)}
                                    </ListTag>
                                );
                            } else if (block.type === 'image' && block.src) {
                                return (
                                    <div key={index} className="my-6 rounded-xl overflow-hidden shadow-xl border border-stone-200/50">
                                        <img src={block.src} alt={block.alt || ''} className="w-full h-auto" />
                                    </div>
                                );
                            } else if (block.type === 'blockquote' && block.content) {
                                return (
                                    <blockquote key={index} className="border-l-4 border-amber-400 pl-4 py-2 my-6 bg-amber-50/50 rounded-r-lg text-stone-600 italic">
                                        {block.content}
                                    </blockquote>
                                );
                            }
                            return null;
                        });
                        })()
                    ) : (
                        <div
                            ref={contentRef}
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
