"use client";

import React, { useMemo, useRef, useState } from "react";
import { db, VocabItem } from "@/lib/db";
import { deleteVocabulary, saveVocabulary } from "@/lib/user-repository";
import { defaultVocabSourceLabel } from "@/lib/user-sync";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import {
    ArrowLeft,
    Brain,
    Clock,
    GraduationCap,
    Loader2,
    PencilLine,
    Plus,
    Search,
    Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { createEmptyCard, isCardGraduated, State } from "@/lib/fsrs";
import { VocabEditDialog } from "@/components/vocab/VocabEditDialog";

type AddWordFeedback = { type: "success" | "error"; text: string } | null;
type VocabFilterKey = "all" | "due" | "learning" | "recent" | "graduated";

const VOCAB_FILTERS: Array<{
    key: VocabFilterKey;
    label: string;
    emptyTitle: string;
    emptyHint: string;
}> = [
    { key: "all", label: "全部", emptyTitle: "这里还没有词卡", emptyHint: "先从阅读里捞一些词，卡册就会慢慢铺满。" },
    { key: "recent", label: "最近添加", emptyTitle: "最近还没有新词", emptyHint: "去读一篇文章，顺手把新词收进来吧。" },
    { key: "due", label: "待复习", emptyTitle: "今天没有待复习卡片", emptyHint: "这会儿可以放心去读新内容，稍后再回来刷。" },
    { key: "learning", label: "学习中", emptyTitle: "当前没有学习中的词卡", emptyHint: "新的词卡开始滚动后，这里就会热闹起来。" },
    { key: "graduated", label: "已掌握", emptyTitle: "还没有毕业词卡", emptyHint: "等你把一些词真正记牢，这里就会慢慢积累起来。" },
];

function compareByDueThenTimestamp(a: VocabItem, b: VocabItem) {
    if (a.due !== b.due) return a.due - b.due;
    return b.timestamp - a.timestamp;
}

function filterVocabularyByCategory(vocab: VocabItem[], filter: VocabFilterKey, now: number) {
    switch (filter) {
        case "all":
            return [...vocab].sort(compareByDueThenTimestamp);
        case "due":
            return vocab.filter((item) => item.due <= now).sort(compareByDueThenTimestamp);
        case "learning":
            return vocab
                .filter(
                    (item) =>
                        (item.state === State.New || item.state === State.Learning || item.state === State.Relearning) &&
                        item.due > now,
                )
                .sort(compareByDueThenTimestamp);
        case "recent":
            return [...vocab]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 12);
        case "graduated":
            return vocab.filter((item) => isCardGraduated(item)).sort(compareByDueThenTimestamp);
        default:
            return [...vocab].sort(compareByDueThenTimestamp);
    }
}

function formatShortDate(timestamp: number) {
    return new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
    }).format(timestamp);
}

function getStateMeta(item: VocabItem) {
    if (item.due <= Date.now()) {
        return {
            label: "REVIEW",
            badgeClassName: "border-[#46aaf6] bg-[#eef8ff] text-[#1180d9]",
            stickerClassName: "bg-[#fff176]",
        };
    }

    if (isCardGraduated(item)) {
        return {
            label: "MASTER",
            badgeClassName: "border-[#99d96c] bg-[#f1fbe5] text-[#4a8a19]",
            stickerClassName: "bg-[#ffc4de]",
        };
    }

    if (item.state === State.New) {
        return {
            label: "NEW",
            badgeClassName: "border-[#ff91bd] bg-[#fff0f7] text-[#d94884]",
            stickerClassName: "bg-[#aee8ff]",
        };
    }

    if (item.state === State.Learning || item.state === State.Relearning) {
        return {
            label: "LEARN",
            badgeClassName: "border-[#ffcb77] bg-[#fff6de] text-[#be7a08]",
            stickerClassName: "bg-[#ffd986]",
        };
    }

    return {
        label: "CARD",
        badgeClassName: "border-[#d3b6ff] bg-[#f6f0ff] text-[#7b45e7]",
        stickerClassName: "bg-[#ffc4de]",
    };
}

function getTiltClass(index: number) {
    const tilts = [
        "rotate-[-1.2deg]",
        "rotate-[0.8deg]",
        "rotate-[-0.6deg]",
        "rotate-[1.1deg]",
    ];
    return tilts[index % tilts.length];
}

