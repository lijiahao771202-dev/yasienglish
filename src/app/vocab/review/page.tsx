"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { db, VocabItem } from '@/lib/db';
import { Rating, graduateCard, scheduleCard } from '@/lib/fsrs';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { saveVocabulary, updateVocabularyEntry } from '@/lib/user-repository';
import { GlassCard } from '@/components/ui/GlassCard';
import { VocabReviewEditableCard } from '@/components/vocab/VocabReviewEditableCard';
import { pickPreferredMeaningGroups } from '@/lib/vocab-meanings';

type PosGroup = {
    pos: string;
    meanings: string[];
};

type DictionaryPayload = {
    definition?: string;
    translation?: string;
    pos_groups?: PosGroup[];
};

const POS_ORDER = ["n.", "v.", "adj.", "adv.", "prep.", "pron.", "conj.", "aux.", "num.", "int."];
const POS_PREFIX_RE = /^(n|v|adj|adv|prep|pron|conj|aux|num|int)\.\s*/i;
const POS_SCAN_RE = /\b(n|v|adj|adv|prep|pron|conj|aux|num|int)\./gi;

function normalizeText(input: string) {
    return input.replace(/\s+/g, " ").replace(/；/g, ";").trim();
}

function splitMeanings(raw: string) {
    return raw
        .split(/[;]/)
        .map((part) => part.trim())
        .filter(Boolean);
}

function dedupe(values: string[]) {
    return Array.from(new Set(values)).slice(0, 5);
}

function normalizeGhostWord(input: string) {
    return input.replace(/\s+/g, "").trim().toLowerCase();
}

function inferFallbackPos(word: string) {
    const lower = word.toLowerCase();
    if (/(ly)$/.test(lower)) return "adv.";
    if (/(tion|sion|ment|ness|ity|ism|age|ship|ance|ence)$/.test(lower)) return "n.";
    if (/(ive|ous|ful|less|able|ible|al|ic|ary|ory|ish)$/.test(lower)) return "adj.";
    if (/(ize|ise|fy|ate|en)$/.test(lower)) return "v.";
    return "n.";
}

function parsePosGroups(definition?: string, translation?: string, word = ""): PosGroup[] {
    const normalizedTranslation = normalizeText(translation ?? "");
    const normalizedDefinition = normalizeText(definition ?? "");
    const sources = /[\u3400-\u9fff]/.test(normalizedTranslation)
        ? [normalizedTranslation]
        : [normalizedTranslation, normalizedDefinition].filter(Boolean);

    const grouped = new Map<string, string[]>();
    const fallback: string[] = [];

    for (const source of sources) {
        const matches = Array.from(source.matchAll(POS_SCAN_RE));

        if (matches.length === 0) {
            fallback.push(...splitMeanings(source));
            continue;
        }

        for (let i = 0; i < matches.length; i += 1) {
            const match = matches[i];
            const start = match.index ?? 0;
            const end = matches[i + 1]?.index ?? source.length;
            const segment = source.slice(start, end).trim();
            const pos = `${(match[1] || "").toLowerCase()}.`;
            const cleaned = segment.replace(POS_PREFIX_RE, "").trim();
            const meanings = splitMeanings(cleaned);
            if (!meanings.length) continue;

            const existing = grouped.get(pos) ?? [];
            grouped.set(pos, [...existing, ...meanings]);
        }
    }

    const orderedKeys = POS_ORDER.filter((key) => grouped.has(key));
    const otherKeys = Array.from(grouped.keys()).filter((key) => !POS_ORDER.includes(key));

    const groups = [...orderedKeys, ...otherKeys].map((key) => ({
        pos: key,
        meanings: dedupe(grouped.get(key) ?? []),
    }));

    if (groups.length > 0) {
        return groups;
    }

    const fallbackMeanings = dedupe(fallback);
    if (fallbackMeanings.length > 0) {
        return [{ pos: inferFallbackPos(word), meanings: fallbackMeanings }];
    }

    return [];
}

function isEditableKeyboardTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function RatingButton({
    label,
    eta,
    className,
    onClick,
}: {
    label: string;
    eta: string;
    className: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex h-14 flex-col items-center justify-center rounded-2xl border-2 text-[14px] font-black transition-all active:scale-[0.96] md:h-[60px] md:text-[15px]",
                className,
            )}
        >
            <span className="block tracking-wide">{label}</span>
            <span className="mt-0.5 block text-[10px] font-bold opacity-75 md:text-[11px]">{eta}</span>
        </button>
    );
}

