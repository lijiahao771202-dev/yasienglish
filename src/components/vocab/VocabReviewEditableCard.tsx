"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Volume2, Sparkles, BookOpen, Fingerprint, Star, GripVertical } from "lucide-react";
import { AnimatePresence, motion, Reorder } from "framer-motion";

import { PretextTextarea } from "@/components/ui/PretextTextarea";
import type { VocabItem } from "@/lib/db";
import { isVocabularyArchived } from "@/lib/fsrs";
import { updateVocabularyEntry } from "@/lib/user-repository";
import {
    normalizeMeaningMatchText,
    parseMeaningGroups,
    pickPreferredMeaningGroups,
    resolveHighlightedMeaningsFromGroups,
} from "@/lib/vocab-meanings";
import { cn } from "@/lib/utils";

type PosGroup = {
    pos: string;
    meanings: string[];
};

type PosGroupDraft = {
    pos: string;
    meanings: { id: string; text: string }[];
};

type WindowWithPersistDraftTimer = Window & typeof globalThis & {
    __persistDraftTimer?: ReturnType<typeof window.setTimeout>;
};

interface VocabReviewEditableCardProps {
    item: VocabItem;
    posGroups: PosGroup[];
    expandedPosGroups: Record<string, boolean>;
    onExpandedPosGroupsChange: (next: Record<string, boolean>) => void;
    onPlayAudio: (word: string) => void;
    onSaved: (item: VocabItem) => void;
    onArchive?: (item: VocabItem, previousWord: string) => Promise<void> | void;
    ghostInput?: string;
    isTourActive?: boolean;
}

interface DraftState {
    word: string;
    phonetic: string;
    source_sentence: string;
    example: string;
    highlighted_meanings: string[];
}

function buildDraft(item: VocabItem): DraftState {
    return {
        word: item.word,
        phonetic: item.phonetic || "",
        source_sentence: item.source_sentence || "",
        example: item.example || "",
        highlighted_meanings: Array.isArray(item.highlighted_meanings) ? item.highlighted_meanings : [],
    };
}

function normalizeWord(value: string) {
    return value.trim().replace(/\s+/g, " ");
}

function normalizeMeaningForMatch(value: string) {
    return normalizeMeaningMatchText(value);
}

function meaningsLooselyMatch(left: string, right: string) {
    const normalizedLeft = normalizeMeaningForMatch(left);
    const normalizedRight = normalizeMeaningForMatch(right);
    if (!normalizedLeft || !normalizedRight) return false;
    return normalizedLeft === normalizedRight;
}

function normalizeMeaningGroups(groups: PosGroup[]) {
    return groups
        .map((group) => ({
            pos: (group.pos || "n.").trim() || "n.",
            meanings: group.meanings.map((meaning) => meaning.trim()).filter(Boolean),
        }))
        .filter((group) => group.meanings.length > 0);
}

function serializeMeaningGroups(groups: PosGroup[]) {
    return normalizeMeaningGroups(groups)
        .map((group) => `${group.pos} ${group.meanings.join("; ")}`)
        .join("；");
}

function toPosGroupDrafts(groups: PosGroup[]): PosGroupDraft[] {
    return groups.map((g) => ({
        pos: g.pos,
        meanings: g.meanings.map((m) => ({ id: Math.random().toString(36).slice(2, 9), text: m }))
    }));
}

function fromPosGroupDrafts(drafts: PosGroupDraft[]): PosGroup[] {
    return drafts.map((g) => ({
        pos: g.pos,
        meanings: g.meanings.map((m) => m.text)
    }));
}

function buildMeaningDraftGroups(item: VocabItem, posGroups: PosGroup[]) {
    const itemGroups = Array.isArray(item.meaning_groups) && item.meaning_groups.length > 0
        ? normalizeMeaningGroups(item.meaning_groups)
        : [];
    const fallbackGroups = posGroups.length > 0
        ? normalizeMeaningGroups(posGroups)
        : normalizeMeaningGroups(parseMeaningGroups(item.definition, item.translation, item.word));

    return normalizeMeaningGroups(pickPreferredMeaningGroups(itemGroups, fallbackGroups));
}

