"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import DOMPurify from "dompurify";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, BookOpen, Volume2, Sparkles, Book, Globe } from "lucide-react";
import { ParagraphCard } from "./ParagraphCard";
import TEDVideoPlayer, { TEDVideoPlayerRef } from "./TEDVideoPlayer";
import { useReadingSettings } from "@/contexts/ReadingSettingsContext";
import { cn } from "@/lib/utils";

interface Block {
    type: 'paragraph' | 'header' | 'list' | 'image' | 'blockquote';
    id: string; // Ensure ID is present
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
}

interface PopupState {
    word: string;
    context: string;
    x: number;
    y: number;
}

interface DefinitionData {
    context_meaning?: {
        definition: string;
        translation: string;
    };
    dictionary_meaning?: {
        definition: string;
        translation: string;
    };
    example?: string;
    phonetic?: string;
}

export function ArticleDisplay({ title, content, byline, blocks, siteName, videoUrl, articleUrl, isEditMode }: ArticleDisplayProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    const videoPlayerRef = useRef<TEDVideoPlayerRef>(null);
    // Generate IDs if missing (migration)
    const [activeBlocks, setActiveBlocks] = useState<Block[]>(() => {
        const initial = blocks || [];
        return initial.map(b => ({
            ...b,
            id: (b as any).id || Math.random().toString(36).substr(2, 9)
        }));
    });
    const [popup, setPopup] = useState<PopupState | null>(null);
    const [definition, setDefinition] = useState<DefinitionData | null>(null);
    const [isLoadingDict, setIsLoadingDict] = useState(false);
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [activeSpan, setActiveSpan] = useState<HTMLElement | null>(null);

    const popupRef = useRef<HTMLDivElement>(null);
    const { fontClass, fontSizeClass, isFocusMode } = useReadingSettings();
    const [lockedFocusIndex, setLockedFocusIndex] = useState<number | null>(null);

    // Reset lock when focus mode is toggled off
    useEffect(() => {
        if (!isFocusMode) setLockedFocusIndex(null);
    }, [isFocusMode]);

    const isTED = siteName === 'TED' || siteName === 'YouTube';


    // Handle click outside to close popup
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                setPopup(null);
            }
        };

        if (popup) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            // Cleanup active span when popup closes
            if (activeSpan) {
                try {
                    // Revert the span: replace span with its children
                    const parent = activeSpan.parentNode;
                    if (parent) {
                        while (activeSpan.firstChild) {
                            parent.insertBefore(activeSpan.firstChild, activeSpan);
                        }
                        parent.removeChild(activeSpan);
                        parent.normalize(); // Merge text nodes
                    }
                } catch (e) {
                    console.warn("Failed to unwrap active span:", e);
                }
                setActiveSpan(null);
            }
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
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
                id: (b as any).id || Math.random().toString(36).substr(2, 9)
            })));
        }
    }, [blocks]);

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
        // 1. Try to get the word under the cursor
        let word = "";
        let context = "";

        if (document.caretRangeFromPoint) {
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
        const selection = window.getSelection();
        if (!word && selection && !selection.isCollapsed) {
            word = selection.toString().trim();
            context = selection.anchorNode?.textContent || word;
        }

        if (!word || word.length < 2) {
            setPopup(null);
            return;
        }

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

        setPopup({ word, context, x, y });
        setDefinition(null);
        setIsLoadingDict(true);
        setIsLoadingAI(false);

        // Fetch Dictionary Definition Immediately
        try {
            const response = await fetch("/api/dictionary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ word }),
            });
            const data = await response.json();
            if (data.definition) {
                setDefinition(prev => ({
                    ...prev,
                    dictionary_meaning: {
                        definition: data.definition,
                        translation: data.translation
                    }
                }));
            }
        } catch (error) {
            console.error("Dictionary error:", error);
        } finally {
            setIsLoadingDict(false);
        }
    };

    const handleAnalyzeContext = async () => {
        if (!popup) return;
        setIsLoadingAI(true);
        try {
            const response = await fetch("/api/ai/define", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ word: popup.word, context: popup.context }),
            });
            const data = await response.json();
            setDefinition(prev => ({
                ...prev,
                context_meaning: data.context_meaning,
                example: data.example,
                phonetic: data.phonetic
            }));
        } catch (error) {
            console.error("AI error:", error);
        } finally {
            setIsLoadingAI(false);
        }
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
                    {byline && (
                        <p className="text-xs font-bold tracking-[0.2em] uppercase text-stone-400">
                            By {byline}
                        </p>
                    )}
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
                        activeBlocks.map((block, index) => {
                            if (block.type === 'paragraph' && block.content) {
                                return (
                                    <ParagraphCard
                                        key={block.id || index}
                                        text={block.content}
                                        index={index}
                                        articleTitle={title}
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
                                    />
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
                        })
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
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 5 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        ref={popupRef}
                        style={{
                            position: 'fixed',
                            left: Math.min(Math.max(20, popup.x), window.innerWidth - 340), // Prevent overflow
                            top: popup.y,
                            transform: 'translateX(-50%)' // Note: This might conflict with left clamping logic if not careful.
                        }}
                        className="z-50 w-[320px] rounded-2xl backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/40 overflow-hidden bg-white/80 ring-1 ring-black/5"
                    >
                        {/* Header: Word & Audio */}
                        <div className="bg-gradient-to-br from-amber-50/80 to-white/50 p-4 border-b border-white/50 relative">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-2xl font-serif font-bold text-stone-800 tracking-tight flex items-center gap-2">
                                        {popup.word}
                                    </h3>
                                    {definition?.phonetic && (
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-sm font-mono text-stone-500 bg-stone-100/50 px-1.5 py-0.5 rounded">
                                                {definition.phonetic}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${popup.word}&type=2`);
                                            audio.play().catch(err => console.error("Audio Error:", err));
                                        }}
                                        className="p-2 rounded-full bg-amber-100/80 hover:bg-amber-200 text-amber-700 transition-colors shadow-sm"
                                        title="Play Pronunciation"
                                    >
                                        <Volume2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setPopup(null)}
                                        className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100/50 rounded-full transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="p-0">
                            {/* Dictionary Definition */}
                            <div className="p-4 space-y-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">
                                    <Book className="w-3 h-3" />
                                    <span>Dictionary</span>
                                </div>

                                {isLoadingDict ? (
                                    <div className="flex items-center gap-2 text-stone-400 py-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="text-sm">Searching...</span>
                                    </div>
                                ) : definition?.dictionary_meaning ? (
                                    <div className="space-y-1">
                                        <p className="text-stone-700 font-medium leading-snug">
                                            {definition.dictionary_meaning.definition}
                                        </p>
                                        {definition.dictionary_meaning.translation && (
                                            <p className="text-stone-500 text-sm">
                                                {definition.dictionary_meaning.translation}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-stone-400 italic">No definition found.</p>
                                )}
                            </div>

                            {/* AI Context Section */}
                            <div className="bg-stone-50/50 p-4 border-t border-stone-100/50">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 text-xs font-bold text-amber-600/70 uppercase tracking-wider">
                                        <Sparkles className="w-3 h-3" />
                                        <span>In Context</span>
                                    </div>

                                    {!definition?.context_meaning && !isLoadingAI && (
                                        <button
                                            onClick={handleAnalyzeContext}
                                            className="text-xs bg-white hover:bg-amber-50 text-amber-600 border border-amber-200 hover:border-amber-300 px-3 py-1.5 rounded-full shadow-sm transition-all font-medium flex items-center gap-1"
                                        >
                                            <Sparkles className="w-3 h-3" />
                                            Deep Analyze
                                        </button>
                                    )}
                                </div>

                                {isLoadingAI ? (
                                    <div className="flex items-center justify-center gap-2 text-amber-600/70 py-4 bg-amber-50/30 rounded-lg border border-amber-100/50">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="text-sm font-medium">AI is analyzing context...</span>
                                    </div>
                                ) : definition?.context_meaning ? (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="bg-white/60 p-3 rounded-xl border border-white/60 shadow-sm">
                                            <p className="text-sm text-stone-800 leading-relaxed font-medium">
                                                {definition.context_meaning.definition}
                                            </p>
                                            <p className="text-sm text-rose-600 mt-1">
                                                {definition.context_meaning.translation}
                                            </p>
                                        </div>

                                        {definition.example && (
                                            <div className="flex gap-2 items-start text-xs text-stone-500 italic pl-2 border-l-2 border-amber-200">
                                                <span className="shrink-0 mt-0.5">Eg.</span>
                                                <span>"{definition.example}"</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-xs text-stone-400 text-center py-1">
                                        Tap "Deep Analyze" to see meaning in this sentence.
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.article >
    );
}
