"use client";

import React, { useState } from 'react';
import { db, VocabItem } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { ArrowRight, BookOpen, Brain, Clock, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { createEmptyCard } from '@/lib/fsrs';

export default function VocabDashboard() {
    const [search, setSearch] = useState("");
    const [manualWord, setManualWord] = useState("");
    const [isAddingWord, setIsAddingWord] = useState(false);
    const [addWordFeedback, setAddWordFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const vocab = useLiveQuery(() => db.vocabulary.toArray()) || [];

    // Stats
    const totalWords = vocab.length;
    const dueWords = vocab.filter(w => w.due <= Date.now()).length;

    const filteredVocab = vocab.filter(w => w.word.toLowerCase().includes(search.toLowerCase()));
    const dueRatio = totalWords === 0 ? 0 : Math.min(100, Math.round((dueWords / totalWords) * 100));

    // Delete handler
    const handleDelete = async (word: string) => {
        if (confirm(`Delete "${word}"?`)) {
            await db.vocabulary.delete(word);
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

            await db.vocabulary.put(card);
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
        <main className="relative min-h-screen overflow-hidden bg-[#fbfaf8] pb-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(251,146,60,0.14),transparent_35%),radial-gradient(circle_at_84%_18%,rgba(99,102,241,0.14),transparent_35%),radial-gradient(circle_at_78%_84%,rgba(16,185,129,0.12),transparent_38%)]" />
            <div className="pointer-events-none absolute inset-0 opacity-30 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:44px_44px]" />

            <div className="relative mx-auto max-w-6xl px-6 py-10">
                <section className="glass-panel rounded-[2rem] border border-white/70 p-7 md:p-9 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.26)]">
                    <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <Link href="/read" className="inline-flex items-center gap-2 text-sm text-stone-500 transition-colors hover:text-stone-700">
                                <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                                Back to Reading
                            </Link>
                            <h1 className="mt-3 font-newsreader text-5xl leading-none tracking-tight text-stone-900 md:text-6xl">Wordbank</h1>
                            <p className="mt-3 max-w-xl text-stone-600">把阅读和 battle 里遇到的词汇集中管理，用最少动作完成记忆闭环。</p>
                        </div>

                        <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-auto">
                            <div className="rounded-2xl border border-stone-200 bg-white/75 px-4 py-3 shadow-sm">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Total</p>
                                <p className="mt-1 text-2xl font-semibold text-stone-800">{totalWords}</p>
                            </div>
                            <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 shadow-sm">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-amber-700">Due Today</p>
                                <p className="mt-1 text-2xl font-semibold text-amber-700">{dueWords}</p>
                            </div>
                            <Link
                                href="/vocab/review"
                                className={cn(
                                    "inline-flex h-full min-h-20 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all",
                                    dueWords > 0
                                        ? "border-stone-900 bg-stone-900 text-white hover:brightness-110"
                                        : "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400"
                                )}
                                onClick={(e) => dueWords === 0 && e.preventDefault()}
                            >
                                <Brain className="h-4 w-4" />
                                Start Review
                            </Link>
                        </div>
                    </div>

                    <div className="mt-6 h-2 overflow-hidden rounded-full bg-stone-200/70">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 transition-all duration-700"
                            style={{ width: `${dueRatio}%` }}
                        />
                    </div>
                </section>

                <section className="mt-6">
                    <div className="rounded-3xl border border-stone-200 bg-white/85 p-6 shadow-sm">
                        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-stone-700">
                            <Plus className="h-4 w-4 text-emerald-600" />
                            手动添加生词（AI 自动生成中文释义）
                        </div>
                        <form onSubmit={handleManualAddWord} className="flex flex-col gap-3 sm:flex-row">
                            <input
                                type="text"
                                value={manualWord}
                                onChange={(e) => setManualWord(e.target.value)}
                                placeholder="输入英文单词，例如: resilient"
                                className="h-12 flex-1 rounded-xl border border-stone-200 bg-stone-50 px-4 text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                            />
                            <button
                                type="submit"
                                disabled={isAddingWord || !manualWord.trim()}
                                className="inline-flex h-12 min-w-[150px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-stone-900 to-stone-700 px-4 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isAddingWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                {isAddingWord ? "添加中..." : "加入生词本"}
                            </button>
                        </form>
                        {addWordFeedback && (
                            <p className={cn(
                                "mt-3 text-xs",
                                addWordFeedback.type === "success" ? "text-emerald-600" : "text-rose-500"
                            )}>
                                {addWordFeedback.text}
                            </p>
                        )}
                    </div>
                </section>

                <section className="mt-6 overflow-hidden rounded-3xl border border-stone-200 bg-white/90 shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative flex-1 sm:max-w-md">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                            <input
                                type="text"
                                placeholder="Search words..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 pl-10 pr-4 text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                            />
                        </div>
                        <span className="text-sm font-medium text-stone-500">{totalWords} words total</span>
                    </div>

                    <div className="divide-y divide-stone-100">
                        {filteredVocab.length > 0 ? (
                            filteredVocab.map((item) => (
                                <motion.div
                                    key={item.word}
                                    layoutId={item.word}
                                    className="group flex items-start justify-between gap-4 px-5 py-5 transition-colors hover:bg-amber-50/35"
                                >
                                    <div className="space-y-2">
                                        <h3 className="font-newsreader text-4xl leading-none tracking-tight text-stone-900">{item.word}</h3>
                                        {item.definition && <p className="max-w-3xl text-stone-700">{item.definition}</p>}
                                        {item.translation && <p className="text-sm text-stone-500">{item.translation}</p>}
                                        {item.example && <p className="text-sm italic text-stone-500">“{item.example}”</p>}

                                        <div className="mt-2 flex flex-wrap items-center gap-2.5">
                                            <span className={cn(
                                                "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
                                                item.state === 0 ? "border-blue-200 bg-blue-50 text-blue-600" :
                                                    item.state === 1 ? "border-orange-200 bg-orange-50 text-orange-600" :
                                                        "border-emerald-200 bg-emerald-50 text-emerald-600"
                                            )}>
                                                {item.state === 0 ? "New" : item.state === 1 ? "Learning" : "Review"}
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                                                <Clock className="h-3.5 w-3.5" />
                                                Next: {new Date(item.due).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleDelete(item.word)}
                                        className="mt-1 rounded-lg p-2 text-stone-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                                        title="Delete"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </motion.div>
                            ))
                        ) : (
                            <div className="px-6 py-14 text-center text-stone-400">
                                <BookOpen className="mx-auto mb-4 h-12 w-12 opacity-30" />
                                <p className="text-base">No vocabulary found.</p>
                                {search && <p className="mt-1 text-sm">Try a different search term.</p>}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
