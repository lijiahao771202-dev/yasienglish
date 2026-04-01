import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2, Book, Volume2, Sparkles, Check, BookPlus } from "lucide-react";
import { db, type VocabItem, type VocabSourceKind } from "@/lib/db";
import { createEmptyCard } from "@/lib/fsrs";
import { applyServerProfilePatchToLocal, saveVocabulary } from "@/lib/user-repository";
import { defaultVocabSourceLabel, normalizeWordKey } from "@/lib/user-sync";
import { cn } from "@/lib/utils";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { buildWordLookupDedupeKey, INSUFFICIENT_READING_COINS, type ReadingEconomyAction } from "@/lib/reading-economy";
import { dispatchReadingCoinFx } from "@/lib/reading-coin-fx";
import { type MeaningGroup } from "@/lib/vocab-meanings";

export interface PopupState {
    word: string;
    context: string;
    x: number;
    y: number;
    articleUrl?: string;
    sourceKind?: VocabSourceKind;
    sourceLabel?: string;
    sourceSentence?: string;
    sourceNote?: string;
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
    meaning_groups?: MeaningGroup[];
    highlighted_meanings?: string[];
    word_breakdown?: string[];
    morphology_notes?: string[];
}

const POPUP_EDGE_PADDING = 16;

interface WordPopupProps {
    popup: PopupState;
    onClose: () => void;
    mode?: "reading" | "battle";
    battleConsumeLookupTicket?: () => boolean;
    battleConsumeDeepAnalyzeTicket?: () => boolean;
    battleLookupCostHint?: string;
    battleInsufficientHint?: string;
}

const pronunciationAudioCache = new Map<string, HTMLAudioElement>();
let lastPronounce: { word: string; at: number } = { word: "", at: 0 };
const dictionaryMemoryCache = new Map<string, DefinitionData>();
const dictionaryInFlight = new Map<string, Promise<DefinitionData | null>>();
type AiDefinitionResult = Pick<DefinitionData, "context_meaning" | "example" | "phonetic" | "meaning_groups" | "highlighted_meanings" | "word_breakdown" | "morphology_notes">;
const aiDefinitionMemoryCache = new Map<string, AiDefinitionResult>();
type AiDefinitionLoad = {
    result: AiDefinitionResult;
    payload: {
        context_meaning?: DefinitionData["context_meaning"];
        example?: string;
        phonetic?: string;
        meaning_groups?: MeaningGroup[];
        highlighted_meanings?: string[];
        word_breakdown?: string[];
        morphology_notes?: string[];
        errorCode?: string;
        readingCoins?: unknown;
    };
};
const aiDefinitionInFlight = new Map<string, Promise<AiDefinitionLoad>>();

function extractAnalysisContext(context: string, selection: string, maxLength = 180) {
    const normalizedContext = context.replace(/\s+/g, " ").trim();
    const normalizedSelection = selection.replace(/\s+/g, " ").trim();
    if (!normalizedContext) return "";
    if (!normalizedSelection) return normalizedContext.slice(0, maxLength);

    const lowerContext = normalizedContext.toLowerCase();
    const lowerSelection = normalizedSelection.toLowerCase();
    const matchIndex = lowerContext.indexOf(lowerSelection);

    if (matchIndex === -1 || normalizedContext.length <= maxLength) {
        return normalizedContext.slice(0, maxLength);
    }

    const desiredRadius = Math.max(48, Math.floor((maxLength - normalizedSelection.length) / 2));
    let start = Math.max(0, matchIndex - desiredRadius);
    let end = Math.min(normalizedContext.length, matchIndex + normalizedSelection.length + desiredRadius);

    while ((end - start) > maxLength) {
        if (matchIndex - start > end - (matchIndex + normalizedSelection.length)) {
            start += 1;
        } else {
            end -= 1;
        }
    }

    const prefix = start > 0 ? "..." : "";
    const suffix = end < normalizedContext.length ? "..." : "";
    return `${prefix}${normalizedContext.slice(start, end).trim()}${suffix}`;
}

function buildAiDefinitionCacheKey(word: string, context: string, mode: "reading" | "battle") {
    return `${mode}:${normalizeWordKey(word)}:${context.toLowerCase()}`;
}

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

