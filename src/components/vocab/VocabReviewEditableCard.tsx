"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Volume2, Sparkles, BookOpen, Fingerprint, Star, GripVertical } from "lucide-react";
import { AnimatePresence, motion, Reorder } from "framer-motion";

import { PretextTextarea } from "@/components/ui/PretextTextarea";
import type { VocabItem } from "@/lib/db";
import { isCardGraduated } from "@/lib/fsrs";
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

interface VocabReviewEditableCardProps {
    item: VocabItem;
    posGroups: PosGroup[];
    expandedPosGroups: Record<string, boolean>;
    onExpandedPosGroupsChange: (next: Record<string, boolean>) => void;
    onPlayAudio: (word: string) => void;
    onSaved: (item: VocabItem) => void;
    onGraduate?: (item: VocabItem, previousWord: string) => Promise<void> | void;
    ghostInput?: string;
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
    onGraduate,
    ghostInput = "",
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
    const isGraduated = isCardGraduated(item);

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

    const isDirty = useMemo(() => {
        return (
            normalizeWord(draft.word) !== item.word
            || draft.phonetic.trim() !== (item.phonetic || "")
            || draft.source_sentence.trim() !== (item.source_sentence || "")
            || draft.example.trim() !== item.example
            || draft.highlighted_meanings.join("|") !== (Array.isArray(item.highlighted_meanings) ? item.highlighted_meanings : []).join("|")
            || serializeMeaningGroups(plainMeaningDraftGroups) !== serializeMeaningGroups(itemMeaningGroups)
        );
    }, [draft, item, itemMeaningGroups, plainMeaningDraftGroups]);

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
        );

        if (!normalizeWord(nextDraft.word) || isSaving || isGraduating || !hasPendingChanges) return;
        setIsSaving(true);
        setError(null);
        try {
            const saved = await updateVocabularyEntry(item.word, nextItem);
            onSaved(saved);
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : "保存失败，请重试。";
            setError(message === "DUPLICATE_VOCAB_WORD" ? "这个词已经在生词本里了。" : "保存失败，请重试。");
        } finally {
            setIsSaving(false);
        }
    }, [buildPendingItem, draft, isGraduating, isSaving, item, itemMeaningGroups, onSaved, plainMeaningDraftGroups]);

    const handleAutoSave = () => {
        if (!isDirty) return;
        void persistDraft();
    };

    const handleMeaningRemove = (groupIndex: number, meaningId: string) => {
        const nextMeaningDraftGroups = meaningDraftGroups
            .map((group, currentGroupIndex) => {
                if (currentGroupIndex !== groupIndex) return group;
                return {
                    ...group,
                    meanings: group.meanings.filter((m) => m.id !== meaningId),
                };
            })
            .filter((group) => group.meanings.length > 0);

        setMeaningDraftGroups(nextMeaningDraftGroups);
        setError(null);
        void persistDraft(draft, fromPosGroupDrafts(nextMeaningDraftGroups));
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

    const handleGraduate = async () => {
        if (!onGraduate || isSaving || isGraduating) return;
        setIsGraduating(true);
        setError(null);
        try {
            await onGraduate(buildPendingItem(), item.word);
        } catch (graduateError) {
            const message = graduateError instanceof Error ? graduateError.message : "熟记失败，请重试。";
            setError(message || "熟记失败，请重试。");
            setIsGraduating(false);
        }
    };

    return (
        <div data-review-layout="cute-bento" className="relative z-20 flex h-full min-h-0 flex-col bg-white/70 backdrop-blur-xl rounded-[28px] overflow-hidden shadow-inner border border-white/80">
            {/* Header: Controls & Word Input */}
            <div className="shrink-0 pt-4 px-4 pb-2 z-10 sticky top-0 bg-white/40 border-b border-[#e2e8f0]/60 backdrop-blur-md">
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                        {isGraduated ? (
                            <span className="flex items-center justify-center rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-[11px] font-bold shadow-sm shadow-amber-200/50 outline outline-1 outline-amber-200/50">
                                🌟 已熟记
                            </span>
                        ) : null}
                        <p className={cn("text-[11px] font-bold text-slate-400 transition-opacity whitespace-nowrap", isSaving && "opacity-60")}>
                            {error ? <span className="text-rose-500">{error}</span> : (isSaving ? "正在保存..." : "自动保存")}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {onGraduate ? (
                            <button
                                type="button"
                                onClick={handleGraduate}
                                disabled={isSaving || isGraduating}
                                className="flex h-8 items-center gap-1.5 rounded-full bg-slate-100 text-slate-700 px-3 text-[12px] font-bold shadow-sm transition hover:scale-105 active:scale-95 disabled:opacity-60 disabled:scale-100"
                            >
                                {isGraduating ? <Loader2 className="h-3 w-3 animate-spin" /> : "⚡"} 熟记
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => onPlayAudio(draft.word)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm transition-transform hover:scale-110 hover:bg-emerald-200 active:scale-95"
                        >
                            <Volume2 className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-col items-center group relative min-h-[5.5rem] justify-center">
                    {!isWordInputFocused && (
                        <div className="absolute inset-0 flex flex-wrap items-center justify-center text-[3.2rem] sm:text-[4rem] font-newsreader font-bold tracking-tight drop-shadow-sm leading-none pointer-events-none transition-colors z-0">
                            {(() => {
                                let inputCursorTracker = 0;
                                const chars = draft.word.split("");
                                return (
                                    <>
                                        {chars.map((char, idx) => {
                                            const isSpace = /\s/.test(char);
                                            if (isSpace) {
                                                return <span key={idx} className="w-[0.5em]">&nbsp;</span>;
                                            }

                                            const ghostChar = ghostInput[inputCursorTracker]?.toLowerCase();
                                            const normalizedChar = char.toLowerCase();
                                            
                                            let status = "pending";
                                            if (ghostChar) {
                                                status = ghostChar === normalizedChar ? "correct" : "wrong";
                                            }
                                            
                                            const isAnyTyping = ghostInput.length > 0;
                                            if (!isAnyTyping) {
                                                status = "correct";
                                            }
                                            
                                            const isCursor = isAnyTyping && inputCursorTracker === ghostInput.length;
                                            inputCursorTracker++;

                                            return (
                                                <span key={idx} className="relative inline-block transition-colors duration-150">
                                                    <span className={cn(
                                                        status === "correct" && "text-slate-800",
                                                        status === "wrong" && "text-rose-500",
                                                        status === "pending" && "text-slate-200"
                                                    )}>
                                                        {char}
                                                    </span>
                                                    {isCursor && (
                                                        <motion.span 
                                                            animate={{ opacity: [1, 0, 1] }} 
                                                            transition={{ repeat: Infinity, duration: 0.8 }} 
                                                            className="absolute -left-[2px] top-[15%] h-[70%] w-[3px] rounded-full bg-emerald-400" 
                                                        />
                                                    )}
                                                </span>
                                            );
                                        })}
                                        {ghostInput.length > 0 && inputCursorTracker === ghostInput.length && (
                                            <span className="relative">
                                                <motion.span 
                                                    animate={{ opacity: [1, 0, 1] }} 
                                                    transition={{ repeat: Infinity, duration: 0.8 }} 
                                                    className="absolute -left-[2px] top-[15%] h-[70%] w-[3px] rounded-full bg-emerald-400" 
                                                />
                                            </span>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                    <input
                        aria-label="编辑单词"
                        value={draft.word}
                        onChange={(event) => handleChange("word", event.target.value)}
                        onFocus={() => setIsWordInputFocused(true)}
                        onBlur={() => {
                            setIsWordInputFocused(false);
                            handleAutoSave();
                        }}
                        className={cn(
                            "w-full text-center bg-transparent border-none outline-none font-newsreader text-[3.2rem] sm:text-[4rem] font-bold tracking-tight transition-all placeholder:text-slate-300 focus:scale-105 hover:bg-white/40 focus:bg-white/60 focus:rounded-[20px] relative z-10",
                            isWordInputFocused ? "text-slate-800" : "text-transparent caret-transparent"
                        )}
                    />
                    <input
                        aria-label="编辑音标"
                        value={displayPhonetic}
                        onChange={(event) => {
                            setResolvedPhonetic("");
                            handleChange("phonetic", event.target.value);
                        }}
                        onBlur={handleAutoSave}
                        placeholder="音标待补"
                        className="mt-1 w-auto min-w-[120px] max-w-[260px] text-center rounded-full bg-slate-100/80 px-4 py-1 text-[13px] font-medium text-slate-500 shadow-inner outline-none transition-all placeholder:text-slate-300 focus:bg-white focus:ring-2 focus:ring-emerald-200"
                    />
                </div>
            </div>

            {/* Smart Segmented Control for Tabbing */}
            <div className="flex-none px-4 pt-3 pb-1 flex justify-center z-10 sticky top-[138px]">
                <div className="flex bg-slate-100/80 p-1.5 rounded-[20px] shadow-inner gap-1">
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
                                "flex items-center gap-1.5 px-4 py-1.5 rounded-2xl text-[13px] font-bold transition-all whitespace-nowrap outline-none select-none",
                                activeTab === tab.id 
                                    ? "bg-white text-slate-800 shadow-[0_2px_10px_rgba(0,0,0,0.06)]" 
                                    : "text-slate-400 hover:text-slate-600 hover:bg-white/40"
                            )}
                        >
                            <tab.icon className="h-3.5 w-3.5" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabbed Content Area */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2 pretty-scroll">
                <AnimatePresence mode="wait">
                    {activeTab === "meanings" && (
                        <motion.div
                            key="tab-meanings"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="flex flex-col gap-3"
                        >
                            {meaningDraftGroups.length > 0 ? (
                                meaningDraftGroups.map((group, groupIndex) => {
                                    const groupKey = `${draft.word}-${group.pos}`;
                                    const isExpanded = expandedPosGroups[groupKey] ?? false;
                                    const visibleMeanings = isExpanded ? group.meanings : group.meanings.slice(0, 3);
                                    
                                    return (
                                        <div key={groupKey} className="bg-white/50 border border-slate-100/50 rounded-[24px] p-2 sm:p-3 transition-colors shadow-sm">
                                            <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-3">
                                                <div className="pt-2 sm:min-w-[40px] flex sm:justify-center px-2">
                                                    <div className="flex h-7 items-center justify-center rounded-full bg-emerald-100/60 px-2.5 text-[11px] sm:text-[12px] font-black uppercase tracking-wider text-emerald-600 outline outline-1 outline-emerald-200/50">
                                                        {group.pos.replace('.', '')}.
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1.5 flex-1 min-w-0 w-full">
                                                    <Reorder.Group 
                                                        as="div" 
                                                        axis="y" 
                                                        values={visibleMeanings} 
                                                        onReorder={(newMeanings) => handleReorderGroup(groupIndex, isExpanded ? newMeanings : [...newMeanings, ...group.meanings.slice(3)])} 
                                                        className="flex flex-col gap-1.5"
                                                    >
                                                        {visibleMeanings.map((meaningObj) => {
                                                            const isHighlighted = normalizedHighlightedMeanings.some((highlight) => meaningsLooselyMatch(meaningObj.text, highlight));
                                                            
                                                            return (
                                                                <Reorder.Item 
                                                                    as="div"
                                                                    key={meaningObj.id}
                                                                    value={meaningObj}
                                                                    className={cn(
                                                                        "group flex items-center gap-1 sm:gap-2 rounded-[16px] px-2 sm:px-3 py-1.5 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.01)] outline outline-1",
                                                                        isHighlighted ? "bg-amber-50/80 outline-amber-200/50" : "bg-white/80 outline-slate-100/80 hover:bg-white"
                                                                    )}
                                                                >
                                                                    <GripVertical className="h-4 w-4 shrink-0 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-500 cursor-grab active:cursor-grabbing transition-opacity" />
                                                                    
                                                                    <div className="min-w-0 flex-1">
                                                                        <PretextTextarea
                                                                            aria-label={`编辑 ${group.pos} 释义`}
                                                                            value={meaningObj.text}
                                                                            onChange={(event) => handleMeaningChange(groupIndex, meaningObj.id, event.target.value)}
                                                                            onBlur={handleAutoSave}
                                                                            rows={getTextareaRows(meaningObj.text, 1, 2)}
                                                                            minRows={1}
                                                                            maxRows={2}
                                                                            className={cn(
                                                                                "w-full resize-none border-none bg-transparent p-0 text-[13.5px] leading-snug font-bold outline-none transition placeholder:text-slate-300 m-0",
                                                                                isHighlighted ? "text-amber-900" : "text-slate-700 focus:text-slate-900"
                                                                            )}
                                                                        />
                                                                    </div>
                                                                    <div className="shrink-0 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleHighlightToggle(meaningObj.text)}
                                                                            className={cn(
                                                                                "flex h-7 w-7 items-center justify-center rounded-full transition active:scale-95 shadow-sm outline outline-1",
                                                                                isHighlighted ? "bg-amber-100 text-amber-500 hover:bg-amber-200 outline-amber-200" : "bg-slate-50 text-slate-400 hover:text-amber-500 hover:bg-amber-50 outline-slate-200/60"
                                                                            )}
                                                                        >
                                                                            <Star className="h-3.5 w-3.5" fill={isHighlighted ? "currentColor" : "none"} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleMeaningRemove(groupIndex, meaningObj.id)}
                                                                            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-rose-300 shadow-sm transition hover:bg-rose-50 hover:text-rose-500 active:scale-95 outline outline-1 outline-slate-200/60"
                                                                        >
                                                                            <Trash2 className="h-3.5 w-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </Reorder.Item>
                                                            )
                                                        })}
                                                    </Reorder.Group>
                                                </div>
                                            </div>
                                            {group.meanings.length > 3 && (
                                                <button
                                                    onClick={() => onExpandedPosGroupsChange({ ...expandedPosGroups, [groupKey]: !isExpanded })}
                                                    className="mt-2 w-full rounded-xl bg-slate-100/50 py-1.5 text-[11px] font-bold tracking-wider text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                                                >
                                                    {isExpanded ? "收起" : `展开其余 ${group.meanings.length - 3} 个释义`}
                                                </button>
                                            )}
                                        </div>
                                    )
                                })
                            ) : (
                                <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm font-medium text-slate-400">
                                    暂无释义
                                </div>
                            )}
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
                                        <div className="bg-sky-50/50 border border-sky-100 rounded-[20px] p-4 shadow-sm">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-600 uppercase tracking-wider">
                                                    来源
                                                </span>
                                                {item.source_label && (
                                                    <span className="text-[10px] font-black text-sky-800/40 uppercase tracking-widest">{item.source_label}</span>
                                                )}
                                            </div>
                                            <PretextTextarea
                                                value={draft.source_sentence}
                                                onChange={(event) => handleChange("source_sentence", event.target.value)}
                                                onBlur={handleAutoSave}
                                                rows={getTextareaRows(draft.source_sentence, 2, 6)}
                                                minRows={2}
                                                maxRows={6}
                                                className="w-full resize-none border-none bg-transparent p-0 font-newsreader text-[1.1rem] italic leading-relaxed text-sky-900 outline-none"
                                            />
                                        </div>
                                    )}

                                    {draft.example && (
                                        <div className="bg-emerald-50/60 border border-emerald-100 rounded-[20px] p-4 shadow-sm">
                                            <div className="mb-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                                                AI 造句
                                            </div>
                                            <PretextTextarea
                                                value={draft.example}
                                                onChange={(event) => handleChange("example", event.target.value)}
                                                onBlur={handleAutoSave}
                                                rows={getTextareaRows(draft.example, 2, 6)}
                                                minRows={2}
                                                maxRows={6}
                                                className="w-full resize-none border-none bg-transparent p-0 font-newsreader text-[1.1rem] italic leading-relaxed text-emerald-900 outline-none"
                                            />
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm font-medium text-slate-400">
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
                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-[20px] p-4 shadow-sm">
                                <div className="mb-3 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                                    词根词缀剖析
                                </div>
                                {wordBreakdown.length > 0 && (
                                    <div className="mb-3 flex flex-wrap gap-2">
                                        {wordBreakdown.map((part) => (
                                            <span key={part} className="rounded-[10px] bg-white text-indigo-700 px-3 py-1 text-[13px] font-bold shadow-sm border border-indigo-100/50">
                                                {part}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {morphologyNotes.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                        {morphologyNotes.map((note) => (
                                            <p key={note} className="text-[13px] leading-relaxed font-medium text-slate-600">
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
    );
}
