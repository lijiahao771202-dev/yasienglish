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

    useEffect(() => {
        document.documentElement.setAttribute('data-bg-theme', 'forest-glass');
        return () => {
            const saved = localStorage.getItem('yasi_bg_theme') || 'rose-milk';
            document.documentElement.setAttribute('data-bg-theme', saved);
        };
    }, []);
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
            <main className="theme-forest-glass relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef3ef]">
                <div className="fixed inset-0 z-0">
                    <img
                        src="https://images.unsplash.com/photo-1542273917363-3b1817f69a56?q=80&w=2670&auto=format&fit=crop"
                        alt=""
                        className="h-full w-full object-cover object-[center_30%] scale-105 opacity-80"
                        loading="lazy"
                    />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.1),transparent_50%),linear-gradient(180deg,rgba(240,245,241,0.7),rgba(235,245,238,0.9)_60%,#eef3ef_90%)]" />
                    <div className="absolute inset-0 backdrop-blur-[48px] backdrop-saturate-[1.1] mask-image-[linear-gradient(to_bottom,black_0%,black_100%)]" />
                </div>
                <GlassCard className="liquid-glass-apple-radius relative z-10 flex w-[340px] flex-col items-center gap-3 border-emerald-300/30 bg-white/40 px-6 py-8 text-center shadow-sm backdrop-blur-3xl">
                    <Loader2 className="h-9 w-9 animate-spin text-emerald-800/60" />
                    <p className="text-sm font-bold tracking-wide text-emerald-800">Preparing session...</p>
                </GlassCard>
            </main>
        );
    }

    if (queue.length === 0 || isFinished) {
        return (
            <main className="theme-forest-glass relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef3ef] px-6">
                <div className="fixed inset-0 z-0">
                    <img
                        src="https://images.unsplash.com/photo-1542273917363-3b1817f69a56?q=80&w=2670&auto=format&fit=crop"
                        alt=""
                        className="h-full w-full object-cover object-[center_30%] scale-105 opacity-80"
                        loading="lazy"
                    />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.1),transparent_50%),linear-gradient(180deg,rgba(240,245,241,0.7),rgba(235,245,238,0.9)_60%,#eef3ef_90%)]" />
                    <div className="absolute inset-0 backdrop-blur-[48px] backdrop-saturate-[1.1] mask-image-[linear-gradient(to_bottom,black_0%,black_100%)]" />
                </div>
                <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative z-10 w-full max-w-md">
                    <GlassCard breathe className="liquid-glass-hero liquid-glass-apple-radius border-emerald-300/30 bg-white/40 px-8 py-10 text-center shadow-sm backdrop-blur-3xl">
                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-emerald-200/70 bg-emerald-100/70 text-emerald-600 shadow-inner">
                            <Check className="h-10 w-10" />
                        </div>
                        <h2 className="font-newsreader text-[2.6rem] leading-none text-[#1a3826]">Done For Today</h2>
                        <p className="mt-3 text-sm font-medium leading-6 text-emerald-800/80">
                            The review queue is clear. Splendid effort.
                        </p>
                        <Link
                            href="/vocab"
                            className="liquid-glass-hover liquid-glass-tap mt-7 inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#10b981,#059669)] px-6 py-3 text-sm font-bold text-white shadow-[0_8px_16px_-4px_rgba(16,185,129,0.4)] transition-all hover:brightness-110"
                        >
                            Back to Glossary
                        </Link>
                    </GlassCard>
                </motion.div>
            </main>
        );
    }

    const progress = (currentIndex / queue.length) * 100;

    return (
        <main className="theme-forest-glass relative min-h-screen overflow-hidden bg-[#eef3ef] px-4 pb-28 pt-6 md:px-6 md:pt-8">
            <div className="fixed inset-0 z-0">
                <img
                    src="https://images.unsplash.com/photo-1542273917363-3b1817f69a56?q=80&w=2670&auto=format&fit=crop"
                    alt=""
                    className="h-full w-full object-cover object-[center_30%] scale-105 opacity-80"
                    loading="lazy"
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.1),transparent_50%),linear-gradient(180deg,rgba(240,245,241,0.7),rgba(235,245,238,0.9)_60%,#eef3ef_90%)]" />
                <div className="absolute inset-0 backdrop-blur-[48px] backdrop-saturate-[1.1] mask-image-[linear-gradient(to_bottom,black_0%,black_100%)]" />
            </div>

            <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col">
                <GlassCard className="liquid-glass-apple-radius p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/vocab"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/45 bg-white/35 text-emerald-800 transition-colors hover:text-emerald-950"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800/80">Review Session</p>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/45">
                                <div
                                    className="h-full rounded-full bg-[linear-gradient(135deg,#34d399,#10b981)] transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                        <span className="rounded-full border border-white/50 bg-white/35 px-3 py-1 text-xs font-bold text-emerald-800">
                            {currentIndex + 1} / {queue.length}
                        </span>
                    </div>
                </GlassCard>

                <div className="mt-6">
                    <AnimatePresence mode="wait">
                        {!isRevealed ? (
                            <motion.div
                                key={`front-${currentCard.word}`}
                                initial={{ rotateY: -90, opacity: 0 }}
                                animate={{ rotateY: 0, opacity: 1 }}
                                exit={{ rotateY: 90, opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                                style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                                onMouseMove={handleCardMouseMove}
                                onMouseLeave={handleCardMouseLeave}
                                className="relative"
                            >
                                <GlassCard className="liquid-glass-apple-radius relative min-h-[470px] overflow-hidden px-6 py-8 text-center md:px-10 md:py-12">
                                    <motion.div style={{ background: glare }} className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 hover:opacity-100" />
                                    <div style={{ transform: "translateZ(30px)" }} className="relative z-20 flex min-h-[370px] flex-col items-center justify-center">
                                        <h2 className="font-newsreader text-[4.4rem] leading-[0.88] tracking-[-0.04em] text-[#1a3826] md:text-[6.2rem] drop-shadow-sm">
                                            {currentCard.word}
                                        </h2>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        ) : (
                            <motion.div
                                key={`back-${currentCard.word}`}
                                initial={{ rotateY: -90, opacity: 0 }}
                                animate={{ rotateY: 0, opacity: 1 }}
                                exit={{ rotateY: 90, opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                                style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                                onMouseMove={handleCardMouseMove}
                                onMouseLeave={handleCardMouseLeave}
                                className="relative"
                            >
                                <GlassCard className="liquid-glass-apple-radius relative min-h-[470px] overflow-hidden px-6 py-8 text-left md:px-10 md:py-12">
                                    <motion.div style={{ background: glare }} className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 hover:opacity-100" />
                                    
                                    <div style={{ transform: "translateZ(15px)" }} className="relative z-20 w-full space-y-4">
                                        <div className="flex items-end justify-between gap-4 p-2">
                                            <div className="min-w-0 flex-1">
                                                <input
                                                    value={currentCard.word}
                                                    readOnly
                                                    className="w-full bg-transparent font-newsreader text-[3.2rem] leading-[0.88] tracking-[-0.03em] text-[#1a3826] outline-none transition-colors md:text-[4.3rem] rounded-xl px-2 -ml-2 drop-shadow-sm"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => playAudio(currentCard.word)}
                                                className="liquid-glass-tap inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-200/50 bg-white/40 px-5 py-2 text-sm font-bold text-emerald-800 shadow-[inset_0_1px_rgba(255,255,255,0.8)] hover:bg-white/60"
                                            >
                                                <Volume2 className="h-4 w-4" />
                                                Pronounce
                                            </button>
                                        </div>

                                        <div className="columns-1 md:columns-2 gap-3 space-y-3">
                                            {displayPosGroups.length > 0 ? (
                                                displayPosGroups.map((group) => {
                                                    const groupKey = `${currentCard.word}-${group.pos}`;
                                                    const isExpanded = expandedPosGroups[groupKey] ?? false;
                                                    const visibleMeanings = isExpanded ? group.meanings : group.meanings.slice(0, 4);
                                                    const hasMore = group.meanings.length > 4;

                                                    return (
                                                        <div key={groupKey} className="break-inside-avoid rounded-[1.4rem] border border-white/30 bg-white/20 p-4 shadow-sm backdrop-blur-md">
                                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                                <span className="rounded-full border border-emerald-200/60 bg-white/60 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-emerald-800 drop-shadow-sm">
                                                                    {group.pos}
                                                                </span>
                                                            </div>
                                                            <div className="space-y-2">
                                                                {visibleMeanings.map((meaning, idx) => (
                                                                    <div key={idx} className="relative group">
                                                                        <div className="p-2 flex items-start gap-2 rounded-xl transition-all duration-300 hover:bg-white/20">
                                                                            <p className="min-h-[2rem] flex-1 resize-none bg-transparent text-[15px] leading-relaxed outline-none font-medium text-[#1a3826]/80">
                                                                                {meaning}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {hasMore ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        setExpandedPosGroups((prev) => ({ ...prev, [groupKey]: !isExpanded }));
                                                                    }}
                                                                    className="mt-3 w-full text-center text-xs font-bold uppercase tracking-[0.12em] text-[#345b46]/60 transition-colors hover:text-emerald-700"
                                                                >
                                                                    {isExpanded ? "收起" : `查看余下 ${group.meanings.length - 4} 个`}
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="rounded-[1.4rem] border border-white/30 bg-white/20 p-4 shadow-sm backdrop-blur-md md:col-span-2 xl:col-span-3">
                                                    <p className="w-full resize-none bg-transparent text-[15px] font-medium leading-relaxed text-[#1a3826]/80 outline-none">
                                                        {currentCard.translation || currentCard.definition || "暂无释义和解释..."}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="rounded-[1.4rem] border border-white/30 bg-white/20 p-4 shadow-sm backdrop-blur-md">
                                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-3">
                                                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#345b46]/60">AI EXAMPLE</p>
                                                        {currentCard.source_sentence?.trim() ? (
                                                            <span className="inline-flex rounded-full border border-emerald-200/50 bg-emerald-50/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                                                                {currentCard.source_label || "来源"}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    <p className="mt-2 w-full resize-none rounded-xl px-2 -ml-2 bg-transparent font-newsreader text-[1.2rem] italic leading-relaxed text-[#1a3826] outline-none">
                                                        {currentCard.source_sentence || currentCard.example || "暂无例句。"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="pointer-events-none fixed inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#eef3ef] via-[#eef3ef]/90 to-transparent" />
            <div className="relative z-40 mx-auto mt-6 w-full max-w-4xl px-4 pb-5 md:px-0">
                {!isRevealed ? (
                    <button
                        onClick={() => setIsRevealed(true)}
                        className="liquid-glass-tap h-14 w-full rounded-2xl bg-[linear-gradient(135deg,#10b981,#059669)] text-base font-bold tracking-wide text-white shadow-[0_16px_32px_-8px_rgba(16,185,129,0.5),inset_0_1px_rgba(255,255,255,0.4)] transition-all hover:brightness-110"
                    >
                        Reveal Answer
                    </button>
                ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <RatingButton
                            label="Again"
                            eta="1m"
                            onClick={() => handleRating(Rating.Again)}
                            className="bg-white/40 text-[#1a3826] hover:bg-white/60"
                        />
                        <RatingButton
                            label="Hard"
                            eta="5m"
                            onClick={() => handleRating(Rating.Hard)}
                            className="bg-white/40 text-[#1a3826] hover:bg-white/60"
                        />
                        <RatingButton
                            label="Good"
                            eta="1d"
                            onClick={() => handleRating(Rating.Good)}
                            className="bg-emerald-100/40 text-[#1a3826] hover:bg-emerald-200/60"
                        />
                        <RatingButton
                            label="Easy"
                            eta="3d"
                            onClick={() => handleRating(Rating.Easy)}
                            className="bg-[linear-gradient(135deg,#34d399,#10b981)] text-white shadow-[0_8px_16px_-4px_rgba(16,185,129,0.4)] hover:brightness-110"
                        />
                    </div>
                )}
            </div>
        </main>
    );
}
