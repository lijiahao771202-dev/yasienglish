"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { db, VocabItem } from '@/lib/db';
import { archiveVocabularyCard, getRatingEtaLabel, isVocabularyArchived, Rating, scheduleCard } from '@/lib/fsrs';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { ArrowLeft, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { saveVocabulary, updateVocabularyEntry } from '@/lib/user-repository';
import { VocabReviewEditableCard } from '@/components/vocab/VocabReviewEditableCard';
import { pickPreferredMeaningGroups } from '@/lib/vocab-meanings';
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { applyBackgroundThemeToDocument, BACKGROUND_CHANGED_EVENT, getBackgroundThemeSpec, getSavedBackgroundTheme } from "@/lib/background-preferences";

type PosGroup = {
    pos: string;
    meanings: string[];
};

type DictionaryPayload = {
    definition?: string;
    translation?: string;
    pos_groups?: PosGroup[];
};

type AudioContextConstructor = typeof AudioContext;

function getAudioContextClass(): AudioContextConstructor | undefined {
    const audioWindow = window as Window & typeof globalThis & {
        webkitAudioContext?: AudioContextConstructor;
    };

    return audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
}

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

function playRatingEasyChime() {
    try {
        const AudioContextClass = getAudioContextClass();
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        
        // A clean, crisp "ping" or "coin" sound (not mixed chords)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = "sine";
        
        // Quick glide upwards
        const startTime = ctx.currentTime;
        osc.frequency.setValueAtTime(880.00, startTime); // A5
        osc.frequency.exponentialRampToValueAtTime(1760.00, startTime + 0.08); // A6
        
        // Sharp attack, quick decay
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
        
        osc.start(startTime);
        osc.stop(startTime + 0.3);
        
    } catch (e) {
        console.warn("Audio Context not supported", e);
    }
}

function playSuccessChime(combo: number = 1) {
    try {
        const AudioContextClass = getAudioContextClass();
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        
        // C Major scale frequencies
        const baseOctave = 523.25; // C5
        const ratios = [1, 1.122, 1.25, 1.335, 1.5, 1.682, 1.888]; // C D E F G A B
        
        // Calculate note based on combo
        const scaleIndex = (combo - 1) % ratios.length;
        const octaveShift = Math.floor((combo - 1) / ratios.length);
        const freq = baseOctave * ratios[scaleIndex] * Math.pow(2, octaveShift);
        
        const createPianoStrike = (f: number, delay: number, amp: number) => {
            const startTime = ctx.currentTime + delay;
            
            // Main body (triangle gives a nice mellow piano-like fundamental)
            const oscBody = ctx.createOscillator();
            const gainBody = ctx.createGain();
            oscBody.type = "triangle";
            oscBody.frequency.setValueAtTime(f, startTime);
            oscBody.connect(gainBody);
            gainBody.connect(ctx.destination);
            
            // Overtone (sine wave to add clarity and "bell" quality of piano strings)
            const oscOvertone = ctx.createOscillator();
            const gainOvertone = ctx.createGain();
            oscOvertone.type = "sine";
            // 2nd harmonic (octave) is prominent in pianos
            oscOvertone.frequency.setValueAtTime(f * 2.01, startTime); 
            oscOvertone.connect(gainOvertone);
            gainOvertone.connect(ctx.destination);
            
            // Envelope for Body
            gainBody.gain.setValueAtTime(0, startTime);
            // Fast attack like a hammer
            gainBody.gain.linearRampToValueAtTime(amp, startTime + 0.015);
            // Quick decay to sustain level
            gainBody.gain.exponentialRampToValueAtTime(amp * 0.3, startTime + 0.2);
            // Long ringing release
            gainBody.gain.exponentialRampToValueAtTime(0.001, startTime + 1.5);
            
            // Envelope for Overtone (decays faster)
            gainOvertone.gain.setValueAtTime(0, startTime);
            gainOvertone.gain.linearRampToValueAtTime(amp * 0.4, startTime + 0.01);
            gainOvertone.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);
            
            oscBody.start(startTime);
            oscOvertone.start(startTime);
            oscBody.stop(startTime + 1.6);
            oscOvertone.stop(startTime + 0.7);
        };

        // For combo >= 3, add a subtle lower note to form a chord/interval
        if (combo >= 3) {
            const prevIndex = (combo - 3) % ratios.length;
            const prevOctave = Math.floor((combo - 3) / ratios.length);
            const prevFreq = baseOctave * ratios[prevIndex] * Math.pow(2, prevOctave);
            // Strike lower note gently just before the main note (rolled chord)
            createPianoStrike(prevFreq, 0, 0.3);
            createPianoStrike(freq, 0.04, 0.6);
        } else {
            createPianoStrike(freq, 0, 0.7);
        }

    } catch (e) {
        console.warn("Audio Context not supported", e);
    }
}

