import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Target, Waves, Terminal, Eye, Zap, Award, Heart, Globe, Scroll, Sparkles, Ghost, PenTool, Network, Moon, HeartCrack, Smile, Scale } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import { Mark, mergeAttributes } from '@tiptap/core';
import { useGhostSettingsStore } from '@/lib/ghost-settings-store';
import StarterKit from '@tiptap/starter-kit';
import { initBGEWorker, requestEmbeddings } from '@/lib/bge-client';
import { isSameRoot, getMorphologyDiffType, MorphologyDiffType } from '@/lib/nlp';
import {
    buildGhostEmbeddingSource,
    isGhostCompletionResultStale,
    isSelectionAtTextEnd,
    resolveAsyncGhostCompletionAction,
} from '@/lib/ghost-completion';
import { NlpGhostEngine } from '@/lib/nlp-engine';

export const CoachErrorMark = Mark.create({
    name: 'coachError',
    inclusive: false,
    parseHTML() {
        return [{ tag: 'span[data-coach-error]' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, {
            'data-coach-error': 'true',
            class: 'underline decoration-wavy decoration-rose-400 decoration-2 underline-offset-4 bg-rose-500/10 text-rose-900 rounded-sm px-0.5 transition-colors duration-200 cursor-help'
        }), 0];
    },
});

export type PredictionMode = 'deterministic' | 'vector' | 'auto';

interface GhostTextareaProps {
    value: string;
    onChange: (value: string) => void;
    predictionMode?: PredictionMode;
    placeholder?: string;
    disabled?: boolean;
    sourceText?: string;
    referenceAnswer?: string;
    referenceAnswerAlternatives?: string[];
    predictionWordCount?: number;
    className?: string;
    onPredictionRequest?: () => boolean;
    onPredictionShown?: () => void;
    onManualHintRequest?: (currentText?: string) => void;
    isHintLoading?: boolean;
    predictionCostText?: string;
    forcedGhostText?: string;
    forcedGhostVersion?: number;
    fullReferenceGhostText?: string;
    fullReferenceGhostVersion?: number;
    translationKeywords?: string[];
}

const getLoadingAesthetic = (persona?: string) => {
    switch(persona) {
        case 'minimal': return { Icon: Terminal, text: 'HACKING', color: 'text-emerald-400', bg: 'bg-emerald-950/40 border-emerald-500/30 shadow-[0_0_12px_rgba(52,211,153,0.2)]', iconClass: 'animate-pulse' };
        case 'socratic': return { Icon: Eye, text: 'THINKING', color: 'text-amber-500', bg: 'bg-amber-950/30 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]', iconClass: 'animate-[spin_4s_linear_infinite]' };
        case 'strict': return { Icon: Zap, text: 'ANALYZING', color: 'text-slate-200', bg: 'bg-slate-800/80 border-slate-600/50 shadow-[0_0_10px_rgba(148,163,184,0.3)]', iconClass: 'animate-bounce' };
        case 'encouraging': return { Icon: Heart, text: 'CARESSING', color: 'text-pink-500', bg: 'bg-pink-100/50 border-pink-300/50 shadow-[0_0_12px_rgba(236,72,153,0.3)]', iconClass: 'animate-pulse' };
        case 'teacher': return { Icon: PenTool, text: 'GRADING', color: 'text-emerald-600', bg: 'bg-emerald-50/80 border-emerald-200/80 shadow-sm', iconClass: 'animate-[wiggle_1s_ease-in-out_infinite]' };
        case 'tsundere': return { Icon: Sparkles, text: 'SIGHING', color: 'text-rose-500', bg: 'bg-rose-50/80 border-rose-200 shadow-[0_0_10px_rgba(244,63,94,0.2)]', iconClass: 'animate-pulse' };
        case 'ielts_veteran': return { Icon: Award, text: 'EVALUATING', color: 'text-orange-600', bg: 'bg-orange-50/80 border-orange-200 shadow-sm', iconClass: 'animate-pulse' };
        case 'chinglish': return { Icon: Globe, text: 'TRANSLATING', color: 'text-indigo-600', bg: 'bg-indigo-50/80 border-indigo-200 shadow-sm', iconClass: 'animate-[spin_3s_linear_infinite]' };
        case 'ancient': return { Icon: Scroll, text: 'PONDERING', color: 'text-stone-600', bg: 'bg-stone-200/80 border-stone-300 shadow-sm', iconClass: 'animate-pulse' };
        case 'feynman': return { Icon: Network, text: 'CONNECTING', color: 'text-violet-300', bg: 'bg-violet-950/60 border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.3)]', iconClass: 'animate-pulse' };
        case 'tarot': return { Icon: Moon, text: 'DIVINING', color: 'text-fuchsia-400', bg: 'bg-fuchsia-950/60 border-fuchsia-500/20 shadow-sm', iconClass: 'animate-spin-slow' };
        case 'dramatic_ex': return { Icon: HeartCrack, text: 'CRYING', color: 'text-rose-500', bg: 'bg-rose-100/50 border-rose-300 shadow-sm', iconClass: 'animate-bounce' };
        case 'emoji_riddler': return { Icon: Smile, text: 'VIBING', color: 'text-yellow-600', bg: 'bg-yellow-50/80 border-yellow-300 shadow-sm', iconClass: 'animate-[wiggle_1s_ease-in-out_infinite]' };
        case 'lawyer': return { Icon: Scale, text: 'OBJECTING', color: 'text-slate-300', bg: 'bg-slate-900/80 border-slate-600 shadow-sm', iconClass: 'animate-pulse' };
        case 'roleplay': return { Icon: Ghost, text: 'ACTING', color: 'text-purple-500', bg: 'bg-purple-100/60 border-purple-300 shadow-sm', iconClass: 'animate-bounce' };
        default: return { Icon: Sparkles, text: 'THINKING', color: 'text-sky-500', bg: 'bg-sky-50/80 border-sky-200 shadow-sm', iconClass: 'animate-spin' };
    }
};

