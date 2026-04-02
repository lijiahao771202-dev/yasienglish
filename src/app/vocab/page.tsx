"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { db, VocabItem } from '@/lib/db';
import { deleteVocabulary, saveVocabulary } from '@/lib/user-repository';
import { defaultVocabSourceLabel } from '@/lib/user-sync';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { ArrowRight, Brain, CalendarClock, Clock, Loader2, PencilLine, Plus, Search, Sparkles, Trash2, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { createEmptyCard, isCardGraduated, State } from '@/lib/fsrs';
import { VocabEditDialog } from '@/components/vocab/VocabEditDialog';

type AddWordFeedback = { type: "success" | "error"; text: string } | null;
type VocabFilterKey = "all" | "due" | "learning" | "recent" | "graduated";

const VOCAB_FILTERS: Array<{ key: VocabFilterKey; label: string; heading: string; emptyTitle: string; emptyHint: string }> = [
    { key: "all", label: "全部", heading: "All Words", emptyTitle: "你的词库还空着", emptyHint: "开始阅读或手动添加几个单词吧" },
    { key: "due", label: "待复习", heading: "Due To Review", emptyTitle: "当前没有待复习卡片", emptyHint: "先去读一点，再回来复习也不错" },
    { key: "learning", label: "学习中", heading: "In Progress", emptyTitle: "当前没有学习中的卡片", emptyHint: "新卡开始滚动后，这里就会热闹起来" },
    { key: "recent", label: "最近添加", heading: "Recently Added", emptyTitle: "最近还没有新加入的词卡", emptyHint: "去阅读里捞几个新词进来吧" },
    { key: "graduated", label: "已熟记", heading: "Graduated", emptyTitle: "还没有熟记毕业的卡片", emptyHint: "等你把一些词真正吃透，这里就会慢慢堆起来" },
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
                .filter((item) => (
                    (item.state === State.New || item.state === State.Learning || item.state === State.Relearning)
                    && item.due > now
                ))
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

function getStateMeta(state: number) {
    if (state === 0) {
        return {
            label: "New",
            className: "text-emerald-700 bg-emerald-100/60 ring-1 ring-emerald-300/60 shadow-[inset_0_1px_rgba(255,255,255,0.8)]",
            dot: "bg-emerald-500"
        };
    }
    if (state === 1) {
        return {
            label: "Learning",
            className: "text-amber-700 bg-amber-100/60 ring-1 ring-amber-300/60 shadow-[inset_0_1px_rgba(255,255,255,0.8)]",
            dot: "bg-amber-500"
        };
    }
    return {
        label: "Review",
        className: "text-sky-700 bg-sky-100/60 ring-1 ring-sky-300/60 shadow-[inset_0_1px_rgba(255,255,255,0.8)]",
        dot: "bg-sky-500"
    };
}

function VocabWordCard({
    item,
    now,
    onEdit,
    onDelete,
}: {
    item: VocabItem;
    now: number;
    onEdit: (item: VocabItem) => void;
    onDelete: (word: string) => void;
}) {
    const stateMeta = getStateMeta(item.state);
    const isDue = item.due <= now;
    const dueLabel = isDue
        ? "Due now"
        : new Date(item.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return (
        <motion.article
            whileHover={{ y: -6, scale: 1.015 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="group relative flex flex-col justify-between overflow-hidden rounded-[1.8rem] border border-white/40 bg-[linear-gradient(150deg,rgba(255,255,255,0.68),rgba(255,255,255,0.45))] px-5 py-5 shadow-[0_8px_32px_rgba(0,0,0,0.04)] ring-1 ring-black/5 backdrop-blur-[28px] backdrop-saturate-150 transition-all duration-300 hover:shadow-[0_20px_48px_-12px_rgba(16,185,129,0.18)] hover:border-white/60 hover:bg-[linear-gradient(150deg,rgba(255,255,255,0.85),rgba(255,255,255,0.6))]"
        >
            {/* Inner Glare / Specular highlight */}
            <div className="pointer-events-none absolute inset-[1px] rounded-[1.75rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] z-0" />

            <div className="relative z-10 flex items-start justify-between gap-4">
                <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest backdrop-blur-md", stateMeta.className)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full shadow-sm", stateMeta.dot)} />
                    {stateMeta.label}
                </div>
                
                {/* Actions: Hidden unless hovered */}
                <div className="flex items-center gap-1.5 opacity-0 transition-all duration-300 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0">
                    <button
                        onClick={() => onEdit(item)}
                        className="rounded-full border border-white/50 bg-white/50 p-1.5 text-stone-500 shadow-sm backdrop-blur-md hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
                        title="Edit"
                    >
                        <PencilLine className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={() => onDelete(item.word)}
                        className="rounded-full border border-white/50 bg-white/50 p-1.5 text-stone-500 shadow-sm backdrop-blur-md hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition-all"
                        title="Delete"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            <div className="relative z-10 mt-4 flex-1 space-y-2">
                <h3 className="font-newsreader text-[2.2rem] leading-none tracking-tight text-stone-900 drop-shadow-sm group-hover:text-emerald-950 transition-colors">
                    {item.word}
                </h3>
                
                {item.definition && (
                    <p className="line-clamp-2 text-[14px] font-medium leading-relaxed text-stone-700">
                        {item.definition}
                    </p>
                )}
                {item.translation && (
                    <p className="line-clamp-1 text-[13px] text-stone-600/90 font-medium">
                        {item.translation}
                    </p>
                )}
                
                {item.source_sentence && (
                    <div className="mt-3 overflow-hidden rounded-[1.1rem] border border-white/40 bg-white/30 p-3 shadow-[inset_0_2px_8px_rgba(0,0,0,0.02)] backdrop-blur-sm">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#5d8a72]">
                            {item.source_label || defaultVocabSourceLabel(item.source_kind)}
                        </p>
                        <p className="mt-1.5 text-[13px] italic leading-relaxed text-stone-700 line-clamp-2">
                            &ldquo;{item.source_sentence}&rdquo;
                        </p>
                    </div>
                )}
            </div>

            <div className="relative z-10 mt-5 flex items-center justify-between border-t border-black/[0.04] pt-3">
                <span className={cn(
                    "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                    isDue ? "text-amber-600" : "text-stone-500/80"
                )}>
                    {isDue ? <CalendarClock className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                    {dueLabel}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                    REPS {item.reps}
                </span>
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

    useEffect(() => {
        document.documentElement.setAttribute('data-bg-theme', 'forest-glass');
        return () => {
            const saved = localStorage.getItem('yasi_bg_theme') || 'rose-milk';
            document.documentElement.setAttribute('data-bg-theme', saved);
        };
    }, []);

    const vocabQuery = useLiveQuery(() => db.vocabulary.toArray());
    const vocab = useMemo(() => vocabQuery ?? [], [vocabQuery]);
    const searchQuery = search.trim().toLowerCase();
    const now = Date.now();
    const activeFilterMeta = VOCAB_FILTERS.find((filter) => filter.key === activeFilter) ?? VOCAB_FILTERS[3];

    // Stats
    const totalWords = vocab.length;
    const dueWords = vocab.filter((w) => w.due <= now).length;

    const filteredVocab = useMemo(() => {
        if (searchQuery) {
            return vocab
                .filter((item) => item.word.toLowerCase().includes(searchQuery))
                .sort(compareByDueThenTimestamp);
        }
        return filterVocabularyByCategory(vocab, activeFilter, now);
    }, [activeFilter, now, searchQuery, vocab]);

    // Delete handler
    const handleDelete = async (word: string) => {
        if (confirm(`Delete "${word}"?`)) {
            await deleteVocabulary(word);
        }
    };

    const handleManualAddWord = async (e: React.FormEvent) => {
        e.preventDefault();
        const word = manualWord.trim();

        if (!word) return;

        const exists = vocab.some(item => item.word.toLowerCase() === word.toLowerCase());
        if (exists) {
            setAddWordFeedback({ type: "error", text: "已在生词本中" });
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
            
            // Auto clear feedback after 3s
            setTimeout(() => setAddWordFeedback(null), 3000);
        } catch (error) {
            console.error("Manual add word failed:", error);
            setAddWordFeedback({ type: "error", text: "AI 词卡生成失败，请重试" });
        } finally {
            setIsAddingWord(false);
        }
    };

    return (
        <main className="theme-forest-glass relative min-h-screen overflow-hidden bg-[#eef3ef] pb-24 text-stone-800">
            {/* Rich Ethereal Forest Background */}
            <div className="fixed inset-0 z-0">
                <img
                    src="https://images.unsplash.com/photo-1542273917363-3b1817f69a56?q=80&w=2670&auto=format&fit=crop"
                    alt="Lush green forest canopy"
                    className="h-full w-full object-cover object-[center_30%] scale-105"
                    loading="lazy"
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.1),transparent_50%),linear-gradient(180deg,rgba(240,245,241,0.7),rgba(235,245,238,0.9)_60%,#eef3ef_90%)]" />
                <div className="absolute inset-0 backdrop-blur-[48px] backdrop-saturate-[1.1] mask-image-[linear-gradient(to_bottom,black_0%,black_100%)]" />
            </div>

            {/* Header Section */}
            <div className="relative z-10 mx-auto mt-8 max-w-6xl px-5 sm:px-6">
                <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
                    <div className="flex flex-col gap-2">
                        <Link href="/read" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#4b775c] transition-all hover:text-emerald-700 hover:tracking-[0.15em]">
                            <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                            Reading
                        </Link>
                        <h1 className="font-newsreader text-[3.8rem] font-medium leading-[0.9] tracking-tight text-[#163020] drop-shadow-sm">
                            Word Vault
                        </h1>
                        <div className="mt-1 flex items-center gap-3">
                            <span className="rounded-full border border-emerald-900/10 bg-emerald-800/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#345b46] shadow-[inset_0_1px_rgba(255,255,255,0.6)] backdrop-blur-md">
                                {totalWords} Collected
                            </span>
                            <span className={cn(
                                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-[inset_0_1px_rgba(255,255,255,0.6)] backdrop-blur-md transition-all",
                                dueWords > 0 
                                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" 
                                    : "border-emerald-900/10 bg-emerald-800/5 text-[#345b46]"
                            )}>
                                <Sparkles className="h-3 w-3" /> {dueWords} Due
                            </span>
                        </div>
                    </div>

                    <Link
                        href="/vocab/review"
                        className={cn(
                            "group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-[1.4rem] px-8 py-4 text-[15px] font-bold tracking-wide transition-all duration-400 active:scale-95",
                            dueWords > 0
                                ? "bg-[linear-gradient(135deg,#10b981,#059669)] text-white shadow-[0_16px_32px_-8px_rgba(16,185,129,0.5),inset_0_1px_rgba(255,255,255,0.4)] hover:shadow-[0_20px_40px_-8px_rgba(16,185,129,0.6),inset_0_1px_rgba(255,255,255,0.5)] hover:bg-[linear-gradient(135deg,#34d399,#10b981)]"
                                : "cursor-not-allowed border border-white/50 bg-white/40 text-emerald-900/40 shadow-[inset_0_1px_rgba(255,255,255,0.8)] backdrop-blur-xl"
                        )}
                        onClick={(e) => dueWords === 0 && e.preventDefault()}
                    >
                        {dueWords > 0 && <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.3)_50%,transparent)] -translate-x-full group-hover:animate-[shimmer_1.2s_infinite]" />}
                        <Brain className="h-5 w-5" />
                        Start Review
                    </Link>
                </div>
            </div>

            {/* Toolbar */}
            <div className="sticky top-0 z-40 mx-auto mt-8 max-w-6xl px-5 sm:px-6 pb-4 pt-1">
                <div className="flex flex-col gap-3 rounded-[1.6rem] border border-white/60 bg-white/30 p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.06),inset_0_1px_rgba(255,255,255,0.8)] ring-1 ring-black/[0.03] backdrop-blur-[32px] backdrop-saturate-200">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        {/* Search Bar */}
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#345b46]/70" />
                            <input
                                type="text"
                                placeholder="搜索你的森林词库..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-12 w-full rounded-xl border border-white/40 bg-white/40 pl-11 pr-4 text-[14px] font-medium text-[#163020] placeholder:text-[#345b46]/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-emerald-300 focus:bg-white/70 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                            />
                        </div>

                        {/* Divider for desktop */}
                        <div className="hidden h-8 w-px bg-emerald-900/10 sm:block" />

                        {/* Quick Add Bar */}
                        <form onSubmit={handleManualAddWord} className="flex h-12 flex-1 sm:max-w-[280px] lg:max-w-[340px] items-center gap-2 rounded-xl border border-white/40 bg-white/40 pl-4 pr-1.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus-within:border-emerald-300 focus-within:bg-white/70 focus-within:ring-4 focus-within:ring-emerald-500/10">
                            <GraduationCap className="h-4 w-4 shrink-0 text-[#345b46]/70" />
                            <input
                                type="text"
                                value={manualWord}
                                onChange={(e) => setManualWord(e.target.value)}
                                placeholder="手动添加生词..."
                                className="h-full flex-1 bg-transparent px-2 text-[14px] font-medium text-[#163020] placeholder:text-[#345b46]/50 focus:outline-none"
                            />
                            <button
                                type="submit"
                                disabled={isAddingWord || !manualWord.trim()}
                                className="inline-flex h-9 w-14 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#059669,#047857)] text-white shadow-[0_4px_12px_rgba(5,150,105,0.3),inset_0_1px_rgba(255,255,255,0.3)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none disabled:text-stone-50"
                            >
                                {isAddingWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            </button>
                        </form>
                    </div>

                    <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <div className="flex min-w-max items-center gap-2">
                            {VOCAB_FILTERS.map((filter) => (
                                <button
                                    key={filter.key}
                                    type="button"
                                    onClick={() => setActiveFilter(filter.key)}
                                    className={cn(
                                        "inline-flex h-10 items-center rounded-full border px-4 text-sm font-bold tracking-wide transition-all",
                                        activeFilter === filter.key
                                            ? "border-emerald-400/55 bg-[linear-gradient(135deg,rgba(16,185,129,0.95),rgba(5,150,105,0.88))] text-white shadow-[0_10px_24px_-10px_rgba(16,185,129,0.65)]"
                                            : "border-white/45 bg-white/36 text-[#345b46]/82 shadow-[inset_0_1px_rgba(255,255,255,0.75)] hover:border-emerald-200/60 hover:bg-white/55"
                                    )}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                
                {/* Add Feedback Notification */}
                {addWordFeedback && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        className={cn(
                            "absolute left-1/2 top-full mt-3 -translate-x-1/2 rounded-full px-5 py-2 text-[12px] font-bold uppercase tracking-wider shadow-xl backdrop-blur-xl",
                            addWordFeedback.type === "success" 
                                ? "bg-emerald-500/90 border border-emerald-400 text-white" 
                                : "bg-rose-500/90 border border-rose-400 text-white"
                        )}
                    >
                        {addWordFeedback.text}
                    </motion.div>
                )}
            </div>

            {/* Grid Area */}
            <div className="relative z-10 mx-auto mt-6 max-w-6xl px-5 sm:px-6">
                {!searchQuery && filteredVocab.length > 0 && (
                    <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#345b46]">
                        <Clock className="h-3.5 w-3.5" />
                        {activeFilterMeta.heading} ({filteredVocab.length})
                    </div>
                )}
                {searchQuery && (
                    <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#345b46]">
                        <Search className="h-3.5 w-3.5" />
                        Search Results ({filteredVocab.length})
                    </div>
                )}

                {filteredVocab.length > 0 ? (
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filteredVocab.map((item) => (
                            <VocabWordCard
                                key={item.word}
                                item={item}
                                now={now}
                                onEdit={setEditingItem}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="mt-12 flex flex-col items-center justify-center text-stone-400">
                        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-white/50 bg-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.05),inset_0_1px_rgba(255,255,255,0.7)] backdrop-blur-2xl">
                            <Search className="h-10 w-10 text-emerald-900/30" />
                        </div>
                        <p className="text-[16px] font-bold text-[#345b46]">
                            {searchQuery ? "未找到对应卡片" : activeFilterMeta.emptyTitle}
                        </p>
                        {searchQuery ? (
                            <p className="mt-1 text-sm font-medium text-emerald-900/60">换个关键词试试吧</p>
                        ) : (
                            <p className="mt-1 text-sm font-medium text-emerald-900/60">{activeFilterMeta.emptyHint}</p>
                        )}
                    </div>
                )}
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
