"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { db, VocabItem } from '@/lib/db';
import { Rating, scheduleCard } from '@/lib/fsrs';
import { motion, AnimatePresence, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowLeft, BookOpen, Check, Loader2, Volume2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { saveVocabulary } from '@/lib/user-repository';
import { GlassCard } from '@/components/ui/GlassCard';

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
    const sources = [definition ?? "", translation ?? ""]
        .map((part) => normalizeText(part))
        .filter(Boolean);

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
                "liquid-glass-tap h-14 rounded-2xl border text-sm font-semibold transition-all active:scale-[0.96]",
                className,
            )}
        >
            <span className="block">{label}</span>
            <span className="mt-0.5 block text-[10px] font-medium opacity-75">{eta}</span>
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

    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const mouseX = useSpring(x, { stiffness: 360, damping: 44 });
    const mouseY = useSpring(y, { stiffness: 360, damping: 44 });
    const rotateX = useTransform(mouseY, [-180, 180], [6, -6]);
    const rotateY = useTransform(mouseX, [-180, 180], [-6, 6]);
    const glare = useMotionTemplate`radial-gradient(360px circle at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.2), transparent 42%)`;

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
        ? parsePosGroups(currentCard.definition, currentCard.translation, currentCard.word)
        : [];
    const dictPosGroups = currentCard ? (dictionaryPosMap[currentCard.word.toLowerCase()] ?? []) : [];
    const displayPosGroups = dictPosGroups.length > 0 ? dictPosGroups : localPosGroups;

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

    useEffect(() => {
        if (!currentCard) return;
        setIsRevealed(false);
        setGhostInput("");
        setExpandedPosGroups({});
        ghostMatchedPrevRef.current = false;
        ghostCompletionAudioPlayedRef.current = false;
    }, [currentCard]);

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

        setIsRevealed(false);
        moveToNextCard();
    }, [currentCard, moveToNextCard]);

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

    const renderGhostWord = useCallback((word: string) => {
        const typedChars = Array.from(ghostInput);
        let typedIndex = 0;
        return Array.from(word).map((char, index) => {
            if (char === " ") {
                return (
                    <span
                        key={`ghost-char-space-${index}`}
                        aria-hidden="true"
                        className="inline-block w-[0.5ch]"
                    />
                );
            }

            const typed = typedChars[typedIndex];
            const status = typed === undefined
                ? "idle"
                : typed.toLowerCase() === char.toLowerCase()
                    ? "correct"
                    : "wrong";
            typedIndex += 1;

            return (
                <span
                    key={`ghost-char-${index}-${char}`}
                    className={cn(
                        "inline-block border-b-2 border-dashed px-[0.01em] pb-[0.04em] transition-colors",
                        status === "correct" && "border-emerald-400/80 text-emerald-600",
                        status === "wrong" && "border-rose-300/90 text-rose-500",
                        status === "idle" && "border-stone-300/80 text-stone-400/80",
                    )}
                >
                    {char}
                </span>
            );
        });
    }, [ghostInput]);

    const handleCardMouseMove = ({ currentTarget, clientX, clientY }: React.MouseEvent) => {
        const rect = currentTarget.getBoundingClientRect();
        x.set(clientX - rect.left - rect.width / 2);
        y.set(clientY - rect.top - rect.height / 2);
    };

    const handleCardMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    if (isLoading) {
        return (
            <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8f7f5]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_12%,rgba(251,191,36,0.2),transparent_40%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.16),transparent_44%)]" />
                <GlassCard className="liquid-glass-apple-radius flex w-[340px] flex-col items-center gap-3 px-6 py-8 text-center">
                    <Loader2 className="h-9 w-9 animate-spin text-stone-500" />
                    <p className="text-sm font-medium text-stone-600">Preparing cards...</p>
                </GlassCard>
            </main>
        );
    }

    if (queue.length === 0 || isFinished) {
        return (
            <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8f7f5] px-6">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_12%,rgba(251,191,36,0.2),transparent_40%),radial-gradient(circle_at_82%_18%,rgba(56,189,248,0.14),transparent_42%),radial-gradient(circle_at_84%_86%,rgba(244,114,182,0.14),transparent_42%)]" />
                <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md">
                    <GlassCard breathe className="liquid-glass-hero liquid-glass-apple-radius px-8 py-10 text-center">
                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-emerald-200/70 bg-emerald-100/70 text-emerald-600">
                            <Check className="h-10 w-10" />
                        </div>
                        <h2 className="font-newsreader text-4xl leading-none text-[#2c1321]">Done For Today</h2>
                        <p className="mt-3 text-sm leading-6 text-[#754f62]">
                            FSRS 复习队列已清空，今天到这里就行。
                        </p>
                        <Link
                            href="/vocab"
                            className="liquid-glass-hover liquid-glass-tap mt-7 inline-flex items-center justify-center rounded-xl border border-[#2c1321]/60 bg-[#2c1321] px-6 py-3 text-sm font-semibold text-white hover:brightness-110"
                        >
                            Back to Word Cards
                        </Link>
                    </GlassCard>
                </motion.div>
            </main>
        );
    }

    const progress = (currentIndex / queue.length) * 100;

    return (
        <main className="relative min-h-screen overflow-hidden bg-[#f8f7f5] px-4 pb-28 pt-6 md:px-6 md:pt-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(251,191,36,0.18),transparent_38%),radial-gradient(circle_at_84%_18%,rgba(59,130,246,0.14),transparent_42%),radial-gradient(circle_at_76%_84%,rgba(244,114,182,0.14),transparent_42%)]" />
            <div className="pointer-events-none absolute inset-0 opacity-25 bg-[linear-gradient(rgba(148,163,184,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.1)_1px,transparent_1px)] bg-[size:48px_48px]" />

            <div className="relative mx-auto flex w-full max-w-4xl flex-col">
                <GlassCard className="liquid-glass-apple-radius p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/vocab"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/45 bg-white/35 text-stone-500 transition-colors hover:text-stone-700"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Review Session</p>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/45">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                        <span className="rounded-full border border-white/50 bg-white/35 px-3 py-1 text-xs font-semibold text-stone-600">
                            {currentIndex + 1} / {queue.length}
                        </span>
                    </div>
                </GlassCard>

                <div className="mt-6">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentCard.word}
                            initial={{ x: 18, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -18, opacity: 0 }}
                            transition={{ duration: 0.22 }}
                            style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                            onMouseMove={handleCardMouseMove}
                            onMouseLeave={handleCardMouseLeave}
                            className="relative"
                        >
                            <GlassCard className="liquid-glass-apple-radius relative min-h-[470px] overflow-hidden px-6 py-8 md:px-10 md:py-12">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(255,255,255,0.35),transparent_36%),radial-gradient(circle_at_88%_90%,rgba(251,113,133,0.2),transparent_42%)]" />
                                <motion.div
                                    style={{ background: glare }}
                                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 hover:opacity-100"
                                />

                                <div style={{ transform: "translateZ(24px)" }} className="relative z-20 flex min-h-[370px] flex-col items-center justify-center text-center">
                                    <h2 className="font-newsreader text-[3.2rem] leading-[0.88] tracking-[-0.03em] text-stone-900 md:text-[4.3rem]">
                                        {renderGhostWord(currentCard.word)}
                                    </h2>

                                    <button
                                        onClick={() => playAudio(currentCard.word)}
                                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/55 bg-white/45 px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors hover:text-stone-800"
                                    >
                                        <Volume2 className="h-4 w-4" />
                                        Pronounce
                                    </button>

                                    <div className={cn(
                                        "mt-4 w-full max-w-2xl rounded-2xl border border-white/55 bg-white/40 px-5 pb-3 pt-4 transition-colors",
                                        isGhostMatched && "border-emerald-300/80 bg-emerald-50/55",
                                    )}>
                                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
                                            <span className={cn(isGhostMatched ? "text-emerald-600" : "text-stone-500")}>
                                                Type directly: A-Z · Backspace delete
                                            </span>
                                            <span className={cn(isGhostMatched ? "text-emerald-600" : "text-stone-400")}>
                                                {isGhostMatched ? "Matched" : "Ghost Spelling"}
                                            </span>
                                        </div>
                                    </div>

                                    {isRevealed ? (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="mt-8 w-full max-w-2xl space-y-4"
                                        >
                                            {displayPosGroups.length > 0 ? (
                                                <div className="grid gap-4 text-left">
                                                    {displayPosGroups.map((group) => {
                                                        const groupKey = `${currentCard.word}-${group.pos}`;
                                                        const isExpanded = expandedPosGroups[groupKey] ?? false;
                                                        const visibleMeanings = isExpanded ? group.meanings : group.meanings.slice(0, 3);
                                                        const hasMore = group.meanings.length > 3;

                                                        return (
                                                            <div key={groupKey} className="rounded-2xl border border-white/60 bg-white/45 p-4">
                                                                <div className="mb-2 flex items-center justify-between gap-3">
                                                                    <span className="rounded-full border border-white/70 bg-white/70 px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.14em] text-stone-700">
                                                                        {group.pos}
                                                                    </span>
                                                                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                                                                        {group.meanings.length} meanings
                                                                    </span>
                                                                </div>

                                                                <div className="space-y-2">
                                                                    {visibleMeanings.map((meaning, meaningIndex) => (
                                                                        <p key={`${groupKey}-${meaningIndex}-${meaning}`} className="text-[15px] leading-8 text-stone-700">
                                                                            {meaning}
                                                                        </p>
                                                                    ))}
                                                                </div>

                                                                {hasMore ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setExpandedPosGroups((prev) => ({ ...prev, [groupKey]: !isExpanded }));
                                                                        }}
                                                                        className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 transition-colors hover:text-stone-700"
                                                                    >
                                                                        {isExpanded ? "Show less" : `Show ${group.meanings.length - 3} more`}
                                                                    </button>
                                                                ) : null}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-xl font-medium leading-relaxed text-stone-800">
                                                    {currentCard.definition || currentCard.translation || "No definition yet."}
                                                </p>
                                            )}

                                            {currentCard.context && (
                                                <div className="mt-2 rounded-2xl border border-white/55 bg-white/45 p-5 text-left">
                                                    <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                                                        <BookOpen className="h-3.5 w-3.5" />
                                                        Context
                                                    </p>
                                                    <p className="font-newsreader text-[1.05rem] italic leading-relaxed text-stone-700">
                                                        &ldquo;{currentCard.context}&rdquo;
                                                    </p>
                                                </div>
                                            )}
                                        </motion.div>
                                    ) : (
                                        <div className="mt-8 rounded-full border border-dashed border-white/60 bg-white/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                                            Press Space Or Reveal Answer
                                        </div>
                                    )}
                                </div>
                            </GlassCard>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            <div className="pointer-events-none fixed inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#f8f7f5] via-[#f8f7f5]/92 to-transparent" />
            <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-5 md:px-6">
                <div className="mx-auto w-full max-w-4xl">
                    {!isRevealed ? (
                        <button
                            onClick={() => setIsRevealed(true)}
                            className="liquid-glass-tap h-14 w-full rounded-2xl border border-[#2c1321]/60 bg-[#2c1321] text-sm font-semibold text-white shadow-[0_22px_36px_-30px_rgba(44,19,33,0.95)] transition-all hover:brightness-110"
                        >
                            Reveal Answer
                        </button>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <RatingButton
                                label="Again"
                                eta="1m"
                                onClick={() => handleRating(Rating.Again)}
                                className="border-rose-200/70 bg-rose-50/75 text-rose-600 hover:bg-rose-100/80"
                            />
                            <RatingButton
                                label="Hard"
                                eta="5m"
                                onClick={() => handleRating(Rating.Hard)}
                                className="border-stone-200/80 bg-white/80 text-stone-600 hover:bg-stone-100/85"
                            />
                            <RatingButton
                                label="Good"
                                eta="1d"
                                onClick={() => handleRating(Rating.Good)}
                                className="border-emerald-200/70 bg-emerald-50/75 text-emerald-600 hover:bg-emerald-100/80"
                            />
                            <RatingButton
                                label="Easy"
                                eta="3d"
                                onClick={() => handleRating(Rating.Easy)}
                                className="border-sky-200/70 bg-sky-50/75 text-sky-600 hover:bg-sky-100/80"
                            />
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
