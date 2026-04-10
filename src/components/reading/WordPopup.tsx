import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, Loader2, Book, Volume2, Check, BookPlus, Sparkles } from "lucide-react";
import { db, type VocabItem, type VocabSourceKind } from "@/lib/db";
import { createEmptyCard } from "@/lib/fsrs";
import { applyServerProfilePatchToLocal, saveVocabulary } from "@/lib/user-repository";
import { defaultVocabSourceLabel, normalizeWordKey } from "@/lib/user-sync";
import { cn } from "@/lib/utils";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { buildWordLookupDedupeKey, INSUFFICIENT_READING_COINS, type ReadingEconomyAction } from "@/lib/reading-economy";
import { dispatchReadingCoinFx } from "@/lib/reading-coin-fx";
import { type MeaningGroup } from "@/lib/vocab-meanings";
import { getPressableStyle, getPressableTap } from "@/lib/pressable";
import { retryClientAction, type RetryableClientError } from "@/lib/client-retry";

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
    appearance?: "default" | "minimal";
    showAiDefinitionButton?: boolean;
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
    appearance = "default",
    showAiDefinitionButton = false,
    battleConsumeLookupTicket,
    battleConsumeDeepAnalyzeTicket,
    battleLookupCostHint = "Battle 查词不消耗阅读币。",
    battleInsufficientHint = "关键词券不足，请先购买。",
}: WordPopupProps) {
    const sessionUser = useAuthSessionUser();
    const normalizedPopupWord = normalizeWordKey(popup.word);
    const [definition, setDefinition] = useState<DefinitionData | null>(null);
    const [isLoadingDict, setIsLoadingDict] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveNotice, setSaveNotice] = useState<string | null>(null);
    const [saveFeedbackTick, setSaveFeedbackTick] = useState(0);
    const [showSaveFeedback, setShowSaveFeedback] = useState(false);
    const [readingError, setReadingError] = useState<string | null>(null);
    const [isLoadingAi, setIsLoadingAi] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [showAiPanel, setShowAiPanel] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);
    const dragStateRef = useRef<{ startX: number; startY: number; originLeft: number; originTop: number } | null>(null);
    const isMountedRef = useRef(true);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ left: POPUP_EDGE_PADDING, top: POPUP_EDGE_PADDING });
    const positionRef = useRef(position);
    const isReadingMode = mode === "reading";
    const isMinimal = appearance === "minimal";
    const reducedMotion = useReducedMotion();
    const candyTap = getPressableTap(Boolean(reducedMotion), 4, 0.985);
    const candyPressStyle = getPressableStyle("rgba(244, 211, 231, 0.96)", 4);
    const mintPressStyle = getPressableStyle("rgba(186, 239, 219, 0.96)", 4);
    const lavenderPressStyle = getPressableStyle("rgba(220, 212, 255, 0.96)", 4);

    const clampPopupPosition = useCallback((left: number, top: number, flipYOriginBottom?: number, isResizeOrDrag = false) => {
        if (typeof window === "undefined") return { left, top };
        const width = popupRef.current?.offsetWidth ?? 280;
        // during initial render height might be 0, so guess 300
        const height = popupRef.current?.offsetHeight || 300;
        
        const maxLeft = Math.max(POPUP_EDGE_PADDING, window.innerWidth - width - POPUP_EDGE_PADDING);
        
        // Smart flip logic: if we are given an origin and doing initial placement, check if we'll exceed the window height
        let finalTop = top;
        if (!isResizeOrDrag && flipYOriginBottom !== undefined && finalTop + height > window.innerHeight - POPUP_EDGE_PADDING) {
            // Flip it above the word. Assume word text is height ~24px -> top of word = flipYOriginBottom - 24
            const flippedTop = flipYOriginBottom - 24 - height - 8;
            if (flippedTop >= POPUP_EDGE_PADDING) {
                finalTop = flippedTop;
            }
        }
        
        const maxTop = Math.max(POPUP_EDGE_PADDING, window.innerHeight - height - POPUP_EDGE_PADDING);
        
        return {
            left: Math.min(maxLeft, Math.max(POPUP_EDGE_PADDING, left)),
            top: Math.min(maxTop, Math.max(POPUP_EDGE_PADDING, finalTop)),
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
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

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
        // On [word] or [x,y] change, recalculate and possibly flip
        const next = clampPopupPosition(popup.x - 140, popup.y + 8, popup.y);
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
                undefined,
                true
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
            setPosition(clampPopupPosition(current.left, current.top, undefined, true));
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [clampPopupPosition]);

    // Initial Load & Dictionary Search
    useEffect(() => {
        let isMounted = true;
        setDefinition(null);
        setIsLoadingDict(true);
        setIsSaving(false);
        setIsSaved(false);
        setSaveError(null);
        setSaveNotice(null);
        setReadingError(null);
        setIsLoadingAi(false);
        setAiError(null);
        setShowAiPanel(false);

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
        const loadAnalysis = existing ?? retryClientAction(async (): Promise<AiDefinitionLoad> => {
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
            let data;
            try {
                data = await response.json();
            } catch {
                data = null;
            }
            if (!response.ok) {
                const error = new Error(data?.error || "Failed to analyze word") as RetryableClientError;
                error.responseData = data;
                error.responseStatus = response.status;
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
        });

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

    const handleGenerateAiDefinition = useCallback(async () => {
        if (isLoadingAi) return;
        setShowAiPanel(true);
        setAiError(null);
        setReadingError(null);
        setIsLoadingAi(true);
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
            setDefinition((prev) => ({
                ...prev,
                ...result,
            }));
        } catch (error) {
            console.error("AI definition error:", error);
            setAiError("AI 释义生成失败，请重试。");
        } finally {
            setIsLoadingAi(false);
        }
    }, [
        battleConsumeDeepAnalyzeTicket,
        battleInsufficientHint,
        isLoadingAi,
        isReadingMode,
        popup.context,
        popup.word,
        requestAiDefinition,
        syncReadingBalance,
    ]);

    const handleAddToVocab = async () => {
        if (isSaved || isSaving) return;

        const rollbackOptimisticSave = (options?: {
            saveError?: string | null;
            saveNotice?: string | null;
            readingError?: string | null;
        }) => {
            if (!isMountedRef.current) return;
            setIsSaved(false);
            setShowSaveFeedback(false);
            setSaveNotice(options?.saveNotice ?? null);
            setSaveError(options?.saveError ?? null);
            setReadingError(options?.readingError ?? null);
        };

        setIsSaving(true);
        setSaveError(null);
        setSaveNotice(null);
        setReadingError(null);
        setIsSaved(true);
        setSaveNotice("已加入生词本。");
        setSaveFeedbackTick((current) => current + 1);
        setShowSaveFeedback(true);

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
                setSaveNotice("这个词/短语已经在生词本里了，不重复入库。");
                return;
            }

            if (!aiDefinition) {
                if (!isReadingMode && battleConsumeDeepAnalyzeTicket && !battleConsumeDeepAnalyzeTicket()) {
                    rollbackOptimisticSave({ readingError: battleInsufficientHint });
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
                rollbackOptimisticSave({ saveError: "AI 词义生成失败，请重试。" });
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
                lapses: base.lapses ?? 0,
                learning_steps: base.learning_steps ?? 0,
                state: base.state ?? 0,
                last_review: base.last_review ?? 0,
                due: base.due ?? Date.now(),
            };

            await retryClientAction(() => saveVocabulary(card));
        } catch (error) {
            console.error("Failed to save vocab:", error);
            const responseData = (error as Error & { responseData?: { errorCode?: string } }).responseData;
            const existingAfterError = await db.vocabulary.where("word_key").equals(normalizedPopupWord).first();
            if (existingAfterError) {
                if (!isMountedRef.current) return;
                setSaveNotice("这个词/短语已经在生词本里了，不重复入库。");
                setSaveError(null);
                setReadingError(null);
            } else if (responseData?.errorCode === INSUFFICIENT_READING_COINS) {
                rollbackOptimisticSave({ readingError: "阅读币不足，暂时无法加入生词本。" });
            } else {
                rollbackOptimisticSave({ saveError: "保存失败，请重试" });
            }
        } finally {
            if (isMountedRef.current) {
                setIsSaving(false);
            }
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
            className={cn(
                "z-[2147483647] flex flex-col w-[280px] sm:w-[316px] max-h-[calc(100vh-32px)] sm:max-h-[min(85vh,600px)] overflow-hidden text-left",
                isMinimal
                    ? "rounded-2xl border border-slate-200/80 bg-white/98 shadow-[0_20px_45px_rgba(15,23,42,0.14)]"
                    : "rounded-[1.25rem] border border-theme-border/30 bg-theme-base-bg shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
            )}
        >
            <div
                onMouseDown={handleDragStart}
                className={cn(
                    "relative shrink-0 select-none px-4 pb-3 pt-3",
                    isMinimal
                        ? "border-b border-slate-200/80 bg-white"
                        : "border-b border-theme-border/20 bg-theme-card-bg",
                    isDragging ? "cursor-grabbing" : "cursor-grab",
                )}
            >
                {!isMinimal ? (
                    <div className="pointer-events-none absolute inset-x-6 top-0 h-16 rounded-b-[28px] opacity-20" />
                ) : null}
                <div className="flex justify-between items-start">
                    <div className="min-w-0 flex flex-col justify-center min-h-[36px]">
                        <h3 className={cn(
                            "text-[1.6rem] font-serif font-bold tracking-tight flex items-center gap-2 break-words leading-none",
                            isMinimal ? "text-slate-900" : "text-theme-text",
                        )}>
                            {popup.word}
                        </h3>
                        {definition?.phonetic && (
                            <div className="mt-2.5 flex items-center gap-2">
                                <span className={cn(
                                    "rounded-[8px] px-2 py-0.5 text-[11px] font-black tracking-[0.08em] border",
                                    isMinimal
                                        ? "border-slate-200 bg-slate-50 text-slate-600"
                                        : "border-theme-border/50 bg-theme-base-bg text-theme-text shadow-sm",
                                )}>
                                    {definition.phonetic}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="ml-3 flex shrink-0 gap-1.5">
                        <motion.button
                            onClick={(e) => {
                                e.stopPropagation();
                                playPronunciation(popup.word, true);
                            }}
                            whileTap={candyTap}
                            className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-[10px] border-[2px] transition active:scale-95 shadow-sm",
                                isMinimal
                                    ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                    : "border-theme-border bg-theme-primary-bg text-theme-primary-text hover:bg-theme-primary-hover",
                            )}
                            title="Play Pronunciation"
                        >
                            <Volume2 className="w-3.5 h-3.5" />
                        </motion.button>
                        {showAiDefinitionButton ? (
                            <motion.button
                                onClick={handleGenerateAiDefinition}
                                disabled={isLoadingAi}
                                whileTap={candyTap}
                                className={cn(
                                    "flex h-8 px-2.5 items-center justify-center rounded-[10px] border-[2px] text-[11.5px] font-black tracking-[0.08em] transition active:scale-95 shadow-sm disabled:cursor-not-allowed",
                                    isMinimal
                                        ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                                        : "border-theme-border bg-theme-active-bg text-theme-active-text hover:bg-theme-active-hover disabled:opacity-50",
                                )}
                                title="AI 生成释义"
                            >
                                {isLoadingAi ? <Loader2 className="h-3 w-3 animate-spin" /> : "AI"}
                            </motion.button>
                        ) : null}
                        <div className="relative">
                            <motion.button
                                onClick={handleAddToVocab}
                                disabled={isSaving && !isSaved}
                                whileTap={isSaved ? undefined : candyTap}
                                className={cn(
                                    "relative flex h-8 w-8 items-center justify-center rounded-[10px] border-[2px] transition shadow-sm",
                                    isSaved
                                        ? (isMinimal
                                            ? "cursor-default border-emerald-200 bg-emerald-50 text-emerald-700"
                                            : "cursor-default border-theme-border bg-emerald-500 text-white")
                                        : (isMinimal
                                            ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-95"
                                            : "border-theme-border bg-theme-card-bg text-theme-text hover:bg-theme-base-bg active:scale-95")
                                )}
                                title={isSaved ? "已加入生词本" : isSaving ? "正在加入生词本" : "加入生词本"}
                                animate={showSaveFeedback ? { scale: [1, 1.18, 1], boxShadow: ["0 1px 2px rgba(0,0,0,0.08)", "0 0 0 6px rgba(16,185,129,0.14)", "0 1px 2px rgba(0,0,0,0.08)"] } : undefined}
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
                                        <Check className="w-3.5 h-3.5" />
                                    </motion.span>
                                ) : isSaving ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <BookPlus className="w-3.5 h-3.5" />
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
                        <motion.button
                            onClick={onClose}
                            whileTap={candyTap}
                            className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-[10px] border-[2px] transition shadow-sm active:scale-95",
                                isMinimal
                                    ? "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                    : "border-theme-border bg-theme-card-bg text-theme-text-muted hover:bg-theme-base-bg hover:text-theme-text",
                            )}
                        >
                            <X className="w-3.5 h-3.5" />
                        </motion.button>
                    </div>
                </div>
            </div>

            <div className={cn(
                "space-y-3 p-3 overflow-y-auto flex-1 pretty-scroll",
                isMinimal
                    ? "bg-white"
                    : "bg-theme-card-bg",
            )}>
                <div className={cn(
                    "rounded-[1rem] p-3",
                    isMinimal
                        ? "border border-slate-200 bg-slate-50/60"
                        : "border border-theme-border/20 bg-theme-base-bg",
                )}>
                    {isLoadingDict ? (
                        <div className={cn(
                            "flex items-center gap-1.5 rounded-[12px] px-2.5 py-2.5",
                            isMinimal
                                ? "text-slate-500"
                                : "text-theme-text",
                        )}>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span className="text-[12px] font-black">Searching...</span>
                        </div>
                    ) : definition?.dictionary_meaning ? (
                        <div className={cn(
                            "space-y-1.5 rounded-[10px] p-2",
                            isMinimal
                                ? "bg-white"
                                : "bg-transparent",
                        )}>
                            <p className={cn(
                                "text-[13px] font-bold leading-snug",
                                isMinimal ? "text-slate-800" : "text-theme-text",
                            )}>
                                {definition.dictionary_meaning.definition}
                            </p>
                            {definition.dictionary_meaning.translation && (
                                <p className={cn(
                                    "text-[12px] font-bold",
                                    isMinimal ? "text-slate-600" : "text-theme-text opacity-70",
                                )}>
                                    {definition.dictionary_meaning.translation}
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className={cn(
                            "px-2.5 py-1 text-[12px] italic font-bold",
                            isMinimal
                                ? "text-slate-500"
                                : "text-theme-text-muted",
                        )}>
                            No definition found.
                        </p>
                    )}
                </div>
                {(showAiDefinitionButton && showAiPanel) ? (
                    <div className={cn(
                        "rounded-[1rem] p-3",
                        isMinimal
                            ? "border border-slate-200 bg-slate-50/60"
                            : "border border-theme-border/20 bg-theme-base-bg shrink-0",
                    )}>
                        {isLoadingAi ? (
                            <div className={cn(
                                "flex items-center gap-1.5 rounded-[12px] px-2.5 py-2",
                                isMinimal
                                    ? "text-slate-500"
                                    : "text-theme-primary-bg",
                            )}>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span className="text-[12px] font-black">AI 正在生成释义...</span>
                            </div>
                        ) : definition?.context_meaning ? (
                            <div className={cn(
                                "space-y-1.5 rounded-[10px] p-2",
                                isMinimal
                                    ? "bg-white"
                                    : "bg-transparent",
                            )}>
                                <p className={cn(
                                    "text-[13px] font-bold leading-snug",
                                    isMinimal ? "text-slate-800" : "text-theme-text",
                                )}>
                                    {definition.context_meaning.definition}
                                </p>
                                {definition.context_meaning.translation ? (
                                    <p className={cn(
                                        "text-[12px] font-bold",
                                        isMinimal ? "text-slate-600" : "text-theme-text opacity-70",
                                    )}>
                                        {definition.context_meaning.translation}
                                    </p>
                                ) : null}
                            </div>
                        ) : (
                            <p className={cn(
                                "px-2.5 py-1 text-[12px] font-black",
                                isMinimal
                                    ? "text-slate-500"
                                    : "text-theme-text-muted",
                            )}>
                                点击上方 <span className="font-bold text-theme-primary-bg">AI</span> 生成。
                            </p>
                        )}
                    </div>
                ) : null}
                {(aiError || saveError || (saveNotice && !saveError) || readingError) ? (
                    <div className="space-y-2">
                        {aiError && (
                            <div className={cn(
                                "rounded-[16px] px-3 py-2 text-xs font-semibold",
                                isMinimal
                                    ? "border border-amber-200 bg-amber-50 text-amber-700"
                                    : "border border-[#ffd8ac] bg-[#fff7ec] text-[#c07b2e]",
                            )}>
                                {aiError}
                            </div>
                        )}
                        {saveError && (
                            <div className="rounded-[16px] border border-[#ffc8d9] bg-[#fff3f7] px-3 py-2 text-xs font-semibold text-[#d65084]">
                                {saveError}
                            </div>
                        )}
                        {saveNotice && !saveError && (
                            <div className="rounded-[16px] border border-[#c5ebd7] bg-[#f1fff8] px-3 py-2 text-xs font-semibold text-[#248e66]">
                                {saveNotice}
                            </div>
                        )}
                        {readingError && (
                            <div className="rounded-[16px] border border-[#ffd8ac] bg-[#fff7ec] px-3 py-2 text-xs font-semibold text-[#c07b2e]">
                                {readingError}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </motion.div>,
        document.body
    );
}
