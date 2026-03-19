import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Loader2, Book, Volume2, Sparkles, Check, BookPlus } from "lucide-react";
import { db, VocabItem } from "@/lib/db";
import { createEmptyCard } from "@/lib/fsrs";
import { saveVocabulary } from "@/lib/user-repository";
import { cn } from "@/lib/utils";

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

const pronunciationAudioCache = new Map<string, HTMLAudioElement>();
let lastPronounce: { word: string; at: number } = { word: "", at: 0 };
const dictionaryMemoryCache = new Map<string, DefinitionData>();
const dictionaryInFlight = new Map<string, Promise<DefinitionData | null>>();

function playPronunciation(word: string, force = false) {
    const normalized = word.trim().toLowerCase();
    if (!normalized) return;
    const now = Date.now();
    if (!force && lastPronounce.word === normalized && now - lastPronounce.at < 500) {
        return;
    }
    lastPronounce = { word: normalized, at: now };

    let audio = pronunciationAudioCache.get(normalized);
    if (!audio) {
        audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(normalized)}&type=2`);
        audio.preload = "auto";
        pronunciationAudioCache.set(normalized, audio);
    }

    try {
        audio.currentTime = 0;
    } catch {
        // ignore if media not ready
    }
    audio.play().catch(() => { });
}

export function WordPopup({ popup, onClose }: WordPopupProps) {
    const [definition, setDefinition] = useState<DefinitionData | null>(null);
    const [isLoadingDict, setIsLoadingDict] = useState(false);
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    // Initial Load & Dictionary Search
    useEffect(() => {
        let isMounted = true;
        setDefinition(null);
        setIsLoadingDict(true);
        setIsLoadingAI(false);
        setIsSaving(false);
        setIsSaved(false);
        setSaveError(null);

        db.vocabulary.get(popup.word).then(item => {
            if (isMounted && item) setIsSaved(true);
        });

        // Auto-play pronunciation with cache + cooldown to prevent repeated network/audio startup.
        playPronunciation(popup.word);

        const normalized = popup.word.trim().toLowerCase();
        const cachedDict = dictionaryMemoryCache.get(normalized);
        if (cachedDict) {
            setDefinition(prev => ({ ...prev, ...cachedDict }));
            setIsLoadingDict(false);
            return () => { isMounted = false; };
        }

        const loadDictionary = async () => {
            const existing = dictionaryInFlight.get(normalized);
            if (existing) return existing;

            const promise = (async () => {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3200);
                try {
                    const res = await fetch("/api/dictionary", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ word: normalized }),
                        signal: controller.signal,
                    });
                    const data = await res.json();
                    if (!res.ok || !data?.definition) return null;

                    const result: DefinitionData = {
                        dictionary_meaning: {
                            definition: data.definition,
                            translation: data.translation
                        },
                        phonetic: data.phonetic,
                    };
                    dictionaryMemoryCache.set(normalized, result);
                    if (dictionaryMemoryCache.size > 2000) {
                        const firstKey = dictionaryMemoryCache.keys().next().value;
                        if (firstKey) dictionaryMemoryCache.delete(firstKey);
                    }
                    return result;
                } catch (error) {
                    console.error("Dictionary error:", error);
                    return null;
                } finally {
                    clearTimeout(timeout);
                    dictionaryInFlight.delete(normalized);
                }
            })();

            dictionaryInFlight.set(normalized, promise);
            return promise;
        };

        loadDictionary()
            .then((result) => {
                if (!isMounted || !result) return;
                setDefinition(prev => ({ ...prev, ...result }));
            })
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
        if (isSaved || isSaving) return;

        setIsSaving(true);
        setSaveError(null);

        let aiDefinition = definition?.context_meaning;
        let aiExample = definition?.example || "";
        let aiPhonetic = definition?.phonetic;

        try {
            if (!aiDefinition) {
                const response = await fetch("/api/ai/define", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        word: popup.word,
                        context: popup.context || `Please explain the word "${popup.word}" for an IELTS learner.`,
                    }),
                });
                const data = await response.json();
                aiDefinition = data?.context_meaning;
                aiExample = data?.example || aiExample;
                aiPhonetic = data?.phonetic || aiPhonetic;

                if (aiDefinition || aiExample || aiPhonetic) {
                    setDefinition(prev => ({
                        ...prev,
                        context_meaning: aiDefinition || prev?.context_meaning,
                        example: aiExample || prev?.example,
                        phonetic: aiPhonetic || prev?.phonetic,
                    }));
                }
            }

            const base = createEmptyCard(popup.word);
            const card: VocabItem = {
                word: popup.word,
                definition: aiDefinition?.definition || definition?.dictionary_meaning?.definition || "",
                translation: aiDefinition?.translation || definition?.dictionary_meaning?.translation || "",
                context: popup.context || "",
                example: aiExample || "",
                timestamp: base.timestamp ?? Date.now(),
                stability: base.stability ?? 0,
                difficulty: base.difficulty ?? 0,
                elapsed_days: base.elapsed_days ?? 0,
                scheduled_days: base.scheduled_days ?? 0,
                reps: base.reps ?? 0,
                state: base.state ?? 0,
                last_review: base.last_review ?? 0,
                due: base.due ?? Date.now(),
            };

            await saveVocabulary(card);
            setIsSaved(true);
        } catch (error) {
            console.error("Failed to save vocab:", error);
            setSaveError("保存失败，请重试");
        } finally {
            setIsSaving(false);
        }
    };

    // Use portal to render at document.body level to avoid parent overflow clipping
    if (typeof document === 'undefined') return null;

    return createPortal(
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 5 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            ref={popupRef}
            style={{
                position: 'fixed',
                // Center popup on clicked word, clamp to viewport
                left: Math.max(16, Math.min(popup.x - 160, window.innerWidth - 336)),
                // Show below the word with some offset (+8px gap)
                top: Math.min(popup.y + 8, window.innerHeight - 420),
            }}
            className="z-[9999] w-[320px] rounded-2xl backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/40 overflow-hidden bg-white/95 ring-1 ring-black/5 text-left"
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
                        <p className="text-[11px] mt-2 text-stone-500">支持加入生词本，复习时自动进入记忆队列。</p>
                    </div>
                    <div className="flex gap-1">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                playPronunciation(popup.word, true);
                            }}
                            className="p-2 rounded-full bg-amber-100/80 hover:bg-amber-200 text-amber-700 transition-colors shadow-sm"
                            title="Play Pronunciation"
                        >
                            <Volume2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleAddToVocab}
                            disabled={isSaved || isSaving}
                            className={cn(
                                "p-2 rounded-full transition-colors shadow-sm disabled:cursor-wait",
                                isSaved
                                    ? "bg-emerald-100 text-emerald-600"
                                    : "bg-white/80 hover:bg-amber-100 text-stone-500 hover:text-amber-600"
                            )}
                            title={isSaved ? "已加入生词本" : "加入生词本"}
                        >
                            {isSaving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : isSaved ? (
                                <Check className="w-4 h-4" />
                            ) : (
                                <BookPlus className="w-4 h-4" />
                            )}
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
                    {saveError && (
                        <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                            {saveError}
                        </div>
                    )}

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
                                    <span>&ldquo;{definition.example}&rdquo;</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-xs text-stone-400 text-center py-1">
                            Tap Deep Analyze to see meaning in this sentence.
                        </div>
                    )}
                </div>
            </div>
        </motion.div>,
        document.body
    );
}
