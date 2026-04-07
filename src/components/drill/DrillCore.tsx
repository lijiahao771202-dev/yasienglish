"use client";

import { memo, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Sparkles, RefreshCw, Send, ArrowRight, HelpCircle, MessageCircle, Wand2, Mic, Play, Volume2, Globe, Headphones, Eye, EyeOff, BookOpen, BrainCircuit, X, Trophy, TrendingUp, TrendingDown, Zap, Gift, Crown, Gem, Dices, AlertTriangle, Skull, Heart, ChevronRight, Flame, Lock, Shuffle, SkipForward, CheckCircle2, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import * as Diff from 'diff';
import confetti from 'canvas-confetti';
import { WordPopup, PopupState } from "../reading/WordPopup";
import { ListeningShadowingControls } from "../reading/ListeningShadowingControls";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import { useIPA } from "@/hooks/useIPA";
import { db } from "@/lib/db";
import { getRank } from "@/lib/rankUtils";
import { DeathFX } from "./DeathFX";
import { BossScoreReveal } from "./BossScoreReveal";
import { RouletteOverlay } from "./RouletteOverlay";
import { GachaOverlay } from "./GachaOverlay";
import { ScoringFlipCard } from "./ScoringFlipCard";
import { TeachingCard } from "./TeachingCard";
import { TranslationAnalysisJourney } from "./TranslationAnalysisJourney";
import { GuidedLearningOverlay } from "./GuidedLearningOverlay";
import {
    AiTeacherConversation,
    type TutorHistoryTurn,
    type TutorStructuredResponse,
} from "./AiTeacherConversation";
import { RebuildTutorLauncher, RebuildTutorPopup, type RebuildTutorPopupState } from "./RebuildTutorPopup";
import { GhostTextarea } from "../vocab/GhostTextarea";
import { InlineGrammarHighlights } from "../shared/InlineGrammarHighlights";
import { LottieJsonPlayer } from "../shared/LottieJsonPlayer";
import { PretextTextarea } from "../ui/PretextTextarea";
import { resolveBattleScenarioTopic } from "@/lib/battle-quickmatch-topics";
import { getBattleInteractiveWordClassName } from "@/lib/drill-interactive-word";
import { calculateListeningElo } from "@/lib/listening-elo";
import { calculateRebuildBattleElo } from "@/lib/rebuild-battle-elo";
import { applyTranslationTooHardPenalty, TRANSLATION_TOO_HARD_PENALTY } from "@/lib/translation-elo";
import {
    buildRebuildDisplaySentence,
    clampRebuildDifficultyDelta,
    evaluateRebuildSelection,
    getRebuildPracticeTier,
    getRebuildSelfEvaluationDelta,
    getRebuildSoftTimeLimitMs,
    getRebuildSystemAssessment,
    getRebuildSystemAssessmentLabel,
    getRebuildSystemDelta,
    type RebuildEvaluationResult,
    type RebuildSelfEvaluation,
    type RebuildSystemAssessment,
} from "@/lib/rebuild-mode";
import {
    aggregateRebuildPassageScores,
    calculateRebuildPassageObjectiveScore,
    getRebuildPassageSelfScore,
} from "@/lib/rebuild-passage";
import {
    calculatePassageRebuildRewards,
    calculateSentenceRebuildRewards,
    rollRebuildDropReward,
    shouldTriggerPassageRebuildGacha,
    shouldTriggerSentenceRebuildGacha,
} from "@/lib/rebuild-rewards";
import { playRebuildSfx } from "@/lib/rebuild-sfx";
import { normalizeLearningPreferences } from "@/lib/profile-settings";
import { getTranslationDifficultyTier } from "@/lib/translationDifficulty";
import { buildTranslationHighlights, normalizeTranslationForComparison } from "@/lib/translation-diff";
import { requestTtsPayload, resolveTtsAudioBlob } from "@/lib/tts-client";
import { getDrillSurfacePhase, shouldExpandShopInventoryDock } from "@/lib/battleUiState";
import { alignTokensToMarks, extractWordTokens, normalizeWordForMatch, type TtsWordMark } from "@/lib/read-speaking";
import {
    alignPronunciationTokens as alignSharedPronunciationTokens,
    estimateListeningProgress as estimateSharedListeningProgress,
    resolveListeningScoreTier as resolveSharedListeningScoreTier,
    scoreListeningRecognition as scoreSharedListeningRecognition,
    type ListeningScoreTier,
    type PronunciationTokenState,
} from "@/lib/listening-shadowing";
import {
    createDailyDrillProgress,
    incrementStoredDailyDrillProgress,
    setStoredDailyDrillGoal,
    syncDailyDrillProgress as syncStoredDailyDrillProgress,
    type DailyDrillProgress,
} from "@/lib/daily-drill-progress";
import { buildGuidedHintCacheKey, fetchGuidedHintWithRetry } from "@/lib/guidedHintClient";
import { type GrammarDisplayMode, type GrammarSentenceAnalysis } from "@/lib/grammarHighlights";
import {
    buildFallbackGuidedScript,
    buildGuidedClozeHint,
    buildGuidedHintLines,
    createGuidedClozeState,
    createGuidedSessionState,
    isGuidedAnswerCorrect,
    revealGuidedClozeCurrentSlot,
    revealGuidedCurrentSlot,
    submitGuidedClozeInput,
    submitGuidedChoiceSelection,
    shouldBypassBattleRewards,
    submitGuidedStepInput,
    shouldAutoOpenGuidedChoices,
    type GuidedAiHint,
    type GuidedClozeState,
    type GuidedModeStatus,
    type GuidedScript,
    type GuidedSessionState,
} from "@/lib/guidedLearning";
import {
    buildGachaPack,
    getGachaRewardEconomy,
    shouldTriggerGacha,
    type GachaCard,
} from "./gacha";

import { loadLocalProfile, saveProfilePatch, saveWritingHistory, settleBattle } from "@/lib/user-repository";
import type { PronunciationWordResult } from "@/lib/pronunciation-scoring";
import {
    REBUILD_SHADOWING_AFFECTS_ELO,
    createRebuildShadowingState,
    getRebuildShadowingEntry,
    type RebuildShadowingScope,
    upsertRebuildShadowingEntry,
} from "@/lib/rebuild-shadowing-state";

// --- Interfaces ---

export type DrillMode = "translation" | "listening" | "dictation" | "rebuild";
type GuidedInnerMode = "teacher_guided" | "gestalt_cloze";

const DAILY_DRILL_GOAL_OPTIONS = [10, 20, 30, 50] as const;

export interface DrillCoreProps {
    // Context for generation
    context: {
        type: "article" | "scenario";
        articleTitle?: string;
        articleContent?: string;
        topic?: string; // For scenario mode
        rebuildVariant?: "sentence" | "passage";
        segmentCount?: 2 | 3 | 5;
    };
    initialMode?: DrillMode;
    listeningSourceMode?: "ai" | "bank";
    onClose?: () => void;
}

interface DrillData {
    chinese: string;
    target_english_vocab?: string[];
    key_vocab?: string[];
    reference_english: string;
    _difficultyMeta?: {
        requestedElo: number;
        tier: string;
        cefr: string;
        expectedWordRange: { min: number; max: number };
        actualWordCount: number;
        isValid: boolean;
        status: 'TOO_EASY' | 'TOO_HARD' | 'MATCHED';
        aiSelfReport?: {
            tier: string;
            cefr: string;
            wordCount: number;
            targetRange: string;
            wordCountAccurate: boolean;
        } | null;
        listeningFeatures?: {
            memoryLoad: string | null;
            spokenNaturalness: string | null;
            reducedFormsPresence: string | null;
            clauseMax: number | null;
            trainingFocus: string | null;
            downgraded: boolean;
        } | null;
    };
    _topicMeta?: {
        topic: string;
        subTopic?: string | null;
        isScenario: boolean;
    };
    _sourceMeta?: {
        sourceMode: "ai" | "bank";
        bankItemId?: string;
        candidateId?: string;
        bandPosition?: "entry" | "mid" | "exit" | null;
        reviewStatus?: "curated" | "draft";
    };
    _rebuildMeta?: {
        variant?: "sentence" | "passage";
        effectiveElo: number;
        bandPosition: "entry" | "mid" | "exit" | null;
        answerTokens: string[];
        tokenBank: string[];
        distractorTokens: string[];
        theme: string;
        scene: string;
        feedbackStyle: "strong";
        candidateId?: string;
        candidateSource?: "ai";
        passageSession?: {
            sessionId: string;
            segmentCount: 2 | 3 | 5;
            currentIndex: number;
            difficultyProfile: {
                effectiveElo: number;
                segmentCount: 2 | 3 | 5;
                practiceTier: {
                    cefr: "A1" | "A2-" | "A2+" | "B1" | "B2" | "C1" | "C2" | "C2+";
                    bandPosition: "entry" | "mid" | "exit";
                    label: string;
                };
                bandPosition: "entry" | "mid" | "exit";
                syntaxComplexity: {
                    clauseMax: number;
                    memoryLoad: string;
                    spokenNaturalness: string;
                    reducedFormsPresence: string;
                    trainingFocus: string;
                };
                perSegmentWordWindow: {
                    min: number;
                    max: number;
                    mean: number;
                    sigma: number;
                    softMin: number;
                    softMax: number;
                    hardMin: number;
                    hardMax: number;
                };
                totalWordWindow: {
                    min: number;
                    max: number;
                    mean: number;
                    sigma: number;
                    softMin: number;
                    softMax: number;
                    hardMin: number;
                    hardMax: number;
                };
            };
            segments: Array<{
                id: string;
                chinese: string;
                referenceEnglish: string;
                answerTokens: string[];
                distractorTokens: string[];
                tokenBank: string[];
                wordCount: number;
            }>;
        };
    };
}


const PLAYBACK_MEDIA_SOURCE_KEY = "__yasiPlaybackMediaSourceGraph__";

type PlaybackMediaSourceGraph = {
    context: AudioContext;
    source: MediaElementAudioSourceNode;
};

type HTMLAudioElementWithPlaybackGraph = HTMLAudioElement & {
    [PLAYBACK_MEDIA_SOURCE_KEY]?: PlaybackMediaSourceGraph;
};

function getPlaybackMediaSource(
    audioElement: HTMLAudioElement,
    AudioContextClass: typeof AudioContext,
) {
    const elementWithGraph = audioElement as HTMLAudioElementWithPlaybackGraph;
    const cached = elementWithGraph[PLAYBACK_MEDIA_SOURCE_KEY];
    if (cached) {
        return cached;
    }

    const context = new AudioContextClass();
    const source = context.createMediaElementSource(audioElement);
    const graph = { context, source };
    elementWithGraph[PLAYBACK_MEDIA_SOURCE_KEY] = graph;
    return graph;
}

const PlaybackWaveBars = memo(function PlaybackWaveBars({
    audioElement,
    isDictationMode,
    isPlaying,
}: {
    audioElement: HTMLAudioElement | null;
    isDictationMode: boolean;
    isPlaying: boolean;
}) {
    const prefersReducedMotion = useReducedMotion();
    const [levels, setLevels] = useState<number[]>([0.1, 0.1, 0.1]);
    const levelBufferRef = useRef<number[]>([0.1, 0.1, 0.1]);

    useEffect(() => {
        if (!audioElement || !isPlaying || typeof window === "undefined") {
            const idle = [0.1, 0.1, 0.1];
            levelBufferRef.current = idle;
            setLevels(idle);
            return;
        }

        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;

        const { context, source } = getPlaybackMediaSource(audioElement, AudioContextClass);
        const analyser = context.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.6; // Slightly more damped for smooth "squash"

        source.connect(analyser);
        analyser.connect(context.destination);

        const data = new Uint8Array(analyser.frequencyBinCount);
        let frameId = 0;
        let cancelled = false;

        const updateLevels = () => {
            if (cancelled) return;
            analyser.getByteFrequencyData(data);
            const now = window.performance.now() / 1000;

            const getBand = (s: number, e: number) => {
                let sum = 0;
                for (let i = s; i < e; i++) sum += data[i] || 0;
                return sum / (e - s);
            };

            const bassRaw = getBand(0, 3);
            const midRaw = getBand(3, 10);
            const trebRaw = getBand(10, 32);

            const calculate = (raw: number, idx: number, prev: number) => {
                const normalized = Math.pow(raw / 255, 1.3);
                const pulse = (Math.sin(now * (3.0 + idx * 0.5) + idx * 1.2) + 1) / 2;
                const idle = prefersReducedMotion ? 0 : pulse * 0.1;
                const target = Math.max(normalized, idle);

                // Very snappy attack for punchiness, slower release for fluid movement
                const attack = idx === 0 ? 0.35 : idx === 1 ? 0.45 : 0.55;
                const release = idx === 0 ? 0.92 : idx === 1 ? 0.88 : 0.82;

                const isRising = target > prev;
                return isRising
                    ? prev * (1 - attack) + target * attack
                    : prev * release + target * (1 - release);
            };

            const next = [
                calculate(bassRaw, 0, levelBufferRef.current[0] || 0.1),
                calculate(midRaw, 1, levelBufferRef.current[1] || 0.1),
                calculate(trebRaw, 2, levelBufferRef.current[2] || 0.1),
            ];

            levelBufferRef.current = next;
            setLevels(next);
            frameId = window.requestAnimationFrame(updateLevels);
        };

        void context.resume().finally(() => {
            if (!cancelled) frameId = window.requestAnimationFrame(updateLevels);
        });

        return () => {
            cancelled = true;
            if (frameId) window.cancelAnimationFrame(frameId);
            try { source.disconnect(analyser); } catch {}
            analyser.disconnect();
        };
    }, [audioElement, isPlaying, prefersReducedMotion]);

    const [bass, mid, treb] = levels;

    // Map frequency data to height with elastic bounce feel
    const heights = [
        6 + bass * 28,  // Bass: moves more
        10 + mid * 24,  // Mid: stable voice
        8 + treb * 18   // Treble: quick flicks
    ];

    return (
        <div className="relative flex items-center justify-center h-10 w-12 gap-1.5">
            {heights.map((h, i) => (
                <div
                    key={i}
                    className={cn(
                        "w-1.5 rounded-full will-change-[height,transform,opacity]",
                        "bg-gradient-to-t from-theme-primary-bg to-theme-primary-bg/60 shadow-sm"
                    )}
                    style={{
                        height: `${h}px`,
                        opacity: 0.8 + (h / 60),
                        // Squash & Stretch effect based on height delta
                        transform: `scaleX(${1 - (h - 10) / 100})`,
                        transition: isPlaying ? "none" : "height 300ms cubic-bezier(0.2, 1, 0.3, 1), transform 300ms ease-out, opacity 300ms ease-out"
                    }}
                />
            ))}
        </div>
    );
});

type PrefetchedDrillData = DrillData & { mode?: string; sourceMode?: "ai" | "bank" };
type PassageSession = NonNullable<NonNullable<DrillData["_rebuildMeta"]>["passageSession"]>;
type PassageSegment = PassageSession["segments"][number];

function buildRebuildTokenInstances(params: {
    tokenBank: string[];
    distractorTokens: string[];
    prefix: string;
}) {
    const { tokenBank, distractorTokens, prefix } = params;
    const distractorSet = new Set(distractorTokens);
    const tokenTotals = new Map<string, number>();
    const tokenSeen = new Map<string, number>();

    for (const token of tokenBank) {
        tokenTotals.set(token, (tokenTotals.get(token) ?? 0) + 1);
    }

    const tokenInstances: RebuildTokenInstance[] = tokenBank.map((text, index) => ({
        id: `${prefix}-token-${index}-${text}`,
        text,
        origin: distractorSet.has(text) ? "distractor" : "answer",
        repeatIndex: (() => {
            const nextIndex = (tokenSeen.get(text) ?? 0) + 1;
            tokenSeen.set(text, nextIndex);
            return nextIndex;
        })(),
        repeatTotal: tokenTotals.get(text) ?? 1,
    }));

    return {
        tokenInstances,
        tokenOrder: Object.fromEntries(tokenInstances.map((token, index) => [token.id, index])),
    };
}

function createRebuildPassageDraftState(segment: PassageSegment, index: number): RebuildPassageSegmentDraftState {
    const { tokenInstances, tokenOrder } = buildRebuildTokenInstances({
        tokenBank: segment.tokenBank,
        distractorTokens: segment.distractorTokens,
        prefix: segment.id,
    });

    return {
        segmentIndex: index,
        availableTokens: tokenInstances,
        answerTokens: [],
        typingBuffer: "",
        replayCount: 0,
        editCount: 0,
        startedAt: null,
        tokenOrder,
    };
}

function areRebuildTokenOrdersEqual(left: Record<string, number>, right: Record<string, number>) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => left[key] === right[key]);
}

function normalizeRebuildTokenForMatch(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickPreferredRebuildTokenCandidate(params: {
    candidates: RebuildTokenInstance[];
    typedRaw: string;
    expectedRaw?: string | null;
}) {
    const { candidates, typedRaw, expectedRaw } = params;
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const typedTrimmed = typedRaw.trim();
    const typedNormalized = normalizeRebuildTokenForMatch(typedTrimmed);
    const expectedTrimmed = expectedRaw?.trim() ?? "";
    const expectedNormalized = normalizeRebuildTokenForMatch(expectedTrimmed);

    const scoredCandidates = candidates
        .map((token, index) => {
            const tokenNormalized = normalizeRebuildTokenForMatch(token.text);
            let score = 0;

            if (expectedTrimmed && token.text === expectedTrimmed) score += 120;
            if (expectedNormalized && tokenNormalized === expectedNormalized) score += 90;
            if (typedTrimmed && token.text === typedTrimmed) score += 45;
            if (typedNormalized && tokenNormalized === typedNormalized) score += 35;
            if (expectedTrimmed && token.text.toLowerCase() === expectedTrimmed.toLowerCase()) score += 20;
            if (typedTrimmed && token.text.toLowerCase() === typedTrimmed.toLowerCase()) score += 10;

            return {
                token,
                score,
                index,
            };
        })
        .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            return left.index - right.index;
        });

    return scoredCandidates[0]?.token ?? null;
}

function getGuidedScriptKey(
    drillData: Pick<DrillData, "chinese" | "reference_english" | "_topicMeta">,
    elo: number,
    contextTopic?: string,
) {
    return JSON.stringify({
        chinese: drillData.chinese,
        referenceEnglish: drillData.reference_english,
        topic: drillData._topicMeta?.topic || contextTopic || "",
        elo,
    });
}

const IPA_SENTENCE_WORD_REGEX = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
const IPA_VOWEL_START_REGEX = /^[ˈˌ]?[iɪeɛæɑɒɔoʊuʊʌəɜɝɚaɐ]/i;
const IPA_CONSONANT_END_REGEX = /[pbtdkgfvðθszʃʒhmnŋlrɹwjʧʤxɾ]$/i;

function normalizeIpaValue(rawIpa: string) {
    return rawIpa.replace(/^[/[\s]+|[/\]\s]+$/g, "").trim();
}

function buildConnectedSentenceIpa(
    sentence: string,
    getWordIpa: (text: string) => string,
) {
    const words = sentence.match(IPA_SENTENCE_WORD_REGEX) ?? [];
    if (words.length === 0) return "";

    const ipaWords = words.map((word) => {
        const resolved = normalizeIpaValue(getWordIpa(word));
        return resolved || word.toLowerCase();
    });

    let combined = ipaWords[0] ?? "";
    for (let i = 1; i < ipaWords.length; i += 1) {
        const prev = ipaWords[i - 1] ?? "";
        const next = ipaWords[i] ?? "";
        const useLiaison = IPA_CONSONANT_END_REGEX.test(prev) && IPA_VOWEL_START_REGEX.test(next);
        combined += useLiaison ? `‿${next}` : ` ${next}`;
    }

    return combined ? `/${combined}/` : "";
}

interface RebuildSpeechRecognitionResultEntry {
    transcript?: string;
}

interface RebuildSpeechRecognitionResultLike {
    isFinal?: boolean;
    0?: RebuildSpeechRecognitionResultEntry;
}

interface RebuildSpeechRecognitionEventLike {
    results?: ArrayLike<RebuildSpeechRecognitionResultLike>;
    resultIndex?: number;
}

interface RebuildSpeechRecognitionErrorEventLike {
    error?: string;
    message?: string;
}

interface RebuildSpeechRecognition {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((event: RebuildSpeechRecognitionEventLike) => void) | null;
    onerror: ((event: RebuildSpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}

type RebuildSpeechRecognitionConstructor = new () => RebuildSpeechRecognition;
type RebuildShadowingTokenState = Extract<PronunciationTokenState, "correct" | "incorrect" | "missed">;
type RebuildShadowingScoreTier = ListeningScoreTier;

function normalizeRebuildShadowingText(text: string) {
    return text.replace(/\s+/g, " ").trim();
}

function scoreRebuildShadowingRecognition(referenceSentence: string, transcript: string) {
    return scoreSharedListeningRecognition(referenceSentence, transcript);
}

function estimateRebuildShadowingProgress(referenceSentence: string, transcript: string) {
    return estimateSharedListeningProgress(referenceSentence, transcript);
}

function resolveRebuildShadowingScoreTier(score: number): RebuildShadowingScoreTier {
    return resolveSharedListeningScoreTier(score);
}

function alignRebuildShadowingTokens(params: {
    targetTokens: Array<{ sourceIndex: number; token: string }>;
    spokenTokens: string[];
}) {
    const result = alignSharedPronunciationTokens(params);
    return {
        tokenStates: result.tokenStates as Map<number, RebuildShadowingTokenState>,
        correctCount: result.correctCount,
    };
}

function buildRebuildShadowingWordResults(referenceSentence: string, transcript: string): PronunciationWordResult[] {
    const sourceTokens = extractWordTokens(referenceSentence);
    const targetTokens = sourceTokens
        .map((token) => ({ sourceIndex: token.index, token: normalizeWordForMatch(token.text) }))
        .filter((item) => Boolean(item.token));
    const spokenTokens = extractWordTokens(transcript)
        .map((token) => normalizeWordForMatch(token.text))
        .filter(Boolean);
    const { tokenStates } = alignRebuildShadowingTokens({
        targetTokens,
        spokenTokens,
    });

    return sourceTokens.map((token) => {
        const state = tokenStates.get(token.index);
        if (state === "correct") {
            return {
                word: token.text,
                status: "correct",
                score: 9.5,
                accuracy_score: 9.4,
                stress_score: 9.1,
            } satisfies PronunciationWordResult;
        }
        if (state === "missed") {
            return {
                word: token.text,
                status: "missing",
                score: 0,
                accuracy_score: 0,
                stress_score: 0,
            } satisfies PronunciationWordResult;
        }
        return {
            word: token.text,
            status: "weak",
            score: 5.2,
            accuracy_score: 5.0,
            stress_score: 5.1,
        } satisfies PronunciationWordResult;
    });
}

interface DrillFeedback {
    score: number;
    pronunciation_score?: number;
    content_score?: number;
    fluency_score?: number;
    coverage_ratio?: number;
    utterance_scores?: {
        accuracy: number;
        completeness: number;
        fluency: number;
        prosody: number;
        total: number;
        content_reproduction?: number;
        rhythm_fluency?: number;
        pronunciation_clarity?: number;
    };
    transcript?: string;
    summary_cn?: string;
    tips_cn?: string[];
    engine?: string;
    engine_version?: string;
    word_results?: PronunciationWordResult[];
    feedback?: any; // Can be string[] or object with listening_tips
    judge_reasoning?: string;
    improved_version?: string;
    diagnosis_summary_cn?: string;
    chinglish_vs_natural?: {
        chinglish: string;
        natural: string;
        reason_cn: string;
    };
    common_pitfall?: {
        pitfall_cn: string;
        wrong_example: string;
        right_example: string;
        why_cn: string;
    };
    phrase_synonyms?: Array<{
        source_phrase: string;
        alternatives: string[];
        nuance_cn: string;
    }>;
    transfer_pattern?: {
        template: string;
        example_cn: string;
        example_en: string;
        tip_cn: string;
    };
    memory_hook_cn?: string;
    segments?: {
        word: string;
        status: "correct" | "phonetic_error" | "missing" | "typo" | "user_extra" | "variation";
        user_input?: string;
        feedback?: string;
    }[];
    // Teaching mode enhanced fields
    error_analysis?: Array<{ error: string; correction: string; rule: string; tip: string }>;
    similar_patterns?: Array<{ chinese: string; english: string; point: string }>;
    _error?: boolean;
}

type TutorQuestionType = "pattern" | "word_choice" | "example" | "unlock_answer" | "follow_up";
type TutorIntent = "translate" | "grammar" | "lexical" | "rebuild";
type TutorAction = "ask";
type TutorUiSurface = "battle" | "score" | "rebuild_floating_teacher";
type TutorThinkingMode = "chat" | "deep";
type TutorAnswerMode = "adaptive" | "simple" | "detailed";

interface DictionaryData {
    word: string;
    phonetic?: string;
    audio?: string;
    translation?: string;
    definition?: string;
}

type RebuildTutorSessionState = RebuildTutorPopupState;

interface RebuildTokenInstance {
    id: string;
    text: string;
    origin: "answer" | "distractor";
    repeatIndex?: number;
    repeatTotal?: number;
}

interface RebuildFeedbackState {
    evaluation: RebuildEvaluationResult;
    systemDelta: number;
    systemAssessment: RebuildSystemAssessment;
    systemAssessmentLabel: string;
    selfEvaluation: RebuildSelfEvaluation | null;
    effectiveElo: number;
    replayCount: number;
    editCount: number;
    skipped: boolean;
    exceededSoftLimit: boolean;
    resolvedAt: number;
}

interface RebuildShadowingResult extends DrillFeedback {
    submittedAt: number;
}

interface RebuildShadowingState {
    sentence: {
        wavBlob: Blob | null;
        result: RebuildShadowingResult | null;
        submitError: string | null;
        updatedAt: number;
    };
    bySegment: Record<number, {
        wavBlob: Blob | null;
        result: RebuildShadowingResult | null;
        submitError: string | null;
        updatedAt: number;
    }>;
    isRecording: boolean;
    isProcessing: boolean;
    isSubmitting: boolean;
}

type RebuildSentenceShadowingFlow = "idle" | "prompt" | "shadowing" | "feedback";
const REBUILD_PASSAGE_SHADOWING_PROMPT_DELAY_MS = 2000;

function createDefaultRebuildShadowingState(): RebuildShadowingState {
    return {
        ...createRebuildShadowingState<Blob, RebuildShadowingResult>(),
        isRecording: false,
        isProcessing: false,
        isSubmitting: false,
    };
}

interface RebuildPassageSegmentScore {
    segmentIndex: number;
    objectiveScore100: number;
    selfScore100: number;
    finalScore100: number;
}

interface RebuildPassageSegmentDraftState {
    segmentIndex: number;
    availableTokens: RebuildTokenInstance[];
    answerTokens: RebuildTokenInstance[];
    typingBuffer: string;
    replayCount: number;
    editCount: number;
    startedAt: number | null;
    tokenOrder: Record<string, number>;
}

interface RebuildPassageSegmentResultState {
    segmentIndex: number;
    feedback: RebuildFeedbackState;
    objectiveScore100: number;
    selfScore100: number | null;
    finalScore100: number | null;
    selfEvaluation: RebuildSelfEvaluation | null;
}

interface RebuildPassageSegmentUiState {
    chineseExpanded: boolean;
}

interface RebuildPassageSummaryState {
    sessionObjectiveScore100: number;
    sessionSelfScore100: number;
    sessionScore100: number;
    sessionBattleScore10: number;
    segmentCount: number;
    eloAfter: number;
    change: number;
    streak: number;
    maxElo: number;
    coinsEarned: number;
    settledAt: number;
}

// --- State --- 

interface LootDrop {
    type: 'gem' | 'exp' | 'theme';
    amount: number;
    message: string;
    rarity: 'common' | 'rare' | 'legendary';
    name?: string; // Optional for compatibility
}

type EconomyTargetId = 'coins' | ShopItemId;
type EconomyFxKind = 'item_consume' | 'coin_gain' | 'item_purchase';
type EconomyFxSource = 'tab' | 'hint' | 'vocab' | 'audio' | 'refresh' | 'reward' | 'shop' | 'gacha';

interface EconomyFxEvent {
    id: number;
    kind: EconomyFxKind;
    itemId?: ShopItemId;
    amount?: number;
    message: string;
    source?: EconomyFxSource;
}

type StreakTier = 0 | 1 | 2 | 3 | 4;

interface StreakTierVisual {
    accent: string;
    badgeGradient: string;
    badgeBorder: string;
    badgeShadow: string;
    badgeGlow: string;
    auraGradient: string;
    beamGradient: string;
    beamShadow: string;
    surfaceBorder: string;
    surfaceShadow: string;
    checkGradient: string;
    checkBorder: string;
    checkShadow: string;
    nextGradient: string;
    nextShadow: string;
    eloGradient: string;
    eloBorder: string;
    eloShadow: string;
    progressGradient: string;
    scoreGlow: string;
    particleGradient: string;
    particleDensity: number;
}

const STREAK_PARTICLE_POSITIONS = [12, 26, 39, 54, 68, 82, 90, 18, 47, 76];
type ShopItemId = 'capsule' | 'hint_ticket' | 'vocab_ticket' | 'audio_ticket' | 'refresh_ticket';

type InventoryState = Record<ShopItemId, number>;

const ECONOMY_OVERLAY_ORIGIN_TOP = 38;
const ECONOMY_COIN_RAIN = [
    { x: -126, y: 72, delay: 0.02, rotate: -16, scale: 0.82 },
    { x: -92, y: 92, delay: 0.05, rotate: -10, scale: 0.92 },
    { x: -64, y: 112, delay: 0.08, rotate: -6, scale: 1 },
    { x: -28, y: 82, delay: 0.03, rotate: 8, scale: 0.88 },
    { x: 0, y: 104, delay: 0.1, rotate: -2, scale: 0.98 },
    { x: 32, y: 86, delay: 0.06, rotate: 12, scale: 0.9 },
    { x: 68, y: 116, delay: 0.12, rotate: 16, scale: 1.02 },
    { x: 102, y: 74, delay: 0.04, rotate: 9, scale: 0.86 },
    { x: 132, y: 98, delay: 0.09, rotate: 14, scale: 0.94 },
    { x: -148, y: 116, delay: 0.14, rotate: -18, scale: 0.84 },
    { x: -6, y: 136, delay: 0.16, rotate: -4, scale: 1.05 },
    { x: 118, y: 128, delay: 0.18, rotate: 18, scale: 0.9 },
    { x: -86, y: 136, delay: 0.2, rotate: -14, scale: 0.88 },
    { x: 84, y: 146, delay: 0.22, rotate: 14, scale: 0.95 },
] as const;

const ECONOMY_COIN_ABSORB = [
    { x: -44, y: 36, delay: 0.54 },
    { x: -18, y: 54, delay: 0.62 },
    { x: 0, y: 44, delay: 0.7 },
    { x: 22, y: 58, delay: 0.78 },
    { x: 46, y: 42, delay: 0.86 },
] as const;

const DEFAULT_INVENTORY: InventoryState = {
    capsule: 10,
    hint_ticket: 10,
    vocab_ticket: 10,
    audio_ticket: 10,
    refresh_ticket: 10,
};

const LISTENING_BANK_RECENT_STORAGE_KEY = "battle-listening-bank-recent-ids";
const LISTENING_BANK_RECENT_LIMIT = 20;

function buildGeneratedRebuildBankContentKey(topic: string, referenceEnglish: string) {
    const normalizedTopic = topic.trim().toLowerCase();
    const normalizedEnglish = referenceEnglish
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return `${normalizedTopic}::${normalizedEnglish}`;
}

function getSentenceAudioCacheKey(text: string) {
    return `SENTENCE_${text}`;
}

const ITEM_CATALOG: Record<ShopItemId, { id: ShopItemId; name: string; price: number; icon: string; consumeAction: string; description: string; }> = {
    capsule: {
        id: 'capsule',
        name: '灵感胶囊',
        price: 30,
        icon: '💊',
        consumeAction: 'Tab 预测提示',
        description: '用于 Tab 智能续写提示',
    },
    hint_ticket: {
        id: 'hint_ticket',
        name: 'Hint 道具',
        price: 50,
        icon: '🪄',
        consumeAction: 'Hint 全句参考',
        description: '用于显示完整参考句幽灵层',
    },
    vocab_ticket: {
        id: 'vocab_ticket',
        name: '关键词提示券',
        price: 20,
        icon: '🧩',
        consumeAction: '解锁底部关键词',
        description: '用于显示本题关键词提示',
    },
    audio_ticket: {
        id: 'audio_ticket',
        name: '朗读券',
        price: 30,
        icon: '🔊',
        consumeAction: '播放参考句',
        description: '用于解锁本题参考句播放，支持重播和倍速',
    },
    refresh_ticket: {
        id: 'refresh_ticket',
        name: '刷新卡',
        price: 40,
        icon: '🔄',
        consumeAction: '重刷当前题目',
        description: '用于丢弃当前题并立即刷新一题，不影响 Elo 和连胜',
    },
};

const normalizeInventory = (inventory: unknown, legacyCapsule?: number): InventoryState => {
    const rawInventory = (inventory && typeof inventory === 'object') ? inventory as Partial<Record<ShopItemId, number>> : {};
    const capsuleValue = typeof rawInventory.capsule === 'number'
        ? rawInventory.capsule
        : (typeof legacyCapsule === 'number' ? legacyCapsule : DEFAULT_INVENTORY.capsule);
    const hintTicketValue = typeof rawInventory.hint_ticket === 'number'
        ? rawInventory.hint_ticket
        : DEFAULT_INVENTORY.hint_ticket;
    const vocabTicketValue = typeof rawInventory.vocab_ticket === 'number'
        ? rawInventory.vocab_ticket
        : DEFAULT_INVENTORY.vocab_ticket;
    const audioTicketValue = typeof rawInventory.audio_ticket === 'number'
        ? rawInventory.audio_ticket
        : DEFAULT_INVENTORY.audio_ticket;
    const refreshTicketValue = typeof rawInventory.refresh_ticket === 'number'
        ? rawInventory.refresh_ticket
        : DEFAULT_INVENTORY.refresh_ticket;

    return {
        capsule: Math.max(0, capsuleValue),
        hint_ticket: Math.max(0, hintTicketValue),
        vocab_ticket: Math.max(0, vocabTicketValue),
        audio_ticket: Math.max(0, audioTicketValue),
        refresh_ticket: Math.max(0, refreshTicketValue),
    };
};

// ===== COSMETIC THEMES =====
type CosmeticThemeId = 'morning_coffee' | 'verdant_atelier' | 'cute_cream' | 'sakura' | 'golden_hour' | 'holo_pearl' | 'cloud_nine' | 'lilac_dream';

interface CosmeticTheme {
    id: CosmeticThemeId;
    name: string;
    icon: string;
    price: number; // 0 = free
    description: string;
    preview: string; // short tagline for shop
    // Visual tokens
    bgClass: string;       // Background gradient CSS class
    cardClass: string;     // Main card container class
    textClass: string;     // Primary text color
    mutedClass: string;    // Muted text color
    headerBg: string;      // Header pill background
    isDark: boolean;       // Dark mode flag for contrast adjustments
}

interface CosmeticThemeUi {
    ledgerClass: string;
    toolbarClass: string;
    inputShellClass: string;
    textareaClass: string;
    audioLockedClass: string;
    audioUnlockedClass: string;
    speedShellClass: string;
    speedActiveClass: string;
    speedIdleClass: string;
    vocabButtonClass: string;
    keywordChipClass: string;
    wordBadgeActiveClass: string;
    wordBadgeIdleClass: string;
    hintButtonClass: string;
    iconButtonClass: string;
    checkButtonClass: string;
    tutorPanelClass: string;
    tutorAnswerClass: string;
    tutorInputClass: string;
    tutorSendClass: string;
    analysisButtonClass: string;
    nextButtonGradient: string;
    nextButtonShadow: string;
    nextButtonGlow: string;
}

const COSMETIC_THEMES: Record<CosmeticThemeId, CosmeticTheme> = {
    morning_coffee: {
        id: 'morning_coffee',
        name: '☕ Morning Coffee',
        icon: '☕',
        price: 0,
        description: '温暖的咖啡色调，默认主题',
        preview: '经典暖色玻璃拟态',
        bgClass: 'bg-gradient-to-br from-slate-100 via-stone-50 to-blue-50',
        cardClass: 'bg-white/70 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-white/30',
        textClass: 'text-stone-900',
        mutedClass: 'text-stone-500',
        headerBg: 'bg-white/80',
        isDark: false,
    },
    verdant_atelier: {
        id: 'verdant_atelier',
        name: '🌿 翡绿雅境',
        icon: '🌿',
        price: 0,
        description: '高端祖母绿与玉石质感，护眼而克制',
        preview: '祖母绿 + 雾面玻璃 + 雅致高光',
        bgClass: 'bg-gradient-to-br from-[#ecf9f1] via-[#e0f4e8] to-[#f6fbf7]',
        cardClass: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(236,253,245,0.22))] backdrop-blur-[24px] border border-emerald-100/45 shadow-[0_20px_52px_rgba(2,44,34,0.34),inset_0_1px_0_rgba(255,255,255,0.56)] ring-1 ring-emerald-100/28 saturate-[1.08]',
        textClass: 'text-emerald-950',
        mutedClass: 'text-emerald-700/60',
        headerBg: 'bg-white/82',
        isDark: false,
    },
    cute_cream: {
        id: 'cute_cream',
        name: '🧁 可爱奶油风',
        icon: '🧁',
        price: 0,
        description: '奶油书桌灵感的可爱主题，免费领取直接切换',
        preview: '奶油纸面 + 薄荷按钮 + 杏桃点缀',
        bgClass: 'bg-[linear-gradient(135deg,#fff8ef_0%,#fffdf8_42%,#eef9f1_72%,#fff2e4_100%)]',
        cardClass: 'bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(255,249,239,0.96),rgba(247,255,249,0.94))] border border-[#eadfc9] shadow-[0_24px_56px_rgba(198,172,132,0.22),inset_0_1px_0_rgba(255,255,255,0.98)] ring-1 ring-[#fffaf1]',
        textClass: 'text-[#54453a]',
        mutedClass: 'text-[#9d8b7c]',
        headerBg: 'bg-[#fff7eb]',
        isDark: false,
    },
    sakura: {
        id: 'sakura',
        name: '🌸 樱花漫步',
        icon: '🌸',
        price: 300,
        description: '粉色日系温柔，飘落樱花瓣',
        preview: '樱粉 + 花瓣粒子',
        bgClass: 'bg-gradient-to-br from-[#fdf2f8] via-[#fce7f3] to-[#fff1f2]',
        cardClass: 'bg-white/75 backdrop-blur-2xl border border-pink-200/60 shadow-[0_8px_32px_rgba(236,72,153,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-pink-100/40',
        textClass: 'text-pink-950',
        mutedClass: 'text-pink-400',
        headerBg: 'bg-white/80',
        isDark: false,
    },
    golden_hour: {
        id: 'golden_hour',
        name: '🌅 黄金时刻',
        icon: '🌅',
        price: 300,
        description: '日落暖光，液态玻璃流动',
        preview: '琥珀暖金 + 流光溢彩',
        bgClass: 'bg-gradient-to-br from-[#fff7ed] via-[#fef3c7] to-[#fff1f2]',
        cardClass: 'bg-white/72 backdrop-blur-2xl border border-amber-200/50 shadow-[0_8px_32px_rgba(245,158,11,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-amber-100/40',
        textClass: 'text-amber-950',
        mutedClass: 'text-amber-600/60',
        headerBg: 'bg-white/80',
        isDark: false,
    },
    holo_pearl: {
        id: 'holo_pearl',
        name: '✨ 全息珍珠',
        icon: '✨',
        price: 500,
        description: '纯净洁白，泛起超现实全息光晕',
        preview: '珍珠白板 + 全息流光',
        bgClass: 'bg-[#fcfdfd]',
        cardClass: 'bg-white/60 backdrop-blur-3xl border border-white/80 shadow-[0_15px_50px_rgba(0,0,0,0.04),inset_0_2px_4px_rgba(255,255,255,1)] ring-1 ring-white/50',
        textClass: 'text-slate-800',
        mutedClass: 'text-slate-400',
        headerBg: 'bg-white/70',
        isDark: false,
    },
    cloud_nine: {
        id: 'cloud_nine',
        name: '☁️ 云端漫步',
        icon: '☁️',
        price: 500,
        description: '清透呼吸感，极简白蓝天空',
        preview: '天青色 + 通透云朵呼吸',
        bgClass: 'bg-gradient-to-br from-[#f0f9ff] via-[#e0f2fe] to-[#f8fafc]',
        cardClass: 'bg-white/75 backdrop-blur-3xl border border-sky-200/50 shadow-[0_8px_32px_rgba(14,165,233,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-sky-100/60',
        textClass: 'text-cyan-950',
        mutedClass: 'text-cyan-600/60',
        headerBg: 'bg-white/80',
        isDark: false,
    },
    lilac_dream: {
        id: 'lilac_dream',
        name: '🦄 丁香幻梦',
        icon: '🦄',
        price: 500,
        description: '梦幻马卡龙紫粉，治愈流光',
        preview: '淡紫色 + 柔和光谱交织',
        bgClass: 'bg-gradient-to-br from-[#faf5ff] via-[#f3e8ff] to-[#fdf2f8]',
        cardClass: 'bg-white/70 backdrop-blur-3xl border border-purple-200/50 shadow-[0_8px_32px_rgba(168,85,247,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-purple-100/50',
        textClass: 'text-purple-950',
        mutedClass: 'text-purple-500/60',
        headerBg: 'bg-white/80',
        isDark: false,
    },
};

const COSMETIC_THEME_UI: Record<CosmeticThemeId, CosmeticThemeUi> = {
    morning_coffee: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(245,244,240,0.68))] border-stone-200/55 ring-stone-200/35 shadow-[0_10px_28px_rgba(120,113,108,0.08)]",
        toolbarClass: "border-stone-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(245,244,240,0.74))] shadow-[0_10px_30px_rgba(120,113,108,0.08)]",
        inputShellClass: "border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(248,246,242,0.68))] shadow-[0_10px_36px_rgba(120,113,108,0.08),inset_0_1px_0_rgba(255,255,255,0.98)] hover:shadow-[0_18px_46px_rgba(120,113,108,0.1),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-stone-300/80 focus-within:ring-[4px] focus-within:ring-stone-400/10",
        textareaClass: "text-stone-900 placeholder:text-stone-400/55",
        audioLockedClass: "border-amber-200/90 bg-[linear-gradient(180deg,rgba(255,250,238,0.98),rgba(252,236,214,0.9))] text-amber-800 shadow-[0_8px_22px_rgba(180,83,9,0.12)] hover:border-amber-300 hover:text-amber-900",
        audioUnlockedClass: "border-stone-200/85 bg-[linear-gradient(180deg,rgba(247,244,238,0.98),rgba(231,229,228,0.92))] text-stone-700 shadow-[0_8px_22px_rgba(120,113,108,0.1)] hover:border-stone-300 hover:text-stone-900",
        speedShellClass: "border-stone-200/85 bg-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]",
        speedActiveClass: "bg-stone-900 text-white shadow-[0_8px_16px_rgba(68,64,60,0.18)]",
        speedIdleClass: "text-stone-500 hover:bg-stone-100 hover:text-stone-700",
        vocabButtonClass: "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(245,255,250,0.96),rgba(220,252,231,0.88))] text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,244,240,0.95))] border-stone-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300 hover:text-stone-900 shadow-[0_8px_20px_rgba(120,113,108,0.08)]",
        wordBadgeActiveClass: "border-stone-200/80 bg-white/92 text-stone-500 shadow-[0_6px_16px_rgba(120,113,108,0.05)]",
        wordBadgeIdleClass: "bg-transparent text-stone-400/60",
        hintButtonClass: "border-stone-200/80 bg-[linear-gradient(180deg,rgba(247,244,238,0.96),rgba(231,229,228,0.88))] text-stone-700 shadow-[0_6px_16px_rgba(120,113,108,0.08)] hover:border-stone-300 hover:text-stone-900 hover:shadow-[0_10px_20px_rgba(120,113,108,0.12)]",
        iconButtonClass: "border-stone-200/80 bg-white/90 text-stone-500 shadow-[0_6px_16px_rgba(120,113,108,0.06)] hover:border-stone-300 hover:bg-stone-50 hover:text-stone-700",
        checkButtonClass: "border-stone-500/80 bg-[linear-gradient(180deg,rgba(120,113,108,0.95),rgba(68,64,60,0.98))] text-white shadow-[0_10px_24px_rgba(68,64,60,0.28)] hover:shadow-[0_14px_30px_rgba(68,64,60,0.34)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,244,238,0.95))] border-stone-200/80 shadow-[0_18px_46px_rgba(120,113,108,0.14)]",
        tutorAnswerClass: "bg-stone-50/85 text-stone-700",
        tutorInputClass: "bg-white/88 border-stone-200 text-stone-700 focus:ring-stone-300",
        tutorSendClass: "text-stone-600",
        analysisButtonClass: "bg-stone-900 text-white hover:bg-stone-800",
        nextButtonGradient: "linear-gradient(90deg, #78716c 0%, #57534e 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(87,83,78,0.42)",
        nextButtonGlow: "rgba(120,113,108,0.18)",
    },
    verdant_atelier: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.32),rgba(220,252,231,0.2))] backdrop-blur-[20px] border-emerald-100/45 ring-emerald-100/20 shadow-[0_14px_34px_rgba(2,44,34,0.2),inset_0_1px_0_rgba(255,255,255,0.42)]",
        toolbarClass: "border-emerald-100/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(220,252,231,0.24))] backdrop-blur-[16px] shadow-[0_12px_34px_rgba(2,44,34,0.18),inset_0_1px_0_rgba(255,255,255,0.46)]",
        inputShellClass: "border-emerald-100/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.4),rgba(236,253,245,0.24))] backdrop-blur-[14px] shadow-[0_14px_40px_rgba(2,44,34,0.18),inset_0_1px_0_rgba(255,255,255,0.5)] hover:shadow-[0_20px_48px_rgba(2,44,34,0.24),inset_0_1px_0_rgba(255,255,255,0.56)] focus-within:border-emerald-200/80 focus-within:ring-[4px] focus-within:ring-emerald-300/12",
        textareaClass: "text-emerald-950 placeholder:text-emerald-500/60",
        audioLockedClass: "border-emerald-300/90 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(187,247,208,0.9))] text-emerald-800 shadow-[0_10px_24px_rgba(5,150,105,0.14)] hover:border-emerald-400 hover:text-emerald-900",
        audioUnlockedClass: "border-teal-200/90 bg-[linear-gradient(180deg,rgba(240,253,250,0.98),rgba(204,251,241,0.92))] text-teal-700 shadow-[0_10px_24px_rgba(13,148,136,0.12)] hover:border-teal-300 hover:text-teal-800",
        speedShellClass: "border-emerald-100/60 bg-white/34 backdrop-blur-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.56)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(16,185,129,0.96),rgba(4,120,87,0.98))] text-white shadow-[0_10px_18px_rgba(5,150,105,0.22)]",
        speedIdleClass: "text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900",
        vocabButtonClass: "border-emerald-200/85 bg-[linear-gradient(180deg,rgba(240,253,244,0.96),rgba(220,252,231,0.88))] text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(236,253,245,0.44))] border-emerald-100/75 text-emerald-800 hover:bg-emerald-50/76 hover:border-emerald-200 hover:text-emerald-950 shadow-[0_10px_24px_rgba(2,44,34,0.14)] backdrop-blur-[8px]",
        wordBadgeActiveClass: "border-emerald-200/85 bg-white/94 text-emerald-700 shadow-[0_8px_18px_rgba(5,150,105,0.08)]",
        wordBadgeIdleClass: "bg-transparent text-emerald-500/70",
        hintButtonClass: "border-emerald-100/70 bg-[linear-gradient(180deg,rgba(240,253,244,0.56),rgba(220,252,231,0.36))] text-emerald-700 shadow-[0_8px_18px_rgba(2,44,34,0.14)] hover:border-emerald-200 hover:text-emerald-900 hover:shadow-[0_12px_24px_rgba(2,44,34,0.2)] backdrop-blur-[10px]",
        iconButtonClass: "border-emerald-100/70 bg-white/38 text-emerald-700 shadow-[0_8px_18px_rgba(2,44,34,0.12)] hover:border-emerald-200 hover:bg-emerald-50/46 hover:text-emerald-900 backdrop-blur-[10px]",
        checkButtonClass: "border-emerald-400/85 bg-[linear-gradient(180deg,rgba(16,185,129,0.96),rgba(5,150,105,0.98),rgba(6,95,70,0.98))] text-white shadow-[0_14px_30px_rgba(5,150,105,0.32)] hover:shadow-[0_18px_36px_rgba(5,150,105,0.4)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.44),rgba(236,253,245,0.3))] border-emerald-100/55 backdrop-blur-[18px] shadow-[0_20px_50px_rgba(2,44,34,0.24)]",
        tutorAnswerClass: "bg-emerald-50/62 text-emerald-950",
        tutorInputClass: "bg-white/48 border-emerald-100 text-emerald-900 focus:ring-emerald-300 backdrop-blur-[8px]",
        tutorSendClass: "text-emerald-700",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(16,185,129,0.96),rgba(4,120,87,0.98))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #10b981 0%, #059669 54%, #047857 100%)",
        nextButtonShadow: "0 20px 38px -12px rgba(5,150,105,0.46)",
        nextButtonGlow: "rgba(16,185,129,0.24)",
    },
    cute_cream: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,247,234,0.94),rgba(241,251,244,0.92))] border-[#eadfc9] ring-[#fff3dc] shadow-[0_16px_34px_rgba(199,170,128,0.14)]",
        toolbarClass: "border-[#e6d7bf] bg-[linear-gradient(180deg,rgba(255,251,243,0.98),rgba(255,245,230,0.95),rgba(240,251,244,0.92))] shadow-[0_12px_28px_rgba(206,177,136,0.14)]",
        inputShellClass: "border-[#e6d7bf] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,247,235,0.95))] shadow-[0_14px_34px_rgba(206,177,136,0.14),inset_0_1px_0_rgba(255,255,255,1)] hover:shadow-[0_18px_40px_rgba(206,177,136,0.18),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-[#d8c3a5] focus-within:ring-[4px] focus-within:ring-[#f3c89f]/18",
        textareaClass: "text-[#5a4638] placeholder:text-[#b59b85]",
        audioLockedClass: "border-[#f0cba7] bg-[linear-gradient(180deg,rgba(255,248,239,0.98),rgba(255,233,207,0.92))] text-[#b86d2c] shadow-[0_10px_22px_rgba(240,168,91,0.16)] hover:border-[#ebb784] hover:text-[#9d5920]",
        audioUnlockedClass: "border-[#bfe5d0] bg-[linear-gradient(180deg,rgba(248,255,250,0.98),rgba(228,249,237,0.92))] text-[#2f8a67] shadow-[0_10px_22px_rgba(91,183,141,0.14)] hover:border-[#9ed7bb] hover:text-[#206a4f]",
        speedShellClass: "border-[#e3d6c3] bg-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,1)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(255,205,146,0.98),rgba(244,155,103,0.96))] text-[#6b3d13] shadow-[0_10px_18px_rgba(244,155,103,0.2)]",
        speedIdleClass: "text-[#9d8b7c] hover:bg-[#fff8ef] hover:text-[#5a4638]",
        vocabButtonClass: "border-[#bfe5d0] bg-[linear-gradient(180deg,rgba(247,255,250,0.98),rgba(228,249,237,0.92))] text-[#2f8a67] hover:border-[#9ed7bb] hover:bg-[#dff6e8]",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,239,0.95))] border-[#eadfc9] text-[#6f5a4a] hover:bg-[#fffaf3] hover:border-[#d9c7b1] hover:text-[#4b3a30] shadow-[0_8px_18px_rgba(206,177,136,0.12)]",
        wordBadgeActiveClass: "border-[#bfe5d0] bg-[#f1fbf4] text-[#2f8a67] shadow-[0_6px_16px_rgba(91,183,141,0.08)]",
        wordBadgeIdleClass: "bg-transparent text-[#c4b4a4]",
        hintButtonClass: "border-[#f0cba7] bg-[linear-gradient(180deg,rgba(255,249,242,0.98),rgba(255,237,216,0.92))] text-[#b86d2c] shadow-[0_8px_18px_rgba(244,155,103,0.12)] hover:border-[#ebb784] hover:text-[#9d5920] hover:shadow-[0_12px_24px_rgba(244,155,103,0.16)]",
        iconButtonClass: "border-[#e6d7bf] bg-white/94 text-[#8d7666] shadow-[0_6px_16px_rgba(206,177,136,0.08)] hover:border-[#d9c7b1] hover:bg-[#fff8ef] hover:text-[#5a4638]",
        checkButtonClass: "border-[#f0b77f] bg-[linear-gradient(180deg,rgba(255,214,155,0.98),rgba(246,158,106,0.96))] text-[#5c3514] shadow-[0_14px_28px_rgba(244,155,103,0.24)] hover:shadow-[0_18px_34px_rgba(244,155,103,0.3)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,253,248,0.99),rgba(255,246,233,0.96),rgba(244,252,246,0.93))] border-[#eadfc9] shadow-[0_20px_42px_rgba(206,177,136,0.16)]",
        tutorAnswerClass: "bg-[linear-gradient(90deg,rgba(255,241,223,0.8),rgba(242,251,245,0.78))] text-[#5a4638]",
        tutorInputClass: "bg-white/92 border-[#e6d7bf] text-[#5a4638] focus:ring-[#f0cba7]",
        tutorSendClass: "text-[#c96f57]",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(191,229,208,0.98),rgba(117,194,158,0.96))] text-[#184f3b] hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #bfe5d0 0%, #ffd5ad 55%, #f4a76f 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(233,167,112,0.36)",
        nextButtonGlow: "rgba(255,213,173,0.32)",
    },
    sakura: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(252,231,243,0.66))] border-pink-200/60 ring-pink-100/40 shadow-[0_12px_30px_rgba(236,72,153,0.08)]",
        toolbarClass: "border-pink-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(252,231,243,0.74))] shadow-[0_10px_30px_rgba(236,72,153,0.08)]",
        inputShellClass: "border-pink-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(253,242,248,0.68))] shadow-[0_10px_36px_rgba(236,72,153,0.08),inset_0_1px_0_rgba(255,255,255,0.98)] hover:shadow-[0_18px_46px_rgba(236,72,153,0.1),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-pink-300/80 focus-within:ring-[4px] focus-within:ring-pink-400/12",
        textareaClass: "text-pink-950 placeholder:text-pink-300/70",
        audioLockedClass: "border-rose-200/90 bg-[linear-gradient(180deg,rgba(255,247,250,0.98),rgba(252,231,243,0.92))] text-rose-700 shadow-[0_8px_22px_rgba(236,72,153,0.12)] hover:border-rose-300 hover:text-rose-800",
        audioUnlockedClass: "border-pink-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(253,242,248,0.92))] text-pink-700 shadow-[0_8px_22px_rgba(236,72,153,0.1)] hover:border-pink-300 hover:text-pink-800",
        speedShellClass: "border-pink-200/80 bg-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.94)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(244,114,182,0.95),rgba(219,39,119,0.95))] text-white shadow-[0_8px_16px_rgba(236,72,153,0.18)]",
        speedIdleClass: "text-pink-500 hover:bg-pink-50 hover:text-pink-700",
        vocabButtonClass: "border-pink-200/80 bg-[linear-gradient(180deg,rgba(255,250,252,0.96),rgba(252,231,243,0.88))] text-pink-700 hover:border-pink-300 hover:bg-pink-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(253,242,248,0.95))] border-pink-200 text-pink-700 hover:bg-pink-50 hover:border-pink-300 hover:text-pink-900 shadow-[0_8px_22px_rgba(236,72,153,0.08)]",
        wordBadgeActiveClass: "border-pink-200/80 bg-white/92 text-pink-500 shadow-[0_6px_16px_rgba(236,72,153,0.05)]",
        wordBadgeIdleClass: "bg-transparent text-pink-300/75",
        hintButtonClass: "border-pink-200/80 bg-[linear-gradient(180deg,rgba(255,247,250,0.96),rgba(252,231,243,0.88))] text-pink-700 shadow-[0_6px_16px_rgba(236,72,153,0.08)] hover:border-pink-300 hover:text-pink-800 hover:shadow-[0_10px_20px_rgba(236,72,153,0.12)]",
        iconButtonClass: "border-pink-200/80 bg-white/90 text-pink-500 shadow-[0_6px_16px_rgba(236,72,153,0.06)] hover:border-pink-300 hover:bg-pink-50/90 hover:text-pink-700",
        checkButtonClass: "border-pink-400/80 bg-[linear-gradient(180deg,rgba(244,114,182,0.92),rgba(219,39,119,0.98))] text-white shadow-[0_10px_24px_rgba(236,72,153,0.26)] hover:shadow-[0_14px_30px_rgba(236,72,153,0.34)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(253,242,248,0.95))] border-pink-200/80 shadow-[0_18px_46px_rgba(236,72,153,0.14)]",
        tutorAnswerClass: "bg-pink-50/85 text-pink-900",
        tutorInputClass: "bg-white/88 border-pink-200 text-pink-800 focus:ring-pink-300",
        tutorSendClass: "text-pink-500",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(244,114,182,0.95),rgba(219,39,119,0.98))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #f472b6 0%, #db2777 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(236,72,153,0.42)",
        nextButtonGlow: "rgba(244,114,182,0.22)",
    },
    golden_hour: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(254,243,199,0.68))] border-amber-200/60 ring-amber-100/40 shadow-[0_12px_30px_rgba(245,158,11,0.09)]",
        toolbarClass: "border-amber-200/70 bg-[linear-gradient(180deg,rgba(255,252,243,0.84),rgba(254,243,199,0.76))] shadow-[0_12px_32px_rgba(245,158,11,0.1)]",
        inputShellClass: "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,247,237,0.68))] shadow-[0_12px_38px_rgba(245,158,11,0.1),inset_0_1px_0_rgba(255,255,255,0.98)] hover:shadow-[0_20px_48px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-amber-300/85 focus-within:ring-[4px] focus-within:ring-amber-400/14",
        textareaClass: "text-amber-950 placeholder:text-amber-400/65",
        audioLockedClass: "border-amber-300/90 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.92))] text-amber-700 shadow-[0_10px_24px_rgba(245,158,11,0.14)] hover:border-amber-400 hover:text-amber-800",
        audioUnlockedClass: "border-orange-200/85 bg-[linear-gradient(180deg,rgba(255,247,237,0.98),rgba(254,215,170,0.9))] text-orange-700 shadow-[0_10px_24px_rgba(249,115,22,0.12)] hover:border-orange-300 hover:text-orange-800",
        speedShellClass: "border-amber-200/80 bg-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.94)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(217,119,6,0.95),rgba(146,64,14,0.98))] text-white shadow-[0_8px_16px_rgba(180,83,9,0.2)]",
        speedIdleClass: "text-amber-600 hover:bg-amber-50 hover:text-amber-800",
        vocabButtonClass: "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(245,255,250,0.96),rgba(220,252,231,0.88))] text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.95))] border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900 shadow-[0_8px_24px_rgba(245,158,11,0.09)]",
        wordBadgeActiveClass: "border-amber-200/80 bg-white/92 text-amber-600 shadow-[0_6px_16px_rgba(245,158,11,0.06)]",
        wordBadgeIdleClass: "bg-transparent text-amber-400/70",
        hintButtonClass: "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(254,243,199,0.88))] text-amber-700 shadow-[0_6px_16px_rgba(245,158,11,0.08)] hover:border-amber-300 hover:text-amber-800 hover:shadow-[0_10px_20px_rgba(245,158,11,0.14)]",
        iconButtonClass: "border-amber-200/80 bg-white/90 text-amber-600 shadow-[0_6px_16px_rgba(245,158,11,0.06)] hover:border-amber-300 hover:bg-amber-50/90 hover:text-amber-800",
        checkButtonClass: "border-amber-400/80 bg-[linear-gradient(180deg,rgba(251,191,36,0.95),rgba(217,119,6,0.98))] text-white shadow-[0_12px_26px_rgba(245,158,11,0.28)] hover:shadow-[0_16px_32px_rgba(245,158,11,0.36)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.95))] border-amber-200/80 shadow-[0_18px_46px_rgba(245,158,11,0.14)]",
        tutorAnswerClass: "bg-amber-50/85 text-amber-950",
        tutorInputClass: "bg-white/88 border-amber-200 text-amber-900 focus:ring-amber-300",
        tutorSendClass: "text-amber-600",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(251,191,36,0.95),rgba(217,119,6,0.98))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(245,158,11,0.46)",
        nextButtonGlow: "rgba(251,191,36,0.24)",
    },
    holo_pearl: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(243,232,255,0.48),rgba(224,231,255,0.52))] border-white/80 ring-fuchsia-100/30 shadow-[0_14px_36px_rgba(147,51,234,0.08)]",
        toolbarClass: "border-white/80 bg-[linear-gradient(90deg,rgba(255,255,255,0.82),rgba(250,232,255,0.68),rgba(224,231,255,0.72),rgba(255,255,255,0.82))] shadow-[0_12px_34px_rgba(147,51,234,0.08)]",
        inputShellClass: "border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(248,250,252,0.68))] shadow-[0_12px_42px_rgba(147,51,234,0.08),inset_0_1px_0_rgba(255,255,255,1)] hover:shadow-[0_20px_52px_rgba(147,51,234,0.1),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-fuchsia-200/90 focus-within:ring-[4px] focus-within:ring-fuchsia-400/12",
        textareaClass: "text-slate-800 placeholder:text-slate-400/65",
        audioLockedClass: "border-fuchsia-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,232,255,0.9),rgba(224,231,255,0.92))] text-fuchsia-700 shadow-[0_10px_24px_rgba(192,38,211,0.12)] hover:border-fuchsia-300 hover:text-fuchsia-800",
        audioUnlockedClass: "border-indigo-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(238,242,255,0.92),rgba(250,232,255,0.9))] text-indigo-700 shadow-[0_10px_24px_rgba(99,102,241,0.1)] hover:border-indigo-300 hover:text-indigo-800",
        speedShellClass: "border-fuchsia-100/80 bg-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.96)]",
        speedActiveClass: "bg-[linear-gradient(135deg,rgba(236,72,153,0.95),rgba(99,102,241,0.95),rgba(192,38,211,0.96))] text-white shadow-[0_10px_18px_rgba(168,85,247,0.2)]",
        speedIdleClass: "text-slate-500 hover:bg-fuchsia-50/80 hover:text-fuchsia-700",
        vocabButtonClass: "border-teal-200/80 bg-[linear-gradient(180deg,rgba(240,253,250,0.96),rgba(204,251,241,0.88))] text-teal-700 hover:border-teal-300 hover:bg-teal-100/90",
        keywordChipClass: "bg-[linear-gradient(90deg,rgba(255,255,255,0.98),rgba(250,232,255,0.9),rgba(224,231,255,0.92))] border-white/90 text-slate-700 hover:border-fuchsia-200 hover:text-fuchsia-800 shadow-[0_10px_26px_rgba(168,85,247,0.1)]",
        wordBadgeActiveClass: "border-fuchsia-100/80 bg-white/92 text-fuchsia-600 shadow-[0_6px_16px_rgba(168,85,247,0.05)]",
        wordBadgeIdleClass: "bg-transparent text-slate-400/70",
        hintButtonClass: "border-fuchsia-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,232,255,0.88),rgba(224,231,255,0.88))] text-fuchsia-700 shadow-[0_6px_18px_rgba(168,85,247,0.08)] hover:border-fuchsia-300 hover:text-fuchsia-800 hover:shadow-[0_10px_22px_rgba(168,85,247,0.14)]",
        iconButtonClass: "border-fuchsia-100/80 bg-white/92 text-fuchsia-600 shadow-[0_6px_16px_rgba(168,85,247,0.06)] hover:border-fuchsia-200 hover:bg-fuchsia-50/90 hover:text-fuchsia-700",
        checkButtonClass: "border-fuchsia-300/80 bg-[linear-gradient(135deg,rgba(236,72,153,0.94),rgba(99,102,241,0.94),rgba(192,38,211,0.96))] text-white shadow-[0_12px_28px_rgba(168,85,247,0.26)] hover:shadow-[0_16px_34px_rgba(168,85,247,0.34)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96),rgba(250,232,255,0.94))] border-fuchsia-100/80 shadow-[0_20px_50px_rgba(168,85,247,0.14)]",
        tutorAnswerClass: "bg-[linear-gradient(90deg,rgba(250,232,255,0.72),rgba(224,231,255,0.6))] text-slate-700",
        tutorInputClass: "bg-white/88 border-fuchsia-100 text-slate-700 focus:ring-fuchsia-200",
        tutorSendClass: "text-fuchsia-500",
        analysisButtonClass: "bg-[linear-gradient(135deg,rgba(236,72,153,0.95),rgba(99,102,241,0.94),rgba(192,38,211,0.96))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #ec4899 0%, #6366f1 52%, #c026d3 100%)",
        nextButtonShadow: "0 20px 36px -12px rgba(168,85,247,0.42)",
        nextButtonGlow: "rgba(192,38,211,0.22)",
    },
    cloud_nine: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(224,242,254,0.64))] border-sky-200/60 ring-sky-100/40 shadow-[0_12px_32px_rgba(14,165,233,0.07)]",
        toolbarClass: "border-sky-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(224,242,254,0.74))] shadow-[0_10px_30px_rgba(14,165,233,0.08)]",
        inputShellClass: "border-sky-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(240,249,255,0.7))] shadow-[0_12px_38px_rgba(14,165,233,0.08),inset_0_1px_0_rgba(255,255,255,1)] hover:shadow-[0_20px_48px_rgba(14,165,233,0.1),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-cyan-300/85 focus-within:ring-[4px] focus-within:ring-cyan-300/12",
        textareaClass: "text-cyan-950 placeholder:text-cyan-400/65",
        audioLockedClass: "border-cyan-200/90 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(224,242,254,0.92))] text-cyan-700 shadow-[0_8px_22px_rgba(6,182,212,0.1)] hover:border-cyan-300 hover:text-cyan-800",
        audioUnlockedClass: "border-sky-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(224,242,254,0.9))] text-sky-700 shadow-[0_8px_22px_rgba(14,165,233,0.1)] hover:border-sky-300 hover:text-sky-800",
        speedShellClass: "border-sky-200/80 bg-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(6,182,212,0.95),rgba(8,145,178,0.98))] text-white shadow-[0_8px_16px_rgba(6,182,212,0.18)]",
        speedIdleClass: "text-cyan-600 hover:bg-cyan-50 hover:text-cyan-800",
        vocabButtonClass: "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(245,255,250,0.96),rgba(220,252,231,0.88))] text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,249,255,0.94))] border-sky-200 text-cyan-700 hover:bg-cyan-50 hover:border-cyan-300 hover:text-cyan-900 shadow-[0_8px_22px_rgba(14,165,233,0.08)]",
        wordBadgeActiveClass: "border-sky-200/80 bg-white/92 text-cyan-600 shadow-[0_6px_16px_rgba(14,165,233,0.05)]",
        wordBadgeIdleClass: "bg-transparent text-cyan-400/65",
        hintButtonClass: "border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.96),rgba(224,242,254,0.88))] text-cyan-700 shadow-[0_6px_16px_rgba(14,165,233,0.07)] hover:border-cyan-300 hover:text-cyan-800 hover:shadow-[0_10px_20px_rgba(14,165,233,0.12)]",
        iconButtonClass: "border-sky-200/80 bg-white/92 text-cyan-600 shadow-[0_6px_16px_rgba(14,165,233,0.05)] hover:border-cyan-300 hover:bg-cyan-50/90 hover:text-cyan-800",
        checkButtonClass: "border-cyan-400/80 bg-[linear-gradient(180deg,rgba(34,211,238,0.95),rgba(8,145,178,0.98))] text-white shadow-[0_12px_26px_rgba(6,182,212,0.24)] hover:shadow-[0_16px_32px_rgba(6,182,212,0.32)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,249,255,0.95))] border-sky-200/80 shadow-[0_18px_46px_rgba(14,165,233,0.12)]",
        tutorAnswerClass: "bg-cyan-50/80 text-cyan-950",
        tutorInputClass: "bg-white/88 border-sky-200 text-cyan-900 focus:ring-cyan-200",
        tutorSendClass: "text-cyan-600",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(34,211,238,0.95),rgba(8,145,178,0.98))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #22d3ee 0%, #0891b2 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(6,182,212,0.42)",
        nextButtonGlow: "rgba(34,211,238,0.2)",
    },
    lilac_dream: {
        ledgerClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(243,232,255,0.66))] border-purple-200/60 ring-purple-100/40 shadow-[0_12px_30px_rgba(168,85,247,0.08)]",
        toolbarClass: "border-purple-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(243,232,255,0.74))] shadow-[0_10px_30px_rgba(168,85,247,0.08)]",
        inputShellClass: "border-purple-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(250,245,255,0.68))] shadow-[0_12px_38px_rgba(168,85,247,0.08),inset_0_1px_0_rgba(255,255,255,1)] hover:shadow-[0_20px_48px_rgba(168,85,247,0.1),inset_0_1px_0_rgba(255,255,255,1)] focus-within:border-purple-300/85 focus-within:ring-[4px] focus-within:ring-purple-300/12",
        textareaClass: "text-purple-950 placeholder:text-purple-400/65",
        audioLockedClass: "border-purple-200/90 bg-[linear-gradient(180deg,rgba(250,245,255,0.98),rgba(243,232,255,0.92))] text-purple-700 shadow-[0_8px_22px_rgba(168,85,247,0.1)] hover:border-purple-300 hover:text-purple-800",
        audioUnlockedClass: "border-fuchsia-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,232,255,0.92))] text-fuchsia-700 shadow-[0_8px_22px_rgba(217,70,239,0.1)] hover:border-fuchsia-300 hover:text-fuchsia-800",
        speedShellClass: "border-purple-200/80 bg-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]",
        speedActiveClass: "bg-[linear-gradient(180deg,rgba(168,85,247,0.95),rgba(147,51,234,0.98))] text-white shadow-[0_8px_16px_rgba(168,85,247,0.18)]",
        speedIdleClass: "text-purple-500 hover:bg-purple-50 hover:text-purple-700",
        vocabButtonClass: "border-violet-200/80 bg-[linear-gradient(180deg,rgba(245,243,255,0.96),rgba(237,233,254,0.88))] text-violet-700 hover:border-violet-300 hover:bg-violet-100/90",
        keywordChipClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,245,255,0.94))] border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-900 shadow-[0_8px_22px_rgba(168,85,247,0.08)]",
        wordBadgeActiveClass: "border-purple-200/80 bg-white/92 text-purple-600 shadow-[0_6px_16px_rgba(168,85,247,0.05)]",
        wordBadgeIdleClass: "bg-transparent text-purple-400/65",
        hintButtonClass: "border-purple-200/80 bg-[linear-gradient(180deg,rgba(250,245,255,0.96),rgba(243,232,255,0.88))] text-purple-700 shadow-[0_6px_16px_rgba(168,85,247,0.08)] hover:border-purple-300 hover:text-purple-800 hover:shadow-[0_10px_20px_rgba(168,85,247,0.12)]",
        iconButtonClass: "border-purple-200/80 bg-white/92 text-purple-600 shadow-[0_6px_16px_rgba(168,85,247,0.05)] hover:border-purple-300 hover:bg-purple-50/90 hover:text-purple-800",
        checkButtonClass: "border-purple-400/80 bg-[linear-gradient(180deg,rgba(192,132,252,0.95),rgba(147,51,234,0.98))] text-white shadow-[0_12px_26px_rgba(168,85,247,0.24)] hover:shadow-[0_16px_32px_rgba(168,85,247,0.32)]",
        tutorPanelClass: "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,245,255,0.95))] border-purple-200/80 shadow-[0_18px_46px_rgba(168,85,247,0.14)]",
        tutorAnswerClass: "bg-purple-50/82 text-purple-950",
        tutorInputClass: "bg-white/88 border-purple-200 text-purple-900 focus:ring-purple-200",
        tutorSendClass: "text-purple-600",
        analysisButtonClass: "bg-[linear-gradient(180deg,rgba(192,132,252,0.95),rgba(147,51,234,0.98))] text-white hover:brightness-105",
        nextButtonGradient: "linear-gradient(90deg, #c084fc 0%, #9333ea 100%)",
        nextButtonShadow: "0 18px 34px -12px rgba(168,85,247,0.42)",
        nextButtonGlow: "rgba(192,132,252,0.22)",
    },
};

const ALL_THEME_IDS = Object.keys(COSMETIC_THEMES) as CosmeticThemeId[];
const FREE_THEME_IDS = ALL_THEME_IDS.filter((themeId) => COSMETIC_THEMES[themeId].price === 0);
const DEFAULT_BASE_ELO = 400;
const DEFAULT_STARTING_COINS = 500;
const DEFAULT_FREE_THEME: CosmeticThemeId = "morning_coffee";

const normalizeOwnedThemes = (ownedThemes?: string[] | null): CosmeticThemeId[] => {
    const validThemes = (ownedThemes ?? []).filter((themeId): themeId is CosmeticThemeId => themeId in COSMETIC_THEMES);
    return validThemes.length
        ? Array.from(new Set([...validThemes, ...FREE_THEME_IDS]))
        : [...FREE_THEME_IDS];
};

const getStreakTier = (streak: number): StreakTier => {
    if (streak >= 10) return 4;
    if (streak >= 7) return 3;
    if (streak >= 4) return 2;
    if (streak >= 2) return 1;
    return 0;
};

const STREAK_TIER_VISUALS: Record<StreakTier, StreakTierVisual> = {
    0: {
        accent: "#78716c",
        badgeGradient: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(245,245,244,0.92))",
        badgeBorder: "rgba(214,211,209,0.9)",
        badgeShadow: "0 10px 24px rgba(120,113,108,0.08)",
        badgeGlow: "transparent",
        auraGradient: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0), transparent 58%)",
        beamGradient: "linear-gradient(90deg, transparent, transparent)",
        beamShadow: "none",
        surfaceBorder: "rgba(255,255,255,0.55)",
        surfaceShadow: "0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
        checkGradient: "linear-gradient(135deg, #292524 0%, #44403c 40%, #1c1917 100%)",
        checkBorder: "rgba(68,64,60,0.5)",
        checkShadow: "0 12px 24px rgba(28,25,23,0.24)",
        nextGradient: "linear-gradient(90deg, #f97316 0%, #d97706 100%)",
        nextShadow: "0 10px 30px -10px rgba(249,115,22,0.5)",
        eloGradient: "linear-gradient(90deg, rgba(16,185,129,0.08), rgba(16,185,129,0.02))",
        eloBorder: "rgba(209,250,229,0.9)",
        eloShadow: "0 8px 20px rgba(16,185,129,0.08)",
        progressGradient: "linear-gradient(90deg, #a8a29e 0%, #78716c 100%)",
        scoreGlow: "none",
        particleGradient: "radial-gradient(circle, rgba(255,255,255,0.6), transparent 70%)",
        particleDensity: 0,
    },
    1: {
        accent: "#c2410c",
        badgeGradient: "linear-gradient(135deg, rgba(255,247,237,0.98), rgba(255,237,213,0.92))",
        badgeBorder: "rgba(251,146,60,0.36)",
        badgeShadow: "0 14px 30px rgba(251,146,60,0.18)",
        badgeGlow: "rgba(251,146,60,0.18)",
        auraGradient: "radial-gradient(circle at 50% 0%, rgba(251,191,36,0.16), transparent 56%)",
        beamGradient: "linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.78) 50%, transparent 100%)",
        beamShadow: "0 0 28px rgba(251,191,36,0.34)",
        surfaceBorder: "rgba(251,191,36,0.3)",
        surfaceShadow: "0 24px 72px rgba(251,146,60,0.12), inset 0 1px 0 rgba(255,255,255,0.88)",
        checkGradient: "linear-gradient(135deg, #d97706 0%, #f59e0b 52%, #f97316 100%)",
        checkBorder: "rgba(251,146,60,0.45)",
        checkShadow: "0 16px 30px rgba(245,158,11,0.28)",
        nextGradient: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)",
        nextShadow: "0 16px 34px -12px rgba(249,115,22,0.48)",
        eloGradient: "linear-gradient(90deg, rgba(245,158,11,0.96), rgba(249,115,22,0.92))",
        eloBorder: "rgba(251,191,36,0.5)",
        eloShadow: "0 18px 40px rgba(249,115,22,0.28)",
        progressGradient: "linear-gradient(90deg, #f59e0b 0%, #fb923c 100%)",
        scoreGlow: "0 0 26px rgba(249,115,22,0.2)",
        particleGradient: "radial-gradient(circle, rgba(251,191,36,0.92), rgba(249,115,22,0.18) 55%, transparent 72%)",
        particleDensity: 0,
    },
    2: {
        accent: "#ea580c",
        badgeGradient: "linear-gradient(135deg, rgba(255,245,230,0.98), rgba(254,215,170,0.9))",
        badgeBorder: "rgba(249,115,22,0.42)",
        badgeShadow: "0 18px 38px rgba(249,115,22,0.22)",
        badgeGlow: "rgba(249,115,22,0.24)",
        auraGradient: "radial-gradient(circle at 50% 0%, rgba(251,146,60,0.18), transparent 56%)",
        beamGradient: "linear-gradient(90deg, transparent 0%, rgba(249,115,22,0.88) 24%, rgba(251,191,36,0.95) 52%, rgba(249,115,22,0.88) 76%, transparent 100%)",
        beamShadow: "0 0 40px rgba(249,115,22,0.44)",
        surfaceBorder: "rgba(249,115,22,0.32)",
        surfaceShadow: "0 28px 84px rgba(249,115,22,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
        checkGradient: "linear-gradient(135deg, #c2410c 0%, #f97316 48%, #fbbf24 100%)",
        checkBorder: "rgba(249,115,22,0.55)",
        checkShadow: "0 18px 36px rgba(249,115,22,0.32)",
        nextGradient: "linear-gradient(90deg, #ea580c 0%, #f59e0b 100%)",
        nextShadow: "0 20px 40px -12px rgba(249,115,22,0.54)",
        eloGradient: "linear-gradient(90deg, rgba(249,115,22,0.97), rgba(251,191,36,0.96))",
        eloBorder: "rgba(251,146,60,0.58)",
        eloShadow: "0 22px 44px rgba(249,115,22,0.32)",
        progressGradient: "linear-gradient(90deg, #f97316 0%, #f59e0b 55%, #fbbf24 100%)",
        scoreGlow: "0 0 34px rgba(249,115,22,0.24)",
        particleGradient: "radial-gradient(circle, rgba(251,191,36,1), rgba(249,115,22,0.22) 58%, transparent 72%)",
        particleDensity: 0,
    },
    3: {
        accent: "#fb923c",
        badgeGradient: "linear-gradient(135deg, rgba(255,240,222,0.98), rgba(254,178,84,0.88))",
        badgeBorder: "rgba(251,146,60,0.55)",
        badgeShadow: "0 20px 44px rgba(249,115,22,0.28)",
        badgeGlow: "rgba(251,146,60,0.32)",
        auraGradient: "radial-gradient(circle at 50% 0%, rgba(249,115,22,0.24), transparent 54%)",
        beamGradient: "linear-gradient(90deg, transparent 0%, rgba(251,146,60,0.95) 16%, rgba(250,204,21,0.98) 50%, rgba(251,146,60,0.95) 84%, transparent 100%)",
        beamShadow: "0 0 48px rgba(249,115,22,0.52)",
        surfaceBorder: "rgba(251,146,60,0.34)",
        surfaceShadow: "0 34px 92px rgba(249,115,22,0.2), inset 0 1px 0 rgba(255,255,255,0.92)",
        checkGradient: "linear-gradient(135deg, #c2410c 0%, #f97316 38%, #fb923c 68%, #facc15 100%)",
        checkBorder: "rgba(251,146,60,0.6)",
        checkShadow: "0 22px 42px rgba(249,115,22,0.36)",
        nextGradient: "linear-gradient(90deg, #ea580c 0%, #f97316 36%, #fbbf24 100%)",
        nextShadow: "0 24px 46px -14px rgba(249,115,22,0.6)",
        eloGradient: "linear-gradient(90deg, rgba(234,88,12,0.98), rgba(249,115,22,0.97) 42%, rgba(250,204,21,0.96) 100%)",
        eloBorder: "rgba(251,146,60,0.64)",
        eloShadow: "0 24px 48px rgba(249,115,22,0.38)",
        progressGradient: "linear-gradient(90deg, #ea580c 0%, #f97316 45%, #fbbf24 100%)",
        scoreGlow: "0 0 42px rgba(249,115,22,0.32)",
        particleGradient: "radial-gradient(circle, rgba(250,204,21,1), rgba(249,115,22,0.26) 52%, transparent 70%)",
        particleDensity: 6,
    },
    4: {
        accent: "#facc15",
        badgeGradient: "linear-gradient(135deg, rgba(255,248,220,0.99), rgba(250,204,21,0.9) 52%, rgba(251,146,60,0.88) 100%)",
        badgeBorder: "rgba(250,204,21,0.66)",
        badgeShadow: "0 24px 52px rgba(250,204,21,0.28)",
        badgeGlow: "rgba(250,204,21,0.36)",
        auraGradient: "radial-gradient(circle at 50% 0%, rgba(250,204,21,0.26), transparent 52%)",
        beamGradient: "linear-gradient(90deg, transparent 0%, rgba(255,247,205,0.96) 12%, rgba(250,204,21,1) 50%, rgba(251,146,60,0.96) 88%, transparent 100%)",
        beamShadow: "0 0 56px rgba(250,204,21,0.58)",
        surfaceBorder: "rgba(250,204,21,0.38)",
        surfaceShadow: "0 40px 100px rgba(250,204,21,0.18), inset 0 1px 0 rgba(255,255,255,0.94)",
        checkGradient: "linear-gradient(135deg, #9a3412 0%, #f97316 24%, #f59e0b 48%, #facc15 78%, #fff7cc 100%)",
        checkBorder: "rgba(250,204,21,0.72)",
        checkShadow: "0 26px 48px rgba(250,204,21,0.34)",
        nextGradient: "linear-gradient(90deg, #c2410c 0%, #f97316 28%, #f59e0b 58%, #facc15 100%)",
        nextShadow: "0 28px 56px -14px rgba(250,204,21,0.4)",
        eloGradient: "linear-gradient(90deg, rgba(217,119,6,0.98), rgba(249,115,22,0.98) 35%, rgba(250,204,21,1) 72%, rgba(255,247,205,0.98) 100%)",
        eloBorder: "rgba(250,204,21,0.78)",
        eloShadow: "0 28px 56px rgba(250,204,21,0.34)",
        progressGradient: "linear-gradient(90deg, #d97706 0%, #f97316 34%, #facc15 78%, #fff7cc 100%)",
        scoreGlow: "0 0 56px rgba(250,204,21,0.34)",
        particleGradient: "radial-gradient(circle, rgba(255,247,205,1), rgba(250,204,21,0.28) 50%, transparent 70%)",
        particleDensity: 10,
    },
};

export function DrillCore({ context, initialMode = "translation", listeningSourceMode = "ai", onClose }: DrillCoreProps) {
    // Mode State
    const [mode, setMode] = useState<DrillMode>(initialMode);
    const isListeningMode = mode === "listening";
    const isRebuildMode = mode === "rebuild";
    const isDictationMode = mode === "dictation";
    const isListeningFamilyMode = isListeningMode || isDictationMode;
    const isAudioPracticeMode = isListeningFamilyMode || isRebuildMode;
    const canUseModeShop = mode === "translation" || isListeningFamilyMode || isRebuildMode;
    const generationMode: "translation" | "listening" | "rebuild" = isDictationMode
        ? "listening"
        : isRebuildMode
            ? "rebuild"
            : isListeningMode
                ? "listening"
                : "translation";

    // Drill State
    const [drillData, setDrillData] = useState<DrillData | null>(null);
    const [userTranslation, setUserTranslation] = useState("");
    const [isGeneratingDrill, setIsGeneratingDrill] = useState(false);
    const [isSubmittingDrill, setIsSubmittingDrill] = useState(false);
    const [isReportingTooHard, setIsReportingTooHard] = useState(false);
    const [drillFeedback, setDrillFeedback] = useState<DrillFeedback | null>(null);
    const [rebuildFeedback, setRebuildFeedback] = useState<RebuildFeedbackState | null>(null);
    const [eloSplash, setEloSplash] = useState<{ uid: string, delta: number } | null>(null);
    const lastEloSplashObjRef = useRef<any>(null);
    const { isReady: isIpaReady, getIPA } = useIPA(isRebuildMode);
    const [hasRatedDrill, setHasRatedDrill] = useState(false);
    const [analysisRequested, setAnalysisRequested] = useState(false);
    const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [analysisDetailsOpen, setAnalysisDetailsOpen] = useState(false);
    const [fullAnalysisRequested, setFullAnalysisRequested] = useState(false);
    const [isGeneratingFullAnalysis, setIsGeneratingFullAnalysis] = useState(false);
    const [fullAnalysisError, setFullAnalysisError] = useState<string | null>(null);
    const [fullAnalysisOpen, setFullAnalysisOpen] = useState(false);
    const [fullAnalysisData, setFullAnalysisData] = useState<DrillFeedback | null>(null);
    const [isGeneratingGrammar, setIsGeneratingGrammar] = useState(false);
    const [grammarError, setGrammarError] = useState<string | null>(null);
    const [referenceGrammarAnalysis, setReferenceGrammarAnalysis] = useState<GrammarSentenceAnalysis[] | null>(null);
    const [referenceGrammarDisplayMode, setReferenceGrammarDisplayMode] = useState<GrammarDisplayMode>("core");

    // Audio & Dictionary State
    const [isPlaying, setIsPlaying] = useState(false);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [isPrefetching, setIsPrefetching] = useState(false); // Track background audio prefetch
    const [loadingAudioKeys, setLoadingAudioKeys] = useState<Set<string>>(() => new Set());
    const [prefetchedDrillData, setPrefetchedDrillData] = useState<PrefetchedDrillData | null>(null);
    const abortPrefetchRef = useRef<AbortController | null>(null);
    const rebuildChoicePrefetchAbortRef = useRef<AbortController | null>(null);
    const prefetchedRebuildChoicesRef = useRef<Partial<Record<RebuildSelfEvaluation, PrefetchedDrillData>>>({});
    const recentListeningBankIdsRef = useRef<string[]>([]);
    const rebuildMetaNamespaceRef = useRef("local");
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioObjectUrlRef = useRef<string | null>(null);
    const audioCache = useRef<Map<string, { url?: string; blob?: Blob; marks?: any[] }>>(new Map());
    const audioInflight = useRef<Map<string, Promise<{ blob: Blob; marks: any[] }>>>(new Map());
    const [currentAudioTime, setCurrentAudioTime] = useState(0);
    const [activePlaybackAudio, setActivePlaybackAudio] = useState<HTMLAudioElement | null>(null);

    // Active Word Card
    const [wordPopup, setWordPopup] = useState<PopupState | null>(null);
    const lastWordPopupTriggerRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

    // Speech Input Integration
    const {
        isAvailable: speechInputAvailable,
        canRecord: speechInputReady,
        isRecording: whisperRecording,
        isProcessing: whisperProcessing,
        result: whisperResult,
        audioLevel: speechInputLevel,
        error: speechInputError,
        wavBlob,
        setContext,
        startRecognition,
        stopRecognition,
        playRecording,
        resetResult,
    } = useSpeechInput();

    // Ask Tutor State
    const [isTutorOpen, setIsTutorOpen] = useState(false);
    const [tutorQuery, setTutorQuery] = useState("");
    const [tutorAnswer, setTutorAnswer] = useState<string | null>(null);
    const [tutorThread, setTutorThread] = useState<TutorHistoryTurn[]>([]);
    const [tutorResponse, setTutorResponse] = useState<TutorStructuredResponse | null>(null);
    const [tutorPendingQuestion, setTutorPendingQuestion] = useState<string | null>(null);
    const [isAskingTutor, setIsAskingTutor] = useState(false);
    const [tutorRecentMastery, setTutorRecentMastery] = useState<string[]>([]);
    const [tutorThinkingMode, setTutorThinkingMode] = useState<TutorThinkingMode>("chat");
    const [tutorAnswerMode, setTutorAnswerMode] = useState<TutorAnswerMode>("adaptive");
    const tutorConversationRef = useRef<HTMLDivElement | null>(null);
    const [rebuildTutorSession, setRebuildTutorSession] = useState<RebuildTutorSessionState | null>(null);

    // Teaching Mode State
    const [teachingMode, setTeachingMode] = useState(false);
    const [teachingData, setTeachingData] = useState<any>(null);
    const [isLoadingTeaching, setIsLoadingTeaching] = useState(false);
    const [teachingPanelOpen, setTeachingPanelOpen] = useState(false); // Floating panel visibility

    // Guided Learning State
    const [learningSession, setLearningSession] = useState(false);
    const [guidedModeStatus, setGuidedModeStatus] = useState<GuidedModeStatus>("idle");
    const [guidedScript, setGuidedScript] = useState<GuidedScript | null>(null);
    const [guidedCurrentStepIndex, setGuidedCurrentStepIndex] = useState(0);
    const [guidedCurrentAttemptCount, setGuidedCurrentAttemptCount] = useState(0);
    const [guidedChoicesVisible, setGuidedChoicesVisible] = useState(false);
    const [guidedRevealReady, setGuidedRevealReady] = useState(false);
    const [guidedFilledFragments, setGuidedFilledFragments] = useState<Record<string, string>>({});
    const [guidedLastFeedback, setGuidedLastFeedback] = useState<string | null>(null);
    const [guidedInnerMode, setGuidedInnerMode] = useState<GuidedInnerMode>("teacher_guided");
    const [guidedClozeState, setGuidedClozeState] = useState<GuidedClozeState | null>(null);
    const [guidedInput, setGuidedInput] = useState("");
    const [guidedAiHint, setGuidedAiHint] = useState<GuidedAiHint | null>(null);
    const [isGuidedAiHintLoading, setIsGuidedAiHintLoading] = useState(false);
    const [prefetchedGuidedScript, setPrefetchedGuidedScript] = useState<GuidedScript | null>(null);
    const guidedCurrentStepIndexRef = useRef(0);
    const guidedFilledFragmentsRef = useRef<Record<string, string>>({});
    const guidedPrefetchAbortRef = useRef<AbortController | null>(null);
    const guidedPrefetchKeyRef = useRef<string | null>(null);
    const guidedPrefetchPromiseRef = useRef<Promise<GuidedScript> | null>(null);
    const prefetchedGuidedScriptRef = useRef<GuidedScript | null>(null);
    const guidedHintAbortRef = useRef<AbortController | null>(null);
    const guidedHintCacheRef = useRef<Map<string, GuidedAiHint>>(new Map());
    const guidedHintPromiseRef = useRef<Map<string, Promise<GuidedAiHint>>>(new Map());
    const guidedAiHintRequestCountRef = useRef(0);

    // UI State
    const [isBlindMode, setIsBlindMode] = useState(true);
    const [showChinese, setShowChinese] = useState(false);
    const [blindVisibleUnlockConsumed, setBlindVisibleUnlockConsumed] = useState(false);
    const [difficulty, setDifficulty] = useState<string>('Level 3');
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

    // Elo State
    const [eloRating, setEloRating] = useState(DEFAULT_BASE_ELO); // Translation Elo
    const [streakCount, setStreakCount] = useState(0);

    const [listeningElo, setListeningElo] = useState(DEFAULT_BASE_ELO);
    const [listeningStreak, setListeningStreak] = useState(0);
    const [dictationElo, setDictationElo] = useState(DEFAULT_BASE_ELO);
    const [dictationStreak, setDictationStreak] = useState(0);
    const [rebuildHiddenElo, setRebuildHiddenElo] = useState(DEFAULT_BASE_ELO);
    const [rebuildBattleElo, setRebuildBattleElo] = useState(DEFAULT_BASE_ELO);
    const [rebuildBattleStreak, setRebuildBattleStreak] = useState(0);
    const [dailyDrillProgress, setDailyDrillProgress] = useState<DailyDrillProgress>(() => createDailyDrillProgress());
    const [isDailyDrillProgressOpen, setIsDailyDrillProgressOpen] = useState(false);
    const [dailyDrillGoalDraft, setDailyDrillGoalDraft] = useState("");
    const [audioSourceText, setAudioSourceText] = useState<string | null>(null);
    const [rebuildTypingBuffer, setRebuildTypingBuffer] = useState("");
    const [rebuildAutocorrect, setRebuildAutocorrect] = useState(true);
    const [rebuildHideTokens, setRebuildHideTokens] = useState(false);
    const [rebuildShadowingAutoOpen, setRebuildShadowingAutoOpen] = useState(true);
    const [isEloLoaded, setIsEloLoaded] = useState(false); // Track if Elo has been loaded from DB
    const eloRatingRef = useRef(DEFAULT_BASE_ELO);
    const listeningEloRef = useRef(DEFAULT_BASE_ELO);
    const dictationEloRef = useRef(DEFAULT_BASE_ELO);
    const coinsRef = useRef(DEFAULT_STARTING_COINS);
    const inventoryRef = useRef<InventoryState>({ ...DEFAULT_INVENTORY });

    // Hint Economy State
    const [coins, setCoins] = useState(DEFAULT_STARTING_COINS);
    const [inventory, setInventory] = useState<InventoryState>({ ...DEFAULT_INVENTORY });
    const [isHintShake, setIsHintShake] = useState(false);
    const [isHintLoading, setIsHintLoading] = useState(false);
    const [fullReferenceHint, setFullReferenceHint] = useState<{ version: number; text: string }>({ version: 0, text: '' });
    const [isVocabHintRevealed, setIsVocabHintRevealed] = useState(false);
    const [showShopModal, setShowShopModal] = useState(false);
    const [shopFocusedItem, setShopFocusedItem] = useState<ShopItemId | null>(null);
    const [isShopDockHovered, setIsShopDockHovered] = useState(false);
    const [shopDockHasHoverSupport, setShopDockHasHoverSupport] = useState(false);
    const [isTranslationAudioUnlocked, setIsTranslationAudioUnlocked] = useState(false);
    const [economyFxQueue, setEconomyFxQueue] = useState<EconomyFxEvent[]>([]);
    const [activeEconomyFx, setActiveEconomyFx] = useState<EconomyFxEvent | null>(null);
    const [activeEconomyVector, setActiveEconomyVector] = useState<{ target: EconomyTargetId; x: number; y: number } | null>(null);
    const [resourcePulseTarget, setResourcePulseTarget] = useState<EconomyTargetId | null>(null);
    const battleShellRef = useRef<HTMLDivElement | null>(null);
    const resourceTargetRefs = useRef<Record<EconomyTargetId, HTMLDivElement | null>>({
        coins: null,
        capsule: null,
        hint_ticket: null,
        vocab_ticket: null,
        audio_ticket: null,
        refresh_ticket: null,
    });
    const economyFxIdRef = useRef(0);
    const hasRecordedDailyDrillRef = useRef(false);
    const dailyDrillProgressRef = useRef<HTMLDivElement | null>(null);

    // Cosmetic Theme State
    const [cosmeticTheme, setCosmeticTheme] = useState<CosmeticThemeId>('morning_coffee');
    const [ownedThemes, setOwnedThemes] = useState<CosmeticThemeId[]>([...FREE_THEME_IDS]);
    const [rebuildAvailableTokens, setRebuildAvailableTokens] = useState<RebuildTokenInstance[]>([]);
    const [rebuildAnswerTokens, setRebuildAnswerTokens] = useState<RebuildTokenInstance[]>([]);
    const [rebuildReplayCount, setRebuildReplayCount] = useState(0);
    const [rebuildEditCount, setRebuildEditCount] = useState(0);
    const [rebuildStartedAt, setRebuildStartedAt] = useState<number | null>(null);
    const [activePassageSegmentIndex, setActivePassageSegmentIndex] = useState(0);
    const [rebuildPassageDrafts, setRebuildPassageDrafts] = useState<RebuildPassageSegmentDraftState[]>([]);
    const [rebuildPassageResults, setRebuildPassageResults] = useState<RebuildPassageSegmentResultState[]>([]);
    const [rebuildPassageUiState, setRebuildPassageUiState] = useState<RebuildPassageSegmentUiState[]>([]);
    const [rebuildPassageScores, setRebuildPassageScores] = useState<RebuildPassageSegmentScore[]>([]);
    const [rebuildPassageSummary, setRebuildPassageSummary] = useState<RebuildPassageSummaryState | null>(null);
    const [rebuildShadowingState, setRebuildShadowingState] = useState<RebuildShadowingState>(() => createDefaultRebuildShadowingState());
    const [rebuildSentenceShadowingFlow, setRebuildSentenceShadowingFlow] = useState<RebuildSentenceShadowingFlow>("idle");
    const [pendingRebuildSentenceFeedback, setPendingRebuildSentenceFeedback] = useState<RebuildFeedbackState | null>(null);
    const [rebuildPassageShadowingFlow, setRebuildPassageShadowingFlow] = useState<RebuildSentenceShadowingFlow>("idle");
    const [rebuildPassageShadowingSegmentIndex, setRebuildPassageShadowingSegmentIndex] = useState<number | null>(null);
    const [pendingRebuildAdvanceElo, setPendingRebuildAdvanceElo] = useState<number | null>(null);
    const lastRebuildResolvedAtRef = useRef<number | null>(null);
    const lastScoreCelebrationRef = useRef<string>("");
    const rebuildTokenOrderRef = useRef<Map<string, number>>(new Map());
    const prefersReducedMotion = useReducedMotion();
    const activeCosmeticTheme = {
        bgClass: 'bg-theme-base-bg font-sans',
        cardClass: 'bg-theme-card-bg border-[4px] border-theme-border shadow-[0_8px_0_0_var(--theme-shadow)] ring-1 ring-theme-border/10',
        textClass: 'text-theme-text',
        mutedClass: 'text-theme-text-muted',
        headerBg: 'bg-theme-base-bg',
        isDark: false,
    };
    const activeCosmeticUi = {
        ledgerClass: "bg-theme-card-bg border-[3px] border-theme-border shadow-[0_4px_0_var(--theme-shadow)]",
        toolbarClass: "border-[3px] border-theme-border bg-theme-primary-bg shadow-[0_4px_0_var(--theme-shadow)]",
        inputShellClass: "bg-black/[0.04] shadow-[inset_0_4px_12px_rgba(0,0,0,0.06),inset_0_1px_3px_rgba(0,0,0,0.04)] focus-within:ring-[3px] focus-within:ring-theme-border/20 text-theme-text transition-all",
        textareaClass: "bg-transparent text-theme-text placeholder:text-theme-text-muted",
        audioLockedClass: "border-[3px] border-theme-border bg-theme-card-bg text-theme-text shadow-[0_4px_0_var(--theme-shadow)] hover:bg-theme-active-bg hover:text-theme-active-text hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all",
        audioUnlockedClass: "border-[3px] border-theme-border bg-theme-active-bg text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all",
        speedShellClass: "border-[3px] border-theme-border bg-theme-base-bg",
        speedActiveClass: "bg-theme-text text-theme-base-bg shadow-[inset_0_2px_0_rgba(0,0,0,0.2)]",
        speedIdleClass: "text-theme-text-muted hover:bg-theme-active-bg hover:text-theme-active-text transition-colors",
        vocabButtonClass: "border-[3px] border-theme-border bg-theme-card-bg text-theme-text hover:bg-theme-active-bg hover:text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all",
        keywordChipClass: "bg-theme-base-bg border-[3px] border-theme-border text-theme-text hover:bg-theme-active-bg hover:text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all font-bold cursor-pointer",
        wordBadgeActiveClass: "border-[3px] border-theme-border bg-theme-active-bg text-theme-active-text shadow-[0_3px_0_var(--theme-shadow)] font-bold",
        wordBadgeIdleClass: "bg-transparent text-theme-text-muted font-medium",
        hintButtonClass: "border-[3px] border-theme-border bg-theme-card-bg text-theme-text shadow-[0_4px_0_var(--theme-shadow)] hover:bg-theme-active-bg hover:text-theme-active-text hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all",
        iconButtonClass: "border-[3px] border-theme-border bg-theme-card-bg text-theme-text shadow-[0_4px_0_var(--theme-shadow)] hover:bg-theme-active-bg hover:text-theme-active-text hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all",
        checkButtonClass: "bg-theme-primary-bg text-theme-primary-text border-[4px] border-theme-border shadow-[0_6px_0_var(--theme-shadow)] hover:-translate-y-1 hover:shadow-[0_10px_0_var(--theme-shadow)] active:translate-y-1.5 active:shadow-[0_0_0_var(--theme-shadow)] transition-all text-xl md:text-2xl font-black rounded-2xl md:rounded-[1.25rem]",
        tutorPanelClass: "bg-theme-card-bg border-[3px] border-theme-border shadow-[0_8px_0_0_var(--theme-shadow)] rounded-[1.5rem]",
        tutorAnswerClass: "bg-theme-base-bg text-theme-text border-[3px] border-theme-border font-bold shadow-[0_4px_0_0_var(--theme-shadow)]",
        tutorInputClass: "bg-theme-base-bg border-[3px] border-theme-border text-theme-text font-bold focus:ring-[4px] focus:ring-theme-active-bg/50 shadow-[inset_0_4px_0_rgba(0,0,0,0.04)]",
        tutorSendClass: "text-theme-text hover:bg-theme-active-bg border-[3px] border-transparent hover:border-theme-border rounded-[1rem] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_0_0_var(--theme-shadow)] active:translate-y-0.5 active:shadow-[0_0_0_rgba(0,0,0,0)] cursor-pointer",
        analysisButtonClass: "bg-theme-text text-theme-base-bg hover:opacity-90 shadow-[0_4px_0_var(--theme-shadow)] font-black border-[3px] border-theme-border text-lg hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_0_0_var(--theme-shadow)] transition-all cursor-pointer",
        nextButtonGradient: "var(--theme-active-bg)",
        nextButtonShadow: "0 8px 0 var(--theme-shadow)",
        nextButtonGlow: "rgba(0,0,0,0)",
    };
    const isShopInventoryExpanded = shouldExpandShopInventoryDock({
        hasHoverSupport: shopDockHasHoverSupport,
        isShopHovered: isShopDockHovered,
    });

    const buildRebuildMetaKey = useCallback((suffix: "hidden_elo" | "last_session") => {
        return `rebuild_${suffix}::${rebuildMetaNamespaceRef.current}`;
    }, []);
    const rebuildVariant = context.rebuildVariant ?? "sentence";
    const rebuildSegmentCount = context.segmentCount ?? 3;
    const isRebuildPassage = isRebuildMode && rebuildVariant === "passage";
    const isVerdantRebuild = false;
    const passageSession = isRebuildPassage ? (drillData?._rebuildMeta?.passageSession ?? null) : null;
    const activePassageResult = isRebuildPassage
        ? (rebuildPassageResults.find((item) => item.segmentIndex === activePassageSegmentIndex) ?? null)
        : null;
    const activePassageSegmentForShadowing = isRebuildPassage
        ? (passageSession?.segments?.[activePassageSegmentIndex] ?? null)
        : null;
    const activeRebuildShadowingScope = useMemo<RebuildShadowingScope | null>(() => {
        if (!isRebuildMode) return null;
        if (isRebuildPassage) {
            return activePassageResult
                ? { kind: "segment", segmentIndex: activePassageSegmentIndex }
                : null;
        }
        return (rebuildFeedback || pendingRebuildSentenceFeedback) ? { kind: "sentence" } : null;
    }, [activePassageResult, activePassageSegmentIndex, isRebuildMode, isRebuildPassage, pendingRebuildSentenceFeedback, rebuildFeedback]);
    const activeRebuildShadowingReferenceEnglish = useMemo(() => {
        if (!drillData || !activeRebuildShadowingScope) return "";
        if (activeRebuildShadowingScope.kind === "segment") {
            return drillData._rebuildMeta?.passageSession?.segments?.[activeRebuildShadowingScope.segmentIndex]?.referenceEnglish || "";
        }
        return drillData.reference_english || "";
    }, [activeRebuildShadowingScope, drillData]);
    const activeRebuildShadowingEntry = useMemo(() => (
        activeRebuildShadowingScope
            ? getRebuildShadowingEntry<Blob, RebuildShadowingResult>(rebuildShadowingState, activeRebuildShadowingScope)
            : null
    ), [activeRebuildShadowingScope, rebuildShadowingState]);
    const [rebuildShadowingLiveRecognitionTranscript, setRebuildShadowingLiveRecognitionTranscript] = useState("");
    const [showRebuildShadowingCorrection, setShowRebuildShadowingCorrection] = useState(false);
    const [rebuildListeningProgressCursor, setRebuildListeningProgressCursor] = useState(0);
    const [isRebuildSpeechRecognitionRunning, setIsRebuildSpeechRecognitionRunning] = useState(false);
    const [isRebuildSpeechRecognitionSupported, setIsRebuildSpeechRecognitionSupported] = useState(true);
    const [rebuildListeningScoreFx, setRebuildListeningScoreFx] = useState<{
        score: number;
        tier: ListeningScoreTier;
        title: string;
        detail: string;
    } | null>(null);
    const rebuildListeningScoreFxTimerRef = useRef<number | null>(null);
    const rebuildShadowingRecorderRef = useRef<MediaRecorder | null>(null);
    const rebuildShadowingRecorderStreamRef = useRef<MediaStream | null>(null);
    const rebuildShadowingRecorderChunksRef = useRef<Blob[]>([]);
    const rebuildShadowingDiscardRecordingOnStopRef = useRef(false);
    const rebuildShadowingSpeechRecognitionRef = useRef<RebuildSpeechRecognition | null>(null);
    const rebuildShadowingSpeechRecognitionStopRequestedRef = useRef(false);
    const rebuildShadowingSpeechRecognitionFinalTranscriptRef = useRef("");
    const rebuildShadowingSpeechRecognitionInterimTranscriptRef = useRef("");
    const rebuildShadowingListeningProgressCursorRef = useRef(0);
    const rebuildShadowingRecordingScopeRef = useRef<RebuildShadowingScope | null>(null);
    const rebuildShadowingPlaybackRef = useRef<HTMLAudioElement | null>(null);
    const rebuildShadowingPlaybackUrlRef = useRef<string | null>(null);
    const rebuildSentenceShadowingPromptTimerRef = useRef<number | null>(null);
    const rebuildPassageShadowingPromptTimerRef = useRef<number | null>(null);
    const clearRebuildSentenceShadowingPromptTimer = useCallback(() => {
        if (rebuildSentenceShadowingPromptTimerRef.current !== null) {
            window.clearTimeout(rebuildSentenceShadowingPromptTimerRef.current);
            rebuildSentenceShadowingPromptTimerRef.current = null;
        }
    }, []);
    const clearRebuildPassageShadowingPromptTimer = useCallback(() => {
        if (rebuildPassageShadowingPromptTimerRef.current !== null) {
            window.clearTimeout(rebuildPassageShadowingPromptTimerRef.current);
            rebuildPassageShadowingPromptTimerRef.current = null;
        }
    }, []);
    const resetRebuildShadowingState = useCallback(() => {
        clearRebuildSentenceShadowingPromptTimer();
        clearRebuildPassageShadowingPromptTimer();
        rebuildShadowingDiscardRecordingOnStopRef.current = true;
        const recorder = rebuildShadowingRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            try {
                recorder.stop();
            } catch {
                // noop
            }
        }
        if (rebuildShadowingRecorderStreamRef.current) {
            for (const track of rebuildShadowingRecorderStreamRef.current.getTracks()) {
                track.stop();
            }
            rebuildShadowingRecorderStreamRef.current = null;
        }
        rebuildShadowingRecorderRef.current = null;
        rebuildShadowingRecorderChunksRef.current = [];
        rebuildShadowingDiscardRecordingOnStopRef.current = false;

        const speechRecognition = rebuildShadowingSpeechRecognitionRef.current;
        if (speechRecognition) {
            speechRecognition.onresult = null;
            speechRecognition.onerror = null;
            speechRecognition.onend = null;
            try {
                speechRecognition.abort();
            } catch {
                // noop
            }
            rebuildShadowingSpeechRecognitionRef.current = null;
        }
        rebuildShadowingSpeechRecognitionStopRequestedRef.current = true;
        rebuildShadowingSpeechRecognitionFinalTranscriptRef.current = "";
        rebuildShadowingSpeechRecognitionInterimTranscriptRef.current = "";
        rebuildShadowingListeningProgressCursorRef.current = 0;
        setIsRebuildSpeechRecognitionRunning(false);
        setRebuildShadowingLiveRecognitionTranscript("");
        setShowRebuildShadowingCorrection(false);
        setRebuildListeningProgressCursor(0);

        rebuildShadowingRecordingScopeRef.current = null;
        if (rebuildShadowingPlaybackRef.current) {
            rebuildShadowingPlaybackRef.current.pause();
            rebuildShadowingPlaybackRef.current.currentTime = 0;
            rebuildShadowingPlaybackRef.current.src = "";
            rebuildShadowingPlaybackRef.current = null;
        }
        if (rebuildShadowingPlaybackUrlRef.current) {
            URL.revokeObjectURL(rebuildShadowingPlaybackUrlRef.current);
            rebuildShadowingPlaybackUrlRef.current = null;
        }
        setRebuildShadowingState(createDefaultRebuildShadowingState());
        setRebuildSentenceShadowingFlow("idle");
        setPendingRebuildSentenceFeedback(null);
        setRebuildPassageShadowingFlow("idle");
        setRebuildPassageShadowingSegmentIndex(null);
    }, [clearRebuildPassageShadowingPromptTimer, clearRebuildSentenceShadowingPromptTimer]);

    const persistRebuildHiddenElo = useCallback(async (nextElo: number) => {
        const updatedAt = Date.now();
        await db.sync_meta.put({
            key: buildRebuildMetaKey("hidden_elo"),
            value: nextElo,
            updated_at: updatedAt,
        });
        await saveProfilePatch({
            rebuild_hidden_elo: nextElo,
            last_practice_at: updatedAt,
        });
    }, [buildRebuildMetaKey]);

    const hydratePassageSegmentDrill = useCallback((sourceDrill: DrillData, segmentIndex: number): DrillData => {
        if (sourceDrill._rebuildMeta?.variant !== "passage" || !sourceDrill._rebuildMeta.passageSession) {
            return sourceDrill;
        }

        const session = sourceDrill._rebuildMeta.passageSession;
        const segment = session.segments[segmentIndex] ?? session.segments[0];
        if (!segment) return sourceDrill;

        return {
            ...sourceDrill,
            chinese: segment.chinese,
            reference_english: segment.referenceEnglish,
            _rebuildMeta: {
                ...sourceDrill._rebuildMeta,
                answerTokens: segment.answerTokens,
                tokenBank: segment.tokenBank,
                distractorTokens: segment.distractorTokens,
                passageSession: {
                    ...session,
                    currentIndex: segmentIndex,
                },
            },
        };
    }, []);

    const initializeRebuildTokens = useCallback((nextDrillData: DrillData | null) => {
        const tokenBank = nextDrillData?._rebuildMeta?.tokenBank ?? [];
        const { tokenInstances, tokenOrder } = buildRebuildTokenInstances({
            tokenBank,
            distractorTokens: nextDrillData?._rebuildMeta?.distractorTokens ?? [],
            prefix: "active",
        });
        rebuildTokenOrderRef.current = new Map(Object.entries(tokenOrder));
        setRebuildAvailableTokens(tokenInstances);
        setRebuildAnswerTokens([]);
        setRebuildReplayCount(0);
        setRebuildEditCount(0);
        setRebuildStartedAt(nextDrillData?._rebuildMeta ? Date.now() : null);
        setRebuildTypingBuffer("");
    }, []);

    const applyPassageDraftToActiveState = useCallback((draft: RebuildPassageSegmentDraftState) => {
        rebuildTokenOrderRef.current = new Map(Object.entries(draft.tokenOrder));
        setRebuildAvailableTokens(draft.availableTokens);
        setRebuildAnswerTokens(draft.answerTokens);
        setRebuildReplayCount(draft.replayCount);
        setRebuildEditCount(draft.editCount);
        setRebuildStartedAt(draft.startedAt);
        setRebuildTypingBuffer(draft.typingBuffer);
        rebuildTypingBufferRef.current = draft.typingBuffer;
    }, []);

    const buildActivePassageDraftSnapshot = useCallback((baseDraft: RebuildPassageSegmentDraftState): RebuildPassageSegmentDraftState => ({
        ...baseDraft,
        availableTokens: rebuildAvailableTokens,
        answerTokens: rebuildAnswerTokens,
        typingBuffer: rebuildTypingBufferRef.current,
        replayCount: rebuildReplayCount,
        editCount: rebuildEditCount,
        startedAt: rebuildStartedAt,
        tokenOrder: Object.fromEntries(rebuildTokenOrderRef.current.entries()),
    }), [
        rebuildAnswerTokens,
        rebuildAvailableTokens,
        rebuildEditCount,
        rebuildReplayCount,
        rebuildStartedAt,
    ]);

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

        const hoverMediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
        const syncHoverSupport = () => {
            setShopDockHasHoverSupport(hoverMediaQuery.matches);
            if (!hoverMediaQuery.matches) {
                setIsShopDockHovered(false);
            }
        };

        syncHoverSupport();
        hoverMediaQuery.addEventListener("change", syncHoverSupport);

        return () => {
            hoverMediaQuery.removeEventListener("change", syncHoverSupport);
        };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = window.localStorage.getItem(LISTENING_BANK_RECENT_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            recentListeningBankIdsRef.current = Array.isArray(parsed)
                ? parsed.filter((item): item is string => typeof item === "string").slice(0, LISTENING_BANK_RECENT_LIMIT)
                : [];
        } catch (error) {
            console.error("Failed to load recent listening bank ids", error);
            recentListeningBankIdsRef.current = [];
        }
    }, []);

    useEffect(() => {
        const bankItemId = drillData?._sourceMeta?.sourceMode === "bank" ? drillData._sourceMeta.bankItemId : undefined;
        if (!bankItemId) return;

        const nextIds = [bankItemId, ...recentListeningBankIdsRef.current.filter((id) => id !== bankItemId)]
            .slice(0, LISTENING_BANK_RECENT_LIMIT);
        recentListeningBankIdsRef.current = nextIds;

        if (typeof window !== "undefined") {
            window.localStorage.setItem(LISTENING_BANK_RECENT_STORAGE_KEY, JSON.stringify(nextIds));
        }
    }, [drillData?._sourceMeta?.bankItemId, drillData?._sourceMeta?.sourceMode]);

    useEffect(() => {
        if (!isRebuildMode) return;
        if (isRebuildPassage) return;
        initializeRebuildTokens(drillData);
    }, [drillData, initializeRebuildTokens, isRebuildMode, isRebuildPassage]);

    useEffect(() => {
        if (!isRebuildPassage || !passageSession) return;
        clearRebuildPassageShadowingPromptTimer();

        const initialSegmentIndex = Math.min(
            Math.max(passageSession.currentIndex ?? 0, 0),
            Math.max(0, passageSession.segments.length - 1),
        );
        const nextDrafts = passageSession.segments.map((segment, index) => (
            createRebuildPassageDraftState(segment, index)
        ));
        if (nextDrafts[initialSegmentIndex]) {
            nextDrafts[initialSegmentIndex] = {
                ...nextDrafts[initialSegmentIndex],
                startedAt: Date.now(),
            };
        }

        setActivePassageSegmentIndex(initialSegmentIndex);
        setRebuildPassageDrafts(nextDrafts);
        setRebuildPassageResults([]);
        setRebuildPassageUiState(passageSession.segments.map(() => ({ chineseExpanded: true })));
        setRebuildPassageScores([]);
        setRebuildPassageSummary(null);
        setRebuildFeedback(null);
        setRebuildSentenceShadowingFlow("idle");
        setPendingRebuildSentenceFeedback(null);
        setRebuildPassageShadowingFlow("idle");
        setRebuildPassageShadowingSegmentIndex(null);

        const activeDraft = nextDrafts[initialSegmentIndex];
        if (activeDraft) {
            applyPassageDraftToActiveState(activeDraft);
        }
    }, [applyPassageDraftToActiveState, clearRebuildPassageShadowingPromptTimer, isRebuildPassage, passageSession?.sessionId]);

    useEffect(() => {
        if (!isRebuildPassage || rebuildPassageDrafts.length === 0) return;

        setRebuildPassageDrafts((currentDrafts) => {
            const currentDraft = currentDrafts[activePassageSegmentIndex];
            if (!currentDraft) return currentDrafts;

            const nextTokenOrder = Object.fromEntries(rebuildTokenOrderRef.current.entries());
            if (
                currentDraft.availableTokens === rebuildAvailableTokens
                && currentDraft.answerTokens === rebuildAnswerTokens
                && currentDraft.typingBuffer === rebuildTypingBuffer
                && currentDraft.replayCount === rebuildReplayCount
                && currentDraft.editCount === rebuildEditCount
                && currentDraft.startedAt === rebuildStartedAt
                && areRebuildTokenOrdersEqual(currentDraft.tokenOrder, nextTokenOrder)
            ) {
                return currentDrafts;
            }

            const nextDrafts = [...currentDrafts];
            nextDrafts[activePassageSegmentIndex] = {
                ...currentDraft,
                availableTokens: rebuildAvailableTokens,
                answerTokens: rebuildAnswerTokens,
                typingBuffer: rebuildTypingBuffer,
                replayCount: rebuildReplayCount,
                editCount: rebuildEditCount,
                startedAt: rebuildStartedAt,
                tokenOrder: nextTokenOrder,
            };
            return nextDrafts;
        });
    }, [
        activePassageSegmentIndex,
        isRebuildPassage,
        rebuildAnswerTokens,
        rebuildAvailableTokens,
        rebuildEditCount,
        rebuildPassageDrafts.length,
        rebuildReplayCount,
        rebuildStartedAt,
        rebuildTypingBuffer,
    ]);

    useEffect(() => {
        return () => {
            clearRebuildSentenceShadowingPromptTimer();
            clearRebuildPassageShadowingPromptTimer();
        };
    }, [clearRebuildPassageShadowingPromptTimer, clearRebuildSentenceShadowingPromptTimer]);

    useEffect(() => {
        if (!isRebuildMode) return;
        if (drillData?._sourceMeta?.sourceMode !== "ai") return;
        if (drillData?._rebuildMeta?.variant === "passage") return;
        const candidateId = drillData?._rebuildMeta?.candidateId ?? drillData?._sourceMeta?.candidateId;
        if (!candidateId || !drillData?._rebuildMeta) return;
        const topic = drillData._topicMeta?.topic ?? context.articleTitle ?? context.topic ?? "随机场景";
        const contentKey = buildGeneratedRebuildBankContentKey(topic, drillData.reference_english);
        const now = Date.now();

        void db.rebuild_bank_generated.put({
            content_key: contentKey,
            candidate_id: candidateId,
            topic,
            scene: drillData._rebuildMeta.scene,
            effective_elo: drillData._rebuildMeta.effectiveElo,
            band_position: drillData._rebuildMeta.bandPosition,
            reference_english: drillData.reference_english,
            chinese: drillData.chinese,
            answer_tokens: drillData._rebuildMeta.answerTokens,
            distractor_tokens: drillData._rebuildMeta.distractorTokens,
            source: "ai",
            review_status: "draft",
            created_at: now,
            updated_at: now,
        }).catch((error) => {
            console.error("Failed to persist rebuild ai drill into local bank", error);
        });
    }, [
        context.articleTitle,
        context.topic,
        drillData?._rebuildMeta,
        drillData?._sourceMeta?.candidateId,
        drillData?._sourceMeta?.sourceMode,
        drillData?._topicMeta?.topic,
        drillData?.chinese,
        drillData?.reference_english,
        isRebuildMode,
    ]);

    const getGuidedSessionSnapshot = useCallback((): GuidedSessionState => ({
        status: guidedModeStatus,
        currentStepIndex: guidedCurrentStepIndex,
        currentAttemptCount: guidedCurrentAttemptCount,
        guidedChoicesVisible,
        revealReady: guidedRevealReady,
        filledFragments: guidedFilledFragments,
        lastFeedback: guidedLastFeedback,
    }), [
        guidedChoicesVisible,
        guidedCurrentAttemptCount,
        guidedCurrentStepIndex,
        guidedFilledFragments,
        guidedLastFeedback,
        guidedRevealReady,
        guidedModeStatus,
    ]);

    const applyGuidedSessionSnapshot = useCallback((nextState: GuidedSessionState) => {
        setGuidedModeStatus(nextState.status);
        setGuidedCurrentStepIndex(nextState.currentStepIndex);
        guidedCurrentStepIndexRef.current = nextState.currentStepIndex;
        setGuidedCurrentAttemptCount(nextState.currentAttemptCount);
        setGuidedChoicesVisible(nextState.guidedChoicesVisible);
        setGuidedRevealReady(nextState.revealReady);
        setGuidedFilledFragments(nextState.filledFragments);
        guidedFilledFragmentsRef.current = nextState.filledFragments;
        setGuidedLastFeedback(nextState.lastFeedback);
    }, []);

    const resetGuidedLearningState = useCallback((keepLearningSession = false) => {
        if (!keepLearningSession) {
            setLearningSession(false);
        }
        guidedHintAbortRef.current?.abort();
        setGuidedModeStatus("idle");
        setGuidedScript(null);
        setGuidedCurrentStepIndex(0);
        guidedCurrentStepIndexRef.current = 0;
        setGuidedCurrentAttemptCount(0);
        setGuidedChoicesVisible(false);
        setGuidedRevealReady(false);
        setGuidedFilledFragments({});
        guidedFilledFragmentsRef.current = {};
        setGuidedLastFeedback(null);
        setGuidedInnerMode("teacher_guided");
        setGuidedClozeState(null);
        setGuidedInput("");
        setGuidedAiHint(null);
        setIsGuidedAiHintLoading(false);
        guidedAiHintRequestCountRef.current = 0;
    }, []);

    const fetchGuidedScriptForDrill = useCallback(async (
        targetDrillData: Pick<DrillData, "chinese" | "reference_english" | "_topicMeta">,
        signal?: AbortSignal,
    ) => {
        const response = await fetch("/api/ai/guided_script", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chinese: targetDrillData.chinese,
                reference_english: targetDrillData.reference_english,
                elo: eloRatingRef.current || DEFAULT_BASE_ELO,
                topic: targetDrillData._topicMeta?.topic || context.articleTitle || context.topic,
            }),
            signal,
        });
        const data = await response.json();

        if (!response.ok || data?.error) {
            throw new Error(data?.error || "Failed to load guided script");
        }

        return data as GuidedScript;
    }, [context.articleTitle, context.topic]);

    const fetchGuidedHint = useCallback(async ({
        slot,
        attempt,
        innerMode: targetInnerMode,
        leftContext,
        rightContext,
        localHint,
        manualRequest,
        requestCount,
        signal,
    }: {
        slot: GuidedScript["slots"][number];
        attempt: number;
        innerMode: GuidedInnerMode;
        leftContext: string;
        rightContext: string;
        localHint?: string;
        manualRequest?: boolean;
        requestCount?: number;
        signal?: AbortSignal;
    }) => {
        if (!drillData) {
            throw new Error("Missing drill data for guided hint");
        }

        const response = await fetch("/api/ai/guided_hint", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chinese: drillData.chinese,
                reference_english: drillData.reference_english,
                answer_text: slot.answer_text,
                hint_focus_cn: slot.hint_focus_cn || "",
                left_context: leftContext,
                right_context: rightContext,
                attempt,
                slot_kind: slot.slot_kind,
                inner_mode: targetInnerMode,
                has_multiple_choice: Boolean(slot.multiple_choice?.length),
                local_hint: localHint,
                manual_request: Boolean(manualRequest),
                request_count: requestCount ?? 0,
            }),
            signal,
        });

        const data = await response.json();
        if (!response.ok || data?.error || !data?.primary) {
            throw new Error(data?.error || "Failed to load guided hint");
        }

        return data as GuidedAiHint;
    }, [drillData]);

    const loadGuidedHint = useCallback(async ({
        guidedKey,
        slot,
        attempt,
        innerMode: targetInnerMode,
        leftContext,
        rightContext,
        localHint,
        manualRequest,
        requestCount,
        signal,
    }: {
        guidedKey: string;
        slot: GuidedScript["slots"][number];
        attempt: number;
        innerMode: GuidedInnerMode;
        leftContext: string;
        rightContext: string;
        localHint?: string;
        manualRequest?: boolean;
        requestCount?: number;
        signal?: AbortSignal;
    }) => {
        const hintKey = buildGuidedHintCacheKey({
            guidedKey,
            slotId: manualRequest ? `${slot.id}:manual` : slot.id,
            innerMode: targetInnerMode,
            attempt,
            requestCount: requestCount ?? 0,
            leftContext: `${leftContext}|${localHint || ""}`,
            rightContext,
        });

        const cached = guidedHintCacheRef.current.get(hintKey);
        if (cached) {
            return cached;
        }

        const pending = guidedHintPromiseRef.current.get(hintKey);
        if (pending) {
            return pending;
        }

        const requestPromise = fetchGuidedHintWithRetry(
            () => fetchGuidedHint({
                slot,
                attempt,
                innerMode: targetInnerMode,
                leftContext,
                rightContext,
                localHint,
                manualRequest,
                requestCount,
                signal,
            }),
            3,
        ).then((hint) => {
            guidedHintCacheRef.current.set(hintKey, hint);
            return hint;
        }).finally(() => {
            guidedHintPromiseRef.current.delete(hintKey);
        });

        guidedHintPromiseRef.current.set(hintKey, requestPromise);
        return requestPromise;
    }, [fetchGuidedHint]);

    useEffect(() => {
        guidedHintAbortRef.current?.abort();
        setGuidedAiHint(null);
        setIsGuidedAiHintLoading(false);
        guidedAiHintRequestCountRef.current = 0;
    }, [guidedCurrentStepIndex, guidedInnerMode, guidedClozeState?.currentBlankIndex, guidedScript?.summary.final_sentence]);

    const isGuidedOverlayOpen = guidedModeStatus !== "idle";
    const learningSessionActive = learningSession;

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (guidedModeStatus !== "active" || guidedInnerMode !== "teacher_guided" || !guidedScript || guidedChoicesVisible || guidedRevealReady) return;

        const currentSlot = guidedScript.slots[guidedCurrentStepIndex];
        if (!currentSlot?.multiple_choice?.length) return;

        const timer = window.setTimeout(() => {
            if (!shouldAutoOpenGuidedChoices(12000)) return;
            setGuidedChoicesVisible(true);
            setGuidedRevealReady(true);
            setGuidedLastFeedback(currentSlot.idle_rescue_hint_cn ?? currentSlot.rescue_reason_cn ?? "卡住了就先用选项排除。");
        }, 12000);

        return () => {
            window.clearTimeout(timer);
        };
    }, [
        guidedChoicesVisible,
        guidedCurrentStepIndex,
        guidedInnerMode,
        guidedInput,
        guidedModeStatus,
        guidedRevealReady,
        guidedScript,
    ]);

    const persistProfilePatch = useCallback((patch: Partial<{ coins: number; hints: number; inventory: InventoryState; owned_themes: string[]; active_theme: string }>) => {
        if (Object.keys(patch).length === 0) return;
        saveProfilePatch({
            coins: patch.coins,
            inventory: patch.inventory,
            owned_themes: patch.owned_themes,
            active_theme: patch.active_theme,
        }).catch((error) => {
            console.error("Failed to sync profile patch", error);
        });
    }, []);

    const getItemCount = useCallback((itemId: ShopItemId) => {
        return inventoryRef.current[itemId] ?? 0;
    }, []);

    const applyEconomyPatch = useCallback(({
        coinsDelta = 0,
        itemDelta = {},
    }: {
        coinsDelta?: number;
        itemDelta?: Partial<Record<ShopItemId, number>>;
    }) => {
        const nextCoins = Math.max(0, coinsRef.current + coinsDelta);
        const nextInventory: InventoryState = { ...inventoryRef.current };

        (Object.keys(itemDelta) as ShopItemId[]).forEach((itemId) => {
            const delta = itemDelta[itemId] ?? 0;
            if (!delta) return;
            nextInventory[itemId] = Math.max(0, nextInventory[itemId] + delta);
        });

        coinsRef.current = nextCoins;
        inventoryRef.current = nextInventory;
        setCoins(nextCoins);
        setInventory(nextInventory);

        persistProfilePatch({
            coins: nextCoins,
            inventory: nextInventory,
            hints: nextInventory.capsule, // compatibility mirror
        });

        return {
            coins: nextCoins,
            inventory: nextInventory,
        };
    }, [persistProfilePatch]);

    const pushEconomyFx = useCallback((event: Omit<EconomyFxEvent, 'id'>) => {
        const nextEvent: EconomyFxEvent = {
            ...event,
            id: economyFxIdRef.current++,
        };
        setEconomyFxQueue(prev => [...prev, nextEvent]);
    }, []);

    const resolveEconomyTarget = useCallback((event: EconomyFxEvent): EconomyTargetId | null => {
        if (event.kind === 'coin_gain') return 'coins';
        return event.itemId ?? null;
    }, []);

    const computeEconomyVector = useCallback((targetId: EconomyTargetId | null) => {
        if (!targetId) return null;

        const shellRect = battleShellRef.current?.getBoundingClientRect();
        const targetRect = resourceTargetRefs.current[targetId]?.getBoundingClientRect();

        if (!shellRect || !targetRect) return null;

        return {
            target: targetId,
            x: targetRect.left + targetRect.width / 2 - shellRect.left - shellRect.width / 2,
            y: targetRect.top + targetRect.height / 2 - shellRect.top - ECONOMY_OVERLAY_ORIGIN_TOP,
        };
    }, []);

    const getEconomyPulseClass = useCallback((targetId: EconomyTargetId) => {
        if (resourcePulseTarget !== targetId) return "";

        switch (targetId) {
            case 'coins':
                return "scale-[1.08] bg-amber-50/95 shadow-[0_0_24px_rgba(245,158,11,0.28)] ring-1 ring-amber-200/80";
            case 'capsule':
                return "scale-[1.08] bg-sky-50/95 shadow-[0_0_24px_rgba(59,130,246,0.2)] ring-1 ring-sky-200/80";
            case 'hint_ticket':
                return "scale-[1.08] bg-amber-50/95 shadow-[0_0_24px_rgba(251,191,36,0.24)] ring-1 ring-amber-200/80";
            case 'vocab_ticket':
                return "scale-[1.08] bg-emerald-50/95 shadow-[0_0_24px_rgba(16,185,129,0.22)] ring-1 ring-emerald-200/80";
            case 'audio_ticket':
                return "scale-[1.08] bg-indigo-50/95 shadow-[0_0_24px_rgba(99,102,241,0.24)] ring-1 ring-indigo-200/80";
            case 'refresh_ticket':
                return "scale-[1.08] bg-cyan-50/95 shadow-[0_0_24px_rgba(6,182,212,0.22)] ring-1 ring-cyan-200/80";
            default:
                return "";
        }
    }, [resourcePulseTarget]);

    const getEconomyVisual = useCallback((event: EconomyFxEvent) => {
        if (event.kind === 'coin_gain') {
            return {
                icon: <Gem className="h-4 w-4" />,
                shellClass: "border-amber-300/90 bg-[linear-gradient(135deg,rgba(255,248,220,0.99),rgba(254,240,138,0.98)_48%,rgba(251,191,36,0.94)_100%)] text-amber-950 shadow-[0_24px_56px_rgba(245,158,11,0.28)] ring-1 ring-amber-200/80",
                iconClass: "border-amber-200/80 bg-white/95 text-amber-500 shadow-[0_12px_28px_rgba(245,158,11,0.22)]",
                chipClass: "border-amber-200/80 bg-white/75 text-amber-700",
                flightClass: "border-amber-300/85 bg-gradient-to-br from-yellow-100 via-amber-100 to-orange-100 text-amber-600 shadow-[0_12px_26px_rgba(245,158,11,0.24)]",
                shimmerClass: "from-transparent via-white/75 to-transparent",
                accentClass: "bg-[radial-gradient(circle,rgba(251,191,36,0.48)_0%,rgba(251,191,36,0.12)_55%,transparent_75%)]",
                pulseClass: "bg-[radial-gradient(circle,rgba(251,191,36,0.75)_0%,rgba(251,191,36,0.16)_56%,transparent_78%)]",
            };
        }

        switch (event.itemId) {
            case 'capsule':
                return {
                    icon: <span className="text-[15px] leading-none">💊</span>,
                    shellClass: "border-sky-300/90 bg-[linear-gradient(135deg,rgba(239,246,255,0.99),rgba(186,230,253,0.98)_44%,rgba(251,191,36,0.2)_100%)] text-slate-950 shadow-[0_22px_54px_rgba(59,130,246,0.24)] ring-1 ring-sky-200/80",
                    iconClass: "border-sky-200/80 bg-white/95 text-sky-500 shadow-[0_12px_28px_rgba(59,130,246,0.18)]",
                    chipClass: "border-sky-200/80 bg-white/85 text-sky-700",
                    flightClass: "border-sky-300/85 bg-gradient-to-br from-sky-100 via-blue-100 to-amber-50 text-sky-600 shadow-[0_12px_28px_rgba(59,130,246,0.22)]",
                    shimmerClass: "from-transparent via-sky-100/70 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(96,165,250,0.42)_0%,rgba(96,165,250,0.14)_54%,transparent_74%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(59,130,246,0.72)_0%,rgba(59,130,246,0.16)_56%,transparent_78%)]",
                };
            case 'hint_ticket':
                return {
                    icon: <Wand2 className="h-4 w-4" />,
                    shellClass: "border-yellow-300/90 bg-[linear-gradient(135deg,rgba(255,251,235,0.99),rgba(254,240,138,0.94)_44%,rgba(255,255,255,0.98)_100%)] text-stone-950 shadow-[0_24px_58px_rgba(245,158,11,0.24)] ring-1 ring-yellow-200/80",
                    iconClass: "border-amber-200/80 bg-white/95 text-amber-500 shadow-[0_12px_28px_rgba(245,158,11,0.18)]",
                    chipClass: "border-amber-200/85 bg-white/88 text-amber-700",
                    flightClass: "border-yellow-300/80 bg-gradient-to-br from-amber-50 via-yellow-50 to-white text-amber-500 shadow-[0_12px_28px_rgba(245,158,11,0.2)]",
                    shimmerClass: "from-transparent via-amber-100/80 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(251,191,36,0.42)_0%,rgba(251,191,36,0.14)_54%,transparent_76%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(251,191,36,0.75)_0%,rgba(251,191,36,0.16)_56%,transparent_78%)]",
                };
            case 'vocab_ticket':
                return {
                    icon: <span className="text-[15px] leading-none">🧩</span>,
                    shellClass: "border-emerald-300/90 bg-[linear-gradient(135deg,rgba(236,253,245,0.99),rgba(167,243,208,0.96)_48%,rgba(255,255,255,0.98)_100%)] text-emerald-950 shadow-[0_22px_54px_rgba(16,185,129,0.22)] ring-1 ring-emerald-200/80",
                    iconClass: "border-emerald-200/80 bg-white/95 text-emerald-500 shadow-[0_12px_26px_rgba(16,185,129,0.18)]",
                    chipClass: "border-emerald-200/85 bg-white/88 text-emerald-700",
                    flightClass: "border-emerald-300/85 bg-gradient-to-br from-emerald-50 via-green-50 to-white text-emerald-600 shadow-[0_12px_28px_rgba(16,185,129,0.2)]",
                    shimmerClass: "from-transparent via-emerald-100/80 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(52,211,153,0.42)_0%,rgba(52,211,153,0.14)_54%,transparent_76%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(16,185,129,0.7)_0%,rgba(16,185,129,0.16)_56%,transparent_78%)]",
                };
            case 'audio_ticket':
                return {
                    icon: <Volume2 className="h-4 w-4" />,
                    shellClass: "border-indigo-300/90 bg-[linear-gradient(135deg,rgba(238,242,255,0.99),rgba(199,210,254,0.97)_48%,rgba(255,255,255,0.98)_100%)] text-indigo-950 shadow-[0_24px_56px_rgba(99,102,241,0.24)] ring-1 ring-indigo-200/80",
                    iconClass: "border-indigo-200/80 bg-white/95 text-indigo-500 shadow-[0_12px_28px_rgba(99,102,241,0.2)]",
                    chipClass: "border-indigo-200/85 bg-white/88 text-indigo-700",
                    flightClass: "border-indigo-300/85 bg-gradient-to-br from-indigo-50 via-violet-50 to-white text-indigo-600 shadow-[0_12px_28px_rgba(99,102,241,0.22)]",
                    shimmerClass: "from-transparent via-indigo-100/75 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(129,140,248,0.38)_0%,rgba(129,140,248,0.12)_56%,transparent_76%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(99,102,241,0.72)_0%,rgba(99,102,241,0.16)_56%,transparent_78%)]",
                };
            case 'refresh_ticket':
                return {
                    icon: <RefreshCw className="h-4 w-4" />,
                    shellClass: "border-cyan-300/90 bg-[linear-gradient(135deg,rgba(236,254,255,0.99),rgba(165,243,252,0.96)_48%,rgba(255,255,255,0.98)_100%)] text-cyan-950 shadow-[0_24px_56px_rgba(6,182,212,0.22)] ring-1 ring-cyan-200/80",
                    iconClass: "border-cyan-200/80 bg-white/95 text-cyan-600 shadow-[0_12px_28px_rgba(6,182,212,0.18)]",
                    chipClass: "border-cyan-200/85 bg-white/88 text-cyan-700",
                    flightClass: "border-cyan-300/85 bg-gradient-to-br from-cyan-50 via-sky-50 to-white text-cyan-600 shadow-[0_12px_28px_rgba(6,182,212,0.2)]",
                    shimmerClass: "from-transparent via-cyan-100/80 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(34,211,238,0.4)_0%,rgba(34,211,238,0.13)_56%,transparent_76%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(6,182,212,0.72)_0%,rgba(6,182,212,0.16)_56%,transparent_78%)]",
                };
            default:
                return {
                    icon: <Sparkles className="h-4 w-4" />,
                    shellClass: "border-stone-200/80 bg-white/95 text-stone-900 shadow-[0_18px_42px_rgba(15,23,42,0.12)]",
                    iconClass: "border-stone-200/70 bg-white/90 text-stone-600 shadow-[0_10px_24px_rgba(15,23,42,0.08)]",
                    chipClass: "border-stone-200/80 bg-white/75 text-stone-700",
                    flightClass: "border-stone-200/80 bg-white text-stone-600 shadow-[0_8px_20px_rgba(15,23,42,0.12)]",
                    shimmerClass: "from-transparent via-white/75 to-transparent",
                    accentClass: "bg-[radial-gradient(circle,rgba(148,163,184,0.22)_0%,rgba(148,163,184,0.08)_54%,transparent_74%)]",
                    pulseClass: "bg-[radial-gradient(circle,rgba(148,163,184,0.52)_0%,rgba(148,163,184,0.14)_56%,transparent_78%)]",
                };
        }
    }, []);

    useEffect(() => {
        if (activeEconomyFx || economyFxQueue.length === 0) return;

        setActiveEconomyFx(economyFxQueue[0]);
        setEconomyFxQueue(prev => prev.slice(1));
    }, [activeEconomyFx, economyFxQueue]);

    useEffect(() => {
        if (!activeEconomyFx) {
            setActiveEconomyVector(null);
            return;
        }

        const targetId = resolveEconomyTarget(activeEconomyFx);
        const rafId = requestAnimationFrame(() => {
            setActiveEconomyVector(computeEconomyVector(targetId));
        });

        const pulseDelay = activeEconomyFx.kind === 'coin_gain' ? 1480 : activeEconomyFx.kind === 'item_purchase' ? 1180 : 1260;
        const clearDelay = activeEconomyFx.kind === 'coin_gain' ? 2760 : activeEconomyFx.kind === 'item_purchase' ? 2080 : 2180;
        const pulseTimeout = targetId
            ? setTimeout(() => setResourcePulseTarget(targetId), pulseDelay)
            : null;
        const clearTimeoutId = setTimeout(() => {
            setActiveEconomyFx(null);
            setActiveEconomyVector(null);
        }, clearDelay);

        return () => {
            cancelAnimationFrame(rafId);
            if (pulseTimeout) clearTimeout(pulseTimeout);
            clearTimeout(clearTimeoutId);
        };
    }, [activeEconomyFx, computeEconomyVector, resolveEconomyTarget]);

    useEffect(() => {
        if (!resourcePulseTarget) return;

        const timeoutId = setTimeout(() => setResourcePulseTarget(null), 420);
        return () => clearTimeout(timeoutId);
    }, [resourcePulseTarget]);



    // Gamification State (Fever / Themes)
    const [comboCount, setComboCount] = useState(0);
    const [feverMode, setFeverMode] = useState(false);
    // Gamification State (Fever / Themes)
    // Removed duplicate state declarations
    const [theme, setTheme] = useState<'default' | 'fever' | 'boss' | 'crimson'>('default');
    const [bossState, setBossState] = useState<{
        active: boolean;
        introAck: boolean;
        type: 'blind' | 'lightning' | 'echo' | 'reaper' | 'roulette' | 'roulette_execution';
        hp?: number;
        maxHp?: number;
        playerHp?: number; // New: Symmetric Duel
        playerMaxHp?: number;
    }>({ active: false, introAck: false, type: 'blind' });
    const [deathAnim, setDeathAnim] = useState<'slash' | 'glitch' | 'shatter' | null>(null);
    const [lootDrop, setLootDrop] = useState<LootDrop | null>(null);
    const [gambleState, setGambleState] = useState<{
        active: boolean;
        introAck: boolean;
        wager: 'safe' | 'risky' | 'madness' | null;
        doubleDownCount: number;
    }>({ active: false, introAck: false, wager: null, doubleDownCount: 0 });

    // Roulette State
    const [showRoulette, setShowRoulette] = useState(false);
    const [rouletteSession, setRouletteSession] = useState<{
        active: boolean;
        result: 'safe' | 'dead';
        multiplier: number;
        bullets: number;
    } | null>(null);

    // Visceral FX State
    const [shake, setShake] = useState(false);
    const [showDoubleDown, setShowDoubleDown] = useState(false); // Modal State
    const [recentScores, setRecentScores] = useState<number[]>([]); // Track recent scores for bounties

    // Gacha State
    const [showGacha, setShowGacha] = useState(false);
    const [gachaCards, setGachaCards] = useState<GachaCard[]>([]);
    const [selectedGachaCardId, setSelectedGachaCardId] = useState<string | null>(null);
    const [gachaClaimTarget, setGachaClaimTarget] = useState<{ x: number; y: number; target: EconomyTargetId; } | null>(null);

    const hasStartedRef = useRef(false);
    const hasPlayedEchoRef = useRef(false); // For Echo Beast (One-time audio)
    const vocabHintRevealRef = useRef(false);
    const translationAudioUnlockRef = useRef(false);

    // Track if Lightning mode audio has been played (for delayed countdown)
    const [lightningStarted, setLightningStarted] = useState(false);

    // Boss Fuse Timer
    const [fuseTime, setFuseTime] = useState(100); // Boss Fuse (100%)
    const abortControllerRef = useRef<AbortController | null>(null); // For cancelling pending API requests
    const [rankUp, setRankUp] = useState<{ oldRank: ReturnType<typeof getRank>; newRank: ReturnType<typeof getRank>; } | null>(null); // Rank promotion celebration
    const [rankDown, setRankDown] = useState<{ oldRank: ReturnType<typeof getRank>; newRank: ReturnType<typeof getRank>; } | null>(null); // Rank demotion punishment

    const persistDictationBattle = useCallback(async (payload: {
        eloAfter: number;
        change: number;
        streak: number;
        coins?: number;
        inventory?: InventoryState;
        ownedThemes?: string[];
        activeTheme?: string | null;
        source?: string;
    }) => {
        const profile = await loadLocalProfile();
        if (!profile?.id) return null;

        const nextMaxElo = Math.max(
            profile.dictation_max_elo ?? profile.dictation_elo ?? DEFAULT_BASE_ELO,
            payload.eloAfter,
        );

        await settleBattle({
            mode: "dictation",
            eloAfter: payload.eloAfter,
            change: payload.change,
            streak: payload.streak,
            maxElo: nextMaxElo,
            coins: payload.coins ?? profile.coins ?? DEFAULT_STARTING_COINS,
            inventory: (payload.inventory ?? profile.inventory) as Record<string, number> | undefined,
            ownedThemes: payload.ownedThemes ?? profile.owned_themes,
            activeTheme: payload.activeTheme ?? profile.active_theme,
            source: payload.source || "battle",
        });

        return nextMaxElo;
    }, []);

    // Theme-based Ambient Audio
    // Theme-based Ambient Audio (Legacy Removed -> Handled by modern BGM Manager at line 523)

    // Boss Fuse Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        // Lightning countdown only starts AFTER audio is played
        const isLightning = theme === 'boss' && bossState.active && bossState.type === 'lightning' && bossState.introAck && lightningStarted;
        const isGamble = theme === 'crimson' && gambleState.active && gambleState.introAck;

        if ((isLightning || isGamble) && !isSubmittingDrill) {
            interval = setInterval(() => {
                // Timer Duration based on Mode
                // Lightning: 30s (300 ticks)
                // Gamble: 45s (450 ticks) for high pressure
                const durationTicks = isLightning ? 300 : 450;
                const decrement = 100 / durationTicks;

                setFuseTime(prev => {
                    if (prev <= 0) {
                        clearInterval(interval);
                        // Trigger Defeat / Time Up
                        new Audio('https://commondatastorage.googleapis.com/codeskulptor-assets/sounddogs/explosion.mp3').play().catch(() => { });
                        if (navigator.vibrate) navigator.vibrate(500);
                        setShake(true);

                        // Calculate Penalty
                        const penalty = isGamble ? (gambleState.wager === 'risky' ? 20 : 50) : 20;


                        // Reset States (Delayed for Animation)
                        setDeathAnim(isGamble ? 'shatter' : 'glitch');

                        // Apply Penalty to the active mode pool (avoid cross-mode Elo pollution)
                        const isActiveListeningMode = mode === 'listening';
                        const isActiveDictationMode = mode === 'dictation';

                        const activeElo = isActiveDictationMode
                            ? dictationEloRef.current
                            : isActiveListeningMode
                                ? listeningEloRef.current
                                : eloRatingRef.current;
                        const newElo = Math.max(0, activeElo - penalty);

                        if (isActiveListeningMode) {
                            setListeningElo(newElo);
                            setListeningStreak(0);
                        } else if (isActiveDictationMode) {
                            setDictationElo(newElo);
                            setDictationStreak(0);
                        } else {
                            setEloRating(newElo);
                            setStreakCount(0);
                        }

                        void loadLocalProfile().then(async (profile) => {
                            if (!profile) return;
                            if (isActiveDictationMode) {
                                await persistDictationBattle({
                                    eloAfter: newElo,
                                    change: -penalty,
                                    streak: 0,
                                    coins: profile.coins ?? DEFAULT_STARTING_COINS,
                                    inventory: inventoryRef.current,
                                    ownedThemes: ownedThemes,
                                    activeTheme: cosmeticTheme,
                                    source: 'timeout_penalty',
                                });
                                return;
                            }

                            const isActiveRebuildMode = mode === "rebuild";
                            const maxElo = isActiveListeningMode
                                ? Math.max(profile.listening_max_elo || DEFAULT_BASE_ELO, newElo)
                                : isActiveRebuildMode
                                    ? Math.max(profile.rebuild_max_elo || profile.rebuild_elo || DEFAULT_BASE_ELO, newElo)
                                    : Math.max(profile.max_elo, newElo);

                            await settleBattle({
                                mode: isActiveListeningMode ? 'listening' : isActiveRebuildMode ? 'rebuild' : 'translation',
                                eloAfter: newElo,
                                change: -penalty,
                                streak: 0,
                                maxElo,
                                coins: profile.coins ?? DEFAULT_STARTING_COINS,
                                source: 'timeout_penalty',
                            });
                        }).catch((error) => {
                            console.error("Failed to sync timeout penalty", error);
                        });

                        // Show Notification
                        setLootDrop({
                            type: 'exp',
                            amount: -penalty,
                            rarity: 'common',
                            message: 'TIME UP! DEFEAT'
                        });

                        // Actual State Reset after Animation
                        setTimeout(() => {
                            setTheme('default');
                            setBossState(prev => ({ ...prev, active: false }));
                            setGambleState(prev => ({ ...prev, active: false, introAck: false, wager: null, doubleDownCount: 0 }));
                            if (mode === 'listening') {
                                setListeningStreak(0);
                            } else if (mode === 'dictation') {
                                setDictationStreak(0);
                            } else {
                                setStreakCount(0);
                            }
                            setDeathAnim(null);
                        }, 3000);

                        return 0;
                    }
                    return Math.max(0, prev - decrement);
                });
            }, 100);
        } else if (!isLightning && !isGamble) {
            setFuseTime(100); // Reset if not in a timed mode
        }
        return () => clearInterval(interval);
    }, [theme, mode, isSubmittingDrill, bossState.introAck, gambleState.introAck, bossState.active, bossState.type, gambleState.active, gambleState.wager, lightningStarted, persistDictationBattle]);

    // Shake Trigger
    useEffect(() => {
        if (shake) {
            console.log('[Shake] Triggered! shake =', shake);
            const timeout = setTimeout(() => setShake(false), 500);
            return () => clearTimeout(timeout);
        }
    }, [shake]);


    // Auto-dismiss Loot Drop
    useEffect(() => {
        if (lootDrop) {
            const timer = setTimeout(() => {
                setLootDrop(null);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [lootDrop]);

    useEffect(() => {
        eloRatingRef.current = eloRating;
        listeningEloRef.current = listeningElo;
        dictationEloRef.current = dictationElo;
    }, [dictationElo, eloRating, listeningElo]);

    useEffect(() => {
        coinsRef.current = coins;
        inventoryRef.current = inventory;
    }, [coins, inventory]);

    useEffect(() => {
        vocabHintRevealRef.current = isVocabHintRevealed;
    }, [isVocabHintRevealed]);

    useEffect(() => {
        translationAudioUnlockRef.current = isTranslationAudioUnlocked;
    }, [isTranslationAudioUnlocked]);

    useEffect(() => {
        if (isDictationMode) {
            setShowChinese(false);
        }
    }, [isDictationMode]);

    // Cleanup: Stop ALL audio and abort requests when component unmounts
    useEffect(() => {
        return () => {
            // Stop TTS audio
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
            // Stop ambient audio (Legacy removed)
            // Abort any pending API requests
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            console.log('[DrillCore] Cleanup: All audio stopped, requests aborted');
        };
    }, []);


    // Computed Elo based on Mode
    const isShadowingMode = isListeningMode;
    const currentElo = isRebuildMode
        ? (isRebuildPassage ? rebuildBattleElo : rebuildHiddenElo)
        : isDictationMode
            ? dictationElo
            : isListeningMode
                ? listeningElo
                : eloRating;
    const currentStreak = isRebuildMode
        ? (isRebuildPassage ? rebuildBattleStreak : 0)
        : isDictationMode
            ? dictationStreak
            : isListeningMode
                ? listeningStreak
                : streakCount;
    const activeDrillSourceMode: "ai" | "bank" = isListeningMode ? listeningSourceMode : "ai";
    const currentListeningBankId = isListeningMode && drillData?._sourceMeta?.sourceMode === "bank"
        ? drillData._sourceMeta.bankItemId
        : undefined;
    const prefetchedListeningBankId = isListeningMode && prefetchedDrillData?._sourceMeta?.sourceMode === "bank"
        ? prefetchedDrillData._sourceMeta.bankItemId
        : undefined;
    const listeningBankExcludeIds = activeDrillSourceMode === "bank"
        ? Array.from(new Set([
            ...recentListeningBankIdsRef.current,
            ...(currentListeningBankId ? [currentListeningBankId] : []),
            ...(prefetchedListeningBankId ? [prefetchedListeningBankId] : []),
        ]))
        : [];
    const listeningBankExcludeIdsKey = listeningBankExcludeIds.join("|");
    const capsuleCount = inventory.capsule;
    const hintTicketCount = inventory.hint_ticket;
    const vocabTicketCount = inventory.vocab_ticket;
    const audioTicketCount = inventory.audio_ticket;
    const refreshTicketCount = inventory.refresh_ticket;
    const [streakTransition, setStreakTransition] = useState<'surge' | 'cooldown' | null>(null);
    const [cooldownTier, setCooldownTier] = useState<StreakTier>(0);
    const [cooldownStreak, setCooldownStreak] = useState(0);
    const prevStreakRef = useRef(currentStreak);
    const prevStreakModeRef = useRef(mode);
    const streakTier = getStreakTier(currentStreak);
    const activeStreakTier = streakTransition === 'cooldown' && cooldownTier > streakTier ? cooldownTier : streakTier;
    const streakVisual = STREAK_TIER_VISUALS[activeStreakTier];
    const canUseStreakAura = activeStreakTier > 0 && (theme === 'default' || theme === 'fever');
    const canShowStreakParticles = canUseStreakAura && activeStreakTier >= 3 && !prefersReducedMotion;
    const activeParticleCount = Math.min(streakVisual.particleDensity, STREAK_PARTICLE_POSITIONS.length);
    const activeEconomyVisual = activeEconomyFx ? getEconomyVisual(activeEconomyFx) : null;
    const activeCoinTier = activeEconomyFx?.kind === 'coin_gain'
        ? ((activeEconomyFx.amount ?? 0) >= 31 ? 'large' : (activeEconomyFx.amount ?? 0) >= 11 ? 'medium' : 'small')
        : null;
    const activeCoinRainCount = activeCoinTier === 'large' ? 14 : activeCoinTier === 'medium' ? 11 : 8;
    const activeCoinAbsorbCount = activeCoinTier === 'large' ? 5 : activeCoinTier === 'medium' ? 4 : 3;
    const isShopEconomyFx = activeEconomyFx?.kind === 'item_purchase' && activeEconomyFx.source === 'shop' && showShopModal;
    const isGachaEconomyFx = activeEconomyFx?.source === 'gacha';
    const dailyDrillGoalReached = dailyDrillProgress.goal !== null && dailyDrillProgress.completed >= dailyDrillProgress.goal;
    const dailyDrillProgressLabel = dailyDrillProgress.goal === null
        ? `今日 ${dailyDrillProgress.completed} 题`
        : `今日 ${dailyDrillProgress.completed} / ${dailyDrillProgress.goal} 题`;
    const activeEconomyChipLabel = activeEconomyFx?.kind === 'coin_gain'
        ? `+${activeEconomyFx.amount ?? 0}`
        : activeEconomyFx?.itemId
            ? (isGachaEconomyFx ? 'Lucky Draw' : ITEM_CATALOG[activeEconomyFx.itemId].name)
            : '提示';
    const translationKeywords = mode === 'translation' && drillData
        ? ((drillData.target_english_vocab || drillData.key_vocab || []) as string[])
        : [];
    const hasTranslationKeywords = translationKeywords.length > 0;
    const renderEconomyAccent = () => {
        if (!activeEconomyFx || !activeEconomyVisual) return null;

        if (activeEconomyFx.kind === 'coin_gain') {
            return (
                <div className="absolute inset-x-10 top-1/2 -translate-y-1/2 pointer-events-none">
                    <motion.div
                        className={cn("absolute left-0 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full blur-xl", activeEconomyVisual.accentClass)}
                        animate={{ scale: [0.92, 1.18, 0.98], opacity: [0.42, 0.82, 0.3] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className={cn("absolute right-4 top-1/2 h-12 w-20 -translate-y-1/2 rounded-full blur-xl", activeEconomyVisual.accentClass)}
                        animate={{ scale: [0.88, 1.12, 0.94], opacity: [0.32, 0.68, 0.28] }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: 0.12 }}
                    />
                </div>
            );
        }

        if (activeEconomyFx.itemId === 'capsule') {
            return (
                <motion.div
                    className="absolute left-8 top-1/2 h-2 w-24 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-sky-300/65 to-transparent"
                    animate={{ x: [-10, 18, -4], opacity: [0, 1, 0] }}
                    transition={{ duration: 1.05, repeat: Infinity, ease: "easeInOut" }}
                />
            );
        }

        if (activeEconomyFx.itemId === 'hint_ticket') {
            return (
                <div className="absolute inset-y-0 right-8 flex items-center gap-1 pointer-events-none">
                    {[0, 1, 2].map((index) => (
                        <motion.div
                            key={`hint-spark-${index}`}
                            className="flex h-4 w-4 items-center justify-center rounded-full bg-white/70 text-amber-400 shadow-[0_6px_16px_rgba(251,191,36,0.22)]"
                            animate={{ y: [0, -5, 0], scale: [0.92, 1.08, 0.94], opacity: [0.4, 1, 0.5] }}
                            transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.1, ease: "easeInOut" }}
                        >
                            <Sparkles className="h-2.5 w-2.5" />
                        </motion.div>
                    ))}
                </div>
            );
        }

        if (activeEconomyFx.itemId === 'vocab_ticket') {
            return (
                <div className="absolute inset-y-0 right-7 flex items-center gap-1.5 pointer-events-none">
                    {['词', '块', '提示'].map((label, index) => (
                        <motion.div
                            key={`vocab-chip-${label}`}
                            className="rounded-full border border-emerald-200/70 bg-white/80 px-2 py-0.5 text-[9px] font-black tracking-[0.18em] text-emerald-700 shadow-[0_6px_16px_rgba(16,185,129,0.12)]"
                            animate={{ y: [2, -3, 2], rotate: [0, index === 1 ? -4 : 4, 0], opacity: [0.55, 1, 0.72] }}
                            transition={{ duration: 1.1, repeat: Infinity, delay: index * 0.08, ease: "easeInOut" }}
                        >
                            {label}
                        </motion.div>
                    ))}
                </div>
            );
        }

        if (activeEconomyFx.itemId === 'audio_ticket') {
            return (
                <div className="absolute inset-y-0 right-8 flex items-center gap-1 pointer-events-none">
                    {[10, 16, 12].map((height, index) => (
                        <motion.div
                            key={`audio-wave-${height}-${index}`}
                            className="w-1.5 rounded-full bg-indigo-400/75"
                            style={{ height }}
                            animate={{ scaleY: [0.72, 1.18, 0.8], opacity: [0.45, 0.95, 0.52] }}
                            transition={{ duration: 0.72, repeat: Infinity, delay: index * 0.08, ease: "easeInOut" }}
                        />
                    ))}
                </div>
            );
        }

        if (activeEconomyFx.itemId === 'refresh_ticket') {
            return (
                <div className="absolute inset-y-0 right-8 flex items-center gap-1.5 pointer-events-none">
                    {[0, 1].map((index) => (
                        <motion.div
                            key={`refresh-ring-${index}`}
                            className="h-6 w-6 rounded-full border border-cyan-300/60"
                            animate={{ scale: [0.7, 1.2, 1.34], opacity: [0.5, 0.24, 0] }}
                            transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.18, ease: "easeOut" }}
                        />
                    ))}
                    <motion.div
                        className="absolute inset-y-0 right-1 flex items-center"
                        animate={{ rotate: [0, 180, 360] }}
                        transition={{ duration: 1.25, repeat: Infinity, ease: "linear" }}
                    >
                        <RefreshCw className="h-4 w-4 text-cyan-500/75" />
                    </motion.div>
                </div>
            );
        }

        return null;
    };

    const economyFxOverlay = activeEconomyFx && activeEconomyVisual ? (
        <motion.div
            key={activeEconomyFx.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
                "overflow-visible pointer-events-none",
                isShopEconomyFx
                    ? "fixed inset-0 z-[220]"
                    : "absolute inset-0 z-[120]"
            )}
        >
            <motion.div
                initial={{ opacity: 0, y: -30, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -18, scale: 0.98 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className={cn(
                    "absolute left-1/2 z-10 flex min-w-[380px] items-center gap-4 rounded-[28px] border px-4 py-3.5",
                    isShopEconomyFx
                        ? "top-6 shadow-[0_20px_60px_rgba(15,23,42,0.18)]"
                        : "top-4 backdrop-blur-2xl",
                    "-translate-x-1/2 overflow-hidden",
                    activeEconomyVisual.shellClass,
                    isShopEconomyFx && "backdrop-blur-none [backdrop-filter:none]"
                )}
            >
                <div className={cn("relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border", activeEconomyVisual.iconClass)}>
                    {activeEconomyVisual.icon}
                </div>

                <div className="relative z-10 min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-stone-500/90">
                        {activeEconomyFx.kind === 'coin_gain'
                            ? (isGachaEconomyFx ? 'Lucky Draw' : 'Coin Gain')
                            : activeEconomyFx.kind === 'item_purchase'
                                ? (isGachaEconomyFx ? 'Lucky Draw' : 'Store Update')
                                : 'Assist Used'}
                    </div>
                    <div className="truncate text-[15px] font-black tracking-[0.01em]">
                        {activeEconomyFx.message}
                    </div>
                </div>

                <div className={cn("relative z-10 rounded-full border px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.18em]", activeEconomyVisual.chipClass)}>
                    {activeEconomyChipLabel}
                </div>

                <motion.div
                    className={cn("absolute inset-y-2 left-[-22%] w-[44%] -skew-x-12 bg-gradient-to-r opacity-85 blur-sm", activeEconomyVisual.shimmerClass)}
                    animate={{ x: [0, 420] }}
                    transition={{ duration: 1.35, ease: "easeInOut" }}
                />
                {renderEconomyAccent()}
            </motion.div>

            {activeEconomyFx.kind !== 'coin_gain' && activeEconomyVector && !isShopEconomyFx && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.62, x: 0, y: 0 }}
                    animate={{ opacity: [0, 1, 1, 0], scale: [0.62, 1, 0.92, 0.82], x: [0, 0, activeEconomyVector.x], y: [0, 0, activeEconomyVector.y] }}
                    transition={{ duration: 1.14, times: [0, 0.16, 0.72, 1], ease: "easeInOut" }}
                    className="absolute left-1/2 z-20 -translate-x-1/2"
                    style={{ top: ECONOMY_OVERLAY_ORIGIN_TOP }}
                >
                    <div className={cn("relative flex h-9 w-9 items-center justify-center rounded-full border", activeEconomyVisual.flightClass)}>
                        {activeEconomyVisual.icon}
                        <motion.div
                            className={cn("absolute inset-0 rounded-full blur-xl", activeEconomyVisual.pulseClass)}
                            animate={{ opacity: [0.18, 0.5, 0], scale: [0.76, 1.15, 1.32] }}
                            transition={{ duration: 0.72, ease: "easeOut" }}
                        />
                    </div>
                </motion.div>
            )}

            {activeEconomyFx.kind === 'coin_gain' && (
                <>
                    {ECONOMY_COIN_RAIN.slice(0, activeCoinRainCount).map((particle, index) => (
                        <motion.div
                            key={`coin-rain-${activeEconomyFx.id}-${index}`}
                            initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
                            animate={{ opacity: [0, 1, 0.78, 0], x: particle.x, y: particle.y, scale: [0.6, particle.scale, particle.scale * 0.94, particle.scale * 0.86], rotate: particle.rotate }}
                            transition={{ duration: 0.95, delay: particle.delay, ease: "easeOut" }}
                            className="absolute left-1/2 z-[5] -translate-x-1/2"
                            style={{ top: ECONOMY_OVERLAY_ORIGIN_TOP + 8 }}
                        >
                            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-amber-200/80 bg-white/90 text-[11px] text-amber-500 shadow-[0_8px_18px_rgba(245,158,11,0.14)]">
                                ✨
                            </div>
                        </motion.div>
                    ))}

                    {activeEconomyVector && ECONOMY_COIN_ABSORB.slice(0, activeCoinAbsorbCount).map((particle, index) => (
                        <motion.div
                            key={`coin-absorb-${activeEconomyFx.id}-${index}`}
                            initial={{ opacity: 0, scale: 0.58, x: 0, y: 0 }}
                            animate={{ opacity: [0, 1, 1, 0], scale: [0.58, 0.96, 0.88, 0.72], x: [particle.x, particle.x, activeEconomyVector.x], y: [particle.y, particle.y + 16, activeEconomyVector.y] }}
                            transition={{ duration: 0.88, delay: particle.delay, times: [0, 0.2, 0.78, 1], ease: "easeInOut" }}
                            className="absolute left-1/2 z-[8] -translate-x-1/2"
                            style={{ top: ECONOMY_OVERLAY_ORIGIN_TOP + 2 }}
                        >
                            <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-amber-200/80 bg-white/95 text-[10px] text-amber-500 shadow-[0_8px_16px_rgba(245,158,11,0.14)]">
                                ✦
                            </div>
                        </motion.div>
                    ))}
                </>
            )}
        </motion.div>
    ) : null;

    // ELO-based auto-difficulty
    const getEloDifficulty = (elo: number, drillMode: DrillMode) => {
        if (drillMode === 'translation') {
            const tier = getTranslationDifficultyTier(elo);
            const colorMap: Record<string, string> = {
                'Level 1': 'text-stone-500',
                'Level 2': 'text-amber-600',
                'Level 3': 'text-slate-500',
                'Level 4': 'text-yellow-600',
                'Level 5': 'text-cyan-600',
                'Level 6': 'text-blue-500',
                'Level 7': 'text-fuchsia-600',
                'Level 8': 'text-purple-600',
                'Level 9': 'text-red-500',
            };

            return {
                level: tier.level,
                label: `${tier.cefr} ${tier.tier}`,
                cefr: tier.cefr,
                color: colorMap[tier.level] || 'text-stone-500',
                desc: tier.desc,
            };
        }

        if (elo < 400) return { level: 'Level 1', label: 'A1 新手', cefr: 'A1', color: 'text-stone-500', desc: '短句复现' };
        if (elo < 800) return { level: 'Level 2', label: 'A2- 青铜', cefr: 'A2-', color: 'text-amber-600', desc: '基础口语' };
        if (elo < 1200) return { level: 'Level 3', label: 'A2+ 白银', cefr: 'A2+', color: 'text-slate-500', desc: '基础连贯表达' };
        if (elo < 1600) return { level: 'Level 4', label: 'B1 黄金', cefr: 'B1', color: 'text-yellow-600', desc: '自然语流' };
        if (elo < 2000) return { level: 'Level 5', label: 'B2 铂金', cefr: 'B2', color: 'text-cyan-600', desc: '高信息密度' };
        if (elo < 2400) return { level: 'Level 6', label: 'C1 钻石', cefr: 'C1', color: 'text-blue-500', desc: '高自然度口语' };
        if (elo < 2800) return { level: 'Level 7', label: 'C2 大师', cefr: 'C2', color: 'text-fuchsia-600', desc: '复杂口语复现' };
        if (elo < 3200) return { level: 'Level 8', label: 'C2+ 王者', cefr: 'C2+', color: 'text-purple-600', desc: '高压自然口语' };
        return { level: 'Level 9', label: '☠️ 处决', cefr: '∞', color: 'text-red-500', desc: '极限挑战' };
    };
    const eloDifficulty = getEloDifficulty(currentElo || DEFAULT_BASE_ELO, mode);

    const [eloChange, setEloChange] = useState<number | null>(null);
    const [eloBreakdown, setEloBreakdown] = useState<{
        difficultyElo: number;
        expectedScore: number;
        actualScore: number;
        kFactor: number;
        streakBonus: boolean;
        baseChange: number;
        bonusChange: number;
    } | null>(null);

    const [audioDuration, setAudioDuration] = useState(0);

    useEffect(() => {
        if (prevStreakModeRef.current !== mode) {
            prevStreakModeRef.current = mode;
            prevStreakRef.current = currentStreak;
            setStreakTransition(null);
            setCooldownTier(0);
            setCooldownStreak(0);
            return;
        }

        const previousStreak = prevStreakRef.current;
        let timeoutId: NodeJS.Timeout | null = null;

        if (currentStreak > previousStreak && currentStreak >= 2) {
            setCooldownTier(0);
            setCooldownStreak(0);
            setStreakTransition('surge');
            timeoutId = setTimeout(() => setStreakTransition(null), prefersReducedMotion ? 220 : 560);
        } else if (previousStreak >= 2 && currentStreak <= 1) {
            setCooldownTier(getStreakTier(previousStreak));
            setCooldownStreak(previousStreak);
            setStreakTransition('cooldown');
            timeoutId = setTimeout(() => {
                setStreakTransition(null);
                setCooldownTier(0);
                setCooldownStreak(0);
            }, prefersReducedMotion ? 180 : 380);
        }

        prevStreakRef.current = currentStreak;

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [currentStreak, mode, prefersReducedMotion]);

    // --- Idle Coin Earning ---
    useEffect(() => {
        // Only earn coins while actively on the drill page (any mode)
        const idleInterval = setInterval(() => {
            applyEconomyPatch({ coinsDelta: 5 });
            pushEconomyFx({ kind: 'coin_gain', amount: 5, message: '+5 星光币', source: 'reward' });
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearInterval(idleInterval);
    }, [applyEconomyPatch, pushEconomyFx]);

    // --- Loading & Persistance ---

    useEffect(() => {
        const loadProfile = async () => {
            const profile = await db.user_profile.orderBy('id').first();
            const activeUserMeta = await db.sync_meta.get("active_user_id");
            rebuildMetaNamespaceRef.current = typeof activeUserMeta?.value === "string" ? activeUserMeta.value : "local";
            if (profile) {
                const learningPreferences = normalizeLearningPreferences(profile.learning_preferences);
                setEloRating(profile.elo_rating);
                setStreakCount(profile.streak_count);

                // Load Listening Stats (Fallback if undefined post-migration in memory before reload)
                setListeningElo(profile.listening_elo ?? DEFAULT_BASE_ELO);
                setListeningStreak(profile.listening_streak ?? 0);
                setDictationElo(profile.dictation_elo ?? profile.listening_elo ?? DEFAULT_BASE_ELO);
                setDictationStreak(profile.dictation_streak ?? 0);
                setRebuildBattleElo(profile.rebuild_elo ?? profile.rebuild_hidden_elo ?? profile.listening_elo ?? DEFAULT_BASE_ELO);
                setRebuildBattleStreak(profile.rebuild_streak ?? 0);
                eloRatingRef.current = profile.elo_rating;
                listeningEloRef.current = profile.listening_elo ?? DEFAULT_BASE_ELO;
                dictationEloRef.current = profile.dictation_elo ?? profile.listening_elo ?? DEFAULT_BASE_ELO;

                // Load Hint Economy Stats
                const loadedCoins = profile.coins ?? DEFAULT_STARTING_COINS;
                const loadedInventory = normalizeInventory(profile.inventory, profile.hints);
                coinsRef.current = loadedCoins;
                inventoryRef.current = loadedInventory;
                setCoins(loadedCoins);
                setInventory(loadedInventory);

                const loadedOwnedThemes = normalizeOwnedThemes(profile.owned_themes);
                setOwnedThemes(loadedOwnedThemes);
                const loadedActive = (
                    profile.active_theme
                    && loadedOwnedThemes.includes(profile.active_theme as CosmeticThemeId)
                    && profile.active_theme in COSMETIC_THEMES
                )
                    ? profile.active_theme as CosmeticThemeId
                    : DEFAULT_FREE_THEME;
                setCosmeticTheme(loadedActive);
                setRebuildShadowingAutoOpen(learningPreferences.rebuild_auto_open_shadowing_prompt ?? true);
                const hiddenMeta = await db.sync_meta.get(buildRebuildMetaKey("hidden_elo"));
                const syncedRebuildElo = typeof profile.rebuild_hidden_elo === "number"
                    ? profile.rebuild_hidden_elo
                    : undefined;
                const legacyRebuildElo = typeof hiddenMeta?.value === "number"
                    ? hiddenMeta.value
                    : undefined;
                const nextRebuildHiddenElo = syncedRebuildElo ?? legacyRebuildElo ?? (profile.listening_elo ?? DEFAULT_BASE_ELO);
                setRebuildHiddenElo(nextRebuildHiddenElo);

                setIsEloLoaded(true); // Mark Elo as loaded
            } else {
                const initialInventory = { ...DEFAULT_INVENTORY };
                setEloRating(DEFAULT_BASE_ELO);
                setStreakCount(0);
                setListeningElo(DEFAULT_BASE_ELO);
                setListeningStreak(0);
                setDictationElo(DEFAULT_BASE_ELO);
                setDictationStreak(0);
                setRebuildBattleElo(DEFAULT_BASE_ELO);
                setRebuildBattleStreak(0);
                setRebuildShadowingAutoOpen(true);
                eloRatingRef.current = DEFAULT_BASE_ELO;
                listeningEloRef.current = DEFAULT_BASE_ELO;
                dictationEloRef.current = DEFAULT_BASE_ELO;
                coinsRef.current = DEFAULT_STARTING_COINS;
                inventoryRef.current = initialInventory;
                setCoins(DEFAULT_STARTING_COINS);
                setInventory(initialInventory);
                setOwnedThemes([...FREE_THEME_IDS]);
                setCosmeticTheme(DEFAULT_FREE_THEME);
                setRebuildHiddenElo(DEFAULT_BASE_ELO);
                setIsEloLoaded(true); // Mark Elo as loaded (new profile)
            }
        };
        loadProfile();

        const savedDiff = localStorage.getItem('yasi_drill_difficulty');
        if (savedDiff) setDifficulty(savedDiff);
    }, []);

    useEffect(() => {
        localStorage.setItem('yasi_drill_difficulty', difficulty);
    }, [difficulty]);

    const refreshDailyDrillProgress = useCallback(() => {
        const next = syncStoredDailyDrillProgress();
        setDailyDrillProgress(next);
        return next;
    }, []);

    const applyDailyDrillGoal = useCallback((goal: number | null) => {
        const next = setStoredDailyDrillGoal(goal);
        setDailyDrillProgress(next);
        setDailyDrillGoalDraft(next.goal ? String(next.goal) : "");
        return next;
    }, []);

    const recordCompletedDrill = useCallback(() => {
        if (hasRecordedDailyDrillRef.current) return;
        hasRecordedDailyDrillRef.current = true;
        const next = incrementStoredDailyDrillProgress();
        setDailyDrillProgress(next);
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('yasi:sync_smart_goals'));
        }
    }, []);

    useEffect(() => {
        refreshDailyDrillProgress();

        const handleFocus = () => {
            refreshDailyDrillProgress();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                refreshDailyDrillProgress();
            }
        };

        window.addEventListener("focus", handleFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            window.removeEventListener("focus", handleFocus);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [refreshDailyDrillProgress]);

    useEffect(() => {
        if (!isDailyDrillProgressOpen) return;

        const handlePointerDown = (event: MouseEvent | TouchEvent) => {
            if (!dailyDrillProgressRef.current?.contains(event.target as Node)) {
                setIsDailyDrillProgressOpen(false);
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsDailyDrillProgressOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("touchstart", handlePointerDown);
        window.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("touchstart", handlePointerDown);
            window.removeEventListener("keydown", handleEscape);
        };
    }, [isDailyDrillProgressOpen]);

    // --- Audio Logic ---

    // Auto-Play Removed per User Request (Manual Only)
    /*
    useEffect(() => {
        const isIntroShowing = (gambleState.active && !gambleState.introAck) || (bossState.active && !bossState.introAck);

        if (mode === "listening" && drillData?.reference_english && !drillFeedback && !isIntroShowing) {
            playAudio();
        }
    }, [drillData, mode, gambleState.active, gambleState.introAck, bossState.active, bossState.introAck]);
    */

    const fetchTtsAudio = useCallback(async (text: string) => {
        const data = await requestTtsPayload(text);
        const blob = await resolveTtsAudioBlob(data.audio);

        if (blob.size < 100) {
            throw new Error("Generated audio blob too small");
        }

        return { blob, marks: data.marks || [] };
    }, []);

    const ensureAudioCached = useCallback(async (text: string) => {
        const textKey = getSentenceAudioCacheKey(text);
        const cached = audioCache.current.get(textKey);
        if (cached?.blob) {
            return cached;
        }

        const pending = audioInflight.current.get(textKey);
        if (pending) {
            return pending;
        }

        setLoadingAudioKeys((prev) => {
            if (prev.has(textKey)) return prev;
            const next = new Set(prev);
            next.add(textKey);
            return next;
        });

        const nextRequest = fetchTtsAudio(text)
            .then((nextAudio) => {
                audioCache.current.set(textKey, nextAudio);
                return nextAudio;
            })
            .finally(() => {
                audioInflight.current.delete(textKey);
                setLoadingAudioKeys((prev) => {
                    if (!prev.has(textKey)) return prev;
                    const next = new Set(prev);
                    next.delete(textKey);
                    return next;
                });
            });

        audioInflight.current.set(textKey, nextRequest);
        return nextRequest;
    }, [fetchTtsAudio]);

    const clearRebuildChoicePrefetch = useCallback(() => {
        if (rebuildChoicePrefetchAbortRef.current) {
            rebuildChoicePrefetchAbortRef.current.abort();
            rebuildChoicePrefetchAbortRef.current = null;
        }
        prefetchedRebuildChoicesRef.current = {};
    }, []);

    // Pre-generate audio for sentence drills (translation/listening/rebuild sentence).
    // Passage has dedicated all-segment prefetch below.
    useEffect(() => {
        const shouldPrefetchSentenceAudio =
            (mode === "translation" || isListeningMode || isRebuildMode) && !isRebuildPassage;

        if (!shouldPrefetchSentenceAudio || !drillData?.reference_english) {
            setIsPrefetching(false);
            return;
        }

        const textKey = getSentenceAudioCacheKey(drillData.reference_english);
        if (audioCache.current.has(textKey) || audioInflight.current.has(textKey)) {
            return;
        }

        let isCancelled = false;

        const prefetchAudio = async () => {
            setIsPrefetching(true);
            try {
                const cachedAudio = await ensureAudioCached(drillData.reference_english);
                if (isCancelled) return;
                audioCache.current.set(textKey, cachedAudio);
            } catch (error) {
                if (!isCancelled) {
                    console.error('[Audio Prefetch] Error:', error);
                }
            } finally {
                if (!isCancelled) {
                    setIsPrefetching(false);
                }
            }
        };

        prefetchAudio();

        return () => {
            isCancelled = true;
        };
    }, [drillData?.reference_english, ensureAudioCached, isListeningMode, isRebuildMode, isRebuildPassage, mode]);

    // Passage mode: pre-synthesize all segment audios up front to avoid inter-segment wait.
    useEffect(() => {
        if (!isRebuildPassage || !passageSession?.segments?.length) return;

        const uniqueTexts = Array.from(new Set(
            passageSession.segments
                .map((segment) => segment.referenceEnglish?.trim())
                .filter((text): text is string => Boolean(text))
        ));
        const pendingTexts = uniqueTexts.filter((text) => {
            const textKey = getSentenceAudioCacheKey(text);
            return !audioCache.current.has(textKey) && !audioInflight.current.has(textKey);
        });
        if (pendingTexts.length === 0) return;

        let isCancelled = false;

        const prefetchAllPassageAudio = async () => {
            setIsPrefetching(true);
            try {
                await Promise.allSettled(
                    pendingTexts.map((text) => ensureAudioCached(text))
                );
            } catch (error) {
                if (!isCancelled) {
                    console.error("[Passage Audio Prefetch] Error:", error);
                }
            } finally {
                if (!isCancelled) {
                    setIsPrefetching(false);
                }
            }
        };

        void prefetchAllPassageAudio();

        return () => {
            isCancelled = true;
        };
    }, [ensureAudioCached, isRebuildPassage, passageSession?.sessionId, passageSession?.segments]);

    const lastPlayTime = useRef(0);

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        setCurrentAudioTime(time);
        if (audioRef.current) audioRef.current.currentTime = time / 1000;
    };

    const resetAudioPlayback = useCallback(() => {
        const activeAudio = audioRef.current;
        if (activeAudio) {
            activeAudio.onplay = null;
            activeAudio.onpause = null;
            activeAudio.onloadedmetadata = null;
            activeAudio.ontimeupdate = null;
            activeAudio.onended = null;
            activeAudio.onerror = null;
            activeAudio.onabort = null;
            activeAudio.onstalled = null;
            activeAudio.onemptied = null;
            activeAudio.pause();
            activeAudio.src = "";
            audioRef.current = null;
        }

        if (audioObjectUrlRef.current) {
            URL.revokeObjectURL(audioObjectUrlRef.current);
            audioObjectUrlRef.current = null;
        }

        setIsPlaying(false);
        setIsAudioLoading(false);
        setCurrentAudioTime(0);
        setAudioDuration(0);
        setAudioSourceText(null);
        setActivePlaybackAudio(null);
    }, []);

    const playAudio = useCallback(async (explicitText?: string) => {
        const resolvedText = explicitText ?? drillData?.reference_english;
        if (!resolvedText) return false;

        // Debounce (Prevent Double Click)
        const now = Date.now();
        if (now - lastPlayTime.current < 500) return false;
        lastPlayTime.current = now;

        // Echo Beast Constraint: One-time playback
        if (bossState.active && bossState.type === 'echo' && hasPlayedEchoRef.current) {
            // Audio "Broken" effect
            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
            setShake(true);
            return false;
        }

        const textKey = getSentenceAudioCacheKey(resolvedText);
        // setIsPlaying(true); 
        setWordPopup(null);

        try {
            let cached = audioCache.current.get(textKey);

            if (!cached) {
                setIsAudioLoading(true);
                setIsPlaying(false);

                cached = await ensureAudioCached(resolvedText);
                setIsAudioLoading(false);
            }

            resetAudioPlayback();
            setAudioSourceText(resolvedText);

            // Create fresh URL from cached blob (always use blob now)
            const audioUrl = cached.blob
                ? URL.createObjectURL(cached.blob)
                : (cached.url || '');
            if (cached.blob) {
                audioObjectUrlRef.current = audioUrl;
            }

            console.log('[Audio Play] Creating audio from cache, blob size:', cached.blob?.size, 'url:', audioUrl.substring(0, 50));

            const audio = new Audio(audioUrl);
            audioRef.current = audio;
            setActivePlaybackAudio(audio);

            // Add error handler
            audio.onerror = (e) => {
                console.error('[Audio Play] Error loading audio:', audio.error?.message, audio.error?.code);
                resetAudioPlayback();
            };

            audio.onabort = () => {
                resetAudioPlayback();
            };

            audio.onstalled = () => {
                setIsPlaying(false);
            };

            audio.onemptied = () => {
                resetAudioPlayback();
            };

            audio.onplay = () => {
                setIsPlaying(true);
                setIsAudioLoading(false);
            };

            audio.onpause = () => {
                if (!audio.ended) {
                    setIsPlaying(false);
                }
            };

            audio.onloadedmetadata = () => setAudioDuration(audio.duration * 1000);
            if (audio.duration && !isNaN(audio.duration)) setAudioDuration(audio.duration * 1000);

            audio.ontimeupdate = () => {
                if (!audio.paused) {
                    setCurrentAudioTime(audio.currentTime * 1000);
                }
            };

            audio.onended = () => {
                resetAudioPlayback();
            };

            audio.playbackRate = playbackSpeed;

            // Echo Beast Constraint
            if (bossState.active && bossState.type === 'echo') {
                if (hasPlayedEchoRef.current) {
                    new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
                    setShake(true);
                    setIsPlaying(false);
                    return false;
                }
                hasPlayedEchoRef.current = true;
            }

            await audio.play();
            if (isRebuildMode && (isRebuildPassage ? !activePassageResult : !rebuildFeedback)) {
                setRebuildReplayCount((prev) => prev + 1);
            }
            setIsPlaying(!audio.paused);

            // Start Lightning countdown when audio plays
            if (bossState.active && bossState.type === 'lightning') {
                setLightningStarted(true);
            }
            return true;
        } catch (error) {
            console.error("Audio chain failed", error);
            resetAudioPlayback();
            return false;
        }
    }, [
        activePassageResult,
        bossState.active,
        bossState.type,
        drillData?.reference_english,
        ensureAudioCached,
        isRebuildMode,
        isRebuildPassage,
        playbackSpeed,
        rebuildFeedback,
        resetAudioPlayback,
    ]);

    useEffect(() => {
        resetAudioPlayback();
        return () => {
            resetAudioPlayback();
        };
    }, [drillData?.reference_english, mode, resetAudioPlayback]);


    useEffect(() => {
        if (drillData?.reference_english && setContext) {
            const keywords = drillData.target_english_vocab?.join(" ") || "";
            const effectiveTopic = drillData._topicMeta?.topic || context.articleTitle || context.topic || 'General';
            // Simplified prompt for context
            const prompt = `Topic: ${effectiveTopic}. Keywords: ${keywords}. Sentence: ${drillData.reference_english}`;
            setContext(prompt);
        }
    }, [drillData, context, setContext]);

    const launchRebuildSuccessCelebration = useCallback(() => {
        playRebuildSfx("success");
        playRebuildSfx("celebrate");
        if (prefersReducedMotion) return;

        confetti({
            particleCount: 180,
            spread: 84,
            startVelocity: 34,
            scalar: 0.98,
            origin: { y: 0.68, x: 0.5 },
            colors: ["#34d399", "#2dd4bf", "#fbbf24", "#ffffff"],
        });
        window.setTimeout(() => {
            confetti({
                particleCount: 120,
                spread: 70,
                startVelocity: 30,
                scalar: 0.9,
                origin: { y: 0.62, x: 0.18 },
                angle: 58,
                colors: ["#34d399", "#a7f3d0", "#fbbf24", "#ffffff"],
            });
        }, 120);
        window.setTimeout(() => {
            confetti({
                particleCount: 120,
                spread: 70,
                startVelocity: 30,
                scalar: 0.9,
                origin: { y: 0.62, x: 0.82 },
                angle: 122,
                colors: ["#2dd4bf", "#99f6e4", "#fde68a", "#ffffff"],
            });
        }, 220);
    }, [playRebuildSfx, prefersReducedMotion]);

    useEffect(() => {
        if (!isRebuildMode) return;
        
        let objToTrack: any = null;
        let delta = 0;

        if (isRebuildPassage && rebuildPassageSummary) {
            objToTrack = rebuildPassageSummary;
            delta = rebuildPassageSummary.change;
        } else if (!isRebuildPassage && rebuildFeedback) {
            objToTrack = rebuildFeedback;
            delta = rebuildFeedback.systemDelta;
        }

        if (objToTrack && objToTrack !== lastEloSplashObjRef.current) {
            lastEloSplashObjRef.current = objToTrack;
            if (typeof delta === 'number') {
                setEloSplash({ uid: Math.random().toString(), delta });
                
                try {
                    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                    if (AudioContext) {
                        const ctx = new AudioContext();
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        
                        if (delta > 0) {
                            osc.type = 'sine';
                            osc.frequency.setValueAtTime(400, ctx.currentTime);
                            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);
                            gain.gain.setValueAtTime(0.3, ctx.currentTime);
                            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                        } else {
                            osc.type = 'triangle';
                            osc.frequency.setValueAtTime(300, ctx.currentTime);
                            osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
                            gain.gain.setValueAtTime(0.3, ctx.currentTime);
                            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
                        }
                        
                        osc.start(ctx.currentTime);
                        osc.stop(ctx.currentTime + 0.6);
                    }
                } catch(e) {}

                const timer = setTimeout(() => {
                    setEloSplash(null);
                }, 2200);
                return () => clearTimeout(timer);
            }
        }
    }, [isRebuildMode, isRebuildPassage, rebuildPassageSummary, rebuildFeedback]);

    useEffect(() => {
        if (isRebuildPassage) return;
        if (!rebuildFeedback?.resolvedAt) return;
        if (lastRebuildResolvedAtRef.current === rebuildFeedback.resolvedAt) return;
        lastRebuildResolvedAtRef.current = rebuildFeedback.resolvedAt;

        if (rebuildFeedback.evaluation.isCorrect && !rebuildFeedback.skipped) {
            launchRebuildSuccessCelebration();
            return;
        }

        playRebuildSfx("error");
    }, [isRebuildPassage, launchRebuildSuccessCelebration, rebuildFeedback, playRebuildSfx]);


    // --- Spacebar Logic ---
    // Feedback Effects
    useEffect(() => {
        if (!drillFeedback || drillFeedback._error) return;

        const celebrationKey = `${mode}:${drillData?.reference_english ?? ""}:${drillFeedback.score}:${drillFeedback.improved_version ?? ""}`;
        if (lastScoreCelebrationRef.current === celebrationKey) return;
        lastScoreCelebrationRef.current = celebrationKey;

        const timeoutIds: number[] = [];

        if (drillFeedback.score >= 8) {
            if (!prefersReducedMotion) {
                const strongHit = drillFeedback.score >= 9;
                confetti({
                    particleCount: strongHit ? 190 : 120,
                    spread: strongHit ? 92 : 74,
                    startVelocity: strongHit ? 46 : 32,
                    scalar: strongHit ? 1.08 : 0.96,
                    origin: { y: 0.62, x: 0.5 },
                    colors: ['#10b981', '#34d399', '#6ee7b7', '#fcd34d', '#ffffff'],
                });
                if (strongHit) {
                    timeoutIds.push(window.setTimeout(() => {
                        confetti({
                            particleCount: 150,
                            spread: 72,
                            startVelocity: 40,
                            scalar: 1,
                            origin: { y: 0.56, x: 0.18 },
                            angle: 58,
                            colors: ['#34d399', '#a7f3d0', '#fcd34d', '#ffffff'],
                        });
                    }, 140));
                    timeoutIds.push(window.setTimeout(() => {
                        confetti({
                            particleCount: 150,
                            spread: 72,
                            startVelocity: 40,
                            scalar: 1,
                            origin: { y: 0.56, x: 0.82 },
                            angle: 122,
                            colors: ['#10b981', '#6ee7b7', '#fde68a', '#ffffff'],
                        });
                    }, 220));
                    timeoutIds.push(window.setTimeout(() => {
                        confetti({
                            particleCount: 110,
                            spread: 120,
                            startVelocity: 28,
                            scalar: 0.88,
                            origin: { y: 0.48, x: 0.5 },
                            colors: ['#10b981', '#34d399', '#fcd34d', '#ffffff'],
                        });
                    }, 320));
                }
            }
            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-achievement-bell-600.mp3').play().catch(() => { });
            return () => {
                timeoutIds.forEach((id) => window.clearTimeout(id));
            };
        }

        if (drillFeedback.score <= 4) {
            const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-wrong-answer-fail-notification-946.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => { });
            return () => {
                timeoutIds.forEach((id) => window.clearTimeout(id));
            };
        }

        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-message-pop-alert-2354.mp3').play().catch(() => { });
        return () => {
            timeoutIds.forEach((id) => window.clearTimeout(id));
        };
    }, [drillData?.reference_english, drillFeedback, mode, prefersReducedMotion]);

    // --- Keyboard listeners removed - now using click-to-record UI ---
    // Space key no longer triggers recording

    // --- Intro BGM Manager ---
    useEffect(() => {
        let audio: HTMLAudioElement | null = null;

        if (bossState.active) {
            // Play Boss BGM
            const config = BOSS_CONFIG[bossState.type];
            if (config && config.bgm) {
                console.log("[Audio] Playing Boss BGM:", config.bgm);
                audio = new Audio(config.bgm);
                audio.volume = bossState.introAck ? 0.15 : 0.4;
                audio.loop = false;
                audio.play().catch(err => console.log("[Audio] Boss play failed:", err));
            }
        } else if (gambleState.active) {
            // Play Gamble Audio (Intro Prompt vs Betting Loop)
            if (!gambleState.introAck) {
                // Intro: "Heartbeat/Prompt" sound
                console.log("[Audio] Playing Gamble Intro");
                audio = new Audio('/gamble_intro.mp3');
                audio.volume = 0.6;
                audio.loop = false;
            } else {
                // Betting Phase: "Background Tension" loop
                console.log("[Audio] Playing Gamble Loop");
                audio = new Audio('/gamble_loop.mp3');
                audio.volume = 0.4;
                audio.loop = true;
            }
            audio.play().catch(err => console.log("[Audio] Gamble play failed:", err));
        }

        return () => {
            if (audio) {
                audio.pause();
                audio = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bossState.active, bossState.introAck, bossState.type, gambleState.active, gambleState.introAck]);


    // --- DEBUG TRIGGER ---
    const handleDebugBossTrigger = (type: string) => {
        console.log(`[DEBUG] Triggering Boss: ${type}`);
        // Force immediate Drill Generation with Override
        handleGenerateDrill(undefined, type);
    };

    const handleDebugEconomyFx = useCallback((
        kind: EconomyFxKind,
        options: { itemId?: ShopItemId; amount?: number; message: string; }
    ) => {
        pushEconomyFx({
            kind,
            itemId: options.itemId,
            amount: options.amount,
            message: options.message,
            source: kind === 'coin_gain' ? 'reward' : kind === 'item_purchase' ? 'shop' : 'tab',
        });
    }, [pushEconomyFx]);

    const handleDebugLootDrop = useCallback((options: LootDrop) => {
        setLootDrop(options);
    }, []);

    const handleDebugGacha = useCallback(() => {
        setGachaCards(buildGachaPack());
        setSelectedGachaCardId(null);
        setGachaClaimTarget(null);
        setShowGacha(true);
    }, []);

    const debugTriggerRoulette = () => {
        // Show the interactive overlay instead of immediate generation
        setShowRoulette(true);
    };

    const getGachaClaimTarget = useCallback((card: GachaCard) => {
        const targetId: EconomyTargetId = card.rewardType === 'coins' ? 'coins' : card.rewardType;
        const targetRect = resourceTargetRefs.current[targetId]?.getBoundingClientRect();

        if (!targetRect) return null;

        return {
            target: targetId,
            x: targetRect.left + targetRect.width / 2,
            y: targetRect.top + targetRect.height / 2,
        };
    }, []);

    const handleGachaSelect = useCallback((cardId: string) => {
        if (selectedGachaCardId !== null) return;

        const reward = gachaCards.find((card) => card.id === cardId);
        if (!reward) return;

        setSelectedGachaCardId(cardId);
        setGachaCards((prev) => prev.map((card) => ({
            ...card,
            selected: card.id === cardId,
            revealed: card.id === cardId,
        })));
        setGachaClaimTarget(getGachaClaimTarget(reward));
        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3').play().catch(() => { });

        const economyReward = getGachaRewardEconomy(reward);
        applyEconomyPatch({
            coinsDelta: economyReward.coinsDelta,
            itemDelta: economyReward.itemDelta,
        });
        pushEconomyFx({
            ...economyReward.fx,
            source: 'gacha',
        });
    }, [applyEconomyPatch, gachaCards, getGachaClaimTarget, pushEconomyFx, selectedGachaCardId]);

    const handleGachaComplete = useCallback(() => {
        setShowGacha(false);
        setGachaCards([]);
        setSelectedGachaCardId(null);
        setGachaClaimTarget(null);
    }, []);

    const handleRouletteComplete = (result: 'safe' | 'dead', bulletCount: number) => {
        setShowRoulette(false);
        console.log(`[Roulette] Result: ${result}, Bullets: ${bulletCount}`);

        const GREED_TABLE = [
            { bullets: 0, mult: 1 },
            { bullets: 1, mult: 2 },
            { bullets: 2, mult: 3 },
            { bullets: 3, mult: 5 },
            { bullets: 4, mult: 8 },
            { bullets: 5, mult: 15 },
            { bullets: 6, mult: 50 },
        ];

        const multiplier = GREED_TABLE.find(t => t.bullets === bulletCount)?.mult || 1;

        if (result === 'dead') {
            // --- IMMEDIATE PENALTY ---
            const penalty = 50;
            const isListening = mode === 'listening';
            const isDictation = mode === 'dictation';
            const activeElo = isDictation ? dictationElo : isListening ? listeningElo : eloRating;
            const newElo = Math.max(0, (activeElo || DEFAULT_BASE_ELO) - penalty);

            setEloChange(-penalty);
            setLootDrop({
                type: 'exp',
                amount: -penalty,
                rarity: 'common',
                message: '💀 你中弹了！扣除 50 Elo 并开启处决局'
            });
            setShake(true);

            // Update local state
            if (isListening) {
                setListeningElo(newElo);
                setListeningStreak(0);
            } else if (isDictation) {
                setDictationElo(newElo);
                setDictationStreak(0);
            } else {
                setEloRating(newElo);
                setStreakCount(0);
            }

            void loadLocalProfile().then(async (profile) => {
                if (!profile) return;
                if (isDictation) {
                    await persistDictationBattle({
                        eloAfter: newElo,
                        change: -penalty,
                        streak: 0,
                        source: 'roulette_penalty',
                    });
                    return;
                }

                const isRebuild = mode === "rebuild";
                const maxElo = isListening
                    ? Math.max(profile.listening_max_elo || DEFAULT_BASE_ELO, newElo)
                    : isRebuild
                        ? Math.max(profile.rebuild_max_elo || profile.rebuild_elo || DEFAULT_BASE_ELO, newElo)
                        : Math.max(profile.max_elo, newElo);

                await settleBattle({
                    mode: isListening ? 'listening' : isRebuild ? 'rebuild' : 'translation',
                    eloAfter: newElo,
                    change: -penalty,
                    streak: 0,
                    maxElo,
                    coins: profile.coins ?? DEFAULT_STARTING_COINS,
                    source: 'roulette_penalty',
                });
            }).catch((error) => {
                console.error("Failed to sync roulette penalty", error);
            });

            setRouletteSession({ active: true, result: 'dead', multiplier: 1, bullets: bulletCount });
            handleGenerateDrill(undefined, 'roulette_execution');
        } else {
            // --- DEFERRED REWARD ---
            setRouletteSession({ active: true, result: 'safe', multiplier, bullets: bulletCount });
            setLootDrop({
                type: 'gem',
                amount: 0,
                rarity: 'legendary',
                message: `🎰 活下来了！本题奖励 x${multiplier} 倍`
            });
            handleGenerateDrill(undefined, 'roulette');
        }
    };

    const consumeNextDrill = useCallback((nextDrill: PrefetchedDrillData) => {
        hasRecordedDailyDrillRef.current = false;
        const hydratedDrill = nextDrill._rebuildMeta?.variant === "passage"
            ? {
                ...hydratePassageSegmentDrill(nextDrill, nextDrill._rebuildMeta.passageSession?.currentIndex ?? 0),
                mode: nextDrill.mode,
                sourceMode: nextDrill.sourceMode,
            }
            : nextDrill;
        setDrillData(hydratedDrill);
        setPrefetchedDrillData(null);
        clearRebuildChoicePrefetch();
        setPendingRebuildAdvanceElo(null);
        setActivePassageSegmentIndex(0);
        setRebuildPassageDrafts([]);
        setRebuildPassageResults([]);
        setRebuildPassageUiState([]);
        setRebuildPassageScores([]);
        setRebuildPassageSummary(null);
        resetRebuildShadowingState();
        resetGuidedLearningState(false);

        setIsGeneratingDrill(false);
        setDrillFeedback(null);
        setRebuildFeedback(null);
        setRebuildTypingBuffer("");
        setUserTranslation("");
        setFullReferenceHint((prev) => ({ version: prev.version + 1, text: "" }));
        setTutorAnswer(null);
        setTutorThread([]);
        setTutorResponse(null);
        setTutorPendingQuestion(null);
        setTutorQuery("");
        setTutorThinkingMode("chat");
        setIsTutorOpen(false);
        setRebuildTutorSession(null);
        setWordPopup(null);
        setIsPlaying(false);
        setHasRatedDrill(false);
        setAnalysisRequested(false);
        setIsGeneratingAnalysis(false);
        setAnalysisError(null);
        setAnalysisDetailsOpen(false);
        setFullAnalysisRequested(false);
        setIsGeneratingFullAnalysis(false);
        setFullAnalysisError(null);
        setFullAnalysisOpen(false);
        setFullAnalysisData(null);
        setIsGeneratingGrammar(false);
        setGrammarError(null);
        setReferenceGrammarAnalysis(null);
        setReferenceGrammarDisplayMode("core");
        setEloChange(null);
        setIsHintLoading(false);
        setIsVocabHintRevealed(false);
        setIsTranslationAudioUnlocked(false);
        setBlindVisibleUnlockConsumed(false);
        if (isDictationMode) {
            setIsBlindMode(true);
            setShowChinese(false);
        }
        vocabHintRevealRef.current = false;
        translationAudioUnlockRef.current = false;
        resetResult();
        if (audioRef.current) audioRef.current.pause();
        hasPlayedEchoRef.current = false;
        setLightningStarted(false);

        if (teachingMode && mode === 'translation') {
            setIsLoadingTeaching(true);
            fetch("/api/ai/teach", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chinese: nextDrill.chinese,
                    reference_english: nextDrill.reference_english,
                    elo: currentElo,
                }),
            })
                .then(res => res.json())
                .then(data => setTeachingData(data))
                .catch(console.error)
                .finally(() => setIsLoadingTeaching(false));
        }
    }, [clearRebuildChoicePrefetch, currentElo, hydratePassageSegmentDrill, isDictationMode, mode, resetGuidedLearningState, resetRebuildShadowingState, resetResult, teachingMode]);

    const prefetchNextDrill = (nextElo: number) => {
        console.log("[Prefetch] Starting background prefetch for next drill...");
        if (abortPrefetchRef.current) abortPrefetchRef.current.abort();
        abortPrefetchRef.current = new AbortController();

        let nextBossType: 'blind' | 'lightning' | 'echo' | 'reaper' | undefined = undefined;
        if (isListeningFamilyMode) {
            const roll = Math.random();
            if (roll < 0.02) {
                const bossRoll = Math.random();
                if (bossRoll < 0.35) nextBossType = 'blind';
                else if (bossRoll < 0.65) nextBossType = 'echo';
                else if (bossRoll < 0.85) nextBossType = 'lightning';
                else nextBossType = 'reaper';
            }
        }

        const targetTopic = resolveBattleScenarioTopic(context.articleTitle || context.topic, nextElo);

        fetch("/api/drill/next", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                articleTitle: targetTopic,
                articleContent: context.articleContent || "",
                difficulty: getEloDifficulty(nextElo, mode).level,
                eloRating: Math.max(0, nextElo),
                mode: generationMode,
                sourceMode: activeDrillSourceMode,
                excludeBankIds: activeDrillSourceMode === "bank" ? listeningBankExcludeIds : undefined,
                rebuildVariant: isRebuildMode ? rebuildVariant : undefined,
                segmentCount: isRebuildPassage ? rebuildSegmentCount : undefined,
                bossType: nextBossType,
                _t: Date.now()
            }),
            signal: abortPrefetchRef.current.signal,
        }).then(async (res) => ({ ok: res.ok, data: await res.json() }))
            .then(({ ok, data }) => {
                if (!ok || data?.error) {
                    throw new Error(data?.error || "Failed to prefetch drill");
                }
                if (!abortPrefetchRef.current?.signal.aborted) {
                    console.log("[Prefetch] Background prefetch completed and stored!");
                    setPrefetchedDrillData({ ...data, mode, sourceMode: activeDrillSourceMode });
                    if ((isListeningMode || isRebuildMode) && typeof data?.reference_english === "string" && data.reference_english.trim()) {
                        ensureAudioCached(data.reference_english).catch((error) => {
                            console.error("[Prefetch] Audio prewarm failed:", error);
                        });
                    }
                }
            }).catch(err => {
                if (err.name !== 'AbortError') console.error("[Prefetch] Error:", err);
            });
    };

    // --- Core Actions ---

    const handleGenerateDrill = async (targetDifficulty = difficulty, overrideBossType?: string, skipPrefetched = false, forcedElo?: number) => {
        if (showGacha) return;
        hasRecordedDailyDrillRef.current = false;
        // Abort any pending generation or prefetch requests
        if (abortControllerRef.current) abortControllerRef.current.abort();
        if (abortPrefetchRef.current) abortPrefetchRef.current.abort();
        clearRebuildChoicePrefetch();

        // If we have prefetched data ready AND it matches the current mode, consume it instantly
        if (
            prefetchedDrillData
            && prefetchedDrillData.mode === mode
            && prefetchedDrillData.sourceMode === activeDrillSourceMode
            && !overrideBossType
            && !skipPrefetched
        ) {
            console.log("[Prefetch] Consuming prefetched drill data! Zero ms latency.");
            consumeNextDrill(prefetchedDrillData);
            return; // Skip normal generation!
        }

        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        hasPlayedEchoRef.current = false; // Reset Echo Beast state
        setLightningStarted(false); // Reset Lightning countdown trigger

        setIsGeneratingDrill(true);
        setDrillData(null);
        resetGuidedLearningState(false);
        setDrillFeedback(null);
        setRebuildFeedback(null);
        setActivePassageSegmentIndex(0);
        setRebuildPassageDrafts([]);
        setRebuildPassageResults([]);
        setRebuildPassageUiState([]);
        setRebuildTypingBuffer("");
        setRebuildPassageScores([]);
        setRebuildPassageSummary(null);
        resetRebuildShadowingState();
        setUserTranslation("");
        setFullReferenceHint((prev) => ({ version: prev.version + 1, text: "" }));
        setTutorAnswer(null);
        setTutorThread([]);
        setTutorResponse(null);
        setTutorPendingQuestion(null);
        setTutorQuery("");
        setTutorThinkingMode("chat");
        setIsTutorOpen(false);
        setRebuildTutorSession(null);
        setWordPopup(null);
        setIsPlaying(false);
        setHasRatedDrill(false);
        setAnalysisRequested(false);
        setIsGeneratingAnalysis(false);
        setAnalysisError(null);
        setAnalysisDetailsOpen(false);
        setFullAnalysisRequested(false);
        setIsGeneratingFullAnalysis(false);
        setFullAnalysisError(null);
        setFullAnalysisOpen(false);
        setFullAnalysisData(null);
        setIsGeneratingGrammar(false);
        setGrammarError(null);
        setReferenceGrammarAnalysis(null);
        setReferenceGrammarDisplayMode("core");
        setEloChange(null);
        setIsHintLoading(false);
        setIsVocabHintRevealed(false);
        setIsTranslationAudioUnlocked(false);
        setBlindVisibleUnlockConsumed(false);
        if (isDictationMode) {
            setIsBlindMode(true);
            setShowChinese(false);
        }
        vocabHintRevealRef.current = false;
        translationAudioUnlockRef.current = false;
        resetResult(); // Clear previous recording transcript
        if (audioRef.current) audioRef.current.pause();

        // --- PRE-CALCULATE BOSS/GAMBLE EVENTS ---
        let nextBossType: 'blind' | 'lightning' | 'echo' | 'reaper' | undefined = undefined;
        let nextTheme = theme;
        let pendingBossState: any = null;
        let pendingGambleState: any = null;

        // ALL Special Events (Boss, Gamble, Roulette) are EXCLUSIVELY for Listening Mode
        if (isListeningFamilyMode) {
            nextBossType = overrideBossType as any || (bossState.active ? bossState.type : undefined);

            if (!bossState.active && !gambleState.active && !overrideBossType) {
                const roll = Math.random();
                // 2% Chance for Boss (Listening Only)
                if (roll < 0.02) {
                    const bossRoll = Math.random();
                    let type: 'blind' | 'lightning' | 'echo' | 'reaper' = 'blind';

                    // Listening Weights: Blind (35%), Echo (30%), Lightning (20%), Reaper (15%)
                    if (bossRoll < 0.35) type = 'blind';
                    else if (bossRoll < 0.65) type = 'echo';
                    else if (bossRoll < 0.85) type = 'lightning';
                    else type = 'reaper';

                    nextBossType = type;
                    nextTheme = 'boss';
                    pendingBossState = {
                        active: true,
                        introAck: false,
                        type,
                        hp: type === 'reaper' ? 3 : undefined,
                        maxHp: type === 'reaper' ? 3 : undefined,
                        playerHp: type === 'reaper' ? 3 : undefined, // Player starts with 3 HP
                        playerMaxHp: type === 'reaper' ? 3 : undefined
                    };
                }
                // 5% Chance for Gamble (Listening Mode Only)
                else if (roll < 0.07) {
                    nextTheme = 'crimson';
                    pendingGambleState = { active: true, introAck: false, wager: null, doubleDownCount: 0 };
                }
            }

            // FORCE OVERRIDE STATE (DEBUG / ROULETTE)
            if (overrideBossType) {
                nextTheme = 'boss';
                nextBossType = overrideBossType as any;
                pendingBossState = {
                    active: true,
                    introAck: overrideBossType.includes('roulette'), // Skip standard intro for roulette
                    type: overrideBossType as any,
                    hp: undefined, // Standard unless reaper
                    maxHp: undefined,
                    playerHp: undefined,
                    playerMaxHp: undefined
                };
            }
        }

        // IMMEDIATELY apply Boss/Gamble state BEFORE API call (eliminates flicker)
        if (pendingBossState) {
            setBossState(pendingBossState);
            setTheme('boss');
            setPlaybackSpeed(pendingBossState.type === 'lightning' ? 1.5 : 1.0);
        }
        if (pendingGambleState) {
            setGambleState(pendingGambleState);
            setTheme('crimson');
        }

        try {
            const effectiveElo = Math.max(0, forcedElo ?? currentElo);
            const effectiveDifficulty = getEloDifficulty(effectiveElo, mode);
            console.log(`[DEBUG] Sending to API: bossType=${nextBossType}, eloRating=${effectiveElo}`);
            // --- DETERMINE TOPIC ---
            const targetTopic = resolveBattleScenarioTopic(context.articleTitle || context.topic, effectiveElo);

            // --- RANDOM SURPRISE DROP ---
            if (currentStreak > 0 && Math.random() < 0.05) { // 5% chance on new drill load (only if they aren't totally failing)
                setTimeout(() => {
                    const isCapsule = Math.random() < 0.2;
                    if (isCapsule) {
                        applyEconomyPatch({ itemDelta: { capsule: 1 } });
                        setLootDrop({ type: 'gem', amount: 1, rarity: 'rare', message: '🎁 天降幸运！获得灵感胶囊！' });
                    } else {
                        const randomCoins = Math.floor(Math.random() * 20) + 5;
                        applyEconomyPatch({ coinsDelta: randomCoins });
                        pushEconomyFx({ kind: 'coin_gain', amount: randomCoins, message: `+${randomCoins} 星光币`, source: 'reward' });
                    }
                }, 1000); // 1 second after generation starts
            }

            const response = await fetch("/api/drill/next", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    articleTitle: targetTopic,
                    articleContent: context.articleContent || "",
                    difficulty: effectiveDifficulty.level,
                    eloRating: effectiveElo,
                    mode: generationMode,
                    sourceMode: activeDrillSourceMode,
                    excludeBankIds: activeDrillSourceMode === "bank" ? listeningBankExcludeIds : undefined,
                    rebuildVariant: isRebuildMode ? rebuildVariant : undefined,
                    segmentCount: isRebuildPassage ? rebuildSegmentCount : undefined,
                    bossType: nextBossType, // Inject Boss Context for Custom Scenarios
                    _t: Date.now() // Cache buster to prevent repeated drills
                }),
                signal, // Pass abort signal
            });

            // Check if aborted before processing response
            if (signal.aborted) return;

            const data = await response.json();

            // Check again after JSON parsing
            if (signal.aborted) return;

            if (!response.ok || data?.error) {
                throw new Error(data?.error || "Failed to generate drill");
            }

            setDrillData(
                data?._rebuildMeta?.variant === "passage"
                    ? hydratePassageSegmentDrill(data, data._rebuildMeta?.passageSession?.currentIndex ?? 0)
                    : data,
            );

            // Fetch teaching content if teaching mode is ON and in translation mode
            if (teachingMode && mode === 'translation' && data.chinese && data.reference_english) {
                setTeachingPanelOpen(false);
                setTeachingData(null);
                setIsLoadingTeaching(true);
                try {
                    const teachRes = await fetch('/api/ai/teach', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chinese: data.chinese,
                            reference_english: data.reference_english,
                            elo: effectiveElo,
                        }),
                    });
                    if (!signal.aborted) {
                        const teachContent = await teachRes.json();
                        if (!signal.aborted && !teachContent.error) {
                            setTeachingData(teachContent);
                            setTeachingPanelOpen(true); // Auto-open panel when data loads
                        }
                    }
                } catch (err) {
                    console.error('[Teaching] Failed to fetch teaching data:', err);
                } finally {
                    if (!signal.aborted) setIsLoadingTeaching(false);
                }
            } else {
                setTeachingData(null);
                setTeachingPanelOpen(false);
                setIsLoadingTeaching(false);
            }

            // Boss/Gamble states already applied BEFORE API call (no flicker)
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                console.log('[Drill] Request aborted - switching to new question');
                return; // Silently exit on abort
            }
            console.error(error);
        } finally {
            if (!signal.aborted) {
                setIsGeneratingDrill(false);
            }
        }
    };

    const handleStartGuidedLearning = useCallback(() => {
        if (mode !== "translation" || !drillData?.chinese || !drillData.reference_english) return;

        const localGuidedScript = buildFallbackGuidedScript({
            chinese: drillData.chinese,
            referenceEnglish: drillData.reference_english,
        });

        setLearningSession(true);
        setGuidedModeStatus("active");
        setGuidedScript(localGuidedScript);
        setGuidedCurrentStepIndex(0);
        guidedCurrentStepIndexRef.current = 0;
        setGuidedCurrentAttemptCount(0);
        setGuidedChoicesVisible(false);
        setGuidedRevealReady(false);
        setGuidedFilledFragments({});
        guidedFilledFragmentsRef.current = {};
        setGuidedLastFeedback(null);
        setGuidedInnerMode("teacher_guided");
        setGuidedClozeState(null);
        setGuidedInput("");
        setTeachingPanelOpen(false);
        setIsTutorOpen(false);
        setGuidedAiHint(null);
        applyGuidedSessionSnapshot(createGuidedSessionState(localGuidedScript));
    }, [
        applyGuidedSessionSnapshot,
        buildFallbackGuidedScript,
        drillData,
        mode,
    ]);

    const handleRequestGuidedAiHint = useCallback(async () => {
        if (!guidedScript || !drillData) return;

        const slot = guidedInnerMode === "gestalt_cloze"
            ? guidedScript.slots.find((item) => item.id === guidedClozeState?.blankSlotIds[guidedClozeState.currentBlankIndex])
            : guidedScript.slots[guidedCurrentStepIndex];
        if (!slot) return;

        const slotIndex = guidedScript.slots.findIndex((item) => item.id === slot.id);
        const filledMap = guidedInnerMode === "gestalt_cloze"
            ? (guidedClozeState?.filledFragments ?? {})
            : guidedFilledFragments;

        let leftContext = "";
        let rightContext = "";

        for (let index = slotIndex - 1; index >= 0; index -= 1) {
            const visible = filledMap[guidedScript.slots[index]?.id ?? ""];
            if (visible) {
                leftContext = visible;
                break;
            }
        }

        for (let index = slotIndex + 1; index < guidedScript.slots.length; index += 1) {
            const visible = filledMap[guidedScript.slots[index]?.id ?? ""];
            if (visible) {
                rightContext = visible;
                break;
            }
        }

        const localHint = guidedInnerMode === "gestalt_cloze"
            ? buildGuidedClozeHint(guidedScript, guidedClozeState ?? createGuidedClozeState(guidedScript))?.primary ?? ""
            : buildGuidedHintLines(guidedScript, getGuidedSessionSnapshot())?.primary ?? "";
        const attempt = guidedInnerMode === "gestalt_cloze"
            ? Math.max(guidedClozeState?.currentAttemptCount ?? 0, guidedClozeState?.revealReady ? 3 : 0)
            : Math.max(guidedCurrentAttemptCount, (guidedChoicesVisible || guidedRevealReady) ? 3 : 0);
        const guidedKey = getGuidedScriptKey(
            drillData,
            eloRatingRef.current || DEFAULT_BASE_ELO,
            context.articleTitle || context.topic,
        );
        const requestCount = guidedAiHintRequestCountRef.current + 1;
        guidedAiHintRequestCountRef.current = requestCount;

        const controller = new AbortController();
        guidedHintAbortRef.current?.abort();
        guidedHintAbortRef.current = controller;
        setIsGuidedAiHintLoading(true);

        try {
            const hint = await loadGuidedHint({
                guidedKey,
                slot,
                attempt,
                innerMode: guidedInnerMode,
                leftContext,
                rightContext,
                localHint,
                manualRequest: true,
                requestCount,
                signal: controller.signal,
            });
            if (!controller.signal.aborted) {
                setGuidedAiHint(hint);
            }
        } catch (error) {
            if ((error as Error).name !== "AbortError") {
                console.error("[GuidedLearning] Manual AI hint failed", error);
                if (!controller.signal.aborted) {
                    setGuidedAiHint({
                        primary: "AI 老师这次没接上，你可以再点一次，我会重新换一种更具体的讲法。",
                        secondary: null,
                        rescue: null,
                    });
                }
            }
        } finally {
            if (!controller.signal.aborted) {
                setIsGuidedAiHintLoading(false);
            }
        }
    }, [
        context.articleTitle,
        context.topic,
        drillData,
        getGuidedSessionSnapshot,
        guidedChoicesVisible,
        guidedClozeState,
        guidedCurrentAttemptCount,
        guidedCurrentStepIndex,
        guidedFilledFragments,
        guidedInnerMode,
        guidedRevealReady,
        guidedScript,
        loadGuidedHint,
    ]);

    const handleSubmitGuidedInput = useCallback((inputOverride?: string) => {
        if (!guidedScript) return;
        if (guidedInnerMode === "gestalt_cloze") {
            if (!guidedClozeState) return;
            const nextClozeState = submitGuidedClozeInput(
                guidedClozeState,
                guidedScript,
                inputOverride ?? guidedInput,
            );
            setGuidedClozeState(nextClozeState);
            setGuidedInput("");
            if (nextClozeState.currentBlankIndex >= nextClozeState.blankSlotIds.length) {
                setGuidedModeStatus("complete");
            }
            return;
        }

        const nextState = submitGuidedStepInput(
            getGuidedSessionSnapshot(),
            guidedScript,
            inputOverride ?? guidedInput,
        );
        applyGuidedSessionSnapshot(nextState);
        setGuidedInput("");
    }, [applyGuidedSessionSnapshot, getGuidedSessionSnapshot, guidedClozeState, guidedCurrentStepIndex, guidedInnerMode, guidedInput, guidedScript]);

    const handleGuidedInputChange = useCallback((value: string) => {
        setGuidedInput(value);

        if (!guidedScript) return;

        if (guidedInnerMode === "gestalt_cloze") {
            const currentBlankSlotId = guidedClozeState?.blankSlotIds[guidedClozeState.currentBlankIndex];
            const currentBlankSlot = guidedScript.slots.find((slot) => slot.id === currentBlankSlotId);
            if (!currentBlankSlot) return;

            if (isGuidedAnswerCorrect({
                ...guidedScript,
                slots: [currentBlankSlot],
            } as GuidedScript, 0, value)) {
                const nextClozeState = submitGuidedClozeInput(guidedClozeState!, guidedScript, value);
                setGuidedClozeState(nextClozeState);
                setGuidedInput("");
                if (nextClozeState.currentBlankIndex >= nextClozeState.blankSlotIds.length) {
                    setGuidedModeStatus("complete");
                }
            }
            return;
        }

        if (isGuidedAnswerCorrect(guidedScript, guidedCurrentStepIndex, value)) {
            const nextState = submitGuidedStepInput(
                getGuidedSessionSnapshot(),
                guidedScript,
                value,
            );
            applyGuidedSessionSnapshot(nextState);
            setGuidedInput("");
            return;
        }
    }, [
        applyGuidedSessionSnapshot,
        guidedClozeState,
        getGuidedSessionSnapshot,
        guidedCurrentStepIndex,
        guidedInnerMode,
        guidedScript,
    ]);

    const handleReturnToBattleFromGuided = useCallback(() => {
        if (guidedScript) {
            setUserTranslation(guidedScript.summary.final_sentence);
        }
        resetGuidedLearningState(true);
    }, [guidedScript, resetGuidedLearningState]);

    const handleCloseGuidedLearning = useCallback(() => {
        resetGuidedLearningState(false);
        onClose?.();
    }, [onClose, resetGuidedLearningState]);

    const handleShowGuidedChoices = useCallback(() => {
        if (guidedInnerMode !== "teacher_guided") return;
        const currentSlot = guidedScript?.slots[guidedCurrentStepIndex];
        if (!currentSlot?.multiple_choice?.length) return;
        setGuidedChoicesVisible(true);
        setGuidedRevealReady(true);
        setGuidedLastFeedback(null);
        setGuidedAiHint(null);
    }, [guidedCurrentStepIndex, guidedInnerMode, guidedScript]);

    const handleSelectGuidedChoice = useCallback((choiceText: string) => {
        if (!guidedScript) return;
        const nextState = submitGuidedChoiceSelection(
            getGuidedSessionSnapshot(),
            guidedScript,
            choiceText,
        );
        applyGuidedSessionSnapshot(nextState);
        setGuidedInput("");
    }, [applyGuidedSessionSnapshot, getGuidedSessionSnapshot, guidedCurrentStepIndex, guidedScript]);

    const handleRevealGuidedAnswer = useCallback(() => {
        if (!guidedScript) return;

        if (guidedInnerMode === "gestalt_cloze") {
            if (!guidedClozeState) return;
            const nextClozeState = revealGuidedClozeCurrentSlot(guidedClozeState, guidedScript);
            setGuidedClozeState(nextClozeState);
            setGuidedInput("");
            if (nextClozeState.currentBlankIndex >= nextClozeState.blankSlotIds.length) {
                setGuidedModeStatus("complete");
            }
            return;
        }

        const nextState = revealGuidedCurrentSlot(getGuidedSessionSnapshot(), guidedScript);
        applyGuidedSessionSnapshot(nextState);
        setGuidedInput("");
    }, [applyGuidedSessionSnapshot, getGuidedSessionSnapshot, guidedClozeState, guidedInnerMode, guidedScript]);

    const handleActivateGuidedRandomFill = useCallback(() => {
        if (!guidedScript) return;
        setGuidedInnerMode("gestalt_cloze");
        setGuidedClozeState(createGuidedClozeState(guidedScript));
        setGuidedInput("");
        setGuidedLastFeedback(null);
        setGuidedAiHint(null);
        setGuidedChoicesVisible(false);
        setGuidedRevealReady(false);
    }, [guidedScript]);

    const handleReturnToTeacherGuided = useCallback(() => {
        setGuidedInnerMode("teacher_guided");
        setGuidedInput("");
        setGuidedChoicesVisible(false);
        setGuidedRevealReady(false);
        setGuidedLastFeedback(null);
        setGuidedAiHint(null);
    }, []);

    const handleRefreshGuidedCloze = useCallback(() => {
        if (!guidedScript) return;
        setGuidedInnerMode("gestalt_cloze");
        setGuidedClozeState(createGuidedClozeState(guidedScript));
        setGuidedInput("");
        setGuidedAiHint(null);
        setGuidedRevealReady(false);
    }, [guidedScript]);

    const handleSubmitDrill = async (submittedTranslation?: string) => {
        if (showGacha) return;
        const translationToScore = (submittedTranslation ?? userTranslation).trim();
        if (!drillData) return;
        if (isRebuildMode) {
            handleSubmitRebuild(false);
            return;
        }
        if (!isListeningMode && !translationToScore) return;
        if (isListeningMode && !wavBlob) {
            setDrillFeedback({
                score: -1,
                judge_reasoning: "还没有可评分的录音，请先完整跟读一遍。",
                feedback: {
                    listening_tips: ["先录一遍完整音频，再提交发音评分。"],
                    encouragement: "录音成功后会自动显示跟读评分。",
                },
                summary_cn: "还没有可评分的录音，请先完整跟读一遍。",
                tips_cn: ["先录一遍完整音频，再提交发音评分。"],
                word_results: [],
                _error: true,
            });
            return;
        }
        if (isListeningMode) {
            setDrillFeedback({
                score: -1,
                judge_reasoning: "Shadowing battle 已下线，本地发音评分链也已移除。",
                feedback: {
                    listening_tips: ["改用 Rebuild 或 Dictation 继续训练。"],
                    encouragement: "当前版本不再提供 battle Shadowing 发音评分。",
                },
                summary_cn: "Shadowing battle 已下线，本地发音评分链也已移除。",
                tips_cn: ["改用 Rebuild 或 Dictation 继续训练。"],
                word_results: [],
                _error: true,
            });
            return;
        }
        if (shouldBypassBattleRewards({ learningSession: learningSessionActive, guidedModeStatus })) {
            return;
        }
        setIsSubmittingDrill(true);
        let prefetchNextElo: number | null = null;

        try {
            // Use correct Elo based on mode
            const activeElo = isDictationMode ? dictationElo : eloRating;
            const scoreMode: "translation" | "dictation" = isDictationMode
                ? "dictation"
                : "translation";
            const scoringInputSource = isListeningFamilyMode && !isDictationMode ? "voice" : "keyboard";
            const response = await fetch("/api/ai/score_translation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: translationToScore,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    current_elo: activeElo || DEFAULT_BASE_ELO,
                    mode: scoreMode,
                    input_source: scoringInputSource,
                    teaching_mode: teachingMode,
                }),
            });
            const data = await response.json();

            // Guard: If API returned an error (no score), show error feedback
            if (!response.ok || data.error || data.score === undefined || data.score === null) {
                console.error("[DrillCore] Scoring API failed:", data.error || data.details || "No score returned");
                setDrillFeedback({
                    score: -1,
                    judge_reasoning: isListeningMode
                        ? (data.details || "本地发音评分暂时不可用，请重试。")
                        : "评分服务暂时不可用，请重试。",
                    feedback: isListeningMode
                        ? {
                            listening_tips: [data.details || "本地发音评分暂时不可用，请重试。"],
                            encouragement: "录音会保留，调整后可以重新提交。",
                        }
                        : ["AI 评分接口超时或出错，请再试一次。"],
                    summary_cn: isListeningMode ? (data.details || "本地发音评分暂时不可用，请重试。") : undefined,
                    tips_cn: isListeningMode ? [data.details || "本地发音评分暂时不可用，请重试。"] : undefined,
                    improved_version: "",
                    word_results: [],
                    _error: true,
                });
                setIsSubmittingDrill(false);
                return;
            }

            if (isListeningMode) {
                setDrillFeedback(data);
                setAnalysisRequested(true);
                setAnalysisDetailsOpen(true);
            } else if (isDictationMode) {
                const normalizedDictationFeedback: DrillFeedback = {
                    ...data,
                    feedback: data.feedback ?? {
                        dictation_tips: [
                            data.judge_reasoning || "先写主干意思，再补细节。",
                            "建议先听完整句，再回放核对关键词。",
                        ],
                        encouragement: "听写已提交，继续保持。",
                    },
                };
                setDrillFeedback(normalizedDictationFeedback);
            } else {
                setDrillFeedback(data);
            }
            setAnalysisError(null);
            setFullAnalysisRequested(false);
            setIsGeneratingFullAnalysis(false);
            setFullAnalysisError(null);
            setFullAnalysisOpen(false);
            setFullAnalysisData(null);
            setIsGeneratingGrammar(false);
            setGrammarError(null);
            setReferenceGrammarAnalysis(null);
            setReferenceGrammarDisplayMode("core");

            if (!isListeningMode) {
                setAnalysisRequested(false);
                setAnalysisDetailsOpen(false);
            }

            if (data.score !== undefined) {
                if (hasRatedDrill) {
                    setEloChange(0);
                    return;
                }
                setHasRatedDrill(true);
                recordCompletedDrill();

                // --- Elo Calculation with Mode Separation ---
                const isListening = mode === 'listening';
                const isDictation = mode === 'dictation';
                const activeElo = isDictation ? dictationElo : isListening ? listeningElo : eloRating;
                const activeStreak = isDictation ? dictationStreak : isListening ? listeningStreak : streakCount;

                // --- Advanced Elo Logic (UIUXProMax) ---
                const calculateAdvancedElo = (playerElo: number, difficultyElo: number, actualScore: number, streak: number) => {
                    if (isListening) {
                        return calculateListeningElo(playerElo, difficultyElo, actualScore, streak);
                    }

                    const expectedScore = 1 / (1 + Math.pow(10, (difficultyElo - playerElo) / 400));
                    const normalizedScore = Math.max(0, Math.min(1, (actualScore - 3) / 7));

                    let kFactor = 40;
                    const isStreak = streak >= 2;
                    let effectiveK = isStreak ? kFactor * 1.25 : kFactor;

                    // --- Smurf Bonus (Fast Track) ---
                    // If a high-Elo player is doing a low-Elo question (expectedScore is high, e.g., 0.8+),
                    // the standard Elo math gives them almost nothing even for a perfect score.
                    // We add a "smurf multiplier" if they actually achieve that near-perfect score (9 or 10).
                    let smurfMultiplier = 1;
                    if (actualScore >= 9 && expectedScore > 0.6) {
                        // The easier the question (higher expectedScore), the higher the multiplier needed to make the tiny gap meaningful.
                        // Max multiplier of 3.5x for perfect scores on absolute easiest questions.
                        smurfMultiplier = 1 + ((expectedScore - 0.6) * 6);
                        effectiveK *= smurfMultiplier;
                    }

                    const rawChange = effectiveK * (normalizedScore - expectedScore);
                    let totalChange = Math.round(rawChange);

                    // --- Floor Guarantee for Perfect Plays ---
                    // Guarantee at least +10 for a perfect 10/10, and +5 for a 9/10, regardless of Elo math,
                    // to ensure the user always feels appropriately rewarded for near-flawless execution.
                    if (actualScore >= 9.5 && totalChange < 10) {
                        totalChange = 10;
                    } else if (actualScore >= 9.0 && actualScore < 9.5 && totalChange < 5) {
                        totalChange = 5;
                    }

                    return {
                        total: totalChange,
                        breakdown: {
                            difficultyElo,
                            expectedScore,
                            actualScore: normalizedScore,
                            kFactor,
                            streakBonus: isStreak,
                            smurfMultiplier: parseFloat(smurfMultiplier.toFixed(2)),
                            baseChange: Math.round(kFactor * (normalizedScore - expectedScore)),
                            bonusChange: totalChange - Math.round(kFactor * (normalizedScore - expectedScore))
                        }
                    };
                };

                const challengeElo = drillData?._difficultyMeta?.requestedElo ?? activeElo ?? DEFAULT_BASE_ELO;
                const result = calculateAdvancedElo(activeElo || DEFAULT_BASE_ELO, challengeElo, data.score, activeStreak);
                let change = result.total;
                let newStreak = activeStreak;

                // --- GAMBLING LOGIC (Crimson Roulette) ---
                // --- GAMBLING LOGIC (Crimson Roulette) ---
                if (gambleState.active && gambleState.wager && gambleState.wager !== 'safe') {
                    const isWin = data.score >= 9.0;

                    if (isWin) {
                        // Calculate Winnings
                        let baseWin = gambleState.wager === 'risky' ? 60 : 150;
                        let multiplier = Math.pow(2.5, gambleState.doubleDownCount); // 2.5x multiplier for every double down!
                        change = Math.round(baseWin * multiplier);

                        // Loot & Sound
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-201.mp3').play().catch(() => { });
                        setLootDrop({ type: 'gem', amount: change, rarity: 'legendary', message: `CRIMSON JACKPOT! x${multiplier}` });

                        // Trigger Double Down if eligible (Max 2 times)
                        if (gambleState.doubleDownCount < 2) {
                            // Delay showing the modal slightly so they see the score first
                            setTimeout(() => setShowDoubleDown(true), 1500);
                        } else {
                            // Max depth reached, reset
                            setTimeout(() => {
                                setGambleState({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
                                setTheme('default');
                            }, 3000);
                        }
                    } else {
                        // Loss Logic
                        let baseLoss = gambleState.wager === 'risky' ? -20 : -50;
                        change = baseLoss * Math.pow(2, gambleState.doubleDownCount);
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });

                        // Reset Deferred to BossScoreReveal Interaction
                        // setGambleState({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
                        // setTheme('default');
                        newStreak = 0;
                    }
                }

                // REAPER BOSS LOGIC
                else if (bossState.active && bossState.type === 'reaper') {
                    // Suppress standard Elo change during the duel
                    change = 0;

                    if (data.score >= 9.0) {
                        // Hit the Boss!
                        const newHp = (bossState.hp || 3) - 1;
                        setBossState(prev => ({ ...prev, hp: newHp }));

                        if (newHp <= 0) {
                            // VICTORY!
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-201.mp3').play().catch(() => { });
                            setLootDrop({ type: 'gem', amount: 50, rarity: 'legendary', message: 'REAPER DEFEATED!' });

                            // HUGE REWARD
                            change = 50;

                            setBossState(prev => ({ ...prev, active: false }));
                            setTheme('default');
                        } else {
                            // Boss damaged
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-dagger-woosh-1487.mp3').play().catch(() => { });
                            setLootDrop({ type: 'exp', amount: 0, rarity: 'rare', message: 'BOSS HIT! Keep going!' });
                        }
                    } else {
                        // PLAYER TAKES DAMAGE
                        const newPlayerHp = (bossState.playerHp || 3) - 1;
                        setBossState(prev => ({ ...prev, playerHp: newPlayerHp }));

                        if (newPlayerHp <= 0) {
                            // --- DEATH EXECUTION ---
                            setDeathAnim('slash');
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-sword-slash-swoosh-1476.mp3').play().catch(() => { });

                            // Delay reset to show animation
                            setTimeout(() => {
                                setBossState(prev => ({ ...prev, active: false }));
                                setTheme('default');
                                newStreak = 0;
                                setDeathAnim(null);
                            }, 3000);

                            // PUNISHMENT
                            change = -50;
                        } else {
                            // Warning Hit
                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
                            setShake(true);
                        }
                    }
                }

                // --- POST-ROULETTE SETTLEMENT ---
                if (rouletteSession) {
                    if (rouletteSession.result === 'safe') {
                        // SURVIVOR: Symmetrical Multiplier
                        change = Math.round(change * rouletteSession.multiplier);
                        if (data.score >= 9.0) {
                            setLootDrop({ type: 'gem', amount: change, rarity: 'legendary', message: `🎰 SURVIVOR JACKPOT x${rouletteSession.multiplier}!` });
                        } else {
                            // Loss also multiplied
                            setLootDrop({ type: 'exp', amount: change, rarity: 'common', message: `🎰 GAMBLE FAILED! x${rouletteSession.multiplier} LOSS` });
                        }
                    } else if (rouletteSession.result === 'dead') {
                        // EXECUTION: Redemption or Double Death
                        if (data.score >= 9.0) {
                            change = 25; // Redemption Reward
                            setLootDrop({ type: 'gem', amount: 25, rarity: 'rare', message: '⚖️ REDEMPTION GRANTED!' });
                        } else {
                            change = -50;
                            setLootDrop({ type: 'exp', amount: -50, rarity: 'common', message: '💀 TOTAL ANNIHILATION!' });
                        }
                    }
                    setRouletteSession(null);
                }

                setEloBreakdown(result.breakdown);

                const streakThreshold = isListening ? 8.8 : 9.0;
                if (data.score >= streakThreshold) {
                    newStreak += 1;
                    if (!isListening && newStreak >= 3) change += 2;

                    // Fever Logic
                    const newCombo = comboCount + 1;
                    setComboCount(newCombo);
                    if (newCombo >= 3 && !feverMode && isListeningFamilyMode) {
                        setFeverMode(true);
                        setTheme('fever');
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-futuristic-robotic-blip-hit-695.mp3').play().catch(() => { });
                    }

                    // Loot Logic - DISABLED per user request
                    // (Only Boss/Gamble/Damage events trigger notifications now)
                } else {
                    newStreak = 0;
                    setComboCount(0);
                    if (feverMode) {
                        setFeverMode(false);
                        setTheme('default');
                        // Fever Break Sound
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-game-over-dark-orchestra-633.mp3').play().catch(() => { });
                    }
                }

                // === Elo Update Logic (ALWAYS EXECUTED) ===
                const newElo = Math.max(0, (activeElo || DEFAULT_BASE_ELO) + change);
                prefetchNextElo = newElo;

                // Rank Change Detection
                const oldRank = getRank(activeElo || DEFAULT_BASE_ELO);
                const newRank = getRank(newElo);
                if (newRank.title !== oldRank.title && change > 0) {
                    // Rank UP!
                    setRankUp({ oldRank: oldRank, newRank: newRank });
                    new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3').play().catch(() => { });
                } else if (newRank.title !== oldRank.title && change < 0) {
                    // Rank DOWN!
                    setRankDown({ oldRank: oldRank, newRank: newRank });
                    new Audio('https://assets.mixkit.co/sfx/preview/mixkit-glass-breaking-1551.mp3').play().catch(() => { });
                }

                // Update Local State
                if (isListening) {
                    setListeningElo(newElo);
                    setListeningStreak(newStreak);
                } else if (isDictation) {
                    setDictationElo(newElo);
                    setDictationStreak(newStreak);
                } else {
                    setEloRating(newElo);
                    setStreakCount(newStreak);
                }
                setEloChange(change);

                // --- Hint Economy Coin Accumulation ---
                let earnedCoins = 0;

                // Base salary based on score
                if (data.score < 6) earnedCoins += 2;
                else if (data.score <= 8) earnedCoins += 5;
                else earnedCoins += 10;

                // Streak bonuses
                if (newStreak >= 10) earnedCoins += 20;
                else if (newStreak >= 5) earnedCoins += 10;
                else if (newStreak >= 3) earnedCoins += 5;

                // Critical Hit (10% chance to 5x base reward)
                let isCritical = false;
                if (Math.random() < 0.1) {
                    earnedCoins *= 5;
                    isCritical = true;
                    // Critical hit sound
                    new Audio('https://assets.mixkit.co/sfx/preview/mixkit-coins-handling-735.mp3').play().catch(() => { });
                }

                // Total update
                let finalCoins = coinsRef.current + earnedCoins;

                // --- HIDDEN BOUNTIES ---
                let bountyCoins = 0;
                let bountyMessage = "";
                let bountyRarity: 'rare' | 'legendary' = 'rare';

                // 1. "破壁者" (Wallbreaker): Beat a significantly higher difficulty (expected score <= 0.3, actual >= 9.0)
                if (result.breakdown.expectedScore <= 0.3 && data.score >= 9.0) {
                    bountyCoins = 88;
                    bountyMessage = "🏆 破壁者！越级挑战无伤通关！+88 ✨";
                    bountyRarity = 'legendary';
                }
                // 2. "涅槃重生" (Phoenix): Recovering from two low scores (<6) with a perfect >9 score
                else if (recentScores.length >= 2 && recentScores[recentScores.length - 1] < 6 && recentScores[recentScores.length - 2] < 6 && data.score >= 9.0) {
                    bountyCoins = 100;
                    bountyMessage = "🔥 涅槃重生！触底绝地反击！+100 ✨";
                    bountyRarity = 'legendary';
                }
                // 3. "词汇刺客" (Vocabulary Assassin): Using advanced vocabulary perfectly (Perfect 10 with 20% flat chance)
                else if (data.score === 10 && Math.random() < 0.2) {
                    bountyCoins = 50;
                    bountyMessage = "🥷 词汇刺客！母语级精准表达！+50 ✨";
                    bountyRarity = 'legendary';
                }

                if (bountyCoins > 0) {
                    earnedCoins += bountyCoins;
                    finalCoins += bountyCoins;
                    setLootDrop({ type: 'gem', amount: bountyCoins, rarity: bountyRarity, message: bountyMessage });
                    new Audio('https://assets.mixkit.co/sfx/preview/mixkit-ethereal-fairy-win-sound-2019.mp3').play().catch(() => { });
                }

                // Show LootDrop for regular Coins (if no bounty and no boss loot)
                const hasExistingLoot = bossState.type === 'reaper' && bossState.hp === 1 && data.score >= 9.0;

                // --- GACHA TRIGGER ---
                let gachaTriggered = false;
                const gachaMode: "translation" | "listening" = isListeningMode ? "listening" : "translation";
                if (!hasExistingLoot && shouldTriggerGacha({
                    mode: gachaMode,
                    score: data.score,
                    learningSession: learningSessionActive,
                    roll: Math.random(),
                })) {
                    gachaTriggered = true;
                    setTimeout(() => {
                        setGachaCards(buildGachaPack());
                        setSelectedGachaCardId(null);
                        setGachaClaimTarget(null);
                        setShowGacha(true);
                        // Intro Sound
                        new Audio('https://assets.mixkit.co/sfx/preview/mixkit-ethereal-fairy-win-sound-2019.mp3').play().catch(() => { });
                    }, bountyCoins > 0 ? 2500 : 1000); // delay so they see score first
                }

                if (!hasExistingLoot && !gachaTriggered && earnedCoins > 0 && bountyCoins === 0) {
                    if (isCritical) {
                        setLootDrop({ type: 'gem', amount: earnedCoins, rarity: 'legendary', message: '✨ 绝佳！打工薪水超级暴击！' });
                    } else {
                        pushEconomyFx({ kind: 'coin_gain', amount: earnedCoins, message: `+${earnedCoins} 星光币`, source: 'reward' });
                    }
                }

                finalCoins = applyEconomyPatch({
                    coinsDelta: earnedCoins,
                }).coins;
                // Update recent scores array (keep last 5)
                setRecentScores(prev => [...prev.slice(-4), data.score]);

                const profile = await loadLocalProfile();
                if (profile) {
                    if (isDictation) {
                        await persistDictationBattle({
                            eloAfter: newElo,
                            change,
                            streak: newStreak,
                            coins: finalCoins,
                            inventory: inventoryRef.current,
                            ownedThemes: ownedThemes,
                            activeTheme: cosmeticTheme,
                            source: learningSessionActive ? 'guided_session' : 'battle',
                        });
                    } else {
                        const maxElo = isListening
                            ? Math.max(profile.listening_max_elo || DEFAULT_BASE_ELO, newElo)
                            : Math.max(profile.max_elo, newElo);

                        await settleBattle({
                            mode: isListening ? 'listening' : 'translation',
                            eloAfter: newElo,
                            change,
                            streak: newStreak,
                            maxElo,
                            coins: finalCoins,
                            inventory: inventoryRef.current,
                            ownedThemes: ownedThemes,
                            activeTheme: cosmeticTheme,
                            source: learningSessionActive ? 'guided_session' : 'battle',
                        });
                    }
                }

                if (context.type === 'article' && mode === 'translation' && userTranslation.trim()) {
                    await saveWritingHistory({
                        articleTitle: drillData._topicMeta?.topic || context.articleTitle || context.topic || 'General',
                        content: userTranslation.trim(),
                        score: data.score,
                        timestamp: Date.now(),
                    });
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmittingDrill(false);

            // --- BACKGROUND PREFETCH LOGIC (Evaluation-time) ---
            // Only prefetch after a successful score produced a fresh Elo for the next question.
            if (drillData && (isListeningMode ? Boolean(wavBlob) : userTranslation.trim()) && prefetchNextElo !== null) {
                prefetchNextDrill(prefetchNextElo);
            }
        }
    };

    const handleGenerateAnalysis = async () => {
        if (!drillData || !drillFeedback || isGeneratingAnalysis) return;

        setAnalysisRequested(true);
        if (mode === "listening") {
            setAnalysisError(null);
            setAnalysisDetailsOpen(true);
            return;
        }
        setIsGeneratingAnalysis(true);
        setAnalysisError(null);
        setAnalysisDetailsOpen(false);
        setFullAnalysisRequested(false);
        setIsGeneratingFullAnalysis(false);
        setFullAnalysisError(null);
        setFullAnalysisOpen(false);
        setFullAnalysisData(null);

        try {
            const activeElo = isDictationMode ? dictationEloRef.current : isListeningMode ? listeningEloRef.current : eloRatingRef.current;
            const analysisMode: "translation" | "listening" | "dictation" = isDictationMode
                ? "dictation"
                : isListeningMode
                    ? "listening"
                    : "translation";
            const analysisResponse = await fetch("/api/ai/analyze_drill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: userTranslation,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    current_elo: activeElo || DEFAULT_BASE_ELO,
                    score: drillFeedback.score,
                    mode: analysisMode,
                    input_source: isListeningFamilyMode && !isDictationMode ? "voice" : "keyboard",
                    teaching_mode: teachingMode,
                    detail_level: "basic",
                }),
            });
            const data = await analysisResponse.json();

            if (!analysisResponse.ok || data.error) {
                throw new Error(data.error || "解析生成失败");
            }

            setDrillFeedback(prev => prev ? { ...prev, ...data } : prev);
        } catch (error) {
            const message = error instanceof Error ? error.message : "解析生成失败";
            setAnalysisError(message);
        } finally {
            setIsGeneratingAnalysis(false);
        }
    };

    const handleGenerateFullAnalysis = async () => {
        if (!drillData || !drillFeedback || mode !== "translation" || isGeneratingFullAnalysis) return;

        setFullAnalysisRequested(true);
        setIsGeneratingFullAnalysis(true);
        setFullAnalysisError(null);

        try {
            const activeElo = eloRatingRef.current;
            const analysisResponse = await fetch("/api/ai/analyze_drill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_translation: userTranslation,
                    reference_english: drillData.reference_english,
                    original_chinese: drillData.chinese,
                    current_elo: activeElo || DEFAULT_BASE_ELO,
                    score: drillFeedback.score,
                    mode,
                    teaching_mode: teachingMode,
                    detail_level: "full",
                }),
            });
            const data = await analysisResponse.json();

            if (!analysisResponse.ok || data.error) {
                throw new Error(data.error || "完整解析生成失败");
            }

            setFullAnalysisData(data);
            setFullAnalysisOpen(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : "完整解析生成失败";
            setFullAnalysisError(message);
        } finally {
            setIsGeneratingFullAnalysis(false);
        }
    };

    const handleGenerateReferenceGrammar = async () => {
        if (
            !drillData ||
            mode !== "translation" ||
            !drillData.reference_english.trim() ||
            isGeneratingGrammar
        ) {
            return;
        }

        setIsGeneratingGrammar(true);
        setGrammarError(null);
        setReferenceGrammarDisplayMode("core");

        try {
            const response = await fetch("/api/ai/grammar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: drillData.reference_english,
                    mode: "basic",
                }),
            });
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || "语法分析生成失败");
            }

            const sentences = Array.isArray(data?.difficult_sentences)
                ? data.difficult_sentences as GrammarSentenceAnalysis[]
                : [];

            setReferenceGrammarAnalysis(sentences);
        } catch (error) {
            const message = error instanceof Error ? error.message : "语法分析生成失败";
            setGrammarError(message);
            setReferenceGrammarAnalysis(null);
            setReferenceGrammarDisplayMode("core");
        } finally {
            setIsGeneratingGrammar(false);
        }
    };

    const inferTeachingPoint = () => {
        const chinese = drillData?.chinese || "";
        const english = drillFeedback?.improved_version || drillData?.reference_english || "";
        const signal = `${chinese} ${english}`.toLowerCase();

        if (/(如果|假如|除非|只要)/.test(chinese) || /\bif\b|\bunless\b|\bprovided\b/.test(signal)) {
            return "条件句与逻辑关系";
        }
        if (/(当|后|之前|以后|时候|一.+就)/.test(chinese) || /\bwhen\b|\bafter\b|\bbefore\b|\bonce\b|\buntil\b/.test(signal)) {
            return "时间从句与时序表达";
        }
        if (/\bignite\b|\bspark\b|\bbetween\b|\bromantic\b/.test(signal)) {
            return "词汇搭配与语气";
        }
        return "语序与自然表达";
    };

    const inferTutorIntent = (questionType: TutorQuestionType, teachingPoint: string): TutorIntent => {
        if (isRebuildMode) return "rebuild";
        if (questionType === "word_choice" || /词汇|搭配/.test(teachingPoint)) return "lexical";
        if (/语序|从句|时态|语法/.test(teachingPoint)) return "grammar";
        return "translate";
    };

    const isRebuildTutorSurface = isRebuildMode && Boolean(drillData?._rebuildMeta);
    const isRebuildFloatingTutorSurface = isRebuildMode && Boolean(rebuildTutorSession);

    const inferRebuildTeachingPoint = () => {
        if (!rebuildFeedback) return "词序与标准表达";
        if (rebuildFeedback.evaluation.distractorPickRatio < 1) return "词义辨认与干扰词区分";
        if (rebuildFeedback.evaluation.misplacementRatio < 1) return "词序与句子骨架";
        if (rebuildFeedback.evaluation.contentWordHitRate < 1) return "内容词定位与短语搭配";
        return "标准表达与短语搭配";
    };

    const inferActiveTeachingPoint = () => {
        if (isRebuildTutorSurface) return inferRebuildTeachingPoint();
        return inferTeachingPoint();
    };
    const activeTutorTeachingPoint = tutorResponse?.teaching_point || inferActiveTeachingPoint();

    const inferFocusSpan = (question: string) => {
        const quoted = question.match(/[“"](.*?)[”"]/)?.[1]?.trim();
        if (quoted) return quoted.slice(0, 40);
        const englishWord = question.match(/[A-Za-z][A-Za-z'-]{2,}/)?.[0]?.trim();
        if (englishWord) return englishWord;
        const chinesePhrase = question.match(/[\u4e00-\u9fa5]{2,}/)?.[0]?.trim();
        return chinesePhrase ? chinesePhrase.slice(0, 16) : "";
    };

    const normalizeTutorResponse = (raw: unknown, fallbackTeachingPoint: string): TutorStructuredResponse => {
        const readString = (value: unknown) => typeof value === "string" ? value.trim() : "";
        const asObject = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const rawTags = Array.isArray(asObject.error_tags) ? asObject.error_tags : [];
        const errorTags = rawTags
            .map((item) => readString(item).toLowerCase())
            .filter(Boolean)
            .slice(0, 4);
        const rawQualityFlags = Array.isArray(asObject.quality_flags) ? asObject.quality_flags : [];
        const qualityFlags = rawQualityFlags
            .map((item) => readString(item))
            .filter(Boolean)
            .slice(0, 6);
        const rawExamples = Array.isArray(asObject.example_sentences) ? asObject.example_sentences : [];
        const example_sentences: NonNullable<TutorStructuredResponse["example_sentences"]> = [];
        for (const item of rawExamples) {
            const example = item && typeof item === "object" ? item as Record<string, unknown> : {};
            const sentence_en = readString(example.sentence_en);
            if (!sentence_en) continue;
            const rawTokens = Array.isArray(example.sentence_en_tokens) ? example.sentence_en_tokens : [];
            example_sentences.push({
                label_cn: readString(example.label_cn) || undefined,
                sentence_en,
                sentence_en_tokens: rawTokens.map((token) => readString(token)).filter(Boolean),
                note_cn: readString(example.note_cn) || undefined,
            });
            if (example_sentences.length >= 3) break;
        }

        return {
            coach_markdown:
                readString(asObject.coach_markdown) ||
                readString(asObject.coach_cn) ||
                "1. **先保主干意思**。\n2. 这次只补一个关键表达点。\n3. 先把这一点说顺，再决定要不要看整句。",
            response_intent: readString(asObject.response_intent) as TutorStructuredResponse["response_intent"],
            answer_revealed: Boolean(asObject.answer_revealed),
            full_answer: readString(asObject.full_answer) || undefined,
            answer_reason_cn: readString(asObject.answer_reason_cn) || undefined,
            example_sentences: example_sentences.length > 0 ? example_sentences : undefined,
            teaching_point: readString(asObject.teaching_point) || fallbackTeachingPoint,
            error_tags: errorTags,
            quality_flags: qualityFlags,
        };
    };

    const openTutorModal = useCallback(() => {
        setIsTutorOpen(true);
    }, []);

    useEffect(() => {
        if (!isTutorOpen && !rebuildTutorSession?.isOpen) return;

        const frame = window.requestAnimationFrame(() => {
            const container = tutorConversationRef.current;
            if (!container) return;
            container.scrollTo({
                top: container.scrollHeight,
                behavior: tutorThread.length > 0 ? "smooth" : "auto",
            });
        });

        return () => window.cancelAnimationFrame(frame);
    }, [isTutorOpen, rebuildTutorSession?.isOpen, tutorPendingQuestion, tutorThread.length]);

    const handleAskTutor = async (options?: {
        question?: string;
        questionType?: TutorQuestionType;
        forceReveal?: boolean;
    }) => {
        const question = (options?.question ?? tutorQuery).trim();
        if (!question || !drillData) return;
        const assistantLabel = isRebuildFloatingTutorSurface ? "英语老师" : isRebuildTutorSurface ? "英语问答" : "AI Teacher";
        const shouldChargeTutorCoins = !isRebuildFloatingTutorSurface;
        if (shouldChargeTutorCoins && coinsRef.current < 10) {
            setTutorAnswer(`${assistantLabel} 每次提问会消耗 10 星光币。你当前星光币不够了。`);
            setTutorPendingQuestion(null);
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: `${assistantLabel} 提问需要 10 星光币` });
            return;
        }
        setIsAskingTutor(true);
        setTutorPendingQuestion(question);
        setTutorQuery("");
        setTutorAnswer("");

        const teachingPoint = activeTutorTeachingPoint;
        const requestedType = options?.questionType ?? "follow_up";
        const unlockRequested = requestedType === "unlock_answer" || options?.forceReveal === true;
        const shouldReveal = unlockRequested;
        const outgoingQuestionType: TutorQuestionType = shouldReveal ? "unlock_answer" : requestedType;
        const outgoingIntent = inferTutorIntent(outgoingQuestionType, teachingPoint);
        const outgoingFocusSpan = (
            rebuildTutorSession?.focusSpan
            || getCurrentSelectionFocusSpan()
            || inferFocusSpan(question)
        ).slice(0, 80);
        const outgoingSurface: TutorUiSurface = isRebuildFloatingTutorSurface
            ? "rebuild_floating_teacher"
            : isRebuildTutorSurface
                ? "score"
                : "battle";
        const userAttemptText = isRebuildTutorSurface
            ? (rebuildFeedback?.evaluation.userSentence || rebuildAnswerTokens.map((token) => token.text).join(" "))
            : userTranslation;
        const improvedVersionText = isRebuildTutorSurface
            ? drillData.reference_english
            : drillFeedback?.improved_version;
        const scoreValue = isRebuildTutorSurface
            ? (rebuildFeedback ? Math.round((rebuildFeedback.evaluation.accuracyRatio ?? 0) * 100) : undefined)
            : drillFeedback?.score;
        const shouldCompactRebuildContext = isRebuildFloatingTutorSurface && Boolean(rebuildTutorSession?.hasBootstrappedContext);
        const drillContextPayload = shouldCompactRebuildContext
            ? {
                chinese: drillData.chinese,
                reference_english: drillData.reference_english,
            }
            : drillData;

        try {
            if (shouldChargeTutorCoins) {
                applyEconomyPatch({ coinsDelta: -10 });
                setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: `${assistantLabel} 提问 -10 星光币` });
            }
            const response = await fetch("/api/ai/ask_tutor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "ask" as TutorAction,
                    query: question,
                    questionType: outgoingQuestionType,
                    uiSurface: outgoingSurface,
                    intent: outgoingIntent,
                    focusSpan: outgoingFocusSpan,
                    userAttempt: shouldCompactRebuildContext ? "" : userAttemptText,
                    improvedVersion: shouldCompactRebuildContext ? "" : improvedVersionText,
                    score: shouldCompactRebuildContext ? undefined : scoreValue,
                    recentTurns: tutorThread.slice(shouldCompactRebuildContext ? -4 : -6).map((item) => ({
                        question: item.question,
                        answer: item.coach_markdown,
                    })),
                    recentMastery: tutorRecentMastery,
                    teachingPoint,
                    revealAnswer: shouldReveal,
                    drillContext: drillContextPayload,
                    articleTitle: drillData._topicMeta?.topic || context.articleTitle || context.topic,
                    sessionBootstrapped: shouldCompactRebuildContext,
                    thinkingMode: tutorThinkingMode,
                    answerMode: tutorAnswerMode,
                    stream: true,
                }),
            });

            if (!response.ok) {
                throw new Error("Tutor 请求失败");
            }

            let normalized: TutorStructuredResponse | null = null;
            const contentType = response.headers.get("content-type") || "";

            if (contentType.includes("text/event-stream") && response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let streamedCoach = "";

                const applyStreamingCoach = (coach: string) => {
                    setTutorAnswer(coach);
                    setTutorResponse((prev) => ({
                        coach_markdown: coach,
                        response_intent: prev?.response_intent,
                        answer_revealed: prev?.answer_revealed ?? false,
                        full_answer: prev?.full_answer,
                        answer_reason_cn: prev?.answer_reason_cn,
                        example_sentences: prev?.example_sentences,
                        teaching_point: prev?.teaching_point ?? teachingPoint,
                        error_tags: prev?.error_tags ?? [],
                        quality_flags: prev?.quality_flags ?? [],
                    }));
                };

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    let boundaryIndex = buffer.indexOf("\n\n");
                    while (boundaryIndex !== -1) {
                        const message = buffer.slice(0, boundaryIndex);
                        buffer = buffer.slice(boundaryIndex + 2);
                        boundaryIndex = buffer.indexOf("\n\n");

                        let eventName = "message";
                        let dataLine = "";
                        for (const line of message.split("\n")) {
                            if (line.startsWith("event:")) {
                                eventName = line.slice(6).trim();
                            } else if (line.startsWith("data:")) {
                                dataLine += line.slice(5).trim();
                            }
                        }

                        if (!dataLine || dataLine === "[DONE]") continue;

                        if (eventName === "error") {
                            if (streamedCoach) {
                                normalized = normalizeTutorResponse(
                                    { coach_markdown: streamedCoach, teaching_point: teachingPoint, answer_revealed: shouldReveal },
                                    teachingPoint
                                );
                                continue;
                            }
                            setTutorAnswer(`${assistantLabel} 刚才的流式讲解中断了。你可以直接再问一次，或者换个更具体的卡点来问。`);
                            setTutorPendingQuestion(null);
                            continue;
                        }

                        if (eventName === "chunk") {
                            try {
                                const parsedChunk = JSON.parse(dataLine) as { coach_markdown?: string };
                                if (typeof parsedChunk.coach_markdown === "string" && parsedChunk.coach_markdown.trim()) {
                                    streamedCoach = parsedChunk.coach_markdown.trim();
                                    applyStreamingCoach(streamedCoach);
                                }
                            } catch {
                                continue;
                            }
                        }

                        if (eventName === "final") {
                            try {
                                const parsedFinal = JSON.parse(dataLine);
                                normalized = normalizeTutorResponse(parsedFinal, teachingPoint);
                            } catch {
                                continue;
                            }
                        }
                    }
                }

                if (!normalized && streamedCoach) {
                    normalized = normalizeTutorResponse(
                        { coach_markdown: streamedCoach, teaching_point: teachingPoint, answer_revealed: shouldReveal },
                        teachingPoint
                    );
                }
            } else {
                const data = await response.json();
                if (data?.error) {
                    throw new Error(data.error);
                }
                normalized = normalizeTutorResponse(data, teachingPoint);
            }

            if (!normalized) {
                throw new Error("暂时没有拿到回复，请再问一次。");
            }

            setTutorResponse(normalized);
            setTutorAnswer(normalized.coach_markdown);
            rememberTutorMastery(normalized, outgoingFocusSpan);
            if (isRebuildFloatingTutorSurface) {
                setRebuildTutorSession((current) => current ? ({
                    ...current,
                    focusSpan: outgoingFocusSpan || current.focusSpan,
                    teachingPoint: normalized.teaching_point || current.teachingPoint,
                    hasBootstrappedContext: true,
                    isOpen: true,
                }) : current);
            }
            setTutorThread((prev) => [
                ...prev,
                {
                    question,
                    question_type: outgoingQuestionType,
                    ...normalized,
                },
            ].slice(-8));
            setTutorPendingQuestion(null);
        } catch (error) {
            console.error(error);
            setTutorAnswer(`${assistantLabel} 暂时不可用，请稍后重试。`);
            setTutorPendingQuestion(null);
            if (shouldChargeTutorCoins) {
                applyEconomyPatch({ coinsDelta: 10 });
                setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: `${assistantLabel} 提问失败，已退还 10 星光币` });
            }
        } finally {
            setIsAskingTutor(false);
        }
    };

    const handlePlayTutorCardAudio = useCallback(async (text: string) => {
        const normalizedText = text.trim();
        if (!normalizedText) return;

        try {
            const data = await requestTtsPayload(normalizedText);

            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }

            const nextAudio = new Audio(data.audio);
            audioRef.current = nextAudio;
            await nextAudio.play();
        } catch (error) {
            console.error("[AI Teacher] audio playback failed", error);
        }
    }, []);

    const rememberTutorMastery = useCallback((response: TutorStructuredResponse, focusSpan: string) => {
        const additions: string[] = [];

        if (focusSpan.trim()) additions.push(focusSpan.trim());
        if (response.teaching_point.trim()) additions.push(response.teaching_point.trim());

        setTutorRecentMastery((prev) => {
            const seen = new Set<string>();
            const merged = [...prev, ...additions]
                .map((item) => item.trim())
                .filter((item) => item && item.length <= 24)
                .filter((item) => {
                    if (seen.has(item)) return false;
                    seen.add(item);
                    return true;
                });

            return merged.slice(-8);
        });
    }, []);

    const openShopForItem = useCallback((itemId: ShopItemId, message?: string) => {
        setShopFocusedItem(itemId);
        setShowShopModal(true);

        if (message) {
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message });
        }
    }, []);

    const handleDictationWordLookupTicketConsume = useCallback((action: "lookup" | "deepAnalyze") => {
        if (!isDictationMode) return true;

        if (getItemCount('vocab_ticket') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            openShopForItem('vocab_ticket', '关键词券不足，请先去商场购买');
            return false;
        }

        applyEconomyPatch({ itemDelta: { vocab_ticket: -1 } });
        pushEconomyFx({
            kind: 'item_consume',
            itemId: 'vocab_ticket',
            amount: 1,
            message: action === "deepAnalyze" ? '已消耗 1 关键词券（Deep Analyze）' : '已消耗 1 关键词券（查词）',
            source: 'vocab',
        });
        return true;
    }, [applyEconomyPatch, getItemCount, isDictationMode, openShopForItem, pushEconomyFx]);

    const handleBlindVisibilityToggle = useCallback(() => {
        if (!isListeningFamilyMode) {
            setIsBlindMode((prev) => !prev);
            return;
        }

        // VISIBLE -> BLIND: free toggle back
        if (!isBlindMode) {
            setIsBlindMode(true);
            return;
        }

        // BLIND -> VISIBLE in listening/dictation: consume once per drill
        if (blindVisibleUnlockConsumed) {
            setIsBlindMode(false);
            return;
        }

        if (getItemCount('hint_ticket') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            openShopForItem('hint_ticket', 'Hint 道具不足，请先去商场购买');
            return;
        }

        applyEconomyPatch({ itemDelta: { hint_ticket: -1 } });
        pushEconomyFx({ kind: 'item_consume', itemId: 'hint_ticket', amount: 1, message: '已消耗 1 Hint 道具', source: 'hint' });
        setBlindVisibleUnlockConsumed(true);
        setIsBlindMode(false);
    }, [
        applyEconomyPatch,
        blindVisibleUnlockConsumed,
        getItemCount,
        isBlindMode,
        isListeningFamilyMode,
        openShopForItem,
        pushEconomyFx,
    ]);

    const togglePassageChinese = useCallback((segmentIndex: number) => {
        setRebuildPassageUiState((currentState) => {
            const nextState = [...currentState];
            const existing = nextState[segmentIndex] ?? { chineseExpanded: true };
            nextState[segmentIndex] = {
                ...existing,
                chineseExpanded: !existing.chineseExpanded,
            };
            return nextState;
        });
    }, []);

    const activatePassageSegment = useCallback((segmentIndex: number) => {
        if (!isRebuildPassage || !passageSession) return;
        const targetSegment = passageSession.segments[segmentIndex];
        if (!targetSegment) return;
        clearRebuildPassageShadowingPromptTimer();

        const nextDrafts = [...rebuildPassageDrafts];
        const currentDraft = nextDrafts[activePassageSegmentIndex];
        if (currentDraft) {
            nextDrafts[activePassageSegmentIndex] = buildActivePassageDraftSnapshot(currentDraft);
        }

        const targetResult = rebuildPassageResults.find((item) => item.segmentIndex === segmentIndex) ?? null;
        const nextTargetDraftBase = nextDrafts[segmentIndex] ?? createRebuildPassageDraftState(targetSegment, segmentIndex);
        const nextTargetDraft = (nextTargetDraftBase.startedAt === null && !targetResult)
            ? { ...nextTargetDraftBase, startedAt: Date.now() }
            : nextTargetDraftBase;
        nextDrafts[segmentIndex] = nextTargetDraft;

        setRebuildPassageDrafts(nextDrafts);
        setActivePassageSegmentIndex(segmentIndex);
        applyPassageDraftToActiveState(nextTargetDraft);
        setDrillData((current) => current ? hydratePassageSegmentDrill(current, segmentIndex) : current);
        setRebuildFeedback(null);
        setRebuildSentenceShadowingFlow("idle");
        setRebuildPassageShadowingSegmentIndex(targetResult ? segmentIndex : null);
        setRebuildPassageShadowingFlow("idle");
        setAnalysisRequested(false);
        setAnalysisDetailsOpen(false);
        setWordPopup(null);
    }, [
        activePassageSegmentIndex,
        applyPassageDraftToActiveState,
        buildActivePassageDraftSnapshot,
        clearRebuildPassageShadowingPromptTimer,
        hydratePassageSegmentDrill,
        isRebuildPassage,
        passageSession,
        rebuildPassageDrafts,
        rebuildPassageResults,
    ]);

    const handleRebuildSelectToken = useCallback((tokenId: string) => {
        if (!isRebuildMode) return;
        if (isRebuildPassage && activePassageResult) return;
        if (!isRebuildPassage && rebuildFeedback) return;
        setRebuildAvailableTokens((currentTokens) => {
            const token = currentTokens.find((item) => item.id === tokenId);
            if (!token) return currentTokens;
            playRebuildSfx("pick");
            setRebuildAnswerTokens((answerTokens) => (
                answerTokens.some((item) => item.id === token.id)
                    ? answerTokens
                    : [...answerTokens, token]
            ));
            return currentTokens.filter((item) => item.id !== tokenId);
        });
    }, [activePassageResult, isRebuildMode, isRebuildPassage, rebuildFeedback]);

    const handleRebuildRemoveToken = useCallback((tokenId: string) => {
        if (!isRebuildMode) return;
        if (isRebuildPassage && activePassageResult) return;
        if (!isRebuildPassage && rebuildFeedback) return;
        setRebuildAnswerTokens((currentTokens) => {
            const token = currentTokens.find((item) => item.id === tokenId);
            if (!token) return currentTokens;
            playRebuildSfx("remove");
            setRebuildEditCount((prev) => prev + 1);
            setRebuildAvailableTokens((availableTokens) => (
                availableTokens.some((item) => item.id === token.id)
                    ? availableTokens
                    : [...availableTokens, token].sort((left, right) => (
                        (rebuildTokenOrderRef.current.get(left.id) ?? 0) - (rebuildTokenOrderRef.current.get(right.id) ?? 0)
                    ))
            ));
            return currentTokens.filter((item) => item.id !== tokenId);
        });
    }, [activePassageResult, isRebuildMode, isRebuildPassage, rebuildFeedback]);

    const handleSubmitRebuild = useCallback((skipped = false) => {
        if (!isRebuildMode || !drillData?._rebuildMeta) return false;
        if (isRebuildPassage && activePassageResult) return false;
        if (!isRebuildPassage && rebuildFeedback) return false;
        if (!skipped && rebuildAnswerTokens.length === 0) return false;
        clearRebuildSentenceShadowingPromptTimer();

        playRebuildSfx("submit");

        const selectedTokens = skipped ? [] : rebuildAnswerTokens.map((token) => token.text);
        const evaluation = evaluateRebuildSelection({
            answerTokens: drillData._rebuildMeta.answerTokens,
            selectedTokens,
        });
        const exceededSoftLimit = rebuildStartedAt !== null
            ? (Date.now() - rebuildStartedAt) > getRebuildSoftTimeLimitMs(drillData._rebuildMeta.answerTokens.length, currentElo)
            : false;
        const systemDelta = getRebuildSystemDelta({
            accuracyRatio: evaluation.accuracyRatio,
            completionRatio: evaluation.completionRatio,
            misplacementRatio: evaluation.misplacementRatio,
            distractorPickRatio: evaluation.distractorPickRatio,
            contentWordHitRate: evaluation.contentWordHitRate,
            tailCoverage: evaluation.tailCoverage,
            replayCount: rebuildReplayCount,
            tokenEditCount: rebuildEditCount,
            exceededSoftLimit,
            skipped,
        });
        const systemAssessment = getRebuildSystemAssessment(systemDelta);
        const nextFeedback: RebuildFeedbackState = {
            evaluation,
            systemDelta,
            systemAssessment,
            systemAssessmentLabel: getRebuildSystemAssessmentLabel(systemAssessment),
            selfEvaluation: null,
            effectiveElo: currentElo,
            replayCount: rebuildReplayCount,
            editCount: rebuildEditCount,
            skipped,
            exceededSoftLimit,
            resolvedAt: Date.now(),
        };

        if (isRebuildPassage) {
            const objectiveScore100 = calculateRebuildPassageObjectiveScore({
                accuracyRatio: evaluation.accuracyRatio,
                completionRatio: evaluation.completionRatio,
                misplacementRatio: evaluation.misplacementRatio,
                distractorPickRatio: evaluation.distractorPickRatio,
                contentWordHitRate: evaluation.contentWordHitRate,
                tailCoverage: evaluation.tailCoverage,
                replayCount: rebuildReplayCount,
                tokenEditCount: rebuildEditCount,
                exceededSoftLimit,
                skipped,
            });
            const nextResults = rebuildPassageResults
                .filter((item) => item.segmentIndex !== activePassageSegmentIndex);
            nextResults.push({
                segmentIndex: activePassageSegmentIndex,
                feedback: nextFeedback,
                objectiveScore100,
                selfScore100: null,
                finalScore100: null,
                selfEvaluation: null,
            });
            nextResults.sort((left, right) => left.segmentIndex - right.segmentIndex);
            setRebuildPassageResults(nextResults);
            setRebuildPassageUiState((currentState) => {
                const nextState = [...currentState];
                const existing = nextState[activePassageSegmentIndex] ?? { chineseExpanded: true };
                nextState[activePassageSegmentIndex] = {
                    ...existing,
                    chineseExpanded: false,
                };
                return nextState;
            });

            if (evaluation.isCorrect && !skipped) {
                launchRebuildSuccessCelebration();
            } else {
                playRebuildSfx("error");
            }
            const submittedSegmentIndex = activePassageSegmentIndex;
            clearRebuildPassageShadowingPromptTimer();
            setRebuildPassageShadowingSegmentIndex(submittedSegmentIndex);
            setRebuildPassageShadowingFlow("idle");
            rebuildPassageShadowingPromptTimerRef.current = window.setTimeout(() => {
                setRebuildPassageShadowingSegmentIndex(submittedSegmentIndex);
                setRebuildPassageShadowingFlow("prompt");
                rebuildPassageShadowingPromptTimerRef.current = null;
            }, REBUILD_PASSAGE_SHADOWING_PROMPT_DELAY_MS);
        } else {
            clearRebuildSentenceShadowingPromptTimer();
            setPendingRebuildSentenceFeedback(null);
            setRebuildFeedback(nextFeedback);
            setRebuildSentenceShadowingFlow("feedback");
            if (rebuildShadowingAutoOpen) {
                rebuildSentenceShadowingPromptTimerRef.current = window.setTimeout(() => {
                    setRebuildSentenceShadowingFlow("prompt");
                    rebuildSentenceShadowingPromptTimerRef.current = null;
                }, REBUILD_PASSAGE_SHADOWING_PROMPT_DELAY_MS);
            }
        }
        setAnalysisRequested(false);
        setAnalysisDetailsOpen(false);
        return true;
    }, [
        activePassageResult,
        activePassageSegmentIndex,
        drillData?._rebuildMeta,
        isRebuildMode,
        isRebuildPassage,
        rebuildAnswerTokens,
        rebuildFeedback,
        rebuildPassageResults,
        currentElo,
        clearRebuildPassageShadowingPromptTimer,
        clearRebuildSentenceShadowingPromptTimer,
        rebuildEditCount,
        rebuildReplayCount,
        rebuildStartedAt,
        rebuildShadowingAutoOpen,
        launchRebuildSuccessCelebration,
        playRebuildSfx,
    ]);

    const handleSkipRebuild = useCallback(() => {
        return handleSubmitRebuild(true);
    }, [handleSubmitRebuild]);

    const revealRebuildSentenceFeedback = useCallback(() => {
        const nextFeedback = rebuildFeedback ?? pendingRebuildSentenceFeedback;
        if (!nextFeedback) return;
        setRebuildFeedback(nextFeedback);
        setPendingRebuildSentenceFeedback(null);
        setRebuildSentenceShadowingFlow("feedback");
    }, [pendingRebuildSentenceFeedback, rebuildFeedback]);

    const upsertRebuildShadowingScopePatch = useCallback((
        scope: RebuildShadowingScope,
        patch: Partial<{
            wavBlob: Blob | null;
            result: RebuildShadowingResult | null;
            submitError: string | null;
        }>,
    ) => {
        setRebuildShadowingState((currentState) => {
            const scoped = upsertRebuildShadowingEntry(
                currentState,
                scope,
                patch,
                Date.now(),
            );
            return { ...currentState, ...scoped };
        });
    }, []);

    const cleanupRebuildShadowingRecorderResources = useCallback(() => {
        const recorder = rebuildShadowingRecorderRef.current;
        if (recorder) {
            recorder.ondataavailable = null;
            recorder.onerror = null;
            recorder.onstop = null;
        }
        rebuildShadowingRecorderRef.current = null;
        rebuildShadowingRecorderChunksRef.current = [];

        if (rebuildShadowingRecorderStreamRef.current) {
            for (const track of rebuildShadowingRecorderStreamRef.current.getTracks()) {
                track.stop();
            }
            rebuildShadowingRecorderStreamRef.current = null;
        }

        setRebuildShadowingState((currentState) => {
            if (!currentState.isRecording && !currentState.isProcessing) {
                return currentState;
            }
            return {
                ...currentState,
                isRecording: false,
                isProcessing: false,
            };
        });
    }, []);

    const clearRebuildListeningScoreFxTimer = useCallback(() => {
        if (rebuildListeningScoreFxTimerRef.current !== null) {
            window.clearTimeout(rebuildListeningScoreFxTimerRef.current);
            rebuildListeningScoreFxTimerRef.current = null;
        }
    }, []);

    const playRebuildListeningScoreSfx = useCallback((tier: ListeningScoreTier) => {
        if (typeof window === "undefined") return;
        const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) return;

        const audioContext = new AudioContextCtor();
        const base = audioContext.currentTime;

        const scheduleTone = (frequency: number, startOffset: number, duration: number, gain = 0.09, type: OscillatorType = "sine") => {
            const oscillator = audioContext.createOscillator();
            const amp = audioContext.createGain();
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, base + startOffset);
            amp.gain.setValueAtTime(0.0001, base + startOffset);
            amp.gain.exponentialRampToValueAtTime(gain, base + startOffset + 0.018);
            amp.gain.exponentialRampToValueAtTime(0.0001, base + startOffset + duration);
            oscillator.connect(amp);
            amp.connect(audioContext.destination);
            oscillator.start(base + startOffset);
            oscillator.stop(base + startOffset + duration + 0.01);
        };

        if (tier === "excellent") {
            scheduleTone(659, 0, 0.16, 0.11, "triangle");
            scheduleTone(880, 0.13, 0.16, 0.12, "triangle");
            scheduleTone(1047, 0.27, 0.2, 0.13, "triangle");
        } else if (tier === "good") {
            scheduleTone(587, 0, 0.16, 0.095, "triangle");
            scheduleTone(784, 0.14, 0.18, 0.105, "triangle");
        } else if (tier === "ok") {
            scheduleTone(523, 0, 0.22, 0.08, "sine");
        } else {
            scheduleTone(392, 0, 0.14, 0.07, "sawtooth");
            scheduleTone(311, 0.12, 0.2, 0.07, "sawtooth");
        }

        window.setTimeout(() => {
            void audioContext.close().catch(() => undefined);
        }, 900);
    }, []);

    const stopRebuildShadowingSpeechRecognition = useCallback((forceAbort = false) => {
        rebuildShadowingSpeechRecognitionStopRequestedRef.current = true;
        const recognition = rebuildShadowingSpeechRecognitionRef.current;
        if (recognition) {
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            try {
                if (forceAbort) {
                    recognition.abort();
                } else {
                    recognition.stop();
                }
            } catch {
                // noop
            }
            rebuildShadowingSpeechRecognitionRef.current = null;
        }
        setIsRebuildSpeechRecognitionRunning(false);
        rebuildShadowingSpeechRecognitionFinalTranscriptRef.current = "";
        rebuildShadowingSpeechRecognitionInterimTranscriptRef.current = "";
    }, []);

    const startRebuildShadowingSpeechRecognition = useCallback((scope: RebuildShadowingScope, referenceSentence: string) => {
        if (typeof window === "undefined") return false;

        const speechWindow = window as typeof window & {
            SpeechRecognition?: RebuildSpeechRecognitionConstructor;
            webkitSpeechRecognition?: RebuildSpeechRecognitionConstructor;
        };
        const SpeechRecognitionCtor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) {
            setIsRebuildSpeechRecognitionSupported(false);
            upsertRebuildShadowingScopePatch(scope, {
                submitError: "当前浏览器不支持实时跟读反馈，你仍可录音并回放对比。",
            });
            return false;
        }

        stopRebuildShadowingSpeechRecognition(true);
        rebuildShadowingSpeechRecognitionStopRequestedRef.current = false;
        rebuildShadowingSpeechRecognitionFinalTranscriptRef.current = "";
        rebuildShadowingSpeechRecognitionInterimTranscriptRef.current = "";

        const recognition = new SpeechRecognitionCtor();
        recognition.lang = "en-US";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
            const rows = Array.from(event.results || []);
            const finalParts: string[] = [];
            const interimParts: string[] = [];

            for (const result of rows) {
                const transcript = normalizeRebuildShadowingText(result?.[0]?.transcript || "");
                if (!transcript) continue;
                if (result?.isFinal) {
                    finalParts.push(transcript);
                } else {
                    interimParts.push(transcript);
                }
            }

            const nextFinalTranscript = normalizeRebuildShadowingText(finalParts.join(" "));
            const nextInterimTranscript = normalizeRebuildShadowingText(interimParts.join(" "));
            rebuildShadowingSpeechRecognitionFinalTranscriptRef.current = nextFinalTranscript;
            rebuildShadowingSpeechRecognitionInterimTranscriptRef.current = nextInterimTranscript;
            const nextTranscript = normalizeRebuildShadowingText(`${nextFinalTranscript} ${nextInterimTranscript}`);
            if (!nextTranscript) return;
            setRebuildShadowingLiveRecognitionTranscript(nextTranscript);
            const nextProgress = estimateRebuildShadowingProgress(referenceSentence, nextTranscript);
            if (nextProgress > rebuildShadowingListeningProgressCursorRef.current) {
                rebuildShadowingListeningProgressCursorRef.current = nextProgress;
                setRebuildListeningProgressCursor(nextProgress);
            }
        };
        recognition.onerror = (event) => {
            const errorCode = `${event?.error || ""}`.toLowerCase();
            if (!errorCode || errorCode === "aborted" || errorCode === "no-speech") {
                return;
            }
            if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
                upsertRebuildShadowingScopePatch(scope, {
                    submitError: "语音识别权限被拒绝，请在浏览器设置中允许麦克风后重试。",
                });
                return;
            }
            upsertRebuildShadowingScopePatch(scope, {
                submitError: `实时跟读识别异常：${event?.error || "未知错误"}`,
            });
        };
        recognition.onend = () => {
            if (rebuildShadowingSpeechRecognitionStopRequestedRef.current) {
                setIsRebuildSpeechRecognitionRunning(false);
                rebuildShadowingSpeechRecognitionRef.current = null;
                return;
            }

            const recorder = rebuildShadowingRecorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                try {
                    recognition.start();
                    return;
                } catch {
                    // fall through
                }
            }

            setIsRebuildSpeechRecognitionRunning(false);
            rebuildShadowingSpeechRecognitionRef.current = null;
        };

        rebuildShadowingSpeechRecognitionRef.current = recognition;
        try {
            recognition.start();
            setIsRebuildSpeechRecognitionRunning(true);
            return true;
        } catch (error) {
            rebuildShadowingSpeechRecognitionRef.current = null;
            setIsRebuildSpeechRecognitionRunning(false);
            const message = error instanceof Error ? error.message : "启动实时识别失败";
            upsertRebuildShadowingScopePatch(scope, { submitError: message });
            return false;
        }
    }, [stopRebuildShadowingSpeechRecognition, upsertRebuildShadowingScopePatch]);

    const handleStartRebuildShadowingRecording = useCallback(async () => {
        if (!isRebuildMode || !activeRebuildShadowingScope) return;
        const referenceSentence = normalizeRebuildShadowingText(activeRebuildShadowingReferenceEnglish);
        if (!referenceSentence) return;
        if (rebuildShadowingState.isRecording || rebuildShadowingState.isProcessing || rebuildShadowingState.isSubmitting) return;
        if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            upsertRebuildShadowingScopePatch(activeRebuildShadowingScope, {
                submitError: "当前浏览器不支持录音，请更换浏览器后再试。",
            });
            return;
        }
        if (typeof MediaRecorder === "undefined") {
            upsertRebuildShadowingScopePatch(activeRebuildShadowingScope, {
                submitError: "当前环境不支持录音组件，请更换浏览器后再试。",
            });
            return;
        }

        if (rebuildShadowingPlaybackRef.current) {
            rebuildShadowingPlaybackRef.current.pause();
            rebuildShadowingPlaybackRef.current.currentTime = 0;
        }
        if (audioRef.current && !audioRef.current.paused) {
            resetAudioPlayback();
        }

        cleanupRebuildShadowingRecorderResources();
        stopRebuildShadowingSpeechRecognition(true);
        rebuildShadowingRecordingScopeRef.current = activeRebuildShadowingScope;
        rebuildShadowingSpeechRecognitionFinalTranscriptRef.current = "";
        rebuildShadowingSpeechRecognitionInterimTranscriptRef.current = "";
        rebuildShadowingListeningProgressCursorRef.current = 0;
        setRebuildListeningProgressCursor(0);
        setRebuildShadowingLiveRecognitionTranscript("");
        setShowRebuildShadowingCorrection(false);
        clearRebuildListeningScoreFxTimer();
        setRebuildListeningScoreFx(null);

        setRebuildShadowingState((currentState) => ({
            ...currentState,
            ...upsertRebuildShadowingEntry(
                currentState,
                activeRebuildShadowingScope,
                { wavBlob: null, submitError: null },
                Date.now(),
            ),
            isRecording: false,
            isProcessing: false,
        }));

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const preferredMimeTypes = [
                "audio/webm;codecs=opus",
                "audio/webm",
                "audio/mp4",
            ];
            const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            rebuildShadowingRecorderRef.current = recorder;
            rebuildShadowingRecorderStreamRef.current = stream;
            rebuildShadowingRecorderChunksRef.current = [];
            rebuildShadowingDiscardRecordingOnStopRef.current = false;

            recorder.ondataavailable = (event: BlobEvent) => {
                if (event.data.size > 0) {
                    rebuildShadowingRecorderChunksRef.current.push(event.data);
                }
            };
            recorder.onerror = () => {
                const scope = rebuildShadowingRecordingScopeRef.current;
                if (scope) {
                    upsertRebuildShadowingScopePatch(scope, { submitError: "录音失败，请重试。" });
                }
                stopRebuildShadowingSpeechRecognition(true);
                cleanupRebuildShadowingRecorderResources();
                rebuildShadowingRecordingScopeRef.current = null;
            };
            recorder.onstop = () => {
                const scope = rebuildShadowingRecordingScopeRef.current;
                const shouldDiscard = rebuildShadowingDiscardRecordingOnStopRef.current;
                rebuildShadowingDiscardRecordingOnStopRef.current = false;

                const blob = new Blob(
                    rebuildShadowingRecorderChunksRef.current,
                    { type: recorder.mimeType || "audio/webm" },
                );
                cleanupRebuildShadowingRecorderResources();
                if (shouldDiscard || blob.size <= 0 || !scope) {
                    setShowRebuildShadowingCorrection(false);
                    rebuildShadowingRecordingScopeRef.current = null;
                    return;
                }

                setRebuildShadowingState((currentState) => ({
                    ...currentState,
                    ...upsertRebuildShadowingEntry(
                        currentState,
                        scope,
                        {
                            wavBlob: blob,
                            submitError: null,
                        },
                        Date.now(),
                    ),
                }));
                rebuildShadowingRecordingScopeRef.current = null;
            };

            recorder.start();
            setRebuildShadowingState((currentState) => ({
                ...currentState,
                isRecording: true,
                isProcessing: false,
            }));
            startRebuildShadowingSpeechRecognition(activeRebuildShadowingScope, referenceSentence);
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message.toLowerCase().includes("notallowed") || message.toLowerCase().includes("permission")) {
                upsertRebuildShadowingScopePatch(activeRebuildShadowingScope, {
                    submitError: "麦克风权限被拒绝，请在浏览器设置里允许后重试。",
                });
            } else {
                upsertRebuildShadowingScopePatch(activeRebuildShadowingScope, {
                    submitError: message || "麦克风权限获取失败，请检查浏览器设置。",
                });
            }
            cleanupRebuildShadowingRecorderResources();
            stopRebuildShadowingSpeechRecognition(true);
            rebuildShadowingRecordingScopeRef.current = null;
        }
    }, [
        activeRebuildShadowingReferenceEnglish,
        activeRebuildShadowingScope,
        cleanupRebuildShadowingRecorderResources,
        clearRebuildListeningScoreFxTimer,
        isRebuildMode,
        rebuildShadowingState.isProcessing,
        rebuildShadowingState.isRecording,
        rebuildShadowingState.isSubmitting,
        startRebuildShadowingSpeechRecognition,
        stopRebuildShadowingSpeechRecognition,
        resetAudioPlayback,
        upsertRebuildShadowingScopePatch,
    ]);

    const handleStopRebuildShadowingRecording = useCallback(() => {
        if (!isRebuildMode) return;
        const recorder = rebuildShadowingRecorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        stopRebuildShadowingSpeechRecognition(false);
        rebuildShadowingDiscardRecordingOnStopRef.current = false;
        setShowRebuildShadowingCorrection(true);
        setRebuildShadowingState((currentState) => ({
            ...currentState,
            isProcessing: true,
        }));
        try {
            recorder.stop();
        } catch (error) {
            const scope = rebuildShadowingRecordingScopeRef.current;
            if (scope) {
                const message = error instanceof Error ? error.message : "停止录音失败，请重试。";
                upsertRebuildShadowingScopePatch(scope, { submitError: message });
            }
            cleanupRebuildShadowingRecorderResources();
        }
    }, [
        cleanupRebuildShadowingRecorderResources,
        isRebuildMode,
        stopRebuildShadowingSpeechRecognition,
        upsertRebuildShadowingScopePatch,
    ]);

    const handlePlayRebuildShadowingRecording = useCallback(() => {
        if (!activeRebuildShadowingEntry?.wavBlob) return;
        if (rebuildShadowingPlaybackRef.current) {
            rebuildShadowingPlaybackRef.current.pause();
            rebuildShadowingPlaybackRef.current.currentTime = 0;
        }
        if (rebuildShadowingPlaybackUrlRef.current) {
            URL.revokeObjectURL(rebuildShadowingPlaybackUrlRef.current);
            rebuildShadowingPlaybackUrlRef.current = null;
        }

        const nextUrl = URL.createObjectURL(activeRebuildShadowingEntry.wavBlob);
        rebuildShadowingPlaybackUrlRef.current = nextUrl;
        const audio = rebuildShadowingPlaybackRef.current ?? new Audio();
        rebuildShadowingPlaybackRef.current = audio;
        audio.src = nextUrl;
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
    }, [activeRebuildShadowingEntry?.wavBlob]);

    const handleSubmitRebuildShadowing = useCallback(() => {
        if (!isRebuildMode || !activeRebuildShadowingScope) return false;
        const referenceSentence = normalizeRebuildShadowingText(activeRebuildShadowingReferenceEnglish);
        if (!referenceSentence) return false;
        const activeEntry = getRebuildShadowingEntry<Blob, RebuildShadowingResult>(
            rebuildShadowingState,
            activeRebuildShadowingScope,
        );
        if (!activeEntry.wavBlob) {
            setRebuildShadowingState((currentState) => {
                const scoped = upsertRebuildShadowingEntry(
                    currentState,
                    activeRebuildShadowingScope,
                    { submitError: "先录一遍完整音频，再提交跟读评分。" },
                    Date.now(),
                );
                return { ...currentState, ...scoped };
            });
            return false;
        }
        const transcript = normalizeRebuildShadowingText(
            rebuildShadowingSpeechRecognitionFinalTranscriptRef.current
            || rebuildShadowingLiveRecognitionTranscript
            || "",
        );
        const metrics = scoreRebuildShadowingRecognition(referenceSentence, transcript);
        if (!metrics.spokenCount) {
            upsertRebuildShadowingScopePatch(activeRebuildShadowingScope, {
                submitError: "先开始录音并完整跟读一遍，再提交评分。",
            });
            return false;
        }

        setRebuildShadowingState((currentState) => ({
            ...currentState,
            ...upsertRebuildShadowingEntry(
                currentState,
                activeRebuildShadowingScope,
                { submitError: null },
                Date.now(),
            ),
            isSubmitting: true,
        }));

        if (REBUILD_SHADOWING_AFFECTS_ELO) {
            console.warn("[RebuildShadowing] Unexpected Elo-enabled flag detected.");
        }

        const tier = resolveRebuildShadowingScoreTier(metrics.score);
        const scoreTitle = tier === "excellent"
            ? "太稳了！"
            : tier === "good"
                ? "表现不错！"
                : tier === "ok"
                    ? "继续冲！"
                    : "再来一遍更好";
        const scoreDetail = `匹配 ${metrics.correctCount}/${Math.max(1, metrics.totalCount)} 个词，系统自动评分 ${metrics.score}/100`;
        clearRebuildListeningScoreFxTimer();
        setRebuildListeningScoreFx({
            score: metrics.score,
            tier,
            title: scoreTitle,
            detail: scoreDetail,
        });
        playRebuildListeningScoreSfx(tier);
        rebuildListeningScoreFxTimerRef.current = window.setTimeout(() => {
            setRebuildListeningScoreFx((current) => (current?.score === metrics.score ? null : current));
            rebuildListeningScoreFxTimerRef.current = null;
        }, 1800);

        const summary = tier === "excellent"
            ? "跟读非常稳，节奏和关键词覆盖都很好。"
            : tier === "good"
                ? "整体表现不错，少数词还可以更清晰。"
                : tier === "ok"
                    ? "能跟上主要内容，建议再来一遍提升完整度。"
                    : "这次还没跟上节奏，先慢速复读再提速。";
        const missingWords = buildRebuildShadowingWordResults(referenceSentence, transcript)
            .filter((item) => item.status === "missing")
            .slice(0, 2)
            .map((item) => item.word);
        const tips = [
            missingWords.length > 0
                ? `优先补上漏读词：${missingWords.join(" / ")}。`
                : "保持语速稳定，尽量完整复现整句。",
            "先慢速跟读一遍，再按正常语速复读一遍。",
        ];
        const pronunciationScore = Math.round(metrics.precision * 100);
        const contentScore = Math.round(metrics.recall * 100);
        const fluencyScore = Math.round(metrics.lengthBalance * 100);
        const wordResults = buildRebuildShadowingWordResults(referenceSentence, transcript);
        const normalizedResult: RebuildShadowingResult = {
            score: metrics.score,
            pronunciation_score: pronunciationScore,
            content_score: contentScore,
            fluency_score: fluencyScore,
            coverage_ratio: metrics.totalCount > 0 ? metrics.correctCount / metrics.totalCount : 0,
            transcript,
            summary_cn: summary,
            tips_cn: tips,
            word_results: wordResults,
            utterance_scores: {
                accuracy: pronunciationScore,
                completeness: contentScore,
                fluency: fluencyScore,
                prosody: pronunciationScore,
                total: metrics.score,
                content_reproduction: contentScore,
                rhythm_fluency: fluencyScore,
                pronunciation_clarity: pronunciationScore,
            },
            submittedAt: Date.now(),
        };

        setRebuildShadowingState((currentState) => ({
            ...currentState,
            ...upsertRebuildShadowingEntry(
                currentState,
                activeRebuildShadowingScope,
                {
                    result: normalizedResult,
                    submitError: null,
                },
                Date.now(),
            ),
            isSubmitting: false,
        }));
        return true;
    }, [
        activeRebuildShadowingReferenceEnglish,
        activeRebuildShadowingScope,
        clearRebuildListeningScoreFxTimer,
        isRebuildMode,
        playRebuildListeningScoreSfx,
        rebuildShadowingLiveRecognitionTranscript,
        rebuildShadowingState,
        upsertRebuildShadowingScopePatch,
    ]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const speechWindow = window as typeof window & {
            SpeechRecognition?: RebuildSpeechRecognitionConstructor;
            webkitSpeechRecognition?: RebuildSpeechRecognitionConstructor;
        };
        setIsRebuildSpeechRecognitionSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    }, []);

    useEffect(() => {
        if (!activeRebuildShadowingScope) return;
        const resultTranscript = normalizeRebuildShadowingText(activeRebuildShadowingEntry?.result?.transcript || "");
        if (!resultTranscript) {
            rebuildShadowingListeningProgressCursorRef.current = 0;
            setRebuildListeningProgressCursor(0);
            setRebuildShadowingLiveRecognitionTranscript("");
            setShowRebuildShadowingCorrection(false);
            return;
        }
        rebuildShadowingListeningProgressCursorRef.current = estimateRebuildShadowingProgress(
            activeRebuildShadowingReferenceEnglish,
            resultTranscript,
        );
        setRebuildListeningProgressCursor(rebuildShadowingListeningProgressCursorRef.current);
        setRebuildShadowingLiveRecognitionTranscript(resultTranscript);
        setShowRebuildShadowingCorrection(true);
    }, [
        activeRebuildShadowingEntry?.result?.transcript,
        activeRebuildShadowingReferenceEnglish,
        activeRebuildShadowingScope?.kind,
        activeRebuildShadowingScope?.kind === "segment" ? activeRebuildShadowingScope.segmentIndex : -1,
    ]);

    useEffect(() => {
        if (isRebuildMode) return;
        resetRebuildShadowingState();
    }, [isRebuildMode, resetRebuildShadowingState]);

    useEffect(() => {
        if (!isRebuildMode || isRebuildPassage) return;
        if (pendingRebuildSentenceFeedback) return;
        if (!rebuildFeedback) {
            if (rebuildSentenceShadowingFlow !== "idle") {
                setRebuildSentenceShadowingFlow("idle");
            }
            return;
        }
        if (rebuildSentenceShadowingFlow === "idle") {
            setRebuildSentenceShadowingFlow("feedback");
        }
    }, [isRebuildMode, isRebuildPassage, pendingRebuildSentenceFeedback, rebuildFeedback, rebuildSentenceShadowingFlow]);

    useEffect(() => {
        return () => {
            clearRebuildListeningScoreFxTimer();
            const speechRecognition = rebuildShadowingSpeechRecognitionRef.current;
            if (speechRecognition) {
                speechRecognition.onresult = null;
                speechRecognition.onerror = null;
                speechRecognition.onend = null;
                try {
                    speechRecognition.abort();
                } catch {
                    // noop
                }
                rebuildShadowingSpeechRecognitionRef.current = null;
            }
            const recorder = rebuildShadowingRecorderRef.current;
            if (recorder && recorder.state !== "inactive") {
                try {
                    recorder.stop();
                } catch {
                    // noop
                }
            }
            if (rebuildShadowingRecorderStreamRef.current) {
                for (const track of rebuildShadowingRecorderStreamRef.current.getTracks()) {
                    track.stop();
                }
                rebuildShadowingRecorderStreamRef.current = null;
            }
            if (rebuildShadowingPlaybackRef.current) {
                rebuildShadowingPlaybackRef.current.pause();
                rebuildShadowingPlaybackRef.current.currentTime = 0;
                rebuildShadowingPlaybackRef.current.src = "";
            }
            if (rebuildShadowingPlaybackUrlRef.current) {
                URL.revokeObjectURL(rebuildShadowingPlaybackUrlRef.current);
            }
        };
    }, [clearRebuildListeningScoreFxTimer]);

    const rebuildTypingBufferRef = useRef("");

    useEffect(() => {
        rebuildTypingBufferRef.current = rebuildTypingBuffer;
    }, [rebuildTypingBuffer]);

    useEffect(() => {
        if (!isRebuildMode || !drillData?._rebuildMeta) return;
        if (isRebuildPassage && activePassageResult) return;
        if (!isRebuildPassage && rebuildFeedback) return;

        const expectedNextAnswerToken = drillData._rebuildMeta.answerTokens[rebuildAnswerTokens.length] ?? null;

        // Levenshtein distance for autocorrect mode
        const levenshtein = (a: string, b: string): number => {
            if (a.length === 0) return b.length;
            if (b.length === 0) return a.length;
            const matrix: number[][] = [];
            for (let i = 0; i <= b.length; i++) matrix[i] = [i];
            for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    if (b[i - 1] === a[j - 1]) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(
                            matrix[i - 1][j - 1] + 1,
                            matrix[i][j - 1] + 1,
                            matrix[i - 1][j] + 1
                        );
                    }
                }
            }
            return matrix[b.length][a.length];
        };

        const fuzzyMatch = (input: string, tokens: typeof rebuildAvailableTokens) => {
            const inputClean = normalizeRebuildTokenForMatch(input);
            if (inputClean.length < 2) return null;
            const fuzzyCandidates: Array<{ token: RebuildTokenInstance; distance: number }> = [];
            let bestDist = Infinity;
            for (const token of tokens) {
                const tokenClean = normalizeRebuildTokenForMatch(token.text);
                const dist = levenshtein(inputClean, tokenClean);
                const threshold = Math.max(1, Math.floor(tokenClean.length / 4));
                if (dist <= threshold && dist < bestDist) {
                    bestDist = dist;
                }
                if (dist <= threshold) fuzzyCandidates.push({ token, distance: dist });
            }
            if (!Number.isFinite(bestDist)) return null;

            const bestCandidates = fuzzyCandidates
                .filter((candidate) => candidate.distance === bestDist)
                .map((candidate) => candidate.token);
            return pickPreferredRebuildTokenCandidate({
                candidates: bestCandidates,
                typedRaw: input,
                expectedRaw: expectedNextAnswerToken,
            });
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.altKey || e.ctrlKey || e.metaKey) return;

            if (e.key === "Backspace") {
                if (rebuildTypingBufferRef.current.length > 0) {
                    const next = rebuildTypingBufferRef.current.slice(0, -1);
                    rebuildTypingBufferRef.current = next;
                    setRebuildTypingBuffer(next);
                } else if (rebuildAnswerTokens.length > 0) {
                    const lastToken = rebuildAnswerTokens[rebuildAnswerTokens.length - 1];
                    handleRebuildRemoveToken(lastToken.id);
                }
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();

                const buffered = rebuildTypingBufferRef.current;
                if (buffered.length > 0) {
                    const bufferedClean = normalizeRebuildTokenForMatch(buffered);
                    const exactMatches = rebuildAvailableTokens.filter((token) => (
                        normalizeRebuildTokenForMatch(token.text) === bufferedClean
                    ));

                    if (exactMatches.length > 0) {
                        const matchedToken = pickPreferredRebuildTokenCandidate({
                            candidates: exactMatches,
                            typedRaw: buffered,
                            expectedRaw: expectedNextAnswerToken,
                        }) ?? exactMatches[0];
                        handleRebuildSelectToken(matchedToken.id);
                        rebuildTypingBufferRef.current = "";
                        setRebuildTypingBuffer("");
                        return;
                    }

                    if (rebuildAutocorrect) {
                        const fuzzyResult = fuzzyMatch(buffered, rebuildAvailableTokens);
                        if (fuzzyResult) {
                            handleRebuildSelectToken(fuzzyResult.id);
                            rebuildTypingBufferRef.current = "";
                            setRebuildTypingBuffer("");
                            return;
                        }
                    }
                }

                if (rebuildAnswerTokens.length > 0) {
                    void handleSubmitRebuild();
                }
                return;
            }

            if (e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                const buf = rebuildTypingBufferRef.current;
                if (buf.length > 0) {
                    const currentClean = normalizeRebuildTokenForMatch(buf);
                    // 1. Try exact match first
                    const exactMatches = rebuildAvailableTokens.filter((token) => (
                        normalizeRebuildTokenForMatch(token.text) === currentClean
                    ));
                    if (exactMatches.length > 0) {
                        const matchedToken = pickPreferredRebuildTokenCandidate({
                            candidates: exactMatches,
                            typedRaw: buf,
                            expectedRaw: expectedNextAnswerToken,
                        }) ?? exactMatches[0];
                        handleRebuildSelectToken(matchedToken.id);
                        rebuildTypingBufferRef.current = "";
                        setRebuildTypingBuffer("");
                    } else if (rebuildAutocorrect) {
                        // 2. Autocorrect: fuzzy match fallback
                        const fuzzyResult = fuzzyMatch(buf, rebuildAvailableTokens);
                        if (fuzzyResult) {
                            handleRebuildSelectToken(fuzzyResult.id);
                            rebuildTypingBufferRef.current = "";
                            setRebuildTypingBuffer("");
                        }
                    }
                    // If no match, just do nothing (don't play audio)
                } else {
                    // Empty buffer -> Play audio!
                    if (!isPlaying) {
                        void playAudio();
                    }
                }
                return;
            }

            if (e.key.length === 1 && e.key.match(/[a-zA-Z0-9']/)) {
                const nextBuf = rebuildTypingBufferRef.current + e.key;
                rebuildTypingBufferRef.current = nextBuf;
                setRebuildTypingBuffer(nextBuf);

                const nextClean = normalizeRebuildTokenForMatch(nextBuf);
                const prefixMatches = rebuildAvailableTokens.filter((token) => (
                    normalizeRebuildTokenForMatch(token.text).startsWith(nextClean)
                ));
                const exactMatches = prefixMatches.filter((token) => (
                    normalizeRebuildTokenForMatch(token.text) === nextClean
                ));

                if (exactMatches.length > 0 && prefixMatches.length === exactMatches.length) {
                    setTimeout(() => {
                        const matchedToken = pickPreferredRebuildTokenCandidate({
                            candidates: exactMatches,
                            typedRaw: nextBuf,
                            expectedRaw: expectedNextAnswerToken,
                        }) ?? exactMatches[0];
                        handleRebuildSelectToken(matchedToken.id);
                        rebuildTypingBufferRef.current = "";
                        setRebuildTypingBuffer("");
                    }, 0);
                } else if (rebuildAutocorrect && prefixMatches.length === 0) {
                    // No prefix matches at all — try fuzzy autocorrect immediately
                    const fuzzyResult = fuzzyMatch(nextBuf, rebuildAvailableTokens);
                    if (fuzzyResult) {
                        setTimeout(() => {
                            handleRebuildSelectToken(fuzzyResult.id);
                            rebuildTypingBufferRef.current = "";
                            setRebuildTypingBuffer("");
                        }, 0);
                    }
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        activePassageResult,
        drillData?._rebuildMeta,
        handleRebuildRemoveToken,
        handleRebuildSelectToken,
        handleSubmitRebuild,
        isPlaying,
        isRebuildMode,
        isRebuildPassage,
        playAudio,
        rebuildAnswerTokens,
        rebuildAutocorrect,
        rebuildAvailableTokens,
        rebuildFeedback,
    ]);

    const handleRebuildSelfEvaluate = useCallback((evaluation: RebuildSelfEvaluation) => {
        if (!isRebuildPassage) {
            if (!rebuildFeedback) return;
            const delta = clampRebuildDifficultyDelta(rebuildFeedback.systemDelta + getRebuildSelfEvaluationDelta(evaluation));
            const nextElo = Math.max(0, Math.min(3200, rebuildHiddenElo + delta));
            const rewardResult = calculateSentenceRebuildRewards({
                evaluation: rebuildFeedback.evaluation,
                replayCount: rebuildFeedback.replayCount,
                tokenEditCount: rebuildFeedback.editCount,
                exceededSoftLimit: rebuildFeedback.exceededSoftLimit,
                skipped: rebuildFeedback.skipped,
            });
            const dropResult = rollRebuildDropReward({
                eligible: rewardResult.dropEligible,
                variant: "sentence",
                dropRoll: Math.random(),
                capsuleRoll: Math.random(),
                coinRoll: Math.random(),
            });

            pushEconomyFx({ kind: "coin_gain", amount: rewardResult.earnedCoins, message: `+${rewardResult.earnedCoins} 星光币`, source: "reward" });
            if (dropResult?.fx) {
                pushEconomyFx(dropResult.fx);
            }
            if (dropResult?.loot) {
                setLootDrop(dropResult.loot);
            }

            if (shouldTriggerSentenceRebuildGacha({
                learningSession: learningSessionActive,
                roll: Math.random(),
                evaluation: rebuildFeedback.evaluation,
                replayCount: rebuildFeedback.replayCount,
                tokenEditCount: rebuildFeedback.editCount,
                exceededSoftLimit: rebuildFeedback.exceededSoftLimit,
                skipped: rebuildFeedback.skipped,
            })) {
                setTimeout(() => {
                    setGachaCards(buildGachaPack());
                    setSelectedGachaCardId(null);
                    setGachaClaimTarget(null);
                    setShowGacha(true);
                    new Audio("https://assets.mixkit.co/sfx/preview/mixkit-ethereal-fairy-win-sound-2019.mp3").play().catch(() => { });
                }, dropResult?.loot ? 1800 : 900);
            }
            applyEconomyPatch({
                coinsDelta: rewardResult.earnedCoins + (dropResult?.coinsDelta ?? 0),
                itemDelta: dropResult?.itemDelta ?? {},
            });
            recordCompletedDrill();
            setRebuildHiddenElo(nextElo);
            void persistRebuildHiddenElo(nextElo);
            setRebuildFeedback((currentFeedback) => currentFeedback ? { ...currentFeedback, selfEvaluation: evaluation } : currentFeedback);
            setPendingRebuildAdvanceElo(nextElo);
            return;
        }

        const segmentCount = passageSession?.segments.length ?? 0;
        if (segmentCount === 0 || rebuildPassageResults.length !== segmentCount || rebuildPassageSummary) return;

        const sessionObjectiveScore100 = Math.round(
            rebuildPassageResults.reduce((total, item) => total + item.objectiveScore100, 0) / segmentCount
        );
        const skippedSegments = rebuildPassageResults.filter((item) => item.feedback.skipped).length;
        const selfScore100 = getRebuildPassageSelfScore(evaluation, {
            objectiveScore100: sessionObjectiveScore100,
            skippedSegments,
            totalSegments: segmentCount,
        });
        const nextResults = rebuildPassageResults
            .map((item) => ({
                ...item,
                feedback: { ...item.feedback, selfEvaluation: evaluation },
                selfEvaluation: evaluation,
                selfScore100,
                finalScore100: Math.round((item.objectiveScore100 * 0.5) + (selfScore100 * 0.5)),
            }))
            .sort((left, right) => left.segmentIndex - right.segmentIndex);
        const finalizedScores = nextResults
            .filter((item) => item.selfScore100 !== null && item.finalScore100 !== null)
            .map((item) => ({
                segmentIndex: item.segmentIndex,
                objectiveScore100: item.objectiveScore100,
                selfScore100: item.selfScore100 as number,
                finalScore100: item.finalScore100 as number,
            }));

        setRebuildPassageResults(nextResults);
        setRebuildPassageScores(finalizedScores);

        const aggregate = aggregateRebuildPassageScores(finalizedScores.map((item) => ({
            objectiveScore100: item.objectiveScore100,
            selfScore100: item.selfScore100,
        })));
        const sessionSystemDelta = Math.round(
            rebuildPassageResults.reduce((total, item) => total + item.feedback.systemDelta, 0) / segmentCount
        );
        const eloResult = calculateRebuildBattleElo({
            playerElo: rebuildBattleElo || DEFAULT_BASE_ELO,
            sessionSystemDelta,
            selfEvaluation: evaluation,
            streak: rebuildBattleStreak,
        });
        const change = eloResult.total;
        const nextElo = Math.max(0, Math.min(3200, (rebuildBattleElo || DEFAULT_BASE_ELO) + change));
        const nextStreak = change > 0 ? rebuildBattleStreak + 1 : 0;
        const rewardResult = calculatePassageRebuildRewards({
            sessionObjectiveScore100: aggregate.sessionObjectiveScore100,
            skippedSegments,
            totalSegments: segmentCount,
            streak: nextStreak,
        });
        const dropResult = rollRebuildDropReward({
            eligible: rewardResult.dropEligible,
            variant: "passage",
            dropRoll: Math.random(),
            capsuleRoll: Math.random(),
            coinRoll: Math.random(),
        });

        pushEconomyFx({ kind: "coin_gain", amount: rewardResult.earnedCoins, message: `+${rewardResult.earnedCoins} 星光币`, source: "reward" });
        if (dropResult?.fx) {
            pushEconomyFx(dropResult.fx);
        }
        if (dropResult?.loot) {
            setLootDrop(dropResult.loot);
        }
        if (shouldTriggerPassageRebuildGacha({
            learningSession: learningSessionActive,
            roll: Math.random(),
            sessionObjectiveScore100: aggregate.sessionObjectiveScore100,
            skippedSegments,
        })) {
            setTimeout(() => {
                setGachaCards(buildGachaPack());
                setSelectedGachaCardId(null);
                setGachaClaimTarget(null);
                setShowGacha(true);
                new Audio("https://assets.mixkit.co/sfx/preview/mixkit-ethereal-fairy-win-sound-2019.mp3").play().catch(() => { });
            }, dropResult?.loot ? 1800 : 900);
        }
        const finalCoins = applyEconomyPatch({
            coinsDelta: rewardResult.earnedCoins + (dropResult?.coinsDelta ?? 0),
            itemDelta: dropResult?.itemDelta ?? {},
        }).coins;
        recordCompletedDrill();

        setRebuildBattleElo(nextElo);
        setRebuildBattleStreak(nextStreak);
        setEloChange(change);
        setEloBreakdown(eloResult.breakdown);

        void loadLocalProfile().then(async (profile) => {
            const nextMaxElo = Math.max(profile?.rebuild_max_elo ?? rebuildBattleElo ?? DEFAULT_BASE_ELO, nextElo);
            if (profile) {
                await settleBattle({
                    mode: "rebuild",
                    eloAfter: nextElo,
                    change,
                    streak: nextStreak,
                    maxElo: nextMaxElo,
                    coins: finalCoins,
                    inventory: inventoryRef.current,
                    ownedThemes: ownedThemes,
                    activeTheme: cosmeticTheme,
                    source: "battle",
                });
            }
            setRebuildPassageSummary({
                sessionObjectiveScore100: aggregate.sessionObjectiveScore100,
                sessionSelfScore100: aggregate.sessionSelfScore100,
                sessionScore100: aggregate.sessionScore100,
                sessionBattleScore10: aggregate.sessionBattleScore10,
                segmentCount,
                eloAfter: nextElo,
                change,
                streak: nextStreak,
                maxElo: nextMaxElo,
                coinsEarned: rewardResult.earnedCoins + (dropResult?.coinsDelta ?? 0),
                settledAt: Date.now(),
            });
        }).catch((error) => {
            console.error("Failed to settle rebuild passage battle", error);
        });
    }, [
        applyEconomyPatch,
        cosmeticTheme,
        drillData,
        isRebuildPassage,
        learningSessionActive,
        ownedThemes,
        passageSession?.segments.length,
        persistRebuildHiddenElo,
        pushEconomyFx,
        recordCompletedDrill,
        rebuildPassageResults,
        rebuildBattleElo,
        rebuildBattleStreak,
        rebuildPassageSummary,
        rebuildFeedback,
        rebuildHiddenElo,
        activePassageSegmentIndex,
    ]);

    // 1/2/3 keys for self-evaluation + spacebar audio on Rebuild feedback page
    useEffect(() => {
        if (!isRebuildMode || !rebuildFeedback || isRebuildPassage) return;

        const handleFeedbackKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.altKey || e.ctrlKey || e.metaKey) return;

            // Spacebar -> play audio on scoring page
            if (e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                if (!isPlaying) {
                    void playAudio();
                }
                return;
            }

            // 1/2/3 -> self evaluation (only before already evaluated)
            if (!rebuildFeedback.selfEvaluation) {
                if (e.key === "1") { e.preventDefault(); handleRebuildSelfEvaluate("easy"); }
                else if (e.key === "2") { e.preventDefault(); handleRebuildSelfEvaluate("just_right"); }
                else if (e.key === "3") { e.preventDefault(); handleRebuildSelfEvaluate("hard"); }
            }
        };

        window.addEventListener("keydown", handleFeedbackKey);
        return () => window.removeEventListener("keydown", handleFeedbackKey);
    }, [isRebuildMode, isRebuildPassage, rebuildFeedback, handleRebuildSelfEvaluate, isPlaying, playAudio]);

    useEffect(() => {
        if (!isRebuildMode || activeDrillSourceMode !== "bank" || !rebuildFeedback || rebuildFeedback.selfEvaluation || isGeneratingDrill) {
            clearRebuildChoicePrefetch();
            return;
        }

        clearRebuildChoicePrefetch();
        const controller = new AbortController();
        rebuildChoicePrefetchAbortRef.current = controller;

        const baseExcludeIds = listeningBankExcludeIdsKey
            ? listeningBankExcludeIdsKey.split("|").filter(Boolean)
            : [];

        const prefetchChoices = async () => {
            const nextChoices: Partial<Record<RebuildSelfEvaluation, PrefetchedDrillData>> = {};
            const usedExcludeIds = new Set(baseExcludeIds);
            const options: RebuildSelfEvaluation[] = ["easy", "just_right", "hard"];

            for (const evaluation of options) {
                const delta = clampRebuildDifficultyDelta(rebuildFeedback.systemDelta + getRebuildSelfEvaluationDelta(evaluation));
                const nextElo = Math.max(0, Math.min(3200, rebuildHiddenElo + delta));
                const targetTopic = resolveBattleScenarioTopic(context.articleTitle || context.topic, nextElo);

                const response = await fetch("/api/drill/next", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        articleTitle: targetTopic,
                        articleContent: context.articleContent || "",
                        difficulty: getEloDifficulty(nextElo, mode).level,
                        eloRating: nextElo,
                        mode: generationMode,
                        sourceMode: activeDrillSourceMode,
                        excludeBankIds: Array.from(usedExcludeIds),
                        _t: Date.now() + Math.random(),
                    }),
                    signal: controller.signal,
                });

                if (controller.signal.aborted) return;

                const data = await response.json();
                if (controller.signal.aborted) return;
                if (!response.ok || data?.error) {
                    throw new Error(data?.error || `Failed to prefetch rebuild drill for ${evaluation}`);
                }

                const nextChoice: PrefetchedDrillData = { ...data, mode, sourceMode: activeDrillSourceMode };
                nextChoices[evaluation] = nextChoice;

                const bankId = nextChoice._sourceMeta?.sourceMode === "bank"
                    ? nextChoice._sourceMeta.bankItemId
                    : undefined;
                if (bankId) {
                    usedExcludeIds.add(bankId);
                }

                if (typeof nextChoice.reference_english === "string" && nextChoice.reference_english.trim()) {
                    try {
                        await ensureAudioCached(nextChoice.reference_english);
                    } catch (error) {
                        console.error(`[Rebuild Prefetch] Audio prewarm failed for ${evaluation}:`, error);
                    }
                }
            }

            if (!controller.signal.aborted) {
                prefetchedRebuildChoicesRef.current = nextChoices;
            }
        };

        prefetchChoices().catch((error) => {
            if ((error as { name?: string })?.name !== "AbortError") {
                console.error("[Rebuild Prefetch] Failed to prefetch difficulty branches:", error);
            }
        });

        return () => {
            controller.abort();
            if (rebuildChoicePrefetchAbortRef.current === controller) {
                rebuildChoicePrefetchAbortRef.current = null;
            }
            prefetchedRebuildChoicesRef.current = {};
        };
    }, [
        activeDrillSourceMode,
        clearRebuildChoicePrefetch,
        context.articleContent,
        context.articleTitle,
        context.topic,
        ensureAudioCached,
        generationMode,
        isGeneratingDrill,
        isRebuildMode,
        listeningBankExcludeIdsKey,
        mode,
        rebuildFeedback,
        rebuildHiddenElo,
    ]);

    const handleMagicHint = async () => {
        if (learningSessionActive) return;
        if (!drillData || !drillData.reference_english) return;
        if (isHintLoading) return;
        if (getItemCount('hint_ticket') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: 'Hint 道具不足，请先去商场购买' });
            return;
        }

        setIsHintLoading(true);

        try {
            applyEconomyPatch({ itemDelta: { hint_ticket: -1 } });
            const fullReference = drillData.reference_english.trim();
            setFullReferenceHint(prev => ({ version: prev.version + 1, text: fullReference }));
            pushEconomyFx({ kind: 'item_consume', itemId: 'hint_ticket', amount: 1, message: '已消耗 1 Hint 道具', source: 'hint' });
        } catch (error) {
            console.error('[Hint] Failed to generate hint:', error);
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: '提示生成失败，请重试' });
        } finally {
            setIsHintLoading(false);
        }
    };

    const handleRevealVocabHint = useCallback(() => {
        if (learningSessionActive) return false;
        if (!drillData) return false;
        const keywords = (drillData.target_english_vocab || drillData.key_vocab || []) as string[];
        if (keywords.length === 0) return false;
        if (vocabHintRevealRef.current) return true;

        if (getItemCount('vocab_ticket') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: '关键词提示券不足，请先去商场购买' });
            return false;
        }

        vocabHintRevealRef.current = true;
        applyEconomyPatch({ itemDelta: { vocab_ticket: -1 } });
        setIsVocabHintRevealed(true);
        pushEconomyFx({ kind: 'item_consume', itemId: 'vocab_ticket', amount: 1, message: '已消耗 1 关键词券', source: 'vocab' });
        return true;
    }, [applyEconomyPatch, drillData, getItemCount, learningSessionActive, pushEconomyFx]);

    const handlePredictionRequest = useCallback(() => {
        if (learningSessionActive) return false;
        if (getItemCount('capsule') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            return false;
        }

        return true;
    }, [getItemCount, learningSessionActive]);

    const handlePredictionShown = useCallback(() => {
        if (learningSessionActive) return;
        applyEconomyPatch({ itemDelta: { capsule: -1 } });
        pushEconomyFx({ kind: 'item_consume', itemId: 'capsule', amount: 1, message: '已消耗 1 胶囊', source: 'tab' });
    }, [applyEconomyPatch, learningSessionActive, pushEconomyFx]);

    const handleTranslationReferencePlayback = async () => {
        if (learningSessionActive) return false;
        if (mode !== 'translation' || !drillData?.reference_english || drillFeedback) {
            await playAudio();
            return;
        }

        if (isAudioLoading) return;

        if (translationAudioUnlockRef.current) {
            await playAudio();
            return;
        }

        if (getItemCount('audio_ticket') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            openShopForItem('audio_ticket', '朗读券不足，请先去商场购买');
            return;
        }

        translationAudioUnlockRef.current = true;
        setIsTranslationAudioUnlocked(true);
        applyEconomyPatch({ itemDelta: { audio_ticket: -1 } });

        const played = await playAudio();

        if (!played) {
            translationAudioUnlockRef.current = false;
            setIsTranslationAudioUnlocked(false);
            applyEconomyPatch({ itemDelta: { audio_ticket: 1 } });
            setLootDrop({ type: 'exp', amount: 0, rarity: 'common', message: '参考句播放失败，已退还 1 张朗读券' });
            return;
        }

        pushEconomyFx({ kind: 'item_consume', itemId: 'audio_ticket', amount: 1, message: '已消耗 1 朗读券', source: 'audio' });
    };

    const handleReportTooHardAndAdvance = useCallback(async () => {
        if (
            mode !== "translation"
            || learningSessionActive
            || !drillData
            || Boolean(drillFeedback)
            || isSubmittingDrill
            || isGeneratingDrill
            || showGacha
            || isReportingTooHard
        ) {
            return false;
        }

        const penalty = TRANSLATION_TOO_HARD_PENALTY;
        const currentTranslationElo = eloRatingRef.current || eloRating || DEFAULT_BASE_ELO;
        const newElo = applyTranslationTooHardPenalty(currentTranslationElo, penalty);

        setIsReportingTooHard(true);
        setEloRating(newElo);
        setStreakCount(0);
        setEloChange(-penalty);
        setLootDrop({
            type: "exp",
            amount: -penalty,
            rarity: "common",
            message: "已报告太难，Elo -25，已切到更简单题目",
        });

        try {
            const profile = await loadLocalProfile();
            if (profile) {
                await settleBattle({
                    mode: "translation",
                    eloAfter: newElo,
                    change: -penalty,
                    streak: 0,
                    maxElo: Math.max(profile.max_elo ?? DEFAULT_BASE_ELO, newElo),
                    coins: coinsRef.current ?? profile.coins ?? DEFAULT_STARTING_COINS,
                    inventory: inventoryRef.current,
                    ownedThemes: ownedThemes,
                    activeTheme: cosmeticTheme,
                    source: "too_hard_skip",
                });
            }
        } catch (error) {
            console.error("Failed to sync too-hard skip penalty", error);
        }

        try {
            await handleGenerateDrill(undefined, undefined, true, newElo);
        } finally {
            setIsReportingTooHard(false);
        }

        return true;
    }, [
        cosmeticTheme,
        drillData,
        drillFeedback,
        eloRating,
        handleGenerateDrill,
        isGeneratingDrill,
        isReportingTooHard,
        isSubmittingDrill,
        learningSessionActive,
        mode,
        ownedThemes,
        showGacha,
    ]);

    const handleRefreshDrill = useCallback(() => {
        if (learningSessionActive) return false;
        if (isGeneratingDrill || !drillData || !!drillFeedback) return false;
        if (getItemCount('refresh_ticket') <= 0) {
            setIsHintShake(true);
            setTimeout(() => setIsHintShake(false), 500);
            openShopForItem('refresh_ticket', '刷新卡不足，请先去商场购买');
            return false;
        }

        applyEconomyPatch({ itemDelta: { refresh_ticket: -1 } });
        pushEconomyFx({ kind: 'item_consume', itemId: 'refresh_ticket', amount: 1, message: '已消耗 1 刷新卡', source: 'refresh' });
        setPrefetchedDrillData(null);
        handleGenerateDrill(undefined, undefined, true);
        return true;
    }, [applyEconomyPatch, drillData, drillFeedback, getItemCount, handleGenerateDrill, isGeneratingDrill, learningSessionActive, openShopForItem, pushEconomyFx]);

    const handleBuyItem = useCallback((itemId: ShopItemId) => {
        const item = ITEM_CATALOG[itemId];
        if (coinsRef.current < item.price) return false;

        applyEconomyPatch({
            coinsDelta: -item.price,
            itemDelta: { [itemId]: 1 },
        });
        pushEconomyFx({ kind: 'item_purchase', itemId, amount: 1, message: `已购买 ${item.name}`, source: 'shop' });
        return true;
    }, [applyEconomyPatch, pushEconomyFx]);

    const handleBuyTheme = useCallback((themeId: CosmeticThemeId) => {
        const themeDef = COSMETIC_THEMES[themeId];
        if (!themeDef || ownedThemes.includes(themeId)) return false;
        if (coinsRef.current < themeDef.price) return false;

        applyEconomyPatch({ coinsDelta: -themeDef.price });
        const nextOwned = [...ownedThemes, themeId];
        setOwnedThemes(nextOwned);
        setCosmeticTheme(themeId);
        persistProfilePatch({ owned_themes: nextOwned, active_theme: themeId });
        return true;
    }, [applyEconomyPatch, ownedThemes, persistProfilePatch]);

    const handleSwitchTheme = useCallback((themeId: CosmeticThemeId) => {
        if (!ownedThemes.includes(themeId)) return;
        setCosmeticTheme(themeId);
        persistProfilePatch({ active_theme: themeId });
    }, [ownedThemes, persistProfilePatch]);

    // --- Interactive Renderers (Ported) ---

    const normalizeWordPopupText = useCallback((text: string) => (
        text
            .replace(/[‘’]/g, "'")
            .replace(/[^a-zA-Z\s'-]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
    ), []);

    const extractSelectionPopupText = useCallback((selection: Selection | null) => {
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";

        const range = selection.getRangeAt(0);
        const directText = normalizeWordPopupText(selection.toString());
        if (directText.includes(" ")) {
            return directText.slice(0, 80);
        }

        const anchorElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? range.commonAncestorContainer as Element
            : range.commonAncestorContainer.parentElement;
        const root = anchorElement?.closest("[data-word-popup-root='true']");
        if (!root) {
            return directText.slice(0, 80);
        }

        const selectedSegments = Array.from(root.querySelectorAll<HTMLElement>("[data-word-popup-segment]"))
            .filter((node) => {
                try {
                    return range.intersectsNode(node);
                } catch {
                    return false;
                }
            })
            .map((node) => node.dataset.wordPopupSegment?.trim() ?? "")
            .filter(Boolean);

        if (selectedSegments.length < 2) {
            return directText.slice(0, 80);
        }

        return normalizeWordPopupText(selectedSegments.join(" ")).slice(0, 80);
    }, [normalizeWordPopupText]);

    const getCurrentSelectionFocusSpan = useCallback(() => {
        if (typeof window === "undefined") return "";
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return "";

        return extractSelectionPopupText(selection);
    }, [extractSelectionPopupText]);

    const closeRebuildTutorPopup = useCallback(() => {
        setRebuildTutorSession((current) => current ? { ...current, isOpen: false } : current);
    }, []);

    const openRebuildTutorPopup = useCallback((event?: React.MouseEvent<HTMLElement> | { x: number; y: number }, explicitFocusSpan?: string) => {
        if (!isRebuildMode || !drillData?._rebuildMeta) return;

        const focusSpan = explicitFocusSpan || getCurrentSelectionFocusSpan() || rebuildTutorSession?.focusSpan || "";
        const anchorX = event && "clientX" in event
            ? event.clientX
            : event?.x ?? rebuildTutorSession?.anchorPoint.x ?? (typeof window !== "undefined" ? window.innerWidth / 2 : 320);
        const anchorY = event && "clientY" in event
            ? event.clientY
            : event?.y ?? rebuildTutorSession?.anchorPoint.y ?? (typeof window !== "undefined" ? window.innerHeight / 2 : 240);

        setWordPopup(null);
        setIsTutorOpen(false);
        setRebuildTutorSession((current) => ({
            sessionId: current?.sessionId ?? `${Date.now()}`,
            anchorPoint: { x: anchorX, y: anchorY },
            focusSpan,
            teachingPoint: current?.teachingPoint || activeTutorTeachingPoint,
            hasBootstrappedContext: current?.hasBootstrappedContext ?? false,
            isOpen: true,
        }));
    }, [
        activeTutorTeachingPoint,
        drillData?._rebuildMeta,
        getCurrentSelectionFocusSpan,
        isRebuildMode,
        rebuildTutorSession?.anchorPoint.x,
        rebuildTutorSession?.anchorPoint.y,
        rebuildTutorSession?.focusSpan,
        rebuildTutorSession?.hasBootstrappedContext,
        rebuildTutorSession?.sessionId,
        rebuildTutorSession?.teachingPoint,
    ]);

    const openWordPopupAtPosition = useCallback((text: string, x: number, y: number, contextText?: string) => {
        const normalizedText = normalizeWordPopupText(text);
        const alphaLength = normalizedText.replace(/[\s'-]/g, "").length;
        if (!normalizedText || alphaLength < 2) return false;

        const lookupKey = normalizedText.toLowerCase();
        const now = Date.now();
        const lastTrigger = lastWordPopupTriggerRef.current;
        if (lastTrigger.text === lookupKey && now - lastTrigger.at < 450) {
            return true;
        }
        lastWordPopupTriggerRef.current = { text: lookupKey, at: now };

        const sourceKind: PopupState["sourceKind"] = isRebuildMode
            ? "rebuild"
            : isListeningMode
                ? "listening"
                : isDictationMode
                    ? "dictation"
                    : "translation";
        const sourceLabel = isRebuildMode
            ? "来自 Rebuild"
            : isListeningMode
                ? "来自 Listening"
                : isDictationMode
                    ? "来自 Dictation"
                    : "来自 Translation";

        setWordPopup({
            word: normalizedText,
            context: contextText || drillData?.reference_english || "",
            x,
            y,
            sourceKind,
            sourceLabel,
            sourceSentence: drillData?.reference_english || contextText || "",
            sourceNote: "",
        });
        return true;
    }, [drillData?.reference_english, isDictationMode, isListeningMode, isRebuildMode, normalizeWordPopupText]);

    const openWordPopupAtElement = useCallback((element: HTMLElement, word: string, contextText?: string) => {
        const rect = element.getBoundingClientRect();
        return openWordPopupAtPosition(
            word,
            rect.left + rect.width / 2,
            rect.bottom + 10,
            contextText,
        );
    }, [openWordPopupAtPosition]);

    const openWordPopupFromSelection = useCallback((selection: Selection | null, contextText?: string) => {
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;

        return openWordPopupAtPosition(
            extractSelectionPopupText(selection),
            rect.left + rect.width / 2,
            rect.bottom + 10,
            contextText || selection.anchorNode?.textContent || drillData?.reference_english || "",
        );
    }, [drillData?.reference_english, extractSelectionPopupText, openWordPopupAtPosition]);

    const handleInteractiveTextMouseUp = useCallback((contextText?: string) => {
        if (typeof window === "undefined") return;
        openWordPopupFromSelection(window.getSelection(), contextText);
    }, [openWordPopupFromSelection]);

    const handleWordClick = (e: React.MouseEvent, word: string, contextText?: string) => {
        e.stopPropagation();
        if (typeof window !== "undefined" && openWordPopupFromSelection(window.getSelection(), contextText)) {
            return;
        }

        const cleanWord = normalizeWordPopupText(word).replace(/\s+/g, " ").trim();
        if (!cleanWord) return;

        if (isListeningFamilyMode && drillData?.reference_english) {
            const textKey = getSentenceAudioCacheKey(drillData.reference_english);
            const cached = audioCache.current.get(textKey);

            if (cached && cached.marks && audioRef.current) {
                const targetMark = cached.marks.find((m: any) => {
                    const mClean = m.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
                    return mClean === cleanWord.toLowerCase();
                });
                if (targetMark && isPlaying) {
                    audioRef.current.currentTime = targetMark.time / 1000;
                }
            }
        }

        openWordPopupAtElement(e.currentTarget as HTMLElement, word, contextText);
    };

    const renderInteractiveText = (text: string) => {
        // Safety check: return empty if text is undefined/null
        if (!text) return null;

        // Find existing marks for this text
        const textKey = getSentenceAudioCacheKey(drillData?.reference_english || "");
        const cached = audioCache.current.get(textKey);
        const marks = cached?.marks || [];

        return (
            <span data-word-popup-root="true">
                {text.split(" ").map((word, i) => {
                    const clean = word.replace(/[^a-zA-Z]/g, "").trim();
                    const isActive = wordPopup?.word === clean;

                    // Karaoke Highlight Check (Index-based to prevent duplicates)
                    const mark = marks[i];
                    const isKaraokeActive = isPlaying && !isActive && mark && (() => {
                        const mClean = mark.value.replace(/[^a-zA-Z]/g, "").toLowerCase();
                        const wordMatch = mClean === clean.toLowerCase();
                        const timeMatch = currentAudioTime >= mark.start && currentAudioTime <= (mark.end + 200);
                        return wordMatch && timeMatch;
                    })();

                    return (
                        <span key={i} className="relative inline-block">
                            <span
                                data-word-popup-segment={word}
                                onClick={(e) => handleWordClick(e, word, text)}
                                onMouseUp={() => handleInteractiveTextMouseUp(text)}
                                className={cn(
                                    "cursor-pointer px-1.5 py-0.5 transition-all duration-300 rounded-lg mx-[1px] relative",
                                    "hover:text-rose-600 hover:bg-rose-50/60 hover:scale-105",
                                    getBattleInteractiveWordClassName({
                                        isActive,
                                        isKaraokeActive,
                                    })
                                )}
                            >
                                {word}
                            </span>
                            {" "}
                        </span>
                    );
                })}
            </span>
        );
    };

    const renderInteractiveCoachText = (text: string) => {
        if (!text) return null;

        return (
            <span data-word-popup-root="true">
                {text.split(" ").map((word, i) => {
                    const clean = word.replace(/[^a-zA-Z]/g, "").trim();
                    const isActive = clean && wordPopup?.word?.toLowerCase() === clean.toLowerCase();

                    return (
                        <span key={`${word}-${i}`} className="inline-block">
                            <span
                                data-word-popup-segment={word}
                                onClick={(e) => handleWordClick(e, word, text)}
                                onMouseUp={() => handleInteractiveTextMouseUp(text)}
                                className={cn(
                                    "cursor-pointer rounded-lg px-1 py-0.5 transition-all duration-200",
                                    "hover:bg-stone-100/80 hover:text-stone-900",
                                    isActive ? "bg-stone-100 text-stone-900 ring-1 ring-stone-200" : "text-stone-800"
                                )}
                            >
                                {word}
                            </span>{" "}
                        </span>
                    );
                })}
            </span>
        );
    };

    const renderRebuildShadowingPanel = (params: {
        referenceEnglish: string;
        chinese: string;
    }) => {
        if (!isRebuildMode || !activeRebuildShadowingScope || !activeRebuildShadowingEntry) return null;
        const { referenceEnglish, chinese } = params;
        const shadowingResult = activeRebuildShadowingEntry.result;
        const liveTranscript = normalizeRebuildShadowingText(rebuildShadowingLiveRecognitionTranscript);
        const liveRecognitionTokens = extractWordTokens(liveTranscript)
            .map((token) => normalizeWordForMatch(token.text))
            .filter(Boolean);
        const referenceTokenCount = extractWordTokens(referenceEnglish).length;
        const shouldShowListeningProgress = rebuildShadowingState.isRecording;
        const shouldShowPostRecordingCorrection = showRebuildShadowingCorrection
            && !rebuildShadowingState.isRecording
            && !rebuildShadowingState.isProcessing
            && liveRecognitionTokens.length > 0;
        const canSubmitRebuildShadowing = Boolean(activeRebuildShadowingEntry.wavBlob) && !rebuildShadowingState.isSubmitting && liveTranscript.length > 0;
        const isReferenceAudioLoading = audioSourceText === referenceEnglish && isAudioLoading;
        const isReferenceAudioPlaying = audioSourceText === referenceEnglish && isPlaying;
        const isReferenceAudioBusy = isReferenceAudioLoading || isReferenceAudioPlaying;
        const sourceTokens = extractWordTokens(referenceEnglish);
        const referenceMarksRaw = audioCache.current.get(getSentenceAudioCacheKey(referenceEnglish))?.marks;
        const referenceWordMarks = Array.isArray(referenceMarksRaw)
            ? referenceMarksRaw.filter((mark): mark is TtsWordMark => (
                Boolean(mark)
                && typeof mark.value === "string"
                && Number.isFinite(Number(mark.start))
                && Number.isFinite(Number(mark.end))
            )).sort((left, right) => Number(left.start) - Number(right.start))
            : [];
        const sourceTokenToMarkIndex = alignTokensToMarks(sourceTokens, referenceWordMarks);
        const activeReferenceWordMarkIndex = (() => {
            if (!isReferenceAudioPlaying || referenceWordMarks.length === 0) return null;
            const timeMs = currentAudioTime;
            for (let index = 0; index < referenceWordMarks.length; index += 1) {
                const mark = referenceWordMarks[index];
                const markStart = Number(mark.start);
                const rawMarkEnd = Number(mark.end);
                const markEnd = Number.isFinite(rawMarkEnd) && rawMarkEnd > markStart
                    ? rawMarkEnd
                    : markStart + 220;
                if (timeMs >= markStart && timeMs < markEnd) {
                    return index;
                }
                if (timeMs < markStart) break;
            }
            return null;
        })();
        const pronunciationFeedback = (() => {
            const targetTokens = sourceTokens
                .map((token) => ({ sourceIndex: token.index, token: normalizeWordForMatch(token.text) }))
                .filter((item) => Boolean(item.token));

            if (!shouldShowPostRecordingCorrection) {
                return {
                    tokenStates: new Map<number, RebuildShadowingTokenState>(),
                    correctCount: 0,
                    totalCount: targetTokens.length,
                };
            }

            const { tokenStates, correctCount } = alignRebuildShadowingTokens({
                targetTokens,
                spokenTokens: liveRecognitionTokens,
            });
            return {
                tokenStates,
                correctCount,
                totalCount: targetTokens.length,
            };
        })();
        const rebuildListeningSummary = (() => {
            if (!shadowingResult) return null;
            const transcript = normalizeRebuildShadowingText(shadowingResult.transcript || liveTranscript);
            const metrics = scoreRebuildShadowingRecognition(referenceEnglish, transcript);
            const score = metrics.score;
            return {
                score,
                detail: `匹配 ${metrics.correctCount}/${Math.max(1, metrics.totalCount)} 个词，系统自动评分 ${score}/100`,
            };
        })();
        const sourceSentenceKaraokeContent = (() => {
            if (!referenceEnglish || sourceTokens.length === 0) return referenceEnglish;

            let cursor = 0;
            const parts: ReactNode[] = [];

            for (const token of sourceTokens) {
                if (token.start > cursor) {
                    parts.push(
                        <span key={`plain-${token.index}-${cursor}`}>
                            {referenceEnglish.slice(cursor, token.start)}
                        </span>,
                    );
                }

                const tokenState = pronunciationFeedback.tokenStates.get(token.index);
                const markIndex = sourceTokenToMarkIndex.get(token.index);
                const isActiveWord = isReferenceAudioPlaying
                    && typeof markIndex === "number"
                    && activeReferenceWordMarkIndex === markIndex;
                const isPassedWord = isReferenceAudioPlaying
                    && typeof markIndex === "number"
                    && activeReferenceWordMarkIndex !== null
                    && markIndex < activeReferenceWordMarkIndex;
                parts.push(
                    <span
                        key={`token-${token.index}-${token.start}`}
                        data-word-popup-segment={token.text}
                        onClick={(event) => handleWordClick(event, token.text, referenceEnglish)}
                        onMouseUp={() => handleInteractiveTextMouseUp(referenceEnglish)}
                        className={cn(
                            "cursor-pointer rounded-[0.38em] px-[0.08em] py-[0.01em] transition-colors duration-220 ease-out hover:bg-[#f3f4f6]/60",
                            isActiveWord
                                ? "bg-[#ffd970] text-[#7a3f00] shadow-[0_0_0_1px_rgba(234,163,27,0.42)]"
                                : "",
                            isPassedWord
                                ? "text-[#6b6358]"
                                : "",
                            !isReferenceAudioPlaying && shouldShowListeningProgress && token.index < rebuildListeningProgressCursor
                                ? "bg-[#eef4ff] text-[#3f5f9a]"
                                : "",
                            !isReferenceAudioPlaying && shouldShowListeningProgress && token.index === rebuildListeningProgressCursor
                                ? "bg-[#ddeaff] text-[#2f58b0] shadow-[inset_0_-1px_0_rgba(78,122,219,0.22)]"
                                : "",
                            !isReferenceAudioPlaying && shouldShowPostRecordingCorrection && tokenState === "correct"
                                ? "text-[#2f6f4d]"
                                : "",
                            !isReferenceAudioPlaying && shouldShowPostRecordingCorrection && (tokenState === "incorrect" || tokenState === "missed")
                                ? "text-[#8e4a4a] underline decoration-[#d97a7a] decoration-2 underline-offset-[0.22em]"
                                : "",
                        )}
                    >
                        {referenceEnglish.slice(token.start, token.end)}
                    </span>,
                );
                cursor = token.end;
            }

            if (cursor < referenceEnglish.length) {
                parts.push(
                    <span key={`plain-tail-${cursor}`}>
                        {referenceEnglish.slice(cursor)}
                    </span>,
                );
            }

            return parts;
        })();

        return (
            <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.15 : 0.28 }}
                className="rounded-[1.6rem] border-[3px] border-[#e9dfd1] bg-[#fff8ef] p-4 md:p-5"
            >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#a18f7b]">rebuild shadowing</p>
                        <p className="mt-2 text-sm leading-7 text-[#6e6256]">
                            可选训练反馈，评分仅用于跟读改进，不计入 Elo / 连胜。
                        </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border-2 border-[#80dcb7] bg-[#e7f9ef] px-3 py-1 text-[11px] font-black text-[#20895f]">
                        训练模式 · 不计 Elo
                    </span>
                </div>

                <div className="mt-4 rounded-[1.4rem] border-[3px] border-[#e9dfd1] bg-white/90 px-4 py-5 md:px-6">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#a18f7b]">source sentence</p>
                    <p
                        data-word-popup-root="true"
                        onMouseUp={() => handleInteractiveTextMouseUp(referenceEnglish)}
                        className={cn(
                            "mt-3 rounded-[0.95rem] px-2 py-1 font-bold text-[#3a322c] transition-all duration-250 text-lg leading-8 md:text-[1.55rem] md:leading-[2.2rem]",
                            (rebuildShadowingState.isRecording || isReferenceAudioBusy || shouldShowPostRecordingCorrection)
                                ? "bg-[#fff4cf] shadow-[0_0_0_2px_rgba(243,184,84,0.35),0_10px_24px_rgba(243,184,84,0.16)]"
                                : "",
                        )}
                    >
                        {sourceSentenceKaraokeContent}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[#6e6256]">{chinese}</p>
                </div>

                <div className="mt-4">
                    <ListeningShadowingControls
                        onPlayReference={() => { void playAudio(referenceEnglish); }}
                        onToggleRecording={() => {
                            if (rebuildShadowingState.isRecording) {
                                handleStopRebuildShadowingRecording();
                                return;
                            }
                            void handleStartRebuildShadowingRecording();
                        }}
                        onPlaySelfRecording={handlePlayRebuildShadowingRecording}
                        onSubmit={() => { void handleSubmitRebuildShadowing(); }}
                        isReferencePreparing={isReferenceAudioLoading}
                        isReferenceDisabled={rebuildShadowingState.isRecording || rebuildShadowingState.isProcessing}
                        referenceReadyLabel={isReferenceAudioPlaying ? "播放中..." : "听原句"}
                        isRecording={rebuildShadowingState.isRecording}
                        isRecordingProcessing={rebuildShadowingState.isProcessing}
                        isRecordToggleDisabled={rebuildShadowingState.isSubmitting}
                        hasSelfRecording={Boolean(activeRebuildShadowingEntry.wavBlob)}
                        isPlaySelfDisabled={false}
                        isSubmitting={rebuildShadowingState.isSubmitting}
                        isSubmitted={Boolean(shadowingResult)}
                        isSubmitDisabled={!canSubmitRebuildShadowing}
                        helperText="先听原句再跟读；录音结束后点“提交跟读评分”，系统给分后由你手动查看结果。"
                        progressLabel={rebuildShadowingState.isRecording
                            ? `进度 ${rebuildListeningProgressCursor}/${referenceTokenCount || 0}`
                            : shouldShowPostRecordingCorrection
                                ? `纠正 ${pronunciationFeedback.correctCount}/${pronunciationFeedback.totalCount || 0}`
                                : "等待录音"}
                        recognitionLabel={isRebuildSpeechRecognitionRunning
                            ? "跟读追踪中"
                            : shouldShowPostRecordingCorrection
                                ? "已生成纠正"
                                : "识别待机"}
                        transcriptText={rebuildShadowingState.isRecording
                            ? (liveTranscript || "正在追踪你读到的位置...")
                            : shouldShowPostRecordingCorrection
                                ? (liveTranscript || "已完成本次录音纠正。")
                                : "开始录音后，会实时跟踪你读到哪里；停止后才显示纠正。"}
                        transcriptContent={(rebuildShadowingState.isRecording || shouldShowPostRecordingCorrection) && liveTranscript
                            ? renderInteractiveCoachText(liveTranscript)
                            : undefined}
                        isSpeechRecognitionSupported={isRebuildSpeechRecognitionSupported}
                    />

                    {activeRebuildShadowingEntry.submitError ? (
                        <p className="mt-3 text-sm text-rose-600">{activeRebuildShadowingEntry.submitError}</p>
                    ) : null}
                </div>

                {shadowingResult && rebuildListeningSummary ? (
                    <div className="mt-4 rounded-[1rem] border-[3px] border-[#bfead4] bg-[#f2fff8] px-4 py-3">
                        <p className="text-sm font-black text-[#15744a]">
                            跟读评分 {rebuildListeningSummary.score}/100
                        </p>
                        <p className="mt-1 text-sm text-[#2f5d46]">{rebuildListeningSummary.detail}</p>
                    </div>
                ) : null}

                <AnimatePresence>
                    {rebuildListeningScoreFx && (
                        <motion.div
                            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.9 }}
                            animate={
                                prefersReducedMotion
                                    ? { opacity: 1 }
                                    : {
                                        opacity: [0, 1, 1],
                                        y: [20, -8, 0],
                                        scale: [0.9, 1.08, 1],
                                    }
                            }
                            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.95 }}
                            transition={{ duration: prefersReducedMotion ? 0.12 : 0.52, ease: [0.22, 1, 0.36, 1] }}
                            className={cn(
                                "relative mt-3 w-full overflow-hidden rounded-[1rem] border-[3px] px-3 py-2.5 shadow-[0_10px_0_rgba(19,14,10,0.09),0_20px_28px_rgba(0,0,0,0.08)]",
                                rebuildListeningScoreFx.tier === "excellent"
                                    ? "border-[#8ed7ad] bg-[#eafff1] text-[#155738]"
                                    : rebuildListeningScoreFx.tier === "good"
                                        ? "border-[#b9d8ff] bg-[#eef6ff] text-[#1f4b8f]"
                                        : rebuildListeningScoreFx.tier === "ok"
                                            ? "border-[#ffd7a3] bg-[#fff4e7] text-[#8f5a22]"
                                            : "border-[#f0b8b8] bg-[#fff0f0] text-[#933535]",
                            )}
                        >
                            <motion.div
                                aria-hidden
                                initial={prefersReducedMotion ? { opacity: 0 } : { x: "-120%", opacity: 0.45 }}
                                animate={prefersReducedMotion ? { opacity: 0 } : { x: "130%", opacity: 0 }}
                                transition={{ duration: 0.78, ease: "easeOut" }}
                                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/50 blur-sm"
                            />
                            <p className="text-sm font-black">{rebuildListeningScoreFx.title} · {rebuildListeningScoreFx.score}/100</p>
                            <p className="mt-1 text-xs font-semibold">{rebuildListeningScoreFx.detail}</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        );
    };

    const renderRebuildSentenceShadowingPrompt = () => {
        const sentenceFeedback = rebuildFeedback ?? pendingRebuildSentenceFeedback;
        if (!drillData || !sentenceFeedback || isRebuildPassage) return null;

        return (
            <motion.div
                key={`rebuild-shadowing-prompt-${sentenceFeedback.resolvedAt}`}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.16 : 0.3 }}
                className="mx-auto w-full max-w-3xl rounded-[1.9rem] border border-stone-100 bg-white/94 p-6 shadow-[0_18px_34px_rgba(15,23,42,0.05)]"
            >
                <div className="flex items-start gap-3">
                    <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <Headphones className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-stone-500">Rebuild 提交成功</p>
                        <h3 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">要先做 Shadowing 训练吗？</h3>
                        <p className="mt-3 text-sm leading-7 text-stone-600">
                            这是可选训练，不影响 Elo / 连胜。你可以先练一遍跟读，再回来看本题重组评分。
                        </p>
                    </div>
                </div>

                <div className="mt-5 rounded-[1.35rem] border border-sky-100 bg-sky-50/60 px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">本题句子</p>
                    <div className="mt-2 text-lg leading-8 text-stone-800 font-newsreader">
                        {renderInteractiveCoachText(drillData.reference_english)}
                    </div>
                    <p className="mt-2 text-sm leading-7 text-stone-500">{drillData.chinese}</p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={() => setRebuildSentenceShadowingFlow("shadowing")}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-emerald-300 bg-emerald-500 px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(16,185,129,0.25)] transition-all hover:-translate-y-0.5 hover:bg-emerald-600"
                    >
                        <Mic className="h-4 w-4" />
                        开始 Shadowing 训练
                    </button>
                    <button
                        type="button"
                        onClick={revealRebuildSentenceFeedback}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:bg-stone-50"
                    >
                        先看重组评分
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            </motion.div>
        );
    };

    const renderRebuildPassageShadowingPrompt = () => {
        if (!isRebuildPassage || !activePassageSegmentForShadowing || !activePassageResult) return null;

        return (
            <motion.div
                key={`rebuild-passage-shadowing-prompt-${activePassageSegmentIndex}-${activePassageResult.feedback.resolvedAt}`}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={prefersReducedMotion ? { duration: 0.14 } : { type: "spring", stiffness: 280, damping: 24, mass: 0.82 }}
                className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-[2.1rem] border border-pink-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,244,251,0.95))] p-6 shadow-[0_24px_56px_rgba(236,72,153,0.14)]"
            >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(251,207,232,0.55),transparent_70%)]" />
                <motion.div
                    className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-pink-200/45 blur-2xl"
                    animate={prefersReducedMotion ? { opacity: 0.6 } : { opacity: [0.45, 0.8, 0.45], scale: [0.95, 1.08, 0.95] }}
                    transition={{ duration: 2.8, repeat: prefersReducedMotion ? 0 : Infinity, ease: "easeInOut" }}
                />
                <div className="flex items-start gap-3">
                    <div className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pink-200 bg-pink-50 text-pink-600 shadow-[0_8px_16px_rgba(244,114,182,0.18)]">
                        <Heart className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-pink-500">Rebuild Passage · 第 {activePassageSegmentIndex + 1} 段</p>
                        <h3 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">要先做 Shadowing 训练吗？</h3>
                        <p className="mt-3 text-sm leading-7 text-stone-600">
                            可选训练，不影响 Elo / 连胜。先练一下当前段跟读，再返回短文继续就好。
                        </p>
                    </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-pink-600">
                        <Sparkles className="h-3 w-3" />
                        CUTE MODE
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-emerald-600">
                        <Headphones className="h-3 w-3" />
                        SHADOWING
                    </span>
                </div>

                <div className="mt-5 rounded-[1.45rem] border border-pink-100 bg-[linear-gradient(180deg,rgba(252,231,243,0.55),rgba(239,246,255,0.52))] px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-pink-600">当前段句子</p>
                    <div className="mt-2 text-lg leading-8 text-stone-800 font-newsreader">
                        {renderInteractiveCoachText(activePassageSegmentForShadowing.referenceEnglish)}
                    </div>
                    <p className="mt-2 text-sm leading-7 text-stone-500">{activePassageSegmentForShadowing.chinese}</p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={() => setRebuildPassageShadowingFlow("shadowing")}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pink-300 bg-gradient-to-r from-pink-500 to-rose-500 px-5 text-sm font-bold text-white shadow-[0_12px_26px_rgba(244,114,182,0.3)] transition-all hover:-translate-y-0.5 hover:from-pink-600 hover:to-rose-600"
                    >
                        <Mic className="h-4 w-4" />
                        开始 Shadowing 训练
                    </button>
                    <button
                        type="button"
                        onClick={() => setRebuildPassageShadowingFlow("idle")}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-sky-200 bg-white/92 px-5 text-sm font-semibold text-sky-700 transition-all hover:-translate-y-0.5 hover:bg-sky-50"
                    >
                        先继续短文
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            </motion.div>
        );
    };

    const renderDiff = () => {
        if (!drillData || !drillFeedback) return null;

        if (mode === "listening" && drillFeedback.word_results?.length) {
            const pronounceWord = (word: string) => {
                const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${word}&type=2`);
                audio.play().catch(() => { });
            };

            return (
                <div className="space-y-4">
                    <div className="p-5 bg-white/60 rounded-2xl border border-stone-100 shadow-sm">
                        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <BookOpen className="w-3 h-3" />
                            词级评分 <span className="text-stone-300 font-normal ml-2">点击单词可发音</span>
                        </div>
                        <div className="font-newsreader text-2xl leading-loose text-stone-800 flex flex-wrap gap-x-1 gap-y-2">
                            {drillFeedback.word_results.map((result, i) => {
                                const tooltip = [
                                    `总分 ${result.score.toFixed(1)}/10`,
                                    typeof result.accuracy_score === "number" ? `准确度 ${result.accuracy_score.toFixed(1)}` : null,
                                    typeof result.stress_score === "number" ? `重音 ${result.stress_score.toFixed(1)}` : null,
                                ].filter(Boolean).join(" · ");

                                if (result.status === "correct") {
                                    return (
                                        <span key={i} className="relative group cursor-pointer" onClick={() => pronounceWord(result.word)}>
                                            <span className="text-emerald-700 hover:bg-emerald-50 px-0.5 rounded transition-colors">{result.word}</span>
                                            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-200 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">{tooltip}</span>
                                        </span>
                                    );
                                }

                                if (result.status === "weak") {
                                    return (
                                        <span key={i} className="relative group cursor-pointer" onClick={() => pronounceWord(result.word)}>
                                            <span className="text-amber-600 font-semibold hover:bg-amber-50 px-0.5 rounded transition-colors">{result.word}</span>
                                            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-amber-600 bg-amber-50 px-1 rounded border border-amber-200 opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">{tooltip}</span>
                                        </span>
                                    );
                                }

                                return (
                                    <span key={i} className="relative group cursor-pointer" onClick={() => pronounceWord(result.word)}>
                                        <span className="text-rose-500 font-semibold underline decoration-wavy decoration-rose-300 hover:bg-rose-50 px-0.5 rounded transition-colors">{result.word}</span>
                                        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-rose-600 bg-rose-50 px-1 rounded border border-rose-200 opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">{tooltip}</span>
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }

        const comparisonTarget = isDictationMode ? drillData.chinese : drillData.reference_english;
        const cleanUser = normalizeTranslationForComparison(userTranslation);
        const cleanTarget = normalizeTranslationForComparison(comparisonTarget);
        const diffs = Diff.diffWords(cleanUser, cleanTarget);

        const elements = [];
        for (let i = 0; i < diffs.length; i++) {
            const part = diffs[i];
            if (!part.added && !part.removed) {
                elements.push(<span key={i} className="text-stone-800">{part.value}</span>);
            } else if (part.removed) {
                let correction = null;
                if (i + 1 < diffs.length && diffs[i + 1].added) {
                    correction = diffs[i + 1].value;
                    i++;
                }
                elements.push(
                    <span key={i} className="group relative inline-block cursor-help mx-1">
                        <span className="text-rose-600 decoration-2 underline decoration-wavy decoration-rose-300 bg-rose-50/50 rounded px-0.5">{part.value}</span>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] px-3 py-2 bg-stone-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                            <div className="font-bold text-rose-200 mb-0.5">Incorrect</div>
                            {correction ? <><span className="text-emerald-300 font-mono text-sm">{correction}</span></> : <span>Unnecessary word</span>}
                        </div>
                    </span>
                );
            } else if (part.added) {
                elements.push(
                    <span key={i} className="group relative inline-block cursor-help mx-0.5 align-text-bottom">
                        <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-bold border border-emerald-200 hover:scale-110 transition-transform">+</div>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] px-3 py-2 bg-stone-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                            <div className="font-bold text-emerald-300 mb-0.5">Missing Word</div>
                            <span className="font-mono text-sm">{part.value}</span>
                        </div>
                    </span>
                );
            }
        }

        return (
            <div className="space-y-4">
                <div className="p-5 bg-white/60 rounded-2xl border border-stone-100 shadow-sm">
                    <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <BookOpen className="w-3 h-3" />
                        对照修订
                    </div>
                    <div className="font-newsreader text-xl leading-loose text-stone-800 flex flex-wrap gap-x-1 gap-y-2 mb-4">
                        {elements}
                    </div>

                    <div className="pt-4 border-t border-stone-100/80 space-y-3">
                        {drillFeedback.improved_version && (
                            <div>
                                <p className="text-[10px] text-stone-400 font-sans font-bold uppercase mb-1 flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-indigo-400" /> AI 地道改写</p>
                                <p className="text-lg font-newsreader text-indigo-900 leading-relaxed font-medium">{drillFeedback.improved_version}</p>
                            </div>
                        )}
                        <div>
                            <div className="mb-1 flex items-center justify-between gap-3">
                                <p className="text-[10px] text-stone-400 font-sans font-bold uppercase">
                                    {isDictationMode ? "Standard Reference (中文参考)" : "Standard Reference (参考答案)"}
                                </p>
                                {!isDictationMode && referenceGrammarAnalysis ? (
                                    <div className="flex items-center rounded-full border border-[#dfcfab] bg-white/85 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                        <button
                                            type="button"
                                            onClick={() => setReferenceGrammarDisplayMode("core")}
                                            className={cn(
                                                "rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] transition-all",
                                                referenceGrammarDisplayMode === "core"
                                                    ? "bg-[#f3e2b5] text-[#6b4c18] shadow-[0_6px_16px_rgba(160,122,42,0.18)]"
                                                    : "text-stone-500 hover:bg-[#fcf7eb] hover:text-stone-700",
                                            )}
                                        >
                                            主干
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReferenceGrammarDisplayMode("full")}
                                            className={cn(
                                                "rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] transition-all",
                                                referenceGrammarDisplayMode === "full"
                                                    ? "bg-[#f3e2b5] text-[#6b4c18] shadow-[0_6px_16px_rgba(160,122,42,0.18)]"
                                                    : "text-stone-500 hover:bg-[#fcf7eb] hover:text-stone-700",
                                            )}
                                        >
                                            完整分析
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                            {isDictationMode ? (
                                <div className="rounded-[24px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(249,244,231,0.94))] px-4 py-4 shadow-[0_18px_44px_rgba(120,94,42,0.08)]">
                                    <p className="text-base font-newsreader text-stone-700 italic leading-relaxed md:text-[1.075rem]">&ldquo;{drillData.chinese}&rdquo;</p>
                                </div>
                            ) : isGeneratingGrammar ? (
                                <div className="rounded-[20px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,250,241,0.96),rgba(249,243,228,0.92))] px-4 py-3 text-xs text-[#8a5d1f] shadow-[0_12px_28px_rgba(120,94,42,0.06)]">
                                    语法分析生成中...
                                </div>
                            ) : referenceGrammarAnalysis ? (
                                <div className="rounded-[24px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(249,244,231,0.94))] px-4 py-4 shadow-[0_18px_44px_rgba(120,94,42,0.08)]">
                                    <p className="text-base font-newsreader text-stone-700 italic leading-relaxed md:text-[1.075rem]">
                                        &ldquo;
                                        <InlineGrammarHighlights
                                            text={drillData.reference_english}
                                            sentences={referenceGrammarAnalysis}
                                            displayMode={referenceGrammarDisplayMode}
                                            showSegmentTranslation
                                            textClassName="leading-relaxed"
                                        />
                                        &rdquo;
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-[24px] border border-[#eadcc0] bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(249,244,231,0.94))] px-4 py-4 shadow-[0_18px_44px_rgba(120,94,42,0.08)]">
                                    <p className="text-base font-newsreader text-stone-700 italic leading-relaxed md:text-[1.075rem]">&ldquo;{drillData.reference_english}&rdquo;</p>
                                </div>
                            )}
                            {!isDictationMode && grammarError ? (
                                <p className="mt-2 text-xs text-stone-400">参考句语法分析暂时不可用，已回退到普通参考句显示。</p>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderListeningMetricCards = () => {
        if (mode !== "listening" || !drillFeedback) return null;

        return (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50/70 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">总分</p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-900">{drillFeedback.utterance_scores?.total?.toFixed?.(1) ?? drillFeedback.pronunciation_score?.toFixed?.(1) ?? "--"}</p>
                </div>
                <div className="rounded-[1.4rem] border border-sky-100 bg-sky-50/70 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">内容复现</p>
                    <p className="mt-2 text-2xl font-semibold text-sky-900">{drillFeedback.utterance_scores?.content_reproduction?.toFixed?.(1) ?? drillFeedback.utterance_scores?.completeness?.toFixed?.(1) ?? "--"}</p>
                </div>
                <div className="rounded-[1.4rem] border border-amber-100 bg-amber-50/70 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">语流节奏</p>
                    <p className="mt-2 text-2xl font-semibold text-amber-900">{drillFeedback.utterance_scores?.rhythm_fluency?.toFixed?.(1) ?? drillFeedback.utterance_scores?.fluency?.toFixed?.(1) ?? drillFeedback.fluency_score?.toFixed?.(1) ?? "--"}</p>
                </div>
                <div className="rounded-[1.4rem] border border-violet-100 bg-violet-50/70 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">发音清晰</p>
                    <p className="mt-2 text-2xl font-semibold text-violet-900">{drillFeedback.utterance_scores?.pronunciation_clarity?.toFixed?.(1) ?? drillFeedback.utterance_scores?.accuracy?.toFixed?.(1) ?? drillFeedback.pronunciation_score?.toFixed?.(1) ?? "--"}</p>
                </div>
            </div>
        );
    };

    const renderListeningReplayPanel = () => {
        if (mode !== "listening" || !drillFeedback) return null;

        const transcriptText = drillFeedback.transcript?.trim();

        return (
            <div className="rounded-[1.6rem] border border-stone-200/80 bg-white/80 p-5 shadow-[0_16px_34px_rgba(28,25,23,0.05)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                            <Mic className="h-3.5 w-3.5 text-stone-400" />
                            Whisper Transcript
                        </div>
                        <div className="mt-3 rounded-[1.35rem] border border-sky-100 bg-sky-50/70 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">系统识别到你说的是</p>
                            <p className="mt-2 font-newsreader text-[1.45rem] leading-relaxed text-stone-800">
                                {transcriptText ? `“${transcriptText}”` : "这次没有拿到稳定转录，通常意味着录音太短、太轻，或者内容与目标句差距很大。"}
                            </p>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 self-start">
                        <button
                            onClick={playRecording}
                            disabled={!wavBlob}
                            className={cn(
                                "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all",
                                wavBlob
                                    ? "border-rose-200/80 bg-rose-50 text-rose-600 hover:-translate-y-0.5 hover:bg-rose-100"
                                    : "cursor-not-allowed border-stone-200 bg-stone-100/60 text-stone-400",
                            )}
                            title="播放我的录音"
                        >
                            <Play className="h-4 w-4 fill-current" />
                            播放我的录音
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const getAnalysisHighlights = () => {
        if (!drillData || !drillFeedback) return [];

        if (mode === "listening" && drillFeedback.word_results?.length) {
            return drillFeedback.word_results
                .filter((row) => row.status !== "correct")
                .sort((left, right) => left.score - right.score)
                .slice(0, 3)
                .map((row) => {
                    return {
                        kind: row.status === "weak" ? "待加强" : "低分词",
                        before: `${row.score.toFixed(1)}/10`,
                        after: row.word.toUpperCase(),
                        note: [
                            typeof row.accuracy_score === "number" ? `Accuracy ${row.accuracy_score.toFixed(1)}` : null,
                            typeof row.stress_score === "number" ? `Stress ${row.stress_score.toFixed(1)}` : null,
                        ].filter(Boolean).join(" · ") || "该词当前词级评分偏低。",
                    };
                });
        }

        if (drillFeedback.error_analysis && drillFeedback.error_analysis.length > 0) {
            return drillFeedback.error_analysis.slice(0, 3).map((err) => ({
                kind: "关键改错",
                before: err.error,
                after: err.correction,
                note: err.rule || "这里做了表达优化。",
                tip: err.tip || "",
            }));
        }

        return buildTranslationHighlights(
            userTranslation,
            drillFeedback.improved_version || (isDictationMode ? drillData.chinese : drillData.reference_english),
        );
    };

    const getAnalysisLead = () => {
        if (!drillFeedback) return "";
        if (mode === "listening") {
            const utteranceScores = drillFeedback.utterance_scores;
            if (utteranceScores) {
                return `句级评分：总分 ${utteranceScores.total.toFixed(1)} / 准确度 ${utteranceScores.accuracy.toFixed(1)} / 流利度 ${utteranceScores.fluency.toFixed(1)}`;
            }
            return "发音评分结果";
        }
        if (drillFeedback.summary_cn) return drillFeedback.summary_cn;
        if (drillFeedback.judge_reasoning) return drillFeedback.judge_reasoning;
        if (Array.isArray(drillFeedback.feedback) && drillFeedback.feedback.length > 0) return drillFeedback.feedback[0];
        if (drillFeedback.feedback?.dictation_tips?.length) return drillFeedback.feedback.dictation_tips[0];
        if (drillFeedback.feedback?.listening_tips?.length) return drillFeedback.feedback.listening_tips[0];
        if (drillFeedback.tips_cn?.length) return drillFeedback.tips_cn[0];
        if (drillFeedback.feedback?.encouragement) return drillFeedback.feedback.encouragement;
        return "本题解析已生成。";
    };

    const renderTranslationReferenceSentence = () => {
        if (!drillData) return null;

        if (referenceGrammarAnalysis) {
            return (
                <>
                    &ldquo;
                    <InlineGrammarHighlights
                        text={drillData.reference_english}
                        sentences={referenceGrammarAnalysis}
                        displayMode={referenceGrammarDisplayMode}
                        showSegmentTranslation
                        textClassName="leading-relaxed"
                    />
                    &rdquo;
                </>
            );
        }

        return <>&ldquo;{drillData.reference_english}&rdquo;</>;
    };

    const renderFeedbackSentenceRecap = () => {
        if (!drillData) return null;

        const chineseText = drillData.chinese?.trim();
        const englishText = drillData.reference_english?.trim();
        const feedbackUserTranslation = (drillFeedback as any)?.user_translation;
        const learnerText = (
            typeof feedbackUserTranslation === "string"
                ? feedbackUserTranslation
                : userTranslation
        )?.trim();

        if (!chineseText && !englishText && !learnerText) return null;

        return (
            <div className="overflow-hidden rounded-[2rem] border border-stone-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(247,248,250,0.95))] shadow-[0_18px_40px_rgba(28,25,23,0.05)]">
                <div className="p-5 md:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                                <BookOpen className="h-3.5 w-3.5 text-stone-400" />
                                句意回看
                            </div>

                            {chineseText ? (
                                <div className="mt-4 rounded-[1.6rem] border border-amber-100/80 bg-[linear-gradient(180deg,rgba(255,250,235,0.96),rgba(255,255,255,0.92))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">中文意思</p>
                                    <p className="mt-2 text-[1.35rem] leading-relaxed text-stone-900 font-newsreader md:text-[1.55rem]">
                                        {chineseText}
                                    </p>
                                </div>
                            ) : null}

                            {englishText ? (
                                <div className="mt-3 rounded-[1.5rem] border border-sky-100/80 bg-sky-50/55 px-4 py-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">英文原句</p>
                                    <div className="mt-2 text-base leading-8 text-stone-800 font-newsreader md:text-[1.05rem]">
                                        {renderInteractiveText(englishText)}
                                    </div>
                                </div>
                            ) : null}

                            {learnerText ? (
                                <div className="mt-3 rounded-[1.5rem] border border-emerald-100/80 bg-emerald-50/55 px-4 py-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">你的作答</p>
                                    <div className="mt-2 text-base leading-8 text-stone-800 font-newsreader md:text-[1.05rem]">
                                        {renderInteractiveText(learnerText)}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {englishText ? (
                            <button
                                type="button"
                                onClick={() => { void playAudio(); }}
                                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-all hover:-translate-y-0.5 hover:bg-indigo-100"
                                title="重听英文原句"
                            >
                                <Volume2 className="h-4 w-4" />
                                重听英文
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    };

    const renderTranslationTutorModal = () => {
        const isTranslationTutorSurface = mode === "translation";
        const isEnglishQaSurface = false;
        if (!isTranslationTutorSurface || !drillData || !isTutorOpen) return null;

        const title = isEnglishQaSurface ? "英语问答" : "AI Teacher";
        const teachingPoint = activeTutorTeachingPoint;
        const description = isEnglishQaSurface
            ? "围着这句英文直接问词义、短语、搭配或语法，不讲评分，只回答你卡住的那个点。"
            : "翻译过程中卡住时，把它当老师来问：先从你已经会的点出发，再帮你补当前词、搭配或句型。";
        const inputPlaceholder = isEnglishQaSurface
            ? "问这个词、短语或语法点..."
            : "继续问这个词、搭配或句型...";
        const submitLabel = isEnglishQaSurface ? "开始提问" : "继续提问";
        const presetActions = isEnglishQaSurface
            ? [
                { label: "这个短语什么意思", question: "这个短语在这句里是什么意思？", questionType: "word_choice" as TutorQuestionType },
                { label: "为什么这样排", question: "这句为什么这样排词序？请只讲这句的结构。", questionType: "pattern" as TutorQuestionType },
                { label: "这个词怎么搭配", question: "这个词在这句里怎么搭配更自然？", questionType: "word_choice" as TutorQuestionType },
                { label: "同结构例句", question: "再给我一个同结构的例句让我模仿。", questionType: "example" as TutorQuestionType },
            ]
            : [
                { label: "给我模板", question: "给我一个这题可复用的句型模板。", questionType: "pattern" as TutorQuestionType },
                { label: "搭配怎么用", question: "这里更自然的说法是什么？只告诉我这个词或搭配怎么用。", questionType: "word_choice" as TutorQuestionType },
                { label: "同结构例句", question: "再给我一个同结构的例句让我模仿。", questionType: "example" as TutorQuestionType },
            ];
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
                onClick={() => setIsTutorOpen(false)}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    onClick={(e) => e.stopPropagation()}
                    className={cn("w-full max-w-[680px] max-h-[min(84vh,760px)] overflow-hidden rounded-[2rem] border p-4 shadow-[0_30px_90px_rgba(15,23,42,0.22)] md:p-5", activeCosmeticUi.tutorPanelClass)}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={cn("text-sm font-semibold flex items-center gap-1.5", activeCosmeticUi.tutorSendClass)}>
                                    <MessageCircle className="w-4 h-4" />
                                    {title}
                                </span>
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                                    {teachingPoint}
                                </span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-stone-500">
                                {description}
                            </p>
                        </div>
                        <button type="button" onClick={() => setIsTutorOpen(false)} className="rounded-full border border-stone-200 bg-white/80 p-2 text-stone-500 transition-all hover:bg-white hover:text-stone-700">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="mt-4 flex flex-nowrap gap-2 overflow-x-auto pb-1 pr-1">
                        {presetActions.map((preset) => (
                            <button
                                key={preset.label}
                                type="button"
                                onClick={() => handleAskTutor({ question: preset.question, questionType: preset.questionType })}
                                disabled={isAskingTutor}
                                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {isRebuildTutorSurface && (
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-[11px] font-semibold text-stone-500">回答长度</span>
                            <div className="inline-flex items-center rounded-full border border-stone-200 bg-white/85 p-0.5">
                                {[
                                    { value: "simple", label: "简单" },
                                    { value: "adaptive", label: "自适应" },
                                    { value: "detailed", label: "详细" },
                                ].map((option) => (
                                    <button
                                        key={`rebuild-tutor-answer-mode-${option.value}`}
                                        type="button"
                                        onClick={() => setTutorAnswerMode(option.value as TutorAnswerMode)}
                                        disabled={isAskingTutor}
                                        className={cn(
                                            "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                            tutorAnswerMode === option.value
                                                ? "bg-fuchsia-600 text-white shadow-sm"
                                                : "text-stone-500 hover:bg-stone-100 hover:text-stone-700",
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div ref={tutorConversationRef} className="mt-4 max-h-[calc(min(84vh,760px)-13rem)] overflow-y-auto pr-1">
                        {tutorThread.length || tutorPendingQuestion || tutorAnswer ? (
                            <AiTeacherConversation
                                turns={tutorThread}
                                pendingQuestion={tutorPendingQuestion}
                                pendingAnswer={tutorPendingQuestion ? tutorAnswer : null}
                                fallbackAnswer={!tutorThread.length ? tutorAnswer : null}
                                onPlayCardAudio={handlePlayTutorCardAudio}
                            />
                        ) : (
                            <p className="text-xs text-stone-500">
                                {isEnglishQaSurface
                                    ? "先问一个具体点，比如某个词、短语、搭配或语法；它会围着这句英文直接拆给你。"
                                    : "先问一个具体卡点，比如某个词、搭配或语序；老师会先接住你已经会的，再补新的。"}
                            </p>
                        )}
                    </div>

                    <form
                        className="mt-4 flex flex-col gap-2 sm:flex-row"
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleAskTutor({ questionType: "follow_up" });
                        }}
                    >
                        <input
                            type="text"
                            value={tutorQuery}
                            onChange={(e) => setTutorQuery(e.target.value)}
                            placeholder={inputPlaceholder}
                            className={cn("h-11 flex-1 rounded-xl border px-3 text-sm focus:outline-none focus:ring-1", activeCosmeticUi.tutorInputClass)}
                        />
                        <button
                            type="submit"
                            disabled={isAskingTutor || !tutorQuery.trim()}
                            className={cn("inline-flex h-11 min-w-[110px] items-center justify-center gap-1.5 rounded-xl border border-transparent px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50", activeCosmeticUi.analysisButtonClass)}
                        >
                            {isAskingTutor ? <Sparkles className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                            {isAskingTutor ? "思考中" : submitLabel}
                        </button>
                    </form>

                    {!isEnglishQaSurface && !tutorResponse?.answer_revealed && (
                        <div className="mt-2 flex items-center justify-start gap-2">
                            <button
                                type="button"
                                onClick={() => handleAskTutor({ question: "我想看参考表达，并解释为什么这样说。", questionType: "unlock_answer", forceReveal: true })}
                                disabled={isAskingTutor}
                                className="inline-flex min-h-9 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-all hover:-translate-y-0.5 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                我想看参考表达
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        );
    };

    const renderRebuildTutorPopup = () => {
        if (!drillData || !rebuildTutorSession?.isOpen) return null;

        return (
            <RebuildTutorPopup
                popup={rebuildTutorSession}
                query={tutorQuery}
                turns={tutorThread}
                pendingQuestion={tutorPendingQuestion}
                pendingAnswer={tutorPendingQuestion ? tutorAnswer : null}
                fallbackAnswer={!tutorThread.length ? tutorAnswer : null}
                isAsking={isAskingTutor}
                thinkingMode={tutorThinkingMode}
                answerMode={tutorAnswerMode}
                mutedTextClass={activeCosmeticTheme.mutedClass}
                panelClass={activeCosmeticUi.tutorPanelClass}
                inputClass={activeCosmeticUi.tutorInputClass}
                sendButtonClass={activeCosmeticUi.analysisButtonClass}
                conversationRef={tutorConversationRef}
                onClose={closeRebuildTutorPopup}
                onPlayCardAudio={handlePlayTutorCardAudio}
                onQueryChange={setTutorQuery}
                onThinkingModeChange={setTutorThinkingMode}
                onAnswerModeChange={setTutorAnswerMode}
                onSubmit={() => { void handleAskTutor({ questionType: "follow_up" }); }}
            />
        );
    };

    const renderTranslationAnalysisDetails = () => {
        const details = fullAnalysisData;
        if (!details) return null;

        return (
            <div className="space-y-4">
                {details.diagnosis_summary_cn ? (
                    <div className="rounded-[1.75rem] border border-stone-100 bg-white/90 p-5 shadow-[0_12px_30px_rgba(28,25,23,0.04)]">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            核心判断
                        </h4>
                        <p className="mt-3 text-sm leading-7 text-stone-600">{details.diagnosis_summary_cn}</p>
                    </div>
                ) : null}

                {details.chinglish_vs_natural ? (
                    <div className="rounded-[1.75rem] border border-orange-100 bg-orange-50/40 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                            <Sparkles className="w-3.5 h-3.5" />
                            中式对比
                        </h4>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-rose-100/80 bg-white/85 p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-500">Chinglish</p>
                                <p className="mt-2 font-newsreader text-lg italic text-rose-700">{details.chinglish_vs_natural.chinglish}</p>
                            </div>
                            <div className="rounded-2xl border border-emerald-100/80 bg-white/85 p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Natural</p>
                                <p className="mt-2 font-newsreader text-lg italic text-emerald-800">{details.chinglish_vs_natural.natural}</p>
                            </div>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-stone-600">{details.chinglish_vs_natural.reason_cn}</p>
                    </div>
                ) : null}

                {details.common_pitfall ? (
                    <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50/40 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            易错提醒
                        </h4>
                        <p className="mt-3 text-sm leading-7 text-stone-600">{details.common_pitfall.pitfall_cn}</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-rose-100/80 bg-white/85 p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-500">Wrong</p>
                                <p className="mt-2 font-newsreader text-lg italic text-rose-700">{details.common_pitfall.wrong_example}</p>
                            </div>
                            <div className="rounded-2xl border border-emerald-100/80 bg-white/85 p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Right</p>
                                <p className="mt-2 font-newsreader text-lg italic text-emerald-800">{details.common_pitfall.right_example}</p>
                            </div>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-stone-600">{details.common_pitfall.why_cn}</p>
                    </div>
                ) : null}

                {details.phrase_synonyms && details.phrase_synonyms.length > 0 ? (
                    <div className="rounded-[1.75rem] border border-sky-100 bg-sky-50/40 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-600">
                            <BookOpen className="w-3.5 h-3.5" />
                            短语同义替换
                        </h4>
                        <div className="mt-4 space-y-3">
                            {details.phrase_synonyms.map((item, i: number) => (
                                <div key={`${item.source_phrase}-${i}`} className="rounded-2xl border border-sky-100/80 bg-white/85 p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-500">Source Phrase</p>
                                    <p className="mt-2 font-newsreader text-lg italic text-stone-900">{item.source_phrase}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {item.alternatives.map((alternative, altIndex) => (
                                            <span key={`${alternative}-${altIndex}`} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                                                {alternative}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="mt-3 text-sm leading-6 text-stone-600">{item.nuance_cn}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {details.transfer_pattern ? (
                    <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50/35 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                            <Sparkles className="w-3.5 h-3.5" />
                            可迁移句型
                        </h4>
                        <div className="mt-4 rounded-2xl border border-emerald-100/80 bg-white/85 p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-500">Template</p>
                            <p className="mt-2 font-newsreader text-lg italic text-stone-900">{details.transfer_pattern.template}</p>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">中文场景</p>
                                    <p className="mt-1 text-sm text-stone-700">{details.transfer_pattern.example_cn}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">英文套用</p>
                                    <p className="mt-1 font-newsreader text-base italic text-stone-900">{details.transfer_pattern.example_en}</p>
                                </div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-stone-600">{details.transfer_pattern.tip_cn}</p>
                        </div>
                    </div>
                ) : null}

                {details.memory_hook_cn ? (
                    <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50/50 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                            <Sparkles className="w-3.5 h-3.5" />
                            一句记忆法
                        </h4>
                        <p className="mt-3 text-sm leading-7 text-stone-700">{details.memory_hook_cn}</p>
                    </div>
                ) : null}

                {teachingMode && details.error_analysis && details.error_analysis.length > 0 ? (
                    <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50/40 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            错误精讲
                        </h4>
                        <div className="mt-4 space-y-3">
                            {details.error_analysis.map((err, i: number) => (
                                <div key={i} className="rounded-2xl border border-rose-100/80 bg-white/80 p-4">
                                    <div className="flex items-start gap-2">
                                        <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">错误</span>
                                        <span className="text-sm text-stone-600 line-through">{err.error}</span>
                                    </div>
                                    <div className="mt-2 flex items-start gap-2">
                                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">正确</span>
                                        <span className="text-sm font-medium text-stone-800">{err.correction}</span>
                                    </div>
                                    <div className="mt-3 border-l-2 border-amber-300 pl-3 text-xs leading-6 text-stone-500">
                                        <strong>规则：</strong>{err.rule}
                                    </div>
                                    {err.tip ? <div className="mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-600">💡 {err.tip}</div> : null}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {teachingMode && details.similar_patterns && details.similar_patterns.length > 0 ? (
                    <div className="rounded-[1.75rem] border border-purple-100 bg-purple-50/30 p-5">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-600">
                            <BrainCircuit className="w-3.5 h-3.5" />
                            举一反三
                        </h4>
                        <div className="mt-4 space-y-3">
                            {details.similar_patterns.map((pattern, i: number) => (
                                <div key={i} className="rounded-2xl border border-purple-100/80 bg-white/80 p-4">
                                    <div className="text-sm text-stone-600">{pattern.chinese}</div>
                                    <div className="mt-1 text-lg font-newsreader italic text-stone-900">→ {pattern.english}</div>
                                    {pattern.point && <div className="mt-2 text-xs leading-5 text-purple-500">🎯 {pattern.point}</div>}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {!details.diagnosis_summary_cn && details.feedback ? (
                    <div className="rounded-[1.75rem] border border-stone-100 bg-white/90 p-5 shadow-[0_12px_30px_rgba(28,25,23,0.04)]">
                        <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            补充说明
                        </h4>
                        <div className="mt-4 space-y-3">
                            {Array.isArray(details.feedback) ? details.feedback.map((point: string, i: number) => (
                                <div key={i} className="flex gap-2 text-sm leading-7 text-stone-600"><div className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" /><p>{point}</p></div>
                            )) : null}
                        </div>
                    </div>
                ) : null}

            </div>
        );
    };

    const renderRebuildQuestion = () => {
        if (!drillData?._rebuildMeta) return null;

        const localPassageSession = drillData._rebuildMeta.variant === "passage" ? drillData._rebuildMeta.passageSession : null;
        const rebuildLedgerClass = isVerdantRebuild
            ? "bg-[#eef6f1]/94 border-emerald-200/80 shadow-[0_10px_24px_rgba(2,44,34,0.12)]"
            : activeCosmeticUi.ledgerClass;
        const rebuildInputShellClass = isVerdantRebuild
            ? "bg-[#f4faf6] border-emerald-200/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]"
            : activeCosmeticUi.inputShellClass;
        const rebuildToggleClass = isVerdantRebuild
            ? "rounded-full px-2.5 py-0.5 text-[10px] font-bold border bg-white/92 shadow-[0_2px_10px_rgba(2,44,34,0.08)] transition-all"
            : "rounded-full px-2.5 py-0.5 text-[10px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,1)] border backdrop-blur-sm transition-all";
        const rebuildTokenDividerClass = isVerdantRebuild
            ? "mt-3 border-t border-emerald-200/70 pt-3"
            : "mt-3 border-t border-white/60 pt-3";
        const rebuildKeywordChipClass = isVerdantRebuild
            ? "inline-flex min-h-[38px] min-w-0 max-w-full items-start gap-1.5 rounded-full border border-emerald-200/85 bg-[#ecf8f0] px-4 py-1.5 text-[14px] font-semibold text-emerald-800 shadow-[0_3px_10px_rgba(2,44,34,0.08)] transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-[#e3f4e9] whitespace-normal break-all"
            : activeCosmeticUi.keywordChipClass;
        const rebuildSummaryMetricCardClass = isVerdantRebuild
            ? "rounded-[1.25rem] border border-emerald-200/75 bg-[#f7fcf8] p-4 shadow-[0_5px_14px_rgba(2,44,34,0.08)]"
            : cn("rounded-[1.25rem] border p-4", activeCosmeticUi.inputShellClass);
        const rebuildSummarySegmentCardClass = isVerdantRebuild
            ? "rounded-[1.35rem] border border-emerald-200/75 bg-[#f8fcf9] px-4 py-4 shadow-[0_6px_16px_rgba(2,44,34,0.08)]"
            : cn("rounded-[1.35rem] border px-4 py-4", activeCosmeticUi.inputShellClass);
        const rebuildSummaryPillClass = isVerdantRebuild
            ? "border-emerald-200/80 bg-white/90 text-emerald-700 shadow-[0_3px_10px_rgba(2,44,34,0.07)]"
            : activeCosmeticUi.iconButtonClass;
        const rebuildSummaryAccentPillClass = isVerdantRebuild
            ? "border-emerald-300/80 bg-emerald-100/80 text-emerald-800 shadow-[0_3px_10px_rgba(2,44,34,0.08)]"
            : activeCosmeticUi.wordBadgeActiveClass;
        const rebuildControlButtonClass = isVerdantRebuild
            ? "border-emerald-200/80 bg-white/92 text-emerald-700 shadow-[0_4px_12px_rgba(2,44,34,0.08)] hover:bg-emerald-50/80 hover:border-emerald-300"
            : activeCosmeticUi.iconButtonClass;
        const themedNextButtonStyle = {
            backgroundImage: activeCosmeticUi.nextButtonGradient,
            boxShadow: activeCosmeticUi.nextButtonShadow,
        } as const;

        const renderRebuildComposer = (submitLabel = "发送", compact = false, readOnlyAfterSubmit = false) => {
            const answerTotal = drillData._rebuildMeta?.answerTokens.length ?? 0;
            const answerFilled = rebuildAnswerTokens.length;
            const isReadyToSubmit = answerTotal > 0 && answerFilled === answerTotal;
            const isCurrentSegmentSolved = Boolean(
                isRebuildPassage
                && activePassageResult
                && activePassageResult.feedback.evaluation.isCorrect
                && !activePassageResult.feedback.skipped
            );
            const activePassageCorrection = isRebuildPassage && activePassageResult
                ? buildRebuildDisplaySentence({
                    answerTokens: drillData._rebuildMeta?.answerTokens ?? [],
                    evaluation: activePassageResult.feedback.evaluation,
                })
                : null;
            const shouldShowPassageCorrection = Boolean(
                readOnlyAfterSubmit
                && isRebuildPassage
                && activePassageResult
                && !activePassageResult.feedback.evaluation.isCorrect
            );
            const showInlinePassageCorrection = Boolean(shouldShowPassageCorrection && activePassageCorrection);
            const activePassageSystemAssessmentClass = activePassageResult
                ? activePassageResult.feedback.systemAssessment === "too_hard"
                    ? activeCosmeticUi.audioLockedClass
                    : activePassageResult.feedback.systemAssessment === "too_easy"
                        ? activeCosmeticUi.audioUnlockedClass
                        : activeCosmeticUi.wordBadgeActiveClass
                : activeCosmeticUi.wordBadgeActiveClass;

            return (
                <div className={cn(
                    "min-w-0 border p-4 transition-colors rounded-[1.55rem]",
                    rebuildLedgerClass
                )}>
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <div className="flex items-center gap-2">
                        <Sparkles className={cn("h-4 w-4", activeCosmeticTheme.mutedClass)} />
                        <div className={cn(
                            "font-source-serif text-[13px] font-semibold tracking-[0.08em]",
                            activeCosmeticTheme.textClass
                        )}>
                            {compact ? "Rebuild Atelier" : "Rebuild Atelier"}
                        </div>
                        <span className={cn(
                            "hidden rounded-full px-2 py-0.5 text-[10px] font-semibold md:inline-flex",
                            readOnlyAfterSubmit
                                ? cn("border", activeCosmeticUi.audioUnlockedClass)
                                : isReadyToSubmit
                                    ? cn("border", activeCosmeticUi.wordBadgeActiveClass)
                                    : cn("border", activeCosmeticUi.wordBadgeIdleClass)
                        )}>
                            {readOnlyAfterSubmit ? "已提交" : isReadyToSubmit ? "可提交" : "构建中"}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setRebuildAutocorrect(v => !v)}
                            className={cn(
                                rebuildToggleClass,
                                rebuildAutocorrect
                                    ? (isVerdantRebuild
                                        ? "border-emerald-300/80 bg-emerald-100/80 text-emerald-800"
                                        : activeCosmeticUi.audioUnlockedClass)
                                    : (isVerdantRebuild
                                        ? "border-emerald-200/80 bg-white/92 text-emerald-700"
                                        : activeCosmeticUi.iconButtonClass)
                            )}
                        >
                            <span className="inline-flex items-center gap-1"><Wand2 className="h-3 w-3" />纠正</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setRebuildHideTokens(v => !v)}
                            className={cn(
                                rebuildToggleClass,
                                rebuildHideTokens
                                    ? (isVerdantRebuild
                                        ? "border-emerald-300/80 bg-emerald-50/90 text-emerald-800"
                                        : activeCosmeticUi.audioLockedClass)
                                    : (isVerdantRebuild
                                        ? "border-emerald-200/80 bg-white/92 text-emerald-700"
                                        : activeCosmeticUi.iconButtonClass)
                            )}
                        >
                            <span className="inline-flex items-center gap-1">{rebuildHideTokens ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}隐藏词</span>
                        </button>
                    </div>
                </div>

                <div className={cn(
                    "min-w-0 rounded-[1.25rem] border p-3 transition-colors duration-500 ease-in-out",
                    rebuildInputShellClass
                )}>
                    <div className={cn(
                        "relative rounded-[1rem] border px-3 py-3",
                        isVerdantRebuild
                            ? (compact
                                ? "min-h-[82px] border-emerald-200/80 bg-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]"
                                : "min-h-[90px] border-emerald-200/80 bg-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]")
                            : (compact
                                ? "min-h-[82px] border-white/60 bg-white/88"
                                : "min-h-[90px] border-white/60 bg-white/86")
                    )}>
                        {showInlinePassageCorrection && activePassageCorrection ? (
                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-2.5">
                                    {activePassageCorrection.tokens.map((token, index) => (
                                        <span
                                            key={`passage-inline-correction-${index}-${token.text}`}
                                            className={cn(
                                                "inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-4 py-1.5 text-[14px] font-semibold",
                                                token.kind === "correct"
                                                    ? activeCosmeticUi.wordBadgeActiveClass
                                                    : token.kind === "inserted"
                                                        ? activeCosmeticUi.hintButtonClass
                                                        : activeCosmeticUi.audioLockedClass
                                            )}
                                        >
                                            {token.text}
                                            {token.kind !== "correct" && token.originalText ? (
                                                <span className={cn("text-[11px] line-through", activeCosmeticTheme.mutedClass)}>
                                                    {token.originalText}
                                                </span>
                                            ) : null}
                                        </span>
                                    ))}
                                </div>
                                {activePassageCorrection.extraTokens.length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={cn("text-[11px] font-semibold", activeCosmeticTheme.mutedClass)}>多余词：</span>
                                        {activePassageCorrection.extraTokens.map((token, index) => (
                                            <span
                                                key={`passage-inline-extra-${index}-${token.text}`}
                                                className={cn(
                                                    "inline-flex min-h-[30px] items-center rounded-full border px-3 py-1 text-[12px] font-semibold line-through",
                                                    activeCosmeticUi.audioLockedClass
                                                )}
                                            >
                                                {token.text}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : rebuildAnswerTokens.length > 0 || rebuildTypingBuffer ? (
                            <AnimatePresence mode="sync" initial={false}>
                                <div className="w-full min-w-0 flex flex-wrap items-center gap-2.5">
                                    {rebuildAnswerTokens.map((token) => (
                                        <motion.button
                                            key={`ans-${token.id}`}
                                            type="button"
                                            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            transition={{ duration: 0.15, ease: "easeOut" }}
                                            whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
                                            onClick={() => handleRebuildRemoveToken(token.id)}
                                            className={cn(
                                                "inline-flex min-h-[38px] min-w-0 max-w-full items-start gap-1.5 rounded-full px-4 py-1.5 text-left text-[14px] font-semibold whitespace-normal break-all transition-all cursor-pointer",
                                                "bg-theme-base-bg text-theme-text font-bold ring-1 ring-theme-border/20 shadow-[0_4px_0_rgba(0,0,0,0.08)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_rgba(0,0,0,0.08)] active:translate-y-1 active:shadow-[0_0_0_rgba(0,0,0,0.08)]"
                                            )}
                                        >
                                            <span className="block min-w-0 max-w-full break-all">{token.text}</span>
                                            {(token.repeatTotal ?? 1) > 1 && (
                                                <span className={cn(
                                                    "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 pt-[1px] text-[10px] font-black",
                                                    activeCosmeticUi.wordBadgeActiveClass
                                                )}>
                                                    {token.repeatIndex}
                                                </span>
                                            )}
                                        </motion.button>
                                    ))}
                                    {rebuildTypingBuffer && (
                                        <motion.div
                                            key="typing-ghost"
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            transition={{ duration: 0.12, ease: "easeOut" }}
                                            className={cn(
                                                "inline-flex min-h-[38px] min-w-0 max-w-full items-start gap-1.5 rounded-full border px-4 py-1.5 text-left text-[14px] font-bold whitespace-normal break-all",
                                                activeCosmeticUi.wordBadgeIdleClass
                                            )}
                                        >
                                            <span className="block min-w-0 max-w-full break-all">{rebuildTypingBuffer}</span>
                                            <span className="h-4 w-[2px] animate-pulse rounded-full bg-current/70" />
                                        </motion.div>
                                    )}
                                </div>
                            </AnimatePresence>
                        ) : (
                            <span className={cn("select-none text-[14px] font-semibold leading-relaxed tracking-wide", activeCosmeticTheme.mutedClass)}>
                                点击词块或直接输入（支持大小写智能匹配）
                            </span>
                        )}
                    </div>
                    {/* Token Pool */}
                    {!readOnlyAfterSubmit && (
                        <div className={cn(
                            "transition-all duration-500 ease-in-out",
                            rebuildHideTokens ? "pointer-events-none mt-0 h-0 max-h-0 opacity-0 overflow-hidden" : "mt-5 max-h-[500px] opacity-100"
                        )}>
                            <div className={cn(
                                "mb-3 flex items-center gap-4 text-[11px] font-semibold",
                                activeCosmeticTheme.mutedClass,
                                rebuildTokenDividerClass
                            )}>
                                快捷键：空格选词 · Backspace 撤回 · Enter 提交
                            </div>
                            <div className="w-full min-w-0 max-h-[140px] overflow-x-hidden overflow-y-auto py-1 pr-1">
                                <AnimatePresence mode="sync" initial={false}>
                                    <div className="w-full min-w-0 flex flex-wrap gap-2.5">
                                        {rebuildAvailableTokens.map((token) => (
                                            <motion.button
                                                key={`avail-${token.id}`}
                                                type="button"
                                                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                transition={{ duration: 0.15, ease: "easeOut" }}
                                                whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
                                                onClick={() => handleRebuildSelectToken(token.id)}
                                                className={cn(
                                                    "min-w-0 max-w-full text-left whitespace-normal break-all",
                                                    isVerdantRebuild
                                                        ? rebuildKeywordChipClass
                                                        : "inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-4 py-1.5 text-[14px] font-semibold transition-all hover:-translate-y-0.5",
                                                    !isVerdantRebuild && activeCosmeticUi.keywordChipClass
                                                )}
                                            >
                                                <span className="block min-w-0 max-w-full break-all">{token.text}</span>
                                                {(token.repeatTotal ?? 1) > 1 && (
                                                    <span className={cn(
                                                        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 pt-[1px] text-[10px] font-black",
                                                        activeCosmeticUi.wordBadgeActiveClass
                                                    )}>
                                                        {token.repeatIndex}
                                                    </span>
                                                )}
                                            </motion.button>
                                        ))}
                                    </div>
                                </AnimatePresence>
                            </div>
                        </div>
                    )}
                </div>

                {readOnlyAfterSubmit ? (
                    <div className="mt-8 space-y-3 px-1">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-h-6 items-center gap-2">
                            {isCurrentSegmentSolved ? (
                                <motion.div
                                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                                        activeCosmeticUi.audioUnlockedClass
                                    )}
                                >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    本段答对
                                </motion.div>
                            ) : null}
                            {activePassageResult ? (
                                <motion.div
                                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                                        activePassageSystemAssessmentClass
                                    )}
                                >
                                    <BrainCircuit className="h-3.5 w-3.5" />
                                    系统判断：{activePassageResult.feedback.systemAssessmentLabel}
                                </motion.div>
                            ) : null}
                            </div>
                            {nextPendingSegmentIndex >= 0 ? (
                                <button
                                    type="button"
                                    onClick={() => activatePassageSegment(nextPendingSegmentIndex)}
                                    className="inline-flex h-11 items-center justify-center rounded-full border border-transparent px-6 text-sm font-black tracking-wide text-white transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                                    style={themedNextButtonStyle}
                                >
                                    下一段
                                </button>
                            ) : (
                                !rebuildPassageSummary ? (
                                    <span className={cn("text-xs font-semibold", activeCosmeticTheme.mutedClass)}>
                                        先看完这段反馈，再往下做整篇总自评
                                    </span>
                                ) : null
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="mt-5 flex gap-3 px-1">
                        <button
                            type="button"
                            onClick={handleSkipRebuild}
                            className={cn(
                                "group inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border px-4 text-[15px] font-semibold transition-all active:scale-[0.98]",
                                compact
                                    ? activeCosmeticUi.iconButtonClass
                                    : activeCosmeticUi.hintButtonClass
                            )}
                        >
                            <SkipForward className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            跳过
                        </button>
                        <button
                            type="button"
                            onClick={() => { void handleSubmitDrill(); }}
                            disabled={rebuildAnswerTokens.length === 0}
                            className={cn(
                                "group inline-flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-full px-6 text-[15px] font-black tracking-wide transition-all duration-300",
                                rebuildAnswerTokens.length === 0
                                    ? "cursor-not-allowed border-[4px] border-theme-border/30 bg-theme-base-bg text-theme-text-muted shadow-none opacity-60"
                                    : compact
                                        ? activeCosmeticUi.checkButtonClass
                                        : activeCosmeticUi.checkButtonClass
                            )}
                        >
                            <CheckCircle2 className={cn("h-4 w-4", rebuildAnswerTokens.length > 0 && "transition-transform group-hover:scale-110")} />
                            {submitLabel}
                        </button>
                    </div>
                )}
            </div>
        );
        };

        if (!localPassageSession) {
            return (
                <motion.div
                    className="w-full max-w-4xl"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 20, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={prefersReducedMotion ? { duration: 0.15 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                    {renderRebuildComposer()}
                </motion.div>
            );
        }

        const speedOptions = [0.5, 0.75, 1, 1.25, 1.5] as const;
        const resultMap = new Map(
            rebuildPassageResults.map((item) => [item.segmentIndex, item]),
        );
        const submittedCount = rebuildPassageResults.length;
        const sessionObjectivePreview = submittedCount > 0
            ? Math.round(rebuildPassageResults.reduce((total, item) => total + item.objectiveScore100, 0) / submittedCount)
            : 0;
        const totalSegments = localPassageSession.segmentCount;
        const activeSegment = localPassageSession.segments[activePassageSegmentIndex] ?? localPassageSession.segments[0];
        const activeSegmentAudioKey = getSentenceAudioCacheKey(activeSegment?.referenceEnglish ?? "");
        const isActivePassageAudioLoading = loadingAudioKeys.has(activeSegmentAudioKey);
        const activeSegmentResult = resultMap.get(activePassageSegmentIndex) ?? null;
        const activeSegmentSentenceIpa = (activeSegmentResult && isIpaReady)
            ? buildConnectedSentenceIpa(activeSegment.referenceEnglish, getIPA)
            : "";
        const nextPendingSegmentIndex = localPassageSession.segments
            .map((_, index) => index)
            .filter((index) => !resultMap.has(index) && index !== activePassageSegmentIndex)
            .sort((left, right) => {
                const leftDistance = left > activePassageSegmentIndex
                    ? left - activePassageSegmentIndex
                    : left + totalSegments - activePassageSegmentIndex;
                const rightDistance = right > activePassageSegmentIndex
                    ? right - activePassageSegmentIndex
                    : right + totalSegments - activePassageSegmentIndex;
                return leftDistance - rightDistance;
            })[0] ?? -1;
        const currentStageNumber = activePassageSegmentIndex + 1;
        const stageProgressDisplayCount = Math.min(
            totalSegments,
            Math.max(submittedCount, currentStageNumber),
        );
        const stageProgressPercent = totalSegments > 0
            ? Math.round((stageProgressDisplayCount / totalSegments) * 100)
            : 0;
        const completedSegments = localPassageSession.segments
            .map((segment, index) => ({
                segment,
                index,
                result: resultMap.get(index) ?? null,
            }))
            .filter((item) => Boolean(item.result));

        if (!activeSegment) return null;

        const renderPassageSentence = (segment: PassageSegment, revealed: boolean) => {
            if (revealed) {
                return (
                    <p className={cn(
                        "mx-auto max-w-[35rem] font-sans text-[1.12rem] font-medium leading-[2rem] tracking-[0.01em] md:max-w-[39rem] md:text-[1.22rem] md:leading-[2.18rem]",
                        activeCosmeticTheme.textClass
                    )}>
                        {renderInteractiveText(segment.referenceEnglish)}
                    </p>
                );
            }

            return (
                <p className={cn(
                    "mx-auto max-w-[35rem] select-none font-sans text-[1.12rem] font-medium leading-[2rem] tracking-[0.01em] blur-[7px] md:max-w-[39rem] md:text-[1.22rem] md:leading-[2.18rem]",
                    activeCosmeticTheme.mutedClass
                )}>
                    {segment.referenceEnglish}
                </p>
            );
        };

        return (
            <motion.div
                className="mx-auto w-full max-w-[820px] space-y-5"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 20, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={prefersReducedMotion ? { duration: 0.15 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
                {!rebuildPassageSummary ? (
                    <section className={cn("rounded-[2rem] border p-5 md:px-7 md:py-7", rebuildLedgerClass)}>
                        <div className="flex flex-col gap-4 border-b border-stone-100/80 px-1 pb-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span className={cn("shrink-0 text-[11px] font-semibold tracking-[0.06em]", activeCosmeticTheme.mutedClass)}>
                                    第 {currentStageNumber} / {totalSegments} 段
                                </span>
                                <div
                                    className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
                                    style={{ backgroundColor: activeCosmeticUi.nextButtonGlow }}
                                >
                                    <motion.div
                                        className="h-full rounded-full"
                                        style={{ backgroundImage: activeCosmeticUi.nextButtonGradient }}
                                        initial={false}
                                        animate={{ width: `${stageProgressPercent}%` }}
                                        transition={{ duration: prefersReducedMotion ? 0.12 : 0.32, ease: "easeOut" }}
                                    />
                                </div>
                                <span className={cn("shrink-0 text-[11px] font-semibold tracking-[0.06em]", activeCosmeticTheme.mutedClass)}>
                                    {stageProgressDisplayCount} / {totalSegments}
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { void playAudio(activeSegment.referenceEnglish); }}
                                    className={cn(
                                        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 transition-all",
                                        audioSourceText === activeSegment.referenceEnglish && (isPlaying || isActivePassageAudioLoading || isAudioLoading)
                                            ? (isVerdantRebuild ? "border-emerald-300/80 bg-emerald-100/85 text-emerald-800" : activeCosmeticUi.audioUnlockedClass)
                                            : rebuildControlButtonClass
                                    )}
                                    title="播放当前段"
                                >
                                    {isActivePassageAudioLoading ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Volume2 className={cn("h-4 w-4", audioSourceText === activeSegment.referenceEnglish && isPlaying && "animate-pulse")} />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => togglePassageChinese(activePassageSegmentIndex)}
                                    className={cn(
                                        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 text-xs font-bold transition-all",
                                        rebuildPassageUiState[activePassageSegmentIndex]?.chineseExpanded
                                            ? (isVerdantRebuild ? "border-emerald-300/80 bg-emerald-50/90 text-emerald-800" : activeCosmeticUi.audioLockedClass)
                                            : rebuildControlButtonClass
                                    )}
                                >
                                    {rebuildPassageUiState[activePassageSegmentIndex]?.chineseExpanded ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    中文
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const speedIndex = speedOptions.findIndex((speed) => speed === playbackSpeed);
                                        const nextSpeed = speedOptions[(speedIndex + 1) % speedOptions.length] ?? 1;
                                        setPlaybackSpeed(nextSpeed);
                                        if (audioRef.current) {
                                            audioRef.current.playbackRate = nextSpeed;
                                        }
                                    }}
                                    className={cn("inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-[11px] font-bold transition hover:-translate-y-0.5", rebuildControlButtonClass)}
                                >
                                    {playbackSpeed}x
                                </button>
                            </div>
                        </div>

                        <div className={cn(
                            "mt-4 rounded-[1.75rem] border px-5 py-8 text-center md:px-8 md:py-10",
                            isVerdantRebuild
                                ? "border-emerald-200/80 bg-[#f7fcf8] shadow-[0_8px_18px_rgba(2,44,34,0.08)]"
                                : activeCosmeticUi.inputShellClass
                        )}>
                            {renderPassageSentence(activeSegment, Boolean(activeSegmentResult))}
                            {activeSegmentResult ? (
                                <p className={cn(
                                    "mx-auto mt-3 max-w-[42rem] font-mono text-[13px] leading-7 md:text-[14px]",
                                    isVerdantRebuild ? "text-emerald-700/85" : activeCosmeticTheme.mutedClass
                                )}>
                                    {activeSegmentSentenceIpa || (isIpaReady ? "暂未命中完整音标词典，可先对照原句和音频。" : "正在加载音标词典...")}
                                </p>
                            ) : null}
                            {rebuildPassageUiState[activePassageSegmentIndex]?.chineseExpanded ? (
                                <p className={cn(
                                    "mx-auto mt-4 max-w-[42rem] font-sans text-[15px] leading-8 md:text-base",
                                    activeCosmeticTheme.mutedClass
                                )}>
                                    {activeSegment.chinese}
                                </p>
                            ) : null}
                        </div>

                        <div className="mt-5">
                            {renderRebuildComposer(`提交第 ${activePassageSegmentIndex + 1} 段`, true, Boolean(activeSegmentResult))}
                        </div>
                    </section>
                ) : null}

                {!rebuildPassageSummary && submittedCount === totalSegments ? (
                    <motion.section
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0.16 : 0.28, delay: prefersReducedMotion ? 0 : 0.05 }}
                        className={cn("rounded-[1.8rem] border p-5", rebuildLedgerClass)}
                    >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className={cn("text-[11px] font-black uppercase tracking-[0.18em]", activeCosmeticTheme.mutedClass)}>Session Review</p>
                                <h4 className={cn("mt-2 text-2xl font-bold tracking-tight", activeCosmeticTheme.textClass)}>整篇做一次总自评</h4>
                                <p className={cn("mt-2 max-w-2xl text-sm leading-7", activeCosmeticTheme.mutedClass)}>
                                    所有段落都完成了。现在只用对整篇短文给一次整体难度判断。
                                </p>
                            </div>
                            <div className={cn("rounded-full border px-4 py-2 text-sm font-bold", rebuildSummaryAccentPillClass)}>
                                当前客观总分 {sessionObjectivePreview}
                            </div>
                        </div>
                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                            {([
                                {
                                    value: "easy",
                                    label: "简单",
                                    className: activeCosmeticUi.audioUnlockedClass,
                                },
                                {
                                    value: "just_right",
                                    label: "刚好",
                                    className: activeCosmeticUi.checkButtonClass,
                                },
                                {
                                    value: "hard",
                                    label: "难",
                                    className: activeCosmeticUi.audioLockedClass,
                                },
                            ] as const).map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleRebuildSelfEvaluate(option.value)}
                                    className={cn(
                                        "inline-flex min-h-14 items-center justify-center rounded-[1.2rem] border px-4 text-sm font-bold transition hover:-translate-y-0.5",
                                        option.className
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </motion.section>
                ) : null}

                {rebuildPassageSummary ? (
                    <motion.section
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0.16 : 0.32, delay: prefersReducedMotion ? 0 : 0.08 }}
                        className={cn("rounded-[1.85rem] border p-5", rebuildLedgerClass)}
                    >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className={cn("text-[11px] font-black uppercase tracking-[0.18em]", activeCosmeticTheme.mutedClass)}>Passage Summary</p>
                                <h4 className={cn("mt-2 text-2xl font-bold tracking-tight", activeCosmeticTheme.textClass)}>短文分段综合结算</h4>
                            </div>
                            <div className={cn("rounded-full border px-4 py-2 text-sm font-bold", rebuildSummaryAccentPillClass)}>
                                {rebuildPassageSummary.segmentCount} 段 · Shadowing {rebuildPassageSummary.sessionBattleScore10.toFixed(1)}
                            </div>
                        </div>
                        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {[
                                { label: "客观总分", value: `${rebuildPassageSummary.sessionObjectiveScore100}` },
                                { label: "总自评", value: `${rebuildPassageSummary.sessionSelfScore100}` },
                                { label: "综合分", value: `${rebuildPassageSummary.sessionScore100}` },
                                { label: "Elo 变化", value: `${rebuildPassageSummary.change >= 0 ? "+" : ""}${rebuildPassageSummary.change}` },
                            ].map((metric) => (
                                <div key={metric.label} className={rebuildSummaryMetricCardClass}>
                                    <div className={cn("text-[10px] font-bold uppercase tracking-[0.18em]", activeCosmeticTheme.mutedClass)}>{metric.label}</div>
                                    <div className={cn("mt-2 text-xl font-bold", activeCosmeticTheme.textClass)}>
                                        {metric.label === "Elo 变化" ? (
                                            <div className="flex items-center gap-1.5">
                                                <motion.span
                                                    initial={{ opacity: 0, y: 15, scale: 0.5 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    transition={{ duration: 0.8, type: "spring", stiffness: 300, delay: 0.2 }}
                                                    className={rebuildPassageSummary.change > 0 ? "text-emerald-500 font-extrabold drop-shadow-sm" : rebuildPassageSummary.change < 0 ? "text-rose-500 font-extrabold drop-shadow-sm" : ""}
                                                >
                                                    {metric.value}
                                                </motion.span>
                                                {rebuildPassageSummary.change > 0 && (
                                                    <motion.div initial={{ opacity: 0, scale: 0, rotate: -45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.5, delay: 0.5, type: "spring" }}>
                                                        <TrendingUp className="w-5 h-5 text-emerald-500 drop-shadow-sm" />
                                                    </motion.div>
                                                )}
                                                {rebuildPassageSummary.change < 0 && (
                                                    <motion.div initial={{ opacity: 0, scale: 0, rotate: 45 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.5, delay: 0.5, type: "spring" }}>
                                                        <TrendingDown className="w-5 h-5 text-rose-500 drop-shadow-sm" />
                                                    </motion.div>
                                                )}
                                            </div>
                                        ) : metric.value}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-5 space-y-3">
                            {completedSegments.map(({ segment, index, result }) => (
                                <div key={`summary-segment-${segment.id}`} className={rebuildSummarySegmentCardClass}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", rebuildSummaryPillClass)}>
                                                第 {index + 1} 段
                                            </span>
                                            <span className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", rebuildSummaryAccentPillClass)}>
                                                Shadowing {result?.objectiveScore100 ?? 0}
                                            </span>
                                        </div>
                                        <span className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", rebuildSummaryPillClass)}>
                                            {result?.feedback.skipped ? "已跳过" : `综合 ${result?.finalScore100 ?? 0}`}
                                        </span>
                                    </div>
                                    <p className={cn("mt-3 font-source-serif text-[1.1rem] leading-8 tracking-[-0.01em]", activeCosmeticTheme.textClass)}>
                                        {segment.referenceEnglish}
                                    </p>
                                    <p className={cn("mt-2 text-sm leading-7", activeCosmeticTheme.mutedClass)}>
                                        {segment.chinese}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <p className={cn("mt-5 text-sm leading-7", activeCosmeticTheme.mutedClass)}>
                            结算后 Elo 为 <span className={cn("font-bold", activeCosmeticTheme.textClass)}>{rebuildPassageSummary.eloAfter}</span>，
                            本场获得 <span className={cn("font-bold", activeCosmeticTheme.textClass)}>{rebuildPassageSummary.coinsEarned}</span> 星光币。
                        </p>
                    </motion.section>
                ) : null}
            </motion.div>
        );
    };

    const renderRebuildFeedback = () => {
        if (!drillData?._rebuildMeta || !rebuildFeedback || isRebuildPassage) return null;
        const practiceTier = getRebuildPracticeTier(rebuildFeedback.effectiveElo);
        const passageSession = drillData._rebuildMeta.variant === "passage" ? drillData._rebuildMeta.passageSession : null;
        const isPassageFeedback = Boolean(passageSession);
        const segmentLabel = passageSession ? `第 ${passageSession.currentIndex + 1} / ${passageSession.segmentCount} 段` : null;
        const completedSegmentMap = new Map(
            rebuildPassageScores.map((item) => [item.segmentIndex, item]),
        );
        const displaySentence = buildRebuildDisplaySentence({
            answerTokens: drillData._rebuildMeta.answerTokens,
            evaluation: rebuildFeedback.evaluation,
        });
        const rebuildTone = rebuildFeedback.evaluation.isCorrect
            ? "success"
            : rebuildFeedback.skipped
                ? "miss"
                : "partial";
        const isSkippedRebuild = rebuildFeedback.skipped;
        const isCorrectRebuild = rebuildFeedback.evaluation.isCorrect;
        const sentenceIpa = isIpaReady
            ? buildConnectedSentenceIpa(drillData.reference_english, getIPA)
            : "";
        const metrics = [
            { label: "正确率", value: `${Math.round(rebuildFeedback.evaluation.accuracyRatio * 100)}%` },
            { label: "完成度", value: `${Math.round(rebuildFeedback.evaluation.completionRatio * 100)}%` },
            { label: "顺序", value: `${Math.round(rebuildFeedback.evaluation.misplacementRatio * 100)}%` },
            { label: "干扰词", value: `${Math.round(rebuildFeedback.evaluation.distractorPickRatio * 100)}%` },
            { label: "内容词", value: `${Math.round(rebuildFeedback.evaluation.contentWordHitRate * 100)}%` },
            { label: "尾部", value: `${Math.round(rebuildFeedback.evaluation.tailCoverage * 100)}%` },
            { label: "重播", value: `${rebuildFeedback.replayCount}` },
            { label: "编辑", value: `${rebuildFeedback.editCount}` },
            { label: "系统判断", value: rebuildFeedback.systemAssessmentLabel },
        ];
        const getInteractiveTokenClassName = (word: string, variant: "plain" | "changed" | "inserted" | "removed" = "plain") => {
            const cleanWord = word.replace(/[^a-zA-Z]/g, "").trim().toLowerCase();
            const isActive = cleanWord.length > 0 && wordPopup?.word?.toLowerCase() === cleanWord;
            if (variant === "changed") {
                return cn(
                    "inline-flex min-h-[42px] items-center rounded-[1.4rem] border px-3 py-2 text-base text-stone-800 shadow-sm transition-all",
                    isActive
                        ? "border-amber-300 bg-amber-100 text-amber-950 shadow-[0_12px_24px_rgba(245,158,11,0.14)]"
                        : "border-amber-200 bg-amber-50/90 hover:-translate-y-0.5 hover:border-amber-300"
                );
            }
            if (variant === "inserted") {
                return cn(
                    "inline-flex min-h-[42px] items-center rounded-[1.4rem] border px-3 py-2 text-base text-sky-900 shadow-sm transition-all",
                    isActive
                        ? "border-sky-300 bg-sky-100 shadow-[0_12px_24px_rgba(56,189,248,0.14)]"
                        : "border-sky-200 bg-sky-50/90 hover:-translate-y-0.5 hover:border-sky-300"
                );
            }
            if (variant === "removed") {
                return cn(
                    "inline-flex min-h-[36px] items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition-all",
                    isActive
                        ? "border-rose-300 bg-rose-100 text-rose-700 shadow-sm"
                        : "border-rose-200 bg-rose-50/85 text-rose-600 hover:-translate-y-0.5 hover:border-rose-300"
                );
            }
            return cn(
                "inline-flex min-h-[42px] items-center rounded-[1.4rem] border px-3 py-2 text-base text-stone-800 shadow-sm transition-all",
                isActive
                    ? "border-stone-300 bg-stone-100 text-stone-900"
                    : "border-stone-200 bg-white/96 hover:-translate-y-0.5 hover:border-stone-300"
            );
        };

        return (
            <div className="max-w-4xl mx-auto w-full space-y-4 md:space-y-6">
                <motion.div
                    key={`rebuild-reference-head-${rebuildFeedback.resolvedAt}`}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 22, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: prefersReducedMotion ? 0.18 : 0.42, ease: "easeOut" }}
                    className="overflow-hidden rounded-[2rem] border border-stone-200/60 bg-white p-6 md:p-8 shadow-[0_8px_30px_rgba(20,20,20,0.04)]"
                >
                    <div className="flex flex-wrap items-center gap-2 mb-4 md:mb-5">
                        <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[11px] font-semibold text-stone-500 tracking-wide">
                            {practiceTier.label}
                        </span>
                        {segmentLabel ? (
                            <span className="inline-flex items-center rounded-full border border-[#e5d5a8] bg-[#fdf9ef] px-3 py-1 text-[11px] font-semibold text-[#8a6b22] tracking-wide">
                                {segmentLabel}
                            </span>
                        ) : null}
                        <span className={cn(
                            "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.08em] shadow-sm",
                            rebuildTone === "success"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : rebuildTone === "partial"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-rose-200 bg-rose-50 text-rose-700"
                        )}>
                            {rebuildFeedback.systemAssessmentLabel}
                        </span>
                        {(!isRebuildPassage && rebuildFeedback) ? (
                            <motion.span
                                initial={{ opacity: 0, x: -10, scale: 0.8 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                transition={{ type: "spring", stiffness: 350, delay: 0.2 }}
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide shadow-sm",
                                    rebuildFeedback.systemDelta >= 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
                                )}
                            >
                                Elo {rebuildFeedback.systemDelta >= 0 ? "+" : ""}{rebuildFeedback.systemDelta}
                                {rebuildFeedback.systemDelta >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            </motion.span>
                        ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-4 border-b border-stone-100 pb-4 md:pb-5">
                        <h3 className="text-[17px] font-bold text-slate-800 tracking-tight md:text-[18px]">
                            {rebuildPassageSummary
                                ? "这篇短文已经结算"
                                : isCorrectRebuild
                                    ? "太棒了，这句你拼出来了！"
                                    : isSkippedRebuild
                                        ? "这题直接跳过，先看标准表达"
                                        : "你的作答与准表达有差异"}
                        </h3>
                        <button
                            type="button"
                            onClick={(e) => openRebuildTutorPopup(e)}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-stone-200/80 bg-stone-50 px-3 py-1.5 text-[11px] font-semibold text-stone-600 transition-all hover:bg-stone-100 hover:border-stone-300"
                            title="打开英语老师"
                        >
                            <HelpCircle className="h-3.5 w-3.5" />
                            向 AI 提问
                        </button>
                    </div>

                    <div className="mt-6 flex items-start justify-between gap-5 md:mt-7">
                        <div className="flex-1 font-newsreader text-[1.4rem] leading-[2.1rem] text-stone-900 md:text-[1.65rem] md:leading-[2.5rem]">
                            {renderInteractiveText(drillData.reference_english)}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={() => { void playAudio(); }}
                                disabled={isAudioLoading}
                                className={cn(
                                    "inline-flex h-11 w-11 items-center justify-center rounded-full border transition-all hover:-translate-y-0.5",
                                    isAudioLoading
                                        ? "cursor-wait border-stone-200 bg-stone-50 text-stone-400"
                                        : "border-stone-200 bg-white text-stone-500 shadow-sm hover:border-stone-300 hover:bg-stone-50"
                                )}
                                title="重播英文原句"
                            >
                                {loadingAudioKeys.has(getSentenceAudioCacheKey(drillData.reference_english)) ? (
                                    <RefreshCw className="h-4 w-4 animate-spin text-stone-300" />
                                ) : (
                                    <Volume2 className="h-4 w-4" />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => setRebuildSentenceShadowingFlow("shadowing")}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100"
                                title="手动开始 Shadowing 训练"
                            >
                                <Mic className="h-4 w-4" />
                                Shadowing
                            </button>
                        </div>
                    </div>

                    <div className="mt-3 font-mono text-[13px] tracking-wide text-stone-400/80 md:mt-4 md:text-[14px]">
                        {sentenceIpa || (isIpaReady ? "暂未加载音标" : "正在加载音标词典...")}
                    </div>

                    <div className="mt-6 pt-5 border-t border-stone-100 border-dashed md:mt-7 md:pt-6">
                        <p className="text-[15px] leading-8 text-stone-500 md:text-base md:leading-8">{drillData.chinese}</p>
                    </div>
                </motion.div>

                {passageSession ? (
                    <motion.div
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0.16 : 0.3, delay: prefersReducedMotion ? 0 : 0.1 }}
                        className="rounded-[1.85rem] border border-[#e7dcc4] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(252,248,239,0.95))] p-5 shadow-[0_16px_32px_rgba(120,103,72,0.1)]"
                    >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Passage Context</p>
                                <p className="mt-1 text-sm leading-7 text-stone-600">
                                    全文结构保留在这里。当前段先看反馈，其它段继续按顺序推进。
                                </p>
                            </div>
                            <div className="rounded-full border border-[#d6c38e] bg-[#fff8e7] px-3 py-1 text-xs font-bold text-[#7a5b16]">
                                第 {passageSession.currentIndex + 1} / {passageSession.segmentCount} 段
                            </div>
                        </div>
                        <div className="mt-4 grid gap-3">
                            {passageSession.segments.map((segment, index) => {
                                const score = completedSegmentMap.get(index);
                                const isCurrentSegment = index === passageSession.currentIndex;
                                const statusLabel = score
                                    ? `已完成 · ${score.finalScore100}`
                                    : isCurrentSegment
                                        ? "当前反馈"
                                        : "后续段";

                                return (
                                    <div
                                        key={`feedback-${segment.id}`}
                                        className={cn(
                                            "rounded-[1.2rem] border px-4 py-3",
                                            isCurrentSegment
                                                ? "border-[#d6c38e] bg-white shadow-[0_10px_22px_rgba(120,103,72,0.12)]"
                                                : score
                                                    ? "border-emerald-100 bg-white/92"
                                                    : "border-stone-200/80 bg-white/75"
                                        )}
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">
                                                第 {index + 1} 段
                                            </span>
                                            <span className={cn(
                                                "rounded-full border px-2.5 py-1 text-[10px] font-bold",
                                                score
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                    : isCurrentSegment
                                                        ? "border-[#d6c38e] bg-[#fff8e7] text-[#7a5b16]"
                                                        : "border-stone-200 bg-white text-stone-500"
                                            )}>
                                                {statusLabel}
                                            </span>
                                        </div>
                                        <p className="mt-3 text-[15px] leading-7 text-stone-700">{segment.chinese}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                ) : null}

                {!isSkippedRebuild && !isCorrectRebuild ? (
                    <motion.div
                        key={`rebuild-diff-${rebuildFeedback.resolvedAt}`}
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0.16 : 0.32, delay: prefersReducedMotion ? 0 : 0.16 }}
                        className="rounded-[1.9rem] border border-stone-100 bg-white/94 p-5 shadow-[0_18px_34px_rgba(15,23,42,0.05)]"
                    >
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-stone-500">你这次错在哪里</p>
                        <div className="mt-4 flex flex-wrap gap-3">
                            {displaySentence.tokens.map((token, index) => (
                                <motion.button
                                    key={`${token.text}-${token.kind}-${index}-${token.originalText ?? ""}`}
                                    type="button"
                                    initial={prefersReducedMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: prefersReducedMotion ? 0.12 : 0.18, delay: prefersReducedMotion ? 0 : 0.03 + (index * 0.02) }}
                                    onClick={(e) => openWordPopupAtElement(e.currentTarget, token.text, drillData.reference_english)}
                                    className={cn(
                                        "text-left",
                                        token.kind === "correct" && getInteractiveTokenClassName(token.text, "plain"),
                                        (token.kind === "misplaced" || token.kind === "replacement") && getInteractiveTokenClassName(token.text, "changed"),
                                        token.kind === "inserted" && getInteractiveTokenClassName(token.text, "inserted"),
                                    )}
                                >
                                    {token.kind === "correct" ? (
                                        <span className="font-newsreader text-[1.18rem] italic">{token.text}</span>
                                    ) : token.kind === "inserted" ? (
                                        <span className="flex items-center gap-2">
                                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black tracking-[0.14em] text-sky-700">漏词</span>
                                            <span className="font-newsreader text-[1.18rem] italic">{token.text}</span>
                                        </span>
                                    ) : (
                                        <span className="flex flex-col leading-none">
                                            <span className="font-newsreader text-[0.96rem] italic text-rose-400 line-through opacity-80">
                                                {token.originalText}
                                            </span>
                                            <span className="mt-1 font-newsreader text-[1.18rem] italic text-amber-900">
                                                {token.text}
                                            </span>
                                        </span>
                                    )}
                                </motion.button>
                            ))}
                        </div>

                        {displaySentence.extraTokens.length > 0 ? (
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-stone-400">多选了这些</span>
                                {displaySentence.extraTokens.map((token, index) => (
                                    <button
                                        key={`extra-${token.text}-${index}`}
                                        type="button"
                                        onClick={(e) => openWordPopupAtElement(e.currentTarget, token.text, rebuildFeedback.evaluation.userSentence || drillData.reference_english)}
                                        className={getInteractiveTokenClassName(token.text, "removed")}
                                    >
                                        <span className="font-newsreader text-[1rem] italic line-through opacity-85">{token.text}</span>
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        <p className="mt-5 text-sm leading-7 text-stone-500">
                            先记标准句，再重点看橙色和蓝色词块：橙色是错位或替换，蓝色是漏掉的部分。
                        </p>
                    </motion.div>
                ) : null}

                <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: prefersReducedMotion ? 0.16 : 0.32, delay: prefersReducedMotion ? 0 : 0.22 }}
                    className="rounded-[1.8rem] border border-stone-100 bg-white/90 p-5 shadow-[0_16px_30px_rgba(15,23,42,0.04)]"
                >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-stone-500">难度信号</p>
                            <p className="mt-2 text-sm leading-7 text-stone-500">
                                {isPassageFeedback
                                    ? "每段都会先看本段客观指标，再选一次主观感受。最后一段会自动合成为整篇总自评。"
                                    : "底部选一下你的主观感受，系统会结合这些指标调整下一题。"}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {metrics.map((metric, index) => (
                            <motion.div
                                key={metric.label}
                                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: prefersReducedMotion ? 0.12 : 0.2, delay: prefersReducedMotion ? 0 : 0.24 + (index * 0.025) }}
                                className="rounded-2xl border border-stone-100 bg-stone-50/72 p-4"
                            >
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">{metric.label}</div>
                                <div className="mt-2 text-xl font-bold text-stone-900">{metric.value}</div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {rebuildPassageSummary ? (
                    <motion.div
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0.16 : 0.32, delay: prefersReducedMotion ? 0 : 0.28 }}
                        className="rounded-[1.8rem] border border-teal-100 bg-[linear-gradient(180deg,rgba(240,253,250,0.96),rgba(255,255,255,0.94))] p-5 shadow-[0_16px_30px_rgba(20,184,166,0.08)]"
                    >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-600">Passage Summary</p>
                                <h4 className="mt-2 text-2xl font-bold text-slate-900">短文分段综合结算</h4>
                            </div>
                            <div className="rounded-full border border-teal-200 bg-white/80 px-4 py-2 text-sm font-bold text-teal-700">
                                {rebuildPassageSummary.segmentCount} 段 · Shadowing {rebuildPassageSummary.sessionBattleScore10.toFixed(1)}
                            </div>
                        </div>
                        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {[
                                { label: "客观总分", value: `${rebuildPassageSummary.sessionObjectiveScore100}` },
                                { label: "总自评", value: `${rebuildPassageSummary.sessionSelfScore100}` },
                                { label: "综合分", value: `${rebuildPassageSummary.sessionScore100}` },
                                { label: "Elo 变化", value: `${rebuildPassageSummary.change >= 0 ? "+" : ""}${rebuildPassageSummary.change}` },
                            ].map((metric) => (
                                <div key={metric.label} className="rounded-2xl border border-teal-100 bg-white/90 p-4">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-500">{metric.label}</div>
                                    <div className="mt-2 text-xl font-bold text-slate-900">{metric.value}</div>
                                </div>
                            ))}
                        </div>
                        <p className="mt-4 text-sm leading-7 text-stone-600">
                            结算后 Elo 为 <span className="font-bold text-slate-900">{rebuildPassageSummary.eloAfter}</span>，
                            本场获得 <span className="font-bold text-slate-900">{rebuildPassageSummary.coinsEarned}</span> 星光币。
                        </p>
                    </motion.div>
                ) : null}
            </div>
        );
    };

    const hasDetailedAnalysis = Boolean(
            drillFeedback && (
                (drillFeedback.word_results && drillFeedback.word_results.length > 0) ||
                drillFeedback.segments ||
                drillFeedback.feedback ||
                drillFeedback.improved_version ||
                (drillFeedback.tips_cn && drillFeedback.tips_cn.length > 0) ||
                (drillFeedback.error_analysis && drillFeedback.error_analysis.length > 0) ||
                (drillFeedback.similar_patterns && drillFeedback.similar_patterns.length > 0)
            )
    );
    const analysisHighlights = hasDetailedAnalysis ? getAnalysisHighlights() : [];
    const analysisLead = getAnalysisLead();
    const primaryAdvice = mode === "listening"
        ? ""
        : Array.isArray(drillFeedback?.feedback)
        ? drillFeedback?.feedback?.[0]
        : drillFeedback?.feedback?.dictation_tips?.[0]
            || drillFeedback?.feedback?.listening_tips?.[0]
            || drillFeedback?.tips_cn?.[0]
            || drillFeedback?.feedback?.encouragement
            || "";
    // Auto-Mount Generate (WAIT for Elo to be loaded first!)
    useEffect(() => {
        // Only generate when Elo is loaded to ensure correct difficulty
        if (!isEloLoaded) return;

        if (!drillData && !isGeneratingDrill) {
            handleGenerateDrill();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, isEloLoaded]);

    useEffect(() => {
        if (!isRebuildMode || isRebuildPassage || pendingRebuildAdvanceElo === null || isGeneratingDrill) return;
        const timeoutId = window.setTimeout(() => {
            const selectedEvaluation = rebuildFeedback?.selfEvaluation;
            const prefetchedChoice = selectedEvaluation
                ? prefetchedRebuildChoicesRef.current[selectedEvaluation]
                : null;
            setPendingRebuildAdvanceElo(null);
            if (prefetchedChoice) {
                consumeNextDrill(prefetchedChoice);
                return;
            }
            void handleGenerateDrill(undefined, undefined, true, pendingRebuildAdvanceElo);
        }, 120);

        return () => window.clearTimeout(timeoutId);
    }, [consumeNextDrill, handleGenerateDrill, isGeneratingDrill, isRebuildMode, isRebuildPassage, pendingRebuildAdvanceElo, rebuildFeedback]);



    const BOSS_CONFIG = {
        'blind': {
            name: '盲眼聆听者 (BLIND)',
            desc: '原速播放 • 无文本提示',
            icon: EyeOff,
            color: 'text-stone-300',
            bg: 'bg-stone-500',
            style: "bg-[#1a1a1a] border-stone-800 shadow-[0_0_60px_rgba(0,0,0,0.8)] text-stone-300 ring-1 ring-stone-800/50 grayscale",
            introDelay: 2000,
            bgm: '/blind_intro.mp3'
        },
        'lightning': {
            name: '闪电恶魔 (LIGHTNING)',
            desc: '30秒限时 • 1.5倍速挑战',
            icon: Zap,
            color: 'text-amber-400',
            bg: 'bg-amber-500',
            style: "bg-[#2A1B00] border-amber-500/50 shadow-[0_0_80px_rgba(245,158,11,0.3)] text-amber-100 ring-1 ring-amber-500/30",
            introDelay: 2000,
            bgm: '/lightning_intro.mp3'
        },
        'echo': {
            name: '回声巨兽 (ECHO)',
            desc: '只听一次 • 瞬间记忆挑战',
            icon: Volume2,
            color: 'text-cyan-400',
            bg: 'bg-cyan-500',
            style: "bg-[#082f49] border-cyan-500/40 shadow-[0_0_80px_rgba(6,182,212,0.25)] text-cyan-100 ring-1 ring-cyan-500/20",
            introDelay: 2500,
            bgm: 'https://commondatastorage.googleapis.com/codeskulptor-demos/pyman_assets/intromusic.ogg'
        },
        'reaper': {
            name: '死神 (THE REAPER)',
            desc: '3 HP • 死亡凝视 • 错误即死',
            icon: Skull,
            color: 'text-rose-500',
            bg: 'bg-rose-600',
            style: "bg-black border-red-900/60 shadow-[0_0_120px_rgba(225,29,72,0.6)] text-rose-50 ring-2 ring-red-900",
            introDelay: 3000,
            bgm: 'https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/lose.ogg'
        },
        'roulette': {
            name: '幸运转轮 (LUCKY CHAMBER)',
            desc: '1/6 概率死亡 • +20 Elo 奖池',
            icon: Dices,
            color: 'text-emerald-400',
            bg: 'bg-emerald-600',
            style: "bg-[#022c22] border-emerald-500/50 shadow-[0_0_80px_rgba(16,185,129,0.3)] text-emerald-100 ring-1 ring-emerald-500/30",
            introDelay: 1000,
            bgm: '/gamble_intro.mp3'
        },
        'roulette_execution': {
            name: '死刑执行 (EXECUTION)',
            desc: '实弹命中 • 炼狱难度 • 胜者翻倍',
            icon: Skull,
            color: 'text-red-600',
            bg: 'bg-red-700',
            style: "bg-black border-red-600 shadow-[0_0_150px_rgba(220,38,38,0.9)] text-red-500 ring-4 ring-red-600 animate-pulse",
            introDelay: 500,
            bgm: 'https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/lose.ogg'
        }
    } as const;

    const currentBoss = BOSS_CONFIG[bossState.type] || BOSS_CONFIG['blind'];
    const drillSurfacePhase = getDrillSurfacePhase({
        isProfileLoaded: isEloLoaded,
        isGeneratingDrill,
        hasDrillData: !!drillData,
    });
    const loaderActive = drillSurfacePhase === "bootstrap" || drillSurfacePhase === "loading";
    const [loaderTick, setLoaderTick] = useState(0);

    useEffect(() => {
        if (!loaderActive) {
            setLoaderTick(0);
            return;
        }

        const intervalId = window.setInterval(() => {
            setLoaderTick((prev) => prev + 1);
        }, 760);

        return () => window.clearInterval(intervalId);
    }, [loaderActive]);

    type DrillLoadingVariant = DrillMode;

    const renderDrillLoadingState = ({
        title,
        subtitle,
        backgroundClass,
        variant,
    }: {
        title: string;
        subtitle: string;
        backgroundClass: string;
        variant: DrillLoadingVariant;
    }) => {
        const variantUi = variant === "listening" || variant === "dictation"
            ? {
                mode: variant === "dictation" ? "Dictation Mode" : "Listening Mode",
                icon: variant === "dictation" ? BookOpen : Headphones,
                stages: variant === "dictation" ? ["语义取样", "音频校准", "听写就绪"] : ["声纹预热", "降噪校准", "播放就绪"],
                comfortCopy: variant === "dictation" ? "正在准备听音写中文的题目流程" : "正在为你生成更清晰、稳定的听力挑战",
            }
            : variant === "translation"
                ? {
                    mode: "Translate Mode",
                    icon: Globe,
                    stages: ["语义草拟", "语法校准", "句式润色"],
                    comfortCopy: "正在为你打磨更自然、地道的表达难度",
                }
                : {
                    mode: "Rebuild Mode",
                    icon: BookOpen,
                    stages: ["语义构稿", "词块切分", "短文就绪"],
                    comfortCopy: "正在按你的 Rebuild Elo 生成更自然的体验",
                };

        const ModeIcon = variantUi.icon;
        const stageIndex = Math.min(variantUi.stages.length - 1, Math.floor(loaderTick / 4));
        const pseudoProgress = Math.round(18 + (1 - Math.exp(-loaderTick / 6)) * 74);

        return (
            <div className="h-full flex flex-col items-center justify-center relative overflow-hidden px-4">
                <div className={cn("absolute inset-0", backgroundClass)} />
                <div className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-[2.5rem] border border-[rgba(200,200,200,0.4)] bg-[rgba(255,255,255,0.95)] p-10 shadow-[0_20px_60px_rgba(20,20,20,0.08)] backdrop-blur-[24px] md:p-14">
                    
                    <div className="relative mx-auto mb-12 flex h-24 w-24 items-center justify-center">
                        {/* Soft shadow core */}
                        <div className="absolute inset-3 rounded-full bg-stone-50/80 shadow-[inset_0_1px_4px_rgba(0,0,0,0.04)]" />
                        
                        {/* Premium SVG Caterpillar Scanner */}
                        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="0.5" fill="none" className="text-stone-200/60" />
                            <motion.circle
                                cx="50" cy="50" r="48"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                fill="none"
                                strokeLinecap="round"
                                className="text-stone-800"
                                animate={prefersReducedMotion ? { strokeDasharray: "300 300" } : { 
                                    strokeDasharray: ["0 302", "150 152", "0 302"], 
                                    strokeDashoffset: [0, -150, -302] 
                                }}
                                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                            />
                        </svg>

                        <ModeIcon className="relative z-10 w-8 h-8 text-stone-800" strokeWidth={1.25} />
                    </div>

                    <div className="text-center space-y-3">
                        <h3 className="font-newsreader text-[2rem] font-medium leading-none tracking-tight text-stone-900 md:text-[2.4rem]">{title}</h3>
                        <p className="text-[14px] font-medium tracking-wide text-stone-500">{subtitle}</p>
                        <p className="pt-2 text-[12px] text-stone-400">{variantUi.comfortCopy}</p>
                    </div>

                    <div className="mt-12 flex items-center justify-between text-[11px] font-bold tracking-[0.2em] uppercase text-stone-400">
                        <motion.span
                            key={variantUi.stages[stageIndex]}
                            initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="text-stone-800"
                        >
                            {variantUi.stages[stageIndex]}
                        </motion.span>
                        <span className="tabular-nums font-mono tracking-wider">{pseudoProgress}%</span>
                    </div>

                    <div className="relative mx-auto mt-4 h-[2px] w-full overflow-hidden rounded-full bg-stone-100">
                        <div
                            className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-700 ease-out bg-stone-800"
                            style={{ width: `${pseudoProgress}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div
            className={cn(
                "fixed inset-0 z-50 transition-colors duration-1000 bg-theme-base-bg",
                    isRebuildPassage
                        ? "flex items-start justify-center p-0 md:px-6 md:pb-6 md:pt-2"
                        : "flex items-center justify-center p-4 md:p-8",
                    shake && "animate-shake"
                )}
            >
                {/* Dynamic Background Engine */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
                    <AnimatePresence mode="popLayout">
                        {theme === 'fever' && (
                            <motion.div
                                key="theme-fever"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1 }}
                                className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0f0a1a] to-[#1a0a0a]"
                            >
                                {/* Animated gradient orbs */}
                                <motion.div
                                    className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-[120px]"
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                />
                                <motion.div
                                    className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-fuchsia-500/15 rounded-full blur-[100px]"
                                    animate={{ scale: [1.2, 1, 1.2], opacity: [0.15, 0.3, 0.15] }}
                                    transition={{ duration: 4, repeat: Infinity }}
                                />
                                <motion.div
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px]"
                                    animate={{ scale: [1, 1.3, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                />

                                {/* Grid overlay */}
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />

                                {/* Top neon line */}
                                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_30px_rgba(249,115,22,0.8),0_0_60px_rgba(249,115,22,0.4)]" />
                                {/* Bottom neon line */}
                                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent shadow-[0_0_30px_rgba(245,158,11,0.8)]" />
                                {/* Side glow */}
                                <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-orange-500/50 to-transparent" />
                                <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-amber-500/50 to-transparent" />
                            </motion.div>
                        )}
                        {theme === 'crimson' && (
                            <motion.div
                                key="theme-crimson"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1 }}
                                className="absolute inset-0 bg-[#2b0a0a]"
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(220,38,38,0.15),transparent_70%)] animate-pulse" />
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-600 to-transparent shadow-[0_0_30px_rgba(220,38,38,0.6)]" />
                            </motion.div>
                        )}
                        {theme === 'boss' && (
                            <motion.div
                                key="theme-boss"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1 }}
                                className="absolute inset-0 bg-black"
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(217,119,6,0.2),transparent_60%)]" />
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 animate-[spin_100s_linear_infinite]" />
                                <div className="absolute inset-0 border-[20px] border-amber-900/10" />
                            </motion.div>
                        )}
                        {false && (
                            <motion.div
                                key={`theme-cosmetic-${cosmeticTheme}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.8 }}
                                className={cn("absolute inset-0", activeCosmeticTheme.bgClass)}
                            >
                                {/* Morning Coffee orbs */}
                                {cosmeticTheme === 'morning_coffee' && (
                                    <>
                                        <motion.div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-slate-200/50 rounded-full blur-[120px]" animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, -30, 0] }} transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-100/40 rounded-full blur-[100px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -40, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-stone-100/30 rounded-full blur-[150px]" animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
                                    </>
                                )}

                                {/* Sakura petals + pink glow */}
                                {cosmeticTheme === 'sakura' && (
                                    <>
                                        <motion.div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-pink-300/25 rounded-full blur-[150px]" animate={{ scale: [1, 1.15, 1], x: [0, -20, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute bottom-1/3 left-1/3 w-[400px] h-[400px] bg-rose-200/20 rounded-full blur-[120px]" animate={{ scale: [1.1, 1, 1.1], y: [0, 15, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
                                        {/* Falling petals */}
                                        {[...Array(8)].map((_, i) => (
                                            <motion.div key={i} className="absolute text-pink-300/60 text-lg select-none pointer-events-none" style={{ left: `${8 + i * 12}%`, top: '-5%' }} animate={{ y: [0, 800], x: [0, Math.sin(i) * 60, 0], rotate: [0, 360 * (i % 2 === 0 ? 1 : -1)] }} transition={{ duration: 8 + i * 2, repeat: Infinity, delay: i * 1.5, ease: "linear" }} >🌸</motion.div>
                                        ))}
                                    </>
                                )}

                                {/* Golden Hour — warm flowing orbs */}
                                {cosmeticTheme === 'golden_hour' && (
                                    <>
                                        <motion.div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-300/25 rounded-full blur-[150px]" animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -15, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-rose-300/20 rounded-full blur-[130px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -20, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-orange-200/20 rounded-full blur-[110px]" animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.3, 0.15] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
                                        {/* Warm light rays */}
                                        <div className="absolute top-0 right-0 w-[60%] h-[60%] bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.12),transparent_60%)]" />
                                        <div className="absolute bottom-0 left-0 w-[40%] h-[40%] bg-[radial-gradient(ellipse_at_bottom_left,rgba(251,113,133,0.08),transparent_60%)]" />
                                    </>
                                )}

                                {/* Verdant Atelier — forest still image + emerald mist */}
                                {cosmeticTheme === 'verdant_atelier' && (
                                    <>
                                        <div className="absolute inset-0 bg-[url('/themes/forest-photo.jpg')] bg-cover bg-center bg-no-repeat opacity-[0.78]" />
                                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,44,34,0.1),rgba(2,44,34,0.06),rgba(2,44,34,0.16))]" />
                                    </>
                                )}

                                {/* Cute Cream — premium cream desk with soft stationery accents */}
                                {cosmeticTheme === 'cute_cream' && (
                                    <div className="absolute inset-0 overflow-hidden">
                                        <motion.div
                                            className="absolute -top-[8%] left-[8%] h-[32vw] w-[32vw] rounded-full bg-[#ffe1bf]/55 blur-[110px]"
                                            animate={{ scale: [1, 1.08, 1], x: [0, 24, 0], y: [0, -12, 0] }}
                                            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                                        />
                                        <motion.div
                                            className="absolute top-[10%] right-[6%] h-[28vw] w-[28vw] rounded-full bg-[#d9f3e3]/58 blur-[110px]"
                                            animate={{ scale: [1.05, 1, 1.05], x: [0, -20, 0], y: [0, 18, 0] }}
                                            transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }}
                                        />
                                        <motion.div
                                            className="absolute bottom-[-6%] left-[28%] h-[30vw] w-[30vw] rounded-full bg-[#fff3d2]/60 blur-[120px]"
                                            animate={{ scale: [1, 1.12, 1], x: [0, 28, 0], y: [0, -16, 0] }}
                                            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
                                        />
                                        <motion.div
                                            className="absolute bottom-[4%] right-[16%] h-[20vw] w-[20vw] rounded-full bg-[#ffd8cc]/42 blur-[100px]"
                                            animate={{ scale: [1.08, 1, 1.08], x: [0, -18, 0], y: [0, 16, 0] }}
                                            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
                                        />
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,252,246,0.9),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(240,251,244,0.68),transparent_28%)]" />
                                        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(185,160,126,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(185,160,126,0.14)_1px,transparent_1px)] bg-[size:48px_48px]" />
                                        <div className="absolute left-[6%] top-[12%] h-12 w-12 rounded-[18px] border border-[#ffd4ab] bg-white/38" />
                                        <div className="absolute right-[10%] top-[18%] h-10 w-10 rounded-full border border-[#cbe9d7] bg-white/28" />
                                        <div className="absolute bottom-[16%] left-[10%] h-14 w-14 rounded-[20px] border border-[#ffe4c7] bg-white/26" />
                                    </div>
                                )}

                                {/* Cloud Nine — Ultra-clean white background with breathable cyan/blue pastel gradients */}
                                {cosmeticTheme === 'cloud_nine' && (
                                    <div className="absolute inset-0 overflow-hidden mix-blend-multiply opacity-50">
                                        <motion.div className="absolute -top-[10%] -left-[10%] w-[70vw] h-[70vw] bg-sky-200/40 rounded-full blur-[120px]" animate={{ scale: [1, 1.1, 1], x: [0, 40, 0], y: [0, 30, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute top-[20%] -right-[20%] w-[80vw] h-[80vw] bg-cyan-100/40 rounded-full blur-[130px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -50, 0], y: [0, -30, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute -bottom-[20%] left-[10%] w-[60vw] h-[60vw] bg-blue-100/40 rounded-full blur-[140px]" animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -40, 0] }} transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} />
                                        {/* Subtle white noise overlay for physical texture */}
                                        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay" />
                                    </div>
                                )}

                                {/* Lilac Dream — Dreamy pastel lavender/pink gradients */}
                                {cosmeticTheme === 'lilac_dream' && (
                                    <div className="absolute inset-0 overflow-hidden">
                                        <motion.div className="absolute top-0 left-0 w-[60vw] h-[60vw] bg-fuchsia-300/15 rounded-full blur-[140px]" animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 20, 0] }} transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute top-[10%] right-[10%] w-[70vw] h-[70vw] bg-purple-300/15 rounded-full blur-[150px]" animate={{ scale: [1.1, 1, 1.1], x: [0, -40, 0], y: [0, -20, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} />
                                        <motion.div className="absolute bottom-0 left-[20%] w-[65vw] h-[65vw] bg-pink-300/15 rounded-full blur-[160px]" animate={{ scale: [1, 1.15, 1], x: [0, 30, 0], y: [0, -40, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
                                        {/* Floating soft light orbs */}
                                        {[...Array(6)].map((_, i) => (
                                            <motion.div
                                                key={i}
                                                className="absolute w-32 h-32 bg-white/20 rounded-full blur-[20px]"
                                                style={{ left: `${20 + Math.random() * 60}%`, top: `${20 + Math.random() * 60}%` }}
                                                animate={{
                                                    opacity: [0.2, 0.5, 0.2],
                                                    scale: [1, 1.5, 1],
                                                    x: [0, (Math.random() - 0.5) * 100],
                                                    y: [0, (Math.random() - 0.5) * 100],
                                                }}
                                                transition={{ duration: 8 + Math.random() * 8, repeat: Infinity, delay: Math.random() * 5, ease: "easeInOut" }}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Noise texture - universal */}
                                <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%274%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E')]" />

                                {/* Grid pattern for light themes */}
                                {!activeCosmeticTheme.isDark && (
                                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <motion.div
                    layout
                    ref={battleShellRef}
                    className={cn(
                        "relative w-full overflow-hidden flex flex-col transition-all duration-700",
                        isRebuildPassage
                            ? "h-full md:h-[calc(100vh-3rem)] max-w-none md:max-w-[980px] rounded-none md:rounded-[2.15rem] shadow-[0_28px_80px_rgba(15,23,42,0.12)]"
                            : "max-w-5xl h-[85vh] rounded-[2.5rem] shadow-2xl",
                        theme === 'fever' ? "bg-[#0a0a12]/95 backdrop-blur-xl border border-orange-500/40 shadow-[0_0_80px_rgba(249,115,22,0.15),0_0_40px_rgba(251,146,60,0.1)] text-white ring-1 ring-orange-500/20" :
                            theme === 'boss' ? currentBoss.style :
                                theme === 'crimson' ? "bg-[#1a0505]/95 border border-red-500/30 shadow-[0_0_60px_rgba(220,38,38,0.2)] text-red-50" :
                                    activeCosmeticTheme.cardClass,
                        canUseStreakAura && "will-change-transform",
                        shake && "animate-shake"
                    )}
                    style={canUseStreakAura ? {
                        borderColor: streakVisual.surfaceBorder,
                        boxShadow: theme === 'fever'
                            ? `${streakVisual.surfaceShadow}, 0 0 80px rgba(249,115,22,0.15), 0 0 40px rgba(251,146,60,0.1)`
                            : streakVisual.surfaceShadow,
                    } : undefined}
                >
                    {canUseStreakAura && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                            <motion.div
                                className="absolute inset-0"
                                style={{ backgroundImage: streakVisual.auraGradient }}
                                initial={false}
                                animate={
                                    streakTransition === 'cooldown'
                                        ? { opacity: 0.18, scale: 0.98 }
                                        : streakTransition === 'surge'
                                            ? { opacity: [0.32, 0.7, 0.42], scale: [0.98, 1.02, 1] }
                                            : { opacity: theme === 'fever' ? 0.32 : 0.42, scale: 1 }
                                }
                                transition={{ duration: prefersReducedMotion ? 0.2 : streakTransition ? 0.55 : 1.2, ease: "easeOut" }}
                            />
                            <motion.div
                                className="absolute inset-x-8 top-0 h-[2px]"
                                style={{ backgroundImage: streakVisual.beamGradient, boxShadow: streakVisual.beamShadow }}
                                initial={false}
                                animate={
                                    streakTransition === 'cooldown'
                                        ? { opacity: 0.2, scaleX: 0.82 }
                                        : streakTransition === 'surge'
                                            ? { opacity: [0.55, 1, 0.8], scaleX: [0.72, 1.05, 1] }
                                            : { opacity: 0.78, scaleX: 1 }
                                }
                                transition={{ duration: prefersReducedMotion ? 0.2 : 0.48, ease: "easeOut" }}
                            />
                            <motion.div
                                className="absolute inset-[1px] rounded-[2.45rem]"
                                style={{
                                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.72), inset 0 0 0 1px ${streakVisual.surfaceBorder}`,
                                }}
                                initial={false}
                                animate={streakTransition === 'cooldown' ? { opacity: 0.22 } : { opacity: 0.7 }}
                            />

                            {canShowStreakParticles && (
                                <div className="absolute inset-0 hidden md:block">
                                    {STREAK_PARTICLE_POSITIONS.slice(0, activeParticleCount).map((left, index) => (
                                        <motion.div
                                            key={`streak-particle-${left}-${index}`}
                                            className="absolute top-full h-2 w-2 rounded-full blur-[1px]"
                                            style={{
                                                left: `${left}%`,
                                                backgroundImage: streakVisual.particleGradient,
                                                boxShadow: `0 0 18px ${streakVisual.badgeGlow}`,
                                            }}
                                            initial={{ opacity: 0, y: 18, scale: 0.6 }}
                                            animate={{
                                                y: [0, -140 - (index % 4) * 16],
                                                opacity: [0, 0.95, 0],
                                                scale: [0.4, 1.08, 0.6],
                                                x: [0, index % 2 === 0 ? 12 : -10, 0],
                                            }}
                                            transition={{
                                                duration: 2.4 + (index % 3) * 0.35,
                                                repeat: Infinity,
                                                delay: index * 0.18,
                                                ease: "easeOut",
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Crimson Hellfire Overlay */}
                    {theme === 'crimson' && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                            {/* Pulse Vignette */}
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(50,0,0,0.4)_100%)] animate-pulse" />
                            {/* Rising Embers */}
                            {[...Array(8)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute w-1 h-1 bg-red-500 rounded-full blur-[1px]"
                                    initial={{ top: '100%', left: `${Math.random() * 100}%`, opacity: 0, scale: 0 }}
                                    animate={{ top: '-10%', opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                                    transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2, ease: "easeOut" }}
                                />
                            ))}
                        </div>
                    )}
                    {/* Fever Overlay Particles - Fire Embers Rising */}
                    {theme === 'fever' && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                            {/* Rising embers */}
                            {[...Array(12)].map((_, i) => (
                                <motion.div
                                    key={`ember-${i}`}
                                    className="absolute w-1.5 h-1.5 rounded-full"
                                    style={{
                                        left: `${5 + Math.random() * 90}%`,
                                        background: `radial-gradient(circle, ${['#f97316', '#fb923c', '#fbbf24', '#f59e0b'][i % 4]}, transparent)`
                                    }}
                                    initial={{ bottom: -20, opacity: 0, scale: 0 }}
                                    animate={{
                                        bottom: '110%',
                                        opacity: [0, 0.8, 0.6, 0],
                                        scale: [0, 1.2, 0.8, 0],
                                        x: [0, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 60]
                                    }}
                                    transition={{
                                        duration: 3 + Math.random() * 2,
                                        repeat: Infinity,
                                        delay: Math.random() * 3,
                                        ease: "easeOut"
                                    }}
                                />
                            ))}
                            {/* Floating sparks */}
                            {[...Array(6)].map((_, i) => (
                                <motion.div
                                    key={`spark-${i}`}
                                    className="absolute w-0.5 h-0.5 bg-yellow-400 rounded-full shadow-[0_0_6px_rgba(250,204,21,0.8)]"
                                    style={{ left: `${10 + Math.random() * 80}%`, top: `${20 + Math.random() * 60}%` }}
                                    animate={{
                                        opacity: [0, 1, 0],
                                        scale: [0, 1.5, 0]
                                    }}
                                    transition={{
                                        duration: 1 + Math.random(),
                                        repeat: Infinity,
                                        delay: Math.random() * 2
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* FEVER STREAK BAR (The Fire Progress) */}
                    {theme === 'fever' && currentStreak >= 2 && (
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-stone-900/50 z-50 overflow-hidden">
                            <motion.div
                                className="h-full relative"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(currentStreak * 10, 100)}%` }}
                                transition={{ type: "spring", stiffness: 100, damping: 15 }}
                                style={{ backgroundImage: streakVisual.progressGradient }}
                            >
                                {/* Glow effect */}
                                <div className="absolute inset-0 blur-sm opacity-80" style={{ backgroundImage: streakVisual.progressGradient }} />
                                {/* Sparkle at end */}
                                <motion.div
                                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full blur-[2px]"
                                    animate={{ opacity: [0.6, 1, 0.6], scale: [0.8, 1.2, 0.8] }}
                                    transition={{ duration: 0.8, repeat: Infinity }}
                                />
                            </motion.div>
                            {/* Streak count badge */}
                            <motion.div
                                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                style={{ color: streakVisual.accent }}
                            >
                                <Flame className="w-3 h-3 fill-current" />
                                <span className="font-mono">{currentStreak}</span>
                            </motion.div>
                        </div>
                    )}

                    {/* BOSS FUSE (The Burning Wick) */}
                    {theme === 'boss' && (
                        <div className="absolute top-0 left-0 right-0 h-2 bg-stone-900 z-50">
                            <motion.div
                                className="h-full bg-gradient-to-r from-amber-600 via-orange-500 to-yellow-400 shadow-[0_0_20px_rgba(245,158,11,0.8)] relative"
                                style={{ width: `${fuseTime}%` }}
                            >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-white rounded-full blur-[2px] animate-pulse" />
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 bg-orange-500/50 rounded-full blur-xl animate-pulse" />
                            </motion.div>
                        </div>
                    )}

                    {/* Recording indicator - simplified */}
                    <AnimatePresence>
                        {whisperRecording && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-full shadow-lg"
                            >
                                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                <span className="text-sm font-bold">Recording...</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {/* Header - Compact Info Bar */}
                    <div
                        className={cn(
                            "flex items-center p-3 md:p-4 shrink-0",
                            isRebuildPassage
                                ? "justify-between"
                                : "justify-between border-b border-stone-100/50"
                        )}
                    >
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Unified Info Pill */}
                            {drillData && (
                                <div className="flex items-center h-[38px] px-0.5 bg-white/60 backdrop-blur-xl rounded-full border border-white/60 shadow-[0_8px_24px_rgba(0,0,0,0.03)] ring-1 ring-stone-200/30 overflow-hidden transition-all shrink-0">
                                    {/* Rank Section */}
                                    {(() => {
                                        const rank = getRank(currentElo || DEFAULT_BASE_ELO);
                                        return bossState.type === 'roulette_execution' ? (
                                            <div className="flex items-center gap-1.5 px-3 h-full rounded-full bg-red-900/10 text-red-700/90">
                                                <Skull className="w-[14px] h-[14px] text-red-500" />
                                                <span className="font-bold text-[11px] tracking-wider uppercase drop-shadow-sm">处决模式</span>
                                            </div>
                                        ) : rouletteSession?.result === 'safe' ? (
                                            <div className="flex items-center gap-1.5 px-3 h-full rounded-full bg-amber-500/10 text-amber-700/90">
                                                <Zap className="w-[14px] h-[14px] text-amber-500 fill-amber-500" />
                                                <span className="font-bold text-[11px] tracking-wider uppercase drop-shadow-sm">x{rouletteSession.multiplier}</span>
                                            </div>
                                        ) : (
                                            <div className={cn("flex items-center gap-1.5 px-2.5 h-full rounded-full", rank.color)}>
                                                <rank.icon className="w-[14px] h-[14px]" />
                                                <span className="font-bold text-[11px] tracking-wider uppercase drop-shadow-sm">{rank.title}</span>
                                                <div className="w-[1px] h-3 bg-current opacity-20 mx-0.5" />
                                                <span className="font-newsreader font-medium italic text-[13px]">{currentElo || DEFAULT_BASE_ELO}</span>
                                            </div>
                                        );
                                    })()}

                                    {/* Difficulty Section - Simplified to Word Count */}
                                    {drillData?._difficultyMeta && !isRebuildMode && (
                                        <>
                                            <div className="w-[1px] h-3 bg-stone-300/40 rounded-full mx-0.5" />
                                            <div className={cn(
                                                "flex items-center px-2 h-full rounded-full text-[11px] font-bold transition-colors",
                                                drillData._difficultyMeta.status === 'MATCHED'
                                                    ? "text-emerald-700/80 hover:bg-emerald-50"
                                                    : drillData._difficultyMeta.status === 'TOO_EASY'
                                                        ? "text-amber-700/80 hover:bg-amber-50"
                                                        : "text-rose-700/80 hover:bg-rose-50"
                                            )}>
                                                <span>{drillData._difficultyMeta.actualWordCount}词</span>
                                            </div>
                                            {mode === "listening" && drillData._difficultyMeta.listeningFeatures?.trainingFocus ? (
                                                <>
                                                    <div className="w-[1px] h-3 bg-stone-300/40 rounded-full mx-0.5" />
                                                    <div className="flex items-center px-2.5 h-full rounded-full text-[11px] font-bold text-sky-700/80 transition-colors hover:bg-sky-50">
                                                        <span>{drillData._difficultyMeta.listeningFeatures.trainingFocus}</span>
                                                    </div>
                                                </>
                                            ) : null}
                                        </>
                                    )}

                                    {/* Topic Section - Simplified */}
                                    {drillData?._topicMeta && (
                                        <>
                                            <div className="w-[1px] h-3 bg-stone-300/40 rounded-full mx-0.5" />
                                            <div
                                                className="flex items-center gap-1 px-2.5 h-full rounded-full text-[11px] font-bold text-blue-700/80 transition-colors hover:bg-blue-50 cursor-pointer"
                                                title={drillData._topicMeta.topic}
                                            >
                                                <span className="text-[12px] leading-none mb-[1px]">📌</span>
                                                <span className="max-w-[108px] sm:max-w-[144px] truncate opacity-95">
                                                    {drillData._topicMeta.topic}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Streak Counter - Separate for emphasis */}
                            {(currentStreak >= 2 || streakTransition === 'cooldown') && (
                                <motion.div
                                    initial={false}
                                    animate={
                                        streakTransition === 'cooldown'
                                            ? { scale: 0.96, y: 0, opacity: 0.72 }
                                            : streakTransition === 'surge'
                                                ? { scale: [1, 1.08, 1.02], y: [0, -2, 0], opacity: [0.88, 1, 1] }
                                                : activeStreakTier >= 3 && !prefersReducedMotion
                                                    ? { scale: [1, 1.018, 1], y: [0, -0.5, 0], opacity: [0.98, 1, 0.98] }
                                                    : { scale: 1, y: 0, opacity: 1 }
                                    }
                                    transition={{
                                        duration: streakTransition ? 0.45 : activeStreakTier >= 3 ? 2.6 : 1.5,
                                        repeat: !streakTransition && activeStreakTier >= 3 && !prefersReducedMotion ? Infinity : 0,
                                        ease: streakTransition ? "easeOut" : "easeInOut",
                                    }}
                                    className="relative overflow-hidden rounded-full border px-3 py-1.5"
                                    style={{
                                        backgroundImage: streakVisual.badgeGradient,
                                        borderColor: streakVisual.badgeBorder,
                                        boxShadow: `0 0 0 1px ${streakVisual.badgeBorder}, ${streakVisual.badgeShadow}`,
                                        color: streakVisual.accent,
                                    }}
                                >
                                    <div
                                        className="pointer-events-none absolute inset-0 rounded-full blur-xl"
                                        style={{
                                            background: `radial-gradient(circle at center, ${streakVisual.badgeGlow}, transparent 70%)`,
                                            opacity: streakTier >= 2 ? 0.9 : 0.55,
                                        }}
                                    />
                                    {activeStreakTier >= 3 && !prefersReducedMotion && (
                                        <motion.div
                                            className="pointer-events-none absolute inset-y-0 -inset-x-6 rounded-full"
                                            style={{
                                                background: "linear-gradient(112deg, transparent 6%, rgba(255,255,255,0.06) 28%, rgba(255,255,255,0.52) 50%, rgba(255,255,255,0.08) 72%, transparent 94%)",
                                                filter: "blur(10px)",
                                                mixBlendMode: "screen",
                                            }}
                                            animate={{
                                                x: [-14, 14, -14],
                                                opacity: [0.34, 0.72, 0.34],
                                                scaleX: [0.985, 1.02, 0.985],
                                            }}
                                            transition={{
                                                duration: activeStreakTier === 4 ? 3.1 : 4,
                                                repeat: Infinity,
                                                ease: "easeInOut",
                                            }}
                                        />
                                    )}
                                    <div className="relative z-10 flex items-center gap-1.5 font-bold text-[10px] tracking-[0.18em] uppercase">
                                        <div
                                            className="flex h-5 w-5 items-center justify-center rounded-full"
                                            style={{
                                                background: `radial-gradient(circle, rgba(255,255,255,0.7) 0%, ${streakVisual.badgeGlow} 45%, transparent 100%)`,
                                            }}
                                        >
                                            <Flame className="h-3.5 w-3.5 fill-current" />
                                        </div>
                                        <span className="font-mono tabular-nums">{streakTransition === 'cooldown' ? cooldownStreak : currentStreak}连</span>
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* Right Side Actions & Ledger */}
                        <div className="flex items-center gap-2">
                            {/* Mobile/Desktop Status Bar - Unified (Collapsible) */}
                            {canUseModeShop && (
                                <div className={cn(
                                    "hidden md:flex items-center h-[38px] gap-1 p-0.5 rounded-full backdrop-blur-xl border ring-1 shrink-0 transition-all duration-300",
                                    activeCosmeticUi.ledgerClass,
                                    isHintShake && "animate-[shake_0.4s_ease-in-out] border-red-300 shadow-[0_0_18px_rgba(220,38,38,0.2)]"
                                )}
                                    onMouseEnter={() => {
                                        if (shopDockHasHoverSupport) setIsShopDockHovered(true);
                                    }}
                                    onMouseLeave={() => {
                                        if (shopDockHasHoverSupport) setIsShopDockHovered(false);
                                    }}
                                    onFocusCapture={() => setIsShopDockHovered(true)}
                                    onBlurCapture={(event) => {
                                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                            setIsShopDockHovered(false);
                                        }
                                    }}
                                >
                                    <div
                                        className={cn(
                                            "overflow-hidden transition-all duration-300 ease-out",
                                            isShopInventoryExpanded ? "max-w-[460px] opacity-100 mr-1" : "max-w-0 opacity-0 mr-0"
                                        )}
                                        aria-hidden={!isShopInventoryExpanded}
                                    >
                                        <div className="flex items-center h-[34px] shrink-0 gap-1 px-1">
                                            <div
                                                ref={(node) => { resourceTargetRefs.current.coins = node; }}
                                                data-economy-target="coins"
                                                className={cn("flex items-center gap-1 px-2.5 h-full rounded-full transition-all duration-300 cursor-default text-stone-700 hover:bg-white/70", getEconomyPulseClass('coins'))}
                                            >
                                                <span className="text-[12px] leading-none drop-shadow-sm mb-[1px]">✨</span>
                                                <span className="font-mono font-bold text-[12px] tabular-nums">{coins}</span>
                                            </div>

                                            <div
                                                ref={(node) => { resourceTargetRefs.current.capsule = node; }}
                                                data-economy-target="capsule"
                                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-blue-700/80 hover:bg-blue-50", getEconomyPulseClass('capsule'))}
                                            >
                                                <span className="text-[11px] leading-none mb-[1px]">💊</span>
                                                <span className="font-mono font-semibold text-[11px] tabular-nums">{capsuleCount}</span>
                                            </div>

                                            <div
                                                ref={(node) => { resourceTargetRefs.current.hint_ticket = node; }}
                                                data-economy-target="hint_ticket"
                                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-amber-700/80 hover:bg-amber-50", getEconomyPulseClass('hint_ticket'))}
                                            >
                                                <span className="text-[11px] leading-none mb-[1px]">🪄</span>
                                                <span className="font-mono font-semibold text-[11px] tabular-nums">{hintTicketCount}</span>
                                            </div>

                                            <div
                                                ref={(node) => { resourceTargetRefs.current.vocab_ticket = node; }}
                                                data-economy-target="vocab_ticket"
                                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-emerald-700/80 hover:bg-emerald-50", getEconomyPulseClass('vocab_ticket'))}
                                            >
                                                <span className="text-[11px] leading-none mb-[1px]">🧩</span>
                                                <span className="font-mono font-semibold text-[11px] tabular-nums">{vocabTicketCount}</span>
                                            </div>

                                            <div
                                                ref={(node) => { resourceTargetRefs.current.audio_ticket = node; }}
                                                data-economy-target="audio_ticket"
                                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-indigo-700/80 hover:bg-indigo-50", getEconomyPulseClass('audio_ticket'))}
                                            >
                                                <span className="text-[11px] leading-none mb-[1px]">🔊</span>
                                                <span className="font-mono font-semibold text-[11px] tabular-nums">{audioTicketCount}</span>
                                            </div>

                                            <div
                                                ref={(node) => { resourceTargetRefs.current.refresh_ticket = node; }}
                                                data-economy-target="refresh_ticket"
                                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-cyan-700/80 hover:bg-cyan-50", getEconomyPulseClass('refresh_ticket'))}
                                            >
                                                <RefreshCw className="h-[11px] w-[11px]" />
                                                <span className="font-mono font-semibold text-[11px] tabular-nums">{refreshTicketCount}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Shop Button - Always Visible */}
                                    <button
                                        onClick={() => {
                                            setShopFocusedItem(null);
                                            setShowShopModal(true);
                                        }}
                                        className={cn(
                                            "relative flex items-center justify-center h-full min-w-[68px] rounded-full px-4 transition-all duration-300 shrink-0 border",
                                            activeCosmeticUi.audioUnlockedClass
                                        )}
                                        title="打开商场"
                                    >
                                        <span className="font-bold text-[11px] tracking-widest leading-none mt-[1px]">商场</span>
                                    </button>
                                </div>
                            )}

                            {mode === 'translation' && !learningSessionActive && (
                                <button
                                    onClick={handleStartGuidedLearning}
                                    disabled={!drillData || !!drillFeedback || guidedModeStatus === "loading"}
                                    className={cn(
                                        "hidden sm:flex items-center gap-1.5 h-[38px] px-4 rounded-full font-bold text-[12px] transition-all duration-300 shrink-0 border shadow-[0_8px_24px_rgba(0,0,0,0.03)] disabled:opacity-50 disabled:cursor-not-allowed",
                                        activeCosmeticUi.audioUnlockedClass
                                    )}
                                    title="打开引导学习模式"
                                >
                                    <Sparkles className={cn("w-[14px] h-[14px]", guidedModeStatus === "loading" && "animate-spin")} />
                                    <span className="tracking-wide text-[12px]">引导学习</span>
                                </button>
                            )}

                            {/* Teaching Mode Button - Only for Translation */}
                            {mode === 'translation' && !learningSessionActive && (
                                <button
                                    onClick={() => {
                                        if (!teachingMode) {
                                            // First time enabling: turn on and auto-fetch if drill exists
                                            setTeachingMode(true);
                                            if (drillData && drillData.chinese && drillData.reference_english && !teachingData && !isLoadingTeaching) {
                                                setIsLoadingTeaching(true);
                                                fetch('/api/ai/teach', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        chinese: drillData.chinese,
                                                        reference_english: drillData.reference_english,
                                                        elo: eloRating || DEFAULT_BASE_ELO,
                                                    }),
                                                })
                                                    .then(r => r.json())
                                                    .then(d => { if (!d.error) setTeachingData(d); })
                                                    .catch(() => { })
                                                    .finally(() => setIsLoadingTeaching(false));
                                            }
                                            setTeachingPanelOpen(true);
                                        } else {
                                            // Toggle panel open/close
                                            setTeachingPanelOpen(!teachingPanelOpen);
                                        }
                                    }}
                                    className={cn(
                                        "hidden sm:flex items-center gap-1.5 h-[38px] px-4 rounded-full font-bold text-[12px] transition-all duration-300 shrink-0 border shadow-[0_8px_24px_rgba(0,0,0,0.03)]",
                                        teachingMode && teachingPanelOpen
                                            ? activeCosmeticUi.checkButtonClass
                                            : teachingMode
                                                ? activeCosmeticUi.audioUnlockedClass
                                                : activeCosmeticUi.iconButtonClass
                                    )}
                                    title={teachingPanelOpen ? '收起教学面板' : '打开教学面板'}
                                >
                                    <BookOpen className={cn("w-[14px] h-[14px]", teachingMode && isLoadingTeaching && "animate-pulse")} />
                                    <span className="tracking-wide text-[12px]">教学</span>
                                    {teachingMode && (
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full ml-0.5",
                                            isLoadingTeaching ? "bg-amber-400 animate-pulse" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                                        )} />
                                    )}
                                </button>
                            )}
                            {mode === 'translation' && learningSessionActive && !isGuidedOverlayOpen && (
                                <div className="hidden sm:flex items-center gap-2 h-[38px] px-4 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-[12px] font-bold">
                                    <Sparkles className="w-[14px] h-[14px]" />
                                    <span className="tracking-wide">学习态 · 本题不计分</span>
                                </div>
                            )}
                            {onClose && (
                                <button
                                    onClick={onClose}
                                    className={cn(
                                        "w-[38px] h-[38px] rounded-full flex items-center justify-center transition-all duration-300 group shrink-0 border",
                                        activeCosmeticUi.iconButtonClass
                                    )}
                                >
                                    <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="flex-1 relative overflow-y-auto flex flex-col">

                        {/* Scoring Flip Card Animation */}
                        {!isRebuildMode && (
                            <ScoringFlipCard
                                isScoring={isSubmittingDrill && !drillFeedback}
                                userAnswer={userTranslation}
                                mode={mode}
                                streakTier={streakTier}
                            />
                        )}


                        {drillSurfacePhase !== "ready" ? (
                            renderDrillLoadingState({
                                title: mode === "translation"
                                    ? "正在生成句子..."
                                    : mode === "dictation"
                                        ? "正在准备听写..."
                                        : mode === "rebuild"
                                            ? "正在准备 Rebuild 练习..."
                                            : "正在准备音频...",
                                subtitle: mode === "translation"
                                    ? "Crafting your phrase"
                                    : mode === "dictation"
                                        ? "Preparing dictation stream"
                                        : mode === "rebuild"
                                            ? "Preparing rebuild puzzle"
                                            : "Preparing audio stream",
                                backgroundClass: "bg-gradient-to-br from-stone-50 via-white to-slate-50/70",
                                variant: mode,
                            })
                        ) : drillData ? (
                            <AnimatePresence mode="popLayout" initial={false}>
                                {(!drillFeedback || isRebuildMode) ? (
                                    <motion.div
                                        key="question"
                                        initial={{ x: -20, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        exit={{ x: -20, opacity: 0 }}
                                        transition={{ duration: 0.4, ease: "easeOut" }}
                                        className={cn(
                                            "absolute inset-0 overflow-y-auto custom-scrollbar flex flex-col transition-[filter,opacity,transform] duration-300",
                                            isRebuildMode
                                                ? (isRebuildPassage ? "p-4 md:px-8 md:py-8 pb-10 md:pb-12" : "p-4 md:p-5 pb-5 md:pb-6")
                                                : isDictationMode
                                                    ? "p-4 md:p-5 pb-6 md:pb-8"
                                                    : "p-6 md:p-8 pb-10 md:pb-12",
                                            isRebuildMode && rebuildFeedback && !isRebuildPassage
                                                ? "pointer-events-none opacity-15 blur-[3px]"
                                                : ""
                                        )}
                                    >
                                        <div className={cn("mx-auto w-full", isRebuildMode ? (isRebuildPassage ? "max-w-[820px] space-y-5" : "max-w-4xl space-y-2") : isDictationMode ? "max-w-2xl space-y-3" : "max-w-3xl space-y-4")}>
                                            {/* Source / Listening Area */}
                                            <div className={cn("text-center w-full", isRebuildMode ? "space-y-2" : isDictationMode ? "space-y-4" : "space-y-6")}>
                                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={cn("relative flex flex-col items-center w-full", isRebuildMode ? "gap-2" : isDictationMode ? "gap-4" : "gap-6")}>
                                                    {isAudioPracticeMode ? (
                                                        <div
                                                            className={cn("w-full flex flex-col items-center justify-center relative", isRebuildPassage && "hidden")}
                                                            aria-hidden={isRebuildPassage}
                                                        >
                                                            {/* Big Play Button */}
                                                            <button
                                                                onClick={() => { void playAudio(); }}
                                                                disabled={isPlaying || isAudioLoading || (bossState.active && bossState.type === 'echo' && hasPlayedEchoRef.current)}
                                                                className={cn(
                                                                    "group relative flex items-center justify-center transition-all duration-500",
                                                                    isRebuildMode ? "w-[4.5rem] h-[4.5rem] mb-2 mt-0" : isDictationMode ? "w-20 h-20 mb-4 mt-2" : "w-24 h-24 mb-8 mt-4",
                                                                    (bossState.active && bossState.type === 'echo' && hasPlayedEchoRef.current)
                                                                        ? "grayscale opacity-50 cursor-not-allowed scale-95"
                                                                        : "hover:scale-105 active:scale-95 disabled:opacity-80 disabled:scale-100"
                                                                )}
                                                            >
                                                                <div
                                                                    className={cn(
                                                                        "absolute inset-0 rounded-full bg-gradient-to-br blur-2xl transition-all duration-500",
                                                                        "from-theme-primary-bg/25 to-theme-primary-bg/10",
                                                                        isPlaying ? "scale-125 opacity-100" : "scale-100 opacity-0 group-hover:opacity-100"
                                                                    )}
                                                                />
                                                                <div className={cn(
                                                                    "absolute inset-0 rounded-full bg-white/60 dark:bg-white/10 backdrop-blur-2xl border border-white/50 dark:border-white/20 shadow-2xl transition-all duration-300 group-hover:bg-white/80 group-hover:border-white",
                                                                    "shadow-theme-primary-bg/15",
                                                                    isRebuildMode ? "border-[3px] border-theme-border/5" : ""
                                                                )} />
                                                                <div className={cn("relative z-10 drop-shadow-sm flex items-center justify-center text-theme-primary-bg")}>
                                                                    {(isPrefetching || isAudioLoading) ? (
                                                                        <div className={cn(
                                                                            "w-10 h-10 border-4 rounded-full animate-spin",
                                                                            "border-theme-primary-bg/20 border-t-theme-primary-bg"
                                                                        )} />
                                                                    ) : isPlaying ? (
                                                                        <PlaybackWaveBars
                                                                            audioElement={activePlaybackAudio}
                                                                            isDictationMode={isDictationMode}
                                                                            isPlaying={isPlaying}
                                                                        />
                                                                    ) : <Play className={cn("ml-1.5 fill-theme-primary-bg text-theme-primary-bg", isRebuildMode ? "w-8 h-8" : "w-10 h-10")} />}
                                                                </div>
                                                            </button>

                                                            {/* Minimal Controls */}
                                                            {/* Composite Control Bar */}
                                                            <div className={cn(
                                                                "flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150",
                                                                isRebuildMode ? "mb-10 mt-[-0.25rem]" : isDictationMode ? "mb-4" : "mb-8",
                                                            )}>
                                                                <div className="flex items-center bg-stone-200/50 backdrop-blur-md p-1.5 rounded-full shadow-inner border border-stone-100/20">
                                                                    {/* Blind Toggle */}
                                                                    {!isRebuildMode && (
                                                                        <>
                                                                            <button
                                                                                onClick={handleBlindVisibilityToggle}
                                                                                className={cn(
                                                                                    "px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2",
                                                                                    isBlindMode
                                                                                        ? "text-stone-500 hover:text-stone-700"
                                                                                        : isDictationMode
                                                                                            ? "bg-purple-50 text-purple-700 shadow-sm"
                                                                                            : "bg-white text-stone-800 shadow-sm"
                                                                                )}
                                                                                title={isListeningFamilyMode && isBlindMode && !blindVisibleUnlockConsumed ? "开启 VISIBLE 将消耗 1 个 Hint 道具" : undefined}
                                                                            >
                                                                                {isBlindMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                                                {isBlindMode ? "BLIND TEXT" : "VISIBLE"}
                                                                            </button>

                                                                            {!isDictationMode && (
                                                                                <>
                                                                                    <div className="w-px h-4 bg-stone-300 mx-2" />

                                                                                    <button
                                                                                        onClick={() => setShowChinese(!showChinese)}
                                                                                        className={cn("w-8 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center", showChinese ? "bg-white text-stone-800 shadow-sm" : "text-stone-400 hover:text-stone-600")}
                                                                                        title="Toggle Chinese Translation"
                                                                                    >
                                                                                        中
                                                                                    </button>

                                                                                    <div className="w-px h-4 bg-stone-300 mx-2" />
                                                                                </>
                                                                            )}
                                                                        </>
                                                                    )}

                                                                    {/* Speed Controls */}
                                                                    <div className="flex items-center gap-1">
                                                                        {[0.5, 0.75, 1.0, 1.25, 1.5].map((speed) => (
                                                                            <button
                                                                                key={speed}
                                                                                onClick={() => { setPlaybackSpeed(speed); if (audioRef.current) audioRef.current.playbackRate = speed; }}
                                                                                className={cn(
                                                                                    "text-[10px] px-3 py-1.5 rounded-full font-bold transition-all",
                                                                                    playbackSpeed === speed
                                                                                        ? isDictationMode
                                                                                            ? "bg-purple-50 text-purple-700 shadow-sm"
                                                                                            : "bg-white text-indigo-600 shadow-sm"
                                                                                        : "text-stone-500 hover:text-stone-700"
                                                                                )}
                                                                            >
                                                                                {speed}x
                                                                            </button>
                                                                        ))}
                                                                    </div>

                                                                    {isAudioPracticeMode && (
                                                                        <>
                                                                            <div className="w-px h-5 bg-stone-300 mx-2" />

                                                                            {/* Refresh Button */}
                                                                            <button
                                                                                onClick={handleRefreshDrill}
                                                                                disabled={isGeneratingDrill}
                                                                                className={cn(
                                                                                    "relative w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-50",
                                                                                    isDictationMode
                                                                                        ? "text-purple-500 hover:text-purple-700 hover:bg-purple-50"
                                                                                        : "text-cyan-500 hover:text-cyan-700 hover:bg-cyan-50"
                                                                                )}
                                                                                title="刷新当前题目 · 消耗 1 张刷新卡"
                                                                            >
                                                                                <RefreshCw className={cn("w-3.5 h-3.5", isGeneratingDrill && "animate-spin")} />
                                                                                <span className={cn(
                                                                                    "absolute -right-1 -bottom-1 min-w-[14px] h-[14px] rounded-full px-1 text-[9px] font-black leading-[14px] text-white",
                                                                                    isDictationMode
                                                                                        ? "bg-purple-500 shadow-[0_4px_10px_rgba(168,85,247,0.35)]"
                                                                                        : "bg-cyan-500 shadow-[0_4px_10px_rgba(6,182,212,0.35)]"
                                                                                )}>
                                                                                    {refreshTicketCount}
                                                                                </span>
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Reaper HP or Fuse Timer based on Boss Type */}
                                                            {(bossState.active || gambleState.active) && (
                                                                <div className="flex justify-center mb-0"> { /* Moved down for visibility */}
                                                                    {bossState.type === 'reaper' ? (
                                                                        <div className="flex gap-8 items-center animate-in fade-in slide-in-from-top-4">
                                                                            {/* PLAYER HP (Left) */}
                                                                            <div className="flex gap-2 items-center bg-stone-900/40 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                                                                                <span className="text-xs font-bold text-stone-400 mr-2">YOU</span>
                                                                                {[...Array(bossState.playerMaxHp || 3)].map((_, i) => (
                                                                                    <motion.div
                                                                                        key={`p-${i}`}
                                                                                        initial={{ scale: 0 }}
                                                                                        animate={{
                                                                                            scale: i < (bossState.playerHp || 0) ? 1 : 0.8,
                                                                                            opacity: i < (bossState.playerHp || 0) ? 1 : 0.2,
                                                                                            filter: i < (bossState.playerHp || 0) ? 'grayscale(0%)' : 'grayscale(100%)'
                                                                                        }}
                                                                                    >
                                                                                        <Heart className={cn(
                                                                                            "w-6 h-6",
                                                                                            i < (bossState.playerHp || 0) ? "fill-emerald-500 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "text-stone-700"
                                                                                        )} />
                                                                                    </motion.div>
                                                                                ))}
                                                                            </div>

                                                                            <div className="text-xl font-black text-white/20 italic">VS</div>

                                                                            {/* BOSS HP (Right) */}
                                                                            <div className="flex gap-2 items-center bg-black/60 px-4 py-2 rounded-full border border-red-900/60 backdrop-blur-md shadow-[0_0_30px_rgba(220,38,38,0.2)]">
                                                                                {[...Array(bossState.maxHp || 3)].map((_, i) => (
                                                                                    <motion.div
                                                                                        key={`b-${i}`}
                                                                                        initial={{ scale: 0 }}
                                                                                        animate={{
                                                                                            scale: i < (bossState.hp || 0) ? 1 : 0.8,
                                                                                            opacity: i < (bossState.hp || 0) ? 1 : 0.2,
                                                                                            filter: i < (bossState.hp || 0) ? 'grayscale(0%)' : 'grayscale(100%)'
                                                                                        }}
                                                                                    >
                                                                                        <Heart className={cn(
                                                                                            "w-6 h-6",
                                                                                            i < (bossState.hp || 0) ? "fill-red-600 text-red-500 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]" : "text-stone-800"
                                                                                        )} />
                                                                                    </motion.div>
                                                                                ))}
                                                                                <span className="text-xs font-bold text-red-500 ml-2">REAPER</span>
                                                                            </div>
                                                                        </div>
                                                                    ) : (bossState.type === 'lightning' || gambleState.active) ? (
                                                                        // Standard Fuse Timer (Lightning ONLY / Gamble)
                                                                        <div className="flex items-center gap-3 bg-stone-900/80 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                                                                            <div className={cn("text-xs font-bold uppercase tracking-widest",
                                                                                theme === 'boss' ? "text-amber-400" : "text-red-400"
                                                                            )}>
                                                                                {theme === 'boss' ? "BOSS FUSE" : "DEATH FUSE"}
                                                                            </div>
                                                                            <div className="w-32 h-2 bg-stone-800 rounded-full overflow-hidden">
                                                                                <div
                                                                                    className={cn("h-full transition-all duration-100 ease-linear",
                                                                                        theme === 'boss' ? "bg-amber-500" : "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]"
                                                                                    )}
                                                                                    style={{ width: `${Math.min(100, fuseTime)}%` }}
                                                                                />
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                                </div>
                                                            )}


                                                            {/* Sleek Slider */}


                                                            {/* Text Reveal / Hint Area - Check Manual Toggle OR Boss Force */}
                                                            {(isRebuildMode || !((bossState.active && bossState.type === 'blind') || isBlindMode)) ? (
                                                                <div className={cn(
                                                                    "relative w-full max-w-4xl mx-auto px-4 animate-in fade-in zoom-in-95 duration-500",
                                                                    isRebuildMode ? "pt-2 pb-2" : isDictationMode ? "pt-6 pb-4" : "pt-12 pb-8",
                                                                )}>
                                                                    <div className="text-center font-newsreader italic text-2xl md:text-3xl leading-relaxed text-stone-800 tracking-wide selection:bg-indigo-100">
                                                                        {((gambleState.active && gambleState.wager !== 'safe')) && !isSubmittingDrill ? (
                                                                            <div className={cn(
                                                                                "flex flex-col items-center gap-4 py-8 animate-pulse",
                                                                                theme === 'boss' ? "text-amber-500/50" : "text-red-500/50"
                                                                            )}>
                                                                                {theme === 'boss' ? <Headphones className="w-8 h-8 opacity-50" /> : <Dices className="w-8 h-8 opacity-50" />}
                                                                                <span className="text-sm font-mono tracking-[0.2em] uppercase">
                                                                                    {theme === 'boss' ? "Audio Stream Encryption Active" : "HIGH STAKES // BLIND BET"}
                                                                                </span>
                                                                                <div className="flex gap-1 mt-2">
                                                                                    {[...Array(3)].map((_, i) => (
                                                                                        <div key={i} className={cn("w-2 h-2 rounded-full animate-bounce", theme === 'boss' ? "bg-amber-500/30" : "bg-red-500/30")} style={{ animationDelay: `${i * 0.1}s` }} />
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ) : isRebuildMode ? (
                                                                            <div className="h-1" />
                                                                        ) : renderInteractiveText(drillData.reference_english)}
                                                                    </div>
                                                                    {showChinese && !isRebuildMode && <p className="mt-4 text-stone-500 text-lg text-center font-medium animate-in fade-in slide-in-from-top-2">{drillData.chinese}</p>}
                                                                </div>
                                                            ) : (
                                                                <div className="relative w-full max-w-2xl mx-auto px-4 py-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                                                    {showChinese && (
                                                                        <div className="flex flex-col items-center gap-3 bg-amber-50/50 border border-amber-100/50 rounded-2xl p-6 backdrop-blur-sm animate-in fade-in zoom-in-95">
                                                                            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest"><Sparkles className="w-3 h-3" /> Hint / Translation</div>
                                                                            <p className="text-stone-600 text-lg font-medium text-center leading-relaxed opacity-80">{drillData.chinese}</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="w-full py-5 md:py-6 flex flex-col items-center justify-center gap-4 md:gap-5">
                                                            <h3 className="max-w-4xl text-center font-newsreader text-2xl font-medium leading-[1.35] text-stone-900 md:text-[3rem]">
                                                                {drillData.chinese}
                                                            </h3>

                                                            <div className="relative w-full max-w-3xl px-4">
                                                                <div className={cn(
                                                                    "flex flex-wrap items-center justify-center gap-2 rounded-full border px-2.5 py-2 backdrop-blur-xl",
                                                                    activeCosmeticUi.toolbarClass
                                                                )}>
                                                                    <button
                                                                        onClick={handleTranslationReferencePlayback}
                                                                        disabled={isAudioLoading}
                                                                        className={cn(
                                                                            "flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:cursor-wait disabled:opacity-70",
                                                                            isTranslationAudioUnlocked
                                                                                ? activeCosmeticUi.audioUnlockedClass
                                                                                : activeCosmeticUi.audioLockedClass
                                                                        )}
                                                                        title={isTranslationAudioUnlocked ? "重播参考句" : "解锁本题参考句播放"}
                                                                    >
                                                                        {isAudioLoading ? (
                                                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                                                        ) : isTranslationAudioUnlocked ? (
                                                                            <Volume2 className="h-4 w-4" />
                                                                        ) : (
                                                                            <Lock className="h-4 w-4" />
                                                                        )}
                                                                        <span>
                                                                            {isAudioLoading
                                                                                ? "正在生成音频..."
                                                                                : isTranslationAudioUnlocked
                                                                                    ? (isPlaying ? "播放中..." : "重播参考句")
                                                                                    : "播放参考句 · 1 朗读券"}
                                                                        </span>
                                                                    </button>

                                                                    <div className={cn("flex items-center gap-1 rounded-full border p-1", activeCosmeticUi.speedShellClass)}>
                                                                        {[1, 0.85, 0.7, 0.5].map((speed) => (
                                                                            <button
                                                                                key={`translation-speed-${speed}`}
                                                                                onClick={() => {
                                                                                    setPlaybackSpeed(speed);
                                                                                    if (audioRef.current) {
                                                                                        audioRef.current.playbackRate = speed;
                                                                                    }
                                                                                }}
                                                                                className={cn(
                                                                                    "min-h-8 min-w-[52px] rounded-full px-3 text-[11px] font-bold transition-all duration-200",
                                                                                    playbackSpeed === speed
                                                                                        ? activeCosmeticUi.speedActiveClass
                                                                                        : activeCosmeticUi.speedIdleClass
                                                                                )}
                                                                                aria-label={`设置播放速度 ${speed}x`}
                                                                            >
                                                                                {speed}x
                                                                            </button>
                                                                        ))}
                                                                    </div>

                                                                    {(() => {
                                                                        if (!hasTranslationKeywords || isVocabHintRevealed) return null;

                                                                        return (
                                                                            <button
                                                                                onClick={handleRevealVocabHint}
                                                                                className={cn(
                                                                                    "flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-all hover:-translate-y-0.5",
                                                                                    activeCosmeticUi.vocabButtonClass,
                                                                                    isHintShake && "animate-shake"
                                                                                )}
                                                                            >
                                                                                <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-black text-emerald-600">
                                                                                    {translationKeywords.length}
                                                                                </span>
                                                                                <span>显示关键词</span>
                                                                                <span className="text-emerald-500">1 🧩</span>
                                                                            </button>
                                                                        );
                                                                    })()}

                                                                    <button
                                                                        onClick={handleRefreshDrill}
                                                                        disabled={isGeneratingDrill}
                                                                        className={cn(
                                                                            "relative flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60",
                                                                            activeCosmeticUi.iconButtonClass
                                                                        )}
                                                                        title="刷新当前题目 · 消耗 1 张刷新卡"
                                                                        aria-label="刷新当前题目"
                                                                    >
                                                                        <RefreshCw className={cn("h-4 w-4", isGeneratingDrill && "animate-spin")} />
                                                                        <span className={cn(
                                                                            "absolute -right-1 -bottom-1 min-w-[15px] h-[15px] rounded-full px-1 text-[9px] font-black leading-[15px] shadow-sm",
                                                                            activeCosmeticUi.wordBadgeActiveClass
                                                                        )}>
                                                                            {refreshTicketCount}
                                                                        </span>
                                                                    </button>
                                                                </div>
                                                                {hasTranslationKeywords && (
                                                                    <div className="pointer-events-none absolute inset-x-4 top-full z-10 mt-4 flex justify-center">
                                                                        <AnimatePresence initial={false}>
                                                                            {isVocabHintRevealed && (
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, y: -10, scale: 0.985 }}
                                                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                                    exit={{ opacity: 0, y: -8, scale: 0.985 }}
                                                                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                                                                    className="pointer-events-auto flex max-w-3xl flex-wrap justify-center gap-3"
                                                                                >
                                                                                    {translationKeywords.map((vocab, i) => (
                                                                                        <span key={`${vocab}-${i}`} onClick={(e) => handleWordClick(e, vocab)} className={cn("px-5 py-2 rounded-full border font-newsreader italic text-lg cursor-pointer transition-all", activeCosmeticUi.keywordChipClass)}>{vocab}</span>
                                                                                    ))}
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Action Button - Only show if not waiting for user */}
                                                    <div className="flex justify-center mt-4 opacity-0 pointer-events-none h-0 overflow-hidden">
                                                        <button onClick={handleRefreshDrill} disabled={isGeneratingDrill} className="flex items-center gap-2 px-4 py-2 text-sm text-cyan-500 hover:text-cyan-700 hover:bg-cyan-50 rounded-full transition-all disabled:opacity-50">
                                                            <RefreshCw className={cn("w-4 h-4", isGeneratingDrill && "animate-spin")} /> 换一题
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            </div>

                                            {!isRebuildMode && (
                                                <div className="my-3 h-px w-full max-w-xs mx-auto bg-gradient-to-r from-transparent via-stone-200 to-transparent md:my-4" />
                                            )}

                                            {/* Teaching Card removed - now in floating panel */}

                                            {/* Interactive Area */}

                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: 0.1 }}
                                                className={cn("w-full", isRebuildMode ? "space-y-0" : "space-y-4")}
                                            >
                                                <div className="relative group">
                                                    {isRebuildMode ? (
                                                        renderRebuildQuestion()
                                                    ) : isShadowingMode ? (
                                                        <div className="flex flex-col items-center justify-center gap-4 py-2">
                                                            {whisperProcessing ? (
                                                                <div className="flex items-center gap-3 px-6 py-3 bg-indigo-50 rounded-full">
                                                                    <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
                                                                    <span className="text-indigo-600 font-bold text-sm">Processing...</span>
                                                                </div>
                                                            ) : whisperRecording ? (
                                                                /* Recording State - Compact horizontal layout */
                                                                <div className="flex items-center gap-4 px-6 py-3 bg-white/80 backdrop-blur-sm border border-stone-200 rounded-2xl shadow-sm">
                                                                    {/* Mini Waveform */}
                                                                    <div className="flex items-center gap-0.5 h-6">
                                                                        {[...Array(8)].map((_, i) => (
                                                                            <div
                                                                                key={i}
                                                                                className="w-1 rounded-full bg-rose-500"
                                                                                style={{
                                                                                    height: `${Math.max(8, 8 + speechInputLevel * 20 + ((i % 3) * 4))}px`,
                                                                                    opacity: 0.45 + speechInputLevel * 0.55,
                                                                                }}
                                                                            />
                                                                        ))}
                                                                    </div>

                                                                    <div className="min-w-[180px] max-w-[340px]">
                                                                        <p className="text-base font-newsreader text-stone-700 truncate">
                                                                            <span className="text-stone-400 italic">Recording...</span>
                                                                        </p>
                                                                        <p className="mt-1 text-[11px] text-stone-400">
                                                                            停止后将直接按发音评分，不做语音转写。
                                                                        </p>
                                                                    </div>

                                                                    {/* Stop Button */}
                                                                    <button
                                                                        onClick={stopRecognition}
                                                                        className="w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center shadow-md transition-all hover:scale-105 active:scale-95 shrink-0"
                                                                    >
                                                                        <div className="w-4 h-4 bg-white rounded-sm" />
                                                                    </button>
                                                                </div>
                                                            ) : wavBlob ? (
                                                                /* Has Result - Compact confirm/retry */
                                                                <div className="flex items-center gap-3 px-4 py-3 bg-white/80 backdrop-blur-sm border border-stone-200 rounded-2xl shadow-sm">
                                                                    {/* Result text */}
                                                                    <div className="max-w-[280px]">
                                                                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">录音已保存</p>
                                                                        <p className="mt-1 text-base font-newsreader text-stone-800">
                                                                            将只按发音质量评分，不再做语音转写。
                                                                        </p>
                                                                    </div>

                                                                    {/* Action Buttons */}
                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                        <button
                                                                            onClick={() => void startRecognition()}
                                                                            className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-all"
                                                                            title="Re-record"
                                                                        >
                                                                            <RefreshCw className="w-4 h-4 text-stone-600" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                handleSubmitDrill();
                                                                            }}
                                                                            disabled={isSubmittingDrill}
                                                                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold text-sm shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                                                        >
                                                                            {isSubmittingDrill ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                                                            {isSubmittingDrill ? "..." : "Submit"}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                /* Idle State - Smaller mic button */
                                                                <motion.button
                                                                    onClick={() => void startRecognition()}
                                                                    disabled={!speechInputAvailable || !speechInputReady}
                                                                    whileHover={{ scale: 1.08 }}
                                                                    whileTap={{ scale: 0.95 }}
                                                                    className="relative flex items-center gap-3 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full shadow-lg shadow-indigo-500/25 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                                                                >
                                                                    {/* Pulse ring */}
                                                                    <motion.div
                                                                        className="absolute inset-0 rounded-full bg-indigo-500/20"
                                                                        animate={{ scale: [1, 1.15], opacity: [0.4, 0] }}
                                                                        transition={{ duration: 1.5, repeat: Infinity }}
                                                                    />
                                                                    <Mic className="w-5 h-5 text-white relative z-10" />
                                                                    <span className="text-white font-bold text-sm relative z-10">
                                                                        {speechInputAvailable ? "Tap to Record" : "桌面端可用"}
                                                                    </span>
                                                                </motion.button>
                                                            )}
                                                            {speechInputError ? (
                                                                <p className="text-sm text-rose-500">{speechInputError}</p>
                                                            ) : null}
                                                        </div>
                                                    ) : isDictationMode ? (
                                                        <div className="w-full max-w-2xl">
                                                            <div className="rounded-[1.2rem] border border-purple-200/80 bg-[linear-gradient(180deg,rgba(250,245,255,0.94),rgba(255,255,255,0.95))] p-3 shadow-[0_10px_24px_rgba(88,28,135,0.09)]">
                                                                <div className="mb-2.5 text-left">
                                                                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-purple-700">Dictation</p>
                                                                    <p className="mt-1 text-[13px] leading-5 text-purple-900/80">听音频后直接写中文，按语义准确度评分。</p>
                                                                </div>
                                                                <PretextTextarea
                                                                    value={userTranslation}
                                                                    onChange={(event) => setUserTranslation(event.target.value)}
                                                                    placeholder="听完后写中文（可意译，但要保留核心信息）..."
                                                                    disabled={isSubmittingDrill}
                                                                    minRows={3}
                                                                    maxRows={12}
                                                                    className="min-h-[88px] w-full resize-none rounded-xl border border-purple-100/80 bg-white px-3 py-2.5 text-[14px] leading-6 text-stone-800 outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-200/60 disabled:cursor-not-allowed disabled:opacity-70"
                                                                />
                                                                <div className="mt-2 flex items-center justify-between">
                                                                    <span className="text-xs text-stone-400">字数：{userTranslation.trim().length}</span>
                                                                    <button
                                                                        onClick={() => { void handleSubmitDrill(); }}
                                                                        disabled={!userTranslation.trim() || isSubmittingDrill}
                                                                        className={cn(
                                                                            "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-all",
                                                                            (!userTranslation.trim() || isSubmittingDrill)
                                                                                ? "cursor-not-allowed border border-stone-300/70 bg-white/70 text-stone-400"
                                                                                : "border border-purple-500/80 bg-purple-500 text-white shadow-[0_10px_24px_rgba(168,85,247,0.28)] hover:-translate-y-0.5 hover:bg-purple-600"
                                                                        )}
                                                                    >
                                                                        {isSubmittingDrill ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                                                        {isSubmittingDrill ? "评分中..." : "提交听写"}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {learningSessionActive && !isGuidedOverlayOpen && (
                                                                <div className="mb-4 rounded-[1.35rem] border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-left">
                                                                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600">Learning Session</p>
                                                                    <p className="mt-2 text-sm leading-6 text-stone-600">
                                                                        这题已经进入学习态，不再参与 Elo、连胜、金币或道具结算。你现在看到的是刚才学完后的参考句界面。
                                                                    </p>
                                                                </div>
                                                            )}
                                                            <div className={cn(
                                                                "relative group overflow-hidden rounded-[2rem] border backdrop-blur-2xl transition-all duration-300",
                                                                activeCosmeticUi.inputShellClass
                                                            )}>
                                                                <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/60 to-transparent" />
                                                                <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E')] pointer-events-none mix-blend-overlay" />
                                                                <GhostTextarea
                                                                    key={drillData?.reference_english || drillData?.chinese || "drill-input"}
                                                                    value={userTranslation}
                                                                    onChange={setUserTranslation}
                                                                    placeholder="Type your English translation here..."
                                                                    predictionWordCount={3}
                                                                    sourceText={drillData?.chinese}
                                                                    referenceAnswer={drillData?.reference_english}
                                                                    onPredictionRequest={handlePredictionRequest}
                                                                    onPredictionShown={handlePredictionShown}
                                                                    predictionCostText="消耗 1 胶囊获取提示"
                                                                    fullReferenceGhostText={fullReferenceHint.text}
                                                                    fullReferenceGhostVersion={fullReferenceHint.version}
                                                                    disabled={isSubmittingDrill || learningSessionActive}
                                                                    className={cn("font-work-sans min-h-[128px] px-5 pb-16 pt-5 text-[1.06rem] font-medium leading-[1.9] tracking-[0.005em] placeholder:font-normal placeholder:italic md:min-h-[144px] md:px-6 md:pb-16 md:pt-6 md:text-[1.12rem] bg-transparent", activeCosmeticUi.textareaClass)}
                                                                />

                                                                {/* Bottom toolbar */}
                                                                <div className="relative z-10 flex items-center justify-between border-t border-black/[0.03] bg-white/20 px-3 pb-4 pt-3 backdrop-blur-md md:px-6 md:pb-5">
                                                                    {/* Word count badge */}
                                                                    <div className={cn(
                                                                        "flex items-center gap-1 rounded-full px-2 py-1.5 text-[9px] font-bold font-sans tracking-[0.14em] transition-all duration-300 md:gap-1.5 md:px-3 md:text-[11px] md:tracking-[0.18em]",
                                                                        userTranslation.trim()
                                                                            ? activeCosmeticUi.wordBadgeActiveClass
                                                                            : activeCosmeticUi.wordBadgeIdleClass
                                                                    )}>
                                                                        <span className="tabular-nums">{userTranslation.trim() ? userTranslation.trim().split(/\s+/).length : 0}</span>
                                                                        <span>WORDS</span>
                                                                    </div>

                                                                    {/* Action buttons */}
                                                                    <div className="flex items-center gap-1 md:gap-2">
                                                                        <button
                                                                            onClick={handleMagicHint}
                                                                            disabled={isHintLoading || learningSessionActive}
                                                                            className={cn(
                                                                                "flex h-10 items-center justify-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition-all hover:-translate-y-0.5 active:scale-95 md:px-4 md:text-xs min-w-[80px]",
                                                                                isHintLoading
                                                                                    ? "border-stone-200/80 bg-stone-100/50 text-stone-400 cursor-wait pointer-events-none"
                                                                                    : activeCosmeticUi.hintButtonClass
                                                                            )}
                                                                            title="Auto-Complete Hint"
                                                                        >
                                                                            <Wand2 className={cn("w-4 h-4 shrink-0", isHintLoading && "animate-spin")} />
                                                                            <span>{isHintLoading ? "Hint..." : "Hint"}</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                if (learningSessionActive) return;
                                                                                openTutorModal();
                                                                            }}
                                                                            className={cn(
                                                                                "flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:-translate-y-0.5 active:scale-95",
                                                                                activeCosmeticUi.iconButtonClass
                                                                            )}
                                                                            title="Ask AI Teacher"
                                                                        >
                                                                            <HelpCircle className="w-4 h-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { void handleReportTooHardAndAdvance(); }}
                                                                            disabled={isSubmittingDrill || isGeneratingDrill || isReportingTooHard || learningSessionActive}
                                                                            className={cn(
                                                                                "flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[11px] font-bold transition-all md:px-5 md:text-sm",
                                                                                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
                                                                                (isSubmittingDrill || isGeneratingDrill || isReportingTooHard || learningSessionActive)
                                                                                    ? "border border-stone-300/60 bg-white/50 text-stone-400 shadow-sm"
                                                                                    : "border border-rose-300/80 bg-rose-50/80 text-rose-700 hover:-translate-y-0.5 hover:bg-rose-100"
                                                                            )}
                                                                            title="跳过本题并扣 25 Elo，下一题会更容易"
                                                                        >
                                                                            {isReportingTooHard ? <RefreshCw className="w-4 h-4 animate-spin" /> : <SkipForward className="w-4 h-4" />}
                                                                            {isReportingTooHard ? "切题中..." : "太难了（-25）"}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                void handleSubmitDrill();
                                                                            }}
                                                                            disabled={!userTranslation.trim() || isSubmittingDrill || learningSessionActive}
                                                                            className={cn(
                                                                                "flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[11px] font-bold transition-all md:px-5 md:text-sm",
                                                                                "disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100",
                                                                                (!userTranslation.trim() || isSubmittingDrill || learningSessionActive)
                                                                                    ? "border border-stone-300/60 bg-white/50 text-stone-400 shadow-sm"
                                                                                    : [
                                                                                        "border text-white hover:-translate-y-0.5 active:scale-95 cursor-pointer",
                                                                                        activeCosmeticUi.checkButtonClass
                                                                                    ]
                                                                            )}
                                                                        >
                                                                            {isSubmittingDrill ? <Sparkles className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                                            {learningSessionActive ? "学习态" : isSubmittingDrill ? "..." : "Check"}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </motion.div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <AnimatePresence mode="wait">
                                        {drillFeedback && (bossState.active || (gambleState.active && gambleState.introAck)) ? (
                                            <BossScoreReveal
                                                key="boss-feedback"
                                                score={drillFeedback.score}
                                                drift={0}
                                                type={gambleState.active ? 'gamble' : bossState.type as any}
                                                onNext={() => {
                                                    // Reset Gamble State if finished (Loss or Max Win)
                                                    if (gambleState.active && (drillFeedback.score < 9.0 || gambleState.doubleDownCount >= 2)) {
                                                        setGambleState({ active: false, introAck: false, wager: null, doubleDownCount: 0 });
                                                        setTheme('default');
                                                    }
                                                    handleGenerateDrill();
                                                }}
                                                onRetry={gambleState.active ? undefined : () => {
                                                    setDrillFeedback(null);
                                                    setUserTranslation("");
                                                    setTutorQuery("");
                                                    setTutorAnswer(null);
                                                    setTutorThread([]);
                                                    setTutorResponse(null);
                                                    setTutorPendingQuestion(null);
                                                    setIsTutorOpen(false);
                                                    setRebuildTutorSession(null);
                                                    setIsSubmittingDrill(false);
                                                    setWordPopup(null);
                                                    setAnalysisRequested(false);
                                                    setIsGeneratingAnalysis(false);
                                                    setAnalysisError(null);
                                                    setAnalysisDetailsOpen(false);
                                                    setFullAnalysisRequested(false);
                                                    setIsGeneratingFullAnalysis(false);
                                                    setFullAnalysisError(null);
                                                    setFullAnalysisOpen(false);
                                                    setFullAnalysisData(null);
                                                    setIsGeneratingGrammar(false);
                                                    setGrammarError(null);
                                                    setReferenceGrammarAnalysis(null);
                                                    setReferenceGrammarDisplayMode("core");
                                                }}
                                            />
                                        ) : (
                                            <motion.div key="feedback" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-48">
                                                {drillFeedback ? (
                                                    (() => {
                                                        const currentDrillFeedback = drillFeedback;
                                                        return (
                                                            <>
                                                {/* Error State: Show retry when API fails */}
                                                {currentDrillFeedback._error ? (
                                                    <div className="flex flex-col items-center justify-center gap-4 py-16">
                                                        <div className="text-4xl">⚠️</div>
                                                        <p className="text-stone-600 font-medium text-center">评分服务暂时不可用</p>
                                                        <p className="text-stone-400 text-sm text-center">
                                                            {typeof currentDrillFeedback.judge_reasoning === "string" && currentDrillFeedback.judge_reasoning.trim().length > 0
                                                                ? currentDrillFeedback.judge_reasoning
                                                                : "请重试。"}
                                                        </p>
                                                        <button
                                                            onClick={() => {
                                                                setDrillFeedback(null);
                                                                setIsSubmittingDrill(false);
                                                                setAnalysisRequested(false);
                                                                setIsGeneratingAnalysis(false);
                                                                setAnalysisError(null);
                                                                setAnalysisDetailsOpen(false);
                                                                setFullAnalysisRequested(false);
                                                                setIsGeneratingFullAnalysis(false);
                                                                setFullAnalysisError(null);
                                                                setFullAnalysisOpen(false);
                                                                setFullAnalysisData(null);
                                                                setIsGeneratingGrammar(false);
                                                                setGrammarError(null);
                                                                setReferenceGrammarAnalysis(null);
                                                                setReferenceGrammarDisplayMode("core");
                                                                handleSubmitDrill();
                                                            }}
                                                            className="mt-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-lg transition-all"
                                                        >
                                                            重新评分
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className={cn("max-w-4xl mx-auto w-full space-y-4 transition-transform duration-100", currentDrillFeedback.score <= 4 && "animate-[shake_0.5s_ease-in-out]")}>
                                                        <div className="flex flex-col items-center gap-1">
                                                            {(() => {
                                                                const isScorePositive = currentDrillFeedback.score >= 8;
                                                                return (
                                                                    <motion.div
                                                                        initial={prefersReducedMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
                                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                        transition={{ duration: prefersReducedMotion ? 0.18 : 0.32, ease: "easeOut" }}
                                                                        className="relative flex flex-col items-center px-8 py-6"
                                                                    >
                                                                        <div
                                                                            className={cn("relative text-5xl font-bold font-newsreader transition-all duration-500", isScorePositive ? "text-emerald-600" : currentDrillFeedback.score >= 6 ? "text-amber-500" : "text-rose-500")}
                                                                            style={streakTier > 0 && isScorePositive ? { textShadow: streakVisual.scoreGlow } : undefined}
                                                                        >
                                                                            {currentDrillFeedback.score}<span className="text-xl text-stone-300 font-normal">/10</span>
                                                                        </div>
                                                                        <p className="mt-1 text-stone-500 font-medium text-xs uppercase tracking-wider">{mode === "listening" ? "Listening Score" : "Accuracy Score"}</p>
                                                                    </motion.div>
                                                                );
                                                            })()}
                                                            {eloChange !== null && eloChange !== 0 ? (
                                                                <div className="flex flex-col items-center animate-in slide-in-from-bottom-2 fade-in duration-500 delay-150 mt-4 w-full max-w-sm">
                                                                    {/* Rank Progress Bar */}
                                                                    {(() => {
                                                                        const rank = getRank(currentElo || DEFAULT_BASE_ELO);
                                                                        return (
                                                                            <div className="w-full mb-4">
                                                                                <div className="flex justify-between text-xs font-bold text-stone-400 mb-1.5 uppercase tracking-wider">
                                                                                    <span className={rank.color.replace('bg-', 'text-')}>{rank.title}</span>
                                                                                    <span>{rank.nextRank?.title || "Max"}</span>
                                                                                </div>
                                                                                <div
                                                                                    className="h-2 w-full rounded-full overflow-hidden shadow-inner bg-stone-100"
                                                                                    style={{
                                                                                        backgroundColor: streakTier > 0 ? 'rgba(255,247,237,0.85)' : undefined,
                                                                                        boxShadow: streakTier > 0 ? `inset 0 1px 2px rgba(255,255,255,0.72), 0 0 0 1px ${streakVisual.badgeBorder}` : undefined,
                                                                                    }}
                                                                                >
                                                                                    <div
                                                                                        className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
                                                                                        style={{
                                                                                            width: `${Math.max(5, rank.progress)}%`,
                                                                                            backgroundImage: streakTier > 0 ? streakVisual.progressGradient : 'linear-gradient(90deg, #78716c 0%, #a8a29e 100%)',
                                                                                            boxShadow: streakTier > 0 ? `0 0 18px ${streakVisual.badgeGlow}` : undefined,
                                                                                        }}
                                                                                    >
                                                                                        <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
                                                                                    </div>
                                                                                </div>
                                                                                <div className="text-[10px] text-right text-stone-300 mt-1 font-mono">{Math.round(rank.progress)}% to promote</div>
                                                                            </div>
                                                                        );
                                                                    })()}

                                                                    {/* Elo Change Badge & Breakdown */}
                                                                    <div className="relative group/breakdown cursor-help">
                                                                        <motion.div
                                                                            initial={{ scale: 0.8, opacity: 0 }}
                                                                            animate={{ scale: 1, opacity: 1 }}
                                                                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                                                            className={cn(
                                                                                "px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 shadow-md border transition-all hover:scale-105",
                                                                                (eloBreakdown?.streakBonus || (eloChange > 0 && streakTier > 0))
                                                                                    ? "text-white shadow-lg"
                                                                                    : eloChange > 0
                                                                                        ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                                                                        : "bg-rose-50 text-rose-600 border-rose-100"
                                                                            )}
                                                                            style={(eloBreakdown?.streakBonus || (eloChange > 0 && streakTier > 0))
                                                                                ? {
                                                                                    backgroundImage: streakVisual.eloGradient,
                                                                                    borderColor: streakVisual.eloBorder,
                                                                                    boxShadow: streakVisual.eloShadow,
                                                                                }
                                                                                : undefined}
                                                                        >
                                                                            <TrendingUp className={cn("w-4 h-4", eloChange < 0 && "rotate-180")} />
                                                                            <span>{eloChange > 0 ? "+" : ""}{eloChange} Elo</span>

                                                                            {/* Streak Bonus Fire Effect */}
                                                                            {eloBreakdown?.streakBonus && (
                                                                                <motion.div
                                                                                    className="flex items-center gap-1 ml-1 pl-2 border-l border-white/30"
                                                                                    animate={{ scale: [1, 1.1, 1] }}
                                                                                    transition={{ repeat: Infinity, duration: 0.8 }}
                                                                                >
                                                                                    <Flame className="w-4 h-4 fill-yellow-300 text-yellow-200" />
                                                                                    <span className="text-yellow-100 font-black">+{eloBreakdown.bonusChange}</span>
                                                                                </motion.div>
                                                                            )}
                                                                        </motion.div>

                                                                        {/* Streak Glow Effect */}
                                                                        {eloBreakdown?.streakBonus && (
                                                                            <motion.div
                                                                                className="absolute inset-0 rounded-full blur-xl -z-10"
                                                                                style={{ backgroundImage: streakVisual.eloGradient }}
                                                                                animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.1, 1] }}
                                                                                transition={{ repeat: Infinity, duration: 1.5 }}
                                                                            />
                                                                        )}

                                                                        {/* Hover Breakdown */}
                                                                        {eloBreakdown && (
                                                                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 bg-white rounded-xl shadow-xl border border-stone-100 p-3 opacity-0 group-hover/breakdown:opacity-100 transition-opacity pointer-events-none z-50 text-xs">
                                                                                <div className="space-y-1.5 ">
                                                                                    <div className="flex justify-between text-stone-500">
                                                                                        <span>Base Performance</span>
                                                                                        <span className="font-mono font-bold">{eloBreakdown.baseChange > 0 ? "+" : ""}{eloBreakdown.baseChange}</span>
                                                                                    </div>
                                                                                    {eloBreakdown.streakBonus && (
                                                                                        <div className="flex justify-between text-orange-500 font-bold bg-orange-50 px-2 py-1 rounded-lg -mx-1">
                                                                                            <span className="flex items-center gap-1"><Flame className="w-3 h-3 fill-orange-400" /> 连胜加成</span>
                                                                                            <span className="font-mono">+{eloBreakdown.bonusChange}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="w-full h-px bg-stone-100 my-1" />
                                                                                    <div className="flex justify-between text-stone-400 text-[10px] uppercase tracking-wider">
                                                                                        <span>Difficulty</span>
                                                                                        <span>{Math.round(eloBreakdown.difficultyElo)}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {mode !== "listening" && drillFeedback.judge_reasoning && (
                                                                        <p className="text-[10px] text-stone-400 mt-3 max-w-lg text-center leading-relaxed">
                                                                            <span className="font-bold text-stone-500 mr-1">AI Judge:</span>
                                                                            {drillFeedback.judge_reasoning}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            ) : null}
                                                        </div>

                                                        {renderFeedbackSentenceRecap()}

                                                        {analysisRequested ? (
                                                            <div className="bg-white/90 p-6 rounded-[2rem] shadow-xl shadow-stone-200/50 border border-stone-100 backdrop-blur-sm">
                                                                {isGeneratingAnalysis ? (
                                                                    <div className="py-10 flex flex-col items-center gap-3 text-center">
                                                                        <div className="w-10 h-10 rounded-full border-2 border-amber-200 border-t-amber-500 animate-spin" />
                                                                        <p className="text-sm font-semibold text-stone-700">正在生成解析</p>
                                                                        <p className="text-xs text-stone-400">按需生成，避免每题都额外消耗 token。</p>
                                                                    </div>
                                                                ) : analysisError ? (
                                                                    <div className="py-6 flex flex-col items-center gap-3 text-center">
                                                                        <p className="text-sm font-semibold text-rose-600">解析生成失败</p>
                                                                        <p className="text-xs text-stone-400">{analysisError}</p>
                                                                        <button
                                                                            onClick={handleGenerateAnalysis}
                                                                            className="px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
                                                                        >
                                                                            重新生成解析
                                                                        </button>
                                                                    </div>
                                                                ) : hasDetailedAnalysis ? (
                                                                    mode === "translation" ? (
                                                                        <TranslationAnalysisJourney
                                                                            analysisLead={analysisLead}
                                                                            analysisHighlights={analysisHighlights}
                                                                            userTranslation={userTranslation}
                                                                            correctionTargetText={drillFeedback.improved_version || drillData.reference_english}
                                                                            improvedVersionNode={drillFeedback.improved_version ? (
                                                                                <>{renderInteractiveCoachText(drillFeedback.improved_version)}</>
                                                                            ) : null}
                                                                            referenceSentenceNode={renderTranslationReferenceSentence()}
                                                                            isGeneratingGrammar={isGeneratingGrammar}
                                                                            grammarError={grammarError}
                                                                            grammarButtonLabel={referenceGrammarAnalysis ? "重新生成语法分析" : "生成语法分析"}
                                                                            hasGrammarAnalysis={Boolean(referenceGrammarAnalysis)}
                                                                            grammarDisplayMode={referenceGrammarDisplayMode}
                                                                            onGenerateGrammar={handleGenerateReferenceGrammar}
                                                                            onGrammarDisplayModeChange={setReferenceGrammarDisplayMode}
                                                                            onPlayReferenceAudio={playAudio}
                                                                            hasFullAnalysis={fullAnalysisRequested && Boolean(fullAnalysisData)}
                                                                            isGeneratingFullAnalysis={isGeneratingFullAnalysis}
                                                                            fullAnalysisError={fullAnalysisError}
                                                                            fullAnalysisOpen={fullAnalysisOpen}
                                                                            onGenerateFullAnalysis={handleGenerateFullAnalysis}
                                                                            onToggleFullAnalysis={() => setFullAnalysisOpen(prev => !prev)}
                                                                            fullAnalysisContent={renderTranslationAnalysisDetails()}
                                                                        />
                                                                    ) : mode === "listening" ? (
                                                                        <div className="space-y-4">
                                                                            {renderListeningReplayPanel()}
                                                                            {renderDiff()}
                                                                            {renderListeningMetricCards()}
                                                                        </div>
                                                                    ) : (
                                                                    <div className="space-y-4">
                                                                        <div className="overflow-hidden rounded-[2rem] border border-stone-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(251,250,248,0.94))] shadow-[0_18px_40px_rgba(28,25,23,0.06)]">
                                                                            <div className="p-6 md:p-7">
                                                                                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                                                                                    <div className="max-w-2xl">
                                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                                            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                                                                                                <Sparkles className="w-3.5 h-3.5" />
                                                                                                本题解析
                                                                                            </span>
                                                                                            <span className="inline-flex items-center rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                                                                                {analysisHighlights.length} Fix{analysisHighlights.length === 1 ? "" : "es"}
                                                                                            </span>
                                                                                        </div>
                                                                                        <p className="mt-4 text-[1.8rem] leading-tight text-stone-900 font-newsreader">
                                                                                            {analysisLead}
                                                                                        </p>
                                                                                        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
                                                                                            你的答案：<span className="font-newsreader italic text-stone-700">&ldquo;{userTranslation.length > 140 ? userTranslation.slice(0, 140) + "..." : userTranslation}&rdquo;</span>
                                                                                        </p>
                                                                                    </div>

                                                                                    <div className="flex gap-2">
                                                                                        {isShadowingMode && (
                                                                                            <button onClick={playRecording} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition-all hover:-translate-y-0.5 hover:bg-rose-100" title="Play My Recording"><Mic className="w-3.5 h-3.5" /> Play Mine</button>
                                                                                        )}
                                                                                        <button onClick={() => { void playAudio(); }} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-indigo-200/80 bg-indigo-50 text-indigo-600 transition-all hover:-translate-y-0.5 hover:bg-indigo-100" title="Listen to Correct Version"><Volume2 className="w-4 h-4" /></button>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="mt-6 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                                                                                    <div className="rounded-[1.5rem] border border-stone-200/80 bg-white/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                                                                                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">
                                                                                            <BookOpen className="w-3.5 h-3.5 text-stone-400" />
                                                                                            {isShadowingMode ? "词级评分" : "关键改错"}
                                                                                        </div>
                                                                                        <div className="mt-4 space-y-3">
                                                                                            {analysisHighlights.length > 0 ? analysisHighlights.map((item, index) => (
                                                                                                <div key={`${item.kind}-${index}`} className="rounded-2xl border border-stone-100 bg-stone-50/70 px-4 py-3">
                                                                                                    <div className="flex items-center justify-between gap-3">
                                                                                                        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-500">{item.kind}</span>
                                                                                                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-300">#{index + 1}</span>
                                                                                                    </div>
                                                                                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                                                                                        <span className="rounded-full bg-rose-50 px-2.5 py-1 font-newsreader italic text-rose-600">{item.before}</span>
                                                                                                        <ArrowRight className="w-3.5 h-3.5 text-stone-300" />
                                                                                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-newsreader italic text-emerald-700">{item.after}</span>
                                                                                                    </div>
                                                                                                    <p className="mt-2 text-sm leading-6 text-stone-500">{item.note}</p>
                                                                                                </div>
                                                                                            )) : (
                                                                                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4 text-sm leading-6 text-emerald-800">
                                                                                                    {isShadowingMode ? "当前没有明显低分词，词级评分整体稳定。" : "这题没有明显结构性错误，主要是细节润色。"}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>

                                                                                    <div className="rounded-[1.5rem] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,250,235,0.88),rgba(255,255,255,0.92))] p-5">
                                                                                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600">
                                                                                            {isShadowingMode ? "句级指标" : isDictationMode ? "听写建议" : "更自然表达"}
                                                                                        </div>
                                                                                        {isShadowingMode ? (
                                                                                            renderListeningMetricCards()
                                                                                        ) : drillFeedback.improved_version ? (
                                                                                            <div className="mt-4 space-y-2">
                                                                                                <p className="text-[1.6rem] leading-tight font-newsreader">
                                                                                                    {renderInteractiveCoachText(drillFeedback.improved_version)}
                                                                                                </p>
                                                                                                <p className="text-[11px] text-stone-400">点击单词可查看释义并加入生词本</p>
                                                                                            </div>
                                                                                        ) : primaryAdvice ? (
                                                                                            <p className="mt-4 text-base leading-7 text-stone-700">{primaryAdvice}</p>
                                                                                        ) : (
                                                                                            <p className="mt-4 text-sm leading-6 text-stone-500">这题主要是局部修正，原句整体已经接近标准表达。</p>
                                                                                        )}
                                                                                    </div>
                                                                                </div>

                                                                                {null}
                                                                            </div>
                                                                        </div>

                                                                        <AnimatePresence initial={false}>
                                                                            {analysisDetailsOpen && (
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, y: 16 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    exit={{ opacity: 0, y: -10 }}
                                                                                    transition={{ duration: 0.24, ease: "easeOut" }}
                                                                                    className="space-y-4"
                                                                                >
                                                                                    {renderDiff()}
                                                                                    {renderListeningMetricCards()}
                                                                                    {drillFeedback.feedback && (
                                                                                        <div className="rounded-[1.75rem] border border-stone-100 bg-white/90 p-5 shadow-[0_12px_30px_rgba(28,25,23,0.04)]">
                                                                                            <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                                                                                                <Sparkles className="w-3.5 h-3.5" />
                                                                                                完整说明
                                                                                            </h4>
                                                                                            <div className="mt-4 space-y-3">
                                                                                                {Array.isArray(drillFeedback.feedback) ? drillFeedback.feedback.map((point: string, i: number) => (
                                                                                                    <div key={i} className="flex gap-2 text-sm leading-7 text-stone-600"><div className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" /><p>{point}</p></div>
                                                                                                )) : (
                                                                                                    <div className="grid gap-3">
                                                                                                        {drillFeedback.feedback.dictation_tips && <div className="rounded-2xl bg-purple-50 p-3 text-sm leading-6 text-purple-800"><strong className="mb-1 block text-xs uppercase tracking-[0.16em] text-purple-600">Dictation Tips</strong>{drillFeedback.feedback.dictation_tips}</div>}
                                                                                                        {drillFeedback.feedback.listening_tips && <div className="rounded-2xl bg-amber-50 p-3 text-sm leading-6 text-amber-800"><strong className="mb-1 block text-xs uppercase tracking-[0.16em] text-amber-600">Listening Tips</strong>{drillFeedback.feedback.listening_tips}</div>}
                                                                                                        {drillFeedback.feedback.encouragement && <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm italic text-stone-500">&ldquo;{drillFeedback.feedback.encouragement}&rdquo;</div>}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    )}

                                                                                    {teachingMode && drillFeedback.error_analysis && drillFeedback.error_analysis.length > 0 && (
                                                                                        <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50/40 p-5">
                                                                                            <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600">
                                                                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                                                                错误精讲
                                                                                            </h4>
                                                                                            <div className="mt-4 space-y-3">
                                                                                                {drillFeedback.error_analysis.map((err: any, i: number) => (
                                                                                                    <div key={i} className="rounded-2xl border border-rose-100/80 bg-white/80 p-4">
                                                                                                        <div className="flex items-start gap-2">
                                                                                                            <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">错误</span>
                                                                                                            <span className="text-sm text-stone-600 line-through">{err.error}</span>
                                                                                                        </div>
                                                                                                        <div className="mt-2 flex items-start gap-2">
                                                                                                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">正确</span>
                                                                                                            <span className="text-sm font-medium text-stone-800">{err.correction}</span>
                                                                                                        </div>
                                                                                                        <div className="mt-3 border-l-2 border-amber-300 pl-3 text-xs leading-6 text-stone-500">
                                                                                                            <strong>规则：</strong>{err.rule}
                                                                                                        </div>
                                                                                                        {err.tip && <div className="mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-600">💡 {err.tip}</div>}
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    )}

                                                                                    {teachingMode && drillFeedback.similar_patterns && drillFeedback.similar_patterns.length > 0 && (
                                                                                        <div className="rounded-[1.75rem] border border-purple-100 bg-purple-50/30 p-5">
                                                                                            <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-600">
                                                                                                <BrainCircuit className="w-3.5 h-3.5" />
                                                                                                举一反三
                                                                                            </h4>
                                                                                            <div className="mt-4 space-y-3">
                                                                                                {drillFeedback.similar_patterns.map((pattern: any, i: number) => (
                                                                                                    <div key={i} className="rounded-2xl border border-purple-100/80 bg-white/80 p-4">
                                                                                                        <div className="text-sm text-stone-600">{pattern.chinese}</div>
                                                                                                        <div className="mt-1 text-lg font-newsreader italic text-stone-900">→ {pattern.english}</div>
                                                                                                        {pattern.point && <div className="mt-2 text-xs leading-5 text-purple-500">🎯 {pattern.point}</div>}
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                    )
                                                                ) : (
                                                                    <div className="py-6 text-center text-sm text-stone-500">暂无可展示的解析内容。</div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="bg-white/90 p-6 rounded-[2rem] shadow-xl shadow-stone-200/50 border border-stone-100 backdrop-blur-sm">
                                                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                                                    <div>
                                                                        <div className="flex items-center gap-2 text-stone-400 text-xs font-bold uppercase tracking-wider">
                                                                            <Sparkles className="w-4 h-4 text-amber-500" />
                                                                            Analysis On Demand
                                                                        </div>
                                                                        <p className="mt-2 text-sm font-medium text-stone-700">默认只出分。下面这部分解析改成按需生成。</p>
                                                                        <p className="mt-1 text-xs text-stone-400">这样评分会更快，也不会每题都额外消耗 token。</p>
                                                                    </div>
                                                                    <button
                                                                        onClick={handleGenerateAnalysis}
                                                                        disabled={isGeneratingAnalysis}
                                                                        className={cn("inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 min-h-11", activeCosmeticUi.analysisButtonClass)}
                                                                    >
                                                                        {isGeneratingAnalysis ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                                                        生成解析
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                            </>
                                                        );
                                                    })()
                                                ) : null}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                )}
                            </AnimatePresence>
                        ) : null}

                        <AnimatePresence>
                            {isRebuildMode
                                && !isRebuildPassage
                                && (rebuildFeedback || pendingRebuildSentenceFeedback)
                                && (rebuildSentenceShadowingFlow !== "idle" || Boolean(rebuildFeedback)) ? (
                                <motion.div
                                    key={`rebuild-feedback-modal-${(rebuildFeedback ?? pendingRebuildSentenceFeedback)?.resolvedAt ?? "pending"}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-[60] overflow-y-auto custom-scrollbar bg-[rgba(248,250,252,0.78)] p-4 md:p-6 pb-48 backdrop-blur-[10px]"
                                    >
                                        <motion.div
                                        initial={prefersReducedMotion ? false : { opacity: 0, y: 22, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                                        transition={{ duration: prefersReducedMotion ? 0.16 : 0.32, ease: "easeOut" }}
                                            className="mx-auto w-full max-w-4xl pt-8 md:pt-10"
                                        >
                                            {rebuildSentenceShadowingFlow === "prompt" ? (
                                                renderRebuildSentenceShadowingPrompt()
                                            ) : rebuildSentenceShadowingFlow === "shadowing" ? (
                                                <div className="mx-auto w-full max-w-3xl space-y-4">
                                                    {drillData ? renderRebuildShadowingPanel({
                                                        referenceEnglish: drillData.reference_english,
                                                        chinese: drillData.chinese,
                                                    }) : null}
                                                    <div className="flex justify-center">
                                                        <button
                                                            type="button"
                                                            onClick={revealRebuildSentenceFeedback}
                                                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:bg-stone-50"
                                                        >
                                                            查看重组评分
                                                            <ArrowRight className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                renderRebuildFeedback()
                                            )}
                                        </motion.div>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>

                        <AnimatePresence>
                            {isRebuildMode
                                && isRebuildPassage
                                && !rebuildPassageSummary
                                && activePassageResult
                                && activePassageSegmentForShadowing
                                && rebuildPassageShadowingSegmentIndex === activePassageSegmentIndex
                                && (rebuildPassageShadowingFlow === "prompt" || rebuildPassageShadowingFlow === "shadowing") ? (
                                <motion.div
                                    key={`rebuild-passage-shadowing-modal-${activePassageSegmentIndex}-${activePassageResult.feedback.resolvedAt}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-[60] overflow-y-auto custom-scrollbar bg-[radial-gradient(circle_at_top,rgba(255,245,251,0.88),rgba(240,249,255,0.82),rgba(248,250,252,0.88))] p-4 md:p-6 pb-48 backdrop-blur-[12px]"
                                >
                                    <motion.div
                                        initial={prefersReducedMotion ? false : { opacity: 0, y: 34, scale: 0.96 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.97 }}
                                        transition={prefersReducedMotion ? { duration: 0.14 } : { type: "spring", stiffness: 260, damping: 24, mass: 0.85 }}
                                        className="mx-auto w-full max-w-4xl pt-8 md:pt-10"
                                    >
                                        {rebuildPassageShadowingFlow === "prompt" ? (
                                            renderRebuildPassageShadowingPrompt()
                                        ) : (
                                            <div className="mx-auto w-full max-w-3xl space-y-4">
                                                {renderRebuildShadowingPanel({
                                                    referenceEnglish: activePassageSegmentForShadowing.referenceEnglish,
                                                    chinese: activePassageSegmentForShadowing.chinese,
                                                })}
                                                <div className="flex justify-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => setRebuildPassageShadowingFlow("idle")}
                                                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:bg-stone-50"
                                                    >
                                                        返回短文继续
                                                        <ArrowRight className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>
                    </div>

                    <GuidedLearningOverlay
                        open={isGuidedOverlayOpen}
                        status={guidedModeStatus}
                        script={guidedScript}
                        innerMode={guidedInnerMode}
                        currentStepIndex={guidedCurrentStepIndex}
                        currentAttemptCount={guidedCurrentAttemptCount}
                        guidedChoicesVisible={guidedChoicesVisible}
                        guidedRevealReady={guidedRevealReady}
                        filledFragments={guidedFilledFragments}
                        clozeState={guidedClozeState}
                        currentInput={guidedInput}
                        currentAiHint={guidedAiHint}
                        isAiHintLoading={isGuidedAiHintLoading}
                        onInputChange={handleGuidedInputChange}
                        onSubmit={() => handleSubmitGuidedInput()}
                        onShowChoices={handleShowGuidedChoices}
                        onSelectChoice={handleSelectGuidedChoice}
                        onRevealAnswer={handleRevealGuidedAnswer}
                        onRequestAiHint={handleRequestGuidedAiHint}
                        onActivateRandomFill={guidedInnerMode === "gestalt_cloze" ? handleRefreshGuidedCloze : handleActivateGuidedRandomFill}
                        onReturnToTeacherGuided={handleReturnToTeacherGuided}
                        onReturnToBattle={handleReturnToBattleFromGuided}
                        onCloseLearning={handleCloseGuidedLearning}
                    />

                    {/* Floating Teaching Panel */}
                    <AnimatePresence>
                        {teachingPanelOpen && teachingMode && mode === 'translation' && !learningSessionActive && (
                            <>
                                {/* Backdrop */}
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setTeachingPanelOpen(false)}
                                    className="absolute inset-0 bg-black/20 backdrop-blur-[2px] z-[100] rounded-[2.5rem]"
                                />
                                {/* Panel */}
                                <motion.div
                                    initial={{ x: '100%', opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: '100%', opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    className="absolute top-0 right-0 bottom-0 w-full max-w-md z-[101] flex flex-col bg-white/95 backdrop-blur-xl border-l border-stone-200/50 shadow-[-8px_0_40px_rgba(0,0,0,0.08)] rounded-r-[2.5rem] overflow-hidden"
                                >
                                    {/* Panel Header */}
                                    <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100/50 shrink-0">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                                                <BookOpen className="w-3.5 h-3.5 text-white" />
                                            </div>
                                            <span className="font-bold text-sm text-stone-700">📖 教学面板</span>
                                        </div>
                                        <button
                                            onClick={() => setTeachingPanelOpen(false)}
                                            className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition-all"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    {/* Panel Content */}
                                    <div className="flex-1 overflow-y-auto p-4">
                                        <TeachingCard
                                            data={teachingData}
                                            isLoading={isLoadingTeaching}
                                            onReady={() => setTeachingPanelOpen(false)}
                                        />
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>




                    {/* Floating Action Bar - Redesigned */}
                    <AnimatePresence>
                        {isRebuildMode && rebuildFeedback && !isRebuildPassage && rebuildSentenceShadowingFlow === "feedback" && !rebuildPassageSummary && !bossState.active && !gambleState.active && (
                            <motion.div
                                initial={{ y: 40, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 40, opacity: 0 }}
                                className="absolute bottom-6 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 pointer-events-none md:bottom-8"
                            >
                                <div className="pointer-events-auto rounded-[1.4rem] border border-stone-200/80 bg-white/95 p-2 shadow-[0_12px_40px_rgba(20,20,20,0.06)] backdrop-blur-xl">
                                    <div className="grid grid-cols-3 gap-2">
                                        {([
                                            {
                                                value: "easy",
                                                label: "简单",
                                                className: "border-emerald-200 bg-emerald-50 text-emerald-800 shadow-[0_3px_0_theme(colors.emerald.200)] hover:bg-emerald-100 hover:shadow-[0_4px_0_theme(colors.emerald.300)] active:translate-y-[3px] active:shadow-[0_0px_0_theme(colors.emerald.300)]",
                                            },
                                            {
                                                value: "just_right",
                                                label: "刚好",
                                                className: "border-sky-200 bg-sky-50 text-sky-800 shadow-[0_3px_0_theme(colors.sky.200)] hover:bg-sky-100 hover:shadow-[0_4px_0_theme(colors.sky.300)] active:translate-y-[3px] active:shadow-[0_0px_0_theme(colors.sky.300)]",
                                            },
                                            {
                                                value: "hard",
                                                label: "难",
                                                className: "border-amber-200 bg-amber-50 text-amber-800 shadow-[0_3px_0_theme(colors.amber.200)] hover:bg-amber-100 hover:shadow-[0_4px_0_theme(colors.amber.300)] active:translate-y-[3px] active:shadow-[0_0px_0_theme(colors.amber.300)]",
                                            },
                                        ] as const).map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => handleRebuildSelfEvaluate(option.value)}
                                                disabled={Boolean(rebuildFeedback.selfEvaluation)}
                                                className={cn(
                                                    "inline-flex h-12 items-center justify-center rounded-[1rem] border px-4 text-[15px] font-bold tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0",
                                                    option.className
                                                )}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        {isRebuildMode && Boolean(rebuildPassageSummary) && !bossState.active && !gambleState.active && (
                            <motion.div
                                initial={{ y: 40, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 40, opacity: 0 }}
                                className="absolute bottom-6 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 pointer-events-none md:bottom-8"
                            >
                                <div className="pointer-events-auto filter drop-shadow-2xl">
                                    <button
                                        onClick={() => void handleGenerateDrill(undefined, undefined, true)}
                                        className="group relative flex w-full items-center justify-center gap-3 rounded-full px-8 py-3.5 text-sm font-bold tracking-wide text-white transition-all hover:scale-105 active:scale-95 md:text-base"
                                        style={{
                                            backgroundImage: activeCosmeticUi.nextButtonGradient,
                                            boxShadow: activeCosmeticUi.nextButtonShadow,
                                        }}
                                    >
                                        <span className="relative z-10 font-bold">{isRebuildPassage ? "Next Passage" : "Next Question"}</span>
                                        <ArrowRight className="relative z-10 h-5 w-5 transition-transform group-hover:translate-x-1" />
                                        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent group-hover:animate-[shimmer_1.5s_infinite] z-0" />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                        {(isRebuildMode ? false : Boolean(drillFeedback)) && !bossState.active && !gambleState.active && (
                            <motion.div
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 50, opacity: 0 }}
                                className="absolute bottom-8 right-6 md:right-10 z-50 pointer-events-none"
                            >
                                <div className="pointer-events-auto filter drop-shadow-2xl">
                                    <button
                                        onClick={() => handleGenerateDrill()}
                                        disabled={isRebuildMode && !rebuildFeedback?.selfEvaluation}
                                        className="group relative flex items-center gap-3 px-8 py-3.5 text-white rounded-full font-bold hover:scale-105 active:scale-95 transition-all text-sm md:text-base tracking-wide overflow-hidden disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:scale-100"
                                        style={{
                                            backgroundImage: streakTier > 0 ? streakVisual.nextGradient : activeCosmeticUi.nextButtonGradient,
                                            boxShadow: streakTier > 0 ? streakVisual.nextShadow : activeCosmeticUi.nextButtonShadow,
                                        }}
                                    >
                                        <span className="relative z-10 font-bold">Next Question</span>
                                        <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />

                                        {/* Shimmer Overlay */}
                                        <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/35 to-transparent z-0" />

                                        {/* Glow Effect */}
                                        <div
                                            className="absolute inset-0 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
                                            style={{ background: `radial-gradient(circle at center, ${streakTier > 0 ? streakVisual.badgeGlow : activeCosmeticUi.nextButtonGlow}, transparent 70%)` }}
                                        />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {wordPopup && (
                        <WordPopup
                            key="word-popup"
                            popup={wordPopup}
                            onClose={() => setWordPopup(null)}
                            mode="battle"
                            battleConsumeLookupTicket={isDictationMode ? () => handleDictationWordLookupTicketConsume("lookup") : undefined}
                            battleConsumeDeepAnalyzeTicket={isDictationMode ? () => handleDictationWordLookupTicketConsume("deepAnalyze") : undefined}
                            battleLookupCostHint={isDictationMode ? "查词 -1 关键词券，Deep Analyze -1 关键词券。" : "Battle 查词不消耗阅读币。"}
                            battleInsufficientHint="关键词券不足，请先去商场购买。"
                        />
                    )}
                    {isRebuildMode && drillData && !isGeneratingDrill && !bossState.active && !gambleState.active && !rebuildTutorSession?.isOpen ? (
                        <RebuildTutorLauncher onOpen={(anchorPoint) => openRebuildTutorPopup(anchorPoint)} />
                    ) : null}
                    {renderRebuildTutorPopup()}
                </motion.div>

                {/* Negotiator Overlay (Crimson Roulette) - Localized */}
                <AnimatePresence>
                    {gambleState.active && gambleState.introAck && !gambleState.wager && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-8"
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                className="max-w-md w-full bg-[#1a0505] border border-red-900/50 rounded-3xl p-8 flex flex-col gap-6 shadow-[0_0_50px_rgba(220,38,38,0.2)]"
                            >
                                <div className="flex flex-col items-center text-center gap-2">
                                    <div className="w-16 h-16 rounded-full bg-red-950/50 flex items-center justify-center border border-red-900 mb-2">
                                        <Dices className="w-8 h-8 text-red-500" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-red-100">The Devil's Deal</h2>
                                    <p className="text-red-400 text-sm">A "High Value" client is challenging you. <br />Wager your skill for multiplied returns.</p>
                                </div>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => { setGambleState(prev => ({ ...prev, wager: 'safe' })); setTheme('default'); }}
                                        className="w-full p-4 rounded-xl border border-stone-800 bg-stone-900/50 hover:bg-stone-800 transition-colors flex items-center justify-between group"
                                    >
                                        <div className="text-left">
                                            <div className="text-stone-300 font-bold group-hover:text-white">放弃 (认怂)</div>
                                            <div className="text-xs text-stone-500">正常游戏. 无风险.</div>
                                        </div>
                                        <div className="text-stone-400 text-sm">1x</div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            setGambleState(prev => ({ ...prev, wager: 'risky' }));
                                            setTheme('crimson');
                                            setShake(true); // Small Shake
                                        }}
                                        className="w-full p-4 rounded-xl border border-amber-900/30 bg-amber-950/20 hover:bg-amber-900/30 transition-colors flex items-center justify-between group"
                                    >
                                        <div className="text-left">
                                            <div className="text-amber-500 font-bold group-hover:text-amber-400">加注 (玩玩)</div>
                                            <div className="text-xs text-amber-700 group-hover:text-amber-600">下注 20 Elo. 赢 60.</div>
                                        </div>
                                        <div className="text-amber-500 font-bold text-sm">3x</div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            setGambleState(prev => ({ ...prev, wager: 'madness' }));
                                            setTheme('crimson');
                                            setShake(true); // BIG SHAKE
                                            if (navigator.vibrate) navigator.vibrate(200); // Mobile Haptic
                                        }}
                                        className="w-full p-4 rounded-xl border border-red-900/50 bg-red-950/30 hover:bg-red-900/40 transition-colors flex items-center justify-between group relative overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
                                        <div className="text-left relative z-10">
                                            <div className="text-red-500 font-bold group-hover:text-red-400 flex items-center gap-2"><AlertTriangle className="w-3 h-3" /> 梭哈 (疯魔)</div>
                                            <div className="text-xs text-red-700 group-hover:text-red-600">下注 50 Elo. 赢 150.</div>
                                        </div>
                                        <div className="text-red-500 font-black text-xl relative z-10">5x</div>
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* DOUBLE DOWN MODAL (The Greed Trap) */}
                <AnimatePresence>
                    {showDoubleDown && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[80] bg-black/95 flex items-center justify-center p-8 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-10" />
                            <div className="absolute inset-0 bg-red-900/10 animate-pulse" />

                            <motion.div
                                initial={{ scale: 0.8, rotate: -5 }}
                                animate={{ scale: 1, rotate: 0 }}
                                className="relative bg-[#2a0a0a] border-4 border-red-600 p-8 rounded-3xl shadow-[0_0_100px_rgba(220,38,38,0.5)] max-w-sm w-full text-center flex flex-col gap-6"
                            >
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                                    <div className="w-24 h-24 bg-black border-4 border-red-600 rounded-full flex items-center justify-center shadow-2xl">
                                        <span className="text-4xl">😈</span>
                                    </div>
                                </div>

                                <div className="mt-8 space-y-2">
                                    <h2 className="text-3xl font-black text-red-500 uppercase tracking-tighter">Greed Check</h2>
                                    <p className="text-red-200 text-sm">You won... but is it enough?</p>
                                </div>

                                <div className="py-4 bg-black/30 rounded-xl border border-red-900/30">
                                    <div className="text-xs text-stone-500 uppercase tracking-widest mb-1">Current Winnings</div>
                                    <div className="text-4xl font-mono font-bold text-white tabular-nums">
                                        {gambleState.wager === 'risky' ? 60 * Math.pow(2.5, gambleState.doubleDownCount) : 150 * Math.pow(2.5, gambleState.doubleDownCount)}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => {
                                            setShowDoubleDown(false);
                                            setGambleState(prev => ({ ...prev, active: false, introAck: false, wager: null, doubleDownCount: 0 }));
                                            setTheme('default');
                                        }}
                                        className="py-4 rounded-xl bg-stone-800 text-stone-400 font-bold hover:bg-stone-700 hover:text-white transition-colors border border-white/5"
                                    >
                                        Take it (Weak)
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowDoubleDown(false);
                                            // Reset the drill but KEEP the gamble state and increment count
                                            setGambleState(prev => ({ ...prev, doubleDownCount: prev.doubleDownCount + 1 }));
                                            handleGenerateDrill(); // Generate NEXT question immediately
                                            // Theme stays crimson
                                            new Audio('https://assets.mixkit.co/sfx/preview/mixkit-sword-slash-swoosh-1476.mp3').play().catch(() => { });
                                        }}
                                        className="py-4 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition-all border border-red-400 shadow-[0_0_20px_rgba(220,38,38,0.4)] animate-pulse"
                                    >
                                        DOUBLE DOWN 💀
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Gamble Intro Overlay */}
                <AnimatePresence>
                    {gambleState.active && !gambleState.introAck && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[70] bg-[#1a0505] flex items-center justify-center p-8"
                            onClick={() => setGambleState(prev => ({ ...prev, introAck: true }))}
                        >
                            <div className="flex flex-col items-center gap-8 text-center pointer-events-none">
                                <motion.div
                                    initial={{ scale: 2, filter: "blur(10px)" }}
                                    animate={{ scale: 1, filter: "blur(0px)" }}
                                    transition={{ duration: 0.8, ease: "circOut" }}
                                    className="relative"
                                >
                                    <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
                                    <AlertTriangle className="w-32 h-32 text-red-600 relative z-10" />
                                </motion.div>

                                <motion.div
                                    initial={{ y: 50, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="space-y-4"
                                >
                                    <h2 className="text-5xl font-black text-red-600 tracking-tighter uppercase">猩红轮盘</h2>
                                    <div className="h-1 w-32 bg-red-600 mx-auto" />
                                    <p className="text-red-200 font-mono text-sm tracking-widest">高风险 • 高回报</p>
                                </motion.div>

                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.5, repeat: Infinity, repeatType: "reverse" }}
                                    className="text-white/30 text-xs mt-12"
                                >
                                    点击进入交易 (CLICK TO ENTER)
                                </motion.p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Boss Intro Overlay */}
                <AnimatePresence>
                    {bossState.active && !bossState.introAck && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[70] bg-black flex items-center justify-center p-8"
                            onClick={() => setBossState(prev => ({ ...prev, introAck: true }))}
                        >
                            <div className="flex flex-col items-center gap-8 text-center pointer-events-none">
                                <motion.div
                                    initial={{ scale: 2, filter: "blur(10px)" }}
                                    animate={{ scale: 1, filter: "blur(0px)" }}
                                    transition={{ duration: 0.8, ease: "circOut" }}
                                    className="relative"
                                >
                                    <div className={cn("absolute inset-0 blur-3xl rounded-full", currentBoss.bg, "opacity-20")} />
                                    <currentBoss.icon className={cn("w-32 h-32 relative z-10", currentBoss.color)} />
                                </motion.div>

                                <motion.div
                                    initial={{ y: 50, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="space-y-4"
                                >
                                    <h2 className={cn("text-5xl font-black tracking-tighter uppercase", currentBoss.color)}>{currentBoss.name}</h2>
                                    <div className={cn("h-1 w-32 mx-auto", currentBoss.bg)} />
                                    <p className={cn("font-mono text-sm tracking-widest opacity-80", currentBoss.color)}>{currentBoss.desc}</p>
                                </motion.div>

                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.5, repeat: Infinity, repeatType: "reverse" }}
                                    className="text-white/30 text-xs mt-12"
                                >
                                    CLICK TO START CHALLENGE
                                </motion.p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {!isShopEconomyFx && economyFxOverlay}
                </AnimatePresence>

                {isShopEconomyFx && typeof window !== "undefined" && economyFxOverlay
                    ? createPortal(
                        <AnimatePresence>{economyFxOverlay}</AnimatePresence>,
                        document.body
                    )
                    : null}

                <AnimatePresence>
                    {renderTranslationTutorModal()}
                </AnimatePresence>

                {/* Context-Aware Loot Overlay */}
                <AnimatePresence>
                    {lootDrop && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8, y: 50 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: -50 }}
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] flex flex-col items-center gap-4 pointer-events-auto cursor-pointer"
                            onClick={() => setLootDrop(null)}
                        >
                            <div className={cn(
                                "flex flex-col items-center gap-4 p-8 rounded-[2.5rem] border shadow-2xl backdrop-blur-3xl min-w-[280px]",
                                lootDrop.amount < 0 ? "bg-red-950/80 border-red-500/50 shadow-red-500/30" :
                                    lootDrop.rarity === 'legendary' ? "bg-amber-900/80 border-amber-400/50 shadow-amber-500/30" :
                                        lootDrop.rarity === 'rare' ? "bg-indigo-900/80 border-indigo-400/50 shadow-indigo-500/30" :
                                            "bg-stone-900/80 border-stone-500/30 shadow-2xl"
                            )}>
                                <div className={cn(
                                    "p-5 rounded-2xl mb-2",
                                    lootDrop.amount < 0 ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                                )}>
                                    {lootDrop.amount < 0 || lootDrop.message.includes('💀') ? (
                                        <Skull className="w-12 h-12 animate-pulse" />
                                    ) : lootDrop.message.includes('🎰') ? (
                                        <Zap className="w-12 h-12 animate-bounce" />
                                    ) : lootDrop.type === 'gem' ? (
                                        <Gem className="w-12 h-12" />
                                    ) : (
                                        <Gift className="w-12 h-12" />
                                    )}
                                </div>

                                <div className="text-center">
                                    <div className={cn("text-xs font-black uppercase tracking-[0.2em] mb-1 opacity-60",
                                        lootDrop.amount < 0 ? "text-red-400" : "text-amber-500"
                                    )}>
                                        {lootDrop.amount < 0 ? "System Penalty" :
                                            lootDrop.message.includes('🎰') ? "Stakes Locked" : "Reward Dropped"}
                                    </div>
                                    <div className={cn("text-xl font-bold mb-4",
                                        lootDrop.amount < 0 ? "text-red-100" : "text-amber-50"
                                    )}>
                                        {lootDrop.message}
                                    </div>
                                    <div className={cn("text-5xl font-black font-mono tracking-tighter",
                                        lootDrop.amount < 0 ? "text-red-500" : "text-white"
                                    )}>
                                        {lootDrop.amount > 0 ? `+${lootDrop.amount}` : lootDrop.amount}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* RANK UP Celebration Overlay */}
                <AnimatePresence>
                    {rankUp && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl"
                            onClick={() => setRankUp(null)}
                        >
                            {/* Epic Background Rays */}
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 z-0 opacity-30"
                            >
                                <div className={cn("w-[200vw] h-[200vw] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r transparent via-white/10 transparent", rankUp.newRank.gradient)} style={{ clipPath: "polygon(50% 50%, 0 0, 100% 0)" }} />
                            </motion.div>

                            <motion.div
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.5, opacity: 0 }}
                                transition={{ type: "spring", damping: 15, stiffness: 200 }}
                                className="relative z-10 flex flex-col items-center gap-8 p-12 max-w-lg w-full"
                            >
                                {/* Shockwave Effect */}
                                <motion.div
                                    initial={{ scale: 0, opacity: 0.8 }}
                                    animate={{ scale: 2, opacity: 0 }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    className={cn("absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border-4", rankUp.newRank.border)}
                                />

                                {/* THE ICON */}
                                <div className="relative">
                                    <motion.div
                                        initial={{ scale: 0, rotate: -180 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: "spring", damping: 12, stiffness: 100, delay: 0.2 }}
                                        className={cn("w-40 h-40 rounded-3xl flex items-center justify-center shadow-[0_0_100px_rgba(255,255,255,0.3)] bg-gradient-to-br border-4 border-white/50", rankUp.newRank.gradient)}
                                    >
                                        <rankUp.newRank.icon className="w-20 h-20 text-white drop-shadow-md" strokeWidth={1.5} />
                                    </motion.div>

                                    {/* Particles */}
                                    {[...Array(12)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                                            animate={{
                                                x: (Math.random() - 0.5) * 300,
                                                y: (Math.random() - 0.5) * 300,
                                                opacity: 0,
                                                scale: Math.random() * 1.5
                                            }}
                                            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                                            className={cn("absolute top-1/2 left-1/2 w-3 h-3 rounded-full", rankUp.newRank.bg.replace('bg-', 'bg-'))}
                                        />
                                    ))}
                                </div>

                                {/* Text Content */}
                                <div className="text-center space-y-2">
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.5 }}
                                        className="text-sm font-bold tracking-[0.3em] uppercase text-white/60"
                                    >
                                        Rank Promoted
                                    </motion.div>
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.6, type: "spring" }}
                                        className={cn("text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-white/70 filter drop-shadow-lg")}
                                    >
                                        {rankUp.newRank.title}
                                    </motion.div>
                                </div>

                                {/* Rank Comparison */}
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.8 }}
                                    className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/10"
                                >
                                    <span className="text-stone-400 line-through text-lg decoration-stone-500/50">{rankUp.oldRank.title}</span>
                                    <ChevronRight className="w-5 h-5 text-white/40" />
                                    <span className="text-white font-bold text-xl">{rankUp.newRank.title}</span>
                                </motion.div>

                                {/* CTA */}
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className={cn("px-12 py-4 rounded-xl font-bold text-lg shadow-xl transition-all hover:brightness-110 active:scale-95 text-white shadow-lg", rankUp.newRank.bg.replace('bg-', 'bg-').replace('100', '600'))}
                                >
                                    CLAIM GLORY
                                </motion.button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* RANK DOWN Demotion Overlay */}
                <AnimatePresence>
                    {rankDown && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-grayscale"
                            onClick={() => setRankDown(null)}
                        >
                            <motion.div
                                initial={{ scale: 1.1, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="flex flex-col items-center gap-8 p-12 max-w-lg w-full relative"
                            >
                                {/* Cracking Background Texture */}
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cracked-ground.png')] opacity-20 pointer-events-none" />

                                {/* THE SHATTERING ICON */}
                                <div className="relative">
                                    {/* The Old Rank Getting Destroyed */}
                                    <motion.div
                                        initial={{ scale: 1, filter: "brightness(1)", opacity: 1 }}
                                        animate={{ scale: [1, 1.1, 0.8], opacity: 0, filter: "brightness(2)" }}
                                        transition={{ duration: 0.4, delay: 0.2 }}
                                        className={cn("absolute inset-0 w-40 h-40 rounded-3xl flex items-center justify-center bg-gradient-to-br border-4 border-white/50", rankDown.oldRank.gradient)}
                                    >
                                        <rankDown.oldRank.icon className="w-20 h-20 text-white" />
                                    </motion.div>

                                    {/* The New (Lower) Rank Appearing */}
                                    <motion.div
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: "spring", damping: 12, delay: 0.6 }}
                                        className={cn("w-40 h-40 rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(255,0,0,0.2)] bg-stone-900 border-4 border-stone-700 grayscale")}
                                    >
                                        <rankDown.newRank.icon className="w-20 h-20 text-stone-500" strokeWidth={1.5} />
                                    </motion.div>
                                </div>

                                {/* Text Content */}
                                <div className="text-center space-y-2 z-10">
                                    <motion.div
                                        initial={{ opacity: 0, y: -20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 }}
                                        className="text-sm font-bold tracking-[0.5em] uppercase text-red-600 animate-pulse"
                                    >
                                        Demotion Alert
                                    </motion.div>
                                    <motion.div
                                        initial={{ opacity: 0, scale: 2 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                                        className="text-6xl font-black tracking-tighter text-stone-300"
                                    >
                                        RANK LOST
                                    </motion.div>
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.8 }}
                                        className="text-stone-500 font-mono text-sm"
                                    >
                                        {rankDown.oldRank.title} <span className="mx-2 text-stone-700">➜</span> {rankDown.newRank.title}
                                    </motion.p>
                                </div>

                                {/* CTA */}
                                <motion.button
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 1 }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="px-10 py-3 rounded-xl font-bold text-sm bg-stone-800 text-stone-400 border border-stone-700 hover:bg-stone-700 hover:text-stone-200 transition-colors"
                                >
                                    ACCEPT FATE
                                </motion.button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {eloSplash && (
                        <motion.div
                            key={eloSplash.uid}
                            initial={{ backdropFilter: "blur(0px)", backgroundColor: "rgba(0,0,0,0)" }}
                            animate={{ backdropFilter: "blur(8px)", backgroundColor: "rgba(0,0,0,0.4)" }}
                            exit={{ backdropFilter: "blur(0px)", backgroundColor: "rgba(0,0,0,0)", opacity: 0 }}
                            className="fixed inset-0 z-[99999] flex flex-col items-center justify-center pointer-events-none"
                        >
                            <motion.div
                                initial={{ scale: 0, opacity: 0, rotate: eloSplash.delta > 0 ? -15 : 15, y: 150 }}
                                animate={{ scale: [1.3, 1], opacity: 1, rotate: 0, y: 0 }}
                                exit={{ scale: 0.8, y: eloSplash.delta > 0 ? -100 : 100, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 350, damping: 20, duration: 0.6 }}
                                className="flex flex-col items-center justify-center gap-1"
                            >
                                <motion.span 
                                    className={cn(
                                        "text-[9rem] md:text-[12rem] font-black tracking-tighter drop-shadow-[0_20px_50px_rgba(0,0,0,0.6)] leading-none",
                                        eloSplash.delta > 0 ? "text-emerald-400" : (eloSplash.delta === 0 ? "text-amber-400" : "text-rose-500")
                                    )}
                                >
                                    {eloSplash.delta > 0 ? "+" : ""}{eloSplash.delta}
                                </motion.span>
                                <motion.span 
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3, type: "spring" }}
                                    className="text-3xl md:text-5xl font-black text-white/90 uppercase tracking-[0.2em] drop-shadow-md"
                                >
                                    {eloSplash.delta > 0 ? "Elo Gained" : (eloSplash.delta === 0 ? "No Elo Gained" : "Elo Lost")}
                                </motion.span>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </motion.div>

            {/* ROULETTE OVERLAY */}
            <AnimatePresence key="roulette-overlay">
                {showRoulette && (
                    <RouletteOverlay
                        onComplete={handleRouletteComplete}
                        onCancel={() => setShowRoulette(false)}
                    />
                )}
            </AnimatePresence>

            {/* GACHA OVERLAY */}
            <AnimatePresence key="gacha-overlay">
                {showGacha && (
                    <GachaOverlay
                        cards={gachaCards}
                        selectedCardId={selectedGachaCardId}
                        claimTarget={gachaClaimTarget}
                        onSelect={handleGachaSelect}
                        onComplete={handleGachaComplete}
                    />
                )}
            </AnimatePresence>

            {/* SHOP MODAL */}
            <AnimatePresence key="shop-modal">
                {showShopModal && canUseModeShop && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm p-4 flex items-center justify-center"
                        onClick={() => {
                            setShowShopModal(false);
                            setShopFocusedItem(null);
                        }}
                    >
                        <motion.div
                            initial={{ y: 18, opacity: 0, scale: 0.98 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 12, opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className={cn(
                                "w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.24)]",
                                activeCosmeticTheme.cardClass
                            )}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-white/55">
                                <div className="space-y-1">
                                    <p className={cn("text-sm font-black tracking-[0.2em]", activeCosmeticTheme.textClass)}>商场</p>
                                    <p className={cn("text-xs", activeCosmeticTheme.mutedClass)}>金币购买道具，立即生效</p>
                                </div>
                                <div className={cn(
                                    "flex items-center gap-2 rounded-full px-3 py-1.5 border",
                                    activeCosmeticUi.audioLockedClass
                                )}>
                                    <span className="text-sm">✨</span>
                                    <span className="font-mono text-sm font-black tabular-nums">{coins}</span>
                                </div>
                            </div>

                            <div className="p-4 space-y-3">
                                {(Object.keys(ITEM_CATALOG) as ShopItemId[]).map((itemId) => {
                                    const item = ITEM_CATALOG[itemId];
                                    const itemCount = getItemCount(itemId);
                                    const canBuy = coins >= item.price;
                                    return (
                                        <div
                                            key={item.id}
                                            className={cn(
                                                "rounded-2xl p-4 flex items-center justify-between gap-4 transition-all border",
                                                activeCosmeticUi.tutorPanelClass,
                                                shopFocusedItem === itemId
                                                    ? "ring-2 ring-white/70 shadow-[0_0_0_1px_rgba(255,255,255,0.75),0_18px_36px_rgba(15,23,42,0.12)]"
                                                    : "hover:-translate-y-0.5"
                                            )}
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">{item.icon}</span>
                                                    <p className={cn("text-sm font-bold", activeCosmeticTheme.textClass)}>{item.name}</p>
                                                    <span className={cn(
                                                        "rounded-full px-2 py-0.5 text-[10px] font-mono font-bold",
                                                        activeCosmeticUi.wordBadgeActiveClass
                                                    )}>
                                                        x {itemCount}
                                                    </span>
                                                </div>
                                                <p className={cn("mt-1 text-xs", activeCosmeticTheme.mutedClass)}>{item.description}</p>
                                                <p className={cn("mt-1 text-[11px] font-medium opacity-85", activeCosmeticTheme.mutedClass)}>用途：{item.consumeAction}</p>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    handleBuyItem(itemId);
                                                }}
                                                disabled={!canBuy}
                                                className={cn(
                                                    "shrink-0 rounded-full px-4 py-2 text-xs font-bold border transition-all",
                                                    canBuy
                                                        ? cn(activeCosmeticUi.checkButtonClass, "hover:-translate-y-0.5")
                                                        : "bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed"
                                                )}
                                                title={canBuy ? `花费 ${item.price} ✨ 购买 1 个 ${item.name}` : `星光币不足 ${item.price} ✨`}
                                            >
                                                {item.price} ✨ 购买
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="px-5 pb-4 flex justify-end">
                                <button
                                    onClick={() => {
                                        setShowShopModal(false);
                                        setShopFocusedItem(null);
                                    }}
                                    className={cn(
                                        "rounded-full border px-4 py-2 text-xs font-bold transition-all",
                                        activeCosmeticUi.iconButtonClass
                                    )}
                                >
                                    关闭
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