export function WordPopup({
    popup,
    onClose,
    mode = "reading",
    battleConsumeLookupTicket,
    battleConsumeDeepAnalyzeTicket,
    battleLookupCostHint = "Battle 查词不消耗阅读币。",
    battleInsufficientHint = "关键词券不足，请先购买。",
}: WordPopupProps) {
    const sessionUser = useAuthSessionUser();
    const normalizedPopupWord = normalizeWordKey(popup.word);
    const [definition, setDefinition] = useState<DefinitionData | null>(null);
    const [isLoadingDict, setIsLoadingDict] = useState(false);
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveNotice, setSaveNotice] = useState<string | null>(null);
    const [saveFeedbackTick, setSaveFeedbackTick] = useState(0);
    const [showSaveFeedback, setShowSaveFeedback] = useState(false);
    const [readingError, setReadingError] = useState<string | null>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const dragStateRef = useRef<{ startX: number; startY: number; originLeft: number; originTop: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ left: POPUP_EDGE_PADDING, top: POPUP_EDGE_PADDING });
    const positionRef = useRef(position);
    const isReadingMode = mode === "reading";

    const clampPopupPosition = useCallback((left: number, top: number) => {
        if (typeof window === "undefined") return { left, top };
        const width = popupRef.current?.offsetWidth ?? 336;
        const height = popupRef.current?.offsetHeight ?? 420;
        const maxLeft = Math.max(POPUP_EDGE_PADDING, window.innerWidth - width - POPUP_EDGE_PADDING);
        const maxTop = Math.max(POPUP_EDGE_PADDING, window.innerHeight - height - POPUP_EDGE_PADDING);
        return {
            left: Math.min(maxLeft, Math.max(POPUP_EDGE_PADDING, left)),
            top: Math.min(maxTop, Math.max(POPUP_EDGE_PADDING, top)),
        };
    }, []);
    const syncReadingBalance = useCallback(async (
        payload: unknown,
        fallbackAction?: ReadingEconomyAction,
    ) => {
        if (!isReadingMode) return;
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
            await applyServerProfilePatchToLocal({
                reading_coins: readingCoins.balance,
            });
        }

        const delta = Number(readingCoins.delta ?? 0);
        const action = typeof readingCoins.action === "string"
            ? readingCoins.action
            : fallbackAction;
        const applied = readingCoins.applied !== false;

        if (applied && Number.isFinite(delta) && delta !== 0 && action) {
            dispatchReadingCoinFx({ delta, action: action as ReadingEconomyAction });
        }
    }, [isReadingMode]);

    useEffect(() => {
        positionRef.current = position;
    }, [position]);

    useEffect(() => {
        if (!showSaveFeedback) return;
        const timeout = window.setTimeout(() => {
            setShowSaveFeedback(false);
        }, 1200);
        return () => window.clearTimeout(timeout);
    }, [showSaveFeedback]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const next = clampPopupPosition(popup.x - 160, popup.y + 8);
        setPosition(next);
    }, [popup.x, popup.y, popup.word, clampPopupPosition]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (event: MouseEvent) => {
            const dragState = dragStateRef.current;
            if (!dragState) return;
            const next = clampPopupPosition(
                dragState.originLeft + (event.clientX - dragState.startX),
                dragState.originTop + (event.clientY - dragState.startY),
            );
            setPosition(next);
        };

        const handleMouseUp = () => {
            dragStateRef.current = null;
            setIsDragging(false);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging, clampPopupPosition]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => {
            const current = positionRef.current;
            setPosition(clampPopupPosition(current.left, current.top));
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [clampPopupPosition]);

    // Initial Load & Dictionary Search
    useEffect(() => {
        let isMounted = true;
        setDefinition(null);
        setIsLoadingDict(true);
        setIsLoadingAI(false);
        setIsSaving(false);
        setIsSaved(false);
        setSaveError(null);
        setSaveNotice(null);
        setReadingError(null);

        db.vocabulary.where("word_key").equals(normalizedPopupWord).first().then(item => {
            if (isMounted && item) {
                setIsSaved(true);
                setSaveNotice("这个词/短语已经在生词本里了，不重复入库。");
            }
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
                    const lookupDedupeKey = buildWordLookupDedupeKey({
                        userId: sessionUser?.id,
                        articleUrl: popup.articleUrl,
                        word: normalized,
                    });
                    if (!isReadingMode && battleConsumeLookupTicket && !battleConsumeLookupTicket()) {
                        setReadingError(battleInsufficientHint);
                        return null;
                    }
                    const res = await fetch("/api/dictionary", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            word: normalized,
                            economyContext: isReadingMode
                                ? {
                                    scene: "read",
                                    action: "word_lookup",
                                    articleUrl: popup.articleUrl,
                                    dedupeKey: lookupDedupeKey,
                                }
                                : undefined,
                        }),
                        signal: controller.signal,
                    });
                    const data = await res.json();
                    if (!res.ok && data?.errorCode === INSUFFICIENT_READING_COINS) {
                        setReadingError("阅读币不足，完成阅读或测验可获得阅读币。");
                        return null;
                    }
                    if (!res.ok || !data?.definition) return null;
                    await syncReadingBalance(data, "word_lookup");

                    const result: DefinitionData = {
                        dictionary_meaning: {
                            definition: data.definition,
                            translation: data.translation
                        },
                        phonetic: data.phonetic,
                        meaning_groups: Array.isArray(data.pos_groups) ? data.pos_groups : [],
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
    }, [battleConsumeLookupTicket, battleInsufficientHint, isReadingMode, normalizedPopupWord, popup.word, popup.articleUrl, sessionUser?.id, syncReadingBalance]); // Re-run if word changes

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

    const requestAiDefinition = useCallback(async (analysisContext: string): Promise<AiDefinitionLoad> => {
        const cacheKey = buildAiDefinitionCacheKey(popup.word, analysisContext, mode);
        const cached = aiDefinitionMemoryCache.get(cacheKey);
        if (cached) {
            return {
                result: cached,
                payload: cached,
            };
        }

        const dedupeKey = `word_deep:${sessionUser?.id || "anon"}:${(popup.articleUrl || "unknown").toLowerCase()}:${popup.word.trim().toLowerCase()}`;
        const existing = aiDefinitionInFlight.get(cacheKey);
        const loadAnalysis = existing ?? (async (): Promise<AiDefinitionLoad> => {
            const response = await fetch("/api/ai/define", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    word: popup.word,
                    context: analysisContext,
                    uiSurface: isReadingMode ? "reading_word_popup" : "battle_word_popup",
                    economyContext: isReadingMode
                        ? {
                            scene: "read",
                            action: "word_deep_analyze",
                            articleUrl: popup.articleUrl,
                            dedupeKey,
                        }
                        : undefined,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                const error = new Error(data?.error || "Failed to analyze word");
                (error as Error & { responseData?: unknown }).responseData = data;
                throw error;
            }

            return {
                result: {
                    context_meaning: data.context_meaning,
                    example: "",
                    phonetic: data.phonetic,
                    meaning_groups: Array.isArray(data.meaning_groups) ? data.meaning_groups : [],
                    highlighted_meanings: Array.isArray(data.highlighted_meanings) ? data.highlighted_meanings : [],
                    word_breakdown: Array.isArray(data.word_breakdown) ? data.word_breakdown : [],
                    morphology_notes: Array.isArray(data.morphology_notes) ? data.morphology_notes : [],
                } satisfies AiDefinitionResult,
                payload: data,
            };
        })();

        if (!existing) {
            aiDefinitionInFlight.set(cacheKey, loadAnalysis.finally(() => {
                aiDefinitionInFlight.delete(cacheKey);
            }));
        }

        const loaded = await loadAnalysis;
        aiDefinitionMemoryCache.set(cacheKey, loaded.result);
        if (aiDefinitionMemoryCache.size > 500) {
            const firstKey = aiDefinitionMemoryCache.keys().next().value;
            if (firstKey) aiDefinitionMemoryCache.delete(firstKey);
        }
        return loaded;
    }, [isReadingMode, mode, popup.articleUrl, popup.word, sessionUser?.id]);

    const handleAnalyzeContext = async () => {
        setIsLoadingAI(true);
        setReadingError(null);
        try {
            if (!isReadingMode && battleConsumeDeepAnalyzeTicket && !battleConsumeDeepAnalyzeTicket()) {
                setReadingError(battleInsufficientHint);
                return;
            }
            const analysisContext = isReadingMode
                ? popup.context
                : extractAnalysisContext(popup.context, popup.word);
            const { result, payload } = await requestAiDefinition(analysisContext);
            await syncReadingBalance(payload, "word_deep_analyze");
            setDefinition(prev => ({
                ...prev,
                ...result,
            }));
        } catch (error) {
            const responseData = (error as Error & { responseData?: { errorCode?: string } }).responseData;
            if (responseData?.errorCode === INSUFFICIENT_READING_COINS) {
                setReadingError("阅读币不足，暂时无法 Deep Analyze。");
            } else {
                console.error("AI error:", error);
            }
        } finally {
            setIsLoadingAI(false);
        }
    };

    const handleAddToVocab = async () => {
        if (isSaved || isSaving) return;

        setIsSaving(true);
        setSaveError(null);
        setSaveNotice(null);
        setReadingError(null);

        let aiDefinition = definition?.context_meaning;
        let aiExample = definition?.example || "";
        let aiPhonetic = definition?.phonetic;
        let aiMeaningGroups = Array.isArray(definition?.meaning_groups) ? definition.meaning_groups : [];
        let aiHighlightedMeanings = Array.isArray(definition?.highlighted_meanings) ? definition.highlighted_meanings : [];
        let aiWordBreakdown = Array.isArray(definition?.word_breakdown) ? definition.word_breakdown : [];
        let aiMorphologyNotes = Array.isArray(definition?.morphology_notes) ? definition.morphology_notes : [];
        const normalizedDisplayWord = popup.word.trim().replace(/\s+/g, " ");
        const sourceKind = popup.sourceKind || (isReadingMode ? "read" : "legacy_local");
        const sourceLabel = popup.sourceLabel || defaultVocabSourceLabel(sourceKind);
        const sourceSentence = popup.sourceSentence?.trim() || popup.context?.trim() || "";
        const sourceNote = popup.sourceNote?.trim() || "";

        try {
            const existing = await db.vocabulary.where("word_key").equals(normalizedPopupWord).first();
            if (existing) {
                setIsSaved(true);
                setSaveNotice("这个词/短语已经在生词本里了，不重复入库。");
                setSaveFeedbackTick((current) => current + 1);
                setShowSaveFeedback(true);
                return;
            }

            if (!aiDefinition) {
                if (!isReadingMode && battleConsumeDeepAnalyzeTicket && !battleConsumeDeepAnalyzeTicket()) {
                    setReadingError(battleInsufficientHint);
                    return;
                }

                const analysisContext = isReadingMode
                    ? popup.context
                    : extractAnalysisContext(popup.context, popup.word);
                const { result, payload } = await requestAiDefinition(analysisContext);
                await syncReadingBalance(payload, "word_deep_analyze");
                setDefinition(prev => ({
                    ...prev,
                    ...result,
                }));

                aiDefinition = result.context_meaning;
                aiExample = result.example || "";
                aiPhonetic = result.phonetic;
                aiMeaningGroups = Array.isArray(result.meaning_groups) ? result.meaning_groups : [];
                aiHighlightedMeanings = Array.isArray(result.highlighted_meanings) ? result.highlighted_meanings : [];
                aiWordBreakdown = Array.isArray(result.word_breakdown) ? result.word_breakdown : [];
                aiMorphologyNotes = Array.isArray(result.morphology_notes) ? result.morphology_notes : [];
            }

            if (!aiDefinition) {
                setSaveError("AI 词义生成失败，请重试。");
                return;
            }

            const base = createEmptyCard(normalizedDisplayWord);
            const card: VocabItem = {
                word: normalizedDisplayWord,
                definition: aiDefinition.definition || "",
                translation: aiDefinition.translation || "",
                context: popup.context || "",
                example: sourceSentence ? "" : aiExample || "",
                phonetic: aiPhonetic || "",
                meaning_groups: aiMeaningGroups,
                highlighted_meanings: aiHighlightedMeanings,
                word_breakdown: aiWordBreakdown,
                morphology_notes: aiMorphologyNotes,
                source_kind: sourceKind,
                source_label: sourceLabel,
                source_sentence: sourceSentence,
                source_note: sourceNote,
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

            setIsSaved(true);
            setSaveNotice("已加入生词本。");
            setSaveFeedbackTick((current) => current + 1);
            setShowSaveFeedback(true);

            await saveVocabulary(card);
        } catch (error) {
            console.error("Failed to save vocab:", error);
            const existingAfterError = await db.vocabulary.where("word_key").equals(normalizedPopupWord).first();
            if (existingAfterError) {
                setIsSaved(true);
                setSaveNotice("这个词/短语已经在生词本里了，不重复入库。");
                setSaveFeedbackTick((current) => current + 1);
                setShowSaveFeedback(true);
            } else {
                setIsSaved(false);
                setSaveNotice(null);
                setSaveError("保存失败，请重试");
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest("button")) return;
        event.preventDefault();
        dragStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            originLeft: position.left,
            originTop: position.top,
        };
        setIsDragging(true);
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
                left: position.left,
                top: position.top,
            }}
            className="z-[9999] w-[320px] rounded-2xl backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/40 overflow-hidden bg-white/95 ring-1 ring-black/5 text-left"
        >
            {/* Header: Word & Audio */}
            <div
                onMouseDown={handleDragStart}
                className={cn(
                    "bg-gradient-to-br from-amber-50/80 to-white/50 p-4 border-b border-white/50 relative select-none",
                    isDragging ? "cursor-grabbing" : "cursor-grab",
                )}
            >
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
                        <p className="text-[11px] mt-2 text-stone-500">
                            {isReadingMode ? "首次查词 -1 阅读币，Deep Analyze -2 阅读币。" : battleLookupCostHint}
                        </p>
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
                        <div className="relative">
                            <motion.button
                                onClick={handleAddToVocab}
                                disabled={isSaving && !isSaved}
                                className={cn(
                                    "relative p-2 rounded-full transition-colors shadow-sm disabled:cursor-default",
                                    isSaved
                                        ? "cursor-default bg-emerald-100 text-emerald-600"
                                        : "bg-white/80 hover:bg-amber-100 text-stone-500 hover:text-amber-600"
                                )}
                                title={isSaved ? "已加入生词本" : isSaving ? "正在加入生词本" : "加入生词本"}
                                animate={showSaveFeedback ? { scale: [1, 1.18, 1], boxShadow: ["0 1px 2px rgba(0,0,0,0.08)", "0 0 0 8px rgba(16,185,129,0.14)", "0 1px 2px rgba(0,0,0,0.08)"] } : undefined}
                                transition={{ duration: 0.42, ease: "easeOut" }}
                            >
                                {isSaved ? (
                                    <motion.span
                                        key={`saved-icon-${saveFeedbackTick}`}
                                        initial={{ scale: 0.7, rotate: -12, opacity: 0.6 }}
                                        animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                        transition={{ duration: 0.28, ease: "easeOut" }}
                                        className="block"
                                    >
                                        <Check className="w-4 h-4" />
                                    </motion.span>
                                ) : isSaving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <BookPlus className="w-4 h-4" />
                                )}
                            </motion.button>
                            <AnimatePresence>
                                {showSaveFeedback ? (
                                    <motion.div
                                        key={`saved-badge-${saveFeedbackTick}`}
                                        initial={{ opacity: 0, y: 4, scale: 0.9 }}
                                        animate={{ opacity: 1, y: -8, scale: 1 }}
                                        exit={{ opacity: 0, y: -14, scale: 0.92 }}
                                        transition={{ duration: 0.45, ease: "easeOut" }}
                                        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border border-emerald-200 bg-white/96 px-2 py-1 text-[10px] font-bold text-emerald-600 shadow-[0_8px_20px_rgba(16,185,129,0.14)]"
                                    >
                                        已保存
                                    </motion.div>
                                ) : null}
                            </AnimatePresence>
                        </div>
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
                    {saveNotice && !saveError && (
                        <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            {saveNotice}
                        </div>
                    )}
                    {readingError && (
                        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            {readingError}
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
                                Deep Analyze · -2
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

                            {Array.isArray(definition.highlighted_meanings) && definition.highlighted_meanings.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700/70">Focus Meaning</p>
                                    <div className="flex flex-wrap gap-2">
                                        {definition.highlighted_meanings.map((meaning) => (
                                            <span key={meaning} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                                {meaning}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {Array.isArray(definition.word_breakdown) && definition.word_breakdown.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-500">Word Breakdown</p>
                                    <div className="flex flex-wrap gap-2">
                                        {definition.word_breakdown.map((part) => (
                                            <span key={part} className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700">
                                                {part}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {Array.isArray(definition.morphology_notes) && definition.morphology_notes.length > 0 ? (
                                <div className="rounded-xl border border-stone-200/70 bg-white/70 p-3">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-500">Roots & Affixes</p>
                                    <div className="mt-2 space-y-1.5">
                                        {definition.morphology_notes.map((note) => (
                                            <p key={note} className="text-xs leading-relaxed text-stone-600">
                                                {note}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {(popup.sourceSentence?.trim() || popup.context?.trim()) ? (
                                <div className="flex gap-2 items-start text-xs text-stone-500 italic pl-2 border-l-2 border-amber-200">
                                    <span className="shrink-0 mt-0.5">Src.</span>
                                    <span>&ldquo;{popup.sourceSentence?.trim() || popup.context.trim()}&rdquo;</span>
                                </div>
                            ) : null}
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