function playVictoryChime() {
    try {
        const AudioContextClass = getAudioContextClass();
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        
        // Majestic Fanfare: C4(261.63), G4(392.00), C5(523.25), E5(659.25), G5(783.99), C6(1046.50)
        const sweep = [261.63, 392.00, 523.25, 659.25, 783.99]; 
        
        sweep.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = "sine"; 
            
            const startTime = ctx.currentTime + i * 0.05; // extremely fast ascending sweep
            osc.frequency.setValueAtTime(freq, startTime);
            
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.08, startTime + 0.02); 
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.0); 
            
            osc.start(startTime);
            osc.stop(startTime + 1.0);
        });

        // The Grand Climax: Big C Major Chord
        const climaxNotes = [523.25, 659.25, 783.99, 1046.50];
        const climaxStart = ctx.currentTime + sweep.length * 0.05;
        
        climaxNotes.forEach((freq) => {
            // Triangle waves for a rich, brass-like synth pop
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, climaxStart);
            
            gain.gain.setValueAtTime(0, climaxStart);
            gain.gain.linearRampToValueAtTime(0.08, climaxStart + 0.05); // punchy attack
            // Slow majestic decay
            gain.gain.exponentialRampToValueAtTime(0.001, climaxStart + 2.5);
            
            osc.start(climaxStart);
            osc.stop(climaxStart + 2.5);
        });
        
        // Add a sparkling shimmer at the climax
        const shimmer = ctx.createOscillator();
        const shimmerGain = ctx.createGain();
        shimmer.connect(shimmerGain);
        shimmerGain.connect(ctx.destination);
        shimmer.type = "sine";
        shimmer.frequency.setValueAtTime(2093.00, climaxStart); // High C7
        shimmerGain.gain.setValueAtTime(0, climaxStart);
        shimmerGain.gain.linearRampToValueAtTime(0.03, climaxStart + 0.1);
        shimmerGain.gain.exponentialRampToValueAtTime(0.001, climaxStart + 2.0);
        shimmer.start(climaxStart);
        shimmer.stop(climaxStart + 2.0);

    } catch (e) {
        console.warn("Audio Context not supported", e);
    }
}

