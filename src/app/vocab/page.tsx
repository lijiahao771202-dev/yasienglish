"use client";

import React, { useMemo, useState } from 'react';
import { db, VocabItem } from '@/lib/db';
import { deleteVocabulary, saveVocabulary } from '@/lib/user-repository';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { ArrowRight, BookOpen, Brain, CalendarClock, Clock, Loader2, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { createEmptyCard } from '@/lib/fsrs';
import { GlassCard } from '@/components/ui/GlassCard';

type AddWordFeedback = { type: "success" | "error"; text: string } | null;

function getStateMeta(state: number) {
    if (state === 0) {
        return {
            label: "New",
            className: "border-sky-200/70 bg-sky-100/75 text-sky-700",
        };
    }
    if (state === 1) {
        return {
            label: "Learning",
            className: "border-amber-200/70 bg-amber-100/75 text-amber-700",
        };
    }
    return {
        label: "Review",
        className: "border-emerald-200/70 bg-emerald-100/75 text-emerald-700",
    };
}

function VocabWordCard({
    item,
    onDelete,
}: {
    item: VocabItem;
    onDelete: (word: string) => void;
}) {
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const mouseX = useSpring(x, { stiffness: 380, damping: 42 });
    const mouseY = useSpring(y, { stiffness: 380, damping: 42 });
    const rotateX = useTransform(mouseY, [-180, 180], [7, -7]);
    const rotateY = useTransform(mouseX, [-180, 180], [-7, 7]);
    const glare = useMotionTemplate`radial-gradient(320px circle at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.22), transparent 45%)`;
    const stateMeta = getStateMeta(item.state);

    const onMouseMove = ({ currentTarget, clientX, clientY }: React.MouseEvent) => {
        const rect = currentTarget.getBoundingClientRect();
        x.set(clientX - rect.left - rect.width / 2);
        y.set(clientY - rect.top - rect.height / 2);
    };

    const onMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    const dueLabel = item.due <= Date.now()
        ? "Due now"
        : new Date(item.due).toLocaleDateString();

    return (
        <motion.article
            style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            className="group relative min-h-[220px] cursor-default rounded-[2rem]"
        >
            <div className="absolute inset-0 rounded-[2rem] border border-white/35 bg-gradient-to-br from-white/40 via-white/18 to-rose-100/25 shadow-[0_24px_52px_-34px_rgba(15,23,42,0.5)] backdrop-blur-2xl" />
            <div className="absolute inset-[1px] rounded-[1.95rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]" />

            <div style={{ transform: "translateZ(22px)" }} className="relative z-20 flex h-full flex-col justify-between rounded-[2rem] p-5">
                <div className="flex items-start justify-between gap-4">
                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", stateMeta.className)}>
                        {stateMeta.label}
                    </span>
                    <button
                        onClick={() => onDelete(item.word)}
                        className="rounded-full border border-white/30 bg-white/30 p-2 text-stone-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                        title="Delete"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-3">
                    <h3 className="font-newsreader text-[2.2rem] leading-none tracking-tight text-stone-900">{item.word}</h3>
                    {item.definition && (
                        <p className="line-clamp-2 text-[15px] leading-relaxed text-stone-700">{item.definition}</p>
                    )}
                    {item.translation && <p className="line-clamp-1 text-sm text-stone-500">{item.translation}</p>}
                    <div className="flex items-center justify-between gap-3 pt-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500">
                            <Clock className="h-3.5 w-3.5" />
                            {dueLabel}
                        </span>
                        <span className="rounded-full border border-white/40 bg-white/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                            reps {item.reps}
                        </span>
                    </div>
                </div>
            </div>

            <motion.div
                style={{ background: glare }}
                className="pointer-events-none absolute inset-0 z-30 rounded-[2rem] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
        </motion.article>
    );
}

export default function VocabDashboard() {
    const [search, setSearch] = useState("");
    const [manualWord, setManualWord] = useState("");
    const [isAddingWord, setIsAddingWord] = useState(false);
    const [addWordFeedback, setAddWordFeedback] = useState<AddWordFeedback>(null);

    const vocabQuery = useLiveQuery(() => db.vocabulary.toArray());
    const vocab = useMemo(() => vocabQuery ?? [], [vocabQuery]);

    // Stats
    const totalWords = vocab.length;
    const dueWords = vocab.filter((w) => w.due <= Date.now()).length;
    const filteredVocab = useMemo(
        () =>
            vocab
                .filter(w => w.word.toLowerCase().includes(search.toLowerCase()))
                .sort((a, b) => a.due - b.due),
        [vocab, search],
    );
    const dueRatio = totalWords === 0 ? 0 : Math.min(100, Math.round((dueWords / totalWords) * 100));

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
            setAddWordFeedback({ type: "error", text: "这个词已经在生词本里了" });
            return;
        }

        setIsAddingWord(true);
        setAddWordFeedback(null);

        try {
            const [dictResult, aiResult] = await Promise.allSettled([
                fetch("/api/dictionary", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ word }),
                }).then(async (res) => (res.ok ? res.json() : null)),
                fetch("/api/ai/define", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ word }),
                }).then(async (res) => (res.ok ? res.json() : null)),
            ]);

            const dictData = dictResult.status === "fulfilled" ? dictResult.value : null;
            const aiData = aiResult.status === "fulfilled" ? aiResult.value : null;

            const base = createEmptyCard(word);
            const card: VocabItem = {
                word,
                definition: aiData?.context_meaning?.definition || dictData?.definition || "",
                translation: aiData?.context_meaning?.translation || dictData?.translation || "",
                context: "",
                example: aiData?.example || "",
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
            setAddWordFeedback({ type: "success", text: `已加入：${word}` });
        } catch (error) {
            console.error("Manual add word failed:", error);
            setAddWordFeedback({ type: "error", text: "添加失败，请重试" });
        } finally {
            setIsAddingWord(false);
        }
    };

    return (
        <main className="relative min-h-screen overflow-hidden bg-[#f8f7f5] pb-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(251,191,36,0.2),transparent_36%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.16),transparent_40%),radial-gradient(circle_at_84%_82%,rgba(244,114,182,0.14),transparent_40%)]" />
            <div className="pointer-events-none absolute inset-0 opacity-25 bg-[linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:52px_52px]" />

            <div className="relative mx-auto max-w-7xl px-5 py-8 md:px-6 md:py-10">
                <GlassCard
                    breathe
                    className="liquid-glass-hero liquid-glass-apple-radius p-6 md:p-8"
                >
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                        <div className="space-y-4">
                            <Link href="/read" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#6f294f]/80 transition-colors hover:text-[#4b1732]">
                                <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                                Back to Reading
                            </Link>
                            <h1 className="font-newsreader text-[3rem] leading-[0.92] tracking-[-0.03em] text-[#2c1321] md:text-[4rem]">
                                Word Cards
                            </h1>
                            <p className="max-w-2xl text-sm leading-6 text-[#744a5f] md:text-[15px]">
                                Battle 和 Read 遇到的词，全部沉淀成可复习卡片。先聚合，再开刷。
                            </p>
                        </div>

                        <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-auto">
                            <div className="rounded-[1.4rem] border border-white/45 bg-white/32 px-4 py-3 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7f586a]">Total Cards</p>
                                <p className="mt-1 text-3xl font-bold text-[#2c1321]">{totalWords}</p>
                            </div>
                            <div className="rounded-[1.4rem] border border-amber-200/60 bg-amber-100/40 px-4 py-3 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Due Now</p>
                                <p className="mt-1 text-3xl font-bold text-amber-700">{dueWords}</p>
                            </div>
                            <Link
                                href="/vocab/review"
                                className={cn(
                                    "liquid-glass-hover liquid-glass-tap inline-flex min-h-[96px] items-center justify-center gap-2 rounded-[1.4rem] border px-4 py-3 text-sm font-semibold transition-all",
                                    dueWords > 0
                                        ? "border-[#2c1321]/70 bg-[#2c1321] text-white shadow-[0_18px_38px_-26px_rgba(44,19,33,0.9)] hover:brightness-110"
                                        : "cursor-not-allowed border-stone-300/70 bg-stone-200/70 text-stone-500"
                                )}
                                onClick={(e) => dueWords === 0 && e.preventDefault()}
                            >
                                <Brain className="h-4 w-4" />
                                Start Review
                            </Link>
                        </div>
                    </div>

                    <div className="mt-6 flex items-center gap-3">
                        <Sparkles className="h-4 w-4 text-[#7f3a61]" />
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/40">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-rose-400 to-fuchsia-500 transition-all duration-700"
                                style={{ width: `${dueRatio}%` }}
                            />
                        </div>
                        <span className="text-xs font-semibold text-[#7f3a61]">{dueRatio}% due</span>
                    </div>
                </GlassCard>

                <section className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_1.9fr]">
                    <GlassCard className="liquid-glass-apple-radius p-5 md:p-6">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                                <Plus className="h-4 w-4 text-emerald-600" />
                                手动添加生词
                            </div>
                            <p className="text-xs leading-5 text-stone-500">
                                输入英文单词，系统优先拉字典并补充 AI 释义。
                            </p>

                            <form onSubmit={handleManualAddWord} className="space-y-3">
                                <input
                                    type="text"
                                    value={manualWord}
                                    onChange={(e) => setManualWord(e.target.value)}
                                    placeholder="resilient / inevitable / constrain"
                                    className="h-12 w-full rounded-xl border border-white/55 bg-white/55 px-4 text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                                />
                                <button
                                    type="submit"
                                    disabled={isAddingWord || !manualWord.trim()}
                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2c1321] to-[#4b1732] px-4 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isAddingWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    {isAddingWord ? "添加中..." : "加入生词本"}
                                </button>
                            </form>

                            {addWordFeedback && (
                                <p className={cn("text-xs", addWordFeedback.type === "success" ? "text-emerald-600" : "text-rose-500")}>
                                    {addWordFeedback.text}
                                </p>
                            )}

                            <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                                <div className="rounded-xl border border-white/45 bg-white/35 px-3 py-2 text-stone-600">
                                    <p className="font-semibold text-stone-700">Queue</p>
                                    <p className="mt-1 inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{dueWords} due now</p>
                                </div>
                                <div className="rounded-xl border border-white/45 bg-white/35 px-3 py-2 text-stone-600">
                                    <p className="font-semibold text-stone-700">Coverage</p>
                                    <p className="mt-1 inline-flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{totalWords} cards</p>
                                </div>
                            </div>

                            <Link
                                href="/vocab/review"
                                className={cn(
                                    "liquid-glass-hover liquid-glass-tap inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-semibold uppercase tracking-[0.13em] transition-all",
                                    dueWords > 0
                                        ? "border-emerald-300/70 bg-emerald-100/65 text-emerald-700 hover:bg-emerald-100/85"
                                        : "cursor-not-allowed border-stone-300/70 bg-stone-200/60 text-stone-500"
                                )}
                                onClick={(e) => dueWords === 0 && e.preventDefault()}
                            >
                                <Brain className="h-3.5 w-3.5" />
                                Go Review Queue
                            </Link>
                        </div>
                    </GlassCard>

                    <GlassCard className="liquid-glass-apple-radius p-5 md:p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                                <input
                                    type="text"
                                    placeholder="Search words..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="h-11 w-full rounded-xl border border-white/55 bg-white/60 pl-10 pr-4 text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                                />
                            </div>
                            <span className="rounded-full border border-white/50 bg-white/45 px-3 py-1 text-xs font-semibold text-stone-600">
                                {filteredVocab.length} showing
                            </span>
                        </div>

                        <div className="mt-5">
                            {filteredVocab.length > 0 ? (
                                <div className="grid gap-4 md:grid-cols-2">
                                    {filteredVocab.map((item) => (
                                        <VocabWordCard key={item.word} item={item} onDelete={handleDelete} />
                                    ))}
                                </div>
                            ) : (
                                <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/60 bg-white/25 text-center text-stone-500">
                                    <BookOpen className="mb-3 h-11 w-11 opacity-40" />
                                    <p className="text-base font-medium">No cards found</p>
                                    {search && <p className="mt-1 text-sm">Try a different search term.</p>}
                                </div>
                            )}
                        </div>
                    </GlassCard>
                </section>
            </div>
        </main>
    );
}