function VocabWordCard({
    item,
    index,
    now,
    onEdit,
    onDelete,
}: {
    item: VocabItem;
    index: number;
    now: number;
    onEdit: (item: VocabItem) => void;
    onDelete: (word: string) => void;
}) {
    const stateMeta = getStateMeta(item);
    const sourceLabel = item.source_label || defaultVocabSourceLabel(item.source_kind);
    const dueLabel = item.due <= now ? "今天复习" : formatShortDate(item.due);

    return (
        <motion.article
            whileHover={{ y: -5, rotate: 0, scale: 1.01 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className={cn(
                "group relative flex min-h-[300px] flex-col rounded-[1.7rem] border-[3px] border-[#17120d] bg-[#fffdf7] p-4 shadow-[0_6px_0_rgba(23,18,13,0.14)] transition-all duration-200",
                "hover:shadow-[0_10px_0_rgba(23,18,13,0.16)]",
                getTiltClass(index),
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            "inline-flex rounded-full border-2 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em]",
                            stateMeta.badgeClassName,
                        )}
                    >
                        {stateMeta.label}
                    </span>
                    {item.phonetic ? (
                        <span className="text-[10px] font-semibold tracking-[0.16em] text-[#8a7f72]">
                            /{item.phonetic}/
                        </span>
                    ) : null}
                </div>

                <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <button
                        onClick={() => onEdit(item)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#17120d] bg-white text-[#17120d] shadow-[0_2px_0_rgba(23,18,13,0.16)] transition hover:bg-[#f3efe6]"
                        title="编辑"
                    >
                        <PencilLine className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={() => onDelete(item.word)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#17120d] bg-[#fff0f3] text-[#ca3c69] shadow-[0_2px_0_rgba(23,18,13,0.16)] transition hover:bg-[#ffd6df]"
                        title="删除"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            <div className="mt-4 flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="font-newsreader text-[2.35rem] leading-none tracking-tight text-[#17120d]">
                            {item.word}
                        </h3>
                        {item.translation ? (
                            <p className="mt-2 text-[14px] font-bold text-[#bf3a5a]">{item.translation}</p>
                        ) : null}
                    </div>
                    <span
                        className={cn(
                            "mt-1 inline-flex h-6 min-w-6 items-center justify-center rounded-[0.6rem] border-2 border-[#17120d] px-1.5 text-[11px] font-black text-[#17120d]",
                            stateMeta.stickerClassName,
                        )}
                    >
                        {item.due <= now ? "!" : "•"}
                    </span>
                </div>

                {item.definition ? (
                    <p className="mt-3 line-clamp-3 text-[13px] leading-6 text-[#4f4336]">{item.definition}</p>
                ) : null}

                <div className="mt-4 rounded-[1rem] border-2 border-dashed border-[#d4c5b0] bg-[#f7f1e6] px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7f7367]">{sourceLabel}</p>
                    <p className="mt-2 line-clamp-3 text-[13px] italic leading-6 text-[#5e5042]">
                        {item.source_sentence ? `“${item.source_sentence}”` : "还没有例句，等你在阅读里继续把它养大。"}
                    </p>
                </div>
            </div>

            <div className="mt-5 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.16em] text-[#7d6e61]">
                <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {dueLabel}
                </span>
                <span>REPS {item.reps}</span>
            </div>
        </motion.article>
    );
}

export default function VocabDashboard() {
    const [search, setSearch] = useState("");
    const [manualWord, setManualWord] = useState("");
    const [isAddingWord, setIsAddingWord] = useState(false);
    const [addWordFeedback, setAddWordFeedback] = useState<AddWordFeedback>(null);
    const [editingItem, setEditingItem] = useState<VocabItem | null>(null);
    const [activeFilter, setActiveFilter] = useState<VocabFilterKey>("recent");
    const manualInputRef = useRef<HTMLInputElement>(null);

    const vocabQuery = useLiveQuery(() => db.vocabulary.toArray());
    const vocab = useMemo(() => vocabQuery ?? [], [vocabQuery]);
    const searchQuery = search.trim().toLowerCase();
    const now = Date.now();
    const activeFilterMeta = VOCAB_FILTERS.find((filter) => filter.key === activeFilter) ?? VOCAB_FILTERS[1];

    const totalWords = vocab.length;
    const dueWords = vocab.filter((item) => item.due <= now).length;
    const masteredWords = vocab.filter((item) => isCardGraduated(item)).length;

    const filterCounts = useMemo(
        () =>
            VOCAB_FILTERS.reduce<Record<VocabFilterKey, number>>((acc, filter) => {
                acc[filter.key] = filterVocabularyByCategory(vocab, filter.key, now).length;
                return acc;
            }, { all: 0, due: 0, learning: 0, recent: 0, graduated: 0 }),
        [now, vocab],
    );

    const filteredVocab = useMemo(() => {
        if (searchQuery) {
            return vocab
                .filter((item) => {
                    const word = item.word.toLowerCase();
                    const translation = item.translation?.toLowerCase() ?? "";
                    const definition = item.definition?.toLowerCase() ?? "";
                    return word.includes(searchQuery) || translation.includes(searchQuery) || definition.includes(searchQuery);
                })
                .sort(compareByDueThenTimestamp);
        }

        return filterVocabularyByCategory(vocab, activeFilter, now);
    }, [activeFilter, now, searchQuery, vocab]);

    const handleDelete = async (word: string) => {
        if (confirm(`Delete "${word}"?`)) {
            await deleteVocabulary(word);
        }
    };

    const handleManualAddWord = async (e: React.FormEvent) => {
        e.preventDefault();
        const word = manualWord.trim();

        if (!word) return;

        const exists = vocab.some((item) => item.word.toLowerCase() === word.toLowerCase());
        if (exists) {
            setAddWordFeedback({ type: "error", text: "这个单词已经在卡册里了" });
            return;
        }

        setIsAddingWord(true);
        setAddWordFeedback(null);

        try {
            const aiResponse = await fetch("/api/ai/define", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ word }),
            });
            const aiData = aiResponse.ok ? await aiResponse.json() : null;

            if (!aiData?.context_meaning) {
                throw new Error("AI_DEFINE_REQUIRED");
            }

            const base = createEmptyCard(word);
            const card: VocabItem = {
                word,
                definition: aiData.context_meaning.definition || "",
                translation: aiData.context_meaning.translation || "",
                context: "",
                example: "",
                phonetic: aiData?.phonetic || "",
                meaning_groups: Array.isArray(aiData?.meaning_groups) ? aiData.meaning_groups : [],
                highlighted_meanings: Array.isArray(aiData?.highlighted_meanings) ? aiData.highlighted_meanings : [],
                word_breakdown: Array.isArray(aiData?.word_breakdown) ? aiData.word_breakdown : [],
                morphology_notes: Array.isArray(aiData?.morphology_notes) ? aiData.morphology_notes : [],
                source_kind: "manual",
                source_label: "手动添加",
                source_sentence: "",
                source_note: "",
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
            setManualWord("");
            setAddWordFeedback({ type: "success", text: `已添加 ${word}` });
            setTimeout(() => setAddWordFeedback(null), 3000);
        } catch (error) {
            console.error("Manual add word failed:", error);
            setAddWordFeedback({ type: "error", text: "AI 词卡生成失败，请重试" });
        } finally {
            setIsAddingWord(false);
        }
    };

    return (
        <main className="min-h-screen bg-[#f6efdf] pb-20 text-[#17120d]">
            <div className="border-b-2 border-[#17120d] bg-[#fbf5e8]">
                <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/read"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[0.7rem] border-2 border-[#17120d] bg-white shadow-[0_2px_0_rgba(23,18,13,0.16)] transition hover:-translate-y-0.5"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                        <span className="inline-flex rounded-full border-2 border-[#17120d] bg-[#c53f82] px-3 py-1 text-[11px] font-black tracking-[0.14em] text-white">
                            生词卡册
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] font-bold text-[#17120d]">
                        <span>温柔复习</span>
                        <span className="h-7 w-7 rounded-full border-2 border-[#17120d] bg-[#17120d]" />
                    </div>
                </div>
            </div>

            <div className="relative overflow-hidden">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(254,224,179,0.45),transparent_28%),radial-gradient(circle_at_top_right,rgba(180,234,229,0.5),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(191,219,254,0.28),transparent_26%)]" />

                <div className="relative mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h1 className="text-[2.8rem] font-black tracking-tight text-[#17120d] sm:text-[3.6rem]">生词本</h1>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <span className="inline-flex items-center gap-2 rounded-full border-2 border-[#17120d] bg-white px-3 py-1.5 text-[12px] font-black text-[#17120d] shadow-[0_2px_0_rgba(23,18,13,0.12)]">
                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#ff8cbb] text-[10px] text-white">□</span>
                                    已收录 {totalWords}
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-full border-2 border-[#17120d] bg-white px-3 py-1.5 text-[12px] font-black text-[#17120d] shadow-[0_2px_0_rgba(23,18,13,0.12)]">
                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#b7f0d4] text-[10px] text-[#17120d]">⟳</span>
                                    待复习 {dueWords}
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-full border-2 border-[#17120d] bg-white px-3 py-1.5 text-[12px] font-black text-[#17120d] shadow-[0_2px_0_rgba(23,18,13,0.12)]">
                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#ffe289] text-[10px] text-[#17120d]">★</span>
                                    已掌握 {masteredWords}
                                </span>
                            </div>
                        </div>

                        <Link
                            href="/vocab/review"
                            className={cn(
                                "inline-flex h-14 items-center justify-center gap-2 rounded-[1.1rem] border-[3px] border-[#17120d] px-8 text-[16px] font-black shadow-[0_4px_0_rgba(23,18,13,0.2)] transition hover:-translate-y-0.5 active:translate-y-0",
                                dueWords > 0
                                    ? "bg-[#ffcd2e] text-[#17120d]"
                                    : "cursor-not-allowed bg-[#efe5c8] text-[#8e806d]",
                            )}
                            onClick={(e) => dueWords === 0 && e.preventDefault()}
                        >
                            <Brain className="h-5 w-5" />
                            开始复习
                        </Link>
                    </div>

                    <section className="mt-8 rounded-[1.8rem] border-[3px] border-[#17120d] bg-[#fffaf0] p-4 shadow-[0_8px_0_rgba(23,18,13,0.1)] sm:p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                            <label className="relative block flex-1">
                                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#675846]" />
                                <input
                                    type="text"
                                    placeholder="搜索我的单词卡..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="h-14 w-full rounded-[1.2rem] border-[3px] border-[#17120d] bg-white pl-12 pr-4 text-[15px] font-semibold text-[#17120d] outline-none placeholder:text-[#9d8e7c] focus:bg-[#fffdf8]"
                                />
                            </label>

                            <form
                                onSubmit={handleManualAddWord}
                                className="flex items-center gap-3 lg:w-[360px]"
                            >
                                <div className="flex h-14 flex-1 items-center gap-2 rounded-[1.2rem] border-[3px] border-[#17120d] bg-white px-4">
                                    <GraduationCap className="h-4 w-4 text-[#675846]" />
                                    <input
                                        ref={manualInputRef}
                                        type="text"
                                        value={manualWord}
                                        onChange={(e) => setManualWord(e.target.value)}
                                        placeholder="手动添加生词"
                                        className="h-full flex-1 bg-transparent text-[15px] font-semibold text-[#17120d] outline-none placeholder:text-[#9d8e7c]"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isAddingWord || !manualWord.trim()}
                                    className="inline-flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[#17120d] bg-[#f36ba8] text-[#17120d] shadow-[0_4px_0_rgba(23,18,13,0.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#f6c6d9] disabled:text-[#8e806d]"
                                >
                                    {isAddingWord ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                                </button>
                            </form>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                            {VOCAB_FILTERS.map((filter) => {
                                const isActive = activeFilter === filter.key;
                                const count = filterCounts[filter.key];

                                return (
                                    <button
                                        key={filter.key}
                                        type="button"
                                        onClick={() => setActiveFilter(filter.key)}
                                        className={cn(
                                            "inline-flex items-center gap-2 rounded-full border-[3px] px-4 py-2 text-[13px] font-black transition",
                                            isActive
                                                ? "border-[#17120d] bg-[#fffdf7] text-[#17120d] shadow-[0_3px_0_rgba(23,18,13,0.15)]"
                                                : "border-[#17120d] bg-[#f4ead4] text-[#5f5448]",
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "h-2.5 w-2.5 rounded-full",
                                                isActive ? "bg-[#78ddd0]" : "bg-[#d3cdc3]",
                                            )}
                                        />
                                        {filter.label}
                                        {count > 0 ? (
                                            <span className="inline-flex min-w-5 items-center justify-center rounded-full border-2 border-[#17120d] bg-white px-1.5 text-[10px] leading-4 text-[#d33b63]">
                                                {count}
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>

                        {addWordFeedback ? (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={cn(
                                    "mt-4 inline-flex rounded-full border-[3px] px-4 py-2 text-[12px] font-black shadow-[0_3px_0_rgba(23,18,13,0.14)]",
                                    addWordFeedback.type === "success"
                                        ? "border-[#17120d] bg-[#baf0cf] text-[#17120d]"
                                        : "border-[#17120d] bg-[#ffd4df] text-[#17120d]",
                                )}
                            >
                                {addWordFeedback.text}
                            </motion.div>
                        ) : null}
                    </section>

                    <section className="mt-8 rounded-[2rem] border-[3px] border-[#17120d] bg-[#fbf7ec] p-4 shadow-[0_8px_0_rgba(23,18,13,0.1)] sm:p-6">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-[12px] font-black uppercase tracking-[0.24em] text-[#6a5c4e]">
                                    {searchQuery ? "Search Result" : "Card Album"}
                                </p>
                                <h2 className="mt-2 text-2xl font-black text-[#17120d]">
                                    {searchQuery ? `找到 ${filteredVocab.length} 张相关词卡` : activeFilterMeta.label}
                                </h2>
                            </div>
                            <p className="max-w-xl text-sm leading-6 text-[#756858]">
                                {searchQuery
                                    ? "可以直接搜索英文单词、中文释义，或者定义里的关键词。"
                                    : activeFilterMeta.emptyHint}
                            </p>
                        </div>

                        {filteredVocab.length > 0 ? (
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                                {filteredVocab.map((item, index) => (
                                    <VocabWordCard
                                        key={item.word}
                                        item={item}
                                        index={index}
                                        now={now}
                                        onEdit={setEditingItem}
                                        onDelete={handleDelete}
                                    />
                                ))}

                                {!searchQuery ? (
                                    <button
                                        type="button"
                                        onClick={() => manualInputRef.current?.focus()}
                                        className="flex min-h-[300px] flex-col items-center justify-center rounded-[1.7rem] border-[3px] border-dashed border-[#b8aa97] bg-[#f8f1e4] px-6 py-8 text-center shadow-[inset_0_0_0_2px_rgba(255,255,255,0.5)] transition hover:border-[#17120d] hover:bg-[#fff7ea]"
                                    >
                                        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[#17120d] bg-white text-[#17120d]">
                                            <Plus className="h-6 w-6" />
                                        </span>
                                        <p className="mt-5 text-xl font-black text-[#17120d]">再添一张新卡</p>
                                        <p className="mt-2 max-w-[16rem] text-sm leading-6 text-[#7d6e61]">
                                            点这里直接跳到添加输入框，把今天遇到的新词继续收进卡册里。
                                        </p>
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            <div className="rounded-[1.7rem] border-[3px] border-dashed border-[#b8aa97] bg-[#fffaf2] px-6 py-14 text-center">
                                <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#17120d] bg-white">
                                    <Search className="h-7 w-7 text-[#17120d]" />
                                </div>
                                <h3 className="mt-5 text-2xl font-black text-[#17120d]">
                                    {searchQuery ? "没有找到匹配的词卡" : activeFilterMeta.emptyTitle}
                                </h3>
                                <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[#7d6e61]">
                                    {searchQuery ? "换一个关键词试试，或者手动把这个词加进来。" : activeFilterMeta.emptyHint}
                                </p>
                                {!searchQuery ? (
                                    <button
                                        type="button"
                                        onClick={() => manualInputRef.current?.focus()}
                                        className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-full border-[3px] border-[#17120d] bg-[#ffd873] px-5 text-sm font-black text-[#17120d] shadow-[0_4px_0_rgba(23,18,13,0.18)]"
                                    >
                                        <Plus className="h-4 w-4" />
                                        添加第一张词卡
                                    </button>
                                ) : null}
                            </div>
                        )}
                    </section>
                </div>
            </div>

            <VocabEditDialog
                open={Boolean(editingItem)}
                item={editingItem}
                onClose={() => setEditingItem(null)}
                onSaved={(nextItem) => setEditingItem(nextItem)}
            />
        </main>
    );
}