function RatingButton({
    label,
    eta,
    baseColorClass,
    hoverBgClass,
    onClick,
}: {
    label: string;
    eta: string;
    baseColorClass: string;
    hoverBgClass: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "relative flex h-[64px] md:h-[72px] flex-col items-center justify-center rounded-[1.25rem] border-[3px] border-theme-border bg-theme-card-bg transition-all active:scale-95 group",
                "shadow-[0_4px_0_var(--theme-shadow)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-[4px] active:shadow-none",
                hoverBgClass
            )}
        >
            <span className={cn("block text-[15px] md:text-[16px] font-black tracking-wide transition-colors group-hover:text-current", baseColorClass)}>{label}</span>
            <span className={cn("mt-0.5 md:mt-1 block text-[11px] md:text-[12px] font-bold opacity-50 transition-colors group-hover:text-current group-hover:opacity-70", baseColorClass)}>{eta}</span>
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
    const [spellCombo, setSpellCombo] = useState(0);
    const [showComboAnimation, setShowComboAnimation] = useState(false);
    
    const sessionUser = useAuthSessionUser();
    const backgroundTheme = getSavedBackgroundTheme(sessionUser?.id);
    const backgroundSpec = getBackgroundThemeSpec(backgroundTheme);
    const [, forceBackgroundRefresh] = useState(0);

    useEffect(() => {
        applyBackgroundThemeToDocument(backgroundTheme);
    }, [backgroundTheme]);

    useEffect(() => {
        const onBackgroundChange = () => {
            forceBackgroundRefresh((value) => value + 1);
        };
        window.addEventListener(BACKGROUND_CHANGED_EVENT, onBackgroundChange);
        return () => window.removeEventListener(BACKGROUND_CHANGED_EVENT, onBackgroundChange);
    }, [sessionUser?.id]);

    const ghostMatchedPrevRef = useRef(false);
    const ghostCompletionAudioPlayedRef = useRef(false);

    useEffect(() => {
        const loadCards = async () => {
            const now = Date.now();
            const dueCards = await db.vocabulary
                .where('due')
                .belowOrEqual(now)
                .sortBy('due');

            setQueue(dueCards.filter((item) => !isVocabularyArchived(item)).slice(0, 25));
            setIsLoading(false);
        };

        loadCards();
    }, []);

    const currentCard = queue[currentIndex];
    const ratingPreviewNow = currentCard ? Date.now() : 0;
    const ratingEtas = currentCard ? {
        again: getRatingEtaLabel(currentCard, Rating.Again, ratingPreviewNow),
        hard: getRatingEtaLabel(currentCard, Rating.Hard, ratingPreviewNow),
        good: getRatingEtaLabel(currentCard, Rating.Good, ratingPreviewNow),
        easy: getRatingEtaLabel(currentCard, Rating.Easy, ratingPreviewNow),
    } : null;
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
        setSpellCombo(0);
        setShowComboAnimation(false);
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

        if (rating === Rating.Easy) {
            playRatingEasyChime();
            // A distinct, elegant "level up" starburst for hitting 'Easy'
            const duration = 1000;
            const end = Date.now() + duration;

            (function frame() {
                confetti({
                    particleCount: 3,
                    angle: 90,
                    spread: 45,
                    origin: { x: 0.5, y: 0.8 },
                    colors: ['#10b981', '#fbbf24', '#fef3c7'],
                    startVelocity: 35,
                    gravity: 0.5,
                    shapes: ['star', 'circle'],
                    scalar: 1.2,
                    zIndex: 100
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());
        }

        const updatedCard = scheduleCard(currentCard, rating);
        await saveVocabulary(updatedCard);

        resetCardUiState();
        moveToNextCard();
    }, [currentCard, moveToNextCard, resetCardUiState]);

    const handleArchive = useCallback(async (nextItem: VocabItem, previousWord: string) => {
        const archivedCard = archiveVocabularyCard(nextItem);
        const saved = await updateVocabularyEntry(previousWord, archivedCard);

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
    const autoPlayRef = useRef({ index: -1, revealed: false });
    const cardAnimationControls = useAnimation();

    // Handle auto-playing audio strictly on card appear (index change) OR card flip (isRevealed toggle)
    useEffect(() => {
        if (!currentCard) return;

        let shouldPlay = false;

        if (autoPlayRef.current.index !== currentIndex) {
            autoPlayRef.current.index = currentIndex;
            shouldPlay = true;
        }

        if (isRevealed && !autoPlayRef.current.revealed) {
            shouldPlay = true;
        }
        autoPlayRef.current.revealed = isRevealed;

        if (shouldPlay) {
            playAudio(currentCard.word);
        }
    }, [currentIndex, isRevealed, currentCard, playAudio]);

    const comboTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (isGhostMatched && !ghostMatchedPrevRef.current) {
            const nextCombo = spellCombo + 1;
            setSpellCombo(nextCombo);

            // Execute side effects safely outside of React's setState reducer
            playSuccessChime(nextCombo);
            
            const intensity = Math.min(nextCombo, 10);
            void cardAnimationControls.start({
                scale: [1, 1 + (0.01 * intensity), 1],
                rotate: [0, (Math.random() - 0.5) * intensity, 0],
                filter: [`brightness(1) drop-shadow(0 0 0px rgba(0,0,0,0))`, `brightness(1.1) drop-shadow(0 0 ${10 + intensity * 5}px rgba(${nextCombo > 4 ? '192,132,252' : '52,211,153'}, ${0.3 + intensity * 0.05}))`, `brightness(1) drop-shadow(0 0 0px rgba(0,0,0,0))`],
                transition: { duration: 0.7, type: "tween", ease: "easeInOut" }
            });

            setShowComboAnimation(true);
            
            if (comboTimeoutRef.current) {
                clearTimeout(comboTimeoutRef.current);
            }
            comboTimeoutRef.current = window.setTimeout(() => setShowComboAnimation(false), 2000);

            if (nextCombo < 3) {
                // Low combo: Clean, minimal burst emanating directly from the word text center
                confetti({
                    particleCount: 20 + (nextCombo * 5),
                    spread: 80,
                    origin: { x: 0.5, y: 0.45 },
                    colors: ['#34d399', '#fbbf24', '#cbd5e1', '#ffffff'],
                    startVelocity: 30,
                    gravity: 1,
                    scalar: 0.7,
                    ticks: 80,
                    zIndex: 100,
                    shapes: ['circle', 'star']
                });
            } else if (nextCombo < 6) {
                // Medium combo: Stronger burst on both sides (like a shockwave)
                ['left', 'right'].forEach(side => {
                    confetti({
                        particleCount: 30 + (nextCombo * 5),
                        spread: 80,
                        angle: side === 'left' ? 60 : 120,
                        origin: { x: side === 'left' ? 0.2 : 0.8, y: 0.5 },
                        colors: side === 'left' ? ['#f59e0b', '#fbbf24', '#ffffff'] : ['#8b5cf6', '#c084fc', '#ffffff'],
                        startVelocity: 35 + nextCombo,
                        gravity: 1,
                        scalar: 1,
                        zIndex: 100
                    });
                });
            } else {
                // High combo: Absolute madness / Godlike tier
                confetti({
                    particleCount: 100 + (nextCombo * 10),
                    spread: 160,
                    origin: { x: 0.5, y: 0.5 },
                    colors: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'],
                    startVelocity: 50 + nextCombo * 2,
                    gravity: 0.8,
                    scalar: 1.2,
                    zIndex: 100,
                    shapes: ['star']
                });
            }
        }
        ghostMatchedPrevRef.current = isGhostMatched;
    }, [isGhostMatched, spellCombo, cardAnimationControls]);

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

            if (event.code === "Space" || event.code === "Enter") {
                event.preventDefault();
                setIsRevealed(true); // Always reveal when pressing Space or Enter
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

    // Victory celebration effect
    useEffect(() => {
        if (isFinished && queue.length > 0) {
            playVictoryChime();
            
            const duration = 3.5 * 1000;
            const animationEnd = Date.now() + duration;

            const randomInRange = (min: number, max: number) => {
                return Math.random() * (max - min) + min;
            }

            const frame = () => {
                const timeLeft = animationEnd - Date.now();
                if (timeLeft <= 0) {
                    clearInterval(interval);
                    return;
                }

                const particleCount = 40 * (timeLeft / Math.max(duration, 1));
                
                // Left cannon burst
                confetti({
                    particleCount,
                    angle: 60,
                    spread: 60,
                    origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
                    colors: ['#78ff44', '#29cdff', '#fdff6a', '#a864fd'],
                    zIndex: 100
                });
                // Right cannon burst
                confetti({
                    particleCount,
                    angle: 120,
                    spread: 60,
                    origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
                    colors: ['#78ff44', '#29cdff', '#fdff6a', '#a864fd'],
                    zIndex: 100
                });
            };
            
            const interval = setInterval(frame, 250);
            frame(); // initial burst
        }
    }, [isFinished, queue.length]);

    if (isLoading) {
        return (
            <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-theme-base-bg">
                <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                    <div className={`absolute inset-0 ${backgroundSpec.baseLayer}`} />
                    {backgroundSpec.coverGradient && <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: backgroundSpec.coverGradient, mixBlendMode: 'overlay' }} />}
                    {backgroundSpec.glassLayer && <div className={`absolute inset-0 ${backgroundSpec.glassLayer}`} />}
                </div>
                <div className="relative z-10 flex w-[300px] flex-col items-center gap-4 rounded-[1.5rem] bg-theme-card-bg border-[3px] border-theme-border p-8 shadow-[0_8px_0_var(--theme-shadow)]">
                    <Loader2 className="h-10 w-10 animate-spin text-theme-primary-bg" />
                    <p className="text-sm font-black tracking-wide text-theme-text-muted">正在准备生词本...</p>
                </div>
            </main>
        );
    }

    if (queue.length === 0 || isFinished) {
        return (
            <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-theme-base-bg px-6">
                <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                    <div className={`absolute inset-0 ${backgroundSpec.baseLayer}`} />
                    {backgroundSpec.coverGradient && <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: backgroundSpec.coverGradient, mixBlendMode: 'overlay' }} />}
                    {backgroundSpec.glassLayer && <div className={`absolute inset-0 ${backgroundSpec.glassLayer}`} />}
                </div>
                
                <motion.div initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} className="relative z-10 w-full max-w-sm">
                    <div className="rounded-[1.5rem] bg-theme-card-bg border-[3px] border-theme-border px-8 py-10 text-center shadow-[0_8px_0_var(--theme-shadow)]">
                        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-theme-primary-bg border-[3px] border-theme-border text-theme-primary-text shadow-[0_4px_0_var(--theme-shadow)] overflow-hidden">
                            <span className="text-5xl border-transparent">🎉</span>
                        </div>
                        <h2 className="font-newsreader text-[2.4rem] font-bold text-theme-text tracking-tight">今日已搞定!</h2>
                        <p className="mt-2 text-sm font-black leading-relaxed text-theme-text-muted">
                            复习队列空空如也，真棒！
                        </p>
                        <Link
                            href="/vocab"
                            className="mt-8 flex items-center justify-center rounded-2xl border-[3px] border-theme-border bg-theme-active-bg px-6 py-4 text-[15px] font-black tracking-wider text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)] transition hover:bg-theme-active-hover active:scale-95"
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
        <main className="relative min-h-screen bg-theme-base-bg px-4 pb-12 pt-6 md:px-6 md:pb-12 md:pt-8 font-sans">
            {/* Background Theme Render */}
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                <div className={`absolute inset-0 ${backgroundSpec.baseLayer}`} />
                {backgroundSpec.coverGradient && <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: backgroundSpec.coverGradient, mixBlendMode: 'overlay' }} />}
                {backgroundSpec.glassLayer && <div className={`absolute inset-0 ${backgroundSpec.glassLayer}`} />}
                {backgroundSpec.glowLayer && <div className={`absolute inset-0 ${backgroundSpec.glowLayer}`} />}
                {backgroundSpec.bottomLayer && <div className={`absolute inset-x-0 bottom-0 h-1/2 ${backgroundSpec.bottomLayer}`} />}
                {backgroundSpec.vignetteLayer && <div className={`absolute inset-0 ${backgroundSpec.vignetteLayer}`} />}
            </div>

            <div className="relative z-10 flex w-full flex-col h-[calc(100vh-48px)] overflow-hidden">
                <div className="shrink-0 w-full max-w-[500px] mx-auto mb-4">
                    <div className="flex items-center gap-3 rounded-full bg-theme-base-bg border-[3px] border-theme-border p-2 pl-3 shadow-[0_4px_0_var(--theme-shadow)]">
                        <Link
                            href="/vocab"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-theme-primary-bg border-[2px] border-theme-border text-theme-primary-text shadow-sm transition hover:bg-theme-primary-hover active:scale-95"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                        <div className="min-w-0 flex-1">
                            <div className="h-3 overflow-hidden rounded-full bg-theme-card-bg border-[2px] border-theme-border shadow-inner">
                                <div
                                    className="h-full rounded-full bg-theme-active-bg transition-all duration-300 border-r-[2px] border-theme-border"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-theme-card-bg border-[2px] border-theme-border px-3 py-1 text-[11px] font-black text-theme-text shadow-sm">
                            {currentIndex + 1} / {queue.length}
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-1 pb-24 w-full flex justify-center pretty-scroll">
                    <motion.div animate={cardAnimationControls} className="w-full max-w-[500px] flex flex-col pt-2 relative z-10">
                        
                        {/* Sleek Combo Badge Overlay */}
                        <AnimatePresence>
                            {showComboAnimation && spellCombo > 0 && (
                                <motion.div
                                    key="combo-badge"
                                    initial={{ scale: 0.8, opacity: 0, y: 10, rotate: -5 }}
                                    animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
                                    exit={{ scale: 0.9, opacity: 0, y: -10 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                    className="absolute z-50 -right-2 top-2 pointer-events-none"
                                >
                                    <div className="flex items-center gap-1.5 rounded-2xl border-[3px] border-theme-border bg-theme-base-bg px-3 py-1.5 shadow-[4px_4px_0_var(--theme-shadow)]">
                                        <div className="flex items-center justify-center rounded-full bg-emerald-100 p-1">
                                            <svg className="h-3 w-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-theme-text-muted leading-none">
                                                Combo
                                            </span>
                                            <motion.span
                                                key={`badge-num-${spellCombo}`}
                                                initial={{ scale: 1.5, color: '#fff' }}
                                                animate={{ scale: 1, color: spellCombo < 2 ? "#10b981" : spellCombo < 4 ? "#f59e0b" : "#d946ef" }}
                                                className="font-black text-sm italic leading-none"
                                            >
                                                x{spellCombo}
                                            </motion.span>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence mode="wait">
                            {!isRevealed ? (
                                <motion.div
                                    key={`front-${currentCard.word}`}
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -20, opacity: 0 }}
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    className="w-full flex-shrink-0"
                                >
                                    <div className="flex h-[38vh] min-h-[300px] flex-col items-center justify-center rounded-[2.5rem] border-[3px] border-theme-border bg-theme-card-bg px-8 text-center shadow-[0_8px_0_var(--theme-shadow)]">
                                        <div className="text-[3.8rem] md:text-[4.5rem] font-newsreader font-bold text-theme-text tracking-tight drop-shadow-sm leading-none relative break-words text-center px-4 max-w-full">
                                            {(() => {
                                                let inputCursorTracker = 0;
                                                // Split by whitespace but keep the whitespace tokens
                                                const tokens = currentCard.word.split(/(\s+)/);
                                                
                                                return (
                                                    <>
                                                        {tokens.map((token, tokenIdx) => {
                                                            const isWhitespaceToken = /^\s+$/.test(token);
                                                            
                                                            return (
                                                                <span key={tokenIdx} className={isWhitespaceToken ? "whitespace-pre-wrap" : "inline-block"}>
                                                                    {token.split("").map((char, charIdx) => {
                                                                        const isSpace = /\s/.test(char);
                                                                        
                                                                        const ghostChar = ghostInput[inputCursorTracker]?.toLowerCase();
                                                                        const normalizedChar = char.toLowerCase();
                                                                        
                                                                        let status = "pending";
                                                                        if (ghostChar && !isSpace) {
                                                                            status = ghostChar === normalizedChar ? "correct" : "wrong";
                                                                        }
                                                                        
                                                                        const isCursor = inputCursorTracker === ghostInput.length;
                                                                        if (!isSpace) {
                                                                            inputCursorTracker++;
                                                                        }

                                                                        return (
                                                                            <span key={`${tokenIdx}-${charIdx}`} className="relative inline-block transition-colors duration-150">
                                                                            {isSpace ? (
                                                                                <span className="inline-block w-[0.25em]">&nbsp;</span>
                                                                            ) : (
                                                                                <span className={cn(
                                                                                    status === "correct" && "text-theme-text",
                                                                                    status === "wrong" && "text-red-500",
                                                                                    status === "pending" && "text-theme-text-muted opacity-30"
                                                                                )}>
                                                                                    {char}
                                                                                </span>
                                                                            )}
                                                                                {isCursor && !isSpace && (
                                                                                    <motion.span 
                                                                                        animate={{ opacity: [1, 0, 1] }} 
                                                                                        transition={{ repeat: Infinity, duration: 0.8 }} 
                                                                                        className="absolute -left-[2px] top-[15%] h-[70%] w-[3px] rounded-full bg-emerald-400" 
                                                                                    />
                                                                                )}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </span>
                                                            );
                                                        })}
                                                        {inputCursorTracker === ghostInput.length && (
                                                            <span className="relative">
                                                                <motion.span 
                                                                    animate={{ opacity: [1, 0, 1] }} 
                                                                    transition={{ repeat: Infinity, duration: 0.8 }} 
                                                                    className="absolute -left-[2px] top-[15%] h-[70%] w-[4px] rounded-full bg-theme-active-bg border-[1px] border-theme-border" 
                                                                />
                                                            </span>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    <div className="mt-8 flex justify-center z-10 relative">
                                        <button
                                            onClick={() => setIsRevealed(true)}
                                            className="h-16 w-full max-w-[320px] rounded-[1.5rem] border-[4px] border-theme-border bg-theme-primary-bg text-[16px] font-black tracking-wide text-theme-primary-text shadow-[0_6px_0_var(--theme-shadow)] transition hover:bg-theme-primary-hover active:translate-y-2 active:shadow-none"
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
                                    className="flex flex-col gap-5 w-full"
                                >
                                    <div className="min-h-[150px] h-max rounded-[2rem] border-[3px] border-theme-border bg-theme-card-bg shadow-[0_8px_0_var(--theme-shadow)] relative flex flex-col">
                                        <VocabReviewEditableCard
                                            item={currentCard}
                                            posGroups={displayPosGroups}
                                            expandedPosGroups={expandedPosGroups}
                                            onExpandedPosGroupsChange={setExpandedPosGroups}
                                            onPlayAudio={playAudio}
                                            onArchive={handleArchive}
                                            ghostInput={ghostInput}
                                            onSaved={(savedCard) => {
                                                setQueue((prev) => prev.map((card, index) => (
                                                    index === currentIndex ? savedCard : card
                                                )));
                                            }}
                                        />
                                    </div>

                                    <div className="shrink-0 w-full px-1 py-2">
                                        <div className="grid grid-cols-4 gap-2 md:gap-3">
                                            <RatingButton
                                                label="重来"
                                                eta={ratingEtas?.again ?? "1m"}
                                                onClick={() => handleRating(Rating.Again)}
                                                baseColorClass="text-red-500"
                                                hoverBgClass="hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500"
                                            />
                                            <RatingButton
                                                label="困难"
                                                eta={ratingEtas?.hard ?? "5m"}
                                                onClick={() => handleRating(Rating.Hard)}
                                                baseColorClass="text-amber-500"
                                                hoverBgClass="hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-600"
                                            />
                                            <RatingButton
                                                label="熟悉"
                                                eta={ratingEtas?.good ?? "1d"}
                                                onClick={() => handleRating(Rating.Good)}
                                                baseColorClass="text-blue-500"
                                                hoverBgClass="hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-600"
                                            />
                                            <RatingButton
                                                label="简单"
                                                eta={ratingEtas?.easy ?? "3d"}
                                                onClick={() => handleRating(Rating.Easy)}
                                                baseColorClass="text-emerald-500"
                                                hoverBgClass="hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-600"
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            </div>
        </main>
    );
}
