import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Book, Volume2, Sparkles, Check, BookPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { db } from "@/lib/db";
import { createEmptyCard } from "@/lib/fsrs";

export interface PopupState {
    word: string;
    context: string;
    x: number;
    y: number;
}

export interface DefinitionData {
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

interface WordPopupProps {
    popup: PopupState;
    onClose: () => void;
}

export function WordPopup({ popup, onClose }: WordPopupProps) {
    const [definition, setDefinition] = useState<DefinitionData | null>(null);
    const [isLoadingDict, setIsLoadingDict] = useState(false);
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);

    // Initial Load & Dictionary Search
    useEffect(() => {
        let isMounted = true;
        setDefinition(null);
        setIsLoadingDict(true);
        setIsLoadingAI(false);
        setIsSaved(false);

        // Check DB
        db.vocabulary.get(popup.word).then(item => {
            if (isMounted && item) setIsSaved(true);
        });

        // Fetch Dictionary Definition
        fetch("/api/dictionary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ word: popup.word }),
        })
            .then(res => res.json())
            .then(data => {
                if (isMounted && data.definition) {
                    setDefinition(prev => ({
                        ...prev,
                        dictionary_meaning: {
                            definition: data.definition,
                            translation: data.translation
                        },
                        phonetic: data.phonetic // Often dictionary API returns phonetic too
                    }));
                }
            })
            .catch(err => console.error("Dictionary error:", err))
            .finally(() => {
                if (isMounted) setIsLoadingDict(false);
            });

        return () => { isMounted = false; };
    }, [popup.word]); // Re-run if word changes

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    const handleAnalyzeContext = async () => {
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

    const handleAddToVocab = async () => {
        if (!definition) return;
        try {
            const card = createEmptyCard(popup.word);
            card.definition = definition.dictionary_meaning?.definition || "";
            card.translation = definition.dictionary_meaning?.translation || "";
            card.context = popup.context;
            card.example = definition.example || "";

            await db.vocabulary.put(card as any);
            setIsSaved(true);
        } catch (err) {
            console.error("Failed to save vocab:", err);
        }
    };

    return (
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
                transform: 'translateX(-50%)'
            }}
            className="z-[1000] w-[320px] rounded-2xl backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/40 overflow-hidden bg-white/80 ring-1 ring-black/5 text-left"
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
                            onClick={handleAddToVocab}
                            disabled={isSaved}
                            className={cn(
                                "p-2 rounded-full transition-colors shadow-sm",
                                isSaved
                                    ? "bg-green-100 text-green-600"
                                    : "bg-white/80 hover:bg-amber-100 text-stone-500 hover:text-amber-600"
                            )}
                            title={isSaved ? "Saved to Vocabulary" : "Add to Vocabulary"}
                        >
                            {isSaved ? <Check className="w-4 h-4" /> : <BookPlus className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={onClose}
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
    );
}
