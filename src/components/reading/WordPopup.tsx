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
                state: base.state ?? 0,
                last_review: base.last_review ?? 0,
                due: base.due ?? Date.now(),
            };

            await saveVocabulary(card);
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
                "z-[9999] w-[336px] overflow-hidden text-left backdrop-blur-2xl",
                isMinimal
                    ? "rounded-2xl border border-slate-200/80 bg-white/98 shadow-[0_20px_45px_rgba(15,23,42,0.14)]"
                    : "rounded-[30px] border border-[#ffd9ec]/90 bg-[linear-gradient(180deg,rgba(255,250,253,0.97),rgba(248,245,255,0.95))] shadow-[0_22px_50px_rgba(221,113,183,0.22),0_10px_0_rgba(245,218,236,0.92)]"
            )}
        >
            <div
                onMouseDown={handleDragStart}
                className={cn(
                    "relative select-none px-4 pb-4 pt-3.5",
                    isMinimal
                        ? "border-b border-slate-200/80 bg-white"
                        : "border-b border-[#f8d9ea]/90 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,244,249,0.95)_58%,rgba(244,244,255,0.92))]",
                    isDragging ? "cursor-grabbing" : "cursor-grab",
                )}
            >
                {!isMinimal ? (
                    <div className="pointer-events-none absolute inset-x-6 top-0 h-16 rounded-b-[28px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(255,255,255,0))]" />
                ) : null}
                <div className="flex justify-between items-start">
                    <div className="min-w-0">
                        <p className={cn(
                            "text-[10px] font-black uppercase tracking-[0.24em]",
                            isMinimal ? "text-slate-500" : "text-[#d27cb0]",
                        )}>
                            Word Lookup
                        </p>
                        <h3 className={cn(
                            "mt-1 text-[30px] font-serif font-bold tracking-tight flex items-center gap-2 break-words",
                            isMinimal ? "text-slate-900" : "text-[#6f3f60]",
                        )}>
                            {popup.word}
                        </h3>
                        {definition?.phonetic && (
                            <div className="mt-2 flex items-center gap-2">
                                <span className={cn(
                                    "rounded-full px-2.5 py-1 text-xs font-semibold tracking-[0.08em]",
                                    isMinimal
                                        ? "border border-slate-200 bg-slate-50 text-slate-600"
                                        : "border border-[#eadcf6] bg-white/85 text-[#8f7bb0] shadow-[0_3px_0_rgba(238,228,248,0.9)]",
                                )}>
                                    {definition.phonetic}
                                </span>
                            </div>
                        )}
                        <p className={cn(
                            "mt-3 text-[11px] leading-5",
                            isMinimal ? "text-slate-500" : "text-[#9c85a8]",
                        )}>
                            {isReadingMode ? "首次查词 -1 阅读币。" : battleLookupCostHint}
                        </p>
                    </div>
                    <div className="ml-3 flex shrink-0 gap-1.5">
                        <motion.button
                            onClick={(e) => {
                                e.stopPropagation();
                                playPronunciation(popup.word, true);
                            }}
                            whileTap={candyTap}
                            style={mintPressStyle}
                            className={cn(
                                "ui-pressable rounded-full p-2 transition-colors",
                                isMinimal
                                    ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                    : "border border-[#bcefd9] bg-[linear-gradient(180deg,#f4fff9,#dcfff0)] text-[#2a9f78] hover:bg-[#ecfff6]",
                            )}
                            title="Play Pronunciation"
                        >
                            <Volume2 className="w-4 h-4" />
                        </motion.button>
                        {showAiDefinitionButton ? (
                            <motion.button
                                onClick={handleGenerateAiDefinition}
                                disabled={isLoadingAi}
                                whileTap={candyTap}
                                style={lavenderPressStyle}
                                className={cn(
                                    "ui-pressable rounded-full px-2.5 py-2 text-[11px] font-bold tracking-[0.08em] transition-colors disabled:cursor-not-allowed",
                                    isMinimal
                                        ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                                        : "border border-[#d9ccff] bg-[linear-gradient(180deg,#fbf8ff,#eee7ff)] text-[#7a58e8] hover:bg-[#f6f1ff] disabled:text-[#b7a8ea]",
                                )}
                                title="AI 生成释义"
                            >
                                {isLoadingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "AI"}
                            </motion.button>
                        ) : null}
                        <div className="relative">
                            <motion.button
                                onClick={handleAddToVocab}
                                disabled={isSaving && !isSaved}
                                whileTap={isSaved ? undefined : candyTap}
                                style={isSaved ? undefined : lavenderPressStyle}
                                className={cn(
                                    "relative rounded-full p-2 transition-colors disabled:cursor-default",
                                    isSaved
                                        ? (isMinimal
                                            ? "cursor-default rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700"
                                            : "cursor-default rounded-full border border-[#bfead7] bg-[linear-gradient(180deg,#effff6,#ddfaec)] text-[#2c9b74] shadow-[0_4px_0_rgba(186,239,219,0.96)]")
                                        : (isMinimal
                                            ? "ui-pressable border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                            : "ui-pressable border border-[#d9ccff] bg-[linear-gradient(180deg,#fbf8ff,#eee7ff)] text-[#7a58e8] hover:bg-[#f6f1ff]")
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
                        <motion.button
                            onClick={onClose}
                            whileTap={candyTap}
                            style={candyPressStyle}
                            className={cn(
                                "ui-pressable rounded-full p-2 transition-colors",
                                isMinimal
                                    ? "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                    : "border border-[#f5d8e9] bg-white/92 text-[#c489ae] hover:bg-[#fff0f8] hover:text-[#a95a8d]",
                            )}
                        >
                            <X className="w-4 h-4" />
                        </motion.button>
                    </div>
                </div>
            </div>

            <div className={cn(
                "space-y-3 p-4",
                isMinimal
                    ? "bg-white"
                    : "bg-[linear-gradient(180deg,rgba(255,251,253,0.96),rgba(245,244,255,0.92))]",
            )}>
                <div className={cn(
                    "rounded-[24px] p-3.5",
                    isMinimal
                        ? "border border-slate-200 bg-slate-50/60"
                        : "border border-[#f7ddeb] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,251,0.9))] shadow-[0_6px_0_rgba(248,223,236,0.95)]",
                )}>
                    <div className={cn(
                        "mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em]",
                        isMinimal ? "text-slate-500" : "text-[#cb7bab]",
                    )}>
                        <Book className="h-3.5 w-3.5" />
                        <span>Dictionary</span>
                    </div>

                    {isLoadingDict ? (
                        <div className={cn(
                            "flex items-center gap-2 rounded-[18px] px-3 py-3",
                            isMinimal
                                ? "border border-slate-200 bg-white text-slate-500"
                                : "border border-[#f1e3ee] bg-white/72 text-[#b28ea8]",
                        )}>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm font-semibold">Searching...</span>
                        </div>
                    ) : definition?.dictionary_meaning ? (
                        <div className={cn(
                            "space-y-2 rounded-[20px] p-3",
                            isMinimal
                                ? "border border-slate-200 bg-white"
                                : "border border-[#efe3ee] bg-white/78 shadow-[0_4px_0_rgba(243,230,240,0.85)]",
                        )}>
                            <p className={cn(
                                "text-sm font-semibold leading-snug",
                                isMinimal ? "text-slate-800" : "text-[#5e4c62]",
                            )}>
                                {definition.dictionary_meaning.definition}
                            </p>
                            {definition.dictionary_meaning.translation && (
                                <p className={cn(
                                    "text-sm",
                                    isMinimal ? "text-slate-600" : "text-[#9a6f8a]",
                                )}>
                                    {definition.dictionary_meaning.translation}
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className={cn(
                            "rounded-[18px] px-3 py-3 text-sm italic",
                            isMinimal
                                ? "border border-slate-200 bg-white text-slate-500"
                                : "border border-[#efe5f0] bg-white/70 text-[#b296af]",
                        )}>
                            No definition found.
                        </p>
                    )}
                </div>
                {(showAiDefinitionButton && showAiPanel) ? (
                    <div className={cn(
                        "rounded-[24px] p-3.5",
                        isMinimal
                            ? "border border-slate-200 bg-slate-50/60"
                            : "border border-[#f7ddeb] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,251,0.9))] shadow-[0_6px_0_rgba(248,223,236,0.95)]",
                    )}>
                        <div className={cn(
                            "mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em]",
                            isMinimal ? "text-slate-500" : "text-[#7a58e8]",
                        )}>
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>AI Definition</span>
                        </div>

                        {isLoadingAi ? (
                            <div className={cn(
                                "flex items-center gap-2 rounded-[18px] px-3 py-3",
                                isMinimal
                                    ? "border border-slate-200 bg-white text-slate-500"
                                    : "border border-[#e5ddff] bg-white/72 text-[#8b78c8]",
                            )}>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-sm font-semibold">AI 正在生成释义...</span>
                            </div>
                        ) : definition?.context_meaning ? (
                            <div className={cn(
                                "space-y-2 rounded-[20px] p-3",
                                isMinimal
                                    ? "border border-slate-200 bg-white"
                                    : "border border-[#e9e2ff] bg-white/78 shadow-[0_4px_0_rgba(231,224,255,0.85)]",
                            )}>
                                <p className={cn(
                                    "text-sm font-semibold leading-snug",
                                    isMinimal ? "text-slate-800" : "text-[#5a4a86]",
                                )}>
                                    {definition.context_meaning.definition}
                                </p>
                                {definition.context_meaning.translation ? (
                                    <p className={cn(
                                        "text-sm",
                                        isMinimal ? "text-slate-600" : "text-[#7f6bb1]",
                                    )}>
                                        {definition.context_meaning.translation}
                                    </p>
                                ) : null}
                            </div>
                        ) : (
                            <p className={cn(
                                "rounded-[18px] px-3 py-3 text-sm",
                                isMinimal
                                    ? "border border-slate-200 bg-white text-slate-500"
                                    : "border border-[#e8ddff] bg-white/70 text-[#8f7bb0]",
                            )}>
                                点击上方 <span className="font-semibold">AI</span> 按钮生成场景释义。
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