export default function ReviewPage() {
    const [queue, setQueue] = useState<VocabItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const [isRevealed, setIsRevealed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [dictionaryPosMap, setDictionaryPosMap] = useState<Record<string, PosGroup[]>>({});
    const [expandedPosGroups, setExpandedPosGroups] = useState<Record<string, boolean>>({});
    const [ghostInput, setGhostInput] = useState("");

    const ghostMatchedPrevRef = useRef(false);
    const ghostCompletionAudioPlayedRef = useRef(false);

    useEffect(() => {
        const loadCards = async () => {
            const now = Date.now();
            const cards = await db.vocabulary
                .where('due')
                .belowOrEqual(now)
                .sortBy('due');

            setQueue(cards.slice(0, 25));
            setIsLoading(false);
        };

        loadCards();
    }, []);

    const currentCard = queue[currentIndex];
    const localPosGroups = currentCard
        ? (
            Array.isArray(currentCard.meaning_groups) && currentCard.meaning_groups.length > 0
                ? currentCard.meaning_groups
                : parsePosGroups(currentCard.definition, currentCard.translation, currentCard.word)
        )
        : [];
    const dictPosGroups = currentCard ? (dictionaryPosMap[currentCard.word.toLowerCase()] ?? []) : [];
    const displayPosGroups = pickPreferredMeaningGroups(localPosGroups, dictPosGroups);

    const ghostTargetNormalized = currentCard ? normalizeGhostWord(currentCard.word) : "";
    const ghostInputNormalized = normalizeGhostWord(ghostInput);
    const isGhostMatched = Boolean(
        currentCard
        && ghostInputNormalized === ghostTargetNormalized,
    );
    const isGhostComplete = Boolean(
        ghostTargetNormalized
        && ghostInputNormalized.length >= ghostTargetNormalized.length,
    );

    useEffect(() => {
        if (!currentCard) return;
        const key = currentCard.word.toLowerCase();
        if (dictionaryPosMap[key]?.length) return;

        let cancelled = false;
        const loadDictionary = async () => {
            try {
                const res = await fetch("/api/dictionary", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ word: currentCard.word }),
                });
                if (!res.ok) return;
                const payload = await res.json() as DictionaryPayload;
                const fromApi = Array.isArray(payload.pos_groups) ? payload.pos_groups : [];
                const groups = fromApi.length > 0
                    ? fromApi
                    : parsePosGroups(payload.definition, payload.translation, currentCard.word);
                if (!cancelled && groups.length > 0) {
                    setDictionaryPosMap((prev) => ({ ...prev, [key]: groups }));
                }
            } catch {
                // Keep local parse fallback when dictionary lookup fails.
            }
        };

        loadDictionary();
        return () => {
            cancelled = true;
        };
    }, [currentCard, dictionaryPosMap]);

    const resetCardUiState = useCallback(() => {
        setIsRevealed(false);
        setGhostInput("");
        setExpandedPosGroups({});
        ghostMatchedPrevRef.current = false;
        ghostCompletionAudioPlayedRef.current = false;
    }, []);

    const moveToNextCard = useCallback((delayMs = 140) => {
        if (currentIndex < queue.length - 1) {
            window.setTimeout(() => setCurrentIndex((prev) => prev + 1), delayMs);
        } else {
            window.setTimeout(() => setIsFinished(true), delayMs);
        }
    }, [currentIndex, queue.length]);

    const handleRating = useCallback(async (rating: Rating) => {
        if (!currentCard) return;

        const updatedCard = scheduleCard(currentCard, rating);
        await saveVocabulary(updatedCard);

        resetCardUiState();
        moveToNextCard();
    }, [currentCard, moveToNextCard, resetCardUiState]);

    const handleGraduate = useCallback(async (nextItem: VocabItem, previousWord: string) => {
        const graduatedCard = graduateCard(nextItem);
        const saved = await updateVocabularyEntry(previousWord, graduatedCard);

        setQueue((prev) => prev.map((card, index) => (
            index === currentIndex ? saved : card
        )));
        resetCardUiState();
        moveToNextCard();
    }, [currentIndex, moveToNextCard, resetCardUiState]);

    const playAudio = useCallback((word: string) => {
        const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${word}&type=2`);
        audio.play().catch(console.error);
    }, []);

    useEffect(() => {
        if (isRevealed && currentCard) {
            playAudio(currentCard.word);
        }
    }, [isRevealed, currentCard, playAudio]);

    useEffect(() => {
        if (isGhostMatched && !ghostMatchedPrevRef.current) {
            confetti({
                particleCount: 28,
                spread: 56,
                startVelocity: 30,
                origin: { y: 0.72 },
                scalar: 0.75,
                ticks: 120,
            });
        }
        ghostMatchedPrevRef.current = isGhostMatched;
    }, [isGhostMatched]);

    useEffect(() => {
        if (!currentCard) return;
        if (!isGhostComplete) {
            ghostCompletionAudioPlayedRef.current = false;
            return;
        }
        if (ghostCompletionAudioPlayedRef.current) return;
        ghostCompletionAudioPlayedRef.current = true;
        playAudio(currentCard.word);
    }, [isGhostComplete, currentCard, playAudio]);

    useEffect(() => {
        if (!currentCard) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (isEditableKeyboardTarget(event.target)) {
                return;
            }

            if (event.code === "Space") {
                event.preventDefault();
                setIsRevealed((prev) => !prev);
                return;
            }

            if (event.key === "Backspace") {
                event.preventDefault();
                setGhostInput((prev) => prev.slice(0, -1));
                return;
            }

            if (event.key.length === 1 && /^[a-zA-Z'’-]$/.test(event.key)) {
                event.preventDefault();
                setGhostInput((prev) => {
                    if (!ghostTargetNormalized) return `${prev}${event.key}`;
                    if (normalizeGhostWord(prev).length >= ghostTargetNormalized.length) {
                        return event.key;
                    }
                    return `${prev}${event.key}`;
                });
                return;
            }

            if (!isRevealed) return;
            if (event.key === "1") {
                event.preventDefault();
                void handleRating(Rating.Again);
                return;
            } else if (event.key === "2") {
                event.preventDefault();
                void handleRating(Rating.Hard);
                return;
            } else if (event.key === "3") {
                event.preventDefault();
                void handleRating(Rating.Good);
                return;
            } else if (event.key === "4") {
                event.preventDefault();
                void handleRating(Rating.Easy);
                return;
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [currentCard, isRevealed, handleRating, ghostTargetNormalized]);

    if (isLoading) {
        return (
            <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fafaf9]">
                <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_50%_0%,#fdf4ff_0%,transparent_50%),radial-gradient(circle_at_80%_100%,#e0f2fe_0%,transparent_50%)]" />
                <div className="relative z-10 flex w-[300px] flex-col items-center gap-4 rounded-[32px] bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <Loader2 className="h-10 w-10 animate-spin text-pink-400" />
                    <p className="text-sm font-black tracking-wide text-slate-500">正在准备生词本...</p>
                </div>
            </main>
        );
    }

    if (queue.length === 0 || isFinished) {
        return (
            <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fafaf9] px-6">
                <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_50%_0%,#fdf4ff_0%,transparent_50%),radial-gradient(circle_at_80%_100%,#e0f2fe_0%,transparent_50%)]" />
                
                <motion.div initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} className="relative z-10 w-full max-w-sm">
                    <div className="rounded-[36px] bg-white px-8 py-10 text-center shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-pink-50/50">
                        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-pink-100 text-pink-500 shadow-inner overflow-hidden">
                            <span className="text-5xl border-transparent">🎉</span>
                        </div>
                        <h2 className="font-newsreader text-[2.4rem] font-bold text-slate-800 tracking-tight">今日已搞定!</h2>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                            复习队列空空如也，真棒！
                        </p>
                        <Link
                            href="/vocab"
                            className="mt-8 flex items-center justify-center rounded-2xl bg-slate-800 px-6 py-4 text-[15px] font-black tracking-wider text-white shadow-[0_8px_20px_rgb(0,0,0,0.12)] transition hover:bg-slate-700 hover:scale-[1.02] active:scale-95"
                        >
                            返回生词本
                        </Link>
                    </div>
                </motion.div>
            </main>
        );
    }

    const progress = (currentIndex / queue.length) * 100;

    return (
        <main className="relative min-h-screen bg-[#fafaf9] px-4 pb-12 pt-6 md:px-6 md:pb-12 md:pt-8 font-sans">
            {/* Cute Pastel Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 opacity-[0.35] bg-[radial-gradient(circle_at_20%_20%,#fbcfe8_0%,transparent_40%),radial-gradient(circle_at_80%_80%,#bae6fd_0%,transparent_40%)]" />
            </div>

            <div className="relative z-10 flex w-full flex-col h-[calc(100vh-48px)] overflow-hidden">
                <div className="shrink-0 w-full max-w-[500px] mx-auto mb-4">
                    <div className="flex items-center gap-3 rounded-full bg-white/70 backdrop-blur-md p-2 pl-3 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/80">
                        <Link
                            href="/vocab"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 transition hover:bg-slate-200 hover:scale-105 active:scale-95"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                        <div className="min-w-0 flex-1">
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                                <div
                                    className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-slate-500 shadow-sm border border-slate-100">
                            {currentIndex + 1} / {queue.length}
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-1 pb-24 w-full flex justify-center pretty-scroll">
                    <div className="w-full max-w-[500px] flex flex-col pt-2 relative">
                        <AnimatePresence mode="wait">
                            {!isRevealed ? (
                                <motion.div
                                    key={`front-${currentCard.word}`}
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -20, opacity: 0, filter: "blur(4px)" }}
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    className="w-full flex-shrink-0"
                                >
                                    <div className="flex h-[38vh] min-h-[300px] flex-col items-center justify-center rounded-[36px] bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/80">
                                        <div className="flex flex-wrap items-center justify-center text-[3.8rem] md:text-[4.5rem] font-newsreader font-bold tracking-tight drop-shadow-sm leading-none relative">
                                            {(() => {
                                                let inputCursorTracker = 0;
                                                const chars = currentCard.word.split("");
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
                                                            
                                                            const isCursor = inputCursorTracker === ghostInput.length;
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
                                                        {inputCursorTracker === ghostInput.length && (
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
                                    </div>
                                    <div className="mt-6 flex justify-center">
                                        <button
                                            onClick={() => setIsRevealed(true)}
                                            className="h-16 w-full max-w-[320px] rounded-[24px] bg-slate-800 text-[16px] font-black tracking-wide text-white shadow-[0_8px_20px_rgba(30,41,59,0.2)] transition active:scale-[0.98] hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(30,41,59,0.25)] hover:bg-slate-700"
                                        >
                                            🙌 看看答案
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key={`back-${currentCard.word}`}
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -20, opacity: 0 }}
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    className="flex flex-col gap-4 w-full"
                                >
                                    <div className="min-h-[460px] rounded-[36px] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/80 overflow-hidden relative">
                                        <VocabReviewEditableCard
                                            item={currentCard}
                                            posGroups={displayPosGroups}
                                            expandedPosGroups={expandedPosGroups}
                                            onExpandedPosGroupsChange={setExpandedPosGroups}
                                            onPlayAudio={playAudio}
                                            onGraduate={handleGraduate}
                                            ghostInput={ghostInput}
                                            onSaved={(savedCard) => {
                                                setQueue((prev) => prev.map((card, index) => (
                                                    index === currentIndex ? savedCard : card
                                                )));
                                            }}
                                        />
                                    </div>

                                    <div className="rounded-[32px] bg-white p-2 sm:p-3 shadow-[0_8px_30px_rgb(0,0,0,0.05)] border border-white/80 shrink-0">
                                        <div className="grid grid-cols-4 gap-2">
                                            <RatingButton
                                                label="重来"
                                                eta="1m"
                                                onClick={() => handleRating(Rating.Again)}
                                                className="border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-300"
                                            />
                                            <RatingButton
                                                label="困难"
                                                eta="5m"
                                                onClick={() => handleRating(Rating.Hard)}
                                                className="border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 hover:border-amber-300"
                                            />
                                            <RatingButton
                                                label="熟悉"
                                                eta="1d"
                                                onClick={() => handleRating(Rating.Good)}
                                                className="border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300"
                                            />
                                            <RatingButton
                                                label="简单"
                                                eta="3d"
                                                onClick={() => handleRating(Rating.Easy)}
                                                className="border-emerald-500 bg-emerald-400 text-white hover:bg-emerald-500 hover:border-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.2)]"
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </main>
    );
}
