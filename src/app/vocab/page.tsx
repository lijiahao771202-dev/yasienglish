"use client";

import React, { useState, useEffect } from 'react';
import { db, VocabItem } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';
import { BookOpen, Clock, Brain, Search, Trash2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export default function VocabDashboard() {
    const [search, setSearch] = useState("");

    const vocab = useLiveQuery(() => db.vocabulary.toArray()) || [];

    // Stats
    const totalWords = vocab.length;
    const dueWords = vocab.filter(w => w.due <= Date.now()).length;

    const filteredVocab = vocab.filter(w => w.word.toLowerCase().includes(search.toLowerCase()));

    // Delete handler
    const handleDelete = async (word: string) => {
        if (confirm(`Delete "${word}"?`)) {
            await db.vocabulary.delete(word);
        }
    };

    return (
        <div className="min-h-screen bg-stone-50 pb-20">
            <div className="max-w-4xl mx-auto px-6 py-12">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                    <div>
                        <Link href="/read" className="text-stone-400 hover:text-stone-600 text-sm font-medium mb-2 inline-block transition-colors">
                            ← Back to Reading
                        </Link>
                        <h1 className="text-4xl font-serif font-medium text-stone-800">Vocabulary</h1>
                        <p className="text-stone-500 mt-2">Manage your collection and review cards.</p>
                    </div>

                    {/* Review Button Card */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex items-center justify-between gap-8 min-w-[280px]">
                        <div>
                            <div className="text-3xl font-bold text-amber-600">{dueWords}</div>
                            <div className="text-sm text-stone-500 font-medium uppercase tracking-wide">Due for Review</div>
                        </div>
                        <Link
                            href="/vocab/review"
                            className={cn(
                                "h-12 px-6 rounded-xl flex items-center gap-2 font-bold transition-all shadow-md",
                                dueWords > 0
                                    ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200"
                                    : "bg-stone-100 text-stone-400 cursor-not-allowed"
                            )}
                            onClick={(e) => dueWords === 0 && e.preventDefault()}
                        >
                            <Brain className="w-5 h-5" />
                            Review
                        </Link>
                    </div>
                </div>

                {/* New Feature: Translation Practice */}
                <div className="mb-8">
                    <Link href="/vocab/translation" className="group relative block w-full overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 p-8 text-white shadow-xl shadow-indigo-500/20 transition-all hover:shadow-indigo-500/40 hover:scale-[1.01]">
                        <div className="relative z-10 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold mb-2">中译英实战练习</h2>
                                <p className="text-indigo-100 max-w-lg">
                                    AI 出题，你来翻译。通过实时反馈和评分系统，快速提升你的中英互译能力。
                                </p>
                            </div>
                            <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl">
                                <ArrowRight className="w-8 h-8 text-white" />
                            </div>
                        </div>
                        {/* Decorative Circles */}
                        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl group-hover:bg-white/20 transition-colors" />
                        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-900/20 blur-3xl" />
                    </Link>
                </div>

                {/* Main Content */}
                <div className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden min-h-[500px]">

                    {/* Toolbar */}
                    <div className="p-6 border-b border-stone-100 flex items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                            <input
                                type="text"
                                placeholder="Search words..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200 transition-all text-stone-700"
                            />
                        </div>
                        <div className="text-sm text-stone-400 font-medium">
                            {totalWords} words total
                        </div>
                    </div>

                    {/* Word List */}
                    <div className="divide-y divide-stone-100">
                        {filteredVocab.length > 0 ? (
                            filteredVocab.map((item) => (
                                <motion.div
                                    key={item.word}
                                    layoutId={item.word}
                                    className="p-6 hover:bg-amber-50/30 transition-colors group flex items-start justify-between gap-4"
                                >
                                    <div className="space-y-1">
                                        <h3 className="text-xl font-bold text-stone-800 font-serif">{item.word}</h3>
                                        <p className="text-stone-600">{item.definition}</p>
                                        {item.translation && (
                                            <p className="text-sm text-stone-400">{item.translation}</p>
                                        )}
                                        <div className="flex gap-3 mt-3">
                                            <span className={cn(
                                                "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border",
                                                item.state === 0 ? "bg-blue-50 text-blue-600 border-blue-100" :
                                                    item.state === 1 ? "bg-orange-50 text-orange-600 border-orange-100" :
                                                        "bg-green-50 text-green-600 border-green-100"
                                            )}>
                                                {item.state === 0 ? "New" : item.state === 1 ? "Learning" : "Review"}
                                            </span>
                                            <span className="text-[10px] text-stone-400 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Next: {new Date(item.due).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleDelete(item.word)}
                                        className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            ))
                        ) : (
                            <div className="p-12 text-center text-stone-400">
                                <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>No vocabulary found.</p>
                                {search && <p className="text-sm mt-2">Try a different search term.</p>}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
