"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { db, VocabItem } from '@/lib/db';
import { Rating, scheduleCard } from '@/lib/fsrs';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, RotateCw, BookOpen, Volume2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function ReviewPage() {
    // Session State
    const [queue, setQueue] = useState<VocabItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const [isRevealed, setIsRevealed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Load due cards - LIMIT 25
    useEffect(() => {
        const loadCards = async () => {
            const now = Date.now();
            // Fetch words due for review or new words
            // Simple query: get all, filter due, limit 25
            // In a large DB, we'd use indexes better, but 'due' is indexed now.
            // Using toArray() for filtering is ok for <10k words otherwise we need compound index.
            // Dexie can do: db.vocabulary.where('due').belowOrEqual(now).limit(25).toArray()

            const cards = await db.vocabulary
                .where('due')
                .belowOrEqual(now)
                .limit(25)
                .toArray();

            // Randomize order a bit? Usually FSRS order (by due date) is best.
            // Let's stick to due date order (default for query)

            setQueue(cards);
            setIsLoading(false);
        };
        loadCards();
    }, []);

    const currentCard = queue[currentIndex];

    const handleRating = async (rating: Rating) => {
        if (!currentCard) return;

        // Calculate new state
        const updatedCard = scheduleCard(currentCard, rating);

        // Save to DB
        await db.vocabulary.put(updatedCard);

        // Move to next
        setIsRevealed(false);
        if (currentIndex < queue.length - 1) {
            setTimeout(() => setCurrentIndex(prev => prev + 1), 150); // slight delay for anim
        } else {
            setIsFinished(true);
        }
    };

    const playAudio = useCallback((word: string) => {
        const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${word}&type=2`);
        audio.play().catch(console.error);
    }, []);

    // Auto-play audio on reveal if not new? Or always?
    useEffect(() => {
        if (isRevealed && currentCard) {
            playAudio(currentCard.word);
        }
    }, [isRevealed, currentCard, playAudio]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-stone-50">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-12 w-12 bg-stone-200 rounded-full mb-4"></div>
                    <div className="h-4 w-32 bg-stone-200 rounded"></div>
                </div>
            </div>
        );
    }

    if (queue.length === 0 || isFinished) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 p-6">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="glass-panel p-12 rounded-3xl text-center max-w-md w-full"
                >
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                        <Check className="w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-serif font-bold text-stone-800 mb-2">All Done!</h2>
                    <p className="text-stone-500 mb-8">You've reviewed your daily cards.</p>
                    <Link
                        href="/vocab"
                        className="inline-flex items-center justify-center px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-200"
                    >
                        Back to Dashboard
                    </Link>
                </motion.div>
            </div>
        );
    }

    const progress = ((currentIndex) / queue.length) * 100;

    return (
        <div className="min-h-screen bg-stone-50 flex flex-col items-center py-8 relative">
            {/* Header */}
            <div className="w-full max-w-2xl px-6 flex items-center justify-between mb-8">
                <Link href="/vocab" className="p-2 rounded-full hover:bg-stone-200 text-stone-400 hover:text-stone-600 transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </Link>
                <div className="flex-1 max-w-[200px] h-2 bg-stone-200 rounded-full overflow-hidden mx-4">
                    <div
                        className="h-full bg-amber-500 transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className="text-sm font-bold text-stone-400">
                    {currentIndex + 1} / {queue.length}
                </div>
            </div>

            {/* Flashcard Area */}
            <div className="w-full max-w-2xl px-6 flex-1 flex flex-col justify-center pb-20">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentCard.word}
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -20, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="glass-panel min-h-[400px] rounded-3xl p-8 md:p-12 flex flex-col items-center justify-center text-center relative overflow-hidden shadow-2xl bg-white/60"
                        onClick={() => !isRevealed && setIsRevealed(true)}
                    >
                        {/* Word (Front) */}
                        <div className="mb-8">
                            <h2 className="text-5xl md:text-6xl font-serif font-bold text-stone-800 mb-4 tracking-tight">
                                {currentCard.word}
                            </h2>
                            {isRevealed && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        playAudio(currentCard.word);
                                    }}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100 hover:bg-amber-100 text-stone-500 hover:text-amber-600 transition-colors text-sm font-medium"
                                >
                                    <Volume2 className="w-4 h-4" />
                                    Pronounce
                                </button>
                            )}
                        </div>

                        {/* Back Content (Reveal) */}
                        {isRevealed ? (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6 w-full max-w-lg"
                            >
                                <div className="space-y-2">
                                    <p className="text-xl text-stone-700 font-medium leading-relaxed">
                                        {currentCard.definition}
                                    </p>
                                    {currentCard.translation && (
                                        <p className="text-lg text-stone-500">
                                            {currentCard.translation}
                                        </p>
                                    )}
                                </div>

                                {currentCard.context && (
                                    <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100/50 text-left">
                                        <div className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                            <BookOpen className="w-3 h-3" />
                                            Context
                                        </div>
                                        <p className="text-stone-700 italic leading-relaxed font-serif text-lg">
                                            "{currentCard.context}"
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center cursor-pointer hover:bg-black/[0.02] transition-colors">
                                <span className="text-stone-400 font-medium animate-pulse">Tap to reveal</span>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Controls */}
            <div className="fixed bottom-0 left-0 w-full p-6 bg-gradient-to-t from-stone-50 via-stone-50 to-transparent">
                <div className="max-w-2xl mx-auto">
                    {!isRevealed ? (
                        <button
                            onClick={() => setIsRevealed(true)}
                            className="w-full h-14 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-[0.98]"
                        >
                            Show Answer
                        </button>
                    ) : (
                        <div className="grid grid-cols-4 gap-3">
                            <button
                                onClick={() => handleRating(Rating.Again)}
                                className="h-14 flex flex-col items-center justify-center bg-white border border-rose-100 hover:bg-rose-50 text-rose-600 rounded-2xl shadow-sm transition-all active:scale-[0.95]"
                            >
                                <span className="text-sm font-bold">Again</span>
                                <span className="text-[10px] opacity-70">1m</span>
                            </button>
                            <button
                                onClick={() => handleRating(Rating.Hard)}
                                className="h-14 flex flex-col items-center justify-center bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-2xl shadow-sm transition-all active:scale-[0.95]"
                            >
                                <span className="text-sm font-bold">Hard</span>
                                <span className="text-[10px] opacity-70">5m</span>
                            </button>
                            <button
                                onClick={() => handleRating(Rating.Good)}
                                className="h-14 flex flex-col items-center justify-center bg-white border border-emerald-100 hover:bg-emerald-50 text-emerald-600 rounded-2xl shadow-sm transition-all active:scale-[0.95]"
                            >
                                <span className="text-sm font-bold">Good</span>
                                <span className="text-[10px] opacity-70">1d</span>
                            </button>
                            <button
                                onClick={() => handleRating(Rating.Easy)}
                                className="h-14 flex flex-col items-center justify-center bg-white border border-blue-100 hover:bg-blue-50 text-blue-600 rounded-2xl shadow-sm transition-all active:scale-[0.95]"
                            >
                                <span className="text-sm font-bold">Easy</span>
                                <span className="text-[10px] opacity-70">3d</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
