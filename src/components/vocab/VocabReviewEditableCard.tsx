"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";

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

interface VocabReviewEditableCardProps {
    item: VocabItem;
    posGroups: PosGroup[];
    expandedPosGroups: Record<string, boolean>;
    onExpandedPosGroupsChange: (next: Record<string, boolean>) => void;
    onPlayAudio: (word: string) => void;
    onSaved: (item: VocabItem) => void;
    onGraduate?: (item: VocabItem, previousWord: string) => Promise<void> | void;
}

interface DraftState {
    word: string;
    phonetic: string;
    source_sentence: string;
    example: string;
}

function buildDraft(item: VocabItem): DraftState {
    return {
        word: item.word,
        phonetic: item.phonetic || "",
        source_sentence: item.source_sentence || "",
        example: item.example || "",
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
    return normalizedLeft === normalizedRight
        || normalizedLeft.includes(normalizedRight)
        || normalizedRight.includes(normalizedLeft);
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

export function VocabReviewEditableCard({
    item,
    posGroups,
    expandedPosGroups,
    onExpandedPosGroupsChange,
    onPlayAudio,
    onSaved,
    onGraduate,
}: VocabReviewEditableCardProps) {
    const [draft, setDraft] = useState<DraftState>(() => buildDraft(item));
    const [meaningDraftGroups, setMeaningDraftGroups] = useState<PosGroup[]>(() => buildMeaningDraftGroups(item, posGroups));
    const [isSaving, setIsSaving] = useState(false);
    const [isGraduating, setIsGraduating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resolvedPhonetic, setResolvedPhonetic] = useState("");

    const itemMeaningGroups = useMemo(
        () => buildMeaningDraftGroups(item, posGroups),
        [item, posGroups],
    );

    useEffect(() => {
        setDraft(buildDraft(item));
        setMeaningDraftGroups(itemMeaningGroups);
        setIsSaving(false);
        setIsGraduating(false);
        setError(null);
        setResolvedPhonetic("");
    }, [item, itemMeaningGroups]);

    const visibleExample = draft.source_sentence.trim() || draft.example.trim() || "";
    const visibleExampleField = draft.source_sentence.trim() || !draft.example.trim() ? "source_sentence" : "example";
    const saveDisabled = !normalizeWord(draft.word) || isSaving || isGraduating;
    const highlightedMeanings = useMemo(
        () => (Array.isArray(item.highlighted_meanings) ? item.highlighted_meanings : []),
        [item.highlighted_meanings],
    );
    const resolvedHighlightedMeanings = useMemo(
        () => resolveHighlightedMeaningsFromGroups(meaningDraftGroups, highlightedMeanings),
        [highlightedMeanings, meaningDraftGroups],
    );
    const normalizedHighlightedMeanings = useMemo(
        () => resolvedHighlightedMeanings.map(normalizeMeaningForMatch).filter(Boolean),
        [resolvedHighlightedMeanings],
    );
    const hasHighlightedWord = normalizedHighlightedMeanings.length > 0;
    const hasAiHighlight = highlightedMeanings.length > 0 && hasHighlightedWord;
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
            || serializeMeaningGroups(meaningDraftGroups) !== serializeMeaningGroups(itemMeaningGroups)
        );
    }, [draft, item, itemMeaningGroups, meaningDraftGroups]);

    const handleChange = (field: keyof DraftState, value: string) => {
        setDraft((current) => ({ ...current, [field]: value }));
        setError(null);
    };

    const handleMeaningChange = (groupIndex: number, meaningIndex: number, value: string) => {
        setMeaningDraftGroups((current) => current.map((group, currentGroupIndex) => {
            if (currentGroupIndex !== groupIndex) return group;
            return {
                ...group,
                meanings: group.meanings.map((meaning, currentMeaningIndex) => (
                    currentMeaningIndex === meaningIndex ? value : meaning
                )),
            };
        }));
        setError(null);
    };

    const handleCancel = () => {
        setDraft(buildDraft(item));
        setMeaningDraftGroups(itemMeaningGroups);
        setError(null);
        setIsSaving(false);
        setIsGraduating(false);
    };

    const buildPendingItem = (): VocabItem => {
        const normalizedMeaningGroups = normalizeMeaningGroups(meaningDraftGroups);
        const serializedTranslation = serializeMeaningGroups(normalizedMeaningGroups);
        return {
            ...item,
            word: normalizeWord(draft.word),
            phonetic: draft.phonetic.trim() || resolvedPhonetic.trim(),
            definition: item.definition?.trim() || "",
            translation: serializedTranslation || item.translation?.trim() || "",
            source_sentence: draft.source_sentence.trim(),
            example: draft.example.trim(),
            meaning_groups: normalizedMeaningGroups,
        };
    };

    const handleSave = async () => {
        if (saveDisabled) return;

        setIsSaving(true);
        setError(null);
        try {
            const nextItem = buildPendingItem();
            const saved = await updateVocabularyEntry(item.word, nextItem);
            onSaved(saved);
            setDraft(buildDraft(saved));
            setMeaningDraftGroups(buildMeaningDraftGroups(saved, posGroups));
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : "保存失败，请重试。";
            setError(message === "DUPLICATE_VOCAB_WORD" ? "这个词已经在生词本里了。" : "保存失败，请重试。");
        } finally {
            setIsSaving(false);
        }
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
        <div style={{ transform: "translateZ(15px)" }} className="relative z-20 w-full space-y-4">
            <div className={cn("grid gap-4", hasWordAnalysis ? "md:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.95fr)]" : "")}>
                <div
                    data-highlighted-word={hasHighlightedWord ? "true" : "false"}
                    data-highlight-source={hasAiHighlight ? "ai" : "none"}
                    className={cn(
                        "flex flex-col gap-3 rounded-[1.5rem] border border-white/28 bg-white/16 p-3 shadow-sm backdrop-blur-md",
                        hasHighlightedWord && "ring-1 ring-amber-200/85",
                    )}
                >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#345b46]/55">点击直接编辑</p>
                                {isGraduated ? (
                                    <span className="rounded-sm bg-[linear-gradient(180deg,transparent_0%,transparent_28%,rgba(250,204,21,0.46)_28%,rgba(250,204,21,0.46)_82%,transparent_82%)] px-1.5 py-0.5 text-[11px] font-bold text-[#7c5200]">
                                        已熟记
                                    </span>
                                ) : null}
                            </div>
                            <input
                                aria-label="编辑单词"
                                value={draft.word}
                                onChange={(event) => handleChange("word", event.target.value)}
                                className={cn(
                                    "w-full rounded-[1.2rem] border border-transparent bg-transparent px-2 py-2 font-newsreader text-[3.2rem] leading-[0.88] tracking-[-0.03em] text-[#1a3826] outline-none transition placeholder:text-[#1a3826]/35 focus:border-emerald-200/70 focus:bg-white/16 focus:ring-2 focus:ring-emerald-200/35 md:text-[4.3rem]",
                                    hasHighlightedWord && "bg-[linear-gradient(180deg,transparent_0%,transparent_52%,rgba(250,204,21,0.14)_52%,rgba(250,204,21,0.14)_79%,transparent_79%)]",
                                )}
                            />
                            <input
                                aria-label="编辑音标"
                                value={displayPhonetic}
                                onChange={(event) => {
                                    setResolvedPhonetic("");
                                    handleChange("phonetic", event.target.value);
                                }}
                                placeholder="音标待补充"
                                className="mt-2 w-full rounded-full border border-white/45 bg-white/32 px-3 py-1.5 text-sm font-medium text-[#345b46]/78 outline-none transition placeholder:text-[#345b46]/48 focus:border-emerald-200/75 focus:bg-white/54 focus:ring-2 focus:ring-emerald-200/35"
                            />
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 self-start">
                            {onGraduate ? (
                                <button
                                    type="button"
                                    onClick={handleGraduate}
                                    disabled={isSaving || isGraduating}
                                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-200/85 bg-[linear-gradient(180deg,transparent_0%,transparent_26%,rgba(250,204,21,0.44)_26%,rgba(250,204,21,0.58)_84%,transparent_84%)] px-4 py-2 text-sm font-bold text-[#7c5200] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isGraduating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    {isGraduating ? "毕业中..." : "熟记毕业"}
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => onPlayAudio(draft.word)}
                                className="liquid-glass-tap inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-200/50 bg-white/40 px-5 py-2 text-sm font-bold text-emerald-800 shadow-[inset_0_1px_rgba(255,255,255,0.8)] hover:bg-white/60"
                            >
                                <Volume2 className="h-4 w-4" />
                                发音
                            </button>
                        </div>
                    </div>
                </div>

                {hasWordAnalysis ? (
                    <div className="rounded-[1.4rem] border border-white/30 bg-white/20 p-4 shadow-sm backdrop-blur-md">
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#345b46]/60">词形解析</p>
                        {wordBreakdown.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {wordBreakdown.map((part) => (
                                    <span key={part} className="rounded-full border border-white/55 bg-white/60 px-3 py-1 text-xs font-bold text-[#345b46]">
                                        {part}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        {morphologyNotes.length > 0 ? (
                            <div className="mt-3 space-y-2">
                                {morphologyNotes.map((note) => (
                                    <p key={note} className="text-[13px] leading-relaxed text-[#1a3826]/78">
                                        {note}
                                    </p>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>

            <div className="rounded-[1.4rem] border border-white/30 bg-white/20 p-4 shadow-sm backdrop-blur-md">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#345b46]/60">释义</p>
                </div>

                {meaningDraftGroups.length > 0 ? (
                    <div className="columns-1 space-y-3 md:columns-2">
                        {meaningDraftGroups.map((group, groupIndex) => {
                            const groupKey = `${draft.word}-${group.pos}`;
                            const isExpanded = expandedPosGroups[groupKey] ?? false;
                            const visibleMeanings = isExpanded ? group.meanings : group.meanings.slice(0, 4);
                            const hasMore = group.meanings.length > 4;

                            return (
                                <div key={groupKey} className="mb-3 break-inside-avoid rounded-[1.2rem] border border-white/24 bg-white/12 p-4 transition hover:bg-white/20">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <span className="rounded-full border border-emerald-200/60 bg-white/60 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-emerald-800 drop-shadow-sm">
                                            {group.pos}
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        {visibleMeanings.map((meaning, meaningIndex) => {
                                            const isHighlighted = normalizedHighlightedMeanings.some((highlight) => meaningsLooselyMatch(meaning, highlight));

                                            return (
                                                <div
                                                    key={`${groupKey}-${meaningIndex}`}
                                                    data-highlighted-meaning={isHighlighted ? "true" : "false"}
                                                    data-highlight-source={isHighlighted ? "ai" : "none"}
                                                    className={cn(
                                                        "rounded-[1.05rem] border border-transparent p-2.5 transition",
                                                        isHighlighted
                                                            ? "bg-[linear-gradient(180deg,transparent_0%,transparent_24%,rgba(250,204,21,0.42)_24%,rgba(253,224,71,0.56)_82%,transparent_82%)]"
                                                            : "",
                                                    )}
                                                >
                                                    <div className={cn("flex items-start gap-3", isHighlighted && "pl-1")}>
                                                        <textarea
                                                            aria-label={`编辑释义 ${group.pos} ${meaningIndex + 1}`}
                                                            value={meaning}
                                                            onChange={(event) => handleMeaningChange(groupIndex, meaningIndex, event.target.value)}
                                                            rows={getTextareaRows(meaning, 1, 4)}
                                                            className={cn(
                                                                "w-full resize-none border-none bg-transparent p-0 text-[15px] font-medium leading-relaxed text-[#1a3826]/80 outline-none transition placeholder:text-[#1a3826]/35 focus:text-[#1a3826]",
                                                                isHighlighted && "font-semibold text-[#7c5200]",
                                                            )}
                                                        />
                                                    </div>
                                                </div>
                                                );
                                            })}
                                    </div>
                                    {hasMore ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onExpandedPosGroupsChange({ ...expandedPosGroups, [groupKey]: !isExpanded });
                                            }}
                                            className="mt-3 w-full text-center text-xs font-bold uppercase tracking-[0.12em] text-[#345b46]/60 transition-colors hover:text-emerald-700"
                                        >
                                            {isExpanded ? "收起" : `查看余下 ${group.meanings.length - 4} 个`}
                                        </button>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <textarea
                        aria-label="编辑释义"
                        value=""
                        readOnly
                        rows={2}
                        className="w-full resize-none rounded-[1.2rem] border border-transparent bg-transparent p-2 text-[15px] font-medium leading-relaxed text-[#1a3826]/55 outline-none"
                    />
                )}
            </div>

            <div className="rounded-[1.4rem] border border-white/30 bg-white/20 p-4 shadow-sm backdrop-blur-md">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#345b46]/60">例句</p>
                            {draft.source_sentence.trim() ? (
                                <span className="inline-flex rounded-full border border-emerald-200/50 bg-emerald-50/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                                    {item.source_label || "来源"}
                                </span>
                            ) : null}
                        </div>
                        <textarea
                            aria-label="编辑例句"
                            value={visibleExample}
                            onChange={(event) => handleChange(visibleExampleField, event.target.value)}
                            rows={getTextareaRows(visibleExample || "暂无例句。", 3, 8)}
                            placeholder="暂无例句。"
                            className="mt-2 w-full resize-none rounded-[1.2rem] border border-transparent bg-transparent px-2 py-2 font-newsreader text-[1.2rem] italic leading-relaxed text-[#1a3826] outline-none transition placeholder:text-[#1a3826]/35 focus:border-emerald-200/70 focus:bg-white/16 focus:ring-2 focus:ring-emerald-200/35"
                        />
                    </div>
                </div>
            </div>

            {(isDirty || error) ? (
                <div className="flex flex-col gap-3 rounded-[1.35rem] border border-white/38 bg-white/28 p-4 shadow-sm backdrop-blur-md md:flex-row md:items-center md:justify-between">
                    <p className={cn("text-sm font-medium", error ? "text-rose-600" : "text-[#345b46]/78")}>
                        {error || "你正在直接原地编辑，保存后继续背诵。"}
                    </p>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={isSaving}
                            className="rounded-2xl border border-white/55 bg-white/60 px-4 py-2.5 text-sm font-semibold text-[#345b46] transition hover:bg-white/80 disabled:opacity-60"
                        >
                            取消编辑
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saveDisabled}
                            className="inline-flex min-w-[118px] items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#34d399,#10b981)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_32px_-16px_rgba(16,185,129,0.8)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {isSaving ? "保存中..." : "保存修改"}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