const PersonaLoader = ({ persona }: { persona?: string }) => {
    const style = getLoadingAesthetic(persona);
    const { Icon } = style;
    return (
        <motion.span 
            initial={{ opacity: 0, scale: 0.9, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, filter: 'blur(4px)', originX: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
            className={cn(
                "inline-flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full border backdrop-blur-md align-[1px] select-none",
                style.bg,
                style.color
            )}
        >
            <Icon className={cn("w-3.5 h-3.5", style.iconClass)} strokeWidth={2.5} />
            <motion.span 
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="text-[9.5px] font-black tracking-widest uppercase"
            >
                {style.text}
            </motion.span>
        </motion.span>
    );
};

function getCleanText(editor: Editor) {
    let text = "";
    let isFirstParagraph = true;
    editor.state.doc.descendants((node) => {
        if (node.type.name === 'paragraph') {
            if (!isFirstParagraph) text += "\n";
            isFirstParagraph = false;
        } else if (node.isText) {
            const isStrike = node.marks?.some(mark => mark.type.name === 'strike');
            if (!isStrike) text += node.text;
        }
    });
    return text.trimStart();
}

// ═══════════════════════════════════════════════
// Deterministic Engine (0ms)
// ═══════════════════════════════════════════════
// Features:
//   1. Position-aware: knows which ref word the user is on
//   2. Multi-word lookahead: after matching, appends next words
//   3. Fuzzy typo tolerance: Levenshtein 1 matching
//   4. Space-triggered: after completing a word, suggests next word

const COMMON_SYNONYMS: Record<string, string[]> = {
    'buy': ['purchase', 'acquire', 'get'],
    'purchase': ['buy', 'acquire', 'get'],
    'big': ['large', 'huge', 'massive', 'giant'],
    'large': ['big', 'huge', 'massive', 'giant'],
    'small': ['little', 'tiny', 'mini', 'miniature'],
    'little': ['small', 'tiny', 'mini', 'miniature'],
    'fast': ['quick', 'rapid', 'swift', 'speedy'],
    'quick': ['fast', 'rapid', 'swift', 'speedy'],
    'build': ['construct', 'create', 'make'],
    'construct': ['build', 'create', 'make'],
    'start': ['begin', 'commence', 'initiate'],
    'begin': ['start', 'commence', 'initiate'],
    'end': ['finish', 'complete', 'stop', 'conclude'],
    'finish': ['end', 'complete', 'stop', 'conclude'],
    'smart': ['clever', 'intelligent', 'bright', 'brilliant'],
    'clever': ['smart', 'intelligent', 'bright', 'brilliant'],
    'hard': ['difficult', 'tough', 'challenging'],
    'difficult': ['hard', 'tough', 'challenging'],
    'easy': ['simple', 'effortless', 'straightforward'],
    'simple': ['easy', 'effortless', 'straightforward'],
    'good': ['great', 'excellent', 'fine', 'superb'],
    'great': ['good', 'excellent', 'fine', 'superb'],
    'bad': ['awful', 'terrible', 'poor', 'dreadful'],
    'awful': ['bad', 'terrible', 'poor', 'dreadful'],
    'happy': ['glad', 'joyful', 'cheerful', 'delighted'],
    'glad': ['happy', 'joyful', 'cheerful', 'delighted'],
    'sad': ['unhappy', 'sorrowful', 'miserable', 'depressed'],
    'eat': ['consume', 'devour', 'dine'],
    'consume': ['eat', 'devour', 'dine'],
    'drink': ['sip', 'gulp', 'swallow'],
    'say': ['speak', 'tell', 'state', 'declare'],
    'speak': ['say', 'tell', 'state', 'declare'],
    'see': ['look', 'watch', 'observe', 'view'],
    'look': ['see', 'watch', 'observe', 'view'],
    'use': ['utilize', 'employ', 'apply', 'operate'],
    'utilize': ['use', 'employ', 'apply', 'operate'],
    'cheap': ['inexpensive', 'affordable', 'low-cost'],
    'inexpensive': ['cheap', 'affordable', 'low-cost'],
    'expensive': ['costly', 'pricey', 'dear'],
    'costly': ['expensive', 'pricey', 'dear'],
};

function isSemanticSynonymPrefix(userWord: string, refWord: string): boolean {
    if (userWord.length < 2) return false;
    const syns = COMMON_SYNONYMS[refWord.toLowerCase()] || [];
    return syns.some(s => s.startsWith(userWord.toLowerCase()));
}

function shareStem(u: string, r: string): boolean {
    if (u.length <= 3) return false;
    // VERY primitive English stem sharing: check if they share first 4 chars
    return u.substring(0, 4) === r.substring(0, 4);
}

function deterministicComplete(
    fullText: string,
    referenceAnswer: string, 
    allRefs?: string[],
    stuckExtras: number = 0,
    allowAutocorrect: boolean = true,
    fuzzyTolerance: number = 1,
    allowDuplicates: boolean = false,
    semanticBranchingEnabled: boolean = false,
    grammarCompensationEnabled: boolean = false
): { ghost: string; isReplacement?: boolean; fuzzy?: boolean } | null {
    const inputWords = fullText.trimStart().toLowerCase().split(/[\s,?!;.]+/).filter(Boolean);
    const endsAtWordBoundary = /[\s,?!;.]$/.test(fullText);
    const m = inputWords.length;
    
    // Stop if empty
    if (m === 0) return null;
    
    const refSources = [referenceAnswer, ...(allRefs || [])];
    
    for (const ref of refSources) {
        const refWordsRaw = ref.replace(/[^a-zA-Z'’\s-]/g, '').split(/\s+/).filter(w => w.length > 0);
        const refWords = refWordsRaw.map(w => w.toLowerCase());
        const n = refWords.length;
        
        let minCost = Infinity;
        let expectedRefIndex = -1;

        const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(Infinity));
        
        // Allow user input to start matching from ANY point in the reference for free
        for (let j = 0; j <= n; j++) {
            dp[0][j] = 0;
        }

        for (let i = 0; i <= m; i++) {
            for (let j = 0; j <= n; j++) {
                if (i < m && j < n) {
                    const isPartial = (!endsAtWordBoundary) && (i === m - 1);
                    const uWordRaw = inputWords[i];
                    const uWord = uWordRaw.replace(/[^a-z'’-]/g, '');
                    const rWord = refWords[j];
                    let cost = 1.5;
                    
                    if (uWord.length === 0) cost = 1.5;
                    else if (uWord === rWord) cost = 0;
                    else if (isPartial && rWord.startsWith(uWord)) cost = 0;
                    else if (grammarCompensationEnabled && shareStem(uWord, rWord)) cost = 0.1;
                    else if (allowAutocorrect && fuzzyTolerance > 0 && levenshtein(uWord, rWord) <= fuzzyTolerance) cost = 0.5;
                    else if (allowAutocorrect && fuzzyTolerance > 0 && isPartial && uWord.length >= 2 && levenshtein(uWord, rWord.slice(0, uWord.length)) <= (fuzzyTolerance === 2 ? 1 : 0)) cost = 0.5;
                    else if (semanticBranchingEnabled && isSemanticSynonymPrefix(uWord, rWord)) cost = 0.1;

                    if (dp[i][j] + cost < dp[i+1][j+1]) {
                        dp[i+1][j+1] = dp[i][j] + cost;
                    }
                }
                if (i < m && dp[i][j] + 1 < dp[i+1][j]) {
                    dp[i+1][j] = dp[i][j] + 1; // Penalty for skipping user word remains 1
                }
                if (j < n && dp[i][j] + 0.01 < dp[i][j+1]) {
                    dp[i][j+1] = dp[i][j] + 0.01; // Negligible penalty for skipping reference words (turns off skip penalty while preserving left-to-right preference)
                }
            }
        }

        // Find ALL candidate endings that pass the distance threshold
        let bestCandidate: { cost: number, refIndex: number, ghostStr: string, isRep: boolean, uWordMatchEnded: boolean } | null = null;
        
        for (let j = 0; j <= n; j++) {
            const cost = dp[m][j];
            if (cost <= Math.max(1.0, m * 0.8)) {
                let ghostStr = '';
                let isRep = false;
                let uWordMatchEnded = false;
                let valid = true;
                
                if (!endsAtWordBoundary) {
                    const uWordRaw = inputWords[m - 1];
                    const uWord = uWordRaw.replace(/[^a-z'’-]/g, '');
                    const rWordRaw = refWordsRaw[j - 1];
                    const rWordLower = refWords[j - 1];
                    
                    if (!rWordLower || uWord.length === 0) {
                        valid = false;
                    } else if (rWordLower.startsWith(uWord)) {
                        ghostStr = rWordRaw.slice(uWord.length);
                        uWordMatchEnded = rWordLower === uWord;
                    } else if (grammarCompensationEnabled && isSameRoot(uWord, rWordLower)) {
                        ghostStr = rWordRaw;
                        isRep = true;
                        uWordMatchEnded = true;
                    } else if (allowAutocorrect && uWord.length >= 2 && levenshtein(uWord, rWordLower.slice(0, uWord.length)) <= 1) {
                        ghostStr = rWordRaw;
                        isRep = true;
                        uWordMatchEnded = true;
                    } else if (semanticBranchingEnabled && isSemanticSynonymPrefix(uWord, rWordLower)) {
                        ghostStr = rWordRaw;
                        isRep = true;
                        uWordMatchEnded = true;
                    } else {
                        valid = false;
                    }
                } else if (grammarCompensationEnabled) {
                    const uWordRaw = inputWords[m - 1];
                    const uWord = uWordRaw?.replace(/[^a-z'’-]/g, '');
                    const rWordRaw = refWordsRaw[j - 1];
                    const rWordLower = refWords[j - 1];

                    // If text ended at word boundary (e.g. space), check if the last word should be grammar-compensated
                    if (rWordLower && uWord && rWordLower !== uWord && uWord.length > 0) {
                        ghostStr = rWordRaw;
                        isRep = true;
                        uWordMatchEnded = true;
                    }
                }

                if (valid && !allowDuplicates) {
                    const rWordLower = refWords[j - 1];
                    if (rWordLower) {
                        let refCount = 0;
                        for (const w of refWords) if (w === rWordLower) refCount++;

                        let inputCount = 0;
                        for (const wRaw of inputWords.slice(0, m - 1)) {
                            const w = wRaw.replace(/[^a-z'’-]/g, '');
                            if (w.length > 0 && w === rWordLower) inputCount++;
                        }
                        if (inputCount >= refCount) {
                            valid = false;
                        }
                    }
                }
                
                if (valid) {
                    if (!bestCandidate || cost < bestCandidate.cost) {
                        bestCandidate = { cost, refIndex: j - 1, ghostStr, isRep, uWordMatchEnded };
                    }
                }
            }
        }
        
        if (bestCandidate) {
            let { ghostStr, isRep, uWordMatchEnded, refIndex } = bestCandidate;
            
            const WATERFALL_LIMIT = stuckExtras; // Extra words ONLY applied if user was stuck
            const nextWords = refWordsRaw.slice(refIndex + 1, refIndex + 1 + WATERFALL_LIMIT);
            
            if (nextWords.length > 0) {
                if (isRep) ghostStr += ' ' + nextWords.join(' ');
                else if (ghostStr.length > 0) ghostStr += ' ' + nextWords.join(' ');
                else ghostStr = (!endsAtWordBoundary && uWordMatchEnded) ? ' ' + nextWords.join(' ') : nextWords.join(' ');
            }
            
            if (ghostStr) return { ghost: ghostStr, isReplacement: isRep };
        }
    }
    
    return null;
}

// Stem matching fully outsourced to NLP module isSameRoot()

// Minimal Levenshtein distance (only compute up to max 2)
function levenshtein(a: string, b: string): number {
    if (Math.abs(a.length - b.length) > 2) return 3;
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

const getTextColorClass = (color: string) => {
    switch(color) {
        case 'blue': return 'text-blue-500 dark:text-blue-400';
        case 'purple': return 'text-purple-500 dark:text-purple-400';
        case 'rose': return 'text-rose-500 dark:text-rose-400';
        case 'amber': return 'text-amber-500 dark:text-amber-400';
        case 'emerald': return 'text-emerald-500 dark:text-emerald-400';
        default: return 'text-teal-500 dark:text-teal-400'; // teal is the theme default
    }
};

const getVectorColorClass = (color: string) => {
    switch(color) {
        case 'blue': return 'text-orange-500 dark:text-orange-400';
        case 'purple': return 'text-amber-500 dark:text-amber-400';
        case 'rose': return 'text-teal-500 dark:text-teal-400';
        case 'amber': return 'text-indigo-500 dark:text-indigo-400';
        case 'emerald': return 'text-rose-500 dark:text-rose-400';
        default: return 'text-fuchsia-500 dark:text-fuchsia-400'; // teal -> fuchsia
    }
};

const getTextColorClassHeavy = (color: string) => {
    switch(color) {
        case 'blue': return 'text-blue-600 dark:text-blue-500';
        case 'purple': return 'text-purple-600 dark:text-purple-500';
        case 'rose': return 'text-rose-600 dark:text-rose-500';
        case 'amber': return 'text-amber-600 dark:text-amber-500';
        case 'emerald': return 'text-emerald-600 dark:text-emerald-500';
        default: return 'text-teal-600 dark:text-teal-500';
    }
};

const getVectorColorClassHeavy = (color: string) => {
    switch(color) {
        case 'blue': return 'text-orange-600 dark:text-orange-500';
        case 'purple': return 'text-amber-600 dark:text-amber-500';
        case 'rose': return 'text-teal-600 dark:text-teal-500';
        case 'amber': return 'text-indigo-600 dark:text-indigo-500';
        case 'emerald': return 'text-rose-600 dark:text-rose-500';
        default: return 'text-fuchsia-600 dark:text-fuchsia-500'; 
    }
};

export function GhostTextarea({
    value,
    onChange,
    placeholder = "Type here...",
    disabled = false,
    sourceText,
    referenceAnswer,
    referenceAnswerAlternatives,
    predictionWordCount = 2,
    className,
    onPredictionRequest,
    onPredictionShown,
    predictionCostText,
    forcedGhostText,
    forcedGhostVersion,
    fullReferenceGhostText,
    fullReferenceGhostVersion,
    onManualHintRequest,
    isHintLoading,
    predictionMode = 'auto',
    translationKeywords = [],
}: GhostTextareaProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [ghostText, setGhostText] = useState('');
    const [fullReferenceGhost, setFullReferenceGhost] = useState('');
    type GhostSource = 'none' | 'deterministic' | 'vector' | 'nlp';
    const [ghostSource, setGhostSource] = useState<GhostSource>('none');
    const [isReplacement, setIsReplacement] = useState(false);
    const [replaceWordCount, setReplaceWordCount] = useState(0); // 0 = suffix, >0 = replacement of N preceding words
    const [ghostConfidence, setGhostConfidence] = useState(1);
    const [morphologyWarning, setMorphologyWarning] = useState<{uWord: string, rWord: string, type: MorphologyDiffType} | null>(null); // 0-1, used for opacity
    const [cursorCoords, setCursorCoords] = useState<{ left: number; top: number; fixedLeft: number; fixedTop: number } | null>(null);
    const rescueColorState = useGhostSettingsStore(s => s.rescueColor);
    const maxReferenceAlternatives = useGhostSettingsStore(s => s.maxReferenceAlternatives);

    const containerRef = useRef<HTMLDivElement>(null);
    const isInternalUpdate = useRef(false);
    const prevInputRef = useRef('');
    const prevGhostRef = useRef('');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastKeystrokeTimeRef = useRef<number>(Date.now());
    const stuckExtrasRef = useRef<number>(0);
    const editorRef = useRef<Editor | null>(null);

    // ═══════════════════════════════════════════════
    // Vector Engine (with cache)
    // ═══════════════════════════════════════════════
    type EmbeddingEntry = { word: string; embedding: number[] };
    const refWordEmbeddings = useRef<EmbeddingEntry[]>([]);
    const refWordMaxCounts = useRef<Record<string, number>>({});
    const embeddingInitRef = useRef('');
    const embeddingCache = useRef<Map<string, number[]>>(new Map());

    useEffect(() => {
        initBGEWorker();
    }, []);

    useEffect(() => {
        const { texts, key } = buildGhostEmbeddingSource(referenceAnswer, referenceAnswerAlternatives, maxReferenceAlternatives);
        if (!referenceAnswer || embeddingInitRef.current === key) return;
        embeddingInitRef.current = key;
        refWordEmbeddings.current = [];
        embeddingCache.current.clear();

        const newMaxCounts: Record<string, number> = {};
        const allRawWords: string[] = [];
        
        for (const text of texts) {
             const wordsInText = text.toLowerCase().replace(/[^a-z'\s-]/g, '').split(/\s+/).filter(w => w.length > 0);
             const countsInText: Record<string, number> = {};
             for (const w of wordsInText) {
                 countsInText[w] = (countsInText[w] || 0) + 1;
                 allRawWords.push(w);
             }
             for (const w in countsInText) {
                 newMaxCounts[w] = Math.max(newMaxCounts[w] || 0, countsInText[w]);
             }
        }
        refWordMaxCounts.current = newMaxCounts;

        const words = [...new Set(allRawWords.filter(w => w.length > 1))];

        if (words.length === 0) return;
        requestEmbeddings(words).then(embeddings => {
            if (embeddings && embeddings.length) {
                refWordEmbeddings.current = words.map((w, i) => ({ word: w, embedding: embeddings[i] }));
            }
        }).catch(() => {});
    }, [referenceAnswer, referenceAnswerAlternatives, maxReferenceAlternatives]);

    const cosineSim = (a: number[], b: number[]): number => {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
        return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
    };

    // Phrase-level vector completion with cache
    // Returns { word, similarity } for confidence-based rendering
    const vectorComplete = useCallback(async (fullText: string): Promise<{ word: string; sim: number, replaceCount: number } | null> => {
        if (refWordEmbeddings.current.length === 0) return null;
        
        const words = fullText.trim().toLowerCase().split(/\s+/);
        const endsAtWordBoundary = /(?:\s|[.,?!;])$/.test(fullText);
        const partial = endsAtWordBoundary ? '' : (words[words.length - 1] || '');
        if (words.length === 0) return null;
        
        // We will evaluate contexts of length 1, 2, and 3 to see which phrase aligns best with a single reference word.
        
        try {
            let globalBestWord = '', globalBestSim = 0.4, globalBestWindow = 1;

            const inputCounts = new Map<string, number>();
            const queryWords = endsAtWordBoundary ? words : words.slice(0, -1);
            for (const wRaw of queryWords) {
                const w = wRaw.replace(/[^a-z'’-]/g, '');
                if (w) inputCounts.set(w, (inputCounts.get(w) || 0) + 1);
            }

             for (let windowSize = 1; windowSize <= Math.min(3, queryWords.length); windowSize++) {
                const contextStr = queryWords.slice(-windowSize).join(' ');
                const queryKey = contextStr;
                
                let queryEmb = embeddingCache.current.get(queryKey);
                if (!queryEmb) {
                    const embeddings = await requestEmbeddings([contextStr]).catch(() => null);
                    if (!embeddings || !embeddings[0]) continue;
                    queryEmb = embeddings[0];
                    if (embeddingCache.current.size > 50) embeddingCache.current.clear();
                    embeddingCache.current.set(queryKey, queryEmb);
                }

                let bestWindowWord = '', bestWindowSim = 0;
                for (const entry of refWordEmbeddings.current) {
                    const { allowDuplicates } = useGhostSettingsStore.getState();
                    if (!allowDuplicates) {
                        const maxAllowed = refWordMaxCounts.current[entry.word] || 1;
                        if ((inputCounts.get(entry.word) || 0) >= maxAllowed) continue;
                    }
                    if (partial && entry.word === partial) continue;
                    let sim = cosineSim(queryEmb, entry.embedding);
                    // Fallback: If it's a direct prefix in window 1, ensure it passes the threshold
                    if (partial && windowSize === 1 && entry.word.startsWith(partial)) {
                        sim = Math.max(sim, 0.85); // High enough to trigger and show confidence
                    }
                    if (sim > bestWindowSim) { bestWindowSim = sim; bestWindowWord = entry.word; }
                }

                if (bestWindowSim > globalBestSim) {
                    globalBestSim = bestWindowSim;
                    globalBestWord = bestWindowWord;
                    globalBestWindow = windowSize;
                }
            }

            if (!globalBestWord) return null;
            const isRepl = globalBestWindow > 1 || (partial ? !globalBestWord.startsWith(partial.slice(-1).toLowerCase()) : false);
            let resultWord = (globalBestWindow === 1 && partial && globalBestWord.startsWith(partial)) ? globalBestWord.slice(partial.length) : globalBestWord;
            if (endsAtWordBoundary && !isRepl && !resultWord.startsWith(' ')) {
                resultWord = " " + resultWord;
            }
            return { word: resultWord, sim: globalBestSim, replaceCount: isRepl ? globalBestWindow : 0 };
        } catch { return null; }
    }, []);

    // ═══════════════════════════════════════════════
    // Ghost management
    // ═══════════════════════════════════════════════
    const clearGhost = useCallback(() => {
        setGhostText('');
        setGhostSource('none');
        setIsReplacement(false);
        setReplaceWordCount(0);
        setGhostConfidence(1);
        setMorphologyWarning(null);
        prevGhostRef.current = '';
    }, []);

    // Combined pipeline: deterministic (0ms) → vector fallback (120ms)
    const runCompletion = useCallback(async (clean: string, stuckExtras: number = 0) => {
        if (!referenceAnswer) { clearGhost(); return; }

        const {
            autocorrectEnabled, maxReferenceAlternatives, fuzzyTolerance, algorithmMode, allowDuplicates, semanticBranchingEnabled, grammarCompensationEnabled,
            // NLP specific
            nlpShowMorphologyUI, nlpChunkWaterfallEnabled, nlpWaterfallDepth, nlpAutocorrectEnabled, nlpFuzzyTolerance, nlpSemanticBranchingEnabled, nlpGrammarCompensationEnabled
        } = useGhostSettingsStore.getState();
        const clampedAlts = referenceAnswerAlternatives?.slice(0, maxReferenceAlternatives) || [];

        const effectiveMode = predictionMode === 'vector' ? 'vector' : algorithmMode;

        // Layer 1: Deterministic / NLP
        if (effectiveMode === 'auto' || effectiveMode === 'deterministic' || effectiveMode === 'nlp') {
            if (effectiveMode === 'nlp') {
                const engine = new NlpGhostEngine({
                    nlpChunkWaterfallEnabled,
                    nlpWaterfallDepth,
                    nlpAutocorrectEnabled,
                    nlpFuzzyTolerance,
                    nlpSemanticBranchingEnabled,
                    nlpGrammarCompensationEnabled,
                    allowDuplicates
                }, {
                    embeddingCache: embeddingCache.current,
                    requestEmbeddings,
                    refWordEmbeddings: refWordEmbeddings.current || []
                });
                const detResult = await engine.predict(
                    clean, referenceAnswer, clampedAlts,
                    stuckExtras
                );

                const asyncAction = resolveAsyncGhostCompletionAction({
                    requestedInput: clean,
                    latestInput: prevInputRef.current,
                    hasResult: Boolean(detResult),
                });

                if (asyncAction === 'ignore') {
                    return;
                }
                if (asyncAction === 'apply' && detResult) {
                    setGhostText(detResult.ghost);
                    setGhostSource('nlp');
                    setIsReplacement(!!detResult.isReplacement);
                    setReplaceWordCount(detResult.isReplacement ? 1 : 0);
                    setGhostConfidence(1);
                    setMorphologyWarning(nlpShowMorphologyUI ? (detResult.morphologyDiff ?? null) : null);
                    prevGhostRef.current = detResult.ghost;
                    return;
                }

                if (asyncAction === 'clear') {
                    clearGhost();
                    setMorphologyWarning(null);
                    return;
                }
            } else {
                const detResult = deterministicComplete(clean, referenceAnswer, clampedAlts, stuckExtras, autocorrectEnabled, fuzzyTolerance, allowDuplicates, semanticBranchingEnabled, grammarCompensationEnabled);

                if (detResult) {
                    setGhostText(detResult.ghost);
                    setGhostSource('deterministic');
                    setIsReplacement(!!detResult.isReplacement);
                    setReplaceWordCount(detResult.isReplacement ? 1 : 0);
                    setGhostConfidence(1);
                    setMorphologyWarning(null);
                    prevGhostRef.current = detResult.ghost;
                    return;
                }
            }

            if (predictionMode === 'deterministic' || effectiveMode === 'nlp') {
                clearGhost();
                setMorphologyWarning(null);
                return;
            }
        }

        // Below layers require SOME text
        const hasValidText = /[a-zA-Z']/.test(clean);
        if (!hasValidText) { clearGhost(); return; }

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            // Layer 2: Vector semantic (phrase-level, cached, 150ms debounce)
            if (effectiveMode === 'auto' || effectiveMode === 'vector') {
                const result = await vectorComplete(clean);
                if (isGhostCompletionResultStale(clean, prevInputRef.current)) return;
                if (result) {
                    setGhostText(result.word);
                    setGhostSource('vector');
                    setIsReplacement(result.replaceCount > 0);
                    setReplaceWordCount(result.replaceCount);
                    // Map similarity (0.4-1.0) to confidence (0.3-1.0)
                    setGhostConfidence(Math.max(0.3, Math.min(1, (result.sim - 0.4) / 0.6)));
                    prevGhostRef.current = result.word;
                    return;
                }
                if (effectiveMode === 'vector') {
                    clearGhost();
                    return;
                }
            }
            
            clearGhost();
        }, 150);
    }, [referenceAnswer, referenceAnswerAlternatives, vectorComplete, clearGhost, sourceText, predictionMode]);

    const typographyClass = className || "p-6 text-xl font-medium font-sans leading-[1.8] tracking-[0.015em] min-h-[160px]";

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false, bulletList: false, orderedList: false,
                listItem: false, blockquote: false, codeBlock: false, horizontalRule: false,
            }),
            CoachErrorMark
        ],
        content: value,
        editable: !disabled,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: cn(
                    "relative z-10 w-full resize-none bg-transparent text-left outline-none whitespace-pre-wrap break-words border-none focus:ring-0 focus:outline-none",
                    "text-stone-900 dark:text-stone-100",
                    "caret-stone-900 dark:caret-white",
                    typographyClass
                ),
                style: "color: #1c1917; -webkit-text-fill-color: #1c1917; opacity: 1;"
            }
        },
        onFocus: () => setIsFocused(true),
        onBlur: () => {
            setIsFocused(false);
            if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
        },
        onSelectionUpdate: ({ editor }) => {
            if (!containerRef.current) return;
            try {
                let targetPos = editor.state.selection.to;
                const coords = editor.view.coordsAtPos(targetPos);
                const rect = containerRef.current.getBoundingClientRect();
                setCursorCoords({
                    left: coords.left - rect.left,
                    top: coords.bottom - rect.top,
                    fixedLeft: coords.left,
                    fixedTop: coords.bottom
                });
                const clean = getCleanText(editor);
                const textBeforeSelection = editor.state.doc.textBetween(0, editor.state.selection.from, "\n", "\n").trimStart();
                if (!isSelectionAtTextEnd(clean, textBeforeSelection)) {
                    clearGhost();
                }
            } catch (err) {}
        },
        onUpdate: ({ editor }) => {
            if (isInternalUpdate.current) return;
            const clean = getCleanText(editor);
            onChange(clean);

            const prev = prevInputRef.current;
            prevInputRef.current = clean;

            if (debounceRef.current) clearTimeout(debounceRef.current);

            // Ghost advancing: typed char matches ghost → consume (only for suffix completions)
            const currentGhost = prevGhostRef.current;
            if (currentGhost && !isReplacement && clean.length === prev.length + 1 && clean.startsWith(prev)) {
                const typedChar = clean[clean.length - 1];
                if (currentGhost[0]?.toLowerCase() === typedChar.toLowerCase()) {
                    const remaining = currentGhost.slice(1);
                    setGhostText(remaining);
                    prevGhostRef.current = remaining;
                    if (!remaining) { setGhostSource('none'); setGhostConfidence(1); }
                    return;
                }
            }

            // Run completion — triggers on any text change (including backspace)
            const hasLetters = /[a-zA-Z]/.test(clean);
            const textBeforeSelection = editor.state.doc.textBetween(0, editor.state.selection.from, "\n", "\n").trimStart();
            const caretAtTextEnd = isSelectionAtTextEnd(clean, textBeforeSelection);

            const { 
                passiveRescueEnabled, passiveRescueTimeoutSeconds, 
                activeRescueEnabled, activeRescueTimeoutSeconds,
                passiveRescueWordCount, activeRescueWordCount
            } = useGhostSettingsStore.getState();

            if (!caretAtTextEnd) {
                lastKeystrokeTimeRef.current = Date.now();
                stuckExtrasRef.current = 0;
                clearGhost();
                if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
                return;
            }

            if (hasLetters && clean.trim().length > 0) {
                const now = Date.now();
                const timeSinceLastKey = now - lastKeystrokeTimeRef.current;
                lastKeystrokeTimeRef.current = now;

                // Reset stuck extras if space is typed (start of a new word)
                if (/\s$/.test(clean)) {
                    stuckExtrasRef.current = 0;
                } else if (activeRescueEnabled && timeSinceLastKey > activeRescueTimeoutSeconds * 1000) {
                    if (activeRescueWordCount === 0) {
                        const rand = Math.random();
                        if (rand < 0.70) stuckExtrasRef.current = 1;
                        else if (rand < 0.95) stuckExtrasRef.current = 2;
                        else stuckExtrasRef.current = 3;
                    } else {
                        stuckExtrasRef.current = activeRescueWordCount;
                    }
                }

                void runCompletion(clean, stuckExtrasRef.current);

                // Setup passive rescue: if user is completely paralyzed and doesn't type at all
                if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
                if (passiveRescueEnabled) {
                    stuckTimerRef.current = setTimeout(() => {
                        if (editor && editor.isFocused) {
                            const currentClean = getCleanText(editor);
                            if (passiveRescueWordCount === 0) {
                                const rand = Math.random();
                                if (rand < 0.70) stuckExtrasRef.current = 1;      
                                else if (rand < 0.95) stuckExtrasRef.current = 2; 
                                else stuckExtrasRef.current = 3;                  
                            } else {
                                stuckExtrasRef.current = passiveRescueWordCount;
                            }
                            void runCompletion(currentClean, stuckExtrasRef.current);
                        }
                    }, passiveRescueTimeoutSeconds * 1000);
                }

            } else {
                lastKeystrokeTimeRef.current = Date.now();
                stuckExtrasRef.current = 0;
                clearGhost();
                if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
            }
        }
    });

    useEffect(() => { editorRef.current = editor ?? null; }, [editor]);

    // Note: Error highlighting has been removed since the AI Coach tip UI was deprecated.
    // 

    // Sync value from parent
    useEffect(() => {
        if (editor) {
            const currentClean = getCleanText(editor);
            if (value !== currentClean) {
                isInternalUpdate.current = true;
                if (value === "") clearGhost();
                editor.commands.setContent(value);
                isInternalUpdate.current = false;
            }
        }
    }, [value, editor]);

    // Full reference ghost (Hint)
    useEffect(() => {
        if (fullReferenceGhostVersion === undefined) return;
        setFullReferenceGhost(fullReferenceGhostText || "");
    }, [fullReferenceGhostVersion, fullReferenceGhostText]);

    const handleKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const ed = editorRef.current;
        if (!ed) return;

        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();

            // Accept hint
            if (fullReferenceGhost) {
                isInternalUpdate.current = true;
                if (debounceRef.current) clearTimeout(debounceRef.current);
                if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
                const acceptedText = fullReferenceGhost;
                ed.commands.setContent(acceptedText);
                prevInputRef.current = acceptedText;
                onChange(getCleanText(ed));
                clearGhost();
                setFullReferenceGhost('');
                isInternalUpdate.current = false;
                return;
            }

            // Accept ghost completion
            const currentGhost = prevGhostRef.current;
            if (currentGhost) {
                const currentClean = getCleanText(ed);
                const textBeforeSelection = ed.state.doc.textBetween(0, ed.state.selection.from, "\n", "\n").trimStart();
                if (!isSelectionAtTextEnd(currentClean, textBeforeSelection)) {
                    clearGhost();
                    return;
                }
                stuckExtrasRef.current = 0;
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate(10);
                }
                if (containerRef.current) {
                    containerRef.current.animate([
                        { transform: 'scale(1.006) translateX(1px)', filter: 'brightness(1.1)' },
                        { transform: 'scale(1) translateX(0)', filter: 'brightness(1)' }
                    ], { duration: 150, easing: 'ease-out' });
                }

                isInternalUpdate.current = true;
                const pos = ed.state.selection.from;

                if (isReplacement) {
                    // Replace the preceding N words with the suggested word
                    const currentClean = getCleanText(ed);
                    const trailingWhitespaceMatch = currentClean.match(/[\s,?!;.]+$/);
                    const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[0] : '';

                    const textToReplace = currentClean.slice(0, currentClean.length - trailingWhitespace.length);
                    // Match N words exactly at the end of textToReplace
                    const matchExp = new RegExp(`(?:[^\\s,?!;.]+[\\s,?!;.]+){${Math.max(1, replaceWordCount) - 1}}[^\\s,?!;.]+$`);
                    const partialMatch = textToReplace.match(matchExp);
                    if (partialMatch) {
                        const partialLen = partialMatch[0].length;
                        ed.chain()
                            .focus()
                            .deleteRange({ from: pos - partialLen - trailingWhitespace.length, to: pos - trailingWhitespace.length })
                            .insertContent(currentGhost)
                            .run();
                    }
                } else {
                    // Append completion suffix
                    ed.chain().focus().insertContentAt(pos, currentGhost).run();
                }

                const clean = getCleanText(ed);
                onChange(clean);
                prevInputRef.current = clean;
                clearGhost();
                isInternalUpdate.current = false;
                return;
            }
            
            // If neither ghost text nor hint is present, and user hits tab -> Request Manual Help
            if (onManualHintRequest && !isHintLoading) {
                onManualHintRequest(getCleanText(ed));
                return;
            }
        }

        if (e.key === 'Escape' && prevGhostRef.current) {
            clearGhost();
        }
    };

    const sourceLabel: Record<string, { icon: React.ReactNode; text: string; color: string }> = {
        deterministic: { icon: <Target className={`w-3 h-3 ${getTextColorClass(rescueColorState)}`} />, text: '确定性', color: getTextColorClassHeavy(rescueColorState) },
        nlp: { icon: <span className="text-[10px]">🧬</span>, text: 'NLP引擎', color: 'text-amber-600 dark:text-amber-500' },
        vector: { icon: <Waves className={`w-3 h-3 ${getVectorColorClass(rescueColorState)}`} />, text: '向量跃迁', color: getVectorColorClassHeavy(rescueColorState) },
    };

    const displayValue = editor ? getCleanText(editor) : value;

    return (
        <div ref={containerRef} className="relative w-full overflow-hidden">
            {/* Ghost text layer */}
            <div
                aria-hidden
                className={cn(
                    "pointer-events-none absolute inset-0 z-0 whitespace-pre-wrap break-words select-none overflow-hidden",
                    typographyClass
                )}
                style={{ color: 'transparent' }}
            >
                <AnimatePresence mode="popLayout">
                    {isHintLoading ? (
                        <motion.span key="persona-loader" className="inline-block">
                            <span style={{ color: 'transparent' }}>{displayValue}</span>
                            <PersonaLoader />
                        </motion.span>
                    ) : fullReferenceGhost ? (
                        <motion.span key="full-ref-ghost" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <span style={{ color: 'transparent' }}>{displayValue}</span>
                            <span className="font-semibold text-amber-500/80 dark:text-amber-400/80 transition-opacity duration-150">
                                {fullReferenceGhost.slice(displayValue.length)}
                            </span>
                        </motion.span>
                    ) : (ghostText && !isReplacement) ? (
                        <motion.span key="ghost-text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <span style={{ color: 'transparent' }}>{displayValue}</span>
                            <span 
                                className={cn(
                                    "font-semibold transition-opacity duration-150",
                                    ghostSource === 'vector' ? getVectorColorClass(rescueColorState) : getTextColorClass(rescueColorState)
                                )}
                                style={{ opacity: ghostSource === 'vector' ? ghostConfidence * 0.5 : 0.45 }}
                            >
                                {ghostText}
                            </span>
                        </motion.span>
                    ) : (ghostText && isReplacement) ? (
                        <motion.span key="ghost-replace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <span style={{ color: 'transparent' }}>{displayValue}</span>
                            <span 
                                className={cn("font-semibold transition-opacity duration-150", ghostSource === 'vector' ? getVectorColorClass(rescueColorState) : getTextColorClass(rescueColorState))}
                                style={{ opacity: ghostSource === 'vector' ? ghostConfidence * 0.6 : 0.6 }}
                            >
                                {' → '}{ghostText}
                            </span>
                        </motion.span>
                    ) : null}
                </AnimatePresence>
            </div>

            <div onKeyDownCapture={handleKeyDownCapture} className="relative z-10 w-full outline-none focus:outline-none">
                <EditorContent editor={editor} />
            </div>

            {/* Source indicator */}
            {isFocused && (
                <div className="absolute bottom-3 right-3 z-20 flex items-end gap-1.5 animate-in fade-in slide-in-from-bottom-2">
                    {ghostText && ghostSource !== 'none' && (
                        <div className="pointer-events-none flex items-center gap-1 rounded-full border border-stone-200/60 bg-white/95 px-2 py-1 text-[10px] font-bold shadow-sm backdrop-blur-md">
                            {sourceLabel[ghostSource].icon}
                            <span className={sourceLabel[ghostSource].color}>{sourceLabel[ghostSource].text}</span>
                             {isReplacement && (
                                <span className="flex items-center gap-0.5 ml-0.5">
                                    <span className="text-stone-400 line-through">{displayValue.match(/[a-zA-Z']+$/)?.[0]}</span>
                                    <span className="text-stone-400">→</span>
                                    <span className={cn("font-black", ghostSource === 'vector' ? getVectorColorClassHeavy(rescueColorState) : getTextColorClassHeavy(rescueColorState))}>{ghostText}</span>
                                </span>
                            )}
                            <kbd className="ml-0.5 bg-stone-100 border border-stone-200/60 rounded px-1 py-0.5 text-[9px] font-mono text-stone-400">Tab</kbd>
                        </div>
                    )}
                    
                    {morphologyWarning && ghostText && ghostSource === 'nlp' && (
                        <div className="pointer-events-none flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-gradient-to-r from-amber-50/98 to-yellow-50/98 px-2.5 py-1 text-[10px] font-bold shadow-sm backdrop-blur-md animate-in slide-in-from-bottom-2 fade-in duration-200">
                            <span className="text-amber-500">💡</span>
                            <span className="text-amber-700">
                                {morphologyWarning.type === 'TENSE_ERROR' ? '时态注意' : morphologyWarning.type === 'PLURALITY_ERROR' ? '单复数注意' : '词性注意'}
                                <span className="opacity-60 font-normal mx-1">|</span>
                                <span className="line-through opacity-70 mr-0.5">{morphologyWarning.uWord}</span>
                                {' → '}
                                <span className="font-extrabold ml-0.5">{morphologyWarning.rWord}</span>
                            </span>
                        </div>
                    )}


                    {fullReferenceGhost && !ghostText && (
                        <div className="pointer-events-none flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/92 px-3 py-1.5 text-[11px] font-bold text-amber-700 shadow-sm backdrop-blur-md">
                            Hint <kbd className="bg-amber-50 border border-amber-200/80 rounded-md px-1.5 py-0.5 font-sans shadow-sm">Tab</kbd>
                        </div>
                    )}
                </div>
            )}
            
            <style dangerouslySetInnerHTML={{__html: `
                .ProseMirror p.is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    color: transparent;
                    pointer-events: none;
                    height: 0;
                }
            `}} />
            
            {/* Inline AI Coach Tip (Cursor Anchored) removed */}
        </div>
    );
}