function getTextareaRows(value: string, min = 1, max = 6) {
    const lines = value.split("\n").length;
    const estimated = Math.ceil(value.length / 28);
    return Math.max(min, Math.min(max, Math.max(lines, estimated || 1)));
}

type TabKey = "meanings" | "examples" | "analysis";

export function VocabReviewEditableCard({
    item,
    posGroups,
    expandedPosGroups,
    onExpandedPosGroupsChange,
    onPlayAudio,
    onSaved,
    onArchive,
    ghostInput = "",
    isTourActive = false,
}: VocabReviewEditableCardProps) {
    const [draft, setDraft] = useState<DraftState>(() => buildDraft(item));
    
    const [meaningDraftGroups, setMeaningDraftGroups] = useState<PosGroupDraft[]>(() => 
        toPosGroupDrafts(buildMeaningDraftGroups(item, posGroups))
    );
    
    const [isSaving, setIsSaving] = useState(false);
    const [isGraduating, setIsGraduating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resolvedPhonetic, setResolvedPhonetic] = useState("");
    const [isWordInputFocused, setIsWordInputFocused] = useState(false);
    
    // UI State
    const [activeTab, setActiveTab] = useState<TabKey>("meanings");

    const itemMeaningGroups = useMemo(
        () => buildMeaningDraftGroups(item, posGroups),
        [item, posGroups],
    );

    useEffect(() => {
        // Fix: ONLY resync when the word changes to prevent input stealing/reset
        setDraft(buildDraft(item));
        setMeaningDraftGroups(toPosGroupDrafts(buildMeaningDraftGroups(item, posGroups)));
        setIsSaving(false);
        setIsGraduating(false);
        setError(null);
        setResolvedPhonetic("");
    }, [item.word]);

    const highlightedMeanings = useMemo(
        () => (Array.isArray(draft.highlighted_meanings) ? draft.highlighted_meanings : []),
        [draft.highlighted_meanings],
    );
    
    const plainMeaningDraftGroups = useMemo(() => fromPosGroupDrafts(meaningDraftGroups), [meaningDraftGroups]);
    
    const resolvedHighlightedMeanings = useMemo(
        () => resolveHighlightedMeaningsFromGroups(plainMeaningDraftGroups, highlightedMeanings),
        [highlightedMeanings, plainMeaningDraftGroups],
    );
    const normalizedHighlightedMeanings = useMemo(
        () => resolvedHighlightedMeanings.map(normalizeMeaningForMatch).filter(Boolean),
        [resolvedHighlightedMeanings],
    );
    
    const wordBreakdown = Array.isArray(item.word_breakdown) ? item.word_breakdown : [];
    const morphologyNotes = Array.isArray(item.morphology_notes) ? item.morphology_notes : [];
    const hasWordAnalysis = wordBreakdown.length > 0 || morphologyNotes.length > 0;
    
    const displayPhonetic = draft.phonetic.trim() || resolvedPhonetic.trim();
    const isArchived = isVocabularyArchived(item);

    useEffect(() => {
        const word = normalizeWord(draft.word);
        if (draft.phonetic.trim() || resolvedPhonetic.trim() || !word) {
            return;
        }

        let cancelled = false;
        const controller = new AbortController();

        const loadPhonetic = async () => {
            try {
                const response = await fetch("/api/dictionary", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ word }),
                    signal: controller.signal,
                });
                if (!response.ok) return;

                const payload = await response.json() as { phonetic?: string };
                const phonetic = typeof payload.phonetic === "string" ? payload.phonetic.trim() : "";
                if (!cancelled && phonetic) {
                    setResolvedPhonetic(phonetic);
                }
            } catch (loadError) {
                if (loadError instanceof Error && loadError.name === "AbortError") return;
            }
        };

        void loadPhonetic();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [draft.phonetic, draft.word, resolvedPhonetic]);

    const handleChange = (field: keyof DraftState, value: string) => {
        setDraft((current) => ({ ...current, [field]: value }));
        setError(null);
    };

    const handleMeaningChange = (groupIndex: number, meaningId: string, value: string) => {
        setMeaningDraftGroups((current) => current.map((group, currentGroupIndex) => {
            if (currentGroupIndex !== groupIndex) return group;
            return {
                ...group,
                meanings: group.meanings.map((meaning) => (
                    meaning.id === meaningId ? { ...meaning, text: value } : meaning
                )),
            };
        }));
        setError(null);
    };

    const handleReorderGroup = (groupIndex: number, newMeanings: {id: string, text: string}[]) => {
        setMeaningDraftGroups((current) => {
            const nextGroups = current.map((group, idx) => 
                idx === groupIndex ? { ...group, meanings: newMeanings } : group
            );
            void persistDraft(draft, fromPosGroupDrafts(nextGroups));
            return nextGroups;
        });
        setError(null);
    };

    const buildPendingItem = useCallback((nextDraft: DraftState = draft, nextMeaningDraftGroups: PosGroup[] = plainMeaningDraftGroups): VocabItem => {
        const normalizedMeaningGroups = normalizeMeaningGroups(nextMeaningDraftGroups);
        const serializedTranslation = serializeMeaningGroups(normalizedMeaningGroups);
        return {
            ...item,
            word: normalizeWord(nextDraft.word),
            phonetic: nextDraft.phonetic.trim() || resolvedPhonetic.trim(),
            definition: item.definition?.trim() || "",
            translation: serializedTranslation,
            source_sentence: nextDraft.source_sentence.trim(),
            example: nextDraft.example.trim(),
            meaning_groups: normalizedMeaningGroups,
            highlighted_meanings: nextDraft.highlighted_meanings,
        };
    }, [draft, item, plainMeaningDraftGroups, resolvedPhonetic]);

    const persistDraft = useCallback(async (nextDraft: DraftState = draft, nextMeaningDraftGroups: PosGroup[] = plainMeaningDraftGroups) => {
        const nextItem = buildPendingItem(nextDraft, nextMeaningDraftGroups);
        const hasPendingChanges = (
            normalizeWord(nextDraft.word) !== item.word
            || nextDraft.phonetic.trim() !== (item.phonetic || "")
            || nextDraft.source_sentence.trim() !== (item.source_sentence || "")
            || nextDraft.example.trim() !== item.example
            || serializeMeaningGroups(nextMeaningDraftGroups) !== serializeMeaningGroups(itemMeaningGroups)
            || nextDraft.highlighted_meanings.join("|") !== (Array.isArray(item.highlighted_meanings) ? item.highlighted_meanings : []).join("|")
        );

        if (!normalizeWord(nextDraft.word) || isGraduating || !hasPendingChanges) return;
        
        // Eagerly update the parent component's local state to prevent scheduling logic from using stale card data
        onSaved(nextItem);
        
        setIsSaving(true);
        setError(null);
        
        // Use a debounce to prevent dropping fast subsequent edits (e.g., rapid deletions)
        const windowWithTimer = window as WindowWithPersistDraftTimer;
        if (windowWithTimer.__persistDraftTimer) {
            clearTimeout(windowWithTimer.__persistDraftTimer);
        }
        windowWithTimer.__persistDraftTimer = window.setTimeout(async () => {
            try {
                const saved = await updateVocabularyEntry(item.word, nextItem);
                onSaved(saved);
            } catch (saveError) {
                const message = saveError instanceof Error ? saveError.message : "保存失败，请重试。";
                setError(message === "DUPLICATE_VOCAB_WORD" ? "这个词已经在生词本里了。" : "保存失败，请重试。");
            } finally {
                setIsSaving(false);
            }
        }, 500);
    }, [buildPendingItem, draft, isGraduating, item, itemMeaningGroups, onSaved, plainMeaningDraftGroups]);

    const handleAutoSave = () => {
        void persistDraft();
    };

    const handleMeaningRemove = (groupIndex: number, meaningId: string) => {
        setMeaningDraftGroups((current) => {
            const nextMeaningDraftGroups = current
                .map((group, currentGroupIndex) => {
                    if (currentGroupIndex !== groupIndex) return group;
                    return {
                        ...group,
                        meanings: group.meanings.filter((m) => m.id !== meaningId),
                    };
                })
                .filter((group) => group.meanings.length > 0);
            
            void persistDraft(draft, fromPosGroupDrafts(nextMeaningDraftGroups));
            return nextMeaningDraftGroups;
        });
        setError(null);
    };

    const handleHighlightToggle = (meaning: string) => {
        const normalized = normalizeMeaningForMatch(meaning);
        if (!normalized) return;

        setDraft((current) => {
            const isCurrentlyHighlighted = current.highlighted_meanings.some((highlight) => meaningsLooselyMatch(meaning, highlight));
            let nextHighlighted;
            if (isCurrentlyHighlighted) {
                nextHighlighted = current.highlighted_meanings.filter((highlight) => !meaningsLooselyMatch(meaning, highlight));
            } else {
                nextHighlighted = [...current.highlighted_meanings, meaning];
            }
            const nextDraft = { ...current, highlighted_meanings: nextHighlighted };
            void persistDraft(nextDraft, plainMeaningDraftGroups);
            return nextDraft;
        });
        setError(null);
    };

    const handleArchive = async () => {
        if (!onArchive || isSaving || isGraduating) return;
        setIsGraduating(true);
        setError(null);
        try {
            await onArchive(buildPendingItem(), item.word);
        } catch (archiveError) {
            const message = archiveError instanceof Error ? archiveError.message : "归档失败，请重试。";
            setError(message || "归档失败，请重试。");
            setIsGraduating(false);
        }
    };

    return (
        <div data-review-layout="single-card" className="relative flex flex-col bg-theme-base-bg rounded-[1.5rem]">
            {/* Header: Controls & Word Input */}
            <div data-review-word-section="true" className="shrink-0 pt-3 px-4 pb-1 bg-theme-base-bg border-b-[3px] border-theme-border rounded-t-[1.5rem]">
                <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2">
                        {isArchived ? (
                            <span className="flex items-center justify-center rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-[11px] font-bold border-2 border-amber-300">
                                已归档
                            </span>
                        ) : null}
                        <p className={cn("text-[11px] font-bold text-theme-text-muted transition-opacity whitespace-nowrap", isSaving && "opacity-60")}>
                            {error ? <span className="text-red-500">{error}</span> : (isSaving ? "正在保存..." : "自动保存")}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {onArchive ? (
                            <button
                                type="button"
                                data-tour-target="review-archive-btn"
                                onClick={handleArchive}
                                disabled={isSaving || isGraduating}
                                className="flex h-8 items-center gap-1.5 rounded-full bg-theme-primary-bg border-2 border-theme-border text-theme-primary-text px-3 text-[12px] font-bold shadow-sm transition hover:scale-105 active:scale-95 disabled:opacity-60 disabled:scale-100"
                            >
                                {isGraduating ? <Loader2 className="h-3 w-3 animate-spin" /> : "⚡"} 归档
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => onPlayAudio(draft.word)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 border-2 border-emerald-300 transition-transform hover:scale-110 active:scale-95"
                        >
                            <Volume2 className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-col items-center group relative min-h-[4.5rem] -mt-3 justify-center px-4 w-full">
                    <div className="relative w-full flex flex-col items-center">
                        {!isWordInputFocused && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                                <div className="text-center text-[3.2rem] sm:text-[4rem] font-newsreader font-bold tracking-tight drop-shadow-sm leading-none transition-colors break-words max-w-full">
                                    {(() => {
                                        let inputCursorTracker = 0;
                                        // Split by whitespace but keep the whitespace tokens
                                        const tokens = draft.word.split(/(\s+)/);
                                        
                                        return (
                                            <>
                                                {tokens.map((token, tokenIdx) => {
                                                    const isWhitespaceToken = /^\s+$/.test(token);
                                                    
                                                    return (
                                                        <span key={tokenIdx} className={isWhitespaceToken ? "whitespace-pre-wrap" : "inline-block"}>
                                                            {token.split("").map((char, charIdx) => {
                                                                const isSpace = /\s/.test(char);
                                                                const ghostChar = ghostInput[inputCursorTracker]?.toLowerCase();
                                                                const normalizedChar = char.toLowerCase();
                                                                
                                                                let status = "pending";
                                                                if (ghostChar && !isSpace) {
                                                                    status = ghostChar === normalizedChar ? "correct" : "wrong";
                                                                }
                                                                
                                                                const isAnyTyping = ghostInput.length > 0;
                                                                if (!isAnyTyping) {
                                                                    status = "correct";
                                                                }
                                                                
                                                                const isCursor = isAnyTyping && inputCursorTracker === ghostInput.length;
                                                                if (!isSpace) {
                                                                    inputCursorTracker++;
                                                                }

                                                                return (
                                                                    <span key={`${tokenIdx}-${charIdx}`} className="relative inline-block transition-colors duration-150">
                                                                        {isSpace ? (
                                                                            <span className="inline-block w-[0.25em]">&nbsp;</span>
                                                                        ) : (
                                                                            <span className={cn(
                                                                                status === "correct" && "text-theme-text",
                                                                                status === "wrong" && "text-red-500",
                                                                                status === "pending" && "text-theme-text-muted opacity-30"
                                                                            )}>
                                                                                {char}
                                                                            </span>
                                                                        )}
                                                                        {isCursor && !isSpace && (
                                                                            <motion.span 
                                                                                animate={{ opacity: [1, 0, 1] }} 
                                                                                transition={{ repeat: Infinity, duration: 0.8 }} 
                                                                                className="absolute -left-[2px] top-[15%] h-[70%] w-[3px] rounded-full bg-emerald-400" 
                                                                            />
                                                                        )}
                                                                    </span>
                                                                );
                                                            })}
                                                        </span>
                                                    );
                                                })}
                                                {ghostInput.length > 0 && inputCursorTracker === ghostInput.length && (
                                                    <span className="relative">
                                                        <motion.span 
                                                            animate={{ opacity: [1, 0, 1] }} 
                                                            transition={{ repeat: Infinity, duration: 0.8 }} 
                                                            className="absolute -left-[2px] top-[15%] h-[70%] w-[4px] rounded-full bg-theme-active-bg border-[1px] border-theme-border" 
                                                        />
                                                    </span>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                        <PretextTextarea
                            aria-label="编辑单词"
                            value={draft.word}
                            onChange={(event) => handleChange("word", event.target.value)}
                            onFocus={() => setIsWordInputFocused(true)}
                            onBlur={() => {
                                setIsWordInputFocused(false);
                                handleAutoSave();
                            }}
                            rows={getTextareaRows(draft.word, 1, 3)}
                            minRows={1}
                            maxRows={3}
                            className={cn(
                                "w-full resize-none text-center bg-transparent border-none outline-none font-newsreader text-[3.2rem] sm:text-[4rem] font-bold tracking-tight transition-all placeholder:text-theme-text-muted opacity-70 focus:scale-105 hover:bg-theme-card-bg focus:bg-theme-card-bg focus:rounded-[20px] relative z-10 p-0 m-0 leading-none overflow-hidden",
                                isWordInputFocused ? "text-theme-text opacity-100" : "text-transparent caret-transparent"
                            )}
                        />
                    </div>
                    <input
                        aria-label="编辑音标"
                        value={displayPhonetic}
                        onChange={(event) => {
                            setResolvedPhonetic("");
                            handleChange("phonetic", event.target.value);
                        }}
                        onBlur={handleAutoSave}
                        placeholder="音标待补"
                        className="mt-1 w-auto min-w-[120px] max-w-[260px] text-center rounded-full bg-theme-card-bg border-[2px] border-theme-border px-4 py-1 text-[13px] font-black text-theme-text shadow-inner outline-none transition-all placeholder:text-theme-text-muted focus:ring-2 focus:ring-theme-active-bg"
                    />
                </div>
            </div>

            {/* Smart Segmented Control for Tabbing */}
            <div className="flex-none px-4 pt-3 pb-1 flex justify-center bg-theme-base-bg">
                <div className="flex bg-theme-card-bg border-2 border-theme-border p-1.5 rounded-[20px] shadow-inner gap-1">
                    {[
                        { id: "meanings", label: "释义", icon: BookOpen },
                        { id: "examples", label: "例句", icon: Sparkles },
                        ...(hasWordAnalysis ? [{ id: "analysis", label: "解析", icon: Fingerprint }] : [])
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id as TabKey)}
                            className={cn(
                                "flex items-center gap-1.5 px-4 py-1.5 rounded-2xl text-[13px] font-black transition-all whitespace-nowrap outline-none select-none",
                                activeTab === tab.id 
                                    ? "bg-theme-active-bg border-[2px] border-theme-border text-theme-active-text shadow-[0_2px_0_var(--theme-shadow)]" 
                                    : "text-theme-text-muted hover:text-theme-text hover:bg-theme-card-bg border-[2px] border-transparent"
                            )}
                        >
                            <tab.icon className="h-3.5 w-3.5" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabbed Content Area */}
            <div data-review-content-section="true" className="flex-1 px-4 pb-6 pt-2">
                <div data-review-content-scroller="true" className="h-full">
                <AnimatePresence mode="wait">
                    {activeTab === "meanings" && (
                        <motion.div
                            key="tab-meanings"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="bg-theme-card-bg border-2 border-theme-border rounded-[24px] shadow-[0_4px_0_var(--theme-shadow)] transition-colors w-full overflow-hidden"
                        >
                            <div className="flex flex-col">
                                {meaningDraftGroups.length > 0 ? (
                                    meaningDraftGroups.map((group, groupIndex) => {
                                        const groupKey = `${draft.word}-${group.pos}`;
                                        const isExpanded = expandedPosGroups[groupKey] ?? false;
                                        const visibleMeanings = isExpanded ? group.meanings : group.meanings.slice(0, 3);
                                        
                                        return (
                                            <div key={groupKey} className="flex items-start p-3 sm:p-4 gap-3 sm:gap-4 relative border-b-2 border-theme-border/30 last:border-b-0">
                                                {/* Left Column: POS Ribbon */}
                                                <div className="shrink-0 pt-1">
                                                    <div className="flex h-[26px] min-w-[36px] items-center justify-center rounded-[8px] bg-theme-primary-bg border-2 border-theme-border px-2 text-[11px] sm:text-[12px] font-black uppercase tracking-wider text-theme-primary-text shadow-[0_2px_0_var(--theme-shadow)]">
                                                        {group.pos.replace('.', '')}.
                                                    </div>
                                                </div>
                                                
                                                {/* Right Column: Meanings List */}
                                                <div className="flex flex-col gap-1 flex-1 w-full min-w-0 z-10">
                                                    <Reorder.Group 
                                                        as="div" 
                                                        axis="y" 
                                                        values={visibleMeanings} 
                                                        onReorder={(newMeanings) => handleReorderGroup(groupIndex, isExpanded ? newMeanings : [...newMeanings, ...group.meanings.slice(3)])} 
                                                        className="flex flex-col gap-1"
                                                    >
                                                        {visibleMeanings.map((meaningObj, index) => {
                                                            const isHighlighted = normalizedHighlightedMeanings.some((highlight) => meaningsLooselyMatch(meaningObj.text, highlight));
                                                            
                                                            return (
                                                                <Reorder.Item 
                                                                    as="div"
                                                                    key={meaningObj.id}
                                                                    value={meaningObj}
                                                                    data-highlighted-meaning={isHighlighted ? "true" : undefined}
                                                                    data-highlight-source={isHighlighted ? "ai" : undefined}
                                                                    className={cn(
                                                                        "group relative flex items-start gap-1.5 sm:gap-2 rounded-xl px-2 py-1 transition-all w-full",
                                                                        isHighlighted ? "bg-amber-100/50" : "hover:bg-theme-active-bg/60"
                                                                    )}
                                                                >
                                                                    <div className="relative flex shrink-0 items-center justify-center pt-0.5 w-[18px]">
                                                                        <GripVertical className="absolute -left-2 top-0 h-4 w-4 shrink-0 text-theme-text-muted opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity" />
                                                                        <span className="text-[12px] font-black text-theme-text-muted opacity-50 select-none group-hover:opacity-0 transition-opacity">
                                                                            {index + 1}.
                                                                        </span>
                                                                    </div>
                                                                    
                                                                    <div className="min-w-0 flex-1 relative">
                                                                        <PretextTextarea
                                                                            aria-label={`编辑释义 ${group.pos} ${index + 1}`}
                                                                            value={meaningObj.text}
                                                                            onChange={(event) => handleMeaningChange(groupIndex, meaningObj.id, event.target.value)}
                                                                            onBlur={handleAutoSave}
                                                                            rows={getTextareaRows(meaningObj.text, 1, 3)}
                                                                            minRows={1}
                                                                            maxRows={3}
                                                                            className={cn(
                                                                                "w-full resize-none border-none bg-transparent p-0 text-[13.5px] leading-snug font-bold outline-none transition placeholder:text-theme-text-muted m-0",
                                                                                isHighlighted ? "text-amber-900" : "text-theme-text"
                                                                            )}
                                                                        />
                                                                    </div>
                                                                    <div className={cn(
                                                                        "shrink-0 flex items-center gap-1 transition-opacity pt-0.5",
                                                                        isTourActive ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                                                    )}>
                                                                        <button
                                                                            type="button"
                                                                            data-tour-target={groupIndex === 0 && index === 0 ? "review-star-btn" : undefined}
                                                                            onClick={() => handleHighlightToggle(meaningObj.text)}
                                                                            className={cn(
                                                                                "flex h-6 w-6 items-center justify-center rounded-[8px] transition active:scale-95",
                                                                                isHighlighted ? "text-amber-600 bg-amber-200/50 hover:bg-amber-200" : "text-theme-text-muted hover:text-theme-text hover:bg-theme-card-bg shadow-sm border border-theme-border"
                                                                            )}
                                                                        >
                                                                            <Star className="h-3 w-3" fill={isHighlighted ? "currentColor" : "none"} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            data-tour-target={groupIndex === 0 && index === 0 ? "review-edit-delete" : undefined}
                                                                            onClick={() => handleMeaningRemove(groupIndex, meaningObj.id)}
                                                                            aria-label={`删除释义 ${group.pos} ${index + 1}`}
                                                                            className="flex h-6 w-6 items-center justify-center rounded-[8px] text-red-400 transition hover:bg-red-50 hover:text-red-500 active:scale-95 shadow-sm border border-theme-border bg-theme-base-bg"
                                                                        >
                                                                            <Trash2 className="h-3 w-3" />
                                                                        </button>
                                                                    </div>
                                                                </Reorder.Item>
                                                            )
                                                        })}
                                                    </Reorder.Group>
                                                    {group.meanings.length > 3 && (
                                                        <button
                                                            onClick={() => onExpandedPosGroupsChange({ ...expandedPosGroups, [groupKey]: !isExpanded })}
                                                            className="mt-2 w-full rounded-xl border-2 border-theme-border bg-theme-base-bg py-1.5 text-[11px] font-black tracking-wider text-theme-text-muted shadow-sm hover:bg-theme-card-bg hover:text-theme-text transition"
                                                        >
                                                            {isExpanded ? "收起" : `展开其余 ${group.meanings.length - 3} 个释义`}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                    )
                                })
                            ) : (
                                <div className="rounded-[20px] border-2 border-dashed border-theme-border bg-theme-base-bg p-6 text-center text-sm font-black text-theme-text-muted">
                                    暂无释义
                                </div>
                            )}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === "examples" && (
                        <motion.div
                            key="tab-examples"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="flex flex-col gap-3"
                        >
                            {(draft.source_sentence || draft.example) ? (
                                <>
                                    {draft.source_sentence && (
                                        <div className="bg-theme-card-bg border-2 border-theme-border rounded-[20px] p-4 shadow-[0_4px_0_var(--theme-shadow)]">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="inline-flex rounded-md bg-cyan-100 border-2 border-cyan-300 px-2 py-0.5 text-[10px] font-black text-cyan-700 uppercase tracking-wider">
                                                    来源
                                                </span>
                                                {item.source_label && (
                                                    <span className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest">{item.source_label}</span>
                                                )}
                                            </div>
                                            <PretextTextarea
                                                aria-label="编辑来源例句"
                                                value={draft.source_sentence}
                                                onChange={(event) => handleChange("source_sentence", event.target.value)}
                                                onBlur={handleAutoSave}
                                                rows={getTextareaRows(draft.source_sentence, 2, 6)}
                                                minRows={2}
                                                maxRows={6}
                                                className="w-full resize-none border-none bg-transparent p-0 font-newsreader text-[1.1rem] italic leading-relaxed text-theme-text outline-none"
                                            />
                                        </div>
                                    )}

                                    {draft.example && (
                                        <div className="bg-theme-card-bg border-2 border-theme-border rounded-[20px] p-4 shadow-[0_4px_0_var(--theme-shadow)]">
                                            <div className="mb-2 inline-flex rounded-md bg-emerald-100 border-2 border-emerald-300 px-2 py-0.5 text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                                                AI 造句
                                            </div>
                                            <PretextTextarea
                                                aria-label="编辑AI例句"
                                                value={draft.example}
                                                onChange={(event) => handleChange("example", event.target.value)}
                                                onBlur={handleAutoSave}
                                                rows={getTextareaRows(draft.example, 2, 6)}
                                                minRows={2}
                                                maxRows={6}
                                                className="w-full resize-none border-none bg-transparent p-0 font-newsreader text-[1.1rem] italic leading-relaxed text-theme-text outline-none"
                                            />
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="rounded-[20px] border-2 border-dashed border-theme-border bg-theme-base-bg p-6 text-center text-sm font-black text-theme-text-muted">
                                    暂无例句
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "analysis" && (
                        <motion.div
                            key="tab-analysis"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="flex flex-col gap-3"
                        >
                            <div className="bg-theme-card-bg border-2 border-theme-border rounded-[20px] p-4 shadow-[0_4px_0_var(--theme-shadow)]">
                                <div className="mb-3 inline-flex rounded-md bg-indigo-100 border-2 border-indigo-300 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                                    词根词缀剖析
                                </div>
                                {wordBreakdown.length > 0 && (
                                    <div className="mb-3 flex flex-wrap gap-2">
                                        {wordBreakdown.map((part) => (
                                            <span key={part} className="rounded-[10px] bg-theme-base-bg text-theme-text px-3 py-1 text-[13px] font-black border-2 border-theme-border shadow-sm">
                                                {part}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {morphologyNotes.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                        {morphologyNotes.map((note) => (
                                            <p key={note} className="text-[13px] leading-relaxed font-bold text-theme-text">
                                                • {note}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                </div>
            </div>
            
        </div>
    );
}
